// Data source: Resmî Gazete (resmigazete.gov.tr), the official gazette. Under
// Law 2547 and the Öğretim Üyeliğine Yükseltilme ve Atanma Yönetmeliği,
// universities must publish faculty calls (Prof., Doç., Dr. Öğr. Üyesi, and
// usually Öğr. Gör./Arş. Gör.) in its "İlân Bölümü". Each issue's
// "Çeşitli İlânlar" section lists one PDF per announcing institution.
// There is no search API: the CLI walks the daily issue indexes.
//
// Pages are windows-1254, not UTF-8.

export const SITE_BASE = "https://www.resmigazete.gov.tr"
export const PAGE_SIZE = 20
export const MAX_DAYS = 60

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; resmigazete-cli/1.0)"

// Bun's TextDecoder has no windows-1254, so decode it here: Latin-1 except
// the 0x80–0x9F block and six Turkish letters.
const CP1254_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰",
  0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–",
  0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9f: "Ÿ",
  0xd0: "Ğ", 0xdd: "İ", 0xde: "Ş", 0xf0: "ğ", 0xfd: "ı", 0xfe: "ş",
}

export function decodeCp1254(bytes: Uint8Array): string {
  let out = ""
  for (const b of bytes) {
    if (b < 0x80) out += String.fromCharCode(b)
    else out += CP1254_HIGH[b] ?? (b >= 0xa0 ? String.fromCharCode(b) : "�")
  }
  return out
}

/** Issue index for a day: /eskiler/YYYY/MM/YYYYMMDD.htm */
export function dayIndexUrl(day: string): string {
  return `${SITE_BASE}/eskiler/${day.slice(0, 4)}/${day.slice(4, 6)}/${day}.htm`
}

/** Announcement PDF: /ilanlar/eskiilanlar/YYYY/MM/<id>.pdf, id = YYYYMMDD-S-N */
export function pdfUrl(id: string): string {
  return `${SITE_BASE}/ilanlar/eskiilanlar/${id.slice(0, 4)}/${id.slice(4, 6)}/${id}.pdf`
}

async function fetchWithBackoff(url: string): Promise<Response | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
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
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response
  }
  throw new Error("Request failed after max retries")
}

/** GET a gazette HTML page decoded from windows-1254. "" on 404 (no issue that day). */
export async function htmlFetch(url: string): Promise<string> {
  const res = await fetchWithBackoff(url)
  return res ? decodeCp1254(new Uint8Array(await res.arrayBuffer())) : ""
}

/** GET a PDF as bytes; null on 404. */
export async function pdfFetch(url: string): Promise<Uint8Array | null> {
  const res = await fetchWithBackoff(url)
  return res ? new Uint8Array(await res.arrayBuffer()) : null
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  ccedil: "ç", Ccedil: "Ç", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
  acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
}

export function clean(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => (name === "amp" ? m : (NAMED_ENTITIES[name] ?? m)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

/** Turkish-aware fold for matching ("Üniversitesi" ~ "universitesi"). */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** yyyymmdd for `daysBack` days before `now`, in Turkey's calendar day. */
export function dayString(now: Date, daysBack: number): string {
  const d = new Date(now.getTime() - daysBack * 86400_000)
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .split("-")
  return parts.join("")
}

export function isoFromDay(day: string): string {
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`
}

/**
 * From an issue index, the URL of its "Çeşitli İlânlar" section. Links look like
 * main.aspx?home=…/20261016.htm&main=…/20261016-4.htm with label "c - Çeşitli İlânlar";
 * the section number shifts with the issue's sections, so it is read, not assumed.
 */
export function variousSectionUrl(indexHtml: string): string | null {
  for (const m of indexHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!fold(clean(m[2])).includes("cesitli ilan")) continue
    const href = m[1].replace(/&amp;/g, "&")
    const main = href.match(/[?&]main=([^&]+)/)?.[1] ?? href
    const url = main.replace(/^http:/i, "https:")
    return url.startsWith("http") ? url : new URL(url, SITE_BASE).toString()
  }
  return null
}

export interface Announcement {
  id: string
  title: string
  institution: string
  university: boolean
  date: string
  url: string
  headline: string | null
  academic: boolean | null
  kind: NoticeKind | null
}

const UNIVERSITY = /(universitesi|rektorlugu|yuksek teknoloji enstitusu)/

/** Entries of a Çeşitli İlânlar page: <a href="20261016-4-11.pdf">İstanbul Gedik Üniversitesi Rektörlüğünden:</a> */
export function parseSection(html: string, day: string): Announcement[] {
  const out: Announcement[] = []
  for (const m of html.matchAll(/<a[^>]*href="([^"]*?(\d{8}-\d+-\d+)\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = m[2]
    const title = clean(m[3])
    if (!title) continue
    out.push({
      id,
      title,
      // The gazette names the announcer in the ablative ("… Rektörlüğünden:"); kept as written.
      institution: title.replace(/\s*:\s*$/, ""),
      university: UNIVERSITY.test(fold(title)),
      date: isoFromDay(day),
      url: pdfUrl(id),
      headline: null,
      academic: null,
      kind: null,
    })
  }
  return out
}

// Words that mark a faculty/academic staff call.
const ACADEMIC = /(ogretim uyesi|ogretim elemani|ogretim gorevlisi|arastirma gorevlisi|profesor|docent|dr\. ogr\.|prof\. dr\.)/

// Only the head of the text decides: the institution line, the call's title and
// its first sentence. Deeper text cites academic titles in other contexts (an
// internal-auditor call asks for experience "as a doctoral öğretim elemanı").
export const HEAD_CHARS = 700

export function looksAcademic(text: string): boolean {
  return ACADEMIC.test(fold(text.slice(0, HEAD_CHARS)))
}

// Scanned PDFs have no text layer: pdftotext returns only the institution
// line and the gazette's page code; some calls put only a title sentence in
// text and the positions table in an image. An academic term in a short text
// is still positive evidence, but "not academic" needs this much body text.
export const MIN_TEXT_CHARS = 120

export interface Classification {
  headline: string | null
  academic: boolean | null
  kind: NoticeKind | null
  scanned: boolean
}

export function classify(text: string | null): Classification {
  if (text === null) return { headline: null, academic: null, kind: null, scanned: false }
  const body = text.replace(/^[^:]{3,200}?:\s*/u, "").replace(/\d+(?:\/\d+)*-\d+/g, "").trim()
  const scanned = body.length < MIN_TEXT_CHARS
  const headline = body ? headlineOf(text) : null
  const academic = looksAcademic(text) ? true : scanned ? null : false
  return { headline, academic, kind: noticeKind(headline), scanned }
}

export type NoticeKind = "ilan" | "iptal" | "duzeltme"

/** Cancellation and correction notices refer to an earlier call. */
export function noticeKind(headline: string | null): NoticeKind | null {
  if (!headline) return null
  const h = fold(headline)
  if (/^(iptal|ilan iptal)/.test(h)) return "iptal"
  if (/^(duzeltme|degisiklik|ek ilan|zeyil)/.test(h)) return "duzeltme"
  return "ilan"
}

/** First sentence after the institution line, e.g. "… kadroya Öğretim Elemanı alınacaktır." */
export function headlineOf(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim()
  // Drop the "<Institution>'dan:" header line.
  const afterHeader = flat.replace(/^[^:]{3,200}?:\s*/u, "")
  const sentence = afterHeader.match(/^(.{20,400}?[.!?])(?:\s|$)/u)?.[1] ?? afterHeader.slice(0, 240)
  return sentence.trim() || null
}

// Standard Windows install locations, for shells whose PATH lacks Poppler
// (Git for Windows ships pdftotext in its MinGW bin; Chocolatey's poppler shims it).
const PDFTOTEXT_CANDIDATES = [
  "C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe",
  "C:\\ProgramData\\chocolatey\\bin\\pdftotext.exe",
]

/** Locate pdftotext (Poppler): PDFTOTEXT env, then PATH, then standard Windows paths. */
export function findPdftotext(): string | null {
  if (process.env.PDFTOTEXT) return process.env.PDFTOTEXT
  const onPath = Bun.which("pdftotext")
  if (onPath) return onPath
  if (process.platform !== "win32") return null
  const { existsSync } = require("node:fs") as typeof import("node:fs")
  return PDFTOTEXT_CANDIDATES.find((p) => existsSync(p)) ?? null
}

/** Extract text from PDF bytes with pdftotext -layout. null if the tool is missing. */
export async function pdfToText(bytes: Uint8Array): Promise<string | null> {
  const bin = findPdftotext()
  if (!bin) return null
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { rm } = await import("node:fs/promises")
  const file = join(tmpdir(), `resmigazete-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  await Bun.write(file, bytes)
  try {
    const proc = Bun.spawn([bin, "-layout", "-enc", "UTF-8", file, "-"], { stdout: "pipe", stderr: "pipe" })
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (code !== 0) throw new Error(`pdftotext exited with code ${code}`)
    return out.replace(/\f/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  } finally {
    await rm(file, { force: true })
  }
}
