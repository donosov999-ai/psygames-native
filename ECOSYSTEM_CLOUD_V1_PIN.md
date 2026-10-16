# Immutable handoff: ecosystem.cloud/1 + account draft.4

16.10.2026 · psygames-codex-mac · task bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Текущий API/backend/остаток: ECOSYSTEM_CLOUD_V1_REF.md.

SOURCE COMMIT: **057c03d7ba770fbee934918eddb87a88c28d0082**.
Checkout /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011,
branch codex/cloud-backup-20261015. Сохранено локально, не main/pub/npm/store.
Auth ecosystem_account0.1.3 / ecosystem.account/1-draft.4, cloud Dart0.1.0 / TSv1.
Это новый кандидат; прежние owner ACK на0040152/draft.3 его не принимают.

| Файл относительно SOURCE | SHA256 |
|---|---|
| packages/ecosystem_account/CONTRACT.md | 96bf5674899650a0738193249077031fa7741c05276004e7eea51ee0745ab6ec |
| packages/ecosystem_account/lib/ecosystem_account.dart | 8fbfc98657d0ff52fe7ec03702ec64205958acf23460cba8c1f5b412c414d168 |
| packages/ecosystem_account/pubspec.yaml | 60c398979710a4a6fc2a8f3249295abbb3b4b2ef69f6a31df4cce0b3b8b33feb |
| packages/ecosystem_cloud/lib/ecosystem_cloud.dart | 051b0b89584a80473747f566a0223865fd273b2dd34bfd9024da6711da7338fe |
| packages/ecosystem_cloud_ts/client.ts | 0b82764c4fe9f1ab60c0e96ecc9f19c6d0c01baec56b07eec04b1160fb1ad368 |
| supabase/migrations/20261016022904_ecosystem_app_cloud_backups.sql | e700c77a65ba8bb5e18b49529fb4bc85bdd5debef7adc5dbeda1fdf75eeb62de |

Flutter146/146, TS141/141, strict tsc, Flutter analyzer и Dart package analyzers
PASS. Mock transport tests не означают device/live Auth acceptance. SQL rollback
и anon REST deny проверены отдельно. .dart_tool/конфиг/ключи не входят в commit.

Flutter hosts извлекают git archive точного SOURCE, обе папки packages/ecosystem_account
и packages/ecosystem_cloud вместе, сохраняют ../ecosystem_account и относительный
host pubspec path; не dependency на /Users/... или плавающий HEAD. TypeFree берёт
packages/ecosystem_cloud_ts того же SOURCE; защищённый AuthHost ещё необходим.
Новый cold callback: exact callback/login intent → prepareCallback(consent:true)
→ completeLink(uri), НЕ resume старого cached A. Login не разрешает upload.

Конфиг только в разрешённом локальном хранилище:
/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/personal-nzt.client.json.
Передавать путь, не значения ключей. DefaultOFF. Публичный rollout ждёт runtime,
device roundtrip, callbacks остальных app, account deletion, legacy ACL/billing.
Технический ответ psygames-codex-mac: СОГЛАСЕН на интеграцию кандидата;
публичный rollout ещё НЕ принят. Чужие ACK/доставку/согласие не заявляю.
