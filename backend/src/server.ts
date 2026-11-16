import { createApp } from "./app.js";
import { database } from "./db.js";
import { config } from "./config.js";
const options = config();
const db = database(options.databaseUrl);
const instance = createApp(db, options);
const timer = setInterval(() => {
  void instance.gateway.reconcile();
}, 10000);
const server = instance.app.listen(
  Number(process.env.PORT || 3000),
  "127.0.0.1",
  () => console.log("Checkout API listening on loopback."),
);
async function close() {
  clearInterval(timer);
  server.close();
  instance.close();
  await db.$disconnect();
}
process.once("SIGINT", () => {
  void close();
});
process.once("SIGTERM", () => {
  void close();
});
