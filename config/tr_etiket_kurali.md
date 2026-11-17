# CV uyum etiket kuralı (Türkiye taraması)

Bu kural `deger_cv.json` dosyasındaki etiketleri belirler. `tools/tr_excel.py` bu dosyayı Excel'e yazar.
Kural bilinçli olarak geneldir: adayın çekirdek deneyimi ve tercihleri profilden okunur
(`.claude/skills/job-application-assistant/01-candidate-profile.md`, `04-job-evaluation.md`; `/setup` ile doldurulur).

## Önce kapılar
Framework'ün kapıları etiketten önce uygulanır (`04-job-evaluation.md`):
1. **Eligibility Gate** (vatandaşlık, çalışma izni, güvenlik izni): FAIL → `Elendi`.
2. **Language Gate**: FAIL → `Elendi`; FLAG → etiket verilir, yorumda dil şartı ve beyan edilen düzey yazılır.

## Etiket (sırayla uygula; ilk tutan kural geçerlidir)
1. **Elendi (şart)**: İlan metninde zorunlu yazılan ("required", "aranan", "must", "-malı/-meli") ve CV'de olmayan, kısa sürede kazanılamayan bir şart var: diploma ya da derece (ör. doktora), mesleki lisans ya da sertifika, zorunlu yabancı dil, bölüm listesi dışı (ve "eşdeğer" ifadesi yok), deneyim yılı ve türü birlikte açıkça karşılanmıyor.
2. **Elendi (tür)**: Kariyer pozisyonu değil ya da profildeki bir tercih dışı (ücretsiz/gönüllü, saatlik serbest görev, öğrenci stajı). Yorumda "tür:" ile başlayarak yazılır; CV eksikliği değildir.
3. **Zayıf**: Kapı ya da sert şart yok, ama ilanın çekirdek işi (ana görev) CV'de yok ve zorunlu şartların çoğu karşılanmıyor.
4. **Orta**: Çekirdek iş kısmen örtüşür; zorunlu şartlardan 1–2'si eksik ama öğrenilebilir (ör. bir yazılım aracı), ya da deneyim yılı/türü sınırda.
5. **Güçlü**: Ana görev profildeki çekirdek deneyimle örtüşür ve zorunlu şartlardan **en çok 1'i** eksiktir; o da öğrenilebilir türdendir.

## Kayıt biçimi
```json
{
  "_not": "değerlendiren, tarih, CV dosyası ve sürümü",
  "<portal>|<id>": ["Güçlü|Orta|Zayıf|Elendi", "zorunlu şartların özeti", "tek cümle gerekçe", ["zorunlu eksik 1", "..."]]
}
```
- 4. öğe (`zorunlu eksik` listesi) isteğe bağlıdır; verilirse ilan metninde **zorunlu** yazan ve CV'de olmayan şartları içerir ("tercih"/"asset" yazan şartlar girmez).
- `<portal>` birleştirme çıktısındaki portal adıdır (`Kariyer.net`, `LinkedIn`, `Kariyer Kapısı`, `İŞKUR`, `Resmî Gazete`).

## Mekanik kapı (`tools/tr_excel.py`)
- `Güçlü` etiketli ilanda `zorunlu eksik` listesi 1'den uzunsa betik durur (kural 5 ile çelişki).
- Tanımsız etiket ya da kaynakta olmayan ilan anahtarı da betiği durdurur.

## Neden yazılı
2026-11-17 incelemesinde (kör yeniden etiketleme) yazılı kural olmadan verilen 26 etiketin tam uyumu 19/26 çıktı;
7 ayrışmanın 7'sinde ilk etiket daha iyimserdi. Hedef: aynı ilanlar iki ayrı oturumda etiketlenince tam uyum ≥ %90.
