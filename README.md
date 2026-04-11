# ablecarry-stock-monitor

`ablecarry-stock-monitor` watches a single Able Carry product page and posts an alert to `ntfy.sh` when that item comes back in stock.

## Overview

The public instance is meant to be a small, focused stock tracker:

- it follows one Able Carry product at a time
- it checks the product page on a schedule
- it sends a notification when stock returns
- it shows the current tracked item and status in a lightweight dashboard

## Dashboard

The dashboard gives a quick read on the current monitor state, including:

- the product currently being tracked
- whether it is in stock right now
- the most recent in-stock event
- the `ntfy.sh` topic used for alerts

## Notifications

When the tracked product comes back in stock, the monitor posts to the `ablecarry-stock-monitor` topic on `ntfy.sh`.

To keep alerts useful, it does not keep sending repeated notifications while the item remains in stock.

## Scope

This project is intentionally narrow. It is a simple public stock monitor for one Able Carry product at a time, not a general-purpose inventory tracker.
