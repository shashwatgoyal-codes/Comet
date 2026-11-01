"use server";

import { runAction } from "@/lib/actions";
import { requireOpsUser } from "@/lib/auth/ops";
import { AppError } from "@/lib/errors";
import { approvePilot, listPilotApplications, rejectPilot } from "@/lib/services/onboarding";
import { pilotIdSchema, rejectPilotSchema } from "@/lib/validation/onboarding";

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
