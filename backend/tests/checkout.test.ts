import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import request from "supertest";
import { database } from "../src/db.js";
import { Checkout, DomainError, type GatewayEvent } from "../src/domain.js";
import { createApp, type AppConfig } from "../src/app.js";
import { gatewayApp } from "../src/gateway.js";
import { seed } from "../src/seed.js";
import { signedHeaders } from "../src/security.js";
import { postgres, migrate, runtimeConnection } from "../../tools/postgres.js";
import { backup, restoreToFreshDatabase } from "../../tools/backup.js";
import { Client } from "pg";
import { databaseDriver } from "../../tools/postgres.js";
import { dockerCommand, dockerPostgres } from "../../tools/docker-postgres.js";
import { schemaShape } from "../../tools/database-snapshot.js";
import { canonicalSchema } from "../../tools/schema-compare.js";

let cluster: Awaited<ReturnType<typeof postgres>>;
let db: ReturnType<typeof database>;
let checkout: Checkout;
let instance: ReturnType<typeof createApp>;
let backend: Server, gateway: Server;
const adminPassword = randomBytes(20).toString("hex");
const staffPassword = randomBytes(20).toString("hex");
const config: AppConfig = {
  databaseUrl: "",
  origin: "http://127.0.0.1",
  sessionSecret: randomBytes(32).toString("hex"),
  secret: randomBytes(32).toString("hex"),
  gatewayUrl: "",
  callbackUrl: "",
  secure: false,
  timeoutMs: 200,
};
before(async () => {
  cluster = await postgres(`integration-${Date.now()}`);
  migrate(cluster.url);
  const runtimeUrl = await runtimeConnection(cluster.url);
  db = database(runtimeUrl);
  checkout = new Checkout(db);
  await seed(db, adminPassword, staffPassword);
  config.databaseUrl = runtimeUrl;
  instance = createApp(db, config);
  backend = instance.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => backend.once("listening", r));
  const addr = backend.address();
  config.callbackUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/v1/payment-events`;
  gateway = gatewayApp(db, config).listen(0, "127.0.0.1");
  await new Promise<void>((r) => gateway.once("listening", r));
  const gw = gateway.address();
  config.gatewayUrl = `http://127.0.0.1:${typeof gw === "object" && gw ? gw.port : 0}`;
});
after(async () => {
  instance?.close();
  for (const server of [backend, gateway])
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  await db?.$disconnect();
  await cluster?.pg.stop();
});
async function fixture(stock = 5, price = 10000) {
  const id = randomUUID();
  const product = await db.product.create({
    data: {
      sku: `TEST-${id.toUpperCase()}`,
      barcode: id,
      name: "Hàng thử",
      price,
      stock: { create: { onHand: stock } },
    },
  });
  const cart = await db.cart.create({ data: { ownerId: randomUUID() } });
  await checkout.mutate(cart.id, cart.ownerId, 1, {
    kind: "add",
    productId: product.id,
    quantity: 1,
    key: randomUUID(),
  });
  return {
    product,
    cart,
    input: {
      version: 2,
      acceptedAmount: price,
      scenario: "pending" as const,
      key: randomUUID(),
    },
  };
}
const event = (
  paymentId: string,
  amount = 10000,
  status: GatewayEvent["status"] = "success",
): GatewayEvent => ({
  eventId: randomUUID(),
  paymentId,
  amount,
  currency: "VND",
  status,
});
test("Infrastructure uses the selected real PostgreSQL provider, a restricted runtime role and persistent loopback Docker storage", async () => {
  assert.equal(cluster.driver, databaseDriver());
  const roles = await db.$queryRaw<
    { rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }[]
  >`SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`;
  assert.deepEqual(roles[0], {
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
  });
  if (cluster.driver === "docker") {
    const inspected = JSON.parse(
      dockerCommand(["inspect", cluster.metadata.containerId]),
    )[0];
    assert.ok(
      inspected.Mounts.some(
        (x: { Type: string; Destination: string; Name?: string }) =>
          x.Type === "volume" &&
          x.Destination === "/var/lib/postgresql" &&
          x.Name?.startsWith(cluster.metadata.project),
      ),
    );
    assert.equal(
      inspected.HostConfig.PortBindings["5432/tcp"][0].HostIp,
      "127.0.0.1",
    );
    assert.equal(inspected.Config.Image, "postgres:18.6-bookworm");
    assert.ok(
      !inspected.Config.Env.some((x: string) =>
        x.startsWith("POSTGRES_PASSWORD="),
      ),
    );
  }
});

test("Schema verification reparses equivalent CHECK/index expressions and still rejects changed constraints or uniqueness", async () => {
  const client = new Client({ connectionString: cluster.url });
  await client.connect();
  try {
    const original = await schemaShape(client),
      equivalent = structuredClone(original);
    const price = equivalent.constraints.find(
      (x) => x.conname === "product_price_range",
    )!;
    price.definition = "CHECK (price BETWEEN 0 AND 2000000000)";
    const baseline = await canonicalSchema(original, client);
    assert.equal(await canonicalSchema(equivalent, client), baseline);
    price.definition = "CHECK (price BETWEEN 0 AND 1999999999)";
    assert.notEqual(await canonicalSchema(equivalent, client), baseline);
    const changedIndex = structuredClone(original),
      index = changedIndex.indexes.find(
        (x) => x.indexname === "one_unresolved_payment_per_cart",
      )!;
    index.predicate = "status IN ('initiating','pending','unknown')";
    assert.notEqual(await canonicalSchema(changedIndex, client), baseline);
    const changedUnique = structuredClone(original);
    changedUnique.indexes.find(
      (x) => x.indexname === "one_unresolved_payment_per_cart",
    )!.indexdef = index.indexdef.replace("CREATE UNIQUE INDEX", "CREATE INDEX");
    assert.notEqual(await canonicalSchema(changedUnique, client), baseline);
  } finally {
    await client.end();
  }
});

test("M04 two customers reserve the last unit concurrently; exactly one wins", async () => {
  const f = await fixture(1);
  const second = await db.cart.create({ data: { ownerId: randomUUID() } });
  await checkout.mutate(second.id, second.ownerId, 1, {
    kind: "add",
    productId: f.product.id,
    quantity: 1,
    key: randomUUID(),
  });
  const results = await Promise.allSettled([
    checkout.prepare(f.cart.id, f.cart.ownerId, f.input),
    checkout.prepare(second.id, second.ownerId, {
      ...f.input,
      key: randomUUID(),
    }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const s = await db.stock.findUniqueOrThrow({
    where: { productId: f.product.id },
  });
  assert.equal(s.onHand, 1);
  assert.equal(s.reserved, 1);
});
test("M04 multi-line insufficient stock rolls back all earlier holds", async () => {
  const f = await fixture(5);
  const empty = await db.product.create({
    data: {
      sku: randomUUID().toUpperCase(),
      barcode: randomUUID(),
      name: "Hết hàng",
      price: 10000,
      stock: { create: { onHand: 1 } },
    },
  });
  await checkout.mutate(f.cart.id, f.cart.ownerId, 2, {
    kind: "add",
    productId: empty.id,
    quantity: 1,
    key: randomUUID(),
  });
  // Stock can change after add; the payment transaction must recheck all lines.
  await db.stock.update({
    where: { productId: empty.id },
    data: { onHand: 0 },
  });
  await assert.rejects(
    checkout.prepare(f.cart.id, f.cart.ownerId, {
      ...f.input,
      version: 3,
      acceptedAmount: 20000,
    }),
    { code: "INSUFFICIENT_STOCK" },
  );
  assert.equal(
    (await db.stock.findUniqueOrThrow({ where: { productId: f.product.id } }))
      .reserved,
    0,
  );
  assert.equal(await db.payment.count({ where: { cartId: f.cart.id } }), 0);
});
test("M06 duplicate concurrent success creates one order and one stock movement", async () => {
  const f = await fixture();
  const p = await checkout.prepare(f.cart.id, f.cart.ownerId, f.input);
  const e = event(p.id);
  await Promise.all([checkout.apply(e), checkout.apply(e)]);
  assert.equal(await db.order.count({ where: { paymentId: p.id } }), 1);
  assert.equal(
    await db.stockMovement.count({
      where: { item: { order: { paymentId: p.id } } },
    }),
    1,
  );
  const s = await db.stock.findUniqueOrThrow({
    where: { productId: f.product.id },
  });
  assert.equal(s.onHand, 4);
  assert.equal(s.reserved, 0);
  await checkout.apply(event(p.id, 10000, "pending"));
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    "success",
  );
});
test("M05 failure releases reservation once, never sells; a new attempt is allowed", async () => {
  const f = await fixture();
  const p = await checkout.prepare(f.cart.id, f.cart.ownerId, f.input);
  const e = event(p.id, 10000, "failure");
  await checkout.apply(e);
  await checkout.apply(e);
  const s = await db.stock.findUniqueOrThrow({
    where: { productId: f.product.id },
  });
  assert.equal(s.onHand, 5);
  assert.equal(s.reserved, 0);
  assert.equal(await db.order.count({ where: { paymentId: p.id } }), 0);
  const retry = await checkout.prepare(f.cart.id, f.cart.ownerId, {
    ...f.input,
    key: randomUUID(),
  });
  assert.notEqual(retry.id, p.id);
});
test("M03 price change requires fresh confirmation; order retains frozen snapshot", async () => {
  const f = await fixture();
  await db.product.update({
    where: { id: f.product.id },
    data: { price: 12000 },
  });
  await assert.rejects(checkout.prepare(f.cart.id, f.cart.ownerId, f.input), {
    code: "PRICE_CHANGED",
  });
  assert.equal(await db.payment.count({ where: { cartId: f.cart.id } }), 0);
  const c = await checkout.cart(f.cart.id, f.cart.ownerId);
  assert.equal(c.amount, 12000);
  const p = await checkout.prepare(f.cart.id, f.cart.ownerId, {
    ...f.input,
    version: c.version,
    acceptedAmount: 12000,
    key: randomUUID(),
  });
  await db.product.update({
    where: { id: f.product.id },
    data: { price: 99000, name: "Tên mới" },
  });
  await checkout.apply(event(p.id, 12000));
  const o = await db.order.findUniqueOrThrow({
    where: { paymentId: p.id },
    include: { items: true },
  });
  assert.equal(o.amount, 12000);
  assert.equal(o.items[0].name, "Hàng thử");
  assert.equal(o.items[0].unitPrice, 12000);
});
test("M02 response-loss add replay does not increment twice; stale version rejected", async () => {
  const f = await fixture();
  const op = {
    kind: "add" as const,
    productId: f.product.id,
    quantity: 1,
    key: randomUUID(),
  };
  await checkout.mutate(f.cart.id, f.cart.ownerId, 2, op);
  await checkout.mutate(f.cart.id, f.cart.ownerId, 2, op);
  assert.equal(
    (await checkout.cart(f.cart.id, f.cart.ownerId)).items[0].quantity,
    2,
  );
  await assert.rejects(
    checkout.mutate(f.cart.id, f.cart.ownerId, 2, { kind: "cancel" }),
    { code: "CART_VERSION_CONFLICT" },
  );
});
test("M05 payment key replay same payload same attempt, different payload conflicts", async () => {
  const f = await fixture();
  const p = await checkout.prepare(f.cart.id, f.cart.ownerId, f.input);
  const again = await checkout.prepare(f.cart.id, f.cart.ownerId, f.input);
  assert.equal(p.id, again.id);
  await assert.rejects(
    checkout.prepare(f.cart.id, f.cart.ownerId, {
      ...f.input,
      acceptedAmount: 1,
    }),
    { code: "KEY_REUSED" },
  );
  await assert.rejects(
    checkout.prepare(f.cart.id, f.cart.ownerId, {
      ...f.input,
      key: randomUUID(),
    }),
    { code: "CART_LOCKED" },
  );
  await assert.rejects(
    checkout.mutate(f.cart.id, f.cart.ownerId, 2, { kind: "cancel" }),
    { code: "CART_LOCKED" },
  );
});
test("M06 completion failure rolls back order/stock; verified success survives and retries", async () => {
  const f = await fixture();
  const p = await checkout.prepare(f.cart.id, f.cart.ownerId, f.input);
  // Fault injection into this fresh test fixture only, no shared/demo data.
  await db.stock.update({
    where: { productId: f.product.id },
    data: { reserved: 0 },
  });
  await assert.rejects(checkout.apply(event(p.id)), {
    code: "RESERVATION_MISMATCH",
  });
  assert.equal(await db.order.count({ where: { paymentId: p.id } }), 0);
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    "success",
  );
  assert.equal(
    (await db.stock.findUniqueOrThrow({ where: { productId: f.product.id } }))
      .onHand,
    5,
  );
  await db.stock.update({
    where: { productId: f.product.id },
    data: { reserved: 1 },
  });
  await checkout.complete(p.id);
  assert.equal(await db.order.count({ where: { paymentId: p.id } }), 1);
});
test("M05 timeout retains hold; late success via separate gateway completes same attempt", async () => {
  const f = await fixture();
  const p = await checkout.prepare(f.cart.id, f.cart.ownerId, {
    ...f.input,
    scenario: "timeout",
  });
  await instance.gateway.create(p.id);
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    "unknown",
  );
  assert.equal(
    (await db.stock.findUniqueOrThrow({ where: { productId: f.product.id } }))
      .reserved,
    1,
  );
  await instance.gateway.outcome(p.id, "success");
  assert.equal(await db.order.count({ where: { paymentId: p.id } }), 1);
  assert.equal(
    (await db.stock.findUniqueOrThrow({ where: { productId: f.product.id } }))
      .reserved,
    0,
  );
});
for (const scenario of ["success", "failure", "pending", "duplicate"] as const)
  test(`M05 separate gateway scenario ${scenario}`, async () => {
    const f = await fixture();
    const p = await checkout.prepare(f.cart.id, f.cart.ownerId, {
      ...f.input,
      scenario,
    });
    await instance.gateway.create(p.id);
    // Query also proves signed status survives callback timing; no payment recreation.
    await instance.gateway.refresh(p.id);
    const stored = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(
      stored.status,
      scenario === "duplicate" ? "success" : scenario,
    );
    assert.equal(
      await db.order.count({ where: { paymentId: p.id } }),
      ["success", "duplicate"].includes(scenario) ? 1 : 0,
    );
  });
test("M05 signature, amount mismatch and terminal conflict cannot forge a completion", async () => {
  const f = await fixture();
  const p = await checkout.prepare(f.cart.id, f.cart.ownerId, f.input);
  const e = event(p.id);
  const raw = JSON.stringify(e);
  await request(instance.app)
    .post("/v1/payment-events")
    .set("Content-Type", "application/json")
    .send(raw)
    .expect(401);
  await assert.rejects(checkout.apply({ ...e, amount: 999 }), {
    code: "PAYMENT_MISMATCH",
  });
  await request(instance.app)
    .post("/v1/payment-events")
    .set(signedHeaders(config.secret, "POST", "/v1/payment-events", raw))
    .send(raw)
    .expect(200);
  await assert.rejects(checkout.apply(event(p.id, 10000, "failure")), {
    code: "TERMINAL_CONFLICT",
  });
  const changed = JSON.stringify({ ...e, status: "failure" });
  await request(instance.app)
    .post("/v1/payment-events")
    .set(signedHeaders(config.secret, "POST", "/v1/payment-events", raw))
    .send(changed)
    .expect(401);
});
test("M07 ownership, CSRF, login session and Staff read-only RBAC are enforced by HTTP", async () => {
  const guest = request.agent(instance.app);
  const boot = await guest.get("/v1/bootstrap").expect(200);
  let csrf = boot.body.csrf;
  const c = await guest
    .post("/v1/carts")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", csrf)
    .send({})
    .expect(201);
  const stranger = request.agent(instance.app);
  await stranger.get(`/v1/carts/${c.body.id}`).expect(404);
  await guest.post("/v1/carts").send({}).expect(403);
  const login = await guest
    .post("/v1/auth/login")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", csrf)
    .send({ username: "staff", password: staffPassword })
    .expect(200);
  csrf = login.body.csrf;
  const monitor = await guest.get("/v1/monitoring/carts").expect(200);
  assert.ok(monitor.body.asOf);
  assert.ok(!JSON.stringify(monitor.body).includes("ownerId"));
  await guest.get("/v1/inventory").expect(403);
  await guest
    .post("/v1/admin/products")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", csrf)
    .send({})
    .expect(403);
  await guest
    .post("/v1/auth/logout")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", csrf)
    .send({})
    .expect(204);
  await guest.get("/v1/monitoring/carts").expect(401);
});
test("M08 Admin validation/uniqueness and DB CHECK reject invalid data", async () => {
  const admin = request.agent(instance.app);
  const boot = await admin.get("/v1/bootstrap");
  const login = await admin
    .post("/v1/auth/login")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", boot.body.csrf)
    .send({ username: "admin", password: adminPassword })
    .expect(200);
  const csrf = login.body.csrf;
  const product = {
    name: "Sản phẩm quản trị",
    sku: randomUUID().toUpperCase(),
    barcode: randomUUID(),
    price: 1000,
    active: true,
  };
  await admin
    .post("/v1/admin/products")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", csrf)
    .send(product)
    .expect(201);
  await admin
    .post("/v1/admin/products")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", csrf)
    .send(product)
    .expect(409);
  await admin
    .post("/v1/admin/products")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", csrf)
    .send({ ...product, price: -1 })
    .expect(400);
  await assert.rejects(
    db.stock.create({
      data: { productId: (await fixture()).product.id, onHand: -1 },
    }),
  );
  assert.ok(DomainError);
});

async function personnel(role: "admin" | "staff") {
  const agent = request.agent(instance.app);
  const boot = await agent.get("/v1/bootstrap").expect(200);
  const login = await agent
    .post("/v1/auth/login")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", boot.body.csrf)
    .send({
      username: role,
      password: role === "admin" ? adminPassword : staffPassword,
    })
    .expect(200);
  return { agent, csrf: login.body.csrf as string };
}

test("PA-01 current cart restores completed receipt reference and never exposes another owner", async () => {
  const buyer = request.agent(instance.app);
  const boot = await buyer.get("/v1/bootstrap").expect(200);
  assert.equal((await buyer.get("/v1/carts/current").expect(200)).body, null);
  const c = await buyer
    .post("/v1/carts")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", boot.body.csrf)
    .send({})
    .expect(201);
  const proof = (await db.cart.findUniqueOrThrow({ where: { id: c.body.id } }))
    .ownerId;
  const p = await db.product.findUniqueOrThrow({ where: { sku: "MILK001" } });
  await checkout.mutate(c.body.id, proof, 1, {
    kind: "add",
    productId: p.id,
    quantity: 1,
    key: randomUUID(),
  });
  const payment = await checkout.prepare(c.body.id, proof, {
    version: 2,
    acceptedAmount: p.price,
    scenario: "pending",
    key: randomUUID(),
  });
  await checkout.apply(event(payment.id, p.price));
  const restored = await buyer.get("/v1/carts/current").expect(200);
  assert.equal(restored.body.id, c.body.id);
  assert.equal(restored.body.status, "completed");
  assert.equal(restored.body.paymentId, payment.id);
  assert.ok(
    (await buyer.get(`/v1/payments/${payment.id}`).expect(200)).body.order,
  );
  const stranger = request.agent(instance.app);
  assert.equal(
    (await stranger.get("/v1/carts/current").expect(200)).body,
    null,
  );
  await stranger.get(`/v1/carts/${c.body.id}`).expect(404);
  await stranger.get(`/v1/payments/${payment.id}`).expect(404);
  assert.equal(await db.cart.count({ where: { ownerId: proof } }), 1);
  const next = await buyer
    .post("/v1/carts")
    .set("Origin", config.origin)
    .set("X-CSRF-Token", boot.body.csrf)
    .send({})
    .expect(201);
  assert.notEqual(next.body.id, c.body.id);
});

test("PA-04 seed adds the zero-stock prototype product and rerun preserves stock and passwords", async () => {
  const noodle = await db.product.findUniqueOrThrow({
    where: { sku: "NOODLE005" },
    include: { stock: true },
  });
  assert.equal(noodle.barcode, "8931000000059");
  assert.equal(noodle.price, 7500);
  assert.equal(noodle.stock?.onHand, 0);
  const f = await fixture();
  await assert.rejects(
    checkout.mutate(f.cart.id, f.cart.ownerId, 2, {
      kind: "add",
      productId: noodle.id,
      quantity: 1,
      key: randomUUID(),
    }),
    { code: "INSUFFICIENT_STOCK" },
  );
  const last = await db.product.findUniqueOrThrow({
    where: { sku: "LAST001" },
  });
  await db.stock.update({ where: { productId: last.id }, data: { onHand: 7 } });
  const before = await db.user.findUniqueOrThrow({
    where: { username: "admin" },
  });
  await seed(
    db,
    randomBytes(20).toString("hex"),
    randomBytes(20).toString("hex"),
  );
  assert.equal(
    (await db.stock.findUniqueOrThrow({ where: { productId: last.id } }))
      .onHand,
    7,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { username: "admin" } }))
      .passwordHash,
    before.passwordHash,
  );
});

test("PA-05 inventory searches names, SKU and leading-zero barcode with admin-only access", async () => {
  const { agent: admin } = await personnel("admin");
  for (const term of ["noodle005", "8931000000059", "Mì ăn liền"]) {
    const result = await admin
      .get(`/v1/inventory?search=${encodeURIComponent(term)}`)
      .expect(200);
    assert.equal(result.body.total, 1);
    assert.equal(result.body.items[0].sku, "NOODLE005");
  }
  const leadingZero = await admin
    .get("/v1/inventory?search=0000000000001")
    .expect(200);
  assert.equal(leadingZero.body.items[0].sku, "LAST001");
  const empty = await admin
    .get(`/v1/inventory?search=${randomUUID()}`)
    .expect(200);
  assert.equal(empty.body.total, 0);
  const { agent: staff } = await personnel("staff");
  await staff.get("/v1/inventory?search=MILK001").expect(403);
  await request(instance.app).get("/v1/inventory").expect(401);
});

test("PA-08 monitoring retains payment snapshot after catalog edits and exposes complete read-only lines", async () => {
  const f = await fixture();
  const payment = await checkout.prepare(f.cart.id, f.cart.ownerId, f.input);
  await db.product.update({
    where: { id: f.product.id },
    data: {
      name: "Tên mới không được thay snapshot",
      sku: `CHANGED-${randomUUID().toUpperCase()}`,
      price: 88888,
    },
  });
  const { agent: staff } = await personnel("staff");
  const monitoring = await staff.get("/v1/monitoring/carts").expect(200);
  const item = monitoring.body.items.find(
    (x: { id: string }) => x.id === f.cart.id,
  );
  assert.ok(item);
  assert.equal(item.items[0].product.name, f.product.name);
  assert.equal(item.items[0].product.sku, f.product.sku);
  assert.equal(item.items[0].unitPrice, 10000);
  assert.equal(item.amount, 10000);
  assert.ok(monitoring.body.asOf);
  const ownerCart = await checkout.cart(f.cart.id, f.cart.ownerId);
  assert.equal(ownerCart.items[0].name, f.product.name);
  await checkout.apply(event(payment.id));
  // After a verified failure, later edits/cancellation must not revive its snapshot.
  const failed = await fixture();
  const failedPayment = await checkout.prepare(
    failed.cart.id,
    failed.cart.ownerId,
    failed.input,
  );
  await checkout.apply(event(failedPayment.id, 10000, "failure"));
  await checkout.mutate(failed.cart.id, failed.cart.ownerId, 2, {
    kind: "set",
    itemId: (await checkout.cart(failed.cart.id, failed.cart.ownerId)).items[0]
      .id,
    quantity: 2,
  });
  const cancelled = await checkout.mutate(
    failed.cart.id,
    failed.cart.ownerId,
    3,
    { kind: "cancel" },
  );
  assert.equal(cancelled.items[0].quantity, 2);
  assert.equal(cancelled.amount, 20000);
});

test("PA-03/PA-09 reports keep half-open boundaries, zero counts, order list and role checks", async () => {
  const a = await fixture(),
    b = await fixture();
  const pa = await checkout.prepare(a.cart.id, a.cart.ownerId, a.input),
    pb = await checkout.prepare(b.cart.id, b.cart.ownerId, b.input);
  await checkout.apply(event(pa.id));
  await checkout.apply(event(pb.id));
  const start = "2040-01-01T17:00:00.000Z",
    end = "2040-01-02T17:00:00.000Z";
  await db.order.update({
    where: { paymentId: pa.id },
    data: { completedAt: new Date(start) },
  });
  await db.order.update({
    where: { paymentId: pb.id },
    data: { completedAt: new Date(end) },
  });
  const { agent: admin } = await personnel("admin");
  const query = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const result = await admin.get(`/v1/reports?${query}`).expect(200);
  assert.equal(result.body.orderCount, 1);
  assert.equal(result.body.revenue, 10000);
  assert.equal(result.body.orders[0].paymentId, pa.id);
  assert.equal(result.body.paymentCounts.length, 5);
  assert.ok(
    result.body.paymentCounts.every((x: { count: number }) => x.count === 0),
  );
  await admin
    .get(
      `/v1/reports?start=${encodeURIComponent(start)}&end=${encodeURIComponent(start)}`,
    )
    .expect(422);
  const { agent: staff } = await personnel("staff");
  await staff.get(`/v1/reports?${query}`).expect(403);
  await request(instance.app).get(`/v1/reports?${query}`).expect(401);
});

test("O01 backup restores into a fresh PostgreSQL cluster without losing holds, orders or idempotency", async () => {
  const started = Date.now();
  const manifest = backup(cluster.url);
  const target = await postgres(`restore-${Date.now()}`);
  const restored = database(target.url);
  try {
    restoreToFreshDatabase(target.url, manifest.file);
    for (const model of [
      "order",
      "orderItem",
      "payment",
      "paymentEvent",
      "reservation",
      "stockMovement",
      "cartOperation",
      "product",
      "stock",
      "cart",
      "cartItem",
      "user",
      "session",
      "gatewayPayment",
    ] as const) {
      assert.equal(
        await restored[model].count(),
        await db[model].count(),
        `${model} count preserved`,
      );
    }
    const counts = await restored.$queryRaw<
      { bad: number }[]
    >`SELECT count(*)::int AS bad FROM "Stock" s WHERE s.reserved <> COALESCE((SELECT sum(r.quantity) FROM "Reservation" r WHERE r."productId"=s."productId" AND r.status='held'),0)`;
    assert.equal(counts[0].bad, 0);
    const completed = await restored.payment.findFirst({
      where: { status: "success", completion: "completed" },
    });
    assert.ok(completed);
    const before = await restored.order.count();
    await new Checkout(restored).complete(completed.id);
    assert.equal(await restored.order.count(), before);
    if (target.driver === "docker") {
      await restored.$disconnect();
      await target.pg.stop();
      await dockerPostgres(target.metadata.name);
      assert.equal(
        await restored.order.count(),
        before,
        "Docker stop/start keeps the named-volume orders",
      );
    }
    assert.deepEqual(
      await restored.orderItem.findMany({ orderBy: { id: "asc" } }),
      await db.orderItem.findMany({ orderBy: { id: "asc" } }),
    );
    assert.throws(
      () => restoreToFreshDatabase(target.url, manifest.file),
      /pg_restore failed/,
    );
    assert.equal(
      await restored.order.count(),
      before,
      "Existing database collision rolls back without data changes",
    );
    const corruptFile = `.runtime/corrupt-${randomUUID()}.dump`;
    writeFileSync(
      corruptFile,
      Buffer.concat([readFileSync(manifest.file), Buffer.from("corrupt")]),
    );
    writeFileSync(`${corruptFile}.json`, JSON.stringify(manifest));
    assert.throws(
      () => restoreToFreshDatabase(target.url, corruptFile),
      /checksum mismatch/,
    );
    const seconds = (Date.now() - started) / 1000;
    assert.ok(seconds < 3600);
    writeFileSync(
      `.runtime/restore-report-${cluster.driver}.json`,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          databaseDriver: cluster.driver,
          restoreSeconds: seconds,
          snapshotAgeSeconds:
            (Date.now() - Date.parse(manifest.createdAt)) / 1000,
          checksum: manifest.checksum,
          orders: before,
          reservationConsistency: "PASS",
          idempotentRetry: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await restored.$disconnect();
    await target.pg.stop();
  }
});
