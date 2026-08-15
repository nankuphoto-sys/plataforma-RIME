-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "category" TEXT,
ADD COLUMN     "supplier" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "lowStockAlertPhone" TEXT;

-- DataMigration: copiar el número de alerta de stock bajo del tenant a cada
-- una de sus sedes, ANTES de borrar la columna vieja — si no, los tenants
-- que ya tenían alertas configuradas se quedarían sin avisos silenciosamente.
UPDATE "Location"
SET "lowStockAlertPhone" = "Tenant"."lowStockAlertPhone"
FROM "Tenant"
WHERE "Location"."tenantId" = "Tenant"."id"
  AND "Tenant"."lowStockAlertPhone" IS NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "lowStockAlertPhone";
