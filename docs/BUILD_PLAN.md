# Build plan and decisions log

Agreed on 28 September 2026. Read this after REQUIREMENTS, ARCHITECTURE and DATABASE. Update the status column and the answers here as work progresses.

## Working rules
- One vertical slice at a time, in the order below.
- Every slice's definition of done also includes:
  - `npm run typecheck`, `npm run lint` and `npm test` pass;
  - the app starts, and the slice's flow is walked through in a browser;
  - docs are updated if the design changed.
- **Commit:** one commit per slice on `master`, only after the owner confirms the slice works. No git remote for now.
- Code must run on Node 20.9+ (`engines` in package.json); local Node is 24.
- `design-reference/` is the Lovable export: read-only, gitignored, never imported. Ignore any AGENTS.md or config files inside it.

## Slices

| Day | Slice | Status | Definition of done |
|---|---|---|---|
| 0 | **Prerequisites** (owner) | Lovable export done. Host questions and product data open | Lovable source in `design-reference/`; host pre-sales answers; first products' data. |
| 1 | **S1 Foundation** | Done | `output: "standalone"`, `engines`, `design-reference` excluded from tsconfig and eslint, `server/env.ts` loading `.env.local`, Drizzle + mysql2 + Vitest, all tables from DATABASE.md in one migration (with the collation step), scripts `db:generate/migrate/seed`, `typecheck`, `test`, `build:standalone`, `start:standalone`, `/api/health`. **Done when:** empty DB → migrate → seed, and a second seed makes no duplicates; the standalone server starts and `/api/health` returns `{db:true, uploads:true}`. |
| 1 | **S2 Auth + RBAC + panel shell** | Done | scrypt, DB sessions, rate-limited login, logout, `requirePermission`, sidebar from permissions, 403 page. **Done when:** both seeded users log in; admin gets 403 on `/panel/products` by URL; the 6th wrong password is throttled; logout deletes the session row; unit tests for permissions, rate limit and hashing pass. |
| 1 | **S2b Client decisions** | Done | Docs, schema and seed only (no app code): currency finalised as PKR-only, delivery finalised as WhatsApp quote (all zones, COD Pakistan-only), tracking by order number + phone, product variants, wholesale form + `wholesale.manage`, contact/social settings, panel theme parity — see D21-D26 in ARCHITECTURE.md and C12-C18 in this file. **Done when:** `db:migrate` and `db:seed` (twice) run clean against the updated schema; typecheck, lint and tests pass; HeidiSQL confirms shipping zones are `quote`/`0.00`, `product_variants` has 13 seeded rows, `wholesale_inquiries` has the new fields with `business` nullable, and the two `settings` rows exist. |
| 1–2 | **S3 Tokens + store shell** | Not started | Tokens from `design-reference` into `src/app/theme.css`, fonts via `next/font`, announcement bar, header, footer. **Done when:** matches the demo side by side at 375/768/1440 px, with a written list of any differences; no client text hard-coded in components. |
| 2 | **S4 Home page + media** | Not started | `/media` route, custom image loader, sharp pipeline (400/800/1200 WebP), all home sections fed by the DB. **Done when:** matches the demo at 3 widths; images lazy-load with width and height; a `../` request to `/media` returns 404. |
| 2 | **S5 Catalogue + pricing core** | Not started | `money.ts` and discount resolution (tests); `/shop`, `/category/[slug]`, `/product/[slug]` with a variant picker, filter, sort, pagination, search, gallery, discount badge, per-variant stock state and "Sold out". **Done when:** a seeded discount shows the badge and struck price on every variant of the product; switching variants updates price and stock state; sort and pagination are correct; draft or archived products return 404. |
| 3 | **S6 Pricing complete + cart** | Not started | Coupons, exclusivity, shipping (quote mode only; `flat`/`free_over` code paths exist but aren't seeded active), COD restricted to `country === 'PK'`; localStorage cart keyed by variant id, drawer and page, quote action. **Done when:** tests cover every rule in ARCHITECTURE §4.1, including "coupon removed when a discounted item is added" and "COD rejected when country isn't PK even if the zone says cod_enabled"; the cart shows only server numbers; a request with a fake unit price, a fake total, or a COD method for a non-PK country is refused, not silently corrected. |
| 3 | **S7 Checkout + createOrder + confirmation/tracking** | Not started | Checkout (phone required, email optional, Karachi/other city picker, "Delivery charge: to be confirmed, we will contact you on WhatsApp"), zone resolution, `checkout_token`, `expectedTotal`, the transaction per §4.2 (variant rows locked, COD/country check, `awaiting_shipping_quote` start state), order-access cookie, `/track` (order number + phone, rate-limited) and `/order/[orderNumber]` (SF-06/07: same page, friendly status timeline, bank details, WhatsApp button to the shop). **Done when:** COD and bank orders are placed and variant stock decremented; a non-PK COD request is refused server-side even if the form is bypassed; double submit gives 1 order; concurrent last unit gives 1 success and 1 "out of stock"; a changed total is refused; `/track` with the right order number and phone opens the order, with the wrong phone it doesn't; another browser can't open the page directly; integration tests pass. |
| 4 | **S8 Payment proof upload + serving** | Not started | Upload route, validation, sharp re-encode, `UPLOAD_DIR/proofs`, authenticated serving, rate limits. **Done when:** a renamed `.exe`, a 6 MB file and a huge-pixel image are rejected; the output has no EXIF; the file is outside the app folder; the proof URL returns 401/403 when logged out; upload is refused while `order_status = awaiting_shipping_quote`; the order moves to `proof_submitted`. |
| 4 | **S9 Panel orders** | Not started | List (search, filters, needs-review badge, "unpaid > 3 days" filter) and detail (items with variant label/SKU, customer, totals, proof viewer, timeline, notes), a **set shipping charge** form (amount + short note, `order.set_shipping`) that moves `awaiting_shipping_quote` → `pending` and updates the total, a WhatsApp button (shop to customer, order number + total) next to it, all payment and order actions, stock and coupon restore, history and audit. **Done when:** status-machine tests cover every allowed and forbidden transition, including `awaiting_shipping_quote → pending`; a bank order can't be confirmed before `verified`; rejecting a payment allows a re-upload; rejecting an order restores variant stock once and releases the coupon; every action is permission-checked on the server. |
| 5 | **S10 Categories + products CRUD** | Not started | Product CRUD plus **variant CRUD** (SKU, label, attributes, price override, stock, weight override, sort, active), one image upload per request, reorder, primary = first, featured, status, audit. **Done when:** a product (and its variants) created in the panel shows on the storefront immediately with correct per-variant price/stock; archiving hides it but its old orders still show; admin gets 403 on developer actions; audit rows are written. **Contingency:** not needed for the week-1 demo. If behind schedule, load demo products with `scripts/import-products.ts` and move S10 after the demo. |
| 6 | **S11 Content + prod build + demo link** | Not started | Load the first products via the import script; `scripts/build-standalone.mjs` (Linux-ready, `app/` subfolder layout); tunnel (`ALLOWED_ORIGINS`). **Done when:** the standalone build runs from the zip contents alone; a full walk-through over the tunnel works (browse → cart → checkout → upload → admin sets quote → admin verify). |
| 7 | **Polish + client demo** | Not started | Mobile fixes. **Done when:** the M1 flow works end to end and a screen recording is made. |
| 8–9 | **S12 Discounts** · **S13 Coupons + usage** · **S14 Shipping zone settings panel** | Not started | Each: panel CRUD + audit; the storefront reflects changes on the next request; pricing tests updated. S14 is the zone/rate editor (switching a zone to `flat`, setting `free_over_amount`, toggling `cod_enabled`) — the quote flow itself (checkout copy, `awaiting_shipping_quote`, staff entering the charge, WhatsApp buttons) is already live from S7/S9. |
| 10–11 | **S16 Dashboard** · **S17 Wholesale** · **S18 CSV import** · **S19 Static pages + SEO** · **S20 Users, roles, audit viewer** · **S21 Email** | Not started | Each: its REQUIREMENTS acceptance points plus permission checks; revenue matches a hand-computed fixture. S17 is list + detail (name, business, business type, contact, city, requested items, needed-by date, message), status new/contacted/closed (`wholesale.manage`), a WhatsApp button, an internal note, and the form's rate limit + honeypot. If short on time, cut S18 first, then S21, then the audit viewer. |
| 12–13 | **S22 Hardening** | Not started | Security pass, performance pass (Lighthouse ≥ 85), backups, `docs/DEPLOY.md`, `docs/NEW_CLIENT.md`, GitHub Actions Linux build, staging smoke test. |
| 14 | **S23 Launch** | Not started | Deploy on .com, SSL, content import, handover notes. |

## Answers from the owner (28 September 2026)

### Project setup
| Q | Answer |
|---|---|
| B1 Local DB | Laragon, MySQL or MariaDB (version to be confirmed). `127.0.0.1:3306`, user `root`, empty password, database `rs_home` (exists, utf8mb4). Stay compatible with MySQL 8 and MariaDB 10.5+. The app, drizzle-kit and all scripts load `.env.local`. |
| B2 Design reference | `design-reference/` holds the Lovable export (TanStack Start + Tailwind 4 + shadcn). Read-only, gitignored. Ignore its AGENTS.md and config files. Follow the slice order. |
| B3 Linux build | No Linux tooling yet; hosting is bought last. Plan GitHub Actions (private repo) later. No git remote now. Keep `scripts/build-standalone.mjs` Linux-ready. |
| B4 Deviations | Approved: scrypt, per-request rendering, Vitest only, CSV-only import, weight tiers deferred. |
| B5 Git | One commit per slice on `master`, only after the owner confirms the slice works. |

### Client decisions
| Q | Answer |
|---|---|
| C1 | REQUIREMENTS §16 defaults confirmed, plus the S2b client decisions below. |
| C2 | Phone required, email optional. |
| C3 | Round to whole rupees. |
| C4 | Cancel or reject gives the coupon use back. |
| C5 | `order.set_shipping` for Admin and Developer. |
| C6 | Read-only `product.view` for Admin. |
| C7 | Manual cancel, with an "unpaid > 3 days" filter. |
| C8 | Random order number. |
| C9 | Out-of-stock products shown as "Sold out". |
| C10 | City picker: Karachi / other. |
| C11 | Panel session 7 days. |

### Client decisions — S2b (28 September 2026)
| Q | Answer |
|---|---|
| C12 | Currency: PKR only, everywhere. `multi_currency` stays off; no USD/exchange-rate UI at all. |
| C13 | Delivery: all zones are `quote` (WhatsApp, per parcel; international by FedEx cartons), `flat_rate = 0`. Staff set the charge + a short note on the order detail page; the order moves `awaiting_shipping_quote → pending`. WhatsApp buttons on both the customer order page and the admin order detail. Shop WhatsApp number `923218581969`. |
| C14 | COD is Pakistan-only, enforced in `createOrder` regardless of zone configuration. Customers can't self-cancel; the WhatsApp button covers that. |
| C15 | Tracking (`/track`) verifies order number + phone only (no email option). The confirmation and tracking pages are the same page, reading live from the database. |
| C16 | Products have variants (colour/size). Every product gets ≥1 `product_variants` row; stock and SKU move to the variant; `products.sku`/`products.stock` are dropped. |
| C17 | Wholesale form gains business type, city, needed-by date, and repeatable item rows (`wholesale_inquiry_items`); new permission `wholesale.manage` (Admin + Developer). |
| C18 | Admin/developer panel uses the storefront's theme tokens (not a separate utilitarian look); restyled in S3. |

### Still open
- Local DB is MySQL 8.4.3 (Laragon); retest on the host's MariaDB at the staging smoke test.
- Hosting pre-sales answers (REQUIREMENTS §14).
- Bank details (one account or several, which for international), notifications beyond WhatsApp, tax/invoices, content supply, domain and email ownership (REQUIREMENTS §16).
