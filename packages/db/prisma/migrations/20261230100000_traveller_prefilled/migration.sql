-- AlterTable
ALTER TABLE "booking_traveller" ADD COLUMN     "prefilled_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
