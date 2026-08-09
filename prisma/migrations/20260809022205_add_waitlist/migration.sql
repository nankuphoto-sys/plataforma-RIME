-- CreateEnum
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('WAITING', 'NOTIFIED', 'BOOKED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'WAITLIST_SLOT_OPENED';

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "professionalId" TEXT,
    "preferredFrom" TIMESTAMP(3),
    "preferredTo" TIMESTAMP(3),
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_tenantId_locationId_serviceId_status_idx" ON "WaitlistEntry"("tenantId", "locationId", "serviceId", "status");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
