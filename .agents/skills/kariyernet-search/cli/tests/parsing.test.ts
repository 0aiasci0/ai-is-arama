import { describe, expect, test } from "bun:test"
import { jobageToParam, markPromoted, nuxtResolver, parseJobCards, parseJobDetail, parseTotal, richText, slugify } from "../src/helpers"
import { buildUrl, locationKept } from "../src/commands/search"
import { normalizeId } from "../src/commands/detail"

// Trimmed from a live /is-ilanlari page (2026-10-18).
function card(id: string, title: string, company: string, opts: { sponsored?: boolean; boosted?: boolean; time?: string } = {}): string {
  const sp = opts.sponsored ? "true" : "false"
  const boost = opts.boosted || opts.sponsored ? "true" : "false"
  return `<div data-test="ad-card" time="${opts.time ?? "6 gün"}" sponsor="${sp}" isRealSponsored="${sp}" calculatedFromScore="${boost}" jobStatus="Default" workModelText="İş Yerinde" workTypeText="Tam zamanlı" positionName="Unrelated" cityName="İzmir" class="job-list-card-item" data-v-bc2b9780><div data-v-bc2b9780>
<a href="/is-ilani/slug-${id}" target="_blank" data-test="ad-card-item" class="k-ad-card radius" data-v-bc2b9780>
<span data-test="ad-card-title" class="k-ad-card-title multiline" data-v-bc2b9780>${title}</span>
<div data-test="subtitle-section" class="subtitle" data-v-bc2b9780><span data-test="subtitle" data-v-bc2b9780>${company}</span></div>
<div data-test="job-detail" class="job-detail" data-v-bc2b9780><span data-test="location" class="location" data-v-bc2b9780>İzmir</span> <span class="dot"></span> <span data-test="work-model" class="work-model" data-v-bc2b9780>İş Yerinde</span></div>
</a></div></div>`
}

const NUXT = `<script>window.__NUXT__=(function(a,b,fN){return {state:{advertisement:{adCount:fN,hiddenJobCount:a,list:[]}}}}(false,true,76));</script>`

describe("parseJobCards", () => {
  test("reads title, company and location from the data-test anchors", () => {
    const cards = parseJobCards(card("4574710", "Yapım ve Yayın Uzmanı", "İzmir Ekonomi Üniversitesi"))
    expect(cards).toHaveLength(1)
    expect(cards[0]).toEqual({
      id: "4574710",
      title: "Yapım ve Yayın Uzmanı",
      company: "İzmir Ekonomi Üniversitesi",
      location: "İzmir",
      workModel: "İş Yerinde",
      workType: "Tam zamanlı",
      date: "6 gün",
      promoted: false,
      url: "https://www.kariyer.net/is-ilani/slug-4574710",
    })
  })

  test("ignores carousel cards", () => {
    const carousel = `<div data-test="slick-list-item" time="2 gün"><a href="/is-ilani/x-111111" data-test="ad-card-item"><span data-test="ad-card-title">Carousel</span></a></div>`
    expect(parseJobCards(card("1", "A", "X") + carousel).map((c) => c.id)).toEqual(["1"])
  })

  test("markPromoted marks only the cards beyond the organic count, from the top", () => {
    const many = Array.from({ length: 53 }, (_, i) => card(String(1000 + i), `T${i}`, "X", { sponsored: i < 2, boosted: i === 2 })).join("")
    const marked = markPromoted(parseJobCards(many), 1433, 1)
    expect(marked.filter((c) => c.promoted).map((c) => c.id)).toEqual(["1000", "1001", "1002"])
    // Short lists: organic cards carry the boost flag too, and must be kept.
    const few = [0, 1, 2].map((i) => card(String(2000 + i), `T${i}`, "X", { boosted: true })).join("")
    expect(markPromoted(parseJobCards(few), 3, 1).some((c) => c.promoted)).toBe(false)
    // Last page: 26 organic expected out of 76.
    const last = Array.from({ length: 29 }, (_, i) => card(String(3000 + i), `T${i}`, "X")).join("")
    expect(markPromoted(parseJobCards(last), 76, 2).filter((c) => c.promoted)).toHaveLength(3)
  })

  test("a card without a posting link is skipped, the rest survive", () => {
    const broken = `<div data-test="ad-card" time="1 gün"><span data-test="ad-card-title">No link</span></div>`
    expect(parseJobCards(broken + card("2", "B", "Y")).map((c) => c.id)).toEqual(["2"])
  })
})

describe("Nuxt state", () => {
  test("parseTotal resolves adCount through the function arguments", () => {
    expect(parseTotal(NUXT)).toBe(76)
  })

  test("resolver unquotes strings and passes literals through", () => {
    const r = nuxtResolver(`<script>window.__NUXT__=(function(a,b){return {}}("Ankara, Çankaya",12));</script>`)!
    expect(r("a")).toBe("Ankara, Çankaya")
    expect(r("b")).toBe("12")
    expect(r("42")).toBe("42")
  })

  test("parseTotal is null when the state is missing", () => {
    expect(parseTotal("<html></html>")).toBeNull()
  })
})

describe("URL building", () => {
  test("slugify folds Turkish letters the way city paths are written", () => {
    expect(slugify("Muğla Bodrum")).toBe("mugla-bodrum")
    expect(slugify("İstanbul")).toBe("istanbul")
    expect(slugify("Çanakkale")).toBe("canakkale")
  })

  test("jobageToParam maps days onto the portal's date buckets", () => {
    expect(jobageToParam(1)).toBe("1g")
    expect(jobageToParam(3)).toBe("3g")
    expect(jobageToParam(7)).toBe("7g")
    expect(jobageToParam(14)).toBe("15g")
    expect(jobageToParam(30)).toBeNull()
  })

  test("buildUrl puts the city in the path and paging in cp", () => {
    const u = new URL(buildUrl({ query: "dış ticaret", location: "İzmir", jobage: 7, sort: "date", includePromoted: false, page: 2, format: "json" }))
    expect(u.pathname).toBe("/is-ilanlari/izmir")
    expect(u.searchParams.get("kw")).toBe("dış ticaret")
    expect(u.searchParams.get("date")).toBe("7g")
    expect(u.searchParams.get("sd")).toBe("dd")
    expect(u.searchParams.get("cp")).toBe("2")
  })

  test("locationKept detects the silent fallback to all of Turkey", () => {
    expect(locationKept("https://www.kariyer.net/is-ilanlari/ankara?ct=6&kw=ekonomist")).toBe(true)
    expect(locationKept("https://www.kariyer.net/is-ilanlari?kw=ekonomist")).toBe(false)
  })
})

describe("detail", () => {
  test("normalizeId accepts ids, slugs and kariyer.net URLs only", () => {
    expect(normalizeId("4574710")).toBe("4574710")
    expect(normalizeId("https://www.kariyer.net/is-ilani/izmir-ekonomi-universitesi-yapim-ve-yayin-uzmani-4574710")).toBe("4574710")
    expect(normalizeId("izmir-ekonomi-universitesi-yapim-ve-yayin-uzmani-4574710")).toBe("4574710")
    expect(normalizeId("https://kariyer.net.evil.io/is-ilani/x-4574710")).toBeNull()
  })

  test("parseJobDetail reads the posting section and closing date", () => {
    const html = `<div data-test="job-title" class="vue-clamp job-title"> Yapım ve Yayın Uzmanı </div>
<a href="#" data-test="company-name" class="company-name"> İzmir Ekonomi Üniversitesi </a>
<span data-test="company-location"> İzmir (Balçova) </span>
<span data-test="updated-date" class="date-text"> 6 gün önce güncellendi </span>
<span data-test="job-feature-item"> İş Yerinde </span><span data-test="job-feature-item"> Tam Zamanlı </span>
<span data-test="job-application-count"> 45 <span>başvuru</span></span>
<div isActive="true" versionId="1" closingDate="06.11.2026" lastPublishDate="08.10.2026" class="job-container">
<div data-test="qualifications-and-job-description" class="job-detail-qualifications"><p><strong>GENEL NİTELİKLER</strong></p><ul><li>Lisans mezunu,</li><li>B1 İngilizce.</li></ul><div>İç</div></div>
</div><div data-test="slick-list-item">Benzer ilan</div>`
    const d = parseJobDetail(html, "4574710", "https://www.kariyer.net/is-ilani/x-4574710")
    expect(d.title).toBe("Yapım ve Yayın Uzmanı")
    expect(d.company).toBe("İzmir Ekonomi Üniversitesi")
    expect(d.location).toBe("İzmir (Balçova)")
    expect(d.features).toEqual(["İş Yerinde", "Tam Zamanlı"])
    expect(d.applications).toBe(45)
    expect(d.deadline).toBe("2026-11-06")
    expect(d.isActive).toBe(true)
    expect(d.description).toBe("GENEL NİTELİKLER\n\n• Lisans mezunu,\n• B1 İngilizce.\nİç")
  })

  test("richText keeps list items on consecutive lines", () => {
    expect(richText("<ul><li>a</li><li>b</li></ul>")).toBe("• a\n• b")
  })
})
