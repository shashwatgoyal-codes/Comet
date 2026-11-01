import "server-only";

import { hash, verify } from "@node-rs/argon2";
import { Prisma, type SosAlert } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { LatLng } from "@/lib/geo";
import { log } from "@/lib/log";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { getPilotLocation } from "@/lib/repositories/pilot-locations";
import { findRideForParticipant } from "@/lib/repositories/rides";
import { PIN_PATTERN, type SosReasonId } from "@/lib/safety";

/**
 * SOS and the safety PIN (docs/PRD.md F9, docs/SECURITY.md §9).
 *
 * - Raising an SOS is never blocked: no rate limit, an optional reason
 *   that's dropped if it's not valid, and a repeat tap returns the same
 *   alert. It never contacts real people or services.
 * - Ending one needs the raiser's 4-digit safety PIN, so someone else
 *   holding the phone can't quietly cancel it. PINs are stored as
 *   Argon2id hashes and never logged.
 */

export type SosView = {
  id: string;
  rideId: string;
  role: "rider" | "pilot";
  reason: SosReasonId | null;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
};

const view = (a: SosAlert): SosView => ({
  id: a.id,
  rideId: a.rideId,
  role: a.raisedByRole,
  reason: a.reason,
  status: a.status,
  createdAt: a.createdAt.toISOString(),
});

export async function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

export async function raiseSos(
  userId: string,
  rideId: string,
  input: { reason?: SosReasonId | null; point?: LatLng | null } = {},
): Promise<SosView> {
  const ride = await findRideForParticipant(userId, rideId);
  if (!ride) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
  const role = ride.riderId === userId ? "rider" : "pilot";

  // Where help should go: the phone's own position, else the Pilot's car.
  const carPoint = ride.pilotId ? (await getPilotLocation(ride.pilotId))?.point : null;
  const point = input.point ?? carPoint ?? null;

  let alert: SosAlert;
  try {
    alert = await db.sosAlert.create({
      data: {
        rideId,
        raisedBy: userId,
        raisedByRole: role,
        reason: input.reason ?? null,
        lastLat: point?.lat ?? null,
        lastLng: point?.lng ?? null,
      },
    });
    log.warn("sos.raised", { role, reason: input.reason ?? null });
  } catch (err) {
    // Already raised for this ride (a second tap, a retry): same alert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      alert = await db.sosAlert.findFirstOrThrow({
        where: { rideId, raisedBy: userId, status: { not: "resolved" } },
      });
    } else {
      throw err;
    }
  }

  await broadcast({
    topic: topics.ops,
    event: EVENTS.sosRaised,
    payload: { alertId: alert.id, rideId, role, reason: alert.reason, status: alert.status },
  });
  return view(alert);
}

/** One of the user's own alerts, to follow whether ops have it. */
export async function getSos(userId: string, alertId: string): Promise<SosView> {
  const alert = await db.sosAlert.findFirst({ where: { id: alertId, raisedBy: userId } });
  if (!alert) throw new AppError("NOT_FOUND", "That alert doesn't exist.");
  return view(alert);
}

/** The user's live SOS on this ride, so a reload goes straight back to it. */
export async function getOpenSos(userId: string, rideId: string): Promise<SosView | null> {
  const alert = await db.sosAlert.findFirst({
    where: { rideId, raisedBy: userId, status: { not: "resolved" } },
    orderBy: { createdAt: "desc" },
  });
  return alert ? view(alert) : null;
}

export async function hasSafetyPin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { safetyPinHash: true } });
  return Boolean(user?.safetyPinHash);
}

async function checkPin(userId: string, pin: string): Promise<"ok" | "wrong" | "unset"> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { safetyPinHash: true } });
  if (!user?.safetyPinHash) return "unset";
  return (await verify(user.safetyPinHash, pin)) ? "ok" : "wrong";
}

/**
 * Sets the PIN. Changing an existing one needs the current PIN, so a
 * borrowed phone can't replace it and then end an SOS.
 */
export async function setSafetyPin(userId: string, pin: string, currentPin?: string | null) {
  if (!PIN_PATTERN.test(pin)) throw new AppError("VALIDATION", "Your PIN must be 4 digits.");
  const state = await checkPin(userId, currentPin ?? "");
  if (state === "wrong") {
    throw new AppError("INVALID_CODE", "Your current PIN doesn't match.");
  }
  await db.user.update({ where: { id: userId }, data: { safetyPinHash: await hashPin(pin) } });
  log.info("safety.pin_set", { changed: state === "ok" });
}

/**
 * "I'm safe now": ends the user's own SOS with their PIN. Someone who
 * never set a PIN chooses one here — that's the only way to end it — and
 * needs it from then on.
 */
export async function endSos(userId: string, alertId: string, pin: string, now = new Date()) {
  if (!PIN_PATTERN.test(pin)) throw new AppError("INVALID_CODE", "Enter your 4-digit safety PIN.");
  const alert = await db.sosAlert.findFirst({ where: { id: alertId, raisedBy: userId } });
  if (!alert) throw new AppError("NOT_FOUND", "That alert doesn't exist.");
  if (alert.status === "resolved") return;

  const state = await checkPin(userId, pin);
  if (state === "wrong") {
    log.warn("sos.wrong_pin", {});
    throw new AppError("INVALID_CODE", "That PIN doesn't match. Try again.");
  }
  if (state === "unset") {
    await db.user.update({ where: { id: userId }, data: { safetyPinHash: await hashPin(pin) } });
  }

  await db.sosAlert.updateMany({
    where: { id: alertId, status: { not: "resolved" } },
    data: {
      status: "resolved",
      resolvedAt: now,
      resolutionNote: "Ended by the user with their PIN",
    },
  });
  log.info("sos.resolved", { by: "user" });
  await broadcast({
    topic: topics.ops,
    event: EVENTS.sosUpdated,
    payload: { alertId, rideId: alert.rideId, status: "resolved" },
  });
}
