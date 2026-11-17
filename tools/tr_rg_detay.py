"""Resmî Gazete taraması: akademik/belirsiz ilanların tam metnini çeker; il, alan ve son başvuru tarihini işaretler.

Kullanım: python tools/tr_rg_detay.py <tarama_klasoru> [--onbellek]
Girdi:  <klasor>/ham/rg__universite__peek__p*.json (tr_tarama.sh rg)
Çıktı:  <klasor>/ham/rg_detay/<id>.json (önbellek), <klasor>/rg_akademik.json
--onbellek: yalnız önbellekteki metinleri kullan, ağa çıkma (eksik ilan HATA olarak sayılır).
Ortam: BUN=<komut> bun yerine program (sınama).
Çıkış kodu: 0 tamam | 3 en az bir ilan okunamadı.
"""
import argparse
import glob
import json
import os
import re
import shlex
import subprocess
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(KOK, ".agents", "skills", "resmigazete-akademik-search", "cli", "src", "cli.ts")
ALAN = re.compile(r"iktisat|ekonomi|ekonometri|istatistik|veri bilim|veri anali|data scien|finans", re.I)
IL = {"Ankara": re.compile(r"ankara", re.I), "İstanbul": re.compile(r"[iİı]stanbul", re.I)}
# Katlanmış (küçük harf, Türkçe i) metinde: "son başvuru tarihi: 02.12.2026" ve benzerleri
SON_BASVURU = re.compile(r"son\s+basvuru\s+tarihi\s*[:\-]?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})")


def fold(s):
    return (s.replace("İ", "i").replace("I", "ı").lower()
            .translate(str.maketrans("ıışğüöç", "iisguoc")))


def son_basvuru(metin):
    """İlk 'Son başvuru tarihi' tarihini ISO (YYYY-AA-GG) döndürür; yoksa None."""
    m = SON_BASVURU.search(fold(metin))
    if not m:
        return None
    g, a, y = (int(x) for x in m.groups())
    return f"{y:04d}-{a:02d}-{g:02d}" if 1 <= a <= 12 and 1 <= g <= 31 else None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("--onbellek", action="store_true", help="ağa çıkma; yalnız önbellek")
    a = ap.parse_args(argv)
    bun = shlex.split(os.environ.get("BUN", "bun"))

    ilanlar = []
    for f in sorted(glob.glob(os.path.join(a.klasor, "ham", "rg__universite__peek__p*.json"))):
        ilanlar += json.load(open(f, encoding="utf-8"))["results"]
    print("toplam", len(ilanlar), flush=True)
    aday = [x for x in ilanlar if x["academic"] is not False and x["kind"] in ("ilan", None)]
    print("akademik/belirsiz ilan", len(aday), flush=True)

    detay_dir = os.path.join(a.klasor, "ham", "rg_detay")
    os.makedirs(detay_dir, exist_ok=True)
    sonuc, hata = [], 0
    for x in aday:
        yol = os.path.join(detay_dir, x["id"] + ".json")
        if not os.path.exists(yol):
            if a.onbellek:
                print("HATA önbellekte yok", x["id"], flush=True)
                hata += 1
                continue
            try:
                p = subprocess.run(bun + ["run", CLI, "detail", x["id"], "--format", "json"],
                                   capture_output=True, text=True, encoding="utf-8")
            except OSError as e:
                raise SystemExit(f"ON KOSUL: '{' '.join(bun)}' çalıştırılamadı ({e})")
            if p.returncode != 0:
                print("HATA", x["id"], p.stderr.strip()[:200], flush=True)
                hata += 1
                continue
            with open(yol + ".part", "w", encoding="utf-8") as fh:
                fh.write(p.stdout)
            os.replace(yol + ".part", yol)
        d = json.load(open(yol, encoding="utf-8"))
        metin = d.get("description") or ""
        iller = [k for k, r in IL.items() if r.search(x["company"] + " " + metin)]
        alanlar = sorted({m.group(0).lower() for m in ALAN.finditer(metin)})
        sonuc.append({"id": x["id"], "tarih": x["date"], "kurum": x["company"], "baslik": x["title"],
                      "academic": x["academic"], "taranmis": d.get("scanned"), "iller": iller,
                      "alan_eslesme": alanlar, "son_basvuru": son_basvuru(metin), "url": x["url"]})

    cikti = os.path.join(a.klasor, "rg_akademik.json")
    with open(cikti + ".part", "w", encoding="utf-8") as fh:
        json.dump(sonuc, fh, ensure_ascii=False, indent=1)
    os.replace(cikti + ".part", cikti)
    print("yazildi", len(sonuc), "| il bulunan", sum(bool(s["iller"]) for s in sonuc),
          "| son başvuru bulunan", sum(bool(s["son_basvuru"]) for s in sonuc), "| hata", hata, flush=True)
    return 3 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
