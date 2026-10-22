import "server-only";

import {
  SIM,
  SIM_CASH_CONFIRM_S,
  SIM_WOMAN_PILOT,
  SIM_TOTAL_S,
  SIM_VEHICLES,
  simPosition,
  simStep,
  type SimPhase,
} from "@/lib/demo-sim";
import { AppError } from "@/lib/errors";
import type { RideTier } from "@/lib/fares";
import { db } from "@/lib/db";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { upsertPilotLocation } from "@/lib/repositories/pilot-locations";
import {
  addRideEvent,
  assignRide,
  closeOtherOffers,
  findRideForParticipant,
  transitionRide,
} from "@/lib/repositories/rides";
import { findSimulatedPilotFor, wantsSimulatedPilot } from "@/lib/repositories/users";
import { refreshRequestedRide } from "@/lib/services/matching";
import { settleRide } from "@/lib/repositories/wallet";
import { DEMO_PERSONAS, ensureSimulatedPilot } from "@/lib/services/accounts";
import { answerAsBot } from "@/lib/services/chat";
import { simulateIdentityVerification } from "@/lib/services/women-only";
import { chargeOnCompletion } from "@/lib/services/payments";
import { toRideView, type RideView } from "@/lib/services/rides";

/**
 * Advances a demo ride along the simulated Pilot's script. Called by the
 * demo rider's screen every couple of seconds (POST /api/demo/tick).
 *
 * The target state is a pure function of time since the request
 * (lib/demo-sim.ts), and every step is a conditional transition, so ticks
 * can arrive late, twice, or from two tabs at once without harm. If a
 * real Pilot accepted first, the bot stands aside and this only reports.
 */

const ORDER: SimPhase[] = ["searching", "approaching", "waiting", "on_trip", "done"];
const reached = (phase: SimPhase, target: SimPhase) =>
  ORDER.indexOf(phase) >= ORDER.indexOf(target);

export async function tickDemoRide(
  riderId: string,
  rideId: string,
  now: Date = new Date(),
): Promise<RideView> {
  let ride = await findRideForParticipant(riderId, rideId);
  if (!ride || ride.riderId !== riderId || !ride.isDemo) {
    throw new AppError("NOT_FOUND", "That demo ride doesn't exist.");
  }

  const elapsedS = (now.getTime() - ride.requestedAt.getTime()) / 1000;
  const step = simStep(elapsedS);
  const botId = (await findSimulatedPilotFor(riderId)) ?? (await ensureSimulatedPilot(riderId));
  const at = (offsetS: number) => new Date(ride!.requestedAt.getTime() + offsetS * 1000);

  // With the simulated Pilot switched off, this is an ordinary ride:
  // offer waves advance and it expires like any other.
  if (ride.status === "requested" && !(await wantsSimulatedPilot(riderId))) {
    await refreshRequestedRide(ride, now);
    return toRideView((await findRideForParticipant(riderId, rideId))!, true);
  }

  // The bot accepts only if the ride is still waiting.
  if (ride.status === "requested" && reached(step.phase, "approaching")) {
    const vehicle = SIM_VEHICLES[ride.tier as RideTier];
    await db.pilotProfile.update({
      where: { userId: botId },
      data: { tier: ride.tier, ...vehicle },
    });
    // On a women-only ride the bot plays a verified woman Pilot.
    await db.user.update({
      where: { id: botId },
      data: { displayName: ride.womenOnly ? SIM_WOMAN_PILOT : DEMO_PERSONAS.pilot.displayName },
    });
    if (ride.womenOnly) await simulateIdentityVerification(botId);
    if (await assignRide(ride.id, botId, at(SIM.ACCEPT_AT_S))) {
      await db.ride.update({ where: { id: ride.id }, data: { simulationStartedAt: now } });
      await closeOtherOffers(ride.id, null, "taken");
      await addRideEvent(
        ride.id,
        "ride.accepted",
        { id: botId, role: "pilot" },
        { simulated: true },
      );
    }
    ride = (await findRideForParticipant(riderId, rideId))!;
  }

  if (ride.pilotId === botId) {
    const arriveAt = SIM.ACCEPT_AT_S + SIM.APPROACH_S;
    const startAt = arriveAt + SIM.WAIT_S;
    if (ride.status === "accepted" && reached(step.phase, "waiting")) {
      await transitionRide(ride.id, "accepted", { status: "arrived", arrivedAt: at(arriveAt) });
      await addRideEvent(
        ride.id,
        "ride.arrived",
        { id: botId, role: "pilot" },
        { simulated: true },
      );
      ride.status = "arrived";
    }
    if (ride.status === "arrived" && reached(step.phase, "on_trip")) {
      await transitionRide(ride.id, "arrived", {
        status: "in_progress",
        startedAt: at(startAt),
        totalPaise: ride.farePaise - ride.discountPaise,
      });
      await addRideEvent(
        ride.id,
        "ride.started",
        { id: botId, role: "pilot" },
        { simulated: true },
      );
      ride.status = "in_progress";
    }
    if (ride.status === "in_progress" && reached(step.phase, "done")) {
      if (await transitionRide(ride.id, "in_progress", { status: "completed", completedAt: now })) {
        await addRideEvent(
          ride.id,
          "ride.completed",
          { id: botId, role: "pilot" },
          { simulated: true },
        );
        await chargeOnCompletion(ride);
      }
      ride.status = "completed";
    }
    // The bot collects cash like a real Pilot would: the exact fare.
    if (
      ride.status === "completed" &&
      ride.paymentMethod === "cash" &&
      elapsedS >= SIM_TOTAL_S + SIM_CASH_CONFIRM_S
    ) {
      await settleRide(ride.id, "cash");
    }

    // The bot answers chat like a polite Pilot.
    await answerAsBot(ride.id, botId, now);

    const { point, headingDeg } = simPosition(
      step,
      { lat: ride.pickupLat, lng: ride.pickupLng },
      ride.routeCoordinates as [number, number][],
    );
    // isOnline false: the bot is visible on its own ride, never matched to others.
    await upsertPilotLocation(botId, point, { headingDeg, isOnline: false });
    await broadcast({
      topic: topics.ride(ride.id),
      event: EVENTS.pilotLocation,
      payload: { point, headingDeg, at: now.toISOString() },
    });
  }

  return toRideView((await findRideForParticipant(riderId, rideId))!, true);
}
