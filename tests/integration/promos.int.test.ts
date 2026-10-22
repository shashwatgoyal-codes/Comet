import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { walletBalance } from "@/lib/repositories/wallet";
import { setUpDemo } from "@/lib/services/accounts";
import { confirmCashPayment } from "@/lib/services/payments";
import { acceptOffer, goOnline, listOpenOffers } from "@/lib/services/pilots";
import { listOffers, lookUpCode } from "@/lib/services/promos";
import { quoteFare } from "@/lib/services/quotes";
import { bookRide, cancelRideAsRider } from "@/lib/services/rides";
import { endTrip, markArrived, startTrip } from "@/lib/services/trips";
import { DEMO_WALLET_GRANT } from "@/lib/wallet";

/** Promo codes against a real database: discounts, cashback, uses and who pays. */

const KORAMANGALA: LatLng = { lat: 12.9352, lng: 77.6245 };
const MG_ROAD: LatLng = { lat: 12.9756, lng: 77.6066 };
const anon = () => ({ id: randomUUID(), email: null, isAnonymous: true });

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
});
afterAll(async () => {
  await db.$disconnect();
});

type Pay = "wallet" | "cash";

async function book(riderId: string, opts: { tier?: "go" | "prime"; pay?: Pay; promo?: string }) {
  const q = await quoteFare(
    riderId,
    { address: "Koramangala", point: KORAMANGALA },
    { address: "MG Road", point: MG_ROAD },
  );
  return (
    await bookRide(riderId, {
      quoteId: q.quoteId,
      tier: opts.tier ?? "go",
      paymentMethod: opts.pay ?? "wallet",
      promoCode: opts.promo ?? null,
    })
  ).rideId;
}

/** Books with a promo, has a real Pilot drive it, and returns the finished ride. */
async function finishedRide(opts: { pay: Pay; promo: string; riderId?: string }) {
  await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
  const pilotId = (await setUpDemo(anon(), "pilot")).id;
  await goOnline(pilotId, KORAMANGALA);
  const riderId = opts.riderId ?? (await setUpDemo(anon(), "rider")).id;
  const rideId = await book(riderId, { pay: opts.pay, promo: opts.promo });
  await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);
  const { rideCode } = await db.ride.findUniqueOrThrow({ where: { id: rideId } });
  await markArrived(pilotId, rideId);
  await startTrip(pilotId, rideId, rideCode);
  await endTrip(pilotId, rideId);
  return { pilotId, riderId, ride: await db.ride.findUniqueOrThrow({ where: { id: rideId } }) };
}

describe("promo codes", () => {
  it("lists live offers, without ended ones", async () => {
    const riderId = (await setUpDemo(anon(), "rider")).id;
    const codes = (await listOffers(riderId)).map((o) => o.code);
    expect(codes).toEqual(expect.arrayContaining(["COMET30", "WALLET10", "PRIME20"]));
    expect(codes).not.toContain("MONSOON50");
    await expect(lookUpCode(riderId, "nope")).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await lookUpCode(riderId, "comet30")).code).toBe("COMET30");
  });

  it("takes COMET30 off a wallet ride; the Pilot still earns the full fare", async () => {
    const { riderId, pilotId, ride } = await finishedRide({ pay: "wallet", promo: "COMET30" });
    expect(ride).toMatchObject({ discountPaise: 3000, totalPaise: ride.farePaise - 3000 });
    expect(await walletBalance(riderId)).toBe(DEMO_WALLET_GRANT - (ride.farePaise - 3000));
    expect(await walletBalance(pilotId)).toBe(ride.farePaise - ride.platformFeePaise);
  });

  it("on a cash ride, Comet pays the Pilot the discount", async () => {
    const { pilotId, ride } = await finishedRide({ pay: "cash", promo: "COMET30" });
    await confirmCashPayment(pilotId, ride.id, ride.totalPaise, false);
    // Holding the discounted cash: owes Comet's fee, is owed the discount.
    expect(await walletBalance(pilotId)).toBe(3000 - ride.platformFeePaise);
  });

  it("credits WALLET10 cashback after a wallet-paid trip, capped at ₹25", async () => {
    const { riderId, ride } = await finishedRide({ pay: "wallet", promo: "WALLET10" });
    const expected = Math.min(Math.floor(ride.farePaise / 10), 2500);
    expect(ride.cashbackPaise).toBe(expected);
    expect(await walletBalance(riderId)).toBe(DEMO_WALLET_GRANT - ride.totalPaise + expected);
  });

  it("refuses codes that don't fit the ride, with the reason", async () => {
    const riderId = (await setUpDemo(anon(), "rider")).id;
    await expect(book(riderId, { promo: "PRIME20" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "PRIME20 only works on Comet Prime rides.",
    });
    await expect(book(riderId, { pay: "cash", promo: "WALLET10" })).rejects.toMatchObject({
      message: "Pay with Comet Wallet to use WALLET10.",
    });
    await expect(book(riderId, { promo: "MONSOON50" })).rejects.toMatchObject({
      message: "MONSOON50 has ended.",
    });
    await expect(book(riderId, { promo: "NOSUCH" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("can be used once; a cancelled ride gives the use back", async () => {
    await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
    const riderId = (await setUpDemo(anon(), "rider")).id;
    const first = await book(riderId, { promo: "COMET30" });
    await cancelRideAsRider(riderId, first, null);
    // Cancelled, so it doesn't count: the code still works.
    await finishedRide({ pay: "wallet", promo: "COMET30", riderId });
    await expect(book(riderId, { promo: "COMET30" })).rejects.toMatchObject({
      message: "You've already used COMET30.",
    });
  });
});
