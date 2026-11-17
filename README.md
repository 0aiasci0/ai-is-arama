# AI İş Arama (Türkiye)

Bu depo, Mads Lorentzen'in [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) projesinden alındı ve Türkiye'ye uyarlandı.
Özgün proje MIT lisanslıdır. Özgün telif hakkı notu [LICENSE](LICENSE) dosyasında korunur.
Özgün İngilizce belge: [README_EN.md](README_EN.md).

Çatı [Claude Code](https://claude.com/claude-code) üzerinde çalışır. Claude iş ilanlarını tarar, ilanı profilinle karşılaştırır, CV'ni ilana göre uyarlar ve ön yazı hazırlar.
Bu uyarlama yalnız ilan kaynaklarını değiştirir. Çekirdek akış (`/setup`, `/scrape`, `/apply`) özgün projeyle aynıdır.

## Eklenen Türkiye kaynakları

| Skill | Kaynak | Kapsam | Erişim yolu |
|---|---|---|---|
| `kariyerkapisi-search` | kariyerkapisi.gov.tr | Kamu ilanları: A Grubu, sözleşmeli, görevde yükselme, bazı akademik | Açık JSON API |
| `iskur-search` | esube.iskur.gov.tr | İŞKUR açık iş ilanları: özel sektör ve kamu işçi | WebForms araması (postback) |
| `kariyernet-search` | kariyer.net | Özel sektör ilanları | Sunucu tarafı HTML |
| `resmigazete-akademik-search` | resmigazete.gov.tr | Üniversite kadro ilanları (Çeşitli İlânlar) | Günlük dizin + PDF (pdftotext) |
| `linkedin-search` | linkedin.com | Özgün projeden; kod değişmedi | `-l "Türkiye"`, `-l "Ankara, Türkiye"` |

Danimarka portalları (`jobindex`, `jobnet`, `jobbank`, `jobdanmark`) özgün projede kapalı gelir (`enabled: false`).
Ülke bağımsız `freehire-search` açık gelir. Kapatmak için SKILL.md dosyasında `enabled: false` yazın.

Toplu tarama betikleri `tools/` klasöründedir:

| Betik | İş |
|---|---|
| `tr_tarama.sh` | Portalları sırayla tarar (`kk`, `knet`, `li`, `li_devam`, `rg`, `iskur`) |
| `tr_birlestir.py` | Portal çıktılarını tek tabloda birleştirir, tekrarları atar |
| `tr_baslik_suzgec.py` | İlan başlığını rol köküne ve konuma göre süzer |
| `tr_rg_detay.py`, `tr_rg_il.py`, `tr_rg_ocr.py` | Resmî Gazete ilanlarında kadro, il ve taranmış PDF metnini çıkarır |

## Gereksinimler

- [Claude Code](https://claude.com/claude-code) (CLI). Ücretsiz sürüm yoktur.
- Python 3.10+ ve Python paketleri: `python -m pip install -r requirements-tr.txt` (PyMuPDF)
- [Bun](https://bun.sh) (portal CLI'ları ve `tr_tarama.sh` için)
- `pdftotext` (Poppler). Resmî Gazete PDF'leri için gereklidir.
- İsteğe bağlı: Tesseract (`tur` dil paketiyle). Taranmış PDF ilanları için gereklidir. `tools/tr_rg_ocr.py` Tesseract'ı `C:\Program Files\Tesseract-OCR\tesseract.exe` yolunda arar.
- CV ve ön yazı üretimi için LaTeX (`lualatex`, `xelatex`). Ayrıntı: [SETUP.md](SETUP.md).

## Kurulum

```bash
git clone https://github.com/0aiasci0/ai-is-arama.git
cd ai-is-arama
python tools/install_portal_clis.py
python -m pip install -r requirements-tr.txt
```

Kişisel verin (`/setup` çıktısı, CV, tarama sonuçları) depoya girer. Bu yüzden kendi iş araman için **gizli** bir depo kullan.

Profil kurulumu:

```bash
claude
# Claude Code içinde:
/setup
```

## Hızlı deneme

```bash
bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts search -q "uzman yardımcısı" --format table
bun run .agents/skills/iskur-search/cli/src/cli.ts search -q muhasebe -l Ankara --format table
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search -q ekonomist --format table
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts search --peek --limit 10 --format table
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q ekonomist -l "Türkiye" --format table
```

Claude Code içinde tüm portalları birlikte taramak için `/scrape`, bir ilana başvuru hazırlamak için `/apply` yazın.

### İzin satırları (isteğe bağlı)

Yeni dört CLI `.claude/settings.json` izin listesinde yoktur. Bu yüzden her çağrı onay ister. Onayı kaldırmak için şu satırları `.claude/settings.local.json` içindeki `permissions.allow` dizisine ekleyin:

```json
"Bash(bun run .agents/skills/kariyerkapisi-search/cli/src/cli.ts:*)",
"Bash(bun run .agents/skills/iskur-search/cli/src/cli.ts:*)",
"Bash(bun run .agents/skills/kariyernet-search/cli/src/cli.ts:*)",
"Bash(bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts:*)"
```

## Bilinen sınırlar (ölçüldü, 2026-10-18)

- **Kariyer.net:** PerimeterX bot koruması var. Bir saatte yaklaşık 40 istekten sonra bir 403 geldi. CLI 403'te `BLOCKED` döner ve yeniden denemez. Yalnız kişisel kullanım içindir; hacmi düşük tutun.
- **İŞKUR:** Üye girişi olmadan işveren adı görünmez; `company` alanı her zaman `null` döner.
- **Resmî Gazete:** Üniversite ilanı her zaman akademik ilan değildir. `--peek` metnin ilk 700 karakterine bakar. Taranmış PDF için `academic` alanı `null` döner.
- **ilan.gov.tr:** API her denemeye 403 verdi. Bu yüzden akademik kaynak olarak Resmî Gazete kullanıldı.
- **Kariyer Kapısı:** Eski alan adı `kariyerkapisi.cbiko.gov.tr` artık çözümlenmiyor. Güncel alan adı `kariyerkapisi.gov.tr`.

Ayrıntılı notlar: [TURKIYE.md](TURKIYE.md).

## Testler

Her CLI'da `bun run test` çevrimdışı çalışır. `LIVE_TESTS=1 bun run test` komutu bir canlı duman testi ekler.

## Teşekkür ve lisans

Çatının tamamı Mads Lorentzen ve [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) katkıcılarının emeğidir.
Lisans: MIT. Bkz. [LICENSE](LICENSE).
