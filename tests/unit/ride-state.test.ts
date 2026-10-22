import { describe, expect, it } from "vitest";

import {
  ACTIVE_STATUSES,
  RIDE_STATUSES,
  TRANSITIONS,
  canTransition,
  isActive,
  isTerminal,
} from "@/lib/ride-state";

describe("ride state machine", () => {
  it("follows the happy path", () => {
    expect(canTransition("requested", "accepted")).toBe(true);
    expect(canTransition("accepted", "arrived")).toBe(true);
    expect(canTransition("arrived", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });

  it("never skips steps or goes backwards", () => {
    expect(canTransition("requested", "completed")).toBe(false);
    expect(canTransition("accepted", "in_progress")).toBe(false);
    expect(canTransition("in_progress", "accepted")).toBe(false);
    expect(canTransition("completed", "requested")).toBe(false);
  });

  it("can't cancel once the trip has started", () => {
    expect(canTransition("in_progress", "cancelled")).toBe(false);
  });

  it("only allows a no-show after the Pilot has arrived", () => {
    expect(canTransition("arrived", "no_show")).toBe(true);
    expect(canTransition("accepted", "no_show")).toBe(false);
  });

  it("terminal states have no way out, active ones do", () => {
    for (const s of RIDE_STATUSES) {
      // A scheduled ride is neither: waiting, not yet live, not finished.
      if (s === "scheduled") continue;
      expect(isTerminal(s)).toBe(!ACTIVE_STATUSES.includes(s));
      expect(isActive(s)).toBe(ACTIVE_STATUSES.includes(s));
    }
  });

  it("a scheduled ride isn't active (it doesn't block booking now) and isn't finished", () => {
    expect(isActive("scheduled")).toBe(false);
    expect(isTerminal("scheduled")).toBe(false);
    expect(TRANSITIONS.scheduled).toEqual(["requested", "cancelled", "expired"]);
  });

  it("every transition target is a known status", () => {
    for (const targets of Object.values(TRANSITIONS)) {
      for (const t of targets) expect(RIDE_STATUSES).toContain(t);
    }
  });
});
