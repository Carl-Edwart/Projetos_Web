import { normalizeForModeration } from "./normalization.js";

export interface RestrictedNamePattern {
  category: string;
  normalized_pattern: string;
}

export function findRestrictedNamePattern(name: string, patterns: RestrictedNamePattern[]): RestrictedNamePattern | null {
  const normalized = ` ${normalizeForModeration(name)} `;
  if (normalized.trim().length === 0) return null;

  for (const pattern of patterns) {
    const normalizedPattern = normalizeForModeration(pattern.normalized_pattern);
    if (!normalizedPattern) continue;
    if (normalized.includes(` ${normalizedPattern} `)) return pattern;
  }
  return null;
}

export function isRestrictedNumber(value: string, numbers: number[]): boolean {
  if (!/^\d{1,12}$/u.test(value)) return false;
  const canonical = BigInt(value);
  return numbers.some((number) => BigInt(number) === canonical);
}
