"use client";

import {
  Banknote,
  CalendarClock,
  ChevronRight,
  CreditCard,
  ShieldCheck,
  Smartphone,
  TicketPercent,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { VehicleIcon } from "@/components/icons/Vehicle";
import { Button } from "@/components/ui/button";
import { RIDE_TIERS, TIER_RATES, type RideTier } from "@/lib/fares";
import { formatRupees, type Paise } from "@/lib/money";
import type { PromoOffer } from "@/lib/services/promos";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/lib/wallet";

import { bookRideAction } from "../actions";
import { PromoSheet, outcomeFor } from "./PromoSheet";
import { SchedulePicker } from "./SchedulePicker";

const pickupLabel = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const METHOD_ICONS = { wallet: Wallet, upi: Smartphone, card: CreditCard, cash: Banknote };
const METHOD_NOTES: Record<PaymentMethod, string> = {
  wallet: "Paid automatically when the trip ends.",
  upi: "You'll pay with any UPI app when the trip ends (test mode).",
  card: "You'll pay by card when the trip ends (test mode).",
  cash: "Pay your Pilot at the drop. Short on change? It can go to your wallet.",
};

/**
 * The tier list, payment choice ("4b · Payment method") and Book button
 * on "4 · Choose ride". Prices and the balance come from the server; the
 * server checks the balance again when booking.
 */
export function RideOptions({
  quoteId,
  prices,
  balancePaise,
  returnPath,
  womenOnlyDefault,
  offers,
}: {
  quoteId: string;
  prices: Record<RideTier, Paise>;
  balancePaise: Paise;
  returnPath: string;
  /** null when the rider isn't verified (the switch isn't offered). */
  womenOnlyDefault: boolean | null;
  offers: PromoOffer[];
}) {
  const router = useRouter();
  const [tier, setTier] = useState<RideTier>("go");
  const [method, setMethod] = useState<PaymentMethod>(
    balancePaise >= prices.go ? "wallet" : "cash",
  );
  const [promo, setPromo] = useState<PromoOffer | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [now] = useState(() => new Date());
  const outcomeOn = (t: RideTier) => (promo ? outcomeFor(promo, t, prices[t], method, now) : null);
  const current = outcomeOn(tier);
  const discountOn = (t: RideTier) => {
    const o = outcomeOn(t);
    return o?.ok ? o.discountPaise : 0;
  };
  const payNow = prices[tier] - discountOn(tier);
  const short = method === "wallet" && balancePaise < payNow;
  const [womenOnly, setWomenOnly] = useState(womenOnlyDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [scheduling, setScheduling] = useState(false);

  function book() {
    setError(null);
    startTransition(async () => {
      const result = await bookRideAction({
        quoteId,
        tier,
        paymentMethod: method,
        womenOnly,
        promoCode: current?.ok ? promo?.code : null,
        scheduledFor: scheduledFor?.toISOString() ?? null,
      });
      if (result.ok) {
        router.push(result.data.scheduled ? "/ride/activity?tab=upcoming" : "/ride/trip");
        return;
      }
      if (
        result.code === "CONFLICT" &&
        (result.message.includes("already have a ride") || result.message.includes("last ride"))
      ) {
        router.push("/ride/trip");
        return;
      }
      if (result.code === "CONFLICT") {
        // The 5-minute price hold ran out: fetch fresh prices in place.
        router.refresh();
      }
      setError(result.message);
    });
  }

  return (
    <>
      <div role="radiogroup" aria-label="Ride type" className="flex flex-col gap-1.5">
        {RIDE_TIERS.map((t) => {
          const selected = t === tier;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTier(t)}
              className={cn(
                "flex items-center gap-3.5 rounded-lg border-2 px-3 py-2.5 text-left",
                selected ? "border-primary bg-brand-soft" : "border-transparent",
              )}
            >
              <VehicleIcon tier={t} className="h-[34px] w-12 shrink-0" />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-bold">{TIER_RATES[t].label}</span>
                <span className="text-[13px] text-muted-foreground">
                  {TIER_RATES[t].seats} {TIER_RATES[t].seats === 1 ? "seat" : "seats"}
                  {t === "prime" && " · top-rated Pilots"}
                  {t === "go" && " · AC"}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-heading text-[17px] font-bold" data-testid={`price-${t}`}>
                  {formatRupees(prices[t] - discountOn(t))}
                </span>
                {discountOn(t) > 0 && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatRupees(prices[t])}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <div role="radiogroup" aria-label="Pay with" className="grid grid-cols-4 gap-1.5">
          {PAYMENT_METHODS.map((m) => {
            const Icon = METHOD_ICONS[m];
            const on = m === method;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMethod(m)}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 rounded-md border-2 text-xs font-semibold",
                  on ? "border-primary bg-brand-soft" : "border-border",
                )}
              >
                <Icon className="size-[18px] text-brand-text" aria-hidden />
                {m === "wallet" ? formatRupees(balancePaise) : PAYMENT_METHOD_LABELS[m]}
                <span className="sr-only">{m === "wallet" ? " in Comet Wallet" : ""}</span>
              </button>
            );
          })}
        </div>
        {short ? (
          <p className="text-[13px] font-semibold text-danger-text">
            Your wallet has {formatRupees(balancePaise)}.{" "}
            <Link
              href={`/ride/wallet?return=${encodeURIComponent(returnPath)}`}
              className="text-info underline"
            >
              Add {formatRupees(prices[tier] - balancePaise)} or more
            </Link>{" "}
            or choose another way to pay.
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">{METHOD_NOTES[method]}</p>
        )}
      </div>

      {womenOnlyDefault !== null && (
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5">
          <ShieldCheck className="size-[18px] shrink-0 text-info" aria-hidden />
          <span className="flex flex-1 flex-col">
            <span className="text-sm font-bold">Women Pilots only</span>
            <span className="text-xs text-muted-foreground">
              Matched only with verified women Pilots
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={womenOnly}
            onChange={(e) => setWomenOnly(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
          />
        </label>
      )}

      <button
        type="button"
        onClick={() => setPromoOpen(true)}
        className="flex h-12 items-center gap-2.5 rounded-md border border-dashed border-border px-3 text-left text-sm font-semibold"
      >
        <TicketPercent className="size-[18px] shrink-0 text-brand-text" aria-hidden />
        <span className="flex-1">
          {promo && current?.ok
            ? current.discountPaise > 0
              ? `${promo.code} · ${formatRupees(current.discountPaise)} off`
              : `${promo.code} · ${formatRupees(current.cashbackPaise)} cashback`
            : "Offers & promo codes"}
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {promo && current && !current.ok && (
        <p className="-mt-1 text-[13px] font-semibold text-danger-text">{current.reason}</p>
      )}
      {promoOpen && (
        <PromoSheet
          offers={offers}
          applied={promo}
          tier={tier}
          farePaise={prices[tier]}
          method={method}
          now={now}
          onApply={setPromo}
          onClose={() => setPromoOpen(false)}
        />
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setScheduling(true)}
          aria-label={
            scheduledFor
              ? `Change pickup time, ${pickupLabel.format(scheduledFor)}`
              : "Schedule for later"
          }
          className="h-14 shrink-0 flex-col gap-0 rounded-lg px-3.5 text-xs font-bold"
        >
          <CalendarClock className="size-5" aria-hidden />
          {scheduledFor ? "Change" : "Later"}
        </Button>
        <Button
          onClick={book}
          disabled={pending || short}
          className="h-14 flex-1 flex-col gap-0 rounded-lg text-[17px] font-bold"
        >
          {pending
            ? "Booking…"
            : scheduledFor
              ? `Schedule ${TIER_RATES[tier].label}`
              : `Book ${TIER_RATES[tier].label}`}
          {scheduledFor && !pending && (
            <span className="text-xs font-semibold">{pickupLabel.format(scheduledFor)}</span>
          )}
        </Button>
      </div>
      {scheduling && (
        <SchedulePicker
          now={now}
          value={scheduledFor}
          onPick={setScheduledFor}
          onClose={() => setScheduling(false)}
        />
      )}
    </>
  );
}
