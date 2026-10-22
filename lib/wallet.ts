import { rupees, type Paise } from "@/lib/money";

/**
 * Wallet rules shared by the server and the wallet screens (docs/PRD.md
 * F6, docs/API.md "Payments"). Pure and browser-safe. Balances themselves
 * are only ever computed on the server, from the ledger.
 */

export const TOPUP_MIN: Paise = rupees(50);
export const TOPUP_MAX: Paise = rupees(10_000);
export const QUICK_TOPUPS: Paise[] = [rupees(200), rupees(500), rupees(1_000)];

/** Every demo rider starts with this balance (docs/PRD.md F1). */
export const DEMO_WALLET_GRANT: Paise = rupees(1_240);

/**
 * The most cash a Pilot can record for a ride: the fare plus one ₹500
 * note. Caps the change that can be credited to a rider's wallet, so a
 * typo can't move thousands between wallets.
 */
export const MAX_CASH_OVER: Paise = rupees(500);

export const PAYMENT_METHODS = ["wallet", "upi", "card", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  wallet: "Comet Wallet",
  upi: "UPI",
  card: "Card",
  cash: "Cash",
};

export type WalletEntryKind =
  | "topup"
  | "ride_payment"
  | "ride_refund"
  | "cancellation_fee"
  | "waiting_fee"
  | "tip"
  | "referral_reward"
  | "cashback"
  | "pilot_earning"
  | "platform_fee"
  | "payout"
  | "cash_change"
  | "demo_grant"
  | "promo_subsidy";

/** How a ledger entry reads in a transaction list. */
export function entryTitle(kind: WalletEntryKind, amountPaise: Paise, note: string | null) {
  switch (kind) {
    case "topup":
      return "Added money";
    case "ride_payment":
      return note ? `Ride to ${note}` : "Ride";
    case "ride_refund":
      return "Refund";
    case "pilot_earning":
      return note ? `Trip to ${note}` : "Trip earning";
    case "platform_fee":
      return "Comet fee";
    case "payout":
      return "Withdrawal to bank";
    case "cash_change":
      return amountPaise > 0 ? "Change from cash payment" : "Change credited to rider";
    case "demo_grant":
      return "Welcome credit";
    case "promo_subsidy":
      return "Promo discount, paid by Comet";
    case "cancellation_fee":
      return "Cancellation fee";
    case "waiting_fee":
      return "Waiting fee";
    case "tip":
      return "Tip";
    case "referral_reward":
      return "Referral reward";
    case "cashback":
      return "Cashback";
  }
}
