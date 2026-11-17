#!/usr/bin/env bun
// Self-contained CLI for Turkish public-sector postings on Kariyer Kapısı
// (kariyerkapisi.gov.tr, Cumhurbaşkanlığı İnsan Kaynakları Ofisi). Reads the
// public JSON API behind the /isealim page. No external CLI framework, so it
// runs anywhere `bun` is available with zero install beyond the repo clone.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

// Boolean flags never consume the next argument.
const BOOLEAN_FLAGS = new Set(["include-expired", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", t: "type" }
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

const HELP = `kariyerkapisi-cli — search Turkish public-sector job postings on Kariyer Kapısı

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <guid|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Full-text keywords (title, institution, posting text). Optional.
  --location, -l <il>     Province, e.g. "Ankara", "İstanbul", or "Türkiye Geneli".
  --type, -t <text>       Posting type, exact portal label, e.g. "Sözleşmeli Personel İlanları",
                          "A Grubu Memur (Kariyer Meslek)", "Öğretim Üyesi", "Araştırma Görevlisi".
  --jobage <days>         Application period opened within N days. Default: all.
  --include-expired       Also return postings whose deadline has passed.
  --page <n>              1-indexed page (20 results/page, cut client-side). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search --format table
  bun run src/cli.ts search -q "uzman yardımcısı" --format table
  bun run src/cli.ts search -l Ankara -t "Sözleşmeli Personel İlanları" --format table
  bun run src/cli.ts detail 2ce03869-1a9d-44f3-a18e-fba394abe5aa --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "type", "jobage", "include-expired", "page", "limit", "format", "help", "h"]),
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

  // Unknown flags are rejected, never ignored: a discarded filter silently
  // widens the search (add-portal.md contract).
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
    for (const name of ["query", "location", "type"]) {
      if (flags[name] === true) return fail(`--${name} requires a value`, "MISSING_VALUE")
    }

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
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      type: typeof flags.type === "string" ? flags.type : undefined,
      jobage: ints.jobage ?? 9999,
      includeExpired: flags["include-expired"] === true,
      page: ints.page ?? 1,
      limit: ints.limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires a <guid|url>", "NO_ID")
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
