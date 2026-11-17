"""Listedeki ilanların tam metnini çeker -> <tarama_klasoru>/detay/<kod>_<id>.txt (CV uyum değerlendirmesi için).

Kullanım:
  python tools/tr_detay_cek.py <tarama_klasoru> [--liste ilanlar_degerlendirilecek.csv]

Ortam: KURU=1 ağ isteği yok (plan yazılır); BUN=<yol> bun yerine program (sınama).
Var olan boş olmayan dosya atlanır (yeniden koşu güvenli). Kariyer.net 403 (BLOCKED) gelirse o portal durur.
Çıkış kodu: 0 tamam | 3 en az bir hata | 4 BLOCKED | 6 bun çalıştırılamadı. Sonda portal başına özet satırı yazılır.
"""
import argparse
import csv
import os
import shlex
import subprocess
import sys
import time
from collections import Counter

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(".agents", "skills")
# portal -> (dosya kodu, CLI, istekler arası bekleme sn)
PORTAL = {
    "LinkedIn": ("li", "linkedin-search", 3),
    "Kariyer.net": ("knet", "kariyernet-search", 20),
    "Kariyer Kapısı": ("kk", "kariyerkapisi-search", 1),
    "İŞKUR": ("iskur", "iskur-search", 2),
    "Vacancies in Turkey": ("vit", "vacanciesinturkey-search", 2),
}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor")
    ap.add_argument("--liste", default="ilanlar_degerlendirilecek.csv")
    a = ap.parse_args(argv)
    kuru = os.environ.get("KURU") == "1"
    # BUN bir komut dizesi olabilir (ör. "C:/Python314/python.exe sahte_bun.py"); yolda / kullanın.
    bun = shlex.split(os.environ.get("BUN", "bun"))

    yol = os.path.join(a.klasor, a.liste)
    if not os.path.isfile(yol):
        raise SystemExit(f"HATA: liste yok: {yol}")
    rows = list(csv.DictReader(open(yol, encoding="utf-8-sig")))
    hedef = os.path.join(a.klasor, "detay")
    os.makedirs(hedef, exist_ok=True)

    say = Counter()
    bloklu = set()
    son_istek = {}
    for r in rows:
        p = r["portal"]
        if p not in PORTAL:
            say[(p, "desteklenmiyor")] += 1
            continue
        kod, cli, bekle = PORTAL[p]
        f = os.path.join(hedef, f"{kod}_{r['id']}.txt")
        if os.path.isfile(f) and os.path.getsize(f) > 0:
            say[(p, "var")] += 1
            continue
        if p in bloklu:
            say[(p, "atlandi")] += 1
            continue
        if kuru:
            print(f"KURU {p} {r['id']}", flush=True)
            say[(p, "kuru")] += 1
            continue
        gecen = time.time() - son_istek.get(p, 0)
        if gecen < bekle:
            time.sleep(bekle - gecen)
        son_istek[p] = time.time()
        try:
            k = subprocess.run(bun + ["run", os.path.join(S, cli, "cli", "src", "cli.ts"), "detail", r["id"], "--format", "plain"],
                               cwd=KOK, capture_output=True, text=True, encoding="utf-8")
        except OSError as e:
            print(f"ON KOSUL: '{' '.join(bun)}' çalıştırılamadı ({e}); bun kurulu mu, PATH doğru mu?", flush=True)
            return 6
        if k.returncode == 0 and k.stdout.strip():
            with open(f + ".part", "w", encoding="utf-8") as fh:
                fh.write(k.stdout)
            os.replace(f + ".part", f)
            say[(p, "ok")] += 1
            print(f"OK {p} {r['id']} {len(k.stdout)}", flush=True)
        else:
            hata = (k.stderr or "").strip()
            print(f"HATA {p} {r['id']} {hata[:200]}", flush=True)
            if "BLOCKED" in hata:  # tam metinde ara: Kariyer.net mesajında kod 200. karakterden sonra gelir
                bloklu.add(p)
                say[(p, "blocked")] += 1
            else:
                say[(p, "hata")] += 1

    for p in sorted({p for p, _ in say}):
        print(f"PORTAL {p} " + " ".join(f"{d}={n}" for (q, d), n in sorted(say.items()) if q == p), flush=True)
    if bloklu:
        return 4
    return 3 if any(d == "hata" for (_, d) in say) else 0


if __name__ == "__main__":
    sys.exit(main())
