import "server-only";

import type { RideStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { RideTier } from "@/lib/fares";
import {
  findRatingBy,
  findRideForParticipant,
  findUnratedRecentRide,
  listRiderRides,
} from "@/lib/repositories/rides";
import { toRideView, type RideView } from "@/lib/services/rides";
import { dispatchDueScheduledRides } from "@/lib/services/scheduling";

/**
 * "10 · Ride history" and "11 · Receipt" (docs/PRD.md F7, docs/API.md
 * listRides / getReceipt). Riders only ever see their own rides.
 */

export type HistoryTab = "past" | "upcoming" | "cancelled";

const TAB_STATUSES: Record<HistoryTab, RideStatus[]> = {
  past: ["completed"],
  upcoming: ["scheduled"],
  cancelled: ["cancelled", "expired", "no_show"],
};

export type HistoryItem = {
  id: string;
  drop: string;
  tier: RideTier;
  status: RideStatus;
  at: string;
  totalPaise: number;
  paymentMethod: string;
  paymentStatus: string;
  cancellationFeePaise: number;
  cancelledBy: string | null;
  /** A few points of the route, for the thumbnail. */
  sketch: [number, number][];
};

const PAGE = 20;

/** Every nth point, so a long route draws as a small sketch. */
export function sketchRoute(coords: [number, number][], max = 24): [number, number][] {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)]!);
}

export async function listRides(
  riderId: string,
  tab: HistoryTab,
  cursor: string | null,
): Promise<{ items: HistoryItem[]; nextCursor: string | null }> {
  const statuses = TAB_STATUSES[tab];
  if (tab === "upcoming") await dispatchDueScheduledRides();
  const rows = await listRiderRides(riderId, statuses, cursor, PAGE + 1);
  const page = rows.slice(0, PAGE);
  return {
    items: page.map((r) => ({
      id: r.id,
      drop: r.dropAddress,
      tier: r.tier as RideTier,
      status: r.status,
      at: (r.scheduledFor && r.status === "scheduled"
        ? r.scheduledFor
        : (r.completedAt ?? r.cancelledAt ?? r.requestedAt)
      ).toISOString(),
      totalPaise: r.totalPaise + r.tipPaise,
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      cancellationFeePaise: r.cancellationFeePaise,
      cancelledBy: r.cancelledBy,
      sketch: sketchRoute(r.routeCoordinates as [number, number][]),
    })),
    nextCursor: rows.length > PAGE ? page.at(-1)!.id : null,
  };
}

export type Receipt = {
  ride: RideView;
  requestedAt: string;
  cancelledBy: string | null;
  cancelReason: string | null;
  myRating: { stars: number; tags: string[] } | null;
};

export async function getReceipt(riderId: string, rideId: string): Promise<Receipt> {
  const ride = await findRideForParticipant(riderId, rideId);
  if (!ride || ride.riderId !== riderId)
    throw new AppError("NOT_FOUND", "That ride doesn't exist.");
  const [view, rating] = await Promise.all([
    toRideView(ride, false),
    findRatingBy(riderId, rideId),
  ]);
  return {
    ride: view,
    requestedAt: ride.requestedAt.toISOString(),
    cancelledBy: ride.cancelledBy,
    cancelReason: ride.cancelReason,
    myRating: rating ? { stars: rating.stars, tags: rating.tags } : null,
  };
}

/** For the home screen's "Rate your ride" prompt: unrated rides from the last day. */
export async function getRatingPrompt(riderId: string, now: Date = new Date()) {
  return findUnratedRecentRide(riderId, new Date(now.getTime() - 86_400_000));
}

/** The rider's next ride booked ahead, for the home screen. */
export async function getNextScheduled(riderId: string) {
  return db.ride.findFirst({
    where: { riderId, status: "scheduled" },
    orderBy: { scheduledFor: "asc" },
    select: { id: true, dropAddress: true, scheduledFor: true },
  });
}
