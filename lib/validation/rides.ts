import { z } from "zod";

import { RIDE_TIERS } from "@/lib/fares";
import { latLngSchema } from "@/lib/validation/places";
import { PAYMENT_METHODS } from "@/lib/wallet";
import { CANCEL_REASON_IDS } from "@/lib/cancellation";
import { MAX_COMMENT, MAX_TIP } from "@/lib/ratings";

/** Shared by forms and Server Actions for booking, offers and locations. */

export const bookRideSchema = z.object({
  quoteId: z.uuid(),
  tier: z.enum(RIDE_TIERS),
  paymentMethod: z.enum(PAYMENT_METHODS),
  womenOnly: z.boolean().default(false),
  promoCode: z.string().trim().max(20).nullable().default(null),
  /** ISO time of a pickup booked ahead; checked against lib/scheduling.ts. */
  scheduledFor: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .nullable()
    .default(null),
});

export const promoLookupSchema = z.object({ code: z.string().trim().min(1).max(20) });

export const rideIdSchema = z.object({ rideId: z.uuid() });

export const cancelRideSchema = z.object({
  rideId: z.uuid(),
  reason: z.enum(CANCEL_REASON_IDS).nullable().default(null),
});

export const rateRideSchema = z.object({
  rideId: z.uuid(),
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(40)).max(8).default([]),
  comment: z.string().max(MAX_COMMENT).nullable().default(null),
  tipPaise: z.number().int().min(0).max(MAX_TIP).default(0),
});

export const listRidesSchema = z.object({
  tab: z.enum(["past", "upcoming", "cancelled"]).default("past"),
  cursor: z.uuid().nullable().default(null),
});

export const offerIdSchema = z.object({ offerId: z.uuid() });

export const setOnlineSchema = z.object({
  online: z.boolean(),
  point: latLngSchema.optional(),
});

export const locationUpdateSchema = z.object({
  point: latLngSchema,
  headingDeg: z.number().min(0).max(360).nullable().default(null),
  speedKmh: z.number().min(0).max(250).nullable().default(null),
});

export const startTripSchema = z.object({
  rideId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/),
});

export const sendMessageSchema = z.object({
  rideId: z.uuid(),
  body: z.string().trim().min(1).max(500),
  isQuickReply: z.boolean().default(false),
});
