/**
 * Aplica migrations pendentes do schema de tenant em TODOS os bancos de
 * empresas ativas. Roda em lotes com concorrencia limitada; falha em um
 * tenant nao impede os demais. Retomavel: tenants com estado DONE para a
 * migration atual sao pulados numa nova execucao.
 *
 * Uso: npm run migrate:tenants
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { controlClient } from "../controlClient.js";
import { decryptDatasourceUrl } from "../crypto/datasourceCipher.js";
import { logger } from "../logger.js";
import { spawnPrismaMigrateDeploy } from "./spawnPrismaMigrateDeploy.js";

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TENANT_SCHEMA_PATH = path.join("prisma", "tenant", "schema.prisma");
const CONCURRENCY = 4;
// Identifica o lote de migrations pendentes no momento em que o script comeca.
// Cada execucao do runner e uma "migrationName" — simples e auditavel.
const MIGRATION_BATCH_NAME = `batch-${new Date().toISOString()}`;

function runMigrateDeploy(databaseUrl: string): Promise<void> {
  return spawnPrismaMigrateDeploy({
    schemaPath: TENANT_SCHEMA_PATH,
    cwd: BACKEND_ROOT,
    databaseUrl,
    stdio: "pipe",
  });
}

async function processTenant(tenant: { id: string; slug: string }) {
  const already = await controlClient.tenantMigrationStatus.findUnique({
    where: { tenantId_migrationName: { tenantId: tenant.id, migrationName: MIGRATION_BATCH_NAME } },
  });
  if (already?.state === "DONE") {
    logger.info({ slug: tenant.slug }, "ja migrado neste lote, pulando");
    return;
  }

  await controlClient.tenantMigrationStatus.upsert({
    where: { tenantId_migrationName: { tenantId: tenant.id, migrationName: MIGRATION_BATCH_NAME } },
    create: { tenantId: tenant.id, migrationName: MIGRATION_BATCH_NAME, state: "RUNNING", startedAt: new Date() },
    update: { state: "RUNNING", startedAt: new Date(), errorMessage: null },
  });

  try {
    const dataSource = await controlClient.tenantDataSource.findUniqueOrThrow({
      where: { tenantId: tenant.id },
    });
    const databaseUrl = decryptDatasourceUrl(dataSource.encryptedUrl);
    await runMigrateDeploy(databaseUrl);

    await controlClient.tenantMigrationStatus.update({
      where: { tenantId_migrationName: { tenantId: tenant.id, migrationName: MIGRATION_BATCH_NAME } },
      data: { state: "DONE", finishedAt: new Date() },
    });
    logger.info({ slug: tenant.slug }, "migration aplicada com sucesso");
  } catch (err) {
    await controlClient.tenantMigrationStatus.update({
      where: { tenantId_migrationName: { tenantId: tenant.id, migrationName: MIGRATION_BATCH_NAME } },
      data: { state: "FAILED", errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err, slug: tenant.slug }, "falha ao migrar tenant — seguindo para os demais");
  }
}

async function runInBatches<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(worker));
  }
}

async function main() {
  const tenants = await controlClient.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, slug: true },
  });
  logger.info({ count: tenants.length, batch: MIGRATION_BATCH_NAME }, "iniciando migration em lote");

  await runInBatches(tenants, CONCURRENCY, processTenant);

  const results = await controlClient.tenantMigrationStatus.findMany({
    where: { migrationName: MIGRATION_BATCH_NAME },
  });
  const failed = results.filter((r) => r.state === "FAILED");
  logger.info(
    { total: results.length, done: results.length - failed.length, failed: failed.length },
    "migration em lote concluida",
  );
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    logger.error({ err }, "erro fatal no runner de migrations");
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlClient.$disconnect();
  });
