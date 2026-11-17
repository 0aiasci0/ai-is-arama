"""rg_akademik.json kayıtlarına il ekler (yalnız Ankara/İstanbul gerekir) ve Ankara/İstanbul ilanlarında alan satırlarını gösterir.

Kullanım: python tools/tr_rg_il.py <tarama_klasoru> [--tablo config/tr_rg_universite_il.json] [--sessiz]
İl sırası: tablo (config) → kurum adı "Ankara"/"İstanbul" ile başlıyorsa o il → ilan metninin tamamında geçen il
(tr_rg_detay.py "iller" alanı; iki il birden geçerse ikisi yazılır). Hiçbiri yoksa il boş kalır.
Her kayda "il_kaynagi" yazılır: tablo | ad | metin | yok.
"""
import argparse
import json
import os
import re

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALAN = re.compile(r"iktisat|ekonomi|ekonometri|istatistik|veri bilim|veri anali|data scien|finans", re.I)
ILLER_DOSYASI = os.path.join(KOK, "config", "tr_iller.txt")


def ad_kaliplari(yol=ILLER_DOSYASI):
    """Kurum adı il adıyla başlıyorsa o il (ör. 'İzmir Demokrasi Üniversitesi'). 81 il config/tr_iller.txt."""
    with open(yol, encoding="utf-8") as fh:
        iller = [s.strip() for s in fh if s.strip() and not s.startswith("#")]
    return {il: re.compile(rf"^{re.escape(il)}(?![a-zçğıöşü])") for il in iller}


AD_IL = ad_kaliplari()


def il_bul(r, tablo):
    kurum = r["kurum"].replace("Istanbul", "İstanbul")
    for anahtar, il in tablo.items():
        if kurum.startswith(anahtar):
            return il, "tablo"
    for il, p in AD_IL.items():
        if p.search(kurum):
            return il, "ad"
    if r.get("iller"):
        return ", ".join(r["iller"]), "metin"
    return None, "yok"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("--tablo", default=os.path.join(KOK, "config", "tr_rg_universite_il.json"))
    ap.add_argument("--sessiz", action="store_true", help="alan satırlarını yazma")
    a = ap.parse_args(argv)
    k = json.load(open(a.tablo, encoding="utf-8"))
    tablo = {**k["tablo"], **k.get("elle_2026_11_17", {})}

    yol = os.path.join(a.klasor, "rg_akademik.json")
    if not os.path.isfile(yol):
        raise SystemExit(f"HATA: {yol} yok; önce tools/tr_rg_detay.py koşun")
    rows = json.load(open(yol, encoding="utf-8"))
    for r in rows:
        r["il"], r["il_kaynagi"] = il_bul(r, tablo)
    with open(yol + ".part", "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=1)
    os.replace(yol + ".part", yol)

    from collections import Counter
    print("il kaynağı:", dict(Counter(r["il_kaynagi"] for r in rows)), "| il dolu:", sum(bool(r["il"]) for r in rows), "/", len(rows), flush=True)
    if a.sessiz:
        return
    for r in rows:
        if not r["il"]:
            continue
        d = json.load(open(os.path.join(a.klasor, "ham", "rg_detay", r["id"] + ".json"), encoding="utf-8"))
        metin = d.get("description") or ""
        print(f"\n##### {r['id']} {r['il']} ({r['il_kaynagi']}) {r['kurum']} taranmis={r['taranmis']} uzunluk={len(metin)}", flush=True)
        for satir in metin.splitlines():
            if ALAN.search(satir):
                print("   ", re.sub(r"\s+", " ", satir)[:220], flush=True)


if __name__ == "__main__":
    main()
