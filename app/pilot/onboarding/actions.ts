"use server";

import type { z } from "zod";

import { runAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import {
  chooseVehicle,
  getOnboarding,
  saveLicenceStep,
  savePayoutStep,
  savePhotosStep,
  saveProfileStep,
  saveRcStep,
  submitApplication,
} from "@/lib/services/onboarding";
import {
  licenceStepSchema,
  payoutStepSchema,
  profileStepSchema,
  rcStepSchema,
  vehicleTypeSchema,
} from "@/lib/validation/onboarding";

/** Pilot onboarding (docs/API.md "Pilot onboarding"). Each returns the fresh view. */

async function requireSignedIn() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return user;
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Check the details and try again.",
    );
  }
  return parsed.data;
}

export async function chooseVehicleAction(input: unknown) {
  return runAction("onboarding.vehicle", async () => {
    const user = await requireSignedIn();
    await chooseVehicle(user.id, parse(vehicleTypeSchema, input).vehicleType);
    return getOnboarding(user.id);
  });
}

export async function saveProfileStepAction(input: unknown) {
  return runAction("onboarding.profile", async () => {
    const user = await requireSignedIn();
    await saveProfileStep(user.id, parse(profileStepSchema, input).fullName);
    return getOnboarding(user.id);
  });
}

export async function saveLicenceStepAction(input: unknown) {
  return runAction("onboarding.licence", async () => {
    const user = await requireSignedIn();
    await saveLicenceStep(user.id, parse(licenceStepSchema, input));
    return getOnboarding(user.id);
  });
}

export async function saveRcStepAction(input: unknown) {
  return runAction("onboarding.rc", async () => {
    const user = await requireSignedIn();
    await saveRcStep(user.id, parse(rcStepSchema, input));
    return getOnboarding(user.id);
  });
}

export async function savePhotosStepAction() {
  return runAction("onboarding.photos", async () => {
    const user = await requireSignedIn();
    await savePhotosStep(user.id);
    return getOnboarding(user.id);
  });
}

export async function savePayoutStepAction(input: unknown) {
  return runAction("onboarding.payout", async () => {
    const user = await requireSignedIn();
    await savePayoutStep(user.id, parse(payoutStepSchema, input).upiId);
    return getOnboarding(user.id);
  });
}

export async function submitApplicationAction() {
  return runAction("onboarding.submit", async () => {
    const user = await requireSignedIn();
    await submitApplication(user.id);
    return getOnboarding(user.id);
  });
}

export async function getOnboardingAction() {
  return runAction("onboarding.get", async () => getOnboarding((await requireSignedIn()).id));
}
