# PsyGames 2.56.55 · выпуск по разрешению Дениса

01.11.2026 · psygames-codex-mac · TeamOps46eb86da-306f-4c0b-86e4-bc35f47df279.

## Разрешение и контур

После просмотра работающих четырёх вкладок и исправления History Денис написал «заливай». Это новое явное разрешение готовить и отправить согласованный код в TestFlight/Google Play, заменяющее прежнее ограничение этапа1–5 «без публикации». Работаем из собственного worktree /Users/denisonosov/dev/psygames-game-lab/design-integration-20261101, ветка codex/psygames-design-integration. Чужие деревья не переключать/не очищать. Перед push база remote main перепроверена: d6621a413f22375c3d0200d82b1a285d063e4336, новых изменений Клауда нет.

## Подтверждённая стартовая точка

- Главная линия app/package/tauri:2.56.54. TestFlight2.56.54+93 отдана группе «Свои» — успешный workflow41210225785, лог назначения Apple. Это не новый выпуск Codex.
- Google Play readback01.11.2026: production2.56.51/2056051 completed; internal2.56.2; closed-test1 2.56.31. Источник: https://github.com/donosov999-ai/psygames-native/actions/runs/41282221818. Предыдущий Android workflow41210223393 лишь собрал2.56.54: upload skipped. Не называть2.56.54 опубликованной в Play.
- Новый номер2.56.55 / Play2056055. iOS build-number берётся из номера запуска workflow, не выдумывается заранее. Что нового RU/EN обновлено, прежняя история сохранена.

## Состав выпуска

Одобренные Home/четыре вкладки/общие5headers/прежние backings, квадратный каталог, настоящие программы Workout, Progress/Summary/History, PetFrames/materialization, музыка между вкладками, goods-motion. Точная карта функций и проверки: FOUR_TABS_IMPLEMENTATION_REF.md и DESIGN_INTEGRATION_HANDOFF.md. Только настоящий lib/main.dart, не design_integration_preview.dart с in-memory prefs.

Оба мобильных workflow получают один `flutter/config/approved-ui.json`: UI_MOTION/GOODS_MOTION/REWARD_EFFECTS/LIQUID_GLASS true. SFX_ENGINE=off и EVENT_HAPTICS=false. Существующие звуки/голос/дыхание/музыка остаются; экспериментальные звуковые backends не инициализируются. Наличие native зависимостей всё равно требует штатного16KB-gate. Никакой смены шаблона Classic у людей, кто его выбрал, и никаких миграций пользовательских данных.

Облако: прежний cloud=true при запуске, существующий approved public client secret GitHub; настройка доступности НЕ включает синхронизацию/согласие за пользователя. BundleID com.psygames.app, те же store cards/signing. Новый backend/расходы/подписки не подключать.

## Гейты и квитанции

1. Локальные UI-config2tests (compiled defines), analyze clean, release-notes gate passed. До релиза известен только targeted результат, не общий зелёный CI.
2. PR с обычными full CI, без admin bypass. Не менять snapshot чужих веток. Затем адресное слияние по зелёному состоянию и повторная сверка main.
3. Оба штатных workflow собирают и тестируют настоящий код; для Android обязательны подпись/движок/web/16KB. Google Play — production по разрешению Дениса. TestFlight — VALID и назначение группе «Свои», не только upload-app.
4. Записывать фактические PR/SHA/run IDs/versionCodes/ответы магазинов ниже и в TeamOps. При существующих чужих changes in review не отменять их и не обходить защиту deploy_play.js.

Статус на создание этого рефа: ПОДГОТОВКА. Ни новая сборка в Apple, ни Play2056055 пока не подтверждены. Рефы подготовки не являются квитанцией публикации.
