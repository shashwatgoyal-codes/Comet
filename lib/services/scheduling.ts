import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { addRideEvent, transitionRide } from "@/lib/repositories/rides";
import { DISPATCH_BEFORE_MS, DISPATCH_GRACE_MS } from "@/lib/scheduling";
import { offerNextWave } from "@/lib/services/matching";

/**
 * Releases scheduled rides to Pilots 15 minutes before pickup.
 *
 * There's no background job on the free tier, so this runs lazily, like
 * matching waves: online Pilots' screens and riders' screens call it as
 * they poll, every few seconds. Each ride moves with a conditional update,
 * so concurrent callers can't release one twice.
 */
export async function dispatchDueScheduledRides(now = new Date()): Promise<number> {
  const due = await db.ride.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lte: new Date(now.getTime() + DISPATCH_BEFORE_MS) },
    },
    orderBy: { scheduledFor: "asc" },
    take: 20,
  });

  let released = 0;
  for (const ride of due) {
    // Nobody was around to release it in time: too late to find a Pilot.
    if (ride.scheduledFor!.getTime() + DISPATCH_GRACE_MS < now.getTime()) {
      if (
        await transitionRide(ride.id, "scheduled", {
          status: "expired",
          cancelledAt: now,
          cancelledBy: "system",
          cancelReason: "Missed the pickup time",
          paymentStatus: "waived",
        })
      ) {
        await addRideEvent(ride.id, "ride.expired", { id: null, role: "system" });
      }
      continue;
    }

    let ok: boolean;
    try {
      ok = await transitionRide(ride.id, "scheduled", { status: "requested", requestedAt: now });
    } catch (err) {
      // The rider is already on another ride (one active ride per rider).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        await transitionRide(ride.id, "scheduled", {
          status: "cancelled",
          cancelledAt: now,
          cancelledBy: "system",
          cancelReason: "You were on another ride at pickup time",
          paymentStatus: "waived",
        });
        continue;
      }
      throw err;
    }
    if (!ok) continue; // Someone else released or cancelled it first.

    released++;
    await addRideEvent(ride.id, "ride.dispatched", { id: null, role: "system" });
    await offerNextWave({ ...ride, status: "requested", requestedAt: now }, now);
    await broadcast({
      topic: topics.rider(ride.riderId),
      event: EVENTS.rideUpdated,
      payload: { status: "requested" },
    });
  }
  if (released) log.info("scheduling.dispatched", { released });
  return released;
}
