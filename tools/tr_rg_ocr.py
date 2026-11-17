"""Taranmış Resmî Gazete PDF'lerini indirir ve Tesseract (tur) ile okur.
Site yanıt vermezse dakikada bir yoklar (en fazla BEKLE_TUR tur).
Kullanım: python tools/tr_rg_ocr.py <tarama_klasoru> <id> [<id> ...]
"""
import os, subprocess, sys, time, urllib.request
import fitz  # PyMuPDF

OUT, IDS = sys.argv[1], sys.argv[2:]
TESS = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
DPI, BEKLE_SN, BEKLE_TUR = 300, 60, 90
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
D = os.path.join(OUT, "ham", "rg_ocr")
os.makedirs(D, exist_ok=True)


def url(i):
    return f"https://www.resmigazete.gov.tr/ilanlar/eskiilanlar/{i[:4]}/{i[4:6]}/{i}.pdf"


def indir(i):
    yol = os.path.join(D, i + ".pdf")
    if os.path.exists(yol) and open(yol, "rb").read(5) == b"%PDF-":
        return yol
    req = urllib.request.Request(url(i), headers={"User-Agent": UA})
    veri = urllib.request.urlopen(req, timeout=60).read()
    if veri[:5] != b"%PDF-":  # içerik kapısı
        raise ValueError(f"{i}: PDF imzası yok ({veri[:20]!r})")
    open(yol + ".part", "wb").write(veri)
    os.replace(yol + ".part", yol)
    return yol


for tur in range(BEKLE_TUR):
    try:
        urllib.request.urlopen(urllib.request.Request("https://www.resmigazete.gov.tr/", headers={"User-Agent": UA}), timeout=20)
        print(time.strftime("%H:%M:%S"), "site açık", flush=True)
        break
    except Exception as e:
        print(time.strftime("%H:%M:%S"), "site kapalı", type(e).__name__, flush=True)
        time.sleep(BEKLE_SN)
else:
    sys.exit("site açılmadı")

for i in IDS:
    pdf = indir(i)
    doc = fitz.open(pdf)
    metin = []
    for n, sayfa in enumerate(doc):
        png = os.path.join(D, f"{i}_s{n + 1}.png")
        sayfa.get_pixmap(dpi=DPI).save(png)
        p = subprocess.run([TESS, png, "stdout", "-l", "tur", "--psm", "6"], capture_output=True, text=True, encoding="utf-8")
        metin.append(p.stdout)
    doc.close()
    txt = os.path.join(D, i + ".txt")
    open(txt, "w", encoding="utf-8").write("\n\f\n".join(metin))
    print(i, "sayfa", len(metin), "karakter", sum(map(len, metin)), flush=True)
print("BITTI", flush=True)
