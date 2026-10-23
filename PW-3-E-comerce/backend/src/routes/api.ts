import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { AppConfig } from "../config/env.js";
import type { Database } from "../database/types.js";
import { AppError, badRequest, forbidden } from "../domain/errors.js";
import { mercadoPagoIsConfigured } from "../config/env.js";
import { CatalogService, type CartLineInput } from "../services/catalog-service.js";
import { OrderService, type CreateOrderInput, type PaymentInput } from "../services/order-service.js";
import { PaymentService, type MercadoPagoWebhookPayload } from "../services/payment-service.js";
import { SessionService } from "../services/session-service.js";

const uuidPattern = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";

const CustomizationSchema = Type.Object({
  shirtName: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  jerseyNumber: Type.Optional(Type.String({ minLength: 1, maxLength: 12 })),
}, { additionalProperties: false });

const CartItemsSchema = Type.Array(Type.Object({
  variantId: Type.String({ pattern: uuidPattern }),
  quantity: Type.Integer({ minimum: 1, maximum: 100 }),
  customization: Type.Optional(CustomizationSchema),
}, { additionalProperties: false }), { minItems: 1, maxItems: 50 });

const PaymentInputSchema = Type.Object({
  token: Type.String({ minLength: 8, maxLength: 2048 }),
  paymentMethodId: Type.String({ minLength: 1, maxLength: 40, pattern: "^[a-zA-Z0-9_-]+$" }),
  paymentTypeId: Type.String({ minLength: 1, maxLength: 40 }),
  installments: Type.Integer({ minimum: 1, maximum: 36 }),
}, { additionalProperties: false });

const BuyerSchema = Type.Object({
  fullName: Type.String({ minLength: 3, maxLength: 120 }),
  cpf: Type.String({ minLength: 11, maxLength: 14 }),
  rg: Type.String({ minLength: 4, maxLength: 24 }),
  birthDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  phone: Type.String({ minLength: 8, maxLength: 24 }),
  email: Type.String({ minLength: 3, maxLength: 254 }),
  className: Type.String({ minLength: 1, maxLength: 80 }),
  modality: Type.String({ minLength: 1, maxLength: 80 }),
}, { additionalProperties: false });

const IdempotencyHeadersSchema = Type.Object({
  "idempotency-key": Type.String({ minLength: 16, maxLength: 128 }),
}, { additionalProperties: true });

export interface ApiRouteDependencies {
  config: AppConfig;
  db: Kysely<Database>;
  catalog: CatalogService;
  orders: OrderService;
  payments: PaymentService;
  sessions: SessionService;
}

export async function registerApiRoutes(app: FastifyInstance, dependencies: ApiRouteDependencies): Promise<void> {
  const { config, db, catalog, orders, payments, sessions } = dependencies;
  const sessionCookieName = config.nodeEnv === "production" ? "__Host-checkout_session" : "checkout_session";
  const csrfCookieName = config.nodeEnv === "production" ? "__Host-csrf_token" : "csrf_token";

  app.get("/api/config/payment", async () => ({
    publicKey: config.mercadoPagoPublicKey,
    environment: config.mercadoPagoEnvironment,
    available: mercadoPagoIsConfigured(config),
  }));

  app.get("/api/products", async () => ({
    products: await catalog.list(),
    checkoutOptions: await catalog.options(),
  }));

  app.get<{ Params: { code: string } }>("/api/products/:code", async (request, reply) => {
    const catalogResult = await catalog.list();
    const product = catalogResult.find((entry) => entry.code.toLowerCase() === request.params.code.toLowerCase());
    if (!product) return reply.code(404).send({ error: { code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado." }, requestId: request.id });
    return { product };
  });

  app.post("/api/checkout/session", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    assertOrigin(request, config);
    const session = await sessions.establish(request.cookies[sessionCookieName], request.cookies[csrfCookieName]);
    const secure = config.nodeEnv === "production";
    const common = { path: "/", secure, sameSite: "strict" as const, maxAge: config.sessionTtlSeconds };
    reply.setCookie(sessionCookieName, session.secret, { ...common, httpOnly: true, sameSite: "lax" });
    reply.setCookie(csrfCookieName, session.csrfToken, { ...common, httpOnly: false });
    return reply.code(200).send({ csrfToken: session.csrfToken, expiresInSeconds: config.sessionTtlSeconds });
  });

  app.post<{ Body: { items: CartLineInput[] } }>("/api/checkout/quote", {
    schema: { body: Type.Object({ items: CartItemsSchema }, { additionalProperties: false }) },
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request) => {
    const session = await requireWriteSession(request, sessions, config, sessionCookieName, csrfCookieName);
    void session;
    return orders.quote(request.body.items);
  });

  app.get("/api/checkout/current-order", async (request) => {
    const session = await sessions.requireSession(request.cookies[sessionCookieName]);
    return { order: await payments.getCurrentOrder(session.id) };
  });

  app.post<{ Body: CreateOrderInput }>("/api/orders", {
    schema: {
      headers: IdempotencyHeadersSchema,
      body: Type.Object({
        items: CartItemsSchema,
        buyer: BuyerSchema,
        quotedTotalCents: Type.String({ pattern: "^\\d{1,16}$" }),
        payment: PaymentInputSchema,
      }, { additionalProperties: false }),
    },
    config: { rateLimit: { max: 8, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const session = await requireWriteSession(request, sessions, config, sessionCookieName, csrfCookieName);
    const idempotencyKey = getIdempotencyKey(request);
    const order = await payments.createOrderAndPayment(session.id, idempotencyKey, request.body);
    return reply.code(201).send({ order });
  });

  app.get<{ Params: { publicId: string } }>("/api/orders/:publicId", {
    schema: { params: Type.Object({ publicId: Type.String({ minLength: 32, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }) }) },
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (request) => {
    const session = await sessions.requireSession(request.cookies[sessionCookieName]);
    return { order: await payments.getOrder(session.id, request.params.publicId) };
  });

  app.post<{ Params: { publicId: string }; Body: PaymentInput }>("/api/orders/:publicId/payment-attempts", {
    schema: {
      headers: IdempotencyHeadersSchema,
      params: Type.Object({ publicId: Type.String({ minLength: 32, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }) }),
      body: PaymentInputSchema,
    },
    config: { rateLimit: { max: 8, timeWindow: "1 minute" } },
  }, async (request) => {
    const session = await requireWriteSession(request, sessions, config, sessionCookieName, csrfCookieName);
    return {
      order: await payments.retryPayment(session.id, request.params.publicId, getIdempotencyKey(request), request.body),
    };
  });

  app.post<{ Querystring: { "data.id"?: string; type?: string }; Body: MercadoPagoWebhookPayload }>("/api/webhooks/mercadopago", {
    config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
    bodyLimit: 32 * 1024,
  }, async (request, reply) => {
    try {
      const result = await payments.receiveWebhook(
        request.body,
        request.query["data.id"],
        request.headers["x-signature"],
        request.headers["x-request-id"],
      );
      return reply.code(200).send({ received: true, outcome: result.outcome });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "PaymentProviderError") {
        const safeCode = "safeCode" in error && typeof error.safeCode === "string" ? error.safeCode : "WEBHOOK_ERROR";
        if (safeCode === "INVALID_WEBHOOK_SIGNATURE") throw new AppError(401, safeCode, "Notificação não autenticada.");
        throw new AppError(503, "WEBHOOK_RETRY", "Notificação temporariamente indisponível.");
      }
      throw error;
    }
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await db.selectNoFrom((eb) => eb.val(1).as("ready")).executeTakeFirst();
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });
}

async function requireWriteSession(
  request: FastifyRequest,
  sessions: SessionService,
  config: AppConfig,
  sessionCookieName: string,
  csrfCookieName: string,
) {
  assertOrigin(request, config);
  const session = await sessions.requireSession(request.cookies[sessionCookieName]);
  sessions.requireCsrf(session, request.cookies[csrfCookieName], getHeader(request, "x-csrf-token"));
  return session;
}

function assertOrigin(request: FastifyRequest, config: AppConfig): void {
  const origin = request.headers.origin;
  if (!origin) throw forbidden("ORIGIN_REQUIRED", "Não foi possível validar esta solicitação.");
  try {
    if (new URL(origin).origin !== config.appOrigin) throw new Error();
  } catch {
    throw forbidden("ORIGIN_NOT_ALLOWED", "Não foi possível validar esta solicitação.");
  }
}

function getIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || value.length < 16 || value.length > 128) {
    throw badRequest("IDEMPOTENCY_KEY_REQUIRED", "Atualize a página e tente novamente.");
  }
  return value;
}

function getHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
