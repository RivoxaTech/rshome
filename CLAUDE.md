@AGENTS.md
# RS HOME Store: project rules for Claude Code

Read these first, in order: `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`.
The Lovable demo source (when available) is in `design-reference/`. It is a visual reference only and is never imported by the app.

## What this is
A reusable e-commerce base for small stores. First client: RS HOME (home decor, tableware). One Next.js app: storefront, admin panel, developer panel and API.
No payment gateway. Payments are COD or bank transfer with a screenshot that staff verify.

## Stack
Next.js (App Router) + TypeScript strict, Tailwind, MySQL (MariaDB-compatible) with Drizzle ORM + mysql2, Zod, sharp, bcrypt or argon2.
Deployed to cPanel shared hosting (Passenger) as a `standalone` build. Never rely on serverless features, on-server builds, or a persistent background process.

## Commands (keep this section accurate)
- `npm run dev` : local dev
- `npm run build && npm run start:standalone` : test the production build
- `npm run db:generate` / `npm run db:migrate` / `npm run db:seed`
- `npm run lint` / `npm run typecheck` / `npm test`

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
Storefront must match the demo exactly: fonts, colours, spacing, icons, logo text, hover and scroll behaviour, mobile layout. Extract tokens into Tailwind config first. Admin and developer panels are utilitarian and fast; they do not need the storefront styling.

## Workflow
- Plan before code for each slice. Build one vertical slice at a time in the order of REQUIREMENTS section 15.
- After each slice run typecheck, lint and tests, start the app, and verify the flow manually. Then commit with a clear message.
- Do not start M2 items until the M1 flow works end to end: browse, cart, checkout, order, screenshot upload, admin verify.
- If a decision changes the architecture or schema, update the docs in the same commit.
- Ask me when a requirement is ambiguous instead of guessing. Open questions are listed in REQUIREMENTS section 16.
