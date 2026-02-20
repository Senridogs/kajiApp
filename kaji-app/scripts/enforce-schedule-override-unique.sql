-- Enforce unique (choreId, date) for ChoreScheduleOverride.
-- 1) Remove existing duplicate rows while keeping the oldest row per (choreId, date).
-- 2) Add the unique index used by Prisma's @@unique([choreId, date]).
-- Safe to rerun.

BEGIN;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY "choreId", "date"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "ChoreScheduleOverride"
)
DELETE FROM "ChoreScheduleOverride" o
USING ranked r
WHERE o.ctid = r.ctid
  AND r.rn > 1;

DROP INDEX IF EXISTS "ChoreScheduleOverride_choreId_date_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ChoreScheduleOverride_choreId_date_key"
  ON "ChoreScheduleOverride" ("choreId", "date");

CREATE INDEX IF NOT EXISTS "ChoreScheduleOverride_choreId_idx"
  ON "ChoreScheduleOverride" ("choreId");

COMMIT;
