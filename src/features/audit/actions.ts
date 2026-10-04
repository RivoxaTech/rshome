/**
 * The audit viewer's registry of known action and entity names (S20): the filter Listboxes are
 * built from this, not from a `DISTINCT` scan of `audit_logs` (no index on `action`), and the
 * table shows the label with the raw key underneath. A row whose action isn't listed here still
 * shows — with its raw key as the label — it just can't be picked in the filter until added.
 * Pure data; a unit test pins that every action string the services write is registered.
 */
export const AUDIT_ENTITIES: { key: string; label: string }[] = [
  { key: "user", label: "User" },
  { key: "role", label: "Role" },
  { key: "product", label: "Product" },
  { key: "product_order", label: "Product order (arrange)" },
  { key: "product_import", label: "Product CSV import" },
  { key: "product_variant", label: "Variant" },
  { key: "product_variant_order", label: "Variant order" },
  { key: "product_image", label: "Product image" },
  { key: "product_image_order", label: "Product image order" },
  { key: "category", label: "Category" },
  { key: "discount", label: "Discount" },
  { key: "coupon", label: "Coupon" },
  { key: "shipping_zone", label: "Shipping zone" },
  { key: "shipping_zone_order", label: "Shipping zone order" },
  { key: "settings", label: "Settings" },
  { key: "order", label: "Order" },
  { key: "order_export", label: "Order CSV export" },
  { key: "wholesale_export", label: "Wholesale CSV export" },
  { key: "payment_proof", label: "Payment screenshot" },
  { key: "wholesale_inquiry", label: "Wholesale inquiry" },
  { key: "notify", label: "Notification" },
];

export const AUDIT_ACTIONS: { key: string; label: string }[] = [
  // Users and roles (S20) + the self-service password change (S9b).
  { key: "user.create", label: "User created" },
  { key: "user.update", label: "User updated" },
  { key: "user.activate", label: "User activated" },
  { key: "user.deactivate", label: "User deactivated" },
  { key: "user.role_change", label: "User role changed" },
  { key: "user.password_reset", label: "User password reset" },
  { key: "user.password_change", label: "Password changed (self)" },
  { key: "user.delete", label: "User deleted" },
  { key: "role.create", label: "Role created" },
  { key: "role.update", label: "Role updated" },
  { key: "role.sensitive_grant", label: "Role given access outside its side (confirmed)" },
  { key: "role.reset_defaults", label: "Role reset to code defaults" },
  { key: "role.delete", label: "Role deleted" },
  // Orders and payments (S9).
  { key: "order.approve", label: "Order approved" },
  { key: "order.delete", label: "Order deleted" },
  { key: "order.export", label: "Orders exported" },
  { key: "wholesale.export", label: "Wholesale inquiries exported" },
  { key: "payment.approve", label: "Payment screenshot approved" },
  { key: "payment.reject", label: "Payment screenshot rejected" },
  // Wholesale (S17).
  { key: "wholesale.status_change", label: "Wholesale inquiry status changed" },
  // Products, variants, images (S10, S18).
  { key: "product.create", label: "Product created" },
  { key: "product.update", label: "Product updated" },
  { key: "product.price_change", label: "Product price changed" },
  { key: "product.status_change", label: "Product status changed" },
  { key: "product.featured_change", label: "Product featured changed" },
  { key: "product.sort_change", label: "Product order changed" },
  { key: "product.delete", label: "Product deleted" },
  { key: "product.import", label: "Product imported (CSV)" },
  { key: "product.bulk_import", label: "CSV import summary" },
  { key: "product.image_add", label: "Product image added" },
  { key: "product.image_alt_change", label: "Product image alt text changed" },
  { key: "product.image_sort_change", label: "Product images reordered" },
  { key: "product.image_delete", label: "Product image deleted" },
  { key: "variant.create", label: "Variant created" },
  { key: "variant.update", label: "Variant updated" },
  { key: "variant.stock_change", label: "Variant stock changed" },
  { key: "variant.price_override_change", label: "Variant price override changed" },
  { key: "variant.activate", label: "Variant activated" },
  { key: "variant.deactivate", label: "Variant deactivated" },
  { key: "variant.sort_change", label: "Variants reordered" },
  { key: "variant.delete", label: "Variant deleted" },
  // Categories (S10).
  { key: "category.create", label: "Category created" },
  { key: "category.update", label: "Category updated" },
  { key: "category.status_change", label: "Category shown or hidden" },
  { key: "category.delete", label: "Category deleted" },
  // Discounts and coupons (S12, S13).
  { key: "discount.create", label: "Discount created" },
  { key: "discount.update", label: "Discount updated" },
  { key: "discount.activate", label: "Discount activated" },
  { key: "discount.deactivate", label: "Discount deactivated" },
  { key: "discount.delete", label: "Discount deleted" },
  { key: "coupon.create", label: "Coupon created" },
  { key: "coupon.update", label: "Coupon updated" },
  { key: "coupon.activate", label: "Coupon activated" },
  { key: "coupon.deactivate", label: "Coupon deactivated" },
  { key: "coupon.delete", label: "Coupon deleted" },
  // Shipping zones and settings (S14).
  { key: "shipping_zone.create", label: "Shipping zone created" },
  { key: "shipping_zone.update", label: "Shipping zone updated" },
  { key: "shipping_zone.activate", label: "Shipping zone activated" },
  { key: "shipping_zone.deactivate", label: "Shipping zone deactivated" },
  { key: "shipping_zone.sort_change", label: "Shipping zones reordered" },
  { key: "shipping_zone.delete", label: "Shipping zone deleted" },
  { key: "settings.update", label: "Setting changed" },
  // System (S21).
  { key: "notify.failed", label: "Notification failed" },
];

const actionLabels = new Map(AUDIT_ACTIONS.map((action) => [action.key, action.label]));
const entityLabels = new Map(AUDIT_ENTITIES.map((entity) => [entity.key, entity.label]));

/** The human label for an action key; the raw key itself when it isn't registered. */
export const auditActionLabel = (key: string): string => actionLabels.get(key) ?? key;
export const auditEntityLabel = (key: string): string => entityLabels.get(key) ?? key;
