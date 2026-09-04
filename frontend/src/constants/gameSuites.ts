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
