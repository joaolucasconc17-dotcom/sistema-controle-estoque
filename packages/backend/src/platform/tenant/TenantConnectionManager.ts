import { LRUCache } from "lru-cache";
import { PrismaClient as TenantPrismaClient } from "../../generated/tenant/index.js";
import { config } from "../config.js";
import { childLogger } from "../logger.js";
import { tenantRegistry } from "./TenantRegistry.js";

const log = childLogger({ module: "TenantConnectionManager" });

/**
 * Pool de PrismaClient por empresa, com limite fixo de clients "quentes"
 * em memoria (LRU) e despejo por ociosidade.
 *
 * Por que isso existe: na estrategia "banco por empresa", cada
 * PrismaClient abre seu proprio pool de conexoes contra o Postgres. Sem um
 * limite aqui, um sistema com centenas de empresas ativas esgota
 * max_connections do Postgres so de manter clients ociosos abertos. Este
 * cache garante que no maximo TENANT_POOL_MAX_CLIENTS bancos ficam
 * conectados ao mesmo tempo — os demais sao abertos sob demanda e
 * despejados quando ficam frios.
 */
class TenantConnectionManager {
  private readonly cache: LRUCache<string, TenantPrismaClient>;

  constructor() {
    this.cache = new LRUCache<string, TenantPrismaClient>({
      max: config.TENANT_POOL_MAX_CLIENTS,
      ttl: config.TENANT_POOL_IDLE_MS,
      updateAgeOnGet: true,
      dispose: (client, tenantId) => {
        log.info({ tenantId }, "despejando client de tenant ocioso do pool");
        void client.$disconnect();
      },
    });
  }

  async getClient(tenantId: string): Promise<TenantPrismaClient> {
    const existing = this.cache.get(tenantId);
    if (existing) return existing;

    const descriptor = await tenantRegistry.resolveById(tenantId);
    const client = new TenantPrismaClient({
      datasourceUrl: `${descriptor.databaseUrl}?connection_limit=${config.TENANT_CONNECTION_LIMIT}`,
      log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

    this.cache.set(tenantId, client);
    log.info(
      { tenantId, hotClients: this.cache.size },
      "novo client de tenant aberto no pool",
    );
    return client;
  }

  /** Forca a saida de um client do pool — usado ao suspender/desprovisionar uma empresa. */
  async evict(tenantId: string): Promise<void> {
    this.cache.delete(tenantId);
  }

  async disconnectAll(): Promise<void> {
    const clients = [...this.cache.values()];
    this.cache.clear();
    await Promise.all(clients.map((c) => c.$disconnect()));
  }

  get hotClientCount(): number {
    return this.cache.size;
  }
}

export const tenantConnectionManager = new TenantConnectionManager();
