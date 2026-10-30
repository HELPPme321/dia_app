# Dia+ — storefront with standard accounts and optional Google sign-in

The application uses separate server-served pages for the storefront, customer sign-in and registration, customer dashboard, administrator sign-in, administrator dashboard, and password recovery. Authentication is handled by Express and SQLite; the storefront remains independently browsable.

## Important: run the backend server

This app is not a static-only website. The frontend uses relative same-origin API paths (for example, `/api/auth/login`) which are registered by the Express server in `src/server.js`. Do not open `index.html` directly and do not run this version with VS Code Live Server. Either method serves files without providing the authentication API.

From this `dia-web-app` directory, run `npm.cmd install`, `npm.cmd run check`, `npm.cmd test`, then `npm.cmd start`; open `http://localhost:3000`. For production, deploy this Node.js application to a Node-capable host that runs the Express server and serves the frontend and `/api/*` routes on the same origin. See [API_ROUTES.md](API_ROUTES.md) for the full endpoint inventory, the recurrent 404 diagnosis, financial definitions, expected status codes, and deployment requirements. The Render Blueprint is in the repository root.

## Deploy online

The repository includes a Render Blueprint. See [../DEPLOY_RENDER.md](../DEPLOY_RENDER.md) for production setup, persistent SQLite storage, initial administrator provisioning, optional Google OAuth, hosting costs, and updates. Render must run this Express server; static hosting and Live Server cannot provide the API. A free service with an ephemeral filesystem is not safe for persistent account data.

## Run locally

Requirements: Node.js 20 or newer. In PowerShell:

    cd dia-web-app
    Copy-Item .env.example .env
    npm.cmd install
    npm.cmd run check
    npm.cmd test
    npm.cmd start

Open http://localhost:3000 for the storefront, `/login` for customer sign-in, `/admin/login` for administrator sign-in, and `/forgot-password` for recovery guidance. If .env already exists, do not overwrite your private configuration.

## Normal user accounts

- Select **Create account** on the login screen.
- Enter a full name, any valid email address (Gmail is not required), a password of at least 12 characters containing a letter and a number, and confirm the password.
- Registration creates a normal customer account in SQLite and signs the customer in. Passwords are stored as bcrypt hashes, not plaintext.
- Existing customers sign in at `/login` using either their email address or username. The Remember me option uses a longer server-side session expiration. After sign-in, customers are sent to `/dashboard`.
- Login and registration responses do not expose password hashes. Email addresses are normalized to lowercase and duplicate accounts are rejected.
- `/forgot-password` is a dedicated recovery information page. Automated reset emails are not available until an email provider and expiring one-time reset-token workflow are configured; the page never falsely reports that an email was sent.

## Demonstration accounts (opt-in only)

The seed script creates these database-backed accounts only when you explicitly enable it and run the command. They are intended for demonstrations, not production authentication:

| Role | Email | Initial password | Sign-in form |
|---|---|---|---|
| Normal user | `demo@example.com` | `DemoUser2026!` | Regular **Log in** form on the storefront |
| Administrator | `admin@example.com` | `AdminDemo2026!` | Separate administrator form at `/admin` |

Run from `dia-web-app`. For Windows PowerShell, set the opt-in flag for the command, then remove it from the shell:

    $env:ENABLE_DEMO_ACCOUNTS = "true"
    npm.cmd run demo:seed
    Remove-Item Env:ENABLE_DEMO_ACCOUNTS

For macOS/Linux:

    ENABLE_DEMO_ACCOUNTS=true npm run demo:seed

By default, the script does nothing. It hashes passwords with bcrypt and creates accounts only if the email addresses are unused. It does **not** overwrite an existing account's password, role, or status. If either email already belongs to another account, the script reports a conflict and leaves that account unchanged. Re-running it is safe for accounts it originally seeded. Demo accounts are marked in the database so they can be disabled without affecting ordinary accounts.

After the demonstration, run:

    npm.cmd run demo:disable

This disables only accounts created by the demo seed script and revokes their sessions; it does not delete records or reset passwords. Make sure you have a separate active administrator before disabling the demo admin. Do not leave the demo admin credentials enabled on a public production site. If a conflicting pre-existing account uses either demo email, resolve ownership and inspect that row manually rather than resetting its credentials through the seed script.

## Optional Google sign-in

Google is an alternative, not a requirement. Without GOOGLE_CLIENT_ID, email/password registration and login continue to work and the Google area explains that the integration is not configured.

To enable Google:
1. Open https://console.cloud.google.com/ and choose a project.
2. Configure OAuth consent and test users as needed.
3. Create an OAuth client ID for a Web application.
4. Add http://localhost:3000 to Authorized JavaScript origins.
5. Set GOOGLE_CLIENT_ID in .env and restart the server.

The server verifies the ID token audience and verified email using Google's supported google-auth-library. No Google client secret is placed in the browser.

Official docs:
- https://developers.google.com/identity
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

## Provision or repair administrator access

Administrator credentials are separate from customer credentials. The admin login at `/admin/login` accepts an email or username, then checks that the matching database account has `role='admin'`, `status='active'`, and a valid password hash before creating an administrator session. The label “Administrator” is the friendly name for the stored `admin` role; the typed username never grants a role. No default admin account is created automatically.

A migration adds a case-insensitive `username` column. For older records whose `email` value is actually a non-email identifier (for example `milesadmin`), the migration copies that value into `username` so existing credentials remain usable. If your admin row already has a real email and a separate username was never stored, set the username on that exact record through a trusted database/operator process; do not promote an account solely because its username is familiar.

From the `dia-web-app` directory:

    npm.cmd run admin:status
    npm.cmd run admin:setup

`admin:status` reports the exact SQLite database path and whether administrator accounts exist, without printing hashes. `admin:setup` prompts for an email and a new password (password input is masked). It creates the administrator if missing, or deliberately promotes the supplied existing email and resets its password. It revokes old sessions after a role/password repair so you must sign in again at http://localhost:3000/admin.

For non-interactive setup, put a unique email in `ADMIN_EMAIL` and a password of at least 14 characters containing a letter and number in your private `.env`, then run:

    npm.cmd run admin:provision

Both commands use the configured `DATABASE_PATH` (by default `data/dia.sqlite`). Run them from the same service/container and database location used by the server; provisioning a different SQLite file will not repair the running site's account. Unset `ADMIN_PASSWORD` after provisioning. Do not commit `.env` or share admin credentials. Google sign-in never grants admin access; administrator APIs require an active administrator role and an admin-password session.

## Security

- SQLite database by default at data/dia.sqlite; data and environment files are ignored by Git.
- Random session IDs in HttpOnly cookies, only SHA-256 token digests in SQLite, server-side expiry, CSRF tokens for changing requests, rate limiting, Helmet headers, and same-origin request checks.
- Password hashing with bcrypt, generic invalid-login responses, server-side role checks, self-lockout and last-active-admin safeguards.
- Web serving is restricted to known frontend files and the assets directory; backend source and package metadata are not served as static files. A logged-in customer is also denied the administrator HTML route, not only its APIs.
- Sessions persist across refreshes. Use the storefront sign-out control to invalidate the session.
- The catalog is loaded from the SQLite products table. The account cart and demo orders are stored in SQLite and validated by server-side APIs; saved items remain browser-local. Checkout creates a pending demonstration order, deducts stock, and records order-item snapshots, but does not collect payment, dispatch shipping, or send email. Explicitly seed the pre-existing sample catalog using npm.cmd run products:seed. The sample entries are marked in the database, and their costs are unknown until supplied.

## Seed the existing sample catalog

From this directory, run npm.cmd run products:seed. It inserts the four product definitions already in src/products.js with sample stock and marks them is_sample=1. It does not overwrite existing products; costs are deliberately left blank. To also create the opt-in demo user and administrator accounts, set ENABLE_DEMO_ACCOUNTS=true and run npm.cmd run demo:seed as described above. Do not leave public demonstration credentials active on a production website.

## Tests and build verification

Run npm.cmd run check and npm.cmd test. The test suite exercises auth, CSRF, server-side role separation, sample catalog seeding, live catalog queries, DB-backed carts, checkout totals/stock/idempotency, order history, admin product and order management, analytics, logout, and database restart persistence. Real Google sign-in still needs your client ID and browser testing. Email password recovery needs an email delivery provider. Payment collection is not configured; collected revenue intentionally remains zero for demonstration orders.
