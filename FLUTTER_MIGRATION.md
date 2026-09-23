<!-- FLUTTER_MIGRATION.md · VER 1 · 23.09.2026 · ведёт координатор psygames-claude-mac -->
# Переезд PsyGames на Flutter — общая доска

> 🔴 **ЭТОТ ФАЙЛ ВЕДУТ ВСЕ РАЗДЕЛЫ.** Перенёс свой экран — ставь ✅, своё имя и дату
> в своей строке, тем же коммитом, что и код. Пустая галочка = не перенесено.
> Файл лежит в репозитории, а не в чьей-то папке, чтобы у всех была одна картина.

**Решение Дениса 23.09.2026:** переезжаем. Причина названа им прямо: «пока не переедем,
я задолбался с глюками по экрану», и отдельно — «везде, где перетаскивание тапом или
соединением, они сильнее всего». Поэтому порядок переноса — **по способу управления**,
а не по хабам: сперва всё, где водят пальцем, соединяют и тыкают.

## Как это устроено — читать до начала работы

Приложение уже гибридное: снаружи Flutter, внутри WebView с нынешней сборкой.
Человек видит привычное приложение целиком; перенесённые игры Flutter **перехватывает**
и показывает нативно (`flutter/lib/shell/hybrid_app.dart`, карта `native`).
Значит переезд идёт ПО ОДНОЙ ИГРЕ, и на каждом шаге приложение остаётся целым.

Прогресс общий: `flutter/lib/shell/shared_state.dart` зеркалит пространство ключей
`psygames_*` в обе стороны. Уровень, добытый в вебе, виден нативной игре и наоборот.

## Что требуется от раздела — пять шагов

1. **Правила — переносом, а не переписыванием.** Выгрузи эталоны прогоном ЖИВОГО TS
   (временная jest-проба пишет JSON, файл после выгрузки удали) в
   `flutter/test/fixtures/<игра>-reference.json`. Пример: `flutter/test/digit_span_test.dart`.
   ⚠️ Проверять перенос той же формулой, которой переносил, нельзя: такая проба зелёная всегда.
2. **Экран — на общем каркасе** `flutter/lib/shell/game_shell.dart`: шапка, полоса
   счётчиков, поле, ряд служебных значков ПОД полем, липкий низ, пауза, лестница уровней.
   Своего каркаса не писать. Если каркаса не хватило — **напиши в канал**, а не правь молча:
   у трёх перенесённых игр правок каркаса понадобилось НОЛЬ, и это число мы держим.
3. **Поле берёт высоту у каркаса числом** (`field: (context, h) => ...`), а не от окна.
   Ровно на этом ошибалась веб-версия — сетка уезжала за экран.
4. **Проба играет партию НАЖАТИЯМИ**, а не вызывает правила. Образцы:
   `flutter/test/one_line_screen_test.dart`, `flutter/test/memory_matrix_screen_test.dart`.
   Плюс мутация: сломай правило — проба обязана покраснеть.
5. **Впиши игру в перехват** (`hybrid_app.dart`, карта `native`) и в пробу
   `flutter/test/hybrid_routes_test.dart`. Без этого человек увидит старый экран.

**Готово, когда:** `flutter analyze` чист, `flutter test` зелёный, игра открывается из
приложения нативно, и в таблице ниже стоит твоя галочка.

## Что уже перенесено

| | Игра | Кто | Когда | Заметка |
|---|---|---|---|---|
| ✅ | `digit-span` | psygames-claude-mac | 23.09 | нативно, перехват в гибриде |
| ✅ | `dots-connect` | psygames-claude-mac | 23.09 | нативно, перехват в гибриде |
| ✅ | `memory-matrix` | psygames-claude-mac | 23.09 | нативно, перехват в гибриде |
| ✅ | `one-line` | psygames-claude-mac | 23.09 | нативно, перехват в гибриде |
| ✅ | `schulte` | psygames-search-claude-mac | 23.09 | тап-игра: 18 ступеней, позднее правило и убегающие клетки; правила сверены с живым TS |

## Что осталось

Владелец проставлен по РЕФАМ САМИХ РАЗДЕЛОВ (`<раздел>-chat/PROJECT_REF.md`), а не по
названию игры. Где стоит ❓ — реф раздела этот экран не называет: узнал свой — впиши себя.

| | Игра | Кто ведёт | Когда | Заметка |
|---|---|---|---|---|
| ☐ | `anagrams` | psygames-words-claude-mac | | |
| ☐ | `ant` | ❓ вписать себя | | |
| ☐ | `attention-conflict` | psygames-attention-claude-mac | | |
| ☐ | `ball-sort` | psygames-sorting-claude-mac | | |
| ☐ | `bart` | ❓ вписать себя | | |
| ☐ | `breathing` | psygames-warmup-claude-mac | | |
| ☐ | `cake-sort` | psygames-sorting-claude-mac | | |
| ☐ | `chess-blind` | ❓ вписать себя | | |
| ☐ | `chess-hub` | ❓ вписать себя | | |
| ☐ | `chinese-tones` | ❓ вписать себя | | |
| ☐ | `choice-rt` | ❓ вписать себя | | |
| ☐ | `cloze` | ❓ вписать себя | | |
| ☐ | `corsi` | ❓ вписать себя | | |
| ☐ | `counter` | psygames-search-claude-mac | | |
| ☐ | `counting-hub` | psygames-search-claude-mac | | |
| ☐ | `cpt` | ❓ вписать себя | | |
| ☐ | `dictation` | psygames-sudoku-claude-mac | | |
| ☐ | `eye-gym` | psygames-warmup-claude-mac | | |
| ☐ | `faces-names` | ❓ вписать себя | | |
| ☐ | `find-differences` | psygames-search-claude-mac | | |
| ☐ | `flanker` | ❓ вписать себя | | |
| ☐ | `flexibility-hub` | psygames-search-claude-mac | | |
| ☐ | `go-no-go` | ❓ вписать себя | | |
| ☐ | `goods-sort` | psygames-sorting-claude-mac | | |
| ☐ | `hanoi` | psygames-sorting-claude-mac | | |
| ☐ | `hearing-hub` | psygames-languages-claude-mac | | |
| ☐ | `inhibition` | ❓ вписать себя | | |
| ☐ | `inhibition-hub` | ❓ вписать себя | | |
| ☐ | `iowa` | ❓ вписать себя | | |
| ☐ | `languages-hub` | psygames-languages-claude-mac | | |
| ☐ | `lexical-decision` | ❓ вписать себя | | |
| ☐ | `listening-span` | ❓ вписать себя | | |
| ☐ | `mahjong` | psygames-search-claude-mac | | |
| ☐ | `math-slider` | psygames-search-claude-mac | | |
| ☐ | `math-sprint` | psygames-search-claude-mac | | |
| ☐ | `memory-palace` | psygames-memory-hearing-claude-mac | | |
| ☐ | `mental-rotation` | psygames-spatial-claude-mac | | |
| ☐ | `mnemonics` | psygames-warmup-claude-mac | | |
| ☐ | `mnemonics-hub` | ❓ вписать себя | | |
| ☐ | `n-back` | ❓ вписать себя | | |
| ☐ | `navigator` | ❓ вписать себя | | |
| ☐ | `number-bonds` | psygames-search-claude-mac | | |
| ☐ | `nut-sort` | psygames-sorting-claude-mac | | |
| ☐ | `object-tracker` | psygames-search-claude-mac | | |
| ☐ | `ospan` | psygames-search-claude-mac | | |
| ☐ | `pattern` | psygames-search-claude-mac | | |
| ☐ | `pause` | psygames-warmup-claude-mac | | |
| ☐ | `phoneme-pairs` | ❓ вписать себя | | |
| ☐ | `phonemic-fluency` | psygames-languages-claude-mac | | |
| ☐ | `picture-pairs` | psygames-span-claude-mac | | |
| ☐ | `pizza-sort` | psygames-sorting-claude-mac | | |
| ☐ | `posner` | ❓ вписать себя | | |
| ☐ | `prl` | ❓ вписать себя | | |
| ☐ | `proofreading` | psygames-attention-claude-mac | | |
| ☐ | `pseudoword-echo` | ❓ вписать себя | | |
| ☐ | `quick-count` | psygames-search-claude-mac | | |
| ☐ | `reading-span` | ❓ вписать себя | | |
| ☐ | `rhythm-pitch` | ❓ вписать себя | | |
| ☐ | `risk-hub` | ❓ вписать себя | | |
| ☐ | `rmet` | ❓ вписать себя | | |
| ☐ | `routes-hub` | ❓ вписать себя | | |
| ☐ | `scholars-mate` | psygames-chess-claude-mac | | |
| ☐ | `sdmt` | ❓ вписать себя | | |
| ☐ | `search-hub` | psygames-attention-claude-mac | | |
| ☐ | `semantic-sort` | ❓ вписать себя | | |
| ☐ | `set-game` | ❓ вписать себя | | |
| ☐ | `simon` | ❓ вписать себя | | |
| ☐ | `sorting-hub` | psygames-sorting-claude-mac | | |
| ☐ | `span` | psygames-span-claude-mac | | |
| ☐ | `spatial-span` | ❓ вписать себя | | |
| ☐ | `stop-signal` | ❓ вписать себя | | |
| ☐ | `story-recall` | ❓ вписать себя | | |
| ☐ | `stroop` | ❓ вписать себя | | |
| ☐ | `stroop-emotional` | ❓ вписать себя | | |
| ☐ | `sudoku` | psygames-chess-claude-mac | | |
| ☐ | `sudoku-fractal` | psygames-sudoku-claude-mac | | |
| ☐ | `sudoku-fractal-deep` | ❓ вписать себя | | |
| ☐ | `sudoku-hub` | psygames-sudoku-claude-mac | | |
| ☐ | `sudoku-samurai` | psygames-sudoku-claude-mac | | |
| ☐ | `switching-task` | psygames-languages-claude-mac | | |
| ☐ | `targets` | ❓ вписать себя | | |
| ☐ | `tower-london` | psygames-sorting-claude-mac | | |
| ☐ | `trail-making` | ❓ вписать себя | | |
| ☐ | `visual-memory-hub` | psygames-memory-hearing-claude-mac | | |
| ☐ | `visual-search` | psygames-attention-claude-mac | | |
| ☐ | `vocab-srs` | psygames-languages-claude-mac | | |
| ☐ | `water-sort` | psygames-sorting-claude-mac | | |
| ☐ | `wcst` | ❓ вписать себя | | |
| ☐ | `word-pairs` | ❓ вписать себя | | |
| ☐ | `words-hub` | psygames-languages-claude-mac | | |

## Замеры, ради которых всё затевалось

| Что меряем | Нынешняя версия | Flutter |
|---|---|---|
| Вес на iPhone, выпуск | 51,1 МБ | 14,6 МБ (гибрид на время переезда — 101,5 МБ) |
| Вес Android, APK | 205 МБ | 47,0 МБ |
| Холодный старт | 364 мс | 102 мс (стенды разные, честный замер на телефоне — `flutter/tools/cold-start.sh`) |
| Отклик на перетаскивании | 8,5 мс | 0,23 мс (стенды разные) |
| Цена одного экрана | — | 443–528 строк своего кода, **0 правок каркаса** |

Подробности и оговорки: `flutter/PROJECT_REF.md` (в git не лежит, он локальный).
