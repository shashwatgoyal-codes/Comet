"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { RideTier } from "@/lib/fares";
import { TIER_RATES } from "@/lib/fares";
import { formatRupees, type Paise } from "@/lib/money";
import { evaluatePromo, type PromoOutcome } from "@/lib/promos";
import type { PromoOffer } from "@/lib/services/promos";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/wallet";

import { lookUpPromoAction } from "../actions";

export function outcomeFor(
  offer: PromoOffer,
  tier: RideTier,
  farePaise: Paise,
  method: PaymentMethod,
  now: Date,
): PromoOutcome {
  return evaluatePromo(offer, {
    tier,
    farePaise,
    paymentMethod: method,
    now,
    usesByRider: offer.usesByRider,
  });
}

/**
 * "4c · Promo codes": live offers for this ride, a box for any other code,
 * and what you'd pay. The server checks the code again when booking.
 */
export function PromoSheet({
  offers,
  applied,
  tier,
  farePaise,
  method,
  now,
  onApply,
  onClose,
}: {
  offers: PromoOffer[];
  applied: PromoOffer | null;
  tier: RideTier;
  farePaise: Paise;
  method: PaymentMethod;
  now: Date;
  onApply: (offer: PromoOffer | null) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const appliedOutcome = applied ? outcomeFor(applied, tier, farePaise, method, now) : null;
  const pay = farePaise - (appliedOutcome?.ok ? appliedOutcome.discountPaise : 0);

  function apply(offer: PromoOffer) {
    const outcome = outcomeFor(offer, tier, farePaise, method, now);
    if (!outcome.ok) {
      setError(outcome.reason);
      return;
    }
    setError(null);
    onApply(offer);
  }

  function applyTyped() {
    setError(null);
    startTransition(async () => {
      const result = await lookUpPromoAction({ code: typed });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTyped("");
      apply(result.data);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-ink/40 md:items-center md:justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-title"
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-sheet)] bg-background md:max-w-[460px] md:rounded-3xl"
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="flex flex-1 flex-col">
            <h2 id="promo-title" className="font-heading text-[22px] font-bold tracking-tight">
              Offers &amp; promo codes
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {TIER_RATES[tier].label} · {formatRupees(farePaise)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full bg-card"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-4">
          <label htmlFor="promo-code" className="text-[13px] font-semibold text-muted-foreground">
            Have a code?
          </label>
          <div className="flex gap-2">
            <input
              id="promo-code"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value.toUpperCase().slice(0, 20));
                setError(null);
              }}
              placeholder="Enter promo code"
              autoComplete="off"
              className={cn(
                "h-[52px] min-w-0 flex-1 rounded-md border-2 bg-card px-4 font-heading font-semibold tracking-wider outline-none focus:border-primary",
                error ? "border-destructive" : "border-border",
              )}
            />
            <Button
              onClick={applyTyped}
              disabled={pending || typed.trim() === ""}
              className="h-[52px] rounded-md bg-ink px-5 font-bold text-on-ink hover:bg-ink/90"
            >
              Apply
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-danger-text">
              {error}
            </p>
          )}

          {applied && appliedOutcome?.ok && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg bg-info-soft px-4 py-3.5 text-info"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info text-info-soft">
                <Check className="size-[18px]" strokeWidth={3} aria-hidden />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-[15px] font-bold">
                  {applied.code} applied ·{" "}
                  {appliedOutcome.discountPaise > 0
                    ? `you save ${formatRupees(appliedOutcome.discountPaise)}`
                    : `${formatRupees(appliedOutcome.cashbackPaise)} cashback`}
                </span>
                <span className="text-[13px]">
                  {appliedOutcome.discountPaise > 0
                    ? "Taken off your fare."
                    : "Lands in your wallet after the trip."}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onApply(null)}
                className="text-[13px] font-bold underline"
              >
                Remove
              </button>
            </div>
          )}

          <h3 className="pt-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
            Available for this ride
          </h3>
          <ul aria-label="Offers" className="flex flex-col gap-2.5">
            {offers.map((offer) => {
              const outcome = outcomeFor(offer, tier, farePaise, method, now);
              const on = applied?.code === offer.code;
              return (
                <li
                  key={offer.code}
                  className={cn(
                    "flex overflow-hidden rounded-lg border-2 bg-card",
                    on ? "border-primary" : "border-transparent",
                    !outcome.ok && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex w-[74px] shrink-0 flex-col items-center justify-center gap-0.5 border-r-2 border-dashed border-background",
                      offer.kind === "cashback"
                        ? "bg-info-soft text-info"
                        : "bg-brand-soft text-brand-text",
                    )}
                  >
                    <span className="font-heading text-lg leading-none font-bold">
                      {offer.badge.big}
                    </span>
                    <span className="text-[11px] font-bold">{offer.badge.small}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-heading text-[15px] font-bold tracking-wider">
                        {offer.code}
                      </span>
                      {outcome.ok && (
                        <Button
                          size="sm"
                          variant={on ? "default" : "secondary"}
                          onClick={() => apply(offer)}
                          aria-label={on ? `${offer.code} applied` : `Apply ${offer.code}`}
                          className="h-[34px] rounded-sm px-3.5 font-bold"
                        >
                          {on ? "Applied" : "Apply"}
                        </Button>
                      )}
                    </span>
                    <span className="text-sm font-semibold">{offer.title}</span>
                    <span
                      className={cn(
                        "text-xs",
                        outcome.ok ? "text-muted-foreground" : "text-danger-text",
                      )}
                    >
                      {outcome.ok ? offer.terms : outcome.reason}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center gap-3.5 rounded-t-3xl bg-card px-5 pt-3.5 pb-6">
          <span className="flex flex-1 flex-col">
            <span className="text-[13px] text-muted-foreground">You pay</span>
            <span className="flex items-baseline gap-2">
              <span className="font-heading text-2xl font-bold" data-testid="promo-you-pay">
                {formatRupees(pay)}
              </span>
              {pay !== farePaise && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatRupees(farePaise)}
                </span>
              )}
            </span>
          </span>
          <Button onClick={onClose} className="h-14 rounded-lg px-7 text-[17px] font-bold">
            Done
          </Button>
        </div>
      </section>
    </div>
  );
}
