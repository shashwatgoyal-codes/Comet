import { CircleHelp, History, MapPin, Settings, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { AccountCard } from "@/components/AccountCard";
import { AppShell } from "@/components/layout/AppShell";
import { MenuRow } from "@/components/MenuRow";
import { RiderTabBar } from "@/components/RiderTabBar";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listPlaces } from "@/lib/services/places";
import { getWomenOnlySettings } from "@/lib/services/women-only";

export const metadata: Metadata = { title: "Account" };

/** "9 · Account & Comet ID". */
export default async function AccountPage() {
  const user = await requireUser("/ride/account");
  const [trips, places, women, profile] = await Promise.all([
    db.ride.count({ where: { riderId: user.id, status: "completed" } }),
    listPlaces(user.id),
    getWomenOnlySettings(user.id),
    db.riderProfile.findUnique({ where: { userId: user.id }, select: { ratingAvg: true } }),
  ]);
  const rating = profile?.ratingAvg ? Number(profile.ratingAvg).toFixed(1) : null;

  return (
    <AppShell app="rider" active="/ride/account" layout="page" initial={user.displayName[0]}>
      <div className="flex min-h-dvh flex-col md:mx-auto md:min-h-0 md:max-w-[640px]">
        <main className="flex flex-1 flex-col gap-5 px-5 pt-7 md:px-0 md:pt-0">
          <div className="flex items-center gap-4">
            <span className="flex size-[68px] items-center justify-center rounded-full bg-primary font-heading text-[26px] font-bold text-primary-foreground">
              {user.displayName[0]}
            </span>
            <div className="flex flex-col gap-0.5">
              <h1 className="font-heading text-[22px] font-bold tracking-tight">
                {user.displayName}
              </h1>
              <span className="text-[13px] font-semibold text-muted-foreground">
                {rating ? `★ ${rating} rider rating · ` : ""}
                {trips} {trips === 1 ? "trip" : "trips"}
              </span>
            </div>
          </div>
          <AccountCard user={user} roleLabel="Rider" />
          <nav aria-label="Account" className="flex flex-col rounded-xl bg-card px-4">
            <MenuRow
              href="/ride/activity"
              label="Ride history"
              hint={`${trips} ${trips === 1 ? "trip" : "trips"}`}
              Icon={History}
            />
            <MenuRow
              href="/ride/account/places"
              label="Saved places"
              hint={
                places
                  .slice(0, 2)
                  .map((p) => p.name)
                  .join(", ") || "None yet"
              }
              Icon={MapPin}
            />
            <MenuRow
              href="/ride/account/women-only"
              label="Women Pilots only"
              hint={women.mode === "off" ? "Off" : women.mode === "night" ? "Night" : "On"}
              Icon={ShieldCheck}
            />
            <MenuRow href="/ride/account/help" label="Help & support" Icon={CircleHelp} />
            <MenuRow
              href="/ride/account/settings"
              label="Settings & SOS contacts"
              Icon={Settings}
            />
          </nav>
        </main>
        <RiderTabBar active="/ride/account" />
      </div>
    </AppShell>
  );
}
