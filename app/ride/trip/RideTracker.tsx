"use client";

import { Check, Clock, Share2, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { ChatButton, ChatPanel, useChat } from "@/components/chat/ChatPanel";
import { LiveMap } from "@/components/map/LiveMap";
import { DESKTOP_PANEL, SHEET_HANDLE } from "@/components/layout/panel";
import { RatingForm } from "@/components/RatingForm";
import { SosFlow } from "@/components/safety/SosFlow";
import { Button } from "@/components/ui/button";
import { CANCEL_REASONS, cancellationFee, type CancelReasonId } from "@/lib/cancellation";
import { TIER_RATES } from "@/lib/fares";
import { formatRupees } from "@/lib/money";
import { starString } from "@/lib/ratings";
import { topics } from "@/lib/realtime/topics";
import { useLive } from "@/lib/realtime/use-live";
import type { RideView } from "@/lib/services/rides";
import type { SosView } from "@/lib/services/sos";
import { cn } from "@/lib/utils";
import { ASK_FALLBACK_AFTER_MS } from "@/lib/women-only";
import { PAYMENT_METHOD_LABELS } from "@/lib/wallet";

import { createShareLinkAction, relaxWomenOnlyAction } from "@/app/safety/actions";

import { cancelRideAction, getRideAction } from "../actions";
import { TripPayment } from "./TripPayment";

/**
 * The rider's live trip: "5 · Finding Pilot" → "6 · Pilot on the way" →
 * on trip → paying ("7b") → "7 · Trip done". Kept in sync by useLive
 * (Realtime + polling) until the ride is over and paid.
 * A demo ride polls /api/demo/tick instead, which also drives its
 * simulated Pilot.
 */
export function RideTracker({
  initial,
  initialSos,
  isDemoUser,
  womenOnlyFallback,
}: {
  initial: RideView;
  initialSos: SosView | null;
  isDemoUser: boolean;
  womenOnlyFallback: "ask" | "wait";
}) {
  const [ride, setRide] = useState<RideView>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [sosOpen, setSosOpen] = useState(initialSos !== null);
  const [chatOpen, setChatOpen] = useState(false);
  const chatAvailable = ["accepted", "arrived", "in_progress"].includes(ride.status);
  const { chat, refresh: refreshChat } = useChat(ride.id, chatOpen, chatAvailable);
  // "Ask me first": after one offer wave with no woman Pilot, ask.
  const [askReady, setAskReady] = useState(false);
  const [askDismissed, setAskDismissed] = useState(false);
  const askable = ride.status === "requested" && ride.womenOnly && womenOnlyFallback === "ask";
  useEffect(() => {
    if (!askable) return;
    const due = new Date(ride.requestedAt).getTime() + ASK_FALLBACK_AFTER_MS - Date.now();
    const timer = setTimeout(() => setAskReady(true), Math.max(0, due));
    return () => clearTimeout(timer);
  }, [askable, ride.requestedAt]);

  function matchAnyPilot() {
    startTransition(async () => {
      await relaxWomenOnlyAction({ rideId: ride.id });
      await refresh();
    });
  }
  const [share, setShare] = useState<{ url: string; copied: boolean } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  async function shareTrip() {
    setShareError(null);
    const result = await createShareLinkAction({ rideId: ride.id });
    if (!result.ok) {
      setShareError(result.message);
      return;
    }
    const url = `${window.location.origin}${result.data.path}`;
    let copied = false;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Follow my Comet ride", text: "Track my ride live:", url });
      } catch {
        // Closed the share sheet; the link below still works.
      }
    } else {
      copied = await navigator.clipboard?.writeText(url).then(
        () => true,
        () => false,
      );
    }
    setShare({ url, copied: Boolean(copied) });
  }
  const ended = ["completed", "cancelled", "expired", "no_show"].includes(ride.status);
  const awaitingPayment =
    ride.status === "completed" &&
    (ride.paymentStatus === "pending" || ride.paymentStatus === "failed");
  const finished = ended && !awaitingPayment;

  async function refresh() {
    if (finished) return;
    if (ride.isDemo) {
      const res = await fetch("/api/demo/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId: ride.id }),
      });
      if (res.ok) setRide(((await res.json()) as { ride: RideView }).ride);
      return;
    }
    const result = await getRideAction({ rideId: ride.id });
    if (result.ok) setRide(result.data);
  }

  useLive(finished ? null : topics.ride(ride.id), refresh, ride.isDemo ? 2_000 : 3_000);

  function cancel(reason: CancelReasonId | null) {
    setError(null);
    startTransition(async () => {
      const result = await cancelRideAction({ rideId: ride.id, reason });
      setConfirming(false);
      if (!result.ok) {
        setError(result.message);
        await refresh();
        return;
      }
      setRide({
        ...ride,
        status: "cancelled",
        cancellationFeePaise: result.data.feePaise,
        paymentStatus: result.data.charged === "paid" ? "paid" : "waived",
      });
    });
  }

  if (awaitingPayment) return <TripPayment ride={ride} onChange={refresh} />;
  if (ride.status === "completed") return <TripDone ride={ride} />;
  if (ended) return <Ended ride={ride} />;

  const waiting = ride.status === "requested";
  const minutes = Math.max(1, Math.round(ride.durationS / 60));

  return (
    <div className="relative h-app overflow-hidden">
      <div className="absolute inset-0">
        <LiveMap
          center={ride.pickup.point}
          pickup={ride.pickup.point}
          drop={ride.drop.point}
          car={ride.pilot?.point ?? undefined}
          route={ride.routeCoordinates}
          bottomInset={0.55}
        />
      </div>

      {!waiting && (
        <div className="absolute top-6 right-5">
          <Button
            variant="destructive"
            onClick={() => setSosOpen(true)}
            className="h-12 rounded-full bg-destructive px-5 font-bold text-white shadow-float"
          >
            <ShieldAlert className="size-[18px]" aria-hidden />
            SOS
          </Button>
        </div>
      )}

      <section
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-[var(--radius-sheet)] bg-card px-5 pt-3 pb-6 shadow-sheet md:pt-6 ${DESKTOP_PANEL}`}
        aria-live="polite"
      >
        <div
          className={`h-[5px] w-10 self-center rounded-full bg-border ${SHEET_HANDLE}`}
          aria-hidden
        />

        {waiting ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="font-heading text-2xl font-bold tracking-tight">
                Finding your Pilot…
              </h1>
              <p className="text-[15px] text-muted-foreground">
                {ride.womenOnly
                  ? "Asking nearby verified women Pilots. This can take a little longer."
                  : "Asking nearby Pilots. This usually takes under a minute."}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
            </div>
            {ride.womenOnly && (
              <span className="flex w-fit items-center gap-1.5 rounded-full bg-info-soft px-3 py-1 text-xs font-bold text-info">
                <ShieldCheck className="size-3.5" aria-hidden />
                Women Pilots only
              </span>
            )}
            {askable && askReady && !askDismissed && (
              <div
                role="status"
                className="flex flex-col gap-3 rounded-lg border border-border p-4"
              >
                <span className="font-bold">No woman Pilot has accepted yet</span>
                <span className="text-sm text-muted-foreground">
                  Match with any verified Pilot nearby, or keep waiting for a woman Pilot.
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setAskDismissed(true)}
                    className="h-12 rounded-md font-bold"
                  >
                    Keep waiting
                  </Button>
                  <Button
                    onClick={matchAnyPilot}
                    disabled={pending}
                    className="h-12 rounded-md font-bold"
                  >
                    Match any Pilot
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="font-heading text-[22px] font-bold tracking-tight">
                  {ride.status === "accepted" && "Your Pilot is on the way"}
                  {ride.status === "arrived" && "Your Pilot has arrived"}
                  {ride.status === "in_progress" && `Heading to ${ride.drop.address}`}
                </h1>
                <span className="text-sm text-muted-foreground">
                  {ride.status === "in_progress"
                    ? "Sit back — you'll see the fare when you arrive."
                    : `Meet at ${ride.pickup.address}`}
                </span>
              </div>
              {ride.rideCode && ride.status !== "in_progress" && (
                <div className="flex flex-col items-center gap-1 rounded-md bg-ink px-3 py-2 text-on-ink">
                  <span className="text-[11px] font-bold tracking-widest uppercase">Code</span>
                  <span
                    className="font-heading text-[22px] font-bold tracking-[0.2em]"
                    data-testid="ride-code"
                  >
                    {ride.rideCode}
                  </span>
                </div>
              )}
            </div>

            {ride.pilot && <PilotCard pilot={ride.pilot} />}

            <Button
              variant="outline"
              onClick={() => void shareTrip()}
              className="h-12 rounded-lg font-bold"
            >
              <Share2 className="size-[18px]" aria-hidden />
              Share trip
            </Button>
            {share && (
              <p
                role="status"
                className="flex flex-col gap-1 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info"
              >
                <span className="font-semibold">
                  {share.copied ? "Link copied. " : ""}Anyone with this link can follow your ride
                  live until an hour after it ends.
                </span>
                <span className="truncate font-mono text-xs" data-testid="share-url">
                  {share.url}
                </span>
              </p>
            )}
            {shareError && (
              <p role="alert" className="text-sm font-semibold text-danger-text">
                {shareError}
              </p>
            )}
          </>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {TIER_RATES[ride.tier].label} · {minutes} min ·{" "}
              {PAYMENT_METHOD_LABELS[ride.paymentMethod]}
            </span>
            <span className="truncate font-semibold">{ride.drop.address}</span>
          </span>
          <span className="font-heading font-bold">{formatRupees(ride.totalPaise)}</span>
        </div>

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            {error}
          </p>
        )}
        {(ride.status === "requested" ||
          ride.status === "accepted" ||
          ride.status === "arrived") && (
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              onClick={() => (waiting ? cancel(null) : setConfirming(true))}
              disabled={pending}
              className="h-[54px] flex-1 rounded-lg text-base font-bold text-danger-text"
            >
              {pending ? "Cancelling…" : "Cancel ride"}
            </Button>
            {!waiting && (
              <ChatButton unread={chat?.unread ?? 0} onClick={() => setChatOpen(true)} />
            )}
          </div>
        )}
        {ride.status === "in_progress" && (
          <div className="flex flex-col">
            <ChatButton unread={chat?.unread ?? 0} onClick={() => setChatOpen(true)} />
          </div>
        )}
      </section>
      {chatOpen && (
        <ChatPanel
          rideId={ride.id}
          chat={chat}
          side="rider"
          title={`${ride.pilot?.name.split(" ")[0] ?? "Your Pilot"} · your Pilot`}
          subtitle={ride.pilot?.plate ?? ""}
          onSent={refreshChat}
          onClose={() => setChatOpen(false)}
        />
      )}
      {sosOpen && (
        <SosFlow
          rideId={ride.id}
          role="rider"
          initialAlert={initialSos}
          subject={`Trip with ${ride.pilot?.name.split(" ")[0] ?? "your Pilot"} · ${ride.pilot?.plate ?? ""}`}
          details={
            ride.pilot
              ? `${ride.pilot.name} · ${ride.pilot.plate} · ${ride.pilot.cometId}`
              : "Your ride and route"
          }
          isDemo={isDemoUser}
          onShare={() => void shareTrip()}
          onClose={() => setSosOpen(false)}
        />
      )}
      {confirming && (
        <CancelSheet
          ride={ride}
          pending={pending}
          onKeep={() => setConfirming(false)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

function PilotCard({ pilot }: { pilot: NonNullable<RideView["pilot"]> }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl bg-muted p-3.5">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-info font-heading text-xl font-bold text-white dark:text-ink">
        {initials(pilot.name)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-bold" data-testid="pilot-name">
          {pilot.name}
        </span>
        <span className="text-sm text-muted-foreground">{pilot.vehicle}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="size-3 fill-current" aria-hidden />
          {pilot.rating?.toFixed(1) ?? "New"} · {pilot.cometId}
        </span>
      </div>
      <span className="rounded-sm border-2 border-foreground px-2 py-1.5 font-heading text-xs font-bold tracking-wider whitespace-nowrap">
        {pilot.plate}
      </span>
    </div>
  );
}

/** "12 · Cancel ride": the fee, if any, is shown before confirming. */
function CancelSheet({
  ride,
  pending,
  onKeep,
  onCancel,
}: {
  ride: RideView;
  pending: boolean;
  onKeep: () => void;
  onCancel: (reason: CancelReasonId) => void;
}) {
  const [reason, setReason] = useState<CancelReasonId>("too_long");
  const [now] = useState(() => new Date());
  const fee = cancellationFee({
    status: ride.status,
    requestedAt: new Date(ride.requestedAt),
    now,
    reason,
  });
  const baseFee = cancellationFee({
    status: ride.status,
    requestedAt: new Date(ride.requestedAt),
    now,
    reason: null,
  });
  const pilotFirst = ride.pilot?.name.split(" ")[0] ?? "Your Pilot";

  return (
    <div className="absolute inset-0 z-20 flex items-end bg-ink/40 md:items-center md:justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        className="flex w-full flex-col gap-3.5 rounded-t-[var(--radius-sheet)] bg-card px-5 pt-3 pb-6 shadow-sheet md:max-w-[440px] md:rounded-3xl md:pt-6"
      >
        <div
          className={`h-[5px] w-10 self-center rounded-full bg-border ${SHEET_HANDLE}`}
          aria-hidden
        />
        <h2 id="cancel-title" className="font-heading text-[22px] font-bold tracking-tight">
          Cancel this ride?
        </h2>
        <div className="flex gap-3 rounded-lg bg-warn-soft p-3.5 text-sm text-warn">
          <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <b>
              {ride.status === "arrived"
                ? `${pilotFirst} is at the pickup.`
                : `${pilotFirst} is on the way.`}
            </b>{" "}
            {baseFee > 0
              ? `A ${formatRupees(baseFee)} fee applies because more than 3 minutes have passed since booking. It goes to ${pilotFirst} for the trip to you.`
              : "Cancelling now is free."}
          </span>
        </div>

        <span id="reason-label" className="text-[13px] font-semibold text-muted-foreground">
          Why are you cancelling?
        </span>
        <div
          role="radiogroup"
          aria-labelledby="reason-label"
          className="overflow-hidden rounded-lg border border-border"
        >
          {CANCEL_REASONS.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reason === r.id}
              onClick={() => setReason(r.id)}
              className={cn(
                "flex w-full items-center gap-3 px-3.5 py-3 text-left text-[15px]",
                i > 0 && "border-t border-border",
                reason === r.id && "bg-brand-soft",
              )}
            >
              <span className="flex-1">{r.label}</span>
              <span
                className={cn(
                  "size-5 shrink-0 rounded-full",
                  reason === r.id ? "border-[6px] border-primary" : "border-2 border-border",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
        <span className="text-[13px] text-muted-foreground">
          {baseFee > 0 && fee === 0
            ? "No fee for this reason — we'll review it with the Pilot."
            : fee > 0
              ? "The fee is charged to your Comet Wallet."
              : "You won't be charged."}
        </span>
        <div className="flex gap-2.5">
          <Button
            onClick={onKeep}
            disabled={pending}
            className="h-14 flex-[1.3] rounded-lg text-base font-bold"
          >
            Keep my ride
          </Button>
          <Button
            variant="outline"
            onClick={() => onCancel(reason)}
            disabled={pending}
            className="h-14 flex-1 rounded-lg text-base font-bold text-danger-text"
          >
            {pending ? "Cancelling…" : `Cancel · ${fee > 0 ? formatRupees(fee) : "free"}`}
          </Button>
        </div>
      </section>
    </div>
  );
}

/** "7 · Trip done": paid, with the fare breakdown. Ratings and tips arrive in phase 7. */
function TripDone({ ride }: { ride: RideView }) {
  const [rated, setRated] = useState<number | null>(null);
  return (
    <main className="flex min-h-app flex-col gap-5 px-5 pt-8 pb-6 md:mx-auto md:max-w-[520px]">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-8" aria-hidden strokeWidth={2.6} />
        </div>
        <h1 className="font-heading text-[26px] font-bold tracking-tight">You&apos;ve arrived</h1>
        <p className="text-[15px] text-muted-foreground">
          {ride.drop.address} · {(ride.distanceM / 1000).toFixed(1)} km
        </p>
      </div>

      <section className="flex flex-col gap-2.5 rounded-xl bg-card p-4 text-[15px]">
        <div className="flex justify-between text-muted-foreground">
          <span>Trip fare</span>
          <span>{formatRupees(ride.farePaise)}</span>
        </div>
        {ride.waitingFeePaise > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Waiting time</span>
            <span>{formatRupees(ride.waitingFeePaise)}</span>
          </div>
        )}
        {ride.discountPaise > 0 && (
          <div className="flex justify-between font-semibold text-brand-text">
            <span>Promo {ride.promoCode}</span>
            <span>{formatRupees(-ride.discountPaise)}</span>
          </div>
        )}
        <div className="h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="font-bold">Paid · {PAYMENT_METHOD_LABELS[ride.paymentMethod]}</span>
          <span className="font-heading text-xl font-bold" data-testid="trip-total">
            {formatRupees(ride.totalPaise)}
          </span>
        </div>
        {ride.cashbackPaise > 0 && ride.paymentMethod === "wallet" && (
          <p className="text-[13px] font-semibold text-info">
            {ride.promoCode}: {formatRupees(ride.cashbackPaise)} cashback added to your wallet.
          </p>
        )}
      </section>

      {rated !== null ? (
        <p role="status" className="text-center text-sm font-semibold text-info">
          Thanks — you rated {ride.pilot?.name.split(" ")[0] ?? "your Pilot"} {starString(rated)}
        </p>
      ) : (
        ride.pilot && (
          <section className="rounded-xl bg-card p-4">
            <RatingForm
              rideId={ride.id}
              rateeName={ride.pilot.name}
              side="rider"
              onRated={setRated}
            />
          </section>
        )
      )}

      <Link
        href="/ride"
        className={cn(
          "mt-auto flex h-14 items-center justify-center rounded-lg text-[17px] font-bold",
          rated === null
            ? "border border-border text-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        {rated === null ? "Skip for now" : "Done"}
      </Link>
    </main>
  );
}

function Ended({ ride }: { ride: RideView }) {
  const { status } = ride;
  const noPilots = status === "expired";
  const fee = ride.cancellationFeePaise;
  const charged = ride.paymentStatus === "paid";
  const feeLine =
    fee === 0
      ? "You weren't charged."
      : charged
        ? `A ${formatRupees(fee)} fee was paid from your Comet Wallet to your Pilot.`
        : `The ${formatRupees(fee)} fee was waived this time.`;
  return (
    <main className="flex min-h-app flex-col items-center justify-center gap-4 px-8 text-center md:mx-auto md:max-w-[520px]">
      <h1 className="font-heading text-2xl font-bold">
        {noPilots
          ? "No Pilots nearby right now"
          : status === "no_show"
            ? "Your Pilot couldn't wait"
            : "Ride cancelled"}
      </h1>
      <p className="text-muted-foreground" data-testid="cancel-outcome">
        {noPilots
          ? "Nobody accepted in time. Try again, or pick another ride type."
          : status === "no_show"
            ? `Your Pilot waited 5 minutes at the pickup. ${feeLine}`
            : `Your ride was cancelled. ${feeLine}`}
      </p>
      <Link
        href={noPilots ? "/ride/plan" : "/ride"}
        className="flex h-14 w-full items-center justify-center rounded-lg bg-primary text-[17px] font-bold text-primary-foreground"
      >
        {noPilots ? "Try again" : "Back to home"}
      </Link>
    </main>
  );
}
