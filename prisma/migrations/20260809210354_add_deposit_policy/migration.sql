-- CreateEnum
CREATE TYPE "DepositPolicy" AS ENUM ('NONE', 'DEPOSIT', 'FULL_PAYMENT');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'FULL');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'FULL';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "depositPolicy" "DepositPolicy" NOT NULL DEFAULT 'FULL_PAYMENT',
ADD COLUMN     "depositType" "DepositType",
ADD COLUMN     "depositValue" DECIMAL(10,2);
