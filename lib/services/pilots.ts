import "server-only";

import { AppError } from "@/lib/errors";
import type { RideTier } from "@/lib/fares";
import { haversineM, type LatLng } from "@/lib/geo";
import { publicName } from "@/lib/names";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import {
  getPilotLocation,
  setPilotAvailable,
  setPilotOnline,
  upsertPilotLocation,
} from "@/lib/repositories/pilot-locations";
import { findPilotProfile } from "@/lib/repositories/pilots";
import { dispatchDueScheduledRides } from "@/lib/services/scheduling";
import {
  addRideEvent,
  assignRide,
  closeOtherOffers,
  findActiveRideForPilot,
  findOfferForPilot,
  findOpenOffersForPilot,
  findRideForParticipant,
  findUnpaidRideForPilot,
  setOfferStatus,
} from "@/lib/repositories/rides";
import { refreshRequestedRide } from "@/lib/services/matching";
import { toRideView } from "@/lib/services/rides";

/**
 * The Pilot's side: go online, share position, see and answer offers.
 */

async function requireApprovedPilot(userId: string) {
  const profile = await findPilotProfile(userId);
  if (!profile) throw new AppError("FORBIDDEN", "You're not a Comet Pilot yet.");
  if (profile.status !== "approved") {
    throw new AppError("FORBIDDEN", "Your Pilot account isn't approved yet.");
  }
  return profile;
}

export async function goOnline(pilotId: string, point: LatLng) {
  await requireApprovedPilot(pilotId);
  await upsertPilotLocation(pilotId, point, { isOnline: true });
  const active = await findActiveRideForPilot(pilotId);
  await setPilotAvailable(pilotId, !active);
}

export async function goOffline(pilotId: string) {
  const active = await findActiveRideForPilot(pilotId);
  if (active) throw new AppError("CONFLICT", "Finish your current ride before going offline.");
  await setPilotOnline(pilotId, false);
}

/**
 * A position update from the Pilot's device. Forwarded to the rider of
 * their active ride, if any, so the car moves on the rider's map.
 */
export async function updatePilotLocation(
  pilotId: string,
  point: LatLng,
  headingDeg: number | null,
  speedKmh: number | null,
) {
  const current = await getPilotLocation(pilotId);
  await upsertPilotLocation(pilotId, point, {
    headingDeg,
    speedKmh,
    isOnline: current?.isOnline ?? false,
  });
  const ride = await findActiveRideForPilot(pilotId);
  if (ride) {
    await broadcast({
      topic: topics.ride(ride.id),
      event: EVENTS.pilotLocation,
      payload: { point, headingDeg, at: new Date().toISOString() },
    });
  }
}

export type OfferView = {
  offerId: string;
  rideId: string;
  tier: RideTier;
  farePaise: number;
  pickupAddress: string;
  dropAddress: string;
  tripDistanceM: number;
  tripDurationS: number;
  pickupDistanceM: number | null;
  rider: { name: string; cometId: string; rating: number | null };
  /** The rider asked for a woman Pilot. Pilots see only this, nothing about her profile. */
  womenOnly: boolean;
  expiresAt: string;
};

/** Open requests for this Pilot, advancing any waiting rides as a side effect. */
export async function listOpenOffers(
  pilotId: string,
  now: Date = new Date(),
): Promise<OfferView[]> {
  await dispatchDueScheduledRides(now);
  const location = await getPilotLocation(pilotId);
  const offers = await findOpenOffersForPilot(pilotId, now);
  for (const o of offers) await refreshRequestedRide(o.ride, now);
  const stillOpen = await findOpenOffersForPilot(pilotId, now);
  return stillOpen.map((o) => ({
    offerId: o.id,
    rideId: o.rideId,
    tier: o.ride.tier as RideTier,
    farePaise: o.ride.farePaise,
    pickupAddress: o.ride.pickupAddress,
    dropAddress: o.ride.dropAddress,
    tripDistanceM: o.ride.distanceM,
    tripDurationS: o.ride.durationS,
    pickupDistanceM: location
      ? Math.round(haversineM(location.point, { lat: o.ride.pickupLat, lng: o.ride.pickupLng }))
      : null,
    rider: {
      name: publicName(o.ride.rider.displayName, true),
      cometId: o.ride.rider.cometId,
      rating: o.ride.rider.riderProfile?.ratingAvg
        ? Number(o.ride.rider.riderProfile.ratingAvg)
        : null,
    },
    womenOnly: o.ride.womenOnly,
    expiresAt: o.expiresAt.toISOString(),
  }));
}

/** First accept wins; everyone else learns the ride is taken. */
export async function acceptOffer(pilotId: string, offerId: string, now: Date = new Date()) {
  await requireApprovedPilot(pilotId);
  const offer = await findOfferForPilot(pilotId, offerId);
  if (!offer) throw new AppError("NOT_FOUND", "That request doesn't exist.");
  if (offer.status !== "offered" || offer.expiresAt <= now) {
    throw new AppError("CONFLICT", "This request is no longer available.");
  }

  const won = await assignRide(offer.rideId, pilotId, now);
  if (!won) {
    await setOfferStatus(offer.id, "offered", "taken", now);
    throw new AppError("CONFLICT", "Another Pilot took this ride.");
  }

  await setOfferStatus(offer.id, "offered", "accepted", now);
  const others = await closeOtherOffers(offer.rideId, offer.id, "taken");
  await setPilotAvailable(pilotId, false);
  await addRideEvent(offer.rideId, "ride.accepted", { id: pilotId, role: "pilot" });
  await broadcast(
    {
      topic: topics.ride(offer.rideId),
      event: EVENTS.rideUpdated,
      payload: { status: "accepted" },
    },
    ...others.map((o) => ({
      topic: topics.pilot(o.pilotId),
      event: EVENTS.offerGone,
      payload: { offerId: o.id },
    })),
  );
  return { rideId: offer.rideId };
}

export async function declineOffer(pilotId: string, offerId: string, now: Date = new Date()) {
  const offer = await findOfferForPilot(pilotId, offerId);
  if (!offer) throw new AppError("NOT_FOUND", "That request doesn't exist.");
  await setOfferStatus(offer.id, "offered", "declined", now);
}

/** The Pilot's current ride, without the rider's ride code. */
export async function getPilotActiveRide(pilotId: string) {
  const ride = await findActiveRideForPilot(pilotId);
  if (!ride) return null;
  const full = await findRideForParticipant(pilotId, ride.id);
  return full ? toRideView(full, false) : null;
}

/**
 * The trip screen's ride: the active one, or a finished cash ride whose
 * cash the Pilot hasn't confirmed yet. Rides paid online don't hold the
 * Pilot here — the rider pays in their own time.
 */
export async function getPilotCurrentRide(pilotId: string) {
  const active = await getPilotActiveRide(pilotId);
  if (active) return active;
  const cash = await findUnpaidRideForPilot(pilotId, "cash");
  return cash ? toRideView(cash, false) : null;
}

export async function getPilotStatus(pilotId: string) {
  const location = await getPilotLocation(pilotId);
  return { isOnline: location?.isOnline ?? false };
}
