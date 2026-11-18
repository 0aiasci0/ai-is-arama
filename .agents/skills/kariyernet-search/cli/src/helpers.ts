// Data source: Kariyer.net public search and posting pages (server-side
// rendered Nuxt). Search results are parsed from the HTML job cards, which
// carry stable data-test anchors; the result count comes from the Nuxt state
// (window.__NUXT__). No authentication.
//
// Personal use only. Kariyer.net is a commercial job board protected by
// PerimeterX bot management; keep volume low, never bulk-collect, and do not
// use the output commercially. A 403 is treated as a block, not retried.

export const SITE_BASE = "https://www.kariyer.net"
export const SEARCH_PATH = "/is-ilanlari"
export const DETAIL_PATH = "/is-ilani"
export const PAGE_SIZE = 50

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// 2026-11-18 ölçümü: "kariyernet-cli/1.0" kimliği ilk istekte 403 alıyordu; aynı adresler bu başlıklarla
// 30/30 istekte 200 döndü. Arama (/is-ilanlari) ve ilan (/is-ilani) yolları robots.txt'te izinli.
// Hacim düşük kalır (tarama betiği istekler arasında 20 sn bekler); 403 yine engel sayılır, döngüde denenmez.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
const BASLIKLAR = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
}

export class BlockedError extends Error {}

export interface Fetched {
  html: string
  finalUrl: string
}

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns html "" on a 404.
 * A 403 is the bot wall: fail fast with BlockedError instead of hammering it.
 */
export async function htmlFetch(url: string): Promise<Fetched> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: BASLIKLAR,
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    })
    if (response.status === 403) {
      throw new BlockedError(
        "Kariyer.net refused the request (403, bot protection). Do not retry in a loop; see .claude/skills/job-application-assistant/09-web-research.md for the robots.txt-gated fallback.",
      )
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return { html: "", finalUrl: response.url || url }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return { html: await response.text(), finalUrl: response.url || url }
  }
  throw new Error("Request failed after max retries")
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  ccedil: "ç", Ccedil: "Ç", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
  acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", bull: "•", middot: "·", laquo: "«", raquo: "»", deg: "°", euro: "€",
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => (name === "amp" ? m : (NAMED_ENTITIES[name] ?? m)))
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

export function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/** Rich text with paragraph and list breaks kept as newlines. */
export function richText(html: string | null): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|ul|ol|div|h\d)>/gi, "\n")
  const text = withBreaks
    .split("\n")
    .map(clean)
    .filter((l, i, a) => l !== "•" && (l !== "" || a[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** Turkish → URL slug the way Kariyer.net builds city paths ("Muğla Bodrum" → "mugla-bodrum"). */
export function slugify(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** --jobage days → the `date` query value (1g today, 3g, 7g, 15g); null = all time. */
export function jobageToParam(days: number): string | null {
  if (!days || days >= 9999) return null
  if (days <= 1) return "1g"
  if (days <= 3) return "3g"
  if (days <= 7) return "7g"
  if (days <= 15) return "15g"
  return null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  workModel: string | null
  workType: string | null
  date: string | null
  promoted: boolean
  url: string
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))
  return m ? clean(m[1]) || null : null
}

function testIdText(chunk: string, id: string): string | null {
  const m = chunk.match(new RegExp(`data-test="${id}"[^>]*>([\\s\\S]*?)</(?:span|div|a|h1)>`, "i"))
  return m ? clean(m[1]) || null : null
}

/**
 * Parse search result cards. The page is split on each result card's
 * data-test="ad-card" wrapper and every chunk parsed independently. Carousel
 * cards ("slick-list-item") use a different wrapper and are skipped.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const parts = html.split(/<div data-test="ad-card"/).slice(1)
  for (const part of parts) {
    const openTag = part.slice(0, part.indexOf(">"))
    const href = part.match(/href="(\/is-ilani\/[^"]*?-(\d+))"/)
    if (!href) continue
    const title = testIdText(part, "ad-card-title")
    if (!title) continue
    results.push({
      id: href[2],
      title,
      company: testIdText(part, "subtitle"),
      location: testIdText(part, "location"),
      workModel: testIdText(part, "work-model") ?? attr(openTag, "workModelText"),
      workType: attr(openTag, "workTypeText"),
      // The card shows only a relative age ("6 gün", "2 saat").
      date: attr(openTag, "time"),
      // Set by markPromoted, which needs the page's result count.
      promoted: false,
      url: `${SITE_BASE}${decodeHtmlEntities(href[1])}`,
    })
  }
  return results
}

/**
 * A promoted block (sponsored or score-boosted postings, up to 3) is placed
 * on top of the organic results and is not part of adCount. The card markup
 * cannot tell it apart on its own - organic cards on short result lists carry
 * the same calculatedFromScore flag - so the block is identified by count:
 * every card beyond the expected organic count, taken from the top.
 */
export function markPromoted(cards: JobCard[], total: number | null, page: number): JobCard[] {
  if (total === null) return cards
  const expected = Math.max(0, Math.min(PAGE_SIZE, total - (page - 1) * PAGE_SIZE))
  const extra = cards.length - expected
  return cards.map((c, i) => ({ ...c, promoted: i < extra }))
}

/**
 * Minimal reader for the Nuxt state: window.__NUXT__=(function(a,b,…){…}(v1,v2,…)).
 * Values in the state body are often parameter names; this maps them back to
 * the literal arguments. Only scalars are needed here.
 */
export function nuxtResolver(html: string): ((token: string) => string | null) | null {
  const start = html.indexOf("window.__NUXT__=(function(")
  if (start < 0) return null
  const end = html.indexOf("</script>", start)
  const body = html.slice(start, end < 0 ? undefined : end)
  const params = body.match(/^window\.__NUXT__=\(function\(([^)]*)\)/)?.[1].split(",") ?? []
  const argsStart = body.lastIndexOf("}(")
  const argsEnd = body.lastIndexOf("))")
  if (argsStart < 0 || argsEnd < argsStart) return null
  const raw = body.slice(argsStart + 2, argsEnd)
  const args: string[] = []
  let cur = ""
  let quote: string | null = null
  let escaped = false
  for (const ch of raw) {
    if (quote) {
      cur += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === ",") {
      args.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  args.push(cur)
  const map = new Map(params.map((p, i) => [p, args[i]]))
  return (token: string) => {
    const t = token.trim()
    const v = map.has(t) ? map.get(t)! : t
    return v === undefined ? null : v.replace(/^"(.*)"$/, "$1")
  }
}

/** Total matching postings (state.advertisement.adCount); null if absent. */
export function parseTotal(html: string): number | null {
  const tok = html.match(/advertisement:\{adCount:([^,}]+)/)?.[1]
  if (!tok) return null
  const resolve = nuxtResolver(html)
  const v = resolve ? resolve(tok) : tok
  return v !== null && /^\d+$/.test(v) ? Number(v) : null
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  features: string[]
  applications: number | null
  updated: string | null
  deadline: string | null
  description: string | null
  isActive: boolean
  url: string
}

/** Inner HTML of the element opened at `start`, tracking <div> depth. */
function divContentAt(html: string, start: number): string | null {
  const open = html.indexOf(">", start)
  if (open < 0) return null
  let i = open + 1
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(open + 1, i - 6)
}

/** dd.MM.yyyy → yyyy-MM-dd. */
function isoDate(s: string | null): string | null {
  const m = s?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s
}

export function parseJobDetail(html: string, id: string, url: string): JobDetail {
  // Only the posting's own section; recommendation carousels follow it.
  const descAt = html.search(/<div[^>]*data-test="qualifications-and-job-description"/)
  const description = descAt >= 0 ? richText(divContentAt(html, descAt)) : null
  const container = html.match(/<div isActive="(true|false)"[^>]*closingDate="([^"]*)"/i)
  const features = [...html.matchAll(/data-test="job-feature-item"[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => clean(m[1])).filter(Boolean)
  const apps = html.match(/data-test="job-application-count"[^>]*>\s*([\d.]+)/i)?.[1]
  return {
    id,
    title: testIdText(html, "job-title") ?? "(untitled)",
    company: testIdText(html, "company-name"),
    location: testIdText(html, "company-location"),
    features,
    applications: apps ? Number(apps.replace(/\./g, "")) : null,
    updated: testIdText(html, "updated-date"),
    deadline: container ? isoDate(container[2] || null) : null,
    description,
    isActive: container ? container[1] === "true" : description !== null,
    url,
  }
}
