-- CreateEnum
CREATE TYPE "TenantVertical" AS ENUM ('GENERAL', 'PSICOLOGIA', 'NUTRICION', 'FISIOTERAPIA', 'ESTETICA');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "vertical" "TenantVertical" NOT NULL DEFAULT 'GENERAL';
