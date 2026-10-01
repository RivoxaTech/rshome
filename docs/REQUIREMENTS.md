# RS HOME E-Commerce Platform
## Requirements Specification, v1.0 (28 September 2026)

## 1. Project Overview

**Client:** RS HOME (Karachi, Pakistan). A retail store selling home essentials: tableware, tea sets, trays, decor and art. Physical shop at DHA Phase 6, Karachi. Nationwide delivery, wholesale and bulk orders offered.

**Goal:** Build a complete e-commerce website (storefront, cart, checkout, order management) on a `.com` domain, selling to local (Pakistan) and international customers. The website must look exactly like the approved demo.

**Demo (visual source of truth):** https://elegant-home-3d.lovable.app/

**Catalogue size:** Launch with about 50 products, add roughly 150 more later (200+ total), each with about 3 images, organised in categories.

**Expected traffic:** 500 to 1,000 registered or ordering customers in the exceptional case. Low concurrency. Cheap shared cPanel hosting (PKWebHost) is the target.

**Hosting and domain:** purchased at the end, near launch (section 14). Until then the project is developed and tested from a local machine, so it must run and build locally and be deployable to cPanel later without rework.

**Delivery:** owner decision (1 October 2026, BUILD_PLAN.md C22): no separate client demo — the full project is built in the sequence in section 15 and goes straight to launch. (This replaces the original 2-week, demo-then-payment-milestone schedule this line described; the payment schedule itself is a business term outside this document's scope — flagged for the owner to confirm separately.)

**Business model of the build:** The client does not manage catalogue content herself. The agency (Developer role) manages products, categories, discounts, coupons and settings on request. The client (Admin role) manages orders and sees revenue.

## 2. Goals and Principles

- **Reusable core.** This project is the base for future clients. Roles and permissions must be data-driven so a future client can be given full access by changing a role, not code.
- **Simple, clean code.** Small modules, clear folder structure, no clever abstractions, no unused dependencies. A junior developer should be able to follow it.
- **Fast.** Server-rendered pages, optimised images, indexed queries, low memory use (shared hosting).
- **Pixel-faithful UI.** The storefront matches the demo exactly: logo text, fonts, colours, spacing, icons, animations.
- **Cheap to run.** Single Next.js application plus MySQL. No paid third-party services required.
- **One source of truth for pricing.** All price, discount, coupon and shipping maths runs on the server in one module. The browser only displays results.

## 3. Users, Roles and Permissions

| Role | Who | Purpose |
|---|---|---|
| Customer | Public visitor | Browse, add to cart, checkout, upload payment proof, track order. |
| Admin | RS HOME owner or staff | See revenue and orders, verify payment screenshots, accept or reject orders, update order status, edit bank/contact/WhatsApp details. |
| Developer | Agency | Catalogue, categories, discounts, coupons, shipping, other settings, users and roles. |

**Owner decision (1 October 2026, BUILD_PLAN.md C24), reversing the "Developer always holds all permissions" design below and 3.2's original `product.view` row (BUILD_PLAN.md C6):** the two roles' permission sets are disjoint. The Developer is no longer a superset of the Admin — it manages the store's catalogue and configuration and cannot see orders, payment screenshots, wholesale inquiries or customer data; the Admin runs the day-to-day store and cannot see products, categories, discounts, coupons, shipping zones, other settings, users, roles or the audit log. This is privacy by default between the two roles, not protection against a malicious developer who controls the server.

### 3.1 Permission model (required design)

Access control is **permission-based (RBAC)**, not hard-coded per role name. Roles are rows in the database, permissions are rows in the database, and a role holds a set of permissions. Code checks permissions such as `order.verify_payment`, never `role === 'admin'`.

- Tables: `roles`, `permissions`, `role_permissions`, `users.role_id`.
- Every API route and server action calls one helper, for example `requirePermission('product.create')`. UI menu items are hidden using the same permission list.
- Both system roles (`developer`, `admin`) hold a fixed default permission set (3.2) that the seed actively syncs — granting what's missing and **revoking what's no longer listed** — so a later change to either set takes effect without a manual fix-up. Neither can be edited or deleted by other roles. A user can only grant permissions they hold, so neither role can grant itself something outside its own set from the panel.
- After login, a user lands on the first page their permissions allow (dashboard → orders → wholesale → products → settings → users → audit), never a hard-coded `/panel`; the 403 page links to that same page.
- A new client that wants full control: create or edit a role and tick permissions. No code change.

### 3.2 Default permission matrix

| Permission key | Admin | Developer |
|---|---|---|
| dashboard.view (revenue, stats) | Yes | No |
| order.view / order.update_status | Yes | No |
| order.verify_payment (accept or reject screenshot) | Yes | No |
| order.set_shipping (enter the delivery charge and note) | Yes | No |
| order.export | Yes | No |
| wholesale.view | Yes | No |
| wholesale.manage (change inquiry status, add internal notes) | Yes | No |
| settings.bank (bank accounts, contact phone/address, WhatsApp number only) | Yes | No |
| product.view / create / update / delete / import | No | Yes |
| category.manage | No | Yes |
| discount.manage | No | Yes |
| coupon.manage | No | Yes |
| shipping.manage | No | Yes |
| settings.manage (every other settings key: social links, announcement text, notification recipients) | No | Yes |
| user.manage / role.manage | No | Yes |
| audit.view | No | Yes |

Any signed-in user, Admin or Developer, can change their own password from `/panel/account` — this needs a session, not a permission key (section 8).

## 4. Recommended Technology

Final choices are confirmed in the architecture step, but the constraints below are fixed by the hosting decision.

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router), TypeScript, single app for storefront, admin, developer panel and API | One deployable unit. No CORS. Lowest hosting cost. |
| Database | MySQL (cPanel usually provides MariaDB, so use only features common to MySQL 8 and MariaDB 10.5+) | Relational data: orders, items, users, coupons. Use the same engine locally and in production. |
| Data access | Drizzle ORM with the `mysql2` driver (no native engine binary, light on shared hosting) | Typed queries and tracked migrations. Keep all DB access inside `server/db` and feature repositories. |
| Styling | Tailwind CSS with design tokens extracted from the demo | Matches the demo stack and keeps CSS small. |
| Validation | Zod on every input | Single schema for form and server. |
| Auth | Email + password, bcrypt or argon2, HTTP-only signed session cookie | No external service. Simple. |
| Images | `sharp` for resize and WebP conversion on upload | Fast pages, small disk use. |
| Storage | Local disk folder outside the app folder (`UPLOAD_DIR`) | Survives redeploys. No paid storage. |
| Email (optional) | Nodemailer via cPanel SMTP | Order notifications, no paid service. |

## 5. Storefront Requirements (Customer Side)

Priority key (historical labels, kept so existing SF-xx/AD-xx/DV-xx references stay stable): **M1** = earliest-built, core flow, **M2** = built before launch in the sequence in section 15, **P3** = after launch. Owner decision (1 October 2026, BUILD_PLAN.md C23): there is no week-1/week-2 split any more — every M1 and M2 item ships before launch; only P3 items (and the two post-launch add-ons in section 16) are deferred.

### 5.1 Pages and features

- **SF-01 (M1) Home page.** Rebuild exactly as the demo: top announcement bar ("Nationwide Delivery / Wholesale & Bulk Orders Available"), header with logo text "RS Home" and nav (Home, Shop, Tableware, Tea Sets, Trays, Decor, Wholesale), full-width hero ("Elevate Everyday Living", two buttons), Collections grid, "The RS Home Edit" horizontally scrolling featured products with Add to Cart, one story section per category, Wholesale and Bulk Orders section, Why RS Home (four points), footer with address and Instagram handle.
- **SF-02 (M1) Shop / category listing.** Product grid, category filter, sort (newest, price low to high, price high to low), pagination, basic name search. Category nav items open the matching category.
- **SF-03 (M1) Product detail page.** Image gallery (about 3 images, zoom or swipe), name, variant picker when a product has more than one variant (for example Colour, Size), price for the selected variant, discounted price with original struck through and badge when a discount is active, description, stock status for the selected variant, quantity selector, Add to Cart.
- **SF-04 (M1) Cart.** Slide-out drawer plus full cart page. Lines are keyed by variant id (a product with variants can appear as more than one line). Change quantity, remove, coupon field, subtotal, discount, shipping estimate ("to be confirmed" per §6.4), total. Cart persists in the browser for guests.
- **SF-05 (M1) Checkout.** Contact details, shipping address, country selector (Pakistan or international), currency display (see 6.3), shipping cost by zone (see 6.4), payment method (COD or Bank Transfer), order summary, place order. For bank transfer: the bank details, the amount to transfer now (the products total), a required payment screenshot upload (camera-roll friendly, with preview, progress and friendly errors), and a note that the delivery charge is paid separately once confirmed on WhatsApp; Place order stays disabled until the screenshot has uploaded. See section 6.
- **SF-06 (M1) Order confirmation / tracking page.** The same page (`/order/[orderNumber]`) as SF-07. Order number, summary, a friendly status timeline (for bank transfer: Payment under review — from checkout on, alongside Waiting for delivery charge — then Delivery charge payment; then Confirmed, Being prepared, Shipped with courier and tracking note, Delivered, or Cancelled/Rejected with the reason — a rejected screenshot rejects the whole order, owner decision S9, so there is no separate "awaiting payment, upload again" state), the current total including the delivery charge once staff set it, where each bank-transfer payment stands (products, delivery charge), and, once staff set the delivery charge, "Pay the delivery charge of PKR X" with the bank details, copy icons and the second screenshot upload, and a WhatsApp button (customer to shop, prefilled with the order number). Reads live from the database, so admin changes appear on the next load.
- **SF-07 (M1) Order tracking.** `/track` looks up an order by order number **plus the phone number used at checkout** (rate-limited). On success it sets the signed order-access cookie and redirects to SF-06. No email-based lookup (phone is required at checkout; email is optional and may be absent).
- **SF-08 (M2) Wholesale inquiry form.** Fields: name, business name (optional — individuals and event inquiries may have none), business type (retail, restaurant/cafe, hotel, event, other), phone/WhatsApp, email (optional), city, items (repeatable rows: item + quantity, an item may or may not match a catalogue product), needed-by date (optional), message. Anti-spam: rate limit plus a hidden honeypot field. Saved in the database and visible to Admin and Developer (`wholesale.view`); status changes need `wholesale.manage`.
- **SF-09 (M2) Static pages.** Contact, About, Shipping and Returns, Privacy, Terms. Content stored in the database or markdown files.
- **SF-10 (M2) SEO.** Per-page title and description, Open Graph tags, sitemap.xml, robots.txt, product structured data (JSON-LD), clean slugs.
- **SF-11 (M1) Responsive.** Mobile-first, checked at 375, 768 and 1440 px widths.
- **SF-12 (P3) Customer accounts, wishlist, reviews.** Not in the first release. Guest checkout is the default.

## 6. Checkout and Payments

There is **no payment gateway**. Two payment methods only.

| Method | Availability | Flow |
|---|---|---|
| Cash on Delivery (COD) | Pakistan by default. Enabled or disabled per shipping zone in settings. | Order is created as COD pending. Admin confirms and ships. When cash is received, Admin marks payment as collected. |
| Bank Transfer with screenshot | All zones. | **Owner decision (29 September 2026, S8):** the customer transfers the **products total** (goods after discount and coupon) to the account shown at checkout and uploads the screenshot there; the order cannot be placed without it, and is created with the payment under review. The delivery charge is still quoted after the order (§6.4); once staff set it, the order page asks for a second transfer and screenshot for the delivery charge amount (option A, the default; the client may later choose cash on delivery for the delivery charge instead — one flag, `deliveryChargeByTransfer` in `config/features.ts`). Admin views each screenshot, then verifies it or rejects it with a reason — rejecting a screenshot rejects the whole order (owner decision, S9), so there is no re-upload. |

### 6.1 Payment screenshot rules

- **PAY-01** Accept JPG, PNG, WebP only. Maximum 5 MB. Validate the real file type on the server, not only the extension.
- **PAY-02** Re-encode with `sharp`, strip metadata, generate a random filename. Never use the original filename.
- **PAY-03** Store outside the public web folder. Serve only through an authenticated route that requires `order.verify_payment` or `order.view`. Screenshots must never be publicly reachable by URL.
- **PAY-04** Keep the history: each upload is a row (`payment_proofs`) linked to the order, with status (submitted, verified, rejected), reviewer and rejection reason.
- **PAY-05** Rate-limit uploads per IP and per order.
- **PAY-06** The goods screenshot is required at checkout (owner decision, S8). The delivery-charge screenshot upload is refused while the order is `awaiting_shipping_quote` (no confirmed charge to pay yet), in the page and on the server. At most 5 screenshots per order. Each screenshot records what it paid for (goods or delivery charge), so staff can tell them apart. Staff can filter the orders list for bank-transfer orders that are still unpaid.

### 6.2 Order and payment statuses

Keep order status and payment status as two separate fields.

| Field | Values |
|---|---|
| order_status | pending, confirmed, processing, shipped, delivered, cancelled, rejected |
| payment_status | unpaid, proof_submitted, verified, rejected, cod_pending, cod_collected |

- A bank transfer order cannot move to `confirmed` until `payment_status = verified`. Admin can approve payment and accept the order as two steps or use one combined button (one transaction).
- **Rejecting** an order or a payment always requires a reason (`rejection_reason`), shown to the customer. **Owner decision (S9):** rejecting a payment screenshot rejects the whole order in the same transaction — there is no "keep it open, upload again" state. Either way, the order closes and stock is restored (see ARCHITECTURE.md D37).
- COD orders can be confirmed directly. Admin sets `cod_collected` after delivery.
- Every status change is written to `order_status_history` with user and time.
- **Stock:** decrement stock inside the order-creation transaction. Restore stock if the order is cancelled or rejected. Reject the order if stock is insufficient.
- **Order snapshot:** `order_items` stores product name, SKU, unit price and discount at the time of purchase. Later product edits never change past orders.
- **Revenue definition:** sum of `total` for non-cancelled orders where `payment_status` is `verified` or `cod_collected`. Show "pending revenue" (awaiting verification or COD not yet collected) separately.

### 6.3 Currency (client decision: PKR only)

- **PKR everywhere.** Product prices are stored once, in PKR, and every customer (local or international) sees and pays the PKR amount. There is no USD display, no currency switcher and no exchange-rate UI.
- Feature flag `multi_currency` stays off. All money output goes through one `formatMoney()` helper. The order schema keeps `display_currency`, `exchange_rate` and `display_total` columns (always PKR / 1.0000 / equal to `total` while the flag is off) so a future client can turn on a second display currency without a schema rewrite — this is reuse infrastructure, not active week-1 scope.
- International customers who pay by bank transfer need account details they can actually send to (for example IBAN or SWIFT). Settings supports separate payment instruction blocks per zone.

### 6.4 Delivery charges (client decision: quote on WhatsApp)

The client handles delivery on WhatsApp: the charge depends on the parcel, and international goes by FedEx cartons. All three shipping zones (Karachi, Pakistan, International) run in **quote** mode with `flat_rate = 0` for the first release.

| Mode | How it works | Release |
|---|---|---|
| Quote after order | Customer places the order; checkout shows "Delivery charge: to be confirmed, we will contact you on WhatsApp" and the order starts as `awaiting_shipping_quote`. Staff enter the delivery charge plus a short note (for example "2 cartons, FedEx") on the admin order detail page (`order.set_shipping`). The total updates and the order moves to `pending`, so the customer can pay the delivery charge (a bank-transfer customer paid the products at checkout, §6). A WhatsApp button (shop to customer, prefilled with the order number and total) sits next to the quote form; a WhatsApp button (customer to shop, prefilled with the order number) sits on the customer's order page. This is week 1 scope (S7/S9), not deferred. | First release |
| Flat rate | One fixed charge per zone. The data model already supports this mode; it can be turned on from settings later if the client moves away from per-parcel quoting. | Fields ready; not used at launch |
| Free over amount | Charge becomes zero above a cart total threshold, per zone. Only meaningful once a zone is in `flat` mode. | Fields ready; not used at launch |
| Weight-based | Each product (and each variant) has an optional `weight_grams`. Zone rate tiers by total weight. | Fields now, UI later |

Products and variants get an optional `weight_grams` field from day one, so weight-based rates can be enabled later without migrating data.

**COD is Pakistan-only, enforced on the server.** The Karachi and Pakistan zones have `cod_enabled = true`; the International zone keeps `cod_enabled = false`. `createOrder` additionally refuses a COD order whenever `country != 'PK'`, even if the request is edited to claim a Pakistani zone — this is a hard rule, not just per-zone configuration.

Customers cannot cancel their own orders; the WhatsApp button on the order/tracking page covers that instead.

## 7. Discounts and Coupons

### 7.1 Discounts (managed by Developer)

- **DIS-01** A discount targets one product, a set of products, one category, or the whole store.
- **DIS-02** Type: percentage or fixed amount. Has start date, end date and an active flag.
- **DIS-03** If more than one discount matches a product, the single best (lowest final price) wins. Discounts never stack.
- **DIS-04** The storefront shows the discounted price and the original price struck through. Prices are computed server-side by the shared pricing module.
- **DIS-05** Discounts target a product (or category, or the whole store), never a single variant. A discount applies to every variant of a matched product, against that variant's own base price (`price_override` if set, else the product price).

### 7.2 Coupons (managed by Developer)

- **CPN-01** Fields: code (case-insensitive, unique), type (percentage or fixed), value, minimum order amount, optional maximum discount cap, total usage limit, per-customer limit (by phone or email), start date, end date, active flag.
- **CPN-02** Coupon validity is re-checked on the server at checkout and again at order creation. Usage is counted in `coupon_usages` inside the order transaction.

### 7.3 Mutual exclusivity rule (client requirement)

**A discount and a coupon can never apply together.** Recommended cart-level rule:

- If the cart contains any product that currently has an active discount, a coupon cannot be applied. The coupon field shows a clear message: "Coupons cannot be combined with discounted items."
- If a coupon is already applied and the customer adds a discounted item, the coupon is removed and the customer is told why.
- Alternative (item-level): the coupon applies only to non-discounted items in the cart. Confirm with the client which she prefers. Default in the build is the cart-level rule above.
- This rule lives in the pricing module and is covered by automated tests.

## 8. Admin Panel (Client: RS HOME)

- **AD-01 (M1) Login.** Email and password. Session expiry. Login rate-limited.
- **AD-02 (M1) Orders list.** Owner decision C20/D36: one page per payment method (Orders – Bank transfer, Orders – COD), each with status tabs over `order_status`/`payment_status` (Need review, Pending delivery charge — bank only, Processing, Delivery, Completed, Cancelled, Rejected). Need review sorts oldest first (a work queue); every other tab newest first (D38). One count and an alert dot (a screenshot waiting to be checked) per tab. Search by order number, name or phone, 300 ms after the last keystroke, in the URL. A table (S.N, order, date, customer, status, total, trash) — or a card per order on phones — whose row opens the order detail page except the coloured status pill and the trash icon: the trash opens the Cancel/Reject chooser while the order is open, permanently deletes it once Cancelled or Rejected, and doesn't show once it's out for delivery or completed (D38). Pagination: a rows-per-page choice (25/50/75/100, default 25) beside the search box, "Showing X–Y of Z", numbered pages with an ellipsis, keeping the tab, search and page size in the URL; a tab, search, page-size or page change shows a table-shaped skeleton in place, never a blank page (S9).
- **AD-03 (M1) Order detail page.** Opened from the orders list, back link to the exact tab/search/page it came from; the panel header shows a breadcrumb ("Orders – Bank transfer / RSH-…"), and the page has the title once, in one row with the back arrow, the status and payment pills and the placed date. Shows items (with variant label and SKU), the customer (a full-width labelled WhatsApp button, contact, shipping address, customer note — first on phones), address, totals, payment method, **every payment screenshot** (purpose, status, upload date, reviewer; a small thumbnail that opens a large viewer dialog on click; a rejected one shows its reason), delivery (charge, note, courier, tracking, read only — only the rows that have a value; before approval, one line saying the charge is set on approval), status history and an internal note. A highlighted card surfaces whichever screenshot still needs review, or, for a bank order in Need review with its products screenshot, that screenshot next to a quick reject link, or, while the order simply waits on the customer, a plain message and a WhatsApp button. One primary button drives the order's current stage (Approve order — which sets the delivery charge, `order.set_shipping`, and approves the products screenshot in one step — Check screenshot, Move to Delivery, or Mark completed), each opening its own dialog; a ⋮ menu (a proper three-dot icon) offers Cancel order / Reject order until the order is out for delivery; neither the primary button nor the ⋮ menu shows on a closed or completed order. **Owner decision (S9):** rejecting an order or a payment screenshot always requires a reason and always rejects the whole order (no "keep it open, upload again" state); the customer sees the reason on the tracking page and can never upload another screenshot for that order. Rejecting a screenshot needs `order.verify_payment` and `order.update_status`; approving needs only the first.
- **AD-04 (M2) Dashboard**, owner decision (BUILD_PLAN.md C28), route `/panel`, `dashboard.view`. A period selector (Today, 7 days, 30 days, This month, All time; default 30 days; kept in the URL; Asia/Karachi day boundaries). Four stat cards — Revenue (with a pending-revenue line), Total orders, Average order value, Total wholesale leads — each with an up/down badge against the same-length previous period (except All time). A revenue-plus-order-count chart over the period (daily up to 31 days, else weekly or monthly) drawn as plain inline SVG with an accessible fallback, no charting library. Most selling products: top 5 by units sold in the period. Recent orders: the latest 8 across both payment methods, linking out. A "Needs your action" strip (orders to review, delivery-charge screenshots to check). Not included: a weekly top-customers list or an orders-by-status breakdown — the action strip replaces both. Figures: revenue, total orders and average order value per §6.2; wholesale leads = inquiries received in the period; most selling counts `order_items` units from orders not cancelled or rejected; every figure is an indexed SQL aggregate and tests check it against a hand-computed fixture.
- **AD-05 (M2) Wholesale inquiries.** List and detail (name, business, business type, contact, city, requested items, needed-by date, message), status new/contacted/closed (`wholesale.manage`), a WhatsApp button, and an internal note field. A new inquiry sends the owner a web-push notification (event type only, no inquiry contact details in the payload) and, if `notify_owner_wholesale_emails` has recipients, an email.
- **AD-06 (M2) Export orders** to CSV, and **export wholesale inquiries** to CSV (moved into scope for launch, no longer deferred past it). **Printable order slip** for packing.
- **AD-07 (M1, any signed-in user) Change password.** `/panel/account`, needs only a session (no permission key): current password, a new one of at least 8 characters that differs from it, rate-limited. Success ends every other session for that user and writes an audit log row.
- By default Admin has no access to product, category, discount, coupon, shipping-zone or other-settings editing, users, roles or the audit log — only to orders, wholesale inquiries, the dashboard and the bank/contact/WhatsApp fields (`settings.bank`). These appear only if the permission is granted to the role.

## 9. Developer Panel (Agency)

Same application, extra menu items controlled by permissions. The panel uses the **same theme tokens as the storefront** (colours, fonts, radii, spacing) — not a separate utilitarian look — but its layouts stay dense and functional (tables, forms), tuned for speed rather than for browsing.

- **DV-01 (M1) Categories.** Create, edit, reorder, activate or deactivate. Name, slug, description, image (used on the home Collections cards), optional parent category.
- **DV-02 (M1) Products.** Create, edit, archive. Name, slug, short and long description, price, category, active or draft, featured flag (shows in "The RS Home Edit"), multiple images with drag-to-reorder and primary image. Each product has one or more **variants** (colour, size, or a single "Default" variant for a simple product): SKU, label, attributes, optional price override, stock, optional weight override, sort order, active flag. Stock and SKU live on the variant, never on the product. Images are resized to WebP on upload.
- **DV-03 (M2) Bulk import and export.** Upload a CSV file to create or update products (150 more products after launch); a validation report shows before saving; images by URL or by matching filenames from a zip (scope confirmed in the S18 session). Also covers **product CSV export** and **order CSV export** (AD-06) and a **printable order slip** — all CSV import/export work for both products and orders is DV-03/S18. No separate import script: content goes in through this feature and through DV-02's own product form (owner decision H, BUILD_PLAN.md C29).
- **DV-04 (M2) Discounts.** CRUD per section 7.1.
- **DV-05 (M2) Coupons.** CRUD per section 7.2, with usage counter.
- **DV-06 (M2) Shipping.** Zones (Pakistan cities or regions, and international countries or regions), mode per zone (section 6.4; all zones start as `quote`), flat rate, free-shipping threshold, COD on or off per zone (the server still refuses COD outside Pakistan regardless of this setting). Setting the shipping charge on an order awaiting a quote is on the order detail page (AD-03), not here.
- **DV-07 (M2) Store settings, split by permission (owner decision, BUILD_PLAN.md C24).** `settings.bank` (Admin): bank account details shown at checkout, contact phone/address, WhatsApp number. `settings.manage` (Developer, everything else): store name, logo text, social links (Facebook, Instagram), announcement bar text, notification recipient lists (owner order-email list, wholesale-inquiry email list). No currency or exchange-rate setting (PKR only, section 6.3).
- **DV-08 (M2) Users and roles.** Create Admin users, edit roles and their permissions.
- **DV-09 (M2) Audit log.** Who changed what and when, for products, prices, discounts, coupons, settings and order status.

## 10. Data Entities (for the database design step)

Money is stored as DECIMAL(12,2) in PKR. The full column-level schema is produced in `docs/DATABASE.md`.

| Entity | Key fields and notes |
|---|---|
| users | id, name, email (unique), password_hash, role_id, is_active, last_login_at |
| roles / permissions / role_permissions | Data-driven RBAC. Permission keys such as `product.create`. |
| categories | id, name, slug (unique), description, image, parent_id, sort_order, is_active |
| products | id, name, slug (unique), description, price (PKR), weight_grams (nullable, default/fallback), category_id, is_featured, status, created_at. Indexes on slug, category_id, status. No sku, no stock — see product_variants. |
| product_variants | id, product_id, sku (unique), label (e.g. "Red / Large"), attributes (JSON, e.g. {"Colour":"Red","Size":"Large"}), price_override (nullable), stock, weight_grams (nullable override), sort_order, is_active. Every product has at least one variant; a simple product gets one "Default" variant. |
| product_images | id, product_id, path, alt, sort_order, is_primary |
| discounts | id, name, type, value, target_type (product, category, all), target ids, starts_at, ends_at, is_active. Never targets a single variant. |
| coupons / coupon_usages | Fields per section 7.2. Usage rows link coupon, order and customer contact. |
| shipping_zones / shipping_rate_tiers | Zone: id, name, countries (JSON), mode (flat, quote, weight — all zones start as `quote`), flat_rate (0 while quoting), free_over, cod_enabled, is_active. Tiers: zone_id, min_weight, max_weight, rate (not used yet). |
| orders | id, order_number (unique, human-friendly), customer name, email, phone, address fields, country, payment_method, order_status (includes awaiting_shipping_quote), payment_status, rejection_reason, subtotal, discount_total, coupon_code, shipping_total, shipping_note, total (PKR base), display_currency, exchange_rate, display_total, notes, created_at. Indexes on order_number, status, created_at. |
| order_items | id, order_id, product_id, variant_id, name snapshot, variant label snapshot, sku snapshot (the variant's sku), unit_price, discount_amount, quantity, line_total |
| payment_proofs | id, order_id, purpose (goods or delivery charge), file_path, status, rejection_reason, reviewed_by, reviewed_at, created_at |
| order_status_history | id, order_id, from_status, to_status, changed_by, note, created_at |
| wholesale_inquiries | id, name, business (nullable), business_type, phone, email, city, needed_by_date, message, status, created_at |
| wholesale_inquiry_items | id, inquiry_id, product_id (nullable — set only when the item matches a catalogue product), item_name, quantity |
| settings | key, value (JSON). Bank accounts, contact info, social links, banner text. |
| audit_logs | id, user_id, action, entity, entity_id, before, after, created_at |

## 11. Non-Functional Requirements

### 11.1 Security

- Passwords hashed with bcrypt or argon2. HTTP-only, Secure, SameSite session cookie. Origin check on state-changing requests.
- Authorization check on the server for every admin and developer route. Hiding a button is never the only protection.
- Validate all input with Zod. Use parameterised queries through the ORM only.
- Rate-limit login, order creation, coupon check, wholesale form and uploads.
- No secrets in the repository. Use environment variables. Provide `.env.example`.
- Security headers (CSP where practical, X-Content-Type-Options, frame protection). HTTPS only.
- Order creation is one database transaction (stock, coupon usage, order, items, history).

### 11.2 Performance

- Server Components by default. Client components only where interaction is needed.
- Catalogue pages are rendered per request (see ARCHITECTURE.md D7). Pagination on all lists.
- Images stored in a few sizes as WebP, lazy-loaded, with explicit width and height (no layout shift).
- Limit `sharp` concurrency and avoid heavy work at request time. Shared hosting has small memory limits.
- Target: fast first load on mobile, Lighthouse performance 85+ on home and product pages.

### 11.3 Reliability and operations

- Daily database backup (cPanel cron with `mysqldump`) and a periodic copy of the uploads folder.
- Seed script for roles, permissions, the first Developer user and sample data. Migrations tracked in git.
- Basic error logging to a file. Friendly error pages. A `/api/health` endpoint.

## 12. UI Fidelity Requirements

- The storefront must match the demo exactly: logo text, typography, colour palette, spacing, icons, image treatment, hover and scroll behaviour, mobile layout.
- **Reference workflow:** the demo is built with Lovable, so export or sync its source to GitHub and place a copy in `/design-reference` inside the repo. Extract fonts, colours, spacing and components from it into Tailwind tokens and port the components to Next.js. Do not redesign from screenshots.
- The demo only shows the home page. Product page, cart drawer, checkout, confirmation, tracking, and wholesale form must be designed **in the same visual language** using the same tokens and components. Show these to the client for approval early in week 1.
- Keep all design tokens (colours, fonts, radii, spacing) in one place so a future client can be re-themed quickly. The admin and developer panels (section 9) use the same tokens, so re-theming covers the whole app, not just the storefront.
- Verify visually at 375, 768 and 1440 px against the demo before each milestone.

## 13. Reusability Requirements

- A single `site.config` (or DB settings) holds store name, logo text, currency, contact info, theme tokens and feature flags. No client-specific text hard-coded inside components.
- Feature flags: coupons, discounts, wholesale form, COD, bank transfer, guest checkout.
- Permissions and roles as described in section 3, so a new client can get any access level without code changes.
- Feature-based folder structure (for example `features/products`, `features/orders`, `features/pricing`) so modules can be reused or removed.
- A `docs/NEW_CLIENT.md` explaining how to clone the project, seed it, retheme it and deploy it.

## 14. Deployment (cPanel, PKWebHost)

**Hosting is bought last.** Before paying, ask the host's pre-sales chat (free) to confirm: Setup Node.js App (Passenger) is included, which Node versions are offered (Next.js 16 needs **20.9+**), MySQL/MariaDB version, disk space (10 GB+ recommended for images), and whether SSH or terminal access exists. Also ask: OS/CloudLinux version and glibc ≥ 2.26 (needed by sharp), LVE memory, process and entry-process limits, `max_user_connections`, Remote MySQL access, upload body limit (ModSecurity / `LimitRequestBody` ≥ 6 MB), and whether cron jobs are allowed. Until purchase, run and test the production build locally with `next build` and the standalone server so deployment surprises are minimised.

- Next.js `output: 'standalone'`. Build on a local machine or in CI, never on the shared server.
- Copy `public/` and `.next/static` into the standalone folder. Zip, upload, extract, point the Node app startup file at `server.js`.
- Set environment variables in the cPanel Node app screen (database URL, session secret, `UPLOAD_DIR`, SMTP).
- `UPLOAD_DIR` must live **outside** the application folder so redeploys never delete images or payment screenshots.
- **Right after purchase:** deploy immediately to a staging subdomain and run a smoke test (login, image upload, order placement, screenshot upload, restart) before pointing the .com domain.
- Provide a `deploy` checklist or script: build, assemble, zip, upload, restart, smoke test.

**Owner decision (1 October 2026, BUILD_PLAN.md C22):** there is no client demo before launch — we build the full project and go straight to it. The temporary public tunnel and screen recording that this section used to describe for a pre-purchase walkthrough are dropped entirely; the first time the app is shown publicly is the staging smoke test above, after hosting is bought.

## 15. Build sequence

**Owner decision (1 October 2026, BUILD_PLAN.md C22, C23, C27):** there is no week-1/week-2 split and no demo milestone — the whole project ships once, at launch, in the sequence below. Nothing is deferred past launch except the two post-launch add-ons named in section 16 (automatic WhatsApp Business Platform messages, Telegram alerts). The sequence is a dependency order, not a day count; `docs/BUILD_PLAN.md` carries the authoritative slice table, status and definitions of done.

1. Foundation, auth + RBAC, design tokens, home page and media, catalogue and pricing core, cart, checkout and order creation, payment proof upload, panel orders (S1–S9 — already built).
2. RBAC redesign, role-based landing pages, self-service change password (S9b).
3. Order alerts: web push, the live sidebar/tab count, customer emails (S21).
4. Wholesale form, inbox, owner alerts, CSV export (S17).
5. Admin dashboard (S16).
6. Developer catalogue: categories, products, variants, images (S10).
7. Product CSV import and export, order CSV export, printable order slip (S18).
8. Discounts and coupons (S12+S13).
9. Settings (bank details, contact, social links, announcement text, notification recipients) and the shipping zone editor (S14).
10. Static pages and SEO (S19).
11. Users, roles, audit viewer (S20).
12. Hardening: security pass, performance pass, backups, Linux build + CI (S22).
13. Launch: load the real catalogue, deploy on the .com domain, SSL, handover notes (S23).

## 16. Open Questions to Confirm with the Client

- ~~**Currency:** PKR only, or PKR plus USD?~~ **Answered:** PKR only, everywhere. See 6.3.
- ~~**Delivery charges:** flat rate or quote?~~ **Answered:** all zones quote on WhatsApp after the order is placed; COD limited to Pakistan, enforced on the server. See 6.4.
- **Coupon and discount rule:** cart-level block or item-level? (Default: cart-level, section 7.3.)
- **Accounts:** guest checkout only, or must customers register? (Default: guest checkout with order tracking.)
- ~~**Variants:** do products have options such as colour, size or set count?~~ **Answered:** yes, via `product_variants`. See section 9 (DV-02) and DATABASE.md.
- **Bank details:** one account or several (bank, Easypaisa, JazzCash)? Which account can international customers pay into? Needed before S23 (section 14).
- ~~**Notifications:** email to the owner and customer on new order? WhatsApp link?~~ **Answered (1 October 2026, BUILD_PLAN.md C26):** Web Push is the primary owner alert (new order, delivery-charge screenshot, new wholesale inquiry — no personal data in the payload); the live sidebar count and tab title poll a permission-checked endpoint; SMTP email is required in production, sends the customer their own order emails unconditionally, sends the owner a wholesale-inquiry email by default, and sends the owner a new-order email only if a recipient list is filled in (off by default, push is primary); wa.me click-to-chat buttons are unchanged. Automatic WhatsApp Business Platform messages and Telegram alerts remain the only two items deferred to after launch.
- ~~**Wholesale:** inquiry form only, or separate wholesale prices?~~ **Answered:** inquiry form only, with repeatable item rows. See SF-08.
- **Tax and invoices:** any tax line or printed invoice needed?
- **Content:** who supplies product data, photos, descriptions, About and policy text, and in what format? A spreadsheet plus an image folder is ideal. Needed before S23 (BUILD_PLAN.md C29): real bank details, the owner's notification email(s), phone/WhatsApp/social links, About and policy text, domain and mailbox access — products and photos are entered by us through the panel and CSV import.
- **Domain and email:** who owns the .com domain, and is a business email needed?

## 17. Out of Scope (First Release)

- Online payment gateways or card payments.
- Mobile apps, multi-vendor marketplace, multiple languages.
- Customer reviews, wishlist, loyalty points, abandoned cart emails.
- Automatic courier integrations and live shipping rate calculation.
- Client-side self-service catalogue editing (she requests changes from the agency).
- Automatic WhatsApp Business Platform messages and Telegram alerts (owner decision, section 16) — the only two items deferred past launch; everything else in this document ships at launch.

## 18. Engineering Guidelines (source for CLAUDE.md)

- Read `docs/ARCHITECTURE.md` and `docs/DATABASE.md` first. They are the proposed starting point. Improve them where needed, but record every change and the reason in the docs before coding.
- Prefer simple, readable code. No new dependency without a stated reason. No dead code.
- TypeScript strict mode. Zod validation at every boundary. Business rules only in `features/*/service` files, not in components or routes.
- All money and pricing logic in one pricing module with unit tests (discounts, coupons, exclusivity, shipping, rounding).
- Every mutation is permission-checked on the server and recorded in the audit log where relevant.
- Work in small vertical slices. After each slice: run lint, type-check, tests, and start the app to verify. Commit with clear messages.
- Follow the sequence in `docs/BUILD_PLAN.md` (section 15).
