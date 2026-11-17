"""ilanlar.csv -> başlıkta rol kökü geçen ve konumu aranan illerde (varsayılan Ankara/İstanbul; ya da yalnız 'Türkiye') olan ilanlar.
Kullanım: python tools/tr_baslik_suzgec.py <klasor> [--profil profiller/<kişi>] [--kural config/tr_suzgec.json]
Çıktı: ilanlar_ilgili.csv, ilanlar_ilgili.md; serbest iş platformu ilanları ilanlar_serbest.csv
Dışlama ve serbest platform kuralları config/tr_suzgec.json dosyasındadır; rol kökleri ve iller --profil verilirse
profilden (rol_kokleri.txt, iller.txt), verilmezse config'ten (ekonomi/araştırma/veri örnek profili).
"""
import argparse
import csv
import json
import os
import re
from collections import Counter

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARSAYILAN_KURAL = os.path.join(KOK, "config", "tr_suzgec.json")

GENEL = re.compile(r"^\s*(Türkiye|TÜRKİYE|Turkey)(\s+(Geneli|GENELİ))?\s*$", re.I)
# Kariyer Kapısı satırları ilan metnindeki bölüm şartıyla (iktisat, istatistik…) eşleşti; kamu
# ilan başlığında rol adı geçmez. Bu portalda rol kökü aranmaz.
METINDEN_ESLESEN = {"Kariyer Kapısı"}
# Kariyer Kapısı kontenjan yeri "BAKANLIK MERKEZ TEŞKİLATI" ya da "MERKEZ / MERKEZ" (il adı yok):
# kurumun merkez teşkilatı. Çıkarım: merkez teşkilatı Ankara'dadır (istisna olabilir) → ayrı sınıf.
# "RİZE / MERKEZ" gibi il adıyla başlayan parça eşleşmez.
MERKEZ = re.compile(r"(^|,)\s*((BAKANLIK\s+)?MERKEZ\s+TEŞKİLATI|MERKEZ\s*/)")


def satirlar(yol):
    with open(yol, encoding="utf-8") as fh:
        return [s.strip() for s in fh if s.strip() and not s.lstrip().startswith("#")]


def kural_oku(yol, profil=None):
    """Kurallar config'ten; profil verilirse rol kökleri profilin rol_kokleri.txt dosyasından."""
    with open(yol, encoding="utf-8") as fh:
        k = json.load(fh)
    birlestir = lambda liste: re.compile("|".join(liste), re.I)
    kokler = satirlar(os.path.join(profil, "rol_kokleri.txt")) if profil else k["rol_kokleri"]
    if not kokler:
        raise SystemExit("HATA: rol kökü listesi boş")
    return birlestir(kokler), birlestir(k["dislama"]), birlestir(k["serbest_platform"])


def fold(s):
    return (s or "").replace("İ", "i").replace("I", "ı").lower().translate(str.maketrans("ıışğüöç", "iisguoc"))


def il_eslestirici(iller):
    """İl listesinden (ör. ['Ankara', 'İstanbul']) harf katlamalı eşleştirici ve sınıf adı."""
    kaliplar = [re.compile(rf"(^|[^a-z]){re.escape(fold(il))}([^a-z]|$)") for il in iller]
    ad = "/".join(iller)
    return (lambda konum: any(k.search(fold(konum)) for k in kaliplar)), ad


VARSAYILAN_ILLER = ["Ankara", "İstanbul"]
IL_ESLES, IL_SINIF = il_eslestirici(VARSAYILAN_ILLER)
MERKEZ_ANKARA = True  # merkez teşkilatı sınıfı yalnız il listesinde Ankara varsa


def konum_sinifi(r):
    if IL_ESLES(r["konum"]):
        return IL_SINIF
    if MERKEZ_ANKARA and r["portal"] in METINDEN_ESLESEN and MERKEZ.search(r["konum"]):
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
    ap.add_argument("--profil", help="profiller/<kişi>: rol_kokleri.txt ve iller.txt buradan okunur")
    a = ap.parse_args(argv)
    rol, dislama, serbest = kural_oku(a.kural, a.profil)
    if a.profil:
        global IL_ESLES, IL_SINIF, MERKEZ_ANKARA
        iller = satirlar(os.path.join(a.profil, "iller.txt"))
        if not iller:
            raise SystemExit("HATA: profilin iller.txt dosyası boş")
        IL_ESLES, IL_SINIF = il_eslestirici(iller)
        MERKEZ_ANKARA = any(fold(i) == "ankara" for i in iller)

    with open(os.path.join(a.klasor, "ilanlar.csv"), encoding="utf-8-sig") as fh:
        okuyucu = csv.DictReader(fh)
        rows = list(okuyucu)
        basliklar = okuyucu.fieldnames
    if not basliklar:
        raise SystemExit("HATA: ilanlar.csv başlık satırı yok (tr_birlestir.py koştu mu?)")
    sec, serbest_sec, sayac = [], [], Counter()
    for r in rows:
        if r["portal"] not in METINDEN_ESLESEN and not rol.search(r["baslik"]):
            sayac["rol kökü yok"] += 1
            continue
        # Dışlama yalnız başlıkta: kurum adı ("Mérieux NutriSciences") ilgili bir ilanı düşürüyordu (2026-11-02 örneklem dışı sınama)
        if dislama.search(r["baslik"]):
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
    alanlar = list(basliklar) + ["konum_sinifi"]
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
