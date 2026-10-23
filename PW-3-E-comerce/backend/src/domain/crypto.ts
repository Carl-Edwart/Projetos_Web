import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const FORMAT_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function encryptJson(value: unknown, key: Buffer): Buffer {
  if (key.length !== 32) throw new Error("Invalid encryption key length");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), encrypted]);
}

export function decryptJson<T>(encrypted: Buffer, key: Buffer): T {
  if (key.length !== 32 || encrypted.length < 1 + IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted record is invalid");
  }
  if (encrypted[0] !== FORMAT_VERSION) throw new Error("Unsupported encrypted record version");

  const ivStart = 1;
  const tagStart = ivStart + IV_LENGTH;
  const dataStart = tagStart + TAG_LENGTH;
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(ivStart, tagStart));
  decipher.setAuthTag(encrypted.subarray(tagStart, dataStart));
  const plaintext = Buffer.concat([decipher.update(encrypted.subarray(dataStart)), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function randomPublicId(): string {
  return randomBytes(24).toString("base64url");
}

export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}
