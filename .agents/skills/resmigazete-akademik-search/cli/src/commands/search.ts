import {
  PAGE_SIZE,
  classify,
  dayIndexUrl,
  dayString,
  findPdftotext,
  fold,
  htmlFetch,
  parseSection,
  pdfFetch,
  pdfToText,
  variousSectionUrl,
  writeError,
  type Announcement,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  jobage: number
  all: boolean
  peek: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export interface ScanResult {
  announcements: Announcement[]
  daysScanned: number
  issuesFound: number
}

/** Walk the last `days` daily issues (today first) and collect Çeşitli İlânlar entries. */
export async function scanDays(days: number, now: Date = new Date()): Promise<ScanResult> {
  const announcements: Announcement[] = []
  let issuesFound = 0
  for (let back = 0; back < days; back++) {
    const day = dayString(now, back)
    const index = await htmlFetch(dayIndexUrl(day))
    if (!index) continue // no issue yet (today before publication) or none that day
    issuesFound++
    const sectionUrl = variousSectionUrl(index)
    if (!sectionUrl) continue // issue without a Çeşitli İlânlar section
    const section = await htmlFetch(sectionUrl)
    announcements.push(...parseSection(section, day))
  }
  return { announcements, daysScanned: days, issuesFound }
}

function renderTable(items: Announcement[]): string {
  if (items.length === 0) return "No results."
  const rows = items.map((a) => {
    const inst = a.institution.slice(0, 56).padEnd(56)
    const flag = a.academic === null ? "?" : a.academic ? "A" : "-"
    const kind = (a.kind ?? "?").padEnd(8)
    return `${a.id.padEnd(15)} ${a.date} ${flag} ${kind} ${inst} ${(a.headline || "").slice(0, 60)}`
  })
  const header = "ID".padEnd(15) + " " + "DATE".padEnd(10) + " A " + "KIND".padEnd(8) + " " + "INSTITUTION".padEnd(56) + " HEADLINE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    if (opts.peek && !findPdftotext()) {
      writeError("--peek needs pdftotext (Poppler) on PATH or in the PDFTOTEXT environment variable", "MISSING_PDFTOTEXT")
      return 1
    }
    const scan = await scanDays(opts.jobage)
    let items = scan.announcements.filter((a) => opts.all || a.university)
    if (opts.query) {
      const q = fold(opts.query)
      items = items.filter((a) => fold(a.title).includes(q))
    }
    const total = items.length
    const start = (opts.page - 1) * PAGE_SIZE
    items = items.slice(start, start + PAGE_SIZE)
    if (opts.limit !== undefined && opts.limit >= 0) items = items.slice(0, opts.limit)

    // Peek opens each listed PDF (one request each), after paging, so --limit bounds the cost.
    if (opts.peek) {
      for (const a of items) {
        const bytes = await pdfFetch(a.url)
        const text = bytes ? await pdfToText(bytes) : null
        const c = classify(text)
        a.headline = c.headline
        a.academic = c.academic
        a.kind = c.kind
      }
    }

    if (opts.format === "table") {
      process.stdout.write(renderTable(items) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        items
          .map(
            (a) =>
              `${a.institution}\n  ${a.date}${a.academic === null ? "" : a.academic ? " · akademik" : " · akademik değil"}${a.kind && a.kind !== "ilan" ? ` · ${a.kind}` : ""}${a.headline ? `\n  ${a.headline}` : ""}\n  id: ${a.id}\n  ${a.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      const results = items.map((a) => ({
        id: a.id,
        title: a.headline ?? a.title,
        company: a.institution,
        location: null,
        date: a.date,
        url: a.url,
        university: a.university,
        academic: a.academic,
        kind: a.kind,
      }))
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: results.length, total, page: opts.page, daysScanned: scan.daysScanned, issuesFound: scan.issuesFound },
            results,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
