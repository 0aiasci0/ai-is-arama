"""Ham tarama JSON'larını birleştirir: tekrar ayıklama, dönem süzgeci, eşleşen terimleri toplama.

Kullanım: python tools/tr_birlestir.py <tarama_klasoru> <baslangic_tarihi YYYY-AA-GG> [--xlsx-yok]
Çıktı: <klasor>/ilanlar.csv (makine için, virgül ayraçlı), ilanlar.xlsx (insan için; id metin olarak),
       ilanlar.md
Sütunlar: portal, id, baslik, kurum, konum, tarih (ISO; yoksa portalın verdiği), yas (Kariyer.net göreli yaş),
          son_basvuru (Kariyer Kapısı, İŞKUR), terimler, il_aramasi, url
Dönem süzgeci: ISO tarihi başlangıçtan eski olan LinkedIn ve Kariyer.net ilanları atılır.
"""
import argparse
import csv
import datetime as dt
import glob
import json
import os
import re
import sys
from collections import OrderedDict

PORTAL = {"knet": "Kariyer.net", "li": "LinkedIn", "kk": "Kariyer Kapısı", "iskur": "İŞKUR"}
DONEM_SUZULEN = {"li", "knet"}
ALANLAR = ["portal", "id", "baslik", "kurum", "konum", "tarih", "yas", "son_basvuru", "terimler", "il_aramasi", "url"]
GORELI = re.compile(r"^\s*(\d+)\s*(gün|saat|dakika|hafta|ay)\b", re.I)
GUN = {"gün": 1, "saat": 0, "dakika": 0, "hafta": 7, "ay": 30}


def iso_tarih(deger, tarama_gunu):
    """Kariyer.net göreli yaşı ('6 gün') tarama gününe göre ISO tarihe çevirir. Çevrilemezse None."""
    m = GORELI.match(deger or "")
    if not m:
        return None
    return (tarama_gunu - dt.timedelta(days=int(m.group(1)) * GUN[m.group(2).lower()])).isoformat()


def md_hucre(s):
    return (s or "").replace("|", "\\|").replace("\n", " ")


def atomik_yaz(yol, yazici):
    with open(yol + ".part", "w", encoding="utf-8-sig" if yol.endswith(".csv") else "utf-8", newline="") as fh:
        yazici(fh)
    os.replace(yol + ".part", yol)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("baslangic", help="YYYY-AA-GG")
    ap.add_argument("--xlsx-yok", action="store_true", help="ilanlar.xlsx yazma")
    a = ap.parse_args(argv)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.baslangic):
        sys.exit(f"HATA: başlangıç tarihi YYYY-AA-GG olmalı, gelen: {a.baslangic}")
    OUT, BAS = a.klasor, a.baslangic

    ilan = OrderedDict()
    atlanan = 0
    for f in sorted(glob.glob(os.path.join(OUT, "ham", "*.json")) + glob.glob(os.path.join(OUT, "ham_k*", "*.json"))):
        ad = os.path.basename(f)[:-5].split("__")
        if ad[0] not in PORTAL:
            continue
        terim, il = ad[1], ad[2]
        try:  # hata veren veya yazılmakta olan sayfa boş kalır
            sonuc = json.load(open(f, encoding="utf-8"))["results"]
        except (json.JSONDecodeError, KeyError):
            atlanan += 1
            continue
        tarama_gunu = dt.date.fromtimestamp(os.path.getmtime(f))
        for r in sonuc:
            if r.get("promoted"):
                continue
            ham_tarih = r.get("date") or ""
            yas = ""
            tarih = ham_tarih
            if ad[0] == "knet":
                yas, tarih = ham_tarih, (iso_tarih(ham_tarih, tarama_gunu) or ham_tarih)
            if ad[0] in DONEM_SUZULEN and re.match(r"\d{4}-\d{2}-\d{2}", tarih) and tarih[:10] < BAS:
                continue
            k = (ad[0], r["id"])
            if k not in ilan:
                ilan[k] = {"portal": PORTAL[ad[0]], "id": r["id"], "baslik": r["title"], "kurum": r.get("company") or "",
                           "konum": r.get("location") or "", "tarih": tarih, "yas": yas,
                           "son_basvuru": (r.get("deadline") or "")[:10], "terimler": set(), "il_aramasi": set(),
                           "url": r["url"]}
            ilan[k]["terimler"].add(terim)
            ilan[k]["il_aramasi"].add(il)
    if atlanan:
        print("atlanan dosya (boş/bozuk):", atlanan, flush=True)

    # Kariyer Kapısı: arama satırında il yok; detay dosyası (ham/kkdetay/<guid>.json) alt ilanların
    # kontenjan illerini taşır.
    kk_detay = 0
    for (portal, iid), r in ilan.items():
        if portal != "kk":
            continue
        yol = os.path.join(OUT, "ham", "kkdetay", f"{iid}.json")
        if os.path.isfile(yol):
            try:
                d = json.load(open(yol, encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            r["konum"] = d.get("location") or r["konum"]
            kk_detay += 1
    if any(p == "kk" for p, _ in ilan):
        print("Kariyer Kapısı detaydan il:", kk_detay, "/", sum(p == "kk" for p, _ in ilan), flush=True)

    rows = list(ilan.values())
    for r in rows:
        r["terimler"] = ";".join(sorted(r["terimler"]))
        r["il_aramasi"] = ";".join(sorted(r["il_aramasi"]))

    def csv_yaz(fh):
        w = csv.DictWriter(fh, fieldnames=ALANLAR)
        w.writeheader()
        w.writerows(rows)
    atomik_yaz(os.path.join(OUT, "ilanlar.csv"), csv_yaz)

    def md_yaz(fh):
        for p in PORTAL.values():
            sec = [r for r in rows if r["portal"] == p]
            if not sec:
                continue
            fh.write(f"\n## {p} ({len(sec)})\n\n| Başlık | Kurum | Konum | Tarih | Son başvuru | Terim |\n|---|---|---|---|---|---|\n")
            for r in sec:
                fh.write(f"| [{md_hucre(r['baslik'])}]({r['url']}) | {md_hucre(r['kurum'])} | {md_hucre(r['konum'])} | "
                         f"{r['tarih']} | {r['son_basvuru']} | {r['terimler']} |\n")
    atomik_yaz(os.path.join(OUT, "ilanlar.md"), md_yaz)

    if not a.xlsx_yok and rows:
        from openpyxl import Workbook
        from openpyxl.styles import Font
        wb = Workbook()
        ws = wb.active
        ws.title = "İlanlar"
        ws.append(ALANLAR)
        for r in rows:
            ws.append([str(r[k]) for k in ALANLAR])  # id metin: İŞKUR'un baştaki sıfırları korunur
        for c in ws[1]:
            c.font = Font(bold=True)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        yol = os.path.join(OUT, "ilanlar.xlsx")
        wb.save(yol + ".part")
        os.replace(yol + ".part", yol)

    for p in PORTAL.values():
        print(p, sum(r["portal"] == p for r in rows), flush=True)
    print("toplam", len(rows), flush=True)


if __name__ == "__main__":
    main()
