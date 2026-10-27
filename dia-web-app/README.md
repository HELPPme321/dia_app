# Dia+ — storefront with standard accounts and optional Google sign-in

The application keeps the existing Dia+ storefront and adds normal email/password registration and login, optional Google Identity Services login, and a separate administrator login with a protected dashboard.

## Important: run the backend server

This app is not a static-only website. The frontend uses relative same-origin API paths (for example, `/api/auth/login`) which are registered by the Express server in `src/server.js`. Do not open `index.html` directly and do not run this version with VS Code Live Server. Either method serves files without providing the authentication API.

From this `dia-web-app` directory, run `npm.cmd install`, `npm.cmd run check`, `npm.cmd test`, then `npm.cmd start`; open `http://localhost:3000`. For production, deploy this Node.js application to a Node-capable host that runs the Express server and serves the frontend and `/api/*` routes on the same origin. No provider-specific production deployment configuration is present in this repository. See [API_ROUTES.md](API_ROUTES.md) for the endpoint inventory, expected status codes, and production environment requirements.

## Deploy online

The repository includes a Render Blueprint. See [../DEPLOY_RENDER.md](../DEPLOY_RENDER.md) for production setup, persistent SQLite storage, initial administrator provisioning, optional Google OAuth, hosting costs, and updates. Render must run this Express server; static hosting and Live Server cannot provide the API. A free service with an ephemeral filesystem is not safe for real account data.

## Run locally

Requirements: Node.js 20 or newer. In PowerShell:

    cd dia-web-app
    Copy-Item .env.example .env
    npm.cmd install
    npm.cmd run check
    npm.cmd test
    npm.cmd start

Open http://localhost:3000. If .env already exists, do not overwrite your private configuration.

## Normal user accounts

- Select **Create account** on the login screen.
- Enter a full name, any valid email address (Gmail is not required), a password of at least 12 characters containing a letter and a number, and confirm the password.
- Registration creates a normal customer account in SQLite and signs the customer in. Passwords are stored as bcrypt hashes, not plaintext.
- Existing customers sign in on the **Log in** tab. The Remember me option uses a longer server-side session expiration.
- Login and registration responses do not expose password hashes. Email addresses are normalized to lowercase and duplicate accounts are rejected.
- **Forgot password** currently displays a notice because no email delivery provider or password-reset email flow is configured. Do not rely on this link for recovery until a mail service and expiring reset-token workflow are implemented.

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

## Provision administrator access

Set ADMIN_EMAIL and ADMIN_PASSWORD in the private .env. Use a unique password of at least 14 characters. Run:

    npm.cmd run admin:provision

Open http://localhost:3000/admin. Unset ADMIN_PASSWORD after provisioning. Do not commit .env or share administrator credentials. Google sign-in never grants admin access; administrator API calls require a server-verified admin role and an admin-password session.

## Security

- SQLite database by default at data/dia.sqlite; data and environment files are ignored by Git.
- Random session IDs in HttpOnly cookies, only SHA-256 token digests in SQLite, server-side expiry, CSRF tokens for changing requests, rate limiting, Helmet headers, and same-origin request checks.
- Password hashing with bcrypt, generic invalid-login responses, server-side role checks, self-lockout and last-active-admin safeguards.
- Web serving is restricted to known frontend files and the assets directory; backend source and package metadata are not served as static files.
- Sessions persist across refreshes. Use the storefront sign-out control to invalidate the session.
- The product catalog, saved pieces, cart, and checkout remain a browser-side demo. Checkout does not take payments or create real orders.

## Tests and build verification

Run npm.cmd run check and npm.cmd test. Tests use an in-memory SQLite database and a mocked Google token verifier. Real Google sign-in still needs your client ID and browser testing. Email password recovery needs an email delivery provider before it can be enabled.
