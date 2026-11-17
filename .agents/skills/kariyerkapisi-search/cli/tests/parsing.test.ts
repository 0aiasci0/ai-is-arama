import { afterEach, describe, expect, test } from "bun:test"
import { bbcodeToText, isOpen, normalizeProvince, postingUrl, toCard, withinJobage, type RawIlan } from "../src/helpers"
import { normalizeId } from "../src/commands/detail"
import { buildBody, runSearch } from "../src/commands/search"

const originalFetch = globalThis.fetch
const originalStdoutWrite = process.stdout.write

afterEach(() => {
  globalThis.fetch = originalFetch
  process.stdout.write = originalStdoutWrite
})

function row(over: Partial<RawIlan> = {}): RawIlan {
  return {
    guid: "2ce03869-1a9d-44f3-a18e-fba394abe5aa",
    kurumAdi: "ANKARA ÜNİVERSİTESİ REKTÖRLÜĞÜ",
    birimAdi: "PERSONEL DAİRE BAŞKANLIĞI",
    ilanBaslik: "SÖZLEŞMELİ PERSONEL İLANI",
    ilanTipi: 1,
    ilanTuru: "Askeri Personel İlanları,",
    sonDurumu: "Aktif",
    basTarih: "2026-10-05T09:00:00",
    bitTarih: "2026-10-19T13:00:00",
    basvuruLinki: "",
    ...over,
  }
}

function captureStdout(): () => string {
  let out = ""
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString()
    return true
  }) as typeof process.stdout.write
  return () => out
}

describe("helpers", () => {
  test("toCard strips the trailing comma from ilanTuru and keeps null location", () => {
    const c = toCard(row())
    expect(c.type).toBe("Askeri Personel İlanları")
    expect(c.location).toBeNull()
    expect(c.deadline).toBe("2026-10-19T13:00:00")
  })

  test("announcement-only postings (ilanTipi 2) link out to the institution", () => {
    expect(postingUrl(row({ ilanTipi: 2, basvuruLinki: "https://spk.gov.tr/duyurular" }))).toBe("https://spk.gov.tr/duyurular")
    expect(postingUrl(row())).toContain("/IlanDetay?i=2ce03869")
  })

  test("isOpen keeps a posting open until the end of its deadline day", () => {
    const r = row({ bitTarih: "2026-10-19T13:00:00" })
    expect(isOpen(r, new Date("2026-10-19T22:00:00"))).toBe(true)
    expect(isOpen(r, new Date("2026-10-20T00:30:00"))).toBe(false)
    expect(isOpen(row({ bitTarih: null }))).toBe(true)
  })

  test("withinJobage compares the application start date", () => {
    const now = new Date("2026-10-18T12:00:00")
    expect(withinJobage(row({ basTarih: "2026-10-15T09:00:00" }), 7, now)).toBe(true)
    expect(withinJobage(row({ basTarih: "2026-09-01T09:00:00" }), 7, now)).toBe(false)
    expect(withinJobage(row({ basTarih: "2026-09-01T09:00:00" }), 9999, now)).toBe(true)
  })

  test("normalizeProvince upper-cases with Turkish rules", () => {
    expect(normalizeProvince("istanbul")).toBe("İSTANBUL")
    expect(normalizeProvince(" Iğdır ")).toBe("IĞDIR")
  })

  test("bbcodeToText drops formatting tags and keeps line breaks", () => {
    expect(bbcodeToText("[justify][size=14pt]Satır 1\nSatır 2[/size][/justify]")).toBe("Satır 1\nSatır 2")
    expect(bbcodeToText(null)).toBeNull()
  })
})

describe("detail id normalization", () => {
  test("accepts a guid or a kariyerkapisi.gov.tr detail URL", () => {
    const g = "2ce03869-1a9d-44f3-a18e-fba394abe5aa"
    expect(normalizeId(g)).toBe(g)
    expect(normalizeId(`https://kariyerkapisi.gov.tr/IlanDetay?i=${g}`)).toBe(g)
  })

  test("rejects other hosts and non-guid input", () => {
    expect(normalizeId("https://kariyerkapisi.gov.tr.evil.io/IlanDetay?i=2ce03869-1a9d-44f3-a18e-fba394abe5aa")).toBeNull()
    expect(normalizeId("12345")).toBeNull()
  })
})

describe("runSearch", () => {
  test("sends the portal's no-filter sentinels and the normalized province", () => {
    expect(buildBody({ jobage: 9999, includeExpired: false, page: 1, format: "json" })).toEqual({
      krM_ID: 0,
      searchText: "",
      il: "0",
      ilanTuru: "0",
    })
    expect(buildBody({ location: "izmir", jobage: 9999, includeExpired: false, page: 1, format: "json" }).il).toBe("İZMİR")
  })

  test("drops expired rows unless --include-expired, and pages client-side", async () => {
    const rows = [
      row({ guid: "00000000-0000-0000-0000-000000000001", bitTarih: "2999-01-01T00:00:00" }),
      row({ guid: "00000000-0000-0000-0000-000000000002", bitTarih: "2000-01-01T00:00:00" }),
    ]
    globalThis.fetch = (async () => new Response(JSON.stringify(rows))) as unknown as typeof fetch

    let read = captureStdout()
    expect(await runSearch({ jobage: 9999, includeExpired: false, page: 1, format: "json" })).toBe(0)
    let out = JSON.parse(read())
    expect(out.meta.total).toBe(1)
    expect(out.results[0].id).toBe("00000000-0000-0000-0000-000000000001")

    read = captureStdout()
    expect(await runSearch({ jobage: 9999, includeExpired: true, page: 2, format: "json" })).toBe(0)
    out = JSON.parse(read())
    expect(out.meta.total).toBe(2)
    expect(out.results).toHaveLength(0)
  })
})
