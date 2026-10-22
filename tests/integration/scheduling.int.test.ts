import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { scheduleWindow } from "@/lib/scheduling";
import { setUpDemo } from "@/lib/services/accounts";
import { listRides } from "@/lib/services/history";
import { goOnline, listOpenOffers } from "@/lib/services/pilots";
import { quoteFare } from "@/lib/services/quotes";
import { bookRide, cancelRideAsRider, getRiderActiveRide } from "@/lib/services/rides";
import { dispatchDueScheduledRides } from "@/lib/services/scheduling";

/** Rides booked ahead against a real database (lib/scheduling.ts). */

const KORAMANGALA: LatLng = { lat: 12.9352, lng: 77.6245 };
const MG_ROAD: LatLng = { lat: 12.9756, lng: 77.6066 };
const anon = () => ({ id: randomUUID(), email: null, isAnonymous: true });
const minutes = (from: Date, m: number) => new Date(from.getTime() + m * 60_000);

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
});
afterAll(async () => {
  await db.$disconnect();
});

async function book(riderId: string, scheduledFor: Date | null, now = new Date()) {
  const q = await quoteFare(
    riderId,
    { address: "Koramangala", point: KORAMANGALA },
    { address: "MG Road", point: MG_ROAD },
    now,
  );
  return bookRide(
    riderId,
    { quoteId: q.quoteId, tier: "go", paymentMethod: "cash", scheduledFor },
    now,
  );
}

const rider = async () => (await setUpDemo(anon(), "rider")).id;

describe("booking ahead", () => {
  it("books a scheduled ride that no Pilot sees yet, and lists it as upcoming", async () => {
    await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
    const pilotId = (await setUpDemo(anon(), "pilot")).id;
    await goOnline(pilotId, KORAMANGALA);
    const riderId = await rider();
    const pickup = minutes(scheduleWindow(new Date()).earliest, 60);
    const { rideId, scheduled } = await book(riderId, pickup);
    expect(scheduled).toBe(true);
    const ride = await db.ride.findUniqueOrThrow({ where: { id: rideId } });
    expect(ride).toMatchObject({ status: "scheduled", scheduledFor: pickup });
    expect((await listOpenOffers(pilotId)).map((o) => o.rideId)).not.toContain(rideId);
    expect((await listRides(riderId, "upcoming", null)).items.map((i) => i.id)).toEqual([rideId]);
    // Doesn't stop booking a ride right now.
    expect(await getRiderActiveRide(riderId)).toBeNull();
    await book(riderId, null);
  });

  it("refuses times outside the window or off the quarter hour, and more than three", async () => {
    const riderId = await rider();
    const { earliest } = scheduleWindow(new Date());
    await expect(book(riderId, minutes(earliest, -15))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(book(riderId, minutes(earliest, 5))).rejects.toMatchObject({ code: "VALIDATION" });
    for (let i = 0; i < 3; i++) await book(riderId, minutes(earliest, 15 * i));
    await expect(book(riderId, minutes(earliest, 60))).rejects.toMatchObject({
      message: "You can have up to 3 rides booked ahead.",
    });
  });

  it("is offered to Pilots 15 minutes before pickup, once", async () => {
    await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
    const pilotId = (await setUpDemo(anon(), "pilot")).id;
    await goOnline(pilotId, KORAMANGALA);
    const riderId = await rider();
    const bookedAt = new Date();
    const pickup = scheduleWindow(bookedAt).earliest;
    const { rideId } = await book(riderId, pickup, bookedAt);

    await dispatchDueScheduledRides(minutes(pickup, -16));
    expect((await db.ride.findUniqueOrThrow({ where: { id: rideId } })).status).toBe("scheduled");
    // Two screens polling at the same moment release it once.
    const at = minutes(pickup, -15);
    await Promise.all([dispatchDueScheduledRides(at), dispatchDueScheduledRides(at)]);
    const ride = await db.ride.findUniqueOrThrow({ where: { id: rideId } });
    expect(ride.status).toBe("requested");
    expect(await db.rideEvent.count({ where: { rideId, type: "ride.dispatched" } })).toBe(1);
    expect(await db.rideOffer.count({ where: { rideId, pilotId } })).toBe(1);
  });

  it("expires a ride nobody released in time", async () => {
    const riderId = await rider();
    const bookedAt = new Date();
    const pickup = scheduleWindow(bookedAt).earliest;
    const { rideId } = await book(riderId, pickup, bookedAt);
    await dispatchDueScheduledRides(minutes(pickup, 11));
    expect((await db.ride.findUniqueOrThrow({ where: { id: rideId } })).status).toBe("expired");
  });

  it("cancels free before release, and only by its rider", async () => {
    const riderId = await rider();
    const { rideId } = await book(riderId, minutes(scheduleWindow(new Date()).earliest, 120));
    await expect(cancelRideAsRider(await rider(), rideId, null)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await cancelRideAsRider(riderId, rideId, "plans_changed")).toEqual({
      feePaise: 0,
      charged: "none",
    });
  });
});
