import "server-only";

import type { PilotDocument, PilotProfile, PilotStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import {
  daysUntil,
  expiryNote,
  maskUpi,
  progress,
  STEP_IDS,
  VEHICLES,
  type StepId,
  type StepState,
  type VehicleType,
} from "@/lib/onboarding";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { findUser } from "@/lib/repositories/users";

/**
 * Pilot onboarding (docs/PRD.md F11, docs/UX_FLOWS.md Flow 12): choose a
 * vehicle, complete five steps, send for review, and ops approve or
 * reject. Uploads are simulated — a step stores what the Pilot typed,
 * never a file — so nobody uploads a real ID to a portfolio project.
 */

export type OnboardingStage = "draft" | "in_review" | "rejected" | "approved" | "suspended";

export type OnboardingView = {
  stage: OnboardingStage;
  vehicleType: VehicleType | null;
  steps: Record<StepId, { state: StepState; detail: string | null }>;
  progress: ReturnType<typeof progress>;
  rejectionReason: string | null;
  submittedAt: string | null;
  fullName: string;
  /** Prefill for the forms. */
  vehicle: { plate: string; model: string; colour: string } | null;
};

type ProfileWithDocs = PilotProfile & { documents: PilotDocument[] };

function stageOf(profile: Pick<PilotProfile, "status" | "submittedAt">): OnboardingStage {
  const map: Record<PilotStatus, OnboardingStage> = {
    pending: profile.submittedAt ? "in_review" : "draft",
    approved: "approved",
    rejected: profile.submittedAt ? "in_review" : "rejected",
    suspended: "suspended",
  };
  return map[profile.status];
}

function stepStates(profile: ProfileWithDocs | null, stage: OnboardingStage) {
  const doc = (kind: PilotDocument["kind"]) => profile?.documents.find((d) => d.kind === kind);
  const filled: Record<StepId, boolean> = {
    profile: Boolean(profile?.profileCompletedAt),
    licence: Boolean(doc("driving_licence")),
    rc: Boolean(doc("rc") && profile?.plate),
    photos: Boolean(doc("vehicle_photo")),
    payout: Boolean(profile?.payoutUpiId),
  };
  const sent: StepState =
    stage === "approved" ? "verified" : stage === "in_review" ? "in_review" : "added";
  const licence = doc("driving_licence");
  const details: Record<StepId, string | null> = {
    profile: null,
    licence: licence?.referenceLast4 ? `DL ending ${licence.referenceLast4}` : null,
    rc: profile?.plate ?? null,
    photos: filled.photos ? "Front, back, inside (simulated)" : null,
    payout: profile?.payoutUpiId ? maskUpi(profile.payoutUpiId) : null,
  };
  return Object.fromEntries(
    STEP_IDS.map((id) => [id, { state: filled[id] ? sent : "todo", detail: details[id] }]),
  ) as OnboardingView["steps"];
}

async function loadProfile(userId: string): Promise<ProfileWithDocs | null> {
  return db.pilotProfile.findUnique({ where: { userId }, include: { documents: true } });
}

export async function getOnboarding(userId: string): Promise<OnboardingView> {
  const [user, profile] = await Promise.all([findUser(userId), loadProfile(userId)]);
  if (!user) throw new AppError("NOT_FOUND", "We couldn't find your account.");
  const stage = profile ? stageOf(profile) : "draft";
  const steps = stepStates(profile, stage);
  return {
    stage,
    vehicleType: profile?.vehicleType ?? null,
    steps,
    progress: progress(
      Object.fromEntries(STEP_IDS.map((id) => [id, steps[id].state])) as Record<StepId, StepState>,
    ),
    rejectionReason: profile?.status === "rejected" ? profile.rejectionReason : null,
    submittedAt: profile?.submittedAt?.toISOString() ?? null,
    fullName: user.displayName,
    vehicle: profile?.plate
      ? {
          plate: profile.plate,
          model: profile.vehicleModel ?? "",
          colour: profile.vehicleColour ?? "",
        }
      : null,
  };
}

/** Real accounts only: the demo Pilot is approved already, and has no one to review it. */
async function requireApplicant(userId: string) {
  const user = await findUser(userId);
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  if (user.isDemo) {
    throw new AppError(
      "FORBIDDEN",
      "Demo accounts can't apply. The demo Pilot is approved already.",
    );
  }
  return user;
}

/** The profile, if the application can still be edited. */
async function editableProfile(userId: string): Promise<PilotProfile> {
  await requireApplicant(userId);
  const profile = await db.pilotProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError("CONFLICT", "Choose what you'll drive first.");
  const stage = stageOf(profile);
  if (stage === "in_review") {
    throw new AppError(
      "CONFLICT",
      "Your application is with our team. You can edit it if they ask for changes.",
    );
  }
  if (stage === "approved" || stage === "suspended") {
    throw new AppError(
      "CONFLICT",
      "You're past onboarding. Contact Comet Ops to change your details.",
    );
  }
  return profile;
}

export async function chooseVehicle(userId: string, vehicleType: VehicleType) {
  await requireApplicant(userId);
  const { tier, seats } = VEHICLES[vehicleType];
  const existing = await db.pilotProfile.findUnique({ where: { userId } });
  if (existing) await editableProfile(userId);
  await db.pilotProfile.upsert({
    where: { userId },
    create: { userId, status: "pending", vehicleType, tier, seats },
    update: { vehicleType, tier, seats },
  });
  if (!existing) log.info("onboarding.started", { vehicleType });
}

export async function saveProfileStep(userId: string, fullName: string) {
  await editableProfile(userId);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { displayName: fullName } }),
    db.pilotProfile.update({ where: { userId }, data: { profileCompletedAt: new Date() } }),
  ]);
}

async function upsertDocument(
  pilotId: string,
  kind: PilotDocument["kind"],
  fields: { referenceLast4?: string | null; expiresOn?: Date | null } = {},
) {
  await db.pilotDocument.upsert({
    where: { pilotId_kind: { pilotId, kind } },
    create: { pilotId, kind, ...fields },
    update: { ...fields, status: "in_review", reviewedBy: null, reviewedAt: null },
  });
}

export async function saveLicenceStep(
  userId: string,
  input: { number: string; expiresOn: string },
  now = new Date(),
) {
  await editableProfile(userId);
  if (daysUntil(input.expiresOn, now) <= 0) {
    throw new AppError("VALIDATION", "This licence has expired. Renew it, then add it here.");
  }
  await upsertDocument(userId, "driving_licence", {
    referenceLast4: input.number.slice(-4),
    expiresOn: new Date(`${input.expiresOn}T00:00:00Z`),
  });
}

export async function saveRcStep(
  userId: string,
  input: { plate: string; model: string; colour: string },
) {
  const profile = await editableProfile(userId);
  if (!profile.vehicleType) throw new AppError("CONFLICT", "Choose what you'll drive first.");
  await db.pilotProfile.update({
    where: { userId },
    data: { plate: input.plate, vehicleModel: input.model, vehicleColour: input.colour },
  });
  await upsertDocument(userId, "rc", { referenceLast4: input.plate.replace(/\s/g, "").slice(-4) });
}

export async function savePhotosStep(userId: string) {
  await editableProfile(userId);
  await upsertDocument(userId, "vehicle_photo");
}

export async function savePayoutStep(userId: string, upiId: string) {
  await editableProfile(userId);
  await db.pilotProfile.update({ where: { userId }, data: { payoutUpiId: upiId } });
}

export async function submitApplication(userId: string) {
  await editableProfile(userId);
  const view = await getOnboarding(userId);
  if (view.progress.next) {
    throw new AppError("VALIDATION", "Finish every step before you send your application.");
  }
  await db.pilotProfile.update({
    where: { userId },
    data: { status: "pending", submittedAt: new Date(), rejectionReason: null },
  });
  log.info("onboarding.submitted", { vehicleType: view.vehicleType });
}

// --------------------------------------------------------------- ops review

export type PilotApplication = {
  pilotId: string;
  name: string;
  cometId: string;
  vehicle: string;
  plate: string | null;
  vehicleDetail: string;
  licence: string;
  payout: string | null;
  submittedAt: string | null;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  rejectionReason: string | null;
};

/**
 * The verification queue: applications waiting, oldest first, then the
 * ones decided most recently so ops can see what just happened.
 */
export async function listPilotApplications(now = new Date()): Promise<{
  pending: PilotApplication[];
  recent: PilotApplication[];
}> {
  const include = { documents: true, user: true } as const;
  const [pending, recent] = await Promise.all([
    db.pilotProfile.findMany({
      where: { status: "pending", submittedAt: { not: null }, isSimulated: false },
      orderBy: { submittedAt: "asc" },
      take: 50,
      include,
    }),
    db.pilotProfile.findMany({
      where: {
        isSimulated: false,
        user: { isDemo: false },
        OR: [{ status: "approved" }, { status: "rejected", submittedAt: null }],
        updatedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include,
    }),
  ]);
  const toView = (p: (typeof pending)[number]): PilotApplication => {
    const licence = p.documents.find((d) => d.kind === "driving_licence");
    const expiry = licence?.expiresOn?.toISOString().slice(0, 10) ?? null;
    return {
      pilotId: p.userId,
      name: p.user.displayName,
      cometId: p.user.cometId,
      vehicle: p.vehicleType ? VEHICLES[p.vehicleType].label : "—",
      plate: p.plate,
      vehicleDetail: [p.vehicleColour, p.vehicleModel].filter(Boolean).join(" "),
      licence: licence
        ? `DL ending ${licence.referenceLast4} · valid to ${expiry}${expiryNote(expiry, now) ? ` (${expiryNote(expiry, now)})` : ""}`
        : "No licence",
      payout: p.payoutUpiId ? maskUpi(p.payoutUpiId) : null,
      submittedAt: p.submittedAt?.toISOString() ?? null,
      status:
        p.status === "approved" ? "approved" : p.status === "rejected" ? "rejected" : "pending",
      decidedAt: p.status === "pending" ? null : p.updatedAt.toISOString(),
      rejectionReason: p.rejectionReason,
    };
  };
  return { pending: pending.map(toView), recent: recent.map(toView) };
}

/**
 * Approve: one statement, so a second ops click (or a resubmission
 * underneath) can't approve twice or half-approve. Documents become
 * verified, the background check is recorded as cleared (simulated), and
 * the audit log gets the action.
 */
export async function approvePilot(opsId: string, pilotId: string) {
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    WITH p AS (
      UPDATE pilot_profiles
         SET status = 'approved', approved_at = now(), rejection_reason = NULL, updated_at = now()
       WHERE user_id = ${pilotId}::uuid AND status = 'pending' AND submitted_at IS NOT NULL
      RETURNING user_id
    ), d AS (
      UPDATE pilot_documents
         SET status = 'verified', reviewed_by = ${opsId}::uuid, reviewed_at = now(), updated_at = now()
       WHERE pilot_id IN (SELECT user_id FROM p)
      RETURNING id
    ), b AS (
      INSERT INTO pilot_documents (id, pilot_id, kind, status, reviewed_by, reviewed_at, updated_at)
      SELECT gen_random_uuid(), user_id, 'background_check', 'verified', ${opsId}::uuid, now(), now() FROM p
      ON CONFLICT (pilot_id, kind) DO UPDATE
        SET status = 'verified', reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now(), updated_at = now()
      RETURNING id
    ), a AS (
      INSERT INTO ops_audit_log (id, actor_id, action, target_type, target_id)
      SELECT gen_random_uuid(), ${opsId}::uuid, 'pilot.approve', 'pilot', user_id FROM p
      RETURNING id
    )
    SELECT count(*) AS n FROM p`;
  if (!row || Number(row.n) === 0) {
    throw new AppError("CONFLICT", "This application isn't waiting for review any more.");
  }
  log.info("ops.pilot_approved");
  await broadcast({
    topic: topics.pilot(pilotId),
    event: EVENTS.pilotStatus,
    payload: { status: "approved" },
  });
}

/** Reject with a reason the Pilot sees; they can fix the steps and send again. */
export async function rejectPilot(opsId: string, pilotId: string, reason: string) {
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    WITH p AS (
      UPDATE pilot_profiles
         SET status = 'rejected', rejection_reason = ${reason}, submitted_at = NULL, updated_at = now()
       WHERE user_id = ${pilotId}::uuid AND status = 'pending' AND submitted_at IS NOT NULL
      RETURNING user_id
    ), a AS (
      INSERT INTO ops_audit_log (id, actor_id, action, target_type, target_id, data)
      SELECT gen_random_uuid(), ${opsId}::uuid, 'pilot.reject', 'pilot', user_id,
             jsonb_build_object('reason', ${reason}::text)
        FROM p
      RETURNING id
    )
    SELECT count(*) AS n FROM p`;
  if (!row || Number(row.n) === 0) {
    throw new AppError("CONFLICT", "This application isn't waiting for review any more.");
  }
  log.info("ops.pilot_rejected");
  await broadcast({
    topic: topics.pilot(pilotId),
    event: EVENTS.pilotStatus,
    payload: { status: "rejected" },
  });
}

/** "9 · Pilot account" documents, with expiry warnings. */
export async function getPilotDocuments(userId: string, now = new Date()) {
  const docs = await db.pilotDocument.findMany({ where: { pilotId: userId } });
  const label: Record<PilotDocument["kind"], string> = {
    driving_licence: "Driving licence",
    rc: "Vehicle RC",
    vehicle_photo: "Vehicle photos",
    background_check: "Background check",
  };
  const order: PilotDocument["kind"][] = [
    "driving_licence",
    "rc",
    "vehicle_photo",
    "background_check",
  ];
  return docs
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((d) => {
      const expiry = d.expiresOn?.toISOString().slice(0, 10) ?? null;
      const warning = expiryNote(expiry, now);
      const status =
        warning ??
        (d.status === "verified"
          ? d.kind === "background_check"
            ? "Cleared"
            : "Verified"
          : d.status === "rejected"
            ? "Needs changes"
            : "In review");
      return {
        kind: d.kind,
        name: label[d.kind],
        status,
        warn: Boolean(warning) || d.status !== "verified",
      };
    });
}
