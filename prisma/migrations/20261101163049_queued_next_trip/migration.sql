-- AlterTable
ALTER TABLE "pilot_profiles" ADD COLUMN     "chain_requests" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "rides" ADD COLUMN     "chained_after_ride_id" UUID,
ADD COLUMN     "is_queued" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_chained_after_ride_id_fkey" FOREIGN KEY ("chained_after_ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------------
-- Hand-written below: what Prisma can't express. (docs/DATABASE.md §5)
-- ------------------------------------------------------------------

-- Still one ride per Pilot at a time; a queued ride waits outside that
-- rule, and a Pilot can have at most one queued.
DROP INDEX "rides_one_active_per_pilot";
CREATE UNIQUE INDEX "rides_one_active_per_pilot"
  ON "rides" ("pilot_id")
  WHERE "status" IN ('accepted', 'arrived', 'in_progress') AND NOT "is_queued";
CREATE UNIQUE INDEX "rides_one_queued_per_pilot"
  ON "rides" ("pilot_id")
  WHERE "is_queued" AND "status" = 'accepted';

-- A queued ride is accepted and waiting (or was cancelled while waiting):
-- the Pilot can't arrive at it until it's released.
ALTER TABLE "rides" ADD CONSTRAINT "rides_queued_waits"
  CHECK (NOT "is_queued" OR ("status" IN ('accepted', 'cancelled') AND "chained_after_ride_id" IS NOT NULL));

CREATE INDEX "rides_chained_after_idx" ON "rides" ("chained_after_ride_id")
  WHERE "chained_after_ride_id" IS NOT NULL;
