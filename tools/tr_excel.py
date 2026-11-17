"""CV uyum tablosunu Excel'e yazar ve iş bitince dosyayı açar.

Düzen: "Değerlendirilen" (uyum etiketi, renkli) + "Tüm ilanlar" sayfaları.

Kullanım:
  python tools/tr_excel.py <tarama_klasoru> <deger.json> [--kaynak ilanlar_ilgili_yeni.csv]
                           [--cikti dosya.xlsx] [--acma]

Girdiler (tarama klasöründe):
  --kaynak    iş portalı ilanları CSV'si. Varsayılan: ilanlar_ilgili.csv (tr_baslik_suzgec.py çıktısı).
              Yalnız yeni ilanlar için süzülmüş bir CSV (ör. ilanlar_ilgili_yeni.csv) de verilebilir.
  rg_akademik.json   Resmî Gazete akademik ilanları (varsa okunur)
  detay/knet_*.txt   Kariyer.net son başvuru tarihi (varsa okunur)
deger.json: {"<portal>|<id>": ["Güçlü|Orta|Zayıf|Elendi", "şart özeti", "yorum"], "_not": "..."}
Çıktı varsayılanı: <tarama_klasoru>/cv_uyum_<YYYY-MM-DD>.xlsx. Dosya açık ve kilitliyse saat ekli ad kullanılır.
"""
import argparse
import csv
import datetime as dt
import glob
import json
import os
import re
import subprocess
import sys

import pandas as pd
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

VARSAYILAN_KAYNAK = "ilanlar_ilgili.csv"
RG_DOSYA = "rg_akademik.json"
KNET_DETAY = os.path.join("detay", "knet_*.txt")
SIRA = {"Güçlü": 1, "Orta": 2, "Zayıf": 3, "Elendi": 4}
RENK = {"Güçlü": "C6EFCE", "Orta": "FFEB9C", "Zayıf": "FCE4D6", "Elendi": "F2F2F2"}
SAYFA_DEG, SAYFA_TUM = "Değerlendirilen", "Tüm ilanlar"
SARMA_KOLON = ("Şart özeti", "Yorum")
KOLON_EN_AZ, KOLON_EN_COK = 10, 60


def oku(klasor, kaynak):
    kayit = {}
    yol = os.path.join(klasor, kaynak)
    if not os.path.isfile(yol):
        sys.exit(f"HATA: kaynak CSV yok: {yol}")
    for r in csv.DictReader(open(yol, encoding="utf-8-sig")):
        kayit[(r["portal"], r["id"])] = {"Kaynak": r["portal"], "İlan": r["baslik"], "Kurum": r["kurum"],
                                         "Yer": r["konum"], "Yayın": r["tarih"], "Konum sınıfı": r["konum_sinifi"],
                                         "Bağlantı": r["url"], "ID": r["id"]}
    n_portal = len(kayit)
    rg = os.path.join(klasor, RG_DOSYA)
    if os.path.isfile(rg):
        for r in json.load(open(rg, encoding="utf-8")):
            kayit[("Resmî Gazete", r["id"])] = {"Kaynak": "Resmî Gazete", "İlan": r["baslik"], "Kurum": r["kurum"],
                                                "Yer": r.get("il") or ", ".join(r["iller"]), "Yayın": r["tarih"],
                                                "Konum sınıfı": "", "Bağlantı": r["url"], "ID": r["id"]}
    son = {}
    for f in glob.glob(os.path.join(klasor, KNET_DETAY)):
        m = re.search(r"Son başvuru: (\S+)", open(f, encoding="utf-8").read())
        if m:
            son[("Kariyer.net", os.path.basename(f)[5:-4])] = m.group(1)
    print(f"kaynak: {kaynak} ({n_portal} ilan) + {RG_DOSYA} ({len(kayit) - n_portal}) + son başvuru {len(son)}",
          flush=True)
    return kayit, son


def bicimle(ws, df, link_kol):
    for i, kol in enumerate(df.columns, 1):
        uz = max([len(str(kol))] + [len(str(x)) for x in df[kol].head(200)])
        ws.column_dimensions[get_column_letter(i)].width = min(max(uz + 2, KOLON_EN_AZ), KOLON_EN_COK)
        ws.cell(1, i).font = Font(bold=True)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    li = list(df.columns).index(link_kol) + 1
    for r in range(2, len(df) + 2):
        c = ws.cell(r, li)
        if c.value:
            c.hyperlink = c.value
            c.font = Font(color="0563C1", underline="single")


def tablolar(kayit, son, deger):
    eksik = [k for k in deger if k not in kayit]
    if eksik:
        sys.exit(f"HATA: değerlendirilen ilan kaynakta yok: {eksik}")
    bilinmeyen = {v[0] for v in deger.values()} - set(SIRA)
    if bilinmeyen:
        sys.exit(f"HATA: tanımsız uyum etiketi: {bilinmeyen}")
    deg = []
    for k, (uyum, sart, yorum) in deger.items():
        r = kayit[k]
        deg.append({"Uyum": uyum, "İlan": r["İlan"], "Kurum": r["Kurum"], "Yer": r["Yer"], "Kaynak": r["Kaynak"],
                    "Son başvuru": son.get(k, ""), "Şart özeti": sart, "Yorum": yorum,
                    "Bağlantı": r["Bağlantı"], "ID": r["ID"]})
    df_deg = pd.DataFrame(deg).sort_values("Uyum", key=lambda s: s.map(SIRA), kind="stable")
    tum = [dict(Değerlendirme=deger.get(k, ("",))[0], **v) for k, v in kayit.items() if k[0] != "Resmî Gazete"]
    df_tum = pd.DataFrame(tum).sort_values(["Kaynak", "İlan"])
    return df_deg, df_tum


def yaz(df_deg, df_tum, cikti):
    with pd.ExcelWriter(cikti, engine="openpyxl") as xw:
        df_deg.to_excel(xw, sheet_name=SAYFA_DEG, index=False)
        df_tum.to_excel(xw, sheet_name=SAYFA_TUM, index=False)
        ws = xw.sheets[SAYFA_DEG]
        bicimle(ws, df_deg, "Bağlantı")
        sarma = [list(df_deg.columns).index(k) + 1 for k in SARMA_KOLON]
        for r in range(2, len(df_deg) + 2):
            ws.cell(r, 1).fill = PatternFill("solid", fgColor=RENK[ws.cell(r, 1).value])
            for c in sarma:
                ws.cell(r, c).alignment = Alignment(wrap_text=True, vertical="top")
        bicimle(xw.sheets[SAYFA_TUM], df_tum, "Bağlantı")


def kilitli_mi(yol):
    """Dosya başka programda (Excel) açıksa True."""
    if not os.path.exists(yol):
        return False
    kilit = os.path.join(os.path.dirname(yol) or ".", "~$" + os.path.basename(yol))
    if os.path.exists(kilit):
        return True
    try:
        with open(yol, "r+b"):
            return False
    except PermissionError:
        return True


def ac(yol):
    if sys.platform == "win32":
        os.startfile(yol)  # noqa: S606 - kullanıcının kendi çıktısı
    elif sys.platform == "darwin":
        subprocess.Popen(["open", yol])
    else:
        subprocess.Popen(["xdg-open", yol])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("deger")
    ap.add_argument("--kaynak", default=VARSAYILAN_KAYNAK)
    ap.add_argument("--cikti")
    ap.add_argument("--acma", action="store_true", help="bitince dosyayı açma")
    a = ap.parse_args(argv)

    kayit, son = oku(a.klasor, a.kaynak)
    deger = {tuple(k.split("|", 1)): v for k, v in json.load(open(a.deger, encoding="utf-8")).items()
             if not k.startswith("_")}
    df_deg, df_tum = tablolar(kayit, son, deger)

    cikti = a.cikti or os.path.join(a.klasor, f"cv_uyum_{dt.date.today().isoformat()}.xlsx")
    if kilitli_mi(cikti):
        kok, uz = os.path.splitext(cikti)
        yeni = f"{kok}_{dt.datetime.now():%H%M%S}{uz}"
        print(f"UYARI: {cikti} açık ve kilitli; çıktı {yeni} adıyla yazılıyor", flush=True)
        cikti = yeni
    yaz(df_deg, df_tum, cikti)
    print("değerlendirilen", len(df_deg), "tüm", len(df_tum), "->", cikti, flush=True)
    print(df_deg["Uyum"].value_counts().to_dict(), flush=True)
    if not a.acma:
        ac(os.path.abspath(cikti))
        print("açıldı (istek gönderildi):", os.path.abspath(cikti), flush=True)
    return cikti


if __name__ == "__main__":
    main()
