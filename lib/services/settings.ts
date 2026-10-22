import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { findActiveRideForPilot, findActiveRideForRider } from "@/lib/repositories/rides";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** "17 · Settings" and "Delete my account" (docs/DATABASE.md §8). */

export async function setHideLastName(userId: string, hide: boolean) {
  await db.user.update({ where: { id: userId }, data: { hideLastName: hide } });
}

/**
 * Anonymises the account: name becomes "Deleted user"; email, avatar and
 * safety PIN are cleared; saved places and emergency contacts are deleted.
 * The Comet ID is retired, never reissued. Rides, ratings and the ledger
 * stay for financial integrity. The sign-in itself is deleted, so the same
 * email starts a fresh account next time.
 */
export async function deleteAccount(userId: string, now = new Date()) {
  if ((await findActiveRideForRider(userId)) || (await findActiveRideForPilot(userId))) {
    throw new AppError("CONFLICT", "Finish or cancel your current ride first.");
  }
  await db.$transaction([
    db.savedPlace.deleteMany({ where: { userId } }),
    db.emergencyContact.deleteMany({ where: { userId } }),
    db.user.update({
      where: { id: userId },
      data: {
        deletedAt: now,
        displayName: "Deleted user",
        email: null,
        avatarPath: null,
        safetyPinHash: null,
        hideLastName: true,
      },
    }),
  ]);
  // Best effort: the account is already anonymised; a leftover sign-in
  // can't reach it (deleted users are never loaded).
  try {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
    if (error) log.warn("account.auth_delete_failed", { status: error.status ?? null });
  } catch (err) {
    log.warn("account.auth_delete_failed", { error: err instanceof Error ? err.name : "unknown" });
  }
  log.info("account.deleted", {});
}
