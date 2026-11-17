"""ilanlar.csv -> başlıkta rol kökü geçen ve konumu Ankara/İstanbul (veya yalnız 'Türkiye') olan ilanlar.
Kullanım: python tools/tr_baslik_suzgec.py <klasor>   Çıktı: ilanlar_ilgili.csv, ilanlar_ilgili.md
"""
import csv, os, re, sys
OUT = sys.argv[1]
ROL = re.compile(r"ekonom|econom|iktisat|araştırma|arastirma|research|analist|analyst|analiz|analytic|veri|data|scien|bilimci|istatisti|statisti|ekonometri|econometric", re.I)
IL = re.compile(r"ankara|[iİı]stanbul", re.I)
GENEL = re.compile(r"^\s*(Türkiye|TÜRKİYE|Turkey)(\s+(Geneli|GENELİ))?\s*$", re.I)
# Kariyer Kapısı satırları ilan metnindeki bölüm şartıyla (iktisat, istatistik…) eşleşti; kamu
# ilan başlığında rol adı geçmez. Bu portalda rol kökü aranmaz.
METINDEN_ESLESEN = {"Kariyer Kapısı"}
# Kariyer Kapısı kontenjan yeri "BAKANLIK MERKEZ TEŞKİLATI" ya da "MERKEZ / MERKEZ" (il adı yok):
# kurumun merkez teşkilatı. Çıkarım: merkez teşkilatı Ankara'dadır (istisna olabilir) → ayrı sınıf.
# "RİZE / MERKEZ" gibi il adıyla başlayan parça eşleşmez.
MERKEZ = re.compile(r"(^|,)\s*((BAKANLIK\s+)?MERKEZ\s+TEŞKİLATI|MERKEZ\s*/)")
rows = list(csv.DictReader(open(os.path.join(OUT, "ilanlar.csv"), encoding="utf-8-sig")))
sec = []
for r in rows:
    if r["portal"] not in METINDEN_ESLESEN and not ROL.search(r["baslik"]):
        continue
    if IL.search(r["konum"]):
        r["konum_sinifi"] = "Ankara/İstanbul"
    elif r["portal"] in METINDEN_ESLESEN and MERKEZ.search(r["konum"]):
        r["konum_sinifi"] = "Ankara (merkez teşkilatı)"
    elif GENEL.match(r["konum"]) or not r["konum"]:
        r["konum_sinifi"] = "Türkiye geneli/uzaktan"
    else:
        continue
    sec.append(r)
sec.sort(key=lambda r: (r["konum_sinifi"], r["portal"], r["baslik"]))
with open(os.path.join(OUT, "ilanlar_ilgili.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) + ["konum_sinifi"]); w.writeheader(); w.writerows(sec)
with open(os.path.join(OUT, "ilanlar_ilgili.md"), "w", encoding="utf-8") as fh:
    fh.write("| Konum sınıfı | Portal | Başlık | Kurum | Konum | Tarih |\n|---|---|---|---|---|---|\n")
    for r in sec:
        fh.write(f"| {r['konum_sinifi']} | {r['portal']} | [{r['baslik']}]({r['url']}) | {r['kurum']} | {r['konum']} | {r['tarih']} |\n")
from collections import Counter
print(Counter((r["konum_sinifi"], r["portal"]) for r in sec), flush=True)
print("ilgili", len(sec), "/", len(rows), flush=True)
