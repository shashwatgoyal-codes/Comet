import { TIER_RATES, type RideTier } from "@/lib/fares";

/**
 * Pilot onboarding rules (docs/PRD.md F11, "1 · Pilot onboarding").
 * Pure and browser-safe. Document uploads are simulated: a step records
 * what the Pilot typed, never a file.
 */

export const VEHICLE_TYPES = ["bike", "auto", "car"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** What each vehicle drives for. Cars start on Comet Go. */
export const VEHICLES: Record<VehicleType, { label: string; tier: RideTier; seats: number }> = {
  bike: { label: "Bike", tier: "bike", seats: TIER_RATES.bike.seats },
  auto: { label: "Auto", tier: "auto", seats: TIER_RATES.auto.seats },
  car: { label: "Car", tier: "go", seats: TIER_RATES.go.seats },
};

export const STEP_IDS = ["profile", "licence", "rc", "photos", "payout"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEPS: Record<StepId, { label: string; sub: string; action: string }> = {
  profile: { label: "Profile & photo", sub: "Name and selfie", action: "Add your profile" },
  licence: { label: "Driving licence", sub: "Number and expiry", action: "Add driving licence" },
  rc: { label: "Vehicle RC", sub: "Registration certificate", action: "Upload vehicle RC" },
  photos: { label: "Vehicle photos", sub: "Front, back, inside", action: "Add vehicle photos" },
  payout: { label: "Payout account", sub: "UPI ID", action: "Add payout account" },
};

/** How long ops aim to take, as promised on the onboarding screen. */
export const REVIEW_PROMISE_HOURS = 48;

/** A document expiring within this many days shows a warning. */
export const EXPIRY_WARNING_DAYS = 30;

export const MAX_REJECTION_REASON = 300;

/**
 * "added" until the application is sent, then "in_review" until ops
 * decide; "verified" once approved.
 */
export type StepState = "todo" | "added" | "in_review" | "verified";

export const STEP_TAGS: Record<StepState, string> = {
  todo: "Add",
  added: "Added",
  in_review: "In review",
  verified: "Verified",
};

export function progress(states: Record<StepId, StepState>) {
  const done = STEP_IDS.filter((id) => states[id] !== "todo").length;
  return {
    done,
    total: STEP_IDS.length,
    percent: Math.round((done / STEP_IDS.length) * 100),
    next: STEP_IDS.find((id) => states[id] === "todo") ?? null,
  };
}

/**
 * Indian number plates, normalised to "KA 05 MX 2841". Accepts the state
 * series (KA05MX2841, KA 5 M 2841) and the Bharat series (22 BH 1234 AB).
 */
export function normalisePlate(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  const state = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/.exec(raw);
  if (state) {
    const [, st, district, series, number] = state;
    return [st, district!.padStart(2, "0"), series, number].filter(Boolean).join(" ");
  }
  const bharat = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/.exec(raw);
  if (bharat) return `${bharat[1]} BH ${bharat[2]} ${bharat[3]}`;
  return null;
}

/** Licence numbers vary by state; this checks only the shape. */
export function normaliseLicence(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z]{2}[0-9A-Z]{8,16}$/.test(raw) ? raw : null;
}

export function isUpiId(input: string): boolean {
  return /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,30}$/.test(input.trim());
}

/** "rohan.k@okaxis" → "ro•••••@okaxis". */
export function maskUpi(upi: string): string {
  const [name = "", handle = ""] = upi.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(3, name.length - 2))}@${handle}`;
}

const DAY_MS = 86_400_000;

/** Whole days until a date (YYYY-MM-DD, India), negative once past. */
export function daysUntil(isoDate: string, now: Date): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / DAY_MS);
}

export function expiryNote(isoDate: string | null, now: Date): string | null {
  if (!isoDate) return null;
  const days = daysUntil(isoDate, now);
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days <= EXPIRY_WARNING_DAYS) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  return null;
}
