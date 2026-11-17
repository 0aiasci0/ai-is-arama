import { describe, expect, test } from "bun:test"
import {
  CTL,
  decodeHtmlEntities,
  hiddenFields,
  isoDate,
  jobageToOption,
  parseDetail,
  parseResults,
  selectOptions,
} from "../src/helpers"
import { gotoPageFields, resolveProvince, searchFields } from "../src/commands/search"
import { normalizeId } from "../src/commands/detail"

// Trimmed from a live AcikIsIlanAra.aspx result page (2026-10-18).
function gridRow(n: string, id: string, title: string): string {
  return `<tr style="background-color:#F0F0F0;"> <td align="left" style="width:600px;"> <div>
  <a onclick="PopupJobDetails(&#39;${id}&#39;,&#39;Özel&#39;,&#39;0&#39;);return false;" id="ctl04_ctlGridAcikIslerListeDetail_${n}_flag_${id}" href="javascript:__doPostBack(&#39;x&#39;,&#39;&#39;)" style="font-weight:bold;"> ${title}</a> &nbsp; </div>
  <span id="ctl04_ctlGridAcikIslerListeDetail_${n}_ctlIsverenDL">İşyeri adını görmek için Sisteme Üye Girişi yapmanız gerekmektedir.</span> <br />
  <span id="ctl04_ctlGridAcikIslerListeDetail_${n}_ctlIsverenTurDL">Özel</span> / <span id="ctl04_ctlGridAcikIslerListeDetail_${n}_ctlCalismaPeriyotDL">Daimi</span> / <span id="ctl04_ctlGridAcikIslerListeDetail_${n}_ctlCalismaSekliDL">Tam Zamanlı</span>
  <strong><span id="ctl04_ctlGridAcikIslerListeDetail_${n}_Label9">2</span></strong> Açık Pozisyon </td>
  <td align="center"><span id="ctl04_ctlGridAcikIslerListeDetail_${n}_ctlCalismaYeriDL">İlçe Geneli Başvuru <br> (Çalışma Yeri: BURSA / YILDIRIM) </span></td>
  <td align="right"><span id="ctl04_ctlGridAcikIslerListeDetail_${n}_ctlSonBasvuruTarihi" title="Son Başvuru Tarihi">11.01.2027</span>
  <a href="javascript:void(0);" class="dropdown-toggle share-toggle" data-ilanno='${id}' data-sontarih='11.01.2027' data-il='İlçe Geneli Başvuru (BURSA / YILDIRIM) ' data-acikissayi='2' data-isverentur='Özel' data-calismasekli='Tam Zamanlı' data-meslekler='${title}' ></a></td></tr>`
}

const PAGER = `<input name="ctl04$ctlDataPagerDetay$txtCurrentPage" type="text" value="1" id="ctl04_ctlDataPagerDetay_txtCurrentPage" style="width:40px;" /> / 91 <a id="ctl04_ctlDataPagerDetay_btnChangeCurrentPage">Sayfaya Git</a> - Toplam Kayıt: 1.353</span>`

const FORM = `<form method="post" action="./AcikIsIlanAra.aspx" id="form1">
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="VS1&amp;x" />
<input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="EV1" />
<select name="ctl04$ctlIl" id="ctl04_ctlIl"><option value="">--Tüm İller--</option><option value="6">ANKARA</option><option value="34">İSTANBUL</option><option value="35">İZMİR</option></select>
</form>`

describe("parseResults", () => {
  test("parses each grid row from its PopupJobDetails anchor", () => {
    const page = parseResults(gridRow("ctl02", "00009861683", "Ön Muhasebeci") + gridRow("ctl03", "00009861724", "Garson") + PAGER)
    expect(page.cards).toHaveLength(2)
    const c = page.cards[0]
    expect(c.id).toBe("00009861683")
    expect(c.title).toBe("Ön Muhasebeci")
    expect(c.company).toBeNull() // anonymous visitors see a login notice, not the employer
    expect(c.location).toBe("İlçe Geneli Başvuru (BURSA / YILDIRIM)")
    expect(c.openings).toBe(2)
    expect(c.deadline).toBe("2027-01-11")
    expect(c.url).toContain("uiID=00009861683")
    expect(page.total).toBe(1353)
    expect(page.pages).toBe(91)
  })

  test("a malformed row does not drop the others", () => {
    const broken = `<a onclick="PopupJobDetails(&#39;nope`
    const page = parseResults(broken + gridRow("ctl03", "00009861724", "Garson"))
    expect(page.cards.map((c) => c.id)).toEqual(["00009861724"])
  })

  test("no pager means everything fits on one page", () => {
    const page = parseResults(gridRow("ctl02", "00009860230", "Diyetisyen"))
    expect(page.total).toBe(1)
    expect(page.pages).toBe(1)
  })
})

describe("form handling", () => {
  test("hiddenFields decodes ViewState values", () => {
    expect(hiddenFields(FORM).get("__VIEWSTATE")).toBe("VS1&x")
  })

  test("resolveProvince matches Turkish names case- and dot-insensitively", () => {
    expect(resolveProvince(FORM, "istanbul")).toBe("34")
    expect(resolveProvince(FORM, "Izmir")).toBe("35")
    expect(() => resolveProvince(FORM, "Atlantis")).toThrow()
  })

  test("searchFields posts the search button with the form state", () => {
    const body = searchFields(FORM, { query: "muhasebe", location: "Ankara", sector: "kamu", jobage: 7, page: 1, format: "json" })
    expect(body.get("__EVENTTARGET")).toBe(CTL.searchButton)
    expect(body.get("__VIEWSTATE")).toBe("VS1&x")
    expect(body.get(CTL.keyword)).toBe("muhasebe")
    expect(body.get(CTL.province)).toBe("6")
    expect(body.get(CTL.sector)).toBe("kamuRadio")
    expect(body.get(CTL.postingAge)).toBe("3")
  })

  test("gotoPageFields replaces the ViewState with the previous response's", () => {
    const first = searchFields(FORM, { sector: "ozel", jobage: 9999, page: 3, format: "json" })
    const next = gotoPageFields(`<input type="hidden" name="__VIEWSTATE" value="VS2" />`, first, 3)
    expect(next.get("__VIEWSTATE")).toBe("VS2")
    expect(next.get("__EVENTTARGET")).toBe(CTL.gotoPageButton)
    expect(next.get(CTL.currentPage)).toBe("3")
  })

  test("selectOptions maps labels to values", () => {
    expect(selectOptions(FORM, CTL.province).get("ANKARA")).toBe("6")
  })
})

describe("small helpers", () => {
  test("jobageToOption maps days onto the portal's buckets", () => {
    expect(jobageToOption(1)).toBe("2")
    expect(jobageToOption(7)).toBe("3")
    expect(jobageToOption(15)).toBe("4")
    expect(jobageToOption(30)).toBe("1")
    expect(jobageToOption(9999)).toBe("1")
  })

  test("decodeHtmlEntities handles the named entities rich-text editors emit", () => {
    expect(decodeHtmlEntities("g&uuml;n i&ccedil;inde &Ouml;ncelik KPSS&rsquo;ye &amp;lt;")).toBe("gün içinde Öncelik KPSS’ye &lt;")
  })

  test("isoDate converts dd.MM.yyyy", () => {
    expect(isoDate("11.01.2027")).toBe("2027-01-11")
    expect(isoDate(null)).toBeNull()
  })

  test("normalizeId accepts the posting number or an iskur.gov.tr URL only", () => {
    expect(normalizeId("00009861683")).toBe("00009861683")
    expect(normalizeId("https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009861683&isyeriTuru=Kamu")).toBe("00009861683")
    expect(normalizeId("https://iskur.gov.tr.evil.io/x?uiID=00009861683")).toBeNull()
  })
})

describe("parseDetail", () => {
  test("reads occupations, description and qualifications", () => {
    const html = `<span id="ctl01_ctlIsIlanBilgileri_ctlGenelSartlar" style="x"><p>Ön muhasebe elemanı alınacaktır.</p>
<p>Hafta i&ccedil;i</p></span>
 <span id="ctl01_ctlIsIlanBilgileri_ctlOzelSartlarText" style="x"></span>
 <span id="ctl01_ctlIsIlanBilgileri_ctlGenelSartlarManuel" style="x"></span>
 </td>
<span id="ctl01_ctlIsIlanBilgileri_ctlGenelSartlar2" style="x"><p>Randevu alınız.</p></span>
 </td>
<span id="ctl01_ctlIsIlanBilgileri_repeaterMeslek_ctl01_ctlMeslekLabel">Ön Muhasebeci</span>
<span id="ctl01_ctlIsIlanBilgileri_repeaterMeslek_ctl01_ctlMeslekDeneyimSuresiLabel">2</span> Yıl
<span id="ctl01_ctlIsIlanBilgileri_repeaterMeslek_ctl01_ctlMeslekDeneyimSuresiLabelAy"></span>
<span id="ctl01_ctlIsIlanBilgileri_ctlOgrenimAsgari" style="x">Lisans</span>`
    const d = parseDetail(html, "00009861683")
    expect(d.title).toBe("Ön Muhasebeci")
    expect(d.occupations[0].experience).toBe("2 yıl")
    expect(d.description).toBe("Ön muhasebe elemanı alınacaktır.\nHafta içi")
    expect(d.qualifications).toBe("Randevu alınız.")
    expect(d.educationMin).toBe("Lisans")
  })
})
