"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LiveMap } from "@/components/map/LiveMap";
import { RatingForm } from "@/components/RatingForm";
import { Button } from "@/components/ui/button";
import { TIER_RATES } from "@/lib/fares";
import { formatRupees } from "@/lib/money";
import { starString } from "@/lib/ratings";
import type { Receipt } from "@/lib/services/history";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS } from "@/lib/wallet";

import { cancelRideAction } from "../../actions";

const day = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

/** "11 · Receipt" on the canvas: route, fare breakdown, payment and rating. */
export function ReceiptView({
  receipt,
  bookAgainHref,
}: {
  receipt: Receipt;
  bookAgainHref: string;
}) {
  const { ride } = receipt;
  const [rated, setRated] = useState<number | null>(receipt.myRating?.stars ?? null);
  const completed = ride.status === "completed";
  const pilotFirst = ride.pilot?.name.split(" ")[0] ?? "your Pilot";
  const paidTotal = ride.totalPaise + ride.tipPaise;
  const tripRef = `CMT-R-${ride.id.slice(0, 6).toUpperCase()}`;

  return (
    <main className="flex min-h-dvh flex-col md:mx-auto md:min-h-0 md:max-w-[640px] md:overflow-hidden md:rounded-3xl md:shadow-float">
      <div className="relative h-[200px] shrink-0 overflow-hidden print:hidden">
        <LiveMap
          center={ride.pickup.point}
          pickup={ride.pickup.point}
          drop={ride.drop.point}
          route={ride.routeCoordinates}
        />
        <Link
          href="/ride/activity"
          aria-label="Back"
          className="absolute top-4 left-4 flex size-11 items-center justify-center rounded-full bg-card shadow-float"
        >
          <ArrowLeft className="size-[22px]" aria-hidden strokeWidth={2.2} />
        </Link>
      </div>

      <div className="relative -mt-5 flex flex-1 flex-col gap-3 rounded-t-xl bg-background p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-heading text-[22px] font-bold tracking-tight">
              {day.format(new Date(receipt.requestedAt))}
            </h1>
            <span className="text-[13px] text-muted-foreground">
              {TIER_RATES[ride.tier].label} · {(ride.distanceM / 1000).toFixed(1)} km ·{" "}
              {Math.max(1, Math.round(ride.durationS / 60))} min · Trip {tripRef}
            </span>
          </div>
          <span className="font-heading text-[22px] font-bold" data-testid="receipt-total">
            {formatRupees(paidTotal)}
          </span>
        </div>

        <div className="flex gap-3 rounded-lg bg-card p-3.5">
          <div className="flex w-3.5 flex-col items-center py-1" aria-hidden>
            <span className="size-2.5 rounded-full border-[3px] border-info" />
            <span className="my-1 w-0.5 flex-1 bg-border" />
            <span className="size-2.5 rounded-[2px] bg-foreground" />
          </div>
          <div className="flex flex-1 flex-col gap-3 text-sm">
            <span className="flex justify-between gap-2">
              <span>{ride.pickup.address}</span>
              {ride.startedAt && (
                <span className="text-muted-foreground">
                  {time.format(new Date(ride.startedAt))}
                </span>
              )}
            </span>
            <span className="flex justify-between gap-2">
              <span>{ride.drop.address}</span>
              {ride.completedAt && (
                <span className="text-muted-foreground">
                  {time.format(new Date(ride.completedAt))}
                </span>
              )}
            </span>
          </div>
        </div>

        {ride.status === "scheduled" && ride.scheduledFor && (
          <ScheduledRide
            rideId={ride.id}
            scheduledFor={ride.scheduledFor}
            farePaise={ride.totalPaise}
          />
        )}

        <section
          className={cn(
            "flex flex-col gap-2 rounded-lg bg-card p-3.5 text-sm",
            ride.status === "scheduled" && "hidden",
          )}
          aria-label="Fare breakdown"
        >
          {completed ? (
            <>
              <Line label="Trip fare" value={formatRupees(ride.farePaise)} />
              {ride.waitingFeePaise > 0 && (
                <Line label="Waiting time" value={formatRupees(ride.waitingFeePaise)} />
              )}
              {ride.discountPaise > 0 && (
                <Line label={`Promo ${ride.promoCode}`} value={formatRupees(-ride.discountPaise)} />
              )}
              {ride.tipPaise > 0 && (
                <Line label={`Tip for ${pilotFirst}`} value={formatRupees(ride.tipPaise)} />
              )}
              {ride.cashbackPaise > 0 && ride.paymentMethod === "wallet" && (
                <Line
                  label={`Cashback ${ride.promoCode} · to wallet`}
                  value={formatRupees(ride.cashbackPaise)}
                />
              )}
            </>
          ) : (
            <Line
              label={receipt.cancelReason ?? "Cancelled"}
              value={
                ride.cancellationFeePaise > 0 ? formatRupees(ride.cancellationFeePaise) : "Free"
              }
            />
          )}
          <div className="h-px bg-border" />
          <div className="flex justify-between font-bold">
            <span>
              {completed
                ? ride.paymentStatus === "paid"
                  ? `Paid · ${PAYMENT_METHOD_LABELS[ride.paymentMethod]}`
                  : "Payment due"
                : ride.cancellationFeePaise === 0
                  ? "No charge"
                  : ride.paymentStatus === "paid"
                    ? "Cancellation fee · Comet Wallet"
                    : "Fee waived"}
            </span>
            <span>
              {formatRupees(
                completed
                  ? paidTotal
                  : ride.paymentStatus === "paid"
                    ? ride.cancellationFeePaise
                    : 0,
              )}
            </span>
          </div>
        </section>

        {ride.pilot && (
          <div className="flex items-center gap-3 rounded-lg bg-card px-3.5 py-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-info font-heading text-sm font-bold text-white dark:text-ink">
              {ride.pilot.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold">
                {ride.pilot.name} · {ride.pilot.plate}
              </span>
              <span className="text-[13px] text-muted-foreground" data-testid="my-rating">
                {rated !== null
                  ? `You rated ${starString(rated)}`
                  : completed
                    ? "Not rated yet"
                    : ride.pilot.vehicle}
              </span>
            </span>
          </div>
        )}

        {completed && rated === null && ride.pilot && (
          <section className="rounded-lg bg-card p-4 print:hidden">
            <RatingForm
              rideId={ride.id}
              rateeName={ride.pilot.name}
              side="rider"
              onRated={setRated}
            />
          </section>
        )}

        <div className="grid grid-cols-2 gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-bold"
          >
            <Printer className="size-[18px]" aria-hidden />
            Print receipt
          </button>
          <Link
            href={bookAgainHref}
            className="flex h-12 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          >
            Book again
          </Link>
        </div>
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const pickupLabel = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/** A ride booked ahead: when, the locked fare, and free cancellation. */
function ScheduledRide({
  rideId,
  scheduledFor,
  farePaise,
}: {
  rideId: string;
  scheduledFor: string;
  farePaise: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section
      aria-labelledby="scheduled-h"
      className="flex flex-col gap-3 rounded-lg bg-info-soft p-4"
    >
      <span className="text-xs font-bold tracking-widest text-info uppercase">Scheduled</span>
      <h2 id="scheduled-h" className="font-heading text-lg font-bold" data-testid="scheduled-for">
        {pickupLabel.format(new Date(scheduledFor))}
      </h2>
      <p className="text-sm text-muted-foreground">
        We&apos;ll assign your Pilot 15 minutes before pickup. Your fare is locked at{" "}
        <b className="text-foreground">{formatRupees(farePaise)}</b>, and cancelling is free until
        then.
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelRideAction({ rideId, reason: "plans_changed" });
            if (!result.ok) setError(result.message);
            router.refresh();
          })
        }
        className="h-12 rounded-md bg-card font-bold text-danger-text"
      >
        {pending ? "Cancelling…" : "Cancel this ride · free"}
      </Button>
    </section>
  );
}
