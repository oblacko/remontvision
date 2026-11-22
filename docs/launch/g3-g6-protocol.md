# G3/G6 — протокол живой проверки оплаты (Robokassa) и входа (OTP + Яндекс ID)

> Tech Lead. Статус: **протокол + запрос разрешения** (без выполнения платежа и live-входа).
> Дата составления: 2026-11-21. Задача: REM-38. Gates: `G3` (LAUNCH-GATES.md) и `G6`.
> Каноническая копия — документ задачи `g3-g6-protocol` (Paperclip). Этот файл — рабочая копия для launch-кита.

## 0. Назначение и границы

Этот документ — **пошаговый протокол** для исполнителя (dev/QA + ops + владелец), который будет запущен **после** отдельного разрешения владельца (approval-карточка). В рамках REM-38 **ничего не выполняется**: ни платёж, ни вход, ни платные генерации.

**Scope:** проверить на проде `https://www.remontvision.ru`:
- **G3** — тестовый платёж Robokassa: кредиты начислены ровно 1 раз, повторный ResultURL идемпотентен, сумма проверяется, возврат кредита при сбое/отмене генерации работает.
- **G6** — вход живым пользователем: OTP-письмо доставляется и код принимается; Яндекс ID OAuth работает, повторный callback отклоняется.

**Non-goals:** реальный платёж, реальные деньги, платные генерации на продакшн-данных, изменение цен/пакетов, включение возвратов (`REFUNDS_ENABLED`), юридическая проверка документов, реклама.

---

## 1. Предусловия, доступы и разрешения

### 1.1. Кто что делает (ответственные)

| Роль | Действие |
|---|---|
| Владелец | Даёт разрешение (approval), тестовые пароли Robokassa, тестовый почтовый ящик, тестовый Яндекс-аккаунт, решает про test-режим на проде vs staging |
| ops | SSH на VPS, доступ к БД (`psql`), (опц.) управление воркером/контейнерами на время теста, бэкап перед тестом |
| dev | Чтение логов (`otp_dev_code`, `render_error`, `payment_succeeded`, `robokassa_result_*`), сверка записей БД, исполнение curl-запросов |
| QA | Прохождение сценариев, фиксация PASS/FAIL в протоколе |

### 1.2. Нужные доступы

| Доступ/ресурс | Зачем | Кто выдаёт |
|---|---|---|
| SSH на VPS (прод) | логи приложения, `docker compose exec db psql` | владелец/ops |
| Prod БД (чтение): `payments`, `credit_txn`, `users`, `auth_identities`, `otp_codes`, `oauth_states`, `sessions` | сверка ожидаемых записей | владелец/ops |
| Тестовые пароли Robokassa (тестовая пара `ROBOKASSA_PASSWORD_1/2/3`) | test-режим, подпись ResultURL | владелец (ЛК Robokassa) |
| Возможность включить `ROBOKASSA_TEST=1` (на staging или короткое окно на проде) | тестовый платёж | владелец/ops |
| Реальный почтовый ящик (тестовый, не прод-пользователя) | G6 OTP | владелец/QA |
| Яндекс ID тестовый аккаунт с подтверждённым `default_email` | G6 OAuth | владелец/QA |
| Подтверждение, что mailer настроен (Resend или SMTP) и письма реально уходят | G6 OTP | dev (логи `mail_error`/`otp_sent`) |

### 1.3. Разрешения (запрашиваются отдельно)

1. **Разрешение владельца на тестовый платёж Robokassa и тестовый аккаунт** — создаётся approval-карточкой `request_board_approval` (см. раздел 7). Без него G3/G6 **не выполнять**.
2. Разрешение на включение `ROBOKASSA_TEST=1` на проде (если выбран вариант «на проде», а не staging).
3. Разрешение на платные генерации, если тест возврата кредита требует реального рендера (в протоколе — обход через отмену `queued`-рендера, рендер не доходит до платного вызова).
4. Разрешение на удаление/маркировку тестовых записей после теста.

> **Важно.** Правило REM-38: реальные платежи и платные генерации — только с отдельным разрешением владельца. «Симуляция ResultURL с боевыми паролями на проде» = фиктивное начисление кредитов; **запрещено**. Симуляция допустима только в test-режиме (тестовые пароли) или на staging.

---

## 2. Порядок и зависимости

```
G6.1 OTP-вход (создаём тестовый аккаунт + получаем сессию)
   └── аккаунт используется в G3
G6.2 Яндекс ID (тестовый аккаунт, повторный callback)
G3.1 предусловия (health/packs, бэкап, test-режим)
G3.2 создание платежа (payments row)
G3.3 тестовый платёж → ResultURL → начисление кредитов ровно 1 раз
G3.4 повторный ResultURL (идемпотентность) + негативные (bad signature / amount mismatch)
G3.5 возврат кредита при отмене/сбое генерации (ровно 1 раз)
G3.6 очистка тестовых данных, откат test-режима, фиксация
```

Тестовый аккаунт — **отдельный**, с e-mail вида `test-g3g6-<date>@<владелец-домен>`, не пересекается с прод-пользователями.

---

## 3. G6 — вход живым пользователем

### 3.1. OTP (e-mail код)

**Предусловие:** mailer настроен. Проверить в логах/конфиге, что задан `RESEND_API_KEY` (или `SMTP_URL`). Если письма падают — в логе `mail_error`, а не `otp_sent`.

| # | Шаг (команда) | Ожидаемый результат | PASS/FAIL |
|---|---|---|---|
| 1 | `curl -sS https://www.remontvision.ru/api/health` | `ok:true`, `payments_enabled:true`, `payment_provider:robokassa`, `refunds_enabled:false` | — |
| 2 | `curl -sS -X POST https://www.remontvision.ru/api/auth/request-code -H 'Content-Type: application/json' -d '{"email":"test-g3g6-20261121@<домен>"}'` | `200 {"ok":true}` | PASS: 200; FAIL: 4xx/5xx |
| 3 | Ждать письмо, замерить время доставки | Письмо с 6-значным кодом; зафиксировать задержку | PASS: ≤ 60 c (рекомендация); записать факт. FAIL: > 5 мин или нет письма |
| 4 | `curl -sS -D - -X POST https://www.remontvision.ru/api/auth/verify -H 'Content-Type: application/json' -c /tmp/rv.cookies -d '{"email":"…","code":"<6 цифр>","consents":{"offer":true,"privacy":true,"cross_border":true}}'` | `200 {"ok":true,"email":"…","is_new":true}`; `Set-Cookie: rv_sid=…; HttpOnly` | PASS: 200 + кука; FAIL: иначе |
| 5 | Сверка БД (см. ниже) | `users` 1 строка; `auth_identities` (provider='email'); `otp_codes.used_at` заполнен; `sessions` 1 строка; `credit_txn` `signup_bonus` +2 | PASS: всё совпало |
| 6 | Неверный код: повторить verify с `"code":"000000"` | `400 {"error":"Неверный или просроченный код"}`; `otp_codes.attempts` +1 | PASS: 400 |
| 7 | Повторный запрос кода сразу (resend-throttle) | `429 {"error":"Код уже отправлен, повторите через 60 с"}` | PASS: 429 |
| 8 | Просроченный код: запросить код, подождать `OTP_TTL_MIN` (по умолч. 10 мин), затем verify | `400 Неверный или просроченный код` | PASS: 400 |
| 9 | `GET /api/me` с кукой из шага 4 | `{"email":"…","balance":2,"has_purchased":false}` | PASS: balance=2 |

**Сверка БД (на VPS):**
```bash
docker compose exec db psql -U <user> -d <db> -c "
SELECT id, email, created_at FROM users WHERE email = 'test-g3g6-…';
SELECT provider, provider_sub, email FROM auth_identities WHERE email = 'test-g3g6-…';
SELECT id, expires_at, used_at, attempts FROM otp_codes WHERE email = 'test-g3g6-…' ORDER BY created_at DESC LIMIT 3;
SELECT user_id, delta, reason FROM credit_txn WHERE user_id = <uid> ORDER BY id;
"
```
> `<user>/<db>` уточнить из `RV_DATABASE_URL` в `.env` на VPS. `uid` = `users.id` тестового аккаунта.

### 3.2. Яндекс ID (OAuth)

**Предусловие:** `YANDEX_CLIENT_ID`/`YANDEX_CLIENT_SECRET` заданы (иначе `/api/auth/yandex/start` вернёт 503). Redirect URI приложения Яндекса = `${APP_URL}/api/auth/yandex/callback`.

| # | Шаг | Ожидаемый результат | PASS/FAIL |
|---|---|---|---|
| 1 | `curl -sS -D - -X POST https://www.remontvision.ru/api/auth/yandex/start -H 'Content-Type: application/json' -c /tmp/rv_oauth.cookies -d '{"consents":{"offer":true,"privacy":true,"cross_border":true},"redirect_to":"/cabinet"}'` | `200 {"url":"https://oauth.yandex.ru/authorize?…&state=…"}` + `Set-Cookie: rv_oauth_state` | PASS: 200 + кука; FAIL: 503 (не настроен) |
| 2 | Открыть `url` в браузере, авторизоваться тестовым Яндекс-аккаунтом | Редирект на `…/api/auth/yandex/callback?code=…&state=…` → `302` на `/cabinet?auth=yandex&new=1` + `Set-Cookie: rv_sid` | PASS: 302 + кука |
| 3 | Сверка БД | `oauth_states.used_at` заполнен; `auth_identities` (provider='yandex', provider_sub=<яндекс id>); `users` 1 строка; `credit_txn` `signup_bonus` +2 | PASS |
| 4 | Повторный callback: снова открыть **тот же** callback-URL из шага 2 | `302` на `/?auth_error=yandex` (или `redirectTo?auth_error=yandex`); **нет** новой сессии/идентичности | PASS: повтор отклонён, 1 identity |

**Сверка БД:**
```bash
docker compose exec db psql -U <user> -d <db> -c "
SELECT state, provider, used_at, expires_at FROM oauth_states ORDER BY created_at DESC LIMIT 3;
SELECT provider, provider_sub, email FROM auth_identities WHERE provider = 'yandex';
"
```

**Критерий G6:** OTP-письмо получено и код принят И/ИЛИ Яндекс ID вход выполнен на проде. Для gates достаточно одного из двух, но рекомендуется прогнать оба.

---

## 4. G3 — тестовый платёж Robokassa

### 4.1. Предусловия

| # | Шаг | Ожидаемый результат |
|---|---|---|
| 1 | `curl -sS https://www.remontvision.ru/api/packs` | `room` = 10 кредитов / 39900 коп (399 ₽); `flat` = 20 / 59900; `house` = 60 / 149900 (сверить с фактом) |
| 2 | Бэкап БД перед тестом (P0-3) | дамп сделан, лежит вне VPS |
| 3 | Включить test-режим: `ROBOKASSA_TEST=1` + **тестовые** `ROBOKASSA_PASSWORD_1/2/3` → перезапустить app | в URL оплаты появится `IsTest=1` (см. `buildPaymentUrl`) |
| 4 | Выбрать тестовый пакет — **`room`** (399 ₽, 10 кредитов) | сумма теста = `39900` коп = OutSum `"399.00"` |

> **Выбор площадки test-режима (trade-off).**
> - **Staging/локальная копия с prod-конфигом и тестовыми паролями** — безопасно, не трогает реальных покупателей. Рекомендуется для шагов 4.3–4.4.
> - **Короткое окно `ROBOKASSA_TEST=1` на проде** — в это окно все реальные платежи уходят в test-гейт (не пройдут/не начислятся). Только по явному решению владельца, ночью, с немедленным откатом.
> - Симуляция ResultURL с **боевыми** паролями на проде — **запрещена** (фиктивное начисление).

### 4.2. Создание платежа (payments row)

Использовать сессию тестового аккаунта из G6.1 (кука `rv_sid`).

```bash
curl -sS -X POST https://www.remontvision.ru/api/payments/create \
  -H 'Content-Type: application/json' -b /tmp/rv.cookies \
  -d '{"pack_id":"room","accept_offer":true}'
```
**Ожидаемо:** `200 {"confirmation_url":"https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=…&OutSum=399.00&InvId=<id>&…&IsTest=1","payment_id":"<id>","provider":"robokassa"}`.

**Сверка БД:**
```sql
SELECT id, user_id, provider, provider_payment_id, amount_kopecks, status, paid_at, payload
FROM payments WHERE user_id = <uid> ORDER BY id DESC LIMIT 3;
```
**Ожидаемо:** 1 строка `provider='robokassa'`, `provider_payment_id = '<id>'` (= `InvId`), `amount_kopecks=39900`, `status='created'`, `payload->>'credits'='10'`.

### 4.3. Тестовый платёж → ResultURL → начисление кредитов ровно 1 раз

**Вариант A (детерминированный, серверная логика).** Подписать и отправить ResultURL вручную **в test-режиме** (тестовый `ROBOKASSA_PASSWORD_2`). Подпись = `md5("OutSum:InvId:Password2")` (без Shp-параметров):

```bash
OUTSUM="399.00"; INVID="<id из 4.2>"; PWD2="<тестовый пароль 2>"
SIG=$(printf '%s' "${OUTSUM}:${INVID}:${PWD2}" | md5sum | awk '{print $1}')
curl -sS -X POST "https://www.remontvision.ru/api/payments/robokassa/result" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "OutSum=${OUTSUM}" \
  --data-urlencode "InvId=${INVID}" \
  --data-urlencode "SignatureValue=${SIG}"
```
**Ожидаемо:** тело `OK<id>` (text/plain), HTTP 200.

**Вариант B (end-to-end через Robokassa test-гейт).** Открыть `confirmation_url` из 4.2, оплатить тестовой картой Robokassa. Robokassa сама вызовет ResultURL.

**Сверка БД после платежа:**
```sql
SELECT id, status, paid_at, payload FROM payments WHERE id = <id>;
SELECT id, user_id, delta, reason, payment_id FROM credit_txn WHERE payment_id = <id>;
SELECT COALESCE(SUM(delta),0) AS balance FROM credit_txn WHERE user_id = <uid>;
```
**Ожидаемо:** `payments.status='succeeded'`, `paid_at` заполнен; **ровно 1** строка `credit_txn` с `reason='purchase'`, `delta=+10`; `balance = 2 (signup) + 10 = 12`.

**PASS:** одна строка `purchase`, баланс вырос ровно на 10. **FAIL:** 0 строк, >1 строка, или статус ≠ succeeded.

### 4.4. Идемпотентность и негативные кейсы

| # | Шаг | Ожидаемый результат | PASS/FAIL |
|---|---|---|---|
| 1 | Повторить **тот же** ResultURL (Вариант A) | `OK<id>`; `credit_txn` **не** добавляет новую строку `purchase`; баланс не меняется | PASS: статус `already`, 1 строка |
| 2 | ResultURL с неверной подписью (`SignatureValue=deadbeef`) | `400 bad signature`; начислений нет | PASS: 400 |
| 3 | ResultURL с `OutSum="1.00"` (верная подпись под 1.00) | `400 not confirmed` (`amount_mismatch`); начислений нет | PASS: 400 |
| 4 | ResultURL с `InvId` несуществующего платежа | `404 unknown payment` | PASS: 404 |

Подпись для amount-mismatch (шаг 3) вычисляется с `OutSum="1.00"` и тем же `InvId`/`PWD2`.

### 4.5. Возврат кредита при отмене/сбое генерации (ровно 1 раз)

Возврат делает `restoreCreditForRender` → `credit_txn` с `reason='iterate_refund'`, защищён уникальным индексом `uq_credit_refund_once` (одна запись на `render_id`).

**Детерминированный путь — отмена `queued`-рендера:**
1. Залогиниться тестовым аккаунтом, загрузить фото, создать комнату и запустить генерацию (спишется 1 кредит: `credit_txn` `reason='render'`, `delta=-1`, `render_id=<renderId>`).
2. Немедленно отменить: `POST /api/renders/<renderId>/cancel` (с кукой).
3. Сверка:
```sql
SELECT id, delta, reason, render_id, note FROM credit_txn WHERE render_id = '<renderId>';
```
**Ожидаемо:** `render` = −1 и `iterate_refund` = +1 (ровно одна), баланс восстановлен. Повторный `/cancel` → `409` (уже не queued), вторая `iterate_refund` **не** создаётся.

**Нюанс гонки:** отмена работает только пока рендер `queued` (воркер может успеть взять его в работу). Если получили `409` — рендер уже выполняется: зафиксировать и повторить на свежем рендере, либо (по решению владельца) на время шага приостановить воркер: `docker compose stop worker` → тест → `docker compose start worker`.

**Доп. путь наблюдения (не обязателен):** реальный сбой рендера (`render_error:<stage>` / `timeout` > 24 ч) даёт ту же `iterate_refund` через тот же `restoreCreditForRender`; подтверждается по логам `credit_restored` и строке в БД.

**PASS:** ровно одна `iterate_refund` на `render_id`, баланс корректен, повторная отмена не дублирует возврат.

---

## 5. Риски, откат, окно, запрещённые действия

### 5.1. Риски

| Риск | Вероятность | Митигация |
|---|---|---|
| `ROBOKASSA_TEST=1` на проде ломает реальные платежи | высокая при окне на проде | тест на staging, либо ночное окно + немедленный откат; мониторить `/api/health` и `payments` |
| Фиктивное начисление кредитов (симуляция ResultURL с боевыми паролями) | — | запрещено; только test-режим/тестовые пароли |
| Тестовый пользователь смешивается с реальными | средняя | отдельный e-mail с префиксом, изоляция, пометка |
| OTP-письмо не доходит (mailer/spam) | средняя | проверить `mail_error`/`otp_sent`, использовать доверенный ящик, fallback — код из лога `otp_dev_code` (только если mailer реально dev-лог) |
| Отмена рендера упирается в гонку с воркером | средняя | отменять сразу; опц. пауза воркера |
| Остаются тестовые записи в прод-БД | средняя | план очистки (5.3) до начала |

### 5.2. Окно и откат

- **Окно:** ночь по МСК, низкая нагрузка; до и после — `curl /api/health` + бэкап БД (P0-3).
- **Откат test-режима:** вернуть `ROBOKASSA_TEST=0` (и боевые пароли), перезапустить контейнер, проверить `buildPaymentUrl` без `IsTest=1`.
- **Откат данных:** тестовые строки удаляются/помечаются только по согласованной процедуре, по `test-` префиксу/идентификаторам из протокола, не массовыми UPDATE/DELETE без фильтра.

### 5.3. Запрещено (в этой задаче и при прогоне)

- Реальный платёж, реальные деньги, реальные банковские карты.
- Платные генерации на прод-пользователях.
- Изменение цен/пакетов (`credit_packs`, `PACKS`), включение `REFUNDS_ENABLED`.
- Симуляция ResultURL с **боевыми** паролями на проде.
- Трогать прод-данные реальных пользователей, коммитить/пушить секреты (тестовые пароли, `.env`).
- Выполнять сам платёж/вход в рамках REM-38.

### 5.4. Очистка после теста

1. Откатить `ROBOKASSA_TEST` и пароли.
2. Удалить/пометить тестового пользователя и связанные `payments`/`credit_txn`/`sessions`/`otp_codes`/`oauth_states` (по точному `users.id`).
3. Восстановить воркер, если останавливался.
4. Зафиксировать фактические задержки/значения в отчёте.

---

## 6. Фиксация результата

В LAUNCH-GATES.md проставляются:
- **G3** — ссылка на этот протокол + фактические скриншоты/выводы команд + строки БД (`payments`, `credit_txn`).
- **G6** — ссылка на этот протокол + факт доставки OTP и/или Яндекс ID входа + повторный callback отклонён.

---

## 7. Запрос разрешения (выполнено в REM-38)

Создана approval-карточка `request_board_approval` на:
- тестовый платёж Robokassa (test-режим, тестовые пароли) и тестовый аккаунт;
- предоставление доступов из раздела 1.2 (SSH/БД — при необходимости, тестовый ящик, тестовый Яндекс-аккаунт).

До подтверждения разрешения G3/G6 **не выполнять**. После подтверждения исполнитель выполняет протокол и фиксирует PASS/FAIL; реальные платежи и платные генерации остаются за отдельным разрешением.
