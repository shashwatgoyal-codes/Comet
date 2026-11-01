import { describe, expect, it } from "vitest";

import {
  expiryNote,
  isUpiId,
  maskUpi,
  normaliseLicence,
  normalisePlate,
  progress,
  type StepState,
} from "@/lib/onboarding";

/** Pilot onboarding rules (docs/PRD.md F11). */

describe("number plates", () => {
  it.each([
    ["KA05MX2841", "KA 05 MX 2841"],
    ["ka 05 mx 2841", "KA 05 MX 2841"],
    ["KA-5-M-2841", "KA 05 M 2841"],
    ["KA 01 1234", "KA 01 1234"],
    ["22 BH 1234 AB", "22 BH 1234 AB"],
  ])("normalises %s", (input, expected) => {
    expect(normalisePlate(input)).toBe(expected);
  });

  it.each(["", "KA", "1234", "KA05MX28411", "K05MX2841"])("refuses %j", (input) => {
    expect(normalisePlate(input)).toBeNull();
  });
});

describe("licence numbers and UPI IDs", () => {
  it("checks the shape of a licence number", () => {
    expect(normaliseLicence("KA05 2019-0012345")).toBe("KA0520190012345");
    expect(normaliseLicence("12345")).toBeNull();
  });

  it("accepts name@bank UPI IDs and masks them", () => {
    expect(isUpiId("rohan.kumar@okaxis")).toBe(true);
    expect(isUpiId("rohan")).toBe(false);
    expect(isUpiId("a@b")).toBe(false);
    expect(maskUpi("rohan.kumar@okaxis")).toBe("ro•••••••••@okaxis");
    expect(maskUpi("ab@ybl")).toBe("ab•••@ybl");
  });
});

describe("progress", () => {
  const states = (done: number): Record<string, StepState> =>
    Object.fromEntries(
      ["profile", "licence", "rc", "photos", "payout"].map((id, i) => [
        id,
        i < done ? "added" : "todo",
      ]),
    );

  it("counts finished steps and names the next one", () => {
    expect(progress(states(2) as never)).toEqual({ done: 2, total: 5, percent: 40, next: "rc" });
    expect(progress(states(5) as never).next).toBeNull();
  });
});

describe("expiry warnings", () => {
  const now = new Date("2026-11-01T06:00:00Z"); // 11:30 am in India

  it("warns within 30 days, and once expired", () => {
    expect(expiryNote("2026-11-24", now)).toBe("Expires in 23 days");
    expect(expiryNote("2026-11-02", now)).toBe("Expires in 1 day");
    expect(expiryNote("2026-11-01", now)).toBe("Expires today");
    expect(expiryNote("2026-10-31", now)).toBe("Expired");
    expect(expiryNote("2027-06-01", now)).toBeNull();
    expect(expiryNote(null, now)).toBeNull();
  });

  it("counts days in India time", () => {
    // 8 pm UTC on 31 Oct is already 1 Nov in India.
    expect(expiryNote("2026-11-01", new Date("2026-10-31T20:00:00Z"))).toBe("Expires today");
  });
});
