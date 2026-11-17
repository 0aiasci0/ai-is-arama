import {
  BlockedError,
  PAGE_SIZE,
  SEARCH_PATH,
  SITE_BASE,
  htmlFetch,
  jobageToParam,
  markPromoted,
  parseJobCards,
  parseTotal,
  slugify,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage: number
  sort: "score" | "date"
  includePromoted: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const path = opts.location ? `${SEARCH_PATH}/${slugify(opts.location)}` : SEARCH_PATH
  const params = new URLSearchParams()
  params.set("kw", opts.query)
  const date = jobageToParam(opts.jobage)
  if (date) params.set("date", date)
  if (opts.sort === "date") params.set("sd", "dd")
  if (opts.page > 1) params.set("cp", String(opts.page))
  return `${SITE_BASE}${path}?${params.toString()}`
}

/**
 * An unknown city slug is redirected to the all-Turkey list with no error.
 * The city survives redirects as a path segment plus a ct= parameter
 * (/is-ilanlari/ankara?ct=6&kw=…), so a final URL without ct= means the
 * location filter was dropped.
 */
export function locationKept(finalUrl: string): boolean {
  try {
    return new URL(finalUrl).searchParams.has("ct")
  } catch {
    return false
  }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = c.title.slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 30).padEnd(30)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    return `${c.id.padEnd(8)} ${title} ${company} ${loc} ${c.date || "—"}`
  })
  const header = "ID".padEnd(8) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(30) + " " + "LOCATION".padEnd(18) + " AGE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const { html, finalUrl } = await htmlFetch(buildUrl(opts))
    if (opts.location && !locationKept(finalUrl)) {
      writeError(
        `Kariyer.net does not know the location "${opts.location}" (slug "${slugify(opts.location)}") and would have searched all of Turkey; use a province or district name such as "Ankara", "İzmir", "Muğla Bodrum"`,
        "BAD_LOCATION",
      )
      return 1
    }
    const total = parseTotal(html)
    let cards = markPromoted(parseJobCards(html), total, opts.page)
    if (!opts.includePromoted) cards = cards.filter((c) => !c.promoted)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.workModel || "—"} / ${c.workType || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      const pages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, total, page: opts.page, pages }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof BlockedError ? "BLOCKED" : "SEARCH_FAILED")
    return 1
  }
}
