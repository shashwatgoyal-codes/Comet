import { describe, expect, it } from "vitest";

import { isValidPickupTime, pickupSlots, scheduleWindow } from "@/lib/scheduling";

// 10:07 am in India on 22 Oct 2026.
const now = new Date("2026-10-22T04:37:00Z");

describe("schedule window", () => {
  it("starts 30 minutes ahead, on the next quarter hour", () => {
    expect(scheduleWindow(now).earliest.toISOString()).toBe("2026-10-22T05:15:00.000Z"); // 10:45 am
  });

  it("ends at 11:45 pm on the third day after today", () => {
    expect(scheduleWindow(now).latest.toISOString()).toBe("2026-10-25T18:15:00.000Z");
  });

  it("only accepts quarter-hour times inside the window", () => {
    expect(isValidPickupTime(new Date("2026-10-22T05:15:00Z"), now)).toBe(true);
    expect(isValidPickupTime(new Date("2026-10-22T05:00:00Z"), now)).toBe(false); // too soon
    expect(isValidPickupTime(new Date("2026-10-22T05:20:00Z"), now)).toBe(false); // not a slot
    expect(isValidPickupTime(new Date("2026-10-26T05:15:00Z"), now)).toBe(false); // too far
  });

  it("offers four days of slots, starting today", () => {
    const days = pickupSlots(now);
    expect(days).toHaveLength(4);
    expect(days[0]!.slots[0]!.toISOString()).toBe("2026-10-22T05:15:00.000Z");
    expect(days[1]!.slots).toHaveLength(96);
  });
});
