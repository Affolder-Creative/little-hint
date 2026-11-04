# Background price checks

The existing server worker checks the primary link of each active saved wish and
gift idea. Free structured extraction runs first; the selected paid provider is a
fallback. No AI or photo import runs. Identical safe public URLs share one check;
variant parameters remain distinct. Archived, trashed and paused items are excluded.
The feature starts off. Enable it after checking representative retailer links in
staging. Strict verification can leave some retailers or product options unsupported.

## Configuration

```dotenv
TZ=America/Indiana/Indianapolis
PRICE_CHECK_TIME=08:00
PRICE_CHECK_ENABLED=true
PRICE_CHECK_PAID_DAILY_LIMIT=100
PRICE_CHECK_PAID_MONTHLY_LIMIT=3000
```

`TZ` is shared by app and worker, defaults to UTC, and must be an IANA timezone.
`PRICE_CHECK_TIME` defaults to 08:00 and starts the batch, rather than promising
completion at that instant. Staging also uses `TZ` and `PRICE_CHECK_TIME`, but
requires `STAGING_PRICE_CHECK_ENABLED=true` and explicitly configured
`STAGING_PRICE_CHECK_PAID_DAILY_LIMIT` and `STAGING_PRICE_CHECK_PAID_MONTHLY_LIMIT`.
Staging price-check allowances default to zero. Its existing provider credentials,
selection and `STAGING_PAID_DAILY_LIMIT` remain separate. Preview disables checks.
Recreate app and worker after configuration changes.

Daily runs survive worker restarts and cannot repeat for the same local date.
Starting after the scheduled time catches up that day only. A nonexistent local
time runs at the next valid time; a repeated hour runs once. UTC timestamps and
UTC provider allowance periods remain unchanged. List/event timezone policies
and the external backup scheduler retain their existing behavior.

Both price-check allowances and `PAID_DAILY_LIMIT` apply. The latter defaults to
50 across imports and background lookups per provider. To permit up to 100 daily
background attempts while allowing imports, choose a larger shared ceiling, for
example 150. These are attempted-request limits, not dollar guarantees. Provider
account spending controls remain authoritative; allowances also serve other apps.
Failed dispatched requests count. Bright Data collection polling does not count
as another submission; uncertain submissions are not repeated within a run.
Administration reports separate scraper and Unlocker submission counts.

## Prices and privacy

The current listed price drives sorting and planning estimates. Original saved
prices and dated changes remain recorded. Existing items are labeled "when
tracking started" because older originals cannot be reconstructed. Missing
original prices stay unknown. A changed shopping link starts a new baseline.
Manual price corrections pause checks until an editor resumes them. Recorded
payments, contribution commitments and purchase amounts never change automatically.

A failed check retains the old price and verification timestamp. Prices older
than 48 hours are labeled last verified. Confirm the final price at the shop.
Alternate purchase offers retain their own checked timestamps; this version
refreshes the primary link only.

Price-drop subscriptions are private per account and item. Alerts require both
5% and $1 below the last alerted price, or the verified price at subscription.
Without a fresh price, the first success establishes the reference silently.
Price rebounds do not reset it. Alerts appear in the inbox; enable the Price drops
topic for external delivery. SMS is excluded. External messages hide gift details.
Current access and subscription eligibility are checked before delivery.

## Upgrade and validation

Schema version 3 adds durable price records. Upgrade app and worker together.
Back up before upgrading; older binaries reject the newer schema. Disable
`PRICE_CHECK_ENABLED` to stop checking without deleting saved data. Staging uses
its prefixed switch. Do not downgrade against the upgraded database.

Run unit tests, the PostgreSQL integration suite, build and Compose checks, plus
`node --import tsx tests/price-ui.browser.mjs` after building. Before production
activation, verify live prices and selected options for representative retailer
links with explicitly bounded staging credentials. Fixture tests do not establish
live retailer coverage. Observe failures and allowances in Administration.
