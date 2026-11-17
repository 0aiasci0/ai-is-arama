import {
  SEARCH_URL,
  postJson,
  toCard,
  isOpen,
  withinJobage,
  normalizeProvince,
  writeError,
  type JobCard,
  type RawIlan,
} from "../helpers.js"

export const PAGE_SIZE = 20

export interface SearchOpts {
  query?: string
  location?: string
  type?: string
  jobage: number
  includeExpired: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** Request body in the shape the public /isealim page sends ("0" = no filter). */
export function buildBody(opts: SearchOpts): Record<string, unknown> {
  return {
    krM_ID: 0,
    searchText: opts.query ?? "",
    il: opts.location ? normalizeProvince(opts.location) : "0",
    ilanTuru: opts.type ? opts.type.trim() : "0",
  }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = c.title.slice(0, 50).padEnd(50)
    const company = (c.company || "—").slice(0, 30).padEnd(30)
    const type = (c.type || "—").slice(0, 22).padEnd(22)
    const deadline = (c.deadline || "—").slice(0, 10)
    return `${c.id.slice(0, 8)} ${title} ${company} ${type} ${deadline}`
  })
  const header =
    "ID".padEnd(8) + " " + "TITLE".padEnd(50) + " " + "INSTITUTION".padEnd(30) + " " + "TYPE".padEnd(22) + " DEADLINE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const rows = (await postJson<RawIlan[]>(SEARCH_URL, buildBody(opts))) ?? []
    const now = new Date()
    const filtered = rows.filter(
      (r) => (opts.includeExpired || isOpen(r, now)) && withinJobage(r, opts.jobage, now),
    )
    // The API returns every match in one response; pages are cut client-side.
    const start = (opts.page - 1) * PAGE_SIZE
    let cards = filtered.slice(start, start + PAGE_SIZE).map(toCard)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"}${c.unit ? ` / ${c.unit}` : ""} · ${c.type || "—"}\n  ${c.date || "—"} → ${c.deadline || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, total: filtered.length, page: opts.page }, results: cards }, null, 2) +
          "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
