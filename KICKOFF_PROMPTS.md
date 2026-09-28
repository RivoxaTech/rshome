# Prompts for Claude Code (use them in order, one per session or phase)

## Prompt 1: Plan review (plan mode, no code)
```
Read CLAUDE.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md and docs/DATABASE.md fully.
Do not write any code yet.

1. Review the proposed architecture and database schema against the requirements. List gaps, risks, and anything over-engineered. Keep changes minimal and justified. Pay special attention to: MySQL/MariaDB compatibility, cPanel shared-hosting limits (Passenger, standalone build, low memory), the pricing module and discount/coupon exclusivity, the order creation transaction, and secure payment screenshot handling.
2. Update docs/ARCHITECTURE.md and docs/DATABASE.md with your agreed changes and a short "Decisions" section.
3. Give me a build plan of small vertical slices following REQUIREMENTS section 15, each with a definition of done.
4. List every question you need answered from me before you start.
Then stop and wait for my approval.
```

## Prompt 2: Scaffold, database, auth (Day 1)
```
Implement slice 1 from the approved plan:
- Create the Next.js app (App Router, TypeScript strict, Tailwind, ESLint) in this folder, with output "standalone".
- Add Drizzle ORM with mysql2, the full schema from docs/DATABASE.md, the first migration, and scripts db:generate, db:migrate, db:seed.
- Seed permissions, the developer and admin roles, and one user per role from environment variables. Create .env.example.
- Implement email+password login, signed HTTP-only session cookie, logout, and requirePermission().
- Build an empty /panel layout whose sidebar is generated from the user's permissions.
- Add npm scripts from CLAUDE.md. Add a /api/health route.
Verify: typecheck, lint, migrate on my local MySQL, log in as both users, and confirm admin cannot open a developer-only page. Then commit.
```

## Prompt 3: Design system from the demo (Day 1-2)
```
Look in design-reference/ (the Lovable export of the demo store). Do not import from it.
Extract fonts, colour palette, spacing, radii, shadows, and animations into the Tailwind config and config/theme.ts.
Rebuild the home page in src/app/(store) exactly like the demo: announcement bar, header with "RS Home" logo text and nav, hero, collections, "The RS Home Edit" scroller, category sections, wholesale section, why-RS-Home, footer.
Use placeholder data from the database (categories and featured products), not hard-coded arrays.
Compare against the demo at 375, 768 and 1440 px and list any differences you cannot match.
```

## Prompt 4: Catalogue pages
```
Implement /shop, /category/[slug] and /product/[slug] using real DB data: category filter, sort, pagination, name search, product gallery, discount badge support, stock state, add to cart.
Design these pages in the same visual language and tokens as the home page. Keep components small and put queries in features/catalog.
```

## Prompt 5: Pricing, cart, checkout, orders (Day 3)
```
Implement features/pricing first with unit tests: effective price with best single discount, coupon validation, the rule that a coupon is rejected when any cart line has an active discount, shipping by zone mode (flat and free_over), COD availability per zone, money rounding, and display currency behind the multiCurrency flag.
Then build the cart (drawer + page), checkout, and createOrder as one DB transaction per docs/ARCHITECTURE.md 4.2, then the order confirmation page.
The client never sends prices. Verify by tests and by placing COD and bank-transfer orders locally.
```

## Prompt 6: Payment proof and admin orders (Day 4)
```
Implement payment screenshot upload (validation, sharp re-encode, random filename, UPLOAD_DIR, authenticated serving route) on the confirmation page.
Build the panel orders list (search, filters, "needs review" badge) and the order detail page: items, customer, totals, screenshot viewer, Approve payment, Reject payment (reason required), Accept order, Reject order (reason required), status updates, history, internal notes. Enforce permissions on every action and write history/audit rows. Restore stock on reject or cancel.
Add tests for the status machine.
```

## Prompt 7: Developer panel (Day 5)
```
Build panel CRUD for categories and products, including multi-image upload with reorder and primary image, stock, featured flag, draft/active status. Then bulk CSV import for products (validation report before saving). Permission-gate everything and write audit logs. Revalidate catalogue pages after changes.
```

## Prompt 8: Week 2 items
```
Implement, in this order, with tests: discounts CRUD, coupons CRUD, shipping zones and settings (bank accounts, exchange rate, banner text), dashboard revenue (definition in REQUIREMENTS 6.2), wholesale form and inbox, tracking page, static pages, SEO (metadata, sitemap, robots, JSON-LD), users and roles screens, quote-after-order flow if the client chose it.
```

## Prompt 9: Hardening and deploy prep
```
Do a security pass (authorization on every route and action, upload handling, rate limits, headers), a performance pass (indexes, caching, image sizes), and write scripts/deploy.sh and docs/DEPLOY.md for cPanel (standalone assembly, env vars, running migrations, UPLOAD_DIR outside the app folder, backups with mysqldump). Test the production build locally.
```
