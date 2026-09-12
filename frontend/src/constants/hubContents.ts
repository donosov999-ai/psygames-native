/* psygames-hub-contents · VER 1 · 05.09.2026 */
/**
 * СОСТАВ РАЗВИЛОК — ОДИН СПИСОК НА ЭКРАН И НА ЗНАЧОК.
 *
 * 🔴 ЧТО СЛУЧИЛОСЬ. Отзыв тестировщицы 05.09.2026, дословно: «написано например
 * один а по факту там два стоит и так абсолютно во всех профилях». Замер по
 * исходнику в тот же день: расходятся 6 развилок из 16, 24 пары профиль×развилка.
 * Чистый пример — «Зрительная память»: на значке 2, внутри 3.
 *
 * Причина — ДВА ИСТОЧНИКА ПРАВДЫ, и оба были по-своему правы:
 *   · значок на карточке каталога считал игры по полю `mergedInto`;
 *   · экран развилки рисовал СВОЙ рукописный список, набранный прямо в JSX.
 *
 * ⚠️ И ЭТО НЕ БЫЛО ОПЕЧАТКОЙ, КОТОРУЮ МОЖНО ПОДПРАВИТЬ. У игры ОДИН родитель
 * (`mergedInto`), а появляться она вправе в НЕСКОЛЬКИХ развилках: «матрица
 * памяти» принадлежит охвату (`span_group`), но законно стоит и в «Зрительной
 * памяти». Пока состав развилки выводился из родителя, значок обязан был врать —
 * не из-за ошибки в цифре, а из-за того, что считал не то множество.
 *
 * Поэтому `mergedInto` остаётся, но у него ровно одна работа: КАКАЯ РАЗВИЛКА
 * ОТКРЫВАЕТ ЭТУ ИГРУ ПРОФИЛЮ (правило `filterAllowedGames`: развилка открыта,
 * если открыта хоть одна игра за ней; его стережёт `hub-membership.test.ts`).
 * А ЧТО ЛЕЖИТ ВНУТРИ РАЗВИЛКИ — здесь, в одном месте, и читают отсюда оба:
 * экран (`HubScreen`, `span.tsx`, `attention-conflict.tsx`, `sudoku-hub.tsx`) и
 * значок (`app/index.tsx`). Разойтись им больше нечем.
 *
 * ⚠️ КЛЮЧ — МАРШРУТ РАЗВИЛКИ, А НЕ ЕЁ `id`. Не из вкуса: гейт «второго списка
 * хабов в коде нет» (`sudoku-hub.test.ts`) считает файл, называющий два и больше
 * `id` развилок, забытой копией списка — и был бы прав. Маршрут здесь всё равно
 * первичен: по маршрутам отбирает `filterAllowedGames`, по ним же собраны
 * карточки внутри и вложенные развилки.
 */
import type React from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { visibleSuiteCards } from './gameSuites';

export interface HubSubGame {
  /** Куда уводит карточка. */
  route: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Ключи словаря — имя и описание берём те же, что у карточки в каталоге. */
  nameKey: string;
  descKey: string;
  /** Короткая подпись «чем эта парадигма отличается». Необязательна. */
  typeKey?: string;
  /**
   * КАРТОЧКА НАБОРА (`src/constants/gameSuites.ts`): под ней несколько парадигм,
   * режим выбирается плашками внутри игры. `route` тогда — вход по умолчанию, но
   * ведёт карточка на первый ОТКРЫТЫЙ профилю режим, а подпись-тип собирается из
   * имён открытых режимов. Разбор — в шапке реестра.
   */
  suiteId?: string;
}

/**
 * ЧТО ЧЕЛОВЕК УВИДИТ ВНУТРИ КАЖДОЙ РАЗВИЛКИ. Ключ — маршрут развилки из каталога.
 *
 * Порядок строк — порядок на экране, он задан осознанно и правится здесь.
 */
export const HUB_CONTENTS: Record<string, HubSubGame[]> = {
  /* ——— Память ——— */
  '/games/span': [
    {
      route: '/games/digit-span',
      icon: 'keypad',
      nameKey: 'digitSpan',
      descKey: 'digitSpanDesc',
      typeKey: 'spanTypeDigit',   // «Цифры · forward + backward» — словарь LanguageContext
    },
    /**
     * КАРТОЧКА НАБОРА «Позиции» — решение Дениса 05.09.2026. Под ней три экрана:
     * матрица памяти (регулярная сетка), кубики Корси (нерегулярные блоки) и
     * spatial-span (та же сетка, обратный порядок). Матрица переехала сюда из
     * «Зрительной памяти»: два из трёх — тесты охвата, и меряют они одно.
     * Разбор и вскрытый по дороге дубль — в шапке `src/constants/gameSuites.ts`.
     */
    {
      route: '/games/memory-matrix',
      icon: 'grid',
      nameKey: 'suitePositions',
      descKey: 'suitePositionsDesc',
      suiteId: 'suite_positions',
    },
    /**
     * Три «охвата с нагрузкой» — добавлены 04.09.2026. Отличие от первых трёх в том,
     * что запоминать приходится НЕ в тишине: между стимулами человек читает, слушает
     * или считает. Именно так объём памяти меряют в клинике, и именно это ближе к
     * жизни, где ничего не запоминается в вакууме.
     */
    { route: '/games/listening-span', icon: 'headset', nameKey: 'listeningSpan', descKey: 'listeningSpanDesc', typeKey: 'spanTypeListening' },
    { route: '/games/reading-span', icon: 'book', nameKey: 'readingSpan', descKey: 'readingSpanDesc', typeKey: 'spanTypeReading' },
    /**
     * N-back — тот же объём удерживаемого в голове, только ряд не кончается:
     * держать надо не «сколько запомнил», а «что было N шагов назад». Стояла
     * отдельной карточкой до 04.09.2026 — при том, что меряет ровно это.
     */
    { route: '/games/n-back', icon: 'sync', nameKey: 'nBack', descKey: 'nBackDesc', typeKey: 'spanTypeNBack' },
    /**
     * «Парные картинки» пришли 12.09.2026 из расформированной «Зрительной
     * памяти» (вариант А, задача 43bc1ca2). Резали по МЕХАНИКЕ, а не по
     * материалу: здесь всё про «удержать сейчас», и `skillVisualMemory` у
     * парных картинок тот же, что у всех трёх экранов набора «Позиции».
     *
     * ⚠️ Второй вход к «Матрице памяти» при этом СНЯТ, а не потерян: экран
     * живёт в наборе «Позиции» выше. Прежде он стоял в двух развилках сразу —
     * это было законно и специально описано в шапке файла; теперь развилки,
     * дававшей второй вход, просто нет.
     */
    { route: '/games/picture-pairs', icon: 'copy', nameKey: 'picturePairs', descKey: 'picturePairsDesc' },
  ],

  '/games/mnemonics-hub': [
    { route: '/games/mnemonics', icon: 'bulb', nameKey: 'mnemonics', descKey: 'mnemonicsDesc' },
    { route: '/games/memory-palace', icon: 'home', nameKey: 'memoryPalace', descKey: 'memoryPalaceDesc' },
    { route: '/games/faces-names', icon: 'person', nameKey: 'facesNames', descKey: 'facesNamesDesc' },
    { route: '/games/word-pairs', icon: 'link', nameKey: 'wordPairs', descKey: 'wordPairsDesc' },
    /**
     * RMET «Прочти эмоции» — 12.09.2026, вариант «б» (задача 4332ce4e).
     * ⚠️ Слабое место названо Денису ДО решения: `skillKey: 'skillSocial'` —
     * единственный такой во всём каталоге, ни одна из развилок не берёт игру
     * по навыку. Сходится по МАТЕРИАЛУ: лица и глаза, как у «Лиц и имён».
     * Наберётся ещё социальных — из них двоих выйдет развилка «Люди».
     */
    { route: '/games/rmet', icon: 'eye', nameKey: 'rmet', descKey: 'rmetDesc' },
  ],

  '/games/chess-hub': [
    { route: '/games/scholars-mate', icon: 'flash', nameKey: 'scholarsMate', descKey: 'scholarsMateDesc', typeKey: 'chessTypeTactics' },
    { route: '/games/chess-blind', icon: 'apps', nameKey: 'chessBlind', descKey: 'chessBlindDesc', typeKey: 'chessTypeBlind' },
  ],

  /* ——— Внимание ——— */
  '/games/attention-conflict': [
    /**
     * 🔴 ПЯТЬ КАРТОЧЕК ВМЕСТО ДЕСЯТИ — ПЕРВИЧНОЕ ОБЪЕДИНЕНИЕ 05.09.2026.
     * Решение Дениса по кадрам хаба: «1 и 2 слить в одно, режимом; 3 4 5 6 — тоже;
     * 7 и 8 — тоже. Делаем как Шульте». Разбор — в шапке `gameSuites.ts`.
     */
    { route: '/games/stroop', icon: 'color-palette', nameKey: 'suiteStroop', descKey: 'suiteStroopDesc', suiteId: 'suite_stroop' },
    { route: '/games/flanker', icon: 'arrow-forward', nameKey: 'suiteArrows', descKey: 'suiteArrowsDesc', suiteId: 'suite_arrows' },
    { route: '/games/cpt', icon: 'timer', nameKey: 'suiteStream', descKey: 'suiteStreamDesc', suiteId: 'suite_stream' },
    // Мишени и WCST остаются одиночными: у первой свой носитель (цветные объекты,
    // а не стрелка), у второй правило не объявляется вовсе — сливать не с чем.
    { route: '/games/targets', icon: 'locate', nameKey: 'targets', descKey: 'targetsDesc', typeKey: 'acTypeTargets' },
    { route: '/games/wcst', icon: 'grid', nameKey: 'wcst', descKey: 'wcstDesc', typeKey: 'acTypeWcst' },
    /**
     * 🔴 ЧЕТЫРЕ ПРИБАВЛЕНИЯ 12.09.2026 — расформированы развилки «Торможение» и
     * «Риск», плюс «Корректура» пришла из «Поиска». Задачи 80eb49c9, 4dce5eb9,
     * 9dc01150. Причина у всех трёх одна: у развилок не было владельца, а оси
     * родственные — здесь уже меряют, как человек держит правило против помехи.
     *
     * Posner НЕ в набор «Торможения»: три его режима меряют удержание и отмену
     * действия, а Posner — выигрыш во времени от подсказки-метки. Тот же довод,
     * по которому одиночными оставлены «Мишени» и WCST.
     */
    { route: '/games/inhibition', icon: 'hand-left', nameKey: 'suiteInhibition', descKey: 'suiteInhibitionDesc', suiteId: 'suite_inhibition' },
    { route: '/games/posner', icon: 'navigate', nameKey: 'posner', descKey: 'posnerDesc' },
    { route: '/games/prl', icon: 'shuffle', nameKey: 'suiteDecisions', descKey: 'suiteDecisionsDesc', suiteId: 'suite_decisions' },
    // Корректурная проба Бурдона всегда была тестом концентрации, а не словарём:
    // механика — удержание внимания на однообразном материале. Экран НЕ режем,
    // филворды едут вместе с ним (решение Дениса 12.09.2026).
    { route: '/games/proofreading', icon: 'create-outline', nameKey: 'proofreading', descKey: 'proofreadingDesc' },
  ],

  '/games/search-hub': [
    { route: '/games/visual-search', icon: 'scan', nameKey: 'visualSearch', descKey: 'visualSearchDesc' },
    /*
     * ⚠️ КЛЮЧИ `findDiff*`, А НЕ `findDifferences*`. Второй пары в словаре нет
     * вовсе, и человек видел на карточке буквально «findDifferences» —
     * подтверждено на собранном вебе 12.09.2026, и в русском, и в английском.
     * Нашёл чат «Поиск»; сторожит теперь `hub-keys-exist`.
     */
    { route: '/games/find-differences', icon: 'copy', nameKey: 'findDiff', descKey: 'findDiffDesc' },
    { route: '/games/mahjong', icon: 'grid', nameKey: 'mahjong', descKey: 'mahjongDesc' },
    { route: '/games/schulte', icon: 'apps', nameKey: 'schulteTable', descKey: 'schulteTableDesc' },
    { route: '/games/quick-count', icon: 'eye', nameKey: 'quickCount', descKey: 'quickCountDesc' },
    { route: '/games/object-tracker', icon: 'locate', nameKey: 'objectTracker', descKey: 'objectTrackerDesc' },
    /**
     * SDMT и SET пришли 12.09.2026 из расформированной «Гибкости» (задача
     * 8f0b0428). Довод из определения самой развилки — «найти нужное среди
     * похожего»: у SDMT ключ символ→цифра вверху и таблица внизу, глаза бегают
     * между ними, и `skillKey` у него `skillProcessingSpeed`; у SET надо найти
     * тройку среди похожих карточек — тот же зрительный перебор.
     */
    { route: '/games/sdmt', icon: 'swap-horizontal', nameKey: 'sdmt', descKey: 'sdmtDesc' },
    { route: '/games/set-game', icon: 'apps', nameKey: 'setGame', descKey: 'setGameDesc' },
  ],

  /* ——— Логика ——— */
  '/games/sudoku-hub': [
    {
      route: '/games/sudoku',
      icon: 'apps',
      nameKey: 'sudoku',
      descKey: 'sudokuDesc',
      typeKey: 'sudokuTypeClassic',   // «Одна сетка · 57 ступеней» — словарь LanguageContext
    },
    { route: '/games/sudoku-samurai', icon: 'grid', nameKey: 'samuraiTitle', descKey: 'samuraiDesc', typeKey: 'sudokuTypeSamurai' },
    { route: '/games/sudoku-fractal', icon: 'git-network', nameKey: 'fractalTitle', descKey: 'fractalDesc', typeKey: 'sudokuTypeFractal' },
    /**
     * Небоскрёбы и неравенства — РЕЖИМЫ классической доски (задача 70b58bbe):
     * карточка ведёт на тот же экран с ?mode=…, у каждого своя мини-лестница на
     * 8 ступеней и свой счётчик. Партии пишутся под game_type='sudoku' с
     * mode='towers-N'/'unequal-N' — это режимы одной доски, как killer, а не
     * отдельные доски с прогрессом (за то и различие с самураем/фракталом).
     */
    { route: '/games/sudoku?mode=towers', icon: 'business', nameKey: 'sudokuTowersTitle', descKey: 'sudokuTowersHubDesc', typeKey: 'sudokuTypeTowers' },
    { route: '/games/sudoku?mode=unequal', icon: 'swap-vertical', nameKey: 'sudokuUnequalTitle', descKey: 'sudokuUnequalHubDesc', typeKey: 'sudokuTypeUnequal' },
  ],


  /**
   * ⚠️ ПЕРЕЛИВАЛКА НАМЕРЕННО СТОИТ И В «БАШНЯХ», И ЗДЕСЬ. Это законно (см. шапку):
   * родитель у игры один, показываться она вправе в нескольких развилках.
   * В «Башнях» она за то, что ход ограничен правилом и считать надо наперёд;
   * здесь — за то, что ограничивает ВМЕСТИМОСТЬ ёмкости.
   */
  /**
   * «Ментальная ротация» (решение Дениса 09.09.2026): три пробы на вращение в уме.
   * Два упражнения лаборатории живут на одном экране и различаются `?mode=` — как режимы
   * судоку; карточка каталога у них одна (`spatial_lab`), развилка показывает две.
   */
  /*
   * ГОЛОВОЛОМКИ ТЭТХЭМА — семнадцать на одном экране, режим в параметре `?mode=`.
   * ⚠️ Строка `visibleHubCards` сама открывает `?mode=…`, когда профилю открыт голый
   * путь `/games/puzzles`, — своей записи в каталоге режимам не нужно.
   */
  /**
   * СОРОК ДВИЖКОВ ТЭТХЭМА — сорок карточек. Решение Дениса 10.09.2026: «берём все»,
   * сперва в одну развилку, разнести по тематическим — потом (перенос карточки = одна
   * переставленная строка, экран и словарь не трогаются).
   * Порядок повторяет `names.ts` и держится проверкой при сборке этого файла.
   */
  '/games/puzzles-hub': [
    { route: '/games/puzzles', icon: 'ellipse', nameKey: 'puzzlesUnruly', descKey: 'puzzlesUnrulyDesc' },
    { route: '/games/puzzles?mode=Mines', icon: 'warning', nameKey: 'puzzlesMines', descKey: 'puzzlesMinesDesc' },
    { route: '/games/puzzles?mode=Mosaic', icon: 'grid-outline', nameKey: 'puzzlesMosaic', descKey: 'puzzlesMosaicDesc' },
    { route: '/games/puzzles?mode=Pattern', icon: 'grid', nameKey: 'puzzlesPattern', descKey: 'puzzlesPatternDesc' },
    { route: '/games/puzzles?mode=Singles', icon: 'remove-circle', nameKey: 'puzzlesSingles', descKey: 'puzzlesSinglesDesc' },
    { route: '/games/puzzles?mode=Range', icon: 'eye', nameKey: 'puzzlesRange', descKey: 'puzzlesRangeDesc' },
    { route: '/games/puzzles?mode=Light%20Up', icon: 'bulb', nameKey: 'puzzlesLightUp', descKey: 'puzzlesLightUpDesc' },
    { route: '/games/puzzles?mode=Tents', icon: 'triangle', nameKey: 'puzzlesTents', descKey: 'puzzlesTentsDesc' },
    { route: '/games/puzzles?mode=Magnets', icon: 'magnet', nameKey: 'puzzlesMagnets', descKey: 'puzzlesMagnetsDesc' },
    { route: '/games/puzzles?mode=Undead', icon: 'skull', nameKey: 'puzzlesUndead', descKey: 'puzzlesUndeadDesc' },
    { route: '/games/puzzles?mode=Keen', icon: 'calculator', nameKey: 'puzzlesKeen', descKey: 'puzzlesKeenDesc' },
    { route: '/games/puzzles?mode=Solo', icon: 'apps-outline', nameKey: 'puzzlesSolo', descKey: 'puzzlesSoloDesc' },
    { route: '/games/puzzles?mode=Towers', icon: 'business', nameKey: 'puzzlesTowers', descKey: 'puzzlesTowersDesc' },
    { route: '/games/puzzles?mode=Unequal', icon: 'swap-vertical', nameKey: 'puzzlesUnequal', descKey: 'puzzlesUnequalDesc' },
    { route: '/games/puzzles?mode=Rectangles', icon: 'square-outline', nameKey: 'puzzlesRectangles', descKey: 'puzzlesRectanglesDesc' },
    { route: '/games/puzzles?mode=Filling', icon: 'color-fill', nameKey: 'puzzlesFilling', descKey: 'puzzlesFillingDesc' },
    { route: '/games/puzzles?mode=Palisade', icon: 'browsers', nameKey: 'puzzlesPalisade', descKey: 'puzzlesPalisadeDesc' },
    { route: '/games/puzzles?mode=Galaxies', icon: 'planet', nameKey: 'puzzlesGalaxies', descKey: 'puzzlesGalaxiesDesc' },
    { route: '/games/puzzles?mode=Map', icon: 'map', nameKey: 'puzzlesMap', descKey: 'puzzlesMapDesc' },
    { route: '/games/puzzles?mode=Loopy', icon: 'git-network', nameKey: 'puzzlesLoopy', descKey: 'puzzlesLoopyDesc' },
    { route: '/games/puzzles?mode=Pearl', icon: 'ellipse-outline', nameKey: 'puzzlesPearl', descKey: 'puzzlesPearlDesc' },
    { route: '/games/puzzles?mode=Slant', icon: 'chevron-forward', nameKey: 'puzzlesSlant', descKey: 'puzzlesSlantDesc' },
    { route: '/games/puzzles?mode=Bridges', icon: 'git-merge', nameKey: 'puzzlesBridges', descKey: 'puzzlesBridgesDesc' },
    { route: '/games/puzzles?mode=Train%20Tracks', icon: 'train', nameKey: 'puzzlesTracks', descKey: 'puzzlesTracksDesc' },
    { route: '/games/puzzles?mode=Signpost', icon: 'navigate', nameKey: 'puzzlesSignpost', descKey: 'puzzlesSignpostDesc' },
    { route: '/games/puzzles?mode=Dominosa', icon: 'apps', nameKey: 'puzzlesDominosa', descKey: 'puzzlesDominosaDesc' },
    { route: '/games/puzzles?mode=Untangle', icon: 'share-social', nameKey: 'puzzlesUntangle', descKey: 'puzzlesUntangleDesc' },
    { route: '/games/puzzles?mode=Net', icon: 'git-network-outline', nameKey: 'puzzlesNet', descKey: 'puzzlesNetDesc' },
    { route: '/games/puzzles?mode=Netslide', icon: 'shuffle', nameKey: 'puzzlesNetslide', descKey: 'puzzlesNetslideDesc' },
    { route: '/games/puzzles?mode=Twiddle', icon: 'sync-circle', nameKey: 'puzzlesTwiddle', descKey: 'puzzlesTwiddleDesc' },
    { route: '/games/puzzles?mode=Sixteen', icon: 'repeat', nameKey: 'puzzlesSixteen', descKey: 'puzzlesSixteenDesc' },
    { route: '/games/puzzles?mode=Fifteen', icon: 'swap-horizontal', nameKey: 'puzzlesFifteen', descKey: 'puzzlesFifteenDesc' },
    { route: '/games/puzzles?mode=Flip', icon: 'contrast', nameKey: 'puzzlesFlip', descKey: 'puzzlesFlipDesc' },
    { route: '/games/puzzles?mode=Cube', icon: 'cube', nameKey: 'puzzlesCube', descKey: 'puzzlesCubeDesc' },
    { route: '/games/puzzles?mode=Black%20Box', icon: 'cube-outline', nameKey: 'puzzlesBlackBox', descKey: 'puzzlesBlackBoxDesc' },
    { route: '/games/puzzles?mode=Guess', icon: 'color-palette', nameKey: 'puzzlesGuess', descKey: 'puzzlesGuessDesc' },
    { route: '/games/puzzles?mode=Flood', icon: 'water', nameKey: 'puzzlesFlood', descKey: 'puzzlesFloodDesc' },
    { route: '/games/puzzles?mode=Same%20Game', icon: 'albums', nameKey: 'puzzlesSameGame', descKey: 'puzzlesSameGameDesc' },
    { route: '/games/puzzles?mode=Pegs', icon: 'disc', nameKey: 'puzzlesPegs', descKey: 'puzzlesPegsDesc' },
    { route: '/games/puzzles?mode=Inertia', icon: 'diamond', nameKey: 'puzzlesInertia', descKey: 'puzzlesInertiaDesc' },
  ],

  /**
   * 🔴 ПЯТЬ, А НЕ ТРИ (решение Дениса 11.09.2026). Две последние — из папки `unfinished`
   * канона Тэтхэма, шестого раздела коллекции, которого нет на его сайте. Взяты за
   * ПРОСТРАНСТВЕННУЮ ось: «Клоцки» — планирование перестановок на тесной доске,
   * «Сокобан» — необратимость хода (бочку, загнанную в угол, не вытащить).
   * Обе играются тапом, крестовина не нужна: замер `interpret_move` — у `slide.c` это
   * LEFT_BUTTON/DRAG/RELEASE, у `sokoban.c` клик задаёт направление относительно игрока.
   * ⚠️ Число карточек закреплено ЛИТЕРАЛОМ в `hub-not-empty-in-every-profile.test.ts` —
   * меняя состав, правь и его, иначе проба покраснеет (так и задумано).
   * Движки, лестница Сокобана и запрет своих параметров у Клоцков — `tatham-bridge/names.ts`.
   */
  '/games/spatial-hub': [
    { route: '/games/mental-rotation', icon: 'cube', nameKey: 'mentalRotation', descKey: 'mentalRotationDesc' },
    { route: '/games/spatial-lab?mode=twiddle', icon: 'sync-circle', nameKey: 'spatialTwiddle', descKey: 'spatialTwiddleDesc' },
    { route: '/games/spatial-lab?mode=net', icon: 'git-network', nameKey: 'spatialNet', descKey: 'spatialNetDesc' },
    { route: '/games/puzzles?mode=Slide', icon: 'albums', nameKey: 'puzzlesSlide', descKey: 'puzzlesSlideDesc' },
    { route: '/games/puzzles?mode=Sokoban', icon: 'cube-outline', nameKey: 'puzzlesSokoban', descKey: 'puzzlesSokobanDesc' },
    /**
     * ЧЕТЫРЕ ПРИБАВЛЕНИЯ 12.09.2026. Три первых — расформированная развилка
     * «Маршруты» (задача 81486a4a): дорожная карта движков Тэтхэма у того же
     * владельца прямо ведёт заимствования В ЭТИ экраны (Loopy и Bridges → «Одна
     * линия», Rectangles → «Точки»), так что оставить их отдельно значило бы
     * разрезать одну задачу между двумя чатами.
     * «Навигатор» — из расформированной «Зрительной памяти» (задача 43bc1ca2):
     * `skillKey` у него `skillSpatial`, единственный такой во всей той тройке.
     */
    { route: '/games/dots-connect', icon: 'ellipse', nameKey: 'dotsConnect', descKey: 'dotsConnectDesc' },
    { route: '/games/one-line', icon: 'analytics', nameKey: 'oneLine', descKey: 'oneLineDesc' },
    { route: '/games/trail-making', icon: 'git-network', nameKey: 'trailMaking', descKey: 'trailMakingDesc' },
    { route: '/games/navigator', icon: 'navigate', nameKey: 'navigator', descKey: 'navigatorDesc' },
  ],
  '/games/sorting-hub': [
    { route: '/games/goods-sort', icon: 'basket', nameKey: 'goodsSort', descKey: 'goodsSortDesc' },
    { route: '/games/water-sort', icon: 'flask', nameKey: 'waterSort', descKey: 'waterSortDesc' },
    { route: '/games/ball-sort', icon: 'ellipse', nameKey: 'ballSort', descKey: 'ballSortDesc' },
    { route: '/games/nut-sort', icon: 'settings', nameKey: 'nutSort', descKey: 'nutSortDesc' },
    { route: '/games/cake-sort', icon: 'cafe', nameKey: 'cakeSort', descKey: 'cakeSortDesc' },
    { route: '/games/pizza-sort', icon: 'pizza', nameKey: 'pizzaSort', descKey: 'pizzaSortDesc' },
    /**
     * 🔴 БАШНИ ВЛИТЫ СЮДА ЦЕЛИКОМ (решение Дениса 06.09.2026: «всё, что в хабе
     * башни, переносим в сортировку, ханой и лондонская тоже»).
     *
     * Прежде развилки различались тем, ЧТО ограничивает ход: в башнях —
     * ПОРЯДОК (диск на диск меньше нельзя), в сортировке — ВМЕСТИМОСТЬ. Различие
     * настоящее, но для человека обе про «переложить стопку так, чтобы вышло
     * ровно», и две карточки рядом путались по названию. Переливалка и так
     * стояла в обеих — она и была швом, по которому развилки склеились.
     */
    { route: '/games/hanoi', icon: 'layers', nameKey: 'hanoi', descKey: 'hanoiDesc' },
    { route: '/games/tower-london', icon: 'git-branch', nameKey: 'towerLondon', descKey: 'towerLondonDesc' },
  ],


  /* ——— Счёт и слова ——— */
  '/games/counting-hub': [
    { route: '/games/counter', icon: 'list-outline', nameKey: 'counter', descKey: 'counterDesc' },
    { route: '/games/math-slider', icon: 'swap-horizontal', nameKey: 'mathSlider', descKey: 'mathSliderDesc' },
    { route: '/games/math-sprint', icon: 'flash', nameKey: 'mathSprint', descKey: 'mathSprintDesc' },
    { route: '/games/number-bonds', icon: 'git-merge', nameKey: 'numberBonds', descKey: 'numberBondsDesc' },
    // 04.09.2026: перенесён из «Объёма памяти» по решению Дениса (отчёт a0df2925)
    { route: '/games/ospan', icon: 'calculator', nameKey: 'ospan', descKey: 'ospanDesc' },
    /**
     * «Паттерны» пришли 12.09.2026 из расформированной «Гибкости» (вариант Г,
     * задача 8f0b0428). ⚠️ Расхождение названо Денису ДО решения и осталось:
     * материал числовой (ряд 7·14·21·28 — арифметическая прогрессия), а
     * `skillKey` у игры `skillReasoning` и `category: 'logic'`. По материалу
     * счёт, по навыку вывод правила. Не сойдётся на замере — кандидат в «Судоку».
     */
    { route: '/games/pattern', icon: 'trending-up', nameKey: 'pattern', descKey: 'patternDesc' },
  ],

  '/games/words-hub': [
    { route: '/games/vocab-srs', icon: 'albums', nameKey: 'vocabSrs', descKey: 'vocabSrsDesc' },
    { route: '/games/semantic-sort', icon: 'funnel', nameKey: 'semanticSort', descKey: 'semanticSortDesc' },
    { route: '/games/cloze', icon: 'create', nameKey: 'cloze', descKey: 'clozeDesc' },
    { route: '/games/lexical-decision', icon: 'checkmark-done', nameKey: 'lexicalDecision', descKey: 'lexicalDecisionDesc' },
    { route: '/games/anagrams', icon: 'shuffle', nameKey: 'anagrams', descKey: 'anagramsDesc' },
    /*
     * ⚠️ Ключи `phonemic`/`phonemicDesc`, а НЕ `phonemicFluency*`: вторых в словаре
     * нет, и карточка показывала бы сам ключ. Та же болезнь, что у «Найди отличия»
     * (12.09.2026). Сторожит `hub-keys-exist`.
     */
    { route: '/games/phonemic-fluency', icon: 'chatbubbles', nameKey: 'phonemic', descKey: 'phonemicDesc' },
    /* ⚠️ Ключи `story`/`storyDesc` — см. соседний разбор выше. */
    { route: '/games/story-recall', icon: 'book', nameKey: 'story', descKey: 'storyDesc' },
  ],

  '/games/hearing-hub': [
    { route: '/games/phoneme-pairs', icon: 'git-compare', nameKey: 'phonemePairs', descKey: 'phonemePairsDesc' },
    { route: '/games/chinese-tones', icon: 'musical-note', nameKey: 'chineseTones', descKey: 'chineseTonesDesc' },
    { route: '/games/pseudoword-echo', icon: 'mic', nameKey: 'pseudowordEcho', descKey: 'pseudowordEchoDesc' },
    { route: '/games/dictation', icon: 'headset', nameKey: 'dictation', descKey: 'dictationDesc' },
    /**
     * «Ритм и высота» — 12.09.2026 (задача 4332ce4e). Довод замером, не по
     * названию: `skillKey: 'skillListening'` стоит ровно у ПЯТИ игр каталога,
     * четыре из них уже здесь, пятая стояла снаружи одна.
     * ⚠️ У карточки `sandbox: true` — динамика сырая; переезд закрывает вопрос
     * дома, но не вопрос качества.
     */
    { route: '/games/rhythm-pitch', icon: 'musical-notes', nameKey: 'rhythmPitch', descKey: 'rhythmPitchDesc' },
  ],

  /**
   * ЗОНТИК: внутри не упражнения, а две развилки. Строк на экране две — и значок
   * теперь тоже говорит «2».
   *
   * ⚠️ Раньше он говорил «11»: считался ВГЛУБЬ, до упражнений. Замысел был добрый
   * («значок про занятия, а не про меню»), а на деле это и есть жалоба
   * тестировщицы в чистом виде — обещание, которого экран не выполняет. Число на
   * значке отвечает ровно на один вопрос: сколько строк я увижу, открыв карточку.
   * Сколько занятий лежит за «Словами», скажет значок самих «Слов».
   */
  '/games/languages-hub': [
    { route: '/games/words-hub', icon: 'text', nameKey: 'wordsGroup', descKey: 'wordsGroupDesc' },
    { route: '/games/hearing-hub', icon: 'ear', nameKey: 'hearingGroup', descKey: 'hearingGroupDesc' },
  ],
};

/**
 * КАРТОЧКИ РАЗВИЛКИ, КОТОРЫЕ УВИДИТ ЭТОТ ПРОФИЛЬ. Отсюда читают И экран, И значок.
 *
 * @param hubRoute  маршрут развилки из каталога (`GameConfig.route`)
 * @param allowed   маршруты игр, открытых профилю (`filterAllowedGames(...).route`)
 */
export function visibleHubCards(
  hubRoute: string,
  allowed: Set<string>,
  t: (key: string) => string,
): { card: HubSubGame; route: string; tag: string }[] {
  const карточки = HUB_CONTENTS[hubRoute] ?? [];
  /**
   * ⚠️ РЕЖИМ ДОСКИ ОТКРЫТ ВМЕСТЕ С САМОЙ ДОСКОЙ. «Небоскрёбы» живут по адресу
   * `/games/sudoku?mode=towers` — своей карточки в каталоге у них нет и быть не
   * должно, это режим классической судоку. Без этой строчки обе карточки судоку
   * исчезли бы у ВСЕХ профилей: такого маршрута в списке разрешённого нет ни у кого.
   */
  const открыто = new Set(allowed);
  for (const c of карточки) {
    const без = c.route.split('?')[0];
    if (без !== c.route && открыто.has(без)) открыто.add(c.route);
  }
  return visibleSuiteCards(карточки, открыто, t);
}

/**
 * ЧИСЛО НА ЗНАЧКЕ РАЗВИЛКИ — ровно длина того списка, что человек увидит внутри.
 *
 * Обещание и есть замер: расходиться нечему, обе половины считает одна функция.
 */
export function hubBadgeCount(hubRoute: string, allowed: Set<string>): number {
  return visibleHubCards(hubRoute, allowed, (k) => k).length;
}
