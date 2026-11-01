import "server-only";

import type { Ride } from "@prisma/client";

import type { RideTier } from "@/lib/fares";
import { log } from "@/lib/log";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { CHAIN_MAX_DROP_DISTANCE_M, CHAIN_MAX_REMAINING_S } from "@/lib/chaining";
import { findChainPilots, findNearestPilots } from "@/lib/repositories/pilot-locations";
import { db } from "@/lib/db";
import { isNightInIndia } from "@/lib/women-only";
import {
  addRideEvent,
  closeOtherOffers,
  createOffers,
  findOffersForRide,
  transitionRide,
} from "@/lib/repositories/rides";

/**
 * Matching (docs/PRD.md F4). A request is offered in waves to the nearest
 * eligible Pilots; the first to accept wins. When a wave runs out, the
 * next nearest Pilots are tried; after REQUEST_TIMEOUT the ride expires.
 *
 * There is no background job (Vercel has none on the free tier), so waves
 * advance lazily: whenever the rider's screen or a Pilot's screen asks for
 * the ride's state, refreshRequestedRide() moves it along. Both screens
 * poll every few seconds, so in practice waves advance on time.
 */

export const MATCH_RADIUS_M = 5_000;
export const WAVE_SIZE = 3;
export const OFFER_TTL_MS = 30_000;
export const REQUEST_TIMEOUT_MS = 3 * 60_000;
/** Pilots whose last position is older than this aren't offered rides. */
export const LOCATION_FRESH_S = 60;

async function isVerifiedFemale(userId: string): Promise<boolean> {
  const row = await db.identityVerification.findUnique({ where: { userId } });
  return row?.verifiedFemale ?? false;
}

/** Offers the ride to the next wave of Pilots. Returns how many were offered. */
export async function offerNextWave(ride: Ride, now: Date): Promise<number> {
  const previous = await findOffersForRide(ride.id);
  const wave = previous.reduce((max, o) => Math.max(max, o.wave), 0) + 1;

  const rules = {
    point: { lat: ride.pickupLat, lng: ride.pickupLng },
    tier: ride.tier as RideTier,
    freshSeconds: LOCATION_FRESH_S,
    // Never re-offer to a Pilot who already saw it, nor to the rider
    // (a demo account can be both).
    excludePilotIds: [...previous.map((o) => o.pilotId), ride.riderId],
    womenOnly: ride.womenOnly,
    riderVerifiedFemale: await isVerifiedFemale(ride.riderId),
    night: isNightInIndia(now),
  };
  const free = await findNearestPilots({ ...rules, radiusM: MATCH_RADIUS_M, limit: WAVE_SIZE });
  // Free Pilots first; the rest of the wave goes to Pilots about to drop
  // off nearby (docs/PRD.md F12).
  const chained = await findChainPilots({
    ...rules,
    maxDropDistanceM: CHAIN_MAX_DROP_DISTANCE_M,
    maxRemainingS: CHAIN_MAX_REMAINING_S,
    limit: WAVE_SIZE - free.length,
    excludePilotIds: [...rules.excludePilotIds, ...free.map((c) => c.pilotId)],
  });
  const candidates = [...free, ...chained];
  if (candidates.length === 0) return 0;

  const expiresAt = new Date(now.getTime() + OFFER_TTL_MS);
  const offers = await createOffers(
    ride.id,
    candidates.map((c) => c.pilotId),
    wave,
    expiresAt,
  );
  await addRideEvent(
    ride.id,
    "offers.sent",
    { id: null, role: "system" },
    { wave, count: offers.length },
  );
  await broadcast(
    ...offers.map((o) => ({
      topic: topics.pilot(o.pilotId),
      event: EVENTS.offerCreated,
      payload: { offerId: o.id, expiresAt: o.expiresAt.toISOString() },
    })),
  );
  log.info("matching.wave", { wave, offered: offers.length });
  return offers.length;
}

/**
 * Moves a waiting ride along: closes expired offers, sends the next wave
 * when the current one is spent, and expires the ride after the timeout.
 * Safe to call any number of times, from any number of requests.
 */
export async function refreshRequestedRide(ride: Ride, now: Date): Promise<Ride["status"]> {
  if (ride.status !== "requested") return ride.status;

  if (now.getTime() - ride.requestedAt.getTime() >= REQUEST_TIMEOUT_MS) {
    const expired = await transitionRide(ride.id, "requested", {
      status: "expired",
      cancelledAt: now,
      cancelledBy: "system",
      cancelReason: "No Pilot accepted in time",
    });
    if (expired) {
      const closed = await closeOtherOffers(ride.id, null, "expired");
      await addRideEvent(ride.id, "ride.expired", { id: null, role: "system" });
      await broadcast(
        { topic: topics.ride(ride.id), event: EVENTS.rideUpdated, payload: { status: "expired" } },
        ...closed.map((o) => ({
          topic: topics.pilot(o.pilotId),
          event: EVENTS.offerGone,
          payload: { offerId: o.id },
        })),
      );
    }
    return expired ? "expired" : ride.status;
  }

  const offers = await findOffersForRide(ride.id);
  const live = offers.filter((o) => o.status === "offered" && o.expiresAt > now);
  if (live.length === 0) {
    await closeOtherOffers(ride.id, null, "expired");
    await offerNextWave(ride, now);
  }
  return "requested";
}
