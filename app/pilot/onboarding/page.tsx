import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { requireUser } from "@/lib/auth/session";
import { getOnboarding } from "@/lib/services/onboarding";

import { OnboardingFlow } from "./OnboardingFlow";

export const metadata: Metadata = { title: "Become a Comet Pilot" };

/** "1 · Pilot onboarding" (docs/UX_FLOWS.md Flow 12). Real accounts only. */
export default async function PilotOnboardingPage() {
  const user = await requireUser("/pilot/onboarding");
  if (user.isDemo) redirect("/pilot");
  const view = await getOnboarding(user.id);

  return (
    <AppShell app="pilot" active="/pilot" layout="page" initial={user.displayName[0]}>
      <OnboardingFlow pilotId={user.id} initial={view} />
    </AppShell>
  );
}
