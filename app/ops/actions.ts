"use server";

import type { z } from "zod";

import { runAction } from "@/lib/actions";
import { requireOpsUser } from "@/lib/auth/ops";
import { AppError } from "@/lib/errors";
import { approvePilot, listPilotApplications, rejectPilot } from "@/lib/services/onboarding";
import {
  acknowledgeSos,
  createPromo,
  getOpsOverview,
  resolveSos,
  setPromoActive,
} from "@/lib/services/ops";
import { pilotIdSchema, rejectPilotSchema } from "@/lib/validation/onboarding";
import {
  alertIdSchema,
  createPromoSchema,
  resolveSosSchema,
  setPromoActiveSchema,
} from "@/lib/validation/ops";

/** Ops actions (docs/API.md "Ops"). Every write goes to ops_audit_log. */

export async function listPilotApplicationsAction() {
  return runAction("ops.pilots.list", async () => {
    await requireOpsUser();
    return listPilotApplications();
  });
}

export async function approvePilotAction(input: unknown) {
  return runAction("ops.pilots.approve", async () => {
    const ops = await requireOpsUser();
    const parsed = pilotIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Couldn't approve this Pilot.");
    await approvePilot(ops.id, parsed.data.pilotId);
    return listPilotApplications();
  });
}

export async function rejectPilotAction(input: unknown) {
  return runAction("ops.pilots.reject", async () => {
    const ops = await requireOpsUser();
    const parsed = rejectPilotSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Add a reason.");
    }
    await rejectPilot(ops.id, parsed.data.pilotId, parsed.data.reason);
    return listPilotApplications();
  });
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Check the details.");
  }
  return parsed.data;
}

export async function getOpsOverviewAction() {
  return runAction("ops.overview", async () => getOpsOverview((await requireOpsUser()).id));
}

export async function acknowledgeSosAction(input: unknown) {
  return runAction("ops.sos.acknowledge", async () => {
    const ops = await requireOpsUser();
    await acknowledgeSos(ops.id, parse(alertIdSchema, input).alertId);
    return getOpsOverview(ops.id);
  });
}

export async function resolveSosAction(input: unknown) {
  return runAction("ops.sos.resolve", async () => {
    const ops = await requireOpsUser();
    const { alertId, note } = parse(resolveSosSchema, input);
    await resolveSos(ops.id, alertId, note);
    return getOpsOverview(ops.id);
  });
}

export async function createPromoAction(input: unknown) {
  return runAction("ops.promo.create", async () => {
    const ops = await requireOpsUser();
    await createPromo(ops.id, parse(createPromoSchema, input));
    return getOpsOverview(ops.id);
  });
}

export async function setPromoActiveAction(input: unknown) {
  return runAction("ops.promo.active", async () => {
    const ops = await requireOpsUser();
    const { promoId, active } = parse(setPromoActiveSchema, input);
    await setPromoActive(ops.id, promoId, active);
    return getOpsOverview(ops.id);
  });
}
