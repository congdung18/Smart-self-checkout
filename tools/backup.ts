import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { dockerCommand, dockerTargetFor } from "./docker-postgres.js";

export function nativeBinary(name: string) {
  if (process.env.PG_TOOLS_DIRECTORY)
    return resolve(
      process.env.PG_TOOLS_DIRECTORY,
      `${name}${process.platform === "win32" ? ".exe" : ""}`,
    );
  const locationFile = resolve(".runtime", "pg-tools-location.txt");
  if (existsSync(locationFile)) {
    const binary = resolve(
      readFileSync(locationFile, "utf8").trim(),
      `${name}${process.platform === "win32" ? ".exe" : ""}`,
    );
    if (existsSync(binary)) return binary;
  }
  if (process.platform === "win32") {
    const hash = createHash("sha256")
      .update(process.cwd())
      .digest("hex")
      .slice(0, 12);
    return resolve(
      tmpdir(),
      `ssc-postgres-${hash}`,
      "native",
      "bin",
      `${name}.exe`,
    );
  }
  return resolve(
    `node_modules/@embedded-postgres/${process.platform}-${process.arch}/native/bin/${name}`,
  );
}
function run(tool: string, url: string, args: string[]) {
  const parsed = new URL(url);
  const docker = dockerTargetFor(url);
  if (docker) {
    try {
      const containerFile = `/tmp/ssc-${tool}-${randomUUID()}.dump`;
      const user = decodeURIComponent(parsed.username),
        database = decodeURIComponent(parsed.pathname.slice(1));
      const command = [tool, "--username", user, "--dbname", database, ...args];
      if (tool === "pg_dump") {
        const index = command.indexOf("--file") + 1;
        const destination = command[index];
        command[index] = containerFile;
        dockerCommand(["exec", docker.containerId, ...command]);
        dockerCommand([
          "cp",
          `${docker.containerId}:${containerFile}`,
          destination,
        ]);
      } else {
        const source = command[command.length - 1];
        command[command.length - 1] = containerFile;
        dockerCommand(["cp", source, `${docker.containerId}:${containerFile}`]);
        dockerCommand(["exec", docker.containerId, ...command]);
      }
      return;
    } catch {
      throw Error(
        `${tool} failed (Docker); see ignored .runtime/docker/command-error.log`,
      );
    }
  }
  const result = spawnSync(
    nativeBinary(tool),
    tool === "pg_restore"
      ? ["--dbname", decodeURIComponent(parsed.pathname.slice(1)), ...args]
      : args,
    {
      env: {
        ...process.env,
        PGHOST: parsed.hostname,
        PGPORT: parsed.port,
        PGUSER: decodeURIComponent(parsed.username),
        PGPASSWORD: decodeURIComponent(parsed.password),
        PGDATABASE: parsed.pathname.slice(1),
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 120000,
    },
  );
  if (result.status !== 0) {
    mkdirSync(resolve(".runtime"), { recursive: true });
    writeFileSync(
      resolve(".runtime", `${tool}-error.log`),
      result.stderr || result.error?.message || "Unknown tool error",
      { mode: 0o600 },
    );
    throw Error(
      `${tool} failed (${result.status}): ${result.error?.message || "See protected PostgreSQL logs."}`,
    );
  }
}
export function backup(url: string, options: { snapshot?: string } = {}) {
  const directory = process.env.BACKUP_DIRECTORY
    ? resolve(process.env.BACKUP_DIRECTORY)
    : resolve(tmpdir(), "ssc-backup-artifacts");
  mkdirSync(directory, { recursive: true });
  const createdAt = new Date().toISOString();
  const file = resolve(
    directory,
    `checkout-${Date.now()}-${randomUUID()}.dump`,
  );
  run("pg_dump", url, [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    ...(options.snapshot ? ["--snapshot", options.snapshot] : []),
    "--file",
    file,
  ]);
  const checksum = createHash("sha256")
    .update(readFileSync(file))
    .digest("hex");
  const manifest = { file, checksum, createdAt };
  writeFileSync(`${file}.json`, JSON.stringify(manifest, null, 2), {
    mode: 0o600,
  });
  return manifest;
}
export function restoreToFreshDatabase(url: string, archive: string) {
  if (!existsSync(archive)) throw Error("Backup not found");
  const manifest = JSON.parse(readFileSync(`${archive}.json`, "utf8"));
  const actual = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  if (actual !== manifest.checksum) throw Error("Backup checksum mismatch");
  // No --clean/--create: never drop or overwrite existing objects. Caller must
  // provision a new isolated database; pg_restore exits on first collision.
  run("pg_restore", url, [
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    "--single-transaction",
    archive,
  ]);
}
