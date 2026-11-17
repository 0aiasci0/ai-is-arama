import {
  BlockedError,
  LISTINGS_PATH,
  PER_PAGE,
  SITE_BASE,
  parseJobCards,
  parseJobPosting,
  postedDays,
  siteFetch,
  sleep,
  turkeyVerdict,
  writeError,
  type JobCard,
  type TurkeyCheck,
} from "../helpers.js"

export type TurkeyMode = "default" | "strict" | "off"

export interface SearchOpts {
  query: string
  location?: string
  page: number
  limit?: number
  details: boolean
  includeExpired: boolean
  turkey: TurkeyMode
  jobage?: number
  delayMs: number
  format: "json" | "table" | "plain"
}

export interface Result extends JobCard {
  /** /scrape contract field: ISO datePosted when the page was read, else the card's relative age. */
  date: string | null
  datePosted: string | null
  deadline: string | null
  category: string | null
  employmentType: string[]
  turkey: TurkeyCheck["turkey"] | null
  turkeyReason: string | null
  turkeyEvidence: TurkeyCheck["evidence"] | null
  description: string | null
}

export function buildForm(opts: Pick<SearchOpts, "query" | "location" | "page">): Record<string, string> {
  return {
    search_keywords: opts.query,
    search_location: opts.location ?? "",
    per_page: String(PER_PAGE),
    page: String(opts.page),
    orderby: "date",
    order: "DESC",
    show_pagination: "false",
  }
}

export function parseTotal(showing: unknown): number | null {
  const m = String(showing ?? "").match(/Found\s+(\d+)\s+matching/i)
  return m ? Number(m[1]) : null
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000)
}

/** Apply the Turkey filter and recency filter; returns kept rows and per-reason drop counts. */
export function applyFilters(rows: Result[], turkey: TurkeyMode, jobage?: number) {
  const dropped = { notTurkey: 0, unclear: 0, tooOld: 0 }
  const kept = rows.filter((r) => {
    if (jobage !== undefined) {
      const age = daysAgo(r.datePosted)
      if (age !== null && age > jobage) return (dropped.tooOld++, false)
    }
    if (turkey === "off" || r.turkey === null) return true
    if (r.turkey === "no") return (dropped.notTurkey++, false)
    if (r.turkey === "unclear" && turkey === "strict") return (dropped.unclear++, false)
    return true
  })
  return { kept, dropped }
}

function renderTable(rows: Result[]): string {
  if (rows.length === 0) return "No results."
  const header = "ID".padEnd(7) + " " + "TR".padEnd(7) + " " + "TITLE".padEnd(46) + " " + "COMPANY".padEnd(28) + " " + "POSTED".padEnd(10) + " DEADLINE"
  const lines = rows.map(
    (r) =>
      `${r.id.padEnd(7)} ${(r.turkey ?? "-").padEnd(7)} ${r.title.slice(0, 46).padEnd(46)} ${(r.company ?? "—").slice(0, 28).padEnd(28)} ${(r.datePosted ?? r.posted ?? "—").slice(0, 10).padEnd(10)} ${r.deadline ?? "—"}`,
  )
  return [header, "-".repeat(header.length), ...lines].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const { body } = await siteFetch(`${SITE_BASE}${LISTINGS_PATH}`, { form: buildForm(opts) })
    let data: { found_jobs?: boolean; html?: string; max_num_pages?: number; showing?: string }
    try {
      data = JSON.parse(body)
    } catch {
      writeError("Listing endpoint did not return JSON (site layout changed?)", "SEARCH_FAILED")
      return 1
    }
    const total = data.found_jobs ? parseTotal(data.showing) : 0
    let cards = data.found_jobs ? parseJobCards(data.html ?? "") : []
    // The endpoint also returns expired postings (their pages carry no JobPosting data);
    // skip them before any page is opened.
    const expired = cards.filter((c) => c.status === "expired").length
    if (!opts.includeExpired) cards = cards.filter((c) => c.status !== "expired")
    // --jobage: skip cards whose relative age ("Posted 2 months ago", a lower bound) already exceeds it,
    // so their pages are not opened; the exact datePosted check runs after the page is read.
    let tooOldCard = 0
    if (opts.jobage !== undefined) {
      const limit = opts.jobage
      cards = cards.filter((c) => {
        const d = postedDays(c.posted)
        if (d !== null && d > limit) return (tooOldCard++, false)
        return true
      })
    }
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    const rows: Result[] = []
    let blocked: string | null = null
    for (const [i, c] of cards.entries()) {
      const row: Result = {
        ...c, date: c.posted, datePosted: null, deadline: null, category: null, employmentType: [],
        turkey: null, turkeyReason: null, turkeyEvidence: null, description: null,
      }
      if (opts.details && !blocked) {
        if (i > 0) await sleep(opts.delayMs)
        try {
          const { body: html } = await siteFetch(c.url)
          const p = html ? parseJobPosting(html) : null
          if (p) {
            const v = turkeyVerdict(p.title || c.title, p.description, c.location)
            Object.assign(row, {
              date: p.datePosted ?? c.posted, datePosted: p.datePosted, deadline: p.deadline, category: p.category, employmentType: p.employmentType,
              turkey: v.turkey, turkeyReason: v.reason, turkeyEvidence: v.evidence, description: p.description,
            })
          } else {
            const v = turkeyVerdict(c.title, null, c.location)
            Object.assign(row, { turkey: v.turkey, turkeyReason: `posting page unreadable; ${v.reason}`, turkeyEvidence: v.evidence })
          }
        } catch (e) {
          if (e instanceof BlockedError) blocked = e.message
          else row.turkeyReason = `detail fetch failed: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      rows.push(row)
    }
    const { kept, dropped } = applyFilters(rows, opts.turkey, opts.jobage)

    if (opts.format === "table") {
      process.stdout.write(renderTable(kept) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        kept
          .map((r) =>
            [
              r.title,
              `  ${r.company ?? "—"} · Turkey: ${r.turkey ?? "not checked"}${r.turkeyReason ? ` (${r.turkeyReason})` : ""}`,
              `  posted ${r.datePosted ?? r.posted ?? "—"} · deadline ${r.deadline ?? "—"} · id ${r.id}`,
              `  ${r.url}`,
            ].join("\n"),
          )
          .join("\n\n") + "\n",
      )
    } else {
      const pages = total !== null ? Math.max(1, Math.ceil(total / PER_PAGE)) : null
      const meta = {
        count: kept.length, total, page: opts.page, pages, checked: opts.details ? rows.filter((r) => r.turkey).length : 0,
        dropped: { ...dropped, tooOld: dropped.tooOld + tooOldCard, expired: opts.includeExpired ? 0 : expired },
        turkeyMode: opts.turkey, blocked,
      }
      process.stdout.write(JSON.stringify({ meta, results: kept }, null, 2) + "\n")
    }
    if (blocked) {
      writeError(blocked, "BLOCKED")
      return 1
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof BlockedError ? "BLOCKED" : "SEARCH_FAILED")
    return 1
  }
}
