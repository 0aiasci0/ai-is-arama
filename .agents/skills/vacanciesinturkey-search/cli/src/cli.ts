#!/usr/bin/env bun
// Self-contained CLI for Vacancies in Turkey (vacanciesinturkey.com): English-language
// job board for Turkey (private sector, UN agencies, NGOs, embassies). Search uses the
// site's public WP Job Manager listing endpoint; every result's posting page is read
// (JSON-LD) so the Turkey filter can judge the posting text, not the site's location field.
//
// Personal use only. Keep volume low; this tool is not for bulk collection.

import { runSearch, type SearchOpts, type TurkeyMode } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { DETAIL_DELAY_MS } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const BOOLEAN_FLAGS = new Set(["no-details", "include-expired", "help", "h"])

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

const HELP = `vacanciesinturkey-cli — search Vacancies in Turkey job listings

USAGE
  bun run src/cli.ts search --query "<text>" [flags]
  bun run src/cli.ts detail <id|slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, company). REQUIRED.
  --location, -l <text>   Site-side location filter, e.g. "Istanbul", "Ankara" (the site's location
                          field is unreliable; the Turkey filter below is what restricts to Turkey).
  --turkey <mode>         default: drop postings whose text places them outside Turkey (keep "unclear")
                          strict:  keep only postings judged in Turkey
                          off:     no Turkey filter
  --no-details            Do not open posting pages (faster; no Turkey check, no description).
  --include-expired       Keep expired postings (the site returns them; skipped by default).
  --jobage <days>         Keep postings published within <days> (needs details).
  --delay <ms>            Pause between posting-page requests. Default ${DETAIL_DELAY_MS}.
  --page <n>              1-indexed page (50 results/page). Default 1.
  --limit, -n <n>         Open at most <n> posting pages (request budget). Applied before the
                          Turkey filter, so fewer than <n> results may remain.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q economist --format table
  bun run src/cli.ts search -q analyst -l Istanbul --jobage 30 --format table
  bun run src/cli.ts search -q "data analyst" --turkey strict --limit 10
  bun run src/cli.ts detail analyst-benelux --format plain

Personal use only — keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "turkey", "no-details", "include-expired", "jobage", "delay", "page", "limit", "format", "help", "h"]),
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
    if (!["json", "table", "plain"].includes(fmt)) return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    for (const name of ["query", "location", "turkey"]) {
      if (flags[name] === true) return fail(`--${name} requires a value`, "MISSING_VALUE")
    }
    const query = typeof flags.query === "string" ? flags.query.trim() : ""
    if (!query) return fail('the --query/-q flag is required (e.g. -q "economist")', "MISSING_REQUIRED")
    const turkey = typeof flags.turkey === "string" ? flags.turkey : "default"
    if (!["default", "strict", "off"].includes(turkey)) return fail(`--turkey must be default, strict or off, got "${turkey}"`, "BAD_ARG")

    const ints: Record<string, number | undefined> = {}
    for (const name of ["jobage", "page", "limit", "delay"]) {
      const raw = flags[name]
      if (raw === undefined) continue
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      const min = name === "delay" ? 0 : 1
      if (!Number.isInteger(val) || val < min) return fail(`--${name} must be a whole number of at least ${min}, got "${raw}"`, "BAD_ARG")
      ints[name] = val
    }
    const details = flags["no-details"] !== true
    if (!details && ints.jobage !== undefined) return fail("--jobage needs posting dates; drop --no-details", "BAD_ARG")
    if (!details && turkey === "strict") return fail("--turkey strict needs posting pages; drop --no-details", "BAD_ARG")

    const opts: SearchOpts = {
      query,
      location: typeof flags.location === "string" ? flags.location : undefined,
      page: ints.page ?? 1,
      limit: ints.limit,
      details,
      includeExpired: flags["include-expired"] === true,
      turkey: turkey as TurkeyMode,
      jobage: ints.jobage,
      delayMs: ints.delay ?? DETAIL_DELAY_MS,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|slug|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n")
    process.exit(1)
  })
