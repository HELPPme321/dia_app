# Dia+ storefront

The working application lives in the dia-web-app folder. It keeps the original Dia+ shop UI and adds a Node.js API, verified Google sign-in, secure session cookies, a separate administrator login, and an administrator dashboard.

## Run locally

Requirements: Node.js 20 or newer.

PowerShell:

    cd dia-web-app
    Copy-Item .env.example .env
    npm.cmd install
    npm.cmd run check
    npm.cmd test
    npm.cmd start

Then open http://localhost:3000. If the folder already contains your private .env, do not overwrite it.

## Google sign-in setup

1. Open https://console.cloud.google.com/ and select or create a project.
2. Configure the OAuth consent screen and allowed test users as appropriate.
3. Under APIs & Services -> Credentials, create an OAuth client ID for a Web application.
4. Add http://localhost:3000 as an Authorized JavaScript origin.
5. Copy the Web client ID into GOOGLE_CLIENT_ID in dia-web-app/.env, then restart the app.
6. For production, use your real HTTPS domain in the authorized origins and APP_ORIGIN.

The browser uses Google's Identity Services sign-in button. The server verifies the returned ID token using google-auth-library and checks the verified email claim. Google sign-in always creates customer accounts; it never grants administrator access. An existing account with an unlinked email is not silently linked.

Official references:
- https://developers.google.com/identity
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

## Provision the first administrator

Set ADMIN_EMAIL and ADMIN_PASSWORD in dia-web-app/.env. Use a unique password of at least 14 characters, and never put real credentials in source control. Run:

    npm.cmd run admin:provision

Then open http://localhost:3000/admin. Remove ADMIN_PASSWORD from your environment after provisioning. Running the provisioning command again explicitly resets the configured account's admin password and role, so only run it when intended.

## Security and behavior

- Random opaque session IDs are stored in HttpOnly cookies; only SHA-256 session-token digests are stored in SQLite.
- Session records include server-side roles, expiration and CSRF tokens. State-changing requests require the synchronizer CSRF token.
- Admin endpoints require an active admin account and an admin-password session. A Google session cannot access administrator APIs even if its associated user is later promoted.
- Login attempts are rate-limited. Helmet security headers and a same-origin-first deployment model are used.
- SQLite data is stored in dia-web-app/data/dia.sqlite and is ignored by Git.
- The cart, saved pieces and checkout are still a browser-local storefront demo. No actual order or payment is processed.

## Tests and validation

Run npm.cmd run check and npm.cmd test from the dia-web-app folder. Google sign-in tests use a mocked server-side verifier; a real sign-in still requires a configured Google client ID and browser verification. The GitHub Actions workflow runs the syntax checks and test suite on pull requests and pushes.

## Troubleshooting

- If npm is blocked by PowerShell's execution policy, use npm.cmd instead of changing the machine policy.
- If Google sign-in reports that it is not configured, check GOOGLE_CLIENT_ID and restart the server.
- If the origin is rejected, make sure the browser address exactly matches APP_ORIGIN.
- If administrator login fails, rerun the provisioning command only after confirming ADMIN_EMAIL and ADMIN_PASSWORD in the private .env.
- Do not use Live Server for authentication testing; open the app through the Node server at http://localhost:3000.
