-- CreateEnum
CREATE TYPE "MarketingCampaignSegment" AS ENUM ('ALL_CLIENTS', 'INACTIVE_60_DAYS');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'MARKETING_CAMPAIGN';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NotificationQueue" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segment" "MarketingCampaignSegment" NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_idx" ON "MarketingCampaign"("tenantId");

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
