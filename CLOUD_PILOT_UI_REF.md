# Облачные настройки PsyGames — локальный UI-срез

16.10.2026 · psygames-codex-mac · задача bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Checkout: /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Ветка: codex/cloud-backup-20261015. Это локальный код, не live/cloud/store приёмка.

## Сделано

- `flutter/lib/shell/cloud_settings_screen.dart`: нативный экран LOCAL → объяснение
  данных → согласие для входа → email/link → просмотр истории → отдельное
  подтверждение облачного сохранения. Список копий, предварительный просмотр,
  явная подготовка восстановления, конфликт, OFF, выход, подтверждение удаления
  копий только PsyGames.
- `flutter/lib/shell/cloud_pilot.dart`: управление переходами, generation fencing,
  account/issuer binding и versioned receipt app/account/issuer/policy1. Согласие
  и legacy send flag записываются последовательно; при ошибке включения
  разрешение снимается. Поздний ответ после OFF не возвращает ON.
- `SettingsScreen` принимает необязательный `cloudPilot`; вход в раздел появляется
  только при явной передаче подготовленного пилотного host. По умолчанию он
  отсутствует: текущая опубликованная оболочка не получает фальшивую облачную
  функцию, тестовые аккаунты или сетевой клиент.
- Просмотр копии не меняет прогресс. Подтверждённое восстановление только
  делегирует подготовку before/after journal, не применяет его поверх активной
  игры и не складывает кошелёк. На время уже подтверждённой записи journal
  отмена/выход блокируются, чтобы не оставлять скрытую «отменённую» pending-копию.
  Ошибка подготовки возвращает LOCAL с сообщением.
- 29 новых строк в общем каноническом словаре, во всех десяти overlay и двенадцати
  generated native dictionaries. Переводы подготовил ограниченный помощник Gauss;
  основной агент проверил diff, генерацию, TypeScript и общие localization gates.

## Проверено в этом срезе

112 Flutter tests PASS, 0 failed/0 skipped; один объединённый прогон:

```sh
cd /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/flutter
flutter test --no-pub test/cloud_pilot_test.dart test/cloud_settings_screen_test.dart test/settings_screen_test.dart test/l10n_keys_are_bundled_test.dart test/cloud_backup_test.dart test/cloud_snapshot_test.dart test/cloud_restore_test.dart test/account_credential_serialization_test.dart test/chessgo_slow_vault_test.dart test/account_identity_boundaries_test.dart test/ecosystem_account_test.dart --reporter expanded
flutter analyze --no-pub
```

Из них новых: 17 controller + 9 widget/integration tests. Остальные — существующий
account/backup/restore, настройки и наличие словарных ключей; не суммировать этот
набор с прежними 58 как независимые тесты. Проверено отсутствие запросов при
открытии/отказе и отсутствие upload до подтверждения истории; отмена входа,
поздний download/enable, смена аккаунта, конфликт, отдельное удаление, сохранность
баллов/уровней, подготовка restore без применения, маленький экран, текст 1.8×,
RU и Arabic RTL. Это mocks/widget/model, не проверка телефона или реального Auth.

Дополнительно PASS:

```sh
cd /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011
node flutter/tools/embed-l10n.mjs
git diff --check
cd frontend
npx jest --runInBand src/__tests__/i18n-coverage.test.ts
npx tsc --noEmit
```

Localization: 13/13; analyzer: 0 issues; TypeScript: exit0.
Общий SDK/CONTRACT не менялся:
0040152c40a2eb26b1d75890884837804074d1a9 / ecosystem.account/1-draft.3;
CONTRACT SHA256 640febbb6347a356d78644e009c45124fde5e268945c49ca5300ed2a790a39d0.

## Точно не сделано / следующий шаг

`CloudPilotGateway` пока интерфейс; единственная исполнявшаяся реализация — fake
в тестах. Production-адаптер Supabase/CloudBackup/CloudRestore ещё не написан.
Не создана изолированная Free-среда, не добавлен native callback/startup restore,
нет автоматического восстановления versioned consent на старте, серверного
удаления общего аккаунта, двух устройств или тестовой сборки с подключённым
облаком. Не заявлять «синхронизация работает» по этому срезу.

Следом: подготовленный live adapter с проверкой receipt на каждом старте/связывании,
подключение к отдельной Free test authority и startup journal до gameplay/WebView;
затем callback и end-to-end. Не менять чужие приложения/production personal-nzt.
Для опубликованной регистрации общего аккаунта сначала проверенный deletion flow.
Повторного решения Дениса по owner/Free не требуется.

## Связи

- [Утверждённая схема backend](ECOSYSTEM_ACCOUNT_BACKEND_REF.md).
- [Общий checkpoint](CLOUD_BACKUP_IMPLEMENTATION_REF.md).
- [Контракт](packages/ecosystem_account/CONTRACT.md).
- [Независимый учебный выпуск](SUDOKU_PRACTICE_20261015_REF.md): облако в него не входит.
