# Resmî Gazete — endpoint reference

Measured 2026-10-18. `robots.txt` has only `Noindex` lines for Googlebot (specific old PDFs); nothing
disallowed for `*`. Pages are `charset=Windows-1254`.

## Daily issue index — `GET /eskiler/YYYY/MM/YYYYMMDD.htm`

~8–33 KB. 404 for a day without an issue (or today before publication, ~00:00 TR time).
The İlân Bölümü links look like

```
<a href="http://www.resmigazete.gov.tr/main.aspx?home=http://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016.htm&main=http://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016-4.htm">c    - Çeşitli İlânlar</a>
```

Section letters/numbers shift by issue (`a - Yargı İlânı`, `b - Artırma, Eksiltme ve İhale İlânları`,
`c - Çeşitli İlânlar`, then TCMB rates). The CLI picks the link by label, not by number. The home page
`https://www.resmigazete.gov.tr/` shows today's issue with direct `…-4.htm` links.

## Çeşitli İlânlar section — `GET /ilanlar/eskiilanlar/YYYY/MM/YYYYMMDD-S.htm`

Word-exported HTML; one `<a href="YYYYMMDD-S-N.pdf">Institution …ndan:</a>` per announcement.
2026-10-16: 17 entries, 5 universities; 2026-10-18 (Sunday): 5 entries, 1 university.
Over 7 days (2026-10-12…18): 84 entries, 28 university entries.

## Announcement — `GET /ilanlar/eskiilanlar/YYYY/MM/YYYYMMDD-S-N.pdf`

Text PDFs (pdftotext `-layout -enc UTF-8` keeps Turkish letters and the positions table).
Some carry little or no text layer: pdftotext yields only the institution line, a title and the
page code (`10520/1-1`); 5 of 28 university entries in the week above had < 120 body characters.

## Gold check (2026-10-18, 28 university entries, 2026-10-12…18)

Headline-level manual check of every entry vs. `--peek`:

| `--peek` result | n | Manual reading |
|---|---|---|
| `academic: true` | 23 | all academic calls, cancellations or corrections of academic calls |
| `academic: false` | 1 | internal-auditor call (correct) |
| `academic: null` | 4 | 2 tender bans, 1 contract-staff call, 1 image-only PDF (İTÜ) — non-academic by title except İTÜ (unknown) |

Two rules came out of this check:
1. Only the first `HEAD_CHARS = 700` characters decide (the internal-auditor call cites "öğretim elemanı" at char 1051 → was a false positive).
2. Below `MIN_TEXT_CHARS = 120` body characters, an academic term still counts as `true` (Başkent: title sentence only, table as image), but absence gives `null`, not `false`.

## Alternatives checked

- `ilan.gov.tr` (Basın İlan Kurumu): Angular SPA; `assets/appconfig.production.json` →
  `remoteServiceBaseUrl: https://www.ilan.gov.tr/api`; `POST /api/api/services/app/Ad/AdsByFilter`
  (`application/json-patch+json`) → 403 from Kong for honest UA, browser headers, cookies, Origin/Referer.
  `robots.txt` allows it. Revisit with a browser network trace.
- `akademikilan.com`: does not resolve.
