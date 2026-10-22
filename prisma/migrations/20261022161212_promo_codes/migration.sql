-- CreateEnum
CREATE TYPE "promo_kind" AS ENUM ('flat', 'percent', 'cashback');

-- AlterEnum
ALTER TYPE "wallet_entry_kind" ADD VALUE 'promo_subsidy';

-- AlterTable
ALTER TABLE "rides" ADD COLUMN     "cashback_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promo_id" UUID;

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "kind" "promo_kind" NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount_paise" INTEGER,
    "min_fare_paise" INTEGER NOT NULL DEFAULT 0,
    "tier" "ride_tier",
    "wallet_only" BOOLEAN NOT NULL DEFAULT false,
    "title" VARCHAR(120) NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "max_uses_per_user" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL,
    "promo_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "discount_paise" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_ride_id_key" ON "promo_redemptions"("ride_id");

-- CreateIndex
CREATE INDEX "promo_redemptions_user_promo_idx" ON "promo_redemptions"("user_id", "promo_id");

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Hand-written below (docs/DATABASE.md "Promotions").
-- ---------------------------------------------------------------------

ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_code_upper" CHECK ("code" ~ '^[A-Z0-9]{3,20}$');
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_value_valid" CHECK (
  "value" > 0 AND ("kind" = 'flat' OR "value" <= 10000)
);
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_dates" CHECK ("ends_at" > "starts_at");
ALTER TABLE "rides" ADD CONSTRAINT "rides_promo_money_valid" CHECK (
  "cashback_paise" >= 0 AND "discount_paise" <= "fare_paise"
);

ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_redemptions" ENABLE ROW LEVEL SECURITY;

-- The launch offers (docs/DATABASE.md §12).
INSERT INTO "promo_codes"
  ("id", "code", "kind", "value", "max_discount_paise", "min_fare_paise", "tier", "wallet_only", "title", "starts_at", "ends_at")
VALUES
  (gen_random_uuid(), 'COMET30', 'flat', 3000, NULL, 10000, NULL, false,
   'Flat ₹30 off this ride', '2026-01-01T00:00:00+05:30', '2027-12-31T23:59:59+05:30'),
  (gen_random_uuid(), 'WALLET10', 'cashback', 1000, 2500, 0, NULL, true,
   '10% cashback when you pay by Comet Wallet', '2026-01-01T00:00:00+05:30', '2027-12-31T23:59:59+05:30'),
  (gen_random_uuid(), 'PRIME20', 'percent', 2000, NULL, 0, 'prime', false,
   '20% off Comet Prime rides', '2026-01-01T00:00:00+05:30', '2027-12-31T23:59:59+05:30'),
  (gen_random_uuid(), 'MONSOON50', 'flat', 5000, NULL, 15000, NULL, false,
   'Monsoon offer: ₹50 off', '2026-06-01T00:00:00+05:30', '2026-09-30T23:59:59+05:30');

-- Settlement with promos. Comet funds every discount: the Pilot still
-- earns fare + waiting fee − Comet's fee. When the rider pays cash they
-- hand over the discounted total, so Comet credits the Pilot the
-- discount (promo_subsidy). Wallet cashback is credited to the rider once
-- a wallet-paid ride settles.
CREATE OR REPLACE FUNCTION "comet_settle_ride"(p_ride uuid, p_via text, p_change integer DEFAULT 0)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  r "rides"%ROWTYPE;
  k text := 'ride:' || p_ride::text;
BEGIN
  IF p_via NOT IN ('wallet', 'online', 'cash') OR p_change < 0 OR (p_change > 0 AND p_via <> 'cash') THEN
    RAISE EXCEPTION 'Invalid settlement' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO r FROM "rides" WHERE "id" = p_ride FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF r."status" <> 'completed' OR r."pilot_id" IS NULL THEN RETURN 'not_completed'; END IF;
  IF r."payment_status" NOT IN ('pending', 'failed') THEN RETURN 'already'; END IF;

  IF p_via = 'wallet' AND r."total_paise" > 0 THEN
    PERFORM "comet_lock_wallet"(r."rider_id");
    IF "comet_wallet_balance"(r."rider_id") < r."total_paise" THEN
      UPDATE "rides" SET "payment_status" = 'failed', "payment_method" = 'wallet', "updated_at" = now()
      WHERE "id" = p_ride;
      RETURN 'insufficient';
    END IF;
    INSERT INTO "wallet_entries" ("id", "user_id", "amount_paise", "kind", "ride_id", "idempotency_key", "note")
    VALUES (gen_random_uuid(), r."rider_id", -r."total_paise", 'ride_payment', p_ride, k || ':charge', r."drop_address");
  END IF;

  IF p_via <> 'cash' AND r."fare_paise" + r."waiting_fee_paise" > 0 THEN
    INSERT INTO "wallet_entries" ("id", "user_id", "amount_paise", "kind", "ride_id", "idempotency_key", "note")
    VALUES (gen_random_uuid(), r."pilot_id", r."fare_paise" + r."waiting_fee_paise", 'pilot_earning', p_ride, k || ':earning', r."drop_address");
  END IF;
  IF r."platform_fee_paise" > 0 THEN
    INSERT INTO "wallet_entries" ("id", "user_id", "amount_paise", "kind", "ride_id", "idempotency_key", "note")
    VALUES (gen_random_uuid(), r."pilot_id", -r."platform_fee_paise", 'platform_fee', p_ride, k || ':fee', r."drop_address");
  END IF;
  IF p_via = 'cash' AND r."discount_paise" > 0 THEN
    INSERT INTO "wallet_entries" ("id", "user_id", "amount_paise", "kind", "ride_id", "idempotency_key", "note")
    VALUES (gen_random_uuid(), r."pilot_id", r."discount_paise", 'promo_subsidy', p_ride, k || ':subsidy', 'Promo discount, paid by Comet');
  END IF;
  IF p_via = 'wallet' AND r."cashback_paise" > 0 THEN
    INSERT INTO "wallet_entries" ("id", "user_id", "amount_paise", "kind", "ride_id", "idempotency_key", "note")
    VALUES (gen_random_uuid(), r."rider_id", r."cashback_paise", 'cashback', p_ride, k || ':cashback', r."drop_address");
  END IF;
  IF p_change > 0 THEN
    INSERT INTO "wallet_entries" ("id", "user_id", "amount_paise", "kind", "ride_id", "idempotency_key", "note")
    VALUES
      (gen_random_uuid(), r."rider_id", p_change, 'cash_change', p_ride, k || ':change:rider', 'Change from your cash payment'),
      (gen_random_uuid(), r."pilot_id", -p_change, 'cash_change', p_ride, k || ':change:pilot', 'Change credited to the rider');
  END IF;

  UPDATE "rides"
  SET "payment_status" = 'paid',
      "payment_method" = CASE p_via
        WHEN 'wallet' THEN 'wallet'::payment_method
        WHEN 'cash' THEN 'cash'::payment_method
        ELSE CASE WHEN r."payment_method" IN ('upi', 'card') THEN r."payment_method" ELSE 'upi'::payment_method END
      END,
      "updated_at" = now()
  WHERE "id" = p_ride;
  RETURN 'paid';
END;
$$;
