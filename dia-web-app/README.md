# Dia — Desktop fashion website and secure account system

Dia is a multi-page fashion and streetwear website built with standalone HTML documents and the existing Express/SQLite service. The storefront and administrator dashboard use a forest-green and gold visual system, Cormorant Garamond display type, Manrope interface type, device-aware light mode, and reduced-motion support. The storefront includes a timed editorial slideshow, database-backed catalog and bag, demo checkout, and SQLite newsletter signup. The protected administrator dashboard includes live store records, charts, order filters, top products, and clearly marked sample preview values where no records exist.

## Pages and structure

- index.html — self-contained Dia storefront with editorial slideshow, new arrivals, looks gallery, newsletter form, and account-backed bag.
- js/storefront.js — database-backed catalog, product quick view, customer bag, and account-aware navigation.
- `login.html` — role-aware customer/admin sign-in.
- `register.html` — separate customer registration page using the same secure API and shared visual system.
- `admin-login.html` — dedicated administrator sign-in.
- `forgot.html` — password-recovery information.
- `dashboard.html` — protected customer dashboard.
- `admin.html` — self-contained, protected administrator dashboard with responsive navigation, live stats, charts, orders, customers, and inventory summary.
- `css/style.css` — shared visual rules for the existing customer sign-in and account pages. The new storefront and administrator dashboard have their own inline styles and scripts.
- `js/auth.js` — shared CSRF-aware API requests, form feedback, loading states, password toggle, and role redirects.
- js/fashion.js — one-shot cinematic cutscene with optional Web Audio cues, mute, skip, and reduced-motion support.

## Authentication

The customer sign-in and registration experiences are separate HTML pages (`/login` and `/register`), not a single-page application. Both use the shared `js/auth.js` helpers and the database-backed Express API.

Dia uses the Express and SQLite backend. The browser never contains hard-coded users or passwords. Customer login is tried first; when it returns `INVALID_CREDENTIALS`, the role-aware flow tries the administrator endpoint. Only the server can grant administrator access after checking the stored active role.

Administrator identifiers are plain text and accept a trimmed username or email, case-insensitively. The existing `milesadmin` account is supported without an `@` character. Customer registration runs on its own page and validates the email and password rules separately; usernames remain plain-text identifiers and do not require an `@` character.

The backend maintains CSRF protection, server-backed sessions, expiry, logout invalidation, and protected user/admin routes. A customer cannot access the admin console or APIs.

## Run locally

From this directory, run:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd start
```

Then open `http://localhost:3000`. Do not open HTML files directly or use a static-only host, because authentication requires the Express API.


## Storefront experience

To seed the example inventory without creating demo accounts, run npm.cmd run products:seed. The homepage includes four SVG line-art category shortcuts (Dresses, Shoes, Bags, and Eyewear) and loads its product catalog from the Express /api/products endpoint. Product details and the signed-in customer's bag are read from SQLite through the existing store API; bag changes require an authenticated session and CSRF token. The browser does not use local storage as an account or cart database. Product and campaign photographs use the existing Dia editorial imagery and Unsplash image URLs. The storefront shows sample-only preview cards when the live catalog does not contain a tee, tote, cap, or chinos match; those preview cards are not purchasable. Add actual inventory in the administrator tools to make each piece available.

The cinematic introduction is armed only after a successful customer password, registration, or verified Google sign-in. It consumes a one-shot sessionStorage flag before playback, so visiting the homepage directly, refreshing after the cutscene, and ordinary navigation do not replay it. Audio starts muted. A visitor must explicitly press the sound control to enable the subtle Web Audio transition cue; the skip control and reduced-motion preference remain available.

## Demonstration accounts (opt-in only)

Demo accounts are disabled by default and cannot be seeded in production. For local development only, run this from the dia-web-app folder:

    npm.cmd run demo:setup

The setup script creates or reuses a private, ignored .env, generates separate high-entropy passwords for the demo customer and demo administrator, seeds the sample catalog, and stores bcrypt password hashes in SQLite. Read the generated values from your local .env; the command does not print the passwords. The default login identifiers are demo@example.test for the customer and admin.demo@example.test for the administrator. Use the normal customer sign-in or administrator sign-in flows. Existing accounts and the configured milesadmin account are not overwritten.

To disable demo accounts and revoke their active sessions, run:

    npm.cmd run demo:disable

Do not copy demo passwords into source files, screenshots, commits, or production configuration. .env is ignored by Git. Direct seeding requires ENABLE_DEMO_ACCOUNTS=true, NODE_ENV=development, and explicit DEMO_USER_PASSWORD / DEMO_ADMIN_PASSWORD values.

## Image credits

Editorial model photography is served from Unsplash and remains subject to the Unsplash License. Image pages: [Lena Ruffinatto — cream fashion editorial](https://unsplash.com/photos/woman-in-a-cream-strapless-top-and-skirt--q8oGG77eM8), [cream outfit editorial](https://unsplash.com/photos/a-woman-in-a-cream-colored-outfit-poses-by-a-door-S1bU98zr4k0), and [outdoor fashion editorial](https://unsplash.com/photos/a-woman-poses-in-a-park-on-a-sunny-day-B-k-QWCgb-8).

## Recovery note

A password-reset email delivery provider is not configured. The recovery page explains this and directs account holders to the secure administrator process; it does not pretend a reset email was sent.


## Storefront and administrator dashboard

The storefront homepage and protected admin dashboard are each self-contained HTML pages with inline styles and JavaScript. Express injects a fresh per-response CSP nonce into each inline script, so the pages do not require an unsafe-inline script policy. The shared backend keeps customer sessions, products, cart items, orders, newsletter signups, and admin records in SQLite. Newsletter signups are normalized, unique by email, CSRF-protected, and rate-limited.

The dashboard calls the protected admin APIs for statistics, analytics, orders, products, and customers. Completed order value is not reported as money collected: payment collection remains unavailable until a verified payment provider is integrated. Refund rate is based on refunded order status; customer return tracking is not currently implemented. Panels without live records use clearly labeled sample preview data.
