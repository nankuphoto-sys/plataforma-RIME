-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "wompiCardLastFour" TEXT,
ADD COLUMN     "wompiFirstFailedAt" TIMESTAMP(3),
ADD COLUMN     "wompiNextChargeAt" TIMESTAMP(3),
ADD COLUMN     "wompiPaymentSourceId" TEXT,
ADD COLUMN     "wompiRetryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "WompiChargeStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'ERROR');

-- CreateTable
CREATE TABLE "TenantWompiCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "status" "WompiChargeStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "wompiTransactionId" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "TenantWompiCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_wompiPaymentSourceId_key" ON "Tenant"("wompiPaymentSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantWompiCharge_reference_key" ON "TenantWompiCharge"("reference");

-- CreateIndex
CREATE INDEX "TenantWompiCharge_tenantId_idx" ON "TenantWompiCharge"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantWompiCharge" ADD CONSTRAINT "TenantWompiCharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
