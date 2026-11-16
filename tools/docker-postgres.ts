import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { freePort } from "./ports.js";

type Credentials = { password: string; port: number };
export type DockerMetadata = {
  driver: "docker";
  name: string;
  project: string;
  containerId: string;
  port: number;
  image: string;
};
const root = resolve(".runtime", "docker");

export function dockerCommand(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync("docker", args, {
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      resolve(root, "command-error.log"),
      result.stderr || result.error?.message || "Docker command failed",
      { mode: 0o600 },
    );
    throw Error(
      `Docker ${args[0]} failed (${result.status ?? "spawn"}); see ignored .runtime/docker/command-error.log. Verify Docker Desktop Linux engine is running.`,
    );
  }
  return result.stdout.trim();
}
function context(name: string) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name))
    throw Error("Invalid Docker database name");
  const dir = resolve(root, name);
  const credentials = JSON.parse(
    readFileSync(resolve(dir, "credentials.json"), "utf8"),
  ) as Credentials;
  if (
    !Number.isInteger(credentials.port) ||
    credentials.port < 1 ||
    credentials.port > 65535 ||
    !/^[a-f0-9]{64}$/.test(credentials.password)
  )
    throw Error("Invalid Docker runtime metadata");
  const workspace = createHash("sha256")
    .update(process.cwd())
    .digest("hex")
    .slice(0, 12);
  const project = `ssc-${workspace}-${name}`;
  return {
    name,
    dir,
    credentials,
    project,
    env: {
      ...process.env,
      SSC_POSTGRES_PORT: String(credentials.port),
      SSC_POSTGRES_PASSWORD_FILE: resolve(dir, "postgres-password"),
    },
  };
}
export function compose(name: string, args: string[]) {
  const item = context(name);
  return dockerCommand(
    [
      "compose",
      "--project-name",
      item.project,
      "--file",
      resolve("compose.yaml"),
      ...args,
    ],
    item.env,
  );
}
export function dockerMetadata(name: string) {
  const item = context(name);
  const metadata = JSON.parse(
    readFileSync(resolve(item.dir, "metadata.json"), "utf8"),
  ) as DockerMetadata;
  return {
    ...item,
    metadata,
    url: `postgresql://ssc:${item.credentials.password}@127.0.0.1:${item.credentials.port}/checkout`,
  };
}
export function dockerTargetFor(url: string): DockerMetadata | null {
  const parsed = new URL(url);
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    !existsSync(root)
  )
    return null;
  for (const item of readdirSync(root, { withFileTypes: true }).filter((x) =>
    x.isDirectory(),
  )) {
    const file = resolve(root, item.name, "metadata.json");
    if (!existsSync(file)) continue;
    const metadata = JSON.parse(readFileSync(file, "utf8")) as DockerMetadata;
    if (metadata.port === Number(parsed.port) && metadata.driver === "docker") {
      const state = spawnSync(
        "docker",
        ["inspect", "--format", "{{.State.Running}}", metadata.containerId],
        { encoding: "utf8", windowsHide: true, timeout: 10000 },
      );
      if (state.status === 0 && state.stdout.trim() === "true") return metadata;
    }
  }
  return null;
}
export async function dockerPostgres(name: string, fixedPort?: number) {
  const dir = resolve(root, name);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name))
    throw Error("Invalid Docker database name");
  mkdirSync(dir, { recursive: true });
  const credentialFile = resolve(dir, "credentials.json");
  if (!existsSync(credentialFile)) {
    const credentials: Credentials = {
      password: randomBytes(32).toString("hex"),
      port: fixedPort || (await freePort()),
    };
    writeFileSync(credentialFile, JSON.stringify(credentials), { mode: 0o600 });
  }
  const item = context(name);
  // The secret file contains generated runtime data only, never committed config.
  writeFileSync(resolve(dir, "postgres-password"), item.credentials.password, {
    mode: 0o600,
  });
  if (dockerCommand(["info", "--format", "{{.OSType}}"], item.env) !== "linux")
    throw Error("Compose PostgreSQL requires Docker Linux containers");
  compose(name, ["config", "--quiet"]);
  compose(name, [
    "up",
    "--detach",
    "--wait",
    "--wait-timeout",
    "90",
    "postgres",
  ]);
  const containerId = compose(name, ["ps", "--quiet", "postgres"]);
  if (!/^[a-f0-9]{12,64}$/.test(containerId))
    throw Error("Cannot identify managed PostgreSQL container");
  const image = dockerCommand(
    ["inspect", "--format", "{{.Image}}", containerId],
    item.env,
  );
  const metadata: DockerMetadata = {
    driver: "docker",
    name,
    project: item.project,
    containerId,
    port: item.credentials.port,
    image,
  };
  writeFileSync(
    resolve(dir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    { mode: 0o600 },
  );
  const result = dockerMetadata(name);
  const client = new Client({
    connectionString: result.url,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
  return {
    pg: {
      stop: async () => {
        compose(name, ["stop", "postgres"]);
      },
    },
    url: result.url,
    dir,
    driver: "docker" as const,
    metadata,
  };
}
