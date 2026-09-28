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
| 1–2 | **S3 Tokens + store shell** | Not started | Tokens from `design-reference` into `src/app/theme.css`, fonts via `next/font`, announcement bar, header, footer. **Done when:** matches the demo side by side at 375/768/1440 px, with a written list of any differences; no client text hard-coded in components. |
| 2 | **S4 Home page + media** | Not started | `/media` route, custom image loader, sharp pipeline (400/800/1200 WebP), all home sections fed by the DB. **Done when:** matches the demo at 3 widths; images lazy-load with width and height; a `../` request to `/media` returns 404. |
| 2 | **S5 Catalogue + pricing core** | Not started | `money.ts` and discount resolution (tests); `/shop`, `/category/[slug]`, `/product/[slug]` with filter, sort, pagination, search, gallery, discount badge, stock state and "Sold out". **Done when:** a seeded discount shows the badge and struck price; sort and pagination are correct; draft or archived products return 404. |
| 3 | **S6 Pricing complete + cart** | Not started | Coupons, exclusivity, shipping (flat, free-over, quote), COD per zone, currency conversion (flag off); localStorage cart, drawer and page, quote action. **Done when:** tests cover every rule in ARCHITECTURE §4.1, including "coupon removed when a discounted item is added"; the cart shows only server numbers; a tampered localStorage entry can't change a price. |
| 3 | **S7 Checkout + createOrder + confirmation** | Not started | Checkout (phone required, email optional, Karachi/other city picker), zone resolution, `checkout_token`, `expectedTotal`, the transaction per §4.2, order-access cookie, confirmation page with bank details. **Done when:** COD and bank orders are placed and stock decremented; double submit gives 1 order; concurrent last unit gives 1 success and 1 "out of stock"; a changed total is refused; another browser can't open the confirmation page; integration tests pass. |
| 4 | **S8 Payment proof upload + serving** | Not started | Upload route, validation, sharp re-encode, `UPLOAD_DIR/proofs`, authenticated serving, rate limits. **Done when:** a renamed `.exe`, a 6 MB file and a huge-pixel image are rejected; the output has no EXIF; the file is outside the app folder; the proof URL returns 401/403 when logged out; the order moves to `proof_submitted`. |
| 4 | **S9 Panel orders** | Not started | List (search, filters, needs-review badge, "unpaid > 3 days" filter) and detail (items, customer, totals, proof viewer, timeline, notes), all payment and order actions, set shipping quote (`order.set_shipping`), stock and coupon restore, history and audit. **Done when:** status-machine tests cover every allowed and forbidden transition; a bank order can't be confirmed before `verified`; rejecting a payment allows a re-upload; rejecting an order restores stock once and releases the coupon; every action is permission-checked on the server. |
| 5 | **S10 Categories + products CRUD** | Not started | CRUD, one image upload per request, reorder, primary = first, featured, status, audit. **Done when:** a product created in the panel shows on the storefront immediately; archiving hides it but its old orders still show; admin gets 403 on developer actions; audit rows are written. **Contingency:** not needed for the week-1 demo. If behind schedule, load demo products with `scripts/import-products.ts` and move S10 after the demo. |
| 6 | **S11 Content + prod build + demo link** | Not started | Load the first products via the import script; `scripts/build-standalone.mjs` (Linux-ready, `app/` subfolder layout); tunnel (`ALLOWED_ORIGINS`). **Done when:** the standalone build runs from the zip contents alone; a full walk-through over the tunnel works (browse → cart → checkout → upload → admin verify). |
| 7 | **Polish + client demo** | Not started | Mobile fixes. **Done when:** the M1 flow works end to end and a screen recording is made. |
| 8–9 | **S12 Discounts** · **S13 Coupons + usage** · **S14 Shipping zones + settings** | Not started | Each: panel CRUD + audit; the storefront reflects changes on the next request; pricing tests updated. The quote UI is built only if the client chooses quote-after-order. |
| 10–11 | **S15 Tracking** · **S16 Dashboard** · **S17 Wholesale** · **S18 CSV import** · **S19 Static pages + SEO** · **S20 Users, roles, audit viewer** · **S21 Email** | Not started | Each: its REQUIREMENTS acceptance points plus permission checks; revenue matches a hand-computed fixture. If short on time, cut S18 first, then S21, then the audit viewer. |
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
| C1 | REQUIREMENTS §16 defaults confirmed. Currency and delivery are undecided, so build PKR only and a flat rate per zone, behind flags. |
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

### Still open
- Local DB is MySQL 8.4.3 (Laragon); retest on the host's MariaDB at the staging smoke test.
- Hosting pre-sales answers (REQUIREMENTS §14).
- Client: currency and delivery charges (REQUIREMENTS §16).
