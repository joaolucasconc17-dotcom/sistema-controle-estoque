import { Redis } from "ioredis";
import { controlClient } from "../controlClient.js";
import { decryptDatasourceUrl } from "../crypto/datasourceCipher.js";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import { childLogger } from "../logger.js";

const log = childLogger({ module: "TenantRegistry" });

export interface TenantDescriptor {
  id: string;
  slug: string;
  name: string;
  status: "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  databaseUrl: string;
}

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = "tenant-registry:v1:";

/**
 * Resolve id/slug de tenant -> descriptor (incluindo a connection string
 * decifrada). Cacheado em Redis por um tempo curto: barato de consultar,
 * mas nunca fica desatualizado por mais de um minuto se a empresa for
 * suspensa ou tiver a connection string rotacionada.
 */
export class TenantRegistry {
  private readonly redis: Redis;

  constructor(redis: Redis = new Redis(config.REDIS_URL)) {
    this.redis = redis;
  }

  async resolveById(tenantId: string): Promise<TenantDescriptor> {
    const cached = await this.readCache(tenantId);
    if (cached) return cached;

    const tenant = await controlClient.tenant.findUnique({
      where: { id: tenantId },
      include: { dataSource: true },
    });
    return this.toDescriptorOrThrow(tenant);
  }

  async resolveBySlug(slug: string): Promise<TenantDescriptor> {
    const tenant = await controlClient.tenant.findUnique({
      where: { slug },
      include: { dataSource: true },
    });
    return this.toDescriptorOrThrow(tenant);
  }

  /** Usado no login: um email pode existir em mais de uma empresa. */
  async resolveTenantsByEmail(email: string): Promise<TenantDescriptor[]> {
    const lookups = await controlClient.tenantLookup.findMany({
      where: { email: email.toLowerCase() },
      include: { tenant: { include: { dataSource: true } } },
    });
    return lookups
      .map((l) => this.tryToDescriptor(l.tenant))
      .filter((d): d is TenantDescriptor => d !== null);
  }

  invalidate(tenantId: string): Promise<number> {
    return this.redis.del(CACHE_PREFIX + tenantId);
  }

  private async readCache(tenantId: string): Promise<TenantDescriptor | null> {
    try {
      const raw = await this.redis.get(CACHE_PREFIX + tenantId);
      return raw ? (JSON.parse(raw) as TenantDescriptor) : null;
    } catch (err) {
      log.warn({ err }, "falha ao ler cache de tenant, seguindo sem cache");
      return null;
    }
  }

  private async writeCache(descriptor: TenantDescriptor): Promise<void> {
    try {
      await this.redis.set(
        CACHE_PREFIX + descriptor.id,
        JSON.stringify(descriptor),
        "EX",
        CACHE_TTL_SECONDS,
      );
    } catch (err) {
      log.warn({ err }, "falha ao gravar cache de tenant");
    }
  }

  private tryToDescriptor(
    tenant: Awaited<ReturnType<typeof controlClient.tenant.findUnique>> & {
      dataSource: { encryptedUrl: string } | null;
    } | null,
  ): TenantDescriptor | null {
    if (!tenant || !tenant.dataSource) return null;
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      databaseUrl: decryptDatasourceUrl(tenant.dataSource.encryptedUrl),
    };
  }

  private async toDescriptorOrThrow(
    tenant: Awaited<ReturnType<typeof controlClient.tenant.findUnique>> & {
      dataSource: { encryptedUrl: string } | null;
    } | null,
  ): Promise<TenantDescriptor> {
    const descriptor = this.tryToDescriptor(tenant);
    if (!descriptor) throw AppError.tenantNotFound();
    if (descriptor.status === "SUSPENDED" || descriptor.status === "DEACTIVATED") {
      throw AppError.tenantSuspended();
    }
    await this.writeCache(descriptor);
    return descriptor;
  }
}

export const tenantRegistry = new TenantRegistry();
