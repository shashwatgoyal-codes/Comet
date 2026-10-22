import "server-only";

import { randomInt } from "node:crypto";

import { AppError } from "@/lib/errors";
import { splitFare, type RideTier } from "@/lib/fares";
import { formatRupees } from "@/lib/money";
import { publicName } from "@/lib/names";
import type { LatLng } from "@/lib/geo";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { getPilotLocation, setPilotAvailable } from "@/lib/repositories/pilot-locations";
import {
  ActiveRideExistsError,
  addRideEvent,
  closeOtherOffers,
  findActiveRideForRider,
  findRideForParticipant,
  findUnpaidRideForRider,
  insertRide,
  transitionRide,
  type RideWithPilot,
} from "@/lib/repositories/rides";
import { findUser } from "@/lib/repositories/users";
import { isActive, type RideStatus } from "@/lib/ride-state";
import { offerNextWave, refreshRequestedRide } from "@/lib/services/matching";
import { getValidQuote } from "@/lib/services/quotes";
import { isVerifiedFemale } from "@/lib/services/women-only";
import { dispatchDueScheduledRides } from "@/lib/services/scheduling";
import { MAX_UPCOMING, isValidPickupTime } from "@/lib/scheduling";
import { findPromo, toRule, usesByRider } from "@/lib/services/promos";
import { evaluatePromo } from "@/lib/promos";
import { db } from "@/lib/db";
import { chargeCancellation, walletBalance } from "@/lib/repositories/wallet";
import { announceBalance } from "@/lib/services/wallet";
import { CANCEL_REASONS, cancellationFee, type CancelReasonId } from "@/lib/cancellation";
import type { PaymentMethod } from "@/lib/wallet";

/**
 * The rider's side of a ride: book from a locked quote, follow it, cancel.
 */

export type RideView = {
  id: string;
  status: RideStatus;
  tier: RideTier;
  pickup: { address: string; point: LatLng };
  drop: { address: string; point: LatLng };
  routeCoordinates: [number, number][];
  distanceM: number;
  durationS: number;
  farePaise: number;
  waitingFeePaise: number;
  cancellationFeePaise: number;
  totalPaise: number;
  platformFeePaise: number;
  tipPaise: number;
  discountPaise: number;
  cashbackPaise: number;
  promoCode: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: "pending" | "paid" | "failed" | "refunded" | "waived";
  isDemo: boolean;
  womenOnly: boolean;
  scheduledFor: string | null;
  requestedAt: string;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Only ever present in the rider's own view (docs/DATABASE.md §10). */
  rideCode?: string;
  /** Only in the Pilot's view: the rider's first name and Comet ID (docs/SECURITY.md §2). */
  rider?: { firstName: string; cometId: string };
  pilot?: {
    name: string;
    cometId: string;
    rating: number | null;
    vehicle: string;
    plate: string;
    point: LatLng | null;
  };
};

export async function toRideView(ride: RideWithPilot, forRider: boolean): Promise<RideView> {
  const pilotLocation = ride.pilot ? await getPilotLocation(ride.pilot.id) : null;
  const profile = ride.pilot?.pilotProfile;
  return {
    id: ride.id,
    status: ride.status,
    tier: ride.tier as RideTier,
    pickup: { address: ride.pickupAddress, point: { lat: ride.pickupLat, lng: ride.pickupLng } },
    drop: { address: ride.dropAddress, point: { lat: ride.dropLat, lng: ride.dropLng } },
    routeCoordinates: ride.routeCoordinates as [number, number][],
    distanceM: ride.distanceM,
    durationS: ride.durationS,
    farePaise: ride.farePaise,
    waitingFeePaise: ride.waitingFeePaise,
    cancellationFeePaise: ride.cancellationFeePaise,
    totalPaise: ride.totalPaise,
    platformFeePaise: ride.platformFeePaise,
    tipPaise: ride.tipPaise,
    discountPaise: ride.discountPaise,
    cashbackPaise: ride.cashbackPaise,
    promoCode: ride.promo?.code ?? null,
    paymentMethod: ride.paymentMethod,
    paymentStatus: ride.paymentStatus,
    isDemo: ride.isDemo,
    womenOnly: ride.womenOnly,
    scheduledFor: ride.scheduledFor?.toISOString() ?? null,
    requestedAt: ride.requestedAt.toISOString(),
    arrivedAt: ride.arrivedAt?.toISOString() ?? null,
    startedAt: ride.startedAt?.toISOString() ?? null,
    completedAt: ride.completedAt?.toISOString() ?? null,
    ...(forRider
      ? { rideCode: ride.rideCode }
      : {
          rider: {
            firstName: ride.rider.displayName.split(" ")[0] ?? "Rider",
            cometId: ride.rider.cometId,
          },
        }),
    ...(ride.pilot && profile
      ? {
          pilot: {
            name: publicName(ride.pilot.displayName, ride.pilot.hideLastName),
            cometId: ride.pilot.cometId,
            rating: profile.ratingAvg ? Number(profile.ratingAvg) : null,
            vehicle: `${profile.vehicleColour ?? ""} ${profile.vehicleModel ?? ""}`.trim(),
            plate: profile.plate ?? "",
            point: pilotLocation?.point ?? null,
          },
        }
      : {}),
  };
}

export type BookInput = {
  quoteId: string;
  tier: RideTier;
  paymentMethod: PaymentMethod;
  /** Only verified women Pilots. Needs the rider to be verified too. */
  womenOnly?: boolean;
  promoCode?: string | null;
  /** Book ahead: the pickup time, on a quarter hour (lib/scheduling.ts). */
  scheduledFor?: Date | null;
};

/** Books a ride from a locked quote and offers it to the first wave. */
export async function bookRide(riderId: string, input: BookInput, now: Date = new Date()) {
  const rider = await findUser(riderId);
  if (!rider) throw new AppError("UNAUTHENTICATED", "Please sign in again.");

  const scheduledFor = input.scheduledFor ?? null;
  if (scheduledFor) {
    if (!isValidPickupTime(scheduledFor, now)) {
      throw new AppError(
        "VALIDATION",
        "Pick a time on the quarter hour, from 30 minutes ahead to 3 days from now.",
      );
    }
    const upcoming = await db.ride.count({ where: { riderId, status: "scheduled" } });
    if (upcoming >= MAX_UPCOMING) {
      throw new AppError("VALIDATION", `You can have up to ${MAX_UPCOMING} rides booked ahead.`);
    }
  }

  // A ride booked ahead doesn't need you to be free right now.
  const existing = scheduledFor ? null : await findActiveRideForRider(riderId);
  if (existing) {
    throw new AppError("CONFLICT", "You already have a ride in progress.");
  }
  if (await findUnpaidRideForRider(riderId)) {
    throw new AppError("CONFLICT", "Pay for your last ride first.");
  }

  if (input.womenOnly && !(await isVerifiedFemale(riderId))) {
    throw new AppError("FORBIDDEN", "Verify your profile to book women-only rides.");
  }

  const quote = await getValidQuote(riderId, input.quoteId, now);
  const prices = quote.prices as Record<RideTier, number>;
  const fare = prices[input.tier];
  if (typeof fare !== "number") throw new AppError("VALIDATION", "That ride type isn't available.");

  // A promo, checked against the same rules the choose screen previewed.
  let promo: { id: string; discountPaise: number; cashbackPaise: number } | null = null;
  if (input.promoCode) {
    const found = await findPromo(input.promoCode);
    if (!found) throw new AppError("VALIDATION", "That code isn't valid.");
    const outcome = evaluatePromo(toRule(found), {
      tier: input.tier,
      farePaise: fare,
      paymentMethod: input.paymentMethod,
      now,
      usesByRider: await usesByRider(riderId, found.id),
    });
    if (!outcome.ok) throw new AppError("VALIDATION", outcome.reason);
    promo = { id: found.id, ...outcome };
  }
  const total = fare - (promo?.discountPaise ?? 0);

  // Checked again when the trip ends: a waiting fee can raise the total.
  if (input.paymentMethod === "wallet") {
    const balance = await walletBalance(riderId);
    if (balance < total) {
      throw new AppError(
        "INSUFFICIENT_BALANCE",
        `Your wallet has ${formatRupees(balance)}. Top up ${formatRupees(total - balance)} or choose another way to pay.`,
      );
    }
  }

  let ride;
  try {
    ride = await insertRide(
      {
        riderId,
        quoteId: quote.id,
        tier: input.tier,
        pickupAddress: quote.pickupAddress,
        pickupLat: quote.pickupLat,
        pickupLng: quote.pickupLng,
        dropAddress: quote.dropAddress,
        dropLat: quote.dropLat,
        dropLng: quote.dropLng,
        routeCoordinates: quote.routeCoordinates as [number, number][],
        distanceM: quote.distanceM,
        durationS: quote.durationS,
        farePaise: fare,
        discountPaise: promo?.discountPaise ?? 0,
        cashbackPaise: promo?.cashbackPaise ?? 0,
        promoId: promo?.id ?? null,
        totalPaise: total,
        platformFeePaise: splitFare(fare).platformFee,
        paymentMethod: input.paymentMethod,
        rideCode: String(randomInt(0, 10_000)).padStart(4, "0"),
        isDemo: rider.isDemo,
        womenOnly: input.womenOnly ?? false,
        requestedAt: now,
        ...(scheduledFor ? { status: "scheduled" as const, scheduledFor } : {}),
      },
      { actorId: riderId, type: "ride.requested" },
    );
  } catch (err) {
    // Two taps at once: the unique active-ride index let only one through.
    if (err instanceof ActiveRideExistsError) {
      throw new AppError("CONFLICT", "You already have a ride in progress.");
    }
    throw err;
  }

  if (promo) {
    await db.promoRedemption.create({
      data: {
        promoId: promo.id,
        userId: riderId,
        rideId: ride.id,
        discountPaise: promo.discountPaise,
      },
    });
  }
  // Booked ahead: Pilots see it 15 minutes before pickup (dispatchDueScheduledRides).
  if (!scheduledFor) await offerNextWave(ride, now);
  return { rideId: ride.id, scheduled: scheduledFor !== null };
}

/** The rider's active ride, moved along if it's still waiting for a Pilot. */
export async function getRiderActiveRide(
  riderId: string,
  now: Date = new Date(),
): Promise<RideView | null> {
  await dispatchDueScheduledRides(now);
  let ride = await findActiveRideForRider(riderId);
  if (!ride) return null;
  if (ride.status === "requested") {
    const status = await refreshRequestedRide(ride, now);
    if (status !== "requested") ride = await findRideForParticipant(riderId, ride.id);
  }
  // Refreshing can end the ride (it expired); an ended ride isn't active.
  if (!ride || !isActive(ride.status)) return null;
  return toRideView(ride, true);
}

/**
 * What the trip screen shows: the active ride, or else the last finished
 * ride that still needs paying (so a reload mid-payment comes back here).
 */
export async function getRiderCurrentRide(riderId: string, now: Date = new Date()) {
  const active = await getRiderActiveRide(riderId, now);
  if (active) return active;
  const unpaidRide = await findUnpaidRideForRider(riderId);
  return unpaidRide ? toRideView(unpaidRide, true) : null;
}

/** One ride the rider took part in, active or finished (for the trip screen). */
export async function getRiderRide(riderId: string, rideId: string, now: Date = new Date()) {
  let ride = await findRideForParticipant(riderId, rideId);
  if (!ride || ride.riderId !== riderId)
    throw new AppError("NOT_FOUND", "That ride doesn't exist.");
  if (ride.status === "requested") {
    await refreshRequestedRide(ride, now);
    ride = (await findRideForParticipant(riderId, rideId))!;
  }
  return toRideView(ride, true);
}

/**
 * Cancels before the trip starts ("12 · Cancel ride"). Free while
 * searching or within 3 minutes of booking; after that ₹25 goes to the
 * Pilot, unless the reason is the Pilot's fault (lib/cancellation.ts). The
 * fee comes from the wallet, and is waived if the wallet can't cover it.
 */
export async function cancelRideAsRider(
  riderId: string,
  rideId: string,
  reason: CancelReasonId | null,
  now = new Date(),
): Promise<{ feePaise: number; charged: "paid" | "waived" | "none" }> {
  const ride = await findRideForParticipant(riderId, rideId);
  if (!ride || ride.riderId !== riderId)
    throw new AppError("NOT_FOUND", "That ride doesn't exist.");
  if (!["scheduled", "requested", "accepted", "arrived"].includes(ride.status)) {
    throw new AppError("CONFLICT", "This ride can't be cancelled now.");
  }

  const fee = cancellationFee({ status: ride.status, requestedAt: ride.requestedAt, now, reason });
  const label = CANCEL_REASONS.find((r) => r.id === reason)?.label ?? "Cancelled by rider";
  const ok = await transitionRide(ride.id, ride.status as RideStatus, {
    status: "cancelled",
    cancelledAt: now,
    cancelledBy: "rider",
    cancelReason: label,
    cancellationFeePaise: fee,
    totalPaise: fee,
  });
  if (!ok) throw new AppError("CONFLICT", "Your ride changed just now. Please check its status.");

  const closed = await closeOtherOffers(ride.id, null, "expired");
  if (ride.pilotId) await setPilotAvailable(ride.pilotId, true);
  await addRideEvent(
    ride.id,
    "ride.cancelled",
    { id: riderId, role: "rider" },
    { reason: label, feePaise: fee },
  );
  const outcome = await chargeCancellation(ride.id);
  await broadcast(
    { topic: topics.ride(ride.id), event: EVENTS.rideUpdated, payload: { status: "cancelled" } },
    ...closed.map((o) => ({
      topic: topics.pilot(o.pilotId),
      event: EVENTS.offerGone,
      payload: { offerId: o.id },
    })),
  );
  if (outcome === "paid") await announceBalance(riderId);
  return {
    feePaise: fee,
    charged: outcome === "paid" ? "paid" : outcome === "waived" ? "waived" : "none",
  };
}
