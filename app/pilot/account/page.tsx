import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountCard } from "@/components/AccountCard";
import { AppShell } from "@/components/layout/AppShell";
import { SafetyLink } from "@/components/safety/SafetyLink";
import { SafetyPinCard } from "@/components/safety/SafetyPinCard";
import { hasSafetyPin } from "@/lib/services/sos";
import { requireUser } from "@/lib/auth/session";
import { TIER_RATES, type RideTier } from "@/lib/fares";
import { findPilotProfile } from "@/lib/repositories/pilots";
import { getPilotDocuments } from "@/lib/services/onboarding";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pilot account" };

/** "9 · Pilot account": Comet ID, vehicle and documents with expiry warnings. */
export default async function PilotAccountPage() {
  const user = await requireUser("/pilot/account");
  const pilot = await findPilotProfile(user.id);
  if (!pilot) redirect("/pilot");
  const documents = await getPilotDocuments(user.id);

  return (
    <AppShell app="pilot" active="/pilot/account" layout="page" initial={user.displayName[0]}>
      <main className="flex min-h-dvh flex-col gap-5 px-5 pt-6 pb-8 md:mx-auto md:min-h-0 md:max-w-[640px] md:px-0 md:pt-0">
        <div className="flex items-center gap-3">
          <Link
            href="/pilot"
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full bg-card"
          >
            <ArrowLeft className="size-[22px]" aria-hidden strokeWidth={2.2} />
          </Link>
          <h1 className="font-heading text-[22px] font-bold tracking-tight">Pilot account</h1>
        </div>
        <AccountCard user={user} roleLabel="Pilot" />
        <SafetyPinCard hasPin={await hasSafetyPin(user.id)} isDemo={user.isDemo} />
        <SafetyLink
          href="/pilot/account/women-passengers"
          title="Women passengers only"
          sub="Only get requests from women riders"
        />
        <section className="flex items-center gap-3.5 rounded-lg bg-card p-4">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="font-bold">
              {pilot.vehicleColour} {pilot.vehicleModel}
            </span>
            <span className="text-sm text-muted-foreground">
              {pilot.tier ? TIER_RATES[pilot.tier as RideTier].label : "No tier yet"} ·{" "}
              {pilot.seats} seats · {pilot.status}
            </span>
          </span>
          <span className="rounded-sm border-2 border-foreground px-2 py-1.5 font-heading text-xs font-bold tracking-wider whitespace-nowrap">
            {pilot.plate}
          </span>
        </section>
        {documents.length > 0 && (
          <section
            aria-labelledby="docs-h"
            className="flex flex-col gap-2.5 rounded-lg bg-card p-4"
          >
            <h2
              id="docs-h"
              className="text-xs font-bold tracking-widest text-muted-foreground uppercase"
            >
              Documents
            </h2>
            <ul className="flex flex-col gap-2.5">
              {documents.map((d) => (
                <li key={d.kind} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{d.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
                      d.warn ? "bg-warn-soft text-warn" : "bg-info-soft text-info",
                    )}
                  >
                    {d.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppShell>
  );
}
