# ablecarry-stock-monitor

A Cloudflare Worker that monitors [Able Carry](https://ablecarry.com) product pages for stock availability and sends push notifications via [ntfy.sh](https://ntfy.sh) when items come back in stock.

## Features

- **Scheduled stock checks** -- runs every minute via Cron Trigger
- **JSON-LD parsing** -- extracts product availability from structured data embedded in product pages
- **Push notifications** -- sends max-priority alerts through ntfy.sh when an item is back in stock
- **Dashboard UI** -- dark-themed status page showing product name, last check time, and errors
- **Password-protected URL updates** -- saving a new product URL requires the configured password
- **Security hardened** -- CSRF protection, rate limiting, PBKDF2 password verification, security headers
- **Cloudflare KV storage** -- all state is persisted in a KV namespace

## Setup

1. Clone the repository.

2. Install dependencies:

   ```
   npm install
   ```

3. Create a KV namespace and add its ID to `wrangler.toml`.

4. Set the URL update password hash:

   ```
   wrangler secret put URL_UPDATE_PASSWORD_HASH
   ```

   Store a value in the format `pbkdf2_sha256$iterations$salt$hash`.

5. Subscribe to the `ablecarry-stock-monitor` topic in the [ntfy app](https://ntfy.sh).

6. Deploy:

   ```
   npm run deploy
   ```

   Alternatively, connect the repository to your Cloudflare dashboard for automatic deployments via GitHub.
