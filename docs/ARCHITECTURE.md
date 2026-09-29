# Architecture

Reviewed and agreed on 28 September 2026. Record every later change here, with its reason, before coding it (see §9 Decisions).

Runtime: Next.js 16 (App Router, Turbopack build), React 19, TypeScript strict, Tailwind 4. Code must run on **Node 20.9+** (`engines` in package.json). Local development uses Node 24, and the host will likely offer 20 or 22, so avoid Node APIs newer than 20.9.

## 1. Shape
One Next.js app. No separate backend. The storefront and the panel share one codebase and one database:

```
Browser
  |-- Storefront   (public pages, cart, checkout, confirmation, tracking)
  |-- Panel        (/panel/*  admin + developer, menus built from permissions)
  v
Next.js server (Passenger on cPanel, standalone build, pages rendered per request)
  |-- Server Components  : read data for pages
  |-- Server Actions     : mutations (cart quote, checkout, order actions, CRUD)
  |-- Route Handlers     : /api/health
  |                        /media/[...path]                  public product/category images
  |                        /api/files/proof/[id]             payment proofs, permission required
  |                        /api/orders/[orderNumber]/proofs  customer proof upload
  |                        /api/panel/uploads                panel image upload
  v
features/*/service  ->  features/*/repo  ->  server/db (Drizzle + mysql2)  ->  MySQL / MariaDB
                    \->  server/storage (sharp)  ->  UPLOAD_DIR on disk (outside the app folder)
```

## 2. Layers and rules
| Layer | Location | Allowed to | Not allowed to |
|---|---|---|---|
| UI | `src/app`, `src/components` | call services, render | touch DB, contain business rules |
| Service | `src/features/*/service.ts` | business rules, permissions, transactions | render UI |
| Repo | `src/features/*/repo.ts` | DB queries via Drizzle | business rules |
| Pure logic | `src/features/pricing/pricing.ts`, `src/features/orders/status.ts` | calculations on plain data | touch DB or I/O (so unit tests need no DB) |
| Server infra | `src/server/*` | env, db client, session, storage, mail, rate limit | know about features |

## 3. Folder structure
```
rs-home/
  CLAUDE.md
  docs/                  REQUIREMENTS.md, ARCHITECTURE.md, DATABASE.md, BUILD_PLAN.md
  design-reference/      Lovable export (TanStack Start + Tailwind 4 + shadcn). Read-only, gitignored,
                         excluded from tsconfig, eslint and build. Its own AGENTS.md / configs are ignored.
  drizzle/               generated SQL migrations (tracked in git)
  public/                static assets (logo, pre-sized hero images)
  scripts/               migrate.ts, seed.ts, import-products.ts, build-standalone.mjs
  src/
    app/
      theme.css          design tokens (Tailwind 4 @theme), the only place for colours, fonts, radii, spacing
      (store)/           layout.tsx (announcement bar, header, footer), page.tsx (home)
        shop/  category/[slug]/  product/[slug]/  cart/  checkout/
        order/[orderNumber]/     confirmation + screenshot upload (needs the order-access cookie)
        track/  wholesale/  pages/[slug]/
      panel/
        login/  dashboard/  orders/  orders/[id]/
        products/  categories/  discounts/  coupons/  shipping/
        settings/  users/  roles/  wholesale/  audit/
      media/[...path]/route.ts                 public images from UPLOAD_DIR/media
      api/
        health/route.ts
        files/proof/[id]/route.ts             authenticated payment-proof streaming
        orders/[orderNumber]/proofs/route.ts  customer proof upload
        panel/uploads/route.ts                panel image upload
      sitemap.ts  robots.ts
    features/
      auth/        permissions.ts (typed PERMISSIONS const, the source of truth), service.ts
      users/  roles/
      catalog/     products, categories, images
      pricing/     pricing.ts (pure), money.ts, display.ts (formatted prices), service.ts (loads data), *.test.ts
      cart/        schemas.ts (the browser's ids/quantities/code), quote.ts (pure reconcile + format), service.ts, repo.ts;
                   the cart itself lives in the browser (components/store/cart, localStorage key `cart.v1`)
      checkout/    createOrder transaction, order-access cookie
      orders/      status.ts (pure status machine), service.ts, history
      payments/    proof upload and review
      discounts/  coupons/  shipping/  settings/  wholesale/  audit/  pages/
    server/
      env.ts       Zod-validated environment
      db/          client.ts, schema/*.ts (one file per feature)
      auth/        session.ts, password.ts (node:crypto scrypt), permissions.ts (requirePermission)
      storage/     images.ts (sharp), files.ts (UPLOAD_DIR paths)
      mail/        nodemailer wrapper (M2, optional)
      rate-limit.ts  (MySQL-backed)
      request.ts   client IP, origin check for Route Handlers
    components/    ui/ (primitives), store/ (storefront), panel/ (tables, forms)
    config/        site.config.ts (build-time defaults), features.ts (flags)
    lib/           small pure helpers, image-loader.ts (next/image custom loader)
  next.config.ts   output: "standalone"
  drizzle.config.ts
  .env.example     (the app, drizzle-kit and scripts all load .env.local)
```

## 4. Key flows

### 4.1 Price calculation (`features/pricing`)
- `pricing.ts` is pure. `calculateCart({ lines, discounts, couponCode, coupon, zone, country, flags, now })` prices every line through `priceVariant` and returns the lines (base and effective unit price, line total, line discount), `subtotal` (Σ base price × quantity, before any discount), `discountTotal`, the coupon result (`none`, `applied` with its amount, or `rejected` with a reason code and message), `couponDiscount`, `goodsTotal` (subtotal − discounts − coupon), shipping (`pending` or a priced amount), `total` (goods total plus shipping only when priced) and `codAvailable`. `service.ts` (`priceCart`) loads the discounts and the coupon row and calls it; `features/pricing/display.ts` formats amounts for the UI. The cart quote and `createOrder` both go through `priceCart`. The browser only ever sends **variant ids**, quantities and a coupon code — never a product id directly and never a price; the quote's Zod schema strips anything else, so a fake unit price or total in the request has no effect.
- **Cart quote (S6):** `features/cart/service.ts` validates the browser's cart, loads the variant rows (any status), **reconciles** them (`quote.ts`, pure: duplicate ids merged, unknown/inactive/sold-out variants dropped, quantities capped at stock, each change reported as a notice), prices through `priceCart` with no zone (shipping pending) and returns display strings plus what the browser should now store (the fixed lines, and the coupon code only while it applies). Coupon attempts are rate-limited per IP (10 per 15 minutes, MySQL bucket `coupon:ip:*`); a successful application resets the bucket, so a customer reloading with a valid code is never blocked while guessing is. The coupon field itself sits in the checkout order summary (S7, `components/store/cart/CouponForm.tsx`); the cart page and drawer only show an applied coupon as a totals row.
- **Money:** integer paisa inside the module. `money.ts` converts to and from DECIMAL strings and formats (`formatMoney()`). PKR amounts from percentages are **rounded to whole rupees**, half up.
- **Variant pricing:** a line's base unit price is `variant.price_override` when set, else the parent product's `price`. Stock, weight and the SKU/label snapshot all come from the variant; only the discount lookup goes through the parent product.
- **Discounts:** discounts target a product, a category or the whole store, never a single variant — a matched discount applies to every variant of that product, computed against that variant's own base price. The single discount giving the lowest unit price wins, chosen per variant (with a percent and a fixed discount both matching, a cheap variant can get the fixed one and a dear one the percent). Ties go to the lowest discount id. A percentage's amount is rounded to whole rupees, half up, before it is subtracted. The `discounts` flag in `config/features.ts` turns all discounts off. `pricing/service.ts` loads the switched-on discounts once per request (React `cache()`) and prices every variant on a page against one `now`. Discounts never stack. A fixed amount is per unit, clamped at 0. A `category` target matches the product's category or that category's parent. A discount is active when `is_active` is set and `starts_at <= now < ends_at` (null bounds are open).
- **Exclusivity (cart-level, confirmed):** a line is discounted when its effective price is below its base price. If any line is discounted, the coupon is rejected with `COUPON_BLOCKED_BY_DISCOUNT` ("Coupons cannot be combined with discounted items."). The cart then removes the stored code and shows the message.
- **Coupons:** the code is case-insensitive (trimmed, uppercased; stored uppercase). The coupon must be active and within its dates (`starts_at <= now < ends_at`). `min_order` is compared with the subtotal. A percentage is rounded to whole rupees and capped by `max_discount`. A fixed amount is clamped to the subtotal. Coupons never reduce shipping. The total usage limit (`used_count >= usage_limit`) is checked in `pricing.ts`; the per-customer limit needs the phone number, so it is enforced at checkout (S7) and again under lock in `createOrder`. Checks run in this order: exists, active, dates, usage limit, exclusivity, min order.
- **Shipping (client decision: quote only):** every zone (Karachi, Pakistan, International) runs in `quote` mode with `flat_rate = 0` for the first release, so the pricing result is always `pending` until staff set a charge — the cart and checkout total shown is the goods total, with "Delivery charge: to be confirmed, we will contact you on WhatsApp" (`siteConfig.deliveryPendingNote`). The cart quote passes no zone at all (the address isn't known yet), which is also `pending`. `flat` mode (optionally with `free_over_amount`, compared with the goods total after discounts and coupon) exists in the data model and is unit-tested in `pricing.ts` for a future zone switch, but nothing seeds or exercises it today. **COD** requires the `cod` flag on, the zone's `cod_enabled`, **and** `country === 'PK'` (`isCodAvailable`) — the country check is a hard rule enforced again in `createOrder`, independent of zone configuration, so an edited request can never buy COD outside Pakistan.
- **Currency:** PKR is always computed first and is also what's shown — `multiCurrency` is off and out of week-1 scope entirely (no switcher, no exchange-rate input anywhere in the UI). The columns exist so a future client can flip this on without a schema change.

### 4.2 Place order (`checkout/createOrder`)
1. Validate input with Zod. Check the rate limit (IP). Phone is required, email optional.
2. If an order with this `checkout_token` exists, return it (idempotent re-submit).
3. Resolve the shipping zone from country + city (the city picker offers Karachi / other in Pakistan).
4. Start the transaction. `SELECT … FOR UPDATE` the **variant rows** (joined to their product for status/discount lookup) **in ascending variant id order**. If there is a coupon, `SELECT … FOR UPDATE` the coupon row.
5. Recompute with the pricing service using the locked rows. If an item's product is inactive, or the variant is inactive or out of stock, fail with a clear message. If the country is not `PK` and the payment method is COD, refuse (COD is Pakistan-only, checked here even if the client sent a Pakistani zone). If the total differs from the client's `expectedTotal`, fail with "Prices changed, please review". Nothing is written in either case.
6. Insert the order. `order_number` = `RSH-YYMMDD-XXXX`: the Karachi date plus 4 random characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, retried on a duplicate key. Then insert the items with product id, variant id, name/variant-label/SKU snapshots and price snapshots.
7. Decrement the **variant's** stock. If a coupon was used, insert `coupon_usages` and increment `used_count`.
8. Set `payment_status` from the payment method regardless of zone mode: bank → `unpaid`; COD → `cod_pending`. Set `order_status`: a `quote` zone (every zone today) always starts `awaiting_shipping_quote`, with `shipping_total` and `shipping_note` left `NULL` until staff set the quote (AD-03); a `flat` zone (not used at launch) starts `pending` directly.
9. Insert `order_status_history`, then commit. On deadlock (errno 1213), retry the whole transaction once.
10. Set the order-access cookie and redirect to the confirmation page. Emails (M2) go out after the response via `after()`, never inside the transaction, and a mail failure is logged and does not fail the order.

### 4.3 Order status machine (`orders/status.ts`, pure and tested)
- Order: `awaiting_shipping_quote → pending` (quote set); `pending → confirmed | rejected | cancelled`; `confirmed → processing | cancelled`; `processing → shipped | cancelled`; `shipped → delivered`. Cancelling after `shipped` is not allowed.
- A bank order can't enter `confirmed` until `payment_status = verified`. The combined action "Approve payment and accept order" runs in one transaction.
- Payment: `unpaid | rejected → proof_submitted` (upload); `proof_submitted → verified | rejected` (reason required); `cod_pending → cod_collected`.
- Moving into `cancelled` or `rejected` (reason required for rejected) restores stock and **releases the coupon use** (the usage row is deleted and `used_count` decremented) in the same transaction. This happens once only, because the state machine forbids leaving those states.
- Unpaid bank orders hold their stock until staff cancel them. The orders list has an "unpaid > 3 days" filter. Nothing expires automatically.
- Every change writes `order_status_history` (user, time, note). Internal notes are history rows with `kind = 'note'`.

### 4.4 Payment screenshot
- **Upload:** `POST /api/orders/[orderNumber]/proofs`, from the confirmation/tracking page (SF-06). Requires the order-access cookie, a same-origin `Origin` header, and rate limits per IP and per order. Allowed only while `payment_status` is `unpaid`, `proof_submitted` or `rejected`, the order is open, **and `order_status` is not `awaiting_shipping_quote`** (there is no confirmed total to pay yet — the control is disabled on the page too, but this is enforced server-side). At most 5 proofs per order.
- **Validation:** reject when `Content-Length` > 5.5 MB before reading the body, then check the file part ≤ 5 MB. The real type comes from `sharp().metadata()` (magic bytes): jpeg, png or webp only. `limitInputPixels` guards against decompression bombs.
- **Processing:** `.rotate()` (applies EXIF orientation), resize so the longest side is ≤ 2000 px, WebP output with no metadata. sharp runs with concurrency 1 and cache off. Written to a temp file, then renamed to `UPLOAD_DIR/proofs/YYYY/MM/<random>.webp`. The DB row (status `submitted`, relative path) is inserted, and the file is deleted if that insert fails. The order moves to `proof_submitted`.
- **Serving:** `/api/files/proof/[id]` needs `order.verify_payment` or `order.view`. It looks the path up by id (never a user-supplied path) and sends `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Type: image/webp`.
- **Review:** approve (`verified`) or reject with a reason. Rejecting a payment keeps the order open, and the customer can upload again.

### 4.5 Auth, permissions and order access
- **Passwords:** `node:crypto` scrypt with a random salt, compared with `timingSafeEqual`. No native module.
- **Sessions:** a random 32-byte token in an HTTP-only, Secure, SameSite=Lax cookie. The DB stores its SHA-256 (`sessions.id`). Expiry is 7 days absolute, and `last_seen_at` is updated at most once an hour. Logout or deactivating a user deletes the sessions. Login is rate-limited by IP and email.
- **Permissions:** `requirePermission(key)` sits at the top of every panel page, action and route. `key` is typed from the `PERMISSIONS` const. The user's permission set is loaded once per request (React `cache()`). The sidebar is built from the same set. The code never checks role names.
- **Seed sync:** the seed is idempotent. It upserts the permission rows from `PERMISSIONS` and grants all of them to the system `developer` role. `is_system` roles can't be edited or deleted in the panel. A user can only grant permissions they hold.
- **Order access (customers):** an HMAC-signed (SESSION_SECRET), HTTP-only cookie listing up to 20 order numbers, valid 30 days. It is granted by placing an order, or by `/track` verifying order number **plus the phone number used at checkout** (rate-limited; no email-based lookup, since email is optional at checkout and may be absent). A successful lookup redirects to `/order/[orderNumber]` (SF-06), which doubles as the confirmation page. That page and proof upload require the cookie.
- **CSRF:** Server Actions use Next's built-in Origin check (`serverActions.allowedOrigins` from `APP_URL`, plus the tunnel host for the demo). Route Handlers that change state check `Origin` themselves (`server/request.ts`).
- **Client IP:** the last `X-Forwarded-For` entry, which is the one appended by Apache/Passenger.

### 4.6 Flags, settings and shipping
- `config/features.ts`: `multiCurrency` (off, and out of scope for week 1 — no switcher anywhere), `coupons`, `discounts`, `wholesale`, `cod`, `bankTransfer`. A flag is only added when some code reads it (`discounts` since S5, `coupons` and `cod` since S6), so `guestCheckout` waits for accounts (P3).
- `config/site.config.ts` holds build-time defaults (store name, logo text "RS Home" in the demo's font and colour, contact, timezone `Asia/Karachi`). The `settings` table holds values editable at runtime (bank accounts, announcement text, contact, social links, home hero text) and falls back to `site.config` when a key is missing. Seeded `settings` rows: `contact` (phone, WhatsApp number, address) and `social_links` (Facebook, Instagram URL and handle).
- Client decision: PKR only (no exchange rate anywhere), and every shipping zone starts in `quote` mode (WhatsApp quote after order, section 6.4 of REQUIREMENTS) with `flat_rate = 0`. `flat` mode (with an optional free-over threshold) exists in the schema and pricing code for a future zone switch but isn't used at launch. Weight-based rates are deferred; `products.weight_grams` and `product_variants.weight_grams` (an override) exist so they can be added without migrating data.
- WhatsApp shop number: `923218581969` (displayed as `03218581969`). `wa.me` links are built client-side from the order number (and total, on the admin side) — no schema involved.

## 5. Rendering, images and performance
- Pages are Server Components **rendered per request**, with no data cache and no Cache Components. At about 200 products, indexed queries are cheap. This keeps timed discounts correct, needs no DB during `next build`, and avoids per-process cache drift under Passenger. React `cache()` shares a query within one request. Revisit in the performance pass only if Lighthouse needs it.
- Client Components only where interaction is needed (cart drawer, gallery, forms).
- **Images:** on upload, sharp writes WebP at 400, 800 and 1200 px wide (`<base>-400.webp` and so on) and stores the original width and height. `/media/[...path]` streams them with `Cache-Control: public, max-age=31536000, immutable` (filenames are random and never reused). The path must match `^[a-z0-9/-]+-(400|800|1200)\.webp$`; anything else is a 404. `next/image` uses the custom loader in `lib/image-loader.ts`, which maps the requested width to the nearest variant, so there is no runtime optimiser. Images are lazy-loaded with explicit width and height.
- Every list is paginated. Indexes are listed in DATABASE.md.
- **Shop grid (D27):** the price sort uses the price the card shows (the cheapest active variant's discounted price), which only `features/pricing` can compute. So `/shop` and `/category/[slug]` load the narrow listing columns of every matching active product plus their active variants (indexed on status/category and product_id), price and sort them in memory, then slice one page (12) and load images for that page only. Products with no active variant are left out. Category pages include the category's direct child categories.

## 6. Environment variables
Every entry point loads `.env.local`: the app (Next does this), `drizzle.config.ts`, and every script. `server/env.ts` validates them with Zod at startup. `.env.example` is committed.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:3306/rs_home` |
| `SESSION_SECRET` | ≥ 32 random characters; also signs the order-access cookie |
| `UPLOAD_DIR` | absolute path outside the app folder; contains `media/` and `proofs/` |
| `APP_URL` | public origin, used for `allowedOrigins`, links and SEO |
| `ALLOWED_ORIGINS` | optional extra hosts (the demo tunnel) |
| `SEED_DEVELOPER_EMAIL`, `SEED_DEVELOPER_PASSWORD`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | optional (M2) |
| `NODE_OPTIONS` | `--max-old-space-size=256` on the host |

**Database pool:** one pool per process, `connectionLimit: 4`, `idleTimeout` below the server's `wait_timeout`, `timezone: 'Z'`, `charset: 'utf8mb4_unicode_ci'`. In dev it is kept on `globalThis` so hot reload doesn't open new pools.

## 7. Build and deploy (cPanel)
1. **Build on Linux** (GitHub Actions in a private repo, planned; WSL or Docker also work). A Windows build bundles win32 sharp binaries that won't run on the host. `scripts/build-standalone.mjs` is Linux-ready: it runs `next build`, copies `public/` and `.next/static` into `.next/standalone`, and zips it.
2. **Layout on the host:** the CloudLinux Node selector refuses a real `node_modules` folder in the application root, so the bundle is extracted into a subfolder: `~/rshome/app/` (contains `server.js`, `node_modules`, `.next`). The application root is `~/rshome`, and the startup file is `app/server.js`. `UPLOAD_DIR` is `~/rshome-uploads` (outside both).
3. Set env vars in the Node app screen. Restart via the panel or `touch ~/rshome/tmp/restart.txt`.
4. **Migrations:** `scripts/migrate.ts` (the drizzle-orm migrator) runs from the local machine against the host DB (cPanel Remote MySQL, own IP allowed temporarily), or over SSH if the host offers it. The first migration sets `utf8mb4_unicode_ci` on the database, and the script refuses to run if the database collation differs.
5. **Initial content:** the demo data is built locally, so for launch: `mysqldump` the local DB → import on cPanel (phpMyAdmin), and zip `UPLOAD_DIR/media` → extract on the host.
6. **Staging smoke test right after purchase:** sharp works (image upload), login, order, proof upload, restart. Things to confirm with the host: Node 20.9+, glibc ≥ 2.26, the upload body limit (≥ 6 MB), and whether Passenger's `listen()` hook works with the standalone server.
7. **Backups:** a daily cPanel cron running `mysqldump`, and a periodic copy of `UPLOAD_DIR`.
8. Logging: `console.error` goes to Passenger's stderr log. `instrumentation.ts` `onRequestError` logs unhandled errors. Friendly `error.tsx` / `not-found.tsx` pages.

## 8. Testing
- **Vitest** (no Playwright).
- Unit tests: `features/pricing` (discounts, coupons, exclusivity, shipping, rounding, currency), `orders/status.ts`, the rate limiter, password hashing, the image-loader mapping.
- Integration tests against a test database (`rs_home_test`): `createOrder` (stock, coupon limits, idempotency, concurrent last unit, changed total) and the cancel/reject restore.
- Manual: the browser walk-through for each slice, and a visual check at 375, 768 and 1440 px against `design-reference/` and the live demo.

## 9. Decisions (28 September 2026)
| # | Decision | Reason |
|---|---|---|
| D1 | Order-access cookie (signed; granted by placing the order or a tracking lookup) guards the confirmation page and proof upload | An order number alone would expose customer details and allow fake proofs. |
| D2 | Uploads go through Route Handlers with an early size check and a manual Origin check | Server Actions cap bodies at 1 MB; raising it everywhere is a blunt fix. |
| D3 | Build the deploy artifact on Linux (GitHub Actions later) | sharp's native binaries are platform-specific. |
| D4 | Passwords with `node:crypto` scrypt | No native module or extra dependency; strong KDF. |
| D5 | Standalone bundle in an `app/` subfolder; startup file `app/server.js` | CloudLinux Node selector forbids `node_modules` in the app root. |
| D6 | Rate limits in MySQL | Passenger may run several processes and restarts them. |
| D7 | Render pages per request; no data cache | Timed discounts stay correct, no DB at build, no per-process cache drift; cheap at this size. |
| D8 | `/media` route + custom `next/image` loader over pre-generated WebP sizes | Images live outside `public/`; no runtime optimiser memory spikes. |
| D9 | Collation `utf8mb4_unicode_ci` forced by the first migration and checked by `migrate` | MySQL 8's default collation doesn't exist in MariaDB. |
| D10 | JSON-shaped data in `TEXT` + Zod; no JSON SQL | MySQL and MariaDB return and query JSON differently. |
| D11 | `checkout_token` idempotency + `expectedTotal` check | Prevents duplicate orders and silent total changes. |
| D12 | `DATETIME` in UTC; display and date boundaries in Asia/Karachi | Avoids TIMESTAMP quirks; "today" means Karachi time. |
| D13 | Small DB pool (4) per process | Shared-host connection caps. |
| D14 | Random order numbers `RSH-YYMMDD-XXXX` | No counter table or race, and they don't reveal order volume. |
| D15 | Cancel/reject restores stock and releases the coupon use | Client decision. |
| D16 | Shipping modes `flat` (+ free-over) and `quote`; weight tiers deferred | Only the product weight must exist now; later is a plain migration. |
| D17 | Tokens only in `src/app/theme.css`; no `config/theme.ts` | Tailwind 4 keeps tokens in CSS; one place to re-theme. |
| D18 | Vitest only; CSV-only import; no `guestCheckout` flag yet; no `proxy.ts` | Fewer dependencies and no dead code. Proxy would buffer upload bodies; gating is done in pages and actions. |
| D19 | New permission `order.set_shipping` (Admin + Developer); Admin also gets `product.view` | Client decisions: the owner enters courier quotes and can look up products. |
| D20 | Phone required, email optional at checkout; PKR rounded to whole rupees | Client decisions. |
| D21 | Currency finalised as PKR-only; delivery finalised as WhatsApp quote-only, all zones, COD Pakistan-only enforced server-side in `createOrder` | Client decisions (S2b). REQUIREMENTS §16's currency/delivery open questions are answered. |
| D22 | Quote flow (checkout copy, `awaiting_shipping_quote`, `order.set_shipping`, WhatsApp buttons) and tracking (`/track`, order-access cookie, SF-06/07) move from S14/S15 into S7-S9 (week 1) | Client decision: this is now core M1, not a week-2 add-on. |
| D23 | Tracking verifies order number + phone only, never email | Email is optional at checkout and may be absent; phone is always present. |
| D24 | Every product has ≥1 row in `product_variants` (a simple product gets one "Default" variant). Stock and SKU move to the variant; `products.sku` and `products.stock` are dropped. Cart lines and `order_items` key on `variant_id`; `order_items` snapshots the variant's label and SKU | Client decision: products have colour/size options. One identifier system (variant SKU) instead of two. |
| D25 | `wholesale_inquiries.items_of_interest` replaced by child table `wholesale_inquiry_items` (product_id nullable, item_name, quantity); inquiry gains `business_type`, `city`, `needed_by_date`; new permission `wholesale.manage` (Admin + Developer) for status changes | Client decision: structured wholesale form fields, and Admin needs to action inquiries, not just view them. |
| D26 | Admin/developer panel uses the same theme tokens as the storefront; the restyle happens in S3 alongside token extraction | Client decision: no separate "utilitarian" visual language. |
| D27 (29 Sep) | Shop sorting and pagination happen in memory after pricing the filtered set; only the page's images are loaded (§5) | Sorting by the displayed (discounted) price can't be done in SQL without copying discount rules out of `features/pricing`. Cheap at a few hundred products; revisit past a few thousand. |
