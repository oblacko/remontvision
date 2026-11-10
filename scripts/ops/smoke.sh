#!/usr/bin/env bash
# Smoke после деплоя/отката. Только GET-запросы.
#
#   scripts/ops/smoke.sh
#   scripts/ops/smoke.sh https://www.remontvision.ru
#
# Проверяет: /api/health (200, ok:true, платежи/возвраты), / (id="root"), /app, /offer.
# Код возврата: 0 — PASS, 1 — FAIL.

set -Eeuo pipefail
export LC_ALL=C

BASE_URL="${1:-${RV_PUBLIC_URL:-https://www.remontvision.ru}}"
BASE_URL="${BASE_URL%/}"
EXPECT_PAYMENTS="${RV_SMOKE_PAYMENTS:-true}"
EXPECT_REFUNDS="${RV_SMOKE_REFUNDS:-false}"

curl_retry() { curl -fsS -m 15 --retry 4 --retry-delay 5 --retry-connrefused "$@"; }

fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }
ok() { printf 'OK   %s\n' "$*"; }

echo "smoke: $BASE_URL $(date -Is)"

health="$(curl_retry "$BASE_URL/api/health")" || fail "GET /api/health"
grep -q '"ok":true' <<< "$health" || fail "/api/health: ok != true: ${health:0:300}"
grep -q "\"payments_enabled\":$EXPECT_PAYMENTS" <<< "$health" || fail "/api/health: payments_enabled != $EXPECT_PAYMENTS"
grep -q "\"refunds_enabled\":$EXPECT_REFUNDS" <<< "$health" || fail "/api/health: refunds_enabled != $EXPECT_REFUNDS"
ok "/api/health"

root="$(curl_retry "$BASE_URL/")" || fail "GET /"
grep -q 'id="root"' <<< "$root" || fail "/: нет id=\"root\""
ok "/ (id=root)"

curl_retry -o /dev/null "$BASE_URL/app" || fail "GET /app"
ok "/app"

curl_retry -o /dev/null "$BASE_URL/offer" || fail "GET /offer"
ok "/offer"

echo "PASS smoke: $BASE_URL"
