---
name: iskur-search
version: 1.0.0
description: >
  Use this skill whenever the user wants job vacancies registered with İŞKUR (Türkiye İş
  Kurumu) — private-sector openings by province and district, or public-sector worker
  (kamu işçi) calls that İŞKUR publishes — even if they don't name İŞKUR. Trigger phrases:
  İŞKUR iş ilanları, açık iş ilanları, iş kurumu ilanları, kamu işçi alımı, işçi alımı,
  il bazında iş ilanı, Ankara iş ilanları, İstanbul iş ilanları, esube iskur, iş arıyorum,
  eleman ilanı, Turkish employment agency vacancies, ISKUR jobs, jobs in Turkey by province,
  public worker recruitment Turkey.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/iskur-search/cli/src/cli.ts *)
---

# İŞKUR Search Skill

Search live open vacancies from **İŞKUR e-Şube** (`esube.iskur.gov.tr`), the public
employment agency's job board. Drives the public WebForms search page with plain `fetch`
(no browser). No authentication, zero runtime dependencies.

## When to use this skill

- Private-sector openings in a Turkish province/district (`--sector ozel`, default)
- Public-sector worker calls placed through İŞKUR (`--sector kamu`; KPSS / priority-list rules in the text)
- Recency filter (last 24 h / week / 15 days)

## Commands

### Search vacancies

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q` — keyword (occupation, skill). Optional.
- `--location <il>` / `-l` — province (`Ankara`, `İstanbul`, `izmir` …); matched against the form's own list, Turkish-case-insensitive. Unknown names exit `BAD_LOCATION`.
- `--sector ozel|kamu` / `-s` — private (default) or public-sector worker calls.
- `--jobage <days>` — mapped onto the portal's buckets: `1` → last 24 h, `≤7` → last week, `≤15` → last 15 days, anything else → all.
- `--page <n>` — 15 results per page (server-side). `meta.pages` gives the page count.
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Fetch full vacancy

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the 11-digit İşgücü İstemi number (e.g. `00009861683`) or an
`AcikIsIlanDetay.aspx?uiID=…` URL. Returns occupations (with required experience),
job description, qualifications, and minimum/maximum education.

## Usage examples

```bash
# Accounting roles in Ankara
bun run .agents/skills/iskur-search/cli/src/cli.ts search -q muhasebe -l Ankara --format table

# Sales-representative roles posted in the last week, anywhere
bun run .agents/skills/iskur-search/cli/src/cli.ts search -q "satış temsilcisi" --jobage 7 --format table

# Public-sector worker calls
bun run .agents/skills/iskur-search/cli/src/cli.ts search -s kamu --format table

# Page 2 of Istanbul software roles
bun run .agents/skills/iskur-search/cli/src/cli.ts search -q yazılım -l İstanbul --page 2 --format table

# Full vacancy text
bun run .agents/skills/iskur-search/cli/src/cli.ts detail 00009861683 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — `{ meta: { count, total, page, pages }, results: [...] }`; each result has `id, title, company, location, sector, period, workType, openings, date, deadline, url` |
| `table` | Quick scan |
| `plain` | Reading one vacancy (`detail`) |

Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit code `1`.

## For `/scrape` and `/rank`

- Recency is **server-side**: pass `--jobage 14` (→ "Son 15 Gün"). `date` is always `null` here, so **do not apply a client-side date filter** — it would discard every row. Use `deadline` to skip closed postings.
- `company: null` on every result is expected (see Notes), not a degraded signal.
- Each search costs 2 requests (+1 per page beyond the first); keep to a few queries per run.

## Notes

- `--query` is a loose substring match over the posting text: short words over-match (`veri` → 751 hits, last week). Use multi-word occupation names (`satış temsilcisi` → 41).
- **`company` is always `null`:** İŞKUR shows the employer only to logged-in job seekers. The vacancy number, location (district), deadline and text are public. **For `/scrape` health checks: `company: null` on every result is expected for this portal and is not a degraded signal.**
- `date` is `null` (the grid shows only the application deadline → `deadline`, ISO `yyyy-mm-dd`).
- `location` reads like `İlçe Geneli Başvuru (ANKARA / ÇANKAYA)`: the scope of who may apply plus the workplace.
- Applying goes through e-Şube login or an İŞKUR job counsellor; many private postings say so in the qualifications text.
- Each `search` is 2 requests (form GET + search POST); `--page N>1` adds one more. Keep volume low.
- `robots.txt` on `esube.iskur.gov.tr` allows `/` (only a popup path is disallowed). Endpoint details: `url-reference.md`.
