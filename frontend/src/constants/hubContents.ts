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
  ],

  '/games/visual-memory-hub': [
    /**
     * ⚠️ «Матрица памяти» стоит И ЗДЕСЬ, И в охвате памяти — это законно и есть
     * та самая причина, по которой состав развилки нельзя выводить из `mergedInto`:
     * родитель у игры один (`span_group`), а входов к ней два.
     */
    { route: '/games/memory-matrix', icon: 'grid', nameKey: 'memoryMatrix', descKey: 'memoryMatrixDesc' },
    { route: '/games/picture-pairs', icon: 'copy', nameKey: 'picturePairs', descKey: 'picturePairsDesc' },
    { route: '/games/navigator', icon: 'navigate', nameKey: 'navigator', descKey: 'navigatorDesc' },
  ],

  '/games/mnemonics-hub': [
    { route: '/games/mnemonics', icon: 'bulb', nameKey: 'mnemonics', descKey: 'mnemonicsDesc' },
    { route: '/games/memory-palace', icon: 'home', nameKey: 'memoryPalace', descKey: 'memoryPalaceDesc' },
    { route: '/games/faces-names', icon: 'person', nameKey: 'facesNames', descKey: 'facesNamesDesc' },
    { route: '/games/word-pairs', icon: 'link', nameKey: 'wordPairs', descKey: 'wordPairsDesc' },
  ],

  '/games/chess-hub': [
    { route: '/games/scholars-mate', icon: 'flash', nameKey: 'scholarsMate', descKey: 'scholarsMateDesc' },
    { route: '/games/chess-blind', icon: 'apps', nameKey: 'chessBlind', descKey: 'chessBlindDesc' },
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
  ],

  '/games/inhibition-hub': [
    { route: '/games/inhibition', icon: 'hand-left', nameKey: 'inhibition', descKey: 'inhibitionDesc' },
    { route: '/games/posner', icon: 'navigate', nameKey: 'posner', descKey: 'posnerDesc' },
  ],

  '/games/search-hub': [
    { route: '/games/visual-search', icon: 'scan', nameKey: 'visualSearch', descKey: 'visualSearchDesc' },
    { route: '/games/proofreading', icon: 'create-outline', nameKey: 'proofreading', descKey: 'proofreadingDesc' },
    { route: '/games/find-differences', icon: 'copy', nameKey: 'findDifferences', descKey: 'findDifferencesDesc' },
    { route: '/games/mahjong', icon: 'grid', nameKey: 'mahjong', descKey: 'mahjongDesc' },
    { route: '/games/schulte', icon: 'apps', nameKey: 'schulteTable', descKey: 'schulteTableDesc' },
    { route: '/games/quick-count', icon: 'eye', nameKey: 'quickCount', descKey: 'quickCountDesc' },
    { route: '/games/object-tracker', icon: 'locate', nameKey: 'objectTracker', descKey: 'objectTrackerDesc' },
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

  '/games/towers-hub': [
    { route: '/games/hanoi', icon: 'layers', nameKey: 'hanoi', descKey: 'hanoiDesc' },
    { route: '/games/tower-london', icon: 'git-network', nameKey: 'towerLondon', descKey: 'towerLondonDesc' },
    { route: '/games/water-sort', icon: 'flask', nameKey: 'waterSort', descKey: 'waterSortDesc' },
  ],

  /**
   * ⚠️ ПЕРЕЛИВАЛКА НАМЕРЕННО СТОИТ И В «БАШНЯХ», И ЗДЕСЬ. Это законно (см. шапку):
   * родитель у игры один, показываться она вправе в нескольких развилках.
   * В «Башнях» она за то, что ход ограничен правилом и считать надо наперёд;
   * здесь — за то, что ограничивает ВМЕСТИМОСТЬ ёмкости.
   */
  '/games/sorting-hub': [
    { route: '/games/goods-sort', icon: 'basket', nameKey: 'goodsSort', descKey: 'goodsSortDesc' },
    { route: '/games/water-sort', icon: 'flask', nameKey: 'waterSort', descKey: 'waterSortDesc' },
    { route: '/games/ball-sort', icon: 'ellipse', nameKey: 'ballSort', descKey: 'ballSortDesc' },
    { route: '/games/nut-sort', icon: 'settings', nameKey: 'nutSort', descKey: 'nutSortDesc' },
  ],

  '/games/routes-hub': [
    { route: '/games/dots-connect', icon: 'ellipse', nameKey: 'dotsConnect', descKey: 'dotsConnectDesc' },
    { route: '/games/one-line', icon: 'analytics', nameKey: 'oneLine', descKey: 'oneLineDesc' },
    { route: '/games/trail-making', icon: 'git-network', nameKey: 'trailMaking', descKey: 'trailMakingDesc' },
  ],

  '/games/flexibility-hub': [
    { route: '/games/pattern', icon: 'trending-up', nameKey: 'pattern', descKey: 'patternDesc' },
    { route: '/games/set-game', icon: 'apps', nameKey: 'setGame', descKey: 'setGameDesc' },
    { route: '/games/sdmt', icon: 'swap-horizontal', nameKey: 'sdmt', descKey: 'sdmtDesc' },
  ],

  '/games/risk-hub': [
    { route: '/games/bart', icon: 'balloon', nameKey: 'bart', descKey: 'bartDesc' },
    { route: '/games/iowa', icon: 'card', nameKey: 'iowa', descKey: 'iowaDesc' },
    { route: '/games/prl', icon: 'shuffle', nameKey: 'prl', descKey: 'prlDesc' },
  ],

  /* ——— Счёт и слова ——— */
  '/games/counting-hub': [
    { route: '/games/counter', icon: 'list-outline', nameKey: 'counter', descKey: 'counterDesc' },
    { route: '/games/math-slider', icon: 'swap-horizontal', nameKey: 'mathSlider', descKey: 'mathSliderDesc' },
    { route: '/games/math-sprint', icon: 'flash', nameKey: 'mathSprint', descKey: 'mathSprintDesc' },
    { route: '/games/number-bonds', icon: 'git-merge', nameKey: 'numberBonds', descKey: 'numberBondsDesc' },
    // 04.09.2026: перенесён из «Объёма памяти» по решению Дениса (отчёт a0df2925)
    { route: '/games/ospan', icon: 'calculator', nameKey: 'ospan', descKey: 'ospanDesc' },
  ],

  '/games/words-hub': [
    { route: '/games/vocab-srs', icon: 'albums', nameKey: 'vocabSrs', descKey: 'vocabSrsDesc' },
    { route: '/games/semantic-sort', icon: 'funnel', nameKey: 'semanticSort', descKey: 'semanticSortDesc' },
    { route: '/games/cloze', icon: 'create', nameKey: 'cloze', descKey: 'clozeDesc' },
    { route: '/games/lexical-decision', icon: 'checkmark-done', nameKey: 'lexicalDecision', descKey: 'lexicalDecisionDesc' },
    { route: '/games/anagrams', icon: 'shuffle', nameKey: 'anagrams', descKey: 'anagramsDesc' },
    { route: '/games/phonemic-fluency', icon: 'chatbubbles', nameKey: 'phonemicFluency', descKey: 'phonemicFluencyDesc' },
    { route: '/games/story-recall', icon: 'book', nameKey: 'storyRecall', descKey: 'storyRecallDesc' },
  ],

  '/games/hearing-hub': [
    { route: '/games/phoneme-pairs', icon: 'git-compare', nameKey: 'phonemePairs', descKey: 'phonemePairsDesc' },
    { route: '/games/chinese-tones', icon: 'musical-note', nameKey: 'chineseTones', descKey: 'chineseTonesDesc' },
    { route: '/games/pseudoword-echo', icon: 'mic', nameKey: 'pseudowordEcho', descKey: 'pseudowordEchoDesc' },
    { route: '/games/dictation', icon: 'headset', nameKey: 'dictation', descKey: 'dictationDesc' },
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
