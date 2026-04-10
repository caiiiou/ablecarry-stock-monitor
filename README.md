# ablecarry-stock-monitor

`ablecarry-stock-monitor` is a Cloudflare Worker that watches a single Able Carry product page, reads stock state from the page's JSON-LD metadata, and posts an alert to `ntfy.sh` when the item becomes available.

## Overview

The worker stores its monitoring state in Cloudflare KV and exposes a small dashboard at `/`. The dashboard shows the currently tracked product, the latest observed stock status, the last successful check time, the most recent in-stock timestamp, and the last recorded error.

The monitored product URL can be changed from the dashboard. URL updates are protected with a shared six-digit TOTP code. After a valid update, the worker immediately performs a fresh stock check so the saved state reflects the new product as quickly as possible.

## How Monitoring Works

The worker runs on a one-minute cron schedule. For each check, it requests the configured Able Carry product page, scans `application/ld+json` blocks, and extracts:

- product availability
- product name
- product image

If the product transitions into stock, the worker sends a high-priority notification to the `ablecarry-stock-monitor` topic on `ntfy.sh`. It suppresses duplicate alerts while the item remains in stock and only notifies again after the product has gone out of stock and later returns.

## Dashboard

The dashboard is a server-rendered page designed to expose the current worker state without additional client-side dependencies. It includes:

- current stock status
- tracked product name
- tracked product URL
- product thumbnail when one is available
- last check timestamp
- last in-stock timestamp
- most recent error message
- direct link to the `ntfy.sh` topic

Displayed timestamps are localized in the browser so the page reads naturally in the viewer's local time zone.

## Security Model

Administrative actions are intentionally narrow. The only mutable action exposed by the worker is updating the tracked product URL, and that flow is protected by:

- TOTP verification
- same-origin request validation for form submissions
- rate limiting for failed TOTP attempts
- constant-time TOTP comparison
- restrictive response security headers

The worker also validates that the submitted URL is an Able Carry product URL before persisting it.

## Stored State

The KV-backed state includes:

- tracked product URL
- product name
- product image URL
- last known stock status
- last check timestamp
- last in-stock timestamp
- last error message
- whether an in-stock notification has already been sent for the current stock cycle

## Runtime Surface

- `GET /` renders the dashboard
- `POST /url` validates and saves a new tracked product URL
- scheduled events run the recurring stock check

## Notes

This project is intentionally scoped to a single tracked product at a time. The default configuration targets an Able Carry product page, but the actual monitored URL is part of persisted state and can be changed through the dashboard when authorized.
