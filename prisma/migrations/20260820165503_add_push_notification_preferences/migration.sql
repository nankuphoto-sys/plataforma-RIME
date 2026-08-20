-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyAppointmentReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyDailySummary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyLowStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyNewAppointment" BOOLEAN NOT NULL DEFAULT true;
