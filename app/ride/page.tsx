import { Gift, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { DESKTOP_PANEL, SHEET_HANDLE } from "@/components/layout/panel";
import { VehicleIcon } from "@/components/icons/Vehicle";
import { RiderTabBar } from "@/components/RiderTabBar";
import { requireUser } from "@/lib/auth/session";
import { RIDE_TIERS, TIER_RATES } from "@/lib/fares";
import { getNextScheduled, getRatingPrompt } from "@/lib/services/history";
import { getRiderCurrentRide } from "@/lib/services/rides";

import { HomeMap } from "./HomeMap";

export const metadata: Metadata = { title: "Home" };

function greeting(now = new Date()) {
  // Bengaluru time, whatever the server's clock zone.
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Kolkata",
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "2 · Home" on the canvas. */
export default async function RideHomePage() {
  const user = await requireUser("/ride");
  const firstName = user.displayName.split(" ")[0];
  const activeRide = await getRiderCurrentRide(user.id);
  const toRate = activeRide ? null : await getRatingPrompt(user.id);
  const nextScheduled = activeRide ? null : await getNextScheduled(user.id);

  return (
    <AppShell app="rider" active="/ride" layout="map" initial={firstName?.[0]}>
      <div className="relative h-app overflow-hidden">
        <div className="absolute inset-0">
          <HomeMap />
        </div>

        <div className="pointer-events-none absolute inset-x-5 top-6 flex items-center justify-between md:hidden">
          <Link
            href="/ride/account"
            aria-label="Account"
            className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-card font-heading text-base font-bold shadow-float"
          >
            {firstName?.[0]}
          </Link>
        </div>

        <section
          className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[var(--radius-sheet)] bg-card shadow-sheet md:pb-5 ${DESKTOP_PANEL}`}
        >
          <div className="flex flex-col gap-4 px-5 pt-3">
            <div
              className={`h-[5px] w-10 self-center rounded-full bg-border ${SHEET_HANDLE}`}
              aria-hidden
            />
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {greeting()}, {firstName}
            </h1>

            {activeRide && (
              <Link
                href="/ride/trip"
                className="flex items-center justify-between gap-3 rounded-lg bg-brand-soft px-4 py-3.5 font-semibold text-brand-text"
              >
                {activeRide.status === "requested"
                  ? "Finding your Pilot…"
                  : activeRide.status === "completed"
                    ? `Pay for your ride to ${activeRide.drop.address}`
                    : "Your ride is in progress"}
                <span className="text-sm">View →</span>
              </Link>
            )}

            {nextScheduled?.scheduledFor && (
              <Link
                href={`/ride/activity/${nextScheduled.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-info-soft px-4 py-3.5 font-semibold text-info"
              >
                <span className="truncate">
                  Booked: {nextScheduled.dropAddress} ·{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  }).format(nextScheduled.scheduledFor)}
                </span>
                <span className="text-sm">View →</span>
              </Link>
            )}

            {toRate && (
              <Link
                href={`/ride/activity/${toRate.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-info-soft px-4 py-3.5 font-semibold text-info"
              >
                <span className="truncate">Rate your ride to {toRate.dropAddress}</span>
                <span className="text-sm">★ Rate</span>
              </Link>
            )}

            <Link
              href="/ride/plan"
              className="flex h-[58px] items-center gap-3 rounded-lg bg-muted px-4 text-lg font-semibold"
            >
              <Search className="size-[22px]" aria-hidden strokeWidth={2.2} />
              Where to?
            </Link>

            <ul className="grid grid-cols-4 gap-2.5" aria-label="Ride types">
              {RIDE_TIERS.map((tier) => (
                <li
                  key={tier}
                  className="flex flex-col items-center gap-1.5 rounded-lg bg-muted px-1 py-3"
                >
                  <VehicleIcon tier={tier} className="h-7 w-10" />
                  <span className="text-[13px] font-semibold">
                    {TIER_RATES[tier].label.replace("Comet ", "")}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-3.5 rounded-lg bg-ink px-4 py-3.5 text-on-ink">
              <Gift className="size-6 shrink-0" aria-hidden />
              <p className="text-sm leading-snug">
                <b>Your Comet ID is {user.cometId}</b> — it&apos;s yours for good. Pilots see it on
                every ride, and referral rewards with it are coming soon.
              </p>
            </div>
          </div>
          <RiderTabBar active="/ride" />
        </section>
      </div>
    </AppShell>
  );
}
