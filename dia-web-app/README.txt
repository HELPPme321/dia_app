DIA+ WEB APP — RUN LOCALLY

IMPORTANT
This version includes a Node.js/Express backend for account registration, login, sessions, and administrator APIs. Do not open index.html directly and do not use VS Code Live Server for this version: a static web server cannot serve the /api endpoints.

Run in PowerShell from this dia-web-app folder:
1. Open this folder in PowerShell (or VS Code's integrated terminal).
2. Run: npm.cmd install
3. Run: npm.cmd run check
4. Run: npm.cmd test
5. Run: npm.cmd start
6. Open http://localhost:3000

Application structure
- index.html: storefront and authentication UI
- style.css: responsive visual design and transitions
- script.js: store navigation, product filters/search, product details, saved items, bag, and demo checkout
- auth.js: customer registration/login, optional Google sign-in, session checks, and sign-out
- admin.html, admin.css, admin.js: separate administrator login and dashboard
- src/server.js: Express server and the /api route handlers
- src/db.js: SQLite database and session schema
- test/: automated API and authentication tests
- assets/dia-editorial.webp: locally stored editorial image

API architecture
The frontend calls relative paths such as /api/auth/login. Express serves both the frontend and these API routes from the same origin. A production deployment must run this Node.js server (Node.js 20+) rather than use static-only hosting. See README.md and API_ROUTES.md for the API inventory, production requirements, and authentication behavior.

Notes
- Cart and saved products persist in browser localStorage.
- Checkout is a local demo flow and does not process payments or create real orders.
- Google sign-in is optional. Email/password registration and login work without Google configuration.
- Password recovery email delivery is not configured.
- Never commit .env or real credentials.
