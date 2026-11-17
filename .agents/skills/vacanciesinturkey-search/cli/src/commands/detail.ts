import { BlockedError, normalizeRef, parseJobPosting, siteFetch, turkeyVerdict, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const url = normalizeRef(opts.id)
  if (!url) {
    writeError(`Could not parse a vacanciesinturkey.com posting from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const { body, finalUrl } = await siteFetch(url)
    if (body && /\bstatus-expired\b/.test(body)) {
      writeError("This listing has expired", "EXPIRED")
      return 1
    }
    const p = body ? parseJobPosting(body) : null
    if (!p) {
      writeError("Posting not found, unpublished, or without JobPosting data", "NOT_FOUND")
      return 1
    }
    const v = turkeyVerdict(p.title, p.description, p.siteLocation)
    const job = { ...p, url: finalUrl, turkey: v.turkey, turkeyReason: v.reason, turkeyEvidence: v.evidence }
    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company ?? "—"} · site location: ${job.siteLocation ?? "—"} (unreliable)`,
        `Turkey: ${job.turkey} (${job.turkeyReason})`,
        job.category ? `Category: ${job.category}` : "",
        `Posted: ${job.datePosted ?? "—"} · Deadline: ${job.deadline ?? "—"}`,
        "",
        job.description ?? "(no description)",
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
