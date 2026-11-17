---
name: resmigazete-akademik-search
version: 1.0.0
description: >
  Use this skill whenever the user wants academic job calls in Turkey — faculty positions
  (Profesör, Doçent, Dr. Öğretim Üyesi), Öğretim Görevlisi, Araştırma Görevlisi — that
  universities publish in the Resmî Gazete, even if they don't name the gazette. Trigger
  phrases: akademik ilanlar, akademik personel ilanı, öğretim üyesi ilanı, öğretim görevlisi
  alımı, araştırma görevlisi ilanı, üniversite kadro ilanı, doçent kadrosu, profesör ilanı,
  Resmî Gazete ilanları, YÖK ilanı, academic jobs Turkey, faculty positions Turkey,
  university jobs Turkey, postdoc Turkey, lecturer jobs Turkey.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts *)
---

# Resmî Gazete Academic Calls Skill

Under Law 2547 and the *Öğretim Üyeliğine Yükseltilme ve Atanma Yönetmeliği*, Turkish
universities publish their faculty calls in the **Resmî Gazete** (official gazette), section
*İlân Bölümü → Çeşitli İlânlar*, one PDF per announcing institution. This skill walks the
daily issue indexes and lists the university entries. No authentication, zero runtime
dependencies; PDF text uses **pdftotext** (Poppler) when available.

> Why not ilan.gov.tr? Its API (behind a Kong gateway) answered 403 to every request on
> 2026-10-18 although `robots.txt` allows it. Kariyer Kapısı (`kariyerkapisi-search`) also
> carries some Öğretim Üyesi / Öğretim Görevlisi / Araştırma Görevlisi calls — query both.

## When to use this skill

- Faculty and research-staff calls from the last N days (default 7)
- Calls from one university or city (`--query`)
- The full call text: positions table, field requirements, documents, deadline

## Commands

### List announcements

```bash
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--jobage <days>` — issues to scan, today backwards (default `7`, max `60`). Each day = 2 requests.
- `--query <text>` / `-q` — filter on the announcer label, Turkish-insensitive: `ankara`, `hacettepe`, `teknik`.
- `--all` — every Çeşitli İlânlar entry (ministries, agencies, municipalities), not only universities.
- `--peek` — open each listed PDF (1 request each, after paging/`--limit`): adds `headline`, `academic`, `kind`. Needs pdftotext.
- `--page <n>` (20/page, client-side), `--limit <n>` / `-n`, `--format json|table|plain`.

### Read one announcement

```bash
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts detail <id|pdf-url> [--format json|plain]
```

`id` is `YYYYMMDD-S-N` (e.g. `20261016-4-11`). Returns the extracted text (`description`),
`headline`, `academic`, `kind`, `scanned` and the PDF `url`.

## Usage examples

```bash
# University announcements of the last week
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts search --format table

# Ankara universities, last two weeks, with headline + academic flag
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts search --jobage 14 -q ankara --peek --format table

# Peek the 10 most recent entries only
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts search --peek --limit 10 --format plain

# Full text of one call
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts detail 20261016-4-11 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — `{ meta: { count, total, page, daysScanned, issuesFound }, results: [...] }`; each result has `id, title, company, location (null), date, url, university, academic, kind` |
| `table` | Quick scan (`A` column: `A` academic, `-` not, `?` unknown) |
| `plain` | Reading one call (`detail`) |

Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit code `1`.

## For `/scrape` and `/rank`

- **Do not pass role keywords as `--query`.** `--query` filters the *announcing institution* (e.g. `ankara`, `hacettepe`); a job-title query such as `ekonomist` matches nothing, and 0 results is then not a health signal.
- Run `search --jobage 14 --peek --limit 20` (one PDF per result), keep `academic: true` (and `null` for manual review), then read candidates with `detail` and match the field requirements in the text against the profile.
- `location: null` and `title` = announcer label (without `--peek`) are expected, not degraded.

## Notes

- **University ≠ academic.** Universities also announce contract staff, internal auditors and tender bans here. Without `--peek`, `academic` is `null`; with it, the flag is read from the head of the text only (first 700 characters), because deeper text cites academic titles in other contexts.
- **`academic: null` with `scanned: true`** = image-only PDF (no text layer). Open the `url`; never treat it as "not academic".
- `kind`: `ilan` (call), `iptal` (cancellation of an earlier call), `duzeltme` (correction). Cancellations and corrections name the original issue date.
- `date` is the gazette issue date. Calls usually run **15 days from publication**; read the deadline in the text.
- `title` is the headline when peeked, else the announcer label. `location` is null (read the text).
- The gazette pages are windows-1254; the CLI decodes them itself. Days without an issue (404) are skipped; `meta.issuesFound` shows how many were read.
- pdftotext lookup: `PDFTOTEXT` env var → PATH → `C:\Program Files\Git\mingw64\bin\pdftotext.exe` / Chocolatey. Missing → `description: null`, PDF url still returned; `--peek` exits `MISSING_PDFTOTEXT`.
- Endpoint details: `url-reference.md`.
