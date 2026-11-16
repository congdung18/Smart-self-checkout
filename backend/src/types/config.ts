export type GatewayConfig = {
  secret: string;
  gatewayUrl: string;
  callbackUrl: string;
  timeoutMs?: number;
};
export type AppConfig = GatewayConfig & {
  databaseUrl: string;
  sessionSecret: string;
  origin: string;
  secure: boolean;
};
