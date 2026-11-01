import { describe, expect, it } from "vitest";

import { cancellationFee } from "@/lib/cancellation";
import { bestMatchIndex, canChain, farePerKm, remainingTripS, shortDistance } from "@/lib/chaining";

/** Queued next trips and multiple requests (docs/PRD.md F12). */

describe("when a Pilot on a trip can be offered the next one", () => {
  const started = new Date("2026-11-01T10:00:00Z");

  it("counts down the trip's route time, never below zero", () => {
    expect(remainingTripS(started, 1_200, new Date("2026-11-01T10:15:00Z"))).toBe(300);
    expect(remainingTripS(started, 1_200, new Date("2026-11-01T10:30:00Z"))).toBe(0);
  });

  it("needs the drop within 5 minutes and the pickup within 2 km of it", () => {
    expect(canChain(300, 2_000)).toBe(true);
    expect(canChain(301, 400)).toBe(false);
    expect(canChain(60, 2_001)).toBe(false);
  });
});

describe("the request list", () => {
  it("marks the nearest pickup as the best match, only among several", () => {
    expect(bestMatchIndex([2_100, 800, 1_600])).toBe(1);
    expect(bestMatchIndex([null, 900])).toBe(1);
    expect(bestMatchIndex([800])).toBeNull();
    expect(bestMatchIndex([null, null])).toBeNull();
  });

  it("shows fare per km and short distances", () => {
    expect(farePerKm(14_800, 7_400)).toBe("₹20/km");
    expect(farePerKm(5_000, 50)).toBeNull();
    expect(shortDistance(412)).toBe("400 m");
    expect(shortDistance(1_640)).toBe("1.6 km");
  });
});

describe("cancelling a queued ride", () => {
  it("is free: the Pilot hasn't set off yet", () => {
    const late = {
      status: "accepted",
      requestedAt: new Date("2026-11-01T10:00:00Z"),
      now: new Date("2026-11-01T10:10:00Z"),
      reason: null,
    };
    expect(cancellationFee(late)).toBe(2_500);
    expect(cancellationFee({ ...late, queued: true })).toBe(0);
  });
});
