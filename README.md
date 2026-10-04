# RS HOME Store

A reusable e-commerce base for small stores, built first for RS HOME (home decor and tableware, Karachi). One Next.js app serves the storefront, the admin panel, the developer panel and the API. There is no payment gateway: customers pay cash on delivery or by bank transfer with a screenshot that staff verify in the panel.

## Stack

Next.js (App Router) with TypeScript, Tailwind CSS, MySQL or MariaDB through Drizzle ORM, Zod at every boundary, sharp for images. Deployed to cPanel shared hosting as a standalone build.

## Documents

Read these first, in order:

- `docs/REQUIREMENTS.md`: what the store does and the open questions.
- `docs/ARCHITECTURE.md`: layers, key flows, environment variables, build and deploy, decisions log.
- `docs/DATABASE.md`: schema and conventions.
- `docs/BUILD_PLAN.md`: slice order, status and the owner's answers.
- `CLAUDE.md`: the project's working rules and the full list of npm scripts.

## Getting started

1. Copy `.env.example` to `.env.local` and fill it in (`docs/ARCHITECTURE.md` section 6 explains each variable).
2. `npm install`
3. `npm run db:migrate` then `npm run db:seed` (roles, permissions, two staff users, shipping zones, settings and a sample catalogue).
4. `npm run dev` and open `http://localhost:3000` (storefront) or `http://localhost:3000/panel` (staff login).

## Everyday commands

- `npm run dev`: local development.
- `npm run typecheck`, `npm run lint`, `npm test`: checks; the integration tests need `TEST_DATABASE_URL` and `npm run db:migrate:test` once.
- `npm run build:standalone && npm run start:standalone`: the production build, run locally.

The `db:seed:*` and `db:reset:*` scripts load and remove demo data for manual QA; `CLAUDE.md` describes each one.
