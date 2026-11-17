# kariyernet-cli

CLI for **Kariyer.net** job listings (Turkey).

**Data source**: public SSR pages `/is-ilanlari` (search) and `/is-ilani/<id>` (detail).
**Authentication**: none. **Dependencies**: none; `bun install` only pulls dev types.

> **Personal use only.** Kariyer.net uses PerimeterX bot protection. Keep volume low; a 403 exits
> with `BLOCKED` and is never retried.

## Quick examples

```bash
bun run src/cli.ts search -q ekonomist --format table
bun run src/cli.ts search -q "dış ticaret uzmanı" -l İstanbul --sort date --format table
bun run src/cli.ts detail 4574710 --format plain
```

See `../SKILL.md` for flags and `../url-reference.md` for the parsing anchors.

## Tests

```bash
bun run test                 # offline: card/detail parsing, Nuxt count, URL building, CLI contract
LIVE_TESTS=1 bun run test    # adds one live smoke query
```
