# resmigazete-akademik-cli

CLI for **academic job calls** in the Resmî Gazete *Çeşitli İlânlar* section.

**Data source**: daily issue indexes `/eskiler/YYYY/MM/YYYYMMDD.htm` → section page → one PDF per announcement.
**Authentication**: none. **Dependencies**: none at runtime; `pdftotext` (Poppler) is used for PDF text when present.

## Quick examples

```bash
bun run src/cli.ts search --format table
bun run src/cli.ts search --jobage 14 -q ankara --peek --format table
bun run src/cli.ts detail 20261016-4-11 --format plain
```

See `../SKILL.md` for flags and `../url-reference.md` for page structure and the classifier gold check.

## Tests

```bash
bun run test                 # offline: cp1254 decoding, section parsing, classifier, CLI contract
LIVE_TESTS=1 bun run test    # adds one live smoke query
```
