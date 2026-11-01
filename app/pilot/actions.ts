"use server";

import { runAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import {
  acceptOffer,
  declineOffer,
  getPilotActiveRide,
  getPilotStatus,
  goOffline,
  goOnline,
  listOpenOffers,
  setChainRequests,
  updatePilotLocation,
} from "@/lib/services/pilots";
import {
  cancelAsNoShow,
  endTrip,
  getPilotRide,
  markArrived,
  startTrip,
} from "@/lib/services/trips";
import { confirmCashPayment } from "@/lib/services/payments";
import { requestPayout } from "@/lib/services/wallet";
import { cashPaymentSchema, payoutSchema } from "@/lib/validation/payments";
import {
  locationUpdateSchema,
  offerIdSchema,
  rideIdSchema,
  setChainRequestsSchema,
  setOnlineSchema,
  startTripSchema,
} from "@/lib/validation/rides";

/** Pilot actions (docs/API.md "Rides (Pilot)"). */

async function requirePilotUser() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return user;
}

export async function setOnlineAction(input: unknown) {
  return runAction("pilot.online", async () => {
    const user = await requirePilotUser();
    const parsed = setOnlineSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Couldn't change your status.");
    if (parsed.data.online) {
      if (!parsed.data.point) throw new AppError("VALIDATION", "Waiting for your location…");
      await goOnline(user.id, parsed.data.point);
    } else {
      await goOffline(user.id);
    }
    return { online: parsed.data.online };
  });
}

export async function updateLocationAction(input: unknown) {
  return runAction("pilot.location", async () => {
    const user = await requirePilotUser();
    const parsed = locationUpdateSchema.safeParse(input);
    if (!parsed.success) return { ok: false };
    await updatePilotLocation(
      user.id,
      parsed.data.point,
      parsed.data.headingDeg,
      parsed.data.speedKmh,
    );
    return { ok: true };
  });
}

export async function listOffersAction() {
  return runAction("pilot.offers", async () => {
    const user = await requirePilotUser();
    return listOpenOffers(user.id);
  });
}

export async function acceptOfferAction(input: unknown) {
  return runAction("pilot.accept", async () => {
    const user = await requirePilotUser();
    const parsed = offerIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "That request isn't valid.");
    return acceptOffer(user.id, parsed.data.offerId);
  });
}

export async function declineOfferAction(input: unknown) {
  return runAction("pilot.decline", async () => {
    const user = await requirePilotUser();
    const parsed = offerIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "That request isn't valid.");
    await declineOffer(user.id, parsed.data.offerId);
    return { declined: true };
  });
}

export async function getPilotActiveRideAction() {
  return runAction("pilot.active_ride", async () => {
    const user = await requirePilotUser();
    return getPilotActiveRide(user.id);
  });
}

function rideIdFrom(input: unknown) {
  const parsed = rideIdSchema.safeParse(input);
  if (!parsed.success) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
  return parsed.data.rideId;
}

export async function getPilotRideAction(input: unknown) {
  return runAction("pilot.ride", async () => {
    const user = await requirePilotUser();
    return getPilotRide(user.id, rideIdFrom(input));
  });
}

export async function markArrivedAction(input: unknown) {
  return runAction("trip.arrived", async () => {
    const user = await requirePilotUser();
    await markArrived(user.id, rideIdFrom(input));
    return { ok: true };
  });
}

export async function startTripAction(input: unknown) {
  return runAction("trip.start", async () => {
    const user = await requirePilotUser();
    const parsed = startTripSchema.safeParse(input);
    if (!parsed.success) throw new AppError("INVALID_CODE", "Enter the rider's 4-digit code.");
    await startTrip(user.id, parsed.data.rideId, parsed.data.code);
    return { ok: true };
  });
}

export async function endTripAction(input: unknown) {
  return runAction("trip.end", async () => {
    const user = await requirePilotUser();
    await endTrip(user.id, rideIdFrom(input));
    return { ok: true };
  });
}

export async function noShowAction(input: unknown) {
  return runAction("trip.no_show", async () => {
    const user = await requirePilotUser();
    await cancelAsNoShow(user.id, rideIdFrom(input));
    return { ok: true };
  });
}

export async function confirmCashAction(input: unknown) {
  return runAction("payment.cash", async () => {
    const user = await requirePilotUser();
    const parsed = cashPaymentSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Enter the amount you received.");
    return confirmCashPayment(
      user.id,
      parsed.data.rideId,
      parsed.data.receivedPaise,
      parsed.data.creditChangeToWallet,
    );
  });
}

/** "Withdraw" on the earnings screen. Simulated: no money leaves Comet. */
export async function requestPayoutAction(input: unknown) {
  return runAction("payout.request", async () => {
    const user = await requirePilotUser();
    const parsed = payoutSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "There's nothing to withdraw yet.");
    return requestPayout(user.id, parsed.data.amountPaise, parsed.data.requestId);
  });
}

/** "Get requests during trips" (docs/PRD.md F12). */
export async function setChainRequestsAction(input: unknown) {
  return runAction("pilot.chain", async () => {
    const user = await requirePilotUser();
    const parsed = setChainRequestsSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Couldn't change that setting.");
    await setChainRequests(user.id, parsed.data.on);
    return getPilotStatus(user.id);
  });
}
