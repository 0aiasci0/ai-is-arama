# kariyerkapisi-cli

CLI for Turkish public-sector job postings on **Kariyer Kapısı** (`kariyerkapisi.gov.tr`).

**Data source**: public JSON API `api.kariyerkapisi.gov.tr/api` (`SearchIlanPublic`, `GetIlanPreviewPublic`, `GetAltIlanInfoByIlanIdPublic`).
**Authentication**: none. **Dependencies**: none (plain `bun` + `fetch`); `bun install` only pulls dev types.

## Quick examples

```bash
bun run src/cli.ts search --format table
bun run src/cli.ts search -q "uzman yardımcısı" --format table
bun run src/cli.ts search -l Ankara -t "Sözleşmeli Personel İlanları" --format table
bun run src/cli.ts detail 2ce03869-1a9d-44f3-a18e-fba394abe5aa --format plain
```

See `../SKILL.md` for the flag reference and `../url-reference.md` for the endpoints.

## Tests

```bash
bun run test                 # offline: parsing + CLI contract
LIVE_TESTS=1 bun run test    # adds one live smoke query
```
