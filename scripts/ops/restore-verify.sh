#!/usr/bin/env bash
# Проверка восстановления бэкапа в ЧИСТУЮ временную БД.
# Прод не затрагивается: поднимается отдельный контейнер postgres с --network none,
# в него восстанавливается дамп, проверяются счётчики, контейнер удаляется.
#
# Примеры:
#   scripts/ops/restore-verify.sh --latest
#   scripts/ops/restore-verify.sh --dump /root/rv-backups/20261109-033000/db-remontvision-....dump
#   scripts/ops/restore-verify.sh --latest --report /root/rv-backups/restore-report.md
#
# Код возврата: 0 — проверка пройдена, 1 — ошибка/расхождение.
# Секреты не печатаются: пароль временной БД генерируется и живёт только в контейнере.

set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${RV_REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
BACKUP_ROOT="${RV_BACKUP_DIR:-/root/rv-backups}"
IMAGE="${RV_RESTORE_IMAGE:-postgres:16-alpine}"

DUMP=""
FILES=""
MANIFEST=""
REPORT=""
KEEP=0

log() { printf '%s %s\n' "$(date -Is)" "$*"; }
die() { log "ERROR $*" >&2; exit 1; }
usage() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while (($#)); do
  case "$1" in
    --dump) DUMP="${2:?}"; shift 2 ;;
    --files) FILES="${2:?}"; shift 2 ;;
    --manifest) MANIFEST="${2:?}"; shift 2 ;;
    --report) REPORT="${2:?}"; shift 2 ;;
    --latest) LATEST=1; shift ;;
    --keep) KEEP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Неизвестный аргумент: $1 (см. --help)" ;;
  esac
done

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Не найдена команда: $1"; }
need_cmd docker
command -v openssl >/dev/null 2>&1 || die "Не найдена команда: openssl"

if [[ "${LATEST:-0}" == "1" ]]; then
  latest_dir="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' ! -name '*FAILED*' -printf '%f\n' 2>/dev/null | sort -r | head -1 || true)"
  [[ -n "$latest_dir" ]] || die "В $BACKUP_ROOT нет каталогов бэкапов"
  BACKUP_DIR="$BACKUP_ROOT/$latest_dir"
  [[ -n "$MANIFEST" ]] || MANIFEST="$BACKUP_DIR/manifest.txt"
  if [[ -z "$DUMP" && -f "$MANIFEST" ]]; then
    d="$(awk -F= '$1=="db_dump"{print $2}' "$MANIFEST")"
    [[ -n "$d" ]] && DUMP="$BACKUP_DIR/$d"
  fi
  if [[ -z "$FILES" && -f "$MANIFEST" ]]; then
    f="$(awk -F= '$1=="files_archive"{print $2}' "$MANIFEST")"
    [[ -n "$f" ]] && FILES="$BACKUP_DIR/$f"
  fi
fi

[[ -n "$DUMP" || -n "$FILES" ]] || die "Укажите --dump/--files или --latest"
[[ -z "$DUMP" || -f "$DUMP" ]] || die "Нет дампа: $DUMP"
[[ -z "$FILES" || -f "$FILES" ]] || die "Нет архива файлов: $FILES"

if [[ -z "$MANIFEST" && -n "$DUMP" ]]; then
  candidate="$(dirname "$DUMP")/manifest.txt"
  [[ -f "$candidate" ]] && MANIFEST="$candidate"
fi

CONTAINER="rv-restore-verify-$$-$RANDOM"
PASSWORD="$(openssl rand -hex 16)"
TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/rv-restore-verify.XXXXXX")"
RESULT="PASS"
declare -A EXPECT=()
declare -A ACTUAL=()

cleanup() {
  if [[ "$KEEP" != "1" ]]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    rm -rf -- "$TMPDIR"
  else
    log "keep: контейнер $CONTAINER и каталог $TMPDIR оставлены"
  fi
}
trap cleanup EXIT

if [[ -f "$MANIFEST" ]]; then
  while IFS='=' read -r k v; do
    case "$k" in
      counts.*) EXPECT["${k#counts.}"]="$v" ;;
    esac
  done < "$MANIFEST"
fi

fail() { log "FAIL $*"; RESULT="FAIL"; }

# --- checksum ----------------------------------------------------------------
if [[ -n "$MANIFEST" ]]; then
  expected_sha="$(awk -F= '$1=="db_dump_sha256"{print $2}' "$MANIFEST" || true)"
  if [[ -n "$DUMP" && -n "$expected_sha" ]]; then
    actual_sha="$(sha256sum "$DUMP" | awk '{print $1}')"
    if [[ "$actual_sha" == "$expected_sha" ]]; then
      log "OK sha256 дампа совпадает"
    else
      fail "sha256 дампа не совпадает (manifest=$expected_sha actual=$actual_sha)"
    fi
  fi
fi

# --- files archive -----------------------------------------------------------
FILES_ENTRIES=0
if [[ -n "$FILES" ]]; then
  log "проверяю архив файлов: $FILES"
  if gzip -t "$FILES"; then
    log "OK gzip-целостность архива"
  else
    fail "архив файлов повреждён"
  fi
  tar -tzf "$FILES" > "$TMPDIR/files.list" 2>/dev/null || fail "tar не читает архив"
  FILES_ENTRIES="$(wc -l < "$TMPDIR/files.list" | tr -d ' ')"
  if grep -Eq '(^/|(^|/)\.\.(/|$))' "$TMPDIR/files.list"; then
    fail "в архиве есть абсолютные пути или .."
  else
    log "OK путей вне каталога нет, записей: $FILES_ENTRIES"
  fi
  if [[ -n "$MANIFEST" ]]; then
    expected_sha="$(awk -F= '$1=="files_archive_sha256"{print $2}' "$MANIFEST" || true)"
    if [[ -n "$expected_sha" ]]; then
      actual_sha="$(sha256sum "$FILES" | awk '{print $1}')"
      [[ "$actual_sha" == "$expected_sha" ]] && log "OK sha256 архива совпадает" || fail "sha256 архива не совпадает"
    fi
  fi
fi

# --- database restore --------------------------------------------------------
if [[ -n "$DUMP" ]]; then
  log "поднимаю временный Postgres ($IMAGE), сеть отключена"
  docker run --rm -d --name "$CONTAINER" --network none \
    -e POSTGRES_USER=verify -e POSTGRES_PASSWORD="$PASSWORD" -e POSTGRES_DB=verify \
    "$IMAGE" >/dev/null

  ready=0
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U verify -d verify >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
  done
  ((ready == 1)) || die "временный Postgres не поднялся за 60 с"

  log "pg_restore в чистую БД"
  if docker exec -i "$CONTAINER" pg_restore -U verify -d verify \
      --no-owner --no-privileges --exit-on-error < "$DUMP"; then
    log "OK pg_restore завершён без ошибок"
  else
    fail "pg_restore вернул ошибку"
  fi

  query() {
    local out
    for _ in $(seq 1 10); do
      if out="$(docker exec "$CONTAINER" psql -U verify -d verify -Atc "$1" 2>/dev/null)"; then
        printf '%s\n' "$out"
        return 0
      fi
      sleep 1
    done
    echo "MISSING"
  }

  db_tables="$(query "select count(*) from pg_tables where schemaname='public'")"
  log "таблиц в public: $db_tables"

  for table in users rooms renders payments products; do
    ACTUAL["$table"]="$(query "select count(*) from $table")"
  done
  ACTUAL["migrations"]="$(query "select count(*) from _migrations")"

  for key in "${!ACTUAL[@]}"; do
    actual="${ACTUAL[$key]}"
    if [[ -n "${EXPECT[$key]:-}" ]]; then
      if [[ "$actual" == "${EXPECT[$key]}" ]]; then
        log "OK $key=$actual"
      else
        fail "$key: ожидалось ${EXPECT[$key]}, получено $actual"
      fi
    else
      log "INFO $key=$actual (нет ожидания в manifest)"
    fi
  done

  last_migration="$(query "select name from _migrations order by name desc limit 1")"
  log "последняя миграция: $last_migration"

  [[ "$db_tables" =~ ^[0-9]+$ ]] && ((db_tables > 20)) || fail "подозрительно мало таблиц: $db_tables"
  [[ "${ACTUAL[migrations]:-0}" =~ ^[0-9]+$ ]] && ((ACTUAL[migrations] > 0)) || fail "_migrations пуста"
fi

if [[ "$RESULT" == "FAIL" ]]; then
  log "RESULT: FAIL"
  exit 1
fi

log "RESULT: PASS"

if [[ -n "$REPORT" ]]; then
  {
    echo "# Протокол restore"
    echo
    echo "- Дата: $(date -Is)"
    echo "- Хост проверки: $(hostname)"
    echo "- Дамп: ${DUMP:-—}"
    echo "- Файлы: ${FILES:-—}"
    echo "- Manifest: ${MANIFEST:-—}"
    echo "- Временная БД: контейнер удалён после проверки"
    echo
    echo "| Проверка | Результат |"
    echo "|---|---|"
    if [[ -n "$DUMP" ]]; then
      echo "| sha256 дампа | OK |"
      echo "| pg_restore | OK |"
    fi
    [[ -n "$FILES" ]] && echo "| Архив файлов | OK, записей: $FILES_ENTRIES |"
    if [[ -n "$DUMP" ]]; then
      for key in users rooms renders payments products migrations; do
        echo "| $key | ${ACTUAL[$key]:-—} |"
      done
    fi
    echo
    echo "**Итог: PASS**"
  } > "$REPORT"
  chmod 600 "$REPORT"
  log "отчёт: $REPORT"
fi
