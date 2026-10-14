# PsyGames — нативное восстановление экрана, 13.10.2026

Задача локального пакета: **26acda04-13a0-47c4-85a3-e795a255b0b9**, исполнитель `psygames-codex-mac`.
Ветка `codex/native-model-recovery-20261013`; база `3bce467e3d34c4ef19ca006e326cda4d9e70d183`.
Checkout: `/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011`.
Репозиторий: https://github.com/donosov999-ai/psygames-native.

## Что сделано и как

Причина подтверждена RED widget-пробой: `_bodyIndex()` после 6 секунд без модели возвращал 0.
Непрозрачный Flutter-слой исчезал и открывал старую WEB-страницу, хотя маршрут оставался нативным.

| Изменение | Реализация | Граница |
|---|---|---|
| Нативный экран не превращается в WEB при таймауте | `flutter/lib/shell/hybrid_app.dart`: индекс нативного тела сохраняется | Только маршруты нативного тела; законные ещё-WEB маршруты не удалены |
| Ошибка, ожидание, повтор и выход на главную | `flutter/lib/shell/screen_model_recovery.dart`, непрозрачный Material; закрытые элементы не принимают тап и исключены из semantics | Новая recovery UI на Dart, не новые расчёты магазина/питомца |
| Безопасный повтор доставки данных | `ScreenUi.requestModel` → `window.__psyRequestScreenModel(route)` в `frontend/src/services/hostScreens.ts` | Только сериализованный снимок текущего смонтированного экрана; без reload/router/refresh/покупки/записи партии |
| Защита повторов и переходов | Таймер отменяется при уходе и готовой модели; новая попытка получает новый таймер. Async ошибка проверяет текущий маршрут и identity конкретного таймера | Проверены A→B→A и поздняя ошибка старого запроса |
| Готовность модели | `null` или ненулевой `loading` остаются ожиданием. Ready→loading снова включает timeout; готовый ответ убирает ошибку | Replay loading не считается восстановлением |
| Убрано устаревшее ожидание WEB для уже-Dart экранов | В `_ownModel` добавлены календарь, источники, коллекция, достижения, лиги | Их расчёты перенесены предыдущими авторами, НЕ этим пакетом |
| Переводы и малые экраны | 2 ключа RU/EN в LanguageContext; 10 overlays; штатный embed в 12 Flutter JSON. RU/EN/AR, светлая/тёмная, 320×568, текст 2× | Машинно подготовленные переводы; носительская вычитка и физический телефон не проверены |

Replay проверяет нормализованный pathname (`.html`, `/index`), живую регистрацию действий и разрешённый host-route.
Снимок сохраняется даже при сбое отправки. Первый `post → register` поддерживается; смена владельца и unmount инвалидируют его.
Старый cleanup не стирает новую регистрацию. Если данных/регистрации нет, replay возвращает false;
после нового срока ожидания человек снова видит нативную ошибку. Это не обход ошибки веб-расчёта.

## Фактическая граница миграции на базе этого пакета

- Собственная модель/каталог на Dart: Главная, Игры, Прогресс, календарь серии, источники, коллекция, достижения, лиги.
- **Ещё шесть экранов тела** получают WEB-модель: итог оценки, знакомство, друзья, магазин, «Что нового», питомец.
- `#switcher` и `#feedback` — отдельные окна, а не ещё две игры или pathname-экрана; их зависимости проверяются отдельно.
- У уже-Dart экранов могут оставаться WEB-действия навигации/сервисов. Отсутствие ожидания модели не означает удаление всех JS-вызовов.
- Native UI зарядки уже существует. Запись партий/серия/награды/облачная синхронизация ещё у WEB; `sessions.dart` — читатель, не второй writer.
- Полное удаление WebView **не выполнено**. Общий план `d6a60b02-09ba-4bbf-9669-39b2b8547437`, владелец `psygames-shell-claude-mac`.
- Единственный Dart-учёт — существующая задача `0f3d3910-c892-47a7-b0f9-03f789c06dde` того же владельца; дублирующий слой не создан.

## Проверки локального пакета

**53 Flutter PASS**: recovery, настоящее HybridApp с подменённым WebView-транспортом, overlay/пауза/отзыв.
**73 Jest PASS** в 10 suites: read-only replay, Android-bound bridge, completeness 12 языков, модели служебных экранов.
`tsc --noEmit`: exit 0. Debug bundle собран; это НЕ подписанная IPA/AAB и НЕ магазинная загрузка.
Полный `flutter analyze --no-pub`: CLEAN, без замечаний. `git diff --check`: CLEAN.
Точный SHA локального коммита записан после сохранения в связанном лабораторном рефе и журнале задачи.

```sh
cd /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011
node flutter/tools/embed-l10n.mjs
git diff --check
cd flutter
flutter test --no-pub --concurrency=1 test/screen_model_recovery_test.dart test/native_tabs_shell_test.dart test/hybrid_overlay_route_repro_test.dart --reporter expanded
flutter analyze --no-pub
flutter build bundle --debug --no-pub
cd ../frontend
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --runInBand --silent src/__tests__/screen-model-retry.test.ts src/__tests__/host-bridge-bound-call.test.ts src/__tests__/i18n-coverage.test.ts src/__tests__/progress-pages-host-model.test.tsx src/__tests__/info-pages-host-model.test.tsx src/__tests__/friends-host-model.test.tsx src/__tests__/shop-host-model.test.tsx src/__tests__/pet-host-model.test.tsx src/__tests__/whats-new-host-model.test.tsx src/__tests__/onboarding-host-model.test.tsx
```

## Интеграция и остаток

При интеграции выпустить TS и Dart вместе, пересобрать embedded WEB штатным pipeline. Одной замены Flutter недостаточно для replay.
Сверить с сохранёнными пакетами `770c73f3` (mascot assets) и `698aaca9` (owner зарядки): они отдельные, автоматически сюда не включены.
Не менять номера версии и не считать локальную готовность публикацией. На физическом устройстве воспроизвести медленный запуск, уход/возврат и потерю модели.

Этот пакет не вводит полный generation-протокол для всех unsolicited `screenUi` сообщений: поздняя модель того же pathname от другого визита всё ещё требует отдельного lifecycle-аудита.
Модель могла не вычислиться вообще: recovery не подставляет выдуманные данные и не перезапускает приложение автоматически.

Связанные рефы: [общая миграция](FLUTTER_MIGRATION.md),
[сохранённые пакеты и статусы](/Users/denisonosov/dev/psygames-game-lab/bugfixes-20261013/MASCOT_AND_WARMUP_REF.md).
Main/production/TestFlight/Google Play этим локальным пакетом не изменены.
