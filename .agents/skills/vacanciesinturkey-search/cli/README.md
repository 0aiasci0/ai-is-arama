# vacanciesinturkey-cli

CLI for [Vacancies in Turkey](https://vacanciesinturkey.com) job listings. Zero runtime
dependencies: plain `bun` + `fetch` + regex parsing. `bun install` only pulls dev types.

```bash
bun run src/cli.ts search -q analyst -l Istanbul --format table
bun run src/cli.ts detail analyst-benelux --format plain
bun run test                      # offline
LIVE_TESTS=1 bun run test         # + one live smoke test (1 listing request + 2 posting pages)
```

`search` opens each open posting's page (JSON-LD) to read the full text and decide whether
the job is in Turkey; see `../SKILL.md` for the rule table and the measured pilot, and
`../url-reference.md` for endpoints. Personal use only; keep volume low.
