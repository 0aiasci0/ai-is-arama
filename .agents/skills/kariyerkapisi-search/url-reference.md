# Kariyer Kapısı — endpoint reference

Measured 2026-10-18. The public site `https://kariyerkapisi.gov.tr/isealim` is a jQuery page;
`/js/Infrastructure.*.js` sets `iko.var.apiURL = 'https://api.kariyerkapisi.gov.tr/api'` and
`/js/Index/Main.*.js` calls the endpoints below. The older host `kariyerkapisi.cbiko.gov.tr`
no longer resolves.

Access: no robots.txt on either host (404 / 406). No auth, no cookies, no CSRF token needed for
the `*Public` endpoints. Honest UA `Mozilla/5.0 (compatible; kariyerkapisi-cli/1.0)` is accepted.

## Search — `POST /ilan/SearchIlanPublic`

Body (JSON, UTF-8):

| Field | Value | Notes |
|---|---|---|
| `krM_ID` | `0` | institution id; 0 = all |
| `searchText` | `""` or text | full-text: title, institution and posting body |
| `il` | `"0"` or province **text** | upper-case Turkish as listed (`"ANKARA"`, `"İSTANBUL"`, `" TÜRKİYE GENELİ"` has a leading space in the list; trimmed text matches) |
| `ilanTuru` | `"0"` or type **text** | the page sends the option text, not an id |

Response: array of
`{ guid, kurumAdi, birimAdi, ilanBaslik, ilanTipi, ilanTuru, sonDurumu, basTarih, bitTarih, onay, onayAciklama, onayDate, logo_Path, basvuruLinki, closestIlanStartDate }`.

- All matches in one response (no paging). 2026-10-18: 30 rows = sum of `ilanCountForKurum`.
- `ilanTipi`: 1 = applied on Kariyer Kapısı (detail at `/IlanDetay?i=<guid>`); 2 = announcement, `basvuruLinki` points to the institution.
- The page filters `bitTarih >= now` (end of day) client-side; the CLI does the same.
- Some `ilanTuru` values end with `,`.

## Page bootstrap — `POST /ilan/GetIseAlimPage`

Same body. Returns `{ ilanCountForKurum[], ilanTuru[], sehirList[], searchIlan[] }` — the type and
province vocabularies (`ilanTuruAdi`, `il_Adi`).

## Detail — `POST /ilan/GetIlanPreviewPublic`

Body `{ "ilanGuid": "<guid>" }` (field name is `ilanGuid`; `guid` gives 400). 204 = unknown guid.
Fields: `kurumAdi, birimAdi, ilanBaslik, ilanMetni (BBCode), ilN_NO, ilanTuru, basTarih, bitTarih, eDevletServisURL, eDevletteGorunsun, basvuruLinki, kontenjan, logo_Path, krM_ID`.

## Sub-positions — `POST /altilan/GetAltIlanInfoByIlanIdPublic`

Body `{ "ilanGuid": "<guid>" }`. Array of
`{ ilanBaslik, ilanMetni, unvan, hizmetSinifi, kadroDerecesi, kontenjanList[{il, kontenjan}], degerlemeAsamaList[{asamaAdi, agirlik, sinavsizAsama, …}] }`.

## Not used

`/RSS/RssLinkiAl` builds an embeddable feed for institutions' websites; the JSON API is simpler.
