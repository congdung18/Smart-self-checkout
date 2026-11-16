import { gatewayApp } from "./gateway.js";
import { database } from "./db.js";
import { config } from "./config.js";
const options = config();
const db = database(options.databaseUrl);
const server = gatewayApp(db, options).listen(
  Number(process.env.GATEWAY_PORT || 3001),
  "127.0.0.1",
  () => console.log("Mock gateway listening on loopback."),
);
async function close() {
  server.close();
  await db.$disconnect();
}
process.once("SIGINT", () => {
  void close();
});
process.once("SIGTERM", () => {
  void close();
});
