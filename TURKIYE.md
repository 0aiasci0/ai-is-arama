# Türkiye portalları

Bu klon, `MadsLorentzen/ai-job-search` çatısına altı Türkiye kaynağı ekler.
Çekirdek akış (`/setup`, `/scrape`, `/apply`) değişmez. `/scrape`, `.agents/skills/*/SKILL.md` dosyalarını kendisi bulur.

## Kaynaklar

| Skill | Kaynak | Kapsam | Erişim yolu |
|---|---|---|---|
| `kariyerkapisi-search` | kariyerkapisi.gov.tr | Kamu ilanları: A Grubu, sözleşmeli, görevde yükselme, bazı akademik | Açık JSON API |
| `iskur-search` | esube.iskur.gov.tr | İŞKUR açık iş ilanları: özel sektör ve kamu işçi | WebForms araması (postback) |
| `kariyernet-search` | kariyer.net | Özel sektör ilanları | Sunucu tarafı HTML |
| `resmigazete-akademik-search` | resmigazete.gov.tr | Üniversite kadro ilanları (Çeşitli İlânlar) | Günlük dizin + PDF (pdftotext) |
| `vacanciesinturkey-search` | vacanciesinturkey.com | İngilizce ilanlar: özel sektör, BM, STK, elçilik | WP Job Manager arama ucu + ilan sayfası JSON-LD; Türkiye süzgeci ilan metnine bakar |
| `linkedin-search` | linkedin.com | Ülke bağımsız; kod değişmedi | `-l "Türkiye"`, `-l "Ankara, Türkiye"` |

Danimarka portalları (`jobindex`, `jobnet`, `jobbank`, `jobdanmark`) yukarı akışta zaten `enabled: false` gelir. Onlara dokunulmadı.
Ülke bağımsız `freehire-search` ise `enabled: true` gelir; `/scrape` onu da çalıştırır. Kapatmak için SKILL.md dosyasında `enabled: false` yapın.

## İzin satırları (isteğe bağlı)

`.claude/settings.json` izin listesi CLI yollarını tek tek sayar. Yeni beş CLI orada yok; bu yüzden her çağrıda onay ister. Onayları kaldırmak için şu satırları `.claude/settings.local.json` içindeki `permissions.allow` dizisine ekleyin. Bu dosya yukarı akışla çakışmaz.

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
bun run .agents/skills/kariyernet-search/cli/src/cli.ts search -q ekonomist --format table
bun run .agents/skills/resmigazete-akademik-search/cli/src/cli.ts search --peek --limit 10 --format table
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q ekonomist -l "Türkiye" --format table
```

## Bilinen sınırlar (ölçüldü, 2026-10-18)

- **Kariyer.net:** PerimeterX bot koruması var. Bir saatte yaklaşık 40 istekten sonra bir 403 geldi. CLI 403'te `BLOCKED` döner ve yeniden denemez. Yalnız kişisel kullanım içindir; hacmi düşük tutun.
- **İŞKUR:** Üye girişi olmadan işveren adı görünmez; `company` alanı her zaman `null` döner.
- **Resmî Gazete:** Üniversite ilanı her zaman akademik ilan değildir. `--peek` metnin ilk 700 karakterine bakar. Taranmış PDF için `academic` alanı `null` döner. 28 ilanlık altın küme sonucu `url-reference.md` dosyasında.
- **ilan.gov.tr:** API, Kong ağ geçidinde her denemeye 403 verdi. Bu yüzden akademik kaynak olarak Resmî Gazete kullanıldı. Chrome eklentisi bağlanırsa ağ isteği gözlenip bu kaynak yeniden denenebilir.
- **Kariyer Kapısı:** Eski alan adı `kariyerkapisi.cbiko.gov.tr` artık çözümlenmiyor. Güncel alan adı `kariyerkapisi.gov.tr`.

## Testler

Her CLI'da `bun run test` çevrimdışı çalışır. `LIVE_TESTS=1 bun run test` komutu bir canlı duman testi ekler.
