"""Değerlendirilecek ilan kuyruğu: ilgili ilanlardan daha önce CV'ye göre değerlendirilmemiş olanlar.

Kullanım:
  python tools/tr_yeni.py <tarama_klasoru> [--degerlendirme <deger.json> ...] [--onceki-tarama <klasor>]
                          [--kaynak ilanlar_ilgili.csv] [--cikti ilanlar_degerlendirilecek.csv]

Varsayılan: <kaynak> satırlarından, --degerlendirme dosyalarının (varsayılan: taramalar/*/deger*.json)
herhangi birinde anahtarı olanları çıkarır. Anahtar "<portal>|<id>"; eski kısa portal kodları
(li, knet, kk, iskur, rg) uzun ada çevrilir.
--onceki-tarama verilirse eski davranış da uygulanır: o klasörün ilanlar.csv dosyasında görülen ilanlar da çıkar
(2026-11-16 "ilanlar_ilgili_yeni.csv" bu kuralla üretildi; inceleme 2: bu kural 49 hiç değerlendirilmemiş ilanı attı).
"""
import argparse
import csv
import glob
import json
import os

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KISA = {"li": "LinkedIn", "knet": "Kariyer.net", "kk": "Kariyer Kapısı", "iskur": "İŞKUR", "rg": "Resmî Gazete",
        "vit": "Vacancies in Turkey"}


def anahtar(portal, iid):
    return f"{KISA.get(portal, portal)}|{iid}"


def degerlendirilmis(dosyalar):
    gorulen = set()
    for f in dosyalar:
        try:
            d = json.load(open(f, encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            raise SystemExit(f"HATA: değerlendirme dosyası okunamadı: {f}: {e}")
        for k in d:
            if k.startswith("_") or "|" not in k:
                continue
            portal, iid = k.split("|", 1)
            gorulen.add(anahtar(portal, iid))
    return gorulen


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("--degerlendirme", nargs="*", help="deger*.json dosyaları (varsayılan: taramalar/*/deger*.json)")
    ap.add_argument("--onceki-tarama", help="eski kural: bu klasörün ilanlar.csv dosyasında görülenleri de çıkar")
    ap.add_argument("--kaynak", default="ilanlar_ilgili.csv")
    ap.add_argument("--cikti", default="ilanlar_degerlendirilecek.csv")
    a = ap.parse_args(argv)

    dosyalar = a.degerlendirme if a.degerlendirme is not None else sorted(glob.glob(os.path.join(KOK, "taramalar", "*", "deger*.json")))
    gorulen = degerlendirilmis(dosyalar)
    onceki = set()
    if a.onceki_tarama:
        onceki = {anahtar(r["portal"], r["id"]) for r in
                  csv.DictReader(open(os.path.join(a.onceki_tarama, "ilanlar.csv"), encoding="utf-8-sig"))}

    yol = os.path.join(a.klasor, a.kaynak)
    rows = list(csv.DictReader(open(yol, encoding="utf-8-sig")))
    if not rows:
        raise SystemExit(f"HATA: {yol} boş")
    sec = [r for r in rows if anahtar(r["portal"], r["id"]) not in gorulen | onceki]
    cikti = os.path.join(a.klasor, a.cikti)
    gecici = cikti + ".part"
    with open(gecici, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(sec)
    os.replace(gecici, cikti)
    print(f"değerlendirme dosyası {len(dosyalar)} ({len(gorulen)} anahtar); önceki tarama {len(onceki)}; "
          f"kaynak {len(rows)} → kuyruk {len(sec)} -> {cikti}", flush=True)


if __name__ == "__main__":
    main()
