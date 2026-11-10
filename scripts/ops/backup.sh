#!/usr/bin/env bash
# Бэкап БД и файлов «Ремонтвижн».
#
# Запуск на VPS из любого места:
#   /root/remontvision/scripts/ops/backup.sh
#   /root/remontvision/scripts/ops/backup.sh --db-only
#   /root/remontvision/scripts/ops/backup.sh --weekly
#   /root/remontvision/scripts/ops/backup.sh --pre-deploy
#
# Что делает:
#   1. pg_dump основной БД в custom-формате (-Fc) + проверка pg_restore --list.
#   2. tar.gz каталога /app/data (uploads/renders/products/style-images/...).
#   3. manifest.txt с версией, коммитом, размерами, sha256 и счётчиками таблиц.
#   4. Опционально копирует каталог бэкапа в rclone-remote (вне VPS).
#   5. Чистит локальные копии сверх RV_BACKUP_LOCAL_KEEP.
#
# Настройки — переменными окружения (значения по умолчанию — для VPS):
#   RV_BACKUP_DIR=/root/rv-backups            каталог локальных бэкапов
#   RV_BACKUP_REMOTE=                         rclone-remote, напр. rv-s3:remontvision-backups
#   RV_BACKUP_REQUIRE_REMOTE=0                1 = падать, если remote не задан/недоступен
#   RV_BACKUP_LOCAL_KEEP=2                    сколько последних каталогов хранить локально
#   RV_BACKUP_MIN_FREE_MB=700                 минимум свободного места перед файловым архивом
#   RV_BACKUP_CATALOG=0                       1 = включить дамп catalog-db (weekly включает сам)
#   RV_DB_SERVICE=db  RV_DB_USER=remont  RV_DB_NAME=remontvision
#   RV_APP_SERVICE=app  RV_APP_DATA_DIR=/app/data
#   RV_CATALOG_DB_SERVICE=catalog-db  RV_CATALOG_DB_USER=catalog  RV_CATALOG_DB_NAME=catalog
#
# Код возврата: 0 — успех, 1 — ошибка, 2 — ошибка конфигурации.
# Секреты не читаются и не печатаются: pg_dump идёт через локальный сокет контейнера.

set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${RV_REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

BACKUP_ROOT="${RV_BACKUP_DIR:-/root/rv-backups}"
REMOTE="${RV_BACKUP_REMOTE:-}"
REQUIRE_REMOTE="${RV_BACKUP_REQUIRE_REMOTE:-0}"
LOCAL_KEEP="${RV_BACKUP_LOCAL_KEEP:-2}"
MIN_FREE_MB="${RV_BACKUP_MIN_FREE_MB:-700}"
WITH_CATALOG="${RV_BACKUP_CATALOG:-0}"

DB_SERVICE="${RV_DB_SERVICE:-db}"
DB_USER="${RV_DB_USER:-remont}"
DB_NAME="${RV_DB_NAME:-remontvision}"
APP_SERVICE="${RV_APP_SERVICE:-app}"
APP_DATA_DIR="${RV_APP_DATA_DIR:-/app/data}"
CATALOG_DB_SERVICE="${RV_CATALOG_DB_SERVICE:-catalog-db}"
CATALOG_DB_USER="${RV_CATALOG_DB_USER:-catalog}"
CATALOG_DB_NAME="${RV_CATALOG_DB_NAME:-catalog}"

MODE="full"          # full | db | files
KIND="daily"         # daily | weekly | predeploy | manual
DRY_RUN=0

log() { printf '%s %s\n' "$(date -Is)" "$*"; }
warn() { log "WARN $*" >&2; }
die() { log "ERROR $*" >&2; exit 1; }
usage() { sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while (($#)); do
  case "$1" in
    --db-only) MODE="db" ;;
    --files-only) MODE="files" ;;
    --weekly) KIND="weekly"; WITH_CATALOG=1 ;;
    --pre-deploy) KIND="predeploy"; MODE="db" ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Неизвестный аргумент: $1 (см. --help)" ;;
  esac
  shift
done

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Не найдена команда: $1"; }

compose() { ( cd "$REPO_DIR" && docker compose "$@" ); }

running_service() {
  compose ps --status running --services 2>/dev/null | grep -qx "$1"
}

free_mb() {
  df -Pm "$1" | awk 'NR==2 {print $4}'
}

counts_for() {
  local svc="$1" user="$2" db="$3"
  compose exec -T "$svc" psql -U "$user" -d "$db" -Atc "
    select 'users='||count(*) from users
    union all select 'rooms='||count(*) from rooms
    union all select 'renders='||count(*) from renders
    union all select 'payments='||count(*) from payments
    union all select 'products='||count(*) from products
    union all select 'migrations='||count(*) from _migrations
  " 2>/dev/null || true
}

pg_dump_custom() {
  local svc="$1" user="$2" db="$3" out="$4"
  compose exec -T "$svc" pg_dump -U "$user" -d "$db" \
    -Fc -Z6 --no-owner --no-privileges > "$out"
  [[ -s "$out" ]] || die "Пустой дамп: $out"
  compose exec -T "$svc" pg_restore --list < "$out" > "$out.list"
  grep -q 'TABLE DATA' "$out.list" || die "Дамп не содержит TABLE DATA: $out"
}

validate_file_archive() {
  local archive="$1"
  [[ -s "$archive" ]] || die "Пустой архив файлов: $archive"
  gzip -t "$archive" || die "Архив файлов повреждён: $archive"
}

# --- проверки до записи -------------------------------------------------------
need_cmd docker
need_cmd flock
need_cmd sha256sum
need_cmd gzip
command -v git >/dev/null 2>&1 || true

[[ -d "$REPO_DIR" ]] || die "Нет каталога репозитория: $REPO_DIR"
[[ -f "$REPO_DIR/docker-compose.yml" ]] || die "Нет docker-compose.yml в $REPO_DIR"

if [[ "$REQUIRE_REMOTE" == "1" && -z "$REMOTE" ]]; then
  die "RV_BACKUP_REQUIRE_REMOTE=1, но RV_BACKUP_REMOTE не задан"
fi
if [[ -n "$REMOTE" ]]; then
  need_cmd rclone
fi

if ((DRY_RUN)); then
  log "dry-run: repo=$REPO_DIR mode=$MODE kind=$KIND root=$BACKUP_ROOT"
  log "dry-run: remote=${REMOTE:-<none>} require_remote=$REQUIRE_REMOTE keep=$LOCAL_KEEP"
  log "dry-run: db=$DB_SERVICE/$DB_NAME app=$APP_SERVICE:$APP_DATA_DIR"
  if ((WITH_CATALOG)); then log "dry-run: catalog=$CATALOG_DB_SERVICE/$CATALOG_DB_NAME"; fi
  exit 0
fi

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

exec 9>"$BACKUP_ROOT/.backup.lock"
flock -n 9 || die "Бэкап уже выполняется (lock: $BACKUP_ROOT/.backup.lock)"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_ROOT/$STAMP"
mkdir -p "$OUT"
chmod 700 "$OUT"

trap 'rc=$?; if ((rc != 0)); then log "ERROR backup failed rc=$rc dir=$OUT" >&2; printf "failed_at=%s\nrc=%s\n" "$(date -Is)" "$rc" > "$OUT/FAILED"; fi' EXIT

log "backup start kind=$KIND mode=$MODE dir=$OUT"
running_service "$DB_SERVICE" || die "Сервис БД не запущен: $DB_SERVICE"

# --- БД ----------------------------------------------------------------------
DB_DUMP=""
if [[ "$MODE" == "full" || "$MODE" == "db" ]]; then
  DB_DUMP="$OUT/db-$DB_NAME-$STAMP.dump"
  log "pg_dump $DB_NAME -> $DB_DUMP"
  pg_dump_custom "$DB_SERVICE" "$DB_USER" "$DB_NAME" "$DB_DUMP"
  chmod 600 "$DB_DUMP" "$DB_DUMP.list"
fi

CATALOG_DUMP=""
if ((WITH_CATALOG)); then
  if running_service "$CATALOG_DB_SERVICE"; then
    CATALOG_DUMP="$OUT/db-$CATALOG_DB_NAME-$STAMP.dump"
    log "pg_dump $CATALOG_DB_NAME -> $CATALOG_DUMP"
    pg_dump_custom "$CATALOG_DB_SERVICE" "$CATALOG_DB_USER" "$CATALOG_DB_NAME" "$CATALOG_DUMP"
    chmod 600 "$CATALOG_DUMP" "$CATALOG_DUMP.list"
  else
    warn "catalog-db не запущен — дамп каталога пропущен"
  fi
fi

# --- файлы -------------------------------------------------------------------
FILES_ARCHIVE=""
if [[ "$MODE" == "full" || "$MODE" == "files" ]]; then
  avail="$(free_mb "$BACKUP_ROOT")"
  ((avail >= MIN_FREE_MB)) || die "Мало места: свободно ${avail}MB, нужно ${MIN_FREE_MB}MB"
  FILES_ARCHIVE="$OUT/files-$STAMP.tar.gz"
  log "tar $APP_DATA_DIR -> $FILES_ARCHIVE (free=${avail}MB)"
  if running_service "$APP_SERVICE"; then
    compose exec -T "$APP_SERVICE" tar -czf - -C "$APP_DATA_DIR" . > "$FILES_ARCHIVE"
  else
    warn "app не запущен — архивирую том через одноразовый контейнер"
    compose run --rm --no-deps -T "$APP_SERVICE" tar -czf - -C "$APP_DATA_DIR" . > "$FILES_ARCHIVE"
  fi
  validate_file_archive "$FILES_ARCHIVE"
  chmod 600 "$FILES_ARCHIVE"
fi

# --- manifest ----------------------------------------------------------------
MANIFEST="$OUT/manifest.txt"
{
  echo "backup_version=1"
  echo "kind=$KIND"
  echo "mode=$MODE"
  echo "created_at=$(date -Is)"
  echo "hostname=$(hostname)"
  echo "repo_commit=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "db_service=$DB_SERVICE"
  echo "db_name=$DB_NAME"
  echo "app_service=$APP_SERVICE"
  echo "app_data_dir=$APP_DATA_DIR"
  if [[ -n "$DB_DUMP" ]]; then
    echo "db_dump=$(basename "$DB_DUMP")"
    echo "db_dump_bytes=$(stat -c %s "$DB_DUMP")"
    echo "db_dump_sha256=$(sha256sum "$DB_DUMP" | awk '{print $1}')"
    echo "pg_dump_version=$(compose exec -T "$DB_SERVICE" pg_dump --version | tr -d '\r')"
    counts="$(counts_for "$DB_SERVICE" "$DB_USER" "$DB_NAME")"
    if [[ -n "$counts" ]]; then
      while IFS= read -r line; do echo "counts.$line"; done <<< "$counts"
    fi
  fi
  if [[ -n "$CATALOG_DUMP" ]]; then
    echo "catalog_dump=$(basename "$CATALOG_DUMP")"
    echo "catalog_dump_bytes=$(stat -c %s "$CATALOG_DUMP")"
    echo "catalog_dump_sha256=$(sha256sum "$CATALOG_DUMP" | awk '{print $1}')"
  fi
  if [[ -n "$FILES_ARCHIVE" ]]; then
    echo "files_archive=$(basename "$FILES_ARCHIVE")"
    echo "files_archive_bytes=$(stat -c %s "$FILES_ARCHIVE")"
    echo "files_archive_sha256=$(sha256sum "$FILES_ARCHIVE" | awk '{print $1}')"
  fi
} > "$MANIFEST"
chmod 600 "$MANIFEST"

# --- off-site ----------------------------------------------------------------
if [[ -n "$REMOTE" ]]; then
  log "rclone copy -> $REMOTE/$STAMP"
  rclone copy "$OUT" "$REMOTE/$STAMP" --immutable --transfers 2 --checkers 4 --stats-one-line -q
  rclone check "$OUT" "$REMOTE/$STAMP" --one-way --size-only -q
  echo "remote=$REMOTE/$STAMP" >> "$MANIFEST"
  log "off-site OK: $REMOTE/$STAMP"
elif [[ "$REQUIRE_REMOTE" == "1" ]]; then
  die "Remote обязателен, но не настроен"
else
  warn "RV_BACKUP_REMOTE не задан — копия только на VPS"
fi

# --- retention ---------------------------------------------------------------
# Локально храним только последние N каталогов; глубокое хранение — на remote.
dirs=()
while IFS= read -r d; do dirs+=("$d"); done < <(
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -printf '%f\n' | sort -r
)
for ((i = LOCAL_KEEP; i < ${#dirs[@]}; i++)); do
  log "prune local: ${dirs[$i]}"
  rm -rf -- "${BACKUP_ROOT:?}/${dirs[$i]}"
done

log "backup done dir=$OUT"
du -sh "$OUT" 2>/dev/null || true
