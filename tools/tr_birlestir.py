"""Ham tarama JSON'larını birleştirir: tekrar ayıklama, dönem süzgeci, eşleşen terimleri toplama.
Kullanım: python tools/tr_birlestir.py <tarama_klasoru> <baslangic_tarihi YYYY-AA-GG>
Çıktı: <klasor>/ilanlar.csv, ilanlar.md
"""
import csv, glob, json, os, re, sys
from collections import OrderedDict

OUT, BAS = sys.argv[1], sys.argv[2]
PORTAL = {"knet": "Kariyer.net", "li": "LinkedIn", "kk": "Kariyer Kapısı", "iskur": "İŞKUR"}

ilan = OrderedDict()
for f in sorted(glob.glob(os.path.join(OUT, "ham", "*.json")) + glob.glob(os.path.join(OUT, "ham_k*", "*.json"))):
    ad = os.path.basename(f)[:-5].split("__")
    if ad[0] not in PORTAL:
        continue
    terim, il = ad[1], ad[2]
    try:  # hata veren veya yazılmakta olan sayfa boş kalır
        sonuc = json.load(open(f, encoding="utf-8"))["results"]
    except (json.JSONDecodeError, KeyError):
        print("atlandi (bos/bozuk):", os.path.basename(f), flush=True)
        continue
    for r in sonuc:
        if r.get("promoted"):
            continue
        tarih = r.get("date") or ""
        if ad[0] == "li" and re.match(r"\d{4}-\d{2}-\d{2}", tarih) and tarih < BAS:
            continue
        k = (ad[0], r["id"])
        if k not in ilan:
            ilan[k] = {"portal": PORTAL[ad[0]], "id": r["id"], "baslik": r["title"], "kurum": r.get("company") or "",
                       "konum": r.get("location") or "", "tarih": tarih, "terimler": set(), "il_aramasi": set(),
                       "url": r["url"]}
        ilan[k]["terimler"].add(terim)
        ilan[k]["il_aramasi"].add(il)

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

alanlar = ["portal", "id", "baslik", "kurum", "konum", "tarih", "terimler", "il_aramasi", "url"]
with open(os.path.join(OUT, "ilanlar.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=alanlar)
    w.writeheader()
    w.writerows(rows)

with open(os.path.join(OUT, "ilanlar.md"), "w", encoding="utf-8") as fh:
    for p in PORTAL.values():
        sec = [r for r in rows if r["portal"] == p]
        if not sec:
            continue
        fh.write(f"\n## {p} ({len(sec)})\n\n| Başlık | Kurum | Konum | Tarih | Terim |\n|---|---|---|---|---|\n")
        for r in sec:
            fh.write(f"| [{r['baslik']}]({r['url']}) | {r['kurum']} | {r['konum']} | {r['tarih']} | {r['terimler']} |\n")

for p in PORTAL.values():
    print(p, sum(r["portal"] == p for r in rows), flush=True)
print("toplam", len(rows), flush=True)
