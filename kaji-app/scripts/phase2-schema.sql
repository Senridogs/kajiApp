-- Phase2 schema apply script (PostgreSQL)
-- Target: notifyReminder + ChoreRecordReaction + ChoreScheduleOverride
-- Safe to rerun on the same DB.

BEGIN;

-- 1) Household.notifyReminder
ALTER TABLE "Household"
  ADD COLUMN IF NOT EXISTS "notifyReminder" BOOLEAN;

UPDATE "Household"
SET "notifyReminder" = COALESCE(
  "notifyReminder",
  COALESCE("notifyDueToday", FALSE) OR COALESCE("remindDailyIfOverdue", FALSE)
);

ALTER TABLE "Household"
  ALTER COLUMN "notifyReminder" SET DEFAULT TRUE;

UPDATE "Household"
SET "notifyReminder" = TRUE
WHERE "notifyReminder" IS NULL;

ALTER TABLE "Household"
  ALTER COLUMN "notifyReminder" SET NOT NULL;

-- 2) ChoreRecordReaction
CREATE TABLE IF NOT EXISTS "ChoreRecordReaction" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChoreRecordReaction_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ChoreRecordReaction_recordId_fkey'
  ) THEN
    ALTER TABLE "ChoreRecordReaction"
      ADD CONSTRAINT "ChoreRecordReaction_recordId_fkey"
      FOREIGN KEY ("recordId")
      REFERENCES "ChoreRecord"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ChoreRecordReaction_userId_fkey'
  ) THEN
    ALTER TABLE "ChoreRecordReaction"
      ADD CONSTRAINT "ChoreRecordReaction_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ChoreRecordReaction_recordId_userId_key"
  ON "ChoreRecordReaction" ("recordId", "userId");

CREATE INDEX IF NOT EXISTS "ChoreRecordReaction_recordId_idx"
  ON "ChoreRecordReaction" ("recordId");

-- 3) ChoreScheduleOverride
CREATE TABLE IF NOT EXISTS "ChoreScheduleOverride" (
  "id" TEXT NOT NULL,
  "choreId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChoreScheduleOverride_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ChoreScheduleOverride_choreId_fkey'
  ) THEN
    ALTER TABLE "ChoreScheduleOverride"
      ADD CONSTRAINT "ChoreScheduleOverride_choreId_fkey"
      FOREIGN KEY ("choreId")
      REFERENCES "Chore"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ChoreScheduleOverride_choreId_date_key"
  ON "ChoreScheduleOverride" ("choreId", "date");

CREATE INDEX IF NOT EXISTS "ChoreScheduleOverride_choreId_idx"
  ON "ChoreScheduleOverride" ("choreId");

COMMIT;
