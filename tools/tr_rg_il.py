"""rg_akademik.json: üniversite -> il eşlemesi (sabit tablo) + Ankara/İstanbul ilanlarında alan satırlarını gösterir.
Kullanım: python tools/tr_rg_il.py <tarama_klasoru>
"""
import json, os, re, sys

OUT = sys.argv[1]
# Taramada görülen Ankara/İstanbul üniversiteleri (ilan veren kurum adının başı)
UNI_IL = {
    "Gazi Üniversitesi": "Ankara", "Ankara Hacı Bayram Veli": "Ankara",
    "Mimar Sinan": "İstanbul", "Boğaziçi": "İstanbul", "İstanbul Beykent": "İstanbul",
    "Haliç": "İstanbul", "İstinye": "İstanbul", "Yeditepe": "İstanbul",
    "İstanbul Üniversitesi": "İstanbul", "Marmara": "İstanbul",
    "Fatih Sultan Mehmet Vakıf": "İstanbul", "Fenerbahçe": "İstanbul",
    "Bahçeşehir": "İstanbul", "Koç Üniversitesi": "İstanbul",
    "Türkiye Uluslararası İslam, Bilim ve Teknoloji": "İstanbul",
}
ALAN = re.compile(r"iktisat|ekonomi|ekonometri|istatistik|veri bilim|veri anali|data scien|finans", re.I)

rows = json.load(open(os.path.join(OUT, "rg_akademik.json"), encoding="utf-8"))
for r in rows:
    r["il"] = next((il for k, il in UNI_IL.items() if r["kurum"].startswith(k)), None)
json.dump(rows, open(os.path.join(OUT, "rg_akademik.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

for r in rows:
    if not r["il"]:
        continue
    d = json.load(open(os.path.join(OUT, "ham", "rg_detay", r["id"] + ".json"), encoding="utf-8"))
    metin = d.get("description") or ""
    print(f"\n##### {r['id']} {r['il']} {r['kurum']} taranmis={r['taranmis']} uzunluk={len(metin)}", flush=True)
    for satir in metin.splitlines():
        if ALAN.search(satir):
            print("   ", re.sub(r"\s+", " ", satir)[:220], flush=True)
