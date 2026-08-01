-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "appointmentId" TEXT;

-- CreateTable
CREATE TABLE "ServiceInventoryItem" (
    "serviceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityPerUse" INTEGER NOT NULL,

    CONSTRAINT "ServiceInventoryItem_pkey" PRIMARY KEY ("serviceId","itemId")
);

-- CreateIndex
CREATE INDEX "ServiceInventoryItem_itemId_idx" ON "ServiceInventoryItem"("itemId");

-- AddForeignKey
ALTER TABLE "ServiceInventoryItem" ADD CONSTRAINT "ServiceInventoryItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceInventoryItem" ADD CONSTRAINT "ServiceInventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
