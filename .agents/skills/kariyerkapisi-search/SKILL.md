---
name: kariyerkapisi-search
version: 1.0.0
description: >
  Use this skill whenever the user wants Turkish public-sector job postings — ministries,
  agencies, regulators, universities' contract staff, A Grubu kariyer meslek (uzman
  yardımcısı, denetçi yardımcısı), sözleşmeli personel, görevde yükselme — published on
  Kariyer Kapısı (kariyerkapisi.gov.tr, Cumhurbaşkanlığı İnsan Kaynakları Ofisi), even if
  they don't name the portal. Trigger phrases: kamu iş ilanları, kamu personel alımı,
  memur alımı, sözleşmeli personel ilanı, uzman yardımcısı alımı, Kariyer Kapısı ilanları,
  kamuda iş, devlet kurumu iş ilanı, KPSS ile alım, public sector jobs Turkey, government
  jobs Turkey, civil service vacancies Turkey, Turkish ministry jobs.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts *)
---

# Kariyer Kapısı Search Skill

Search live Turkish public-sector postings from **Kariyer Kapısı**, the Presidency's
single gateway for public hiring. Reads the public JSON API behind
`kariyerkapisi.gov.tr/isealim`. No authentication, zero runtime dependencies.

Applying requires e-Devlet login; this skill only **reads** postings and never applies.

## When to use this skill

- Find open public-sector calls (ministries, regulators, universities, development agencies)
- Filter by province or posting type (Sözleşmeli, A Grubu, Görevde Yükselme, Öğretim Üyesi …)
- Read the full call: general/special conditions, quotas per province, assessment stages (KPSS weight, exam, interview)

## Commands

### Search postings

```bash
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q` — full-text keyword; matches title, institution **and posting body**. Optional (no query = all open postings).
- `--location <il>` / `-l` — province as the portal lists it, e.g. `Ankara`, `İstanbul`, `Türkiye Geneli`. Case-insensitive (Turkish upper-casing applied).
- `--type <label>` / `-t` — exact portal type label. Values: `A Grubu Memur (Kariyer Meslek)`, `B Grubu Memur`, `Sözleşmeli Personel İlanları`, `İşçi İlanları`, `Hakim ve Savcı İlanları`, `Görevde Yükselme ve Unvan Değişikliği İlanları`, `Yurt Dışı Eğitim İlanları`, `Öğretim Üyesi`, `Öğretim Görevlisi`, `Araştırma Görevlisi`, `Askeri Personel İlanları`, `Merkezi Yerleştirme (ÖSYM)`, `Sürekli İşçi`, `Geçici İşçi`, `Yeterlik Sınavı İlanları`.
- `--jobage <days>` — application period opened within N days (client-side on `date`).
- `--include-expired` — keep postings whose deadline has passed (hidden by default, as on the site).
- `--page <n>` — 20 results per page, cut client-side (the API returns all matches at once).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Fetch full posting

```bash
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts detail <guid|url> [--format json|plain]
```

Returns the call text, posting number (`ILN…`), e-Devlet application URL, and every
sub-position (`positions[]`) with title, quotas per province, assessment stages and
requirements. `location` is filled from the quotas.

## Usage examples

```bash
# All open public calls
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts search --format table

# Assistant-expert (uzman yardımcısı) calls
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts search -q "uzman yardımcısı" --format table

# Contract staff posts located in Ankara
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts search -l Ankara -t "Sözleşmeli Personel İlanları" --format table

# Calls that mention economics in their text, opened in the last 7 days
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts search -q iktisat --jobage 7 --format table

# Full call with quotas and KPSS weights
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts detail 2ce03869-1a9d-44f3-a18e-fba394abe5aa --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — `{ meta: { count, total, page }, results: [...] }`; each result has `id, title, company, unit, location, type, date, deadline, url` |
| `table` | Quick scan |
| `plain` | Reading one posting (`detail`) |

Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit code `1`.

## Notes

- `date` = application start (`basTarih`), `deadline` = application end (`bitTarih`). Public calls have hard deadlines — surface `deadline` to the user.
- Search rows have `location: null`; the province comes from `detail` (quotas). Many calls are `TÜRKİYE GENELİ`. For `/scrape` health checks a null `location` is expected here.
- Postings of type "announcement" (`ilanTipi 2`) link out to the institution's own page (`url` is that link); `detail` returns `NOT_FOUND` for them.
- The active pool is small (tens of postings) and is returned in one response; `meta.total` is exact.
- Data: `api.kariyerkapisi.gov.tr/api` public endpoints — see `url-reference.md`.
