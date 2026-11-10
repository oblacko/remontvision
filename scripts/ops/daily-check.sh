#!/usr/bin/env bash
# Ежедневная проверка эксплуатации: health, контейнеры, диск, бэкапы, ошибки рендера,
# платежи, 429, срок сертификата. Только чтение, прод не меняет.
#
# Запуск на VPS:
#   /root/remontvision/scripts/ops/daily-check.sh
#   /root/remontvision/scripts/ops/daily-check.sh --strict
#
# Настройки:
#   RV_HEALTH_URL=http://127.0.0.1:3000/api/health
#   RV_PUBLIC_URL=https://www.remontvision.ru   (для TLS; пусто = пропустить)
#   RV_BACKUP_DIR=/root/rv-backups
#   RV_CHECK_BACKUPS=1
#   RV_BACKUP_MAX_AGE_H=26
#   RV_RENDER_ERROR_WARN=10   (% от done+error)
#   RV_RENDER_ERROR_CRIT=25
#   RV_DISK_WARN=80  RV_DISK_CRIT=90
#   RV_EXPECTED_SERVICES="app db"
#
# Код возврата: 0 — OK/WARN, 1 — CRIT, 2 — ошибка запуска. --strict: WARN тоже 1.

set -Eeuo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${RV_REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
HEALTH_URL="${RV_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PUBLIC_URL="${RV_PUBLIC_URL-https://www.remontvision.ru}"
BACKUP_DIR="${RV_BACKUP_DIR:-/root/rv-backups}"
CHECK_BACKUPS="${RV_CHECK_BACKUPS:-1}"
BACKUP_MAX_AGE_H="${RV_BACKUP_MAX_AGE_H:-26}"
RENDER_WARN="${RV_RENDER_ERROR_WARN:-10}"
RENDER_CRIT="${RV_RENDER_ERROR_CRIT:-25}"
DISK_WARN="${RV_DISK_WARN:-80}"
DISK_CRIT="${RV_DISK_CRIT:-90}"
EXPECTED_SERVICES="${RV_EXPECTED_SERVICES:-app db}"
SINCE="${RV_CHECK_SINCE:-24h}"
STRICT=0

for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

CRIT=0
WARN=0
ok()   { printf '  [OK]   %s\n' "$*"; }
warn() { printf '  [WARN] %s\n' "$*"; WARN=$((WARN + 1)); }
crit() { printf '  [CRIT] %s\n' "$*"; CRIT=$((CRIT + 1)); }
info() { printf '  [INFO] %s\n' "$*"; }

compose() { ( cd "$REPO_DIR" && docker compose "$@" ); }

echo "== remontvision daily-check $(date -Is) =="

# --- health ------------------------------------------------------------------
echo "-- health"
if body="$(curl -fsS -m 10 "$HEALTH_URL" 2>/dev/null)"; then
  if grep -q '"ok":true' <<< "$body"; then
    ok "$HEALTH_URL -> ok:true"
  else
    crit "$HEALTH_URL отвечает, но ok != true"
  fi
else
  crit "$HEALTH_URL недоступен"
fi

if [[ -n "$PUBLIC_URL" ]]; then
  pub="${PUBLIC_URL%/}/api/health"
  if pbody="$(curl -fsS -m 10 "$pub" 2>/dev/null)"; then
    grep -q '"ok":true' <<< "$pbody" && ok "$pub -> ok:true" || crit "$pub ok != true"
  else
    crit "$pub недоступен (nginx/TLS/DNS?)"
  fi

  # --- TLS -------------------------------------------------------------------
  host="$(sed -E 's#^https?://([^/:]+).*#\1#' <<< "$PUBLIC_URL")"
  if command -v openssl >/dev/null 2>&1; then
    end="$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
    if [[ -n "$end" ]]; then
      end_ts="$(date -d "$end" +%s 2>/dev/null || echo 0)"
      now_ts="$(date +%s)"
      days=$(( (end_ts - now_ts) / 86400 ))
      if ((days < 0)); then crit "TLS $host истёк"
      elif ((days < 7)); then crit "TLS $host истекает через ${days} дн."
      elif ((days < 14)); then warn "TLS $host истекает через ${days} дн."
      else ok "TLS $host: ${days} дн."
      fi
    else
      warn "не удалось прочитать срок TLS $host"
    fi
  fi
fi

# --- контейнеры --------------------------------------------------------------
echo "-- containers"
if running="$(compose ps --status running --services 2>/dev/null)"; then
  for svc in $EXPECTED_SERVICES; do
    if grep -qx "$svc" <<< "$running"; then ok "$svc running"; else crit "$svc не запущен"; fi
  done
  for svc in catalog catalog-db; do
    if grep -qx "$svc" <<< "$running"; then ok "$svc running"; else warn "$svc не запущен"; fi
  done
  bad="$(compose ps 2>/dev/null | grep -E 'unhealthy|restarting|Exit [1-9]' || true)"
  [[ -n "$bad" ]] && crit "проблемные контейнеры: $(tr '\n' ';' <<< "$bad")" || ok "нет unhealthy/restarting"
else
  crit "docker compose ps не выполнился"
fi

app_id="$(compose ps -q app 2>/dev/null || true)"
if [[ -n "$app_id" ]]; then
  restarts="$(docker inspect -f '{{.RestartCount}}' "$app_id" 2>/dev/null || echo 0)"
  if [[ "$restarts" =~ ^[0-9]+$ ]] && ((restarts > 3)); then warn "app перезапускался $restarts раз"; else ok "app restarts=$restarts"; fi
fi

# --- диск --------------------------------------------------------------------
echo "-- disk"
usage="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
avail="$(df -Pm / | awk 'NR==2 {print $4}')"
if [[ "$usage" =~ ^[0-9]+$ ]]; then
  if ((usage >= DISK_CRIT)); then crit "диск / занят ${usage}% (свободно ${avail}MB)"
  elif ((usage >= DISK_WARN)); then warn "диск / занят ${usage}% (свободно ${avail}MB)"
  else ok "диск / занят ${usage}% (свободно ${avail}MB)"
  fi
fi
inodes="$(df -Pi / | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ "$inodes" =~ ^[0-9]+$ ]] && ((inodes >= 90)); then crit "inodes / заняты ${inodes}%"; else ok "inodes / ${inodes}%"; fi

# --- бэкапы ------------------------------------------------------------------
echo "-- backups"
if [[ "$CHECK_BACKUPS" == "1" ]]; then
  latest_manifest="$(find "$BACKUP_DIR" -mindepth 2 -maxdepth 2 -name manifest.txt -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | awk '{print $2}')"
  if [[ -z "$latest_manifest" ]]; then
    crit "в $BACKUP_DIR нет manifest.txt (бэкапов не было?)"
  else
    age_h=$(( ( $(date +%s) - $(stat -c %Y "$latest_manifest") ) / 3600 ))
    dir="$(dirname "$latest_manifest")"
    if [[ -f "$dir/FAILED" ]]; then
      crit "последний бэкап помечен FAILED: $dir"
    elif ((age_h > BACKUP_MAX_AGE_H)); then
      crit "последнему бэкапу ${age_h} ч (порог ${BACKUP_MAX_AGE_H} ч)"
    else
      ok "последний бэкап ${age_h} ч назад: $(basename "$dir")"
    fi
    if grep -q '^db_dump=' "$latest_manifest"; then ok "в бэкапе есть дамп БД"; else crit "в manifest нет db_dump"; fi
    if grep -q '^files_archive=' "$latest_manifest"; then ok "в бэкапе есть архив файлов"; else warn "в manifest нет files_archive"; fi
    if grep -q '^remote=' "$latest_manifest"; then
      ok "off-site: $(awk -F= '$1=="remote"{print $2}' "$latest_manifest")"
    else
      warn "off-site копия не отмечена в manifest"
    fi
  fi
else
  info "проверка бэкапов отключена"
fi

# --- логи приложения ---------------------------------------------------------
echo "-- app logs ($SINCE)"
if logs="$(compose logs --since "$SINCE" --no-color app 2>/dev/null)"; then
  ev() { grep -c "\"event\":\"$1\"" <<< "$logs" || true; }
  done_n="$(ev render_done)"
  err_n="$(ev render_error)"
  timeout_n="$(ev render_timeout)"
  webhook_err="$(ev webhook_error)"
  payment_n="$(ev payment_created)"
  credit_back="$(ev credit_restored)"
  n429="$(grep -cE '("status"[[:space:]]*:[[:space:]]*429|HTTP[ /]429|429 Too Many|rate.?limit)' <<< "$logs" || true)"

  info "render_done=$done_n render_error=$err_n render_timeout=$timeout_n credit_restored=$credit_back"
  info "payments_created=$payment_n webhook_error=$webhook_err 429_lines=$n429"

  total=$((done_n + err_n))
  if ((total >= 10)); then
    pct=$(( err_n * 100 / total ))
    if ((pct >= RENDER_CRIT)); then crit "доля render_error ${pct}% (${err_n}/${total})"
    elif ((pct >= RENDER_WARN)); then warn "доля render_error ${pct}% (${err_n}/${total})"
    else ok "доля render_error ${pct}% (${err_n}/${total})"
    fi
  elif ((total > 0)); then
    info "мало рендеров для оценки доли (${total})"
  fi

  ((webhook_err > 0)) && warn "webhook_error за ${SINCE}: $webhook_err" || ok "webhook_error нет"
  ((n429 > 0)) && warn "строк с 429 за ${SINCE}: $n429" || ok "429 не встречался"

  if ((err_n > 0)); then
    echo "  -- render_error по stage:"
    grep '"event":"render_error"' <<< "$logs" \
      | grep -o '"stage":"[^"]*"' | sort | uniq -c | sed 's/^/    /' || true
    echo "  -- последние ошибки:"
    grep '"event":"render_error"' <<< "$logs" | tail -5 | cut -c1-300 | sed 's/^/    /' || true
  fi
else
  warn "не удалось прочитать логи app"
fi

# --- итог --------------------------------------------------------------------
echo
if ((CRIT > 0)); then
  echo "RESULT: CRIT (crit=$CRIT warn=$WARN)"
  exit 1
elif ((WARN > 0)); then
  echo "RESULT: WARN (warn=$WARN)"
  ((STRICT)) && exit 1 || exit 0
else
  echo "RESULT: OK"
  exit 0
fi
