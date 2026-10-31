# Configure shop lookups

Little Hint first uses its built-in product parser for ordinary shops. You can choose one paid provider to help with blocked or incomplete pages. Bright Data additionally supports dedicated product APIs for Amazon, Walmart, Target, and Best Buy US product links.

## Choose lookup behavior

Set `SCRAPING_PROVIDER` in production, or `STAGING_SCRAPING_PROVIDER` in staging. Supported values are:

| Value          | Behavior                                                                        |
| -------------- | ------------------------------------------------------------------------------- |
| `brightdata`   | Bright Data retailer Scraper APIs and Web Unlocker                              |
| `scrapingfish` | Scraping Fish                                                                   |
| `scrapingbee`  | ScrapingBee                                                                     |
| `scrapedo`     | Scrape.do                                                                       |
| `scrapingdog`  | Scrapingdog                                                                     |
| `auto`         | First configured provider in this order: Fish, Bee, Scrape.do, Dog, Bright Data |
| `none`         | Manual entry only; no extraction, automatic photos, or product-detail AI                                      |

An explicit selection never silently falls through to another paid provider. Supply that provider's credentials to both the app and worker. Bright Data also requires its Unlocker zone. Restart/recreate both services after changing the environment.

## Credentials and shared limits

| Provider      | Production credential variables                     |
| ------------- | --------------------------------------------------- |
| Scraping Fish | `SCRAPINGFISH_API_KEY`                              |
| ScrapingBee   | `SCRAPINGBEE_API_KEY`                               |
| Scrape.do     | `SCRAPEDO_API_KEY`                                  |
| Scrapingdog   | `SCRAPINGDOG_API_KEY`                               |
| Bright Data   | `BRIGHTDATA_API_KEY` and `BRIGHTDATA_UNLOCKER_ZONE` |

Prefix every variable with `STAGING_` for staging. Production credentials are ignored in staging. Supply the selected provider's variables to both the app and worker and recreate both services after changing them.

`PAID_DAILY_LIMIT`, or `STAGING_PAID_DAILY_LIMIT`, limits dispatched attempts per paid service per UTC day. Failed dispatched attempts count. It is not a dollar cap. Use provider-side spending controls for billing limits. Progress checks on an existing Bright Data collection do not count as new submissions.

## Bright Data setup

### Account, token, and Web Unlocker zone

1. Create a Bright Data account and review its current pay-as-you-go terms, account verification requirements, and spending controls. Free credits depend on account eligibility; the app does not assume they are available.
2. In the Bright Data dashboard, enable Web Unlocker and create a zone, for example `little_hint_shops`. Copy the exact zone name. This is a Bright Data product configuration, not a DNS record or another server.
3. Create an API token with access to Web Unlocker and the Scraper APIs. Store it in your deployment secret manager. Do not put it in Git or browser configuration.
4. Confirm access to the four product scrapers below. Little Hint supplies the dataset IDs itself. You do not need a schedule, webhook, cloud storage destination, separate token per store, or a custom scraper.

| Store    | Product scraper dataset ID |
| -------- | -------------------------- |
| Amazon   | `gd_l7q7dkf244hwjntr0`     |
| Walmart  | `gd_l95fol7l1ru6rlo116`    |
| Target   | `gd_ltppk5mx2lp0v1k0vo`    |
| Best Buy | `gd_ltre1jqe1jfr7cccf`     |

These adapters target US product links. Category pages, search results, and other regional storefronts use the general website path. Retailer coverage is explicit: enabling Bright Data does not automatically install every scraper in its catalog.

### Retailer routing and verification

With Bright Data selected, supported Amazon, Target, Walmart, and Best Buy product links go directly to their dedicated scraper. Ordinary shops use built-in extraction first, then Web Unlocker if needed. A retailer collection failure keeps the private draft for retry or manual entry; it does not trigger another paid scraper automatically.

Direct-only probes from the staging worker on 2026-10-31 produced these results for the supplied products:

| Store    | Built-in result                                               | Routing decision     |
| -------- | ------------------------------------------------------------- | -------------------- |
| Amazon   | Existing short-link lookup succeeds through its dedicated API | Keep dedicated first |
| Target   | Correct selected Taupe 11 loafer title, no usable price       | Dedicated first      |
| Walmart  | Correct Nintendo Switch 2 title, no usable price              | Dedicated first      |
| Best Buy | LG TV preview blocked                                         | Dedicated first      |

These observations cover these product pages and the deployment's network, not every product at each store. Recheck representative pages before changing these exceptions. The probes disabled paid providers, AI, photo downloads, and caching.

Target's `preselect` query identifies the selected variant and takes precedence over the parent product ID in the path. Best Buy supports both older `/<sku>.p` links and newer `/product/.../sku/<sku>` links. Little Hint includes the Best Buy dataset ID; confirm your API token has access to it. During staging verification, Best Buy appeared automatically in My scrapers after the app's first dedicated API collection. No manual scraper creation or activation was needed with the existing token. The list shows scrapers used by the account; it is not the app's routing configuration.

### Network restrictions

In the Web Unlocker zone's security settings, configure these controls according to where Little Hint runs and which shops it should support:

| Setting              | Recommended configuration                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowed IPs          | Add the public outbound IP of the server running the app and worker. If production and staging share that address, one entry covers both; otherwise include both servers' outbound addresses. |
| Allowed target hosts | Leave `any` to support product links from arbitrary shops. These are destination shop domains, such as `ombraz.com`, not Little Hint's production or staging domains.                         |

For a typical Coolify deployment on a DigitalOcean VPS, the outbound address is the VPS's public IP. Confirm the address used by outbound requests if the server uses a NAT gateway, VPN, or other routing. Do not enter a Docker container's private IP or infer the outbound address from the app's DNS records, which may point to a CDN or reverse proxy. Update the allowlist if the deployment's outbound address changes.

A target-host allowlist is optional if you deliberately support only specific shops, but it must be maintained as users add new stores. Do not add `littlehint.affolder.cloud` or `littlehint-staging.affolder.cloud` as target hosts for product lookups.

These are zone settings. Do not assume they restrict the separate retailer Scraper API or every use of the API token; Bright Data distinguishes API-key access from native proxy access in its [authentication documentation](https://docs.brightdata.com/api-reference/authentication).

After changing restrictions, test an ordinary-shop lookup that reaches Web Unlocker and a dedicated retailer lookup from each deployed environment. Use uncached product links so a cached result does not hide an access problem. A built-in-only lookup does not verify Web Unlocker access.

### Production environment

Set these environment variables for **both the app and worker**, then recreate both services:

```dotenv
SCRAPING_PROVIDER=brightdata
BRIGHTDATA_API_KEY=your-secret-api-token
BRIGHTDATA_UNLOCKER_ZONE=little_hint_shops
PAID_DAILY_LIMIT=50
```

Use a daily limit appropriate for your installation. This is a count of paid attempts per provider per UTC day, not a dollar limit. Failed dispatched attempts count. Bright Data retailer submissions and Unlocker requests share this allowance; polling an existing collection does not spend another attempt. Configure account-level spending controls in Bright Data as well.

The supplied Compose files pass these settings through their shared app/worker environment. Configuration stays deployment-only; there are no credential fields in the PWA.

### Staging environment

Staging ignores production credentials. Set these separately:

```dotenv
STAGING_SCRAPING_PROVIDER=brightdata
STAGING_BRIGHTDATA_API_KEY=your-staging-api-token
STAGING_BRIGHTDATA_UNLOCKER_ZONE=little_hint_shops
STAGING_PAID_DAILY_LIMIT=10
```

Staging calls can use real provider credits. Preview environments do not inherit these credentials. A separate staging zone or account is optional, but can help separate provider-side usage.

## Verify the setup

Open Settings → Administration → Service status. Shop lookups should report **Configured — Bright Data**. This checks configuration presence, not connectivity or credit balance. Confirm the worker is running under Background jobs.

Try one current product URL for each of the four stores, an Amazon short link, and an independent store. Check the imported product identity, selected option, currency, and photo. Repeat a successful lookup to exercise the cache. For a slow lookup, save the draft, close the PWA, and reopen it from My lists. It must remain private until you review and add it.

Failed lookups retain the draft. Check Background jobs for sanitized diagnostics. HTTP 401/403 usually calls for checking token permissions; billing/allowance failures require checking the account and application limits. A missing zone prevents Bright Data selection. Never send API keys when reporting an error.

For Bright Data failures, the diagnostic stage identifies submission (`brightdata-submit`), progress checks (`brightdata-progress`), or result download (`brightdata-result`). A submission HTTP 400 means the API rejected the request before creating a collection; it does not mean Amazon blocked the scraper. The accompanying category distinguishes rejected input fields, account access, billing, or an inactive service when the provider supplies that information. Unknown responses retain the HTTP status without exposing raw response bodies, product links, or credentials. If no collection was created, it may not appear in Bright Data's collection logs.

An Amazon `a.co` or `amzn.to` link must first resolve to a supported product page. The app then submits that product URL to the Amazon scraper. The draft can still display `Item from a.co` until product details arrive; that label alone does not indicate which provider ran. A failed draft remains private and can be retried after the cause is corrected.

Collections run asynchronously and normally get checked about every ten seconds for up to ten minutes. The final check still downloads a ready result, even if the worker runs after that deadline. If the collection is still running, the draft stays private and can be retried. A retry resumes the same known collection with another ten-minute waiting window, without another paid submission. If the submission outcome is uncertain, automatic resubmission is blocked to avoid duplicate charges; manual entry remains available.

## Other providers and limitations

To use Scraping Fish again, set `SCRAPING_PROVIDER=scrapingfish` and its API key, or use the corresponding staging variables. There is no automatic paid-provider cascade. Existing `auto` precedence is preserved.

The app keeps currency in USD. Unknown prices, ranges, unavailable variants, and unverified currencies may require manual entry. Automatic-photo settings still apply. Scraping success depends on the shop and provider; configuration alone does not guarantee successful extraction.

Official references, checked 2026-10-31: [Scraper catalog](https://docs.brightdata.com/scrapers.json), [asynchronous collections](https://docs.brightdata.com/api-reference/rest-api/scraper/asynchronous-requests), [Web Unlocker API](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website), [Scraper pricing](https://brightdata.com/pricing/web-scraper).

### Manual operation

Set `SCRAPING_PROVIDER=none`, or `STAGING_SCRAPING_PROVIDER=none` in staging, on both app and worker and recreate both services. This now disables the entire product-detail pipeline, including direct extraction and cached lookups. Existing private drafts remain editable and can be added manually. Pending jobs stop with manual-entry guidance. Requests already dispatched cannot be recalled.

Use `auto` for direct extraction and optional product-detail AI. With provider credentials configured, `auto` also selects the first available paid provider. To use direct extraction without paid requests, set `PAID_DAILY_LIMIT=0`. AI gift suggestions have their own configuration and are not disabled by manual product entry. Current-month usage remains visible after disabling a service.
