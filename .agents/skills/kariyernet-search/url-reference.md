# Kariyer.net — endpoint reference

Measured 2026-10-18. `robots.txt` (`User-agent: *`) disallows `/filtre`, `/ozgecmis/*`, account pages,
`*?ckw*`, `*?copilot*`, `/*?v=` — **not** `/is-ilanlari` or `/is-ilani`. The site loads PerimeterX
(`client.px-cloud.net/PXqzR3QUY9/main.min.js`); the honest UA `Mozilla/5.0 (compatible; kariyernet-cli/1.0)`
gets 200 on search/detail pages but the root `/` answered 403 to a UA-less curl, and a burst of ~40
requests produced one 403.

**2026-11-18 update:** the honest UA now gets 403 on the first request (3 runs: 11-16, 11-18 02:12, 11-18 09:25;
CLI code, Bun 1.3.11 and URLs unchanged). The same URLs with browser headers (Chrome UA, `Accept`,
`Accept-Language`, `Sec-Fetch-*`, `Upgrade-Insecure-Requests`) returned 200 on 30/30 curl requests and on the
CLI's own Bun `fetch`, so the block keys on headers, not on the TLS fingerprint. `helpers.ts` sends those headers.
Volume stays low (`tr_tarama.sh` waits 20 s between requests) and a 403 still stops the run.

## Search — `GET /is-ilanlari[/<city-slug>]?<params>`

Server-rendered Nuxt 2 page (~500–700 KB).

| Param | Meaning |
|---|---|
| `kw` | keyword |
| `cp` | page (1-based; 50 organic cards/page) |
| `date` | `1g` today, `3s` 3 h, `8s` 8 h, `3g` 3 days, `7g` 7 days, `15g` 15 days (`date=1g` redirects to `/is-ilanlari/yeni?…`) |
| `sd` | sort: `dd` newest, `ad` oldest, empty = relevance |
| `ct` | city id(s), added by the redirect from the slug path: `/is-ilanlari/ankara` → `?ct=6`, `/is-ilanlari/istanbul` → `?ct=34,82` |
| `ckw` / `pkw` / `pst` | company keyword / position keyword / position id (not used; `ckw` is robots-disallowed) |

An unknown city slug redirects to `/is-ilanlari?kw=…` (no `ct`) — the CLI treats a missing `ct` as `BAD_LOCATION`.
The full query-key → filter map lives in the client bundle (`aday-spage.mncdn.com/Knet_*.js`):
`case"date"`, `case"cp"`, `case"kw"`, `case"sd"` …; filter type 9 = HISTORY (date), 18 = CITIES, 24 = KEYWORD.

### Result cards

Each result: `<div data-test="ad-card" time="6 gün" sponsor="…" isRealSponsored="…" calculatedFromScore="…" workModelText="…" workTypeText="…" positionName="…" cityName="…">`
- link `<a href="/is-ilani/<slug>-<id>" data-test="ad-card-item">`
- `data-test="ad-card-title"`, `data-test="subtitle"` (company), `data-test="location"`, `data-test="work-model"`
- `positionName` attribute is the taxonomy position, **not** the title — do not use it.
- Carousels use `data-test="slick-list-item"` (detail pages) and are skipped.
- A promoted block of up to 3 cards precedes the 50 organic cards (53 cards/page seen on every full page).
  Sponsored cards have `isRealSponsored="true"`, but boosted ones only `calculatedFromScore="true"`, and organic
  cards on short lists also carry `calculatedFromScore="true"` (3/3 cards, adCount 3). Hence identification by count.

### Count

`window.__NUXT__=(function(a,b,…){…}(v1,v2,…))`: `advertisement:{adCount:<token>,…}`; resolve `<token>`
through the parameter → argument map (e.g. `fN` → `76`). `adCount` matches the organic total
(76 = 50 + 26 over two pages).

## Detail — `GET /is-ilani/<id>` (redirects to `/is-ilani/<slug>-<id>`)

No `JobPosting` JSON-LD (only `BreadcrumbList`). Anchors:
- `data-test="job-title"`, `data-test="company-name"` (first = header), `data-test="company-location"`, `data-test="updated-date"`
- `data-test="job-feature-item"` × n (work model, type, level, department)
- `data-test="job-application-count"` ("45 başvuru")
- `<div isActive="true" versionId="1" closingDate="06.11.2026" lastPublishDate="08.10.2026" …>`
- `<div data-test="qualifications-and-job-description" class="job-detail-qualifications">` — full HTML text
An unknown id returns a page whose final URL does not contain the id → `NOT_FOUND`.
