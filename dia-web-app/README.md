# Dia+ — authenticated storefront and administrator console

Dia+ retains the existing vanilla HTML/CSS/JavaScript storefront and adds secure server-backed authentication. The Node API and static frontend share one origin by default.

## Prerequisites and start

Install Node.js 20 or newer. From this folder:

    Copy-Item .env.example .env
    npm.cmd install
    npm.cmd run check
    npm.cmd test
    npm.cmd start

Open http://localhost:3000. If .env already exists, keep your current private configuration rather than overwriting it.

## Google sign-in

Configure a Web OAuth client ID in https://console.cloud.google.com/. Add http://localhost:3000 to Authorized JavaScript origins, and put the resulting client ID into GOOGLE_CLIENT_ID in .env. The server verifies the Google ID token audience and verified email with Google's supported library. No client secret belongs in the browser.

Documentation:
- https://developers.google.com/identity
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

## Initial administrator

Set ADMIN_EMAIL and ADMIN_PASSWORD in the private .env. Use a unique password of at least 14 characters. Run:

    npm.cmd run admin:provision

Then visit http://localhost:3000/admin. Unset ADMIN_PASSWORD after provisioning. There is no default administrator password.

## Security and limits

This app uses HttpOnly random session cookies, database-stored token digests, CSRF tokens, login rate limiting, Helmet headers, bcrypt password hashing, and server-side role checks. Admin API requests require an active administrator session established by administrator password login. Google login cannot grant admin privileges.

The storefront catalog, saved pieces, shopping bag, and demo checkout remain client-side; checkout is a demo only and does not process payments or create orders. The integration tests mock Google's server verifier; a live Google test requires your own configured client ID.
