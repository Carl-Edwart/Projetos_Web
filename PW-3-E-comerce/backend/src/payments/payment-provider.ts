export interface ProviderPayer {
  email: string;
  firstName: string;
  lastName: string;
  cpf: string;
  phoneAreaCode: string;
  phoneNumber: string;
}

export interface ProviderItem {
  title: string;
  code: string;
  unitPriceCents: bigint;
  quantity: number;
}

export interface CreateProviderOrderInput {
  amountCents: bigint;
  externalReference: string;
  idempotencyKey: string;
  payer: ProviderPayer;
  token: string;
  paymentMethodId: string;
  installments: number;
  items: ProviderItem[];
}

export interface ProviderPaymentSnapshot {
  orderId: string;
  externalReference: string | null;
  orderStatus: string | null;
  orderStatusDetail: string | null;
  totalCents: bigint | null;
  totalPaidCents: bigint | null;
  currency: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paymentStatusDetail: string | null;
  paymentMethodId: string | null;
  installments: number | null;
  installmentAmountCents: bigint | null;
  redirectUrl: string | null;
}

export type ProviderFailureKind = "rejected" | "configuration" | "unknown";

export class PaymentProviderError extends Error {
  constructor(readonly kind: ProviderFailureKind, readonly safeCode: string) {
    super("Payment provider request failed");
    this.name = "PaymentProviderError";
  }
}

export interface PaymentProvider {
  createOrder(input: CreateProviderOrderInput): Promise<ProviderPaymentSnapshot>;
  getOrder(id: string): Promise<ProviderPaymentSnapshot>;
  searchByExternalReference(reference: string, createdAt: Date): Promise<ProviderPaymentSnapshot | null>;
  validateWebhook(input: {
    signature: string | string[] | undefined;
    requestId: string | string[] | undefined;
    dataId: string | string[] | undefined;
  }): void;
}
