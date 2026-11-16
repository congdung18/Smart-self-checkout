import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  const expected = Buffer.from(encoded, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function signature(
  secret: string,
  timestamp: string,
  method: string,
  route: string,
  body: string,
) {
  return createHmac("sha256", secret)
    .update(`${timestamp}\n${method}\n${route}\n${body}`)
    .digest("hex");
}
export function signedHeaders(
  secret: string,
  method: string,
  route: string,
  body: string,
) {
  const timestamp = String(Date.now());
  return {
    "content-type": "application/json",
    "x-timestamp": timestamp,
    "x-signature": signature(secret, timestamp, method, route, body),
  };
}
export function verifySignature(
  secret: string,
  timestamp: string,
  received: string,
  method: string,
  route: string,
  body: string,
) {
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 300_000 ||
    !/^[a-f0-9]{64}$/.test(received)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature(secret, timestamp, method, route, body), "hex"),
    Buffer.from(received, "hex"),
  );
}
