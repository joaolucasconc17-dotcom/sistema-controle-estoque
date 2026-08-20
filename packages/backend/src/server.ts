import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./platform/config.js";
import { logger } from "./platform/logger.js";
import { errorHandler } from "./platform/http/errorHandler.js";
import { controlClient } from "./platform/controlClient.js";
import { tenantConnectionManager } from "./platform/tenant/TenantConnectionManager.js";
import { authRoutes } from "./modules/iam/authRoutes.js";
import { companyUnitRoutes } from "./modules/organization/companyUnitRoutes.js";
import { warehouseRoutes } from "./modules/organization/warehouseRoutes.js";
import { storageLocationRoutes } from "./modules/organization/storageLocationRoutes.js";
import { unitOfMeasureRoutes } from "./modules/catalog/unitOfMeasureRoutes.js";
import { categoryRoutes } from "./modules/catalog/categoryRoutes.js";
import { productRoutes } from "./modules/catalog/productRoutes.js";
import { supplierRoutes } from "./modules/catalog/supplierRoutes.js";
import { inventoryRoutes } from "./modules/inventory/inventoryRoutes.js";
import { reservationRoutes } from "./modules/inventory/reservationRoutes.js";
import { inventoryCountRoutes } from "./modules/inventory/inventoryCountRoutes.js";
import { purchasingRoutes } from "./modules/purchasing/purchasingRoutes.js";
import { reportsRoutes } from "./modules/reports/reportsRoutes.js";

async function buildServer() {
  const app = Fastify({ loggerInstance: logger, trustProxy: true });

  await app.register(helmet);
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    // Por usuario autenticado quando houver token, senao por IP — assim um
    // operador ocupado (ou o mesmo NAT/proxy) nao consome o orcamento de
    // outro usuario nem de outra empresa.
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      return auth ?? request.ip;
    },
  });

  app.setErrorHandler(errorHandler);

  app.get("/health", async () => ({
    status: "ok",
    hotTenantClients: tenantConnectionManager.hotClientCount,
  }));

  await app.register(authRoutes, { prefix: "/api" });
  await app.register(companyUnitRoutes, { prefix: "/api/org" });
  await app.register(warehouseRoutes, { prefix: "/api/org" });
  await app.register(storageLocationRoutes, { prefix: "/api/org" });
  await app.register(unitOfMeasureRoutes, { prefix: "/api/catalog" });
  await app.register(categoryRoutes, { prefix: "/api/catalog" });
  await app.register(productRoutes, { prefix: "/api/catalog" });
  await app.register(supplierRoutes, { prefix: "/api/catalog" });
  await app.register(inventoryRoutes, { prefix: "/api/inventory" });
  await app.register(reservationRoutes, { prefix: "/api/inventory" });
  await app.register(inventoryCountRoutes, { prefix: "/api/inventory" });
  await app.register(purchasingRoutes, { prefix: "/api/purchasing" });
  await app.register(reportsRoutes, { prefix: "/api/reports" });

  return app;
}

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "encerrando servidor");
    await app.close();
    await tenantConnectionManager.disconnectAll();
    await controlClient.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  logger.info({ port: config.PORT }, "backend no ar");
}

main().catch((err) => {
  logger.error({ err }, "falha ao iniciar o servidor");
  process.exit(1);
});
