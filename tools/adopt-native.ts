import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createConnection } from "node:net";
import { Client } from "pg";
import { nativePostgres, runtimeConnection } from "./postgres.js";
import { dockerPostgres } from "./docker-postgres.js";
import { backup, restoreToFreshDatabase } from "./backup.js";
import {
  databaseSnapshot,
  publicTables,
  schemaShape,
} from "./database-snapshot.js";
import { canonicalSchema } from "./schema-compare.js";

async function listening(port: number) {
  return new Promise<boolean>((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
    socket.once("timeout", () => {
      socket.destroy();
      done(false);
    });
  });
}
export async function adoptNative() {
  const reportFile = resolve(".runtime/docker/local/adoption.json");
  if (existsSync(reportFile)) {
    console.log(
      "Native adoption was already verified; no data restored or overwritten. See ignored adoption.json.",
    );
    return;
  }
  const appFile = resolve(".runtime/app.json");
  const nativeCredentials = resolve(".runtime/local/credentials.json");
  if (!existsSync(nativeCredentials) || !existsSync(appFile))
    throw Error(
      "No existing native demo found; use npm run db:up then npm run dev for a fresh Docker demo",
    );
  const nativePort = JSON.parse(readFileSync(nativeCredentials, "utf8"))
    .port as number;
  for (const port of [
    Number(process.env.SSC_API_PORT || 3000),
    Number(process.env.SSC_GATEWAY_PORT || 3001),
    5173,
    nativePort,
  ]) {
    if (await listening(port))
      throw Error(
        `Port ${port} is active. Stop the native demo/DB before maintenance; no data changed.`,
      );
  }
  const nativeApp = readFileSync(appFile, "utf8");
  const source = await nativePostgres("local", 55432);
  let target: Awaited<ReturnType<typeof dockerPostgres>> | undefined;
  let sourceClient: Client | undefined, targetClient: Client | undefined;
  let transaction = false;
  try {
    target = await dockerPostgres("local", 55433);
    sourceClient = new Client({ connectionString: source.url });
    targetClient = new Client({ connectionString: target.url });
    await sourceClient.connect();
    await targetClient.connect();
    const targetHasTables = (await publicTables(targetClient)).length > 0;
    const tables = await publicTables(sourceClient);
    if (!tables.includes("_prisma_migrations") || !tables.includes("Product"))
      throw Error("Source is not the initialized checkout database");
    await sourceClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    transaction = true;
    // SHARE permits pg_dump reads while blocking all application table writes.
    await sourceClient.query(
      `LOCK TABLE ${tables.map((x) => `public."${x}"`).join(",")} IN SHARE MODE`,
    );
    const snapshot = (
      await sourceClient.query<{ snapshot: string }>(
        "SELECT pg_export_snapshot() AS snapshot",
      )
    ).rows[0].snapshot;
    const before = await databaseSnapshot(sourceClient);
    const manifest = backup(source.url, { snapshot });
    // A resumed transfer only compares an existing target; never restore over it.
    if (!targetHasTables) restoreToFreshDatabase(target.url, manifest.file);
    const after = await databaseSnapshot(targetClient);
    if (after.schemaSha256 !== before.schemaSha256)
      writeFileSync(
        resolve(target.dir, "schema-diff.json"),
        JSON.stringify(
          {
            source: await schemaShape(sourceClient),
            target: await schemaShape(targetClient),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    const sourceShape = await schemaShape(sourceClient),
      targetShape = await schemaShape(targetClient);
    assert.deepEqual(
      targetShape.columns,
      sourceShape.columns,
      "All column metadata must match before expression normalization",
    );
    const rawSchema = {
      native: before.schemaSha256,
      docker: after.schemaSha256,
    };
    before.schemaSha256 = await canonicalSchema(sourceShape, targetClient);
    after.schemaSha256 = await canonicalSchema(targetShape, targetClient);
    assert.deepEqual(
      after,
      before,
      "Restored Docker schema/rows must match the native snapshot exactly",
    );
    const runtimeUrl = await runtimeConnection(target.url);
    const appBackup = resolve(target.dir, "native-app.json");
    if (!existsSync(appBackup))
      writeFileSync(appBackup, nativeApp, { mode: 0o600 });
    writeFileSync(
      reportFile,
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          sourceDriver: "native",
          targetDriver: "docker",
          backup: manifest,
          snapshot: before,
          schemaMatch: true,
          schemaComparison:
            "Strict columns/constraint/index identity; CHECK/predicates reparsed on target using rolled-back temp tables",
          rawSchema,
          dataMatch: true,
          nativePreserved: true,
          project: target.metadata.project,
          image: target.metadata.image,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    writeFileSync(
      appFile,
      JSON.stringify(
        {
          ...JSON.parse(nativeApp),
          databaseUrl: runtimeUrl,
          databaseDriver: "docker",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await sourceClient.query("COMMIT");
    transaction = false;
    console.log(
      JSON.stringify({
        adoption: "PASS",
        applicationTables: tables.filter((x) => x !== "_prisma_migrations")
          .length,
        schemaMatch: true,
        dataMatch: true,
        nativePreserved: true,
        dockerPort: target.metadata.port,
        report: ".runtime/docker/local/adoption.json",
      }),
    );
  } finally {
    if (transaction) await sourceClient?.query("ROLLBACK").catch(() => {});
    await sourceClient?.end();
    await targetClient?.end();
    await source.pg.stop();
  }
}
