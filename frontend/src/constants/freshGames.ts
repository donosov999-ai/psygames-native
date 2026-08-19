/* psygames-fresh-games · VER 1 · 19.08.2026 */
/**
 * РЕЕСТР НОВОГО И СУЩЕСТВЕННО ОБНОВЛЁННОГО.
 *
 * 🔴 ЗАЧЕМ. Заказ Дениса: «надо будет сделать профиль (новое) и вгонять всё,
 * что обновлено существенно и сделаны новые упражнения». Без такого места
 * свежая работа тонет в каталоге из 64 игр: человек её просто не находит и
 * играет то же, что играл вчера.
 *
 * ⚠️ ГЛАВНАЯ ОПАСНОСТЬ ТАКОГО СПИСКА — ПРОТУХАНИЕ. «Новинки», собранные руками
 * один раз, через три месяца показывают полугодовой давности работу и врут
 * названием. Поэтому здесь у каждой записи стоит ДАТА, а отбор идёт по свежести,
 * а не по факту присутствия в списке. Запись не надо удалять — она уходит сама.
 *
 * ⚠️ ПОЧЕМУ НЕ ПОЛЕ В `GameConfig`. Каталог описывает, ЧТО за игра (название,
 * ветка, цвет) — это неизменные свойства. «Когда её трогали в последний раз» —
 * свойство истории, а не игры, и оно меняется каждый релиз. Смешивать их значит
 * править каталог при каждой правке любой игры.
 *
 * КАК ПОПОЛНЯТЬ. Существенно обновил игру или добавил новую — добавь строчку
 * СВЕРХУ с сегодняшней датой. «Существенно» — это когда человеку есть смысл
 * зайти и посмотреть: новая механика, новые уровни, переделанный вид. Починка
 * бага сюда не идёт, для неё есть `whatsNew.ts`.
 */

/** Что именно случилось с игрой. */
export type FreshKind = 'new' | 'updated';

export interface FreshEntry {
  /** id из каталога `GAMES` — гейт следит, чтобы он существовал. */
  id: string;
  /** Когда попало в строй, `YYYY-MM-DD`. */
  since: string;
  kind: FreshKind;
  /** Одной строкой: ради чего заходить. ru — источник истины. */
  ru: string;
  en: string;
}

/**
 * Свежее — сверху. Порядок в файле роли не играет (сортировка по дате идёт в
 * коде), но держать его по убыванию удобно глазами.
 */
export const FRESH: FreshEntry[] = [
  // Семь игр из лаборатории, принятых 19.08.2026 и заведённых в каталог одним заходом.
  {
    id: 'memory_palace', since: '2026-08-19', kind: 'new',
    ru: 'Новая игра: дворец памяти. Раскладываете предметы по маршруту и вспоминаете их вперёд и назад',
    en: 'New game: memory palace. Place items along a route and recall them forward and in reverse',
  },
  {
    id: 'rhythm_pitch', since: '2026-08-19', kind: 'new',
    ru: 'Слух вместо зрения: повторить ритм и восстановить путь высот. 31 уровень, микрофон не нужен, слов в задании нет — язык на сложность не влияет',
    en: 'Hearing instead of sight: echo a rhythm and rebuild a path of pitches. 31 levels, no microphone, no words — language does not change the difficulty',
  },
  {
    id: 'navigator', since: '2026-08-19', kind: 'new',
    ru: 'Мысленная карта: маршрут, повороты и направление домой — карта при этом повёрнута',
    en: 'Mental map: route, turns, and the way home — with the map rotated',
  },
  {
    id: 'object_tracker', since: '2026-08-19', kind: 'new',
    ru: 'Единственное в каталоге внимание к движущемуся: держите глазами помеченные шары, пока вся группа перемешивается, и найдите их после остановки',
    en: 'The only attention trainer here that follows things in motion: hold the marked balls with your eyes while the whole group mixes, then find them once it stops',
  },
  {
    id: 'faces_names', since: '2026-08-19', kind: 'new',
    ru: 'Тот самый провал «лицо помню, а как зовут — нет»: лицо, имя и факт спрашивают порознь, и видно, какая половина просела',
    en: 'The familiar “I know the face but not the name” gap: face, name and fact are asked separately, so you see which half is failing',
  },
  {
    id: 'one_line', since: '2026-08-19', kind: 'new',
    ru: 'Новая игра: один росчерк по всем рёбрам. Не скорость, а маршрут — половина законных ходов ведёт в тупик',
    en: 'New game: one stroke across every edge. Not speed but route — half the legal moves lead to a dead end',
  },
  {
    id: 'dots_connect', since: '2026-08-19', kind: 'new',
    ru: 'Новая игра: 40 уровней numberlink. Жадный первый ход запирает четвёртую пару — цена нетерпения видна сразу',
    en: 'New game: 40 numberlink levels. A greedy first move locks the fourth pair — impatience shows its price at once',
  },
  {
    id: 'goods_sort', since: '2026-08-19', kind: 'updated',
    ru: 'Настоящий шкаф, четыре препятствия, цели уровня, перетаскивание, отмена хода и подсказка. С 14-го уровня строгая укладка, с 18-го ниши разной вместимости',
    en: 'A real cabinet, four obstacles, level goals, drag-and-drop, undo and a hint. Strict placing from level 14, niches of different size from 18',
  },
  {
    id: 'sudoku-samurai', since: '2026-08-19', kind: 'updated',
    ru: 'Ступени сложности стали настоящими: раньше все уровни решались одним приёмом. Плюс автосохранение партии, отмена хода и клетка, в которую можно попасть пальцем',
    en: 'The difficulty ladder became real: every level used to fall to a single technique. Plus autosave, undo, and a cell you can actually hit with a finger',
  },
  {
    id: 'set_game', since: '2026-08-19', kind: 'updated',
    ru: 'Видно, сколько осталось на расклад: с 11-го уровня время резалось молча, и уровень терялся по часам, которых никто не показывал',
    en: 'The per-deal countdown is visible: from level 11 the time was cut silently, and levels were lost to a clock nobody showed',
  },
  {
    id: 'sudoku-fractal', since: '2026-08-19', kind: 'updated',
    ru: 'Была непроходима вовсе: корень не принимал ввода, а решения не были единственными. Теперь играется целиком, уровней 30',
    en: 'It was unwinnable outright: the root took no input and solutions were not unique. Now fully playable, 30 levels',
  },
  {
    id: 'find_differences', since: '2026-08-19', kind: 'updated',
    ru: 'Вечером без обратного отсчёта, а просроченный раунд больше не съедает весь уровень',
    en: 'No countdown in the evening, and a late round no longer eats the whole level',
  },
  {
    id: 'prl', since: '2026-08-19', kind: 'updated',
    ru: 'Наконец сказано, что происходит: угадывать не нужно, стороны молча меняются местами',
    en: 'It finally says what is going on: there is nothing to guess, the sides swap silently',
  },
  {
    id: 'math_slider', since: '2026-08-17', kind: 'new',
    ru: 'Новая игра: прикидка результата на числовой прямой. Не счёт, а чувство величины',
    en: 'New game: estimate the result on a number line. Not arithmetic — a sense of magnitude',
  },
  {
    id: 'mahjong', since: '2026-08-19', kind: 'updated',
    ru: 'Вечером секундомер скрыт: вечерний набор задуман как успокоение, а часы делали обратное',
    en: 'The stopwatch is hidden in the evening: the evening set exists to wind down, and a clock did the opposite',
  },
];

/** Сколько дней запись считается свежей. */
export const FRESH_DAYS = 90;

/**
 * Сколько игр показать, даже если всё успело устареть.
 *
 * Пустой профиль «Новинки» хуже отсутствующего: карточка обещает игры, а по
 * кнопке пусто. Поэтому при затишье показываем несколько последних по дате,
 * не глядя на возраст.
 */
export const FRESH_MIN = 4;

/** Разбор `YYYY-MM-DD` без часовых поясов — нам нужен календарь, а не момент. */
function days(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}

/** Сегодня в виде `YYYY-MM-DD`. Календарная дата — настенные часы здесь уместны. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Свежие записи: моложе `FRESH_DAYS`, но не меньше `FRESH_MIN` штук.
 * Отсортированы от новых к старым.
 */
export function freshEntries(today: string = todayISO()): FreshEntry[] {
  const sorted = [...FRESH].sort((a, b) => (a.since < b.since ? 1 : a.since > b.since ? -1 : 0));
  const young = sorted.filter((e) => days(e.since, today) <= FRESH_DAYS);
  return young.length >= FRESH_MIN ? young : sorted.slice(0, Math.min(FRESH_MIN, sorted.length));
}

/** Только id — этим кормится `allowed_games` профиля «Новинки». */
export function freshGameIds(today: string = todayISO()): string[] {
  return freshEntries(today).map((e) => e.id);
}
