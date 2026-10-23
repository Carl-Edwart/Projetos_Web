import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../database/types.js";
import { randomSecret, safeEqualText, sha256 } from "../domain/crypto.js";
import { forbidden } from "../domain/errors.js";
import type { AppConfig } from "../config/env.js";
import { SessionRepository } from "../repositories/session-repository.js";

export interface CheckoutSession {
  id: string;
  csrfToken: string;
  secret: string;
  newSecret: boolean;
  newCsrf: boolean;
}

export class SessionService {
  private readonly repository: SessionRepository;

  constructor(private readonly db: Kysely<Database>, private readonly config: AppConfig) {
    this.repository = new SessionRepository(db);
  }

  async establish(secretCookie?: string, csrfCookie?: string): Promise<CheckoutSession> {
    const now = new Date();
    if (secretCookie && secretCookie.length <= 128) {
      const existing = await this.repository.find(sha256(secretCookie));
      if (existing && existing.expires_at.getTime() > now.getTime()) {
        const validCsrf = csrfCookie && Buffer.from(sha256(csrfCookie)).equals(existing.csrf_hash);
        const csrfToken = validCsrf ? csrfCookie : randomSecret();
        if (!validCsrf) await this.repository.rotateCsrf(existing.id, sha256(csrfToken));
        await this.repository.extend(existing.id, new Date(now.getTime() + this.config.sessionTtlSeconds * 1000));
        return { id: existing.id, csrfToken, secret: secretCookie, newSecret: false, newCsrf: !validCsrf };
      }
    }

    const secret = randomSecret();
    const csrfToken = randomSecret();
    const id = randomUUID();
    await this.repository.create({
      id,
      secretHash: sha256(secret),
      csrfHash: sha256(csrfToken),
      expiresAt: new Date(now.getTime() + this.config.sessionTtlSeconds * 1000),
    });
    return { id, csrfToken, secret, newSecret: true, newCsrf: true };
  }

  async requireSession(secretCookie?: string): Promise<{ id: string; csrfHash: Buffer }> {
    if (!secretCookie || secretCookie.length > 128) throw forbidden("CHECKOUT_SESSION_REQUIRED");
    const session = await this.repository.find(sha256(secretCookie));
    if (!session || session.expires_at.getTime() <= Date.now()) throw forbidden("CHECKOUT_SESSION_EXPIRED");
    return { id: session.id, csrfHash: session.csrf_hash };
  }

  requireCsrf(session: { csrfHash: Buffer }, csrfCookie?: string, csrfHeader?: string): void {
    if (!csrfCookie || !csrfHeader || !safeEqualText(csrfCookie, csrfHeader)) {
      throw forbidden("CSRF_VALIDATION_FAILED");
    }
    if (!sha256(csrfHeader).equals(session.csrfHash)) throw forbidden("CSRF_VALIDATION_FAILED");
  }
}
