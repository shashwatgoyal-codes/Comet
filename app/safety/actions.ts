"use server";

import { runAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { createShareLink } from "@/lib/services/share";
import { endSos, raiseSos, setSafetyPin } from "@/lib/services/sos";
import { z } from "zod";

import { getChat, sendMessage } from "@/lib/services/chat";
import { rideIdSchema, sendMessageSchema } from "@/lib/validation/rides";
import {
  endSosSchema,
  raiseSosSchema,
  setPinSchema,
  womenOnlyPreferenceSchema,
  womenPassengersSchema,
} from "@/lib/validation/safety";
import {
  relaxWomenOnly,
  setWomenOnlyPreference,
  setWomenPassengersMode,
  simulateIdentityVerification,
} from "@/lib/services/women-only";

/** Safety actions shared by the rider and Pilot apps (docs/API.md "Safety"). */

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return user.id;
}

/** Never rate limited. The client retries until this succeeds. */
export async function raiseSosAction(input: unknown) {
  return runAction("sos.raise", async () => {
    const userId = await requireUserId();
    const parsed = raiseSosSchema.safeParse(input);
    if (!parsed.success) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
    return raiseSos(userId, parsed.data.rideId, {
      reason: parsed.data.reason,
      point: parsed.data.point,
    });
  });
}

export async function endSosAction(input: unknown) {
  return runAction("sos.end", async () => {
    const userId = await requireUserId();
    const parsed = endSosSchema.safeParse(input);
    if (!parsed.success) throw new AppError("INVALID_CODE", "Enter your 4-digit safety PIN.");
    await endSos(userId, parsed.data.alertId, parsed.data.pin);
    return { ended: true };
  });
}

export async function setSafetyPinAction(input: unknown) {
  return runAction("safety.pin", async () => {
    const userId = await requireUserId();
    const parsed = setPinSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Your PIN must be 4 digits.");
    await setSafetyPin(userId, parsed.data.pin, parsed.data.currentPin);
    return { saved: true };
  });
}

export async function createShareLinkAction(input: unknown) {
  return runAction("share.create", async () => {
    const userId = await requireUserId();
    const parsed = rideIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
    return createShareLink(userId, parsed.data.rideId);
  });
}

/** The simulated women-only verification. No ID is uploaded or stored. */
export async function simulateVerificationAction() {
  return runAction("identity.verify", async () => {
    await simulateIdentityVerification(await requireUserId());
    return { verified: true };
  });
}

export async function setWomenOnlyPreferenceAction(input: unknown) {
  return runAction("women_only.rider", async () => {
    const userId = await requireUserId();
    const parsed = womenOnlyPreferenceSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Choose when this applies.");
    await setWomenOnlyPreference(userId, parsed.data.mode, parsed.data.fallback);
    return { saved: true };
  });
}

export async function setWomenPassengersModeAction(input: unknown) {
  return runAction("women_only.pilot", async () => {
    const userId = await requireUserId();
    const parsed = womenPassengersSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Choose when this applies.");
    await setWomenPassengersMode(userId, parsed.data.mode);
    return { saved: true };
  });
}

/** "Match me with any Pilot" while a women-only request is waiting. */
export async function relaxWomenOnlyAction(input: unknown) {
  return runAction("women_only.relax", async () => {
    const userId = await requireUserId();
    const parsed = rideIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
    await relaxWomenOnly(userId, parsed.data.rideId);
    return { relaxed: true };
  });
}

/** The ride's chat. markRead when it's on screen. */
export async function getChatAction(input: unknown) {
  return runAction("chat.get", async () => {
    const userId = await requireUserId();
    const parsed = rideIdSchema.extend({ markRead: z.boolean().default(false) }).safeParse(input);
    if (!parsed.success) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
    return getChat(userId, parsed.data.rideId, parsed.data.markRead);
  });
}

export async function sendMessageAction(input: unknown) {
  return runAction("chat.send", async () => {
    const userId = await requireUserId();
    const parsed = sendMessageSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Messages are 1 to 500 characters.");
    await sendMessage(userId, parsed.data.rideId, parsed.data.body, parsed.data.isQuickReply);
    return { sent: true };
  });
}
