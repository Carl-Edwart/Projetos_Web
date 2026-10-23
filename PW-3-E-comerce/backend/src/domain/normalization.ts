export function normalizeHumanText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function normalizeForModeration(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function normalizeEmail(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("en-US");
}

export function normalizeRg(value: string): string {
  return value.normalize("NFKC").trim().toLocaleUpperCase("pt-BR").replace(/[\s.\-/]/gu, "");
}

export function canonicalNumber(value: string): bigint | null {
  if (!/^\d{1,12}$/u.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
