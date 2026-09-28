# RS HOME E-Commerce Platform
## Requirements Specification, v1.0 (28 September 2026)

## 1. Project Overview

**Client:** RS HOME (Karachi, Pakistan). A retail store selling home essentials: tableware, tea sets, trays, decor and art. Physical shop at DHA Phase 6, Karachi. Nationwide delivery, wholesale and bulk orders offered.

**Goal:** Build a complete e-commerce website (storefront, cart, checkout, order management) on a `.com` domain, selling to local (Pakistan) and international customers. The website must look exactly like the approved demo.

**Demo (visual source of truth):** https://elegant-home-3d.lovable.app/

**Catalogue size:** Launch with about 50 products, add roughly 150 more later (200+ total), each with about 3 images, organised in categories.

**Expected traffic:** 500 to 1,000 registered or ordering customers in the exceptional case. Low concurrency. Cheap shared cPanel hosting (PKWebHost) is the target.

**Hosting and domain:** purchased at the end, after the client approves the demo. Until then the project is developed and demonstrated from a local machine, so it must run and build locally and be deployable to cPanel later without rework.

**Delivery:** 2 weeks total. A working demo must be shown at the end of week 1 (this triggers the first 50% payment).

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
| Admin | RS HOME owner or staff | See revenue and orders, verify payment screenshots, accept or reject orders, update order status. |
| Developer | Agency (super role) | Everything Admin can do, plus catalogue, categories, discounts, coupons, shipping, settings, users and roles. |

### 3.1 Permission model (required design)

Access control is **permission-based (RBAC)**, not hard-coded per role name. Roles are rows in the database, permissions are rows in the database, and a role holds a set of permissions. Code checks permissions such as `order.verify_payment`, never `role === 'admin'`.

- Tables: `roles`, `permissions`, `role_permissions`, `users.role_id`.
- Every API route and server action calls one helper, for example `requirePermission('product.create')`. UI menu items are hidden using the same permission list.
- The Developer role always holds all permissions and cannot be edited or deleted by other roles.
- A new client that wants full control: create or edit a role and tick permissions. No code change.

### 3.2 Default permission matrix

| Permission key | Admin | Developer |
|---|---|---|
| dashboard.view (revenue, stats) | Yes | Yes |
| order.view / order.update_status | Yes | Yes |
| order.verify_payment (accept or reject screenshot) | Yes | Yes |
| order.export | Yes | Yes |
| wholesale.view | Yes | Yes |
| product.view | Read-only (optional) | Yes |
| product.create / update / delete / import | No | Yes |
| category.manage | No | Yes |
| discount.manage | No | Yes |
| coupon.manage | No | Yes |
| shipping.manage | No | Yes |
| settings.manage (bank details, banners, contact info) | No | Yes |
| user.manage / role.manage | No | Yes |
| audit.view | No | Yes |

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

Priority key: **M1** = required for the week-1 demo, **M2** = week 2, **P3** = after launch.

### 5.1 Pages and features

- **SF-01 (M1) Home page.** Rebuild exactly as the demo: top announcement bar ("Nationwide Delivery / Wholesale & Bulk Orders Available"), header with logo text "RS Home" and nav (Home, Shop, Tableware, Tea Sets, Trays, Decor, Wholesale), full-width hero ("Elevate Everyday Living", two buttons), Collections grid, "The RS Home Edit" horizontally scrolling featured products with Add to Cart, one story section per category, Wholesale and Bulk Orders section, Why RS Home (four points), footer with address and Instagram handle.
- **SF-02 (M1) Shop / category listing.** Product grid, category filter, sort (newest, price low to high, price high to low), pagination, basic name search. Category nav items open the matching category.
- **SF-03 (M1) Product detail page.** Image gallery (about 3 images, zoom or swipe), name, price, discounted price with original struck through and badge when a discount is active, description, stock status, quantity selector, Add to Cart.
- **SF-04 (M1) Cart.** Slide-out drawer plus full cart page. Change quantity, remove, coupon field, subtotal, discount, shipping estimate, total. Cart persists in the browser for guests.
- **SF-05 (M1) Checkout.** Contact details, shipping address, country selector (Pakistan or international), currency display (see 6.3), shipping cost by zone (see 6.4), payment method (COD or Bank Transfer), order summary, place order. See section 6.
- **SF-06 (M1) Order confirmation page.** Order number, summary. For bank transfer: show the account details and the screenshot upload control.
- **SF-07 (M2) Order tracking.** Look up by order number plus phone or email. Shows status timeline. Allows uploading a new screenshot if the previous one was rejected.
- **SF-08 (M2) Wholesale inquiry form.** Name, business, phone, email, message, items of interest. Saved in the database and visible to Admin.
- **SF-09 (M2) Static pages.** Contact, About, Shipping and Returns, Privacy, Terms. Content stored in the database or markdown files.
- **SF-10 (M2) SEO.** Per-page title and description, Open Graph tags, sitemap.xml, robots.txt, product structured data (JSON-LD), clean slugs.
- **SF-11 (M1) Responsive.** Mobile-first, checked at 375, 768 and 1440 px widths.
- **SF-12 (P3) Customer accounts, wishlist, reviews.** Not in the first release. Guest checkout is the default.

## 6. Checkout and Payments

There is **no payment gateway**. Two payment methods only.

| Method | Availability | Flow |
|---|---|---|
| Cash on Delivery (COD) | Pakistan by default. Enabled or disabled per shipping zone in settings. | Order is created as COD pending. Admin confirms and ships. When cash is received, Admin marks payment as collected. |
| Bank Transfer with screenshot | All zones. | Order is created as awaiting payment. Bank account details (from settings) are shown. Customer uploads a screenshot on the confirmation page or later from order tracking. Admin views the screenshot, then verifies (order accepted) or rejects with a reason (customer can re-upload). |

### 6.1 Payment screenshot rules

- **PAY-01** Accept JPG, PNG, WebP only. Maximum 5 MB. Validate the real file type on the server, not only the extension.
- **PAY-02** Re-encode with `sharp`, strip metadata, generate a random filename. Never use the original filename.
- **PAY-03** Store outside the public web folder. Serve only through an authenticated route that requires `order.verify_payment` or `order.view`. Screenshots must never be publicly reachable by URL.
- **PAY-04** Keep the history: each upload is a row (`payment_proofs`) linked to the order, with status (submitted, verified, rejected), reviewer and rejection reason.
- **PAY-05** Rate-limit uploads per IP and per order.

### 6.2 Order and payment statuses

Keep order status and payment status as two separate fields.

| Field | Values |
|---|---|
| order_status | pending, confirmed, processing, shipped, delivered, cancelled, rejected |
| payment_status | unpaid, proof_submitted, verified, rejected, cod_pending, cod_collected |

- A bank transfer order cannot move to `confirmed` until `payment_status = verified`. Admin can approve payment and accept the order as two steps or use one combined button (one transaction).
- **Rejecting** an order or a payment always requires a reason (`rejection_reason`). Rejecting a payment keeps the order open so the customer can upload a new screenshot. Rejecting the order closes it and restores stock.
- COD orders can be confirmed directly. Admin sets `cod_collected` after delivery.
- Every status change is written to `order_status_history` with user and time.
- **Stock:** decrement stock inside the order-creation transaction. Restore stock if the order is cancelled or rejected. Reject the order if stock is insufficient.
- **Order snapshot:** `order_items` stores product name, SKU, unit price and discount at the time of purchase. Later product edits never change past orders.
- **Revenue definition:** sum of `total` for non-cancelled orders where `payment_status` is `verified` or `cod_collected`. Show "pending revenue" (awaiting verification or COD not yet collected) separately.

### 6.3 Currency (decision pending, design ready)

The client has not decided yet. The system is built so either choice is a setting, not a rewrite.

- **Base currency is PKR.** Product prices are stored once, in PKR.
- **Option A (simplest):** every customer sees PKR. International customers pay the PKR amount.
- **Option B:** a header switcher (or first-visit popup) offers Pakistan (PKR) and International (USD). USD is calculated as `PKR price / exchange_rate`, where `exchange_rate` is a single value in store settings that the Developer updates when needed. Rounded display prices, for example to the nearest 1 USD or 0.5 USD.
- The customer's choice is remembered in a cookie. The **order stores** `currency`, `exchange_rate` used, the PKR totals and the display-currency totals, so old orders never change when the rate changes.
- Feature flag `multi_currency` (default off). All money output goes through one `formatMoney()` helper.
- International customers who pay by bank transfer need account details they can actually send to (for example IBAN or SWIFT, or a USD account). Settings supports separate payment instruction blocks per currency or zone.

### 6.4 Delivery charges (decision pending, design ready)

Delivery charges are not fixed yet and international shipping is hard to price for heavy or fragile items. The data model supports several modes per shipping zone; the first release ships the simplest and the rest are turned on from settings.

| Mode | How it works | Release |
|---|---|---|
| Flat rate | One fixed charge per zone (for example Karachi, rest of Pakistan, Middle East, UK and Europe, USA and Canada, rest of world). | First release |
| Free over amount | Charge becomes zero above a cart total threshold, per zone. | First release |
| Quote after order | Customer places the order, shipping shows as "to be confirmed". Admin checks the courier rate, adds the shipping charge, the customer sees the final total and then pays (screenshot). Order has status awaiting_shipping_quote. | Build the fields now, UI in week 2 |
| Weight-based | Each product has an optional `weight_grams`. Zone rate tiers by total weight. | Fields now, UI later |

Products get an optional `weight_grams` field from day one, so weight-based rates can be enabled later without migrating data.

## 7. Discounts and Coupons

### 7.1 Discounts (managed by Developer)

- **DIS-01** A discount targets one product, a set of products, one category, or the whole store.
- **DIS-02** Type: percentage or fixed amount. Has start date, end date and an active flag.
- **DIS-03** If more than one discount matches a product, the single best (lowest final price) wins. Discounts never stack.
- **DIS-04** The storefront shows the discounted price and the original price struck through. Prices are computed server-side by the shared pricing module.

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
- **AD-02 (M1) Orders list.** Search by order number, name, phone. Filter by order status, payment status, payment method, date range. Badge for "proof submitted, needs review".
- **AD-03 (M1) Order detail page.** Opened from the orders list. Shows items, customer, address, totals, payment method, the **payment screenshot(s) in a large viewer**, status history and internal notes. Payment actions: **Approve payment** or **Reject payment (reason required)**. Order actions: **Accept order** or **Reject order (reason required)**, then Mark processing, Mark shipped (courier and tracking note), Mark delivered, Mark COD collected, Cancel. Rejection reasons are stored and shown to the customer on the tracking page.
- **AD-04 (M2) Dashboard.** Revenue (today, 7 days, 30 days, all time), pending revenue, orders by status, count of payments awaiting review, recent orders, simple revenue chart.
- **AD-05 (M2) Wholesale inquiries.** List and detail, mark as contacted.
- **AD-06 (P3) Export orders** to CSV. **Printable order slip** for packing.
- By default Admin has no access to product, category, discount, coupon or settings editing. These appear only if the permission is granted to the role.

## 9. Developer Panel (Agency)

Same application, extra menu items controlled by permissions. Utilitarian UI is acceptable: clean and fast, it does not need to match the storefront styling.

- **DV-01 (M1) Categories.** Create, edit, reorder, activate or deactivate. Name, slug, description, image (used on the home Collections cards), optional parent category.
- **DV-02 (M1) Products.** Create, edit, archive. Name, slug, SKU, short and long description, price, stock, category, active or draft, featured flag (shows in "The RS Home Edit"), multiple images with drag-to-reorder and primary image. Images are resized to WebP on upload.
- **DV-03 (M2) Bulk import.** Upload a CSV or Excel file to create or update products (150 more products after launch). Image handling by URL or by matching filenames from a zip. Shows a validation report before saving. This saves days of manual entry.
- **DV-04 (M2) Discounts.** CRUD per section 7.1.
- **DV-05 (M2) Coupons.** CRUD per section 7.2, with usage counter.
- **DV-06 (M2) Shipping.** Zones (Pakistan cities or regions, and international countries or regions), mode per zone (section 6.4), flat rate, free-shipping threshold, COD on or off per zone, and setting the shipping charge on an order awaiting a quote.
- **DV-07 (M2) Store settings.** Store name, logo text, contact details, bank account details shown at checkout (more than one account, per currency or zone), announcement bar text, social links, currency and exchange rate.
- **DV-08 (M2) Users and roles.** Create Admin users, edit roles and their permissions.
- **DV-09 (M2) Audit log.** Who changed what and when, for products, prices, discounts, coupons, settings and order status.

## 10. Data Entities (for the database design step)

Money is stored as DECIMAL(12,2) in PKR. The full column-level schema is produced in `docs/DATABASE.md`.

| Entity | Key fields and notes |
|---|---|
| users | id, name, email (unique), password_hash, role_id, is_active, last_login_at |
| roles / permissions / role_permissions | Data-driven RBAC. Permission keys such as `product.create`. |
| categories | id, name, slug (unique), description, image, parent_id, sort_order, is_active |
| products | id, name, slug (unique), sku (unique), description, price (PKR), stock, weight_grams (nullable), category_id, is_featured, status, created_at. Indexes on slug, category_id, status. |
| product_images | id, product_id, path, alt, sort_order, is_primary |
| discounts | id, name, type, value, target_type (product, category, all), target ids, starts_at, ends_at, is_active |
| coupons / coupon_usages | Fields per section 7.2. Usage rows link coupon, order and customer contact. |
| shipping_zones / shipping_rate_tiers | Zone: id, name, countries (JSON), mode (flat, free_over, quote_later, weight), flat_rate, free_over, cod_enabled, is_active. Tiers: zone_id, min_weight, max_weight, rate. |
| orders | id, order_number (unique, human-friendly), customer name, email, phone, address fields, country, payment_method, order_status, payment_status, rejection_reason, subtotal, discount_total, coupon_code, shipping_total, total (PKR base), display_currency, exchange_rate, display_total, notes, created_at. Indexes on order_number, status, created_at. |
| order_items | id, order_id, product_id, name snapshot, sku snapshot, unit_price, discount_amount, quantity, line_total |
| payment_proofs | id, order_id, file_path, status, rejection_reason, reviewed_by, reviewed_at, created_at |
| order_status_history | id, order_id, from_status, to_status, changed_by, note, created_at |
| wholesale_inquiries | id, name, business, phone, email, message, status, created_at |
| settings | key, value (JSON). Bank accounts, contact info, banner text, currency. |
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
- Catalogue pages cached or revalidated on product change. Pagination on all lists.
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
- Keep all design tokens (colours, fonts, radii, spacing) in one place so a future client can be re-themed quickly.
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
- **Demo before purchase:** show the client the local app through a temporary public tunnel (for example Cloudflare Tunnel) and a screen recording as backup. Do not use serverless hosts for this demo, because uploaded files do not persist there.
- Provide a `deploy` checklist or script: build, assemble, zip, upload, restart, smoke test.

## 15. Milestones

| When | Focus | Result |
|---|---|---|
| Before day 1 | Get Lovable source into GitHub (partner task). Ask hosting pre-sales the section 14 questions. Collect product data for the first 50 products. Confirm open questions (section 16) when the client is reachable. | Unblocked start |
| Day 1 | Scaffold project, MySQL schema and migrations, seed, auth and RBAC, design tokens from demo. | App runs, login works |
| Day 2 | Home page pixel port, category listing, product detail (real data from DB). | Storefront browsing |
| Day 3 | Cart, checkout, pricing module, order creation transaction. | Orders can be placed (COD and bank) |
| Day 4 | Screenshot upload, secure file serving, Admin orders list and detail, verify and reject flow. | Full order to verification flow |
| Day 5 | Developer panel: categories and products CRUD with image upload. | Catalogue manageable |
| Day 6 | Load the first 50 products, production build test locally, public demo link via tunnel, walk-through test. | Demo ready |
| Day 7 | Polish, mobile fixes, bug fixes. **Demo to client. First payment milestone.** | Week 1 demo |
| Days 8-9 | Discounts, coupons and the exclusivity rule, shipping zones, settings. | Pricing complete |
| Days 10-11 | Dashboard and revenue, wholesale form, bulk import, static pages, SEO. | Feature complete |
| Days 12-13 | Load real products, testing, security pass, performance pass, backups. | Release candidate |
| Day 14 | Final deploy on the .com domain, SSL, handover notes. | Launch |

## 16. Open Questions to Confirm with the Client

- **Currency:** PKR only, or PKR plus USD for international customers with a fixed exchange rate she sets? (Default: PKR only, `multi_currency` flag off. See 6.3.)
- **Delivery charges:** Pakistan flat rate or by city? International: flat rate per region, or quote after order? Free shipping above an amount? Which courier? Is COD limited to Pakistan? (Default: flat rate per zone plus COD in Pakistan only. See 6.4.)
- **Coupon and discount rule:** cart-level block or item-level? (Default: cart-level, section 7.3.)
- **Accounts:** guest checkout only, or must customers register? (Default: guest checkout with order tracking.)
- **Variants:** do products have options such as colour, size or set count? (Default: no variants in the first release.)
- **Bank details:** one account or several (bank, Easypaisa, JazzCash)? Which account can international customers pay into?
- **Notifications:** email to the owner and customer on new order? WhatsApp link? (Default: email via SMTP, WhatsApp click-to-chat button.)
- **Wholesale:** inquiry form only, or separate wholesale prices? (Default: inquiry form only.)
- **Tax and invoices:** any tax line or printed invoice needed?
- **Content:** who supplies product data, photos, descriptions, About and policy text, and in what format? A spreadsheet plus an image folder is ideal.
- **Domain and email:** who owns the .com domain, and is a business email needed?

## 17. Out of Scope (First Release)

- Online payment gateways or card payments.
- Mobile apps, multi-vendor marketplace, multiple languages.
- Customer reviews, wishlist, loyalty points, abandoned cart emails.
- Automatic courier integrations and live shipping rate calculation.
- Client-side self-service catalogue editing (she requests changes from the agency).

## 18. Engineering Guidelines (source for CLAUDE.md)

- Read `docs/ARCHITECTURE.md` and `docs/DATABASE.md` first. They are the proposed starting point. Improve them where needed, but record every change and the reason in the docs before coding.
- Prefer simple, readable code. No new dependency without a stated reason. No dead code.
- TypeScript strict mode. Zod validation at every boundary. Business rules only in `features/*/service` files, not in components or routes.
- All money and pricing logic in one pricing module with unit tests (discounts, coupons, exclusivity, shipping, rounding).
- Every mutation is permission-checked on the server and recorded in the audit log where relevant.
- Work in small vertical slices. After each slice: run lint, type-check, tests, and start the app to verify. Commit with clear messages.
- Follow the milestone order in section 15. Do not start Phase M2 items until the M1 demo path works end to end.
