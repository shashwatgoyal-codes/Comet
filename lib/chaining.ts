/**
 * Queued next trips (docs/PRD.md F12, "5b · Request while driving"). Pure
 * and browser-safe.
 *
 * A Pilot on a trip can be offered their next ride when the current
 * drop-off is at most CHAIN_MAX_REMAINING_S away and the new pickup is
 * within CHAIN_MAX_DROP_DISTANCE_M of that drop-off. Free Pilots are
 * always offered first.
 */

export const CHAIN_MAX_REMAINING_S = 5 * 60;
export const CHAIN_MAX_DROP_DISTANCE_M = 2_000;

/**
 * Seconds left on a trip, from when it started and the route's duration.
 * Zero once it's overdue: a Pilot stuck in traffic is still nearly done.
 */
export function remainingTripS(startedAt: Date, durationS: number, now: Date): number {
  return Math.max(0, Math.round(startedAt.getTime() / 1000 + durationS - now.getTime() / 1000));
}

export function canChain(remainingS: number, dropToPickupM: number): boolean {
  return remainingS <= CHAIN_MAX_REMAINING_S && dropToPickupM <= CHAIN_MAX_DROP_DISTANCE_M;
}

/** "400 m", "1.6 km" */
export function shortDistance(m: number): string {
  return m < 1_000 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Index of the request with the nearest pickup, the "Best match"; null for one or none. */
export function bestMatchIndex(pickupDistances: (number | null)[]): number | null {
  if (pickupDistances.length < 2) return null;
  let best: number | null = null;
  pickupDistances.forEach((d, i) => {
    if (d === null) return;
    if (best === null || d < pickupDistances[best]!) best = i;
  });
  return best;
}

/** What the Pilot earns per km of the trip itself, rounded: "₹20/km". */
export function farePerKm(farePaise: number, tripDistanceM: number): string | null {
  if (tripDistanceM < 100) return null;
  return `₹${Math.round(farePaise / 100 / (tripDistanceM / 1000))}/km`;
}
