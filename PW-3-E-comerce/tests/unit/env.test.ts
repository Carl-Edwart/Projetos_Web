import { describe, expect, it } from "vitest";
import { assertRuntimeConfig, loadConfig } from "../../backend/src/config/env.js";

describe("runtime configuration", () => {
  it("reports missing DATABASE_URL clearly", () => {
    const config = loadConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(() => assertRuntimeConfig(config)).toThrow("DATABASE_URL não configurada");
  });

  it("reports missing PII key clearly after DATABASE_URL is configured", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://localhost/pw3_ecommerce",
    } as NodeJS.ProcessEnv);
    expect(() => assertRuntimeConfig(config)).toThrow("PII_ENCRYPTION_KEY não configurada");
  });

  it("requires HTTPS origin for production", () => {
    expect(() => loadConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "http://localhost:3000",
    } as NodeJS.ProcessEnv)).toThrow("APP_ORIGIN must be an origin without a path; production requires HTTPS");
  });
});
