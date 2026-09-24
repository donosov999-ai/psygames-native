# PsyGames в сторах: как выпуск доезжает до людей

Автор: Denis Onosov (ODV999) · ⚠️ Информация конфиденциальная
Составлено 24.09.2026 координатором PsyGames. Всё, что здесь написано, **померено в этот
день** через API сторов и логи CI, а не пересказано по памяти.

> Зачем файл. Планы публикации лежат с июля (`GOOGLE_PLAY_PLAN.md`, `APP_STORE_PLAN.md`,
> `APPLE_SETUP.md`, `APP_STORE_FIELDS.md`) и описывают, как мы ТУДА ЗАХОДИЛИ. Здесь —
> как оно устроено СЕЙЧАС, когда мы уже внутри: что нажимается, что ломается и где смотреть
> правду. Старые файлы не заменяет, а дополняет; ссылки на них по месту.

---

## 1. Кто владелец аккаунтов — с этого начинается всё

| стор | аккаунт | почему это важно |
|---|---|---|
| **App Store** | **Sergey Klenin**, Казахстан, Актау · Team ID в `~/.sdt_secrets/apple_appstore.json` | лицензионные соглашения принимает ТОЛЬКО владелец (Account Holder). Ни Денис, ни Admin этого сделать не могут |
| **Google Play** | ⚠️ уточнить в Play Console → Настройки аккаунта разработчика | от этого зависит, чей паспорт нужен для Developer Verification |

🔴 **Это не формальность, а самый дорогой заслон.** Замер 24.09.2026: подача iOS-версии
2.54.22 простояла в `Waiting for Review` **шесть дней** — не потому что Apple долго смотрит,
а потому что в аккаунте висело непринятое обновление лицензионного соглашения. Пока владелец
не принял новую редакцию, Apple подачу **не берёт в работу вообще**. Ни отклонения, ни
вопроса — просто тишина. После принятия очередь трогается сама, переподавать не нужно.

---

## 2. Идентификаторы: где что лежит

| платформа | identifier | файл |
|---|---|---|
| Android (Play) | `com.psygames.app` | `src-tauri/tauri.android.conf.json` |
| iOS (App Store) | `com.psygames.app` | `src-tauri/tauri.ios.conf.json` = `frontend/app.json → ios.bundleIdentifier` |
| Windows / macOS / Linux (вне сторов) | `com.odv999.psygames` | `src-tauri/tauri.conf.json` (база) |

❗ **Базовый `identifier` не менять.** Смена id для десктопа = «другое приложение» для уже
установленных копий: потеря локальных данных и слом канала обновлений. Разбор схемы —
`GOOGLE_PLAY_PLAN.md` §🧭.

Ключи и доступы (память = ПУТИ, не значения):
- `~/.sdt_secrets/apple_appstore.json` — ключ App Store Connect API (`.p8`, key_id, issuer_id, app_id).
- `~/.sdt_secrets/google_play_sa.local.json` — сервисный аккаунт Google Play.
- В CI те же доступы лежат секретами репозитория, отдельными от локальных файлов.

---

## 2б. ДВЕ ЛИНИИ НОМЕРОВ — и почему веб прыгает через 2.55

Решение Дениса 24.09.2026.

| линия | номер | где живёт версия | куда уезжает |
|---|---|---|---|
| веб / Tauri | 2.54.x → **сразу 2.56.0** | `frontend/app.json` + `package.json` + `src-tauri/tauri.conf.json` | Google Play, App Store, десктоп |
| гибрид на Flutter | **2.55.x** | `flutter/pubspec.yaml`, номер задаётся параметром запуска `flutter-testflight.yml` | ТОЛЬКО TestFlight на iOS |

🔴 **Чем это кончилось бы без правила.** Веб растёт по 0.0.1 за выпуск, а 2.55.x на iOS
уже заняты сборками гибрида (24.09 их вышло восемь: 2.55.9…2.55.16). App Store не примет
версию, равную или меньшую опубликованной, — и выпуск встал бы намертво уже ПОСЛЕ метки.
Заметить заранее было нечем: номера живут в разных файлах, и до 24.09 их никто не сверял.

**Правило:** 2.55.x закреплена за гибридом. Следующий выпуск веба — **2.56.0**, дальше
линия одна на всех: и Play, и App Store, и TestFlight считают от неё.

Сторожит проба `frontend/src/__tests__/version-sources-agree.test.ts` → «версия веба не
заходит в линию 2.55.x». Мутация (поставить вебу 2.55.3) краснит её.

---

## 3. Как выпуск доезжает до сторов — пошагово

Один тег отправляет сборку СРАЗУ во все четыре канала: Google Play (production),
Apple TestFlight, GitHub Release и десктоп-артефакты.

```
1. поднять версию В ЧЕТЫРЁХ местах:
     frontend/package.json          "version"
     frontend/app.json              expo.version
     src-tauri/tauri.conf.json      "version"
     frontend/src/constants/whatsNew.ts   ← карточка «Что нового», ПЕРВОЙ записью
2. дописать CHANGELOG.md
3. коммит в main, дождаться ЗЕЛЁНОГО CI на этом же SHA
4. git tag -a vX.Y.Z origin/main -m "…"  &&  git push origin vX.Y.Z
5. дальше CI делает всё сам
```

⚠️ **Тег снимать только от `origin/main`.** Джоба `tag-from-main` проверяет это и валит
выпуск, если метка легла на ветку раздела.

⚠️ **Перезапускать тег НЕЛЬЗЯ.** Play принимает каждый `versionCode` один раз, Apple —
каждый bundle version один раз. Сломалось — чинить причину и поднимать patch-версию.

### Что происходит в CI после метки

| джоба | что делает | от чего зависит |
|---|---|---|
| `android` | собирает подписанные `.apk` + `.aab` | — |
| `google-play` | грузит `.aab` и ставит релиз | `needs: android, typecheck, unit-tests, smoke, web-gates, tag-from-main` |
| `ios-signed` | собирает `.ipa`, грузит в TestFlight | гейты |
| `release` | GitHub Release с артефактами | гейты |
| финальная проверка | кричит «ВЫПУСК НЕ ДОШЁЛ ДО ЛЮДЕЙ», если хоть один канал не `success` | все |

🔴 **Play-релиз уходит СРАЗУ ВСЕМ:** трек один — `production`, `status: completed`,
доля 100 %. Поэтапной раскатки у нас нет и не было — это решение, а не недосмотр
(`.github/scripts/deploy_play.js`, `const TRACKS = ['production']`).

---

## 4. Гейты, которые валят выпуск — и что они на самом деле говорят

Эти четыре ловили выпуск 24.09.2026 лично. Все — по делу.

| гейт | сообщение | что сделать |
|---|---|---|
| `release-notes-gate.mjs` | «в whatsNew.ts нет записи для X.Y.Z» | дописать запись `{ version, date, ru: [...], en: [...] }` ПЕРВОЙ в `frontend/src/constants/whatsNew.ts` |
| `version-sources-agree` | «whatsNew первая запись: 2.54.23», а версия другая | то же самое: версия в четырёх местах обязана совпасть |
| `i18n-coverage` | «в локали de не хватает N ключей» | завести перевод во все 10 накладок `frontend/src/contexts/translations/<язык>.ts` |
| `test-discipline-gate.mjs` | «в `__tests__` запускаются только `*.test.ts`» | вспомогательный модуль — в `src/test-helpers/`, не в `__tests__` |
| `lint-ratchet.mjs` | «ДОЛГ ВЫРОС» | чинить СВОИ замечания. Потолок поднимать нельзя; опускать — можно и нужно |

⚠️ Карточка «Что нового» — не формальность: **в Play это единственная строка, которую
человек читает про обновление.** Лимит 500 знаков на язык, лишнее молча отбрасывается —
гейт печатает «EN: 5 из 6 пунктов», и это надо читать, а не проматывать.

---

## 5. Как посмотреть ЖИВОЕ состояние, не открывая консоль

### Google Play

```bash
cd /Users/denisonosov/dev/psygames-wt-coord && python3 - <<'PY'
import json, io, os, time, urllib.request, urllib.parse, jwt
sa = json.load(io.open(os.path.expanduser('~/.sdt_secrets/google_play_sa.local.json'), encoding='utf-8'))
now = int(time.time())
a = jwt.encode({'iss': sa['client_email'], 'scope': 'https://www.googleapis.com/auth/androidpublisher',
    'aud': 'https://oauth2.googleapis.com/token', 'iat': now, 'exp': now + 600}, sa['private_key'], algorithm='RS256')
data = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': a}).encode()
tok = json.loads(urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=data)).read())['access_token']
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.psygames.app'
call = lambda p, m='GET': json.loads(urllib.request.urlopen(urllib.request.Request(API + p, headers={'Authorization': 'Bearer ' + tok}, method=m)).read() or b'{}')
e = call('/edits', 'POST')['id']
for t in call(f'/edits/{e}/tracks').get('tracks', []):
    for r in t.get('releases', []) or []:
        print(t['track'], r.get('name'), r.get('status'), r.get('versionCodes'))
call(f'/edits/{e}', 'DELETE')
PY
```

Состояние на 24.09.2026: `production · v2.54.23 · completed · 100 %`, карточка на
**12 языках**, **177 стран**, 8 снимков экрана. Остальные треки (alpha, internal,
closed-test1) стоят на прошлогодней `v1.189.0` и в дело не идут.

Есть и готовый рабочий процесс только для чтения: `.github/workflows/play-status.yml`
(запускается руками, ничего не меняет).

### App Store

```bash
cd /Users/denisonosov/dev/psygames-wt-coord/flutter && python3 - <<'PY'
import json, io, os, time, urllib.request, jwt
cfg = json.load(io.open(os.path.expanduser('~/.sdt_secrets/apple_appstore.json'), encoding='utf-8'))
tok = jwt.encode({'iss': cfg['issuer_id'], 'exp': int(time.time()) + 600, 'aud': 'appstoreconnect-v1'},
                 io.open(os.path.expanduser(cfg['key_file'])).read(), algorithm='ES256',
                 headers={'kid': cfg['key_id'], 'typ': 'JWT'})
get = lambda p: json.loads(urllib.request.urlopen(urllib.request.Request(
    'https://api.appstoreconnect.apple.com/v1' + p, headers={'Authorization': 'Bearer ' + tok})).read())
for v in get(f"/apps/{cfg['app_id']}/appStoreVersions?limit=3")['data']:
    print('версия', v['attributes']['versionString'], '→', v['attributes'].get('appStoreState'))
for s in get(f"/apps/{cfg['app_id']}/reviewSubmissions?limit=3&filter[platform]=IOS").get('data', []):
    print('подача →', s['attributes']['state'], (s['attributes'].get('submittedDate') or '')[:16])
PY
```

Что означают состояния:
- `WAITING_FOR_REVIEW` — лежит в очереди, Apple ещё **не начинала** смотреть;
- `IN_REVIEW` — смотрят прямо сейчас;
- `PENDING_DEVELOPER_RELEASE` — одобрено, ждёт нашей кнопки;
- `REJECTED` / `DEVELOPER_ACTION_NEEDED` — смотреть Resolution Center руками, API текста не отдаёт.

---

## 6. TestFlight: две группы, и они не равны

| группа | тип | кто | что получает |
|---|---|---|---|
| **«Свои»** | внутренняя | 2 человека | сборку сразу после заливки, без ревью Apple |
| **«Семья и близкие»** | внешняя, есть публичная ссылка | 6 человек | **только после бета-ревью Apple** |

Скрипт раздачи `flutter/tool/testflight_assign.py` **намеренно отказывается** раздавать
внешним группам: это решение Дениса, а не ограничение. Хочешь отдать внешним — сперва
явное «да», потом подача на бета-ревью (состояние сборки `externalBuildState:
READY_FOR_BETA_SUBMISSION` значит «ещё не подавали»).

⚠️ **«Залито» ≠ «доставлено».** Сборка может лежать в TestFlight со статусом VALID и не
быть видна НИКОМУ, если её не выдали группе. Проверять поимённо.

---

## 7. Грабли, померенные на живых выпусках

1. **Протухший пропуск к Apple.** `testflight_assign.py` выписывал JWT один раз на запуск
   (15 минут), а сам ЖДЁТ, пока Apple доварит сборку, — это десятки минут. Итог: сборка
   залилась, а последний шаг «раздать группе» упал с `HTTP 401`. Починено 24.09: пропуск
   обновляется на каждом запросе. Если увидишь 401 на раздаче — смотри сюда.
2. **Непринятое соглашение морозит очередь молча** (см. §1). Проверять первым делом:
   https://appstoreconnect.apple.com/business — плашка вверху.
3. **Налоги и банк к бесплатному приложению не относятся.** У нас 0 встроенных покупок и
   0 подписок (померено по API). Нужно только «Соглашение о бесплатных приложениях»;
   строка «Соглашение о платных приложениях — Новое» принимать не надо.
4. **Android Developer Verification — это ДВЕ разные вещи**, и их путают:
   · **регистрация пакетов и ключей** (страница «Проверка разработчика Android») —
     ✅ у нас сделано: `com.psygames.app`, 2 ключа, обновлено 16.07.2026. Попытка
     зарегистрировать снова даёт «Вы уже зарегистрировали этот пакет»;
   · **подтверждение личности разработчика** (документ, ФИО буква в букву как в платёжном
     профиле, телефон, email) — ⚠️ **через API не видно вообще**, смотреть только в
     Play Console → Настройки аккаунта разработчика. Непройденная = удаление приложений.
5. **Версия живёт в ЧЕТЫРЁХ местах.** Забыть `whatsNew.ts` — самый частый способ уронить
   выпуск уже после метки (проверено сегодня).

---

## 8. Что уже сделано и переделывать не надо

- Карточка Play: 12 языков описания, 8 снимков экрана, 177 стран, приложение в production.
- Карточка App Store: заполнена (тексты — `APP_STORE_FIELDS.md`), Privacy Policy живая
  (https://psy-games.pro/privacy), Privacy Manifest в `src-tauri/PrivacyInfo.xcprivacy`.
- Данные для ревью Apple: демо-аккаунт не нужен, заметка про «без аккаунта, без рекламы,
  без покупок, медицинских обещаний не даём» — уже вписана.
- Регистрация пакета и ключей для Android Developer Verification.
- Автовыкладка по тегу во все четыре канала.

## 9. Чего НЕ делать

- ❌ Не раздавать сборки внешней группе TestFlight без явного «да» Дениса.
- ❌ Не менять долю раскатки в Play: только 100 %.
- ❌ Не перезапускать тег после неудачи — поднимать patch-версию.
- ❌ Не поднимать потолки гейтов, чтобы проехать выпуском.
- ❌ Не принимать «Соглашение о платных приложениях»: за ним потянутся налоги и банк,
  которые нам не нужны.

---

## Родня

- `GOOGLE_PLAY_PLAN.md` — как заходили в Play, схема идентификаторов (июль 2026).
- `APP_STORE_PLAN.md`, `APPLE_SETUP.md`, `APP_STORE_FIELDS.md` — как заходили в App Store.
- `../psygames-store/play-listing-strategy.md` — по каким запросам заходим и почему.
- `../APP_BUILD_RULES.md` — общие правила приложений (каркас, багфикс-клиент, i18n).
