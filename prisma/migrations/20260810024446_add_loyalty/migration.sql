-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "loyaltyRewardsRedeemed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyStamps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyRewardDescription" TEXT,
ADD COLUMN     "loyaltyStampsRequired" INTEGER NOT NULL DEFAULT 10;
