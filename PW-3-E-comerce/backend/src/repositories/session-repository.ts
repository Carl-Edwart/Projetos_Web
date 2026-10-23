import type { Kysely } from "kysely";
import type { Database } from "../database/types.js";

export class SessionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  find(secretHash: Buffer) {
    return this.db
      .selectFrom("checkout_sessions")
      .select(["id", "csrf_hash", "expires_at", "active_order_id"])
      .where("secret_hash", "=", secretHash)
      .executeTakeFirst();
  }

  async create(input: { id: string; secretHash: Buffer; csrfHash: Buffer; expiresAt: Date }): Promise<void> {
    await this.db.insertInto("checkout_sessions").values({
      id: input.id,
      secret_hash: input.secretHash,
      csrf_hash: input.csrfHash,
      active_order_id: null,
      expires_at: input.expiresAt,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();
  }

  async rotateCsrf(sessionId: string, csrfHash: Buffer): Promise<void> {
    await this.db.updateTable("checkout_sessions").set({ csrf_hash: csrfHash, updated_at: new Date() })
      .where("id", "=", sessionId).execute();
  }

  async extend(sessionId: string, expiresAt: Date): Promise<void> {
    await this.db.updateTable("checkout_sessions").set({ expires_at: expiresAt, updated_at: new Date() })
      .where("id", "=", sessionId).execute();
  }
}
