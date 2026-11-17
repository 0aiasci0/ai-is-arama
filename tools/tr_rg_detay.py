"""Resmî Gazete taraması: akademik/belirsiz ilanların tam metnini çeker, il ve alan eşleşmesini işaretler.
Kullanım: python tools/tr_rg_detay.py <tarama_klasoru>
"""
import glob, json, os, re, subprocess, sys

OUT = sys.argv[1]
CLI = ".agents/skills/resmigazete-akademik-search/cli/src/cli.ts"
ALAN = re.compile(r"iktisat|ekonomi|ekonometri|istatistik|veri bilim|veri anali|data scien|finans", re.I)
IL = {"Ankara": re.compile(r"ankara", re.I), "İstanbul": re.compile(r"[iİı]stanbul", re.I)}

ilanlar = []
for f in sorted(glob.glob(os.path.join(OUT, "ham", "rg__universite__peek__p*.json"))):
    ilanlar += json.load(open(f, encoding="utf-8"))["results"]
print("toplam", len(ilanlar), flush=True)

aday = [x for x in ilanlar if x["academic"] is not False and x["kind"] in ("ilan", None)]
print("akademik/belirsiz ilan", len(aday), flush=True)

detay_dir = os.path.join(OUT, "ham", "rg_detay")
os.makedirs(detay_dir, exist_ok=True)
sonuc = []
for x in aday:
    yol = os.path.join(detay_dir, x["id"] + ".json")
    if not os.path.exists(yol):
        p = subprocess.run(["bun", "run", CLI, "detail", x["id"], "--format", "json"],
                           capture_output=True, text=True, encoding="utf-8")
        if p.returncode != 0:
            print("HATA", x["id"], p.stderr.strip(), flush=True)
            continue
        open(yol, "w", encoding="utf-8").write(p.stdout)
    d = json.load(open(yol, encoding="utf-8"))
    metin = (d.get("description") or "")
    bas = x["company"] + " " + metin[:3000]
    iller = [k for k, r in IL.items() if r.search(bas)]
    alanlar = sorted({m.group(0).lower() for m in ALAN.finditer(metin)})
    sonuc.append({"id": x["id"], "tarih": x["date"], "kurum": x["company"], "baslik": x["title"],
                  "academic": x["academic"], "taranmis": d.get("scanned"), "iller": iller,
                  "alan_eslesme": alanlar, "url": x["url"]})
    print(x["id"], iller, alanlar, x["company"][:50], flush=True)

json.dump(sonuc, open(os.path.join(OUT, "rg_akademik.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("yazildi", len(sonuc), flush=True)
