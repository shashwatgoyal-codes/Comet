import { formatRupees, type Paise } from "@/lib/money";
import type { RideTier } from "@/lib/fares";
import { TIER_RATES } from "@/lib/fares";

/**
 * Promo rules ("4c · Promo codes", docs/DATABASE.md "Promotions"). Pure
 * and browser-safe: the choose screen previews with the same function the
 * server books with.
 *
 * - flat: a fixed amount off (never more than the fare);
 * - percent: basis points off, optionally capped and limited to a tier;
 * - cashback: basis points back into the wallet after a wallet-paid trip.
 */

export type PromoRule = {
  code: string;
  kind: "flat" | "percent" | "cashback";
  value: number;
  maxDiscountPaise: number | null;
  minFarePaise: number;
  tier: RideTier | null;
  walletOnly: boolean;
  startsAt: Date;
  endsAt: Date;
  maxUsesPerUser: number;
  isActive: boolean;
};

export type PromoContext = {
  tier: RideTier;
  farePaise: Paise;
  paymentMethod: "wallet" | "upi" | "card" | "cash";
  now: Date;
  /** Times this rider has used the code on rides that weren't cancelled or expired. */
  usesByRider: number;
};

export type PromoOutcome =
  { ok: true; discountPaise: Paise; cashbackPaise: Paise } | { ok: false; reason: string };

export function evaluatePromo(promo: PromoRule, ctx: PromoContext): PromoOutcome {
  if (!promo.isActive || ctx.now < promo.startsAt) {
    return { ok: false, reason: `${promo.code} isn't available right now.` };
  }
  if (ctx.now > promo.endsAt) return { ok: false, reason: `${promo.code} has ended.` };
  if (ctx.usesByRider >= promo.maxUsesPerUser) {
    return { ok: false, reason: `You've already used ${promo.code}.` };
  }
  if (promo.tier && promo.tier !== ctx.tier) {
    return {
      ok: false,
      reason: `${promo.code} only works on ${TIER_RATES[promo.tier].label} rides.`,
    };
  }
  if (ctx.farePaise < promo.minFarePaise) {
    return {
      ok: false,
      reason: `${promo.code} needs a fare of at least ${formatRupees(promo.minFarePaise)}.`,
    };
  }
  if (promo.walletOnly && ctx.paymentMethod !== "wallet") {
    return { ok: false, reason: `Pay with Comet Wallet to use ${promo.code}.` };
  }

  const cap = (paise: Paise) =>
    promo.maxDiscountPaise === null ? paise : Math.min(paise, promo.maxDiscountPaise);
  const share = Math.floor((ctx.farePaise * promo.value) / 10_000);
  switch (promo.kind) {
    case "flat":
      return { ok: true, discountPaise: Math.min(promo.value, ctx.farePaise), cashbackPaise: 0 };
    case "percent":
      return { ok: true, discountPaise: Math.min(cap(share), ctx.farePaise), cashbackPaise: 0 };
    case "cashback":
      return { ok: true, discountPaise: 0, cashbackPaise: cap(share) };
  }
}

/** The ticket stub: "₹30 OFF", "20% OFF", "10% BACK". */
export function promoBadge(promo: Pick<PromoRule, "kind" | "value">): {
  big: string;
  small: string;
} {
  if (promo.kind === "flat") return { big: formatRupees(promo.value), small: "OFF" };
  return { big: `${promo.value / 100}%`, small: promo.kind === "cashback" ? "BACK" : "OFF" };
}

/** "Min fare ₹100 · until 31 Dec 2027", "Up to ₹25 · Comet Wallet only". */
export function promoTerms(promo: PromoRule): string {
  const parts: string[] = [];
  if (promo.maxDiscountPaise !== null) parts.push(`Up to ${formatRupees(promo.maxDiscountPaise)}`);
  if (promo.minFarePaise > 0) parts.push(`Min fare ${formatRupees(promo.minFarePaise)}`);
  if (promo.tier) parts.push(`${TIER_RATES[promo.tier].label} only`);
  if (promo.walletOnly) parts.push("Comet Wallet only");
  parts.push(
    `until ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(promo.endsAt)}`,
  );
  return parts.join(" · ");
}
