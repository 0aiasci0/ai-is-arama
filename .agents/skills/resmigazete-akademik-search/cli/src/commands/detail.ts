import { classify, isoFromDay, pdfFetch, pdfToText, pdfUrl, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept an announcement id (20261016-4-11) or its resmigazete.gov.tr PDF URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{8}-\d+-\d+$/.test(trimmed)) return trimmed
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }
    if (!/(^|\.)resmigazete\.gov\.tr$/i.test(parsed.hostname)) return null
    return parsed.pathname.match(/\/(\d{8}-\d+-\d+)\.pdf$/i)?.[1] ?? null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an announcement id (YYYYMMDD-S-N) from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const url = pdfUrl(id)
    const bytes = await pdfFetch(url)
    if (!bytes) {
      writeError("Announcement PDF not found", "NOT_FOUND")
      return 1
    }
    const text = await pdfToText(bytes)
    const c = classify(text)
    const job = {
      id,
      date: isoFromDay(id.slice(0, 8)),
      url,
      headline: c.headline,
      academic: c.academic,
      kind: c.kind,
      // true = image-only PDF; read it from the url.
      scanned: c.scanned,
      // null when pdftotext is unavailable; the PDF url still works.
      description: text,
    }
    const note = text === null
      ? "(metin çıkarılamadı: pdftotext bulunamadı — PDF'i açın)"
      : c.scanned
        ? "(taranmış PDF: metin katmanı yok — PDF'i açın)"
        : text
    if (opts.format === "plain") {
      const lines = [
        `Resmî Gazete ilanı ${id} (${job.date})`,
        job.academic === null ? "" : job.academic ? "Akademik kadro ilanı" : "Akademik kadro ilanı değil",
        job.kind && job.kind !== "ilan" ? `Tür: ${job.kind}` : "",
        "",
        note,
        "",
        `PDF: ${url}`,
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
