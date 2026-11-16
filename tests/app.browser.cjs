const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdirSync, readFileSync } = require("node:fs");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const net = require("node:net");
let runner, browser, origin, credentials;
async function freePort() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
before(async () => {
  mkdirSync("test-results/screenshots", { recursive: true });
  const apiPort = await freePort(),
    gatewayPort = await freePort();
  origin = `http://127.0.0.1:${apiPort}`;
  runner = spawn(
    process.execPath,
    ["--import", "tsx", "tools/local.ts", "--built", "--test"],
    {
      env: {
        ...process.env,
        SSC_API_PORT: String(apiPort),
        SSC_GATEWAY_PORT: String(gatewayPort),
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let logs = "";
  runner.stdout.on("data", (x) => {
    logs += x;
  });
  runner.stderr.on("data", (x) => {
    logs += x;
  });
  let ready = false;
  for (let i = 0; i < 600; i++) {
    if (runner.exitCode !== null) throw Error(`Local runner stopped: ${logs}`);
    try {
      ready = (await fetch(`${origin}/v1/health`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "Local PostgreSQL/API/gateway ready");
  credentials = JSON.parse(readFileSync(".runtime/browser-app.json", "utf8"));
  assert.equal(
    credentials.databaseDriver,
    process.env.SSC_DB_DRIVER || "docker",
  );
  browser = await chromium.launch({
    executablePath:
      process.env.SSC_BROWSER ||
      (process.platform === "win32"
        ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
        : undefined),
    headless: true,
  });
});
after(async () => {
  await browser?.close();
  if (runner && runner.exitCode === null) {
    runner.stdin.write("stop\n");
    await Promise.race([
      new Promise((r) => runner.once("exit", r)),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    if (runner.exitCode === null) runner.kill("SIGTERM");
  }
});
async function fresh(callback, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport }),
    page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(origin);
    await page
      .getByRole("heading", { name: "Tự thanh toán dễ dàng", exact: true })
      .waitFor();
    await callback(page, context);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
async function start(page) {
  await page
    .getByRole("button", { name: "Bắt đầu quét sản phẩm →", exact: true })
    .click();
  await page.getByLabel("Barcode hoặc SKU").waitFor();
}
async function add(page, code = "MILK001") {
  await page.getByLabel("Barcode hoặc SKU").fill(code);
  await page
    .getByRole("button", { name: "Tra cứu sản phẩm", exact: true })
    .click();
  await page.getByRole("button", { name: "Thêm vào giỏ", exact: true }).click();
  await page.getByText(/Đã thêm .* vào giỏ/).waitFor();
}
async function goCart(page) {
  await page
    .getByRole("button", { name: "Xem giỏ hàng →", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Giỏ hàng của bạn", exact: true })
    .waitFor();
}
async function confirm(page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function pay(page, scenario = "success") {
  await page
    .getByRole("button", { name: "Tiếp tục thanh toán →", exact: true })
    .click();
  await page.getByLabel("Kịch bản gateway demo").selectOption(scenario);
  await page
    .getByRole("button", { name: "Tạo mã thanh toán mô phỏng", exact: true })
    .click();
  await confirm(page);
}
async function login(page, role = "admin") {
  if (!(await page.getByLabel("Tên đăng nhập").isVisible()))
    await page
      .getByRole("button", { name: "Nhân sự đăng nhập", exact: true })
      .click();
  await page.getByLabel("Tên đăng nhập").fill(role);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(
      role === "admin" ? credentials.adminPassword : credentials.staffPassword,
    );
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("heading", { name: "Giám sát phiên mua", exact: true })
    .waitFor();
}
async function current(page) {
  return (await page.request.get(`${origin}/v1/carts/current`)).json();
}
async function axe(page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((x) => ({
      id: x.id,
      nodes: x.nodes.map((n) => n.target),
    })),
    [],
  );
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Document has no horizontal overflow",
  );
}

test("M01–M06/PA-01 preview, timeout, reload, late success and receipt survive reload until explicit new purchase", () =>
  fresh(async (page) => {
    assert.equal(await current(page), null);
    await start(page);
    await page.getByLabel("Barcode hoặc SKU").fill("MILK001");
    await page
      .getByRole("button", { name: "Tra cứu sản phẩm", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Thêm vào giỏ", exact: true })
      .waitFor();
    assert.equal((await current(page)).items.length, 0);
    await page
      .getByRole("button", { name: "Thêm vào giỏ", exact: true })
      .click();
    await page.getByText(/Đã thêm .* vào giỏ/).waitFor();
    await goCart(page);
    await pay(page, "timeout");
    await page
      .getByRole("heading", {
        name: /Chưa xác nhận kết quả|Đang chờ thanh toán/,
      })
      .waitFor();
    const before = await current(page);
    await page.reload();
    await page
      .getByRole("button", { name: "Kiểm tra trạng thái", exact: true })
      .waitFor();
    assert.equal((await current(page)).paymentId, before.paymentId);
    await page
      .getByText("Công cụ mô phỏng kết quả gateway", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Mô phỏng thành công", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Mua hàng hoàn tất", exact: true })
      .waitFor();
    const receipt = await page.getByText(/^Mã đơn:/).textContent();
    await page.reload();
    await page
      .getByRole("heading", { name: "Mua hàng hoàn tất", exact: true })
      .waitFor();
    assert.equal(await page.getByText(/^Mã đơn:/).textContent(), receipt);
    assert.equal((await current(page)).id, before.id);
    assert.equal((await current(page)).status, "completed");
    await page
      .getByRole("button", { name: "Bắt đầu lượt mua mới", exact: true })
      .click();
    await page.getByLabel("Barcode hoặc SKU").waitFor();
    assert.notEqual((await current(page)).id, before.id);
  }));

test("M02 remove/cancel confirmation, keyboard focus and empty active cart", () =>
  fresh(async (page) => {
    await start(page);
    await add(page);
    await goCart(page);
    await page.getByRole("button", { name: "Xóa", exact: true }).click();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Giữ nguyên", exact: true })
        .evaluate((x) => x === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "Xóa", exact: true })
        .evaluate((x) => x === document.activeElement),
      true,
    );
    await page.getByRole("button", { name: "Xóa", exact: true }).click();
    await confirm(page);
    await page.getByText("Giỏ hàng đang trống", { exact: true }).waitFor();
    assert.equal((await current(page)).status, "active");
    assert.ok(
      await page
        .getByRole("button", { name: "Tiếp tục thanh toán →", exact: true })
        .isDisabled(),
    );
    await page
      .getByRole("button", { name: "Hủy lượt mua", exact: true })
      .click();
    await confirm(page);
    await page
      .getByRole("button", { name: "Bắt đầu phiên mới", exact: true })
      .waitFor();
  }));

test("M01 camera reads once, stops, and never adds automatically", () =>
  fresh(async (page) => {
    await start(page);
    await page.evaluate(() => {
      window.__cameraStopped = false;
      window.BarcodeDetector = class {
        async detect() {
          return [{ rawValue: "BREAD002" }];
        }
      };
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const stream = new MediaStream();
            stream.getTracks = () => [
              {
                stop() {
                  window.__cameraStopped = true;
                },
              },
            ];
            return stream;
          },
        },
      });
      HTMLMediaElement.prototype.play = async () => {};
    });
    await page.getByRole("button", { name: "Bật camera", exact: true }).click();
    await page
      .getByRole("button", { name: "Thêm vào giỏ", exact: true })
      .waitFor();
    assert.equal((await current(page)).items.length, 0);
    assert.equal(await page.evaluate(() => window.__cameraStopped), true);
  }));

test("M01/PA-04 out-of-stock prototype product exists and cannot be added", () =>
  fresh(async (page) => {
    await start(page);
    await page.getByLabel("Barcode hoặc SKU").fill("NOODLE005");
    await page
      .getByRole("button", { name: "Tra cứu sản phẩm", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Thêm vào giỏ", exact: true })
      .click();
    // A failed add announces stock and keeps the cart empty.
    await page
      .getByRole("alert")
      .filter({ hasText: "Không đủ hàng" })
      .waitFor();
    assert.equal((await current(page)).items.length, 0);
  }));

test("M07/S01 Staff only monitors; failed refresh preserves timestamp and stale content", () =>
  fresh(async (page) => {
    await start(page);
    await add(page);
    await login(page, "staff");
    await page.getByText(/Cập nhật lúc/).waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Tồn kho", exact: true }).count(),
      0,
    );
    const timestamp = await page.getByText(/Cập nhật lúc/).textContent();
    await page.route("**/v1/monitoring/carts?*", (route) => route.abort());
    await page.getByRole("button", { name: "Làm mới", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByText(/Cập nhật lúc/).textContent(), timestamp);
    assert.ok(
      await page
        .getByText(/Dữ liệu đang hiển thị chưa được cập nhật/)
        .isVisible(),
    );
    await page.unroute("**/v1/monitoring/carts?*");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    await page.goto(`${origin}/#/admin/inventory`);
    await page
      .getByRole("heading", { name: "Không có quyền truy cập" })
      .waitFor();
  }));

test("M08/PA-02/PA-05 Admin CRUD, search, confirmation before deactivation and read-only inventory", () =>
  fresh(async (page) => {
    await login(page);
    await page.getByRole("link", { name: "Sản phẩm", exact: true }).click();
    await page
      .getByRole("button", { name: "Thêm sản phẩm", exact: true })
      .click();
    const sku = `E2E-${Date.now()}`;
    await page.getByLabel("Tên sản phẩm", { exact: true }).fill("Sản phẩm E2E");
    await page.getByLabel("SKU", { exact: true }).fill(sku);
    await page.getByLabel("Barcode", { exact: true }).fill(sku);
    await page.getByLabel("Giá (đồng)", { exact: true }).fill("12345");
    await page
      .getByRole("button", { name: "Lưu sản phẩm", exact: true })
      .click();
    await page.getByText("Đã lưu sản phẩm.", { exact: true }).waitFor();
    await page.getByLabel("Tìm theo tên, barcode hoặc SKU").fill(sku);
    await page
      .getByRole("button", { name: "Tìm sản phẩm", exact: true })
      .click();
    await page.getByText("1 kết quả", { exact: true }).waitFor();
    await page
      .getByRole("row")
      .filter({ hasText: sku })
      .getByRole("button", { name: "Sửa", exact: true })
      .click();
    await page
      .getByLabel("Tên sản phẩm", { exact: true })
      .fill("Sản phẩm E2E đã sửa");
    await page.getByLabel("Đang kinh doanh", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Lưu sản phẩm", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Giữ nguyên", exact: true })
      .click();
    assert.ok(
      await page.getByLabel("Tên sản phẩm", { exact: true }).isVisible(),
    );
    await page
      .getByRole("button", { name: "Lưu sản phẩm", exact: true })
      .click();
    await confirm(page);
    await page
      .getByRole("cell", { name: "Sản phẩm E2E đã sửa", exact: true })
      .waitFor();
    await page.getByRole("link", { name: "Tồn kho", exact: true }).click();
    await page
      .getByRole("heading", { name: "Theo dõi tồn kho", exact: true })
      .waitFor();
    await page.getByLabel("Tìm theo tên, barcode hoặc SKU").fill(sku);
    await page
      .getByRole("button", { name: "Tìm sản phẩm", exact: true })
      .click();
    await page.getByText("1 kết quả", { exact: true }).waitFor();
    assert.ok(
      await page
        .getByRole("columnheader", { name: "Đang giữ", exact: true })
        .isVisible(),
    );
    assert.ok(await page.getByText("Hết hàng", { exact: true }).isVisible());
    assert.equal(
      await page
        .getByRole("button", { name: "Thêm sản phẩm", exact: true })
        .count(),
      0,
    );
  }));

test("PA-07 duplicate SKU gives inline error, keeps draft and focuses invalid field", () =>
  fresh(async (page) => {
    await login(page);
    await page.getByRole("link", { name: "Sản phẩm", exact: true }).click();
    await page
      .getByRole("button", { name: "Thêm sản phẩm", exact: true })
      .click();
    await page
      .getByLabel("Tên sản phẩm", { exact: true })
      .fill("Draft được giữ");
    await page.getByLabel("SKU", { exact: true }).fill("MILK001");
    await page.getByLabel("Barcode", { exact: true }).fill(`NEW-${Date.now()}`);
    await page.getByLabel("Giá (đồng)", { exact: true }).fill("1000");
    await page
      .getByRole("button", { name: "Lưu sản phẩm", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.getByLabel("Tên sản phẩm", { exact: true }).inputValue(),
      "Draft được giữ",
    );
    assert.equal(
      await page
        .getByLabel("SKU", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.matches('[aria-invalid="true"], .error-summary'),
      ),
      true,
    );
    await axe(page);
  }));

test("PA-03/PA-09 same-day report includes completed order and all zero status counts", () =>
  fresh(async (page) => {
    await start(page);
    await add(page);
    await goCart(page);
    await pay(page);
    await page
      .getByRole("heading", { name: "Mua hàng hoàn tất", exact: true })
      .waitFor();
    const orderId = (await current(page)).orderId;
    await login(page);
    await page.getByRole("link", { name: "Báo cáo", exact: true }).click();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await page.getByLabel("Từ ngày", { exact: true }).fill(today);
    await page.getByLabel("Đến ngày", { exact: true }).fill(today);
    const response = page.waitForResponse(
      (x) => new URL(x.url()).pathname === "/v1/reports",
    );
    await page
      .getByRole("button", { name: "Áp dụng bộ lọc", exact: true })
      .click();
    const result = await response;
    assert.equal(result.status(), 200);
    const body = await result.json();
    assert.equal(
      new Date(body.end).getTime() - new Date(body.start).getTime(),
      86400000,
    );
    assert.equal(body.paymentCounts.length, 5);
    assert.ok(body.orders.some((x) => x.id === orderId));
    await page.getByText(`Mã đơn: ${orderId}`, { exact: true }).waitFor();
    assert.equal(await page.locator(".status-counts dt").count(), 5);
    await axe(page);
  }));

test("PA-06 deep link, browser Back/Forward, reload and login return destination", () =>
  fresh(async (page) => {
    await page.goto(`${origin}/#/admin/inventory`);
    await page.getByLabel("Tên đăng nhập").waitFor();
    await page.getByLabel("Tên đăng nhập").fill("admin");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill(credentials.adminPassword);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page
      .getByRole("heading", { name: "Theo dõi tồn kho", exact: true })
      .waitFor();
    await page.getByRole("link", { name: "Sản phẩm", exact: true }).click();
    await page
      .getByRole("heading", { name: "Quản lý sản phẩm", exact: true })
      .waitFor();
    await page.goBack();
    await page
      .getByRole("heading", { name: "Theo dõi tồn kho", exact: true })
      .waitFor();
    await page.goForward();
    await page
      .getByRole("heading", { name: "Quản lý sản phẩm", exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "Quản lý sản phẩm", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Sản phẩm", exact: true })
        .getAttribute("aria-current"),
      "page",
    );
  }));

test("Offline keeps cart content and blocks writes; inventory empty and network error can recover", () =>
  fresh(async (page, context) => {
    await start(page);
    await add(page);
    await goCart(page);
    await context.setOffline(true);
    await page.getByText(/Bạn đang ngoại tuyến/).waitFor();
    assert.equal(await page.locator(".cart-list li").count(), 1);
    assert.ok(
      await page.getByRole("button", { name: "Xóa", exact: true }).isDisabled(),
    );
    await context.setOffline(false);
    await page.getByText(/Bạn đang ngoại tuyến/).waitFor({ state: "hidden" });
    await login(page);
    await page.getByRole("link", { name: "Tồn kho", exact: true }).click();
    await page
      .getByLabel("Tìm theo tên, barcode hoặc SKU")
      .fill("NO-MATCH-" + Date.now());
    await page
      .getByRole("button", { name: "Tìm sản phẩm", exact: true })
      .click();
    await page
      .getByText("Không có sản phẩm phù hợp. Hãy sửa từ khóa tìm kiếm.", {
        exact: true,
      })
      .waitFor();
    await page.route("**/v1/inventory?*", (route) => route.abort());
    await page.getByRole("button", { name: "Làm mới", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.unroute("**/v1/inventory?*");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
  }));

for (const width of [360, 768, 1280])
  test(`PA-10 UI responsive/axe across customer, Admin and Staff pages at ${width}px`, () =>
    fresh(
      async (page) => {
        await noOverflow(page);
        await axe(page);
        await page.screenshot({
          path: `test-results/screenshots/verified-home-${width}.png`,
          fullPage: true,
        });
        await start(page);
        await page.screenshot({
          path: `test-results/screenshots/verified-scan-${width}.png`,
          fullPage: true,
        });
        await noOverflow(page);
        await axe(page);
        await add(page);
        await goCart(page);
        await noOverflow(page);
        await axe(page);
        await page.getByRole("button", { name: "Xóa", exact: true }).click();
        await axe(page);
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Giữ nguyên", exact: true })
          .click();
        await pay(page);
        await page
          .getByRole("heading", { name: "Mua hàng hoàn tất", exact: true })
          .waitFor();
        await noOverflow(page);
        await axe(page);
        await login(page);
        await noOverflow(page);
        await axe(page);
        for (const label of ["Sản phẩm", "Tồn kho", "Báo cáo"]) {
          await page.getByRole("link", { name: label, exact: true }).click();
          await page.getByRole("heading", { level: 1 }).waitFor();
          await page
            .getByRole("status")
            .filter({ hasText: "Đang tải dữ liệu…" })
            .waitFor({ state: "hidden" });
          await noOverflow(page);
          await axe(page);
          await page.screenshot({
            path: `test-results/screenshots/verified-admin-${label}-${width}.png`,
            fullPage: true,
          });
        }
        await page.getByRole("link", { name: "Sản phẩm", exact: true }).click();
        await page
          .getByRole("button", { name: "Thêm sản phẩm", exact: true })
          .click();
        await noOverflow(page);
        await axe(page);
      },
      { width, height: 900 },
    ));

test("Landscape, text zoom and reduced motion keep controls reachable", () =>
  fresh(
    async (page) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await noOverflow(page);
      await start(page);
      await add(page);
      await goCart(page);
      await noOverflow(page);
      assert.ok(
        await page
          .getByRole("button", { name: "Tiếp tục thanh toán →", exact: true })
          .isVisible(),
      );
    },
    { width: 740, height: 360 },
  ));
