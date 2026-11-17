import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers"

// Argument validation happens before any network call, so these run offline.
describe("CLI contract (offline)", () => {
  test("unknown flag exits 1 with a JSON error on stderr", async () => {
    const r = await runCLI(["search", "--bogus", "x"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
    expect(r.stdout).toBe("")
  })

  test("non-integer --page is rejected", async () => {
    const r = await runCLI(["search", "--page", "0.5"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("--query without a value is rejected", async () => {
    const r = await runCLI(["search", "--query"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("MISSING_VALUE")
  })

  test("detail without an id is rejected", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })
})

// Live smoke test against the real API. Opt-in so CI never depends on the portal.
describe.skipIf(process.env.LIVE_TESTS !== "1")("live smoke", () => {
  test("search returns postings with id, title and url", async () => {
    const out = parseJSON<{ results: { id: string; title: string; url: string }[] }>(
      await runCLI(["search", "--limit", "3"]),
    )
    expect(out.results.length).toBeGreaterThan(0)
    for (const r of out.results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.url).toMatch(/^https?:\/\//)
    }
  })
})
