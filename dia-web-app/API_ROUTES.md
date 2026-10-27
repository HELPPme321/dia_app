# Dia+ API route inventory and deployment notes

## Request flow

Dia+ is a vanilla HTML/CSS/JavaScript frontend served by the Node.js/Express application in `src/server.js`. The browser uses same-origin relative API paths such as `/api/auth/csrf`; there is no separate frontend API base URL in the current source. The Express app registers the API routes before its final `/api` fallback handler.

For local development, run the server from this directory:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd start
```

Open `http://localhost:3000`. Do not open `index.html` directly, and do not use VS Code Live Server as the application server: a static server cannot run these Express endpoints. A production deployment must run this Node.js application (Node.js 20+) and serve both the frontend and `/api/*` from the same origin. This repository currently has a CI workflow, but no provider-specific production deployment configuration; a live deployment cannot be inferred from this repository alone.

## API endpoints

| Method | Path | Purpose and frontend caller | Access and success |
|---|---|---|---|
| GET | `/api/health` | Health check; operational verification | Public; `200 { "status": "ok" }` |
| GET | `/api/config` | Read optional public Google client ID; `auth.js` | Public; `200 { "googleClientId": string }`; empty string means Google sign-in is not configured |
| GET | `/api/auth/csrf` | Start/reuse a session and obtain CSRF token; `auth.js`, `admin.js` | Public; `200 { "csrfToken": string }`; sets an HttpOnly session cookie |
| GET | `/api/auth/me` | Read current session identity; `auth.js`, `admin.js` | Public introspection; `200` with user/session fields or `401` with `authenticated: false` |
| GET | `/api/products` | Return product catalog | Public; `200 { "products": [...] }` |
| GET | `/api/profile` | Return current customer profile | Active signed-in user; `200 { "user": ... }` |
| POST | `/api/auth/register` | Create customer account; `auth.js` | CSRF token required; `201` with customer and refreshed CSRF token |
| POST | `/api/auth/login` | Customer email/password login; `auth.js` | CSRF token required; `200` with customer/session; Google is not required |
| POST | `/api/auth/google` | Optional server-verified Google login; `auth.js` | CSRF token required; `200` with customer/session |
| POST | `/api/auth/admin-login` | Administrator password login; `admin.js` | CSRF token required; `200` with administrator/session |
| POST | `/api/auth/logout` | Invalidate current session; `auth.js`, `admin.js` | CSRF token required; `200 { "ok": true }` |
| GET | `/api/admin/stats` | Load admin summary; `admin.js` | Requires active administrator role **and** an admin-password session; `200 { "stats": ... }` |
| GET | `/api/admin/users` | Search/filter/paginate accounts; `admin.js` | Requires active administrator role and admin-password session; `200 { "users": [...], "pagination": ... }` |
| PATCH | `/api/admin/users/:id` | Change account role/status; `admin.js` | Requires administrator session and CSRF token; `200 { "user": ... }` |

## Expected failures

- `400`: invalid request fields, password policy/confirmation failures, or invalid account changes.
- `401`: missing/expired login session on a protected endpoint, or invalid credentials. The `/api/auth/me` endpoint intentionally returns `401` when no user is signed in.
- `403`: missing/invalid CSRF token, disallowed request origin, disabled account, or insufficient administrator permissions.
- `404`: unknown API path or wrong HTTP method for a path. The API fallback logs the method and pathname (without query parameters) and returns `error.code = "ENDPOINT_NOT_FOUND"` with the unmatched method/path to make misrouting diagnosable.
- `409`: duplicate email or account-linking conflict.
- `429`: login/registration rate limit reached.
- `503`: Google login was attempted while `GOOGLE_CLIENT_ID` is unset. Email/password authentication remains available.

## Production configuration

The current architecture expects the Express server to serve the frontend and API on the same HTTPS origin. Deploy this project to a Node.js-capable host rather than static-only hosting. Set environment variables in the host's private configuration:

- `NODE_ENV=production`
- `APP_ORIGIN=https://the-exact-public-origin` (scheme and host, with no path; must match the browser's origin)
- `PORT` only if required by the hosting platform (the server also accepts the platform-provided `PORT`)
- `DATABASE_PATH` pointed to a writable persistent disk path. Default ephemeral container storage may lose SQLite data on redeploy.
- `GOOGLE_CLIENT_ID` only if optional Google sign-in is desired
- Admin provisioning credentials only during provisioning; never commit secrets

No production URL, host settings, secrets, browser session, or production database are embedded in this repository, so the live deployment cannot be verified from source inspection alone.
