# Backend → владельцам четырёх host-приложений

FINAL SOURCE: 057c03d7ba770fbee934918eddb87a88c28d0082.
Exact hashes/подключение: ECOSYSTEM_CLOUD_V1_PIN.md. Основной API/план:
ECOSYSTEM_CLOUD_V1_REF.md. Auth0.1.3/draft.4 и общие Dart/TS cloud clients
проверены146Flutter/141TS и analyzers. Ниже старый0040152/readiness checkpoint
сохранён как история; утверждение о совпадении старого hash с текущей папкой
к новому SOURCE НЕ относится. Новый pin требует нового host review.

ТЕКУЩИЙ handoff/API: ECOSYSTEM_CLOUD_V1_REF.md. Новый Auth0.1.3/draft.4
включает prepareCallback; прежний0040152/draft.3 ниже — исторический pin,
не хэш текущей папки и не принятие нового кандидата. Cloud connectors уже
реализованы. Exact immutable pin и hash фиксируются после commit отдельно.

## АКТУАЛЬНО: существующая база, не Free-организация

Денис в этом чате 16.10 подтвердил использование существующего `personal-nzt`.
Новая организация/проект не создаются. Общее хранилище уже развёрнуто через MCP:
project `iuvvheeocobhiothfgei`, API `https://iuvvheeocobhiothfgei.supabase.co`.
Миграция `20261016022904_ecosystem_app_cloud_backups`:
`public.ecosystem_app_consents` (4 owner RLS policies) и
`public.ecosystem_app_snapshots` (3 owner RLS policies), обе с RLS.
Rollback SQL проверил четыре app_id, consent/CAS/retention10/retained retry,
immutability/foreign owner/anon; настоящий REST без входа вернул401/42501 для
обеих таблиц. Реальных пользовательских записей в них0/0.

Общие клиенты (новый код, не один fake-port):
`packages/ecosystem_cloud/lib/ecosystem_cloud.dart` и
`packages/ecosystem_cloud_ts/client.ts`. Auth остаётся общим ecosystem_account;
идёт отдельная минимальная доработка cold PKCE callback без восстановления
чужой cached session. SDK0040152 пока остаётся прежним warm-flow pin, новый
immutable pin выдаётся после проверки cold-path; плавающий source не присваивать.

Локальная конфигурация с существующим publishable (НЕ service-role) ключом:
`/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/personal-nzt.client.json`.
Файл gitignored; значения ключей не копировать в сообщения/журнал. DefaultOFF.
Это существующая общая база, **не изолированный stage**. Реальная регистрация,
callback/restore на устройствах и удаления общего аккаунта ещё не приняты.
Чужие legacy ACL/функции/таблицы не менялись; global security PASS не заявляется.

Старые фразы ниже о Free, отсутствии таблиц/конфига и только интерфейсе gateway
являются историческим checkpoint до этого решения/развёртывания, не блокером UI.

16.10.2026 · psygames-codex-mac · собственная задача bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Ответ на входящие запросы Smart Alarm, Chess & Go и TypeFree о текущем интерфейсе.
Это handoff существующего кода и точного остатка, не выдуманный live connector.

## Уже согласовано человеком

Общий provider Supabase Auth, backend пилота ведёт psygames-codex-mac.
Отдельная Free test-среда, не personal-nzt/не work-hydromash, без платного upgrade.
Решение377d1ecc закрыто. Владельцы host-приложений/общий parent не переназначены.
Общий account = issuer+subject; данные и согласия каждого продукта раздельны.

## Что можно подключать локально сейчас

Неизменяемый shared package `ecosystem_account0.1.2` / `ecosystem.account/1-draft.3`:
commit `0040152c40a2eb26b1d75890884837804074d1a9`.
Локальная папка: `/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/packages/ecosystem_account`.
CONTRACT SHA256 `640febbb6347a356d78644e009c45124fde5e268945c49ca5300ed2a790a39d0`.
Source SHA256 `8d850fdb81b07011e9b4dcacc10dfd1fd4202c7de367c4443bd63456ae86f60f`.
В этой папке источник/контракт совпадают с указанным pin; новые UI-коммиты их не меняют.
Это локальная доставка кода, не опубликованный pub/npm registry package.

| Host-функция | Имеющийся API / ответственность |
|---|---|
| Вход | `requestLink(email, consent:true)` только после объяснения/явного выбора |
| Возврат из письма | `acceptsCallback(uri)` → `completeLink(uri)`; exact callback, без paste-token UI |
| Автоматическое восстановление сессии | `resume(consent:true, expectedAccountId:receipt.account_id)` только при точном app+issuer+subject+version receipt |
| Идентичность | `accountId`, `email`, `issuer`; не сопоставлять пользователей по имени питомца |
| Выключить сеть | `suspend()` немедленно; старые builders остаются отозванными после нового входа |
| Выйти | `signOut()` — локальная сессия этого приложения, не удаление общего аккаунта |
| Credentials | `AccountVault` / `SecureAccountVault`, OS secure storage; app+issuer namespace, не preferences или backup |
| Shared REST | `from(table)` только после проверенного login; это НЕ разрешение обращаться к чужим таблицам |

Flutter hosts переиспользуют этот пакет; TypeFree — TS/Tauri, поэтому делает
эквивалентный adapter через защищённое OS storage и те же тесты lifecycle/PKCE,
а не импорт Dart, localStorage для refresh token или собственный auth server.

## Host/UI lifecycle

LOCAL → объяснение → разрешение запрошенного входа → login → history preview →
отдельное связывание истории/receipt → backup enabled.
Вход не разрешает upload. Никаких guest autoSync/push до согласия.

Пример реализованной границы PsyGames:
`flutter/lib/shell/cloud_pilot.dart`, интерфейс `CloudPilotGateway`:
`requestLink / completeLink / versions / enableBackup / save(keepLocalAfterConflict) /
download / prepareRestore / deleteCopies / signOut / suspend`.
Свой host выбирает свой allowlist/snapshot decoder; интерфейс PsyGames не
навязывает другим продуктам SharedState или таблицу psygames_cloud_snapshots.
Реального Supabase gateway этого host пока нет; тестовый fake не считать сервисом.

Правила: список версий → explicit read/preview → подтверждение → before/after
journal → restore до gameplay при следующем старте. Не применять поверх игры,
не складывать кошельки/историю, не выдавать награды второй раз. Для записи
нужен server revision/conflict; ошибку нельзя выдавать за успешное сохранение.
Общий принцип десяти immutable backup versions допустим для пилота, но app-specific
schema/лимиты Smart Alarm/Chess/TypeFree ещё предстоит сверить с их allowlist.
Не придумывать совместимый формат содержимого по аналогии с PsyGames.

## Что ещё НЕ предоставлено как live API

- Free org/project/issuer/publishable config пока не созданы. Через MCP нет
  инструмента создания организации; открытая developer-панель проверена и
  показывает Sign in. Нужен вход человека, не выбор платного обхода.
- Ни один новый callback других приложений на сервере не добавлен. PsyGames
  желаемый exact callback `com.psygames.app://auth/callback`; Chess host запросил
  `com.abstracthub.app://auth/callback` (ещё не server-approved). Smart Alarm и
  TypeFree должны передать exact URI из своего bundle/manifest через свою задачу;
  backend-агент не угадывает его по названию приложения.
- Общие snapshot endpoints/tables/grants и API удаления общего аккаунта ещё не
  развернуты/не приняты. Нельзя использовать personal-nzt/PsyGames snapshots для
  чужого приложения или заявлять реальное удаление аккаунта по наличию кнопки.
- Секреты не передавать в сообщениях. После создания test project не-секретные
  URL/publishable key/app callback — через локальную app config; admin/service-role
  остаются в разрешённом backend secret store, не в клиенте или рефе.

Личные независимые review, подтверждённые до этих новых host-запросов:
Smart Alarm2203ef6d и Chess252afaeb на exact0040152/hash640febbb.
Новые сообщения о начале host-работы не подменяют четыре formal app-owner подписи.
Это не причина останавливать локальный UI/controller/typed-port/negative tests.

## Связи

- [Схема/владельцы](ECOSYSTEM_ACCOUNT_BACKEND_REF.md).
- [UI и 112 tests](CLOUD_PILOT_UI_REF.md).
- [Frozen контракт](packages/ecosystem_account/CONTRACT.md).
