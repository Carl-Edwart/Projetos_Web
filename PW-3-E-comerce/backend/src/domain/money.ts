export function centsToDecimal(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${cents < 0n ? "-" : ""}${whole}.${fraction}`;
}

export function decimalToCents(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return whole * 100n + fraction;
}

export function centsToJson(cents: string | number | bigint): string {
  return BigInt(cents).toString();
}
