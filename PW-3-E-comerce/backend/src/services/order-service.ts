import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { AppConfig } from "../config/env.js";
import type { Database } from "../database/types.js";
import { decryptJson, encryptJson, randomPublicId } from "../domain/crypto.js";
import { AppError, badRequest, conflict, notFound } from "../domain/errors.js";
import { canTransitionPayment, isInFlightPayment, mapProviderState, type LocalPaymentStatus } from "../domain/payment-state.js";
import { validateAndNormalizeBuyer, type BuyerInput, type NormalizedBuyer } from "../domain/buyer-validation.js";
import { CatalogRepository } from "../repositories/catalog-repository.js";
import { CatalogService, type CartLineInput, type PreparedCart, type PreparedCartLine } from "./catalog-service.js";
import type { CreateProviderOrderInput, ProviderPaymentSnapshot } from "../payments/payment-provider.js";

type DbTransaction = Transaction<Database>;

export interface PaymentInput {
  token: string;
  paymentMethodId: string;
  paymentTypeId: string;
  installments: number;
}

export interface CreateOrderInput {
  items: CartLineInput[];
  buyer: BuyerInput;
  quotedTotalCents: string;
  payment: PaymentInput;
}

export interface CreatedPaymentAttempt {
  orderId: string;
  paymentId: string;
  publicId: string;
  created: boolean;
  providerInput: CreateProviderOrderInput | null;
}

export interface PublicOrder {
  publicId: string;
  orderStatus: string;
  paymentStatus: string | null;
  totalCents: string;
  currency: string;
  createdAt: string;
  items: Array<{
    productCode: string;
    productName: string;
    variantCode: string;
    variantName: string;
    variantAttributes: Record<string, unknown>;
    quantity: number;
    unitPriceCents: string;
    lineTotalCents: string;
    customization: Record<string, string>;
  }>;
  payment: null | {
    installments: number;
    paymentMethodId: string | null;
    installmentAmountCents: string | null;
    totalPaidAmountCents: string | null;
    actionUrl: string | null;
  };
}

interface BuyerRecord {
  fullName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  phoneE164: string;
  email: string;
  className: string;
  modality: string;
}

interface PublicOrderQuery {
  orderId: string;
  publicId: string;
  orderStatus: string;
  totalCents: string;
  currency: string;
  createdAt: Date;
  inventoryState: string;
  checkoutSessionId: string;
  customerId: string;
}

export class OrderService {
  private readonly catalogRepository: CatalogRepository;
  private readonly catalogService: CatalogService;

  constructor(private readonly db: Kysely<Database>, private readonly config: AppConfig) {
    this.catalogRepository = new CatalogRepository(db);
    this.catalogService = new CatalogService(db, config);
  }

  async quote(items: CartLineInput[]) {
    const cart = await this.catalogService.prepareCart(items);
    return this.serializeCart(cart);
  }

  async createOrder(
    sessionId: string,
    idempotencyKey: string,
    input: CreateOrderInput,
  ): Promise<CreatedPaymentAttempt> {
    const buyer = validateAndNormalizeBuyer(input.buyer);
    validatePaymentInput(input.payment);

    const created = await this.db.transaction().execute(async (trx) => {
      const session = await trx.selectFrom("checkout_sessions").selectAll()
        .where("id", "=", sessionId).forUpdate().executeTakeFirst();
      if (!session || session.expires_at.getTime() <= Date.now()) throw notFound("CHECKOUT_SESSION_EXPIRED");

      const existing = await trx.selectFrom("orders")
        .innerJoin("payments", "payments.order_id", "orders.id")
        .select([
          "orders.id as order_id",
          "orders.public_id as public_id",
          "payments.id as payment_id",
        ])
        .where("orders.checkout_session_id", "=", sessionId)
        .where("orders.idempotency_key", "=", idempotencyKey)
        .orderBy("payments.created_at", "asc")
        .executeTakeFirst();
      if (existing) {
        return {
          orderId: existing.order_id,
          paymentId: existing.payment_id,
          publicId: existing.public_id,
          created: false,
          providerInput: null,
        };
      }

      if (session.active_order_id) {
        const active = await trx.selectFrom("orders").select(["id", "status"])
          .where("id", "=", session.active_order_id).executeTakeFirst();
        if (active && !["PAID", "CANCELLED", "EXPIRED", "REFUNDED"].includes(active.status)) {
          throw conflict("ORDER_ALREADY_IN_PROGRESS", "Já existe uma compra em andamento nesta sessão. Consulte o status antes de tentar novamente.");
        }
        await trx.updateTable("checkout_sessions").set({ active_order_id: null, updated_at: new Date() })
          .where("id", "=", sessionId).execute();
      }

      const cart = await this.catalogService.prepareCart(input.items, trx, true);
      if (input.quotedTotalCents !== cart.totalCents.toString()) {
        throw conflict("QUOTE_CHANGED", "O valor ou a disponibilidade mudou. Confira o resumo atualizado antes de pagar.");
      }
      await this.catalogService.assertBuyerOptions(buyer.className, buyer.modality, trx);
      await this.reservePreparedCart(trx, cart);

      const customerId = randomUUID();
      const orderId = randomUUID();
      const publicId = randomPublicId();
      const paymentId = randomUUID();
      const externalReference = randomPublicId();
      const providerIdempotencyKey = randomUUID();
      const now = new Date();

      await trx.insertInto("customers").values({
        id: customerId,
        full_name: buyer.fullName,
        cpf_ciphertext: encryptJson({ value: buyer.cpf }, this.requireEncryptionKey()),
        rg_ciphertext: encryptJson({ value: buyer.rg }, this.requireEncryptionKey()),
        encryption_key_version: 1,
        birth_date: buyer.birthDate,
        phone_e164: buyer.phoneE164,
        email: buyer.email,
        class_name: buyer.className,
        modality: buyer.modality,
        created_at: now,
      }).execute();

      await trx.insertInto("orders").values({
        id: orderId,
        public_id: publicId,
        checkout_session_id: sessionId,
        customer_id: customerId,
        idempotency_key: idempotencyKey,
        status: "AWAITING_PAYMENT",
        currency: "BRL",
        subtotal_cents: cart.subtotalCents.toString(),
        total_cents: cart.totalCents.toString(),
        inventory_state: "RESERVED",
        expires_at: null,
        created_at: now,
        updated_at: now,
        paid_at: null,
      }).execute();

      await trx.insertInto("order_items").values(cart.lines.map((line) => ({
        id: randomUUID(),
        order_id: orderId,
        product_id: line.variant.product_id,
        variant_id: line.variant.id,
        product_code_snapshot: line.variant.product_code,
        product_name_snapshot: line.variant.product_name,
        variant_code_snapshot: line.variant.variant_code,
        variant_name_snapshot: line.variant.display_name,
        variant_attributes_snapshot: JSON.stringify(line.variant.attributes),
        customization: JSON.stringify(line.customization),
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents.toString(),
        line_total_cents: line.lineTotalCents.toString(),
        created_at: now,
      }))).execute();

      await trx.insertInto("payments").values({
        id: paymentId,
        order_id: orderId,
        provider: "mercadopago",
        status: "SUBMITTING",
        amount_cents: cart.totalCents.toString(),
        currency: "BRL",
        installments: input.payment.installments,
        payment_method_id: input.payment.paymentMethodId,
        external_reference: externalReference,
        client_idempotency_key: idempotencyKey,
        provider_idempotency_key: providerIdempotencyKey,
        provider_order_id: null,
        provider_payment_id: null,
        provider_status: null,
        provider_status_detail: null,
        installment_amount_cents: null,
        total_paid_amount_cents: null,
        action_url_ciphertext: null,
        error_code: null,
        created_at: now,
        updated_at: now,
        settled_at: null,
        last_reconciled_at: null,
      }).execute();

      await trx.updateTable("checkout_sessions").set({ active_order_id: orderId, updated_at: now })
        .where("id", "=", sessionId).execute();

      return {
        orderId,
        paymentId,
        publicId,
        created: true,
        providerInput: this.buildProviderInput(cart, buyer, input.payment, externalReference, providerIdempotencyKey),
      };
    });

    return created;
  }

  async createRetryAttempt(
    sessionId: string,
    publicId: string,
    idempotencyKey: string,
    paymentInput: PaymentInput,
  ): Promise<CreatedPaymentAttempt> {
    validatePaymentInput(paymentInput);

    return this.db.transaction().execute(async (trx) => {
      const order = await trx.selectFrom("orders").selectAll()
        .where("public_id", "=", publicId)
        .where("checkout_session_id", "=", sessionId)
        .forUpdate()
        .executeTakeFirst();
      if (!order) throw notFound();

      const existingAttempt = await trx.selectFrom("payments")
        .select(["id", "order_id"])
        .where("client_idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();
      if (existingAttempt) {
        return {
          orderId: order.id,
          paymentId: existingAttempt.id,
          publicId,
          created: false,
          providerInput: null,
        };
      }
      if (order.status !== "AWAITING_PAYMENT") throw conflict("ORDER_NOT_PAYABLE", "Este pedido não aceita novas tentativas de pagamento.");

      const previous = await trx.selectFrom("payments").selectAll()
        .where("order_id", "=", order.id).orderBy("created_at", "desc").executeTakeFirst();
      if (!previous || isInFlightPayment(previous.status)) {
        throw conflict("PAYMENT_IN_PROGRESS", "Ainda estamos verificando a tentativa anterior. Aguarde a atualização do pedido.");
      }

      const latestBuyer = await trx.selectFrom("customers").select([
        "full_name", "cpf_ciphertext", "rg_ciphertext", "birth_date", "phone_e164", "email", "class_name", "modality",
      ])
        .where("id", "=", order.customer_id).executeTakeFirstOrThrow();
      const buyer: NormalizedBuyer = {
        fullName: latestBuyer.full_name,
        cpf: decryptJson<{ value: string }>(latestBuyer.cpf_ciphertext, this.requireEncryptionKey()).value,
        rg: decryptJson<{ value: string }>(latestBuyer.rg_ciphertext, this.requireEncryptionKey()).value,
        birthDate: latestBuyer.birth_date,
        phoneE164: latestBuyer.phone_e164,
        email: latestBuyer.email,
        className: latestBuyer.class_name,
        modality: latestBuyer.modality,
      };
      const lines = await trx.selectFrom("order_items").selectAll()
        .where("order_id", "=", order.id).orderBy("created_at").execute();

      if (order.inventory_state === "RELEASED") await this.reserveExistingOrder(trx, order.id);

      const paymentId = randomUUID();
      const externalReference = randomPublicId();
      const providerIdempotencyKey = randomUUID();
      const now = new Date();
      await trx.insertInto("payments").values({
        id: paymentId,
        order_id: order.id,
        provider: "mercadopago",
        status: "SUBMITTING",
        amount_cents: order.total_cents,
        currency: order.currency,
        installments: paymentInput.installments,
        payment_method_id: paymentInput.paymentMethodId,
        external_reference: externalReference,
        client_idempotency_key: idempotencyKey,
        provider_idempotency_key: providerIdempotencyKey,
        provider_order_id: null,
        provider_payment_id: null,
        provider_status: null,
        provider_status_detail: null,
        installment_amount_cents: null,
        total_paid_amount_cents: null,
        action_url_ciphertext: null,
        error_code: null,
        created_at: now,
        updated_at: now,
        settled_at: null,
        last_reconciled_at: null,
      }).execute();

      return {
        orderId: order.id,
        paymentId,
        publicId,
        created: true,
        providerInput: this.buildProviderInputFromSnapshots(
          BigInt(order.total_cents), buyer, paymentInput, lines, externalReference, providerIdempotencyKey,
        ),
      };
    });
  }

  async publicOrder(sessionId: string, publicId: string): Promise<PublicOrder> {
    const order = await this.db.selectFrom("orders")
      .select([
        "id as orderId",
        "public_id as publicId",
        "status as orderStatus",
        "total_cents as totalCents",
        "currency",
        "created_at as createdAt",
        "inventory_state as inventoryState",
        "checkout_session_id as checkoutSessionId",
        "customer_id as customerId",
      ])
      .where("public_id", "=", publicId)
      .where("checkout_session_id", "=", sessionId)
      .executeTakeFirst();
    if (!order) throw notFound();
    return this.serializePublicOrder(order);
  }

  async currentPublicId(sessionId: string): Promise<string | null> {
    const session = await this.db.selectFrom("checkout_sessions").select("active_order_id")
      .where("id", "=", sessionId).executeTakeFirst();
    if (!session?.active_order_id) return null;
    const order = await this.db.selectFrom("orders").select("public_id")
      .where("id", "=", session.active_order_id).where("checkout_session_id", "=", sessionId)
      .executeTakeFirst();
    return order?.public_id ?? null;
  }

  async findPaymentForReconciliation(sessionId: string, publicId: string) {
    const order = await this.db.selectFrom("orders")
      .select(["id", "checkout_session_id"])
      .where("public_id", "=", publicId)
      .where("checkout_session_id", "=", sessionId)
      .executeTakeFirst();
    if (!order) throw notFound();
    return this.db.selectFrom("payments").selectAll()
      .where("order_id", "=", order.id).orderBy("created_at", "desc").executeTakeFirst();
  }

  async paymentForReconciliation(paymentId: string) {
    return this.db.selectFrom("payments").select([
      "id",
      "status",
      "external_reference",
      "provider_order_id",
      "created_at",
    ]).where("id", "=", paymentId).executeTakeFirst();
  }

  async claimReconciliation(paymentId: string, cooldownSeconds: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
    const result = await this.db.updateTable("payments")
      .set({ last_reconciled_at: new Date(), updated_at: new Date() })
      .where("id", "=", paymentId)
      .where((eb) => eb.or([
        eb("last_reconciled_at", "is", null),
        eb("last_reconciled_at", "<", cutoff),
      ]))
      .returning("id")
      .executeTakeFirst();
    return Boolean(result);
  }

  async completeProviderAttempt(paymentId: string, snapshot: ProviderPaymentSnapshot): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const payment = await trx.selectFrom("payments").selectAll()
        .where("id", "=", paymentId).forUpdate().executeTakeFirst();
      if (!payment) return;
      const order = await trx.selectFrom("orders").selectAll()
        .where("id", "=", payment.order_id).forUpdate().executeTakeFirstOrThrow();

      if (snapshot.externalReference !== payment.external_reference || !snapshot.orderId) {
        await trx.updateTable("payments").set({
          status: "RECONCILING",
          error_code: "PROVIDER_RESPONSE_MISMATCH",
          updated_at: new Date(),
          last_reconciled_at: new Date(),
        }).where("id", "=", payment.id).execute();
        return;
      }

      if (!snapshotMatchesPayment(snapshot, BigInt(payment.amount_cents))) {
        await trx.updateTable("payments").set({
          status: "RECONCILING",
          provider_order_id: snapshot.orderId,
          provider_status: safeProviderStatus(snapshot.orderStatus),
          provider_status_detail: safeProviderStatus(snapshot.orderStatusDetail),
          error_code: "PROVIDER_AMOUNT_MISMATCH",
          updated_at: new Date(),
          last_reconciled_at: new Date(),
        }).where("id", "=", payment.id).execute();
        return;
      }

      await this.applySnapshotInTransaction(trx, order.id, payment.id, snapshot);
    });
  }

  async processWebhookSnapshot(
    snapshot: ProviderPaymentSnapshot,
    event: { eventId: string; resourceId: string; action: string | null; eventType: string; digest: Buffer },
  ): Promise<"processed" | "duplicate" | "ignored"> {
    return this.db.transaction().execute(async (trx) => {
      const inserted = await trx.insertInto("payment_events").values({
        id: randomUUID(),
        payment_id: null,
        provider: "mercadopago",
        event_id: event.eventId,
        resource_id: event.resourceId,
        action: event.action,
        event_type: event.eventType,
        payload_digest: event.digest,
        safe_summary: JSON.stringify({
          status: safeProviderStatus(snapshot.orderStatus),
          statusDetail: safeProviderStatus(snapshot.orderStatusDetail),
          totalCents: snapshot.totalCents?.toString() ?? null,
          currency: snapshot.currency,
        }),
        received_at: new Date(),
        processed_at: null,
        processing_error_code: null,
      }).onConflict((oc) => oc.doNothing()).returning("id").executeTakeFirst();

      if (!inserted) return "duplicate";
      const payment = snapshot.externalReference
        ? await trx.selectFrom("payments").selectAll()
            .where("external_reference", "=", snapshot.externalReference).forUpdate().executeTakeFirst()
        : undefined;

      if (!payment) {
        await trx.updateTable("payment_events").set({
          processing_error_code: "UNKNOWN_EXTERNAL_REFERENCE",
          processed_at: new Date(),
        }).where("id", "=", inserted.id).execute();
        return "ignored";
      }

      await trx.updateTable("payment_events").set({ payment_id: payment.id })
        .where("id", "=", inserted.id).execute();

      const order = await trx.selectFrom("orders").selectAll()
        .where("id", "=", payment.order_id).forUpdate().executeTakeFirstOrThrow();
      if (snapshotMatchesPayment(snapshot, BigInt(payment.amount_cents))) {
        await this.applySnapshotInTransaction(trx, order.id, payment.id, snapshot);
        await trx.updateTable("payment_events").set({ processed_at: new Date() })
          .where("id", "=", inserted.id).execute();
        return "processed";
      }

      await trx.updateTable("payments").set({
        status: "RECONCILING",
        provider_order_id: snapshot.orderId || payment.provider_order_id,
        error_code: "PROVIDER_AMOUNT_MISMATCH",
        updated_at: new Date(),
      }).where("id", "=", payment.id).execute();
      await trx.updateTable("payment_events").set({
        processing_error_code: "PROVIDER_AMOUNT_MISMATCH",
        processed_at: new Date(),
      }).where("id", "=", inserted.id).execute();
      return "processed";
    });
  }

  async recordProviderFailure(paymentId: string, status: "REJECTED" | "ERROR" | "RECONCILING", code: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const payment = await trx.selectFrom("payments").selectAll()
        .where("id", "=", paymentId).forUpdate().executeTakeFirst();
      if (!payment) return;
      const order = await trx.selectFrom("orders").selectAll()
        .where("id", "=", payment.order_id).forUpdate().executeTakeFirstOrThrow();
      if (!canTransitionPayment(payment.status, status)) return;

      await trx.updateTable("payments").set({
        status,
        error_code: code,
        updated_at: new Date(),
        last_reconciled_at: status === "RECONCILING" ? null : new Date(),
      }).where("id", "=", payment.id).execute();

      if (status !== "RECONCILING" && order.inventory_state === "RESERVED") {
        await this.releaseInventory(trx, order.id);
      }
    });
  }

  private async applySnapshotInTransaction(
    trx: DbTransaction,
    orderId: string,
    paymentId: string,
    snapshot: ProviderPaymentSnapshot,
  ): Promise<void> {
    const payment = await trx.selectFrom("payments").selectAll().where("id", "=", paymentId).forUpdate().executeTakeFirstOrThrow();
    const order = await trx.selectFrom("orders").selectAll().where("id", "=", orderId).forUpdate().executeTakeFirstOrThrow();
    const mapped = mapProviderState(snapshot);
    const nextStatus = canTransitionPayment(payment.status, mapped.paymentStatus)
      ? mapped.paymentStatus
      : payment.status as LocalPaymentStatus;
    const now = new Date();
    const actionUrlCiphertext = snapshot.redirectUrl
      ? encryptJson({ url: snapshot.redirectUrl }, this.requireEncryptionKey())
      : payment.action_url_ciphertext;

    await trx.updateTable("payments").set({
      status: nextStatus,
      provider_order_id: snapshot.orderId,
      provider_payment_id: snapshot.paymentId,
      provider_status: safeProviderStatus(snapshot.orderStatus),
      provider_status_detail: safeProviderStatus(snapshot.orderStatusDetail),
      payment_method_id: snapshot.paymentMethodId ?? payment.payment_method_id,
      installment_amount_cents: snapshot.installmentAmountCents?.toString() ?? payment.installment_amount_cents,
      total_paid_amount_cents: snapshot.totalPaidCents?.toString() ?? payment.total_paid_amount_cents,
      action_url_ciphertext: actionUrlCiphertext,
      error_code: nextStatus === "RECONCILING" ? payment.error_code : null,
      updated_at: now,
      last_reconciled_at: now,
      settled_at: ["APPROVED", "REFUNDED", "PARTIALLY_REFUNDED", "CHARGEDBACK"].includes(nextStatus)
        ? payment.settled_at ?? now
        : payment.settled_at,
    }).where("id", "=", payment.id).execute();

    if (nextStatus === "APPROVED") {
      await trx.updateTable("orders").set({ status: "PAID", inventory_state: "SOLD", paid_at: order.paid_at ?? now, updated_at: now })
        .where("id", "=", order.id).execute();
      return;
    }
    if (nextStatus === "PARTIALLY_REFUNDED") {
      await trx.updateTable("orders").set({ status: "PARTIALLY_REFUNDED", updated_at: now }).where("id", "=", order.id).execute();
      return;
    }
    if (nextStatus === "REFUNDED") {
      await trx.updateTable("orders").set({ status: "REFUNDED", updated_at: now }).where("id", "=", order.id).execute();
      return;
    }
    if (nextStatus === "CHARGEDBACK") {
      await trx.updateTable("orders").set({ status: "DISPUTED", updated_at: now }).where("id", "=", order.id).execute();
      return;
    }
    if (nextStatus === "CANCELLED" || nextStatus === "EXPIRED") {
      await trx.updateTable("orders").set({ status: nextStatus, updated_at: now }).where("id", "=", order.id).execute();
      await this.releaseInventory(trx, order.id);
      return;
    }
    if (nextStatus === "REJECTED" || nextStatus === "ERROR") {
      await this.releaseInventory(trx, order.id);
    }
  }

  private async reservePreparedCart(trx: DbTransaction, cart: PreparedCart): Promise<void> {
    const totals = aggregateQuantities(cart.lines);
    for (const [variantId, quantity] of totals) {
      const variant = cart.lines.find((line) => line.variant.id === variantId)!.variant;
      if (variant.available_quantity !== null) {
        await trx.updateTable("product_variants")
          .set((eb) => ({ available_quantity: eb("available_quantity", "-", quantity), updated_at: new Date() }))
          .where("id", "=", variantId).where("available_quantity", "is not", null).execute();
      }
    }
  }

  private async reserveExistingOrder(trx: DbTransaction, orderId: string): Promise<void> {
    const order = await trx.selectFrom("orders").select(["inventory_state"])
      .where("id", "=", orderId).forUpdate().executeTakeFirstOrThrow();
    if (order.inventory_state === "RESERVED" || order.inventory_state === "SOLD") return;

    const rows = await trx.selectFrom("order_items").select(["variant_id", "quantity"])
      .where("order_id", "=", orderId).execute();
    const quantities = new Map<string, number>();
    for (const row of rows) quantities.set(row.variant_id, (quantities.get(row.variant_id) ?? 0) + row.quantity);
    const variants = await this.catalogRepository.getVariants([...quantities.keys()], trx, true);
    const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

    for (const [variantId, quantity] of quantities) {
      const variant = variantsById.get(variantId);
      if (!variant || !variant.product_is_active || !variant.is_active || !variant.is_available) {
        throw conflict("ITEM_UNAVAILABLE", "Um dos itens selecionados não está mais disponível.");
      }
      if (variant.available_quantity !== null && variant.available_quantity < quantity) {
        throw conflict("INSUFFICIENT_STOCK", "A quantidade disponível de um item foi alterada. Confira sua compra.");
      }
      if (variant.available_quantity !== null) {
        await trx.updateTable("product_variants")
          .set((eb) => ({ available_quantity: eb("available_quantity", "-", quantity), updated_at: new Date() }))
          .where("id", "=", variantId).execute();
      }
    }
    await trx.updateTable("orders").set({ inventory_state: "RESERVED", updated_at: new Date() }).where("id", "=", orderId).execute();
  }

  private async releaseInventory(trx: DbTransaction, orderId: string): Promise<void> {
    const order = await trx.selectFrom("orders").select(["inventory_state"])
      .where("id", "=", orderId).forUpdate().executeTakeFirst();
    if (!order || order.inventory_state !== "RESERVED") return;

    const rows = await trx.selectFrom("order_items").select(["variant_id", "quantity"])
      .where("order_id", "=", orderId).execute();
    const quantities = new Map<string, number>();
    for (const row of rows) quantities.set(row.variant_id, (quantities.get(row.variant_id) ?? 0) + row.quantity);

    for (const [variantId, quantity] of quantities) {
      await trx.updateTable("product_variants")
        .set((eb) => ({ available_quantity: eb("available_quantity", "+", quantity), updated_at: new Date() }))
        .where("id", "=", variantId).where("available_quantity", "is not", null).execute();
    }
    await trx.updateTable("orders").set({ inventory_state: "RELEASED", updated_at: new Date() }).where("id", "=", orderId).execute();
  }

  private buildProviderInput(
    cart: PreparedCart,
    buyer: NormalizedBuyer,
    payment: PaymentInput,
    externalReference: string,
    idempotencyKey: string,
  ): CreateProviderOrderInput {
    return {
      amountCents: cart.totalCents,
      externalReference,
      idempotencyKey,
      payer: payerForProvider(buyer),
      token: payment.token,
      paymentMethodId: payment.paymentMethodId,
      installments: payment.installments,
      items: cart.lines.map((line) => providerItem(line)),
    };
  }

  private buildProviderInputFromSnapshots(
    amountCents: bigint,
    buyer: NormalizedBuyer,
    payment: PaymentInput,
    lines: Array<{
      product_name_snapshot: string;
      product_code_snapshot: string;
      variant_name_snapshot: string;
      variant_code_snapshot: string;
      quantity: number;
      unit_price_cents: string;
    }>,
    externalReference: string,
    idempotencyKey: string,
  ): CreateProviderOrderInput {
    return {
      amountCents,
      externalReference,
      idempotencyKey,
      payer: payerForProvider(buyer),
      token: payment.token,
      paymentMethodId: payment.paymentMethodId,
      installments: payment.installments,
      items: lines.map((line) => ({
        title: `${line.product_name_snapshot} — ${line.variant_name_snapshot}`,
        code: `${line.product_code_snapshot}-${line.variant_code_snapshot}`,
        unitPriceCents: BigInt(line.unit_price_cents),
        quantity: line.quantity,
      })),
    };
  }

  private async serializePublicOrder(order: PublicOrderQuery): Promise<PublicOrder> {
    const [items, latestPayment] = await Promise.all([
      this.db.selectFrom("order_items").selectAll().where("order_id", "=", order.orderId).orderBy("created_at").execute(),
      this.db.selectFrom("payments").selectAll().where("order_id", "=", order.orderId).orderBy("created_at", "desc").executeTakeFirst(),
    ]);

    const output: PublicOrder = {
      publicId: order.publicId,
      orderStatus: order.orderStatus,
      paymentStatus: latestPayment?.status ?? null,
      totalCents: String(order.totalCents),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      items: items.map((item) => ({
        productCode: item.product_code_snapshot,
        productName: item.product_name_snapshot,
        variantCode: item.variant_code_snapshot,
        variantName: item.variant_name_snapshot,
        variantAttributes: item.variant_attributes_snapshot,
        quantity: item.quantity,
        unitPriceCents: String(item.unit_price_cents),
        lineTotalCents: String(item.line_total_cents),
        customization: item.customization as Record<string, string>,
      })),
      payment: latestPayment ? {
        installments: latestPayment.installments,
        paymentMethodId: latestPayment.payment_method_id,
        installmentAmountCents: latestPayment.installment_amount_cents === null ? null : String(latestPayment.installment_amount_cents),
        totalPaidAmountCents: latestPayment.total_paid_amount_cents === null ? null : String(latestPayment.total_paid_amount_cents),
        actionUrl: latestPayment.action_url_ciphertext
          ? decryptJson<{ url: string }>(latestPayment.action_url_ciphertext, this.requireEncryptionKey()).url
          : null,
      } : null,
    };
    return output;
  }

  private serializeCart(cart: PreparedCart) {
    return {
      currency: "BRL",
      subtotalCents: cart.subtotalCents.toString(),
      totalCents: cart.totalCents.toString(),
      items: cart.lines.map((line) => ({
        variantId: line.variant.id,
        productCode: line.variant.product_code,
        productName: line.variant.product_name,
        productKind: line.variant.product_kind,
        variantCode: line.variant.variant_code,
        variantName: line.variant.display_name,
        variantAttributes: line.variant.attributes,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents.toString(),
        lineTotalCents: line.lineTotalCents.toString(),
        customization: line.customization,
      })),
    };
  }

  private requireEncryptionKey(): Buffer {
    if (!this.config.piiEncryptionKey) throw new AppError(503, "PII_ENCRYPTION_UNAVAILABLE", "O checkout está temporariamente indisponível.");
    return this.config.piiEncryptionKey;
  }
}

export function validatePaymentInput(input: PaymentInput): void {
  if (typeof input.token !== "string" || input.token.length < 8 || input.token.length > 2048) {
    throw badRequest("INVALID_PAYMENT_TOKEN", "Não foi possível validar o cartão. Confira os dados e tente novamente.");
  }
  if (typeof input.paymentMethodId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/u.test(input.paymentMethodId)) {
    throw badRequest("INVALID_PAYMENT_METHOD", "Selecione uma forma de pagamento válida.");
  }
  if (input.paymentTypeId !== "credit_card") {
    throw badRequest("UNSUPPORTED_PAYMENT_METHOD", "No momento, aceitamos cartão de crédito.");
  }
  if (!Number.isSafeInteger(input.installments) || input.installments < 1 || input.installments > 36) {
    throw badRequest("INVALID_INSTALLMENTS", "Selecione uma quantidade de parcelas válida.");
  }
}

export function snapshotMatchesPayment(snapshot: ProviderPaymentSnapshot, amountCents: bigint): boolean {
  if (!snapshot.orderId || !snapshot.externalReference || snapshot.totalCents === null) return false;
  if (snapshot.totalCents !== amountCents) return false;
  if (snapshot.currency !== "BRL") return false;
  return true;
}

export function safeProviderStatus(value: string | null): string | null {
  if (!value) return null;
  return /^[a-zA-Z0-9_-]{1,80}$/u.test(value) ? value : null;
}

function aggregateQuantities(lines: PreparedCartLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.variant.id, (totals.get(line.variant.id) ?? 0) + line.quantity);
  return totals;
}

function payerForProvider(buyer: NormalizedBuyer): CreateProviderOrderInput["payer"] {
  const nameParts = buyer.fullName.split(" ").filter(Boolean);
  const firstName = nameParts[0] ?? buyer.fullName;
  const lastName = nameParts.slice(1).join(" ") || firstName;
  const phoneDigits = buyer.phoneE164.replace(/^\+55/u, "");
  return {
    email: buyer.email,
    firstName,
    lastName,
    cpf: buyer.cpf,
    phoneAreaCode: phoneDigits.slice(0, 2),
    phoneNumber: phoneDigits.slice(2),
  };
}

function providerItem(line: PreparedCartLine): CreateProviderOrderInput["items"][number] {
  return {
    title: `${line.variant.product_name} — ${line.variant.display_name}`,
    code: `${line.variant.product_code}-${line.variant.variant_code}`,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
  };
}
