-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('APPOINTMENT_REMINDER', 'REENGAGEMENT_FOLLOWUP', 'PACKAGE_EXPIRATION');

-- CreateEnum
CREATE TYPE "SessionPackageStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- DropIndex
DROP INDEX "NotificationQueue_tenantId_status_scheduledFor_idx";

-- AlterTable: agregamos `kind` nullable primero para poder rellenar las filas
-- existentes antes de exigir NOT NULL (editado a mano — Prisma generó esto
-- como un solo paso NOT NULL, que falla contra una tabla con filas).
ALTER TABLE "NotificationQueue" ADD COLUMN     "kind" "NotificationKind";

-- Backfill: antes de esta migración el discriminador era implícito por la
-- combinación de appointmentId/clientId null (ver comentario en schema.prisma
-- sobre NotificationQueue) — reconstruimos `kind` a partir de esa misma
-- regla para las filas que ya existen. Ninguna fila debería tener ambos
-- campos null o ambos seteados bajo el invariante viejo; si existiera alguna
-- así, queda deliberadamente sin `kind` para que el siguiente paso (SET NOT
-- NULL) falle en vez de adivinar.
UPDATE "NotificationQueue" SET "kind" = 'APPOINTMENT_REMINDER' WHERE "appointmentId" IS NOT NULL;
UPDATE "NotificationQueue" SET "kind" = 'REENGAGEMENT_FOLLOWUP' WHERE "appointmentId" IS NULL AND "clientId" IS NOT NULL;

-- AlterTable: ahora que todas las filas existentes tienen `kind`, exigimos NOT NULL.
ALTER TABLE "NotificationQueue" ALTER COLUMN "kind" SET NOT NULL;

-- CreateTable
CREATE TABLE "SessionPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT,
    "totalSessions" INTEGER NOT NULL,
    "usedSessions" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2),
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "SessionPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageRedemption" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "PackageRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionPackage_tenantId_idx" ON "SessionPackage"("tenantId");

-- CreateIndex
CREATE INDEX "SessionPackage_clientId_idx" ON "SessionPackage"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageRedemption_appointmentId_key" ON "PackageRedemption"("appointmentId");

-- CreateIndex
CREATE INDEX "PackageRedemption_packageId_idx" ON "PackageRedemption"("packageId");

-- CreateIndex
CREATE INDEX "NotificationQueue_tenantId_kind_status_scheduledFor_idx" ON "NotificationQueue"("tenantId", "kind", "status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "SessionPackage" ADD CONSTRAINT "SessionPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPackage" ADD CONSTRAINT "SessionPackage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPackage" ADD CONSTRAINT "SessionPackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageRedemption" ADD CONSTRAINT "PackageRedemption_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SessionPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageRedemption" ADD CONSTRAINT "PackageRedemption_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
