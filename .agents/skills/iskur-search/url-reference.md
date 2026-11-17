# İŞKUR e-Şube — endpoint reference

Measured 2026-10-18. `robots.txt` (esube.iskur.gov.tr): `Allow: /`, `Disallow: /Meslek/ViewMeslekDetayPopUp.aspx/`.
Pages are UTF-8 (`Content-Type: text/html; charset=utf-8`).

## Search — `/Istihdam/AcikIsIlanAra.aspx` (ASP.NET WebForms)

1. `GET` → sets `ASP.NET_SessionId`; returns hidden fields `__VIEWSTATE` (~10 KB), `__VIEWSTATEGENERATOR`,
   `__EVENTVALIDATION`, `__EVENTTARGET`, `__EVENTARGUMENT`, plus the province `<select>`.
2. `POST` (form-urlencoded, same session cookie) with all hidden fields and:

| Field | Value |
|---|---|
| `__EVENTTARGET` | `ctl04$ctlAcikIsPageCommand$CommandItem_Search` |
| `ctl04$ctlArananMetin2` | keyword |
| `ctl04$IsyeriTuruRadios` | `ozelSektorRadio` (default) / `kamuRadio` |
| `ctl04$ctlIl` | province option value (`6` = ANKARA …; read from the form) |
| `ctl04$ctlIlanTarihi` | `1` Tümü, `2` Son 24 Saat, `3` Son 1 Hafta, `4` Son 15 Gün |

Other form fields (not used): `ctlIlce`, `ulkeGeneliChk`, `tercihEdilenIkametChk`, `ctlMeslek$…`, `ctlKisiselDurum`,
`ctlCalismaPeryodu`, `ctlEngelli`, `ctlCalismaSekli`, `ctlCalismaYeri`, `ctlUlke`, `ctlIsgucuIstemiNo`, `ctlVardiya`,
`ctlIsyeriUnvan`, `ctlOgrenimDurum` (`1` Lisans, `2` Yüksek Lisans, `10` Doktora, …).

3. Paging: `POST` again with the **previous response's** hidden fields, the same search fields, and
   `__EVENTTARGET=ctl04$ctlDataPagerDetay$btnChangeCurrentPage`, `ctl04$ctlDataPagerDetay$txtCurrentPage=<n>`.
   (`btnNext`, `btnLast` also exist.)

### Result grid `#ctl04_ctlGridAcikIslerListeDetail`

15 rows per page. Per row:
- anchor `<a onclick="PopupJobDetails(&#39;<id>&#39;,&#39;Özel|Kamu&#39;,&#39;0&#39;)">TITLE</a>`
- spans `…_ctlIsverenDL` (employer — login notice for anonymous users), `…_ctlIsverenTurDL`, `…_ctlCalismaPeriyotDL`,
  `…_ctlCalismaSekliDL`, `…_Label9` (open positions), `…_ctlCalismaYeriDL`, `…_ctlSonBasvuruTarihi` (dd.MM.yyyy)
- share toggle with `data-ilanno, data-sontarih, data-il, data-acikissayi, data-isverentur, data-calismasekli, data-meslekler`

Pager: `<input name="ctl04$ctlDataPagerDetay$txtCurrentPage" value="1"> / 91 … - Toplam Kayıt: 1353`.
No pager and no total when all matches fit on one page.

## Detail — `/Istihdam/AcikIsIlanDetay.aspx?uiID=<id>`

Public (a login prompt is shown, but the content is rendered). `isyeriTuru` parameter is optional.
- `#ctl01_ctlIsIlanBilgileri_ctlGenelSartlar` (+ `ctlOzelSartlarText`, `ctlGenelSartlarManuel`) — İş Tanımı
- `#ctl01_ctlIsIlanBilgileri_ctlGenelSartlar2` — Nitelik ve Beceriler
- `…_repeaterMeslek_ctlNN_ctlMeslekLabel`, `…ctlMeslekDeneyimSuresiLabel` (yıl), `…LabelAy` (ay)
- `…_ctlOgrenimAsgari`, `…_ctlOgrenimAzami`

Text uses named HTML entities (`&uuml;`, `&ccedil;`, `&rsquo;`).
