# Deploy Dia+ on Render

This project is a Node.js 20+ / Express app with a vanilla HTML/CSS/JavaScript storefront and a SQLite account/session database. Render must run the Express server; publishing the HTML files as a static site alone will not work.

## Deployment target

The repository contains a Render Blueprint at `render.yaml`. It defines one public web service using the Singapore region, a health check at `/api/health`, CI/test commands before startup, and a 1 GB persistent disk mounted at `/var/data`. The SQLite database is configured as `/var/data/dia.sqlite`, so account records survive ordinary deploys and restarts.

The Blueprint is configured to track `main` so reviewed and merged changes can be deployed from the current production branch. If an existing Render service was created while the Blueprint tracked `feature/render-deployment`, open its settings and change the linked branch to `main`, then deploy the latest commit. Automatic deployments are configured to wait for CI checks to pass; the build command also runs syntax checks and tests.

## Create the online service

1. Sign in to Render and open its Blueprint setup page: https://dashboard.render.com/blueprints/new
2. Connect/authorize GitHub access if asked, then choose `HELPPme321/dia_app` and branch `main`.
3. Review the resource summary. The SQLite disk requires a paid web-service plan. Do not select a free plan for this Blueprint because free Render web services have ephemeral filesystems.
4. During setup, provide an administrator email and a unique password at least 14 characters long when prompted for `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Do not put these values into GitHub.
5. Approve creation and wait for the first deployment and the one-time `npm run admin:provision` hook to complete.
6. Open the service's generated `https://…onrender.com` URL. Test `/api/health` before creating a normal customer account.
7. Once the administrator has been provisioned, remove `ADMIN_PASSWORD` (and the no-longer-needed `ADMIN_EMAIL`) from the Render service environment settings, then save/redeploy. Keep the administrator credentials in a safe password manager; never put them in source control.
8. The generated Render URL is assigned by Render only after service creation. Do not assume the service name is available as a public hostname before Render confirms it.

## Environment variables

The Blueprint configures:
- `NODE_ENV=production`
- `DATABASE_PATH=/var/data/dia.sqlite`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` as initial-setup-only secret prompts

Render provides `RENDER_EXTERNAL_URL`, used automatically by the application for same-origin request validation when `APP_ORIGIN` is not set. If you connect a custom domain later, set `APP_ORIGIN` to the exact public origin (for example, `https://shop.example.com`, with no trailing slash). Do not set it to a path or to localhost.

Google sign-in is optional. To enable it, create a Web OAuth client ID in Google Cloud Console, set the public `GOOGLE_CLIENT_ID` environment variable in Render, and add the exact HTTPS site origin to Google OAuth's **Authorized JavaScript origins**. The current implementation uses Google Identity Services ID-token verification, so configure the JavaScript origin; no separate redirect URI is used by this frontend callback flow. Email/password login works without Google.

There is no email delivery provider configured, so password-reset emails are not available. Do not rely on the “Forgot password?” notice for automatic recovery. Product catalog, cart and demo-order APIs use SQLite; checkout writes an order but does not collect payment, ship items, or send email. Run `npm run products:seed` once to import the existing sample catalog. Run the demo account seed only when you deliberately want the public demo credentials enabled.

## Costs and free-tier trade-offs

Render's current pricing page lists paid web compute starting around $6/month and persistent disks at $0.25 per GB/month; a 1 GB disk therefore adds about $0.25/month at the listed rate, before tax or metered usage. Confirm the current price presented in Render before approving the resources: https://render.com/pricing

Render's free web services spin down after 15 minutes idle and use an ephemeral filesystem. Local SQLite changes are lost on restarts/spin-down, so that setup is not safe for persistent account data. Free Render Postgres databases expire after 30 days, so this Blueprint deliberately chooses a paid disk-backed SQLite service rather than a misleading free configuration. See https://render.com/docs/free and https://render.com/docs/disks.

## Local verification before deployment

Run these commands from `dia-web-app`:
```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd start
```
The Render build command runs `npm install`, `npm run check`, and `npm test` before starting the service. A failed build/test prevents the new code from being deployed.

## Updating the app

After the PR is reviewed and merged, switch the Render service's linked branch to `main`. Render can then automatically deploy pushes after GitHub CI checks pass. The Blueprint source is now set to `main`. Do not leave it tracking the old feature branch. Do not deploy before reviewing and approving the changes yourself.
