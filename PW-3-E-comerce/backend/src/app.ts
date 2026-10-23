import path from "node:path";
import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import type { Kysely } from "kysely";
import type { AppConfig } from "./config/env.js";
import { mercadoPagoIsConfigured } from "./config/env.js";
import type { Database } from "./database/types.js";
import { AppError } from "./domain/errors.js";
import { MercadoPagoProvider } from "./payments/mercadopago-provider.js";
import type { PaymentProvider } from "./payments/payment-provider.js";
import { registerApiRoutes } from "./routes/api.js";
import { CatalogService } from "./services/catalog-service.js";
import { OrderService } from "./services/order-service.js";
import { PaymentService } from "./services/payment-service.js";
import { SessionService } from "./services/session-service.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: Kysely<Database>;
  paymentProvider?: PaymentProvider | null;
}

export async function buildApp(options: BuildAppOptions) {
  const { config, db } = options;
  const provider = options.paymentProvider === undefined
    ? createProviderFromConfig(config)
    : options.paymentProvider;

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-csrf-token']", "req.body"],
        censor: "[REDACTED]",
      },
    },
    logController: new Fastify.LogController({ disableRequestLogging: true }),
    bodyLimit: 64 * 1024,
    requestTimeout: 20_000,
    trustProxy: config.trustProxy,
    routerOptions: { maxParamLength: 128 },
  });

  await app.register(cookie);
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'", "https://sdk.mercadopago.com", "https://*.mercadopago.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://*.mercadopago.com"],
        imgSrc: ["'self'", "data:", "https://*.mercadopago.com", "https://*.mlstatic.com"],
        fontSrc: ["'self'", "data:", "https://*.mlstatic.com"],
        connectSrc: ["'self'", "https://api.mercadopago.com", "https://*.mercadopago.com", "https://*.mlstatic.com"],
        frameSrc: ["'self'", "https://*.mercadopago.com", "https://*.mercadolibre.com", "https://*.mlstatic.com"],
        formAction: ["'self'", "https://*.mercadopago.com"],
        upgradeInsecureRequests: config.nodeEnv === "production" ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { global: true, max: 180, timeWindow: "1 minute" });

  const catalog = new CatalogService(db, config);
  const orders = new OrderService(db, config);
  const payments = new PaymentService(orders, provider, config, (code) => {
    app.log.warn({ code }, "payment provider operation failed");
  });
  const sessions = new SessionService(db, config);

  await registerApiRoutes(app, { config, db, catalog, orders, payments, sessions });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Rota não encontrada." }, requestId: request.id });
    }
    return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Página não encontrada." }, requestId: request.id });
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
        requestId: request.id,
      });
    }

    if ("validation" in error && error.validation) {
      return reply.code(400).send({
        error: { code: "INVALID_REQUEST", message: "Confira os dados informados." },
        requestId: request.id,
      });
    }

    const statusCode = typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
    if (statusCode >= 500) app.log.error({ requestId: request.id, code: "INTERNAL_ERROR" }, "request failed");
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 413 ? "REQUEST_TOO_LARGE" : statusCode === 429 ? "RATE_LIMITED" : "REQUEST_FAILED",
        message: statusCode === 429 ? "Muitas tentativas. Aguarde um momento e tente novamente." : "Não foi possível concluir a solicitação.",
      },
      requestId: request.id,
    });
  });

  const frontendRoot = path.resolve(process.cwd(), "frontend");
  const bootstrapRoot = path.resolve(process.cwd(), "node_modules/bootstrap/dist");
  await app.register(staticPlugin, { root: frontendRoot, prefix: "/", decorateReply: false, wildcard: false });
  await app.register(staticPlugin, { root: bootstrapRoot, prefix: "/vendor/bootstrap/", decorateReply: false, wildcard: false });

  return app;
}

function createProviderFromConfig(config: AppConfig): PaymentProvider | null {
  if (!mercadoPagoIsConfigured(config) || !config.mercadoPagoAccessToken || !config.mercadoPagoWebhookSecret) return null;
  return new MercadoPagoProvider(config.mercadoPagoAccessToken, config.mercadoPagoWebhookSecret);
}
