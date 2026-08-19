/**
 * ИСТОРИЯ ТРЕНИРОВОК — что человек играл по дням и куда это движется.
 *
 * ЗАЧЕМ. На экране статистики были только итоги: «сыграно 340», «среднее время 42с».
 * Итог не даёт повода вернуться — он одинаковый вчера и сегодня. Повод даёт ДВИЖЕНИЕ:
 * «неделю назад ряд был 5, сегодня 7». Поэтому история показывает не «сессии списком»,
 * а по каждому упражнению — когда играл, какой результат и лучше или хуже он прошлого
 * раза ЭТОГО ЖЕ упражнения.
 *
 * ОТКУДА ДАННЫЕ. Ничего нового не пишем: всё берётся из массива сессий, который
 * `saveSession` кладёт в AsyncStorage с первого дня жизни приложения (game_type, score,
 * time_seconds, timestamp, profile_id). Заводить своё хранилище было бы не только лишним,
 * но и вредным: история появилась бы только у тех, кто играл ПОСЛЕ этой правки, а у всех
 * остальных экран остался бы пустым при полном шкафу данных.
 *
 * ⚠️ КУДА «ЛУЧШЕ» — ГЛАВНАЯ ЛОВУШКА ЭТОГО ФАЙЛА.
 * `score` во ВСЕХ упражнениях считается «больше — лучше»: даже там, где партия по сути
 * про время, время входит в формулу штрафом (trail_making: `1000 - время*5 - ошибки*30`,
 * hanoi/sudoku/set_game/picture_pairs — так же). Значит для очков сравнение
 * «стало больше = стало лучше» верно везде и никаких исключений не требует.
 *
 * Исключение ровно одно и оно ниже: `schulte_table` пишет `score = клетки - ошибки`,
 * то есть на 5×5 это почти всегда 25 и оно НЕ ДВИГАЕТСЯ, сколько бы человек ни ускорялся.
 * Показывать по Шульте очки — значит вечно писать «как в прошлый раз» человеку, который
 * реально стал быстрее на десять секунд. Поэтому у Шульте результат — ВРЕМЯ, а время
 * сравнивается в ОБРАТНУЮ сторону: меньше = лучше. Ровно это направление и ломается
 * незаметно (в лидерборде на этом уже обжигались — см. `isBetter` в leaderboard.ts, где
 * «меньше лучше» знала одна игра, а любая следующая молча получила бы перевёрнутый
 * рекорд), поэтому оно проверяется гейтом в обе стороны.
 *
 * ⚠️ ПЕРВЫЙ РАЗ — ЭТО НЕ РОСТ. Если прошлой партии этого упражнения нет, вердикта нет
 * вовсе (`null`), а не «лучше». Сравнивать не с чем — значит молчим: выдуманный рост на
 * первой же партии обесценивает настоящий рост на десятой.
 *
 * ⚠️ СРАВНИВАЕМ ТОЛЬКО ОДИНАКОВЫЕ ПАРТИИ — вторая ловушка, найденная живой игрой.
 * Уровень 1 Шульте это сетка 5×5, уровень 2 — 6×6, то есть тридцать шесть клеток вместо
 * двадцати пяти. Время на них несравнимо в принципе, и «прошлый раз» по одному лишь
 * названию упражнения написал бы «хуже на 20 секунд» человеку, который ТОЛЬКО ЧТО взял
 * следующий уровень. То же у очков: n-back на уровне выше поднимает N, попаданий
 * становится меньше, счёт падает — рост читался бы как провал.
 *
 * Поэтому «прошлый раз» ищется среди партий с тем же КЛЮЧОМ ЗАДАЧИ (упражнение + уровень
 * + настройки). Опора не выдумана: у экранов с лестницей параметры партии выводит чистая
 * `levelParams(level)`, то есть одно число фиксирует партию целиком — на этом же держится
 * пин конфигураций в лидерборде. Свободный режим лестницей не описывается, поэтому в ключ
 * идут ещё `difficulty` и `mode`, которыми игры пишут настройки партии.
 *
 * Первая партия на НОВОЙ сложности получает отдельный вердикт `newTask`: это не «первый
 * раз» (упражнение знакомо) и не «хуже» (сравнивать не с чем). Молчание здесь честнее
 * любой цифры.
 */
import { localDateKey } from '@/src/services/warmup';

/** Минимум полей сессии, который нужен истории. Полный `GameSession` тянет за собой
 *  Supabase и AsyncStorage — здесь это ни к чему (тот же приём, что в analytics.ts). */
export interface HistorySession {
  game_type?: string;
  score?: number;
  time_seconds?: number;
  timestamp?: string;
  /** Настройки партии — вместе с уровнем описывают, ЧТО именно человек играл. */
  difficulty?: string;
  mode?: string;
  details?: Record<string, any>;
  /** Чей раунд. Пусто у сессий, записанных до появления метки владельца. */
  profile_id?: string;
}

/** Что именно показываем как «результат» партии. */
export type HistoryUnit = 'score' | 'seconds';

/**
 * Итог сравнения с прошлым разом.
 * `newTask` — упражнение знакомо, но эта сложность играется впервые.
 * `null` — упражнение вообще впервые (или результат непригоден).
 */
export type HistoryVerdict = 'better' | 'worse' | 'same' | 'newTask';

export interface HistoryEntry {
  gameType: string;
  /** ISO-метка партии — из неё же UI берёт время суток. */
  timestamp: string;
  /** Результат партии. `null` — метрика непригодна (битое время, отсутствующие очки). */
  value: number | null;
  unit: HistoryUnit;
  /** Уровень партии, если игра его пишет — подписываем в строке, иначе «новая сложность»
   *  выглядит как каприз. `null` — у упражнения нет лестницы. */
  level: number | null;
  /** Результат прошлого раза НА ТОЙ ЖЕ сложности; `null` — сравнивать не с чем. */
  prev: number | null;
  /** Насколько изменилось (всегда ≥ 0); `null` вместе с `prev`. */
  diff: number | null;
  verdict: HistoryVerdict | null;
}

export interface HistoryDay {
  /** Локальный день, YYYY-MM-DD — та же нарезка, что у календаря серии. */
  dateKey: string;
  /** Внутри дня свежие сверху. */
  entries: HistoryEntry[];
}

/**
 * Упражнения, где результат — ВРЕМЯ и меньше значит лучше.
 *
 * Список именно белый, а не «угадаем по формуле»: попасть сюда должно только то
 * упражнение, чей `score` не двигается вместе с реальным результатом. Сегодня это
 * ровно один экран (обоснование — в шапке файла). Добавляя игру, проверь: если её
 * `score` уже содержит время штрафом, здесь ей НЕ МЕСТО — иначе время учтётся дважды.
 */
export const LOWER_IS_BETTER: Readonly<Record<string, true>> = {
  schulte_table: true,
};

/**
 * Раунд этого человека или ничей.
 *
 * ⚠️ ЗАЧЕМ ОТДЕЛЬНО ОТ ФИЛЬТРА ПО ИГРАМ. Локальная история — ОДИН массив на устройство,
 * и на семейном устройстве в нём вперемешку партии Дениса и Алекса. Для сводки это
 * терпимо (там просто счётчики), а для истории — нет: вердикт «хуже прошлого раза»
 * сравнивал бы взрослого с семилеткой и врал бы обоим.
 *
 * Раунды БЕЗ метки владельца (записанные до её появления) показываем всем: выбросить
 * их — значит на глазах у человека стереть его же месяцы тренировок ради чистоты,
 * которой всё равно не будет.
 */
export function belongsToProfile(s: HistorySession, profileId: string): boolean {
  return !s.profile_id || s.profile_id === profileId;
}

/** Мусорное время в сессиях реально встречается (баг таймстампа давал ≈1.78e9 секунд). */
function validSeconds(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 86400) return null;
  return n;
}

/** Результат одной партии в тех единицах, в которых он вообще имеет смысл. */
export function entryValue(s: HistorySession): { value: number | null; unit: HistoryUnit } {
  if (s.game_type && LOWER_IS_BETTER[s.game_type]) {
    return { value: validSeconds(s.time_seconds), unit: 'seconds' };
  }
  const n = Number(s.score);
  return { value: Number.isFinite(n) ? n : null, unit: 'score' };
}

/** Стало ли лучше — с учётом того, в какую сторону «лучше» у этой метрики. */
export function compare(unit: HistoryUnit, value: number, prev: number): HistoryVerdict {
  if (value === prev) return 'same';
  const grew = value > prev;
  const better = unit === 'seconds' ? !grew : grew;
  return better ? 'better' : 'worse';
}

/** Уровень партии, если игра его пишет. Он же — главная часть ключа задачи. */
export function entryLevel(s: HistorySession): number | null {
  const lv = Number(s.details?.level);
  return Number.isFinite(lv) && lv > 0 ? lv : null;
}

/**
 * ЧТО ИМЕННО человек играл: упражнение + уровень + настройки. Сравнивать между собой
 * можно только партии с одинаковым ключом — 5×5 и 6×6 это разные задачи, а не прогресс.
 */
export function taskKey(s: HistorySession): string {
  return [s.game_type ?? '', entryLevel(s) ?? '', s.difficulty ?? '', s.mode ?? ''].join('|');
}

/** Сколько дней показываем. Экран рисует список целиком, без виртуализации, а у
 *  человека с годом тренировок дней набирается сотни — поэтому потолок есть, и UI
 *  честно подписывает, что показан хвост, а не всё. */
export const MAX_HISTORY_DAYS = 30;

export interface BuildOptions {
  /** Потолок дней; 0 или отрицательное — без потолка (для гейтов). */
  maxDays?: number;
}

/**
 * Собрать историю: дни от новых к старым, внутри дня партии от новых к старым,
 * у каждой — сравнение с прошлым разом ТОЙ ЖЕ ЗАДАЧИ (упражнение + уровень + настройки),
 * а не просто прошлой партией того же упражнения.
 *
 * Цепочка «прошлого раза» строится по времени, а не по дням: вторая партия Шульте
 * сегодня сравнивается с первой партией сегодня же, а не с позавчерашней.
 */
export function buildTrainingHistory(
  sessions: readonly HistorySession[],
  options: BuildOptions = {},
): HistoryDay[] {
  // Только то, что вообще можно поставить на календарь.
  const dated = sessions
    .map((s, i) => ({ s, i, t: s.timestamp ? Date.parse(s.timestamp) : NaN }))
    .filter((x) => !!x.s.game_type && Number.isFinite(x.t))
    // По возрастанию: чтобы «прошлый раз» был уже посчитан, когда доходим до следующей.
    .sort((a, b) => (a.t - b.t) || (a.i - b.i));

  const lastByTask = new Map<string, number>();
  const seenGames = new Set<string>();
  const byDay = new Map<string, HistoryEntry[]>();

  for (const { s, t } of dated) {
    const gameType = s.game_type as string;
    const { value, unit } = entryValue(s);
    const key = taskKey(s);
    const prev = lastByTask.has(key) ? (lastByTask.get(key) as number) : null;

    // Упражнение знакомо, а сложность новая — это не провал и не первый раз.
    const verdict: HistoryVerdict | null =
      value === null ? null
        : prev !== null ? compare(unit, value, prev)
          : seenGames.has(gameType) ? 'newTask'
            : null;

    const entry: HistoryEntry = {
      gameType,
      timestamp: new Date(t).toISOString(),
      value,
      unit,
      level: entryLevel(s),
      prev: value === null ? null : prev,
      diff: value === null || prev === null ? null : Math.abs(value - prev),
      verdict,
    };

    // Непригодная партия не становится «прошлым разом»: сравнивать следующую с
    // дырой нельзя, а тихо подставить ноль — значит соврать про обвал.
    if (value !== null) { lastByTask.set(key, value); seenGames.add(gameType); }

    const dayKey = localDateKey(new Date(t));
    const bucket = byDay.get(dayKey);
    if (bucket) bucket.push(entry);
    else byDay.set(dayKey, [entry]);
  }

  const days: HistoryDay[] = [...byDay.entries()]
    // Дни от новых к старым — свежее сверху, ради этого экран и открывают.
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([dateKey, entries]) => ({ dateKey, entries: entries.slice().reverse() }));

  const cap = options.maxDays ?? MAX_HISTORY_DAYS;
  return cap > 0 ? days.slice(0, cap) : days;
}

/**
 * ЧТО РИСОВАТЬ, КОГДА РИСОВАТЬ НЕЧЕГО.
 *
 * 🔴 Пустой экран человек читает как поломку — и у нового человека он пустой ВСЕГДА,
 * это самый частый первый заход, а не редкий край. Поэтому решение «дни / приглашение
 * сыграть / фильтр всё скрыл» вынесено из разметки чистой функцией, как это уже сделано
 * для лидерборда (`leaderboardView`): в JSX такое правило проверяется только глазами, а
 * тут — прогоном.
 *
 * ⚠️ КЛЮЧИ СЛОВАРЯ ВОЗВРАЩАЮТСЯ ОТСЮДА НАРОЧНО. Иначе гейт может доказать лишь то, что
 * функция вернула «пусто», но не то, что у этого «пусто» есть ЧТО СКАЗАТЬ на двенадцати
 * языках. С ключами в ответе гейт сверяет их со словарём механически, а не по памяти.
 *
 * Выдуманных «примерных» данных здесь нет и быть не может: показать новичку чужой
 * прогресс под видом своего — обман, который вскроется на первой же настоящей партии.
 */
export type HistoryView =
  | { kind: 'days'; days: HistoryDay[] }
  | { kind: 'empty' | 'scoped'; titleKey: string; hintKey: string; ctaKey: string };

export function historyView(
  days: readonly HistoryDay[],
  opts: { anySessions: boolean; scoped: boolean },
): HistoryView {
  if (days.length > 0) return { kind: 'days', days: days.slice() };
  // Партии есть, но их прячет фильтр профиля — это не «пусто», это «не здесь».
  if (opts.anySessions && opts.scoped) {
    return { kind: 'scoped', titleKey: 'historyScopedTitle', hintKey: 'historyScopedHint', ctaKey: 'allGames' };
  }
  return { kind: 'empty', titleKey: 'historyEmptyTitle', hintKey: 'historyEmptyHint', ctaKey: 'historyEmptyCta' };
}
