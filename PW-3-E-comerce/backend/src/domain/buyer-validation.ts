import { parsePhoneNumberFromString } from "libphonenumber-js";
import validator from "validator";
import { badRequest } from "./errors.js";
import { isValidCpf, normalizeCpf } from "./cpf.js";
import { normalizeEmail, normalizeHumanText, normalizeRg } from "./normalization.js";

export interface BuyerInput {
  fullName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  phone: string;
  email: string;
  className: string;
  modality: string;
}

export interface NormalizedBuyer {
  fullName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  phoneE164: string;
  email: string;
  className: string;
  modality: string;
}

export function validateAndNormalizeBuyer(input: BuyerInput): NormalizedBuyer {
  const fullName = normalizeHumanText(input.fullName);
  const cpf = normalizeCpf(input.cpf);
  const rg = normalizeRg(input.rg);
  const email = normalizeEmail(input.email);
  const className = normalizeHumanText(input.className);
  const modality = normalizeHumanText(input.modality);
  const phoneInput = input.phone.normalize("NFKC").trim();
  const phone = parsePhoneNumberFromString(phoneInput, "BR");
  const birthDate = input.birthDate.trim();

  const errors: Record<string, string> = {};
  if (fullName.length < 3 || fullName.length > 120 || !/^[\p{L}\p{M} .'-]+$/u.test(fullName)) {
    errors.fullName = "Informe um nome completo válido.";
  }
  if (!isValidCpf(cpf)) errors.cpf = "Informe um CPF válido.";
  if (rg.length < 4 || rg.length > 20 || !/^[\p{L}\p{N}]+$/u.test(rg)) {
    errors.rg = "Informe um RG válido.";
  }
  if (!isValidDateOnly(birthDate) || new Date(`${birthDate}T00:00:00.000Z`).getTime() > Date.now()) {
    errors.birthDate = "Informe uma data de nascimento válida.";
  }
  if (!phone || !phone.isValid() || phone.country !== "BR") {
    errors.phone = "Informe um telefone brasileiro válido, com DDD.";
  }
  if (email.length > 254 || !validator.isEmail(email, { allow_utf8_local_part: false })) {
    errors.email = "Informe um e-mail válido.";
  }
  if (className.length < 1 || className.length > 80) errors.className = "Informe uma turma válida.";
  if (modality.length < 1 || modality.length > 80) errors.modality = "Informe uma modalidade válida.";

  if (Object.keys(errors).length > 0) {
    throw badRequest("INVALID_BUYER_DATA", "Confira os campos destacados.", errors);
  }

  return {
    fullName,
    cpf,
    rg,
    birthDate,
    phoneE164: phone!.number,
    email,
    className,
    modality,
  };
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
