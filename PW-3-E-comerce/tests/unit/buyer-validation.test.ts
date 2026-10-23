import { describe, expect, it } from "vitest";
import { validateAndNormalizeBuyer } from "../../backend/src/domain/buyer-validation.js";

const buyer = {
  fullName: "  João   Silva  ",
  cpf: "529.982.247-25",
  rg: "12.345.678-X",
  birthDate: "2001-08-16",
  phone: "(11) 98765-4321",
  email: "  JOAO@example.com ",
  className: "Turma de teste",
  modality: "Modalidade de teste",
};

describe("buyer validation", () => {
  it("normalizes buyer data for persistence/provider use", () => {
    const result = validateAndNormalizeBuyer(buyer);
    expect(result.fullName).toBe("João Silva");
    expect(result.cpf).toBe("52998224725");
    expect(result.rg).toBe("12345678X");
    expect(result.email).toBe("joao@example.com");
    expect(result.phoneE164).toBe("+5511987654321");
  });

  it("rejects invalid CPF, email, phone and future dates", () => {
    expectFieldError({ ...buyer, cpf: "00000000000" }, "cpf", "CPF válido");
    expectFieldError({ ...buyer, email: "not-an-email" }, "email", "e-mail válido");
    expectFieldError({ ...buyer, phone: "123" }, "phone", "telefone brasileiro válido");
    expectFieldError({ ...buyer, birthDate: "2999-01-01" }, "birthDate", "data de nascimento válida");
  });
});

function expectFieldError(value: typeof buyer, field: string, message: string) {
  try {
    validateAndNormalizeBuyer(value);
    throw new Error("expected validation to fail");
  } catch (error) {
    expect(error).toHaveProperty("fields");
    expect((error as { fields: Record<string, string> }).fields[field]).toContain(message);
  }
}
