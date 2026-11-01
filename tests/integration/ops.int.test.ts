import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { DEMO_SAFETY_PIN } from "@/lib/safety";
import { ensureAccount, setUpDemo } from "@/lib/services/accounts";
import {
  acknowledgeSos,
  createPromo,
  getOpsOverview,
  resolveSos,
  setPromoActive,
} from "@/lib/services/ops";
import { acceptOffer, goOnline, listOpenOffers } from "@/lib/services/pilots";
import { listOffers, lookUpCode } from "@/lib/services/promos";
import { quoteFare } from "@/lib/services/quotes";
import { bookRide } from "@/lib/services/rides";
import { endSos, getSos, raiseSos } from "@/lib/services/sos";
import { createPromoSchema } from "@/lib/validation/ops";

/** The ops dashboard against a real database (docs/PRD.md F10). */

const KORAMANGALA: LatLng = { lat: 12.9352, lng: 77.6245 };
const MG_ROAD: LatLng = { lat: 12.9756, lng: 77.6066 };
const anon = () => ({ id: randomUUID(), email: null, isAnonymous: true });
const opsAccount = async () =>
  (
    await ensureAccount({
      id: randomUUID(),
      email: `ops+${randomUUID()}@comet.test`,
      isAnonymous: false,
    })
  ).id;

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
});
afterAll(async () => {
  await db.$disconnect();
});

async function acceptedRide() {
  await db.$executeRaw`UPDATE pilot_locations SET is_online = false`;
  const pilotId = (await setUpDemo(anon(), "pilot")).id;
  await goOnline(pilotId, KORAMANGALA);
  const riderId = (await setUpDemo(anon(), "rider")).id;
  const q = await quoteFare(
    riderId,
    { address: "27th Main Road, Koramangala", point: KORAMANGALA },
    { address: "Church Street, MG Road", point: MG_ROAD },
  );
  const { rideId } = await bookRide(riderId, {
    quoteId: q.quoteId,
    tier: "go",
    paymentMethod: "cash",
  });
  await acceptOffer(pilotId, (await listOpenOffers(pilotId))[0]!.offerId);
  return { pilotId, riderId, rideId };
}

describe("the overview", () => {
  it("counts live trips, online Pilots and open alerts, and maps them", async () => {
    const ops = await opsAccount();
    const { pilotId, riderId, rideId } = await acceptedRide();
    const idle = (await setUpDemo(anon(), "pilot")).id;
    await goOnline(idle, MG_ROAD);
    const alert = await raiseSos(riderId, rideId, { point: KORAMANGALA, reason: null });

    const view = await getOpsOverview(ops);
    expect(view.kpis.pilotsOnline).toBe(2);
    expect(view.kpis.tripsInProgress).toBeGreaterThanOrEqual(1);
    expect(view.kpis.openSos).toBeGreaterThanOrEqual(1);
    expect(view.fleet).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pilotId, kind: "trip" }),
        expect.objectContaining({ id: idle, kind: "pilot" }),
        expect.objectContaining({ id: alert.id, kind: "sos" }),
      ]),
    );
    const banner = view.sos.find((s) => s.alertId === alert.id);
    expect(banner).toMatchObject({
      raisedBy: "rider",
      status: "open",
      pilot: "Rohan Kumar",
      plate: "KA 05 MX 2841",
      assignedToMe: false,
    });
    expect(view.trips.find((t) => t.rideId === rideId)).toMatchObject({
      status: "SOS",
      tone: "sos",
      pilot: "Rohan K.",
    });
  });
});

describe("SOS handling", () => {
  it("assign, then resolve with a note; the rider sees each step", async () => {
    const ops = await opsAccount();
    const { riderId, rideId } = await acceptedRide();
    const alert = await raiseSos(riderId, rideId, {});

    // Resolving needs the alert in hand first.
    await expect(resolveSos(ops, alert.id, "Spoke to rider, all fine.")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await acknowledgeSos(ops, alert.id);
    expect((await getSos(riderId, alert.id)).status).toBe("acknowledged");
    expect((await getOpsOverview(ops)).sos.find((s) => s.alertId === alert.id)?.assignedToMe).toBe(
      true,
    );

    await resolveSos(ops, alert.id, "Spoke to rider, all fine.");
    const row = await db.sosAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(row).toMatchObject({ status: "resolved", resolutionNote: "Spoke to rider, all fine." });
    expect((await getOpsOverview(ops)).sos.map((s) => s.alertId)).not.toContain(alert.id);
    // The rider can still end it with their PIN; nothing breaks.
    await endSos(riderId, alert.id, DEMO_SAFETY_PIN);

    const audit = await db.opsAuditLog.findMany({
      where: { targetId: alert.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual(["sos.acknowledge", "sos.resolve"]);
    await expect(acknowledgeSos(ops, alert.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets a second agent take over, and only the holder can resolve", async () => {
    const [first, second] = [await opsAccount(), await opsAccount()];
    const { riderId, rideId } = await acceptedRide();
    const alert = await raiseSos(riderId, rideId, {});
    await acknowledgeSos(first, alert.id);
    await acknowledgeSos(second, alert.id);
    await expect(resolveSos(first, alert.id, "Closing this one.")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await resolveSos(second, alert.id, "Took over, resolved.");
  });

  it("an alert the rider ends with their PIN leaves the dashboard", async () => {
    const ops = await opsAccount();
    const { riderId, rideId } = await acceptedRide();
    const alert = await raiseSos(riderId, rideId, {});
    await endSos(riderId, alert.id, DEMO_SAFETY_PIN);
    expect((await getOpsOverview(ops)).sos.map((s) => s.alertId)).not.toContain(alert.id);
    await expect(acknowledgeSos(ops, alert.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("promo campaigns", () => {
  const form = (code: string, startsAt = "2026-01-01T00:00:00+05:30") =>
    createPromoSchema.parse({
      code,
      kind: "flat",
      amount: 40,
      title: "₹40 off, from ops",
      startsAt,
      endsAt: "2030-01-01T00:00:00+05:30",
    });

  it("creates a code riders can use, refuses a duplicate, and switches it off", async () => {
    const ops = await opsAccount();
    const code = `OPS${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
    await createPromo(ops, form(code));
    await expect(createPromo(ops, form(code))).rejects.toMatchObject({ code: "CONFLICT" });

    const rider = (await setUpDemo(anon(), "rider")).id;
    expect((await listOffers(rider)).map((o) => o.code)).toContain(code);
    expect((await getOpsOverview(ops)).promos.find((p) => p.code === code)).toMatchObject({
      state: "live",
      uses: 0,
      terms: expect.stringContaining("until 1 Jan 2030"),
    });

    const { promoId } = (await getOpsOverview(ops)).promos.find((p) => p.code === code)!;
    await setPromoActive(ops, promoId, false);
    expect((await listOffers(rider)).map((o) => o.code)).not.toContain(code);
    // Typed by hand it's still found, so the rider is told why it won't apply.
    expect((await lookUpCode(rider, code)).isActive).toBe(false);
    const q = await quoteFare(
      rider,
      { address: "Koramangala", point: KORAMANGALA },
      { address: "MG Road", point: MG_ROAD },
    );
    await expect(
      bookRide(rider, { quoteId: q.quoteId, tier: "go", paymentMethod: "wallet", promoCode: code }),
    ).rejects.toMatchObject({ code: "VALIDATION", message: `${code} isn't available right now.` });
    expect((await getOpsOverview(ops)).promos.find((p) => p.code === code)?.state).toBe("off");

    const actions = (await db.opsAuditLog.findMany({ where: { targetId: promoId } })).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual(["promo.create", "promo.deactivate"]);
  });

  it("shows a code that starts later as scheduled", async () => {
    const ops = await opsAccount();
    const code = `LATER${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
    await createPromo(ops, form(code, "2029-01-01T00:00:00+05:30"));
    expect((await getOpsOverview(ops)).promos.find((p) => p.code === code)?.state).toBe(
      "scheduled",
    );
  });
});
