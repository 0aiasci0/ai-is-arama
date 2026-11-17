#!/usr/bin/env bash
# TR portal taramasi: terim x il x donem. Ham JSON -> $OUT/ham/
# Kullanim: bash tools/tr_tarama.sh <cikti_klasoru> <portal...>
# Portal: kk | knet | li | li_devam | rg | iskur | vit
#
# Ortam degiskenleri:
#   KURU=1        ag istegi yok: CLI cagrilmaz, bos JSON yazilir, plan loglanir
#   BUN=<yol>     bun yerine kullanilacak program (sinama icin sahte CLI)
#   LI_DEVAM="terim|il|baslangic_sayfa;..."  li_devam portali icin
#
# Cikis kodu: 0 hepsi tamam | 3 en az bir istek/kombinasyon basarisiz | 4 en az bir portal BLOCKED
#             | 2 kullanim hatasi | 6 on kosul (bun) yok
# Her portal sonunda log: "PORTAL <ad> beklenen=<n> denenen=<n> ok=<n> hata=<n> blocked=<0|1>"
#   beklenen/denenen = terim x il kombinasyonu (rg icin 1); ok/hata = istek sayisi.
#
# Butun govde main() icinde: bash dosyayi akisla okur; kosu sirasinda dosya duzenlenirse
# eski ofsetten okuyup sozdizimi hatasi verirdi (#18, 2026-11-02 exit 2). main tek seferde
# ayristirilir, sonra dosyaya bir daha bakilmaz.

main() {
set -u
cd "$(dirname "$0")/.."
[ $# -ge 2 ] || { echo "Kullanim: bash tools/tr_tarama.sh <cikti_klasoru> <portal...>" >&2; return 2; }
OUT="$1"; shift
S=.agents/skills
KURU="${KURU:-0}"
BUN="${BUN:-bun}"
mkdir -p "$OUT/ham"
LOG="$OUT/tarama.log"

# Terimler config/ altindan okunur (satir basina bir terim; # ve bos satir atlanir).
# TERIM_DOSYASI / KK_TERIM_DOSYASI ile baska dosya verilebilir.
terim_oku() {  # terim_oku <dosya> -> satirlar
  [ -f "$1" ] || { echo "Terim dosyasi yok: $1" >&2; return 1; }
  sed -e 's/\r$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$1" | grep -v -e '^#' -e '^$'
}
mapfile -t TERIMLER < <(terim_oku "${TERIM_DOSYASI:-config/tr_terimler.txt}") || return 2
ILLER=("Ankara" "İstanbul")
# Kariyer Kapisi: kamu ilanlari kurum duyurusu; basliklarda rol adi yok, metinde bolum sarti var
# ("iktisat", "istatistik"). Rol terimleriyle 21/21 sorgu 0 dondu (2026-11-16). Tam metin aranir,
# il API'de degil alt ilanlarin kontenjan listesinde: her ilanin detayi ayrica cekilir.
mapfile -t KK_TERIMLER < <(terim_oku "${KK_TERIM_DOSYASI:-config/tr_kk_terimler.txt}") || return 2
[ ${#TERIMLER[@]} -gt 0 ] && [ ${#KK_TERIMLER[@]} -gt 0 ] || { echo "Terim listesi bos" >&2; return 2; }
KK_SAYFA=20  # CLI istemci tarafinda 20 satirlik sayfa keser
GUN_KK=15; GUN_KNET=15; GUN_LI=30; GUN_RG=16; GUN_ISKUR=15; GUN_VIT=30
VIT_SAYFA=50  # vacanciesinturkey: sayfa basina 50 kart; her acik ilanin sayfasi CLI icinde acilir
BEKLE_KNET=20; BEKLE_LI=3; BEKLE_LI_HATA=15
if [ "$KURU" = 1 ]; then BEKLE_KNET=0; BEKLE_LI=0; BEKLE_LI_HATA=0; fi

slug() { echo "$1" | sed 's/ /_/g; s/ş/s/g; s/ı/i/g; s/İ/I/g; s/ç/c/g; s/ğ/g/g; s/ö/o/g; s/ü/u/g'; }
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$LOG"; }

trap 'log "CIKIS kod=$?"' EXIT

if [ "$KURU" != 1 ] && ! command -v "$BUN" >/dev/null 2>&1; then
  log "ON KOSUL: '$BUN' bulunamadi (bun kurulu mu, PATH dogru mu?)"; return 6
fi

# Portal sayaclari (her portal basinda sifirlanir) ve kosu geneli durum
OKN=0; HATAN=0; DENENEN=0; BLOCKED=0; KOD=0

kos() {  # kos <dosya> <cli> args...
  local f="$1"; shift
  if [ "$KURU" = 1 ]; then
    # Gercek CLI ciktisi gibi alan basina bir satir: sayaclar grep -m1 | tr -dc 0-9 ile okunuyor
    printf '{\n  "meta": {\n    "count": 0,\n    "total": 0,\n    "page": 1,\n    "pages": 1\n  },\n  "results": []\n}\n' > "$f"
    log "KURU $(basename "$f")"; OKN=$((OKN+1)); return 0
  fi
  if "$BUN" run "$@" --format json > "$f" 2> "$f.err"; then
    log "OK $(basename "$f") count=$(grep -m1 '"count"' "$f" | tr -dc 0-9) total=$(grep -m1 '"total"' "$f" | tr -dc 0-9)"
    rm -f "$f.err"; OKN=$((OKN+1)); return 0
  else
    log "HATA $(basename "$f") $(cat "$f.err")"; HATAN=$((HATAN+1)); return 1
  fi
}

portal_bas() { OKN=0; HATAN=0; DENENEN=0; BLOCKED=0; }
portal_son() {  # portal_son <ad> <beklenen>
  log "PORTAL $1 beklenen=$2 denenen=$DENENEN ok=$OKN hata=$HATAN blocked=$BLOCKED"
  if [ "$BLOCKED" = 1 ]; then KOD=4
  elif [ "$HATAN" -gt 0 ] || [ "$DENENEN" -lt "$2" ]; then [ "$KOD" = 4 ] || KOD=3
  fi
}

for P in "$@"; do
portal_bas
case "$P" in
kk)
  for t in "${KK_TERIMLER[@]}"; do
    DENENEN=$((DENENEN+1)); pg=1
    while :; do
      f="$OUT/ham/kk__$(slug "$t")__TR__p$pg.json"
      kos "$f" $S/kariyerkapisi-search/cli/src/cli.ts search -q "$t" --jobage $GUN_KK --page $pg || break
      total=$(grep -m1 '"total"' "$f" | tr -dc 0-9)
      [ $(( pg * KK_SAYFA )) -lt "${total:-0}" ] || break; pg=$((pg+1))
    done
  done
  # Detay: il (alt ilan kontenjan listesi) ve ilan metni. Yalniz duyuru olan ilanin (ilanTipi 2)
  # detayi yoktur (NOT_FOUND): hata sayilmaz.
  mkdir -p "$OUT/ham/kkdetay"
  for g in $(grep -ho '"id": "[^"]*"' "$OUT"/ham/kk__*.json 2>/dev/null | cut -d'"' -f4 | sort -u); do
    f="$OUT/ham/kkdetay/$g.json"
    if ! kos "$f" $S/kariyerkapisi-search/cli/src/cli.ts detail "$g"; then
      if grep -q NOT_FOUND "$f.err"; then HATAN=$((HATAN-1)); log "KK DETAY YOK $g (yalniz duyuru)"; rm -f "$f" "$f.err"; fi
    fi
  done
  portal_son kk ${#KK_TERIMLER[@]} ;;
knet)
  for t in "${TERIMLER[@]}"; do for il in "${ILLER[@]}"; do
    DENENEN=$((DENENEN+1)); pg=1
    while :; do
      f="$OUT/ham/knet__$(slug "$t")__$(slug "$il")__p$pg.json"
      if ! kos "$f" $S/kariyernet-search/cli/src/cli.ts search -q "$t" -l "$il" --jobage $GUN_KNET --page $pg; then
        grep -q BLOCKED "$f.err" && { BLOCKED=1; log "KNET BLOCKED: portal durduruldu"; break 3; }
        break
      fi
      pages=$(grep -m1 '"pages"' "$f" | tr -dc 0-9); sleep $BEKLE_KNET
      [ "${pages:-1}" -gt "$pg" ] || break; pg=$((pg+1))
    done
  done; done
  portal_son knet $(( ${#TERIMLER[@]} * ${#ILLER[@]} )) ;;
li|li_devam)
  # li_devam: LI_DEVAM="terim|il|baslangic_sayfa;..." ile kesilen kombinasyonlari surdurur
  if [ "$P" = li_devam ]; then IFS=';' read -ra KOMB <<< "${LI_DEVAM:-}"
  else KOMB=(); for t in "${TERIMLER[@]}"; do for il in "${ILLER[@]}"; do KOMB+=("$t|$il|1"); done; done; fi
  for k in "${KOMB[@]}"; do
    IFS='|' read -r t il pg <<< "$k"
    DENENEN=$((DENENEN+1))
    while :; do
      f="$OUT/ham/li__$(slug "$t")__$(slug "$il")__p$pg.json"
      ok=0
      for dene in 1 2 3; do  # zaman asimi rastgele: 3 deneme
        kos "$f" $S/linkedin-search/cli/src/cli.ts search -q "$t" -l "$il, Türkiye" --jobage $GUN_LI --page $pg && { ok=1; break; }
        sleep $BEKLE_LI_HATA
      done
      [ $ok = 1 ] || { log "LI VAZGECILDI $t $il p$pg"; break; }
      c=$(grep -m1 '"count"' "$f" | tr -dc 0-9); sleep $BEKLE_LI
      # Dolu sayfadan sonra gelen bos sayfa liste sonu olmayabilir (inceleme 4, S5: research x Istanbul
      # yeniden bulma orani 0,18). Ayni sayfayi bir kez, sonra sonraki sayfayi bir kez dene.
      if [ "${c:-0}" = 0 ] && [ "$pg" -gt 1 ]; then
        sleep $BEKLE_LI_HATA
        kos "$f" $S/linkedin-search/cli/src/cli.ts search -q "$t" -l "$il, Türkiye" --jobage $GUN_LI --page $pg \
          && c=$(grep -m1 '"count"' "$f" | tr -dc 0-9)
        if [ "${c:-0}" = 0 ]; then
          f2="$OUT/ham/li__$(slug "$t")__$(slug "$il")__p$((pg+1)).json"
          kos "$f2" $S/linkedin-search/cli/src/cli.ts search -q "$t" -l "$il, Türkiye" --jobage $GUN_LI --page $((pg+1)) \
            && c2=$(grep -m1 '"count"' "$f2" | tr -dc 0-9) || c2=0
          if [ "${c2:-0}" -gt 0 ]; then log "LI BOS SAYFA $t $il p$pg (p$((pg+1)) dolu, surduruluyor)"; pg=$((pg+1)); c=$c2
          else break; fi
        else
          log "LI BOS SAYFA $t $il p$pg (yeniden denemede dolu)"
        fi
      fi
      [ "${c:-0}" -ge 10 ] || break; pg=$((pg+1))
    done
  done
  portal_son "$P" "${#KOMB[@]}" ;;
rg)
  DENENEN=1; pg=1
  while :; do  # CLI istemci tarafinda 20/sayfa keser; --limit bunu asmaz
    f="$OUT/ham/rg__universite__peek__p$pg.json"
    kos "$f" $S/resmigazete-akademik-search/cli/src/cli.ts search --jobage $GUN_RG --peek --page $pg || break
    c=$(grep -m1 '"count"' "$f" | tr -dc 0-9)
    [ "${c:-0}" -ge 20 ] || break; pg=$((pg+1))
  done
  portal_son rg 1 ;;
iskur)
  for t in "${TERIMLER[@]}"; do for il in "${ILLER[@]}"; do
    DENENEN=$((DENENEN+1)); pg=1
    while :; do  # sunucu tarafinda 15/sayfa
      f="$OUT/ham/iskur__$(slug "$t")__$(slug "$il")__p$pg.json"
      kos "$f" $S/iskur-search/cli/src/cli.ts search -q "$t" -l "$il" --jobage $GUN_ISKUR --page $pg || break
      pages=$(grep -m1 '"pages"' "$f" | tr -dc 0-9)
      [ "${pages:-1}" -gt "$pg" ] || break; pg=$((pg+1))
    done
  done; done
  portal_son iskur $(( ${#TERIMLER[@]} * ${#ILLER[@]} )) ;;
vit)
  # Vacancies in Turkey: il parametresi guvenilmez; Turkiye suzgeci (varsayilan: yurt disi 'no' atilir,
  # 'unclear' kalir) ilan metnine bakar. --jobage kart yasina gore eski ilanin sayfasini acmaz.
  for t in "${TERIMLER[@]}"; do
    DENENEN=$((DENENEN+1)); pg=1
    while :; do
      f="$OUT/ham/vit__$(slug "$t")__TR__p$pg.json"
      if ! kos "$f" $S/vacanciesinturkey-search/cli/src/cli.ts search -q "$t" --jobage $GUN_VIT --page $pg; then
        grep -q BLOCKED "$f.err" && { BLOCKED=1; log "VIT BLOCKED: portal durduruldu"; break 2; }
        break
      fi
      total=$(grep -m1 '"total"' "$f" | tr -dc 0-9)
      [ $(( pg * VIT_SAYFA )) -lt "${total:-0}" ] || break; pg=$((pg+1))
    done
  done
  portal_son vit ${#TERIMLER[@]} ;;
*)
  log "BILINMEYEN PORTAL $P"; KOD=2 ;;
esac
done
log "BITTI $* kod=$KOD"
return $KOD
}

main "$@"; exit $?
