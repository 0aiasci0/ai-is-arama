#!/usr/bin/env bun
// Self-contained CLI for academic (faculty) job calls published in the
// Resmî Gazete "Çeşitli İlânlar" section. Walks the daily issue indexes;
// `detail` and `--peek` extract PDF text with pdftotext (Poppler) when present.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { MAX_DAYS } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const BOOLEAN_FLAGS = new Set(["all", "peek", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
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

const HELP = `resmigazete-akademik-cli — academic job calls in the Resmî Gazete (Turkey)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|pdf-url> [--format json|plain]

SEARCH FLAGS
  --jobage <days>         Daily issues to scan, today backwards. Default 7, max ${MAX_DAYS}.
  --query, -q <text>      Filter on the announcing institution, e.g. "Ankara", "Hacettepe".
  --all                   Include every Çeşitli İlânlar entry, not only universities.
  --peek                  Open each listed PDF: adds headline + academic flag (needs pdftotext).
  --page <n>              1-indexed page (20 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (also bounds --peek downloads).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search --format table
  bun run src/cli.ts search --jobage 14 -q ankara --peek --format table
  bun run src/cli.ts detail 20261016-4-11 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["jobage", "query", "all", "peek", "page", "limit", "format", "help", "h"]),
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
    if (flags.query === true) return fail("--query requires a value", "MISSING_VALUE")

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
    if ((ints.jobage ?? 0) > MAX_DAYS) {
      return fail(`--jobage scans one issue per day; at most ${MAX_DAYS} days per call`, "BAD_ARG")
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      jobage: ints.jobage ?? 7,
      all: flags.all === true,
      peek: flags.peek === true,
      page: ints.page ?? 1,
      limit: ints.limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|pdf-url>", "NO_ID")
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
