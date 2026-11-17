import {
  CTL,
  SEARCH_URL,
  SECTOR_VALUES,
  Session,
  fold,
  hiddenFields,
  jobageToOption,
  parseResults,
  selectOptions,
  writeError,
  type JobCard,
  type Sector,
  type SearchPage,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  sector: Sector
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

class UserInputError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

/** Resolve a province name to the form's option value, from the form itself. */
export function resolveProvince(formHtml: string, input: string): string {
  const options = selectOptions(formHtml, CTL.province)
  const want = fold(input)
  for (const [label, value] of options) {
    if (value && fold(label) === want) return value
  }
  throw new UserInputError(`unknown province "${input}" — use a Turkish province name such as "Ankara" or "İstanbul"`, "BAD_LOCATION")
}

/** Form fields for a search postback, on top of the page's hidden fields. */
export function searchFields(formHtml: string, opts: SearchOpts): URLSearchParams {
  const body = new URLSearchParams()
  for (const [k, v] of hiddenFields(formHtml)) body.set(k, v)
  body.set("__EVENTTARGET", CTL.searchButton)
  body.set("__EVENTARGUMENT", "")
  body.set(CTL.keyword, opts.query ?? "")
  body.set(CTL.sector, SECTOR_VALUES[opts.sector])
  body.set(CTL.province, opts.location ? resolveProvince(formHtml, opts.location) : "")
  body.set(CTL.postingAge, jobageToOption(opts.jobage))
  return body
}

/** Postback that jumps to page N, carrying the previous response's ViewState. */
export function gotoPageFields(resultHtml: string, searchBody: URLSearchParams, page: number): URLSearchParams {
  const body = new URLSearchParams(searchBody)
  for (const [k, v] of hiddenFields(resultHtml)) body.set(k, v)
  body.set("__EVENTTARGET", CTL.gotoPageButton)
  body.set("__EVENTARGUMENT", "")
  body.set(CTL.currentPage, String(page))
  return body
}

export async function fetchPage(opts: SearchOpts): Promise<SearchPage> {
  const session = new Session()
  const form = await session.request(SEARCH_URL)
  if (!form) throw new Error("search form not found (404)")
  const searchBody = searchFields(form, opts)
  let html = await session.request(SEARCH_URL, searchBody)
  let result = parseResults(html)
  if (opts.page > 1) {
    if (result.pages !== null && opts.page > result.pages) {
      return { cards: [], total: result.total, page: opts.page, pages: result.pages }
    }
    html = await session.request(SEARCH_URL, gotoPageFields(html, searchBody, opts.page))
    result = parseResults(html)
    if (result.page !== null && result.page !== opts.page) {
      throw new Error(`portal returned page ${result.page} instead of ${opts.page}`)
    }
  }
  return result
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = c.title.slice(0, 40).padEnd(40)
    const loc = (c.location || "—").slice(0, 44).padEnd(44)
    const work = (c.workType || "—").slice(0, 14).padEnd(14)
    return `${c.id.padEnd(12)} ${title} ${loc} ${work} ${String(c.openings ?? "—").padStart(3)} ${c.deadline || "—"}`
  })
  const header =
    "ID".padEnd(12) + " " + "TITLE".padEnd(40) + " " + "LOCATION".padEnd(44) + " " + "WORK TYPE".padEnd(14) + " " + "POS" + " DEADLINE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const result = await fetchPage(opts)
    let cards = result.cards
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.location || "—"} · ${c.sector || "—"} / ${c.period || "—"} / ${c.workType || "—"} · ${c.openings ?? "—"} açık pozisyon\n  son başvuru: ${c.deadline || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, total: result.total, page: opts.page, pages: result.pages }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    if (e instanceof UserInputError) {
      writeError(e.message, e.code)
    } else {
      writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    }
    return 1
  }
}
