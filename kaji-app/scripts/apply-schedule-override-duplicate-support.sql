-- Allow duplicate planned occurrences on the same date for the same chore.
-- Idempotent and safe to rerun.

BEGIN;

-- Old phase2 script created a unique index that blocks duplicate dates.
DROP INDEX IF EXISTS "ChoreScheduleOverride_choreId_date_key";

-- Keep lookup performance without enforcing uniqueness.
CREATE INDEX IF NOT EXISTS "ChoreScheduleOverride_choreId_date_idx"
  ON "ChoreScheduleOverride" ("choreId", "date");

CREATE INDEX IF NOT EXISTS "ChoreScheduleOverride_choreId_idx"
  ON "ChoreScheduleOverride" ("choreId");

COMMIT;
