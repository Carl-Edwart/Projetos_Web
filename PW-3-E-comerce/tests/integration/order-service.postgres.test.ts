import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../backend/src/database/db.js";
import type { Database } from "../../backend/src/database/types.js";
import { AppError } from "../../backend/src/domain/errors.js";
import { sha256 } from "../../backend/src/domain/crypto.js";
import type { AppConfig } from "../../backend/src/config/env.js";
import { OrderService } from "../../backend/src/services/order-service.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const config: AppConfig = {
  nodeEnv: "test",
  port: 3000,
  appOrigin: "http://localhost:3000",
  databaseUrl: databaseUrl ?? null,
  piiEncryptionKey: Buffer.alloc(32, 3),
  mercadoPagoEnvironment: null,
  mercadoPagoAccessToken: null,
  mercadoPagoPublicKey: null,
  mercadoPagoWebhookSecret: null,
  sessionTtlSeconds: 3600,
  maxItemQuantity: 100,
  reconciliationCooldownSeconds: 1,
  trustProxy: false,
  logLevel: "silent",
};

describe.skipIf(!databaseUrl)("order service with PostgreSQL", () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : null;
  const orderService = db ? new OrderService(db, config) : null;
  const prefix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const productId = randomUUID();
  const variantId = randomUUID();
  const sessionId = randomUUID();
  const createdOrderIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    if (!db) return;
    await db.insertInto("products").values({
      id: productId,
      code: `TEST-${prefix}`,
      name: "Fixture de integração",
      kind: "CAMISETA",
      description: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();
    await db.insertInto("product_variants").values({
      id: variantId,
      product_id: productId,
      variant_code: "TEST-M",
      display_name: "Variante de teste",
      attributes: JSON.stringify({ size: "TEST" }),
      price_cents: "2375",
      currency: "BRL",
      available_quantity: 4,
      is_available: true,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();
    await db.insertInto("checkout_sessions").values({
      id: sessionId,
      secret_hash: sha256(`secret-${prefix}`),
      csrf_hash: sha256(`csrf-${prefix}`),
      active_order_id: null,
      expires_at: new Date(Date.now() + 60 * 60_000),
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (createdPaymentIds.length) {
        await db.deleteFrom("payment_events").where("payment_id", "in", createdPaymentIds).execute();
        await db.deleteFrom("payments").where("id", "in", createdPaymentIds).execute();
      }
      if (createdOrderIds.length) {
        await db.deleteFrom("order_items").where("order_id", "in", createdOrderIds).execute();
        await db.deleteFrom("orders").where("id", "in", createdOrderIds).execute();
      }
      if (createdCustomerIds.length) await db.deleteFrom("customers").where("id", "in", createdCustomerIds).execute();
      await db.deleteFrom("checkout_sessions").where("id", "=", sessionId).execute();
      await db.deleteFrom("product_variants").where("id", "=", variantId).execute();
      await db.deleteFrom("products").where("id", "=", productId).execute();
    } finally {
      await db.destroy();
    }
  });

  it("rejects manipulated totals, reserved numbers and names, then snapshots and reserves the database price", async () => {
    if (!db || !orderService) return;
    const items = [{ variantId, quantity: 1, customization: { shirtName: "João Silva", jerseyNumber: "10" } }];
    const quote = await orderService.quote(items);
    expect(quote.totalCents).toBe("2375");

    await expect(orderService.quote([{
      variantId,
      quantity: 1,
      customization: { shirtName: "João Silva", jerseyNumber: "013" },
    }])).rejects.toMatchObject({ code: "RESTRICTED_NUMBER" });

    await expect(orderService.quote([{
      variantId,
      quantity: 1,
      customization: { shirtName: "Vóte em alguém", jerseyNumber: "10" },
    }])).rejects.toMatchObject({ code: "RESTRICTED_NAME" });

    const buyer = {
      fullName: "João Silva",
      cpf: "529.982.247-25",
      rg: "12.345.678-X",
      birthDate: "2001-08-16",
      phone: "(11) 98765-4321",
      email: "buyer@example.com",
      className: "Turma teste",
      modality: "Modalidade teste",
    };
    const payment = { token: "ephemeral-card-token", paymentMethodId: "visa", paymentTypeId: "credit_card", installments: 1 };
    const key = `idempotency-${prefix}-first`;

    await expect(orderService.createOrder(sessionId, key, {
      items, buyer, quotedTotalCents: "1", payment,
    })).rejects.toMatchObject({ code: "QUOTE_CHANGED" });

    const created = await orderService.createOrder(sessionId, key, {
      items, buyer, quotedTotalCents: quote.totalCents, payment,
    });
    expect(created.created).toBe(true);
    expect(created.providerInput?.amountCents).toBe(2375n);
    createdOrderIds.push(created.orderId);
    createdPaymentIds.push(created.paymentId);
    const storedOrder = await db.selectFrom("orders").selectAll().where("id", "=", created.orderId).executeTakeFirstOrThrow();
    const storedItem = await db.selectFrom("order_items").selectAll().where("order_id", "=", created.orderId).executeTakeFirstOrThrow();
    createdCustomerIds.push(storedOrder.customer_id);
    expect(storedOrder.total_cents).toBe("2375");
    expect(storedItem.unit_price_cents).toBe("2375");
    expect(storedItem.customization).toEqual({ shirtName: "João Silva", jerseyNumber: "10" });
    const customer = await db.selectFrom("customers").select(["cpf_ciphertext", "rg_ciphertext"]).where("id", "=", storedOrder.customer_id).executeTakeFirstOrThrow();
    expect(customer.cpf_ciphertext.includes(Buffer.from("52998224725"))).toBe(false);
    expect(customer.rg_ciphertext.includes(Buffer.from("12345678X"))).toBe(false);

    const duplicate = await orderService.createOrder(sessionId, key, {
      items, buyer, quotedTotalCents: quote.totalCents, payment,
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.orderId).toBe(created.orderId);
    const stock = await db.selectFrom("product_variants").select("available_quantity").where("id", "=", variantId).executeTakeFirstOrThrow();
    expect(stock.available_quantity).toBe(3);
  });

  it("approves only a matching accredited provider order and deduplicates webhook events", async () => {
    if (!db || !orderService) return;
    const order = await db.selectFrom("orders").selectAll().where("checkout_session_id", "=", sessionId).executeTakeFirstOrThrow();
    const payment = await db.selectFrom("payments").selectAll().where("order_id", "=", order.id).executeTakeFirstOrThrow();
    const approved = {
      orderId: "provider-order-test",
      externalReference: payment.external_reference,
      orderStatus: "processed",
      orderStatusDetail: "accredited",
      totalCents: 2375n,
      totalPaidCents: 2375n,
      currency: "BRL",
      paymentId: "provider-payment-test",
      paymentStatus: "processed",
      paymentStatusDetail: "accredited",
      paymentMethodId: "visa",
      installments: 1,
      installmentAmountCents: 2375n,
      redirectUrl: null,
    };
    await orderService.completeProviderAttempt(payment.id, approved);
    const settled = await db.selectFrom("orders").select(["status", "inventory_state"]).where("id", "=", order.id).executeTakeFirstOrThrow();
    expect(settled).toEqual({ status: "PAID", inventory_state: "SOLD" });

    const event = {
      eventId: `event-${prefix}`,
      resourceId: approved.orderId,
      action: "order.processed",
      eventType: "order",
      digest: Buffer.alloc(32, 4),
    };
    expect(await orderService.processWebhookSnapshot(approved, event)).toBe("processed");
    expect(await orderService.processWebhookSnapshot(approved, event)).toBe("duplicate");

    await orderService.completeProviderAttempt(payment.id, { ...approved, orderStatus: "processing", orderStatusDetail: "in_process" });
    const paymentAfterOutOfOrderEvent = await db.selectFrom("payments").select("status").where("id", "=", payment.id).executeTakeFirstOrThrow();
    expect(paymentAfterOutOfOrderEvent.status).toBe("APPROVED");
  });
});
