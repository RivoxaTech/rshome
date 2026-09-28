# Architecture (proposed starting point)

Claude Code may improve this, but must record every change and the reason here before coding.

## 1. Shape
One Next.js app. No separate backend. Three surfaces share one codebase and one database:

```
Browser
  |-- Storefront   (public pages, cart, checkout, tracking)
  |-- Panel        (/panel/*  admin + developer, permission-gated menus)
  v
Next.js server (Passenger on cPanel)
  |-- Server Components  : read data for pages
  |-- Server Actions     : mutations (cart checkout, order actions, CRUD)
  |-- Route Handlers     : health check, authenticated file serving
  v
features/*/service  ->  features/*/repo  ->  server/db (Drizzle)  ->  MySQL
                                        \->  server/storage (sharp)  ->  UPLOAD_DIR on disk
```

## 2. Layers and rules
| Layer | Location | Allowed to | Not allowed to |
|---|---|---|---|
| UI | `src/app`, `src/components` | call services, render | touch DB, contain business rules |
| Service | `src/features/*/service.ts` | business rules, permissions, transactions | render UI |
| Repo | `src/features/*/repo.ts` | DB queries via Drizzle | business rules |
| Server infra | `src/server/*` | db client, session, storage, mail, rate limit | know about features |

## 3. Folder structure
```
rs-home/
  CLAUDE.md
  docs/                  REQUIREMENTS.md, ARCHITECTURE.md, DATABASE.md
  design-reference/      Lovable export (read-only, excluded from tsconfig and build)
  drizzle/               generated SQL migrations
  public/                static assets (logo, fonts if self-hosted)
  scripts/               seed.ts, import-products.ts, deploy.sh
  src/
    app/
      (store)/           layout.tsx (announcement bar, header, footer), page.tsx (home)
        shop/  category/[slug]/  product/[slug]/  cart/  checkout/
        order/[orderNumber]/     confirmation + screenshot upload
        track/  wholesale/  pages/[slug]/   (contact, about, policies)
      panel/
        login/  dashboard/
        orders/  orders/[id]/    order detail: screenshot, approve or reject payment, accept or reject order
        products/  categories/  discounts/  coupons/  shipping/
        settings/  users/  roles/  wholesale/  audit/
      api/
        health/route.ts
        files/proof/[id]/route.ts     authenticated payment-proof streaming
      sitemap.ts  robots.ts
    features/
      auth/  users/  roles/
      catalog/     (products, categories, images)
      pricing/     pricing.ts (single source of truth), money.ts, *.test.ts
      cart/
      checkout/    createOrder transaction
      orders/      status machine, history
      payments/    proofs upload, review
      discounts/  coupons/  shipping/  settings/  wholesale/  audit/
    server/
      db/          client.ts, schema/*.ts (one file per feature)
      auth/        session.ts, password.ts, permissions.ts (requirePermission)
      storage/     images.ts (sharp), files.ts (UPLOAD_DIR)
      mail/        nodemailer wrapper (optional)
      rate-limit.ts
    components/    ui/ (primitives), store/ (storefront), panel/ (admin tables, forms)
    config/        site.config.ts, features.ts, theme.ts (tokens)
    lib/           small pure helpers
  next.config.ts   output: "standalone"
  drizzle.config.ts
  .env.example
```

## 4. Key flows

### 4.1 Price calculation (one module)
`pricing.calculateCart(items, { coupon?, zone, currency })` returns per-line effective prices, discount total, coupon result, shipping, total, display totals.
Rules: best single discount per product; discounts never stack; **a coupon is rejected if any cart line has an active discount**; shipping from zone mode; display currency from `exchange_rate` when `multi_currency` is on.
Used by the cart UI (through a server action) and again inside order creation. The browser never sends prices.

### 4.2 Place order (`checkout/createOrder`, one transaction)
1. Validate input (Zod). Rate-limit.
2. Load products, lock rows, check stock.
3. Recompute totals with `pricing.calculateCart`.
4. Insert order (`order_number` like `RSH-260928-0001`), items with price snapshots.
5. Decrement stock. Insert `coupon_usages` if a coupon was used.
6. Set statuses: bank transfer -> `pending` + `unpaid`; COD -> `pending` + `cod_pending`; quote-later zone -> `awaiting_shipping_quote`.
7. Insert `order_status_history`. Commit. Redirect to confirmation.

### 4.3 Payment screenshot
Customer uploads on confirmation or tracking page -> validate type and size -> sharp re-encode -> save to `UPLOAD_DIR/proofs/<random>.webp` -> row in `payment_proofs` (status `submitted`), order `payment_status = proof_submitted`.
Admin opens order detail -> image loaded from `/api/files/proof/[id]` (requires permission) -> **Approve payment** (payment_status `verified`) or **Reject payment** with reason (customer may re-upload).
Then **Accept order** (`confirmed`) or **Reject order** with reason (`rejected`, stock restored). Every action writes history and, where relevant, audit.

### 4.4 Auth and permissions
Email + password, signed HTTP-only session cookie, session row or signed token with expiry. `requirePermission(key)` is called at the top of every panel page, action and route. The sidebar is built from the user's permission list. The Developer role is a system role holding every permission.

### 4.5 Currency and shipping (flagged, not hard-coded)
`config/features.ts`: `multiCurrency`, `coupons`, `discounts`, `wholesale`, `cod`, `bankTransfer`, `guestCheckout`.
Products priced in PKR. When `multiCurrency` is on, the header switcher sets a cookie; display price = PKR / `settings.exchange_rate`. Orders snapshot currency and rate.
Shipping zones have a `mode`: flat, free_over, quote_later, weight. First release implements flat, free_over and COD-per-zone; the others are schema-ready.

## 5. Caching and performance
Catalog pages are Server Components with revalidation triggered when a product, category or discount changes (`revalidatePath` or tags). Paginated lists. Images: WebP in sizes 400, 800, 1200, lazy-loaded with width and height. Indexes listed in DATABASE.md.

## 6. Environment variables
`DATABASE_URL`, `SESSION_SECRET`, `UPLOAD_DIR` (absolute, outside app folder), `APP_URL`, `SMTP_*` (optional), `NODE_ENV`.

## 7. Build and deploy (cPanel)
`next build` with `output: "standalone"` locally. Assemble: copy `public/` and `.next/static` into `.next/standalone`. Zip, upload, extract, Node app startup file `server.js`, set env vars in the Node app screen, run migrations against the cPanel MySQL from local (allow remote MySQL for your IP temporarily) or via a one-off script. `UPLOAD_DIR` outside the app folder. `scripts/deploy.sh` automates build, assemble and zip.

## 8. Testing
Unit tests for `features/pricing` (discounts, coupons, exclusivity, shipping, currency rounding) and the order status machine. One end-to-end smoke test of the order flow. Manual visual check at 375, 768 and 1440 px against the demo.
