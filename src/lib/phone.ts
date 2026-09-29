/**
 * Phone normalisation (pure). The normalised form is what `orders.phone` stores, what `/track`
 * compares and what the coupon per-customer limit keys on, so every spelling of one number lands
 * on the same digits: a Pakistani mobile as 923XXXXXXXXX, any other number as country code plus
 * number, digits only (E.164 without the plus).
 */
const SEPARATORS = /[\s().-]/g;

export function normalizePhone(raw: string): string | null {
  let digits = raw.trim().replace(SEPARATORS, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;

  // A Pakistani mobile typed the local way (03XX XXXXXXX), or with the country code and the
  // trunk zero left in (92 03XX XXXXXXX).
  if (/^03\d{9}$/.test(digits)) return `92${digits.slice(1)}`;
  if (/^9203\d{9}$/.test(digits)) return `92${digits.slice(3)}`;
  // Any other leading zero is a local number whose country we can't know: ask for the code.
  if (digits.startsWith("0")) return null;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** For display: "+92 321 8581969" for a Pakistani mobile, "+<digits>" for anything else. */
export function formatPhone(normalized: string): string {
  if (/^923\d{9}$/.test(normalized)) return `+92 ${normalized.slice(2, 5)} ${normalized.slice(5)}`;
  return `+${normalized}`;
}
