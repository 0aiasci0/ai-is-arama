---
name: kariyernet-search
version: 1.0.0
description: >
  Use this skill whenever the user wants private-sector job listings in Turkey from
  Kariyer.net — Turkey's largest job board — by keyword, province/district or recency,
  even if they don't name the site. Trigger phrases: Kariyer.net, iş ilanları, iş ara,
  iş bul, eleman ilanı, özel sektör iş ilanı, İstanbul iş ilanları, Ankara iş ilanları,
  İzmir iş ilanları, uzman ilanı, analist ilanı, dış ticaret uzmanı ilanı, ekonomist ilanı,
  jobs in Turkey, Turkish job board, jobs in Istanbul, jobs in Ankara, private sector jobs Turkey.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/kariyernet-search/cli/src/cli.ts *)
---

# Kariyer.net Search Skill

Search live listings on **Kariyer.net** from its public, server-rendered search and
posting pages. No authentication, zero runtime dependencies.

## ⚠️ Personal use only

Kariyer.net is a commercial job board protected by PerimeterX bot management. Its
`robots.txt` allows `/is-ilanlari` and `/is-ilani` for all agents, but automated access is
still subject to its terms. **Keep volume low** (a handful of searches per session), never
bulk-collect, and do not use the output commercially. Run it on your own responsibility.

A burst of requests gets a **403**: the CLI then exits with code `BLOCKED` and does **not**
retry. Stop and wait; do not loop. Measured 2026-10-18: one 403 after ~40 requests in an hour.

## When to use this skill

- Private-sector openings in Turkey by keyword and city/district
- Recency filter (today / 3 / 7 / 15 days) and newest-first sort
- Full posting text (qualifications + job description), deadline, application count

## Commands

### Search listings

```bash
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q` — **required.** Title, skill, or company. Matching is broad (`ekonomist` also hits "Türk Ekonomi Bankası").
- `--location <text>` / `-l` — province or district: `Ankara`, `İstanbul`, `İstanbul Avrupa`, `Muğla Bodrum`. An unknown name exits `BAD_LOCATION` (the site would silently search all of Turkey).
- `--jobage <days>` — `1` today, `≤3`, `≤7`, `≤15` days; anything else = all.
- `--sort score|date` — relevance (default) or newest first.
- `--include-promoted` — keep the promoted block (up to 3 sponsored/boosted cards above the organic results). Excluded by default.
- `--page <n>` — 50 organic results per page; `meta.pages` from the total.
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Fetch full posting

```bash
bun run .agents/skills/kariyernet-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric posting id (e.g. `4574710`) or a `kariyer.net/is-ilani/<slug>-<id>` URL.
Returns title, company, location, features (work model, type, level, department),
application count, deadline (`closingDate`), active flag, and the full posting text.

## Usage examples

```bash
# Economist roles, all of Turkey
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search -q ekonomist --format table

# Economics roles in Ankara posted in the last 7 days
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search -q iktisat -l Ankara --jobage 7 --format table

# Foreign-trade specialists in Istanbul, newest first
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search -q "dış ticaret uzmanı" -l İstanbul --sort date --format table

# Second page
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search -q muhasebe --page 2 --format table

# Full posting
bun run .agents/skills/kariyernet-search/cli/src/cli.ts detail 4574710 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — `{ meta: { count, total, page, pages }, results: [...] }`; each result has `id, title, company, location, workModel, workType, date, promoted, url` |
| `table` | Quick scan |
| `plain` | Reading one posting (`detail`) |

Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit code `1`.

## For `/scrape` and `/rank`

- **Request budget:** at most ~3 `search` calls per run, each with `--limit 20`; call `detail` only for shortlisted ids. One 403 was observed after ~40 requests in an hour.
- On `BLOCKED`, **stop using this portal for the rest of the session** and report it as rate-limited (inconclusive), not broken.
- Recency is server-side (`--jobage 14` → the 15-day bucket). `date` is a relative age string (`"6 gün"`), not an ISO date: do not drop rows because `date` fails to parse.

## Notes

- `date` is the card's relative age (`"6 gün"`, `"2 saat"`); exact dates are not on the card. `detail` gives `deadline` (ISO) and an "updated N days ago" line.
- `location` may read `İzmir +2 il daha` for multi-city postings.
- `meta.total` is the site's own count (`adCount` in the Nuxt state); it excludes the promoted block.
- The promoted block is recognised by count (cards beyond the organic count), not by a flag: organic cards on short lists carry the same "boosted" attribute.
- Endpoint and parsing anchors: `url-reference.md`.
