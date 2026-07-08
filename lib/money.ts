// All money math in integer cents. Conversion rounds half-up per order.

export const STATUSES = [
  "pending",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
] as const;
export type Status = (typeof STATUSES)[number];

// Revenue counts these statuses only; others contribute zero.
export const REVENUE_STATUSES: Status[] = ["completed", "shipped"];

// Conversion rates to USD, expressed as integer numerator over 100.
// USD 1.00, EUR 1.08 (spec), GBP 1.27 (ASSUMPTION — spec omits a GBP rate).
export const RATE_NUM: Record<string, number> = { USD: 100, EUR: 108, GBP: 127 };
export const SUPPORTED_CURRENCIES = Object.keys(RATE_NUM);
export const GBP_ASSUMED = true; // surfaced in the import summary

// Convert original cents to USD cents, rounding half-up on the absolute value
// so that e.g. -45 refunded and +45 convert with identical magnitude.
export function toUsdCents(amountCents: number, currency: string): number {
  const num = RATE_NUM[currency];
  if (num === undefined) throw new Error(`unsupported currency ${currency}`);
  const sign = amountCents < 0 ? -1 : 1;
  const abs = Math.abs(amountCents);
  const converted = Math.floor((abs * num + 50) / 100); // half-up
  return sign * converted;
}

// Revenue contribution of one order in USD cents.
// Refunded/pending/cancelled contribute 0 regardless of sign.
export function revenueContribution(
  status: string,
  amountUsdCents: number
): number {
  return (REVENUE_STATUSES as string[]).includes(status)
    ? Math.max(0, amountUsdCents)
    : 0;
}

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
