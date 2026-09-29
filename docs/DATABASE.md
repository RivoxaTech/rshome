# Database design (MySQL 8 / MariaDB 10.5+ compatible)

Reviewed and agreed on 28 September 2026. See the Decisions section at the end, and ARCHITECTURE.md §9.

## Conventions
- Engine InnoDB. Charset `utf8mb4`, collation **`utf8mb4_unicode_ci`**, set on the database by the first migration (`ALTER DATABASE`) and on the mysql2 connection. Never use `utf8mb4_0900_*` (MySQL 8 only).
- Primary keys: `BIGINT UNSIGNED AUTO_INCREMENT` named `id`. FK columns are `BIGINT UNSIGNED` too, so types match. The public identifier for orders is `order_number`.
- Times: `DATETIME` stored in **UTC**. Every table has `created_at`; mutable tables also `updated_at`. No `TIMESTAMP` columns.
- Money: `DECIMAL(12,2)`, PKR base currency. Never floats. Drizzle returns decimals as strings, and `features/pricing/money.ts` converts them to integer paisa.
- Strings that are indexed or unique are `VARCHAR(191)` or shorter.
- JSON-shaped data (settings values, audit snapshots) is stored as **`TEXT`** and parsed and validated with Zod in the repo. No `JSON` columns and no JSON SQL functions.
- Only features common to both engines: no `RETURNING`, no `SKIP LOCKED`, no CHECK constraints relied upon. `INSERT … ON DUPLICATE KEY UPDATE` and `SELECT … FOR UPDATE` are fine.
- Rows referenced by orders (products, coupons) are never hard-deleted. Use `status` / `is_active`.
- Foreign keys on all relations (default `RESTRICT`), with indexes.
- Avoid reserved words as column names where it's cheap (`old_values`, not `before`). `key` is kept; Drizzle always quotes identifiers.

## Access control
| Table | Columns |
|---|---|
| roles | id, `key` VARCHAR(50) unique (developer, admin), name, is_system BOOL, created_at, updated_at |
| permissions | id, `key` VARCHAR(100) unique (e.g. `order.verify_payment`), description |
| role_permissions | role_id (FK), permission_id (FK), PK (role_id, permission_id) |
| users | id, name, email VARCHAR(191) unique, password_hash (scrypt, encoded with salt and params), role_id (FK), is_active, last_login_at NULL, created_at, updated_at |
| sessions | id CHAR(64) PK (SHA-256 hex of the cookie token), user_id (FK), expires_at, last_seen_at, ip VARCHAR(45), user_agent VARCHAR(255), created_at. Index user_id, expires_at |
| rate_limits | bucket VARCHAR(191) PK (e.g. `login:ip:1.2.3.4`), count INT UNSIGNED, window_ends_at DATETIME. Updated with an atomic upsert; expired rows are reset on the next hit and swept on writes |

Permission keys (REQUIREMENTS §3.2, plus client decisions): `dashboard.view`, `order.view`, `order.update_status`, `order.verify_payment`, `order.set_shipping`, `order.export`, `wholesale.view`, `wholesale.manage`, `product.view`, `product.create`, `product.update`, `product.delete`, `product.import`, `category.manage`, `discount.manage`, `coupon.manage`, `shipping.manage`, `settings.manage`, `user.manage`, `role.manage`, `audit.view`.
Admin default set: `dashboard.view`, `order.view`, `order.update_status`, `order.verify_payment`, `order.set_shipping`, `order.export`, `wholesale.view`, `wholesale.manage`, `product.view`.

## Catalogue
| Table | Columns | Indexes |
|---|---|---|
| categories | id, parent_id (FK NULL), name, slug VARCHAR(191) unique, description TEXT NULL, image_path NULL, sort_order INT, is_active, created_at, updated_at | slug, parent_id, (is_active, sort_order) |
| products | id, category_id (FK), name, slug VARCHAR(191) unique, short_description VARCHAR(500) NULL, description TEXT NULL, price DECIMAL(12,2), weight_grams INT UNSIGNED NULL (fallback default), is_featured, status ENUM('draft','active','archived'), created_at, updated_at | slug, (category_id, status), (status, created_at), is_featured |
| product_variants | id, product_id (FK), sku VARCHAR(64) unique, label VARCHAR(150) (e.g. "Red / Large"), attributes TEXT (JSON, Zod-validated, e.g. {"Colour":"Red","Size":"Large"}), price_override DECIMAL(12,2) NULL, stock INT UNSIGNED, weight_grams INT UNSIGNED NULL (overrides the product's), sort_order INT, is_active, created_at, updated_at | sku, (product_id, sort_order) |
| product_images | id, product_id (FK), path (base name under `UPLOAD_DIR/media`, without the size suffix), width INT, height INT (original size), alt VARCHAR(255), sort_order INT, created_at. **Primary image = lowest sort_order** | (product_id, sort_order) |

Every product has at least one `product_variants` row; a simple product gets one "Default" variant with no `attributes`. SKU and stock live only on the variant — `products` has neither. Out-of-stock active variants are listed and shown as "Sold out" (client decision).

## Promotions
| Table | Columns |
|---|---|
| discounts | id, name, type ENUM('percent','fixed'), value DECIMAL(12,2), target_type ENUM('all','category','product'), starts_at NULL, ends_at NULL, is_active, created_at, updated_at |
| discount_targets | discount_id (FK), target_id (category or product id, depending on target_type; no FK), PK (discount_id, target_id) |
| coupons | id, code VARCHAR(50) unique (stored uppercase), type ENUM('percent','fixed'), value, min_order DECIMAL NULL, max_discount DECIMAL NULL, usage_limit INT NULL, per_customer_limit INT NULL, used_count INT UNSIGNED DEFAULT 0, starts_at NULL, ends_at NULL, is_active, created_at, updated_at |
| coupon_usages | id, coupon_id (FK), order_id (FK, unique), customer_key VARCHAR(32) (the normalised phone, e.g. `923218581969`, see `lib/phone.ts`), created_at. Index (coupon_id, customer_key). Deleted, and `used_count` decremented, when the order is cancelled or rejected |

## Shipping
| Table | Columns |
|---|---|
| shipping_zones | id, name, mode ENUM('flat','quote'), flat_rate DECIMAL(12,2), free_over_amount DECIMAL(12,2) NULL, cod_enabled, is_fallback BOOL (exactly one zone, e.g. "Rest of world"), is_active, sort_order, created_at, updated_at |
| shipping_zone_areas | id, zone_id (FK), country_code CHAR(2), city VARCHAR(100) NULL (lowercase; NULL = whole country). UNIQUE (country_code, city) |

Zone resolution: an exact (country, city) row, else (country, NULL), else the `is_fallback` zone. In Pakistan the checkout city picker offers "Karachi" or "Other city". **Client decision:** all three zones (Karachi, Pakistan, International) are seeded in `quote` mode with `flat_rate = 0.00` — the client quotes delivery on WhatsApp per parcel. `flat` mode stays in the schema for a future zone switch but isn't seeded active today. Weight-based tiers are deferred (a later migration can add the `weight` mode and a tiers table; `products.weight_grams` and `product_variants.weight_grams` already exist).

**COD is Pakistan-only, enforced twice:** the International zone's `cod_enabled` is `false`, and `createOrder` independently refuses a COD order whenever `orders.country != 'PK'`, regardless of the resolved zone's `cod_enabled` value.

## Orders
| Table | Columns | Indexes |
|---|---|---|
| orders | id, order_number VARCHAR(20) unique (`RSH-YYMMDD-XXXX`), checkout_token CHAR(36) unique, customer_name, phone VARCHAR(32) (normalised), email VARCHAR(191) NULL, address_line, city, state NULL, postal_code NULL, country CHAR(2), shipping_zone_id (FK NULL), payment_method ENUM('cod','bank_transfer'), order_status ENUM('pending','awaiting_shipping_quote','confirmed','processing','shipped','delivered','cancelled','rejected'), payment_status ENUM('unpaid','proof_submitted','verified','rejected','cod_pending','cod_collected'), rejection_reason TEXT NULL, subtotal, discount_total, coupon_id (FK NULL), coupon_code NULL, coupon_discount, shipping_total NULL (NULL while a quote is pending), shipping_note VARCHAR(255) NULL (staff's short courier/parcel note, set alongside shipping_total), total (PKR), display_currency CHAR(3), exchange_rate DECIMAL(12,4), display_total DECIMAL(12,2), customer_note TEXT NULL, courier NULL, tracking_note NULL, created_at, updated_at | order_number, checkout_token, (order_status, created_at), (payment_status, created_at), phone, created_at |
| order_items | id, order_id (FK), product_id (FK), variant_id (FK product_variants), name_snapshot, variant_label_snapshot (empty string for a simple product's "Default" variant, which the customer never saw), sku_snapshot (the variant's sku), unit_price (base), discount_amount (per unit), quantity, line_total | order_id |
| payment_proofs | id, order_id (FK), file_path (relative to `UPLOAD_DIR`), file_size INT, status ENUM('submitted','verified','rejected'), rejection_reason NULL, reviewed_by (FK users NULL), reviewed_at NULL, created_at | order_id |
| order_status_history | id, order_id (FK), kind ENUM('order','payment','note'), from_status NULL, to_status NULL, note TEXT NULL (reason or internal note), changed_by (FK users NULL; NULL = customer/system), created_at | (order_id, created_at) |

`awaiting_shipping_quote` is used by zones in `quote` mode (not listed in REQUIREMENTS §6.2, but required by §6.4).

## Other
| Table | Columns |
|---|---|
| wholesale_inquiries | id, name, business NULL, business_type ENUM('retail','restaurant_cafe','hotel','event','other'), phone, email NULL, city, needed_by_date DATE NULL, message TEXT, status ENUM('new','contacted','closed'), created_at, updated_at |
| wholesale_inquiry_items | id, inquiry_id (FK), product_id (FK NULL — set only when the row matches a catalogue product), item_name VARCHAR(200), quantity INT UNSIGNED | (inquiry_id) |
| settings | `key` VARCHAR(100) PK, value TEXT (JSON, validated per key with Zod), updated_at. Keys seeded today: `contact` (phone, WhatsApp number, address), `social_links` (Facebook, Instagram URL and handle), `bank_accounts` (array of bank name, account title, account number, IBAN, note; seeded with `[PLACEHOLDER]` values once, never overwritten). Reserved for later: announcement_text, home hero text |
| audit_logs | id, user_id (FK NULL), action VARCHAR(50), entity VARCHAR(50), entity_id VARCHAR(50), old_values TEXT NULL, new_values TEXT NULL, created_at. Index (entity, entity_id), created_at |
| static_pages | id, slug VARCHAR(191) unique, title, body TEXT (Markdown), is_published, created_at, updated_at |

## Seed data (idempotent; safe to run repeatedly)
- Upsert permissions from the code `PERMISSIONS` const. Roles `developer` (is_system, all permissions) and `admin` (the default set above).
- One developer and one admin user from `SEED_*` env vars (created if missing; existing passwords never overwritten).
- Settings: `contact` and `social_links` (client decision, section 8 of the S2b brief), upserted on every run; `bank_accounts` with `[PLACEHOLDER]` values (S7), created once and never overwritten so real details entered later survive a reseed.
- `orders.phone` and `coupon_usages.customer_key` hold the normalised phone (`lib/phone.ts`): a Pakistani mobile as `923XXXXXXXXX`, any other number as country code plus digits.
- Shipping zones, all in `quote` mode with `flat_rate = 0.00`: Karachi (PK + city `karachi`, COD on), Pakistan (PK, COD on), International (fallback, COD off).
- Sample categories (Tableware, Tea Sets, Trays, Decor) and 8 sample products for development, several with two or three `product_variants` (colour or size, some with `price_override`) and the rest with one "Default" variant.
- Placeholder product images: the 4 images in `design-reference/src/assets/` (`hero.jpg`, `tableware.jpg`, `teaset.jpg`, `tray.jpg`), processed through the S4 media pipeline. Each sample product gets a 3-image gallery: its category's image first (primary), then the next two placeholders.
- Sample discount (development only, S5): `[Sample] 10% off Trays`, percent 10.00, target category `trays`, active, no dates. Created once if missing and never overwritten, so editing it in the DB survives a reseed. Deactivate or delete it before launch.
- Sample coupon (development only, S6): code `WELCOME10`, percent 10.00, `min_order` 3000.00, active, no dates or limits. Same rule: created once, never overwritten, remove before launch. With the sample discount active, any tray in the cart blocks it (the exclusivity rule).
- Launch products are loaded from the client's spreadsheet (CSV) and image folder through `scripts/import-products.ts`.

## Rules the schema must support
1. A payment can be rejected many times; every proof is kept.
2. An order can be rejected with a reason without deleting anything; stock is restored and the coupon use released.
3. Discount and coupon exclusivity is enforced in `features/pricing`, tested, and recorded on the order (`coupon_id` is set only when no line was discounted).
4. Old orders never change when prices, rates or products change (snapshots).
5. A repeated checkout submit never creates a second order (`checkout_token`).

## Decisions (28 September 2026)
| # | Decision | Reason |
|---|---|---|
| DB1 | `utf8mb4_unicode_ci` forced by migration and checked by `migrate` | MySQL 8's default collation doesn't exist in MariaDB; cPanel DBs may default to latin1. |
| DB2 | `TEXT` + Zod instead of `JSON` columns | MariaDB stores JSON as LONGTEXT, so drivers return different types. |
| DB3 | `DATETIME` UTC instead of `TIMESTAMP` | No 2038 limit, no session-timezone conversion, no MariaDB auto-update quirk. |
| DB4 | `sessions` required; `rate_limits` table added | Revocable sessions; limits shared across Passenger processes. |
| DB5 | `shipping_zone_areas` table replaces the countries JSON; modes `flat`/`quote` + `free_over_amount`; tiers deferred | Portable matching; no unused branches. |
| DB6 | `product_images.is_primary` dropped; `width`/`height` added | One fact, one field; explicit image size avoids layout shift. |
| DB7 | Orders gain `checkout_token`, `coupon_discount`, `customer_note`; `shipping_total` NULL-able; `internal_note` removed (notes live in history, `kind='note'`) | Idempotency, reporting, quote flow, full note timeline. |
| DB8 | `audit_logs.old_values/new_values` | `BEFORE` is a reserved word in MySQL. |
| DB9 | `coupon_usages.order_id` unique; usage released on cancel/reject | Client decision; one usage per order. |
| DB10 | `wholesale_inquiries.items_of_interest`, `payment_proofs.file_size`, relative `file_path` | SF-08; paths survive moving `UPLOAD_DIR`. |
| DB11 | `product_variants` added; `products.sku` and `products.stock` dropped; `order_items` gains `variant_id` and `variant_label_snapshot` | Client decision: colour/size options. One SKU/stock system (the variant), not two. |
| DB12 | `wholesale_inquiries.items_of_interest` replaced by `wholesale_inquiry_items`; `business_type`, `city`, `needed_by_date` added | Client decision: structured wholesale form (S2b). |
| DB13 | `orders.shipping_note` added; all shipping zones seeded as `quote` with `flat_rate = 0.00`; new permission `wholesale.manage` | Client decisions: WhatsApp-quoted delivery is the default flow; Admin/Developer can action wholesale inquiries, not just view them. |
| DB14 | `wholesale_inquiries.business` made nullable | Client decision: individuals and event inquiries may have no business name. |
| DB15 (29 Sep) | Integration tests run against a second database, `rs_home_test` (`TEST_DATABASE_URL`, name must end in `_test`), created and migrated by `npm run db:migrate:test` | `createOrder` tests wipe and rebuild their fixtures; they must never touch the dev data. |
