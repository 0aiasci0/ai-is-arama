#!/usr/bin/env bash
# TR portal taramasi: terim x il x donem. Ham JSON -> $OUT/ham/
# Kullanim: bash tools/tr_tarama.sh <cikti_klasoru> <portal...>
# Portal: kk | knet | li | rg | iskur
set -u
cd "$(dirname "$0")/.."
OUT="$1"; shift
S=.agents/skills
mkdir -p "$OUT/ham"
LOG="$OUT/tarama.log"

TERIMLER=("ekonomist" "araştırmacı" "economist" "research" "veri analisti" "data analyst" "data scientist")
ILLER=("Ankara" "İstanbul")
GUN_KK=15; GUN_KNET=15; GUN_LI=30; GUN_RG=16; GUN_ISKUR=15
BEKLE_KNET=20; BEKLE_LI=3; BEKLE_LI_HATA=15

slug() { echo "$1" | sed 's/ /_/g; s/ş/s/g; s/ı/i/g; s/İ/I/g; s/ç/c/g; s/ğ/g/g; s/ö/o/g; s/ü/u/g'; }
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$LOG"; }

kos() {  # kos <dosya> <cli> args...
  local f="$1"; shift
  if bun run "$@" --format json > "$f" 2> "$f.err"; then
    log "OK $(basename "$f") count=$(grep -m1 '"count"' "$f" | tr -dc 0-9) total=$(grep -m1 '"total"' "$f" | tr -dc 0-9)"
    rm -f "$f.err"; return 0
  else
    log "HATA $(basename "$f") $(cat "$f.err")"; return 1
  fi
}

for P in "$@"; do
case "$P" in
kk)
  for t in "${TERIMLER[@]}"; do for il in "${ILLER[@]}" "Türkiye Geneli"; do
    kos "$OUT/ham/kk__$(slug "$t")__$(slug "$il").json" $S/kariyerkapisi-search/cli/src/cli.ts search -q "$t" -l "$il" --jobage $GUN_KK --limit 500
  done; done ;;
knet)
  for t in "${TERIMLER[@]}"; do for il in "${ILLER[@]}"; do
    pg=1
    while :; do
      f="$OUT/ham/knet__$(slug "$t")__$(slug "$il")__p$pg.json"
      if ! kos "$f" $S/kariyernet-search/cli/src/cli.ts search -q "$t" -l "$il" --jobage $GUN_KNET --page $pg; then
        grep -q BLOCKED "$f.err" && { log "KNET BLOCKED: portal durduruldu"; break 3; }
        break
      fi
      pages=$(grep -m1 '"pages"' "$f" | tr -dc 0-9); sleep $BEKLE_KNET
      [ "${pages:-1}" -gt "$pg" ] || break; pg=$((pg+1))
    done
  done; done ;;
li|li_devam)
  # li_devam: LI_DEVAM="terim|il|baslangic_sayfa;..." ile kesilen kombinasyonlari surdurur
  if [ "$P" = li_devam ]; then IFS=';' read -ra KOMB <<< "$LI_DEVAM"
  else KOMB=(); for t in "${TERIMLER[@]}"; do for il in "${ILLER[@]}"; do KOMB+=("$t|$il|1"); done; done; fi
  for k in "${KOMB[@]}"; do
    IFS='|' read -r t il pg <<< "$k"
    while :; do
      f="$OUT/ham/li__$(slug "$t")__$(slug "$il")__p$pg.json"
      ok=0
      for dene in 1 2 3; do  # zaman asimi rastgele: 3 deneme
        kos "$f" $S/linkedin-search/cli/src/cli.ts search -q "$t" -l "$il, Türkiye" --jobage $GUN_LI --page $pg && { ok=1; break; }
        sleep $BEKLE_LI_HATA
      done
      [ $ok = 1 ] || { log "LI VAZGECILDI $t $il p$pg"; break; }
      c=$(grep -m1 '"count"' "$f" | tr -dc 0-9); sleep $BEKLE_LI
      [ "${c:-0}" -ge 10 ] || break; pg=$((pg+1))
    done
  done ;;
rg)
  pg=1
  while :; do  # CLI istemci tarafinda 20/sayfa keser; --limit bunu asmaz
    f="$OUT/ham/rg__universite__peek__p$pg.json"
    kos "$f" $S/resmigazete-akademik-search/cli/src/cli.ts search --jobage $GUN_RG --peek --page $pg || break
    c=$(grep -m1 '"count"' "$f" | tr -dc 0-9)
    [ "${c:-0}" -ge 20 ] || break; pg=$((pg+1))
  done ;;
iskur)
  for t in "${TERIMLER[@]}"; do for il in "${ILLER[@]}"; do
    pg=1
    while :; do  # sunucu tarafinda 15/sayfa
      f="$OUT/ham/iskur__$(slug "$t")__$(slug "$il")__p$pg.json"
      kos "$f" $S/iskur-search/cli/src/cli.ts search -q "$t" -l "$il" --jobage $GUN_ISKUR --page $pg || break
      pages=$(grep -m1 '"pages"' "$f" | tr -dc 0-9)
      [ "${pages:-1}" -gt "$pg" ] || break; pg=$((pg+1))
    done
  done; done ;;
esac
done
log "BITTI $*"
