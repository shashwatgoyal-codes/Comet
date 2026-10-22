/**
 * The ride state machine (docs/ARCHITECTURE.md §9). Pure and browser-safe.
 *
 * The same table is enforced by a trigger in the database
 * (enforce_ride_transition); tests check that the two agree.
 *
 *   scheduled ─► requested ─► accepted ─► arrived ─► in_progress ─► completed
 *       │ (15 min before pickup)
 *       │            │          │
 *       ├─► expired  ├─► cancelled  ├─► cancelled
 *       └─► cancelled            └─► no_show
 */

export const RIDE_STATUSES = [
  "scheduled",
  "requested",
  "accepted",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
  "no_show",
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const ACTIVE_STATUSES: readonly RideStatus[] = [
  "requested",
  "accepted",
  "arrived",
  "in_progress",
];

export const TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  scheduled: ["requested", "cancelled", "expired"],
  requested: ["accepted", "cancelled", "expired"],
  accepted: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  expired: [],
  no_show: [],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isActive(status: RideStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminal(status: RideStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
