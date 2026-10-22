import { describe, expect, it } from "vitest";

import { maskPhone, toE164 } from "@/lib/account";
import { contactSchema } from "@/lib/validation/account";

describe("phone numbers", () => {
  it("normalises Indian mobiles and accepts international E.164", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("09876543210")).toBe("+919876543210");
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
    expect(toE164("12345")).toBeNull();
    expect(toE164("5876543210")).toBeNull(); // Indian mobiles start 6–9
  });

  it("masks all but enough to recognise", () => {
    expect(maskPhone("+919876543210")).toBe("+91 98••• ••210");
  });

  it("validates contacts", () => {
    expect(contactSchema.safeParse({ name: "Mom", phone: "9876543210" }).data).toEqual({
      name: "Mom",
      phone: "+919876543210",
    });
    expect(contactSchema.safeParse({ name: "Mom", phone: "abc" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: " ", phone: "9876543210" }).success).toBe(false);
  });
});
