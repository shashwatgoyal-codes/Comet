-- Rules for rides booked ahead (separate from the migration that adds the
-- 'scheduled' value: Postgres won't use a new enum value in the same
-- transaction that adds it).

ALTER TABLE "rides" ADD CONSTRAINT "rides_scheduled_has_time"
  CHECK ("status" <> 'scheduled' OR "scheduled_for" IS NOT NULL);

-- Finding rides due to be offered to Pilots.
CREATE INDEX "rides_scheduled_due_idx" ON "rides" ("scheduled_for") WHERE "status" = 'scheduled';

-- The state machine, now with scheduled rides. Keep in sync with
-- lib/ride-state.ts (tests/integration/rides.int.test.ts checks both).
CREATE OR REPLACE FUNCTION "enforce_ride_transition"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;
  IF (OLD."status", NEW."status") IN (
    ('scheduled', 'requested'), ('scheduled', 'cancelled'), ('scheduled', 'expired'),
    ('requested', 'accepted'), ('requested', 'cancelled'), ('requested', 'expired'),
    ('accepted', 'arrived'), ('accepted', 'cancelled'),
    ('arrived', 'in_progress'), ('arrived', 'cancelled'), ('arrived', 'no_show'),
    ('in_progress', 'completed')
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Illegal ride transition % -> %', OLD."status", NEW."status"
    USING ERRCODE = 'check_violation';
END;
$$;
