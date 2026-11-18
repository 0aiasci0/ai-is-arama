# AI İş Arama (Türkiye)

Bu depo, Mads Lorentzen'in [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) projesinden alındı ve Türkiye'ye uyarlandı.
Özgün proje MIT lisanslıdır. Özgün telif hakkı notu [LICENSE](LICENSE) dosyasında korunur.
Özgün İngilizce belge: [README_EN.md](README_EN.md).

Araç [Claude Code](https://claude.com/claude-code) üzerinde çalışır. Bir CV verilir; araç CV'den meslekleri çıkarır, Türkiye'deki ilan kaynaklarını tarar, ilanları CV'ye göre değerlendirir ve sonucu Excel'e yazar.
Herhangi bir kişinin CV'siyle çalışır. Her kişinin profili ve taraması ayrı klasörde durur.

## Ne yapar

1. CV'yi okur (`.pdf` ya da `.docx`).
2. CV'den meslek ailelerini, arama terimlerini ve başlık süzgeci köklerini önerir. **İlleri kullanıcı seçer** (81 il).
3. Kullanıcı önerileri onaylar. Onaysız ya da onaydan sonra değişmiş profille tarama başlamaz.
4. Yalnız Türkiye kaynaklarını tarar (aşağıdaki tablo).
5. İlanları birleştirir, tekrarları atar, başlığa ve ile göre süzer.
6. Kuyruktaki her ilanın tam metnini çeker. İlanı CV'ye göre etiketler: Güçlü, Orta, Zayıf, Elendi.
7. Sonucu Excel'e yazar ve dosyayı açar.

## Kaynaklar

| Skill | Kaynak | Kapsam | Erişim yolu |
|---|---|---|---|
| `kariyerkapisi-search` | kariyerkapisi.gov.tr | Kamu ilanları: uzman yardımcılığı, sözleşmeli, bazı akademik | Açık JSON API; il bilgisi ilan detayından |
| `kariyernet-search` | kariyer.net | Özel sektör ilanları | Sunucu tarafı HTML |
| `linkedin-search` | linkedin.com | Türkiye konumlu ilanlar (`-l "Ankara, Türkiye"`) | Özgün projeden |
| `iskur-search` | esube.iskur.gov.tr | İŞKUR açık iş ilanları | WebForms araması |
| `resmigazete-akademik-search` | resmigazete.gov.tr | Üniversite kadro ilanları (Çeşitli İlânlar) | Günlük dizin + PDF (pdftotext) |
| `vacanciesinturkey-search` | vacanciesinturkey.com | İngilizce ilanlar: özel sektör, BM, STK, elçilik | Arama ucu + ilan sayfası; Türkiye kararı ilan metnine bakar |

Kapsam yalnız Türkiye'dir. Özgün projenin Danimarka portalları, `freehire-search`, maaş aracı ve upstream eşitleme araçları bu depodan çıkarıldı.

## Kullanım: yeni bir CV

Claude Code içinde:

```
/tr-cv <kişi-adı> <cv.pdf|cv.docx>
```

Komut şu adımları yürütür ve her onay noktasında durur:

1. `tools/tr_profil.py yeni <kişi> <cv>` CV metnini `profiller/<kişi>/cv.md` dosyasına çıkarır.
2. Claude meslekleri, arama terimlerini, Kariyer Kapısı terimlerini ve rol köklerini önerir. İlleri sorar.
3. Kullanıcı onaylayınca `tools/tr_profil.py onayla <kişi>` koşar.
4. Tarama, süzgeç, değerlendirme ve Excel adımları `taramalar/<kişi>/<tarih>/` altında koşar.

`profiller/` ve `taramalar/` kişisel veridir. `.gitignore` ile depoya girmez.

## Adım adım komutlar

Komutlar depo kökünden koşulur. `K=taramalar/<kişi>/<tarih>`, `P=profiller/<kişi>`.

| Adım | Komut | Çıktı (`$K/` altında) |
|---|---|---|
| 1. Tarama | `PROFIL=$P bash tools/tr_tarama.sh $K kk knet li rg iskur vit` | `ham/*.json`, `tarama.log`. Portal başına bir `PORTAL` satırı. Çıkış kodu: 0 tamam, 3 hata, 4 engellendi. `KURU=1` ağa çıkmadan planı gösterir |
| 2. Birleştir | `python tools/tr_birlestir.py $K <başlangıç YYYY-AA-GG> [--donemsiz vit]` | `ilanlar.csv`, `ilanlar.xlsx`, `ilanlar.md`. `--donemsiz` önceki taramada olmayan portalı tarih süzgecinden muaf tutar |
| 3. Süz | `python tools/tr_baslik_suzgec.py $K --profil $P` | `ilanlar_ilgili.csv` (profildeki rol kökleri ve iller), `ilanlar_serbest.csv` |
| 4. Resmî Gazete | `python tools/tr_rg_detay.py $K` ve `python tools/tr_rg_il.py $K` | `rg_akademik.json` (ilan metni, son başvuru, il) |
| 5. Kuyruk | `python tools/tr_yeni.py $K` | `ilanlar_degerlendirilecek.csv`: aynı kişinin önceki taramalarında değerlendirilmemiş ilgili ilanlar |
| 6. İlan metni | `python tools/tr_detay_cek.py $K` | `detay/<portal>_<id>.txt` |
| 7. Değerlendirme | Claude `detay/` metinlerini `$P/cv.md` ile karşılaştırır; kural `config/tr_etiket_kurali.md` | `deger_cv.json` |
| 8. Excel | `python tools/tr_excel.py $K $K/deger_cv.json` | `cv_uyum_<kişi>_<tarih>.xlsx`: "Değerlendirilen" (renkli) ve "Tüm ilanlar" sayfaları; bitince açılır (`--acma` açmaz) |

Etiket kuralı yazılıdır ([config/tr_etiket_kurali.md](config/tr_etiket_kurali.md)). Zorunlu şart ile tercih ayrı tutulur. İkiden fazla zorunlu eksiği olan ilan "Güçlü" alamaz; `tr_excel.py` bu durumda durur.

### Betikler

| Betik | İş |
|---|---|
| `tr_profil.py` | Kişi profili: `yeni`, `onayla`, `durum` |
| `tr_tarama.sh` | Portalları sırayla tarar (`kk`, `knet`, `li`, `li_devam`, `rg`, `iskur`, `vit`) |
| `tr_birlestir.py` | Portal çıktılarını tek tabloda birleştirir, tekrarları atar |
| `tr_baslik_suzgec.py` | İlan başlığını rol köküne ve ile göre süzer |
| `tr_rg_detay.py`, `tr_rg_il.py`, `tr_rg_ocr.py` | Resmî Gazete ilanlarında kadro, il ve taranmış PDF metnini çıkarır |
| `tr_yeni.py` | Daha önce değerlendirilen ilanları kuyruktan çıkarır |
| `tr_detay_cek.py` | Kuyruktaki ilanların tam metnini çeker |
| `knet_kayitli.ts` | Kaydedilmiş Kariyer.net sayfalarını ağa çıkmadan ilan listesine ve metnine çevirir (yedek yol) |
| `cv_oku.py` | CV'den metin çıkarır: `.pdf` ve `.docx` (tablo, metin kutusu, üst/alt bilgi dahil) |
| `tr_excel.py` | CV uyum tablosunu Excel'e yazar ve dosyayı açar |

## Gereksinimler

- [Claude Code](https://claude.com/claude-code) (CLI).
- Python 3.10+: `python -m pip install -r requirements-tr.txt` (PyMuPDF, python-docx, pandas, openpyxl).
- [Bun](https://bun.sh): portal CLI'ları ve `tr_tarama.sh` için.
- `pdftotext` (Poppler): Resmî Gazete PDF'leri için.
- İsteğe bağlı: Tesseract (`tur` dil paketiyle), taranmış PDF ilanları için. `tools/tr_rg_ocr.py` Tesseract'ı `C:\Program Files\Tesseract-OCR\tesseract.exe` yolunda arar.
- CV biçimi: metin katmanlı `.pdf` ya da `.docx`. Eski `.doc` biçimi desteklenmez.

## Kurulum

```bash
git clone https://github.com/0aiasci0/ai-is-arama.git
cd ai-is-arama
python tools/install_portal_clis.py
python -m pip install -r requirements-tr.txt
claude
```

Portal CLI'ları `.claude/settings.json` izin listesinde değildir; her çağrı onay ister. Onayı kaldırmak için şu satırları `.claude/settings.local.json` içindeki `permissions.allow` dizisine ekleyin:

```json
"Bash(bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts:*)",
"Bash(bun run .agents/skills/iskur-search/cli/src/cli.ts:*)",
"Bash(bun run .agents/skills/kariyernet-search/cli/src/cli.ts:*)",
"Bash(bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts:*)",
"Bash(bun run .agents/skills/vacanciesinturkey-search/cli/src/cli.ts:*)"
```

## Hızlı deneme

```bash
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts search -q "uzman yardımcısı" --format table
bun run .agents/skills/iskur-search/cli/src/cli.ts search -q muhasebe -l Ankara --format table
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search -q iktisat -l Ankara --format table
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts search --peek --limit 10 --format table
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q ekonomist -l "Ankara, Türkiye" --format table
```

## Bilinen sınırlar

- **Kariyer.net (ölçüldü, 2026-11-18):** Site PerimeterX bot koruması kullanır. Özgün CLI kimliği (`kariyernet-cli/1.0`) üç taramada ilk istekte 403 aldı. CLI artık tarayıcı başlıklarıyla istek atıyor; aynı adresler 30 istekte 30 kez 200 döndü. Arama ve ilan yolları `robots.txt`'te izinlidir. Tarama istekler arasında 20 sn bekler. 403 gelirse CLI `BLOCKED` döner ve yeniden denemez. Yalnız kişisel kullanım içindir; hacmi düşük tutun.
- **LinkedIn:** Bir arama en çok 1.000 sonuç (100 sayfa) verir. 101. sayfa `400 Bad Request` döner; bu bir hata değil, tavandır.
- **İŞKUR:** Üye girişi olmadan işveren adı görünmez; `company` alanı her zaman boştur.
- **Resmî Gazete:** Üniversite ilanı her zaman akademik ilan değildir. Taranmış PDF için `academic` alanı boş döner.
- **Vacancies in Turkey (ölçüldü, 2026-11-17):** Sitedeki konum alanı güvenilir değildir ("Çan, Turkey" Kanada'yı gösterebilir). Türkiye kararı ilan başlığına ve metnine bakar. Süresi dolmuş ilanlar atlanır.
- **ilan.gov.tr:** API her denemeye 403 verdi; akademik kaynak olarak Resmî Gazete kullanılır.

Ayrıntılı notlar: [TURKIYE.md](TURKIYE.md).

## Testler

```bash
PYTHONPATH=tests/agsiz python -m pytest tests/test_tr_pipeline.py -q
```

`tests/agsiz/` testlerde ağ erişimini kapatır. Her portal CLI'ında `bun test` çevrimdışı çalışır; `LIVE_TESTS=1` canlı duman testini ekler.

## Teşekkür ve lisans

Çatının tamamı Mads Lorentzen ve [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) katkıcılarının emeğidir.
Lisans: MIT. Bkz. [LICENSE](LICENSE).
