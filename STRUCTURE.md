<!-- STRUCTURE.md · СОБИРАЕТСЯ, РУКАМИ НЕ ПРАВИТЬ · 2026-10-02 08:40 · коммит 972cbedc3 -->
# PsyGames — структура: игры, развилки, потоки, профили

> 🔴 **ЭТОТ ФАЙЛ СОБИРАЕТСЯ, А НЕ ПИШЕТСЯ.** Пересобрать: `node frontend/scripts/build-structure.mjs`
> из корня репозитория. Правка руками пропадёт при следующей сборке — и, что хуже,
> соврёт до неё. Числа сняты из тех же данных, что показывает приложение.
>
> Снято 2026-10-02 08:40 на коммите `972cbedc3`. Копия для Дениса лежит в Obsidian:
> `PsyGames/Структура игр и развилок.md` — обе печатает один прогон.

> ⚙️ **Состав правится не здесь и не в коде, а ФАЙЛОМ настроек.**
> Заводской состав — `frontend/src/constants/defaultPlaylists.json` (едет в сборке);
> мышью — редактор `tools/playlist-editor.html` (у Дениса: [открыть](file:///Users/denisonosov/Downloads/Code%20claude/psygames-playlist-editor/playlist-editor.html)).

## Развилки — что внутри каждой

Развилок 13. Карточка «(группа)» — вход в другую развилку.

### Конфликт внимания · `/games/attention-conflict` — 10 карточек · 19 экранов

- **Струп: торможение** — `/games/stroop` — набор:
    - Эмоциональный — `/games/stroop-emotional`
- **Фланкер: стрелки** — `/games/flanker` — набор:
    - Позиция — `/games/simon`
    - Выбор — `/games/choice-rt`
    - Подсказка — `/games/ant`
- **CPT: устойчивое внимание** — `/games/cpt` — набор:
    - Смена правил — `/games/switching-task`
- **Мишени: реакция** — `/games/targets`
- **WCST: правила** — `/games/wcst`
- **Торможение** — `/games/inhibition` — набор:
    - Запрет — `/games/go-no-go`
    - Отмена начатого — `/games/stop-signal`
- **Posner Cuing: внимание** — `/games/posner`
- **PRL: смена правил** — `/games/prl` — набор:
    - Четыре колоды — `/games/iowa`
    - Надувай шар — `/games/bart`
- **Рискни и сохрани** — `/games/roll-and-bank`
- **Корректура: фокус** — `/games/proofreading`

### Шахматы · `/games/chess-hub` — 8

- **Детский мат** — `/games/scholars-mate`
- **Доска в уме** — `/games/chess-blind`
- **Найди ход** — `/games/find-move`
- **Шахматный пасьянс** — `/games/solitaire-chess`
- **Конь и ферзи** — `/games/knights-queens`
- **Колышки** — `/games/puzzles` `?mode=Pegs`
- **Указатели** — `/games/puzzles` `?mode=Signpost`
- **Инерция** — `/games/puzzles` `?mode=Inertia`

### Счёт · `/games/counting-hub` — 14

- **Считалка: счёт** — `/games/counter`
- **Математическая шкала** — `/games/math-slider`
- **Числовой забег** — `/games/number-run`
- **Математический спринт** — `/games/math-sprint`
- **Числовые пары: счёт** — `/games/number-bonds`
- **OSpan: счёт+память** — `/games/ospan`
- **Паттерны: мышление** — `/games/pattern`
- **Сапёр** — `/games/puzzles` `?mode=Mines`
- **Мозаика** — `/games/puzzles` `?mode=Mosaic`
- **Японский кроссворд** — `/games/puzzles` `?mode=Pattern`
- **Обзор** — `/games/puzzles` `?mode=Range`
- **Магниты** — `/games/puzzles` `?mode=Magnets`
- **Галактики** — `/games/puzzles` `?mode=Galaxies`
- **Частокол** — `/games/puzzles` `?mode=Palisade`

### Слух · `/games/hearing-hub` — 5

- **Фонемы: минимальные пары** — `/games/phoneme-pairs`
- **Тоны китайского** — `/games/chinese-tones`
- **Эхо: псевдослова** — `/games/pseudoword-echo`
- **Диктант** — `/games/dictation`
- **Ритм и высота** — `/games/rhythm-pitch`

### Языки · `/games/languages-hub` — 2

- **Слова** (группа) — `/games/words-hub`
- **Слух** (группа) — `/games/hearing-hub`

### Мнемотехники · `/games/mnemonics-hub` — 5

- **Мнемоника: порядок** — `/games/mnemonics`
- **Дворец памяти** — `/games/memory-palace`
- **Лица и имена** — `/games/faces-names`
- **Пары слов: память** — `/games/word-pairs`
- **Прочти эмоцию** — `/games/rmet`

### Головоломки · `/games/puzzles-hub` — 5

- **Чёт-нечет** — `/games/puzzles`
- **Косые черты** — `/games/puzzles` `?mode=Slant`
- **Чёрный ящик** — `/games/puzzles` `?mode=Black Box`
- **Угадай код** — `/games/puzzles` `?mode=Guess`
- **Кто спрятался?** — `/games/hidden-character`

### Поиск глазами · `/games/search-hub` — 18

- **Визуальный поиск** — `/games/visual-search`
- **Найди отличия** — `/games/find-differences`
- **Маджонг** — `/games/mahjong`
- **Шульте: внимание** — `/games/schulte`
- **Быстрый счёт** — `/games/quick-count`
- **Трекер объектов** — `/games/object-tracker`
- **SDMT: символ→цифра** — `/games/sdmt`
- **SET: тройки признаков** — `/games/set-game`
- **Найди признак** — `/games/monster-traits`
- **Найди признак** — `/games/monster-traits` `?mode=missing`
- **Поиск на ходу** — `/games/search-runner`
- **Найди другую** — `/games/kids-find`
- **Подлодки** — `/games/submarines`
- **Фонари** — `/games/puzzles` `?mode=Light Up`
- **Палатки у деревьев** — `/games/puzzles` `?mode=Tents`
- **Домино** — `/games/puzzles` `?mode=Dominosa`
- **Прямоугольники** — `/games/puzzles` `?mode=Rectangles`
- **Раскраска карты** — `/games/puzzles` `?mode=Map`

### Сортировка · `/games/sorting-hub` — 16

- **Сортировка товаров** — `/games/goods-sort`
- **Пробирки** — `/games/water-sort`
- **Сортировка шариков** — `/games/ball-sort`
- **Сортировка гаек** — `/games/nut-sort`
- **Торты** — `/games/cake-sort`
- **Пицца** — `/games/pizza-sort`
- **Ханойская башня** — `/games/hanoi`
- **Башня Лондона** — `/games/tower-london`
- **Очередь зверей** — `/games/animal-queue`
- **Цвета и формы** — `/games/kids-sort`
- **Заливка** — `/games/puzzles` `?mode=Flood`
- **Снос групп** — `/games/puzzles` `?mode=Same Game`
- **Замкнутая петля** — `/games/puzzles` `?mode=Loopy`
- **Жемчужная петля** — `/games/puzzles` `?mode=Pearl`
- **Мосты** — `/games/puzzles` `?mode=Bridges`
- **Рельсы** — `/games/puzzles` `?mode=Train Tracks`

### Объём памяти · `/games/span` — 6 карточек · 8 экранов

- **Запомни цифры** — `/games/digit-span`
- **Матрица памяти** — `/games/memory-matrix` — набор:
    - Блоки Корси — `/games/corsi`
    - Наоборот — `/games/spatial-span`
- **Слуховой охват** — `/games/listening-span`
- **Reading Span: память** — `/games/reading-span`
- **N-back: оперативная память** — `/games/n-back`
- **Парные картинки** — `/games/picture-pairs`

### Пространство · `/games/spatial-hub` — 18

- **Ментальная ротация** — `/games/mental-rotation`
- **Пространственная лаборатория** — `/games/spatial-lab` `?mode=twiddle`
- **Пространственная лаборатория** — `/games/spatial-lab` `?mode=net`
- **Клоцки** — `/games/puzzles` `?mode=Slide`
- **Сокобан** — `/games/puzzles` `?mode=Sokoban`
- **Освободи путь** — `/games/traffic-jam`
- **Соедини точки** — `/games/dots-connect`
- **Одна линия** — `/games/one-line`
- **Соедини цепочку** — `/games/trail-making`
- **Навигатор** — `/games/navigator`
- **Трубы** — `/games/puzzles` `?mode=Net`
- **Трубы со сдвигом** — `/games/puzzles` `?mode=Netslide`
- **Поворот квадрата** — `/games/puzzles` `?mode=Twiddle`
- **Куб по полю** — `/games/puzzles` `?mode=Cube`
- **Переворот** — `/games/puzzles` `?mode=Flip`
- **Шестнадцать** — `/games/puzzles` `?mode=Sixteen`
- **Пятнашки** — `/games/puzzles` `?mode=Fifteen`
- **Распутать** — `/games/puzzles` `?mode=Untangle`

### Судоку: три доски · `/games/sudoku-hub` — 14

- **Судоку** — `/games/sudoku`
- **Самурай** — `/games/sudoku-samurai`
- **Фрактальная судоку** — `/games/sudoku-fractal`
- **Судоку** — `/games/sudoku` `?mode=towers`
- **Судоку** — `/games/sudoku` `?mode=unequal`
- **Судоку Тэтхэма** — `/games/puzzles` `?mode=Solo`
- **Небоскрёбы Тэтхэма** — `/games/puzzles` `?mode=Towers`
- **Неравенства Тэтхэма** — `/games/puzzles` `?mode=Unequal`
- **Клетки с арифметикой** — `/games/puzzles` `?mode=Keen`
- **Лишние числа** — `/games/puzzles` `?mode=Singles`
- **Заполнение областей** — `/games/puzzles` `?mode=Filling`
- **Нежить** — `/games/puzzles` `?mode=Undead`
- **Кошки** — `/games/cats`
- **Судоку** — `/games/sudoku` `?mode=junior`

### Слова · `/games/words-hub` — 7

- **Словарь SRS** — `/games/vocab-srs`
- **Сортировка слов** — `/games/semantic-sort`
- **Cloze: фразы** — `/games/cloze`
- **Слово или нет?** — `/games/lexical-decision`
- **Анаграммы** — `/games/anagrams`
- **Беглость речи (COWAT)** — `/games/phonemic-fluency`
- **Story Recall: память на детали** — `/games/story-recall`

## Головоломки Тэтхэма — режим → развилка

Все они — ОДИН экран `/games/puzzles`, режим выбирается `?mode=<имя>`; лестница у каждой
своя (`puzzles_<режим>`), `game_type` общий. Разнесено по развилкам 13.09.2026.

| режим | название | развилка |
|---|---|---|
| `Black Box` | Чёрный ящик | Головоломки |
| `Guess` | Угадай код | Головоломки |
| `Slant` | Косые черты | Головоломки |
| `Unruly` | Чёт-нечет | Головоломки |
| `Dominosa` | Домино | Поиск глазами |
| `Light Up` | Фонари | Поиск глазами |
| `Map` | Раскраска карты | Поиск глазами |
| `Rectangles` | Прямоугольники | Поиск глазами |
| `Tents` | Палатки у деревьев | Поиск глазами |
| `Cube` | Куб по полю | Пространство |
| `Fifteen` | Пятнашки | Пространство |
| `Flip` | Переворот | Пространство |
| `Net` | Трубы | Пространство |
| `Netslide` | Трубы со сдвигом | Пространство |
| `Sixteen` | Шестнадцать | Пространство |
| `Slide` | Клоцки | Пространство |
| `Sokoban` | Сокобан | Пространство |
| `Twiddle` | Поворот квадрата | Пространство |
| `Untangle` | Распутать | Пространство |
| `Bridges` | Мосты | Сортировка |
| `Flood` | Заливка | Сортировка |
| `Loopy` | Замкнутая петля | Сортировка |
| `Pearl` | Жемчужная петля | Сортировка |
| `Same Game` | Снос групп | Сортировка |
| `Train Tracks` | Рельсы | Сортировка |
| `Filling` | Заполнение областей | Судоку: три доски |
| `Keen` | Клетки с арифметикой | Судоку: три доски |
| `Singles` | Лишние числа | Судоку: три доски |
| `Solo` | Судоку Тэтхэма | Судоку: три доски |
| `Towers` | Небоскрёбы Тэтхэма | Судоку: три доски |
| `Undead` | Нежить | Судоку: три доски |
| `Unequal` | Неравенства Тэтхэма | Судоку: три доски |
| `Galaxies` | Галактики | Счёт |
| `Magnets` | Магниты | Счёт |
| `Mines` | Сапёр | Счёт |
| `Mosaic` | Мозаика | Счёт |
| `Palisade` | Частокол | Счёт |
| `Pattern` | Японский кроссворд | Счёт |
| `Range` | Обзор | Счёт |
| `Inertia` | Инерция | Шахматы |
| `Pegs` | Колышки | Шахматы |
| `Signpost` | Указатели | Шахматы |

Всего разложено: **42**.

## Игры каталога

Карточек в каталоге: **95**. «Развилки» — где игра показана человеку;
пусто значит, что вход к ней только из профиля, главной или зарядки.

### Раздел `action` — 19

| игра | id | маршрут | развилки |
|---|---|---|---|
| Go / No-Go: торможение | `go_no_go` | `/games/go-no-go` | Конфликт внимания |
| SDMT: символ→цифра | `sdmt` | `/games/sdmt` | Поиск глазами |
| Simon: цвет vs позиция | `simon` | `/games/simon` | Конфликт внимания |
| Выбор-реакция: скорость | `choice_rt` | `/games/choice-rt` | Конфликт внимания |
| Конфликт внимания | `attention_conflict` | `/games/attention-conflict` | — |
| Математическая шкала | `math_slider` | `/games/math-slider` | Счёт |
| Математический спринт | `math_sprint` | `/games/math-sprint` | Счёт |
| Мишени: реакция | `targets` | `/games/targets` | Конфликт внимания |
| Прочти эмоцию | `rmet` | `/games/rmet` | Мнемотехники |
| Слово или нет? | `lexical_decision` | `/games/lexical-decision` | Слова |
| Стоп-сигнал: торможение | `stop_signal` | `/games/stop-signal` | Конфликт внимания |
| Струп: торможение | `stroop` | `/games/stroop` | Конфликт внимания |
| Счёт | `counting_group` | `/games/counting-hub` | — |
| Считалка: счёт | `counter` | `/games/counter` | Счёт |
| Торможение | `inhibition` | `/games/inhibition` | Конфликт внимания |
| Фланкер: стрелки | `flanker` | `/games/flanker` | Конфликт внимания |
| Числовой забег | `number_run` | `/games/number-run` | Счёт |
| Числовые пары: счёт | `number_bonds` | `/games/number-bonds` | Счёт |
| Эмоциональный Stroop | `stroop_emotional` | `/games/stroop-emotional` | Конфликт внимания |

### Раздел `attention` — 15

| игра | id | маршрут | развилки |
|---|---|---|---|
| ANT: 3 сети внимания | `ant` | `/games/ant` | Конфликт внимания |
| CPT: устойчивое внимание | `cpt` | `/games/cpt` | Конфликт внимания |
| Posner Cuing: внимание | `posner` | `/games/posner` | Конфликт внимания |
| Быстрый счёт | `quick_count` | `/games/quick-count` | Поиск глазами |
| Визуальный поиск | `visual_search` | `/games/visual-search` | Поиск глазами |
| Гимнастика для глаз | `eye_gym` | `/games/eye-gym` | — |
| Диктант | `dictation` | `/games/dictation` | Слух |
| Корректура: фокус | `proofreading` | `/games/proofreading` | Конфликт внимания |
| Найди отличия | `find_differences` | `/games/find-differences` | Поиск глазами |
| Поиск глазами | `search_group` | `/games/search-hub` | — |
| Слух | `hearing_group` | `/games/hearing-hub` | Языки |
| Тоны китайского | `chinese_tones` | `/games/chinese-tones` | Слух |
| Трекер объектов | `object_tracker` | `/games/object-tracker` | Поиск глазами |
| Фонемы: минимальные пары | `phoneme_pairs` | `/games/phoneme-pairs` | Слух |
| Шульте: внимание | `schulte_table` | `/games/schulte` | Поиск глазами |

### Раздел `intuition` — 4

| игра | id | маршрут | развилки |
|---|---|---|---|
| BART: риск-баллон | `bart` | `/games/bart` | Конфликт внимания |
| Iowa: 4 колоды | `iowa` | `/games/iowa` | Конфликт внимания |
| PRL: смена правил | `prl` | `/games/prl` | Конфликт внимания |
| WCST: правила | `wcst` | `/games/wcst` | Конфликт внимания |

### Раздел `logic` — 28

| игра | id | маршрут | развилки |
|---|---|---|---|
| Cloze: фразы | `cloze` | `/games/cloze` | Слова |
| SET: тройки признаков | `set_game` | `/games/set-game` | Поиск глазами |
| Анаграммы | `anagrams` | `/games/anagrams` | Слова |
| Башня Лондона | `tower_london` | `/games/tower-london` | Сортировка |
| Беглость речи (COWAT) | `phonemic_fluency` | `/games/phonemic-fluency` | Слова |
| Головоломки | `puzzles_group` | `/games/puzzles-hub` | — |
| Ментальная ротация | `mental_rotation` | `/games/mental-rotation` | Пространство |
| Одна линия | `one_line` | `/games/one-line` | Пространство |
| Паттерны: мышление | `pattern` | `/games/pattern` | Счёт |
| Переключение задач | `switching_task` | `/games/switching-task` | Конфликт внимания |
| Пицца | `pizza_sort` | `/games/pizza-sort` | Сортировка |
| Пробирки | `water_sort` | `/games/water-sort` | Сортировка |
| Пространственная лаборатория | `spatial_lab` | `/games/spatial-lab` | Пространство |
| Пространство | `spatial_group` | `/games/spatial-hub` | — |
| Самурай | `sudoku-samurai` | `/games/sudoku-samurai` | Судоку: три доски |
| Соедини точки | `dots_connect` | `/games/dots-connect` | Пространство |
| Соедини цепочку | `trail_making` | `/games/trail-making` | Пространство |
| Сортировка | `sorting_group` | `/games/sorting-hub` | — |
| Сортировка гаек | `nut_sort` | `/games/nut-sort` | Сортировка |
| Сортировка товаров | `goods_sort` | `/games/goods-sort` | Сортировка |
| Сортировка шариков | `ball_sort` | `/games/ball-sort` | Сортировка |
| Судоку | `sudoku` | `/games/sudoku` | Судоку: три доски |
| Судоку: три доски | `sudoku_group` | `/games/sudoku-hub` | — |
| Торты | `cake_sort` | `/games/cake-sort` | Сортировка |
| Фрактал: Бездна | `sudoku-fractal-deep` | `/games/sudoku-fractal-deep` | — |
| Фрактальная судоку | `sudoku-fractal` | `/games/sudoku-fractal` | Судоку: три доски |
| Ханойская башня | `hanoi` | `/games/hanoi` | Сортировка |
| Чёт-нечет | `puzzles` | `/games/puzzles` | Шахматы, Поиск глазами, Судоку: три доски, Головоломки, Пространство, Сортировка, Счёт |

### Раздел `memory` — 27

| игра | id | маршрут | развилки |
|---|---|---|---|
| N-back: оперативная память | `n_back` | `/games/n-back` | Объём памяти |
| OSpan: счёт+память | `ospan` | `/games/ospan` | Счёт |
| Reading Span: память | `reading_span` | `/games/reading-span` | Объём памяти |
| Story Recall: память на детали | `story_recall` | `/games/story-recall` | Слова |
| Дворец памяти | `memory_palace` | `/games/memory-palace` | Мнемотехники |
| Детский мат | `scholars_mate` | `/games/scholars-mate` | Шахматы |
| Доска в уме | `chess_blind` | `/games/chess-blind` | Шахматы |
| Запомни цифры | `digit_span` | `/games/digit-span` | Объём памяти |
| Кубики Корси | `corsi` | `/games/corsi` | Объём памяти |
| Лица и имена | `faces_names` | `/games/faces-names` | Мнемотехники |
| Маджонг | `mahjong` | `/games/mahjong` | Поиск глазами |
| Матрица памяти | `memory_matrix` | `/games/memory-matrix` | Объём памяти |
| Мнемоника: порядок | `mnemonics` | `/games/mnemonics` | Мнемотехники |
| Мнемотехники | `mnemonics_group` | `/games/mnemonics-hub` | — |
| Навигатор | `navigator` | `/games/navigator` | Пространство |
| Объём памяти | `span_group` | `/games/span` | — |
| Парные картинки | `picture_pairs` | `/games/picture-pairs` | Объём памяти |
| Пары слов: память | `word_pairs` | `/games/word-pairs` | Мнемотехники |
| Пространственный ряд (обратный) | `spatial_span` | `/games/spatial-span` | Объём памяти |
| Ритм и высота | `rhythm_pitch` | `/games/rhythm-pitch` | Слух |
| Слова | `words_group` | `/games/words-hub` | Языки |
| Словарь SRS | `vocab_srs` | `/games/vocab-srs` | Слова |
| Слуховой охват | `listening_span` | `/games/listening-span` | Объём памяти |
| Сортировка слов | `semantic_sort` | `/games/semantic-sort` | Слова |
| Шахматы | `chess_group` | `/games/chess-hub` | — |
| Эхо: псевдослова | `pseudoword_echo` | `/games/pseudoword-echo` | Слух |
| Языки | `languages_group` | `/games/languages-hub` | — |

### Раздел `recovery` — 2

| игра | id | маршрут | развилки |
|---|---|---|---|
| Глаза и дыхание | `pause` | `/games/pause` | — |
| Дыхание | `breathing` | `/games/breathing` | — |

## Потоки — непрерывные серии

У каждой развилки три длины; в потоке разрешены ТОЛЬКО игры этой развилки
(гейт `default-playlists-ship`). У профиля — свои три, по его теме.

| серия | 5 мин | 10 мин | 15 мин |
|---|---|---|---|
| Внимание и торможение `поток-odv999` | 7 | 12 | 18 |
| Витрина новинок `поток-whatsnew` | 6 | 10 | 14 |
| Микро-релакс `поток-women` | 6 | 10 | 14 |
| Внимание: база `поток-free` | 7 | 12 | 16 |
| Игровая карусель `поток-kids` | 6 | 10 | 14 |
| Память без спешки `поток-seniors` | 7 | 10 | 15 |
| Слепая доска и детский мат `поток-chess` | 8 | 15 | 20 |
| Реакция и торможение `поток-drivers` | 7 | 12 | 17 |
| Решения под неопределённостью `поток-execs` | 4 | 8 | 12 |
| Запоминание и удержание `поток-students` | 7 | 9 | 14 |
| Рабочая память `поток-nzt48` | 7 | 11 | 16 |
| Скорость взгляда `поток-vasilyeva` | 7 | 10 | 16 |
| Два языка вперемешку `поток-polyglot` | 6 | 10 | 13 |
| Спан — удержание `поток-хаб-span` | 5 | 9 | 13 |
| Мнемоника `поток-хаб-mnemonics` | 5 | 10 | 15 |
| Шахматы вслепую `поток-хаб-chess` | 6 | 12 | 18 |
| Конфликт внимания `поток-хаб-conflict` | 4 | 8 | 12 |
| Поиск глазами `поток-хаб-search` | 7 | 11 | 15 |
| Судоку и числовые сетки `поток-хаб-sudoku` | 3 | 7 | 9 |
| Головоломки Тэтхэма `поток-хаб-puzzles` | 3 | 7 | 10 |
| Пространство `поток-хаб-spatial` | 5 | 10 | 16 |
| Сортировки и порядок `поток-хаб-sorting` | 5 | 6 | 10 |
| Счёт `поток-хаб-counting` | 4 | 7 | 10 |
| Слова `поток-хаб-words` | 4 | 7 | 10 |
| Слух `поток-хаб-hearing` | 4 | 9 | 14 |
| Языки — билингво `поток-хаб-languages` | 5 | 6 | 11 |

Всего потоков: **78**.

## Серии развилок — все игры одной зарядкой

Собираются `node frontend/scripts/build-hub-series.mjs` по шагу на каждый экран развилки
(задача 12470af9). Собранную серию Денис правит галочками в редакторе — повторный прогон её не трогает.

| серия | шагов | минут (оценка) | профилей |
|---|---|---|---|
| Все игры · Объём памяти `серия-хаб-span` | 8 | ~7 | 4 |
| Все игры · Мнемотехники `серия-хаб-mnemonics` | 5 | ~5 | 3 |
| Все игры · Шахматы `серия-хаб-chess` | 2 | ~2 | 2 |
| Все игры · Конфликт внимания `серия-хаб-conflict` | 18 | ~17 | 3 |
| Все игры · Поиск глазами `серия-хаб-search` | 13 | ~14 | 3 |
| Все игры · Судоку: три доски `серия-хаб-sudoku` | 12 | ~19 | 3 |
| Все игры · Головоломки `серия-хаб-puzzles` | 4 | ~6 | 4 |
| Все игры · Пространство `серия-хаб-spatial` | 17 | ~20 | 3 |
| Все игры · Сортировка `серия-хаб-sorting` | 14 | ~19 | 3 |
| Все игры · Счёт `серия-хаб-counting` | 14 | ~20 | 3 |
| Все игры · Слова `серия-хаб-words` | 7 | ~9 | 4 |
| Все игры · Слух `серия-хаб-hearing` | 5 | ~6 | 2 |
| Все игры · Языки `серия-хаб-languages` | 12 | ~14 | 2 |

Всего серий развилок: **13**.

## Профили

| профиль | игр | развилок задано файлом | своих серий |
|---|---|---|---|
| `odv999` | 3 | 8 | 55 |
| `whatsnew` | 15 | 7 | 7 |
| `women` | 31 | 7 | 11 |
| `free` | 20 | 7 | 7 |
| `kids` | 27 | 8 | 23 |
| `seniors` | 20 | 7 | 11 |
| `chess` | 28 | 7 | 11 |
| `drivers` | 20 | 7 | 7 |
| `execs` | 20 | 7 | 7 |
| `students` | 20 | 7 | 19 |
| `nzt48` | 3 | 7 | 11 |
| `vasilyeva` | 20 | 7 | 11 |
| `polyglot` | 22 | 7 | 15 |
