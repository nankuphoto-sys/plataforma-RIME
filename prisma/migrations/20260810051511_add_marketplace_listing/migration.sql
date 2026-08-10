-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "marketplaceDescription" TEXT,
ADD COLUMN     "marketplaceListed" BOOLEAN NOT NULL DEFAULT false;
