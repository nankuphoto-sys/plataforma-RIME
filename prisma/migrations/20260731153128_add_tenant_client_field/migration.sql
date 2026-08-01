-- CreateEnum
CREATE TYPE "CustomClientFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN');

-- CreateTable
CREATE TABLE "TenantClientField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomClientFieldType" NOT NULL,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantClientField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantClientField_tenantId_idx" ON "TenantClientField"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantClientField_tenantId_key_key" ON "TenantClientField"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "TenantClientField" ADD CONSTRAINT "TenantClientField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
