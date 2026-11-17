import { describe, expect, test } from "bun:test"
import { fold, normalizeRef, parseJobCards, parseJobPosting, postedDays, richText, turkeyVerdict } from "../src/helpers"
import { applyFilters, buildForm, parseTotal, type Result } from "../src/commands/search"

// Synthetic fixtures shaped like the site's markup (2026-11-17); no third-party text.
const CARD = (id: number, status: string, title: string, loc: string) => `
<li class="post-${id} job_listing type-job_listing status-${status} hentry job-type-contract" data-longitude="1" data-latitude="1">
	<a href="https://vacanciesinturkey.com/job/slug-${id}/">
		<img class="company_logo" src="x.png" alt="Co" />		<div class="position">
			<h3>${title}</h3>
			<div class="company"><strong>Örnek A.Ş.</strong></div>
		</div>
		<div class="location">
			${loc}		</div>
		<ul class="meta">
			<li class="job-type contract">Contract</li>
			<li class="date"><time datetime="2026-11-13">Posted 4 days ago</time></li>
		</ul>
	</a>
</li>`

const PAGE = (desc: string, loc = "Istanbul") => `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"JobPosting","title":"Data Analyst &#8211; Credit",
"datePosted":"2026-11-07T23:35:06+03:00","validThrough":"2027-01-16","employmentType":["Contract"],
"hiringOrganization":{"@type":"Organization","name":"Örnek Banka"},"occupationalCategory":"Banking",
"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"${loc}"}},
"baseSalary":{"@type":"MonetaryAmount","value":{"@type":"QuantitativeValue","value":"1500"},"currency":"USD"},
"description":${JSON.stringify(desc)}}</script></head><body></body></html>`

describe("parseJobCards", () => {
  const html = CARD(1001, "publish", "Economist &#8211; Research", "İstanbul, Turkey") + CARD(1002, "expired", "Old job", "Ankara")
  const cards = parseJobCards(html)
  test("reads id, title, company, location, date, status, url", () => {
    expect(cards.length).toBe(2)
    expect(cards[0]).toMatchObject({
      id: "1001", title: "Economist – Research", company: "Örnek A.Ş.", location: "İstanbul, Turkey",
      jobType: "Contract", posted: "Posted 4 days ago", status: "publish", url: "https://vacanciesinturkey.com/job/slug-1001/",
    })
  })
  test("marks expired postings", () => expect(cards[1].status).toBe("expired"))
  test("empty fragment gives no cards", () => expect(parseJobCards("<li class='no_job_listings_found'>x</li>")).toEqual([]))
})

describe("parseJobPosting", () => {
  const p = parseJobPosting(PAGE("&lt;p&gt;Role in &lt;strong&gt;Ankara&lt;/strong&gt;.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;"))!
  test("reads JSON-LD fields and drops the placeholder salary", () => {
    expect(p).toMatchObject({ title: "Data Analyst – Credit", company: "Örnek Banka", datePosted: "2026-11-07", deadline: "2027-01-16", siteLocation: "Istanbul", employmentType: ["Contract"] })
    expect(JSON.stringify(p)).not.toContain("1500")
  })
  test("decodes entity-encoded description into text with list breaks", () => expect(p.description).toBe("Role in Ankara .\n\n• SQL"))
  test("page without JobPosting gives null", () => expect(parseJobPosting("<html>This listing has expired.</html>")).toBeNull())
})

describe("turkeyVerdict (cases measured on the live site, 2026-11-17)", () => {
  test("foreign region in title → no (Analyst, Benelux; site said 'Van, Turkey')", () =>
    expect(turkeyVerdict("Analyst, Benelux", "Work in our Amsterdam office.", "Van, Turkey").turkey).toBe("no"))
  test("Turkish city in title → yes", () =>
    expect(turkeyVerdict("UN Women: Programme Analyst, Ankara, Turkiye", null, "Ankara").turkey).toBe("yes"))
  test("foreign-only text and site 'Çan, Turkey' (Canada-remote artefact) → no", () =>
    expect(turkeyVerdict("Social Media Insight Analyst- International Remote", "Teams across Canada.", "Çan, Turkey").turkey).toBe("no"))
  test("company office list abroad but site city Istanbul → unclear, not no (Trendyol pattern)", () =>
    expect(turkeyVerdict("Data Engineer", "Collaborate across our offices in Berlin, Amsterdam, Dubai.", "Istanbul / Maslak").turkey).toBe("unclear"))
  test("Türkiye plus foreign hubs, site city agrees → yes (ING pattern)", () =>
    expect(turkeyVerdict("Senior Data Analyst", "ING Hubs Türkiye, present in Poland and Spain; Vadistanbul office.", "İstanbul, Turkey").turkey).toBe("yes"))
  test("the site's own name in a footer is not a Turkey signal", () =>
    expect(turkeyVerdict("Analyst", "Say you saw this on vacanciesinturkey.com", null).turkey).toBe("unclear"))
  test("'Turkish' (a language) is not a place", () =>
    expect(turkeyVerdict("Lecturer Pool - Turkish", "Positions in the United States.", "Ontario, Canada").turkey).toBe("no"))
  test("site location abroad and only 'Turkey' as a sales region → no (Abbott, Dubai)", () =>
    expect(turkeyVerdict("Commercial Director MEAP & Turkey CIS", "Location: Dubai, UAE. Covers Turkey.", "Dubai, United Arab Emirates").turkey).toBe("no"))
  test("'Çan, Turkey' site location counts as Canada when no Turkish city is named", () =>
    expect(turkeyVerdict("Staff Process Engineer", "Annual compensation package.", "Çan, Turkey").turkey).toBe("no"))
  test("foreign market in title but Turkish duty station in text → unclear, not no (review 1, D1)", () =>
    expect(turkeyVerdict("Regional Analyst, Germany & Benelux markets", "Duty station: Istanbul, Türkiye.", "İstanbul, Turkey").turkey).toBe("unclear"))
  test("foreign market in title and only foreign places elsewhere → still no", () =>
    expect(turkeyVerdict("Analyst, Benelux", "Amsterdam office.", "Van, Turkey").turkey).toBe("no"))
  test("a Turkish city in the text overrides a foreign site location", () =>
    expect(turkeyVerdict("Field Officer", "Duty station: Gaziantep, Türkiye.", "Dubai").turkey).toBe("yes"))
  test("fold handles dotted/dotless i", () => expect(fold("İSTANBUL Kadıköy")).toBe("istanbul kadikoy"))
})

describe("search helpers", () => {
  test("form asks for 50 newest results", () =>
    expect(buildForm({ query: "economist", location: "Ankara", page: 2 })).toMatchObject({ search_keywords: "economist", search_location: "Ankara", per_page: "50", page: "2", orderby: "date", order: "DESC" }))
  test("total parsed from the 'showing' text", () => {
    expect(parseTotal("Search completed. Found 28 matching records.")).toBe(28)
    expect(parseTotal(undefined)).toBeNull()
  })
  const row = (turkey: Result["turkey"], datePosted: string | null = null) => ({ turkey, datePosted }) as Result
  test("default mode drops 'no' and keeps 'unclear'; strict drops both; off keeps all", () => {
    const rows = [row("yes"), row("no"), row("unclear")]
    expect(applyFilters(rows, "default").kept.length).toBe(2)
    expect(applyFilters(rows, "strict").kept.length).toBe(1)
    expect(applyFilters(rows, "off").kept.length).toBe(3)
    expect(applyFilters(rows, "default").dropped).toMatchObject({ notTurkey: 1, unclear: 0 })
  })
  test("jobage drops older postings", () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString()
    expect(applyFilters([row("yes", old), row("yes", new Date().toISOString())], "default", 30).kept.length).toBe(1)
  })
})

describe("postedDays", () => {
  test("relative card ages", () => {
    expect(postedDays("Posted 4 days ago")).toBe(4)
    expect(postedDays("Posted 1 week ago")).toBe(7)
    expect(postedDays("Posted 2 months ago")).toBe(60)
    expect(postedDays("Posted 3 hours ago")).toBe(0)
    expect(postedDays(null)).toBeNull()
  })
})

describe("normalizeRef", () => {
  test("numeric id, slug and site URL are accepted", () => {
    expect(normalizeRef("398467")).toBe("https://vacanciesinturkey.com/?post_type=job_listing&p=398467")
    expect(normalizeRef("analyst-benelux")).toBe("https://vacanciesinturkey.com/job/analyst-benelux/")
    expect(normalizeRef("https://vacanciesinturkey.com/job/analyst-benelux/")).toContain("/job/analyst-benelux/")
  })
  test("other hosts are rejected", () => expect(normalizeRef("https://example.com/job/x/")).toBeNull())
})

test("richText keeps null for empty input", () => expect(richText("")).toBeNull())
