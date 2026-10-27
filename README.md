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
    npm.cmd start

Open http://localhost:3000. Run these commands from `dia-web-app`, not the repository root. Do not use `index.html` directly or Live Server for the authentication version; those static-server options cannot serve the `/api/*` backend.

The frontend and API must run together through the Express server. Static-only hosting such as GitHub Pages cannot run this repository's Node.js/SQLite backend by itself. See [the API route inventory and deployment notes](dia-web-app/API_ROUTES.md).

The app supports normal email/password accounts, optional Google sign-in, and a separate administrator login. Configure Google credentials only if you want Google sign-in; standard registration and login work without Google. Password recovery email delivery is not configured yet, and checkout remains a demo.

For the opt-in demo user and administrator accounts, see [the demonstration account instructions](dia-web-app/README.md#demonstration-accounts-opt-in-only). Demo accounts are not created automatically; use the explicit seed command only in an approved demonstration environment.

Do not commit .env or real credentials.

## Deploy online

The app requires its Express backend and persistent SQLite storage; do not deploy it as a static-only site. See [Render deployment instructions](DEPLOY_RENDER.md) and the [Render Blueprint](render.yaml). Render assigns the public URL after a service is created. The current SQLite database requires a paid persistent disk for durable hosted accounts; review the cost and authorize hosting resources before provisioning them.
