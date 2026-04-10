# ablecarry-stock-monitor

A Cloudflare Worker that monitors [Able Carry](https://ablecarry.com) product pages for stock availability and sends push notifications via [ntfy.sh](https://ntfy.sh) when items come back in stock.

## Features

- **Scheduled stock checks** -- runs every minute via Cron Trigger
- **JSON-LD parsing** -- extracts product availability from structured data embedded in product pages
- **Push notifications** -- sends max-priority alerts through ntfy.sh when an item is back in stock
- **Dashboard UI** -- dark-themed status page showing product name, last check time, and errors
- **TOTP-protected actions** -- URL changes and manual stock checks require a valid TOTP code
- **Security hardened** -- CSRF protection, rate limiting, constant-time TOTP comparison, security headers
- **Cloudflare KV storage** -- all state is persisted in a KV namespace

## Setup

1. Clone the repository.

2. Install dependencies:

   ```
   npm install
   ```

3. Create a KV namespace and add its ID to `wrangler.toml`.

4. Set the TOTP secret:

   ```
   wrangler secret put TOTP_SECRET
   ```

5. Add the same TOTP secret to your authenticator app (e.g. Google Authenticator, Authy).

6. Subscribe to the `ablecarry-stock-monitor` topic in the [ntfy app](https://ntfy.sh).

7. Deploy:

   ```
   npm run deploy
   ```

   Alternatively, connect the repository to your Cloudflare dashboard for automatic deployments via GitHub.
