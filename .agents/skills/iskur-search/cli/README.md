# iskur-cli

CLI for **İŞKUR** open vacancies (`esube.iskur.gov.tr`).

**Data source**: public WebForms page `Istihdam/AcikIsIlanAra.aspx` (search postback) and `AcikIsIlanDetay.aspx` (detail).
**Authentication**: none (employer names stay hidden without login). **Dependencies**: none; `bun install` only pulls dev types.

## Quick examples

```bash
bun run src/cli.ts search -q muhasebe -l Ankara --format table
bun run src/cli.ts search -s kamu --format table
bun run src/cli.ts detail 00009861683 --format plain
```

See `../SKILL.md` for flags and `../url-reference.md` for the form fields.

## Tests

```bash
bun run test                 # offline: grid/detail parsing, form building, CLI contract
LIVE_TESTS=1 bun run test    # adds one live smoke query
```
