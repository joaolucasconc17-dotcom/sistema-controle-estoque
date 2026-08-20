import { PrismaClient as ControlPrismaClient } from "../generated/control/index.js";
import { config } from "./config.js";

/**
 * Cliente unico para o control plane (o catalogo de empresas). Diferente
 * dos clients de tenant, este vive por toda a vida do processo — nao ha
 * motivo para reciclar.
 */
export const controlClient = new ControlPrismaClient({
  datasourceUrl: config.CONTROL_DATABASE_URL,
  log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
