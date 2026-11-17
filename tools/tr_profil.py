"""Kişi profili: bir CV'ye göre meslekler, arama terimleri, iller ve süzgeç kökleri (profiller/<kişi>/, depoya girmez).

Kullanım:
  python tools/tr_profil.py yeni <kişi> <cv.pdf|cv.docx>   klasörü kurar, CV metnini cv.md'ye yazar, boş şablonları açar
  python tools/tr_profil.py onayla <kişi>                    dosyaları denetler, ONAYLANDI işaretini yazar
  python tools/tr_profil.py durum <kişi>                     dosyaları ve onay durumunu gösterir

Akış (/tr-cv): yeni → Claude cv.md'yi okuyup meslekler/terimler/kökler önerir ve dosyalara yazar →
kullanıcı onaylar → onayla → tarama (PROFIL=profiller/<kişi> bash tools/tr_tarama.sh taramalar/<kişi>/<tarih> …).
Dosyalar (satır başına bir öğe; # ve boş satır okunmaz):
  meslekler.txt     CV'den çıkan meslek/rol aileleri (insan için özet)
  terimler.txt      Kariyer.net, LinkedIn, İŞKUR, Vacancies in Turkey arama terimleri
  kk_terimler.txt   Kariyer Kapısı tam metin terimleri (ilan metnindeki bölüm/alan şartı: "iktisat", "sosyoloji"…)
  iller.txt         aranacak iller (ör. Ankara, İstanbul)
  rol_kokleri.txt   başlık süzgecinin rol kökleri (düzenli ifade, büyük/küçük harfe duyarsız)
Bir değişiklikten sonra yeniden `onayla` gerekir (dosyalar onaydan yeniyse tarama durur).
"""
import argparse
import datetime as dt
import os
import re
import subprocess
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILLER = os.environ.get("TR_PROFILLER") or os.path.join(KOK, "profiller")  # sınamada geçici klasör
DOSYALAR = {
    "meslekler.txt": "# CV'den çıkan meslek/rol aileleri, satır başına bir tane (insan için özet)\n",
    "terimler.txt": "# Portal arama terimleri (Kariyer.net, LinkedIn, İŞKUR, Vacancies in Turkey), satır başına bir terim.\n"
                    "# Türkçe ve İngilizce karşılıkları birlikte yazın. Her terim il başına bir sorgu ekler.\n",
    "kk_terimler.txt": "# Kariyer Kapısı tam metin terimleri: kamu ilanındaki bölüm/alan şartı (ör. iktisat, sosyoloji, istatistik)\n",
    "iller.txt": "# Aranacak iller (kullanıcı seçer), satır başına bir il; il adları config/tr_iller.txt ile aynı yazılır.\n"
                 "# 'Türkiye geneli' ve uzaktan ilanlar il seçiminden bağımsız olarak listede kalır.\n",
    "rol_kokleri.txt": "# Başlık süzgeci rol kökleri (düzenli ifade, büyük/küçük harfe duyarsız), satır başına bir kök\n",
}
ZORUNLU = ("terimler.txt", "kk_terimler.txt", "iller.txt", "rol_kokleri.txt")
ONAY = "ONAYLANDI"
KISI = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")


def satirlar(yol):
    with open(yol, encoding="utf-8") as fh:
        return [s.strip() for s in fh if s.strip() and not s.lstrip().startswith("#")]


def klasor(kisi):
    if not KISI.match(kisi):
        raise SystemExit(f"HATA: kişi adı küçük harf, rakam, - ve _ olmalı (ör. ayse_yilmaz), gelen: {kisi}")
    return os.path.join(PROFILLER, kisi)


def yeni(kisi, cv):
    d = klasor(kisi)
    if not os.path.isfile(cv):
        raise SystemExit(f"HATA: CV yok: {cv}")
    os.makedirs(d, exist_ok=True)
    k = subprocess.run([sys.executable, os.path.join(KOK, "tools", "cv_oku.py"), cv, "-o", os.path.join(d, "cv.md")],
                       capture_output=True, text=True, encoding="utf-8")
    if k.returncode == 2:
        print("UYARI: CV'den metin çıkmadı (taranmış PDF?); .docx ya da metinli PDF isteyin.", flush=True)
    elif k.returncode != 0:
        raise SystemExit(f"HATA: cv_oku: {k.stderr.strip()}")
    with open(os.path.join(d, "kaynak.txt"), "w", encoding="utf-8") as fh:
        fh.write(f"cv: {os.path.abspath(cv)}\nkuruldu: {dt.datetime.now():%Y-%m-%d %H:%M}\n")
    for ad, sablon in DOSYALAR.items():
        yol = os.path.join(d, ad)
        if not os.path.exists(yol):
            with open(yol, "w", encoding="utf-8") as fh:
                fh.write(sablon)
    onay = os.path.join(d, ONAY)
    if os.path.exists(onay):
        os.replace(onay, onay + ".eski")  # yeni CV → onay geçersiz
    print(f"profil: {d}\ncv metni: {os.path.join(d, 'cv.md')}\nsonraki adım: meslekler/terimler/kökleri doldurun, "
          f"sonra `python tools/tr_profil.py onayla {kisi}`", flush=True)


def denetle(d):
    sorun, sayi = [], {}
    for ad in ZORUNLU:
        yol = os.path.join(d, ad)
        if not os.path.isfile(yol):
            sorun.append(f"{ad} yok")
            continue
        s = satirlar(yol)
        sayi[ad] = len(s)
        if not s:
            sorun.append(f"{ad} boş")
        if ad == "iller.txt":
            gecerli = set(satirlar(os.path.join(KOK, "config", "tr_iller.txt")))
            bilinmeyen = [il for il in s if il not in gecerli]
            if bilinmeyen:
                sorun.append(f"iller.txt bilinmeyen il (config/tr_iller.txt ile aynı yazın): {bilinmeyen}")
        if ad == "rol_kokleri.txt":
            for kok in s:
                try:
                    re.compile(kok, re.I)
                except re.error as e:
                    sorun.append(f"rol_kokleri.txt geçersiz düzenli ifade: {kok!r} ({e})")
    return sorun, sayi


def onayla(kisi):
    d = klasor(kisi)
    if not os.path.isdir(d):
        raise SystemExit(f"HATA: profil yok: {d} (önce `yeni`)")
    sorun, sayi = denetle(d)
    if sorun:
        raise SystemExit("HATA: profil onaylanamadı:\n  " + "\n  ".join(sorun))
    with open(os.path.join(d, ONAY), "w", encoding="utf-8") as fh:
        fh.write(f"onay: {dt.datetime.now():%Y-%m-%d %H:%M}\n" + "".join(f"{k}: {v}\n" for k, v in sayi.items()))
    print(f"onaylandı: {d} {sayi}", flush=True)


def onay_gecerli(d):
    """ONAYLANDI var ve zorunlu dosyaların hiçbiri ondan yeni değil."""
    onay = os.path.join(d, ONAY)
    if not os.path.isfile(onay):
        return False, "ONAYLANDI yok"
    t = os.path.getmtime(onay)
    yeni_dosya = [ad for ad in ZORUNLU if os.path.isfile(os.path.join(d, ad)) and os.path.getmtime(os.path.join(d, ad)) > t]
    return (not yeni_dosya), (f"onaydan sonra değişti: {yeni_dosya}" if yeni_dosya else "geçerli")


def durum(kisi):
    d = klasor(kisi)
    sorun, sayi = denetle(d)
    gecerli, neden = onay_gecerli(d)
    print(f"profil: {d}\ndosyalar: {sayi}\nsorun: {sorun or 'yok'}\nonay: {neden}", flush=True)
    return 0 if gecerli and not sorun else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    alt = ap.add_subparsers(dest="komut", required=True)
    y = alt.add_parser("yeni")
    y.add_argument("kisi")
    y.add_argument("cv")
    alt.add_parser("onayla").add_argument("kisi")
    alt.add_parser("durum").add_argument("kisi")
    a = ap.parse_args(argv)
    if a.komut == "yeni":
        yeni(a.kisi, a.cv)
    elif a.komut == "onayla":
        onayla(a.kisi)
    else:
        return durum(a.kisi)
    return 0


if __name__ == "__main__":
    sys.exit(main())
