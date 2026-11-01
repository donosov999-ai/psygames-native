# PsyGames · четыре настоящих вкладки · передача Клауду

01.11.2026 · psygames-codex-mac. TeamOps: c4fe1fe8-5ec1-4e9d-8b2c-64edaf7bdac1. Дополнение к DESIGN_INTEGRATION_HANDOFF.md, не замена общего плана.

## Статус и безопасная основа

Денис согласовал направление четырёх полных рисунков, затем поручил подготовить подложки и обновить реальные экраны. Обязательное исключение: использовать ПРЕЖНИЕ принятые изображения шапки и футера. Это исполнено. Готов первый работающий Flutter-проход четырёх вкладок, не окончательно принятый внешний вид. Нельзя закрывать визуальную приёмку по наличию кода или этим тестам.

Свой worktree: `/Users/denisonosov/dev/psygames-game-lab/design-integration-20261101`, ветка `codex/psygames-design-integration`. База remote main: `d6621a413f22375c3d0200d82b1a285d063e4336`. Перед финальной передачей повторно сверить remote main. Рабочее дерево Клауда не переключалось и не очищалось; push/merge/магазины/production/миграции данных не разрешены этим этапом и не выполнялись.

Повторный fetch перед передачей подтвердил тот же main. Собственные коммиты: `821432e95` материализация; `e2391fab4` font bugFX; `6d8d2f2dd` shared chrome/источники12PNG/entry motion; `a71912e18` четыре настоящих экрана и контракты. Предыдущие1–5/музыка описаны в основном handoff, не переносить их повторно при наличии в main. Pre-commit targeted tsc для изменённого frontend-теста прошёл.

Канон рисунков/сверки функций: `/Users/denisonosov/dev/psygames-game-lab/design-refresh-20261024/four-tabs-review-20261101/FOUR_TABS_DESIGN_REF.md`. Общий стандарт: `/Users/denisonosov/Downloads/Code claude/APP_CHROME_DESIGN_STANDARD_REF.md`, §8. Копия комплекта для Клауда: `/Users/denisonosov/Downloads/Code claude/psygames-design/four-tabs-review-20261101/`.

## Что реально изменено

| Часть | Реализация | Сохранённая функция |
| --- | --- | --- |
| Все пять шапок | `flutter/lib/shell/tab_chrome.dart`, `aurora_home_header.dart`, подключение в четырёх настоящих экранах | Живой Синапс и настройки; профиль не написан в шапке, его выбор остаётся в настройках |
| Games | `catalog_screen.dart`, `catalog_kit.dart`, `aurora_hub_tile.dart` | Реальные реестры, категории, игры, хабы, счётчики, звёзды, поиск/фильтры на той же странице, переходы |
| Workout | `warmup_screens.dart` | ОДИН выбранный набор; Morning/Daytime/Evening/Night, реальные durs/ownLens и шаги; Series/Your series; справка/запуск |
| Progress | `stats_screen.dart` | Summary/History, refresh, охват текущего режима/всех игр, настоящие метрики/графики/история/пустое состояние |
| Pet | `pet_screen.dart`, `pet_materialization.dart` | Настоящий PetFrames; имя/редактирование, кормление/цены, уход, облики/замки, навыки, AI/обычные реплики |
| Корневая видимость | Адресные изменения `hybrid_app.dart` | Не заменяет WebView/роутер/хранилище. Root сообщает активную вкладку через owner-checked TabChromeHost |
| bugFX | `feedback_fab.dart` | Прежняя кнопка и навигация. Только семейство шрифта подписи берётся из темы одинаково для измерения и рисования, не теряется в screenshot harness |

Все обычные элементы Aurora Games — квадратные, включая одиночный последний. При 320/390 и обычном тексте две колонки; при крупном тексте допустима одна квадратная колонка. Поиск/активный фильтр сохраняют отдельное состояние списка. Количество берётся из реестра, не зашито 145: fixture текущей базы показывает 146. Это не изменение продуктового определения числа игр.

Зарядка не стала новым конструктором: время суток выбирается компактными четырьмя кнопками, детали и длительности выбранной программы связаны одним блоком. Изменения только через существующие WarmupUi actions, не оптимистическая подстановка выбора. Пример пяти утренних шагов экспортирован из реального frontend-моделя для теста, НЕ фиксированная программа приложения.

## Точный стандарт шапки / футера

Единый `AuroraTabHeader`: минимум104 logical px БЕЗ safe area. При крупном тексте одинаково увеличивается на всех пяти вкладках по максимальной измеренной высоте локализованных заголовков. Отступы start20/end12/top20/bottom10, title28sp/1.2/w700/max2lines, subtitle14sp/1.25/max2lines, интервал4. Два action-slot44×44, интервал8. Разная длина подписи не перемещает заголовок/кнопки. Home использует принятый логотип в том же слоте; текст доступности сохранён.

Нижняя панель — существующий `NativeTabBar`, пять равномерных мест, закреплена корневым Scaffold, прежние callbacks и safe area. Подложки `header-{dark,light}`/`footer-{dark,light}` переиспользованы из принятого `home-gem-20261031`, механически обрезана только прозрачная внешняя область. Никаких запечённых названий. Не брать новые шапки с candidate-листов.

`ChromeArt` использует `ExactAssetImage` + `centerSlice` в LOGICAL координатах (raw/scale). Для широких панелей scale3, для header/footer scale6. Нельзя менять PNG/scale без пересчёта slice; нельзя заменять fill на cover. У коротких квадратных care-панелей caps18logical, чтобы высота56 не вызывала painting assertion.

## Динамика и выключатели

- `PSYGAMES_UI_MOTION=true`: конечный входной блик450ms на всех пяти шапках; геометрия текста/кнопок неподвижна. Progress: один600ms clock для появления реальных блоков сверху вниз, без накрутки чисел, задержки данных и блокировки действий.
- Pet: радиальное раскрытие настоящего портрета из центра1000ms, ядро/редкие частицы/кольцо. Один раз при реальном входе, не на каждом обновлении модели; скрытая вкладка не проигрывает эффект заранее.
- Выход/фон прекращают входной эффект; возвращение из фона не создаёт бесконечный повтор. Reduce Motion, accessibleNavigation, Classic и выключенный пилот показывают итог сразу. Нет новых начислений, звука, вибрации и сетевых запросов от эффекта.
- Короткая обычная реплика питомца показана поверх сцены. Длинная, AI-реплика или крупный текст остаются нормальным прокручиваемым блоком, а не обрезаются в облачке.
- Liquid Glass остаётся отдельным прежним пилотом. Новые SFX и haptic-паттерны не включены этим изменением. Существующая музыка/голос/дыхание не заменены.

## Графика и воспроизводимость

12 PNG находятся в `flutter/assets/aurora_tab_panels/` (около8.1MB): четыре wide/selected панели, четыре reused header/footer, две reused square-card основы, две новые пустые сцены питомца. Не заменять живого питомца картинкой фона. Листы/промпты/manifest/contact — `design-integration-evidence/four-tabs/art-sources/`; исходный канонический набор также рядом с FOUR_TABS_DESIGN_REF.md в `assets/`.

`flutter/tools/prepare-tab-panels.py` фиксирует порядок клеток, размеры, alpha crop, sha256 и переиспользование оригиналов. Неверная square-sheet сохранена как rejected, НЕ установлена. Для автономного изучения все исходные листы сохранены; скрипт первоначально адресуется к канонической локальной папке generated_images, не скачивает ничего. При переносе на другую машину заменить только пути источников на сохранённые копии, не генерировать заново принятые изображения.

Текст и данные — локализованные Flutter widgets; decorative assets текстов не содержат. Не ставить полный PNG-макет поверх интерактивного экрана.

## Проверки и реальные изображения

- 128 targeted Flutter tests passed в финальном повторе после всех изменений: header geometry/route entry, квадратный каталог, действия настоящего Workout, Stats/Pet/Classic, PetMaterialization, Hybrid routes/overlay, bugFX. Полная suite повторно НЕ объявляется зелёной: прежний общий прогон и его остаток описаны в основном handoff.
- 24 preview/layout cases: четыре страницы × две темы × (390EN×1,320EN×2,320RTL Arabic×1). RTL проверяет направление и локализованную шапку; тело fixture EN, это НЕ полноценная арабская контент-приёмка. Отдельный контракт шапок включает немецкие длинные названия.
- После font-уточнения отдельно15/15 bugFX tests и38/38 combined preview+bugFX passed (перекрывающиеся наборы, не суммировать как независимые). Последний review debug build успешен; bundle id проверен из Info.plist, исходный AppInfo.xcconfig восстановлен после сборки.
- Анализатор приложения: clean при запуске из `flutter/`. Запуск analyze из корня монорепозитория захватывает sibling packages без их pub get и даёт неэквивалентный шум; не подменять им результат приложения.
- Frontend:12 существующих warmup-tests passed; export1passed/11skipped и targeted ESLint clean. Production frontend изменён только в тесте экспорта, не логика программ.
- Снимки: `flutter/test/design/preview/*-{dark,light}-{top,scrolled,history}.png`. Монтаж4экранов: `design-integration-evidence/four-tabs/four-tabs-flutter-{dark,light}.png`. Это РЕАЛЬНЫЕ Flutter widget renders с fixture, не фото телефона/данные Вали/запись опубликованного приложения.
- Реф/рендер/50%overlay: восемь `*-reference-render-overlay.jpg`. Исходные crop coords в `comparison-crops.json`; одна ширина, пропорции сохранены, короткий кадр дополнен полем, вертикального растяжения нет. Это диагностика, не доказательство совпадения.
- Pet GIF: `design-integration-evidence/pet-materialization.gif`, исходные26кадров и contact рядом. Это реальный компонент со спрайтом, НЕ запись всего приложения.

Команды из `flutter/`:

```sh
flutter analyze
flutter test --no-pub test/design/tab_chrome_contract_test.dart test/design/aurora_workout_actions_test.dart test/design/pet_materialization_test.dart test/pet_screen_test.dart --dart-define=PSYGAMES_UI_MOTION=true
flutter test --no-pub test/design/four_tabs_preview_test.dart --dart-define=CAPTURE_TABS=true --update-goldens
```

Из корня worktree: `python3 flutter/tools/pack-four-tabs-evidence.py`. Screenshot harness на Mac загружает системный Arial и реальные sprite-файлы через временный loopback HTTP; никакие пользовательские аккаунты не нужны.

Review entrypoint: `flutter/lib/design_integration_preview.dart`, реальный HybridApp и маршруты, но in-memory preferences, без LegacyImport/Cloud. Отдельная debug.app: `flutter/build/macos/Build/Products/Debug/PsyGames Integration Review.app`, bundle `pro.psygames.codexDesignIntegration`. Не устанавливать поверх пользовательского приложения. Перед build нужен `bash flutter/tools/embed-web.sh`;88generatedстрок pubspec/web не включать в исходный commit. После review build вернуть AppInfo.xcconfig — исходный production ID не менять в Git.

## Что ещё НЕ принято / НЕ проверено

1. Визуальная приёмка Денисом четырёх реальных экранов и прокрутки. Это первый рабочий проход, а не pixel-match. Games сохраняет текущие пастельные картинки хабов внутри новых рамок; поиск/фильтры ещё используют штатные control surfaces. Не скрывать это отличие от полного jewel-концепта.
2. Толщина/яркость новых внутренних рамок, сочетание care-emoji с драгоценными кнопками, композиция нижней части Pet и history rows требуют отдельной оценки, а не утверждения «стало красиво». Не рисовать новый набор иконок до оценки текущего результата.
3. Физические iPhone/Android, FPS/GPU/батарея, взаимодействие при звонке/смене аудиовыхода, safe area/клавиатура на устройствах, все переводы. Mac заблокирован на момент последних изменений; свежая native-window ручная проверка не выполнена. Widget tests не заменяют её.
4. Полная Flutter suite и CI после всех новых изменений; затем повторная сверка main Клауда и адресная интеграция. Не переносить старые файлы GameShell/HybridApp/зависимости целиком.
5. Массовая миграция игр, Rive-персонаж, новые аудио/вибропаттерны и публикация — не сделаны этим этапом. Музыкальный фикс ранее лежит отдельно в e635ed1bd/MUSIC_CONTINUITY_REF.md, устройство/прослушивание ещё не подтверждены.

Откат: выключить отдельный dart-define для динамики; выбрать Classic для оформления; отменять только собственные небольшие коммиты. Без reset, очистки чужих деревьев и миграций реальных данных. TeamOps-задача остаётся in_progress до настоящей приёмки.

## Уточнение приёмки: History без подложки · 01.11.2026

Денис заметил, что History в Progress без подложки. Причина: у переключателя Summary/History изображение назначалось только выбранному элементу. Исправлено адресно в stats_screen.dart: у обеих вкладок всегда собственная подложка — выбранная золотая approved_action, неактивная dark/light-panel. При переключении оформление меняется местами без изменения размеров; модель/данные/действия истории и Classic не изменены. Это исправление переключателя, а не заявление, что весь визуальный остаток history rows уже принят.

Добавлены regression tests на обе темы/оба направления переключения, отсутствие изменения геометрии и отсутствие новых model mutations; Classic остаётся без новых изображений. Stats + shared chrome37/37, preview/layout24/24, flutter analyze clean. Review debug.app пересобрана с исправлением, production AppInfo восстановлен. Снимки и overlay перегенерированы; компактные четыре состояния в design-integration-evidence/four-tabs/progress-tabs-backplates.png. Упаковка без перерисовки UI: python3 flutter/tools/pack-progress-tabs-evidence.py. Проверка физического телефона и публикация НЕ выполнялись.
