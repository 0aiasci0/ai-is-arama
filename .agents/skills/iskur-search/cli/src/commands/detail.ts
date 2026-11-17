import { DETAIL_URL, Session, detailUrl, parseDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept the 11-digit İşgücü İstemi number or an esube.iskur.gov.tr detail URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{6,}$/.test(trimmed)) return trimmed
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }
    if (!/(^|\.)iskur\.gov\.tr$/i.test(parsed.hostname)) return null
    const id = parsed.searchParams.get("uiID")
    return id && /^\d{6,}$/.test(id) ? id : null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an İŞKUR posting number from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await new Session().request(`${DETAIL_URL}?uiID=${id}`)
    const job = html ? parseDetail(html, id) : null
    if (!job || (!job.description && job.occupations.length === 0)) {
      writeError("Posting not found or no longer published", "NOT_FOUND")
      return 1
    }
    if (opts.format === "plain") {
      const lines = [
        job.title,
        job.occupations.map((o) => `Meslek: ${o.name}${o.experience ? ` (deneyim ${o.experience})` : ""}`).join("\n"),
        job.educationMin ? `En az öğrenim: ${job.educationMin}` : "",
        job.educationMax ? `En fazla öğrenim: ${job.educationMax}` : "",
        "",
        "İş Tanımı",
        job.description || "(yok)",
        "",
        "Nitelik ve Beceriler",
        job.qualifications || "(yok)",
        "",
        `URL: ${detailUrl(id)}`,
      ]
      process.stdout.write(lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
