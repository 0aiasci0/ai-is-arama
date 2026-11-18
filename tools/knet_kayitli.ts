// Kariyer.net kaydedilmiş arama sayfalarını ham JSON'a çevirir. Ağ isteği YOK.
// Kullanım: bun run tools/knet_kayitli.ts <tarama_klasoru>
// Girdi:  <klasor>/knet_kayitli/ADRESLER.txt ("NN  terim  url" satırları) ve NN.html / NN_pK.html
//         (kullanıcının kendi tarayıcısında açıp kaydettiği sayfalar).
// Çıktı:  <klasor>/ham/knet__<terim>__TR__pK.json  (tr_tarama.sh ile aynı {meta, results} biçimi)
// Çıkış: 0 en az bir sayfa okundu; 1 kayıtlı sayfa yok ya da hiçbirinde ilan kartı yok; 2 kullanım.
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { markPromoted, parseJobCards, parseJobDetail, parseTotal, PAGE_SIZE } from "../.agents/skills/kariyernet-search/cli/src/helpers.ts"

const klasor = process.argv[2]
if (!klasor) { console.error("kullanım: bun run tools/knet_kayitli.ts <tarama_klasoru>"); process.exit(2) }
const kd = join(klasor, "knet_kayitli")
const adres = join(kd, "ADRESLER.txt")
if (!existsSync(adres)) { console.error(`yok: ${adres}`); process.exit(2) }

// tr_tarama.sh slug() ile aynı dönüşüm
const slug = (s: string) => s.replace(/ /g, "_").replace(/ş/g, "s").replace(/ı/g, "i").replace(/İ/g, "I")
  .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u")

const terim = new Map<string, string>()
for (const satir of readFileSync(adres, "utf8").split(/\r?\n/)) {
  const m = satir.match(/^(\d{2})\s+(.+?)\s+https:\/\//)
  if (m) terim.set(m[1], m[2].trim())
}

// Detay kipi: knet_kayitli/detay/<id>.html -> <klasor>/detay/knet_<id>.txt (tr_detay_cek.py ile aynı düz metin)
const dd = join(kd, "detay")
if (existsSync(dd)) {
  let yazilan = 0
  for (const ad of readdirSync(dd).sort()) {
    const m = ad.match(/^(\d+)\.html?$/)
    if (!m) continue
    const html = readFileSync(join(dd, ad), "utf8")
    if (/px-captcha|Access to this page has been denied/i.test(html)) { console.error(`ENGEL detay ${ad}`); continue }
    const j = parseJobDetail(html, m[1], `https://www.kariyer.net/is-ilani/${m[1]}`)
    if (!j.description) { console.error(`METINSIZ detay ${ad}`); continue }
    const satirlar = [j.title, `${j.company || "—"} · ${j.location || "—"}`, j.features.length ? j.features.join(" · ") : "",
      j.deadline ? `Son başvuru: ${j.deadline}` : "", j.updated || "", `Durum: ${j.isActive ? "AKTİF" : "KAPALI"}`, "",
      j.description, "", `URL: ${j.url}`]
    writeFileSync(join(klasor, "detay", `knet_${m[1]}.txt`), satirlar.join("\n") + "\n")
    yazilan++
  }
  console.log(`detay yazılan ${yazilan}`)
}

let okunan = 0, kartli = 0
for (const ad of readdirSync(kd).sort()) {
  const m = ad.match(/^(\d{2})(?:_p(\d+))?\.html?$/i)
  if (!m) continue
  const t = terim.get(m[1])
  if (!t) { console.error(`UYARI ${ad}: ADRESLER.txt'de ${m[1]} yok`); continue }
  const sayfa = Number(m[2] ?? 1)
  const html = readFileSync(join(kd, ad), "utf8")
  okunan++
  if (/px-captcha|Access to this page has been denied/i.test(html)) {
    console.error(`ENGEL ${ad}: kaydedilen sayfa bot doğrulama sayfası`); continue
  }
  const total = parseTotal(html)
  const kartlar = markPromoted(parseJobCards(html), total, sayfa)
  if (kartlar.length) kartli++
  const pages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null
  const hedef = join(klasor, "ham", `knet__${slug(t)}__TR__p${sayfa}.json`)
  const sonuc = { meta: { count: kartlar.filter((c) => !c.promoted).length, total, page: sayfa, pages,
    kaynak: "kayitli_sayfa", dosya: ad, kayit: statSync(join(kd, ad)).mtime.toISOString() }, results: kartlar }
  writeFileSync(hedef, JSON.stringify(sonuc, null, 2) + "\n")
  console.log(`OK ${ad} terim=${t} kart=${kartlar.length} total=${total} pages=${pages}`)
}
console.log(`okunan ${okunan} | ilan kartı olan ${kartli}`)
process.exit(kartli > 0 ? 0 : 1)
