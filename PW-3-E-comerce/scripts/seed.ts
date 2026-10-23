import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write("DATABASE_URL não configurada. Preencha .env antes de executar o seed.\n");
    process.exitCode = 1;
    return;
  }

  const file = path.resolve(process.cwd(), "database/seeds/001_business_rules.sql");
  const sql = await readFile(file, "utf8");
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      process.stdout.write("Regras iniciais cadastradas; o catálogo permanece inativo até ser configurado.\n");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND"
      ? "Não foi possível conectar ao PostgreSQL. Confira DATABASE_URL e se o servidor está ativo."
      : code === "28P01" || code === "28000"
        ? "Falha de autenticação PostgreSQL. Confira usuário e senha em DATABASE_URL."
        : code === "3D000"
          ? "O banco indicado em DATABASE_URL não existe. Crie o banco antes de executar o seed."
          : "Falha ao executar seed. Confira as migrations e a conexão PostgreSQL; detalhes sensíveis foram omitidos.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
