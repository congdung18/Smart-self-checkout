import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { postgres, migrate, runtimeConnection } from "./postgres.js";
import { database } from "../backend/src/db.js";
import { seed } from "../backend/src/seed.js";

const testing = process.argv.includes("--test");
if (process.argv.includes("--native")) process.env.SSC_DB_DRIVER = "native";
const built = process.argv.includes("--built");
const apiPort = Number(process.env.SSC_API_PORT || 3000);
const gatewayPort = Number(process.env.SSC_GATEWAY_PORT || 3001);
const cluster = await postgres(
  testing ? `browser-${Date.now()}` : "local",
  testing ? undefined : 55432,
);
const runtimeFile = resolve(
  ".runtime",
  testing ? "browser-app.json" : "app.json",
);
type Secrets = {
  adminPassword: string;
  staffPassword: string;
  sessionSecret: string;
  paymentSecret: string;
};
const secrets: Secrets =
  !testing && existsSync(runtimeFile)
    ? JSON.parse(readFileSync(runtimeFile, "utf8"))
    : {
        adminPassword: randomBytes(18).toString("base64url"),
        staffPassword: randomBytes(18).toString("base64url"),
        sessionSecret: randomBytes(32).toString("hex"),
        paymentSecret: randomBytes(32).toString("hex"),
      };
migrate(cluster.url);
const runtimeUrl = await runtimeConnection(cluster.url);
const env = {
  ...process.env,
  DATABASE_URL: runtimeUrl,
  SESSION_SECRET: secrets.sessionSecret,
  PAYMENT_SECRET: secrets.paymentSecret,
  PUBLIC_ORIGIN: `http://127.0.0.1:${built ? apiPort : 5173}`,
  GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`,
  CALLBACK_URL: `http://127.0.0.1:${apiPort}/v1/payment-events`,
  PORT: String(apiPort),
  GATEWAY_PORT: String(gatewayPort),
};
writeFileSync(
  runtimeFile,
  JSON.stringify(
    {
      ...secrets,
      databaseUrl: runtimeUrl,
      origin: env.PUBLIC_ORIGIN,
      databaseDriver: cluster.driver,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
const db = database(runtimeUrl);
await seed(db, secrets.adminPassword, secrets.staffPassword);
await db.$disconnect();
const children = [
  spawn(
    process.execPath,
    ["--import", "tsx", "backend/src/gateway-server.ts"],
    {
      env,
      stdio: "inherit",
      windowsHide: true,
    },
  ),
  spawn(process.execPath, ["--import", "tsx", "backend/src/server.ts"], {
    env,
    stdio: "inherit",
    windowsHide: true,
  }),
];
if (!built)
  children.push(
    spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--config", "frontend/vite.config.ts"],
      { env, stdio: "inherit", windowsHide: true },
    ),
  );
console.log(
  `Local demo (${cluster.driver} PostgreSQL): ${env.PUBLIC_ORIGIN}. Credentials are in ignored ${runtimeFile}; values are not logged.`,
);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
  await cluster.pg.stop();
  process.exit(0);
}
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (String(chunk).trim() === "stop") void stop();
});
for (const child of children)
  child.once("exit", () => {
    if (!closing) void stop();
  });
