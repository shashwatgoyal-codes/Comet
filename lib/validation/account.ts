import { z } from "zod";

import { PLACE_LABELS, toE164 } from "@/lib/account";
import { latLngSchema } from "@/lib/validation/places";

/** Account inputs (docs/API.md "Account"). */

export const placeSchema = z.object({
  label: z.enum(PLACE_LABELS),
  name: z.string().trim().min(1).max(60),
  address: z.string().trim().min(3).max(200),
  point: latLngSchema,
});

export const placeIdSchema = z.object({ placeId: z.uuid() });

export const updatePlaceSchema = placeSchema.extend({ placeId: z.uuid() });

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(60),
  phone: z
    .string()
    .max(20)
    .transform((v, ctx) => {
      const e164 = toE164(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Enter a 10-digit mobile number." });
        return z.NEVER;
      }
      return e164;
    }),
});

export const contactIdSchema = z.object({ contactId: z.uuid() });

export const hideLastNameSchema = z.object({ hide: z.boolean() });

export const deleteAccountSchema = z.object({ confirm: z.literal("DELETE") });
