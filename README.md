# Dia+

Dia+ is a storefront for considered everyday essentials. The application source lives in the dia-web-app folder.

## Run it locally

See the complete setup and authentication guide in dia-web-app/README.md. Requires Node.js 20+.

PowerShell:

    cd dia-web-app
    Copy-Item .env.example .env
    npm.cmd install
    npm.cmd run check
    npm.cmd test
    npm.cmd run products:seed
    npm.cmd start

Open http://localhost:3000. Run these commands from `dia-web-app`, not the repository root. Do not use `index.html` directly or Live Server for the authentication version; those static-server options cannot serve the `/api/*` backend.

The frontend and API must run together through the Express server. Static-only hosting such as GitHub Pages cannot run this repository's Node.js/SQLite backend by itself. See the [API inventory and 404 diagnosis](dia-web-app/API_ROUTES.md). The product catalog is database-backed after the explicit sample seed; cart and demonstration orders persist in SQLite.

The app supports normal email/password accounts, optional Google sign-in, a separate administrator login, database-backed inventory/cart/order APIs, and an admin inventory/order dashboard. Google is optional. Checkout records pending demo orders but does not collect payments. Revenue collected and gross profit remain zero/unavailable until actual verified payment and cost records exist.

For the opt-in demo user and administrator accounts, see [the demonstration account instructions](dia-web-app/README.md#demonstration-accounts-opt-in-only). Demo accounts are not created automatically; use the explicit seed command only in an approved demonstration environment.

Do not commit .env or real credentials.

## Deploy online

The app requires its Express backend and persistent SQLite storage; do not deploy it as a static-only site. See [Render deployment instructions](DEPLOY_RENDER.md), [API route inventory](dia-web-app/API_ROUTES.md), and the [Render Blueprint](render.yaml). The Blueprint now tracks main; if an existing Render service still tracks feature/render-deployment, switch the service's branch to main and redeploy after review. Render assigns the public URL after a service is created. The current SQLite database requires a paid persistent disk for durable hosted accounts; review the cost and authorize hosting resources before provisioning them.
