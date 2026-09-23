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
| ✅ | `mahjong` | psygames-search-claude-mac | 23.09 | тап-игра: 84 раскладки ресурсом, раздача решаема по построению, скрытые лица с L10 |
| ✅ | `math-slider` | psygames-search-claude-mac | 23.09 | первая игра с ПЕРЕТАСКИВАНИЕМ: 13 полос лестницы и раздача по зерну сверены с живым TS (96 вопросов побайтно), проба ведёт маркер пальцем. ⚠️ три мутации из пяти сперва НЕ покраснели — дыры в пробах названы в сообщении коммита |
| ✅ | `object-tracker` | psygames-search-claude-mac | 23.09 | слежение за несколькими целями: лестница 41 уровня, раздача и физика сверены с живым TS (разбег траектории за круг 1,7e-14), поле КВАДРАТНОЕ от меньшей из сторон + отдельная проба раскладки на 360×640 и 390×844 |
| ✅ | `quick-count` | psygames-search-claude-mac | 23.09 | точки вспыхивают и надо назвать сколько: лестница 60 уровней и ПОЛНЫЙ перебор окон ответа (342 окна) сверены с живым TS; окно не выдаёт ответ — угадывание равно потолку честной игры, померено в Dart тем же способом, что в вебе; раскладка ряда ответов и раскидывание точек перенесены как ПРАВИЛА и имеют свою пробу на 360×640 и 390×844 |
| ✅ | `pattern` | psygames-search-claude-mac | 23.09 | ряды и заслон неоднозначности (`readings`/`fair`) перенесены целиком: 130 рядов на 26 уровнях совпали с живым TS побайтно; варианты ответа не выдают ответ — утечка «ближайший к среднему» померена в Dart (0,25–0,27 при случайных 0,25); раскладка ряда `cellSize` перенесена ПРАВИЛОМ и её проба поймала два настоящих дефекта — переполнение поля на 23 px и ряд, вставший столбцом |
| ✅ | `math-sprint` | psygames-search-claude-mac | 23.09 | минута на счёт, ответ цифрами: восемь полос школьной оси сверены с живым TS (120 задач побайтно) плюс независимая проверка «ответ сходится с текстом задачи» разбором показанного; раскладка клавиатуры перенесена правилом из живого замера и имеет свою пробу на 360×640 и 390×844 |
| ✅ | `number-bonds` | psygames-search-claude-mac | 23.09 | собрать цель из фишек: лестница 30 уровней (включая открытый хвост за таблицей) и 72 задачи сверены с живым TS побайтно; отдельная проба ПЕРЕБОРОМ доказывает, что задача решаема и цель не лежит фишкой; верное принимается само, окно на задачу и порог «ошибок ≤ 2» перенесены; проба раскладки ужимает фишку под высоту поля |
| ✅ | `stroop` | psygames-attention-claude-mac | 23.09 | нативно, перехват в гибриде; правила сверены с эталонами из живого TS, 6 мутаций краснеют. ⚠️ отклик двух версий сравнить НЕ УДАЛОСЬ — три способа и почему каждый негоден, см. `flutter/tools/latency.md` |

## Что осталось

Владелец проставлен по РЕФАМ САМИХ РАЗДЕЛОВ (`<раздел>-chat/PROJECT_REF.md`), а не по
названию игры. Где стоит ❓ — реф раздела этот экран не называет: узнал свой — впиши себя.

| | Игра | Кто ведёт | Когда | Заметка |
|---|---|---|---|---|
| ◐ | `anagrams` | psygames-words-claude-mac | 23.09 | классика перенесена и играется; словари 10 языков данными; ОСТАЛИСЬ ТРИ РЕЖИМА (all/cross/square) — перехват НЕ включён нарочно, см. ниже |
| ☐ | `ant` | psygames-attention-claude-mac | | |
| ☐ | `attention-conflict` | psygames-attention-claude-mac | | |
| ☐ | `ball-sort` | psygames-sorting-claude-mac | | |
| ☐ | `bart` | psygames-attention-claude-mac | | |
| ☐ | `breathing` | psygames-warmup-claude-mac | | |
| ☐ | `cake-sort` | psygames-sorting-claude-mac | | |
| ☐ | `chess-blind` | ❓ вписать себя | | |
| ☐ | `chess-hub` | ❓ вписать себя | | |
| ☐ | `chinese-tones` | ❓ вписать себя | | |
| ☐ | `choice-rt` | psygames-attention-claude-mac | | |
| ☐ | `cloze` | ❓ вписать себя | | |
| ☐ | `corsi` | ❓ вписать себя | | |
| ☐ | `counter` | psygames-search-claude-mac | | |
| ☐ | `counting-hub` | psygames-search-claude-mac | | |
| ☐ | `cpt` | psygames-attention-claude-mac | | |
| ☐ | `dictation` | psygames-sudoku-claude-mac | | |
| ☐ | `eye-gym` | psygames-warmup-claude-mac | | |
| ☐ | `faces-names` | ❓ вписать себя | | |
| ☐ | `find-differences` | psygames-search-claude-mac | | |
| ✅ | `flanker` | psygames-attention-claude-mac | 23.09 | «Стрелки» нативно, перехват в гибриде. Правила сверены с эталоном из живого TS (`flutter/test/fixtures/flanker-reference.json`, вместе с очередью случайных чисел); 15 проб модели + 4 партии нажатиями; 8 мутаций краснеют, в том числе «отсчёт времени с рождения пробы» и «граница долей зашита 0,85» — в двоичной плавающей точке 0,40 + 0,45 = 0,8500000000000001, и розыгрыш ровно 0,85 даёт конфликтную пробу. ⚠️ отклик двух версий сравнимым числом так и не снят, см. `flutter/tools/latency.md` |
| ✖ | `flexibility-hub` | psygames-search-claude-mac | 23.09 | ПЕРЕНОСИТЬ НЕЧЕГО: развилка «Гибкость» расформирована 12.09.2026 (решение Дениса, вариант Г), игры разошлись по другим разделам. Замер: `ls frontend/app/games \| grep flex` → пусто, `grep flexibility-hub frontend/src/constants` → пусто, маршрута нет |
| ☐ | `go-no-go` | psygames-attention-claude-mac | | |
| ☐ | `goods-sort` | psygames-sorting-claude-mac | | |
| ☐ | `hanoi` | psygames-sorting-claude-mac | | |
| ☐ | `hearing-hub` | psygames-languages-claude-mac | | |
| ☐ | `inhibition` | psygames-attention-claude-mac | | |
| ☐ | `inhibition-hub` | ❓ вписать себя | | |
| ☐ | `iowa` | psygames-attention-claude-mac | | |
| ☐ | `languages-hub` | psygames-languages-claude-mac | | |
| ☐ | `lexical-decision` | ❓ вписать себя | | |
| ☐ | `listening-span` | ❓ вписать себя | | |
| ☐ | `memory-palace` | psygames-memory-hearing-claude-mac | | |
| ☐ | `mental-rotation` | psygames-spatial-claude-mac | | |
| ☐ | `mnemonics` | psygames-warmup-claude-mac | | |
| ☐ | `mnemonics-hub` | ❓ вписать себя | | |
| ☐ | `n-back` | ❓ вписать себя | | |
| ☐ | `navigator` | ❓ вписать себя | | |
| ☐ | `nut-sort` | psygames-sorting-claude-mac | | |
| ☐ | `ospan` | psygames-search-claude-mac | | |
| ☐ | `pause` | psygames-warmup-claude-mac | | |
| ☐ | `phoneme-pairs` | ❓ вписать себя | | |
| ☐ | `phonemic-fluency` | psygames-languages-claude-mac | | |
| ☐ | `picture-pairs` | psygames-span-claude-mac | | |
| ☐ | `pizza-sort` | psygames-sorting-claude-mac | | |
| ☐ | `posner` | psygames-attention-claude-mac | | |
| ☐ | `prl` | psygames-attention-claude-mac | | |
| ☐ | `proofreading` | psygames-attention-claude-mac | | |
| ☐ | `pseudoword-echo` | ❓ вписать себя | | |
| ☐ | `reading-span` | ❓ вписать себя | | |
| ☐ | `rhythm-pitch` | ❓ вписать себя | | |
| ☐ | `risk-hub` | ❓ вписать себя | | |
| ☐ | `rmet` | ❓ вписать себя | | |
| ☐ | `routes-hub` | ❓ вписать себя | | |
| ☐ | `scholars-mate` | psygames-chess-claude-mac | | |
| ☐ | `sdmt` | ❓ вписать себя | | |
| ☐ | `search-hub` | ❓ вписать себя | | не «Внимание»: развилка «Поиска», в моём рефе только как чужая |
| ☐ | `semantic-sort` | ❓ вписать себя | | |
| ☐ | `set-game` | ❓ вписать себя | | |
| ☐ | `simon` | psygames-attention-claude-mac | | |
| ☐ | `sorting-hub` | psygames-sorting-claude-mac | | |
| ☐ | `span` | psygames-span-claude-mac | | |
| ☐ | `spatial-span` | ❓ вписать себя | | |
| ☐ | `stop-signal` | psygames-attention-claude-mac | | |
| ☐ | `story-recall` | ❓ вписать себя | | |
| ☐ | `stroop-emotional` | psygames-attention-claude-mac | | |
| ☐ | `sudoku` | psygames-chess-claude-mac | | |
| ☐ | `sudoku-fractal` | psygames-sudoku-claude-mac | | |
| ☐ | `sudoku-fractal-deep` | ❓ вписать себя | | |
| ☐ | `sudoku-hub` | psygames-sudoku-claude-mac | | |
| ☐ | `sudoku-samurai` | psygames-sudoku-claude-mac | | |
| ☐ | `switching-task` | psygames-languages-claude-mac | | ⚠️ спор: экран внутри набора хаба «Конфликт внимания» (gameSuites.ts:113) — разбираемся в канале, молча не забираю |
| ☐ | `targets` | psygames-attention-claude-mac | | |
| ☐ | `tower-london` | psygames-sorting-claude-mac | | |
| ☐ | `trail-making` | ❓ вписать себя | | |
| ☐ | `visual-memory-hub` | psygames-memory-hearing-claude-mac | | |
| ☐ | `visual-search` | ❓ вписать себя | | не «Внимание»: экран «Поиска»: стоит в его рефе, таблица лестниц |
| ☐ | `vocab-srs` | psygames-languages-claude-mac | | |
| ☐ | `water-sort` | psygames-sorting-claude-mac | | |
| ☐ | `wcst` | psygames-attention-claude-mac | | |
| ☐ | `word-pairs` | ❓ вписать себя | | |
| ☐ | `words-hub` | psygames-languages-claude-mac | | |

## ⚠️ Экран с режимами — не один экран (замер «Слов», 23.09)

За адресом `/games/anagrams` стоят ЧЕТЫРЕ игры: классика, «Все слова», кроссворд,
слово-квадрат. Правил в них ~1100 строк (`ring` 362 + `allWords` 330 + `crossword` 341
+ `classicLevel` 50) плюс три отдельных UI-файла — против 443–528 строк за экран в
таблице ниже.

🔴 **Перехват включать только когда готовы ВСЕ режимы.** `HybridApp.routeOf` срезает
`?query`, то есть `/games/anagrams?mode=cross` попадает в ту же строку карты `native`.
Включить перехват на одном готовом режиме — значит отнять у человека три остальных,
и никакая проба этого не заметит: маршрут-то открывается.
Поэтому у `anagrams` стоит ◐, а не ✅: классика играется, `native` ждёт трёх режимов.

Кого это касается ещё: любой экран, где режим выбирается на самом экране
(`sudoku`, `spatial-lab`, `puzzles` с 42 режимами Тэтхэма).

## ⚠️ Каталоги ассетов: сборка зелёная, файлов нет

Денис потерял заход 23.09: `- assets/words/` берёт только файлы самой папки, вложенные
каталоги молча не попадают в сборку — 17,9 МБ вместо 101,5, без единой ошибки.
Теперь это ловит проба `flutter/test/assets_bundled_test.dart`: она обходит `assets/`
с диска и сверяет с `AssetManifest` настоящей сборки, а не ищет строку в pubspec.
Мутация проверена — завёл `assets/words/themes/` без объявления, проба назвала файл.

## Замеры, ради которых всё затевалось

| Что меряем | Нынешняя версия | Flutter |
|---|---|---|
| Вес на iPhone, выпуск | 51,1 МБ | 14,6 МБ (гибрид на время переезда — 101,5 МБ) |
| Вес Android, APK | 205 МБ | 47,0 МБ |
| Холодный старт | 364 мс | 102 мс (стенды разные, честный замер на телефоне — `flutter/tools/cold-start.sh`) |
| Отклик на перетаскивании | 8,5 мс | 0,23 мс (стенды разные) |
| Отклик на показе стимула | ⚠️ сравнимого замера нет | три способа опробованы, все три несимметричны — `flutter/tools/latency.md` |
| Цена одного экрана | — | 443–528 строк своего кода, **0 правок каркаса** |

Подробности и оговорки: `flutter/PROJECT_REF.md` (в git не лежит, он локальный).
