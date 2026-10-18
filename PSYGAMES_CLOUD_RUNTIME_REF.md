# PsyGames: реальный local gateway, native callback и startup restore

## Дополнение18.10: удалённая поддержка Судоку

Новый клиент `codex/remote-level-support-20261018` использует
тот же неизменённый общий SDK, отдельный opt-in на24ч и узкую серверную очередь.
Сервер уже развёрнут; synthetic REST→Flutter→80→ACK пройден. PR353 влит в
main9a9b1deda после двух зелёных CI; финальное дерево432bd6188 идентично merge.
TestFlight2.56.31+71 и Android2056031 собираются с `cloud=true`; upload и
доставка ещё не подтверждены. В Timeweb создан разрешённый login@asibots.pro,
его TLS/SMTP AUTH проверены; сохранение SMTP в Supabase и обычное письмо ещё
предстоят, как и Samsung-приёмка. Это не функция сборки70.
Полный актуальный реф: [SUDOKU_REMOTE_SUPPORT_REF.md](SUDOKU_REMOTE_SUPPORT_REF.md).
Доставка: [CLOUD_RELEASE_2_56_31_REF.md](CLOUD_RELEASE_2_56_31_REF.md).
`recoverSudokuSupportWrites` закрывает подтверждённый незаконченный local apply
до игровых экранов; журнал/доска остаются приватно на устройстве.
Остальные разделы ниже сохраняют даты своих исторических checkpoint.

16.10.2026 · psygames-codex-mac · bb2c9f30-d786-4fe6-b25c-4b2ace267d4b остаётся OPEN.
Checkout /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011,
branch codex/cloud-release-2-56-29 (прежняя cloud-backup-20261015 — история).
Новый кандидат2.56.30: branchcodex/cloud-support-20261016,
ECOSYSTEM_ACCOUNT_DRAFT5_PIN.md / SOURCE6ef80e0565a91b160fbd180f07b5920d9cb1b789.
Он меняет SDKpin наdraft.5 только для собственной PsyGames-кандидатной интеграции;
следующее описание неизменногоSOURCE057c относится к уже выпущенной2.56.29.
Это НЕ public/released облако; выпуск кода с флагом OFF отслеживается отдельно
в CLOUD_RELEASE_2_56_29_REF.md / TeamOps a44a3d53-3676-4ca2-8e4e-9a7e3c4b518b.
Общий пакет по-прежнему SOURCE057c03d7ba770fbee934918eddb87a88c28d0082,
см. ECOSYSTEM_CLOUD_V1_PIN.md; все package sources/hashes неизменны.
PIN/REF — сопровождающие документы после source commit, не часть его tree;
working REF hash отличается от frozen SOURCE REF ожидаемо, SDK pin не изменён.

## Актуальный host checkpoint: release candidate 2.56.29 — 16.10

Backend checkpoint12:04UTC: G1 выполнен и проверен (G1_RECEIPT_20261016.json),
G3 callbacks зарегистрированы. G2 backend deletion deployed и synthetic HTTP+
realFlutterVM host roundtrip PASS (G2_RECEIPT_20261016.json); новый draft.5 host
ещё не merge/store и physicalPKCE/device приёмки нет. Cloud2.56.29 остаётся OFF;
offline Sudoku correction primitive
не является готовой удалённой поддержкой и не менял данные Вали.

Product source3c4658752ad4f4f11f4abe8229637114c4ee3dc5; PR349 head
a31905702061299a7f06d3992041f530d2855863 содержит только последующую правку
документов. Shared SDK неизменен. 180 scoped Flutter PASS/0failed/0skipped,
analyzer clean; final log/hash в CLOUD_RELEASE_2_56_29_REF.md.
Оба PR CI38880729618/38880729830 и main CI38884522088/38884522054 SUCCESS.
Выпуск2.56.29: Play production2056029 completed и TestFlight69 VALID/«Свои»
независимо подтверждены; CLOUD_RELEASE_2_56_29_REF.md и JSON receipt.
Это доставка кода с cloud OFF, не real Auth/device acceptance.

- Resume только по точному прежнему локальному app/issuer/owner consent и
  совпавшему серверному consent. Pending PKCE имеет приоритет над cached session.
- Перед POST durable owner/issuer write journal сохраняет payload/base/requestId;
  после потери ответа или перезапуска повторяет именно ту же запись.
- Последний ACK content относится к фактически отправленной копии, а не к новым
  локальным изменениям; metadata чужого устройства не заменяет свою CAS base.
- Изменения portable state при явном consent объединяются с задержкой2min;
  inactive/paused запускает best-effort flush без блокировки локальной игры.
  OFF/dispose снимает таймеры/подписки. Ошибки/конфликт не запускают вечный retry.
- Re-enable не выдаёт изменённое офлайн-состояние за уже сохранённое; pending B
  повторяется и при текущем A==lastACK A. Ошибка сериализации не падает в gameplay.
- URI, пришедший во время startup recovery, сохраняется и после invalid первого
  URI: очередь очищается до await startup, а не после него. Точный regression есть.

Нормальные store builds: PSY_CLOUD_PILOT=false, adapter/recovery/uploads отсутствуют.
Это не «autosync всех4apps» и не включённое пользовательское облако.

## Проверка peer-revision race после сообщения Chess & Go — 16.10

Принят к проверке отчёт chess-go-codex-mac по source
ade33eb8cd97f38d970f855c01c5163931a17fdb, его личность/own task798a3063
сверены с TeamOps. Чужие98 тестов не присваиваются этому чату.
Проверен собственный PsyGames gateway на HEAD7e53b514f7d01433c49b9b4d26f8d6b1e6e047f5:
после save `_base = copy.revision` именно своего ACK; `versions()` меняет только
`_remoteHead`. Список после записи другого телефона НЕ принимает его прогресс
как нашу базу. `_base = _remoteHead` разрешено только отдельным явным keep-local.
Это уже было реализовано, нового production/source исправления не потребовалось.

Лично повторно выполнен один существующий regression test:
`flutter test --no-pub test/cloud_gateway_test.dart --plain-name 'metadata refresh never accepts a peer revision as our CAS base' --reporter expanded`
из каталога flutter: **1 PASS**, exit0. Свой ACK7 → metadata чужой11 → следующий
POST по-прежнему base7 и серверный конфликт, не молчаливый overwrite по base11.
Проверка использует настоящий SDK + MockHTTP, не два физических устройства.
Native сборок/серверных записей/писем/релизов не было, общийSDK не менялся.

## Реализовано локально, не fake

- flutter/lib/shell/cloud_gateway.dart: PsyGamesCloudGateway использует настоящие
  EcosystemAccount0.1.3/AppCloudClient0.1.0. Вход/список версий/consent/save/download/
  удаление копий/выход связаны с UI CloudPilot. Отдельного Auth/gameplay writer нет.
- Полный CloudSnapshot внутри common {schema:1,data:appOwnedSnapshot}; имя/вид
  питомца, баллы, покупки за баллы, история и прогресс копируются, НЕ начисляются
  снова. Credentials/consent/device/outbox исключены. Restore — замена, не merge.
- Cold PKCE использует защищённый verifier и сохранённый явный login intent
  (issuer/callback/UUID/time, без email/token), TTL30min, без cached-A resume.
  Intent FIFO и account-owner fencing не позволяют старому экрану/ответу удалить
  intent или отключить новое подключение. OFF отменяет ожидаемый cold intent.
- Metadata GET не принимает peer revision за собственный CAS base. После потери
  ACK повтор сохраняет payload/base/requestId, даже если обновлялся список копий.
  Новый overwrite — только отдельный явный keep-local выбор, не скрытый retry.
- После успешного login и неудачного GET остаётся bound history и metadata-only
  Retry; email/code exchange не повторяется, upload всё ещё OFF.
- Новое согласие psygames_ecosystem_cloud_consent_v1 отдельно от старого
  psygames_cloud_consent_v1: оно НЕ включает legacy frontend outbox/API.
- flutter/lib/shell/cloud_runtime.dart: explicit developer build flag
  PSY_CLOUD_PILOT=false по умолчанию. При false нет adapter/Auth recovery/подписки.
  При true требуется явно заданный утверждённый PSY_SUPABASE_URL и publishable
  PSY_SUPABASE_PUBLISHABLE_KEY, не service role. Ключи не хранить в source/Git/logs.
- app_links7.2.2 pinned, Android/iOS/macOS scheme com.psygames.app. Exact SDK
  callback com.psygames.app://auth/callback, без fragment/userinfo/port; Android/iOS
  default Flutter deep-link handler выключен. URI не передаётся WebView/внешнему
  окну. Нерелевантный URI не блокирует вход, valid queued URI не теряется.
- SettingsScreen получает тот же CloudPilot через HybridApp. Cold callback
  открывает native history preview в том же приложении, warm обновляет свой экран.
- main ожидает restore journal ДО LegacyImport/language/theme/server/WebView.
  Ошибка journal показывает recovery-only Retry, не запускает игру поверх частично
  применённого состояния. Before-image сохраняется как локальная safety copy.
- Host PsyGamesAccountVault: protected OS storage; iOS device-only first unlock,
  macOS usesDataProtectionKeychain=false без межприложенного sharing/provisioning.
  Никакого fallback на preferences/localStorage; общий SDK source не менялся.

## Проверки и границы доказательств

Исторический checkpoint до автоматизации выше:171 Flutter tests PASS,
0 failed/0 skipped: прежние146 + gateway14 + runtime11.
Команда из flutter — прежняя15-file suite с test/cloud_gateway_test.dart и
test/cloud_runtime_test.dart, --no-pub --concurrency=1 --reporter expanded.
flutter analyze --no-pub clean. XML Info.plist iOS/macOS plutil PASS.
В adapter tests реальные SDK/REST builders + MockHTTP/Vault; реальных писем,
логинов/пользовательских uploads/device acceptance и нового store release НЕТ.
Свежий scoped independent static review исправленных P1/P2: PASS, не device PASS.

Попытка flutter build macos --debug завершилась ERROR в codesign FlutterMacOS.framework:
internal error in Code Signing subsystem. Затем отдельный compiler test упёрся
в No space left on device. Оба факта НЕ объявлять успешной native сборкой.
Удалена только собственная пересобираемая flutter/build/macos (~963MiB), не source,
бэкапы/evidence/общие SDK/чужие builds. После этого171-тестовый прогон успешен;
native повтор/установка не выполнялись, тяжёлые builds при общем дефиците места
больше не запускались. Свободное место плавает из-за параллельных работ.
Read-only кандидаты для согласования дальнейшей уборки, ПОСЛЕ остановки тестов:
flutter/build/test_cache ~69MiB (только compiler dill), flutter/build/unit_test_assets
~35MiB (копии assets). Не unique source/release/evidence; пересоздаются тестами.
Они здесь НЕ удалены; во время текущих тестов удалять нельзя.

## Остаток — проект не закрыт

До public activation: G1 legacy permissions/RPC review+защита, G2 account-deletion,
разрешённый real login/device test и согласованный client config.
G3 exact callback allowlist выполнен16.10 по отдельному «да» Дениса:
три URI добавлены к PsyGames, UI verified1→4; G3_RECEIPT_20261016.json.
Это не real login/device test и не public enable.
Needs-decision 75d600c9-65d6-4c82-9f49-2476438d30be,
детали/impact/rollback: CLOUD_PUBLIC_ROLLOUT_GATES.md.
G1 metadata выявила не только SELECT: anon/authenticated имеют DML/TRUNCATE на
двух служебных таблицах, translation_status_set — definer writer без caller guard
и с anon/authenticated EXECUTE. SELECT-only revoke недостаточен. Данных не читали,
ничего не меняли/не атаковали. Нужен target-only service-preserving план, не слепой RLS.

Автоматический app-scoped recovery и фоновое резервирование теперь реализованы
в собственном host за OFF-флагом (checkpoint выше), не являются ещё невыполненным
кодовым пунктом. Остаются real Auth/сеть/смена устройства/обновление и signed
device приёмка; G1/G2 и согласованный client config по-прежнему gates включения.
Не называть host-only/mock проверки готовой autosync всех4apps.
PsyGamescloud задача OPEN. Отдельный2.56.28 Play/TF68 уже выпущен БЕЗ этого облака.
