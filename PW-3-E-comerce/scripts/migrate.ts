import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write("DATABASE_URL não configurada. Preencha .env antes de executar as migrations.\n");
    process.exitCode = 1;
    return;
  }

  const directory = path.resolve(process.cwd(), "database/migrations");
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [2_026_100_101]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
      for (const name of files) {
        const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
        if (applied.rowCount) continue;
        const sql = await readFile(path.join(directory, name), "utf8");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        process.stdout.write(`Applied ${name}\n`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    process.stderr.write(`${databaseErrorMessage(error)}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();

function databaseErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
    return "Não foi possível conectar ao PostgreSQL. Confira DATABASE_URL e se o servidor está ativo.";
  }
  if (code === "28P01" || code === "28000") return "Falha de autenticação PostgreSQL. Confira usuário e senha em DATABASE_URL.";
  if (code === "3D000") return "O banco indicado em DATABASE_URL não existe. Crie o banco antes de executar migrations.";
  return "Falha ao aplicar migrations. Confira a conexão PostgreSQL e o estado do schema; detalhes sensíveis foram omitidos.";
}
