-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TenantMigrationState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'PROVISIONING',
    "planCode" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_data_source" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encryptedUrl" TEXT NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL,
    "databaseName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_lookup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_lookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_migration_status" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "migrationName" TEXT NOT NULL,
    "state" "TenantMigrationState" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_migration_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_data_source_tenantId_key" ON "tenant_data_source"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_lookup_email_idx" ON "tenant_lookup"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_lookup_email_tenantId_key" ON "tenant_lookup"("email", "tenantId");

-- CreateIndex
CREATE INDEX "tenant_migration_status_state_idx" ON "tenant_migration_status"("state");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_migration_status_tenantId_migrationName_key" ON "tenant_migration_status"("tenantId", "migrationName");

-- CreateIndex
CREATE INDEX "platform_audit_tenantId_idx" ON "platform_audit"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_data_source" ADD CONSTRAINT "tenant_data_source_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_lookup" ADD CONSTRAINT "tenant_lookup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_migration_status" ADD CONSTRAINT "tenant_migration_status_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit" ADD CONSTRAINT "platform_audit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
