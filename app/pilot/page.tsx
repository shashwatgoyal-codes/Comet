import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { CometLogo } from "@/components/icons/CometMark";
import { requireUser } from "@/lib/auth/session";
import { findPilotProfile } from "@/lib/repositories/pilots";
import { getPilotCurrentRide, getPilotStatus } from "@/lib/services/pilots";

import { PilotConsole } from "./PilotConsole";

export const metadata: Metadata = { title: "Comet Pilot" };

/** Pilot home: online switch and live requests. */
export default async function PilotHomePage() {
  const user = await requireUser("/pilot");
  const pilot = await findPilotProfile(user.id);

  // Real accounts apply through onboarding until ops approve them.
  if (!user.isDemo && pilot?.status !== "approved") redirect("/pilot/onboarding");

  if (!pilot || pilot.status !== "approved") {
    return (
      <AppShell app="pilot" active="/pilot" layout="map" initial={user.displayName[0]}>
        <main className="flex min-h-app flex-col gap-6 px-5 pt-7 pb-8 md:mx-auto md:max-w-[640px]">
          <CometLogo suffix="pilot" />
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            You&apos;re not a Comet Pilot yet
          </h1>
          <p className="text-muted-foreground">
            This demo account rides as a passenger. To try the Pilot side, start the Pilot demo, or
            sign in with your email to apply as a Pilot.
          </p>
          <Link href="/demo?role=pilot" className="font-semibold text-info hover:underline">
            Try the Pilot demo
          </Link>
        </main>
      </AppShell>
    );
  }

  if (await getPilotCurrentRide(user.id)) redirect("/pilot/trip");
  const { isOnline } = await getPilotStatus(user.id);

  return (
    <AppShell app="pilot" active="/pilot" layout="map" initial={user.displayName[0]}>
      <PilotConsole
        pilotId={user.id}
        initials={user.displayName
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)}
        initiallyOnline={isOnline}
      />
    </AppShell>
  );
}
