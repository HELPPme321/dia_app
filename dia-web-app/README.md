# Dia — Desktop fashion website and secure account system

Dia is a multi-page fashion website built with separate HTML documents, shared CSS, and small vanilla JavaScript modules. The storefront combines an editorial fashion homepage, a database-backed product collection, a customer bag, and a protected account/admin area. It is not a phone mock-up or a single-page application.

## Pages and structure

- index.html — Dia editorial storefront with a one-shot post-login cinematic introduction, product collection, and live bag.
- js/storefront.js — database-backed catalog, product quick view, customer bag, and account-aware navigation.
- `login.html` — role-aware customer/admin sign-in and customer registration.
- `admin-login.html` — dedicated administrator sign-in.
- `forgot.html` — password-recovery information.
- `dashboard.html` — protected customer dashboard.
- `admin.html` — protected administrator console.
- `css/style.css` — shared desktop-first Dia visual system.
- `js/auth.js` — shared CSRF-aware API requests, form feedback, loading states, password toggle, and role redirects.
- js/fashion.js — one-shot cinematic cutscene with optional Web Audio cues, mute, skip, and reduced-motion support.

## Authentication

Dia uses the Express and SQLite backend. The browser never contains hard-coded users or passwords. Customer login is tried first; when it returns `INVALID_CREDENTIALS`, the role-aware flow tries the administrator endpoint. Only the server can grant administrator access after checking the stored active role.

Administrator identifiers are plain text and accept a trimmed username or email, case-insensitively. The existing `milesadmin` account is supported without an `@` character. Customer registration still validates the email field separately.

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

To seed the example inventory without creating demo accounts, run npm.cmd run products:seed. The homepage loads its product catalog from the Express /api/products endpoint. Product details and the signed-in customer's bag are read from SQLite through the existing store API; bag changes require an authenticated session and CSRF token. The browser does not use local storage as an account or cart database. Product and campaign photographs use Unsplash image URLs with the bundled Dia editorial image as a fallback.

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
