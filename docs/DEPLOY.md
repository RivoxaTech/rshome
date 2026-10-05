# Deploying to cPanel

How the standalone build gets onto a cPanel host (Passenger, CloudLinux Node selector) and how to check it once it is there. The reasoning behind each rule is in `ARCHITECTURE.md` §6, §7 and D61; this file is the checklist. Nothing here is ever run on the host's shell except where it says so: there is no on-server build, no `npm install` on the host and no background process (CLAUDE.md).

## 1. What you need

- cPanel with the Node.js selector (Passenger), Node 20.9 or newer, glibc 2.26 or newer, an upload body limit of at least 6 MB (mod_security) and SSL on the domain (AutoSSL is fine).
- A MySQL or MariaDB database and a user with full rights on it, plus either Remote MySQL (to migrate from your machine) or SSH.
- A mailbox on the domain for `SMTP_*`/`MAIL_FROM` (cPanel Email Accounts).
- A Linux machine to build on: GitHub Actions, WSL or Docker. A Windows build bundles win32 sharp binaries that will not run on the host.
- A password manager entry for the production environment variables (section 4): they live only in cPanel's Node app screen, so there is no file to recover them from.

## 2. Build (Linux only)

```
npm ci
npm run build:standalone
```

`scripts/build-standalone.mjs` runs `next build`, copies `public/` and `.next/static` into `.next/standalone`, then deletes every `.env*` file it finds there and fails if one remains (SEC-01: secrets never travel with the bundle; the host's env vars are the only source). Before zipping, check:

```
ls -a .next/standalone | grep '^\.env'            # must print nothing
ls .next/standalone/node_modules/@img/            # must list a linux-x64 sharp package, not win32
cd .next/standalone && zip -qr ../../rshome-$(git rev-parse --short HEAD).zip . && cd ../..
```

Keep the previous zip until the new one has passed the smoke test (section 8).

## 3. Layout on the host

The Node selector refuses a `node_modules` folder in the application root, so the bundle lives one level down:

| Path | What |
|---|---|
| `~/rshome/` | Application root in the Node app screen. Contains `app/` and the `tmp/` folder Passenger uses for restarts. |
| `~/rshome/app/` | The unzipped bundle: `server.js`, `node_modules/`, `.next/`, `public/`. Startup file: `app/server.js`. |
| `~/rshome-uploads/` | `UPLOAD_DIR`. Outside the application root, so a redeploy never touches it and nothing in it is ever a static file. The app creates `media/` and `proofs/` inside it; `mkdir -p ~/rshome-uploads` is enough. |

First deploy: create the Node app in cPanel (Application mode Production, root `rshome`, startup file `app/server.js`), upload the zip into `~/rshome/app/` with the File Manager and extract it there. Redeploy: extract the new zip over the old `app/` (or move the old one aside first for a quick rollback, section 9).

## 4. Environment variables

Set every variable in the Node app screen, never in a file on the host. `ARCHITECTURE.md` §6 explains each one; the production notes are:

| Variable | Production |
|---|---|
| `NODE_ENV` | `production` (the selector's Production mode sets it; check it is there). Without it the security headers are not sent and the production-required checks below are skipped. |
| `DATABASE_URL` | `mysql://user:pass@localhost:3306/<cpaneluser>_rshome`. The database must be `utf8mb4_unicode_ci` (section 5). |
| `SESSION_SECRET` | 32+ random characters, generated once: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Changing it signs every staff member out and invalidates order-access cookies and in-flight proof tokens. |
| `UPLOAD_DIR` | The absolute path of `~/rshome-uploads` (for example `/home/<cpaneluser>/rshome-uploads`). The app refuses a path inside the folder the server runs from (the bundle, `~/rshome/app`); keep it outside the application root as well, so a redeploy or a zip of the app can never touch it. |
| `APP_URL` | `https://<domain>` with no trailing slash. It is the only allowed Origin for state-changing requests, so a wrong value breaks every form and upload. |
| `ALLOWED_ORIGINS` | Leave unset unless a second hostname must also post forms. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Required in production: the app refuses to start without them. Use the domain's own mailbox: host `mail.<domain>` (or what cPanel's "Connect Devices" page shows), port 465, the full mailbox address as user, `MAIL_FROM` the same address. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Required in production. Generate once with `npx web-push generate-vapid-keys` on your machine; `VAPID_SUBJECT` is `mailto:<owner address>`. **Never regenerate the production pair**: every staff device that enabled notifications is bound to it and would silently stop receiving pushes. Store both keys in the password manager. |
| `NODE_OPTIONS` | `--max-old-space-size=256`. |
| `PORT`, `HOSTNAME` | Do not set. Passenger provides the port it expects the standalone server to listen on. |

Do not set `TEST_DATABASE_URL` or any `SEED_*` variable on the host; the seed runs from your machine (section 5).

## 5. Database

1. In cPanel MySQL Databases create the database and user. Open phpMyAdmin and run `ALTER DATABASE \`<name>\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` if the collation shown is not already that one (`scripts/migrate.ts` fixes an empty database itself but refuses one with tables and the wrong collation).
2. In Remote MySQL add your current IP, then from the project folder on your machine run the migrations against the host. A variable set in the shell wins over `.env.local`, so nothing local needs editing:

   ```
   DATABASE_URL="mysql://user:pass@<host>:3306/<name>" npm run db:migrate
   ```

3. Seed the fixed rows only. `--no-samples` writes permissions, the two system roles, the two staff users from `SEED_*`, the three shipping zones and the settings keys, and nothing else: no categories, products or images, no `[Sample]` discount, no `WELCOME10` coupon. It creates what is missing and never deletes or overwrites anything, so it is safe to re-run after an upgrade that adds a permission key.

   ```
   DATABASE_URL="mysql://…" SEED_DEVELOPER_EMAIL=… SEED_DEVELOPER_PASSWORD=… SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed -- --no-samples
   ```

   Then sign in and change both passwords on `/panel/account`, replace the `[PLACEHOLDER]` bank account on `/panel/settings/bank`, and fill the contact, social links and alert recipients on `/panel/settings`.
4. Alternative for a catalogue prepared locally (ARCHITECTURE.md §7 step 5): `mysqldump` the local `rs_home` database, import it in phpMyAdmin, and zip `UPLOAD_DIR/media` locally and extract it into `~/rshome-uploads/media`. Run `db:seed -- --no-samples` afterwards anyway; it changes nothing that already exists. Never import a local dump that still holds demo orders or the `db:seed:*` demo rows.
5. Remove your IP from Remote MySQL.

Later schema changes: back up first (section 10), run step 2 again with the new build's migrations, then restart. Migrations are forward-only (Drizzle has no down step), so a rollback that needs the old schema is a restore of that backup.

## 6. Start, restart, logs

Restart from the Node app screen, or over SSH with `touch ~/rshome/tmp/restart.txt`. The app validates its environment when the first route loads, not before it starts listening: with a variable missing or invalid, the process stays up but every request answers 500 and `~/rshome/stderr.log` (the log the Node app screen links to) shows `Invalid environment variables` naming the variable (checked on the standalone build, S22 Phase 4). So a site that returns 500 everywhere right after a deploy means an env var, not a crash. Unhandled request errors are logged there too, one line each with method, path and digest, never a body or cookie (`src/instrumentation.ts`). There is nothing else to tail: no cron, no queue, no worker.

## 7. Deploy-day checks

Run these after every deploy, from your machine, against the real hostname.

**Health**

```
curl -s https://<domain>/api/health        # {"db":true,"uploads":true}, HTTP 200
```

`uploads:false` means `UPLOAD_DIR` is wrong or not writable; `db:false` means `DATABASE_URL`.

**Security headers** (`src/config/security-headers.ts`, sent only with `NODE_ENV=production`):

```
curl -sI https://<domain>/ | grep -iE '^(content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|strict-transport-security|x-powered-by):'
```

Expect exactly six lines and no `x-powered-by`. Repeat for `/panel/login` and `/api/health`. The CSP allows nothing third-party, so if the host injects a script or stylesheet (a "powered by" badge, an analytics snippet), the page will show CSP errors in the browser console: turn the injection off in cPanel rather than loosening the policy. If Apache adds its own `Strict-Transport-Security`, two values appear; remove the Apache one.

**Client IP (SEC-15)**: the rate limits key on the last `X-Forwarded-For` entry and fall back to the literal `unknown`. If the proxy does not send the header, every customer shares one bucket and the site allows ten checkouts per 15 minutes in total. Sign in to the panel once, then in phpMyAdmin:

```
SELECT ip, user_agent, created_at FROM sessions ORDER BY created_at DESC LIMIT 1;
```

`ip` must be your public address. If it reads `unknown`, do not launch until the host confirms Passenger forwards the client address.

**Smoke test** (sign in as each seeded user):

1. `/panel/login` as the Developer: wrong password refused, right one lands on `/panel/products`.
2. Create a category with an image and a product with an image (this proves sharp runs on the host); open it on the storefront; both images render at 400/800/1200 widths.
3. As a customer: add it to the cart, place a COD order, then a bank-transfer order with a screenshot upload; the order page shows the bank details and the uploaded proof's status.
4. As the Admin: both orders are in Need review; open the bank order, view the screenshot (it streams through `/api/files/proof`, never a public URL), approve with a delivery charge, ship, complete; reject the COD order with a reason and check its stock came back.
5. Emails: the customer address used in step 3 received "order received" and "approved"; `/panel/settings` → "Send test email" arrives.
6. Push: on a phone over HTTPS, the bell in the panel header → Enable notifications, then "Send test notification". This is the one check that cannot be done on localhost.
7. Restart the app from the Node app screen; the site answers within a few seconds and staff are still signed in.
8. `/panel` as the Admin at 375 px wide: no sideways scroll, menus open and close.
9. Delete the test category, product and orders afterwards (orders: cancel or reject, they are kept by design).

## 8. Updating

1. Build and zip on Linux (section 2); keep the old zip.
2. Back up the database (section 10) if the release carries a migration (`drizzle/` has a new file).
3. Run the migration from your machine (section 5, step 2).
4. Upload and extract the zip into `~/rshome/app/`, replacing the old files. `UPLOAD_DIR` is untouched.
5. Restart, then run section 7's health and header checks and as much of the smoke test as the change warrants.

## 9. Rollback

Extract the previous zip over `app/` and restart. If the release's migration must also be undone, restore the backup from step 8.2 first; a migration that only added a column or table can stay in place, since the previous build ignores it.

## 10. Backups

- Database: a daily cPanel cron, kept 14 days:

  ```
  mysqldump --single-transaction --default-character-set=utf8mb4 <name> | gzip > ~/backups/rshome-$(date +\%F).sql.gz && find ~/backups -name 'rshome-*.sql.gz' -mtime +14 -delete
  ```

  cPanel's cron reads the MySQL credentials from `~/.my.cnf` (mode 600) so the password is not in the crontab line.
- Uploads: a weekly `tar -czf ~/backups/uploads-$(date +\%F).tgz -C ~ rshome-uploads` with the same rotation. Payment screenshots exist nowhere else.
- Copy the newest pair off the server once a month, and restore one into a scratch database once to prove the dump is readable.
- The app folder is not backed up: it is rebuilt from git. The environment variables are in the password manager (section 1).
