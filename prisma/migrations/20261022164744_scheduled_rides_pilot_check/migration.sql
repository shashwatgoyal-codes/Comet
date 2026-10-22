-- A ride booked ahead has no Pilot until it's released, like a request.
ALTER TABLE "rides" DROP CONSTRAINT "rides_pilot_when_assigned";
ALTER TABLE "rides" ADD CONSTRAINT "rides_pilot_when_assigned" CHECK (
  "status" IN ('scheduled', 'requested', 'expired')
  OR ("status" = 'cancelled' AND "pilot_id" IS NULL)
  OR "pilot_id" IS NOT NULL
);
