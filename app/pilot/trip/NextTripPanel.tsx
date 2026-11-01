"use client";

import { Check } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { CHAIN_MAX_REMAINING_S, shortDistance } from "@/lib/chaining";
import { TIER_RATES } from "@/lib/fares";
import { formatRupees } from "@/lib/money";
import { useLive } from "@/lib/realtime/use-live";
import type { OfferView } from "@/lib/services/pilots";
import type { RideView } from "@/lib/services/rides";
import { cn } from "@/lib/utils";

import {
  acceptOfferAction,
  declineOfferAction,
  listOffersAction,
  setChainRequestsAction,
} from "../actions";

/**
 * "5b · Request while driving": near the end of a trip, a request whose
 * pickup is close to this drop-off can be queued as the next trip
 * (docs/PRD.md F12). Big targets, one decision, and it declines itself if
 * the Pilot doesn't tap.
 */
export function NextTripPanel({
  nextTrip,
  initialOn,
  onQueued,
}: {
  nextTrip: RideView["nextTrip"];
  initialOn: boolean;
  onQueued: () => Promise<void>;
}) {
  const [on, setOn] = useState(initialOn);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  async function refresh() {
    const result = await listOffersAction();
    if (result.ok) setOffers(result.data.filter((o) => o.chained));
  }
  useLive(null, () => void (on && !nextTrip && refresh()), 3_000);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    if (!next) setOffers([]);
    void setChainRequestsAction({ on: next });
  }

  function queue(offer: OfferView) {
    setError(null);
    startTransition(async () => {
      const result = await acceptOfferAction({ offerId: offer.offerId });
      setOffers([]);
      if (!result.ok) setError(result.message);
      await onQueued();
    });
  }

  function decline(offer: OfferView) {
    setOffers((list) => list.filter((o) => o.offerId !== offer.offerId));
    void declineOfferAction({ offerId: offer.offerId });
  }

  const offer = offers.find((o) => new Date(o.expiresAt).getTime() > now);
  const secondsLeft = offer
    ? Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - now) / 1000))
    : 0;

  return (
    <div className="flex flex-col gap-2.5">
      {nextTrip ? (
        <section
          aria-label="Next trip queued"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-text">
            <Check className="size-5" aria-hidden strokeWidth={2.4} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-bold">
              Next trip queued · {formatRupees(nextTrip.farePaise)}
            </span>
            <span className="truncate text-[13px] text-muted-foreground">
              {nextTrip.fromDropM < 100
                ? "Pickup right at this drop"
                : `Pickup ${shortDistance(nextTrip.fromDropM)} after this drop`}{" "}
              · {nextTrip.pickupAddress}
            </span>
          </span>
        </section>
      ) : (
        on &&
        offer?.chained && (
          <section
            aria-label={`Next trip request, ${formatRupees(offer.farePaise)}`}
            aria-live="assertive"
            className="flex flex-col gap-3.5 rounded-2xl bg-ink p-[18px] text-on-ink"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold tracking-wide text-primary-foreground">
                NEXT TRIP
              </span>
              <span className="text-[13px] text-ink-muted">
                Starts after you drop {offer.chained.afterRider}
              </span>
              <span className="ml-auto font-heading text-[15px] font-bold">{secondsLeft}s</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="flex flex-col gap-0.5">
                <span className="font-heading text-[32px] font-bold tracking-tight">
                  {formatRupees(offer.farePaise)}
                </span>
                <span className="text-[13px] text-ink-muted">
                  {TIER_RATES[offer.tier].label} · {(offer.tripDistanceM / 1000).toFixed(1)} km ·{" "}
                  {Math.max(1, Math.round(offer.tripDurationS / 60))} min
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-[15px] font-bold">
                  {offer.chained.fromDropM < 100 ? "At" : shortDistance(offer.chained.fromDropM)}
                </span>
                <span className="text-xs text-ink-muted">
                  {offer.chained.fromDropM < 100 ? "your drop" : "from your drop"}
                </span>
              </span>
            </div>
            <p className="truncate text-sm">
              {offer.pickupAddress} → <span className="font-semibold">{offer.dropAddress}</span>
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.min(100, (secondsLeft / 30) * 100)}%` }}
              />
            </div>
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                onClick={() => decline(offer)}
                className="h-[60px] flex-1 rounded-lg border-white/25 bg-transparent text-base font-bold text-on-ink hover:bg-white/10"
              >
                Decline
              </Button>
              <Button
                onClick={() => queue(offer)}
                disabled={pending}
                className="h-[60px] flex-[2] rounded-lg text-lg font-bold"
              >
                Queue next trip
              </Button>
            </div>
            <span className="text-xs text-ink-muted">
              Declines by itself if you don&apos;t tap. Navigation keeps running.
            </span>
          </section>
        )
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
      {!nextTrip && (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg bg-muted px-3.5 py-2 text-sm font-semibold">
          <span className="flex flex-1 flex-col">
            Get requests during trips
            <span className="text-xs font-normal text-muted-foreground">
              In the last {CHAIN_MAX_REMAINING_S / 60} minutes, for pickups near your drop
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={on}
            onChange={toggle}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "relative h-8 w-[52px] shrink-0 rounded-full transition-colors after:absolute after:top-[3px] after:left-[3px] after:size-[26px] after:rounded-full after:bg-white after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              on ? "bg-primary after:translate-x-5" : "bg-border",
            )}
          />
        </label>
      )}
    </div>
  );
}
