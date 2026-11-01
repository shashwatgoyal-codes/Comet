import type { RideStatus } from "@/lib/ride-state";

/** Ops dashboard rules (docs/PRD.md F10). Pure and browser-safe. */

/** How often the dashboard refreshes. Ops has no realtime channel (see the PRD). */
export const OPS_POLL_MS = 5_000;

export const RECENT_TRIPS = 12;

export const MAX_RESOLUTION_NOTE = 500;

/** The public trip reference, as on receipts. */
export const tripRef = (rideId: string) => `CMT-R-${rideId.slice(0, 6).toUpperCase()}`;

/** "Rohan Kumar" → "Rohan K." */
export function shortName(name: string): string {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

export type TripTone = "live" | "done" | "cancel" | "sos";

export function tripStatus(
  status: RideStatus,
  hasOpenSos: boolean,
): { label: string; tone: TripTone } {
  if (hasOpenSos) return { label: "SOS", tone: "sos" };
  const labels: Record<RideStatus, [string, TripTone]> = {
    scheduled: ["Scheduled", "cancel"],
    requested: ["Searching", "live"],
    accepted: ["Pilot on the way", "live"],
    arrived: ["At pickup", "live"],
    in_progress: ["On trip", "live"],
    completed: ["Completed", "done"],
    cancelled: ["Cancelled", "cancel"],
    expired: ["No Pilot found", "cancel"],
    no_show: ["No-show", "cancel"],
  };
  const [label, tone] = labels[status];
  return { label, tone };
}

export type PromoState = "live" | "scheduled" | "ended" | "off";

export function promoState(
  promo: { isActive: boolean; startsAt: Date; endsAt: Date },
  now: Date,
): PromoState {
  if (!promo.isActive) return "off";
  if (promo.endsAt <= now) return "ended";
  if (promo.startsAt > now) return "scheduled";
  return "live";
}

export const PROMO_STATE_LABELS: Record<PromoState, string> = {
  live: "Live",
  scheduled: "Scheduled",
  ended: "Ended",
  off: "Off",
};

/** "2 min ago", for the SOS banner and KPIs. */
export function minutesAgo(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}
