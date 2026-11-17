"""Taranmış Resmî Gazete PDF'lerini indirir ve Tesseract (tur) ile okur.

Kullanım: python tools/tr_rg_ocr.py <tarama_klasoru> <id> [<id> ...] [--tesseract <yol>]
Çıktı: <klasor>/ham/rg_ocr/<id>.pdf, <id>_s<n>.png, <id>.txt
Tesseract yolu sırası: --tesseract → TESSERACT ortam değişkeni → PATH (tesseract) → Windows varsayılan kurulum yolu.
'tur' dil verisi gerekir. Site yanıt vermezse dakikada bir yoklar (en fazla BEKLE_TUR tur).
Argümanlar ve Tesseract, ağa çıkmadan önce denetlenir.
Çıkış kodu: 0 tamam | 2 kullanım/ön koşul | 3 en az bir sayfa okunamadı | 5 site açılmadı.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

DPI, BEKLE_SN, BEKLE_TUR = 300, 60, 90
UA = "Mozilla/5.0 (compatible; resmigazete-ocr/1.0)"  # resmigazete-cli ile aynı açık tanıtım
WINDOWS_VARSAYILAN = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
ID = re.compile(r"^\d{8}-\d+-\d+$")  # ör. 20261109-4-8


def tesseract_bul(arg):
    """Açıkça verilen yol (--tesseract ya da TESSERACT) geçersizse None: başka yola geçilmez."""
    acik = arg or os.environ.get("TESSERACT")
    if acik:
        return acik if os.path.isfile(acik) else None
    for aday in (shutil.which("tesseract"), WINDOWS_VARSAYILAN):
        if aday and os.path.isfile(aday):
            return aday
    return None


def url(i):
    return f"https://www.resmigazete.gov.tr/ilanlar/eskiilanlar/{i[:4]}/{i[4:6]}/{i}.pdf"


def indir(i, d):
    yol = os.path.join(d, i + ".pdf")
    if os.path.exists(yol) and open(yol, "rb").read(5) == b"%PDF-":
        return yol
    req = urllib.request.Request(url(i), headers={"User-Agent": UA})
    veri = urllib.request.urlopen(req, timeout=60).read()
    if veri[:5] != b"%PDF-":  # içerik kapısı
        raise ValueError(f"{i}: PDF imzası yok ({veri[:20]!r})")
    open(yol + ".part", "wb").write(veri)
    os.replace(yol + ".part", yol)
    return yol


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("idler", nargs="+", metavar="id")
    ap.add_argument("--tesseract")
    a = ap.parse_args(argv)

    kotu = [i for i in a.idler if not ID.match(i)]
    if kotu:
        print(f"HATA: ilan kimliği YYYYAAGG-<sayfa>-<sıra> biçiminde olmalı: {kotu}", file=sys.stderr, flush=True)
        return 2
    tess = tesseract_bul(a.tesseract)
    if not tess:
        print("ON KOSUL: Tesseract bulunamadı (--tesseract, TESSERACT ya da PATH).", file=sys.stderr, flush=True)
        return 2
    dil = subprocess.run([tess, "--list-langs"], capture_output=True, text=True, encoding="utf-8")
    if "tur" not in dil.stdout.split():
        print(f"ON KOSUL: Tesseract 'tur' dil verisi yok ({tess} --list-langs).", file=sys.stderr, flush=True)
        return 2
    import fitz  # PyMuPDF; ön koşullardan sonra yüklenir

    d = os.path.join(a.klasor, "ham", "rg_ocr")
    os.makedirs(d, exist_ok=True)
    for _ in range(BEKLE_TUR):
        try:
            urllib.request.urlopen(urllib.request.Request("https://www.resmigazete.gov.tr/", headers={"User-Agent": UA}), timeout=20)
            print(time.strftime("%H:%M:%S"), "site açık", flush=True)
            break
        except Exception as e:
            print(time.strftime("%H:%M:%S"), "site kapalı", type(e).__name__, flush=True)
            time.sleep(BEKLE_SN)
    else:
        print("HATA: site açılmadı", file=sys.stderr, flush=True)
        return 5

    hata = 0
    for i in a.idler:
        pdf = indir(i, d)
        doc = fitz.open(pdf)
        metin = []
        for n, sayfa in enumerate(doc):
            png = os.path.join(d, f"{i}_s{n + 1}.png")
            sayfa.get_pixmap(dpi=DPI).save(png)
            p = subprocess.run([tess, png, "stdout", "-l", "tur", "--psm", "6"], capture_output=True, text=True, encoding="utf-8")
            if p.returncode != 0:
                print(f"HATA {i} sayfa {n + 1}: tesseract {p.returncode} {p.stderr.strip()[:200]}", flush=True)
                hata += 1
            metin.append(p.stdout)
        doc.close()
        txt = os.path.join(d, i + ".txt")
        with open(txt + ".part", "w", encoding="utf-8") as fh:
            fh.write("\n\f\n".join(metin))
        os.replace(txt + ".part", txt)
        print(i, "sayfa", len(metin), "karakter", sum(map(len, metin)), flush=True)
    print("BITTI", flush=True)
    return 3 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
