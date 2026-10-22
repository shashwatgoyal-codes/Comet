/**
 * Booking ahead ("13 · Schedule a ride"). Pure and browser-safe: the
 * picker offers exactly the times the server accepts.
 *
 * - Pickups are on the quarter hour, from 30 minutes ahead to the end of
 *   the third day after today (India time).
 * - The ride is offered to Pilots 15 minutes before pickup.
 * - Cancelling is free until then: no Pilot has set off yet.
 */

export const SLOT_MINUTES = 15;
export const MIN_LEAD_MS = 30 * 60_000;
export const DISPATCH_BEFORE_MS = 15 * 60_000;
export const DAYS_AHEAD = 3;
/** A scheduled ride nobody dispatched within this long after pickup expires. */
export const DISPATCH_GRACE_MS = 10 * 60_000;
export const MAX_UPCOMING = 3;

const IST_OFFSET_MS = 5.5 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** Midnight in India, as an instant, for the day containing `at`. */
export function startOfIndiaDay(at: Date): Date {
  const ist = at.getTime() + IST_OFFSET_MS;
  return new Date(ist - (ist % DAY_MS) - IST_OFFSET_MS);
}

export function scheduleWindow(now: Date): { earliest: Date; latest: Date } {
  const slot = SLOT_MINUTES * 60_000;
  const earliest = new Date(Math.ceil((now.getTime() + MIN_LEAD_MS) / slot) * slot);
  const latest = new Date(startOfIndiaDay(now).getTime() + (DAYS_AHEAD + 1) * DAY_MS - slot);
  return { earliest, latest };
}

export function isValidPickupTime(at: Date, now: Date): boolean {
  const { earliest, latest } = scheduleWindow(now);
  return (
    at.getTime() % (SLOT_MINUTES * 60_000) === 0 &&
    at.getTime() >= earliest.getTime() &&
    at.getTime() <= latest.getTime()
  );
}

/** The bookable slots on each of the next days, for the picker. */
export function pickupSlots(now: Date): { day: Date; slots: Date[] }[] {
  const { earliest, latest } = scheduleWindow(now);
  const today = startOfIndiaDay(now).getTime();
  return Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => {
    const day = new Date(today + i * DAY_MS);
    const slots: Date[] = [];
    for (let t = day.getTime(); t < day.getTime() + DAY_MS; t += SLOT_MINUTES * 60_000) {
      if (t >= earliest.getTime() && t <= latest.getTime()) slots.push(new Date(t));
    }
    return { day, slots };
  }).filter((d) => d.slots.length > 0);
}
