# Account draft.5 — отдельный кандидат PsyGames 2.56.30

16.10.2026 · psygames-codex-mac · bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
SOURCE: **6ef80e0565a91b160fbd180f07b5920d9cb1b789**,
branch codex/cloud-support-20261016. Это frozen code source; этот PIN добавлен
следующим документационным commit. Не менять прежний ECOSYSTEM_CLOUD_V1_PIN.md:
SOURCE057c/draft.4 остаётся принятой исходной версией для остальных app owners.

Auth0.1.4 / ecosystem.account/1-draft.5, cloud0.1.1 (только dependency manifest;
сам Dart cloud connector и TS client неизменны). Дополнение — фиксированное
удаление общего аккаунта, lifecycle fence и host confirmation на12языках.
Ни generic RPC API, ни сырой JWT не экспортируются.

| Файл в SOURCE | SHA256 |
|---|---|
| packages/ecosystem_account/CONTRACT.md | 5ed4596fa3de13e4806d2d303518d5fe9e5aa78d936fbfad96e2f8300bd06ad5 |
| packages/ecosystem_account/lib/ecosystem_account.dart | 78e3d76aba0bc9612d9693291b1725e94b2b6fa0ee2ea9b2363e4763b95e2eee |
| packages/ecosystem_account/pubspec.yaml | 06966d629ac61eb129c88b3b340717099a432c672220f4987aba1a47c6b33a6c |
| packages/ecosystem_cloud/lib/ecosystem_cloud.dart | 051b0b89584a80473747f566a0223865fd273b2dd34bfd9024da6711da7338fe |
| packages/ecosystem_cloud/pubspec.yaml | d68d6ee3540434bb8297ff0f4fb359949acca4a88ad16bf0c760f0e92e809bac |
| supabase/functions/ecosystem-account-delete/handler.mjs | dc9454274eb321ce0947f7d370dae1007376c0fc5f0407add8dc276d35ce87f7 |

Проверки main:156focusedFlutterPASS/0failed/0skipped;52NodePASS; Flutter и оба
Dartpackageanalyzers clean; exact releaseCloudON runtimeconstruction1PASS без
auth recovery/записи согласия. Log _local/ecosystem-cloud/support-candidate-final-tests.txt,
SHA256524ac865fa00fbfbb427c5da375755d1c420f7858dcdee62b69a3a80132df4cc.
G1_RECEIPT_20261016.json / G2_RECEIPT_20261016.json — реальные backend проверки:
HTTPall-four cascade и VMFlutter host/SDKsave/preview/restore/delete. Все fixtures
очищены. Это не physicaldevice/PKCE acceptance и не автоматическая приёмка4apps.

В release workflows добавлен ЯВНЫЙ inputcloud=true. Без него по-прежнему OFF.
Клиентский publishable key берётся из отдельного repository secret, серверные
credentials в приложение/CI не передаются. CloudON означает наличие настроек,
не автоматическую регистрацию или upload: требуется пользовательское согласие.
Выпуск2.56.30 требует green CI/main и отдельных store receipts; сейчас не заявлен.

Удалённая поддержка Sudoku — отдельная3d5255bc, не свойство account login.
Offline correction primitive — не servergrant, не применение на телефоне и не
изменение Валиных данных. Подготовленные supportSQL/UI не включены в этот SOURCE.
