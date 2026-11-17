// Data source: Vacancies in Turkey (vacanciesinturkey.com), a WordPress site running
// WP Job Manager. Search uses the plugin's public listing endpoint (/jm-ajax/get_listings/,
// the same call the site's own search box makes); each posting page carries a schema.org
// JobPosting JSON-LD block (title, organisation, description, datePosted, validThrough).
// robots.txt (2026-11-17) disallows only /wp-admin/, /wp-includes/, /?s= and similar paths.
//
// The site's location field is unreliable: foreign postings are geocoded onto Turkish
// districts ("Analyst, Benelux" → "Van, Turkey"; "… CANADA Remote" → "Çan, Turkey").
// So the Turkey filter reads the title and the posting text (turkeyVerdict below).
//
// Personal use only. Keep volume low; a 403 is treated as a block and not retried.

export const SITE_BASE = "https://vacanciesinturkey.com"
export const LISTINGS_PATH = "/jm-ajax/get_listings/"
export const JOB_PATH = "/job"
export const PER_PAGE = 50
export const DETAIL_DELAY_MS = 2000
// The JSON-LD baseSalary is a site-wide placeholder (1500 USD monthly on every posting
// checked 2026-11-17), so it is not emitted.

const UA = "Mozilla/5.0 (compatible; vacanciesinturkey-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export class BlockedError extends Error {}

export interface Fetched {
  body: string
  finalUrl: string
  status: number
}

/**
 * Fetch with exponential backoff on 429/5xx. Returns body "" on a 404.
 * A 403 is a block: fail fast with BlockedError instead of hammering it.
 */
export async function siteFetch(url: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<Fetched> {
  const maxRetries = 4
  let delay = 1000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Accept: init.form ? "application/json, text/javascript, */*; q=0.01" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
    }
    let body: string | undefined
    if (init.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
      headers["X-Requested-With"] = "XMLHttpRequest"
      body = new URLSearchParams(init.form).toString()
    }
    const response = await fetch(url, {
      method: init.method ?? (init.form ? "POST" : "GET"),
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    })
    if (response.status === 403) {
      throw new BlockedError("vacanciesinturkey.com refused the request (403). Do not retry in a loop; wait and try later.")
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return { body: "", finalUrl: response.url || url, status: 404 }
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return { body: await response.text(), finalUrl: response.url || url, status: response.status }
  }
  throw new Error("Request failed after max retries")
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  ccedil: "ç", Ccedil: "Ç", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", bull: "•", middot: "·", laquo: "«", raquo: "»", euro: "€",
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
export function richText(html: string | null | undefined): string | null {
  if (!html) return null
  const decoded = decodeHtmlEntities(html) // JSON-LD descriptions arrive entity-encoded
  const withBreaks = decoded
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

// ---------- listing cards (jm-ajax HTML fragment) ----------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  jobType: string | null
  posted: string | null
  /** WordPress post status from the card class: "publish" (open) or "expired". */
  status: string | null
  url: string
}

export function parseJobCards(html: string): JobCard[] {
  const cards: JobCard[] = []
  const re = /<li\b[^>]*class="([^"]*\bjob_listing\b[^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, cls, body] = m
    const id = cls.match(/\bpost-(\d+)\b/)?.[1]
    const href = body.match(/<a\s+href="([^"]+)"/)?.[1]
    if (!id || !href) continue
    const pick = (p: RegExp) => {
      const v = body.match(p)?.[1]
      return v ? clean(v) || null : null
    }
    cards.push({
      id,
      title: pick(/<h3>([\s\S]*?)<\/h3>/) ?? "",
      company: pick(/class="company">([\s\S]*?)<\/div>/),
      location: pick(/class="location">([\s\S]*?)<\/div>/),
      jobType: pick(/<li class="job-type[^"]*">([\s\S]*?)<\/li>/),
      posted: pick(/<time[^>]*>([\s\S]*?)<\/time>/),
      status: cls.match(/\bstatus-([a-z]+)\b/)?.[1] ?? null,
      url: decodeHtmlEntities(href),
    })
  }
  return cards
}

// ---------- posting page (JSON-LD JobPosting) ----------

export interface JobPosting {
  title: string
  company: string | null
  category: string | null
  employmentType: string[]
  datePosted: string | null
  deadline: string | null
  siteLocation: string | null
  description: string | null
}

export function parseJobPosting(html: string): JobPosting | null {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/g) ?? []
  for (const b of blocks) {
    let data: unknown
    try {
      data = JSON.parse(b.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""))
    } catch {
      continue
    }
    const items = Array.isArray(data) ? data : ((data as { "@graph"?: unknown[] })["@graph"] ?? [data])
    for (const it of items as Record<string, any>[]) {
      if (it?.["@type"] !== "JobPosting") continue
      const addr = it.jobLocation?.address ?? {}
      const et = it.employmentType
      return {
        title: clean(String(it.title ?? "")),
        company: it.hiringOrganization?.name ? clean(String(it.hiringOrganization.name)) : null,
        category: it.occupationalCategory ? clean(String(it.occupationalCategory)) : null,
        employmentType: Array.isArray(et) ? et.map(String) : et ? [String(et)] : [],
        datePosted: it.datePosted ? String(it.datePosted).slice(0, 10) : null,
        deadline: it.validThrough ? String(it.validThrough).slice(0, 10) : null,
        siteLocation: addr.addressLocality ? clean(String(addr.addressLocality)) : null,
        description: richText(it.description ?? null),
      }
    }
  }
  return null
}

// ---------- Turkey verdict ----------

/** Lowercase + Turkish/diacritic fold so "İstanbul", "ISTANBUL", "Istanbul" all match "istanbul". */
export function fold(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

// "Turkish" is deliberately absent: it names a language ("Turkish speaker, remote") more
// often than a place.
export const TR_TERMS = [
  "turkey", "turkiye", "istanbul", "ankara", "izmir", "bursa", "antalya", "gaziantep", "kocaeli", "gebze",
  "adana", "konya", "mersin", "kayseri", "eskisehir", "trabzon", "samsun", "denizli", "sakarya", "tekirdag",
  "manisa", "hatay", "diyarbakir", "sanliurfa", "malatya", "erzurum", "edirne", "canakkale", "bodrum",
  "maslak", "levent", "atasehir", "sisli", "besiktas", "kadikoy", "umraniye", "kartal", "pendik", "vadistanbul",
]
// City-level subset: used for the site's location field, where a bare "Turkey" says nothing
// ("Çan, Turkey" is how the site files Canada-remote postings).
const COUNTRY_WORDS = new Set(["turkey", "turkiye"])
export const TR_CITY_TERMS = TR_TERMS.filter((t) => !COUNTRY_WORDS.has(t))

// Site location values that stand for a foreign place. "Çan, Turkey": 5 of 5 postings
// checked on 2026-11-17 were Canada-related (Canada-remote titles, Canadian employers,
// a Canada.Recruitment contact). Matched on the folded, whitespace-trimmed value.
export const SITE_LOCATION_ARTEFACTS: Record<string, string> = { "can, turkey": "canada (site location 'Çan, Turkey')" }

export const FOREIGN_TERMS = [
  // regions used in job titles
  "benelux", "dach", "nordics", "latam", "apac",
  // countries (English names; Turkey excluded)
  "afghanistan", "albania", "algeria", "argentina", "armenia", "australia", "austria", "azerbaijan", "bahrain",
  "bangladesh", "belarus", "belgium", "bosnia", "brazil", "bulgaria", "cambodia", "cameroon", "canada", "chile",
  "china", "colombia", "croatia", "cyprus", "czech republic", "czechia", "denmark", "egypt", "estonia",
  "ethiopia", "finland", "france", "germany", "ghana", "greece", "hungary", "iceland", "india", "indonesia",
  "iran", "iraq", "ireland", "israel", "italy", "japan", "jordan", "kazakhstan", "kenya", "kosovo", "kuwait",
  "kyrgyzstan", "latvia", "lebanon", "libya", "lithuania", "luxembourg", "malaysia", "malta", "mexico",
  "moldova", "montenegro", "morocco", "nepal", "netherlands", "new zealand", "nigeria", "north macedonia",
  "norway", "oman", "pakistan", "palestine", "philippines", "poland", "portugal", "qatar", "romania", "russia",
  "rwanda", "saudi arabia", "serbia", "singapore", "slovakia", "slovenia", "somalia", "south africa",
  "south korea", "spain", "sri lanka", "sudan", "sweden", "switzerland", "syria", "taiwan", "tajikistan",
  "tanzania", "thailand", "tunisia", "turkmenistan", "uganda", "ukraine", "united arab emirates", "uae",
  "united kingdom", "uk", "united states", "usa", "uzbekistan", "vietnam", "yemen", "zambia", "zimbabwe",
  // cities
  "london", "amsterdam", "rotterdam", "paris", "berlin", "munich", "frankfurt", "hamburg", "madrid", "barcelona",
  "milan", "rome", "vienna", "zurich", "geneva", "brussels", "dublin", "lisbon", "warsaw", "krakow", "prague",
  "budapest", "bucharest", "sofia", "athens", "stockholm", "oslo", "copenhagen", "helsinki", "dubai",
  "abu dhabi", "doha", "riyadh", "cairo", "amman", "beirut", "baku", "tbilisi", "yerevan", "kyiv", "moscow",
  "new york", "washington", "toronto", "montreal", "vancouver", "singapore", "hong kong", "tokyo", "sydney",
  "nairobi", "bangkok", "delhi", "mumbai", "bangalore", "bengaluru", "karachi", "islamabad", "tashkent",
  "almaty", "astana", "erbil", "nicosia",
]

export type Verdict = "yes" | "no" | "unclear"

export interface TurkeyCheck {
  turkey: Verdict
  evidence: { title: { tr: string[]; foreign: string[] }; text: { tr: string[]; foreign: string[] }; siteCity: string[]; siteForeign: string[] }
  reason: string
}

function hits(text: string, terms: string[]): string[] {
  const f = fold(text)
  return terms.filter((t) => new RegExp(`(^|[^a-z0-9])${t.replace(/ /g, "\\s+")}([^a-z0-9]|$)`).test(f))
}

/**
 * Decide whether a posting is located in Turkey. Title wins over text; the site's location
 * field counts only at city level and only as a tie-breaker (it is unreliable, see header).
 *   site location abroad, no Turkish city in title or text     → no   (e.g. "Commercial Director … Turkey CIS", Dubai)
 *   title names Turkey/a Turkish city                          → yes
 *   title names a foreign place only                          → no
 *   text names Turkey only                                    → yes
 *   text names Turkey and foreign places, site city in Turkey → yes   (e.g. "ING Hubs Türkiye … present in Poland, Spain")
 *   text names Turkey and foreign places, no site city        → unclear
 *   text names foreign places only, site city in Turkey       → unclear (e.g. "offices in Berlin, Amsterdam")
 *   text names foreign places only, no site city              → no
 *   no place in title or text                                 → unclear
 */
export function turkeyVerdict(title: string, text: string | null, siteLocation: string | null = null): TurkeyCheck {
  const ev = {
    title: { tr: hits(title, TR_TERMS), foreign: hits(title, FOREIGN_TERMS) },
    text: { tr: hits(text ?? "", TR_TERMS), foreign: hits(text ?? "", FOREIGN_TERMS) },
    siteCity: hits(siteLocation ?? "", TR_CITY_TERMS),
    siteForeign: [
      ...hits(siteLocation ?? "", FOREIGN_TERMS),
      ...(SITE_LOCATION_ARTEFACTS[fold(siteLocation ?? "").trim()] ? [SITE_LOCATION_ARTEFACTS[fold(siteLocation ?? "").trim()]] : []),
    ],
  }
  const r = (turkey: Verdict, reason: string): TurkeyCheck => ({ turkey, evidence: ev, reason })
  const city = ev.siteCity.length > 0
  const trCityNamed = [...ev.title.tr, ...ev.text.tr].some((t) => !COUNTRY_WORDS.has(t))
  if (ev.siteForeign.length && !trCityNamed) return r("no", "site location is abroad and no Turkish city is named")
  if (ev.title.tr.length) return r("yes", "title names a place in Turkey")
  if (ev.title.foreign.length) return r("no", "title names a place outside Turkey")
  const tr = ev.text.tr.length > 0
  const fx = ev.text.foreign.length > 0
  if (tr && !fx) return r("yes", "text names only places in Turkey")
  if (tr && fx) return city ? r("yes", "text names Turkey and other countries; site city agrees") : r("unclear", "text names places both in and outside Turkey")
  if (fx) return city ? r("unclear", "text names only foreign places, but site city is in Turkey") : r("no", "text names only places outside Turkey")
  return r("unclear", city ? "no place in title or text; only the site city" : "no place named in title, text or site city")
}

/** Accept a numeric post id, a /job/<slug>/ URL on this site, or a bare slug. */
export function normalizeRef(input: string): string | null {
  const s = input.trim()
  if (/^\d+$/.test(s)) return `${SITE_BASE}/?post_type=job_listing&p=${s}`
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      return /(^|\.)vacanciesinturkey\.com$/i.test(u.hostname) ? u.toString() : null
    } catch {
      return null
    }
  }
  return /^[a-z0-9-]+\/?$/i.test(s) ? `${SITE_BASE}${JOB_PATH}/${s.replace(/\/$/, "")}/` : null
}
