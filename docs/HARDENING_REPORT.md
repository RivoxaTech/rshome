# S22 Hardening: audit findings and fix plan

## Progress (resume from here)

**Stage 1 (Group A security, Group B bugs) is done, 4 October 2026, committed and pushed on `production` (`569c61a`, `eb756b0`). Stage 2A (Group C speed + hero, Group D dead code) is done, 5 October 2026, as two local commits on `production`, not pushed; see "Stage 2A" below.** Stage 2B (Groups E quality, F docs, then Phase 4 verification) has not started. Owner answers to the section 7 questions are recorded at the end of this section. Tests: 1015 passing in 99 files (959 in 84 files before Stage 1), typecheck and lint clean. Two standalone builds were made: the first to check the headers with curl and a headless pass (home, product, login, dashboard poll, upload fetch, service worker), which surfaced zod's `new Function` probe as a CSP violation; the second, after the `jitless` fix, ran the same pass with no violations and confirmed `.shadow-soft` is generated in the built CSS and no `.env*` file is inside `.next/standalone`.

| Item | Status | Notes |
|---|---|---|
| A1 SEC-01 env file out of the bundle | done | `src/server/env.ts` no longer imports `load-env` (that import made Next's tracer copy `.env.local` into `.next/standalone`); `build-standalone.mjs` removes any `.env*` and fails if one remains; `start:standalone` is `node --env-file=.env.local …`. Guard test `src/server/env.test.ts`. Verified: the new build has no `.env*` in `.next/standalone`. |
| A2 SEC-02 security headers | done | `src/config/security-headers.ts` (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS without includeSubDomains), applied production-only from `next.config.ts` `headers()`, `poweredByHeader: false`. Found and fixed by the headless pass: zod 4 probes `new Function`, a reported CSP violation on every storefront page — `src/lib/zod-config.ts` sets `jitless`, imported by every `features/*/schemas.ts` (guard test); the second build's pass was clean. |
| A3 SEC-03 login timing | done | Dummy scrypt hash for unknown/inactive emails; `login.integration.test.ts`. |
| A4 SEC-04 media upload caps | done | `processMediaImage` whitelists jpeg/png/webp and caps 40 MP from the header; the panel upload route pre-checks Content-Length and maps refusals to messages; `media-image.test.ts`. |
| A5 SEC-05/06 push | done | Endpoint must be https and not localhost/IP; 10 subscriptions per user, oldest dropped; `sw.js` only opens same-origin URLs. |
| A6 SEC-07 ids | done | `src/lib/form-id.ts` `parseFormId` in every panel action; `reviewProof` returns the order number so the action no longer queries before `requirePermission`. |
| A7 small hardening | done | login email ≤ 170; `verifyPassword` shape/parameter checks; stored social links must be https; fixed test-email failure message; last-holder guard covers `role.manage`. |
| B1 BUG-01 cart wipe | done | Quote extras (`phone`, `destination`, `couponCode`) fall back to null instead of failing; only `cart_unreadable` resets storage; checkout city/phone inputs have `maxLength`. |
| B2 BUG-02 zone stale token | done | Area tokens sorted in `auditValues`. |
| B3 BUG-03 CSV file name | done | Audit `entity_id` is `import:<hash>`; name (≤ 200) only in `new_values`. |
| B4 BUG-04 phone card dialogs | done | `<div onClick={stop}>` around the card's dialogs; `OrdersTable.test.tsx`. |
| B5 BUG-06 LIKE helper | done | `src/lib/sql-like.ts` `likeContains` in all 9 repos. |
| B6 BUG-09/11 duplicate key, SKU case | done | `src/server/db/errors.ts` `isDuplicateEntry` shared by 7 services + checkout; `duplicate-entry.integration.test.ts`. SKUs compared case-insensitively (`skuKey`) in the import's in-file, existing-variant and commit passes; both scenarios in `csv.integration.test.ts`. |
| B7 BUG-10 import placement | done | `getMaxSortOrders` + append on insert / newly-featured update. |
| B8 BUG-12 zone COD off | done | `CartQuote.codAvailable`; checkout derives the effective payment method from it; `COD_NOT_AVAILABLE_MESSAGE`. |
| B9 BUG-07 boundaries | done | `app/global-error.tsx`, `app/not-found.tsx`, `(store)/error.tsx`, `panel/(protected)/{error,not-found}.tsx`, `src/instrumentation.ts` (`onRequestError`), try/catch around the cart quote, checkout and wholesale submits. |
| B10 BUG-08 SearchBox | done | Last-pushed query kept in state; `SearchBox.test.tsx`. |
| B11 BUG-13 shadow tokens | done | `@theme static` block in `theme.css`; verify `.shadow-soft` exists in the Stage 2 build's CSS. |
| B12 BUG-14/23 client promises | done | try/catch in `ImageUploader`, `ArrangeList`, `VariantsSection`, `ImagesSection`, `NotificationBell.disable`; `ImageUploader.test.tsx`. |
| B13 BUG-15 `after()` senders | done | `guarded()` wrapper in `features/mail/service.ts`; payload build inside the try in `notify/service.ts`. |
| B14 BUG-16/24/25 exports | done | `lt` bound; Karachi default dates; `parseKarachiDateString` refuses impossible dates; label over 150 reported; product/wholesale exports mark a capped file in the name, wholesale export audited (`wholesale.export`). |
| B15 BUG-17 sweeps | done | Expired sessions deleted on login; `rate_limits` swept (rows expired > 24 h) when a window starts; `rate-limit.integration.test.ts`. |
| B16 small fixes | done | Search keeps Newest (`DEFAULT_SORT`); stepper caps at 99; impossible wholesale dates refused (`isValidIsoDate`); index keys; image files kept on "already added"; category parent rules read under the lock; home title and panel tab title from `getStoreIdentity()`. |
| B17 BUG-05 flat-zone COD | **skipped (owner, Q1)** | Recorded under BUILD_PLAN.md "Still open". |

**Follow-up (5 Oct 2026): "order detail shows the root not-found" report.** Diagnosed, not a code defect: the order (`RSH-261005-558W`, COD, Need review) exists and Stage 1 changed nothing on the lookup path. The owner's `npm run dev` had been running since before Stage 1's ~100 file edits and its route tree had lost the `/panel/orders/{bank,cod}/[orderNumber]` segment: it answered a route-level 404 even logged out (every other panel route answered 307 to login), and Next renders the root `app/not-found.tsx` for an unmatched URL (not-found.md line 133). A fresh dev server and the production build serve every detail page; a missing record throws `notFound()` and renders `panel/(protected)/not-found.tsx` inside the frame (verified for orders, wholesale, users, products). Fix: restart the dev server after a large change. Added `features/orders/detail-page.integration.test.ts` (existing bank and COD orders render, a missing one throws the 404 digest, Developer gets 403, no session gets login) so the flow is pinned. Click-through on the fresh server: 3 bank + 3 COD details, wholesale list and detail, product and category edit, four unknown records, and the storefront track form into `/order/…` — all correct, no console errors.

**Test-suite note:** `checkout/service.integration.test.ts`'s COD-off test must stay the last test in its file — outside a Next request React's `cache()` never resets (D45), so a zone row read with COD off would leak into every later test.

**Stage 2 order:** (1) Group C (SPD-01 counts query, SPD-03 `sizes` + `deviceSizes`, SPD-02, SPD-04/05, HERO-01 from the two JPGs in `public/hero/`, re-measure); (4) Group D (20 dead items, 10 theme tokens, favicon = generated "RS" placeholder, README, stale comments, drop 168 redundant `export`s); (5) Group E (a11y `useModal`, alerts, labels, reduced motion, headings, panel titles, layering, shared helpers, three file splits; contrast **panel only**, storefront contrast reported in the final summary, not changed); (6) Group F (`docs/DEPLOY.md`, BUILD_PLAN S22 done/S23 next, ARCHITECTURE D61, CLAUDE.md rules, `db:seed -- --no-samples` that never deletes); (7) Phase 4. Owner answers: Q1 skip B17; Q2 static CSP, no proxy; Q3 HSTS 180 days, no includeSubDomains; Q4 drop redundant exports; Q5 use the two JPGs in `public/hero/`; Q6 generate an "RS" placeholder icon with sharp; Q7 panel-only contrast fixes; Q8 add `--no-samples`; Q9 price 0 stays allowed; Q10 keep this report.

### Stage 2A (5 October 2026)

**Group C, speed and hero: done.** Tests 1024 passing in 101 files (1018 before), typecheck and lint clean. Measured against production standalone builds of `eb756b0` ("before") and of the Group C commit ("after") on this laptop, each started on its own port next to the owner's dev server; query counts come from MySQL's general log in TABLE mode filtered to the standalone server's own connections (the dev server's threads were excluded and confirmed idle), timings are the warm median of 15 requests from Node `fetch`, browser transfer is headless Chrome with cache disabled.

| Item | Status | Notes |
|---|---|---|
| C1 SPD-01 counts query | done | `countOrdersByState` is a `UNION ALL` of two grouped selects: the two correlated screenshot subqueries now run only for bank orders that are not cancelled or rejected (the only orders whose flags read screenshots); COD orders and closed bank orders are counted with a plain `GROUP BY` and NULL screenshot states. **Narrower than the report's plan:** a *delivered* bank order stays on the subquery path, because `screenshotToCheck` still returns true for it when a latest screenshot is `submitted` (`canReviewProof` treats Completed as open) and the every-enum-combination test checks exactly that. Test change: COD orders in that test now also get screenshot histories, so the plain path is exercised; an identical-counts test cannot fail before a behaviour-preserving refactor, so this is the protecting test, not a failing-first one. |
| C2 SPD-03 `sizes` + `deviceSizes` | done | `next.config.ts` `images.deviceSizes: [400, 800, 1200]`, `imageSizes: []`, pinned to the loader's `AVAILABLE_WIDTHS` by a new (failing-first) test in `image-loader.test.ts`; `sizes` on the Featured cards (`330px`/`280px`), each Collections mosaic slot (`58vw`/`42vw`/`100vw`), Story (`50vw`) and Wholesale (`25vw`/`50vw`) images. Also found by the "after" build: the footer's credit `<img>` had no `loading="lazy"`, so React's streaming renderer emitted a `<link rel=preload>` for a below-the-fold 48 KB PNG on every storefront page; now lazy, so the hero preload is again the only image preload. |
| C3 SPD-02 settings batch read | done | `loadSettings()` (`cache()`d) reads every key with one `WHERE key IN (...)`; each reader still falls back per key. `getSettingValue` deleted (unused). New `settings/service.test.ts` (mocked repo; confirmed failing before the change). |
| C4 SPD-04/05 | done | `CartProvider` value is `useMemo`d over `useCallback`ed actions; `HeroSection` parallax writes `transform` straight to the element once per animation frame and stops once the hero has scrolled past, no React state; `CheckoutForm` takes `emailHint` as a prop (the checkout page passes `siteConfig.checkoutEmailHint`), so `site.config.ts` is no longer in that client bundle. |
| C5 HERO-01 | done | `public/hero/hero-{main,accent}-{400,800,1200}.webp` (9/27/48 KB and 17/46/76 KB), generated by the new `scripts/hero-images.mjs` from the owner's two JPGs; `HERO_IMAGES` in `config/home-content.ts` (alt text describes the photos); `HeroSection` renders them with `next/image`, `preload`, `sizes="100vw"`/`"288px"` and `lib/image-loader.ts#staticImagePath` as the per-image loader; the home `generateMetadata` uses the 1200 px main file as the Open Graph image; the hero no longer depends on any category. **Deviation from the plan's 640/960/1200 and 288/576/864:** Next asks the loader for the `deviceSizes` widths, so a set at other widths produced `srcset` descriptors that lied (`hero-main-640.webp 800w`) and never served the middle size; every static set now uses the same three widths as `/media`, so each candidate is a real file. `metadata.test.ts` checks the OG URL and that every file the loader can name exists. Verified in the browser at 375 and 1440 (screenshots; hero fills, accent card bottom-right on desktop, no console errors). The source JPGs were moved out of `public/` after the commit. |
| C6 re-measure | done | Tables below. |

Server, warm median and queries per request (before → after):

| Page | Before | After | Queries before | Queries after |
|---|---|---|---|---|
| `/` | 45 ms | 40 ms | 10 | 7 |
| `/shop` | 40 ms | 32 ms | 10 | 7 |
| `/category/tableware` | 33 ms | 37 ms | 10 | 7 |
| `/product/[slug]` | 31 ms | 28 ms | 10 | 7 |
| `/cart`, `/track`, `/wholesale`, `/contact` | 21–30 ms | 16–27 ms | 4 | 1 |
| `/checkout` | 32 ms | 27 ms | 5 | 1 |
| `/panel` (dashboard) | 40 ms | 34 ms | 13 | 13 |
| `/panel/orders/bank` | 48 ms | 45 ms | 8 | 8 |
| `/panel/orders/cod/[n]` | 33 ms | 37 ms | 10 | 10 |
| `/panel/products` | 31 ms | 31 ms | 5 | 5 |

The three fewer storefront queries are the per-key settings reads (C3). The panel's query count is unchanged because the `UNION ALL` is one statement; at 134 orders (mostly COD) its cost is within noise, and the gain is that completed COD orders and closed bank orders no longer pay the two subqueries as the table grows. Timing differences of a few ms are within run-to-run noise on this laptop.

Home page transfer, cache disabled (before → after): "initial" is the first paint's requests, "full" is after scrolling to the footer so every lazy image loads.

| Viewport | Initial | Full | Images (full) | Hero file |
|---|---|---|---|---|
| 375 px, DPR 2 | 719 → 512 KB | 1120 → 996 KB | 807 → 683 KB | category 1200 px → `hero-main-800` |
| 375 px, DPR 3 | 697 → 642 KB | 1099 → 1176 KB | 807 → 886 KB | category 1200 px → `hero-main-1200` |
| 1440 px, DPR 1 | 696 → 629 KB | 1094 → 804 KB | 807 → 519 KB | category 1200 px → `hero-main-1200` |

The report's "~350 KB" estimate was optimistic: with only three generated widths, a 327 px wide card at DPR 3 still needs the 1200 px file, so `sizes` helps DPR 2 phones and desktops, not DPR 3 phones. The DPR 3 "full" figure grew by 77 KB because the hero is now its own file (before, the Decor category photo served as hero, Collections card, Story image and Wholesale cell and was fetched once) and because one Wholesale cell now fetches an 800 px file where Chrome previously reused the 1200 px copy already in memory. Console errors: none in any run.

**Dev database:** every test suite runs against `rs_home_test`, so the fixes themselves touched nothing. The headless passes logged into the dev panel: the `sessions` rows they created (4 in total) were deleted afterwards (the table had 0 rows before), `users.last_login_at` of the two seeded users now shows today, and the new rate-limit sweep (B15) ran on that login and removed 224 long-expired `rate_limits` rows (227 → 3; all were stale buckets from earlier demo seeds and manual tests, which the seed never creates and the `db:reset:*` scripts clear anyway). No catalogue, order, settings or user data changed.

---

Temporary working notes (4 October 2026, HEAD `ec4063a`). Read-only audit; no code changed yet. Baseline: `typecheck` clean, `lint` clean, `npm test` 959/959 passing (84 files). Measurements were taken against the production standalone build of this exact commit, with MySQL's general/slow query logs in TABLE mode (no code instrumentation).

Severity: **critical** = exploitable or data-losing today; **high** = a real flow breaks or secrets leak on the deploy path; **medium** = wrong behaviour in an edge case, or a hardening gap worth closing before launch; **low** = hygiene, latent, or defence in depth.

Summary: **0 critical, 6 high, 19 medium, ~45 low/info.**

| Area | High | Medium | Low/info |
|---|---|---|---|
| Security | 1 | 1 | 13 |
| Bugs and flows | 4 | 9 | 17 |
| Speed | 0 | 3 | 5 |
| Dead code | 0 | 1 | 6 |
| Code quality / a11y | 1 | 5 | ~10 (grouped) |

---

## 1. Security

### SEC-01 · HIGH · `.env.local` is copied into the standalone bundle
- **Where:** `src/server/env.ts:1` (`import "./load-env"`) → `src/server/load-env.ts:9` (`config({ path: path.resolve(process.cwd(), ".env.local") })`). Next's file tracer follows that static path: `.next/server/app/(store)/page.js.nft.json` names `.env.local`, and `.next/standalone/.env.local` exists in today's build (same mtime as the source file). Next itself only copies `.env` and `.env.production` (`node_modules/next/dist/build/index.js:330`); this one comes from our own import.
- **What is wrong / how it breaks:** the folder that `scripts/build-standalone.mjs` prepares for upload carries the developer's local `DATABASE_URL` (with password), `SESSION_SECRET`, `TEST_DATABASE_URL`, SMTP password, VAPID private key and the seeded staff passwords. Not web-served, but it lands on the host, in the zip, and in any backup of the app folder. It also silently overrides the cPanel-set env vars on the host (the standalone server loads `.env.local` from its own dir).
- **Fix:** drop `import "./load-env"` from `src/server/env.ts` (Next loads `.env.local` itself in dev/build; every script and `drizzle.config.ts` already imports `load-env` first; vitest loads dotenv in `vitest.setup.ts`). In `build-standalone.mjs` delete any `.env*` left in `.next/standalone` and fail the build if one remains. Change `start:standalone` to `node --env-file=.env.local .next/standalone/server.js` (Node ≥ 20.6, within `engines`).
- **Risk:** low. Local `start:standalone` must use the new script; the host uses its env UI.
- **Test:** a build-script assertion plus a check in Phase 4 that `.next/standalone` contains no `.env*`.

### SEC-02 · MEDIUM · No HTTP security headers; `X-Powered-By: Next.js` sent
- **Where:** `next.config.ts` has no `headers()`; live check of `/`, `/panel/login`, `/api/health`: no CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS.
- **Impact:** panel framable (clickjacking; partly blunted by `SameSite=Lax`), MIME sniffing allowed, full referrer (including `/order/RSH-…` and `/panel/orders/…`) leaks to `wa.me`/Instagram/Facebook, any future XSS runs unconstrained.
- **Fix (production only, so dev HMR/eval keep working):**
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; media-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=15552000
  ```
  plus `poweredByHeader: false`. Why each: Next's App Router emits inline bootstrap scripts, so without a nonce `script-src` needs `'unsafe-inline'` (a nonce needs `proxy.ts`, which D18 rules out; see owner question Q2); 8 components render dynamic `style=` attributes and `next/image` sets inline styles, so `style-src 'unsafe-inline'`; `img-src blob:` for the proof preview (`ProofUpload.tsx:81`, `URL.createObjectURL`); `worker-src 'self'` for `/sw.js`; fonts are self-hosted by `next/font`; every client `fetch` is same-origin; `wa.me`/`mailto:` links are navigations, not CSP-governed; JSON-LD is an inert data block. HSTS is ignored over HTTP, so sending it always is safe; `includeSubDomains` left out (Q3).
- **Risk:** medium; a wrong directive silently breaks uploads, polling or the service worker. Verified in Phase 4 with a header check and a full click-through on the standalone build.

### SEC-03 · LOW · Login timing reveals whether an email exists
- `src/features/auth/service.ts:32-40`: scrypt runs only for an existing active user. Fix: verify against a constant dummy hash when the user is missing/inactive. Risk: none (+~50 ms on unknown-email failures).

### SEC-04 · LOW · Panel image upload: no pixel cap, no format whitelist
- `src/server/storage/images.ts:49` uses sharp's 268 MP default; `api/panel/uploads/route.ts` has no `Content-Length` pre-check (reads up to 8 MB into memory). A 16k×16k PNG decodes to ~1 GB on shared hosting. Fix: mirror the proof path (`metadata()` first, jpeg/png/webp only, ≤ 40 MP, `limitInputPixels`), and the Content-Length pre-check. Risk: a > 40 MP photo is refused with a message.

### SEC-05 · LOW · Push subscription endpoint accepts any URL; no per-user cap
- `src/features/notify/schemas.ts:5` (`z.url()`): `http://127.0.0.1:3306/` is accepted and every order event POSTs to it (blind SSRF by a staff user). Fix: require `https:`, refuse literal IPs/localhost, cap 10 subscriptions per user. Risk: none.

### SEC-06 · LOW · Service worker navigates to any payload URL
- `public/sw.js:28,35,49,53`. Fix: resolve against `self.location.origin`, fall back to `/panel`. Also the hard-coded "RS Home"/"rshome" defaults there (`:19,22`) are generic fallbacks only; acceptable.

### SEC-07 · LOW · `reviewProofAction` queries before authorising, with `Number(proofId)`
- `src/app/panel/(protected)/orders/actions.ts:43-48`. Fix: authorise and Zod-parse first; have `reviewProof` return the order number (also fixes layering QA-03).

### SEC-08 · LOW · Login email has no `.max`, rate-limit bucket PK is VARCHAR(191)
- `src/features/auth/service.ts:10`. A 180+ char email makes the upsert throw (fails closed, 500). Fix: `.max(191)` on the email (bucket key `login:email:` + email ≤ 191 → cap email at 170).

### SEC-09 · LOW · `verifyPassword` trusts the stored hash's shape
- `src/server/auth/password.ts:23-34`: an empty hash part would verify any password (needs DB tampering). Fix: require 64-byte key, 16-byte salt, allow-listed N/r/p; try/catch scrypt.

### SEC-10 · LOW · No `error.tsx` / `global-error.tsx` (see BUG-07)

### SEC-11 · INFO · `npm audit`: 9 advisories, all devDependencies
- `braces` (via `eslint-config-next`) and `esbuild` (via `drizzle-kit`); no non-major fix exists; neither ships in the standalone build. Re-check after the next releases. Do not run `npm audit fix` (it downgrades majors).

### SEC-12 · INFO · Social links validated on write only
- `src/features/settings/schemas.ts:140-148` read schema is `z.string()`. Fix: reuse the `https://` refine so a bad row falls back to config.

### SEC-13 · INFO · SMTP error text echoed to the settings page
- `src/features/settings/staff-service.ts:244-245`. Developer-only audience; show a fixed message, log the detail.

### SEC-14 · INFO · Last-holder guard covers `user.manage` but not `role.manage` on the users side
- `src/features/users/staff-service.ts:165-169`. Fix: add `role.manage` to the users-side check.

### SEC-15 · LOW · Client IP depends on `X-Forwarded-For`
- `src/server/request.ts:24-35` returns `"unknown"` when the header is absent, so every customer would share one checkout/coupon/proof bucket (10 checkouts per 15 min site-wide). Code is right for Apache/Passenger; this is a deploy-day check (DEPLOY.md) rather than a code change.

**Passed (evidence in the agent report):** authorisation on every page, action and route (every `"use server"` export gated, helpers not exported, the out-of-group slip page gates itself); Origin check on every state-changing route (verified live: 403 without/with a foreign Origin); Zod at every boundary; all 25 `sql\`` sites parameterised, no `sql.raw`; uploads re-encoded, random names, containment checks; `/media` traversal attempts (encoded `..`, `%00`, wrong case/size, `proofs/`) all 404 live; `/api/files/proof` 401/403 live; no `dangerouslySetInnerHTML`, JSON-LD escaped; every `redirect` target constant or anchored-regex validated; sessions hashed, httpOnly, Lax, Secure in prod, revoked on role/password change; `createOrder` locks variants ascending then the coupon, deadlock retry, idempotent token verified by tests; `expectedTotal` recomputed; no mass assignment; health returns two booleans; robots/sitemap exclude private URLs; no CORS headers; `after()` senders never throw.

---

## 2. Bugs and flow breakage

### BUG-01 · HIGH · A checkout quote that fails validation wipes the customer's cart
- **Where:** `src/components/store/cart/CartProvider.tsx:87-93` (any `ok:false` → `cartStore.set(EMPTY_CART)`); `src/features/cart/service.ts:53-54`; `src/features/cart/schemas.ts:40-42` (`phone` ≤ 32, `destination.city` ≤ 100); triggered from `CheckoutForm.tsx:98-100` (re-quote on every City keystroke) and `:195` (phone blur). The checkout inputs have no `maxLength`.
- **Scenario:** a customer pastes a long address into "Other city" (101+ chars) or a phone with extra text (33+ chars) → the quote request fails Zod → the provider treats it as corrupt storage, empties localStorage, and the checkout redirects to an empty `/cart` with no message. Also a 51st distinct variant.
- **Fix:** validate the stored cart separately from the checkout extras; treat an invalid phone/destination as `null` rather than failing; reset storage only on a distinct `cart_unreadable` code; `maxLength` on the City/Phone inputs.
- **Risk:** low. **Test first:** `quoteCart` with a 101-char city returns `ok:true`, shipping pending (new case in the cart quote tests).

### BUG-02 · HIGH · Shipping zone edit permanently refused as "stale" when its areas were added out of order
- **Where:** `src/features/shipping/staff-service.ts:75-77` (`zoneVersion` fingerprints `areas.map(areaToken)` as an ordered array), `:146` (edit page reads `listAreasByZoneId`, ORDER BY country, city — `staff-repo.ts:36-42`), `:258-263` (save reads `lockAllAreas`, no ORDER BY — `staff-repo.ts:32-34`, i.e. insertion order).
- **Scenario:** create a zone adding "United Kingdom" then "Australia" (or Karachi then Pakistan): every save of its edit page answers "someone else saved first, reload" forever. The integration test creates exactly such a zone (`PK:lahore, PK:Islamabad`) but never saves it with a version.
- **Fix:** sort area tokens inside `auditValues` (one place) so both sides agree. **Risk:** none. **Test first:** create a zone with unsorted areas, `getZoneForEdit` → `updateZoneById` with that version must succeed.

### BUG-03 · HIGH · CSV import fails for any file name over 50 characters
- **Where:** `src/features/catalog/csv-import-service.ts:302-310` writes the client-supplied `fileName` as `audit_logs.entity_id` (`VARCHAR(50)`, `schema/audit.ts:11`); `api/panel/products/import/commit/route.ts:21,29` passes it unbounded.
- **Scenario:** `products-2026-10-04 (reviewed, final version 2).csv` → all rows written, then the summary audit insert throws "Data too long", the whole import rolls back, the user sees "Something went wrong importing the file." Also lets anyone with `product.import` write arbitrary text into `entity_id`.
- **Fix:** Zod-parse `fileName` (trim, ≤ 200), store `entityId: "import"` plus the file hash prefix, keep the name in `new_values`. **Risk:** none. **Test first:** commit with a 60-char file name succeeds and writes the audit row.

### BUG-04 · HIGH · Phone layout: every click inside an order dialog navigates to the order
- **Where:** `src/components/panel/orders/OrdersTable.tsx:96-116`: `OrderCard` is `<li onClick={() => router.push(href)}>`; `<OrderDialogs>` (`:116`) is a direct child with no `stopPropagation` wrapper, and `Dialog.tsx:36` renders inline (no portal). The desktop row wraps it in `<td onClick={stop}>` (`:77-80`).
- **Scenario:** at phone widths tap the trash or status pill → the dialog opens → tap "Cancel order", the reason box, the backdrop or Confirm → the click bubbles to the card → `router.push` → staff are bounced to the detail page mid-action; a confirm click still fires the Server Action, so the order may be cancelled without staff seeing the result.
- **Fix:** wrap the card's `<OrderDialogs>` in a `<div onClick={stop}>`. **Risk:** none. **Test first:** jsdom component test rendering `OrderCard`, clicking inside the dialog must not call `router.push`.

### BUG-05 · MEDIUM (latent until a zone is switched to `flat`) · A flat-zone COD order is born `pending` with no forward move
- **Where:** `src/features/checkout/service.ts:160-161` (`shippingPending ? "awaiting_shipping_quote" : "pending"` regardless of payment method); `src/features/orders/transitions.ts:52-53,235-245,289-295` (`pending → processing` only via a verified screenshot; `approve` only from `awaiting_shipping_quote`; `fulfilmentTargets("pending")` is empty).
- **Scenario:** `/panel/shipping` switches Karachi to `flat`; a COD order lands in Need review; Approve is refused ("already approved"), Ship/Complete are not offered; only Cancel/Reject remain. The customer page says "Order approved" immediately. A flat-zone bank order sits in Pending delivery charge with an unreviewed goods screenshot until the customer uploads the second one.
- **Fix:** owner decision (Q1). Recommended: every new order starts in Need review (`awaiting_shipping_quote`) with `shipping_total` pre-set for a flat zone, and the Approve dialog pre-fills that charge. Alternative: let `approve` act on a `pending` COD order.
- **Risk:** medium (state machine + docs §4.2 step 8). **Test first:** flat-zone COD order must have a forward `statusActions` move and `approveOrder` must succeed.

### BUG-06 · MEDIUM · Orders search escapes nothing; five other searches miss `\`
- **Where:** `src/features/orders/staff-repo.ts:16`: `"\$&"` is `$&` in a JS string, so `%`/`_` stay wildcards (`_` matches every order). `catalog/staff-repo.ts:13`, `products-staff-repo.ts:20`, `wholesale/staff-repo.ts:12`, `discounts/staff-repo.ts:16`, `coupons/staff-repo.ts:15` escape `%`/`_` but not `\` (a trailing `\` swallows the closing `%`). `users/`, `audit/`, `catalog/repo.ts` are correct.
- **Fix:** one shared `likeContains()` helper (`src/lib/sql-like.ts`) used by all 9 repos. **Risk:** none. **Test first:** unit test for the helper; `listOrders(..., "_")` on two orders returns 0 in `staff.integration.test.ts`.

### BUG-07 · MEDIUM · No `error.tsx`, `global-error.tsx`, root `not-found.tsx`; panel `notFound()` renders Next's bare page
- **Where:** `src/app/**` has only `(store)/not-found.tsx`. `CartProvider.tsx:84-94` awaits the quote action inside a transition with no try/catch on every storefront page; a transient DB error there replaces the whole page with Next's default error screen. 8 panel `[id]` pages call `notFound()` outside the panel shell.
- **Fix:** `app/global-error.tsx`, `app/not-found.tsx`, `(store)/error.tsx`, `panel/(protected)/error.tsx`, `panel/(protected)/not-found.tsx`; try/catch the cart/checkout/wholesale transitions and keep the last good quote. Also add `src/instrumentation.ts` with `onRequestError` (ARCHITECTURE §7 says it exists; it does not). **Risk:** none.

### BUG-08 · MEDIUM · Panel search box drops keystrokes typed while a navigation is in flight
- **Where:** `src/components/panel/SearchBox.tsx:32-45`: when the URL's `q` arrives ("a") the render-time sync overwrites the newer local value ("ab") and the effect cleanup clears the pending timer; "b" is never searched. Shows whenever server latency exceeds the typing pause (shared hosting).
- **Fix:** track the last value this box pushed in a ref and only sync from the URL when it differs from that (back button), not on our own round trip. **Risk:** low. **Test first:** jsdom test: re-render with `initialQ="a"` while value is "ab" keeps "ab".

### BUG-09 · MEDIUM · Duplicate-key mapping is dead in the catalog services (Drizzle wraps driver errors)
- **Where:** `catalog/staff-service.ts:194,248`, `products-staff-service.ts:352,449`, `variants-staff-service.ts:55` check `errno` on the `DrizzleQueryError` wrapper; the mysql2 error is on `.cause` (coupons/users/roles/checkout unwrap it correctly).
- **Scenario:** two staff create the same slug/SKU inside the read-then-insert window (or CSV import, BUG-11) → unhandled 500 instead of the field error.
- **Fix:** one `isDuplicateEntry(error)` in `src/server/db/errors.ts`, used by all 8 sites. **Risk:** none. **Test first:** unit test with a wrapped error shape; integration test inserting a duplicate slug past the pre-check.

### BUG-10 · MEDIUM · CSV import puts new products at the top of the shop and featured order
- **Where:** `csv-import-service.ts:243-255` inserts without `sortOrder`/`featuredSortOrder` (default 0) and never runs placement, unlike `createProduct` (`applyShopPlacement`).
- **Fix:** append each new product with `{type:"end"}` placement (reuse the existing helpers). **Risk:** low. **Test first:** import two new products → their `sort_order` is after every existing product.

### BUG-11 · MEDIUM · CSV import SKU matching is case-sensitive in JS, case-insensitive in MySQL
- **Where:** `csv-import-service.ts:109` (in-file map by exact SKU), `:263` (`row.sku === entry.value.sku`) vs `getVariantBySku` and the unique index under `utf8mb4_unicode_ci`.
- **Scenario:** `abc-1` and `ABC-1` in one file pass the check and the second insert hits the unique index → 500 (BUG-09 makes it worse). DB `ABC-1`, file `abc-1` → "update" on check, insert on commit → 500.
- **Fix:** compare SKUs case-insensitively (uppercase key) in both passes; report the in-file collision as a row error. **Risk:** none. **Test first:** both scenarios in `csv.integration.test.ts`.

### BUG-12 · MEDIUM · Zone-level "COD off" shows the COD option and then the wrong message
- **Where:** `CheckoutForm.tsx:87,307` (`codOffered = features.cod && isPakistan`; the quote never returns `codAvailable`); `checkout/service.ts:157` maps every `!codAvailable` to the Pakistan-only message.
- **Scenario:** Pakistan zone `cod_enabled` off → a Lahore customer picks COD and is told "available in Pakistan only".
- **Fix:** return `codAvailable` in the quote (the zone is already resolved since S14), drive the radio from it, distinct server message. **Risk:** low. **Test first:** `quoteCart` with a COD-disabled zone → `codAvailable=false`; `createOrder` → a zone message, not the Pakistan one.

### BUG-13 · MEDIUM (visual) · `shadow-soft` is a no-op class in 14 panel files
- **Where:** `src/app/theme.css:72-73` declares `--shadow-soft`/`--shadow-lift` in `:root`, not `@theme`; the production CSS has `.shadow-\[var\(--shadow-soft\)\]` but no `.shadow-soft`. Sites: `panel/login/page.tsx:14`, `Dialog.tsx:44`, `Listbox.tsx:183`, `NotificationBell.tsx:174`, `OrderPrimaryActions.tsx:74`, both `StatusMenu.tsx`, `CountrySearch.tsx:45`, `WholesaleStatusActions.tsx:88`, and others.
- **Fix:** move the two shadow tokens into a `@theme` block. **Visible change:** panel dialogs, login card, listbox and menu popovers gain the soft shadow the code intended; storefront unchanged (it uses the arbitrary form). **Risk:** none.

### BUG-14 · LOW · Image uploader (and three siblings) hang if the Server Action rejects
- `ImageUploader.tsx:45-65` (`xhr.onload` awaits `addProductImageAction` with no try/catch; the promise never resolves, the file stays at "N%", the batch stops); same pattern in `ArrangeList.tsx:82-106`, `VariantsSection.tsx:42-61`, `ImagesSection.tsx:41-60`. Fix: try/catch → mark errored, resolve(false). Test: jsdom test with a rejecting action.

### BUG-15 · LOW · `after()` mail senders read the DB outside their try/catch
- `features/mail/service.ts:62-67,85-91,105-109,121-126`, `notify/service.ts:87`: a DB error there is only `console.error`'d by Next, no `notify.failed` row. Fix: wrap each body. Test: mock the read to throw → a `notify.failed` row exists.

### BUG-16 · LOW · Order export: `lte` on an exclusive bound; default dates use the browser's local/UTC day; `parseDayIndex` rolls invalid dates
- `orders/staff-repo.ts:301-302`, `api/panel/orders/export/route.ts:38`, `OrderExportDialog.tsx:10-14` (Karachi 00:00–05:00 → "To" is yesterday), `dashboard/ranges.ts:24-27` (`2026-13-45` accepted). Fix: `lt`, Karachi-offset defaults, round-trip date check. Test: an order at exactly `to` is excluded.

### BUG-17 · LOW · Expired `sessions` and `rate_limits` rows are never swept
- `server/auth/session.ts:59-60`, `server/rate-limit.ts` (DATABASE.md:25 claims a sweep). Dev DB already has 227 `rate_limits` rows. Fix: delete expired sessions on login, sweep `rate_limits` on the "start" branch (cheap, small table). The user-delete guard counting old sessions is by design (a user who ever signed in can only be deactivated).

### BUG-18 · LOW · Shop search drops a chosen "Newest" sort
- `components/store/catalog/ListingControls.tsx:16` keeps the hidden `sort` unless it equals `"newest"`; the default is `"recommended"`. Fix: compare against the default. Test: jsdom test on `SearchForm`.

### BUG-19 · LOW · Product quantity stepper ignores the 99-per-line cap
- `ProductPurchase.tsx:23` `Math.max(1, stock)`; the cart caps at `MAX_LINE_QUANTITY = 99` (`cart/schemas.ts:4`). Fix: `Math.min(99, stock)`.

### BUG-20 · LOW · Wholesale needed-by date accepts impossible dates
- `wholesale/schemas.ts:44` relies on `Date.parse` (`2026-02-30` → 2 March). Fix: the round-trip check from `lib/karachi-datetime.ts`. Test in `wholesale.test.ts`.

### BUG-21 · LOW · Duplicate React keys
- `CartNotices.tsx:9` (`key={notice.message}`, identical removal notices), `(store)/order/[orderNumber]/page.tsx:137` (`key={line}` on repeatable address lines). Fix: index-based keys for static lists.

### BUG-22 · LOW · Panel quick actions pass unvalidated `Number(formData.get("id"))` to SQL
- `products/actions.ts:24,33,39,45,52`, `users/actions.ts:18,27,35,41`, categories/coupons/discounts/roles equivalents; a tampered hidden input yields a driver error (500) instead of "not found". Fix: shared `z.coerce.number().int().positive()` parse in each action.

### BUG-23 · LOW · `NotificationBell.disable()` has no catch
- `NotificationBell.tsx:124-138`: a rejection becomes an unhandled promise, state stays "on". Fix: catch → message.

### BUG-24 · LOW · Wholesale export truncates at 5,000 silently
- `wholesale/staff-repo.ts:51`, `WholesalePageBody.tsx:68-73`: no truncation flag, audit row or UI note (the orders export has all three). Fix: mirror the orders export.

### BUG-25 · LOW · CSV round-trip nits
- `csv-import-schema.ts:136` truncates the label with `slice(0,150)` (can split a surrogate pair → "Incorrect string value") instead of reporting; `api/panel/products/export/route.ts:20` filename date is UTC; the product export ignores `truncated`. Fix each.

### BUG-26 · LOW · `addProductImage` deletes the uploaded files on every refusal, including "path already added"
- `images-staff-service.ts:115-117`: on `imagePathInUse` the files belong to an existing row and are unlinked. Only reachable by a replayed call. Fix: skip deletion for that refusal.

### BUG-27 · LOW · Category parent rules read outside the row lock
- `catalog/staff-service.ts:219-221`: two concurrent edits can create two-level nesting. Fix: read children/parent with `tx`.

### BUG-28 · LOW · Home page `<title>` and OG title come from `siteConfig`, not the settings reader (D56)
- `src/app/(store)/page.tsx:31`; the panel layout sets no `title` at all (`panel/layout.tsx:9`). Fix: `getStoreIdentity()` in the home `generateMetadata`; a `generateMetadata` on the protected panel layout.

### BUG-29 · INFO · A product or variant price of 0 is accepted
- `moneyField` has no minimum (`catalog/schemas.ts`); "0" sells for free. Possibly intentional (free items); owner question Q9.

**Verified fine (not findings):** `createOrder` transaction, lock order, deadlock retry, idempotent `checkout_token` race, concurrent last unit; every staff action re-validates under `SELECT … FOR UPDATE`; no `redirect()`/`notFound()` inside `try`; every `JSON.parse` of storage is guarded; DATE round-trips and every Karachi boundary (dashboard, order numbers, footer year) are explicit; dashboard sums go through `decimalToPaisa`, no divide-by-zero, "All time" with 0 orders; pagination clamps, past-the-end redirect, rows-per-page refined; every form's input names match its schema keys (full tables in the agent reports: 15 admin forms, 22 developer forms, 7 storefront forms, 0 mismatches); no nested `<form>`; no Server Component passes a function prop to a client component; submit buttons disabled while pending everywhere; Zod maxima fit their columns (the one exception is BUG-03).

---

## 3. Speed (production standalone build, this laptop, MySQL 8.4.3 local)

### Server timings and query counts ("before")
| Page | Warm median | Queries | Query time |
|---|---|---|---|
| `/` | 53 ms | 10 | 6 ms |
| `/shop`, `/category/*` | 35–60 ms | 10 | 4–8 ms |
| `/product/*` | 49–64 ms | 10 | 9–11 ms |
| `/cart`, `/checkout`, `/track`, `/wholesale`, `/contact` | 26–31 ms | 4–5 | 3 ms |
| `/panel` (dashboard) | 54–57 ms | 12–13 | 9–15 ms |
| `/panel/orders/bank` (25 rows) | 45 ms | 8 | 8 ms |
| `/panel/orders/cod/[n]` | 85 ms | 10 | 27 ms |
| `/panel/products`, `/panel/products/[id]` | 47–62 ms | 11–14 | 6–7 ms |
| every other panel list/edit page | 31–47 ms | 5–8 | 3–8 ms |

No N+1 anywhere: lists load variants/images with one `IN (...)` query per table. 141 distinct SELECTs were `EXPLAIN`ed; the full scans are all on tables of 2–471 rows where the optimizer rightly ignores the index.

### Browser metrics ("before", cache disabled; 375 px run throttled to ~1.6 Mbps / 150 ms RTT)
| Width | Path | TTFB | LCP | LCP element | CLS | Transfer | Console errors |
|---|---|---|---|---|---|---|---|
| 375 | `/` | 36 ms | 1676 ms | H1 | 0 | 710 KB | none |
| 375 | `/shop` | 24 ms | 4808 ms | card image (800 px) | 0.001 | 988 KB | none |
| 375 | `/product/*` | 24 ms | 3700 ms | gallery image (1200 px) | 0 | 694 KB | none |
| 375 | `/cart`, `/checkout` | 12–26 ms | 672–748 ms | text | 0.056 | 354–391 KB | none |
| 1440 | `/` | 30 ms | 404 ms | hero image (1200 px) | 0 | 705 KB | none |
| 1440 | `/shop`, `/product/*` | 32–39 ms | 252–360 ms | image | 0 | 577–644 KB | none |

Client JS: 167 KB gzip on every route (React + Next runtime; nothing app-specific is large); `/cart` adds 27 KB gzip (zod). CSS 13–14 KB gzip. The hero `preload` is the only preload (correct for LCP).

### SPD-01 · MEDIUM · The sidebar "needs action" count scans every order with two correlated subqueries, on every panel page and every 45 s poll
- **Where:** `features/orders/staff-repo.ts:120-131` (`countOrdersByState`: `GROUP BY` over all orders with `latestProofStatus()` per row for goods and delivery), called by `getOrderCountsForPermissions` from `panel/(protected)/layout.tsx:10` and `/api/panel/notifications`. Today: 517 rows examined, 5–15 ms at 134 orders; it grows linearly with every completed order forever.
- **Fix:** compute the proof-status grouping only for open orders (`awaiting_shipping_quote`, `pending`, `confirmed`, `processing`, `shipped`) and count closed orders with a plain `GROUP BY payment_method, order_status`; same result shape, same tests. **Risk:** low (tab counts must stay identical; `staff.integration.test.ts` covers every enum combination).

### SPD-02 · LOW · Four settings reads per storefront page
- `features/settings/service.ts`: one `SELECT … WHERE key = ?` per key (`contact`, `social_links`, `store_identity`, `announcement_text`) on every storefront request. Fix: one `cache()`d `loadAllSettings()` → `WHERE key IN (...)`. Saves 3 round trips (~2 ms); mostly tidiness.

### SPD-03 · MEDIUM · Home-page sections' images have no `sizes`, so phones download 1200 px files for 180 px cards
- `FeaturedSection.tsx:40-45`, `CollectionsSection.tsx:47-52`, `StorySection.tsx:35-40`, `WholesaleSection.tsx:54-60` emit a `1x/2x` srcset of the intrinsic width (the live HTML shows `…-1200.webp 1x, …-1200.webp 2x`). Fix: a `sizes` attribute per layout. Also set `images.deviceSizes: [400, 800, 1200]` and `imageSizes: [96, 200]` in `next.config.ts` so the srcset stops listing the same file under five different widths (the custom loader snaps to 400/800/1200 anyway). Expected: home mobile transfer 710 KB → ~350 KB; shop LCP on slow 4G improves (its cards already have `sizes`; the grid images themselves are the catalogue's JPEG-derived WebPs).

### SPD-04 · LOW · React re-render hot spots
- `CartProvider.tsx:129-168`: context value rebuilt with 10 fresh closures per render, no `useMemo`/`useCallback`; every `useCart()` consumer (header badge, each product card button, drawer, checkout) re-renders on any provider render. `HeroSection.tsx:34-39` sets state on every scroll event. Fix: memoise the value; rAF-throttled ref for the parallax, stop past the viewport.

### SPD-05 · LOW · `CheckoutForm.tsx:12` imports all of `config/site.config.ts` into the client bundle for one hint string
- Ships the bank placeholder and WhatsApp templates to the browser. Fix: pass `checkoutEmailHint` as a prop.

### SPD-06 · INFO · Indexes
- `orders` has no index on `payment_method`, so the per-method list count is a scan (134 rows, 1 ms); `audit_logs` list is a scan with filesort (471 rows, 8 ms). Both are fine at this store's scale and the migration cost is not justified now; revisit past ~20k rows.

### HERO-01 · owner request · Hard-coded hero images
- Today `src/app/(store)/page.tsx:20-23,46-56` takes the hero from the `decor` category image and the accent from `tea-sets`; the hero disappears if either category or its image is missing, and the OG image follows it.
- **Plan:** `public/hero/hero-main-{640,960,1200}.webp` and `public/hero/hero-accent-{288,576,864}.webp` generated with sharp from the two JPGs the owner placed in `public/hero/` (`hero_section.jpg` 1200×896 → main, `hero_floating.jpg` 1200×896 → accent; quality 80: 19/35/48 KB and 11/29/51 KB, all well under 200 KB); the two JPGs are then removed from `public/` (not tracked yet). A typed `HERO_IMAGES` constant in `src/config/home-content.ts` with a comment on how to change them; `HeroSection` renders them with `next/image`, `preload` (Next 16's replacement for the deprecated `priority`), a per-image `loader` that picks the nearest generated width, and `sizes="100vw"` / `"288px"`. The home `generateMetadata` uses the 1200 px main file's absolute URL for Open Graph. The hero no longer depends on any category or product. **Note:** the sources are 1200 px wide, so a 1440+ px desktop at 1× shows them slightly upscaled by `object-cover`; a 1920 px wide source (same framing, ≤ 200 KB as WebP) would be sharper (Q5).

---

## 4. Dead code

### DC-01 · 20 confirmed dead items (safe to delete)
- `src/features/catalog/schemas.ts:8` dead re-export `variantAttributesSchema`.
- 17 unreferenced `export type X = z.infer<…>` aliases: `cart/schemas.ts:47`; `catalog/schemas.ts:21,170,242,314,326,329,362`; `dashboard/schemas.ts:12`; `discounts/schemas.ts:136`; `roles/schemas.ts:45,54,62`; `settings/schemas.ts:48,127,163`; `shipping/schemas.ts:110`.
- `src/features/dashboard/chart.ts:102-105` `buildLinePath` (only its own test uses it; the chart uses the smooth variants).
- `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` (create-next-app scaffold, referenced nowhere).

### DC-02 · 168 declarations exported but used only in their own file
- Full list in the agent report (`scratchpad/deadcode/REPORT.md` §1b). Dropping `export` is mechanical and `tsc` guards it; the code itself is live. Owner question Q4.

### DC-03 · 10 unused `@theme` tokens
- `theme.css`: `--radius-sm/xl/2xl/3xl/4xl`, `--color-card-foreground`, `--color-accent`, `--color-accent-foreground`, `--color-ring-offset-background`, `--color-sand` (plus their light/dark `:root` values). Demo-ported palette; nothing references them. Delete.

### DC-04 · MEDIUM (launch hygiene) · Scaffold leftovers
- `src/app/favicon.ico` is the untouched Next logo from "Initial commit from Create Next App"; `README.md` is the template. Fix: a brand favicon (owner to supply, or a text-logo placeholder generated with sharp — Q6) and a short real README.

### DC-05 · Stale comments and rules
- "S10 phase 1/2/3a/3b" slice references in 11 files (`api/panel/uploads/route.ts:14`, `products/[id]/actions.ts:26,92`, `ArrangeList.tsx:23,60`, `ImagesSection.tsx:16`, `ImageUploader.tsx:11`, `ProductForm.tsx:56,241`, `VariantDialog.tsx:40`, `VariantsSection.tsx:18`); "exactly as the placeholder page did" `panel/(protected)/page.tsx:35`; the `[data-panel] select` rule in `theme.css:84` (no native `<select>` is left in the panel); `features/orders/staff-actions.ts` / `wholesale/staff-actions.ts` are services named like Server Actions (leave; renaming touches 20 imports for no behaviour gain).

### DC-06 · Keep (documented extension points)
- `static_pages` table (DATABASE.md:81, D57): zero code imports, kept by owner decision. `validatePages` is a test-enforced content lint. `flat` shipping mode is exercised by tests and the zone editor. Tests-only exports (63) are legitimate.

### Confirmed clean
- `tsc` with `noUnusedLocals`/`noUnusedParameters`: zero diagnostics. 0 unimported production files, 0 unused dependencies, 0 unread or undocumented env vars, 0 unused config fields, 47/47 icons used, 6/6 CSS utilities used, 0 `any`, 0 `@ts-ignore`, 0 non-null assertions, 0 commented-out code, 0 stale redirects, TODOs only the four owner-review placeholders in `src/content/pages.ts:42,72,85,106`.

---

## 5. Code quality and accessibility

### QA-01 · HIGH (a11y) · Dialogs and drawers do not trap or restore focus
- `components/panel/Dialog.tsx:23-31` (focus + Esc only; the backdrop `<button>` is the first tab stop), `store/cart/CartDrawer.tsx:20-33` (same), `orders/ProofImage.tsx:27-32` and `PanelSidebar.tsx:104-113` mobile drawer (no role, no Esc, no focus move). Fix: one `useModal(ref, open, onClose)` hook: remember `activeElement`, trap Tab, Esc, restore focus, `inert` the shell while open. Risk: low–medium (the status menus portal outside the dialog).

### QA-02 · MEDIUM · Error messages are not announced
- 60 inline `<p className="text-destructive">{error}</p>` with no `role="alert"`; `FormNotice` (`FormField.tsx:20-25`, `role="status"`) exists but is used in 3 forms. Fix: use `FormNotice`/`role="alert"` everywhere; `FormField` error `<p>` gets an `id` wired to `aria-describedby`/`aria-invalid`.

### QA-03 · MEDIUM · Unlabelled textareas, header menu button
- Placeholder-only textareas: `orders/detail/ActivityCard.tsx:41`, `wholesale/detail/ActivityCard.tsx:41`, `ScreenshotReview.tsx:31`. `store/Header.tsx:84-86` menu button lacks `aria-expanded`/`aria-controls`/`type="button"` and Esc; `PanelHeader.tsx:14-22` lacks `aria-expanded`.

### QA-04 · MEDIUM · Layering slips
- `ProductsPageBody.tsx:15` and `products/arrange/page.tsx:9` import a repo directly; `orders/actions.ts:16` imports a repo (SEC-07); `api/panel/orders/export/route.ts:33-52` holds date defaulting and the audit transaction. Fix: move each into its service.

### QA-05 · MEDIUM · Contrast
- Storefront: `text-destructive` on light backgrounds 4.47:1 (118 uses; 4.5 needed); `WholesaleSection.tsx:34` eyebrow in `text-champagne` 2.03:1 (every other eyebrow uses `.eyebrow`, 5.19:1); WhatsApp white glyph on `#25d366` 1.98:1 (graphic). Panel dark: `destructive-foreground`/`destructive` 3.68:1, `muted-foreground`/`secondary` 4.35:1. Fix: nudge the red (`--destructive`) and the dark `--muted-foreground`; use `.eyebrow` on the wholesale section. The storefront palette is demo-derived, so the red change needs owner sign-off (Q7).

### QA-06 · LOW · Reduced motion not honoured
- `theme.css` `rise`/`float-soft`/`tilt-card`/`scroll-behavior: smooth`, `HeroSection` parallax, `FloatingActions`; only `Skeleton.tsx` opts out. Fix: `@media (prefers-reduced-motion: reduce)` block + a `matchMedia` guard on the parallax.

### QA-07 · LOW · Heading structure
- Two `<h1>` on most panel pages (`PanelHeader.tsx:23` + each page's own title); `home/WhySection.tsx:16` orphan `<h3>`. Fix: the header's title becomes a `<p>`/`<div>` (or `aria-hidden`), `WhySection` uses `<h2>`/`<h3>` in order.

### QA-08 · LOW · Panel pages have no `<title>`; `document.title` set by effect
- 35 pages; `PanelPageTitle.tsx:9` sets the visible title in an effect (first paint empty). Fix: static `metadata.title` per page plus a `title.template` on the protected layout (BUG-28).

### QA-09 · LOW · Shared helpers worth extracting (3+ copies each)
- `StaffActionResult` ×3 + 10 re-exports, `XActionError` ×12, `invalid(ZodError)` ×12, `refused` ×6, `DUPLICATE_ENTRY` ×8 (→ `features/shared/staff-result.ts`, `server/db/errors.ts`); page-size tuple `[25,50,75,100]` + refine ×8 and `pageCount` formula ×5 (→ `features/shared/pagination.ts`); Karachi `Intl.DateTimeFormat` factory ×5 (→ `lib/karachi-datetime.ts`); pill colour triples ×5; `inputClass` re-declared ×7 (+ a second variant ×9); `fieldErrorsOf` lives in `checkout/schemas.ts` but is used by 5 unrelated modules (→ `lib/field-errors.ts`); `toPricingCoupon` ×2; country-name lookup ×4.

### QA-10 · LOW · Files to split (> 400 lines, non-test)
- `features/catalog/products-staff-service.ts` (555): readers → `products-staff-readers.ts`, placement helpers → `arrange-service.ts`. `features/shipping/staff-service.ts` (446): `testDestination` + readers → `staff-readers.ts`. `components/store/checkout/CheckoutForm.tsx` (421): payment section and address fields into two child components.

### QA-11 · LOW · Deferred (not for this pass)
- The eight near-identical `*PageBody.tsx` / `*Table.tsx` / `*TableSkeleton.tsx` / `*Tabs.tsx` families would benefit from a shared list shell, but the refactor touches every panel list at once for no behaviour change; do it when the next list feature arrives.
- Arbitrary Tailwind values (`text-[10px]` ×45, `tracking-[0.28em]` ×27 …) could become `@theme` tokens; cosmetic.

### Clean
- No native `<select>` in the panel; no pricing maths outside `features/pricing` (one display-only `toLocaleString` in `ProductForm.tsx:281` to replace with `formatMoney`); no `any`/`!`/`@ts-ignore`; no `!important`; no third-party scripts; consistent British spelling; every icon-only button named; every image has `alt`; `lang="en"`; live regions where state changes; `Listbox`/`StatusMenu` ARIA correct.

---

## 6. Fix plan (ordered; each step: failing test → fix → typecheck + lint + relevant tests)

### Group A: security
| # | Item | Files | Test that protects it | Could break |
|---|---|---|---|---|
| A1 | SEC-01 env file out of the bundle | `src/server/env.ts`, `scripts/build-standalone.mjs`, `package.json` (`start:standalone`) | build-script assertion; Phase 4 check of the standalone folder | local `start:standalone` must use the new script |
| A2 | SEC-02 headers + `poweredByHeader:false` | `next.config.ts` | header check on the standalone build; full click-through (uploads, polling, SW, proof preview) | a wrong CSP directive breaks a flow silently |
| A3 | SEC-03 dummy-hash verify | `features/auth/service.ts` | `change-password.integration.test.ts`/new login test: unknown email takes ≥ scrypt time | none |
| A4 | SEC-04 media upload caps | `server/storage/images.ts`, `api/panel/uploads/route.ts` | `images.test.ts`: SVG/TIFF refused, > 40 MP refused | genuine > 40 MP photo refused with a message |
| A5 | SEC-05/06 push endpoint https + cap; SW same-origin URL | `features/notify/schemas.ts`, `repo.ts`, `public/sw.js` | `notify.integration.test.ts` | none |
| A6 | SEC-07/BUG-22/QA-04 id parsing + authorise first | all panel `actions.ts`, `orders/staff-actions.ts` (return order number) | `staff.integration.test.ts`: tampered id → `{ok:false}`/not found | none |
| A7 | SEC-08/09/12/13/14 small hardening | `auth/service.ts`, `server/auth/password.ts`, `settings/schemas.ts`, `settings/staff-service.ts`, `users/staff-service.ts` | `password.test.ts` (malformed hash → false), `settings.integration` (bad social URL falls back), `users.integration` (last `role.manage` holder) | none |

### Group B: bugs (highs first)
| # | Item | Files | Test first | Could break |
|---|---|---|---|---|
| B1 | BUG-01 cart wipe | `features/cart/{schemas,service}.ts`, `CartProvider.tsx`, `CheckoutForm.tsx`, `forms/fields.tsx` | cart quote: invalid phone/destination → `ok:true`; corrupt lines → `cart_unreadable` | cart behaviour on a truly corrupt store (kept) |
| B2 | BUG-02 zone stale token | `features/shipping/staff-service.ts` | `shipping.integration`: unsorted areas → edit saves | none |
| B3 | BUG-03 CSV file name | `csv-import-service.ts`, `import/commit/route.ts` | `csv.integration`: 60-char name commits | none |
| B4 | BUG-04 phone card dialogs | `OrdersTable.tsx` | jsdom `OrdersTable.test.tsx` | none |
| B5 | BUG-06 LIKE helper | `src/lib/sql-like.ts` + 9 repos | unit + `staff.integration` `_` search | none |
| B6 | BUG-09/11 duplicate-key unwrap, SKU case | `server/db/errors.ts`, 5 catalog services, `csv-import-service.ts` | unit for the helper; `csv.integration` both SKU cases; `products.integration` duplicate slug past the pre-check | none |
| B7 | BUG-10 import placement | `csv-import-service.ts` | `csv.integration`: new products appended at the end | none |
| B8 | BUG-12 zone COD-off | `cart/service.ts`, `CheckoutForm.tsx`, `checkout/service.ts` | `quoteCart` `codAvailable`; `createOrder` message | checkout UI copy for a COD-off zone |
| B9 | BUG-07 error/not-found boundaries + `instrumentation.ts`; transitions try/catch | `src/app/{global-error,not-found}.tsx`, `(store)/error.tsx`, `panel/(protected)/{error,not-found}.tsx`, `src/instrumentation.ts`, `CartProvider.tsx`, `CheckoutForm.tsx`, `WholesaleForm.tsx` | manual (Phase 4: force an error, open `/panel/users/999999`) | none |
| B10 | BUG-08 SearchBox race | `components/panel/SearchBox.tsx` | jsdom `SearchBox.test.tsx` | back-button sync (covered by the test) |
| B11 | BUG-13 `shadow-soft` token | `theme.css` | visual check (panel dialogs gain the shadow) | none |
| B12 | BUG-14/23 client promise handling | `ImageUploader.tsx`, `ArrangeList.tsx`, `VariantsSection.tsx`, `ImagesSection.tsx`, `NotificationBell.tsx` | jsdom test for the uploader with a rejecting action | none |
| B13 | BUG-15 `after()` try/catch | `features/mail/service.ts`, `notify/service.ts` | `mail.integration`: throwing read → `notify.failed` row | none |
| B14 | BUG-16/25 export bounds, dates, truncation flags | `orders/staff-repo.ts`, `export/route.ts`, `OrderExportDialog.tsx`, `dashboard/ranges.ts`, `csv-import-schema.ts`, `products/export/route.ts`, wholesale export (BUG-24) | `export-slip.integration`: boundary order excluded; `ranges.test`: `2026-13-45` refused | none |
| B15 | BUG-17 sweeps | `server/auth/session.ts`, `server/rate-limit.ts` | `rate-limit.test`/integration: expired rows gone after a start | none |
| B16 | BUG-18/19/20/21/26/27/28 small fixes | `ListingControls.tsx`, `ProductPurchase.tsx`, `wholesale/schemas.ts`, `CartNotices.tsx`, order page, `images-staff-service.ts`, `catalog/staff-service.ts`, `(store)/page.tsx`, `panel/(protected)/layout.tsx` | `wholesale.test` (impossible date); jsdom `SearchForm` keeps Newest; `images.integration` (in-use path keeps files) | none |
| B17 | BUG-05 flat-zone COD (after Q1) | `checkout/service.ts`, `orders/transitions.ts`, `ApproveDialog.tsx`, docs §4.2 | `checkout`+`staff` integration: flat COD order has a forward move | state machine; every-enum-in-one-tab test must stay green |

### Group C: speed and hero
| # | Item | Files | Test | Could break |
|---|---|---|---|---|
| C1 | SPD-01 counts query | `orders/staff-repo.ts`, `staff-service.ts` | `staff.integration` tab counts (every enum combination) | tab counts |
| C2 | SPD-03 `sizes` + `deviceSizes` | 4 home sections, `next.config.ts` | `image-loader.test`; before/after transfer table | none |
| C3 | SPD-02 settings batch read | `settings/{repo,service}.ts` | `settings.integration` readers unchanged | fallback per key must stay |
| C4 | SPD-04/05 memoised cart context, parallax via rAF, hint prop | `CartProvider.tsx`, `HeroSection.tsx`, `CheckoutForm.tsx`, checkout page | existing component tests; click-through | none |
| C5 | HERO-01 | `public/hero/*.webp`, `config/home-content.ts`, `HeroSection.tsx`, `(store)/page.tsx` | `metadata.test` (OG image URL); visual at 375/1440 | home hero visuals (intended) |
| C6 | Re-measure: server table, vitals table, bundle table | — | — | — |

### Group D: dead code
D1 DC-01 delete the 20 items (+ `buildLinePath` tests). D2 DC-03 remove 10 theme tokens. D3 DC-04 favicon/README (favicon per Q6). D4 DC-05 stale comments and the dead `select` rule. D5 DC-02 drop `export` on the 168 declarations (per Q4). Each followed by typecheck/lint/full tests.

### Group E: quality
E1 QA-01 `useModal` hook for Dialog, CartDrawer, ProofImage, mobile sidebar. E2 QA-02/03 `role="alert"`/`FormNotice`, textarea labels, `aria-describedby`, header button ARIA. E3 QA-06/07/08 reduced motion, headings, panel `metadata.title`. E4 QA-04 layering moves. E5 QA-09 shared helpers (staff result/error, duplicate-entry, pagination, Karachi formatter, pill colours, `inputClass`, `fieldErrorsOf`, `formatMoney` in `ProductForm`). E6 QA-10 three file splits. E7 QA-05 contrast: panel dark tokens + wholesale eyebrow now; storefront red per Q7.

### Group F: docs and deploy prep
F1 `docs/DEPLOY.md` (Phase 5 scope, plus the `X-Forwarded-For` check from SEC-15 and the env-file rule from SEC-01). F2 BUILD_PLAN S22 done/S23 next; ARCHITECTURE D61 + §7 corrections (`instrumentation.ts`, error pages, build script, start command, headers policy, flat-zone rule if Q1 changes it); DATABASE.md rate-limit sweep sentence; CLAUDE.md standing rules (security headers live in `next.config.ts` and are checked on the standalone build; never import `load-env` from app code; `shadow-*` tokens belong in `@theme`; `likeContains` for every LIKE). F3 Optional `npm run db:seed -- --no-samples` (roles, permissions, users, zones, settings only; no catalogue, no `design-reference` images) for a clean production database (Q8).

### Phase 4 verification (after all groups)
typecheck, lint, full suite with count; `build:standalone`; header check; standalone refuses to boot without `SESSION_SECRET` (and with `UPLOAD_DIR` inside the repo); browser click-through of every flow at 1440/375, light/dark, console errors, document-scroll probe on panel pages, every redirect and 403; `npm audit`; restore the dev database (reset scripts + `db:seed`) and report; remove temporary scripts/logs; stop every server and headless Chrome.

---

## 7. Owner questions (blocking only where marked)

- **Q1 (blocks B17 only).** Flat-zone orders: start every new order in Need review with the zone's charge pre-filled in the Approve dialog (recommended, uniform), or keep `pending` and add an "approve" move for a pending COD order? Flat mode is unused at launch, so this can also wait.
- **Q2.** CSP: static policy with `'unsafe-inline'` scripts (no `proxy.ts`, keeps D18; blocks framing, foreign scripts/connections, form posts elsewhere) — recommended now. A nonce-based strict CSP needs `proxy.ts` and is a separate decision.
- **Q3.** HSTS without `includeSubDomains` (recommended, safe for any other subdomain on the same domain); 180-day max-age.
- **Q4.** Drop the superfluous `export` keyword on 168 declarations (mechanical, tsc-guarded)? Recommended yes.
- **Q5.** Hero sources are 1200×896. I will ship WebP sizes from them; a 1920-wide version of `hero_section.jpg` (same framing, ≤ 200 KB as WebP) would be sharper on large screens if you have one.
- **Q6.** Favicon: supply a brand icon (PNG/SVG, square), or I generate a plain "RS" wordmark icon with sharp as a placeholder?
- **Q7.** Storefront contrast: may I darken the error red slightly (4.47 → ≥ 5:1) and switch the wholesale section eyebrow to the standard `.eyebrow` style? Both are tiny visible changes to demo-derived tokens.
- **Q8.** Add `db:seed -- --no-samples` for the production database (otherwise production starts from a `mysqldump` of the locally prepared database, as ARCHITECTURE §7 step 5 says)?
- **Q9.** Should a product/variant price of 0 be refused (`> 0`)?
- **Q10.** Keep this report file after the pass, or delete it?

No critical findings. Highs: SEC-01, BUG-01, BUG-02, BUG-03, BUG-04 and the a11y QA-01. Stopping here for approval before changing code.
