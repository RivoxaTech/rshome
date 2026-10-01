/**
 * Feature flags (ARCHITECTURE.md §4.6). A flag is added only when some code reads it; the rest
 * of the §4.6 list (bankTransfer, wholesale, multiCurrency) arrives with its slice.
 */
export const features = {
  /** Off: no discount is loaded, so every price is the variant's base price. */
  discounts: true,
  /** Off: coupon codes are ignored and the cart hides the coupon field. */
  coupons: true,
  /** Off: cash on delivery is never offered, whatever the zone says. */
  cod: true,
  /**
   * How a bank-transfer customer pays the delivery charge quoted after the order (owner decision,
   * S8). On: a second transfer, with its screenshot uploaded on the order page. Off: in cash on
   * delivery, so only the goods screenshot (at checkout) is needed.
   */
  deliveryChargeByTransfer: true,
  /** Off: the storefront's `/wholesale` page 404s and every "Wholesale" link/button is hidden (S17). */
  wholesale: true,
} as const;
