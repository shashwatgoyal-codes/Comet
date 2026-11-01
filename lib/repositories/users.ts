import "server-only";

import { Prisma, type DemoRole, type User } from "@prisma/client";

import { db } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * Users. Every function takes the acting user's id; there is no "find any
 * user" here (docs/ARCHITECTURE.md §8). Ops gets its own repository.
 */

export async function findUser(userId: string): Promise<User | null> {
  return db.user.findFirst({ where: { id: userId, deletedAt: null } });
}

export type NewUser = {
  id: string;
  cometId: string;
  displayName: string;
  email: string | null;
  isDemo: boolean;
  demoRole: DemoRole | null;
};

export type InsertUserOutcome =
  { kind: "created"; user: User } | { kind: "comet_id_taken" } | { kind: "already_exists" };

/**
 * Inserts the row, reporting which unique constraint (if any) collided,
 * so the caller can retry a Comet ID clash and treat a duplicate user id
 * (two tabs signing in at once) as success.
 */
export async function insertUser(input: NewUser): Promise<InsertUserOutcome> {
  try {
    const user = await db.user.create({ data: input });
    return { kind: "created", user };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = JSON.stringify(err.meta ?? {});
      log.warn("user.insert_conflict", { target: target.slice(0, 300) });
      if (target.includes("comet_id")) return { kind: "comet_id_taken" };
      return { kind: "already_exists" };
    }
    throw err;
  }
}

export async function setDemoRole(userId: string, demoRole: DemoRole): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { demoRole } });
}

export async function ensureRiderProfile(
  userId: string,
  settings: { simulatedPilot?: boolean } = {},
): Promise<void> {
  await db.riderProfile.upsert({
    where: { userId },
    create: { userId, ...settings },
    update: settings,
  });
}

export async function wantsSimulatedPilot(riderId: string): Promise<boolean> {
  const profile = await db.riderProfile.findUnique({
    where: { userId: riderId },
    select: { simulatedPilot: true },
  });
  return profile?.simulatedPilot ?? true;
}

export type DemoVehicle = {
  vehicleType: "car";
  tier: "go";
  vehicleModel: string;
  vehicleColour: string;
  plate: string;
  seats: number;
};

/**
 * The demo Pilot is approved straight away so the visitor can go online,
 * with verified documents; the licence is close to expiry so the account
 * page shows its warning.
 */
export async function ensureApprovedDemoPilot(
  userId: string,
  vehicle: DemoVehicle,
  now = new Date(),
): Promise<void> {
  await db.pilotProfile.upsert({
    where: { userId },
    create: {
      userId,
      status: "approved",
      approvedAt: now,
      profileCompletedAt: now,
      payoutUpiId: "rohan.kumar@okaxis",
      ...vehicle,
    },
    update: {},
  });
  const licenceExpiry = new Date(now.getTime() + 23 * 86_400_000);
  await db.pilotDocument.createMany({
    data: [
      { kind: "driving_licence" as const, referenceLast4: "4471", expiresOn: licenceExpiry },
      { kind: "rc" as const, referenceLast4: "2841" },
      { kind: "vehicle_photo" as const },
      { kind: "background_check" as const },
    ].map((d) => ({ pilotId: userId, status: "verified" as const, reviewedAt: now, ...d })),
    skipDuplicates: true,
  });
}

export async function findSimulatedPilotFor(riderId: string): Promise<string | null> {
  const bot = await db.pilotProfile.findFirst({
    where: { simulatedForUserId: riderId, isSimulated: true },
    select: { userId: true },
  });
  return bot?.userId ?? null;
}

export async function createSimulatedPilotProfile(
  botId: string,
  riderId: string,
  vehicle: DemoVehicle,
): Promise<void> {
  await db.pilotProfile.create({
    data: {
      userId: botId,
      status: "approved",
      approvedAt: new Date(),
      isSimulated: true,
      simulatedForUserId: riderId,
      ratingAvg: 4.9,
      ...vehicle,
    },
  });
}

/** Only for demo accounts, whose PIN is the published demo PIN. */
export async function setDemoSafetyPin(userId: string, pinHash: string): Promise<void> {
  await db.user.updateMany({
    where: { id: userId, isDemo: true, safetyPinHash: null },
    data: { safetyPinHash: pinHash },
  });
}
