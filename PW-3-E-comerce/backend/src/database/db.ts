import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./types.js";

export function createDatabase(connectionString: string): Kysely<Database> {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: "checkout-onibus-camiseta",
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}
