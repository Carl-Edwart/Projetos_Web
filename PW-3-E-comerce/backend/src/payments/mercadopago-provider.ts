import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  MPAuthenticationError,
  MPBadRequestError,
  MPForbiddenError,
  MPValidationError,
  Order,
  WebhookSignatureValidator,
} from "mercadopago";
import { decimalToCents, centsToDecimal } from "../domain/money.js";
import type {
  CreateProviderOrderInput,
  PaymentProvider,
  ProviderPaymentSnapshot,
} from "./payment-provider.js";
import { PaymentProviderError } from "./payment-provider.js";

type UnknownRecord = Record<string, unknown>;

export class MercadoPagoProvider implements PaymentProvider {
  private readonly orderClient: Order;
  private readonly webhookSecret: string;

  constructor(accessToken: string, webhookSecret: string) {
    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 8_000 } });
    this.orderClient = new Order(client);
    this.webhookSecret = webhookSecret;
  }

  async createOrder(input: CreateProviderOrderInput): Promise<ProviderPaymentSnapshot> {
    try {
      const response = await this.orderClient.create({
        body: {
          type: "online",
          processing_mode: "automatic",
          total_amount: centsToDecimal(input.amountCents),
          currency: "BRL",
          external_reference: input.externalReference,
          description: "Compra online",
          payer: {
            email: input.payer.email,
            entity_type: "individual",
            first_name: input.payer.firstName,
            last_name: input.payer.lastName,
            identification: { type: "CPF", number: input.payer.cpf },
            phone: { area_code: input.payer.phoneAreaCode, number: input.payer.phoneNumber },
          },
          items: input.items.map((item) => ({
            title: item.title.slice(0, 120),
            unit_price: centsToDecimal(item.unitPriceCents),
            quantity: item.quantity,
            external_code: item.code.slice(0, 80),
            unit_measure: "unit",
          })),
          transactions: {
            payments: [{
              amount: centsToDecimal(input.amountCents),
              payment_method: {
                id: input.paymentMethodId,
                type: "credit_card",
                token: input.token,
                installments: input.installments,
              },
            }],
          },
        },
        requestOptions: { idempotencyKey: input.idempotencyKey },
      });
      return toSnapshot(response as unknown as UnknownRecord);
    } catch (error) {
      throw translateProviderError(error);
    }
  }

  async getOrder(id: string): Promise<ProviderPaymentSnapshot> {
    try {
      const response = await this.orderClient.get({ id });
      return toSnapshot(response as unknown as UnknownRecord);
    } catch (error) {
      throw translateProviderError(error);
    }
  }

  async searchByExternalReference(reference: string, createdAt: Date): Promise<ProviderPaymentSnapshot | null> {
    const beginDate = new Date(createdAt.getTime() - 5 * 60_000).toISOString();
    const endDate = new Date(Date.now() + 5 * 60_000).toISOString();
    try {
      const response = await this.orderClient.search({
        options: {
          begin_date: beginDate,
          end_date: endDate,
          external_reference: reference,
          type: "online",
          page: 1,
          page_size: 10,
        },
      });
      const orders = response.data ?? [];
      const matching = orders.find((order) => order.external_reference === reference);
      return matching ? toSnapshot(matching as unknown as UnknownRecord) : null;
    } catch (error) {
      throw translateProviderError(error);
    }
  }

  validateWebhook(input: {
    signature: string | string[] | undefined;
    requestId: string | string[] | undefined;
    dataId: string | string[] | undefined;
  }): void {
    if (!this.webhookSecret) throw new PaymentProviderError("configuration", "WEBHOOK_NOT_CONFIGURED");
    try {
      WebhookSignatureValidator.validate({
        xSignature: input.signature,
        xRequestId: input.requestId,
        dataId: input.dataId,
        secret: this.webhookSecret,
        toleranceSeconds: 300,
        supportedVersions: ["v1"],
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        throw new PaymentProviderError("rejected", "INVALID_WEBHOOK_SIGNATURE");
      }
      throw new PaymentProviderError("rejected", "INVALID_WEBHOOK_SIGNATURE");
    }
  }
}

function toSnapshot(order: UnknownRecord): ProviderPaymentSnapshot {
  const transactions = record(order.transactions);
  const payments = Array.isArray(transactions.payments) ? transactions.payments : [];
  const payment = record(payments[0]);
  const paymentMethod = record(payment.payment_method);
  const security = record(paymentMethod.transaction_security);
  const totalCents = decimalToCents(order.total_amount);
  const paidCents = decimalToCents(order.total_paid_amount) ?? decimalToCents(payment.paid_amount);
  const installmentAmountCents = decimalToCents(paymentMethod.installment_amount);

  return {
    orderId: stringOrNull(order.id) ?? "",
    externalReference: stringOrNull(order.external_reference),
    orderStatus: stringOrNull(order.status),
    orderStatusDetail: stringOrNull(order.status_detail),
    totalCents,
    totalPaidCents: paidCents,
    currency: stringOrNull(order.currency) ?? stringOrNull(order.currency_id),
    paymentId: stringOrNull(payment.id),
    paymentStatus: stringOrNull(payment.status),
    paymentStatusDetail: stringOrNull(payment.status_detail),
    paymentMethodId: stringOrNull(paymentMethod.id),
    installments: typeof paymentMethod.installments === "number" ? paymentMethod.installments : null,
    installmentAmountCents,
    redirectUrl: safeMercadoPagoRedirect(
      stringOrNull(security.url) ?? stringOrNull(paymentMethod.redirect_url),
    ),
  };
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeMercadoPagoRedirect(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = ["mercadopago.com", "mercadopago.com.br", "mercadolibre.com", "mercadolibre.com.br"];
    if (url.protocol !== "https:" || !allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function translateProviderError(error: unknown): PaymentProviderError {
  if (error instanceof MPBadRequestError || error instanceof MPValidationError) {
    return new PaymentProviderError("rejected", "PAYMENT_REJECTED");
  }
  if (error instanceof MPAuthenticationError || error instanceof MPForbiddenError) {
    return new PaymentProviderError("configuration", "PROVIDER_CONFIGURATION_ERROR");
  }
  return new PaymentProviderError("unknown", "PROVIDER_TEMPORARY_ERROR");
}
