import { BlockedError, DETAIL_PATH, SITE_BASE, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a numeric posting id, a kariyer.net /is-ilani/<slug>-<id> URL, or a
 * bare slug ending in the id. Other hosts are rejected.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{5,}$/.test(trimmed)) return trimmed
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!/(^|\.)kariyer\.net$/i.test(parsed.hostname)) return null
    return parsed.pathname.match(/^\/is-ilani\/(?:[^/]*-)?(\d{5,})\/?$/)?.[1] ?? null
  }
  return trimmed.match(/^[a-z0-9-]*-(\d{5,})$/i)?.[1] ?? null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Kariyer.net posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // /is-ilani/<id> redirects to the canonical slug URL.
    const { html, finalUrl } = await htmlFetch(`${SITE_BASE}${DETAIL_PATH}/${id}`)
    if (!html || !finalUrl.includes(id)) {
      writeError("Posting not found or no longer published", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id, finalUrl)
    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.features.length ? job.features.join(" · ") : "",
        job.deadline ? `Son başvuru: ${job.deadline}` : "",
        job.updated ? job.updated : "",
        job.applications !== null ? `Başvuru sayısı: ${job.applications}` : "",
        `Durum: ${job.isActive ? "AKTİF" : "KAPALI"}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ]
      process.stdout.write(lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof BlockedError ? "BLOCKED" : "DETAIL_FAILED")
    return 1
  }
}
