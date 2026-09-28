# Database design (proposed, MySQL / MariaDB compatible)

Conventions
- Engine InnoDB, charset `utf8mb4`, collation `utf8mb4_unicode_ci`.
- Primary keys: `BIGINT UNSIGNED AUTO_INCREMENT` named `id`. Public identifier for orders is `order_number`.
- Every table has `created_at`; mutable tables also `updated_at`.
- Money: `DECIMAL(12,2)`, PKR base currency. Never floats.
- Never hard-delete rows referenced by orders (products, coupons). Use `status` / `is_active`.
- Keep to features common to MySQL 8 and MariaDB 10.5+. `JSON` columns are used only for small settings-type data.
- Foreign keys on all relations, with indexes.

## Access control
| Table | Columns |
|---|---|
| roles | id, `key` (unique, e.g. developer, admin), name, is_system (bool) |
| permissions | id, `key` (unique, e.g. `order.verify_payment`), description |
| role_permissions | role_id (FK), permission_id (FK), PK (role_id, permission_id) |
| users | id, name, email (unique), password_hash, role_id (FK), is_active, last_login_at |
| sessions (optional) | id (random token hash), user_id (FK), expires_at, ip, user_agent |

## Catalogue
| Table | Columns | Indexes |
|---|---|---|
| categories | id, parent_id (nullable FK), name, slug (unique), description, image_path, sort_order, is_active | slug, parent_id |
| products | id, category_id (FK), name, slug (unique), sku (unique), short_description, description (TEXT), price DECIMAL(12,2), stock INT, weight_grams INT NULL, is_featured, status ENUM('draft','active','archived') | slug, sku, (category_id, status), is_featured |
| product_images | id, product_id (FK), path, alt, sort_order, is_primary | product_id |

## Promotions
| Table | Columns |
|---|---|
| discounts | id, name, type ENUM('percent','fixed'), value DECIMAL(12,2), target_type ENUM('all','category','product'), starts_at, ends_at, is_active |
| discount_targets | discount_id (FK), target_id (category or product id), PK (discount_id, target_id) |
| coupons | id, code (unique, stored uppercase), type ENUM('percent','fixed'), value, min_order DECIMAL NULL, max_discount DECIMAL NULL, usage_limit INT NULL, per_customer_limit INT NULL, used_count INT, starts_at, ends_at, is_active |
| coupon_usages | id, coupon_id (FK), order_id (FK), customer_key (normalised phone or email), created_at. Index (coupon_id, customer_key) |

## Shipping
| Table | Columns |
|---|---|
| shipping_zones | id, name, countries (JSON list of ISO codes, or "PK-city" rules), mode ENUM('flat','free_over','quote_later','weight'), flat_rate DECIMAL, free_over DECIMAL NULL, cod_enabled, is_active, sort_order |
| shipping_rate_tiers | id, zone_id (FK), min_weight_g, max_weight_g, rate DECIMAL (used when mode = weight) |

## Orders
| Table | Columns | Indexes |
|---|---|---|
| orders | id, order_number (unique), customer_name, email, phone, address_line, city, state, postal_code, country, shipping_zone_id (FK NULL), payment_method ENUM('cod','bank_transfer'), order_status ENUM('pending','awaiting_shipping_quote','confirmed','processing','shipped','delivered','cancelled','rejected'), payment_status ENUM('unpaid','proof_submitted','verified','rejected','cod_pending','cod_collected'), rejection_reason TEXT NULL, subtotal, discount_total, coupon_id NULL, coupon_code NULL, shipping_total, total (PKR base), display_currency CHAR(3), exchange_rate DECIMAL(12,4), display_total DECIMAL, courier, tracking_note, internal_note, created_at, updated_at | order_number, order_status, payment_status, created_at, phone |
| order_items | id, order_id (FK), product_id (FK), name_snapshot, sku_snapshot, unit_price, discount_amount, quantity, line_total | order_id |
| payment_proofs | id, order_id (FK), file_path, status ENUM('submitted','verified','rejected'), rejection_reason NULL, reviewed_by (FK users NULL), reviewed_at NULL, created_at | order_id |
| order_status_history | id, order_id (FK), kind ENUM('order','payment'), from_status, to_status, reason NULL, changed_by (FK users NULL), created_at | order_id |

## Other
| Table | Columns |
|---|---|
| wholesale_inquiries | id, name, business, phone, email, message, status ENUM('new','contacted','closed'), created_at |
| settings | `key` (PK), value (JSON), updated_at. Keys: store info, bank_accounts, exchange_rate, announcement_text, social_links, currency defaults |
| audit_logs | id, user_id (FK NULL), action, entity, entity_id, before (JSON NULL), after (JSON NULL), created_at. Index (entity, entity_id) |
| static_pages (optional) | id, slug (unique), title, body, is_published |

## Seed data
- Permissions (see REQUIREMENTS section 3.2), roles `developer` (all permissions, is_system) and `admin` (default set).
- First developer user from env vars, and one admin user.
- Settings defaults, shipping zones (Karachi, Pakistan, International placeholder), sample categories (Tableware, Tea Sets, Trays, Decor).
- 50 launch products loaded from the client's spreadsheet through `scripts/import-products.ts`.

## Rules the schema must support
1. A payment can be rejected many times; every proof is kept.
2. An order can be rejected with a reason without deleting anything; stock is restored.
3. Discount and coupon exclusivity is enforced in `features/pricing`, tested, and recorded on the order (`coupon_id` set only when no discounted line existed).
4. Old orders never change when prices, rates or products change (snapshots).
