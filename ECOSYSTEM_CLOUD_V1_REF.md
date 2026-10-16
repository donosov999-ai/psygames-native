# Единый аккаунт и облачные копии: действующий backend / кандидат SDK

16.10.2026 · технический владелец psygames-codex-mac.
Задача bb2c9f30-d786-4fe6-b25c-4b2ace267d4b; общий parent
f27599dc-31c9-4638-946d-ccb3270079bb остаётся у psygames-claude-mac.
Checkout: /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Это текущий источник handoff; прежние Free/readiness checkpoints исторические.
Точный source commit/hashes: ECOSYSTEM_CLOUD_V1_PIN.md.
PsyGames host теперь имеет local real adapter/native callback/startup restore:
PSYGAMES_CLOUD_RUNTIME_REF.md; shared package pin неизменен, public runtime OFF.
Уточнённый legacy ACL/RPC gate: CLOUD_PUBLIC_ROLLOUT_GATES.md (не SELECT-only).
Не путать готовый backend/библиотеки с работающим облаком в четырёх релизах.

АКТУАЛЬНО после отдельного «да» Дениса16.10: G3 выполнен — три exact callback
Smart Alarm/Chess & Go/TypeFree добавлены к прежнему PsyGames URI в Supabase;
UI success/readback1→4, Site URL прежний. G3_RECEIPT_20261016.json и
CLOUD_PUBLIC_ROLLOUT_GATES.md содержат before/after/rollback. Ниже checkpoints
с фразами «G1/G3 остаются» относятся к состоянию ДО этого изменения.
G1service prerequisite584a68fd и G2deletion остаются; public runtime OFF,
реальных login/писем/uploads/device приёмки не было. Общий локальный public-client
config в этом шаге не менялся: это не обещание connected pilot у четырёх приложений.

## Личные технические согласования 16.10 — только local integration

Все четыре Codex-владельца дали личное техническое СОГЛАСЕН на exact общий
SOURCE057c03d7ba770fbee934918eddb87a88c28d0082. Это не formal closure чужих
Claude-задач, не backend/device/public/store acceptance и не запуск синхронизации.
Запись приёмки отчётов в TeamOps: 6416ba67-b27c-4c1e-b643-0aead96d1bbc.

### Финальный continued checkpoint TypeFree — 16.10

Промежуточное сообщение заменено полученным отчётом
/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/ACCOUNT_NATIVE_INTEGRATION_CONTINUED_20261016.md,
SHA2568b8c11c6c912ca8b688c3a3fe2e54da5f1f32feb015c34de7c03bcfa46db27b1.
Хеш отчёта лично сверён. В account-ui-evidence-20261016 рядом сверены:
native-host-continued-receipt.json 522951f9b84820502eee9d2869a65dff835569393354773b93a89dbaa64d312c;
typefree-account-continued.patch 56bb3d1d64f6ca9af95edf9da844f1653212982d9439b80789c38df5ab956c32.
Read-only `git apply --reverse --check` полного patch PASS в TypeFree worktree
на неизменном base754e5715143de25bc7722e70f3e757eee1ebd69d. Source uncommitted;
ни чужой commit, ни merge/main/public acceptance этим не подтверждаются.

Новый APK по прежнему пути app-universal-debug.apk имеет проверенный
SHA2560f9595d935b28fcdde0f3894c46fa1d8b5d4a4db6f16aae26867afe722b6faf7;
прежний APK9966b2c… — исторический, не этот кандидат. CloudOFF/configNull.
Получены исправления host: bound default browser fetch; завершённая login operation
больше не снимает подтверждённую сессию; поздняя A callback не отменяет новую B.
Общий SOURCE057c не менялся. Это чужой host, в PsyGames правки не копировались.

Лично прочитаны report/receipt и production mock-native-result.json: заявлены
178unit/16files,24host и16 browser checks dev/compiled bundle, including ownACK21
→ server28 → nextPOSTbase21/409 без потери local result. Здесь тесты/сборки не
перезапускались. MOCK nativeIPC/HTTP + настоящий main/SDK/commonclient —
не реальный backend/Auth, secure storage или физический телефон. Предыдущие
iOS/vault compile checks автор переиспользует явно, не выдаёт за новый прогон.
Own TypeFree worker-card pending, formal Claude parent не закрыт. G1/G3 остаются.

### Последующий checkpoint Smart Alarm — 16.10

Новее среза0e61 ниже: code0470eddf9f0a52bbf84f9ec25087f998e22570f3,
docsHEADf0b094d8af6df74aed8e0a4e2e84fc5fa6f82d15/clean. Лично сверены HEAD,
host diff и новый SHA256 того же report:
e20b55289516dd89fb1fa26f9e095ae4a3d70b212c6a505a5aeccf0be7458003.
Исправлен host CAS: durable scoped own ACK7 не заменяется listlatest23,
следующий save идёт base7/conflict; отдельный RU/EN выбор основы требует confirm,
не делает upload/restore, pending блокирует выбор. SharedSOURCE не менялся.
Лично сверены hashes логов account-transfer-20261016:
cas-frozen-full.log c9302111131a9fc4f5d9e5a4fbe0231ceae4595e5a24d24fce53a1bd27236f89,
cas-red-asserted.log b07c93370badb35e530913b958887488ec030cf31d70318670794148b06eb9dd,
cas-focused-final.log 07d1c8573c66678dfa60d8f48f018c9df6b209565edf38765635aa252df82446,
cas-analyze.log 9308d02b3b371a0f6512cd460b4351963197a36679ac0e641d5a6ced0e3efbde.
Tail нового full log1062PASS/12SKIPPED прочитан, это авторский прогон, не rerun
этим чатом. Предыдущий1061 относится только к0e61. Изначальный red PASS был
ложным из-за assertion внутри mock HTTP; исправленный red проверяет отправленную
base снаружи SDK handler. Device/backend/store acceptance всё ещё не заявлены.

Владелец smart-alarm-codex-mac сообщил code0e61b252d8d0705223fbcaa4eb8b67fc381a0388,
docsHEAD45b979b72d4ae91fd7e49bfe157f3677f4693e7e. Здесь независимо read-only сверены
HEAD/clean Git, diff трёх файлов и SHA256 его ACCOUNT_CLOUD_V1_REVIEW_057C.md:
983ee5e5362d0fdfb614269304cbeefb765cfa5459c7f27b216b7260e7ff61e8.
Это обновляет checkpoint ниже, не меняя frozen общий SOURCE057c.

Host fix: new-only exclusion anchor хранит ID старых валидных событий без лимита
облачной копии; 257 старых + 1 новое → в копию попадает только 1 новое.
Режим all-history >256 по-прежнему явно отклоняется, chunking не реализован.
Ограничение256 относится к данным будильника, не является лимитом PsyGames.
Не переносить эту реализацию в наш full-state snapshot без отдельной задачи.

Сверены hashes файлов в /Users/denisonosov/Documents/TeamOps/smart-alarm-ux/account-transfer-20261016/:
frozen-full.log b3faa9a63973cc685383bfabdbd45f0cf91de70d561edd0222a8dd18b0b7d7c1,
large-new-only-red.log b2f0db8597882f539877e3f4f01c643cdc47c81ff7176288d480704d124a2cd4,
focused-fixed.log dd249d8bd9eb2da28919de899d449f3d7aec5526af7b372da83fa9fd362f12a4,
analyze.log bb22ef248e1bedf5c23385019369b6cff74bdb6256746fb853c4be51501854f2.
Прочитан tail full log:1061PASS/12SKIPPED; focused40/analyze0 — отчёт владельца,
не новый прогон этим чатом. Mock clean-install transfer не доказывает hardware/RLS.
G1/G3 blockers остаются, defaultOFF и чужой ownership сохранены, релиза нет.

| Host | Проверяемый артефакт / граница |
|---|---|
| PsyGames | PSYGAMES_CLOUD_RUNTIME_REF.md; own host ed35db65cd7ba12927850fced047a95818ed5243, 171 local tests PASS, defaultOFF. |
| Chess & Go | /Users/denisonosov/dev/chessgo-wt-synapse/ACCOUNT_SHARED_V1_REVIEW_20261016.md; личное exact ACK и local SDK/adapter review, не native/device E2E. |
| Smart Alarm | /Users/denisonosov/dev/smart-alarm-photo-diary/smart-alarm-flutter/ACCOUNT_CLOUD_V1_REVIEW_057C.md; report SHA2560d17a03aceb9916507cf6555a84aff4baebdf7eb7cc3d0fba12c2ccfbef3038d, docs f04cf02125f340648033065f77154b893284a8bb; frozen log hash/tail1058PASS/12SKIPPED сверены, не повторный прогон здесь. Restore только neutral cache256, не полный app backup/autosync. |
| TypeFree | /Users/denisonosov/Documents/TeamOps/typerighting-onboarding/ACCOUNT_NATIVE_HOST_20261016.md; report SHA256f891ee43c5137e0e3b340fc0534d77906b3d2dfe044c443146e495c68373096f; receipt/patch hashes сверены, reverseapplycheckPASS на754e5715143de25bc7722e70f3e757eee1ebd69d. Source пока uncommitted, immutable patch7a629f390bbcd0f39b2c6f13ad3e774c5b706e312a8ad889f150ad48e98ea94f сохранён. Авторские175unit/141shared/2vault/AndroidAPK/iOScargocheck не присваивать этому чату как собственные/device tests. |

TypeFree exact callback pro.typefree.app://auth/callback подтверждён локально;
server allowlist registration выполнена G3 (receipt выше), local config не менялся.
Часть adaptive/settings данных TypeFree ещё не переносится; это не полный backup.
Его pending TeamOps worker-card не активировалась нами, чужие задачи не закрывались.
G1 Денис прямо разрешил 16.10.2026. Его live dependency preflight нашёл работающий
i18n-api.service с JWT role=anon и вызовом translation_status_set; REVOKE до
безопасного переключения сломает реестр переводов (ошибка там скрывается).
Prerequisite координатору: 584a68fd-0b29-4db9-a0d5-7fad7700534e;
подробности и metadata evidence в CLOUD_PUBLIC_ROLLOUT_GATES.md.
G1 SQL ещё НЕ применён; G2 (75d600c9) ждёт прямого ответа Дениса.
G3 отдельно разрешён и выполнен, не требует повторного согласования URI.
Личные ACK app owners не разрешают callbacks/users/письма/uploads/релизы.

## Решение и реально выполненное

Прямое «делай» Дениса после выбора существующей базы отменяет только прежний
маршрут создания Free-среды. Использован personal-nzt / iuvvheeocobhiothfgei,
API https://iuvvheeocobhiothfgei.supabase.co,
issuer https://iuvvheeocobhiothfgei.supabase.co/auth/v1.
Новая организация/проект/подписка не создавались; work-hydromash не затрагивался.
Это существующий общий проект, НЕ изолированный staging.

Через Supabase MCP применена миграция 20261016022904_ecosystem_app_cloud_backups.
Новые таблицы: public.ecosystem_app_consents (RLS, 4 policies) и
public.ecosystem_app_snapshots (RLS, 3 policies). Legacy-таблицы/функции/ACL
не менялись; старые psygames_cloud_snapshots не мигрировали автоматически.
Rollback-сценарий supabase/tests/ecosystem_app_cloud_backups.sql прошёл на
настоящем PostgreSQL: consent, четыре app_id, CAS, retained retry, retention10,
immutability, подмена owner/issuer, чужое чтение/удаление, anon/auth-anonymous.
Синтетические пользователи и записи откатились. Финальное чтение: 0 consent,
0 snapshot. Настоящий REST без входа: обе таблицы 401 / 42501, доступ запрещён.
Это НЕ реальный вход/restore на телефоне и НЕ полный аудит существующей базы.

Публичный клиентский конфиг находится только локально, gitignored:
/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/personal-nzt.client.json.
Используется существующий publishable key; service-role не передаётся клиентам.
Ключи/токены не копировать в чаты, журналы, задачи и Git.

## Один аккаунт, четыре раздельных хранилища

| Приложение | app_id | Владелец host | Задача |
|---|---|---|---|
| PsyGames | psygames | psygames-codex-mac | bb2c9f30-d786-4fe6-b25c-4b2ace267d4b |
| Smart Alarm | smart-alarm | smart-alarm-codex-mac | f3dffc9c-f961-40ce-b0bc-a641b9f57f3e |
| Chess & Go | abstract-hub | chess-go-codex-mac | 798a3063-c6db-4d57-889c-33db68447ca7 |
| TypeFree | typerighting | свой host-чат; формального executor не менять | 7bba5d2a-cf16-4543-8273-97f4fecf556d |

Identity = проверенные issuer + subject, не ник, питомец или игровой профиль.
app_id разделяет данные, но НЕ доказывает подлинность бинарника приложения.
По умолчанию LOCAL/OFF; вход сам по себе не разрешает загрузку истории.
Каждый host хранит собственное согласие policy1, связанное с app/issuer/owner,
показывает preview и спрашивает отдельное разрешение на upload/restore.
Общий аккаунт не означает общий кошелёк, дневник, AI или BrainKit.

## Пакеты и холодный вход

Новый кандидат Auth: packages/ecosystem_account, 0.1.3,
ecosystem.account/1-draft.4. Предыдущий 0040152/draft.3 не переименовывать задним
числом: его подтверждения не означают принятие нового кандидата.
Доработка prepareCallback(consent:true) → completeLink(uri) закрывает cold PKCE
после перезапуска без чтения/refresh старого cached A. Сначала host проверяет
exact callback и сохранённое явное намерение входа. Для этого НЕ использовать
resume(). Нужны protected verifier, durable credential ACK, OFF/identity fences.
Обычное автоматическое resume требует expectedAccountId из точного host receipt.

Облачные клиенты ecosystem.cloud/1:

| Задача | Dart: packages/ecosystem_cloud/lib/ecosystem_cloud.dart | TS: packages/ecosystem_cloud_ts/client.ts |
|---|---|---|
| Чтение после preview-разрешения | allowHistoryRead, consent, versions, download | allowHistoryRead, getConsent, listVersions, download |
| Отдельное разрешение записи | acceptConsent / recoverConsent с local+server receipt | acceptConsent; reading consent само не разрешает upload |
| Запись | save(payload, baseRevision, requestId) | save(payload, {baseRevision,requestId}) |
| Выключение / удаление копий | revokeConsent / deleteCopies / suspend | revokeConsent / deleteCopies / suspend |

Dart использует EcosystemAccount; TS принимает host AuthedTransport, а НЕ raw JWT.
TS-клиент НЕ реализует TypeFree PKCE/OS vault/AuthHost; это остаётся отдельным
host-остатком. Dart errors camelCase CloudPortCode; TS CloudError codes uppercase:
OFF, ACCOUNT_CHANGED, CONSENT_REQUIRED, CONFLICT, NOT_FOUND, NETWORK,
INVALID_PAYLOAD, UNAVAILABLE. Host явно сопоставляет ошибки, не парсит server body.

Обе библиотеки требуют host privacy/schema validator, detached immutable JSON.
Единая внешняя оболочка {schema:1,data:appOwnedSnapshot}. Собственные оболочки
Chess {schema,app_id,data} и TypeFree {schema,appId,values} остаются ВНУТРИ data,
не уплощаются. Smart Alarm передаёт только согласованный allowlist нейтральных
результатов; не фото/дневник/расписание. Snapshot API не выдавать за поток событий
BrainKit/AI. PsyGames сохраняет имя/вид питомца, баллы, бонусы, покупки за баллы,
инвентарь, историю и прогресс; credentials/consent/device/outbox исключены.

## Wire, конфликты и удаление

PostgREST base = API + /rest/v1; таблицы ecosystem_app_consents и ecosystem_app_snapshots.
Все чтения/изменения ограничены owner_id+app_id (INSERT передаёт scope в body).
Consent upsert body: owner_id,app_id,issuer,policy_version:1,enabled;
on_conflict=owner_id,app_id, Prefer merge-duplicates/representation.
Snapshot INSERT: owner_id,app_id,request_id UUID,base_revision,payload.
id/revision/created_at принадлежат серверу. Лимит 5MiB; SQL считает нормализованный
JSONB text, клиенты — UTF8 envelope, поэтому пограничный размер может отклониться
сервером. Ограничение каждого app/owner — последние 10 версий.

revision — глобальное непрерывностью НЕ гарантированное CAS-значение.
Успех требует returned revision > base, НЕ base+1. SQLSTATE40001 = конфликт,
без автоматической перезаписи. Один и тот же request_id/payload/base разрешён
для явного повтора, пока запись сохранена среди10; это НЕ вечный dedupe ledger.
23505 при смене payload под retained request = INVALID_PAYLOAD.

Сначала подтвердить server consent OFF, потом DELETE копий только своего app.
OFF/ошибка сети/удаление копий/выход/удаление аккаунта — разные действия.
deleteAccount пока UNAVAILABLE, кнопку не выдавать за рабочую. Локальные данные
не стираются при сетевой ошибке. Уже отправленный запрос нельзя «отозвать» UI.
Локальный общий mutation lane app+issuer+owner не отпускается после UI OFF до
settlement реального transport promise; busy = UNAVAILABLE, не server revocation.
Это не cross-process/device lock. SQL/RLS остаются источником серверных правил.

## Остаток до пользовательского включения

1. Четыре local host checkpoint существуют, это не четыре production-подключения.
   Собственные PsyGames real gateway/startup restore/native callback уже реализованы
   и проверены локально (PSYGAMES_CLOUD_RUNTIME_REF.md); заново их не собирать.
   Остаются выпуск/реальный Auth и устройство, согласованное автоматическое
   восстановление/резервирование вместо только ручного пилота, без второго wallet.
2. G3 server allowlist выполнен: PsyGames + Smart Alarm + Chess & Go + TypeFree,
   четыре exact URL (G3_RECEIPT_20261016.json). Остались согласованные client config
   и настоящие runtime/device проверки, не повторная регистрация тех же URI.
3. Реальные warm/cold login → version/save → restart/restore и OFF/конфликт на
   устройствах, не mock. Новые письма/пользовательские uploads здесь не выполнялись.
4. Общий account deletion и согласованный UX удаления четырёх наборов данных.
   До этого не открывать публичную регистрацию/релиз аккаунта.
5. G1 разрешён; live-проверка двух legacy таблиц подтвердила не только auth SELECT,
   но anon/auth DML/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN и публичный writer RPC.
   Найден работающий anon-consumer i18n; до безопасного переключения по задаче
   584a68fd REVOKE не применять (CLOUD_PUBLIC_ROLLOUT_GATES.md).
   Это не доказанный инцидент. Billing warning не считать устранённым миграцией.

## Проверки текущего кандидата

После cold callback, permission epoch, shared mutation lane и idempotent suspend:
146 Flutter tests PASS, 0 failed/0 skipped; прежние112 + cold12 + cloud22.
Команда из flutter:

```sh
flutter test --no-pub test/cloud_pilot_test.dart test/cloud_settings_screen_test.dart test/settings_screen_test.dart test/l10n_keys_are_bundled_test.dart test/cloud_backup_test.dart test/cloud_snapshot_test.dart test/cloud_restore_test.dart test/account_credential_serialization_test.dart test/chessgo_slow_vault_test.dart test/account_identity_boundaries_test.dart test/ecosystem_account_test.dart test/account_cold_callback_test.dart test/ecosystem_cloud_client_test.dart --reporter expanded
```

TS141/141 PASS, без skips; команды из packages/ecosystem_cloud_ts/README.md,
strict tsc --noEmit PASS. flutter analyze и dart analyze в обоих Dart packages
не нашли замечаний. Flutter/TS transport в этих тестах mock; не суммировать
эти числа с серверным SQL rollback как количество устройств/успешных login.
Дополнительное ревью исправленного P2 retired-connector suspend — static PASS,
затем основной исполнитель заново прогнал все146. Независимое принятие нового
pin владельцами четырёх приложений этим не подменяется.

Immutable source pin/hashes сохранены после commit в ECOSYSTEM_CLOUD_V1_PIN.md.
Плавающий checkout не объявлять immutable. Миграция, runtime,
store/device acceptance и ответы четырёх владельцев — разные границы готовности.
