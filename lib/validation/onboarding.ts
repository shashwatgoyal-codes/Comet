import { z } from "zod";

import {
  isUpiId,
  MAX_REJECTION_REASON,
  normaliseLicence,
  normalisePlate,
  VEHICLE_TYPES,
} from "@/lib/onboarding";

/** Pilot onboarding and ops review (docs/API.md "Pilot onboarding", "Ops"). */

export const vehicleTypeSchema = z.object({ vehicleType: z.enum(VEHICLE_TYPES) });

export const profileStepSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(60, "That name is too long.")
    .regex(/^[\p{L} .'-]+$/u, "Use letters only."),
});

const isoDate = z.iso.date("Enter a valid date.");

export const licenceStepSchema = z.object({
  number: z.string().transform((v, ctx) => {
    const n = normaliseLicence(v);
    if (!n)
      ctx.addIssue({
        code: "custom",
        message: "Enter the number as it's printed on your licence.",
      });
    return n ?? "";
  }),
  expiresOn: isoDate,
});

export const rcStepSchema = z.object({
  plate: z.string().transform((v, ctx) => {
    const p = normalisePlate(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Enter a plate like KA 05 MX 2841." });
    return p ?? "";
  }),
  model: z.string().trim().min(2, "Enter the make and model.").max(60),
  colour: z.string().trim().min(3, "Enter the colour.").max(30),
});

export const payoutStepSchema = z.object({
  upiId: z.string().trim().refine(isUpiId, "Enter a UPI ID like name@bank."),
});

export const pilotIdSchema = z.object({ pilotId: z.uuid() });

export const rejectPilotSchema = z.object({
  pilotId: z.uuid(),
  reason: z.string().trim().min(5, "Tell the Pilot what to fix.").max(MAX_REJECTION_REASON),
});
