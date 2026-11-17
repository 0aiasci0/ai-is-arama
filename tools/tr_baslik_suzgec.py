"""ilanlar.csv -> başlıkta rol kökü geçen ve konumu Ankara/İstanbul (veya yalnız 'Türkiye') olan ilanlar.
Kullanım: python tools/tr_baslik_suzgec.py <klasor> [--kural config/tr_suzgec.json]
Çıktı: ilanlar_ilgili.csv, ilanlar_ilgili.md; serbest iş platformu ilanları ilanlar_serbest.csv
Kurallar (rol kökleri, dışlama, serbest platform adları) config/tr_suzgec.json dosyasındadır.
"""
import argparse
import csv
import json
import os
import re
from collections import Counter

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARSAYILAN_KURAL = os.path.join(KOK, "config", "tr_suzgec.json")

IL = re.compile(r"ankara|[iİı]stanbul", re.I)
GENEL = re.compile(r"^\s*(Türkiye|TÜRKİYE|Turkey)(\s+(Geneli|GENELİ))?\s*$", re.I)
# Kariyer Kapısı satırları ilan metnindeki bölüm şartıyla (iktisat, istatistik…) eşleşti; kamu
# ilan başlığında rol adı geçmez. Bu portalda rol kökü aranmaz.
METINDEN_ESLESEN = {"Kariyer Kapısı"}
# Kariyer Kapısı kontenjan yeri "BAKANLIK MERKEZ TEŞKİLATI" ya da "MERKEZ / MERKEZ" (il adı yok):
# kurumun merkez teşkilatı. Çıkarım: merkez teşkilatı Ankara'dadır (istisna olabilir) → ayrı sınıf.
# "RİZE / MERKEZ" gibi il adıyla başlayan parça eşleşmez.
MERKEZ = re.compile(r"(^|,)\s*((BAKANLIK\s+)?MERKEZ\s+TEŞKİLATI|MERKEZ\s*/)")


def kural_oku(yol):
    k = json.load(open(yol, encoding="utf-8"))
    birlestir = lambda liste: re.compile("|".join(liste), re.I)
    return birlestir(k["rol_kokleri"]), birlestir(k["dislama"]), birlestir(k["serbest_platform"])


def konum_sinifi(r):
    if IL.search(r["konum"]):
        return "Ankara/İstanbul"
    if r["portal"] in METINDEN_ESLESEN and MERKEZ.search(r["konum"]):
        return "Ankara (merkez teşkilatı)"
    if GENEL.match(r["konum"]) or not r["konum"]:
        return "Türkiye geneli/uzaktan"
    return None


def md_hucre(s):
    return (s or "").replace("|", "\\|").replace("\n", " ")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("--kural", default=VARSAYILAN_KURAL)
    a = ap.parse_args(argv)
    rol, dislama, serbest = kural_oku(a.kural)

    rows = list(csv.DictReader(open(os.path.join(a.klasor, "ilanlar.csv"), encoding="utf-8-sig")))
    if not rows:
        raise SystemExit("HATA: ilanlar.csv boş")
    sec, serbest_sec, sayac = [], [], Counter()
    for r in rows:
        if r["portal"] not in METINDEN_ESLESEN and not rol.search(r["baslik"]):
            sayac["rol kökü yok"] += 1
            continue
        if dislama.search(r["baslik"] + " " + r["kurum"]):
            sayac["dışlama"] += 1
            continue
        sinif = konum_sinifi(r)
        if sinif is None:
            sayac["konum dışı"] += 1
            continue
        r["konum_sinifi"] = sinif
        if serbest.search(r["baslik"] + " " + r["kurum"]):
            serbest_sec.append(r)
            continue
        sec.append(r)
    sec.sort(key=lambda r: (r["konum_sinifi"], r["portal"], r["baslik"]))
    alanlar = list(rows[0].keys()) + ["konum_sinifi"]
    for ad, liste in (("ilanlar_ilgili.csv", sec), ("ilanlar_serbest.csv", serbest_sec)):
        with open(os.path.join(a.klasor, ad), "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=alanlar)
            w.writeheader()
            w.writerows(liste)
    with open(os.path.join(a.klasor, "ilanlar_ilgili.md"), "w", encoding="utf-8") as fh:
        fh.write("| Konum sınıfı | Portal | Başlık | Kurum | Konum | Tarih |\n|---|---|---|---|---|---|\n")
        for r in sec:
            fh.write(f"| {r['konum_sinifi']} | {r['portal']} | [{md_hucre(r['baslik'])}]({r['url']}) | "
                     f"{md_hucre(r['kurum'])} | {md_hucre(r['konum'])} | {r['tarih']} |\n")
    print(Counter((r["konum_sinifi"], r["portal"]) for r in sec), flush=True)
    print("elenen:", dict(sayac), "serbest platform:", len(serbest_sec), flush=True)
    print("ilgili", len(sec), "/", len(rows), flush=True)


if __name__ == "__main__":
    main()
