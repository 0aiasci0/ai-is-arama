# /tr-cv - Bir CV için Türkiye iş ilanı taraması

Herhangi bir kişinin CV'si geldiğinde: CV'den meslekleri bul, kullanıcıya onaylat, o kişi için Türkiye portallarını tara,
ilanları CV'ye göre değerlendir ve Excel'i aç. Kapsam yalnız Türkiye: Kariyer Kapısı, Kariyer.net, İŞKUR, LinkedIn
(Türkiye konumları), Resmî Gazete akademik ilanları, Vacancies in Turkey.

Girdi: `/tr-cv <kişi-adı> <cv-yolu>` (kişi adı küçük harf, rakam, `-`, `_`; ör. `ayse_yilmaz`). Eksikse sor.

Adımları **sırayla** uygula. Her adımdan önce kullanıcıya tek cümleyle ne yapacağını söyle.

## Adım 1: Profil klasörü
```bash
python tools/tr_profil.py yeni <kişi> <cv-yolu>
```
Çıkış "CV'den metin çıkmadı" diyorsa dur: metinli PDF ya da .docx iste.

## Adım 2: Meslekleri ve terimleri öner (kullanıcı onayı ZORUNLU)
`profiller/<kişi>/cv.md` dosyasını tam oku. Şunları öner ve kullanıcıya tek tabloda göster:
- **meslekler**: CV'deki deneyim ve eğitimden çıkan 3-6 meslek/rol ailesi (ör. "insan kaynakları", "idari işler", "saha araştırması").
- **terimler**: her meslek için Türkçe ve İngilizce arama terimleri (ör. "insan kaynakları uzmanı", "HR specialist"). Toplam 6-16 terim. Kariyer.net bot korumalıdır: terim sayısını gereksiz artırma.
- **kk_terimler**: kamu ilanlarında bölüm/alan şartı olarak geçecek sözcükler (ör. "sosyoloji", "kamu yönetimi", "iktisat").
- **iller**: kullanıcı seçer. CV'deki konumu öneri olarak sun ve **açıkça sor**: hangi iller (bir ya da birden çok; 81 il
  `config/tr_iller.txt`)? Varsayım yapma. "Türkiye geneli" ve uzaktan ilanlar il seçiminden bağımsız olarak kalır.
  İl sayısı sorgu sayısını katlar (her terim × her il): çok il seçilirse kullanıcıya istek sayısını söyle.
- **rol_kokleri**: başlık süzgecinin kökleri (düzenli ifade; ör. `insan kaynak`, `\bİK\b`, `human resource`, `\bHR\b`, `idari`).
  Kısa kökler alakasız başlık getirir; her kökü bir örnek başlıkla gerekçelendir.

Kullanıcı onaylamadan dosyaya yazma. Onaydan sonra `profiller/<kişi>/` altındaki `meslekler.txt`, `terimler.txt`,
`kk_terimler.txt`, `iller.txt`, `rol_kokleri.txt` dosyalarını Write/Edit ile doldur, sonra:
```bash
python tools/tr_profil.py onayla <kişi>
```

## Adım 3: Kuru tarama, sonra gerçek tarama
`K=taramalar/<kişi>/<YYYY-MM-DD>` (bugünün tarihi). Önce ağsız plan:
```bash
KURU=1 PROFIL=profiller/<kişi> bash tools/tr_tarama.sh $K kk knet li rg iskur vit
```
Logdaki `PORTAL` satırlarını ve kombinasyon sayısını kullanıcıya göster. Sonra gerçek koşu arka planda:
```bash
PROFIL=profiller/<kişi> bash tools/tr_tarama.sh $K kk knet li rg iskur vit
```
Bitince `tarama.log` içindeki `PORTAL` satırlarını oku (bildirime değil dosyaya güven). Çıkış 4 = bir portal engellendi
(Kariyer.net 403 olağan): kullanıcıya hangi portalın eksik kaldığını söyle.

## Adım 4: Birleştir, süz, kuyruk, ilan metni
```bash
python tools/tr_birlestir.py $K <son taramadan bu yana başlangıç YYYY-AA-GG>
python tools/tr_baslik_suzgec.py $K --profil profiller/<kişi>
python tools/tr_rg_detay.py $K && python tools/tr_rg_il.py $K --sessiz
python tools/tr_yeni.py $K
python tools/tr_detay_cek.py $K
```

## Adım 5: Değerlendirme
Kuyruktaki (`ilanlar_degerlendirilecek.csv`) her ilanın `detay/` metnini `profiller/<kişi>/cv.md` ile karşılaştır.
Etiket kuralı: `config/tr_etiket_kurali.md` (kapılar → Elendi(şart/tür) → Zayıf → Orta → Güçlü; zorunlu eksikleri 4. öğeye yaz).
Sonucu `$K/deger_cv.json` dosyasına yaz; `_not` alanına kişi, tarih ve CV dosyasını yaz.

## Adım 6: Excel
```bash
python tools/tr_excel.py $K $K/deger_cv.json
```
Excel açılır (`cv_uyum_<kişi>_<tarih>.xlsx`). Pencerenin açıldığını denetle; kullanıcıya etiket dağılımını tek satırda söyle.

## Kurallar
- Kişisel veri (`profiller/`, `taramalar/`) depoya girmez; `.gitignore` bunu sağlar. Commit'ten önce `git status` ile denetle.
- Başka kişinin değerlendirmesi bu kişinin kuyruğunu etkilemez (`tr_yeni.py` yalnız `taramalar/<kişi>/` altına bakar).
