-- AlterTable
ALTER TABLE "NotificationQueue" ADD COLUMN     "packageId" TEXT;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SessionPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
