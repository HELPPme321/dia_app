# Dia+ API inventory and operational notes

## Request flow and root-cause diagnosis

Dia+ uses vanilla HTML/CSS/JavaScript served by Express (src/server.js) and SQLite (src/db.js). The browser sends same-origin relative requests such as POST /api/auth/register; the frontend does not have a separate API base URL. Express registers authentication routes in src/server.js and product/cart/order/admin routes in src/store-routes.js. The final /api handler intentionally returns 404 ENDPOINT_NOT_FOUND for an unmatched method/path instead of pretending the request succeeded. The health response and API 404s also include service/version/build metadata so a deployed stale process can be distinguished from current source.

The recurring message **“The requested API endpoint was not found” is not a registration error produced by the current registration handler**. Current source registers POST /api/auth/register. That message means the server handling a request did not match the requested method/path. Common causes are: opening the app through Live Server/static hosting instead of Express; an older process/build still running; a deployed Render service still linked to an older branch; or the client requesting another method/path. Check the HTTP method and path in the ENDPOINT_NOT_FOUND JSON and the matching [api-route-not-found] server-log line. Do not add a fake success route to suppress this diagnostic.

Run locally from the dia-web-app directory:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd start
```

Open http://localhost:3000. Do not open index.html directly or use VS Code Live Server; neither runs the Express API. A hosted build must run this Node.js application and serve the frontend and API on the same origin.

## Authentication and session routes

| Method | Path | Purpose | Access / success |
|---|---|---|---|
| GET | /api/health | Health check and running build fingerprint | Public, 200 with status, service, version and buildCommit |
| GET | /api/config | Optional public Google client ID | Public |
| GET | /api/auth/csrf | Start/reuse session and issue CSRF token | Public, sets HttpOnly session cookie |
| GET | /api/auth/me | Inspect current session | Public introspection; 401 when signed out |
| GET | /api/profile | Customer profile | Active signed-in user |
| POST | /api/auth/register | Create normal customer and session | CSRF required; 201; duplicate email 409 |
| POST | /api/auth/login | Normal email/password login | CSRF required; normal role only |
| POST | /api/auth/google | Optional verified Google login | CSRF required; normal customer only |
| POST | /api/auth/admin-login | Separate admin password login | CSRF required; active admin role only |
| POST | /api/auth/logout | Revoke current session | CSRF required |

Registration creates the user row and session within one SQLite transaction. Passwords use bcrypt; the application does not need a Google account to register a normal customer.

## Catalog routes

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | /api/categories | Categories and active product counts | Public |
| GET | /api/products | Search/filter/sort active products | Public; query parameters below |
| GET | /api/products/:id | One active product | Public |

GET /api/products accepts q, category, minPrice, maxPrice and sort (featured, price-asc, price-desc, newest, name). The public response does not expose product cost prices. The app's existing four catalog items are imported explicitly with npm.cmd run products:seed; the seed is idempotent, marks inserted rows as sample inventory, and never overwrites existing product edits. Sample costs remain unknown/null.

## Customer cart and order routes

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | /api/cart | Read current account cart | Active customer |
| POST | /api/cart/items | Add product/size/quantity | CSRF + active customer |
| PUT | /api/cart/items | Set quantity (zero removes) | CSRF + active customer |
| DELETE | /api/cart/items | Remove product/size | CSRF + active customer |
| POST | /api/orders | Create a pending demo order from database cart | CSRF + active customer |
| GET | /api/orders | Current customer's order history | Active customer |
| GET | /api/orders/:id | One order belonging to current customer | Active customer; owner must match |

Cart changes are stored in SQLite, not merely localStorage. Prices, sizes and stock are checked on the server. Checkout recalculates totals from database values inside a transaction, decreases stock, stores order-item snapshots, clears the cart, and accepts an idempotency key to avoid duplicate orders. Current checkout is a non-payment demo flow: it records pending orders, does not collect payment, does not send emails and does not initiate shipping.

## Administrator routes

Every admin route requires an active server-side admin role and an administrator-password session (auth method admin). A frontend role flag alone grants no access.

| Method | Path | Purpose |
|---|---|---|
| GET | /api/admin/stats | User, product, inventory, order and financial summary |
| GET | /api/admin/users | Search/filter/paginate accounts |
| PATCH | /api/admin/users/:id | Change account role/status with safeguards |
| GET | /api/admin/products | Product inventory including private unit costs |
| POST | /api/admin/products | Create a product |
| PATCH | /api/admin/products/:id | Edit product, cost, stock, or active/archive status |
| DELETE | /api/admin/products/:id | Archive a product and remove it from carts |
| GET | /api/admin/orders | Search/filter orders and inspect line items |
| PATCH | /api/admin/orders/:id | Change order status using allowed transitions |
| GET | /api/admin/analytics?days=7 | Completed-order trend, best sellers, category summaries and statuses |

Admin product fields and order status changes are validated by the backend. Cost price is not returned to normal customers. Product deletion archives rather than permanently deleting a product referenced by historical order items.

## Financial definitions and limits

- **Completed order value** totals orders whose current status is completed. It is not proof that money was paid.
- **Collected revenue** totals only orders marked payment_status=paid that are neither cancelled nor refunded. Demo checkout sets payment_status=not_collected, so this metric stays zero until a verified payment integration exists.
- **Gross profit** is available only when paid completed order-item records exist and every eligible line has a recorded unit-cost snapshot: line total minus (unit cost multiplied by quantity). Otherwise the dashboard shows unavailable rather than guessing.
- **Net profit** is not calculated. Taxes, payment fees, shipping expense and operating expenses are not tracked.

To estimate profit, enter known unit costs in the admin product form before orders are placed so checkout snapshots the cost. Historical order items whose cost was unknown stay unknown unless separately corrected with an audit. The dashboard does not manufacture users, inventory, paid sales or profit.

## Error behavior

- 400: validation failure, including invalid size/quantity/product fields.
- 401: no active session or invalid credentials.
- 403: CSRF/Origin rejection, disabled account, or insufficient admin role/session.
- 404: unknown API path, wrong HTTP method, or unavailable resource.
- 409: duplicate email, empty cart, insufficient stock, or invalid order status transition.
- 429: authentication/registration rate limit.
- 503: optional Google sign-in attempted without GOOGLE_CLIENT_ID.

Unknown API calls return error.code = ENDPOINT_NOT_FOUND with the actual method and path; the server logs only method/path, excluding query parameters.

## Local demo setup

Run in PowerShell from dia-web-app:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd run products:seed

$env:ENABLE_DEMO_ACCOUNTS = "true"
npm.cmd run demo:seed
Remove-Item Env:ENABLE_DEMO_ACCOUNTS

npm.cmd start
```

Demo seeding is opt-in and never overwrites existing accounts. Normal user: demo@example.com / DemoUser2026!. Administrator form at /admin: admin@example.com / AdminDemo2026!. These are public demonstration credentials; disable them with npm.cmd run demo:disable after your demonstration.

## Deployment requirements

render.yaml uses the Node/Express server and a persistent SQLite disk, with the branch set to main. After updating production code, ensure the actual Render service is connected to main and deploys the latest commit. Set DATABASE_PATH to persistent storage and APP_ORIGIN to the exact deployed HTTPS origin when needed. The Blueprint defaults to DATABASE_PATH=/var/data/dia.sqlite and uses Render's RENDER_EXTERNAL_URL for same-origin validation unless overridden.

A running hosted service, its URL, environment variables and persistent data cannot be proven by repository inspection alone. After deployment, verify https://your-host/api/health, GET /api/products, user registration, and admin APIs against the actual URL.
