import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import type { AppConfig } from "../../backend/src/config/env.js";
import type { Database } from "../../backend/src/database/types.js";

const config: AppConfig = {
  nodeEnv: "test",
  port: 3000,
  appOrigin: "http://localhost:3000",
  databaseUrl: null,
  piiEncryptionKey: Buffer.alloc(32, 1),
  mercadoPagoEnvironment: null,
  mercadoPagoAccessToken: null,
  mercadoPagoPublicKey: null,
  mercadoPagoWebhookSecret: null,
  sessionTtlSeconds: 3600,
  maxItemQuantity: 100,
  reconciliationCooldownSeconds: 15,
  trustProxy: false,
  logLevel: "silent",
};

describe("Fastify application inject", () => {
  const fakeDb = {
    selectNoFrom: () => ({ executeTakeFirst: async () => ({ ready: 1 }) }),
  } as unknown as Kysely<Database>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ config, db: fakeDb, paymentProvider: null });
  });

  afterAll(async () => app.close());

  it("serves live/ready health and the Bootstrap assets from the same origin", async () => {
    const live = await app.inject({ method: "GET", url: "/health/live" });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: "ok" });

    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });

    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Faça seu pedido");
    expect(page.headers["content-security-policy"]).toContain("sdk.mercadopago.com");

    const bootstrap = await app.inject({ method: "GET", url: "/vendor/bootstrap/css/bootstrap.min.css" });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.headers["content-type"]).toContain("text/css");
  });
});
