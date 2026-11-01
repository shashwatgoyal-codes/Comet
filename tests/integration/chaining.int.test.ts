import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { getPilotLocation } from "@/lib/repositories/pilot-locations";
import { setUpDemo } from "@/lib/services/accounts";
import { confirmCashPayment } from "@/lib/services/payments";
import {
  acceptOffer,
  getPilotCurrentRide,
  goOnline,
  listOpenOffers,
  setChainRequests,
} from "@/lib/services/pilots";
import { quoteFare } from "@/lib/services/quotes";
import { bookRide, cancelRideAsRider, getRiderRide } from "@/lib/services/rides";
import { endTrip, getPilotRide, markArrived, startTrip } from "@/lib/services/trips";

/** Queued next trips against a real database (docs/PRD.md F12). */

const KORAMANGALA: LatLng = { lat: 12.9352, lng: 77.6245 };
const MG_ROAD: LatLng = { lat: 12.9756, lng: 77.6066 };
/** ~450 m from the MG Road drop-off. */
const NEAR_DROP: LatLng = { lat: 12.9796, lng: 77.6066 };
/** ~4 km from it: in matching's 5 km, but too far to chain. */
const FAR_FROM_DROP: LatLng = { lat: 12.9395, lng: 77.6066 };
const anon = () => ({ id: randomUUID(), email: null, isAnonymous: true });

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
});
afterAll(async () => {
  await db.$disconnect();
});

async function book(from: LatLng, to: LatLng, pay: "cash" | "wallet" = "cash") {
  const riderId = (await setUpDemo(anon(), "rider")).id;
  const q = await quoteFare(
    riderId,
    { address: "Pickup", point: from },
    { address: "Drop", point: to },
  );
  const { rideId } = await bookRide(riderId, {
    quoteId: q.quoteId,
    tier: "go",
    paymentMethod: pay,
  });
  return { riderId, rideId };
}

/**
 * A Pilot on a trip from Koramangala to MG Road, with `remainingS` left on
 * the route. Every other Pilot is offline, so offers go only to them.
 */
async function pilotOnTrip(remainingS = 120) {
  await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
  const pilotId = (await setUpDemo(anon(), "pilot")).id;
  await goOnline(pilotId, KORAMANGALA);
  const current = await book(KORAMANGALA, MG_ROAD);
  await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);
  const { rideCode, durationS } = await db.ride.findUniqueOrThrow({
    where: { id: current.rideId },
  });
  await markArrived(pilotId, current.rideId);
  await startTrip(pilotId, current.rideId, rideCode);
  await db.ride.update({
    where: { id: current.rideId },
    data: { startedAt: new Date(Date.now() - (durationS - remainingS) * 1000) },
  });
  return { pilotId, current };
}

describe("queued next trips", () => {
  it("offers a pickup near the drop near the end; accepting queues it", async () => {
    const { pilotId, current } = await pilotOnTrip(120);
    const next = await book(NEAR_DROP, KORAMANGALA);

    const [offer] = await listOpenOffers(pilotId);
    expect(offer?.rideId).toBe(next.rideId);
    expect(offer?.chained).toMatchObject({ afterRider: "Aarav" });
    expect(offer!.chained!.remainingS).toBeGreaterThan(100);
    expect(offer!.chained!.fromDropM).toBeLessThan(600);

    await acceptOffer(pilotId, offer!.offerId);
    const ride = await db.ride.findUniqueOrThrow({ where: { id: next.rideId } });
    expect(ride).toMatchObject({
      status: "accepted",
      pilotId,
      isQueued: true,
      chainedAfterRideId: current.rideId,
    });
    expect((await getRiderRide(next.riderId, next.rideId)).queued).toMatchObject({
      fromDropM: expect.any(Number),
    });
    expect((await getPilotRide(pilotId, current.rideId)).nextTrip?.rideId).toBe(next.rideId);
    // Still on the first trip: the next pickup has to wait.
    expect((await getPilotCurrentRide(pilotId))?.id).toBe(current.rideId);
    await expect(markArrived(pilotId, next.rideId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("after the drop, collects the cash first, then the next ride is current", async () => {
    const { pilotId, current } = await pilotOnTrip(60);
    const next = await book(NEAR_DROP, KORAMANGALA);
    await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);

    await endTrip(pilotId, current.rideId);
    const released = await db.ride.findUniqueOrThrow({ where: { id: next.rideId } });
    expect(released.isQueued).toBe(false);
    expect((await getPilotLocation(pilotId))?.isAvailable).toBe(false);
    expect((await getRiderRide(next.riderId, next.rideId)).queued).toBeNull();

    // The cash for the trip just ended comes first.
    const first = await getPilotCurrentRide(pilotId);
    expect(first?.id).toBe(current.rideId);
    expect(first?.nextTrip?.rideId).toBe(next.rideId);
    await confirmCashPayment(pilotId, current.rideId, first!.totalPaise, false);
    expect((await getPilotCurrentRide(pilotId))?.id).toBe(next.rideId);
    await markArrived(pilotId, next.rideId);
  });

  it("isn't offered too early, too far from the drop, or with the setting off", async () => {
    const early = await pilotOnTrip(600);
    await book(NEAR_DROP, KORAMANGALA);
    expect(await listOpenOffers(early.pilotId)).toEqual([]);

    const far = await pilotOnTrip(60);
    await book(FAR_FROM_DROP, KORAMANGALA);
    expect(await listOpenOffers(far.pilotId)).toEqual([]);

    const off = await pilotOnTrip(60);
    await setChainRequests(off.pilotId, false);
    await book(NEAR_DROP, KORAMANGALA);
    expect(await listOpenOffers(off.pilotId)).toEqual([]);
  });

  it("queues at most one next trip", async () => {
    const { pilotId } = await pilotOnTrip(60);
    await book(NEAR_DROP, KORAMANGALA);
    await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);
    await book(NEAR_DROP, MG_ROAD);
    expect(await listOpenOffers(pilotId)).toEqual([]);
  });

  it("free Pilots come first; a chained Pilot fills the rest of the wave", async () => {
    const { pilotId: busy } = await pilotOnTrip(60);
    const free = (await setUpDemo(anon(), "pilot")).id;
    await goOnline(free, MG_ROAD);
    const next = await book(NEAR_DROP, KORAMANGALA);
    const offers = await db.rideOffer.findMany({ where: { rideId: next.rideId } });
    expect(offers.map((o) => o.pilotId)).toEqual(expect.arrayContaining([free, busy]));
  });

  it("cancelling a queued ride is free and leaves the Pilot on their trip", async () => {
    const { pilotId, current } = await pilotOnTrip(60);
    const next = await book(NEAR_DROP, KORAMANGALA);
    await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);
    // Long past the free 3 minutes.
    await db.ride.update({
      where: { id: next.rideId },
      data: { requestedAt: new Date(Date.now() - 10 * 60_000) },
    });
    const result = await cancelRideAsRider(next.riderId, next.rideId, "plans_changed");
    expect(result).toMatchObject({ feePaise: 0 });
    expect((await getPilotLocation(pilotId))?.isAvailable).toBe(false);
    expect((await getPilotCurrentRide(pilotId))?.id).toBe(current.rideId);
  });

  it("the database refuses arriving at a queued ride", async () => {
    const { pilotId } = await pilotOnTrip(60);
    const next = await book(NEAR_DROP, KORAMANGALA);
    await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);
    await expect(
      db.ride.update({
        where: { id: next.rideId },
        data: { status: "arrived", arrivedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});
