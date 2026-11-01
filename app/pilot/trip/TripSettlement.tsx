"use client";

import { Check, Wallet } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { RatingForm } from "@/components/RatingForm";
import { Button } from "@/components/ui/button";
import { formatRupees, type Paise } from "@/lib/money";
import { starString } from "@/lib/ratings";
import type { RideView } from "@/lib/services/rides";
import { cn } from "@/lib/utils";
import { MAX_CASH_OVER, PAYMENT_METHOD_LABELS } from "@/lib/wallet";

import { confirmCashAction } from "../actions";

const share = (ride: RideView) => ride.farePaise + ride.waitingFeePaise - ride.platformFeePaise;

function Split({ ride }: { ride: RideView }) {
  return (
    <span className="text-[13px] text-muted-foreground">
      Your share {formatRupees(share(ride))} · Comet fee {formatRupees(ride.platformFeePaise)}
    </span>
  );
}

/**
 * Notes a rider is likely to hand over: the exact fare, then the fare
 * rounded up to the next ₹50, ₹100 and ₹500 — never more than
 * MAX_CASH_OVER above it.
 */
export function cashOptions(total: Paise): Paise[] {
  const up = (step: Paise) => Math.ceil(total / step) * step;
  const options = [total, up(5_000), up(10_000), up(50_000)].filter(
    (v) => v <= total + MAX_CASH_OVER,
  );
  return [...new Set(options)].sort((a, b) => a - b).slice(0, 4);
}

/**
 * The Pilot's end of a finished ride: "5c · Collect cash or UPI", or the
 * paid summary. Online payments (UPI, card, wallet) settle on the
 * rider's side; the Pilot just sees them land.
 */
export function TripSettlement({
  ride,
  onChange,
  onDone,
}: {
  ride: RideView;
  onChange: () => Promise<void>;
  onDone: () => void;
}) {
  const [collecting, setCollecting] = useState(ride.paymentMethod === "cash");
  const [rated, setRated] = useState<number | null>(null);
  const paid = ride.paymentStatus === "paid";

  if (paid) {
    return (
      <main className="flex min-h-app flex-col gap-5 px-5 pt-8 pb-6 md:mx-auto md:max-w-[520px]">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-8" aria-hidden strokeWidth={2.6} />
          </div>
          <h1 className="font-heading text-[26px] font-bold tracking-tight">Trip complete</h1>
          <p className="text-muted-foreground">{ride.drop.address}</p>
        </div>
        <section className="flex flex-col items-center gap-1.5 rounded-xl bg-ink p-6 text-on-ink">
          <span className="text-sm text-ink-muted">
            Paid · {PAYMENT_METHOD_LABELS[ride.paymentMethod]}
          </span>
          <span className="font-heading text-4xl font-bold" data-testid="trip-amount">
            {formatRupees(ride.totalPaise)}
          </span>
          <span className="text-[13px] text-ink-muted">
            Your share {formatRupees(share(ride))} · Comet fee {formatRupees(ride.platformFeePaise)}
          </span>
        </section>
        {rated === null ? (
          <section className="rounded-xl bg-card p-4">
            <RatingForm
              rideId={ride.id}
              rateeName={ride.rider?.firstName ?? "the rider"}
              side="pilot"
              onRated={setRated}
            />
          </section>
        ) : (
          <p role="status" className="text-center text-sm font-semibold text-info">
            Thanks — you rated {ride.rider?.firstName ?? "the rider"} {starString(rated)}
          </p>
        )}
        <Link
          href="/pilot/earnings"
          className="text-center text-sm font-semibold text-info hover:underline"
        >
          See earnings
        </Link>
        <Button onClick={onDone} className="mt-auto h-[60px] rounded-lg text-lg font-bold">
          {ride.nextTrip ? "Head to next pickup" : "Back to requests"}
        </Button>
      </main>
    );
  }

  if (!collecting) {
    return (
      <main className="flex min-h-app flex-col gap-5 px-5 pt-8 pb-6 md:mx-auto md:max-w-[520px]">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-[26px] font-bold tracking-tight">Trip ended</h1>
          <p className="text-muted-foreground">{ride.drop.address}</p>
        </div>
        <section className="flex flex-col gap-1.5 rounded-xl bg-card p-5" role="status">
          <span className="flex items-center gap-2 font-semibold">
            <span className="size-2.5 animate-pulse rounded-full bg-primary" aria-hidden />
            Waiting for the rider to pay {formatRupees(ride.totalPaise)}
          </span>
          <span className="text-sm text-muted-foreground">
            They chose {PAYMENT_METHOD_LABELS[ride.paymentMethod]}. This updates by itself.
          </span>
          <Split ride={ride} />
        </section>
        <Button
          variant="outline"
          onClick={() => setCollecting(true)}
          className="h-[52px] rounded-lg font-bold"
        >
          Rider is paying cash
        </Button>
        <Button onClick={onDone} className="mt-auto h-[60px] rounded-lg text-lg font-bold">
          {ride.nextTrip ? "Head to next pickup" : "Back to requests"}
        </Button>
      </main>
    );
  }

  return <CollectCash ride={ride} onChange={onChange} />;
}

function CollectCash({ ride, onChange }: { ride: RideView; onChange: () => Promise<void> }) {
  const options = cashOptions(ride.totalPaise);
  const [received, setReceived] = useState(options[0]!);
  const [creditChange, setCreditChange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const change = received - ride.totalPaise;

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmCashAction({
        rideId: ride.id,
        receivedPaise: received,
        creditChangeToWallet: creditChange && change > 0,
      });
      if (!result.ok) setError(result.message);
      await onChange();
    });
  }

  return (
    <main className="flex min-h-app flex-col md:mx-auto md:max-w-[520px]">
      <div className="flex flex-col gap-2 px-5 pt-7 pb-4">
        <span className="font-bold">Trip ended · collect from the rider</span>
        <div className="flex items-baseline justify-between gap-3">
          <span
            className="font-heading text-[44px] leading-none font-bold tracking-tight"
            data-testid="collect-total"
          >
            {formatRupees(ride.totalPaise)}
          </span>
          <Split ride={ride} />
        </div>
      </div>

      <section className="flex flex-1 flex-col gap-4 rounded-t-[var(--radius-sheet)] bg-card px-5 pt-5 pb-6">
        <h1 id="received-label" className="text-base font-bold">
          How much did the rider give you?
        </h1>
        <div role="radiogroup" aria-labelledby="received-label" className="grid grid-cols-4 gap-2">
          {options.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={received === value}
              onClick={() => setReceived(value)}
              className={cn(
                "h-[52px] rounded-md border-2 font-heading text-base font-bold",
                received === value ? "border-primary bg-brand-soft" : "border-border",
              )}
            >
              {value === ride.totalPaise ? "Exact" : formatRupees(value)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-[15px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Received</span>
            <b>{formatRupees(received)}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Trip fare</span>
            <b>{formatRupees(ride.totalPaise)}</b>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between">
            <span className="font-bold">
              {creditChange && change > 0 ? "To rider's wallet" : "Give back"}
            </span>
            <span
              className="font-heading text-[22px] font-bold text-brand-text"
              data-testid="change"
            >
              {formatRupees(change)}
            </span>
          </div>
        </div>

        {change > 0 && (
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-4 py-2.5 text-sm font-semibold">
            <Wallet className="size-[18px] shrink-0" aria-hidden />
            <span className="flex-1">
              No change? Add {formatRupees(change)} to the rider&apos;s wallet
            </span>
            <input
              type="checkbox"
              checked={creditChange}
              onChange={(e) => setCreditChange(e.target.checked)}
              className="size-5 accent-[var(--primary)]"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            {error}
          </p>
        )}

        <Button
          onClick={confirm}
          disabled={pending}
          className="mt-auto h-[60px] rounded-lg text-lg font-bold"
        >
          <Check className="size-[22px]" aria-hidden strokeWidth={2.6} />
          {pending ? "Saving…" : "Cash received"}
        </Button>
      </section>
    </main>
  );
}
