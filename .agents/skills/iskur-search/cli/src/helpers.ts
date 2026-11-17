// Data source: İŞKUR e-Şube public vacancy search (esube.iskur.gov.tr),
// an ASP.NET WebForms page. Searching is a postback: GET the form (session
// cookie + __VIEWSTATE), then POST it back with the search button as
// __EVENTTARGET. Paging is one more postback carrying the ViewState of the
// previous response. No login: anonymous visitors see every field except the
// employer name.

export const SITE_BASE = "https://esube.iskur.gov.tr"
export const SEARCH_URL = `${SITE_BASE}/Istihdam/AcikIsIlanAra.aspx`
export const DETAIL_URL = `${SITE_BASE}/Istihdam/AcikIsIlanDetay.aspx`

// WebForms control names, as rendered by AcikIsIlanAra.aspx.
export const CTL = {
  searchButton: "ctl04$ctlAcikIsPageCommand$CommandItem_Search",
  gotoPageButton: "ctl04$ctlDataPagerDetay$btnChangeCurrentPage",
  currentPage: "ctl04$ctlDataPagerDetay$txtCurrentPage",
  keyword: "ctl04$ctlArananMetin2",
  sector: "ctl04$IsyeriTuruRadios",
  province: "ctl04$ctlIl",
  postingAge: "ctl04$ctlIlanTarihi",
} as const

export const SECTOR_VALUES = { ozel: "ozelSektorRadio", kamu: "kamuRadio" } as const
export type Sector = keyof typeof SECTOR_VALUES

export const PAGE_SIZE = 15

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; iskur-cli/1.0)"

/** A minimal cookie-carrying session: WebForms postbacks need ASP.NET_SessionId. */
export class Session {
  private cookies = new Map<string, string>()

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }

  private remember(res: Response): void {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";")
      const eq = pair.indexOf("=")
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }

  /** Fetch with exponential backoff on 429/5xx. Returns "" on a 404. */
  async request(url: string, body?: URLSearchParams): Promise<string> {
    const maxRetries = 6
    let delay = 500
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const headers: Record<string, string> = {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9",
      }
      const cookie = this.cookieHeader()
      if (cookie) headers.Cookie = cookie
      if (body) {
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        headers.Referer = url
      }
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers,
        body: body?.toString(),
        redirect: "follow",
        signal: AbortSignal.timeout(45000),
      })
      this.remember(response)
      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxRetries) {
          throw new Error(`Request failed: ${response.status} ${response.statusText}`)
        }
        const jitter = Math.floor(Math.random() * 500)
        await new Promise((r) => setTimeout(r, delay + jitter))
        delay = Math.min(delay * 2, 8000)
        continue
      }
      if (response.status === 404) return ""
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      return response.text()
    }
    throw new Error("Request failed after max retries")
  }
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// Named entities that occur in Turkish posting text (rich-text editors emit
// &uuml; &ccedil; &ouml; … instead of the literal letters).
const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  ccedil: "ç", Ccedil: "Ç", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
  acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", bull: "•", middot: "·", laquo: "«", raquo: "»", deg: "°", euro: "€", tl: "₺",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp(?!;)/g, " ")
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => (name === "amp" ? m : (NAMED_ENTITIES[name] ?? m)))
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

export function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/** Every hidden <input> (ViewState, EventValidation, …) as name → value. */
export function hiddenFields(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const tag = m[0]
    const name = tag.match(/name="([^"]+)"/i)?.[1]
    if (!name) continue
    const value = tag.match(/value="([^"]*)"/i)?.[1] ?? ""
    out.set(decodeHtmlEntities(name), decodeHtmlEntities(value))
  }
  return out
}

/** Options of a <select name="…">, as visible label → value. */
export function selectOptions(html: string, name: string): Map<string, string> {
  const out = new Map<string, string>()
  const esc = name.replace(/[$]/g, "\\$")
  const sel = html.match(new RegExp(`<select[^>]*name="${esc}"[^>]*>([\\s\\S]*?)</select>`, "i"))
  if (!sel) return out
  for (const m of sel[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</gi)) {
    out.set(clean(m[2]), decodeHtmlEntities(m[1]))
  }
  return out
}

/** Turkish-aware fold for matching user input to option labels ("istanbul" ~ "İSTANBUL"). */
export function fold(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
}

/** --jobage days → ctlIlanTarihi option value (1 Tümü, 2 Son 24 Saat, 3 Son 1 Hafta, 4 Son 15 Gün). */
export function jobageToOption(days: number): string {
  if (!days || days >= 9999) return "1"
  if (days <= 1) return "2"
  if (days <= 7) return "3"
  if (days <= 15) return "4"
  return "1"
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  sector: string | null
  period: string | null
  workType: string | null
  openings: number | null
  date: string | null
  deadline: string | null
  url: string
}

export interface SearchPage {
  cards: JobCard[]
  total: number | null
  page: number | null
  pages: number | null
}

/** dd.MM.yyyy → yyyy-MM-dd; anything else passes through unchanged. */
export function isoDate(s: string | null): string | null {
  if (!s) return null
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s.trim() || null
}

export function detailUrl(id: string): string {
  return `${DETAIL_URL}?uiID=${id}`
}

function attr(chunk: string, name: string): string | null {
  const m = chunk.match(new RegExp(`${name}='([^']*)'`, "i")) ?? chunk.match(new RegExp(`${name}="([^"]*)"`, "i"))
  return m ? clean(m[1]) || null : null
}

function spanText(chunk: string, idSuffix: string): string | null {
  const m = chunk.match(new RegExp(`id="[^"]*_${idSuffix}"[^>]*>([\\s\\S]*?)</span>`, "i"))
  return m ? clean(m[1]) || null : null
}

/**
 * Parse the results grid. Each row is split on its PopupJobDetails anchor
 * and parsed on its own, so one malformed row cannot break the rest. The
 * share-menu data-* attributes carry the cleanest copy of each field.
 */
export function parseResults(html: string): SearchPage {
  const cards: JobCard[] = []
  const chunks = html.split(/<a onclick="PopupJobDetails\(/).slice(1)
  for (const chunk of chunks) {
    const id = chunk.match(/^&#39;(\d+)&#39;/)?.[1] ?? chunk.match(/^'(\d+)'/)?.[1]
    if (!id) continue
    const titleHtml = chunk.match(/^[^>]*>([\s\S]*?)<\/a>/)?.[1]
    const title = (titleHtml && clean(titleHtml)) || attr(chunk, "data-meslekler")
    if (!title) continue
    const employer = spanText(chunk, "ctlIsverenDL")
    const openings = attr(chunk, "data-acikissayi") ?? spanText(chunk, "Label9")
    cards.push({
      id,
      title,
      // Anonymous visitors get a "log in to see the employer" notice instead of a name.
      company: employer && !/giri[şs]/i.test(employer) ? employer : null,
      location: attr(chunk, "data-il") ?? spanText(chunk, "ctlCalismaYeriDL"),
      sector: attr(chunk, "data-isverentur") ?? spanText(chunk, "ctlIsverenTurDL"),
      period: spanText(chunk, "ctlCalismaPeriyotDL"),
      workType: attr(chunk, "data-calismasekli") ?? spanText(chunk, "ctlCalismaSekliDL"),
      openings: openings && /^\d+$/.test(openings) ? Number(openings) : null,
      date: null,
      deadline: isoDate(attr(chunk, "data-sontarih") ?? spanText(chunk, "ctlSonBasvuruTarihi")),
      url: detailUrl(id),
    })
  }
  const total = html.match(/Toplam Kay[ıi]t:\s*([\d.]+)/i)?.[1]
  const pager = html.match(/name="ctl04\$ctlDataPagerDetay\$txtCurrentPage"[^>]*value="(\d+)"[^>]*\/?>\s*\/\s*(\d+)/i)
  // The grid renders no pager (and no "Toplam Kayıt") when every match fits on one page.
  return {
    cards,
    total: total ? Number(total.replace(/\./g, "")) : pager ? null : cards.length,
    page: pager ? Number(pager[1]) : 1,
    pages: pager ? Number(pager[2]) : 1,
  }
}

export interface JobDetail {
  id: string
  title: string
  occupations: { name: string; experience: string | null }[]
  description: string | null
  qualifications: string | null
  educationMin: string | null
  educationMax: string | null
  url: string
}

function spanHtml(html: string, idSuffix: string): string | null {
  const m = html.match(new RegExp(`<span id="[^"]*_${idSuffix}"[^>]*>([\\s\\S]*?)</span>\\s*(?:<span|</td>)`, "i"))
  return m ? m[1] : null
}

/** Rich text with paragraph breaks kept as newlines. */
export function richText(html: string | null): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = withBreaks
    .split("\n")
    .map(clean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

export function parseDetail(html: string, id: string): JobDetail {
  const occupations: JobDetail["occupations"] = []
  for (const m of html.matchAll(/_repeaterMeslek_(ctl\d+)_ctlMeslekLabel"[^>]*>([\s\S]*?)<\/span>/gi)) {
    const row = m[1]
    const years = html.match(new RegExp(`_repeaterMeslek_${row}_ctlMeslekDeneyimSuresiLabel"[^>]*>([^<]*)<`, "i"))?.[1]
    const months = html.match(new RegExp(`_repeaterMeslek_${row}_ctlMeslekDeneyimSuresiLabelAy"[^>]*>([^<]*)<`, "i"))?.[1]
    const exp = [years?.trim() ? `${years.trim()} yıl` : "", months?.trim() ? `${months.trim()} ay` : ""]
      .filter(Boolean)
      .join(" ")
    occupations.push({ name: clean(m[2]), experience: exp || null })
  }
  const description = [spanHtml(html, "ctlGenelSartlar"), spanHtml(html, "ctlOzelSartlarText"), spanHtml(html, "ctlGenelSartlarManuel")]
    .map(richText)
    .filter(Boolean)
    .join("\n\n")
  return {
    id,
    title: occupations.map((o) => o.name).join(", ") || "(untitled)",
    occupations,
    description: description || null,
    qualifications: richText(spanHtml(html, "ctlGenelSartlar2")),
    educationMin: spanText(html, "ctlOgrenimAsgari"),
    educationMax: spanText(html, "ctlOgrenimAzami"),
    url: detailUrl(id),
  }
}
