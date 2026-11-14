# Dia — Modern Luxury Unisex Fashion Label (Static + Supabase + Netlify)

Dia is a modern luxury unisex fashion website built as a pure static site (`site/` directory) communicating directly with Supabase, pre-configured for instant deployment on Netlify.

The storefront, customer dashboard, and administrator console use a deep forest green and champagne gold palette (`#0a1f16` / `#d4af5a`), Cormorant Garamond display serif, and Manrope interface sans typography.

## Architecture

- **Static Site (`site/`)**: 100% serverless, statically servable HTML, CSS, JavaScript, WebP images, and assets.
- **Supabase Backend**:
  - **Database & Auth**: User accounts, email authentication, password recovery, session persistence with secure Row-Level Security (RLS).
  - **Tables**: `profiles`, `products`, `product_costs`, `cart_items`, `wishlist_items`, `orders`, `order_items`.
  - **Stored Procedures (RPC)**:
    - `place_order(p_items, p_customer_name, p_phone, p_shipping_address, p_idempotency_key)`: Server-enforced pricing, free shipping threshold (₱2,500), and phone normalization (`+639XXXXXXXXX`).
    - `subscribe_newsletter(p_email)`: Newsletter registration.
    - `admin_stats()`: Protected administrative store analytics.
  - **Storage**: `avatars` bucket with public read access. Browser automatically resizes and crops avatars to 256×256 JPEG (< 150 KB) prior to upload.
- **Netlify Configuration (`netlify.toml`)**:
  - `publish = "site"`
  - Clean URL rewrites (`/login`, `/register`, `/admin`, `/admin/login`, `/dashboard`, `/forgot-password`, `/reset-password`).
  - Custom 404 page routing.
  - Strict Content-Security-Policy (CSP) with no nonces required (`script-src 'self'`).
  - Standard security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.

## Pages and Structure

- `site/index.html` — Luxury editorial storefront with cinematic hero crossfade, catalog filter tabs, live search suggestions, quick view modal, and slide-out bag drawer.
- `site/login.html` — Customer sign-in (email + password). Inactive accounts are blocked; admin accounts are seamlessly routed to `/admin`.
- `site/register.html` — Customer account creation with Supabase Auth (`options.data: { name, username }`).
- `site/admin-login.html` — Dedicated administrator sign-in enforcing `profiles.role = 'admin'` and `status = 'active'`.
- `site/admin.html` — Protected private atelier dashboard: live stats, inventory management, product costs, order status transitions, and user management.
- `site/dashboard.html` — Protected customer dashboard with Order History (including order items), Saved Wishlist, and Profile management with avatar upload.
- `site/forgot-password.html` — Password reset request dispatching Supabase recovery emails.
- `site/reset-password.html` — Password update form consuming the recovery session token.
- `site/404.html` — Custom luxury 404 error page.

## Running Locally

To run the site locally:

```bash
# 1. Install dependencies
npm install

# 2. Verify static site structure & configuration
npm run check
npm test

# 3. Serve the static site locally
npm start
# or: npx serve site
```

Open `http://localhost:3000` in your web browser.

## Deployment to Netlify

To deploy:
1. Connect your repository to Netlify.
2. The `netlify.toml` file in the repository root automatically configures:
   - **Publish directory**: `site`
   - **Build command**: (none required, pure static)
   - **Redirects & Security Headers**: pre-configured.
