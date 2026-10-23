import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiRoutes } from "../../backend/src/routes/api.js";
import type { AppConfig } from "../../backend/src/config/env.js";
import { CatalogService } from "../../backend/src/services/catalog-service.js";
import { OrderService } from "../../backend/src/services/order-service.js";
import { PaymentService } from "../../backend/src/services/payment-service.js";
import { SessionService } from "../../backend/src/services/session-service.js";

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

describe("API routes through Fastify inject", () => {
  let app: ReturnType<typeof Fastify>;
  const createOrderAndPayment = vi.fn();
  const quote = vi.fn();

  beforeEach(async () => {
    createOrderAndPayment.mockReset();
    quote.mockReset();
    createOrderAndPayment.mockResolvedValue({
      publicId: "RANDOM_PUBLIC_ORDER_REFERENCE_123456",
      orderStatus: "AWAITING_PAYMENT",
      paymentStatus: "PENDING",
      totalCents: "10000",
      currency: "BRL",
      items: [],
      payment: { installments: 1, paymentMethodId: "visa", installmentAmountCents: null, totalPaidAmountCents: null, actionUrl: null },
    });
    quote.mockResolvedValue({ totalCents: "10000", subtotalCents: "10000", currency: "BRL", items: [] });

    app = Fastify({ logger: false });
    await app.register(cookie);

    const fakeDb = {
      selectNoFrom: () => ({ executeTakeFirst: async () => ({ ready: 1 }) }),
    } as never;
    const catalog = { list: vi.fn().mockResolvedValue([]), options: vi.fn().mockResolvedValue({ classes: [], modalities: [] }) } as unknown as CatalogService;
    const orders = { quote } as unknown as OrderService;
    const payments = {
      createOrderAndPayment,
      retryPayment: vi.fn(),
      getOrder: vi.fn(),
      getCurrentOrder: vi.fn(),
      receiveWebhook: vi.fn(),
    } as unknown as PaymentService;
    const sessions = {
      establish: vi.fn().mockResolvedValue({ id: "session", csrfToken: "csrf-value", secret: "session-secret", newSecret: true, newCsrf: true }),
      requireSession: vi.fn().mockResolvedValue({ id: "session", csrfHash: Buffer.alloc(32) }),
      requireCsrf: vi.fn((session, cookieValue, headerValue) => {
        if (cookieValue !== "csrf-value" || headerValue !== "csrf-value") throw new Error("bad csrf");
      }),
    } as unknown as SessionService;

    await registerApiRoutes(app, { config, db: fakeDb, catalog, orders, payments, sessions });
    await app.ready();
  });

  afterEach(async () => app.close());

  it("serves only public payment configuration and active catalog data", async () => {
    const paymentConfig = await app.inject({ method: "GET", url: "/api/config/payment" });
    expect(paymentConfig.statusCode).toBe(200);
    expect(paymentConfig.json()).toEqual({ publicKey: null, environment: null, available: false });
    expect(paymentConfig.body).not.toContain("ACCESS_TOKEN");

    const catalog = await app.inject({ method: "GET", url: "/api/products" });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().products).toEqual([]);
  });

  it("validates product quotes server-side before payment", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/checkout/quote",
      headers: { origin: config.appOrigin, cookie: "checkout_session=session-secret; csrf_token=csrf-value", "x-csrf-token": "csrf-value", "content-type": "application/json" },
      payload: { items: [{ variantId: "10000000-0000-4000-8000-000000000001", quantity: 2 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(quote).toHaveBeenCalledOnce();
  });

  it("requires same-origin, CSRF and idempotency for order submission", async () => {
    const body = {
      items: [{ variantId: "10000000-0000-4000-8000-000000000001", quantity: 1 }],
      buyer: {
        fullName: "Teste Comprador", cpf: "52998224725", rg: "12345678", birthDate: "2001-01-01",
        phone: "11987654321", email: "buyer@example.com", className: "Turma", modality: "Modalidade",
      },
      quotedTotalCents: "10000",
      payment: { token: "card-token-from-brick", paymentMethodId: "visa", paymentTypeId: "credit_card", installments: 1 },
    };
    const denied = await app.inject({
      method: "POST", url: "/api/orders",
      headers: { origin: "https://attacker.invalid", cookie: "checkout_session=session-secret; csrf_token=csrf-value", "x-csrf-token": "csrf-value", "idempotency-key": "idempotency-key-test-001" },
      payload: body,
    });
    expect(denied.statusCode).toBe(403);
    expect(createOrderAndPayment).not.toHaveBeenCalled();

    const accepted = await app.inject({
      method: "POST", url: "/api/orders",
      headers: { origin: config.appOrigin, cookie: "checkout_session=session-secret; csrf_token=csrf-value", "x-csrf-token": "csrf-value", "idempotency-key": "idempotency-key-test-001" },
      payload: body,
    });
    expect(accepted.statusCode).toBe(201);
    expect(createOrderAndPayment).toHaveBeenCalledOnce();
    expect(createOrderAndPayment.mock.calls[0]?.[1]).toBe("idempotency-key-test-001");
  });

  it("ignores a client-supplied product price field", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/checkout/quote",
      headers: { origin: config.appOrigin, cookie: "checkout_session=session-secret; csrf_token=csrf-value", "x-csrf-token": "csrf-value", "content-type": "application/json" },
      payload: { items: [{ variantId: "10000000-0000-4000-8000-000000000001", quantity: 1, price: 1 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(quote).toHaveBeenCalledOnce();
    expect(quote.mock.calls[0]?.[0]).toEqual([
      { variantId: "10000000-0000-4000-8000-000000000001", quantity: 1 },
    ]);
  });
});
