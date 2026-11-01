"use client";

import { IndianRupee, Power, Star, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState, useTransition } from "react";

import { DESKTOP_PANEL, SHEET_HANDLE } from "@/components/layout/panel";
import { LiveMap } from "@/components/map/LiveMap";
import { Button } from "@/components/ui/button";
import { bestMatchIndex, farePerKm } from "@/lib/chaining";
import { TIER_RATES } from "@/lib/fares";
import { formatRupees } from "@/lib/money";
import { topics } from "@/lib/realtime/topics";
import { useLive } from "@/lib/realtime/use-live";
import type { OfferView } from "@/lib/services/pilots";
import { useCurrentPosition } from "@/lib/use-current-position";
import { cn } from "@/lib/utils";

import {
  acceptOfferAction,
  declineOfferAction,
  listOffersAction,
  setOnlineAction,
  updateLocationAction,
} from "./actions";

/** How often an online Pilot reports their position (docs/ARCHITECTURE.md §4). */
const LOCATION_INTERVAL_MS = 4_000;

/**
 * "2 · Online & demand", "3 · Ride request" and "3b · Multiple requests"
 * on the canvas: the online switch, location sharing, and live requests.
 */
export function PilotConsole({
  pilotId,
  initials,
  initiallyOnline,
}: {
  pilotId: string;
  initials: string;
  initiallyOnline: boolean;
}) {
  const router = useRouter();
  const { position } = useCurrentPosition();
  const [online, setOnline] = useState(initiallyOnline);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  // A plain function: useLive wraps it so it always sees the latest state.
  async function refreshOffers() {
    if (!online) return;
    const result = await listOffersAction();
    if (result.ok) setOffers(result.data);
  }
  useLive(online ? topics.pilot(pilotId) : null, () => void refreshOffers(), 3_000);

  // Report position while online.
  const sendLocation = useEffectEvent(() => {
    void updateLocationAction({ point: position, headingDeg: null, speedKmh: null });
  });
  useEffect(() => {
    if (!online) return;
    const timer = setInterval(() => sendLocation(), LOCATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [online]);

  // A clock for the countdowns.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  function toggle() {
    setError(null);
    const next = !online;
    startTransition(async () => {
      const result = await setOnlineAction({ online: next, point: position });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOnline(next);
      if (!next) setOffers([]);
    });
  }

  function accept(offer: OfferView) {
    setError(null);
    startTransition(async () => {
      const result = await acceptOfferAction({ offerId: offer.offerId });
      if (result.ok) {
        router.push("/pilot/trip");
        return;
      }
      setError(result.message);
      setOffers((list) => list.filter((o) => o.offerId !== offer.offerId));
    });
  }

  function decline(offer: OfferView) {
    setOffers((list) => list.filter((o) => o.offerId !== offer.offerId));
    void declineOfferAction({ offerId: offer.offerId });
  }

  const visible = offers.filter((o) => new Date(o.expiresAt).getTime() > now);
  const best = bestMatchIndex(visible.map((o) => o.pickupDistanceM));

  function skipAll() {
    visible.forEach(decline);
  }

  return (
    <div className="relative h-app overflow-hidden">
      <div className="absolute inset-0">
        <LiveMap center={position} you={position} bottomInset={0.4} />
      </div>
      {visible.length > 0 && <div className="absolute inset-0 bg-ink/40" aria-hidden />}

      <div className="absolute inset-x-5 top-6 flex items-center gap-2.5 md:inset-x-auto md:right-6 md:w-[320px]">
        <Link
          href="/pilot/account"
          aria-label="Pilot account"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card font-heading text-base font-bold shadow-float md:hidden"
        >
          {initials}
        </Link>
        <Link
          href="/pilot/earnings"
          aria-label="Earnings"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card shadow-float md:hidden"
        >
          <IndianRupee className="size-5" aria-hidden strokeWidth={2.4} />
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={online}
          className={cn(
            "flex h-[52px] flex-1 items-center justify-between rounded-full pr-1.5 pl-5 text-base font-bold shadow-float",
            online ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
          )}
        >
          {online ? "You're online" : "Go online"}
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              online ? "bg-ink text-ink-accent" : "bg-primary text-primary-foreground",
            )}
          >
            <Power className="size-5" aria-hidden strokeWidth={2.4} />
          </span>
        </button>
      </div>

      {visible.length > 0 ? (
        <div
          className="absolute inset-x-3 bottom-3 flex flex-col gap-2.5 md:inset-x-auto md:bottom-auto md:left-6 md:top-6 md:max-h-[calc(100%-3rem)] md:w-[400px] md:overflow-y-auto"
          aria-live="assertive"
        >
          {visible.length > 1 && (
            <div className="flex items-center justify-between gap-3 px-2 text-white">
              <span className="flex flex-col">
                <span className="font-heading text-[22px] font-bold tracking-tight">
                  {visible.length} ride requests
                </span>
                <span className="text-sm opacity-85">
                  Pick one — the others go to nearby Pilots
                </span>
              </span>
              <button
                type="button"
                onClick={skipAll}
                className="h-10 shrink-0 rounded-full bg-white/15 px-3.5 text-sm font-bold"
              >
                Skip all
              </button>
            </div>
          )}
          {visible.map((offer, i) => (
            <OfferCard
              key={offer.offerId}
              offer={offer}
              secondsLeft={Math.max(
                0,
                Math.ceil((new Date(offer.expiresAt).getTime() - now) / 1000),
              )}
              highlighted={best === null ? i === 0 : i === best}
              bestMatch={i === best}
              disabled={pending}
              onAccept={() => accept(offer)}
              onDecline={() => decline(offer)}
            />
          ))}
        </div>
      ) : (
        <section
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-[var(--radius-sheet)] bg-card px-5 pt-3 pb-8 shadow-sheet md:pt-6 md:pb-6 ${DESKTOP_PANEL}`}
        >
          <div
            className={`h-[5px] w-10 self-center rounded-full bg-border ${SHEET_HANDLE}`}
            aria-hidden
          />
          <h1 className="font-heading text-[22px] font-bold tracking-tight">
            {online ? "Finding trips near you" : "You're offline"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {online
              ? "Requests from riders nearby will appear here."
              : "Go online to start receiving ride requests."}
          </p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger-text">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function OfferCard({
  offer,
  secondsLeft,
  highlighted,
  bestMatch,
  disabled,
  onAccept,
  onDecline,
}: {
  offer: OfferView;
  secondsLeft: number;
  highlighted: boolean;
  bestMatch: boolean;
  disabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border-2 bg-card p-4 shadow-modal",
        highlighted ? "border-primary" : "border-transparent",
      )}
      aria-label={`Ride request, ${formatRupees(offer.farePaise)}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-text">
            {TIER_RATES[offer.tier].label}
          </span>
          {offer.womenOnly && (
            <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-bold text-info">
              Women-only
            </span>
          )}
          {bestMatch && (
            <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-text">
              <Zap className="size-3 fill-current" aria-hidden />
              Best match
            </span>
          )}
        </span>
        <span
          className={cn(
            "ml-auto text-sm font-bold",
            secondsLeft <= 5 ? "text-danger-text" : "text-brand-text",
          )}
        >
          {secondsLeft}s
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="font-heading text-[28px] font-bold tracking-tight">
              {formatRupees(offer.farePaise)}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {farePerKm(offer.farePaise, offer.tripDistanceM)}
            </span>
          </span>
          <span className="text-[13px] text-muted-foreground">
            {offer.pickupDistanceM !== null && `Pickup ${km(offer.pickupDistanceM)} · `}
            Trip {km(offer.tripDistanceM)}
          </span>
        </div>
        <Button
          variant="outline"
          onClick={onDecline}
          aria-label="Decline"
          className="size-[52px] rounded-lg"
        >
          <X className="size-5" aria-hidden />
        </Button>
        <Button
          onClick={onAccept}
          disabled={disabled}
          className="h-[52px] rounded-lg px-6 text-base font-bold"
        >
          Accept
        </Button>
      </div>
      <p className="truncate text-sm">
        {offer.pickupAddress} → <span className="font-semibold">{offer.dropAddress}</span>
      </p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Star className="size-3 fill-current" aria-hidden />
        {offer.rider.rating?.toFixed(1) ?? "New rider"} · {offer.rider.name} · {offer.rider.cometId}
      </p>
    </article>
  );
}
