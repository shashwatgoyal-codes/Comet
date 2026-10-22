import { describe, expect, it } from "vitest";

import { evaluatePromo, type PromoContext, type PromoRule } from "@/lib/promos";

const base: Omit<PromoRule, "code" | "kind" | "value"> = {
  maxDiscountPaise: null,
  minFarePaise: 0,
  tier: null,
  walletOnly: false,
  startsAt: new Date("2026-01-01T00:00:00Z"),
  endsAt: new Date("2027-12-31T00:00:00Z"),
  maxUsesPerUser: 1,
  isActive: true,
};
const COMET30: PromoRule = {
  ...base,
  code: "COMET30",
  kind: "flat",
  value: 3000,
  minFarePaise: 10000,
};
const PRIME20: PromoRule = {
  ...base,
  code: "PRIME20",
  kind: "percent",
  value: 2000,
  tier: "prime",
};
const WALLET10: PromoRule = {
  ...base,
  code: "WALLET10",
  kind: "cashback",
  value: 1000,
  maxDiscountPaise: 2500,
  walletOnly: true,
};
const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({
  tier: "go",
  farePaise: 14800,
  paymentMethod: "wallet",
  now: new Date("2026-10-22T10:00:00Z"),
  usesByRider: 0,
  ...over,
});

describe("evaluatePromo", () => {
  it("takes a flat amount off above the minimum fare", () => {
    expect(evaluatePromo(COMET30, ctx())).toEqual({
      ok: true,
      discountPaise: 3000,
      cashbackPaise: 0,
    });
    expect(evaluatePromo(COMET30, ctx({ farePaise: 9900 }))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("at least ₹100"),
    });
  });

  it("takes a percentage off only on its tier", () => {
    expect(evaluatePromo(PRIME20, ctx({ tier: "prime", farePaise: 21200 }))).toEqual({
      ok: true,
      discountPaise: 4240,
      cashbackPaise: 0,
    });
    expect(evaluatePromo(PRIME20, ctx())).toMatchObject({
      ok: false,
      reason: "PRIME20 only works on Comet Prime rides.",
    });
  });

  it("gives capped cashback, and only with the wallet", () => {
    expect(evaluatePromo(WALLET10, ctx())).toEqual({
      ok: true,
      discountPaise: 0,
      cashbackPaise: 1480,
    });
    expect(evaluatePromo(WALLET10, ctx({ farePaise: 50000 }))).toEqual({
      ok: true,
      discountPaise: 0,
      cashbackPaise: 2500,
    });
    expect(evaluatePromo(WALLET10, ctx({ paymentMethod: "cash" }))).toMatchObject({ ok: false });
  });

  it("refuses ended, inactive and used-up codes", () => {
    expect(evaluatePromo(COMET30, ctx({ now: new Date("2028-01-01T00:00:00Z") }))).toMatchObject({
      ok: false,
      reason: "COMET30 has ended.",
    });
    expect(evaluatePromo({ ...COMET30, isActive: false }, ctx())).toMatchObject({ ok: false });
    expect(evaluatePromo(COMET30, ctx({ usesByRider: 1 }))).toMatchObject({
      ok: false,
      reason: "You've already used COMET30.",
    });
  });

  it("never discounts more than the fare", () => {
    const big: PromoRule = { ...COMET30, value: 100000, minFarePaise: 0 };
    expect(evaluatePromo(big, ctx({ farePaise: 5000 }))).toMatchObject({ discountPaise: 5000 });
  });
});
