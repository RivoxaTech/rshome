/**
 * Feature flags (ARCHITECTURE.md §4.6). A flag is added only when some code reads it; the rest
 * of the §4.6 list (coupons, cod, bankTransfer, wholesale, multiCurrency) arrives with its slice.
 */
export const features = {
  /** Off: no discount is loaded, so every price is the variant's base price. */
  discounts: true,
} as const;
