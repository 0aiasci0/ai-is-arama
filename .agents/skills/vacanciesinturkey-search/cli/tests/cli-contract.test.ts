import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers"

// Argument validation happens before any network call, so these run offline.
describe("CLI contract (offline)", () => {
  test("unknown flag exits 1 with a JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "x", "--bogus", "x"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
    expect(r.stdout).toBe("")
  })
  test("search without --query exits MISSING_REQUIRED", async () => {
    const r = await runCLI(["search", "-l", "Ankara"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("MISSING_REQUIRED")
  })
  test("bad --turkey value is rejected", async () => {
    const r = await runCLI(["search", "-q", "x", "--turkey", "maybe"])
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
  test("--jobage with --no-details is rejected", async () => {
    const r = await runCLI(["search", "-q", "x", "--no-details", "--jobage", "7"])
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
  test("--turkey strict with --no-details is rejected", async () => {
    const r = await runCLI(["search", "-q", "x", "--no-details", "--turkey", "strict"])
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
  test("detail without an id is rejected", async () => {
    const r = await runCLI(["detail"])
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })
  test("detail with a foreign URL is rejected", async () => {
    const r = await runCLI(["detail", "https://example.com/job/x/"])
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
})

// Live smoke test against the real site. Opt-in so CI never depends on the portal.
describe.skipIf(process.env.LIVE_TESTS !== "1")("live smoke", () => {
  test("search returns checked postings with id, title, url and a Turkey verdict", async () => {
    const out = parseJSON<{ results: { id: string; title: string; url: string; turkey: string }[] }>(
      // --turkey off: the newest analyst postings can all be foreign (measured 2026-11-17).
      await runCLI(["search", "-q", "analyst", "--limit", "2", "--turkey", "off"]),
    )
    expect(out.results.length).toBeGreaterThan(0)
    for (const r of out.results) {
      expect(r.id).toBeTruthy()
      expect(r.url).toMatch(/^https:\/\/vacanciesinturkey\.com\//)
      expect(["yes", "no", "unclear"]).toContain(r.turkey)
    }
  })
})
