import "dotenv/config";
import { assertRuntimeConfig, loadConfig } from "./config/env.js";
import { createDatabase } from "./database/db.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  let db: ReturnType<typeof createDatabase> | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    const config = loadConfig();
    assertRuntimeConfig(config);
    db = createDatabase(config.databaseUrl);
    await db.selectNoFrom((eb) => eb.val(1).as("ready")).executeTakeFirst();
    app = await buildApp({ config, db });

    let closing = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (closing) return;
      closing = true;
      app?.log.info({ signal }, "shutting down");
      await app?.close();
      await db?.destroy();
    };

    process.once("SIGINT", () => void shutdown("SIGINT").then(() => process.exit(0)));
    process.once("SIGTERM", () => void shutdown("SIGTERM").then(() => process.exit(0)));
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    process.stderr.write(`${startupErrorMessage(error)}\n`);
    await app?.close().catch(() => undefined);
    await db?.destroy().catch(() => undefined);
    process.exitCode = 1;
  }
}

function startupErrorMessage(error: unknown): string {
  if (error instanceof Error && /^(DATABASE_URL|PII_ENCRYPTION_KEY|APP_ORIGIN|MERCADOPAGO_)/u.test(error.message)) {
    return error.message;
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
    return "Não foi possível conectar ao PostgreSQL. Confira DATABASE_URL e confirme que o servidor PostgreSQL está ativo.";
  }
  if (code === "28P01" || code === "28000") {
    return "Falha de autenticação no PostgreSQL. Confira o usuário e a senha da DATABASE_URL.";
  }
  if (code === "3D000") {
    return "O banco informado em DATABASE_URL não existe. Crie o banco pw3_ecommerce ou ajuste DATABASE_URL.";
  }
  return "Não foi possível iniciar a aplicação. Confira .env, PostgreSQL e as migrations; os detalhes sensíveis foram omitidos.";
}

await main();
