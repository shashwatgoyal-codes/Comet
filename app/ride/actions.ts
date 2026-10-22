"use server";

import { runAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { quoteFare, searchPlaces } from "@/lib/services/quotes";
import {
  bookRide,
  cancelRideAsRider,
  getRiderActiveRide,
  getRiderRide,
} from "@/lib/services/rides";
import { quoteRequestSchema, searchPlacesSchema } from "@/lib/validation/places";
import {
  bookRideSchema,
  cancelRideSchema,
  listRidesSchema,
  promoLookupSchema,
  rateRideSchema,
  rideIdSchema,
} from "@/lib/validation/rides";
import { listRides } from "@/lib/services/history";
import { rateRide } from "@/lib/services/ratings";
import { lookUpCode } from "@/lib/services/promos";

/** Rider actions (docs/API.md "Places and quotes", "Rides (rider)"). */

async function requireRider() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return user;
}

export async function searchPlacesAction(input: unknown) {
  return runAction("places.search", async () => {
    await requireRider();
    const parsed = searchPlacesSchema.safeParse(input);
    if (!parsed.success) return [];
    return searchPlaces(parsed.data.query, parsed.data.near);
  });
}

export async function quoteFareAction(input: unknown) {
  return runAction("quote.create", async () => {
    const user = await requireRider();
    const parsed = quoteRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Choose a pickup and a drop in India to see prices.");
    }
    return quoteFare(user.id, parsed.data.pickup, parsed.data.drop);
  });
}

export async function bookRideAction(input: unknown) {
  return runAction("ride.book", async () => {
    const user = await requireRider();
    const parsed = bookRideSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Choose a ride type to book.");
    return bookRide(user.id, parsed.data);
  });
}

/** Polled by the trip screen; also advances a ride that's waiting for a Pilot. */
export async function getActiveRideAction() {
  return runAction("ride.active", async () => {
    const user = await requireRider();
    return getRiderActiveRide(user.id);
  });
}

export async function cancelRideAction(input: unknown) {
  return runAction("ride.cancel", async () => {
    const user = await requireRider();
    const parsed = cancelRideSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "That ride can't be cancelled.");
    return cancelRideAsRider(user.id, parsed.data.rideId, parsed.data.reason);
  });
}

/** One of the rider's rides, active or finished — the trip screen's poll. */
export async function getRideAction(input: unknown) {
  return runAction("ride.get", async () => {
    const user = await requireRider();
    const parsed = rideIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
    return getRiderRide(user.id, parsed.data.rideId);
  });
}

/** Rates the other side of a finished ride (either side may call it). */
export async function rateRideAction(input: unknown) {
  return runAction("ride.rate", async () => {
    const user = await requireRider();
    const parsed = rateRideSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Choose 1 to 5 stars.");
    const { rideId, ...rating } = parsed.data;
    await rateRide(user.id, rideId, rating);
    return { rated: true };
  });
}

export async function listRidesAction(input: unknown) {
  return runAction("ride.list", async () => {
    const user = await requireRider();
    const parsed = listRidesSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "That list isn't available.");
    return listRides(user.id, parsed.data.tab, parsed.data.cursor);
  });
}

/** A typed promo code, with its rules for the choose screen to preview. */
export async function lookUpPromoAction(input: unknown) {
  return runAction("promo.lookup", async () => {
    const user = await requireRider();
    const parsed = promoLookupSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Enter a code first.");
    return lookUpCode(user.id, parsed.data.code);
  });
}
