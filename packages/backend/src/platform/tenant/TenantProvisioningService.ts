import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client as PgClient } from "pg";
import { controlClient } from "../controlClient.js";
import { config } from "../config.js";
import { childLogger } from "../logger.js";
import { encryptDatasourceUrl } from "../crypto/datasourceCipher.js";
import { AppError } from "../errors.js";
import { slugify, tenantDatabaseName } from "./slugify.js";
import { seedTenantData } from "./seedTenantData.js";
import { PrismaClient as TenantPrismaClient } from "../../generated/tenant/index.js";
import { spawnPrismaMigrateDeploy } from "../migrations/spawnPrismaMigrateDeploy.js";

const log = childLogger({ module: "TenantProvisioningService" });

const BACKEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const TENANT_SCHEMA_PATH = path.join("prisma", "tenant", "schema.prisma");

export interface ProvisionTenantParams {
  companyName: string;
  slug?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface ProvisionTenantResult {
  tenantId: string;
  slug: string;
  databaseName: string;
}

export class TenantProvisioningService {
  /** Provisiona uma empresa nova de ponta a ponta: banco fisico, schema, seed e registro no control plane. */
  async provision(params: ProvisionTenantParams): Promise<ProvisionTenantResult> {
    const slug = params.slug ? slugify(params.slug) : slugify(params.companyName);
    if (!slug) throw AppError.validation("Nao foi possivel gerar um slug a partir do nome");

    const existing = await controlClient.tenant.findUnique({ where: { slug } });
    if (existing) throw AppError.conflict(`Ja existe uma empresa com o slug "${slug}"`);

    const databaseName = tenantDatabaseName(slug);
    const databaseUrl = this.buildTenantDatabaseUrl(databaseName);

    const tenant = await controlClient.tenant.create({
      data: { slug, name: params.companyName, status: "PROVISIONING" },
    });

    try {
      log.info({ slug, databaseName }, "criando banco fisico da empresa");
      await this.createPhysicalDatabase(databaseName);

      log.info({ slug }, "aplicando migrations no banco da empresa");
      await this.runMigrations(databaseUrl);

      await controlClient.tenantDataSource.create({
        data: {
          tenantId: tenant.id,
          encryptedUrl: encryptDatasourceUrl(databaseUrl),
          host: config.TENANT_DB_HOST,
          databaseName,
        },
      });

      log.info({ slug }, "semeando dados iniciais (perfis, permissoes, owner)");
      const tenantClient = new TenantPrismaClient({ datasourceUrl: databaseUrl });
      try {
        await seedTenantData(tenantClient, {
          name: params.ownerName,
          email: params.ownerEmail,
          password: params.ownerPassword,
        });
      } finally {
        await tenantClient.$disconnect();
      }

      await controlClient.tenantLookup.create({
        data: { email: params.ownerEmail.toLowerCase(), tenantId: tenant.id },
      });

      await controlClient.tenant.update({
        where: { id: tenant.id },
        data: { status: "ACTIVE" },
      });

      await controlClient.platformAudit.create({
        data: { tenantId: tenant.id, actor: "system", action: "tenant.provisioned" },
      });

      log.info({ slug, tenantId: tenant.id }, "empresa provisionada com sucesso");
      return { tenantId: tenant.id, slug, databaseName };
    } catch (err) {
      log.error({ err, slug }, "falha ao provisionar empresa — revertendo registro");
      await controlClient.tenant
        .update({ where: { id: tenant.id }, data: { status: "DEACTIVATED" } })
        .catch(() => undefined);
      throw err;
    }
  }

  private buildTenantDatabaseUrl(databaseName: string): string {
    const { TENANT_DB_HOST, TENANT_DB_PORT, TENANT_DB_USER, TENANT_DB_PASSWORD } = config;
    return `postgresql://${TENANT_DB_USER}:${TENANT_DB_PASSWORD}@${TENANT_DB_HOST}:${TENANT_DB_PORT}/${databaseName}`;
  }

  /** Conecta no banco de manutencao "postgres" do mesmo servidor para criar o banco da empresa. */
  private async createPhysicalDatabase(databaseName: string): Promise<void> {
    const { TENANT_DB_HOST, TENANT_DB_PORT, TENANT_DB_USER, TENANT_DB_PASSWORD } = config;
    const admin = new PgClient({
      host: TENANT_DB_HOST,
      port: TENANT_DB_PORT,
      user: TENANT_DB_USER,
      password: TENANT_DB_PASSWORD,
      database: "postgres",
    });
    await admin.connect();
    try {
      const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
        databaseName,
      ]);
      if (rowCount === 0) {
        // Nome do banco vem de slugify() (so [a-z0-9_]) — seguro para interpolar,
        // CREATE DATABASE nao aceita parametro bind do driver.
        await admin.query(`CREATE DATABASE "${databaseName}"`);
      }
    } finally {
      await admin.end();
    }
  }

  private runMigrations(databaseUrl: string): Promise<void> {
    return spawnPrismaMigrateDeploy({
      schemaPath: TENANT_SCHEMA_PATH,
      cwd: BACKEND_ROOT,
      databaseUrl,
      stdio: "inherit",
    });
  }
}

export const tenantProvisioningService = new TenantProvisioningService();
