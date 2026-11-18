"""Türkiye uyarlaması betiklerinin çevrimdışı sınamaları (tools/tr_*.py, cv_oku.py, tr_tarama.sh).

Ağ: Python alt süreçleri tests/agsiz/sitecustomize.py ile soket açamaz; portal CLI'ları yalnız sahte
programla (BUN=...) ya da KURU=1 ile çağrılır. test_ag_engeli_calisiyor bu engelin kendisini sınar.
Bağımlılık: requirements-tr.txt (pandas, openpyxl, pymupdf, python-docx).
"""
import csv
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(REPO, "tools")
AGSIZ = os.path.join(REPO, "tests", "agsiz")
PY = sys.executable


def modul(ad):
    spec = importlib.util.spec_from_file_location(ad, os.path.join(TOOLS, ad + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def kos(betik, *args, env=None):
    e = dict(os.environ, PYTHONPATH=AGSIZ, PYTHONIOENCODING="utf-8", **(env or {}))
    return subprocess.run([PY, os.path.join(TOOLS, betik), *args], capture_output=True, text=True,
                          encoding="utf-8", env=e, cwd=REPO)


def bash_yolu():
    """Git Bash (Windows) ya da sistem bash'i; Windows'ta System32 bash (WSL) kullanılmaz."""
    for aday in (os.environ.get("GIT_BASH"), r"C:\Program Files\Git\bin\bash.exe"):
        if aday and os.path.isfile(aday):
            return aday
    b = shutil.which("bash")
    if b and not (os.name == "nt" and "system32" in b.lower()):
        return b
    return None


def csv_oku(yol):
    with open(yol, encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def metin_oku(yol):
    with open(yol, encoding="utf-8") as fh:
        return fh.read()


def json_yaz(yol, veri):
    os.makedirs(os.path.dirname(yol), exist_ok=True)
    with open(yol, "w", encoding="utf-8") as fh:
        json.dump(veri, fh, ensure_ascii=False)


def sonuc(*rows):
    return {"meta": {"count": len(rows)}, "results": list(rows)}


class AgEngeli(unittest.TestCase):
    def test_ag_engeli_calisiyor(self):
        """Pozitif kontrol: bilerek ağa çıkan alt süreç engellenmeli."""
        e = dict(os.environ, PYTHONPATH=AGSIZ)
        k = subprocess.run([PY, "-c", "import urllib.request; urllib.request.urlopen('https://example.com', timeout=5)"],
                           capture_output=True, text=True, env=e)
        self.assertNotEqual(k.returncode, 0)
        self.assertIn("AG ENGELI", k.stderr)


class Birlestir(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        ham = os.path.join(self.d, "ham")
        json_yaz(os.path.join(ham, "knet__ekonomist__Ankara__p1.json"), sonuc(
            {"id": "1", "title": "Ekonomist | Araştırma", "company": "A", "location": "Ankara", "date": "4 gün", "url": "u1"}))
        json_yaz(os.path.join(ham, "li__research__Istanbul__p1.json"), sonuc(
            {"id": "2", "title": "Research Analyst", "company": "B", "location": "İstanbul", "date": "2026-11-10", "url": "u2"},
            {"id": "3", "title": "Eski ilan", "company": "C", "location": "İstanbul", "date": "2026-10-01", "url": "u3"}))
        json_yaz(os.path.join(ham, "iskur__ekonomist__Ankara__p1.json"), sonuc(
            {"id": "00009894423", "title": "Uzman", "company": None, "location": "Ankara", "date": None,
             "deadline": "2026-12-02", "url": "u4"}))
        json_yaz(os.path.join(ham, "kk__iktisat__TR__p1.json"), sonuc(
            {"id": "g-1", "title": "KURUM - UZMAN YARDIMCISI", "company": "KURUM", "location": None,
             "date": "2026-11-05", "deadline": "2026-11-30T23:59:59", "url": "u5"}))
        json_yaz(os.path.join(ham, "kkdetay", "g-1.json"), {"location": "ANKARA / ÇANKAYA"})
        tarama = time.mktime((2026, 11, 16, 12, 0, 0, 0, 0, -1))
        os.utime(os.path.join(ham, "knet__ekonomist__Ankara__p1.json"), (tarama, tarama))

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def test_birlestirme(self):
        k = kos("tr_birlestir.py", self.d, "2026-11-02")
        self.assertEqual(k.returncode, 0, k.stderr)
        rows = {r["id"]: r for r in csv_oku(os.path.join(self.d, "ilanlar.csv"))}
        self.assertNotIn("3", rows, "dönem süzgeci: başlangıçtan eski LinkedIn ilanı atılmalı")
        self.assertEqual(rows["1"]["tarih"], "2026-11-12", "Kariyer.net '4 gün' tarama gününe göre ISO olmalı")
        self.assertEqual(rows["1"]["yas"], "4 gün")
        self.assertEqual(rows["00009894423"]["son_basvuru"], "2026-12-02")
        self.assertEqual(rows["g-1"]["konum"], "ANKARA / ÇANKAYA", "KK il detaydan gelmeli")
        self.assertEqual(rows["g-1"]["son_basvuru"], "2026-11-30")
        md = metin_oku(os.path.join(self.d, "ilanlar.md"))
        self.assertIn("Ekonomist \\| Araştırma", md, "md hücresinde | kaçışlanmalı")
        from openpyxl import load_workbook
        ws = load_workbook(os.path.join(self.d, "ilanlar.xlsx"))["İlanlar"]
        ids = [r[1] for r in ws.iter_rows(min_row=2, values_only=True)]
        self.assertIn("00009894423", ids, "xlsx'te id metin kalmalı (baştaki sıfırlar)")

    def test_donemsiz_portal_suzulmez(self):
        # önceki taramada olmayan portal (vit) için eski tarihli açık ilan atılmamalı; li süzgeci sürer
        json_yaz(os.path.join(self.d, "ham", "vit__research__TR__p1.json"), sonuc(
            {"id": "v1", "title": "Research Officer", "company": "UN", "location": "Ankara", "date": "2026-10-01",
             "deadline": "2027-01-22", "url": "u6"}))
        k = kos("tr_birlestir.py", self.d, "2026-11-02", "--donemsiz", "vit", "--xlsx-yok")
        self.assertEqual(k.returncode, 0, k.stderr)
        rows = {r["id"]: r for r in csv_oku(os.path.join(self.d, "ilanlar.csv"))}
        self.assertIn("v1", rows)
        self.assertNotIn("3", rows, "li dönem süzgeci sürmeli")
        k = kos("tr_birlestir.py", self.d, "2026-11-02", "--xlsx-yok")
        self.assertNotIn("v1", {r["id"] for r in csv_oku(os.path.join(self.d, "ilanlar.csv"))})

    def test_hatali_tarih_reddedilir(self):
        k = kos("tr_birlestir.py", self.d, "02.11.2026")
        self.assertNotEqual(k.returncode, 0)
        self.assertFalse(os.path.exists(os.path.join(self.d, "ilanlar.csv")))


ALANLAR = ["portal", "id", "baslik", "kurum", "konum", "tarih", "yas", "son_basvuru", "terimler", "il_aramasi", "url"]


def ilanlar_yaz(d, rows):
    with open(os.path.join(d, "ilanlar.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=ALANLAR)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in ALANLAR})


class Suzgec(unittest.TestCase):
    def test_siniflar(self):
        d = tempfile.mkdtemp()
        try:
            ilanlar_yaz(d, [
                {"portal": "LinkedIn", "id": "1", "baslik": "Policy Analyst", "konum": "Ankara, Türkiye"},
                {"portal": "LinkedIn", "id": "2", "baslik": "Verification Engineer", "konum": "İstanbul"},
                {"portal": "LinkedIn", "id": "3", "baslik": "Clinical Research Associate", "konum": "İstanbul"},
                {"portal": "LinkedIn", "id": "4", "baslik": "Map Data Analyst", "kurum": "Alignerr", "konum": "Türkiye"},
                {"portal": "LinkedIn", "id": "5", "baslik": "Data Analyst", "konum": "İzmir"},
                {"portal": "Kariyer Kapısı", "id": "6", "baslik": "BAKANLIK - PERSONEL ALIMI", "konum": "BAKANLIK MERKEZ TEŞKİLATI"},
                {"portal": "Kariyer Kapısı", "id": "7", "baslik": "AJANS - PERSONEL", "konum": "RİZE / MERKEZ"},
                {"portal": "Kariyer Kapısı", "id": "8", "baslik": "KURUM - ALIM", "konum": "TÜRKİYE GENELİ"},
                {"portal": "LinkedIn", "id": "9", "baslik": "Veri Analisti", "konum": "İstanbul"},
            ])
            k = kos("tr_baslik_suzgec.py", d)
            self.assertEqual(k.returncode, 0, k.stderr)
            ilg = {r["id"]: r["konum_sinifi"] for r in csv_oku(os.path.join(d, "ilanlar_ilgili.csv"))}
            serbest = {r["id"] for r in csv_oku(os.path.join(d, "ilanlar_serbest.csv"))}
            self.assertEqual(ilg, {"1": "Ankara/İstanbul", "6": "Ankara (merkez teşkilatı)",
                                   "8": "Türkiye geneli/uzaktan", "9": "Ankara/İstanbul"})
            self.assertEqual(serbest, {"4"})
        finally:
            shutil.rmtree(d, ignore_errors=True)


class Kuyruk(unittest.TestCase):
    def test_degerlendirilmis_cikar_kisa_kod_birlesir(self):
        d = tempfile.mkdtemp()
        try:
            alan = ALANLAR + ["konum_sinifi"]
            with open(os.path.join(d, "ilanlar_ilgili.csv"), "w", encoding="utf-8-sig", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=alan)
                w.writeheader()
                for p, i in [("LinkedIn", "1"), ("LinkedIn", "2"), ("Kariyer.net", "3")]:
                    w.writerow({k: "" for k in alan} | {"portal": p, "id": i})
            json_yaz(os.path.join(d, "eski.json"), {"_not": "x", "li|1": ["Orta", "", ""]})
            json_yaz(os.path.join(d, "yeni.json"), {"Kariyer.net|3": ["Zayıf", "", ""]})
            k = kos("tr_yeni.py", d, "--degerlendirme", os.path.join(d, "eski.json"), os.path.join(d, "yeni.json"))
            self.assertEqual(k.returncode, 0, k.stderr)
            self.assertEqual([r["id"] for r in csv_oku(os.path.join(d, "ilanlar_degerlendirilecek.csv"))], ["2"])
        finally:
            shutil.rmtree(d, ignore_errors=True)


class Excel(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        ilanlar_yaz(self.d, [
            {"portal": "LinkedIn", "id": "1", "baslik": "Policy Analyst", "konum": "Ankara", "url": "https://x/1"},
            {"portal": "LinkedIn", "id": "2", "baslik": "Gig", "kurum": "Alignerr", "konum": "Türkiye", "url": "https://x/2"},
            {"portal": "İŞKUR", "id": "3", "baslik": "Uzman", "konum": "Ankara", "son_basvuru": "2026-12-02", "url": "https://x/3"},
        ])
        self.assertEqual(kos("tr_baslik_suzgec.py", self.d).returncode, 0)

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def excel(self, deger, cikti="c.xlsx"):
        json_yaz(os.path.join(self.d, "deger.json"), deger)
        return kos("tr_excel.py", self.d, os.path.join(self.d, "deger.json"), "--cikti", os.path.join(self.d, cikti), "--acma")

    def test_dort_oge_son_basvuru_ve_suzgec_disi(self):
        k = self.excel({"LinkedIn|1": ["Güçlü", "ş", "y", ["Power BI"]], "LinkedIn|2": ["Elendi", "ş", "tür: saatlik"],
                        "İŞKUR|3": ["Orta", "ş", "y"]})
        self.assertEqual(k.returncode, 0, k.stderr)
        self.assertIn("ilanlar.csv dosyasından alındı", k.stdout)
        from openpyxl import load_workbook
        ws = load_workbook(os.path.join(self.d, "c.xlsx"))["Değerlendirilen"]
        h = [c.value for c in ws[1]]
        self.assertIn("Zorunlu eksik", h)
        satir = {r[h.index("ID")]: r for r in ws.iter_rows(min_row=2, values_only=True)}
        self.assertEqual(satir["3"][h.index("Son başvuru")], "2026-12-02")
        self.assertEqual(satir["1"][h.index("Zorunlu eksik")], "Power BI")

    def test_guclu_iki_eksik_kapisi(self):
        k = self.excel({"LinkedIn|1": ["Güçlü", "ş", "y", ["Power BI", "SQL"]]})
        self.assertNotEqual(k.returncode, 0)
        self.assertIn("etiket kuralı 5", k.stderr + k.stdout)

    def test_kaynakta_olmayan_ilan(self):
        k = self.excel({"LinkedIn|999": ["Orta", "ş", "y"]})
        self.assertNotEqual(k.returncode, 0)

    def test_kilitli_dosyaya_yazmaz(self):
        hedef = os.path.join(self.d, "c.xlsx")
        open(hedef, "wb").close()
        open(os.path.join(self.d, "~$c.xlsx"), "w").close()  # Excel kilit dosyası
        k = self.excel({"LinkedIn|1": ["Orta", "ş", "y"]})
        self.assertEqual(k.returncode, 0, k.stderr)
        self.assertEqual(os.path.getsize(hedef), 0, "kilitli dosyanın üzerine yazılmamalı")
        self.assertIn("UYARI", k.stdout)


class ResmiGazete(unittest.TestCase):
    def test_son_basvuru(self):
        m = modul("tr_rg_detay")
        self.assertEqual(m.son_basvuru("SON BAŞVURU TARİHİ : 26.11.2026 Ön Değerlendirme"), "2026-11-26")
        self.assertEqual(m.son_basvuru("Son Başvuru Tarihi: 3/12/2026"), "2026-12-03")
        self.assertIsNone(m.son_basvuru("Başvurular 26.11.2026 tarihine kadar"))

    def test_il_bul(self):
        m = modul("tr_rg_il")
        tablo = {"Boğaziçi": "İstanbul"}
        self.assertEqual(m.il_bul({"kurum": "Boğaziçi Üniversitesi Rektörlüğünden", "iller": []}, tablo), ("İstanbul", "tablo"))
        self.assertEqual(m.il_bul({"kurum": "Ankara Müzik ve Güzel Sanatlar Üniversitesi", "iller": []}, tablo), ("Ankara", "ad"))
        self.assertEqual(m.il_bul({"kurum": "Doğuş Üniversitesi", "iller": ["İstanbul"]}, tablo), ("İstanbul", "metin"))
        self.assertEqual(m.il_bul({"kurum": "Atatürk Üniversitesi", "iller": []}, tablo), (None, "yok"))

    def test_ocr_gecersiz_tesseract_aga_cikmaz(self):
        d = tempfile.mkdtemp()
        try:
            k = kos("tr_rg_ocr.py", d, "20261109-4-8", "--tesseract", os.path.join(d, "yok.exe"))
            self.assertEqual(k.returncode, 2)
            self.assertNotIn("AG ENGELI", k.stderr)
            self.assertFalse(os.path.exists(os.path.join(d, "ham")))
        finally:
            shutil.rmtree(d, ignore_errors=True)


class CvOku(unittest.TestCase):
    def test_docx_tablo_ust_bilgi(self):
        import docx
        d = tempfile.mkdtemp()
        try:
            belge = docx.Document()
            belge.sections[0].header.paragraphs[0].text = "UST_BILGI"
            belge.add_heading("Deneyim", level=1)
            t = belge.add_table(rows=1, cols=2)
            t.cell(0, 0).text, t.cell(0, 1).text = "TABLO_HUCRE", "Araştırmacı"
            belge.add_paragraph("PARAGRAF " + "metin " * 60)
            yol = os.path.join(d, "cv.docx")
            belge.save(yol)
            k = kos("cv_oku.py", yol)
            self.assertEqual(k.returncode, 0, k.stderr)
            for isaret in ("UST_BILGI", "## Deneyim", "| TABLO_HUCRE | Araştırmacı |", "PARAGRAF"):
                self.assertIn(isaret, k.stdout)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_metinsiz_pdf_cikis_2(self):
        import fitz
        d = tempfile.mkdtemp()
        try:
            yol = os.path.join(d, "bos.pdf")
            pdf = fitz.open()
            pdf.new_page()
            pdf.save(yol)
            pdf.close()
            self.assertEqual(kos("cv_oku.py", yol).returncode, 2)
        finally:
            shutil.rmtree(d, ignore_errors=True)


SAHTE_BUN_SH = """#!/usr/bin/env bash
case "$*" in *kariyernet*) if [ "${SAHTE_HATA:-}" = knet ]; then echo '{"error":"403","code":"BLOCKED"}' >&2; exit 1; fi ;; esac
printf '{\\n  "meta": {\\n    "count": 0,\\n    "total": 0,\\n    "page": 1,\\n    "pages": 1\\n  },\\n  "results": []\\n}\\n'
"""
SAHTE_BUN_PY = """import os, sys
a = " ".join(sys.argv[1:])
if "kariyernet" in a and os.environ.get("SAHTE_HATA") == "knet":
    # Gerçek CLI mesajı kadar uzun: kod 200. karakterden sonra gelir (2026-11-17 canlı pilotta yakalanan hata)
    sys.stderr.write('{"error":"Kariyer.net refused the request (403, bot protection). Do not retry in a loop; see '
                     '.claude/skills/job-application-assistant/09-web-research.md for the robots.txt-gated fallback.",'
                     '"code":"BLOCKED"}\\n'); sys.exit(1)
print("SAHTE DETAY " + a)
"""


@unittest.skipIf(bash_yolu() is None, "bash yok (Windows'ta Git Bash gerekir)")
class Tarama(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.sahte = os.path.join(self.d, "sahte_bun.sh")
        with open(self.sahte, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(SAHTE_BUN_SH)
        os.chmod(self.sahte, 0o755)

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def tara(self, *portallar, **env):
        cikti = os.path.join(self.d, "t").replace("\\", "/")
        k = subprocess.run([bash_yolu(), "tools/tr_tarama.sh", cikti, *portallar], cwd=REPO, capture_output=True,
                           text=True, encoding="utf-8", env=dict(os.environ, **env))
        return k, metin_oku(os.path.join(self.d, "t", "tarama.log"))

    def test_kuru_tum_portallar(self):
        k, log = self.tara("kk", "knet", "li", "rg", "iskur", KURU="1")
        self.assertEqual(k.returncode, 0, log[-500:])
        self.assertEqual(log.count("PORTAL "), 5)
        self.assertNotIn(" OK ", log)
        self.assertIn("CIKIS kod=0", log)

    def test_gecici_hata_kurtarilinca_cikis_0(self):
        """LinkedIn: ilk deneme düşer, ikincisi geçer → hata sayılmaz, çıkış 0 (gerçek taramalarda zaman aşımı olağan)."""
        sahte = os.path.join(self.d, "bir_kez_dus.sh")
        with open(sahte, "w", encoding="utf-8", newline="\n") as fh:
            fh.write('#!/usr/bin/env bash\nd="$(dirname "$0")"; k="$d/dustu_$(echo "$*" | md5sum | cut -c1-8)"\n'
                     'if [ ! -f "$k" ]; then touch "$k"; echo \'{"error":"timeout","code":"SEARCH_FAILED"}\' >&2; exit 1; fi\n'
                     + SAHTE_BUN_SH.split("\n", 2)[2])
        os.chmod(sahte, 0o755)
        terim = os.path.join(self.d, "terim.txt")
        with open(terim, "w", encoding="utf-8") as fh:
            fh.write("research\n")
        k, log = self.tara("li", BUN=sahte.replace("\\", "/"), TERIM_DOSYASI=terim.replace("\\", "/"), BEKLE_LI_HATA="0")
        self.assertEqual(k.returncode, 0, log[-800:])
        self.assertIn("LI KURTARILDI", log)
        self.assertIn("hata=0", log)

    def test_blocked_cikis_4(self):
        k, log = self.tara("knet", "iskur", BUN=self.sahte.replace("\\", "/"), SAHTE_HATA="knet")
        self.assertEqual(k.returncode, 4, log[-500:])
        self.assertIn("blocked=1", log)


def profil_kur(kok, kisi="ayse_yilmaz", iller="Ankara\n"):
    """Sentetik İK CV'siyle profil kurar ve onaylar; profil klasörünü döndürür."""
    import docx
    cv = os.path.join(kok, "cv.docx")
    belge = docx.Document()
    belge.add_heading("Deneyim", level=1)
    belge.add_paragraph("İnsan kaynakları uzmanı; işe alım, bordro ve idari işler. " + "metin " * 60)
    belge.save(cv)
    env = {"TR_PROFILLER": os.path.join(kok, "profiller")}
    k = kos("tr_profil.py", "yeni", kisi, cv, env=env)
    assert k.returncode == 0, k.stderr
    d = os.path.join(kok, "profiller", kisi)
    for ad, icerik in {"terimler.txt": "insan kaynakları uzmanı\nHR specialist\n", "kk_terimler.txt": "sosyoloji\n",
                       "iller.txt": iller, "rol_kokleri.txt": "insan kaynak\n\\bHR\\b\nidari\n",
                       "meslekler.txt": "insan kaynakları\nidari işler\n"}.items():
        with open(os.path.join(d, ad), "w", encoding="utf-8") as fh:
            fh.write(icerik)
    return d, env


class Profil(unittest.TestCase):
    def setUp(self):
        self.k = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.k, ignore_errors=True)

    def test_yeni_onay_ve_sonradan_degisiklik(self):
        d, env = profil_kur(self.k)
        self.assertIn("İnsan kaynakları", metin_oku(os.path.join(d, "cv.md")))
        self.assertNotEqual(kos("tr_profil.py", "durum", "ayse_yilmaz", env=env).returncode, 0, "onaysız profil geçmemeli")
        self.assertEqual(kos("tr_profil.py", "onayla", "ayse_yilmaz", env=env).returncode, 0)
        self.assertEqual(kos("tr_profil.py", "durum", "ayse_yilmaz", env=env).returncode, 0)
        t = os.path.getmtime(os.path.join(d, "ONAYLANDI")) + 10
        os.utime(os.path.join(d, "terimler.txt"), (t, t))
        self.assertNotEqual(kos("tr_profil.py", "durum", "ayse_yilmaz", env=env).returncode, 0, "onaydan sonra değişen profil geçmemeli")

    def test_bos_profil_onaylanmaz(self):
        d, env = profil_kur(self.k)
        with open(os.path.join(d, "rol_kokleri.txt"), "w", encoding="utf-8") as fh:
            fh.write("# yalnız açıklama\n")
        k = kos("tr_profil.py", "onayla", "ayse_yilmaz", env=env)
        self.assertNotEqual(k.returncode, 0)
        self.assertIn("rol_kokleri.txt boş", k.stderr)

    def test_bilinmeyen_il_onaylanmaz(self):
        d, env = profil_kur(self.k, iller="Ankara\nIstanbull\n")
        k = kos("tr_profil.py", "onayla", "ayse_yilmaz", env=env)
        self.assertNotEqual(k.returncode, 0)
        self.assertIn("bilinmeyen il", k.stderr)

    def test_gecersiz_kisi_adi(self):
        self.assertNotEqual(kos("tr_profil.py", "onayla", "Ayşe Y", env={"TR_PROFILLER": self.k}).returncode, 0)

    def test_suzgec_profil_kokleri_ve_iller(self):
        d, env = profil_kur(self.k)
        t = os.path.join(self.k, "tarama")
        os.makedirs(t)
        ilanlar_yaz(t, [
            {"portal": "LinkedIn", "id": "1", "baslik": "İnsan Kaynakları Uzmanı", "konum": "Ankara, Türkiye"},
            {"portal": "LinkedIn", "id": "2", "baslik": "HR Business Partner", "konum": "İstanbul"},
            {"portal": "LinkedIn", "id": "3", "baslik": "Data Analyst", "konum": "Ankara"},
            {"portal": "Kariyer Kapısı", "id": "4", "baslik": "BAKANLIK - ALIM", "konum": "BAKANLIK MERKEZ TEŞKİLATI"},
        ])
        k = kos("tr_baslik_suzgec.py", t, "--profil", d)
        self.assertEqual(k.returncode, 0, k.stderr)
        ilg = {r["id"]: r["konum_sinifi"] for r in csv_oku(os.path.join(t, "ilanlar_ilgili.csv"))}
        self.assertEqual(ilg, {"1": "Ankara", "4": "Ankara (merkez teşkilatı)"},
                         "profil kökleri (İK) ve iller (yalnız Ankara) uygulanmalı; Data Analyst ve İstanbul dışarıda")

    def test_kuyruk_baska_kisinin_degerlendirmesini_saymaz(self):
        kok = os.path.join(self.k, "taramalar")
        alan = ALANLAR + ["konum_sinifi"]
        for kisi in ("ayse", "mehmet"):
            os.makedirs(os.path.join(kok, kisi, "2026-11-01"))
        for kisi in ("ayse", "mehmet"):
            t = os.path.join(kok, kisi, "2026-11-20")
            os.makedirs(t)
            with open(os.path.join(t, "ilanlar_ilgili.csv"), "w", encoding="utf-8-sig", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=alan)
                w.writeheader()
                w.writerow({a: "" for a in alan} | {"portal": "LinkedIn", "id": "7"})
        json_yaz(os.path.join(kok, "mehmet", "2026-11-01", "deger_cv.json"), {"LinkedIn|7": ["Orta", "", ""]})
        kos("tr_yeni.py", os.path.join(kok, "ayse", "2026-11-20"))
        kos("tr_yeni.py", os.path.join(kok, "mehmet", "2026-11-20"))
        ayse = csv_oku(os.path.join(kok, "ayse", "2026-11-20", "ilanlar_degerlendirilecek.csv"))
        mehmet = csv_oku(os.path.join(kok, "mehmet", "2026-11-20", "ilanlar_degerlendirilecek.csv"))
        self.assertEqual(len(ayse), 1, "Mehmet'in değerlendirmesi Ayşe'nin kuyruğundan ilanı düşürmemeli")
        self.assertEqual(len(mehmet), 0)


@unittest.skipIf(bash_yolu() is None, "bash yok (Windows'ta Git Bash gerekir)")
class TaramaProfil(unittest.TestCase):
    def setUp(self):
        self.k = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.k, ignore_errors=True)

    def tara(self, profil):
        cikti = os.path.join(self.k, "t").replace("\\", "/")
        k = subprocess.run([bash_yolu(), "tools/tr_tarama.sh", cikti, "knet", "kk"], cwd=REPO, capture_output=True,
                           text=True, encoding="utf-8", env=dict(os.environ, KURU="1", PROFIL=profil.replace("\\", "/")))
        return k

    def test_onaysiz_profil_durur(self):
        d, _ = profil_kur(self.k)
        k = self.tara(d)
        self.assertEqual(k.returncode, 2)
        self.assertIn("onayli degil", k.stderr)

    def test_profil_terimleri_ve_illeri(self):
        d, env = profil_kur(self.k)
        self.assertEqual(kos("tr_profil.py", "onayla", "ayse_yilmaz", env=env).returncode, 0)
        k = self.tara(d)
        log = metin_oku(os.path.join(self.k, "t", "tarama.log"))
        self.assertEqual(k.returncode, 0, k.stderr + log[-500:])
        self.assertIn("PORTAL knet beklenen=2", log, "2 terim x 1 il (yalnız Ankara)")
        self.assertIn("knet__insan_kaynaklari_uzmani__Ankara__p1.json", log)
        self.assertIn("kk__sosyoloji__TR__p1.json", log)
        self.assertNotIn("Istanbul", log)


class DetayCek(unittest.TestCase):
    def test_blocked_portal_durur_digeri_surer(self):
        d = tempfile.mkdtemp()
        try:
            sahte = os.path.join(d, "sahte_bun.py")
            with open(sahte, "w", encoding="utf-8") as fh:
                fh.write(SAHTE_BUN_PY)
            alan = ALANLAR + ["konum_sinifi"]
            with open(os.path.join(d, "ilanlar_degerlendirilecek.csv"), "w", encoding="utf-8-sig", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=alan)
                w.writeheader()
                for p, i in [("Kariyer.net", "1"), ("Kariyer.net", "2"), ("LinkedIn", "3")]:
                    w.writerow({k: "" for k in alan} | {"portal": p, "id": i})
            bun = f'"{PY.replace(os.sep, "/")}" "{sahte.replace(os.sep, "/")}"'
            k = kos("tr_detay_cek.py", d, env={"BUN": bun, "SAHTE_HATA": "knet"})
            self.assertEqual(k.returncode, 4, k.stdout + k.stderr)
            self.assertTrue(os.path.isfile(os.path.join(d, "detay", "li_3.txt")))
            self.assertIn("atlandi=1", k.stdout)
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
