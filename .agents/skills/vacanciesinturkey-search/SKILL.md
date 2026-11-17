---
name: vacanciesinturkey-search
version: 1.0.0
description: >
  Use this skill whenever the user wants English-language job listings located in Turkey
  from Vacancies in Turkey (vacanciesinturkey.com) — private sector, UN agencies, NGOs,
  embassies and international organisations in Istanbul, Ankara, Gaziantep and other
  cities — by keyword, even if they don't name the site. Trigger phrases: Vacancies in
  Turkey, jobs in Turkey in English, UN jobs Turkey, NGO jobs Turkey, international jobs
  Istanbul, international jobs Ankara, embassy jobs Turkey, expat jobs Turkey, iş ilanı
  İngilizce, uluslararası kuruluş ilanı, BM ilanı Türkiye, STK ilanı.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts *)
---

# Vacancies in Turkey Search Skill

Search live listings on **Vacancies in Turkey** through the site's own public listing
endpoint, then open every result's posting page to read the full text and decide whether
the job is located in Turkey. No authentication, zero runtime dependencies.

## ⚠️ Personal use only

`robots.txt` (2026-11-17) disallows only `/wp-admin/`, `/wp-includes/`, `/?s=` and similar
paths; the listing endpoint and `/job/` pages are allowed. The site's terms of use were
**not** read; check them before relying on this skill. Cloudflare sits in front but
issued no challenge in the pilot (≈150 requests in one session, no 403). **Keep volume
low**: one search opens up to 50 posting pages, 2 s apart by default. A 403 exits with
`BLOCKED` and is not retried.

## Why the Turkey filter reads the posting text

The site's location field is unreliable. Foreign postings are geocoded onto Turkish
places: "Analyst, Benelux" (Amsterdam office) is filed as "Van, Turkey"; Canada-remote
postings as "Çan, Turkey". So `search` opens each posting page and judges the title and
full text (`turkeyVerdict` in `cli/src/helpers.ts`):

| Evidence | Verdict |
|---|---|
| Site location is abroad (or `Çan, Turkey`, which stood for Canada in 5 of 5 cases) and no Turkish city is named in title or text | `no` |
| Title names Turkey or a Turkish city | `yes` |
| Title names a foreign place, but a Turkish city appears in the text or site location | `unclear` |
| Title names a foreign place only | `no` |
| Text names Turkey only | `yes` |
| Text names Turkey and foreign places; site city is Turkish | `yes` |
| Text names foreign places only; site city is Turkish | `unclear` (company office lists, e.g. "offices in Berlin, Amsterdam, Dubai") |
| Text names foreign places only; no Turkish site city | `no` |
| No place named anywhere | `unclear` |

"Turkish" alone is not a place (it usually names a language). The filter is about
**location only**; it does not compare the posting with the CV. CV fit happens later, on
the `description` field.

Pilot (2026-11-17, queries analyst / economist / research / data, 94 open postings), after
the last rule change: 57 `yes`, 30 `unclear`, 7 `no`. Checked against the posting text
(labelled by hand from the saved descriptions):

| Verdict | n | Checked | Found |
|---|---|---|---|
| `no` | 7 | all 7 | all abroad (Riyadh ×2, Berkeley, Amsterdam, Canada ×2, Dubai) |
| `unclear` | 30 | all 30 | 29 in Turkey (mostly Istanbul postings that name no place), 1 location unknown ("Anywhere", Turkish NGO) |
| `yes`, site city not Turkish | 10 | all 10 | all in Turkey |
| `yes`, site city Turkish | 47 | **not read** | title/text named a Turkish place and the site city agreed |

So `default` mode lost no Turkey posting in the pilot; `strict` would have dropped 29
Turkey postings.

## Commands

### Search listings

```bash
bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q` — **required.**
- `--location <text>` / `-l` — site-side location filter (`Istanbul`, `Ankara`). Unreliable; the Turkey filter is what restricts results.
- `--turkey default|strict|off` — `default` drops `no` and keeps `unclear`; `strict` keeps only `yes` (loses many Istanbul postings that name no place); `off` keeps all.
- `--jobage <days>` — keep postings published within `<days>` (from JSON-LD `datePosted`). Cards whose relative age ("Posted 2 months ago", a lower bound) already exceeds it are skipped before their pages are opened (pilot: `data analyst`, 26 records → 6 pages opened instead of 10).
- `--include-expired` — the endpoint also returns expired postings (17 of 28 for `analyst`); they are skipped, and their pages are not opened, by default.
- `--no-details` — do not open posting pages (no Turkey verdict, no description).
- `--limit <n>` / `-n` — open at most `<n>` posting pages; applied **before** the Turkey filter, so fewer may remain.
- `--delay <ms>` (default 2000), `--page <n>` (50/page), `--format json|table|plain`.

### Fetch one posting

```bash
bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts detail <id|slug|url> [--format json|plain]
```

Returns title, organisation, category, employment type, `datePosted`, `deadline`
(`validThrough`), the full description and the Turkey verdict with its evidence.
Expired postings exit with code `EXPIRED`.

## Usage examples

```bash
bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts search -q economist --format table
bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts search -q analyst -l Istanbul --jobage 30 --format table
bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts search -q research --turkey strict --limit 20
bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts detail analyst-benelux --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — `{ meta: { count, total, page, pages, checked, dropped: { notTurkey, unclear, tooOld, expired }, turkeyMode, blocked }, results: [...] }`; each result has `id, title, company, location, jobType, posted, status, url, date` (ISO `datePosted` when the page was read, else the card's relative age), `datePosted, deadline, category, employmentType, turkey, turkeyReason, turkeyEvidence, description` |
| `table` | Quick scan (verdict column `TR`) |
| `plain` | Reading |

Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit code `1`.

## For `/scrape` and `/rank`

- **Request budget:** 1 listing request + 1 request per open posting. Use `--limit 20` per query and at most ~4 queries per run.
- Report `unclear` rows with their `turkeyReason`; do not silently drop them.
- `location` (site field) is not evidence of place; use `turkey` and the description.
- The JSON-LD salary (1500 USD monthly on every posting checked) is a site placeholder and is not emitted.
- On `BLOCKED`, stop using this portal for the rest of the session.

## Notes

- Endpoint and parsing anchors: `url-reference.md`.
- The site carries many non-target roles (sales, hospitality, engineering); keyword matching is broad (`research` matches 388 postings).
