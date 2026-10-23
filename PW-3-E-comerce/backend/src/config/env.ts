import { Buffer } from "node:buffer";

export type NodeEnvironment = "development" | "test" | "production";
export type MercadoPagoEnvironment = "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  appOrigin: string;
  databaseUrl: string | null;
  piiEncryptionKey: Buffer | null;
  mercadoPagoEnvironment: MercadoPagoEnvironment | null;
  mercadoPagoAccessToken: string | null;
  mercadoPagoPublicKey: string | null;
  mercadoPagoWebhookSecret: string | null;
  sessionTtlSeconds: number;
  maxItemQuantity: number;
  reconciliationCooldownSeconds: number;
  trustProxy: boolean;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
}

function positiveInteger(value: string | undefined, fallback: number, variable: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${variable} must be a positive integer`);
  return parsed;
}

function parseEncryptionKey(value: string | undefined): Buffer | null {
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY must decode to exactly 32 bytes (base64)");
  return key;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawNodeEnv = source.NODE_ENV || "development";
  if (!(rawNodeEnv === "development" || rawNodeEnv === "test" || rawNodeEnv === "production")) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const port = positiveInteger(source.PORT, 3000, "PORT");
  const rawOrigin = source.APP_ORIGIN || (rawNodeEnv === "production" ? "" : `http://localhost:${port}`);
  if (!rawOrigin) throw new Error("APP_ORIGIN is required in production");
  let appOrigin: string;
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.origin !== rawOrigin.replace(/\/$/, "")) throw new Error();
    if (rawNodeEnv === "production" && parsed.protocol !== "https:") throw new Error();
    appOrigin = parsed.origin;
  } catch {
    throw new Error("APP_ORIGIN must be an origin without a path; production requires HTTPS");
  }

  const rawPaymentEnvironment = source.MERCADOPAGO_ENVIRONMENT;
  let mercadoPagoEnvironment: MercadoPagoEnvironment | null = null;
  if (rawPaymentEnvironment) {
    if (rawPaymentEnvironment !== "test" && rawPaymentEnvironment !== "production") {
      throw new Error("MERCADOPAGO_ENVIRONMENT must be test or production");
    }
    mercadoPagoEnvironment = rawPaymentEnvironment;
  }

  const config: AppConfig = {
    nodeEnv: rawNodeEnv,
    port,
    appOrigin,
    databaseUrl: source.DATABASE_URL || null,
    piiEncryptionKey: parseEncryptionKey(source.PII_ENCRYPTION_KEY),
    mercadoPagoEnvironment,
    mercadoPagoAccessToken: source.MERCADOPAGO_ACCESS_TOKEN || null,
    mercadoPagoPublicKey: source.MERCADOPAGO_PUBLIC_KEY || null,
    mercadoPagoWebhookSecret: source.MERCADOPAGO_WEBHOOK_SECRET || null,
    sessionTtlSeconds: positiveInteger(source.CHECKOUT_SESSION_TTL_SECONDS, 72 * 60 * 60, "CHECKOUT_SESSION_TTL_SECONDS"),
    maxItemQuantity: positiveInteger(source.MAX_ORDER_ITEM_QUANTITY, 100, "MAX_ORDER_ITEM_QUANTITY"),
    reconciliationCooldownSeconds: positiveInteger(source.RECONCILIATION_COOLDOWN_SECONDS, 15, "RECONCILIATION_COOLDOWN_SECONDS"),
    trustProxy: source.TRUST_PROXY === "true",
    logLevel: parseLogLevel(source.LOG_LEVEL),
  };

  if (rawNodeEnv === "production") {
    if (!config.databaseUrl || !config.piiEncryptionKey) {
      throw new Error("DATABASE_URL and PII_ENCRYPTION_KEY are required in production");
    }
    if (config.mercadoPagoEnvironment !== "production") {
      throw new Error("Production requires MERCADOPAGO_ENVIRONMENT=production");
    }
    if (!config.mercadoPagoAccessToken || !config.mercadoPagoPublicKey || !config.mercadoPagoWebhookSecret) {
      throw new Error("Production requires Mercado Pago Access Token, Public Key, and webhook secret");
    }
  }

  if (config.mercadoPagoEnvironment === "production" && rawNodeEnv !== "production") {
    throw new Error("Production Mercado Pago credentials are only allowed when NODE_ENV=production");
  }

  return config;
}

function parseLogLevel(value: string | undefined): AppConfig["logLevel"] {
  const allowed: AppConfig["logLevel"][] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
  if (!value) return "info";
  if (!allowed.includes(value as AppConfig["logLevel"])) throw new Error("LOG_LEVEL is invalid");
  return value as AppConfig["logLevel"];
}

export function assertRuntimeConfig(config: AppConfig): asserts config is AppConfig & { databaseUrl: string; piiEncryptionKey: Buffer } {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL não configurada. Configure o arquivo .env antes de iniciar a API.");
  }
  if (!config.piiEncryptionKey) {
    throw new Error("PII_ENCRYPTION_KEY não configurada. Gere uma chave local para cifrar CPF/RG antes de iniciar a API.");
  }
}

export function mercadoPagoIsConfigured(config: AppConfig): boolean {
  return Boolean(
    config.mercadoPagoAccessToken
      && config.mercadoPagoPublicKey
      && config.mercadoPagoWebhookSecret
      && config.mercadoPagoEnvironment,
  );
}
