# ablecarry-stock-monitor

`ablecarry-stock-monitor` is a Cloudflare Worker that keeps an eye on an Able Carry product page and sends an `ntfy.sh` alert when the item comes back in stock.

## Overview

The project is built around a simple flow:

- watch one product page
- check its current availability on a schedule
- notify when stock returns
- show the current state in a small dashboard

The dashboard provides a quick view of the tracked product, its latest stock status, recent check activity, and any recorded errors.

## How It Works

The worker periodically checks the configured Able Carry product page and reads the product availability from the page data. When the product moves back into stock, it sends a notification to the `ablecarry-stock-monitor` topic on `ntfy.sh`.

To avoid noisy alerts, it does not repeatedly notify while the item stays in stock.

## Dashboard

The app includes a lightweight dashboard at `/` where you can:

- view the current product being tracked
- see the latest stock status
- review recent check information
- update the tracked product URL

Updating the tracked URL is protected, and the worker validates the submitted product link before saving it.

## Configuration

The dashboard's URL update form requires a TOTP secret stored as the Cloudflare Worker secret `TOTP_SECRET`.

Set it before deploying:

```bash
wrangler secret put TOTP_SECRET
```

The secret value must be a Base32-encoded TOTP seed compatible with authenticator apps.

## Scope

This project is intentionally focused on monitoring a single Able Carry product at a time. It is designed as a small personal utility rather than a general-purpose inventory tracking system.
