/**
 * Account rules shared by the screens and the server. Pure and
 * browser-safe.
 */

export const MAX_SAVED_PLACES = 10;
export const MAX_EMERGENCY_CONTACTS = 3;
export const PLACE_LABELS = ["home", "work", "other"] as const;
export type PlaceLabel = (typeof PLACE_LABELS)[number];

/**
 * A phone number as E.164. Ten-digit Indian mobiles get +91; anything
 * else must already start with + and a country code. Returns null if it
 * can't be a phone number.
 */
export function toE164(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

/** "+919876543210" → "+91 98••• ••210": enough to recognise, not to dial. */
export function maskPhone(e164: string): string {
  const cc = e164.startsWith("+91") ? "+91" : e164.slice(0, e164.length - 10);
  const local = e164.slice(cc.length);
  return `${cc} ${local.slice(0, 2)}••• ••${local.slice(-3)}`;
}
