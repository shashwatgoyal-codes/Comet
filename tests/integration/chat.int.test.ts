import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { SIM } from "@/lib/demo-sim";
import type { LatLng } from "@/lib/geo";
import { setUpDemo } from "@/lib/services/accounts";
import { getChat, sendMessage } from "@/lib/services/chat";
import { tickDemoRide } from "@/lib/services/demo-sim";
import { acceptOffer, goOnline, listOpenOffers } from "@/lib/services/pilots";
import { quoteFare } from "@/lib/services/quotes";
import { bookRide } from "@/lib/services/rides";
import { endTrip, markArrived, startTrip } from "@/lib/services/trips";

/** Rider–Pilot chat against a real database (docs/PRD.md F8). */

const KORAMANGALA: LatLng = { lat: 12.9352, lng: 77.6245 };
const MG_ROAD: LatLng = { lat: 12.9756, lng: 77.6066 };
const anon = () => ({ id: randomUUID(), email: null, isAnonymous: true });

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
});
afterAll(async () => {
  await db.$disconnect();
});

async function quote(riderId: string) {
  return quoteFare(
    riderId,
    { address: "Koramangala", point: KORAMANGALA },
    { address: "MG Road", point: MG_ROAD },
  );
}

async function acceptedRide() {
  await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
  const pilotId = (await setUpDemo(anon(), "pilot")).id;
  await goOnline(pilotId, KORAMANGALA);
  const riderId = (await setUpDemo(anon(), "rider")).id;
  const q = await quote(riderId);
  const { rideId } = await bookRide(riderId, {
    quoteId: q.quoteId,
    tier: "go",
    paymentMethod: "cash",
  });
  await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);
  const { rideCode } = await db.ride.findUniqueOrThrow({ where: { id: rideId } });
  return { pilotId, riderId, rideId, rideCode };
}

describe("chat", () => {
  it("delivers messages both ways, with unread counts and seen receipts", async () => {
    const { riderId, pilotId, rideId } = await acceptedRide();
    await sendMessage(riderId, rideId, "I'm at the bus stop", false);
    expect((await getChat(pilotId, rideId, false)).unread).toBe(1);
    const pilotView = await getChat(pilotId, rideId, true);
    expect(pilotView.messages).toEqual([
      expect.objectContaining({ mine: false, body: "I'm at the bus stop" }),
    ]);
    const riderView = await getChat(riderId, rideId, false);
    expect(riderView.messages[0]).toMatchObject({ mine: true, seen: true });
    expect(riderView.unread).toBe(0);
  });

  it("keeps a driving Pilot to quick replies, but lets them type at the pickup", async () => {
    const { pilotId, rideId } = await acceptedRide();
    expect((await getChat(pilotId, rideId, false)).canType).toBe(false);
    await expect(sendMessage(pilotId, rideId, "typing while driving", false)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
    await sendMessage(pilotId, rideId, "On my way", true);
    await markArrived(pilotId, rideId);
    expect((await getChat(pilotId, rideId, false)).canType).toBe(true);
    await sendMessage(pilotId, rideId, "I'm by the blue gate", false);
  });

  it("is private to the ride's two people, and closes when the trip ends", async () => {
    const { riderId, pilotId, rideId, rideCode } = await acceptedRide();
    const stranger = (await setUpDemo(anon(), "rider")).id;
    await expect(getChat(stranger, rideId, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(sendMessage(stranger, rideId, "hi", false)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await sendMessage(riderId, rideId, "Thanks!", false);
    await markArrived(pilotId, rideId);
    await startTrip(pilotId, rideId, rideCode);
    await endTrip(pilotId, rideId);
    await expect(sendMessage(riderId, rideId, "One more thing", false)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Still readable afterwards.
    expect((await getChat(riderId, rideId, false)).messages).toHaveLength(1);
  });

  it("can't be used before a Pilot accepts", async () => {
    await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
    const riderId = (await setUpDemo(anon(), "rider")).id;
    const q = await quote(riderId);
    const { rideId } = await bookRide(riderId, {
      quoteId: q.quoteId,
      tier: "go",
      paymentMethod: "cash",
    });
    await expect(sendMessage(riderId, rideId, "hello?", false)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("gets a reply from the simulated demo Pilot", async () => {
    await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
    const riderId = (await setUpDemo(anon(), "rider")).id;
    const q = await quote(riderId);
    const { rideId } = await bookRide(riderId, {
      quoteId: q.quoteId,
      tier: "go",
      paymentMethod: "cash",
    });
    const { requestedAt } = await db.ride.findUniqueOrThrow({ where: { id: rideId } });
    const at = (s: number) => new Date(requestedAt.getTime() + s * 1000);
    await tickDemoRide(riderId, rideId, at(SIM.ACCEPT_AT_S + 1));
    await sendMessage(riderId, rideId, "Where are you?", false);
    await tickDemoRide(riderId, rideId, new Date(Date.now() + 3_000));
    const chat = await getChat(riderId, rideId, false);
    expect(chat.messages.at(-1)).toMatchObject({ mine: false, body: "On my way" });
    expect(chat.messages[0]).toMatchObject({ seen: true });
  });
});
