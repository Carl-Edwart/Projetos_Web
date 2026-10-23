import pg from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL_TEST;

describe.skipIf(!databaseUrl)("PostgreSQL schema smoke test", () => {
  it("has the migrated commerce tables and seeded restricted numbers", async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 3_000 });
    try {
      const tables = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()",
      );
      const names = new Set(tables.rows.map((row) => row.table_name));
      for (const name of ["products", "product_variants", "customers", "orders", "order_items", "payments", "payment_events"]) {
        expect(names.has(name), `expected table ${name}`).toBe(true);
      }
      const rules = await pool.query<{ number: number }>("SELECT number FROM restricted_numbers WHERE is_active ORDER BY number");
      expect(rules.rows.map((row) => row.number).sort((a, b) => a - b)).toEqual([13, 14, 22, 30, 55, 69, 70]);
    } finally {
      await pool.end();
    }
  });
});
