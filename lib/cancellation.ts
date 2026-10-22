import { rupees, type Paise } from "@/lib/money";

/**
 * When a rider pays to cancel ("12 · Cancel ride" on the canvas). Pure and
 * browser-safe: the sheet previews the fee with the same function the
 * server charges with.
 *
 * - While still searching for a Pilot: always free.
 * - Once a Pilot is on the way: free within 3 minutes of booking, then
 *   ₹25 — paid to the Pilot for the trip to the pickup.
 * - No fee when the Pilot is at fault (they asked the rider to cancel, or
 *   are heading the wrong way).
 * The no-show fee (₹40, lib/trip-fees.ts) is separate: the Pilot claims it.
 */

export const FREE_CANCEL_S = 3 * 60;
export const CANCEL_FEE: Paise = rupees(25);

export const CANCEL_REASONS = [
  { id: "too_long", label: "Pilot is taking too long", waivesFee: false },
  { id: "pilot_asked", label: "Pilot asked me to cancel", waivesFee: true },
  { id: "wrong_way", label: "Pilot is going the wrong way", waivesFee: true },
  { id: "plans_changed", label: "My plans changed", waivesFee: false },
  { id: "mistake", label: "Booked by mistake", waivesFee: false },
] as const;

export type CancelReasonId = (typeof CANCEL_REASONS)[number]["id"];
export const CANCEL_REASON_IDS = CANCEL_REASONS.map((r) => r.id) as [
  CancelReasonId,
  ...CancelReasonId[],
];

export function cancellationFee(input: {
  status: string;
  requestedAt: Date;
  now: Date;
  reason: CancelReasonId | null;
}): Paise {
  // Nobody has set off yet: searching, or booked ahead and not yet released.
  if (input.status === "requested" || input.status === "scheduled") return 0;
  const reason = CANCEL_REASONS.find((r) => r.id === input.reason);
  if (reason?.waivesFee) return 0;
  const sinceBookingS = (input.now.getTime() - input.requestedAt.getTime()) / 1000;
  return sinceBookingS > FREE_CANCEL_S ? CANCEL_FEE : 0;
}
