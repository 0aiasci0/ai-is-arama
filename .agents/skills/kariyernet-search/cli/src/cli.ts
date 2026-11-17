#!/usr/bin/env bun
// Self-contained CLI for Kariyer.net job listings (Turkey's largest private
// job board). Reads the public server-rendered search and posting pages; no
// external CLI framework, so it runs anywhere `bun` is available.
//
// Personal use only. Keep volume low; Kariyer.net uses bot protection and
// this tool is not for bulk collection or commercial use.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const BOOLEAN_FLAGS = new Set(["include-promoted", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (BOOLEAN_FLAGS.has(key) || next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `kariyernet-cli — search Kariyer.net job listings (Turkey)

USAGE
  bun run src/cli.ts search --query "<text>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, company). REQUIRED.
  --location, -l <text>   Province or district, e.g. "Ankara", "İstanbul Avrupa", "Muğla Bodrum".
  --jobage <days>         1 → today, ≤3 → 3 days, ≤7 → 7 days, ≤15 → 15 days; other values = all.
  --sort <order>          score (relevance, default) | date (newest first).
  --include-promoted      Keep the promoted block (sponsored/boosted) shown above the organic results.
  --page <n>              1-indexed page (50 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q ekonomist --format table
  bun run src/cli.ts search -q iktisat -l Ankara --jobage 7 --format table
  bun run src/cli.ts search -q "dış ticaret uzmanı" -l İstanbul --sort date --format table
  bun run src/cli.ts detail 4574710 --format plain

Personal use only — Kariyer.net uses bot protection; keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "sort", "include-promoted", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(`unknown flag --${key} for '${cmd}'; see --help for the supported flags`, "UNKNOWN_FLAG")
    }
  }

  if (cmd === "search") {
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }
    for (const name of ["query", "location", "sort"]) {
      if (flags[name] === true) return fail(`--${name} requires a value`, "MISSING_VALUE")
    }
    const query = typeof flags.query === "string" ? flags.query.trim() : ""
    if (!query) return fail('the --query/-q flag is required (e.g. -q "ekonomist")', "MISSING_REQUIRED")
    const sort = typeof flags.sort === "string" ? flags.sort : "score"
    if (sort !== "score" && sort !== "date") return fail(`--sort must be score or date, got "${sort}"`, "BAD_ARG")

    const ints: Record<string, number | undefined> = {}
    for (const name of ["jobage", "page", "limit"]) {
      const raw = flags[name]
      if (raw === undefined) continue
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        return fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
      }
      ints[name] = val
    }

    const opts: SearchOpts = {
      query,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: ints.jobage ?? 9999,
      sort,
      includePromoted: flags["include-promoted"] === true,
      page: ints.page ?? 1,
      limit: ints.limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
