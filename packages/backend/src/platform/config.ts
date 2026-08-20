import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Carrega o .env da raiz do monorepo por caminho explicito — nao depende do
// cwd de quem invoca (npm workspace scripts rodam com cwd em packages/backend,
// o dotenv/config padrao nao acharia o .env da raiz nesse caso).
const MONOREPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
dotenv.config({ path: path.join(MONOREPO_ROOT, ".env") });

const hex32ByteKey = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "precisa ser uma chave de 32 bytes em hex (64 caracteres)");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3333),
  LOG_LEVEL: z.string().default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  CONTROL_DATABASE_URL: z.string().min(1),

  TENANT_DB_HOST: z.string().min(1),
  TENANT_DB_PORT: z.coerce.number().int().default(5432),
  TENANT_DB_USER: z.string().min(1),
  TENANT_DB_PASSWORD: z.string().min(1),

  DATASOURCE_ENCRYPTION_KEY: hex32ByteKey,

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  TENANT_POOL_MAX_CLIENTS: z.coerce.number().int().min(1).default(50),
  TENANT_POOL_IDLE_MS: z.coerce.number().int().min(1000).default(300_000),
  TENANT_CONNECTION_LIMIT: z.coerce.number().int().min(1).default(5),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Configuracao invalida no ambiente (.env):");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
export type AppConfig = typeof config;
