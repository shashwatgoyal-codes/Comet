import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isOps } from "@/lib/auth/ops";
import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { ensureAccount, setUpDemo } from "@/lib/services/accounts";
import {
  approvePilot,
  chooseVehicle,
  getOnboarding,
  getPilotDocuments,
  listPilotApplications,
  rejectPilot,
  saveLicenceStep,
  savePayoutStep,
  savePhotosStep,
  saveProfileStep,
  saveRcStep,
  submitApplication,
} from "@/lib/services/onboarding";
import { goOnline } from "@/lib/services/pilots";

/** Pilot onboarding and ops approval against a real database (docs/PRD.md F11). */

const HSR: LatLng = { lat: 12.9116, lng: 77.6474 };
const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
  process.env.OPS_ADMIN_EMAILS = "ops@comet.test, Lead@Comet.test";
});
afterAll(async () => {
  await db.$disconnect();
});

const realAccount = async (email = `pilot-${randomUUID()}@example.com`) =>
  (await ensureAccount({ id: randomUUID(), email, isAnonymous: false })).id;

/** A real account whose email is on the ops allowlist. */
async function opsAccount() {
  const email = `ops+${randomUUID()}@comet.test`;
  process.env.OPS_ADMIN_EMAILS += `,${email}`;
  return realAccount(email);
}

/** Completes every step and sends the application. */
async function applyAsPilot() {
  const id = await realAccount();
  await chooseVehicle(id, "car");
  await saveProfileStep(id, "Imran Khan");
  await saveLicenceStep(id, { number: "KA0520190012345", expiresOn: inAYear });
  await saveRcStep(id, { plate: "KA 03 AB 1234", model: "Hyundai Aura", colour: "Grey" });
  await savePhotosStep(id);
  await savePayoutStep(id, "imran.k@okaxis");
  await submitApplication(id);
  return id;
}

describe("onboarding", () => {
  it("walks through the five steps, then waits for review", async () => {
    const id = await realAccount();
    await chooseVehicle(id, "auto");
    let view = await getOnboarding(id);
    expect(view).toMatchObject({ stage: "draft", vehicleType: "auto" });
    expect(view.progress).toMatchObject({ done: 0, next: "profile" });

    await saveProfileStep(id, "Sunita Nair");
    await saveLicenceStep(id, { number: "KA0520190012345", expiresOn: inAYear });
    await expect(submitApplication(id)).rejects.toMatchObject({ code: "VALIDATION" });
    await saveRcStep(id, { plate: "KA 01 AU 5521", model: "Bajaj RE", colour: "Green" });
    await savePhotosStep(id);
    await savePayoutStep(id, "sunita@ybl");
    view = await getOnboarding(id);
    expect(view.progress).toMatchObject({ done: 5, next: null });
    expect(view.steps.licence.detail).toBe("DL ending 2345");
    expect(view.steps.payout.detail).toBe("su••••@ybl");

    await submitApplication(id);
    view = await getOnboarding(id);
    expect(view.stage).toBe("in_review");
    expect(view.steps.rc.state).toBe("in_review");

    // Locked while ops look at it, and not allowed online.
    await expect(savePayoutStep(id, "other@ybl")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(goOnline(id, HSR)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const profile = await db.pilotProfile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile).toMatchObject({ tier: "auto", seats: 3, plate: "KA 01 AU 5521" });
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    expect(user.displayName).toBe("Sunita Nair");
  });

  it("stores only the licence's last 4 characters, and refuses an expired one", async () => {
    const id = await realAccount();
    await chooseVehicle(id, "bike");
    await expect(
      saveLicenceStep(id, { number: "KA0520190012345", expiresOn: "2020-01-01" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await saveLicenceStep(id, { number: "KA0520190012345", expiresOn: inAYear });
    const doc = await db.pilotDocument.findFirstOrThrow({ where: { pilotId: id } });
    expect(doc).toMatchObject({ referenceLast4: "2345", storagePath: null, status: "in_review" });
  });

  it("isn't for demo accounts, whose Pilot is approved already", async () => {
    const demo = await setUpDemo({ id: randomUUID(), email: null, isAnonymous: true }, "rider");
    await expect(chooseVehicle(demo.id, "car")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const pilot = await setUpDemo({ id: randomUUID(), email: null, isAnonymous: true }, "pilot");
    const docs = await getPilotDocuments(pilot.id);
    expect(docs.map((d) => d.status)).toEqual([
      "Expires in 23 days",
      "Verified",
      "Verified",
      "Cleared",
    ]);
  });
});

describe("ops review", () => {
  it("approves: documents verified, background check cleared, audit logged, can go online", async () => {
    const ops = await opsAccount();
    const pilot = await applyAsPilot();
    const queue = await listPilotApplications();
    const row = queue.pending.find((p) => p.pilotId === pilot);
    expect(row).toMatchObject({ name: "Imran Khan", vehicle: "Car", plate: "KA 03 AB 1234" });
    expect(row?.payout).toBe("im•••••@okaxis");

    await approvePilot(ops, pilot);
    expect((await getOnboarding(pilot)).stage).toBe("approved");
    const docs = await db.pilotDocument.findMany({ where: { pilotId: pilot } });
    expect(docs).toHaveLength(4);
    expect(docs.every((d) => d.status === "verified" && d.reviewedBy === ops)).toBe(true);
    const audit = await db.opsAuditLog.findMany({ where: { targetId: pilot } });
    expect(audit).toMatchObject([{ actorId: ops, action: "pilot.approve", targetType: "pilot" }]);

    await goOnline(pilot, HSR);
    // A second click finds nothing to approve, and logs nothing.
    await expect(approvePilot(ops, pilot)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.opsAuditLog.count({ where: { targetId: pilot } })).toBe(1);
    expect((await listPilotApplications()).recent.map((p) => p.pilotId)).toContain(pilot);
  });

  it("rejects with a reason; the Pilot fixes it and sends again", async () => {
    const ops = await opsAccount();
    const pilot = await applyAsPilot();
    await rejectPilot(ops, pilot, "The plate doesn't match the RC. Please check it.");

    let view = await getOnboarding(pilot);
    expect(view).toMatchObject({
      stage: "rejected",
      rejectionReason: "The plate doesn't match the RC. Please check it.",
    });
    expect((await listPilotApplications()).pending.map((p) => p.pilotId)).not.toContain(pilot);
    const [audit] = await db.opsAuditLog.findMany({ where: { targetId: pilot } });
    expect(audit?.data).toEqual({ reason: "The plate doesn't match the RC. Please check it." });

    await saveRcStep(pilot, { plate: "KA 03 AB 1235", model: "Hyundai Aura", colour: "Grey" });
    await submitApplication(pilot);
    view = await getOnboarding(pilot);
    expect(view).toMatchObject({ stage: "in_review", rejectionReason: null });
    await approvePilot(ops, pilot);
  });

  it("keeps the audit log append-only", async () => {
    const ops = await opsAccount();
    await rejectPilot(ops, await applyAsPilot(), "Blurry photos, please retake.");
    const row = await db.opsAuditLog.findFirstOrThrow({ where: { actorId: ops } });
    await expect(db.opsAuditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(
      db.opsAuditLog.update({ where: { id: row.id }, data: { action: "x" } }),
    ).rejects.toThrow();
  });
});

describe("the ops role", () => {
  it("is the email allowlist, never a demo account", () => {
    const base = { isDemo: false, deletedAt: null };
    expect(isOps({ ...base, email: "ops@comet.test" })).toBe(true);
    expect(isOps({ ...base, email: "lead@comet.test" })).toBe(true);
    expect(isOps({ ...base, email: "someone@comet.test" })).toBe(false);
    expect(isOps({ ...base, isDemo: true, email: "ops@comet.test" })).toBe(false);
    expect(isOps({ ...base, deletedAt: new Date(), email: "ops@comet.test" })).toBe(false);
    expect(isOps(null)).toBe(false);
  });
});
