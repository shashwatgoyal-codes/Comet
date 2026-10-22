import "server-only";

import { randomUUID } from "node:crypto";

import type { DemoRole, User } from "@prisma/client";

import { generateCometId, secureRandom } from "@/lib/comet-id";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { displayNameFromEmail } from "@/lib/names";
import {
  createSimulatedPilotProfile,
  ensureApprovedDemoPilot,
  ensureRiderProfile,
  findSimulatedPilotFor,
  findUser,
  insertUser,
  setDemoRole,
  setDemoSafetyPin,
} from "@/lib/repositories/users";
import { grantDemoWallet } from "@/lib/services/wallet";
import { seedDemoPlaces } from "@/lib/services/places";
import { hashPin } from "@/lib/services/sos";
import { DEMO_SAFETY_PIN } from "@/lib/safety";

/**
 * Accounts: the bridge between a Supabase auth user and Comet's own
 * `users` row, which carries the permanent Comet ID.
 */

export type AuthIdentity = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
};

/** Comet ID collisions are ~1 in a billion per draw; 5 tries is plenty. */
const MAX_COMET_ID_ATTEMPTS = 5;

export const DEMO_PERSONAS: Record<DemoRole, { displayName: string }> = {
  rider: { displayName: "Aarav Mehta" },
  pilot: { displayName: "Rohan Kumar" },
};

export const DEMO_VEHICLE = {
  vehicleType: "car",
  tier: "go",
  vehicleModel: "Maruti Swift Dzire",
  vehicleColour: "White",
  plate: "KA 05 MX 2841",
  seats: 4,
} as const;

async function createUserWithCometId(
  identity: AuthIdentity,
  fields: { displayName: string; isDemo: boolean; demoRole: DemoRole | null },
  random: () => number,
): Promise<User> {
  for (let attempt = 1; attempt <= MAX_COMET_ID_ATTEMPTS; attempt++) {
    const outcome = await insertUser({
      id: identity.id,
      cometId: generateCometId(random),
      email: identity.email,
      ...fields,
    });
    if (outcome.kind === "created") return outcome.user;
    if (outcome.kind === "already_exists") {
      // Another request created this user first (two tabs at once).
      const existing = await findUser(identity.id);
      if (existing) return existing;
      throw new AppError("CONFLICT", "Your account couldn't be set up. Please try again.");
    }
    log.warn("account.comet_id_collision", { attempt });
  }
  throw new AppError("INTERNAL", "Your account couldn't be set up. Please try again.");
}

/**
 * The Comet account for a real (non-demo) sign-in, created on first use.
 * Demo sessions never get here; they're set up by setUpDemo.
 */
export async function ensureAccount(
  identity: AuthIdentity,
  random: () => number = secureRandom,
): Promise<User> {
  const existing = await findUser(identity.id);
  if (existing) return existing;
  if (identity.isAnonymous || !identity.email) {
    throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  }
  const user = await createUserWithCometId(
    identity,
    { displayName: displayNameFromEmail(identity.email), isDemo: false, demoRole: null },
    random,
  );
  await ensureRiderProfile(user.id);
  log.info("account.created", { demo: false });
  return user;
}

/**
 * Sets up a demo account for an anonymous session: the Comet user row, the
 * persona's name and the profile for the chosen role. Idempotent — picking
 * a role again, or the other role, on the same session reuses the account
 * and adds whatever profile is missing.
 *
 * Riders get the ₹1,240 starting balance and their simulated Pilot. Later
 * phases add saved places and history (docs/PRD.md F1).
 */
export async function setUpDemo(
  identity: AuthIdentity,
  role: DemoRole,
  random: () => number = secureRandom,
  options: { simulatedPilot?: boolean } = {},
): Promise<User> {
  if (!identity.isAnonymous) {
    throw new AppError(
      "FORBIDDEN",
      "Demo accounts are only for the demo. You're already signed in.",
    );
  }

  let user = await findUser(identity.id);
  if (!user) {
    user = await createUserWithCometId(
      // Demo accounts never carry an email, whatever the session reports.
      { ...identity, email: null },
      { displayName: DEMO_PERSONAS[role].displayName, isDemo: true, demoRole: role },
      random,
    );
    log.info("demo.created", { role });
  } else if (user.demoRole !== role) {
    await setDemoRole(user.id, role);
    user = { ...user, demoRole: role };
  }

  // Demo accounts get a known safety PIN so a visitor can end a test SOS.
  if (!user.safetyPinHash) {
    await setDemoSafetyPin(user.id, await hashPin(DEMO_SAFETY_PIN));
  }

  if (role === "rider") {
    await ensureRiderProfile(user.id, { simulatedPilot: options.simulatedPilot ?? true });
    await ensureSimulatedPilot(user.id, random);
    await grantDemoWallet(user.id);
    await seedDemoPlaces(user.id);
  } else {
    await ensureApprovedDemoPilot(user.id, DEMO_VEHICLE);
  }
  return user;
}

/**
 * Every demo rider gets a private bot Pilot that drives their ride if no
 * real Pilot accepts first (docs/ARCHITECTURE.md §9). It's a users row
 * with no Supabase auth user behind it, so nobody can sign in as it, and
 * it has no live location row, so matching never offers it other rides.
 */
export async function ensureSimulatedPilot(
  riderId: string,
  random: () => number = secureRandom,
): Promise<string> {
  const existing = await findSimulatedPilotFor(riderId);
  if (existing) return existing;
  const bot = await createUserWithCometId(
    { id: randomUUID(), email: null, isAnonymous: true },
    { displayName: DEMO_PERSONAS.pilot.displayName, isDemo: true, demoRole: "pilot" },
    random,
  );
  await createSimulatedPilotProfile(bot.id, riderId, DEMO_VEHICLE);
  return bot.id;
}
