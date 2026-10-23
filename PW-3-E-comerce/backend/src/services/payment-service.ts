import { createHash } from "node:crypto";
import type { AppConfig } from "../config/env.js";
import { PaymentProviderError, type PaymentProvider } from "../payments/payment-provider.js";
import { unavailable, badRequest } from "../domain/errors.js";
import { isInFlightPayment } from "../domain/payment-state.js";
import type { CreateOrderInput, OrderService, PaymentInput, PublicOrder } from "./order-service.js";

export interface MercadoPagoWebhookPayload {
  id?: string | number;
  action?: string;
  type?: string;
  data?: { id?: string | number };
}

export class PaymentService {
  constructor(
    private readonly orderService: OrderService,
    private readonly provider: PaymentProvider | null,
    private readonly config: AppConfig,
    private readonly safeErrorCounter?: (code: string) => void,
  ) {}

  async createOrderAndPayment(sessionId: string, idempotencyKey: string, input: CreateOrderInput): Promise<PublicOrder> {
    if (!this.provider) throw unavailable("PAYMENTS_UNAVAILABLE", "O pagamento está temporariamente indisponível.");

    const created = await this.orderService.createOrder(sessionId, idempotencyKey, input);
    if (created.created && created.providerInput) await this.dispatch(created.paymentId, created.providerInput);
    return this.getOrder(sessionId, created.publicId);
  }

  async retryPayment(
    sessionId: string,
    publicId: string,
    idempotencyKey: string,
    input: PaymentInput,
  ): Promise<PublicOrder> {
    if (!this.provider) throw unavailable("PAYMENTS_UNAVAILABLE", "O pagamento está temporariamente indisponível.");

    const created = await this.orderService.createRetryAttempt(sessionId, publicId, idempotencyKey, input);
    if (created.created && created.providerInput) await this.dispatch(created.paymentId, created.providerInput);
    return this.getOrder(sessionId, publicId);
  }

  async getOrder(sessionId: string, publicId: string): Promise<PublicOrder> {
    const payment = await this.orderService.findPaymentForReconciliation(sessionId, publicId);
    if (this.provider && payment && isInFlightPayment(payment.status)) {
      const claimed = await this.orderService.claimReconciliation(payment.id, this.config.reconciliationCooldownSeconds);
      if (claimed) await this.reconcile(payment.id);
    }
    return this.orderService.publicOrder(sessionId, publicId);
  }

  async getCurrentOrder(sessionId: string): Promise<PublicOrder | null> {
    const publicId = await this.orderService.currentPublicId(sessionId);
    if (!publicId) return null;
    return this.getOrder(sessionId, publicId);
  }

  async receiveWebhook(
    payload: MercadoPagoWebhookPayload,
    queryDataId: string | undefined,
    signature: string | string[] | undefined,
    requestId: string | string[] | undefined,
  ): Promise<{ outcome: "processed" | "duplicate" | "ignored" }> {
    if (!this.provider) throw unavailable("WEBHOOK_NOT_CONFIGURED", "O webhook não está configurado.");
    if (payload.type !== "order") throw badRequest("UNSUPPORTED_WEBHOOK", "Tipo de notificação não suportado.");
    const bodyResourceId = payload.data?.id === undefined ? "" : String(payload.data.id);
    const resourceId = queryDataId ?? bodyResourceId;
    const eventId = payload.id === undefined ? "" : String(payload.id);
    if (!resourceId || resourceId.length > 120 || bodyResourceId !== resourceId || !eventId || eventId.length > 120) {
      throw badRequest("INVALID_WEBHOOK", "Notificação inválida.");
    }

    this.provider.validateWebhook({ signature, requestId, dataId: queryDataId });
    const snapshot = await this.provider.getOrder(resourceId);
    if (snapshot.orderId !== resourceId) throw badRequest("INVALID_WEBHOOK_RESOURCE", "Notificação inválida.");

    const action = typeof payload.action === "string" ? payload.action.slice(0, 80) : null;
    const digest = createHash("sha256")
      .update(`${eventId}\n${resourceId}\n${action ?? ""}\n${snapshot.orderStatus ?? ""}\n${snapshot.orderStatusDetail ?? ""}`)
      .digest();
    const outcome = await this.orderService.processWebhookSnapshot(snapshot, {
      eventId,
      resourceId,
      action,
      eventType: "order",
      digest,
    });
    return { outcome };
  }

  private async dispatch(paymentId: string, input: NonNullable<Awaited<ReturnType<OrderService["createOrder"]>>["providerInput"]>): Promise<void> {
    if (!this.provider) {
      await this.orderService.recordProviderFailure(paymentId, "ERROR", "PROVIDER_NOT_CONFIGURED");
      return;
    }

    try {
      const snapshot = await this.provider.createOrder(input);
      await this.orderService.completeProviderAttempt(paymentId, snapshot);
    } catch (error) {
      const providerError = error instanceof PaymentProviderError
        ? error
        : new PaymentProviderError("unknown", "PROVIDER_TEMPORARY_ERROR");
      const status = providerError.kind === "rejected"
        ? "REJECTED"
        : providerError.kind === "configuration"
          ? "ERROR"
          : "RECONCILING";
      this.safeErrorCounter?.(providerError.safeCode);
      await this.orderService.recordProviderFailure(paymentId, status, providerError.safeCode);
    }
  }

  private async reconcile(paymentId: string): Promise<void> {
    if (!this.provider) return;
    const internal = await this.orderService.paymentForReconciliation(paymentId);
    if (!internal || !isInFlightPayment(internal.status)) return;

    try {
      const snapshot = internal.provider_order_id
        ? await this.provider.getOrder(internal.provider_order_id)
        : await this.provider.searchByExternalReference(internal.external_reference, internal.created_at);
      if (snapshot) await this.orderService.completeProviderAttempt(paymentId, snapshot);
    } catch {
      this.safeErrorCounter?.("PROVIDER_RECONCILIATION_FAILED");
    }
  }
}
