import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { SIM, SIM_WOMAN_PILOT } from "@/lib/demo-sim";
import type { LatLng } from "@/lib/geo";
import { setUpDemo } from "@/lib/services/accounts";
import { tickDemoRide } from "@/lib/services/demo-sim";
import { goOnline, listOpenOffers } from "@/lib/services/pilots";
import { quoteFare } from "@/lib/services/quotes";
import { bookRide } from "@/lib/services/rides";
import {
  relaxWomenOnly,
  setWomenOnlyPreference,
  setWomenPassengersMode,
  simulateIdentityVerification,
} from "@/lib/services/women-only";

/** Women-only matching against a real database (docs/PRD.md F4). */

const HSR: LatLng = { lat: 12.9116, lng: 77.6474 };
const KORAMANGALA: LatLng = { lat: 12.9352, lng: 77.6245 };
const anon = () => ({ id: randomUUID(), email: null, isAnonymous: true });
// 2 pm and 11 pm in India, today.
const today = new Date().toISOString().slice(0, 10);
const DAY = new Date(`${today}T08:30:00Z`);
const NIGHT = new Date(`${today}T17:30:00Z`);

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
});
afterAll(async () => {
  await db.$disconnect();
});

async function clearTheRoads() {
  await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
}

async function pilot({ woman = false } = {}) {
  const id = (await setUpDemo(anon(), "pilot")).id;
  if (woman) await simulateIdentityVerification(id);
  await goOnline(id, HSR);
  return id;
}

async function rider({ woman = false } = {}) {
  const id = (await setUpDemo(anon(), "rider")).id;
  if (woman) await simulateIdentityVerification(id);
  return id;
}

async function book(riderId: string, opts: { womenOnly?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const q = await quoteFare(
    riderId,
    { address: "HSR Layout", point: HSR },
    { address: "Koramangala", point: KORAMANGALA },
    now,
  );
  return (
    await bookRide(
      riderId,
      { quoteId: q.quoteId, tier: "go", paymentMethod: "cash", womenOnly: opts.womenOnly },
      now,
    )
  ).rideId;
}

/** Offers open for this Pilot, as seen at the same moment the ride was booked. */
const offeredTo = async (pilotId: string, now = new Date()) =>
  (await listOpenOffers(pilotId, now)).map((o) => o.rideId);

describe("women Pilots only", () => {
  it("needs a verified rider", async () => {
    const id = await rider();
    await expect(book(id, { womenOnly: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setWomenOnlyPreference(id, "always", "ask")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await setWomenOnlyPreference(id, "off", "wait"); // turning it off is always allowed
  });

  it("is offered only to verified women Pilots, who see it marked women-only", async () => {
    await clearTheRoads();
    const man = await pilot();
    const woman = await pilot({ woman: true });
    const rideId = await book(await rider({ woman: true }), { womenOnly: true });
    expect(await offeredTo(man)).not.toContain(rideId);
    const offers = await listOpenOffers(woman);
    expect(offers.map((o) => o.rideId)).toContain(rideId);
    expect(offers.find((o) => o.rideId === rideId)?.womenOnly).toBe(true);
  });

  it("can be relaxed by the rider to match any Pilot", async () => {
    await clearTheRoads();
    const man = await pilot();
    const riderId = await rider({ woman: true });
    const rideId = await book(riderId, { womenOnly: true });
    expect(await offeredTo(man)).not.toContain(rideId);
    await relaxWomenOnly(riderId, rideId);
    expect(await offeredTo(man)).toContain(rideId);
    expect((await db.ride.findUniqueOrThrow({ where: { id: rideId } })).womenOnly).toBe(false);
  });

  it("only the rider can relax it", async () => {
    await clearTheRoads();
    const riderId = await rider({ woman: true });
    const rideId = await book(riderId, { womenOnly: true });
    await relaxWomenOnly(await rider(), rideId).catch(() => undefined);
    expect((await db.ride.findUniqueOrThrow({ where: { id: rideId } })).womenOnly).toBe(true);
  });

  it("gets a woman simulated Pilot on a demo ride", async () => {
    await clearTheRoads();
    const riderId = await rider({ woman: true });
    const rideId = await book(riderId, { womenOnly: true });
    const { requestedAt } = await db.ride.findUniqueOrThrow({ where: { id: rideId } });
    const view = await tickDemoRide(
      riderId,
      rideId,
      new Date(requestedAt.getTime() + (SIM.ACCEPT_AT_S + 1) * 1000),
    );
    expect(view.pilot?.name).toContain(SIM_WOMAN_PILOT.split(" ")[0]);
  });
});

describe("women passengers only", () => {
  it("needs a verified Pilot", async () => {
    const id = (await setUpDemo(anon(), "pilot")).id;
    await expect(setWomenPassengersMode(id, "always")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sends the Pilot only riders verified as women", async () => {
    await clearTheRoads();
    const woman = await pilot({ woman: true });
    await setWomenPassengersMode(woman, "always");
    const fromMan = await book(await rider());
    const fromWoman = await book(await rider({ woman: true }));
    const offers = await offeredTo(woman);
    expect(offers).toContain(fromWoman);
    expect(offers).not.toContain(fromMan);
  });

  it("in night-only mode, applies between 9 pm and 6 am", async () => {
    await clearTheRoads();
    const woman = await pilot({ woman: true });
    await setWomenPassengersMode(woman, "night");
    const byDay = await book(await rider(), { now: DAY });
    expect(await offeredTo(woman, DAY)).toContain(byDay);

    await clearTheRoads();
    const nightPilot = await pilot({ woman: true });
    await setWomenPassengersMode(nightPilot, "night");
    const atNight = await book(await rider(), { now: NIGHT });
    expect(await offeredTo(nightPilot, NIGHT)).not.toContain(atNight);
  });
});
