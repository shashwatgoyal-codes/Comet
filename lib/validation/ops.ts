import { z } from "zod";

import { RIDE_TIERS } from "@/lib/fares";
import { MAX_RESOLUTION_NOTE } from "@/lib/ops";

/** Ops dashboard inputs (docs/API.md "Ops"). */

export const alertIdSchema = z.object({ alertId: z.uuid() });

export const resolveSosSchema = z.object({
  alertId: z.uuid(),
  note: z
    .string()
    .trim()
    .min(5, "Write what happened, so the next person knows.")
    .max(MAX_RESOLUTION_NOTE),
});

export const setPromoActiveSchema = z.object({ promoId: z.uuid(), active: z.boolean() });

const rupees = (max: number) => z.coerce.number().int("Whole rupees only.").min(0).max(max);
const when = z.iso.datetime({ local: true, offset: true }).transform((v) => new Date(v));

/**
 * The "+ New code" form. Amounts arrive in rupees and percent and leave
 * in the units promo_codes stores: paise, and hundredths of a percent.
 * The limits are sanity bounds on typing, not business rules.
 */
export const createPromoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4,20}$/, "Use 4–20 letters and numbers."),
    kind: z.enum(["flat", "percent", "cashback"]),
    amount: z.coerce.number().int("Whole numbers only.").min(1, "Enter the amount."),
    capRupees: rupees(1_000).nullable().default(null),
    minFareRupees: rupees(5_000).default(0),
    tier: z.enum(RIDE_TIERS).nullable().default(null),
    title: z.string().trim().min(5, "Describe the offer for riders.").max(120),
    startsAt: when,
    endsAt: when,
    maxUsesPerUser: z.coerce.number().int().min(1).max(10).default(1),
  })
  .refine((p) => p.kind !== "flat" || p.amount <= 1_000, {
    path: ["amount"],
    message: "A flat discount can be at most ₹1,000.",
  })
  .refine((p) => p.kind === "flat" || p.amount <= 100, {
    path: ["amount"],
    message: "A percentage can be at most 100.",
  })
  .refine((p) => p.endsAt > p.startsAt, { path: ["endsAt"], message: "End after it starts." })
  .transform((p) => ({
    code: p.code,
    kind: p.kind,
    // ₹30 → 3000 paise; 20% → 2000 hundredths of a percent.
    value: p.amount * 100,
    maxDiscountPaise: p.capRupees ? p.capRupees * 100 : null,
    minFarePaise: p.minFareRupees * 100,
    tier: p.tier,
    title: p.title,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    maxUsesPerUser: p.maxUsesPerUser,
  }));
