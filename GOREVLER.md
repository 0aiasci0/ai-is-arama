# GOREVLER — ai-job-search Türkiye uyarlaması (yalnız portallar)

Kapsam (onay 2026-10-18): Kariyer.net, Kariyer Kapısı, İŞKUR, akademik ilanlar, LinkedIn.
Repo: yerel private klon, `upstream` = MadsLorentzen/ai-job-search. Yalnız yeni dosya eklendi; upstream dosyalarına dokunulmadı. Commit yok (istenmedi).

| Portal | Skill | Erişim yolu (ölçüldü) | Durum |
|---|---|---|---|
| Kariyer Kapısı | `kariyerkapisi-search` | `api.kariyerkapisi.gov.tr/api` JSON | bitti: canlı arama+detay, 14 test |
| İŞKUR | `iskur-search` | AcikIsIlanAra.aspx postback; detay girişsiz | bitti: canlı arama/sayfa/kamu/detay, 17 test |
| Kariyer.net | `kariyernet-search` | /is-ilanlari SSR, data-test çapaları, adCount | bitti: canlı arama/konum/detay, 19 test; 1×403 gözlendi |
| Akademik | `resmigazete-akademik-search` | eskiler/YYYYMMDD.htm → Çeşitli İlânlar → PDF | bitti: canlı arama/peek/detay, 16 test, 28'lik altın küme |
| LinkedIn | `linkedin-search` (upstream) | kod değişmedi | bitti: `-l "Türkiye"`, `"Ankara, Türkiye"` canlı |
| Vacancies in Turkey | `vacanciesinturkey-search` (2026-11-17) | `/jm-ajax/get_listings/` + `/job/<slug>/` JSON-LD | bitti: canlı arama/detay, 32 test; Türkiye süzgeci 94 açık ilanda metinden etiketlendi (7 no hepsi yurt dışı; 30 unclear'ın 29'u TR) |

## İnceleme planı uygulaması (2026-11-17; plan: .claude/governance/inceleme_2026-11-17.md, yerel)
| Sıra | İş | Durum | Kanıt |
|---|---|---|---|
| 1 | Depo gizli + kişisel klasörler gitignore | bitti | `gh repo view` PRIVATE; 4/4 kişisel dosya check-ignore; commit 4b61b41 |
| 2 | CI `main` dalında | bitti | Actions koşusu 44148862302: Python 5/5, TR CLI 6/6 başarılı; Danimarka CLI 4/4 başarısız (ayrı iş) |
| 3 | tr_tarama.sh: main(), PORTAL satırı, çıkış kodu, KURU | bitti | Ağsız sınama: KURU kod=0, sahte BLOCKED kod=4, sahte hata kod=3, koşu ortası Edit exit 0; #17 #18 KAPANDI; commit 822a813 |
| 5 | LinkedIn boş sayfa yeniden deneme; terimler config/ altında, 23 Ekim terimleri geri | bitti | Sahte CLI: boş p3 sonrası p4 dolu → sürdü; yeniden denemede dolu → sürdü; normal son → durdu. Terim 7 → 14 (knet/li/iskur kombinasyon 14 → 28); liste sonu başına +2 LinkedIn isteği |
| 4 | Kariyer Kapısı: bölüm terimleri + detaydan il | bitti | Canlı pilot 16 istek: 12 ilan, 9 ilgili (önce 0); altın küme 5/5 Ankara ilanı (KİK, SGK, KDK, NDK, Sayıştay); eski veride çıktı bayt aynı |

## 2026-11-17 eklemeleri
- `tools/tr_excel.py`: CV uyum Excel'i (Değerlendirilen + Tüm ilanlar), bitince açar; kilitli dosyada saat ekli ad. Altın kıyas: 2026-11-16 dosyasıyla hücre farkı 0.
- `tools/cv_oku.py`: PDF (PyMuPDF) + DOCX (python-docx; tablo, metin kutusu, üst/alt bilgi). Taranmış PDF → çıkış 2.
- `vacanciesinturkey-search`: tarama hattına (`tr_tarama.sh`, `tr_birlestir.py`) bağlı değil — karar bekliyor.
- UN Careers: tarayıcı başlıklı tek istek 200, başlıksız 403; skill yazılmadı — karar bekliyor.

## Notlar
- ilan.gov.tr: API Kong'da 403 (UA/çerez/tarayıcı başlıkları denendi; robots izinli). Chrome eklentisi bağlanırsa ağ isteği gözlenip yeniden denenebilir.
- `kariyerkapisi.cbiko.gov.tr` yok; güncel `kariyerkapisi.gov.tr`.
- Kullanıcı özeti: `TURKIYE.md`.

## Açık (kullanıcı kararı)
- Commit/branch: istenirse `tr-portals` dalına commit.
- `/setup` profili henüz doldurulmadı (kapsam dışı).

## Tarama 2026-11-02 (18 Ekim'den beri; Ankara + İstanbul)
Terimler: ekonomist, araştırmacı, economist, research, veri analisti, data analyst, data scientist.
Klasör: `taramalar/2026-11-02/` — `ilanlar.csv` (1.670 tekil), `ilanlar_ilgili.csv` (216; başlık rol kökü + konum süzgeci), `rg_akademik.json`.
Betikler: `tools/tr_tarama.sh` (kk|knet|li|li_devam|rg|iskur), `tr_birlestir.py`, `tr_baslik_suzgec.py`, `tr_rg_detay.py`, `tr_rg_il.py`, `tr_rg_ocr.py`.

| Portal | Sonuç | Not |
|---|---|---|
| Kariyer Kapısı | 0 | Havuz 25 ilan; kamu "iktisat" (8) / "istatistik" (9) kullanıyor |
| Kariyer.net | 132 → 9 ilgili | Metin içi gevşek eşleşme; 403 yok |
| LinkedIn | 1.532 → 206 ilgili | Zaman aşımı rastgele → 3 deneme; 1.000 sonuç tavanı (p101=400): ekonomist/research/veri analisti İstanbul |
| İŞKUR | 6 → 1 ilgili | esube HTTPS önce RST verdi, sonra açıldı; pozitif kontrol muhasebe Ankara=37 |
| Resmî Gazete | 72 ilan, 55 akademik/belirsiz, Ankara+İstanbul alan eşleşmesi 6 | 4 taranmış PDF Tesseract tur ile okundu: alan dışı |

Açık: tarama betiğinin arka planda exit 2 vermesi (BITTI yazmadan) ölçülmedi; tekrar üretilemedi.
Tuzak: Git Bash'te PATH'e `C:/...` yolu koyma — iki nokta PATH'i böler (sahte bun devreye girmedi, gerçek LinkedIn istekleri gitti).

## Tarama 2026-11-16/17 (2 Kasım'dan beri; Ankara + İstanbul; aynı 7 terim)
Klasör: `taramalar/2026-11-16/` — `ilanlar.csv` (1.628 tekil), `ilanlar_ilgili.csv` (205), `ilanlar_ilgili_yeni.csv/.md` (154; 2026-11-02 `ilanlar.csv` içinde olmayanlar), `rg_akademik.json` (55).
Koşu: arka plan exit 0 (`kos_exit.txt`); #18 exit 2 bu turda tekrar etmedi.

| Portal | Sonuç | Not |
|---|---|---|
| Kariyer Kapısı | 0 | Pozitif kontrol "iktisat" Türkiye geneli = 3 |
| Kariyer.net | 149 → 146 tekil → 14 ilgili | İlk koşuda ilk istekte 403 BLOCKED (23:17); 2 sa sonra tek istek geçti, ardından 15 istek 20 sn arayla 403'süz |
| LinkedIn | 540 sayfa, 1.481 → 191 ilgili | 1 bağlantı hatası, 3 denemede geçti; 1.000 tavanına takılan sorgu yok |
| İŞKUR | 14 sayfa, 1 ilan → 0 ilgili | |
| Resmî Gazete | 55 akademik/belirsiz, 52 yeni | 3 taranmış PDF OCR (Üsküdar, Bilgi, HBV): alan dışı; HBV belgesi ihale yasaklama kararı. Ankara/İstanbul alan eşleşmesi: Doğuş (uluslararası ticaret ve finansman; veri bilimi), Arel (finans ve bankacılık), Boğaziçi (politik ekonomi), Bezmiâlem (biyoistatistik) |

Açık #29: `tr_tarama.sh` portal başına bitiş satırı yazmıyor (durum cevabı hatası, errors/pipeline.md 2026-11-17).
