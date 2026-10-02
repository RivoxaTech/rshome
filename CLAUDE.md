@AGENTS.md
# RS HOME Store: project rules for Claude Code

Read these first, in order: `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/BUILD_PLAN.md` (slice order, status and the owner's answers).
The Lovable demo source (when available) is in `design-reference/`. It is a visual reference only and is never imported by the app.

## What this is
A reusable e-commerce base for small stores. First client: RS HOME (home decor, tableware). One Next.js app: storefront, admin panel, developer panel and API.
No payment gateway. Payments are COD or bank transfer with a screenshot that staff verify.

## Stack
Next.js (App Router) + TypeScript strict, Tailwind, MySQL (MariaDB-compatible) with Drizzle ORM + mysql2, Zod, sharp, `node:crypto` scrypt for passwords. Code runs on Node 20.9+.
Deployed to cPanel shared hosting (Passenger) as a `standalone` build. Never rely on serverless features, on-server builds, or a persistent background process.

## Commands (keep this section accurate)
- `npm run dev` : local dev
- `npm run build:standalone && npm run start:standalone` : test the production build
- `npm run db:generate` / `npm run db:migrate` / `npm run db:seed`
- `npm run db:reset:orders` / `npm run db:seed:orders` : dev-only demo orders for manual QA (`scripts/seed-demo-orders.ts`), refuses to run unless `DATABASE_URL` points at a database named `rs_home`. Reset deletes every order and what hangs off it, restores variant stock from `scripts/seed.ts`, clears rate limits and stored proof files. Seed places 3 bank-transfer and 3 COD orders through the real checkout service, all landing in Need review; `-- --many` adds 40 extra COD orders for pagination testing.
- `npm run db:reset:wholesale` / `npm run db:seed:wholesale` : dev-only demo wholesale inquiries for manual QA (`scripts/seed-demo-wholesale.ts`), same `rs_home`-only guard. Reset deletes every inquiry, its items and notes, its `audit_logs` rows and clears the wholesale rate limit bucket (never touches `push_subscriptions`). Seed places 7 inquiries through the real `createWholesaleInquiry` service (one with 12 item rows, for the detail-page layout check), then moves a couple on to Contacted/Closed and adds a staff note through the real panel actions; `-- --many` adds 40 extra inquiries for pagination testing.
- `npm run db:reset:dashboard` / `npm run db:seed:dashboard` : dev-only demo data for the admin dashboard's manual QA (`scripts/seed-demo-dashboard.ts`), same `rs_home`-only guard. Seed places ~120 orders through the real `createOrder` service (and ~15 wholesale inquiries through `createWholesaleInquiry`) over the last 60 days, then backdates `created_at` and advances each to a realistic status (completed, processing, delivery, a fresh need-review/pending-delivery queue, a few cancelled and rejected) with direct SQL; every row it creates is tagged with a `"Dashboard Demo — "` name prefix. Reset removes exactly those tagged rows (crediting back any stock they still held) and is scoped by that tag, so it coexists with `db:seed:orders`/`db:seed:wholesale` data and never needs `db:reset:orders`/`db:reset:wholesale` run alongside it — those two still do their own, unrelated, unscoped (everything) reset.
- `npm run db:reset:products` / `npm run db:seed:products` : dev-only demo products for the panel's products CRUD manual QA (`scripts/seed-demo-products.ts`), same `rs_home`-only guard. Seed places 6 products through the real `createProduct` service (a mix of draft/active/archived, spread across the sample categories, one featured); `-- --many` adds 40 more for pagination testing. Every row is tagged with a `"Demo Product — "` name prefix. Reset deletes exactly those tagged products (their variants, image rows and the image files on disk) and never touches the 8 untagged `scripts/seed.ts` sample products.
- `npm run db:migrate:test` : creates and migrates the integration-test database named by `TEST_DATABASE_URL` (must end in `_test`); `npm test` runs the integration tests (checkout, payment screenshots) against it, one file at a time, and skips them when the variable is unset. Tests write uploads to a temp folder, never `UPLOAD_DIR`. Never point it at the dev database.
- `npm run lint` / `npm run typecheck` / `npm test`
- On this Windows laptop, Smart App Control blocks Turbopack's native binary: use `npm run dev:webpack` for local dev. `build:standalone` already falls back to `next build --webpack` on win32 automatically.

## Code rules
1. Simple and readable beats clever. Small files. No dependency without a stated reason. No dead code or unused exports.
2. Layering: `app/` (routes, UI) calls `features/*/service.ts` (business rules) which calls `features/*/repo.ts` (DB) using `server/db`. Components never touch the DB. Routes stay thin.
3. Validate every input with Zod at the boundary (server actions and route handlers).
4. Authorization on the server, always: `await requirePermission("order.verify_payment")`. Never check role names. Hiding UI is not security.
5. All price, discount, coupon, shipping and currency maths lives in `features/pricing` only. The client displays what the server returns. Unit-test it.
6. Money: DECIMAL(12,2) in PKR base currency, handled through one `money` helper. Never use floats for totals.
7. Order creation is a single DB transaction (stock, coupon usage, order, items, status history).
8. Payment screenshots and uploads live in `UPLOAD_DIR` (outside the app folder). Payment proofs are served only through an authenticated route. Re-encode all images with sharp. Random filenames.
9. No client-specific text in components. Use `config/site.config.ts` and the `settings` table. Respect feature flags in `config/features.ts`.
10. Mutations that matter (prices, discounts, coupons, settings, order and payment status) write to `audit_logs` or `order_status_history`.
11. Keep memory use low (shared hosting): limit sharp concurrency, paginate every list, no heavy work at request time.

## UI rules
Storefront must match the demo exactly: fonts, colours, spacing, icons, logo text, hover and scroll behaviour, mobile layout. Extract tokens into Tailwind config first. The storefront itself is unchanged by the panel work below. Admin and developer panels share the storefront's colour palette (the same CSS variables) — not a separate utilitarian look — but use their own type and corners: Inter, 0.5rem radii, not the storefront's serif/display pairing or its near-zero radius, and their layouts stay dense and functional (tables, forms), not storefront-style pages.
Never render a `<form>` inside another `<form>`: it's invalid HTML and silently breaks which form a submit actually reaches. A dialog with its own Server Action (e.g. a delete confirmation) must render its `<form>` outside the page's own save/edit form, not as a child passed into it (see ARCHITECTURE.md D49).
In the panel never use a native `<select>`; use `components/panel/Listbox.tsx` (see ARCHITECTURE.md D52).

## Workflow
- Plan before code for each slice. Follow the sequence in `docs/BUILD_PLAN.md`.
- After each slice run typecheck, lint and tests, start the app, and verify the flow manually. Then commit with a clear message.
- If a decision changes the architecture or schema, update the docs in the same commit.
- Ask me when a requirement is ambiguous instead of guessing. Open questions are listed in REQUIREMENTS section 16.
- Admin and Developer permissions never overlap: Admin owns orders, wholesale, the dashboard and bank details; Developer owns the catalogue, pricing, other settings, users and the audit log. Every new feature must say in the docs which role owns it before it's built.
