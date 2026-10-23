import { describe, expect, it } from "vitest";
import { isValidCpf, normalizeCpf } from "../../backend/src/domain/cpf.js";
import { decryptJson, encryptJson } from "../../backend/src/domain/crypto.js";
import { decimalToCents, centsToDecimal } from "../../backend/src/domain/money.js";
import { normalizeForModeration } from "../../backend/src/domain/normalization.js";
import { findRestrictedNamePattern, isRestrictedNumber } from "../../backend/src/domain/moderation.js";
import { canTransitionPayment, mapProviderState } from "../../backend/src/domain/payment-state.js";

describe("CPF", () => {
  it("normalizes formatting and validates both check digits", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
});

describe("personalization rules", () => {
  const numbers = [13, 22, 14, 69, 55, 30, 70];
  const patterns = [
    { category: "political_propaganda", normalized_pattern: "vote em" },
    { category: "illicit_drugs", normalized_pattern: "legalize maconha" },
    { category: "pornography", normalized_pattern: "sexo explicito" },
  ];

  it("blocks only configured numbers, even when zero-padded", () => {
    expect(isRestrictedNumber("13", numbers)).toBe(true);
    expect(isRestrictedNumber("013", numbers)).toBe(true);
    expect(isRestrictedNumber("31", numbers)).toBe(false);
    expect(isRestrictedNumber("31abc", numbers)).toBe(false);
  });

  it("normalizes accents and case while allowing ordinary names", () => {
    expect(normalizeForModeration("VÓTE EM" )).toBe("vote em");
    expect(findRestrictedNamePattern("Vóte em alguém", patterns)?.category).toBe("political_propaganda");
    expect(findRestrictedNamePattern("Legalize MACONHA", patterns)?.category).toBe("illicit_drugs");
    expect(findRestrictedNamePattern("João Silva", patterns)).toBeNull();
    expect(findRestrictedNamePattern("Carlos Silva", patterns)).toBeNull();
  });
});

describe("money", () => {
  it("uses integer cents and decimal strings", () => {
    expect(centsToDecimal(12345n)).toBe("123.45");
    expect(decimalToCents("123.45")).toBe(12345n);
    expect(decimalToCents("0.5")).toBe(50n);
    expect(decimalToCents("1.999")).toBeNull();
  });
});

describe("payment states", () => {
  it("only treats an accredited processed Order as approved", () => {
    const snapshot = {
      orderId: "mp-order",
      externalReference: "local-ref",
      orderStatus: "processed",
      orderStatusDetail: "accredited",
      totalCents: 12345n,
      totalPaidCents: 12345n,
      currency: "BRL",
      paymentId: "mp-payment",
      paymentStatus: "processed",
      paymentStatusDetail: "accredited",
      paymentMethodId: "visa",
      installments: 3,
      installmentAmountCents: null,
      redirectUrl: null,
    };
    expect(mapProviderState(snapshot).paymentStatus).toBe("APPROVED");
    expect(mapProviderState({ ...snapshot, orderStatus: "processing", orderStatusDetail: "in_process" }).paymentStatus).toBe("PENDING");
    expect(mapProviderState({ ...snapshot, orderStatus: "failed", orderStatusDetail: "failed" }).paymentStatus).toBe("REJECTED");
  });

  it("prevents an out-of-order pending event from downgrading approval", () => {
    expect(canTransitionPayment("APPROVED", "PENDING")).toBe(false);
    expect(canTransitionPayment("APPROVED", "REFUNDED")).toBe(true);
  });
});

describe("sensitive field encryption", () => {
  it("encrypts payloads and rejects a wrong key", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptJson({ value: "cpf-example" }, key);
    expect(encrypted.includes(Buffer.from("cpf-example"))).toBe(false);
    expect(decryptJson<{ value: string }>(encrypted, key)).toEqual({ value: "cpf-example" });
    expect(() => decryptJson(encrypted, Buffer.alloc(32, 8))).toThrow();
  });
});
