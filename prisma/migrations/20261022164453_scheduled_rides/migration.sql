-- AlterEnum
ALTER TYPE "ride_status" ADD VALUE 'scheduled';

-- AlterTable
ALTER TABLE "rides" ADD COLUMN     "scheduled_for" TIMESTAMPTZ;
