// Data source: Kariyer Kapısı (Cumhurbaşkanlığı İnsan Kaynakları Ofisi) public
// JSON API at api.kariyerkapisi.gov.tr - the same endpoints the public
// /isealim page calls. No authentication: the *Public endpoints are open.
// Applying still goes through e-Devlet; this CLI only reads postings.

export const API_BASE = "https://api.kariyerkapisi.gov.tr/api"
export const SEARCH_URL = `${API_BASE}/ilan/SearchIlanPublic`
export const PREVIEW_URL = `${API_BASE}/ilan/GetIlanPreviewPublic`
export const SUB_POSTINGS_URL = `${API_BASE}/altilan/GetAltIlanInfoByIlanIdPublic`
export const SITE_BASE = "https://kariyerkapisi.gov.tr"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; kariyerkapisi-cli/1.0)"

/**
 * POST a JSON body with exponential backoff on 429/5xx. Returns null on
 * 204/404 (the API answers 204 for an unknown posting guid).
 */
export async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 204 || response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    const text = await response.text()
    return text ? (JSON.parse(text) as T) : null
  }
  throw new Error("Request failed after max retries")
}

/** Raw search row as returned by SearchIlanPublic. */
export interface RawIlan {
  guid: string
  kurumAdi: string | null
  birimAdi: string | null
  ilanBaslik: string | null
  ilanTipi: number // 1 = applied through Kariyer Kapısı, 2 = announcement linking out
  ilanTuru: string | null
  sonDurumu: string | null
  basTarih: string | null
  bitTarih: string | null
  basvuruLinki: string | null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  unit: string | null
  location: string | null
  type: string | null
  date: string | null
  deadline: string | null
  url: string
}

/** ilanTipi 1 postings have a detail page; ilanTipi 2 only link to the institution. */
export function postingUrl(row: Pick<RawIlan, "guid" | "ilanTipi" | "basvuruLinki">): string {
  if (row.ilanTipi === 2 && row.basvuruLinki) return row.basvuruLinki
  return `${SITE_BASE}/IlanDetay?i=${row.guid}`
}

/** Some ilanTuru values carry a trailing comma ("Askeri Personel İlanları,"). */
function cleanType(t: string | null): string | null {
  if (!t) return null
  return t.replace(/[,\s]+$/, "").trim() || null
}

export function toCard(row: RawIlan): JobCard {
  return {
    id: row.guid,
    title: (row.ilanBaslik || "").trim() || "(untitled)",
    company: row.kurumAdi?.trim() || null,
    unit: row.birimAdi?.trim() || null,
    // Search rows carry no location; `detail` fills it from the sub-postings' quotas.
    location: null,
    type: cleanType(row.ilanTuru),
    date: row.basTarih || null,
    deadline: row.bitTarih || null,
    url: postingUrl(row),
  }
}

/**
 * The public page hides postings whose deadline has passed (it compares
 * bitTarih, end of day, with now); the API still returns some of them.
 */
export function isOpen(row: Pick<RawIlan, "bitTarih">, now: Date = new Date()): boolean {
  if (!row.bitTarih) return true
  const end = new Date(row.bitTarih)
  if (Number.isNaN(end.getTime())) return true
  end.setHours(23, 59, 59, 999)
  return end >= now
}

/** True if the posting started within the last `days` days (9999 = no filter). */
export function withinJobage(row: Pick<RawIlan, "basTarih">, days: number, now: Date = new Date()): boolean {
  if (!days || days >= 9999) return true
  if (!row.basTarih) return false
  const start = new Date(row.basTarih)
  if (Number.isNaN(start.getTime())) return false
  return now.getTime() - start.getTime() <= days * 86400_000
}

/** The API matches province names in the upper-case Turkish form it lists ("İSTANBUL"). */
export function normalizeProvince(input: string): string {
  return input.trim().toLocaleUpperCase("tr-TR")
}

/**
 * Posting text is stored as BBCode ([justify][size=14pt]...[/size]). Convert
 * list items and line breaks to newlines and drop the remaining tags.
 */
export function bbcodeToText(src: string | null): string | null {
  if (!src) return null
  const text = src
    .replace(/\r\n?/g, "\n")
    .replace(/\[\*\]/g, "\n• ")
    .replace(/\[br\]/gi, "\n")
    .replace(/\[\/?(?:p|list|ul|ol|li)[^\]]*\]/gi, "\n")
    .replace(/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}
