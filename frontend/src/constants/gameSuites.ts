/* psygames-game-suites · VER 1 · 05.09.2026 */
/**
 * НАБОРЫ: НЕСКОЛЬКО ПАРАДИГМ ПОД ОДНОЙ КАРТОЧКОЙ, РЕЖИМ ВЫБИРАЕТСЯ ВНУТРИ.
 *
 * Решение Дениса 05.09.2026 по кадрам хаба «Конфликт внимания»: «1 и 2 слить в
 * одно, режимом; 3 4 5 6 — тоже; 7 и 8 — тоже. Делаем как Шульте. Сейчас
 * первичное объединение, где интерфейсы и логика почти не отличаются».
 * Десять карточек в хабе читались как десять разных игр, хотя четыре из них —
 * это одна и та же стрелка с двумя кнопками, и различие в них не в том, ЧТО
 * человек делает, а в том, ЧТО именно с ним спорит.
 *
 * ⚠️ КРИТЕРИЙ ЗДЕСЬ — ИНТЕРФЕЙС, А НЕ КОНСТРУКТ, И ЭТО НЕ ТО ЖЕ САМОЕ, ЧТО В
 * `PSYGAMES_MERGE_PLAN.md` §6. Там кластеры режут по измеряемой способности: CPT
 * уходит в «Торможение», `switching-task` — к WCST в «Правило», `choice-rt` — в
 * «Темп». Здесь режем по тому, что видит рука: один и тот же поток проб и те же
 * кнопки. Расхождение намеренное — это первый, дешёвый проход; конструктная
 * перекройка из плана его не отменяет и делается отдельно.
 *
 * 🔴 ПОЧЕМУ НАБОР — ЭТО НЕ НОВЫЙ ЭКРАН, А ГРУППА СУЩЕСТВУЮЩИХ МАРШРУТОВ.
 *
 * Соблазн был написать один экран `/games/arrows` с внутренним состоянием
 * режима. Это стоило бы переписывания четырёх игр и, главное, потери трёх вещей
 * разом, каждая из которых прибита к МАРШРУТУ:
 *
 *   1. Справка. `GameHelpOverlay` берёт текст как `HELP_MAP[pathname]`. Общий
 *      маршрут — общая справка, то есть правила фланкера показывались бы в ANT.
 *      Денис отдельно потребовал: «описание и справку не забудь перенести».
 *   2. Уровень и статистика. Лесенка и замеры лежат по `gameId`, а он тоже из
 *      маршрута. Слить экраны — обнулить прогресс по четырём играм.
 *   3. Глубокие ссылки и зарядка: маршруты уже разосланы и записаны в сессиях.
 *
 * Поэтому набор — это ЯРЛЫК НАД МАРШРУТАМИ. Каждая парадигма живёт там же, где
 * жила; переключатель просто заменяет маршрут (`router.replace`). Снаружи это
 * выглядит одной игрой с выбором режима, изнутри ничего не переехало — а
 * справка, прогресс и ссылки продолжают работать сами, без переноса.
 */

export type SuiteMode = {
  /** Маршрут парадигмы — он же ключ справки и прогресса. */
  route: string;
  /** Короткая подпись на плашке: не название игры, а ЧТО с чем спорит. */
  labelKey: string;
};

export type GameSuite = {
  id: string;
  /** Заголовок карточки в хабе и подпись над переключателем. */
  titleKey: string;
  /** Описание карточки: перечисляет, что внутри. */
  descKey: string;
  modes: SuiteMode[];
};

export const GAME_SUITES: GameSuite[] = [
  {
    id: 'suite_stroop',
    titleKey: 'suiteStroop',
    descKey: 'suiteStroopDesc',
    modes: [
      // ⚠️ `modeClassic` — ГОТОВЫЙ ключ («Классический»), а не свой: словарь
      // запрещает дубли ru+en, и своя копия была бы 12 лишних строк перевода.
      { route: '/games/stroop', labelKey: 'modeClassic' },
      { route: '/games/stroop-emotional', labelKey: 'suiteModeEmotion' },
    ],
  },
  {
    id: 'suite_arrows',
    titleKey: 'suiteArrows',
    descKey: 'suiteArrowsDesc',
    modes: [
      { route: '/games/flanker', labelKey: 'suiteModeFlanker' },
      { route: '/games/simon', labelKey: 'suiteModeSimon' },
      { route: '/games/choice-rt', labelKey: 'suiteModeChoice' },
      { route: '/games/ant', labelKey: 'suiteModeAnt' },
    ],
  },
  /**
   * ПОЗИЦИИ — решение Дениса 05.09.2026: «матрица памяти, кубики Корси и spatial
   * span — объединить в одно?». Померено кодом, а не по названиям:
   *
   *   memory-matrix  регулярная сетка 3×3→6×6, два режима внутри (узор разом /
   *                  по одной клетке), прямой порядок
   *   corsi          ДЕВЯТЬ НЕРЕГУЛЯРНЫХ блоков с зашитыми координатами,
   *                  по одной, прямой; с 10-го уровня обязательный обратный
   *   spatial-span   регулярная сетка 4×4→5×5, по одной, ОБРАТНЫЙ порядок
   *
   * ⚠️ ЗДЕСЬ ЛЕЖИТ ДУБЛЬ, И НАБОР ЕГО НЕ ЛЕЧИТ. `spatial-span` — это
   * `memory-matrix` в режиме `sequential` с обратным порядком; в словаре он так и
   * подписан, «Spatial Span (обратный)», а обратный порядок уже есть и у Корси.
   * Набор сводит карточки, но три экрана остаются тремя экранами. Снос дубля —
   * отдельная работа: он трогает лесенку и сохранённый прогресс.
   *
   * ⚠️ КОРСИ НЕ ЗАМЕНЯЕТСЯ СЕТКОЙ. Его девять блоков расставлены нерегулярно
   * НАРОЧНО: на регулярной сетке позиции запоминаются строками и столбцами, span
   * завышается и перестаёт сравниваться с опубликованными нормами Корси.
   */
  {
    id: 'suite_positions',
    titleKey: 'suitePositions',
    descKey: 'suitePositionsDesc',
    modes: [
      { route: '/games/memory-matrix', labelKey: 'suiteModeGrid' },
      { route: '/games/corsi', labelKey: 'suiteModeCorsi' },
      { route: '/games/spatial-span', labelKey: 'suiteModeBackward' },
    ],
  },
  {
    id: 'suite_stream',
    titleKey: 'suiteStream',
    descKey: 'suiteStreamDesc',
    modes: [
      { route: '/games/cpt', labelKey: 'suiteModeVigilance' },
      { route: '/games/switching-task', labelKey: 'suiteModeSwitch' },
    ],
  },
];

/**
 * СПИСОК КАРТОЧЕК РАЗВИЛКИ С ОГЛЯДКОЙ НА ПРОФИЛЬ — ОДНА РЕАЛИЗАЦИЯ НА ВСЕ ЭКРАНЫ.
 *
 * 🔴 Развилок три вида: общий `HubScreen` и два экрана со своим списком
 * (`attention-conflict.tsx`, `span.tsx`). Правило «карточка ведёт на первый
 * ОТКРЫТЫЙ режим» пришлось бы написать трижды, а разъехалось бы оно молча: в
 * одной развилке шахматист попадал бы в закрытую игру, в двух других нет, и
 * увидеть это можно было бы только открыв все три под всеми профилями.
 *
 * Замер, ради которого правило существует: у профиля «chess» из четырёх
 * стрелочных парадигм открыта одна (`choice-rt`). Карточка, ведущая на первый
 * режим списка, увела бы его в закрытый `flanker` И СПРЯТАЛА бы открытый.
 */
export function visibleSuiteCards<T extends { route: string; typeKey?: string; suiteId?: string }>(
  cards: readonly T[],
  allowed: Set<string>,
  t: (key: string) => string,
): { card: T; route: string; tag: string }[] {
  const итог: { card: T; route: string; tag: string }[] = [];
  for (const c of cards) {
    if (c.suiteId) {
      const набор = GAME_SUITES.find((s) => s.id === c.suiteId);
      const открытые = (набор?.modes ?? []).filter((m) => allowed.has(m.route));
      if (!открытые.length) continue;                    // ни одного открытого — карточки нет
      итог.push({ card: c, route: открытые[0].route, tag: открытые.map((m) => t(m.labelKey)).join(' · ') });
    } else {
      if (!allowed.has(c.route)) continue;
      итог.push({ card: c, route: c.route, tag: c.typeKey ? t(c.typeKey) : '' });
    }
  }
  return итог;
}

/** Набор, которому принадлежит маршрут. Не принадлежит — переключателя нет. */
export function suiteOfRoute(route: string): GameSuite | undefined {
  const чистый = route.replace(/\/+$/, '');
  const i = чистый.indexOf('/games/');
  const ключ = i >= 0 ? чистый.slice(i) : чистый;
  return GAME_SUITES.find((s) => s.modes.some((m) => m.route === ключ));
}

/** Первый режим набора — на него ведёт карточка хаба. */
export function suiteEntryRoute(suite: GameSuite): string {
  return suite.modes[0].route;
}

/** Все маршруты, спрятанные под наборы: карточек в хабе у них больше нет. */
export function routesInSuites(): string[] {
  return GAME_SUITES.flatMap((s) => s.modes.map((m) => m.route));
}
