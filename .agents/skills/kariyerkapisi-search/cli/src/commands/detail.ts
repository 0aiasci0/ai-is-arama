import {
  PREVIEW_URL,
  SUB_POSTINGS_URL,
  SITE_BASE,
  postJson,
  bbcodeToText,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

interface RawPreview {
  kurumAdi: string | null
  birimAdi: string | null
  ilanBaslik: string | null
  ilanMetni: string | null
  ilN_NO: string | null
  ilanTuru: string | null
  basTarih: string | null
  bitTarih: string | null
  eDevletServisURL: string | null
  basvuruLinki: string | null
}

interface RawSubPosting {
  ilanBaslik: string | null
  ilanMetni: string | null
  unvan: string | null
  hizmetSinifi: string | null
  kadroDerecesi: string | number | null
  kontenjanList: { il: string; kontenjan: number }[] | null
  degerlemeAsamaList: { asamaAdi: string; agirlik: number | null }[] | null
}

export interface SubPosting {
  title: string | null
  position: string | null
  serviceClass: string | null
  grade: string | null
  quotas: { location: string; count: number }[]
  assessment: { stage: string; weight: number | null }[]
  requirements: string | null
}

export interface JobDetail {
  id: string
  postingNo: string | null
  title: string
  company: string | null
  unit: string | null
  location: string | null
  type: string | null
  date: string | null
  deadline: string | null
  url: string
  applyUrl: string | null
  description: string | null
  positions: SubPosting[]
}

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Accept a bare guid or a kariyerkapisi.gov.tr IlanDetay?i=<guid> URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }
    if (!/(^|\.)kariyerkapisi\.gov\.tr$/i.test(parsed.hostname)) return null
    const i = parsed.searchParams.get("i")
    return i && GUID.test(i) ? i.match(GUID)![0].toLowerCase() : null
  }
  const m = trimmed.match(GUID)
  return m && m[0].length === trimmed.length ? m[0].toLowerCase() : null
}

function toSubPosting(s: RawSubPosting): SubPosting {
  return {
    title: s.ilanBaslik?.trim() || null,
    position: s.unvan?.trim() || null,
    serviceClass: s.hizmetSinifi?.trim() || null,
    grade: s.kadroDerecesi != null && s.kadroDerecesi !== "" ? String(s.kadroDerecesi) : null,
    quotas: (s.kontenjanList ?? []).map((k) => ({ location: k.il.trim(), count: k.kontenjan })),
    assessment: (s.degerlemeAsamaList ?? []).map((d) => ({ stage: d.asamaAdi.trim(), weight: d.agirlik ?? null })),
    requirements: bbcodeToText(s.ilanMetni),
  }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a posting guid from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const body = { ilanGuid: id }
    const [preview, subs] = await Promise.all([
      postJson<RawPreview>(PREVIEW_URL, body),
      postJson<RawSubPosting[]>(SUB_POSTINGS_URL, body),
    ])
    if (!preview) {
      writeError("Posting not found (announcement-only postings have no detail; open their url instead)", "NOT_FOUND")
      return 1
    }
    const positions = (subs ?? []).map(toSubPosting)
    const locations = [...new Set(positions.flatMap((p) => p.quotas.map((q) => q.location)))]
    const job: JobDetail = {
      id,
      postingNo: preview.ilN_NO || null,
      title: preview.ilanBaslik?.trim() || "(untitled)",
      company: preview.kurumAdi?.trim() || null,
      unit: preview.birimAdi?.trim() || null,
      location: locations.length ? locations.join(", ") : null,
      type: preview.ilanTuru?.replace(/[,\s]+$/, "").trim() || null,
      date: preview.basTarih || null,
      deadline: preview.bitTarih || null,
      url: `${SITE_BASE}/IlanDetay?i=${id}`,
      applyUrl: preview.eDevletServisURL || preview.basvuruLinki || null,
      description: bbcodeToText(preview.ilanMetni),
      positions,
    }

    if (opts.format === "plain") {
      const lines: string[] = [
        job.title,
        `${job.company || "—"}${job.unit ? ` / ${job.unit}` : ""}`,
        `Tür: ${job.type || "—"} · İlan no: ${job.postingNo || "—"}`,
        `Başvuru: ${job.date || "—"} → ${job.deadline || "—"}`,
        job.location ? `Yer: ${job.location}` : "",
        "",
        job.description || "(no description)",
      ]
      for (const p of job.positions) {
        lines.push("", `## ${p.title || p.position || "Kadro"}`)
        if (p.position) lines.push(`Unvan: ${p.position}`)
        if (p.quotas.length) lines.push(`Kontenjan: ${p.quotas.map((q) => `${q.location} (${q.count})`).join(", ")}`)
        if (p.assessment.length)
          lines.push(`Değerlendirme: ${p.assessment.map((a) => `${a.stage}${a.weight != null ? ` %${a.weight}` : ""}`).join(" + ")}`)
        if (p.requirements) lines.push(p.requirements)
      }
      lines.push("", `URL: ${job.url}`)
      if (job.applyUrl) lines.push(`Başvuru adresi: ${job.applyUrl}`)
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
