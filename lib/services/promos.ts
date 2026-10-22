import "server-only";

import type { PromoCode } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { RideTier } from "@/lib/fares";
import { RIDE_TIERS } from "@/lib/fares";
import { promoBadge, promoTerms, type PromoRule } from "@/lib/promos";

/**
 * Promo codes ("4c · Promo codes"). The rules are pure (lib/promos.ts);
 * this file loads codes and counts a rider's uses. A ride that was
 * cancelled or expired doesn't count as a use.
 */

export const toRule = (p: PromoCode): PromoRule => ({
  code: p.code,
  kind: p.kind,
  value: p.value,
  maxDiscountPaise: p.maxDiscountPaise,
  minFarePaise: p.minFarePaise,
  tier: p.tier as RideTier | null,
  walletOnly: p.walletOnly,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  maxUsesPerUser: p.maxUsesPerUser,
  isActive: p.isActive,
});

export async function findPromo(code: string): Promise<PromoCode | null> {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(normalised)) return null;
  return db.promoCode.findUnique({ where: { code: normalised } });
}

export async function usesByRider(riderId: string, promoId: string): Promise<number> {
  return db.promoRedemption.count({
    where: { userId: riderId, promoId, ride: { status: { notIn: ["cancelled", "expired"] } } },
  });
}

/** What the promo sheet shows: each offer with its rules, for the client to preview. */
export type PromoOffer = PromoRule & {
  title: string;
  terms: string;
  badge: { big: string; small: string };
  usesByRider: number;
};

const toOffer = async (riderId: string, p: PromoCode): Promise<PromoOffer> => {
  const rule = toRule(p);
  return {
    ...rule,
    title: p.title,
    terms: promoTerms(rule),
    badge: promoBadge(rule),
    usesByRider: await usesByRider(riderId, p.id),
  };
};

/** Live offers, for the "Available for this ride" list. */
export async function listOffers(riderId: string, now = new Date()): Promise<PromoOffer[]> {
  const promos = await db.promoCode.findMany({
    where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(promos.map((p) => toOffer(riderId, p)));
}

/** A typed code, looked up (including ended ones, so the rider is told why). */
export async function lookUpCode(riderId: string, code: string): Promise<PromoOffer> {
  const promo = await findPromo(code);
  if (!promo)
    throw new AppError("VALIDATION", "That code isn't valid. Check the spelling and try again.");
  return toOffer(riderId, promo);
}

export { RIDE_TIERS };
