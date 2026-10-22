import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { DESKTOP_PANEL, SHEET_HANDLE } from "@/components/layout/panel";
import { LiveMap } from "@/components/map/LiveMap";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { quoteFare, type QuoteView } from "@/lib/services/quotes";
import { getBalance } from "@/lib/services/wallet";
import { getWomenOnlySettings } from "@/lib/services/women-only";
import { listOffers } from "@/lib/services/promos";
import { modeActive } from "@/lib/women-only";
import { parseTripParams, tripSearchParams } from "@/lib/trip-params";

import { RideOptions } from "./RideOptions";

export const metadata: Metadata = { title: "Choose a ride" };

function formatTrip(q: QuoteView) {
  const km = (q.distanceM / 1000).toFixed(1);
  const min = Math.max(1, Math.round(q.durationS / 60));
  return `${km} km · ${min} min`;
}

/** "4 · Choose ride": the route on the map and a locked price per tier. */
export default async function ChoosePage({ searchParams }: PageProps<"/ride/choose">) {
  const trip = parseTripParams(await searchParams);
  // Come back to this same trip after signing in, not an empty page.
  const user = await requireUser(
    trip ? `/ride/choose?${tripSearchParams(trip.pickup, trip.drop)}` : "/ride/plan",
  );

  const balancePaise = await getBalance(user.id);
  const women = await getWomenOnlySettings(user.id);
  const offers = await listOffers(user.id);
  let quote: QuoteView | null = null;
  let problem: string | null = null;
  if (!trip) {
    problem = "That trip link isn't valid. Choose your destination again.";
  } else {
    try {
      quote = await quoteFare(user.id, trip.pickup, trip.drop);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      problem = err.message;
    }
  }

  return (
    <AppShell app="rider" active="/ride" layout="map" initial={user.displayName[0]}>
      <div className="relative h-app overflow-hidden">
        <div className="absolute inset-0">
          {trip && (
            <LiveMap
              center={trip.pickup.point}
              pickup={trip.pickup.point}
              drop={trip.drop.point}
              route={quote?.routeCoordinates}
              bottomInset={0.58}
            />
          )}
        </div>

        <Link
          href="/ride/plan"
          aria-label="Back"
          className="absolute top-6 left-5 flex size-12 items-center justify-center rounded-full bg-card shadow-float md:hidden"
        >
          <ArrowLeft className="size-[22px]" aria-hidden strokeWidth={2.2} />
        </Link>

        <section
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-[var(--radius-sheet)] bg-card px-5 pt-3 pb-6 shadow-sheet md:pt-5 ${DESKTOP_PANEL}`}
        >
          <div
            className={`h-[5px] w-10 self-center rounded-full bg-border ${SHEET_HANDLE}`}
            aria-hidden
          />
          {quote && trip ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Link
                  href="/ride/plan"
                  aria-label="Back"
                  className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-muted md:flex"
                >
                  <ArrowLeft className="size-5" aria-hidden strokeWidth={2.2} />
                </Link>
                <h1 className="flex-1 font-heading text-[22px] font-bold tracking-tight">
                  Choose a ride
                </h1>
                <span className="text-sm text-muted-foreground">{formatTrip(quote)}</span>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {trip.pickup.address} →{" "}
                <span className="font-semibold text-foreground">{trip.drop.address}</span>
              </p>
              {quote.isEstimate && (
                <p className="rounded-sm bg-warn-soft px-3 py-2 text-xs font-semibold text-warn">
                  Live routing is unavailable, so distance is estimated. Prices may change slightly.
                </p>
              )}
              <RideOptions
                quoteId={quote.quoteId}
                prices={quote.prices}
                balancePaise={balancePaise}
                offers={offers}
                womenOnlyDefault={women.verified ? modeActive(women.mode, new Date()) : null}
                returnPath={`/ride/choose?${tripSearchParams(trip.pickup, trip.drop)}`}
              />
            </>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <h1 className="font-heading text-xl font-bold">We couldn&apos;t price this trip</h1>
              <p role="alert" className="text-sm text-muted-foreground">
                {problem}
              </p>
              <Link
                href="/ride/plan"
                className="flex h-14 items-center justify-center rounded-lg bg-primary text-[17px] font-bold text-primary-foreground"
              >
                Change destination
              </Link>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
