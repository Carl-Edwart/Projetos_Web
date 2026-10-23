import type { ProviderPaymentSnapshot } from "../payments/payment-provider.js";

export type LocalPaymentStatus =
  | "SUBMITTING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "RECONCILING"
  | "ERROR"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CHARGEDBACK";

export interface MappedPaymentState {
  paymentStatus: LocalPaymentStatus;
  orderStatus: string;
  terminal: boolean;
}

export function mapProviderState(snapshot: ProviderPaymentSnapshot): MappedPaymentState {
  const status = (snapshot.orderStatus ?? "").toLowerCase();
  const detail = (snapshot.orderStatusDetail ?? "").toLowerCase();

  if (status === "processed" && detail === "accredited") {
    return { paymentStatus: "APPROVED", orderStatus: "PAID", terminal: true };
  }
  if (status === "processed" && detail === "partially_refunded") {
    return { paymentStatus: "PARTIALLY_REFUNDED", orderStatus: "PARTIALLY_REFUNDED", terminal: true };
  }
  if (status === "refunded" || detail === "refunded") {
    return { paymentStatus: "REFUNDED", orderStatus: "REFUNDED", terminal: true };
  }
  if (status === "charged_back") {
    return { paymentStatus: "CHARGEDBACK", orderStatus: "DISPUTED", terminal: true };
  }
  if (status === "failed") return { paymentStatus: "REJECTED", orderStatus: "AWAITING_PAYMENT", terminal: true };
  if (status === "canceled" || status === "cancelled") {
    return { paymentStatus: "CANCELLED", orderStatus: "CANCELLED", terminal: true };
  }
  if (status === "expired") return { paymentStatus: "EXPIRED", orderStatus: "EXPIRED", terminal: true };
  if (["created", "processing", "action_required", "in_review"].includes(status)) {
    return { paymentStatus: "PENDING", orderStatus: "AWAITING_PAYMENT", terminal: false };
  }
  return { paymentStatus: "RECONCILING", orderStatus: "AWAITING_PAYMENT", terminal: false };
}

export function canTransitionPayment(current: string, next: LocalPaymentStatus): boolean {
  if (current === next) return true;
  if (["SUBMITTING", "RECONCILING"].includes(current)) return true;
  if (current === "PENDING") return true;
  if (current === "APPROVED") return ["PARTIALLY_REFUNDED", "REFUNDED", "CHARGEDBACK"].includes(next);
  if (current === "PARTIALLY_REFUNDED") return ["REFUNDED", "CHARGEDBACK"].includes(next);
  if (["REJECTED", "CANCELLED", "EXPIRED", "ERROR", "REFUNDED", "CHARGEDBACK"].includes(current)) return false;
  return false;
}

export function isInFlightPayment(status: string): boolean {
  return ["SUBMITTING", "PENDING", "RECONCILING"].includes(status);
}
