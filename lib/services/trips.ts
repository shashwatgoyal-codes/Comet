import "server-only";

import { timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { setPilotAvailable } from "@/lib/repositories/pilot-locations";
import {
  addRideEvent,
  findRideForParticipant,
  recordWrongRideCode,
  transitionRide,
  releaseQueuedRide,
} from "@/lib/repositories/rides";
import { chargeCancellation } from "@/lib/repositories/wallet";
import { chargeOnCompletion } from "@/lib/services/payments";
import { announceBalance } from "@/lib/services/wallet";
import { toRideView } from "@/lib/services/rides";
import {
  MAX_RIDE_CODE_ATTEMPTS,
  NO_SHOW_FEE,
  canCancelAsNoShow,
  waitingFee,
} from "@/lib/trip-fees";

/**
 * The Pilot's steps once a ride is accepted (docs/UX_FLOWS.md Flow 7):
 * arrive, start with the rider's code, end. Only the assigned Pilot can
 * take them, and each is a conditional transition, so a double tap or a
 * stale screen can't skip or repeat a step.
 */

async function rideForPilot(pilotId: string, rideId: string) {
  const ride = await findRideForParticipant(pilotId, rideId);
  if (!ride || ride.pilotId !== pilotId)
    throw new AppError("NOT_FOUND", "That ride doesn't exist.");
  return ride;
}

async function announce(rideId: string, status: string) {
  await broadcast({ topic: topics.ride(rideId), event: EVENTS.rideUpdated, payload: { status } });
}

export async function getPilotRide(pilotId: string, rideId: string) {
  return toRideView(await rideForPilot(pilotId, rideId), false);
}

export async function markArrived(pilotId: string, rideId: string, now: Date = new Date()) {
  const ride = await rideForPilot(pilotId, rideId);
  if (ride.isQueued) {
    throw new AppError("CONFLICT", "Finish your current trip first. This pickup is next.");
  }
  if (ride.status !== "accepted")
    throw new AppError("CONFLICT", "You can only arrive once, before the trip.");
  const ok = await transitionRide(ride.id, "accepted", { status: "arrived", arrivedAt: now });
  if (!ok) throw new AppError("CONFLICT", "This ride changed just now.");
  await addRideEvent(ride.id, "ride.arrived", { id: pilotId, role: "pilot" });
  await announce(ride.id, "arrived");
}

function codesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given.padEnd(expected.length).slice(0, expected.length));
  return given.length === expected.length && timingSafeEqual(a, b);
}

/**
 * Starts the trip once the Pilot enters the rider's 4-digit code. Wrong
 * codes are counted; after MAX_RIDE_CODE_ATTEMPTS the Pilot has to call
 * the rider or support, so the code can't be guessed (10,000 options).
 */
export async function startTrip(
  pilotId: string,
  rideId: string,
  code: string,
  now: Date = new Date(),
) {
  const ride = await rideForPilot(pilotId, rideId);
  if (ride.status !== "arrived") throw new AppError("CONFLICT", 'Tap "I\'ve arrived" first.');
  if (ride.rideCodeAttempts >= MAX_RIDE_CODE_ATTEMPTS) {
    throw new AppError("FORBIDDEN", "Too many wrong codes. Call the rider or contact support.");
  }

  if (!codesMatch(ride.rideCode, code)) {
    const attempts = await recordWrongRideCode(ride.id);
    log.warn("trip.wrong_ride_code", { attempts });
    const left = Math.max(0, MAX_RIDE_CODE_ATTEMPTS - attempts);
    throw new AppError(
      left > 0 ? "INVALID_CODE" : "FORBIDDEN",
      left > 0
        ? `That code doesn't match — ${left} ${left === 1 ? "try" : "tries"} left.`
        : "Too many wrong codes. Call the rider or contact support.",
    );
  }

  const fee = ride.arrivedAt ? waitingFee(ride.arrivedAt, now) : 0;
  const ok = await transitionRide(ride.id, "arrived", {
    status: "in_progress",
    startedAt: now,
    waitingFeePaise: fee,
    totalPaise: ride.farePaise - ride.discountPaise + fee,
  });
  if (!ok) throw new AppError("CONFLICT", "This ride changed just now.");
  await addRideEvent(
    ride.id,
    "ride.started",
    { id: pilotId, role: "pilot" },
    { waitingFeePaise: fee },
  );
  await announce(ride.id, "in_progress");
}

export async function endTrip(pilotId: string, rideId: string, now: Date = new Date()) {
  const ride = await rideForPilot(pilotId, rideId);
  if (ride.status !== "in_progress") throw new AppError("CONFLICT", "This trip hasn't started.");
  const ok = await transitionRide(ride.id, "in_progress", {
    status: "completed",
    completedAt: now,
  });
  if (!ok) throw new AppError("CONFLICT", "This ride changed just now.");
  // A next trip accepted during this one starts now (docs/PRD.md F12).
  const next = await releaseQueuedRide(ride.id);
  await setPilotAvailable(pilotId, !next);
  await addRideEvent(ride.id, "ride.completed", { id: pilotId, role: "pilot" });
  await announce(ride.id, "completed");
  if (next) {
    await addRideEvent(next.id, "ride.released", { id: pilotId, role: "pilot" });
    await announce(next.id, "accepted");
  }
  await chargeOnCompletion(ride);
}

/** After 5 minutes of waiting the Pilot may leave; the rider owes ₹40. */
export async function cancelAsNoShow(pilotId: string, rideId: string, now: Date = new Date()) {
  const ride = await rideForPilot(pilotId, rideId);
  if (ride.status !== "arrived" || !ride.arrivedAt) {
    throw new AppError("CONFLICT", "You can only mark a no-show after arriving.");
  }
  if (!canCancelAsNoShow(ride.arrivedAt, now)) {
    throw new AppError("CONFLICT", "No-show cancel unlocks after 5 minutes of waiting.");
  }
  const ok = await transitionRide(ride.id, "arrived", {
    status: "no_show",
    cancelledAt: now,
    cancelledBy: "pilot",
    cancelReason: "Rider didn't show up",
    cancellationFeePaise: NO_SHOW_FEE,
    totalPaise: NO_SHOW_FEE,
  });
  if (!ok) throw new AppError("CONFLICT", "This ride changed just now.");
  await setPilotAvailable(pilotId, true);
  await addRideEvent(ride.id, "ride.no_show", { id: pilotId, role: "pilot" });
  // The ₹40 goes from the rider's wallet to the Pilot (waived if it can't cover it).
  if ((await chargeCancellation(ride.id)) === "paid") await announceBalance(ride.riderId);
  await announce(ride.id, "no_show");
}
