import { describe, expect, it } from "vitest";

import { minutesAgo, promoState, shortName, tripRef, tripStatus } from "@/lib/ops";
import { createPromoSchema } from "@/lib/validation/ops";

/** Ops dashboard rules (docs/PRD.md F10). */

describe("trip rows", () => {
  it("shows the receipt reference and a short Pilot name", () => {
    expect(tripRef("5821a3bc-0000-4000-8000-000000000000")).toBe("CMT-R-5821A3");
    expect(shortName("Rohan Kumar")).toBe("Rohan K.");
    expect(shortName("Priya  Lakshmi Sharma")).toBe("Priya S.");
    expect(shortName("Arjun")).toBe("Arjun");
  });

  it("labels statuses, and an open SOS beats everything", () => {
    expect(tripStatus("in_progress", false)).toEqual({ label: "On trip", tone: "live" });
    expect(tripStatus("completed", false)).toEqual({ label: "Completed", tone: "done" });
    expect(tripStatus("cancelled", false).tone).toBe("cancel");
    expect(tripStatus("in_progress", true)).toEqual({ label: "SOS", tone: "sos" });
  });
});

describe("promo state", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const p = (startsAt: string, endsAt: string, isActive = true) => ({
    isActive,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  });

  it("is live, scheduled, ended or off", () => {
    expect(promoState(p("2026-01-01", "2027-01-01"), now)).toBe("live");
    expect(promoState(p("2026-12-01", "2027-01-01"), now)).toBe("scheduled");
    expect(promoState(p("2026-01-01", "2026-10-01"), now)).toBe("ended");
    expect(promoState(p("2026-01-01", "2027-01-01", false), now)).toBe("off");
  });
});

describe("minutes ago", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  it("reads naturally", () => {
    expect(minutesAgo("2026-11-01T11:59:40Z", now)).toBe("just now");
    expect(minutesAgo("2026-11-01T11:58:00Z", now)).toBe("2 min ago");
    expect(minutesAgo("2026-11-01T09:30:00Z", now)).toBe("2 h ago");
  });
});

describe("the new promo form", () => {
  const base = {
    code: "diwali25",
    kind: "flat",
    amount: "25",
    minFareRupees: "100",
    title: "₹25 off for Diwali",
    startsAt: "2026-11-01T00:00:00+05:30",
    endsAt: "2026-11-15T23:59:00+05:30",
  };

  it("stores paise and hundredths of a percent", () => {
    expect(createPromoSchema.parse(base)).toMatchObject({
      code: "DIWALI25",
      value: 2500,
      minFarePaise: 10000,
      maxDiscountPaise: null,
      tier: null,
      maxUsesPerUser: 1,
    });
    expect(
      createPromoSchema.parse({ ...base, kind: "percent", amount: "20", capRupees: "60" }),
    ).toMatchObject({ value: 2000, maxDiscountPaise: 6000 });
  });

  it("refuses bad codes, amounts and windows", () => {
    const issue = (input: object) =>
      createPromoSchema.safeParse({ ...base, ...input }).error?.issues[0]?.message;
    expect(issue({ code: "a!" })).toBe("Use 4–20 letters and numbers.");
    expect(issue({ kind: "percent", amount: "150" })).toBe("A percentage can be at most 100.");
    expect(issue({ amount: "5000" })).toBe("A flat discount can be at most ₹1,000.");
    expect(issue({ endsAt: "2026-10-01T00:00:00+05:30" })).toBe("End after it starts.");
  });
});
