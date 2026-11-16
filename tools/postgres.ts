import EmbeddedPostgres from "embedded-postgres";
import { randomBytes, createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { freePort } from "./ports.js";
import { dockerPostgres } from "./docker-postgres.js";
export { freePort } from "./ports.js";

export function databaseDriver() {
  const driver = process.env.SSC_DB_DRIVER || "docker";
  if (driver !== "docker" && driver !== "native")
    throw Error("SSC_DB_DRIVER must be docker or native");
  return driver;
}
export async function postgres(name: string, fixedPort?: number) {
  if (databaseDriver() === "native") return nativePostgres(name, fixedPort);
  if (
    name === "local" &&
    existsSync(resolve(".runtime/local/native-location.txt")) &&
    !existsSync(resolve(".runtime/docker/local/adoption.json"))
  ) {
    throw Error(
      "Existing native demo detected. Run npm run db:adopt-native before Docker dev, or npm run dev:native to keep using it.",
    );
  }
  return dockerPostgres(name, name === "local" ? 55433 : fixedPort);
}
export async function nativePostgres(name: string, fixedPort?: number) {
  const dir = resolve(".runtime", name);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "credentials.json");
  const credentials: { password: string; port: number } = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {
        password: randomBytes(32).toString("hex"),
        port: fixedPort || (await freePort()),
      };
  writeFileSync(file, JSON.stringify(credentials), { mode: 0o600 });
  // PostgreSQL's Windows initdb re-exec cannot handle this repository's Vietnamese
  // path. Use an isolated ASCII temp directory for native binaries/data, not a
  // different database or in-memory substitute. Never delete either cluster.
  if (process.platform === "win32") {
    const workspace = createHash("sha256")
      .update(process.cwd())
      .digest("hex")
      .slice(0, 12);
    const nativeRoot = resolve(tmpdir(), `ssc-postgres-${workspace}`);
    const binaries = resolve(nativeRoot, "native");
    if (!existsSync(resolve(binaries, "bin", "initdb.exe"))) {
      mkdirSync(nativeRoot, { recursive: true });
      cpSync(
        resolve("node_modules/@embedded-postgres/windows-x64/native"),
        binaries,
        { recursive: true },
      );
    }
    const databaseDir = resolve(nativeRoot, name);
    const run = (executable: string, args: string[]) => {
      const result = spawnSync(
        resolve(binaries, "bin", `${executable}.exe`),
        args,
        {
          encoding: "utf8",
          windowsHide: true,
          stdio: "ignore",
          timeout: 30000,
        },
      );
      if (result.status !== 0)
        throw Error(
          `PostgreSQL ${executable} failed: ${result.error?.message || result.stderr || result.stdout}`,
        );
    };
    if (!existsSync(resolve(databaseDir, "PG_VERSION"))) {
      const passwordFile = resolve(
        nativeRoot,
        `init-${randomBytes(8).toString("hex")}.txt`,
      );
      writeFileSync(passwordFile, credentials.password, { mode: 0o600 });
      try {
        run("initdb", [
          "-D",
          databaseDir,
          "-U",
          "ssc",
          "--auth=scram-sha-256",
          `--pwfile=${passwordFile}`,
          "--encoding=UTF8",
          "--locale=C",
        ]);
      } finally {
        unlinkSync(passwordFile);
      }
    }
    run("pg_ctl", [
      "-D",
      databaseDir,
      "-l",
      resolve(databaseDir, "server.log"),
      "-w",
      "start",
      "-o",
      `-h 127.0.0.1 -p ${credentials.port}`,
    ]);
    const base = `postgresql://ssc:${credentials.password}@127.0.0.1:${credentials.port}`;
    const client = new Client({ connectionString: `${base}/postgres` });
    await client.connect();
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname='checkout'",
    );
    if (!result.rowCount) await client.query("CREATE DATABASE checkout");
    await client.end();
    writeFileSync(resolve(dir, "native-location.txt"), databaseDir);
    return {
      pg: {
        stop: async () =>
          run("pg_ctl", ["-D", databaseDir, "-m", "fast", "-w", "stop"]),
      },
      url: `${base}/checkout`,
      dir,
      driver: "native" as const,
    };
  }
  const databaseDir = resolve(dir, "data");
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "ssc",
    password: credentials.password,
    port: credentials.port,
    persistent: true,
    authMethod: "scram-sha-256",
    createPostgresUser: false,
    autoRehydrateSymlinks: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'checkout'",
  );
  await client.end();
  if (!result.rowCount) await pg.createDatabase("checkout");
  const url = `postgresql://ssc:${credentials.password}@127.0.0.1:${credentials.port}/checkout`;
  return { pg, url, dir, driver: "native" as const };
}
export function migrate(url: string) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    throw Error(`Migration failed: ${result.error?.message || result.stderr}`);
}

export async function runtimeConnection(adminUrl: string) {
  const password = randomBytes(32).toString("hex");
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const role = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname='ssc_app'",
    );
    // Internally generated hexadecimal, not an external SQL value.
    await client.query(
      `${role.rowCount ? "ALTER" : "CREATE"} ROLE ssc_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await client.query("GRANT USAGE ON SCHEMA public TO ssc_app");
    await client.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ssc_app",
    );
    await client.query(
      "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ssc_app",
    );
  } finally {
    await client.end();
  }
  const url = new URL(adminUrl);
  url.username = "ssc_app";
  url.password = password;
  return url.toString();
}
