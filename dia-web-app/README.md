# Dia — Desktop fashion website and secure account system

Dia is a multi-page fashion website built with separate HTML documents, shared CSS, and small vanilla JavaScript modules. The desktop homepage is a conventional fashion website: navigation, editorial hero, animated fashion showcase, collection tiles, about section, and footer. It is not a phone mock-up or a single-page application.

## Pages and structure

- `index.html` — Dia fashion homepage; the once-per-session flower intro runs only here.
- `login.html` — role-aware customer/admin sign-in and customer registration.
- `admin-login.html` — dedicated administrator sign-in.
- `forgot.html` — password-recovery information.
- `dashboard.html` — protected customer dashboard.
- `admin.html` — protected administrator console.
- `css/style.css` — shared desktop-first Dia visual system.
- `js/auth.js` — shared CSRF-aware API requests, form feedback, loading states, password toggle, and role redirects.
- `js/fashion.js` — line-art fashion showcase, collection-tile art, and homepage intro.

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

## Recovery note

A password-reset email delivery provider is not configured. The recovery page explains this and directs account holders to the secure administrator process; it does not pretend a reset email was sent.
