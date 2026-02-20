-- Migration to add scheduledDate to ChoreRecord model
ALTER TABLE "ChoreRecord" ADD COLUMN "scheduledDate" TEXT;
