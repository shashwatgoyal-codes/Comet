import "server-only";

import type { User } from "@prisma/client";
import { notFound } from "next/navigation";

import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

/**
 * The ops role (docs/SECURITY.md §2): a signed-in, non-demo account whose
 * email is in OPS_ADMIN_EMAILS. Deliberately not a database flag, so a
 * SQL edit can't create an admin.
 */
export function opsEmails(raw = process.env.OPS_ADMIN_EMAILS): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isOps(user: Pick<User, "email" | "isDemo" | "deletedAt"> | null): boolean {
  if (!user || user.isDemo || user.deletedAt || !user.email) return false;
  return opsEmails().has(user.email.toLowerCase());
}

/** For /ops pages: anyone else gets a plain 404, not a hint that it exists. */
export async function requireOpsPage(returnTo: string): Promise<User> {
  const user = await requireUser(returnTo);
  if (!isOps(user)) notFound();
  return user;
}

/** For ops Server Actions. */
export async function requireOpsUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  if (!isOps(user)) throw new AppError("FORBIDDEN", "This is for Comet Ops only.");
  return user;
}
