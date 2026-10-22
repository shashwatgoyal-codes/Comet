import type { Metadata } from "next";

import { AppShell } from "@/components/layout/AppShell";
import { requireUser } from "@/lib/auth/session";
import { listPlaces } from "@/lib/services/places";

import { PlanForm } from "./PlanForm";

export const metadata: Metadata = { title: "Plan your ride" };

export default async function PlanPage() {
  const user = await requireUser("/ride/plan");
  return (
    <AppShell app="rider" active="/ride" layout="page" initial={user.displayName[0]}>
      <PlanForm savedPlaces={await listPlaces(user.id)} />
    </AppShell>
  );
}
