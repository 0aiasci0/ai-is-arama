import { describe, expect, test } from "bun:test"
import {
  HEAD_CHARS,
  classify,
  dayIndexUrl,
  dayString,
  decodeCp1254,
  noticeKind,
  parseSection,
  pdfUrl,
  variousSectionUrl,
} from "../src/helpers"
import { normalizeId } from "../src/commands/detail"

// Trimmed from live pages (2026-10-16).
const INDEX = `<a href="http://www.resmigazete.gov.tr/main.aspx?home=http://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016.htm&amp;main=http://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016-3.htm">b    - Artırma, Eksiltme ve İhale İlânları</a>
<a href="http://www.resmigazete.gov.tr/main.aspx?home=http://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016.htm&amp;main=http://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016-4.htm">c    - Çeşitli İlânlar</a>`

const SECTION = `<p><a href="20261016-4-9.pdf">Kültür ve Turizm Bakanlığı Vakıflar Genel Müdürlüğünden:</a></p>
<p><a href="20261016-4-10.pdf">İskenderun Teknik
  Üniversitesi Rektörlüğünden:</a></p>
<p><a href="20261016-4-11.pdf">İstanbul Gedik Üniversitesi Rektörlüğünden:</a></p>`

describe("windows-1254 decoding", () => {
  test("decodes the six Turkish letters and Latin-1", () => {
    const bytes = new Uint8Array([0xc7, 0x65, 0xfe, 0x69, 0x74, 0x6c, 0x69, 0x20, 0xdd, 0x6c, 0xe2, 0x6e, 0x20, 0xd0, 0xf0, 0xfd, 0xde, 0xfc, 0xf6, 0x92])
    expect(decodeCp1254(bytes)).toBe("Çeşitli İlân ĞğıŞüö’")
  })
})

describe("issue navigation", () => {
  test("finds the Çeşitli İlânlar section link, whatever its number", () => {
    expect(variousSectionUrl(INDEX)).toBe("https://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016-4.htm")
    expect(variousSectionUrl("<a href='x'>a - Yargı İlânları</a>")).toBeNull()
  })

  test("parseSection reads one entry per PDF and flags universities", () => {
    const items = parseSection(SECTION, "20261016")
    expect(items.map((a) => [a.id, a.university])).toEqual([
      ["20261016-4-9", false],
      ["20261016-4-10", true],
      ["20261016-4-11", true],
    ])
    expect(items[1].institution).toBe("İskenderun Teknik Üniversitesi Rektörlüğünden")
    expect(items[1].date).toBe("2026-10-16")
    expect(items[1].url).toBe("https://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016-4-10.pdf")
  })

  test("URLs are built from the yyyymmdd day", () => {
    expect(dayIndexUrl("20261016")).toBe("https://www.resmigazete.gov.tr/eskiler/2026/10/20261016.htm")
    expect(pdfUrl("20261016-4-11")).toBe("https://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016-4-11.pdf")
  })

  test("dayString uses Turkey's calendar day", () => {
    // 22:30 UTC on 17 Oct is already 18 Oct in Istanbul (UTC+3).
    expect(dayString(new Date("2026-10-17T22:30:00Z"), 0)).toBe("20261018")
    expect(dayString(new Date("2026-10-17T22:30:00Z"), 2)).toBe("20261016")
  })
})

describe("classify", () => {
  const head = "İstanbul Gedik Üniversitesi Rektörlüğünden:\n"
  test("faculty call in the head of the text is academic", () => {
    const c = classify(head + "Üniversitemize 2547 sayılı Yükseköğretim Kanunu uyarınca aşağıda belirtilen kadroya Öğretim Elemanı alınacaktır. Başvurular 15 gün içinde yapılır ve belgeler fakülteye teslim edilir.")
    expect(c.academic).toBe(true)
    expect(c.kind).toBe("ilan")
    expect(c.headline).toContain("Öğretim Elemanı alınacaktır.")
  })

  test("an academic title deep in a non-academic call does not count", () => {
    const filler = " Genel İdare Hizmetleri sınıfında kadroya naklen atama yapılacaktır.".repeat(15)
    const text = head + "İÇ DENETÇİ ALIM İLANI" + filler + " doktora unvanını almış öğretim elemanı olarak deneyim."
    expect(text.indexOf("öğretim elemanı")).toBeGreaterThan(HEAD_CHARS)
    expect(classify(text).academic).toBe(false)
  })

  test("a scanned PDF (no text layer) is unknown, not 'not academic'", () => {
    const c = classify("İstanbul Teknik Üniversitesi Rektörlüğünden:\n\n10520/1-1")
    expect(c).toEqual({ headline: null, academic: null, kind: null, scanned: true })
  })

  test("a short text with an academic term is still academic", () => {
    const c = classify("Başkent Üniversitesi Rektörlüğünden:\n\nAşağıda Belirtilen Bölümlere Öğretim Üyesi, Öğretim Görevlisi Alınacaktır.\n10500/1-1")
    expect(c.academic).toBe(true)
    expect(c.scanned).toBe(true)
  })

  test("missing pdftotext is unknown and not flagged as scanned", () => {
    expect(classify(null).scanned).toBe(false)
  })

  test("noticeKind separates cancellations and corrections", () => {
    expect(noticeKind("İPTAL İLANI 22.09.2026 tarihli")).toBe("iptal")
    expect(noticeKind("DÜZELTME İLANI - Üniversitemiz")).toBe("duzeltme")
    expect(noticeKind("ÖĞRETİM ÜYESİ ALIM İLANI")).toBe("ilan")
  })
})

describe("detail id normalization", () => {
  test("accepts an id or a resmigazete.gov.tr PDF URL only", () => {
    expect(normalizeId("20261016-4-11")).toBe("20261016-4-11")
    expect(normalizeId("https://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/10/20261016-4-11.pdf")).toBe("20261016-4-11")
    expect(normalizeId("https://resmigazete.gov.tr.evil.io/20261016-4-11.pdf")).toBeNull()
    expect(normalizeId("4-11")).toBeNull()
  })
})
