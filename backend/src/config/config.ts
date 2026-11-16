export function config() {
  const required = (key: string) => {
    const value = process.env[key];
    if (!value) throw Error(`${key} is required`);
    return value;
  };
  const origin = required("PUBLIC_ORIGIN");
  const url = new URL(origin);
  const secure = url.protocol === "https:";
  if (!secure && !["127.0.0.1", "localhost"].includes(url.hostname))
    throw Error("HTTPS required outside loopback");
  return {
    databaseUrl: required("DATABASE_URL"),
    sessionSecret: required("SESSION_SECRET"),
    secret: required("PAYMENT_SECRET"),
    gatewayUrl: required("GATEWAY_URL"),
    callbackUrl: required("CALLBACK_URL"),
    origin,
    secure,
  };
}
