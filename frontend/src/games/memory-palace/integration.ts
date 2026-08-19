/* psygames-memory-palace-integration · VER 1 · 19.08.2026 */
/**
 * Стыковочный слой «Дворца памяти»: всё, что решает ПРИЛОЖЕНИЕ, а не модуль.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ, А НЕ ВНУТРИ ЭКРАНА. Рендерера компонентов в проекте
 * нет (`testMatch` — только `*.test.ts`), и всё, что живёт внутри .tsx, можно
 * проверить лишь чтением исходника. Ровно так и появляются «написано, переведено
 * и ни разу не показано». Поэтому решения, у которых есть цена ошибки — зерно
 * партии, снимок незаконченной партии, порог прохождения, разбор ошибок — вынесены
 * сюда обычными функциями и гоняются в `memory-palace-integration.test.ts`
 * по-настоящему.
 */
import {
  generateMemoryPalaceRound,
  getItemLabel,
  getLocusLabel,
  isPassed,
  type MemoryPalaceLocale,
  type MemoryPalaceMetrics,
  type MemoryPalaceSession,
} from './core/index';

/** Ключ игры: совпадает с id в реестре и с ключом незаконченной партии. */
export const MEMORY_PALACE_GAME_ID = 'memory_palace';

/**
 * Версия формата снимка. Поднимать при ЛЮБОМ изменении полей MemoryPalaceResume
 * либо состояния сессии модуля: старая запись тогда не подойдёт под новый код и
 * будет молча выброшена, а не оживит партию с недостающими полями.
 */
export const MEMORY_PALACE_RESUME_V = 1;

/** Снимок недоигранной партии. */
export interface MemoryPalaceResume {
  level: number;
  seed: string;
  /**
   * НАКОПЛЕННОЕ время партии, а не момент старта. Момент старта хранить нельзя:
   * между выходом и возвратом настенные часы уходят вперёд на часы и сутки, и
   * партия, поднятая назавтра, отчиталась бы о десятичасовом маршруте.
   */
  elapsedMs: number;
  /** Состояние модуля целиком — расстановку придумал человек, вывести её неоткуда. */
  session: MemoryPalaceSession;
}

/**
 * 🔴 ЗЕРНО МЕНЯЕТСЯ НА КАЖДЫЙ ЗАХОД — И ЭТО ПРОТИВОПОЛОЖНО ТОМУ, ЧТО СДЕЛАНО В G1.
 *
 * В «Прикидке» зерно прибито к уровню: перезапуск обязан давать ТЕ ЖЕ выражения,
 * иначе «не получилось — крутани ещё раз» превращается в лотерею вместо второй
 * попытки. Здесь ровно наоборот, и по существу игры: предмет, который человек
 * уже раскладывал по этому маршруту, он во второй раз не запоминает, а УЗНАЁТ.
 * Повтори набор — и вторая попытка мерит не память на новое, а остаточный след
 * первой; уровень при этом выдаётся честно пройденным.
 *
 * Плата за решение названа прямо: расклад не воспроизводится по номеру уровня,
 * значит недоигранную партию нельзя восстановить пересчётом — её приходится
 * хранить целиком (см. MemoryPalaceResume).
 */
export function makeSeed(level: number, nonce: string): string {
  return `memory-palace-l${Math.max(1, Math.floor(level))}-${nonce}`;
}

/**
 * Метка захода. Обе составляющие нужны: время разводит заходы между запусками
 * приложения, случайная часть — два старта внутри одной миллисекунды.
 */
export function makeNonce(now: number, rnd: number): string {
  const t = Math.floor(Math.abs(now)).toString(36);
  const r = Math.floor(Math.abs(rnd) * 1_679_616).toString(36).padStart(4, '0');
  return `${t}${r}`;
}

/**
 * ЕСТЬ ЛИ ЧТО ТЕРЯТЬ ПРЯМО СЕЙЧАС.
 *
 * Граница проведена по первому ЛИЧНОМУ вкладу: маршрут в игре постоянный и
 * одинаковый на всех заходах, поэтому на фазе «Маршрут» терять нечего — при
 * возврате человек увидит ровно то же самое. А вот первая же связка «предмет →
 * место» придумана им самим, восстановить её неоткуда, и с этого момента выход
 * обязан спрашивать, а партия — ложиться в хранилище.
 *
 * Та же функция отвечает и на вопрос «что сохранять»: спрашивать про партию,
 * которую мы не сохраняем, — обман, а сохранять молча то, о чём не спросили, —
 * половинчатая починка (см. `__tests__/exit-guard.test.ts`).
 */
export function hasSomethingToLose(session: MemoryPalaceSession | null): boolean {
  if (!session) return false;
  switch (session.phase) {
    case 'place':
      return session.placements.some((itemId) => itemId !== null);
    case 'study':
    case 'recall-forward':
    case 'transition':
    case 'recall-reverse':
      return true;
    case 'paused':
      // На паузе смотрим на фазу, ИЗ которой в неё вошли: пауза посреди
      // расстановки — это живая партия, пауза на маршруте — нет.
      return session.pausedFrom !== null && session.pausedFrom !== 'route';
    default:
      // rules · route · result · disposed — терять нечего либо уже поздно.
      return false;
  }
}

/**
 * Снимок для хранилища. null значит «сохранять нечего» — и это не ошибка, а
 * нормальный ответ: мусорные записи в хранилище потом всплывают карточкой
 * «Продолжить» на главной и обещают партию, которой нет.
 */
export function snapshotForResume(
  session: MemoryPalaceSession | null,
  level: number,
  now: number,
): MemoryPalaceResume | null {
  if (!session || !hasSomethingToLose(session)) return null;

  const livePause = session.pauseStartedAt === null ? 0 : Math.max(0, now - session.pauseStartedAt);
  const elapsedMs = Math.max(0, now - (session.startedAt ?? now) - session.pausedMs - livePause);

  /**
   * Паузу в снимок НЕ консервируем. Человек вышел из игры — это и есть его
   * пауза; вернувшись назавтра, он должен попасть в свою расстановку, а не в
   * модальное окно «Пауза · Продолжить», которое он не открывал.
   */
  const phase = session.phase === 'paused' ? (session.pausedFrom ?? 'place') : session.phase;

  return {
    level,
    seed: session.round.seed,
    elapsedMs,
    session: {
      ...session,
      phase,
      pausedFrom: null,
      pauseStartedAt: null,
      pausedMs: 0,
      startedAt: null,
      // Выбранный, но не положенный предмет — состояние руки, а не партии.
      selectedPlacementItemId: null,
    },
  };
}

/**
 * Поднять партию из снимка. Часы заводим ЗАДНИМ ЧИСЛОМ на накопленное время,
 * чтобы разность `now − startedAt` сразу дала настоящую длительность партии, а
 * не срок хранения записи.
 */
export function restoreFromResume(
  saved: MemoryPalaceResume | null,
  now: number,
): { session: MemoryPalaceSession; seed: string; level: number } | null {
  if (!saved || !saved.session || !saved.session.round) return null;
  if (!hasSomethingToLose(saved.session)) return null;
  const elapsed = Math.max(0, Number(saved.elapsedMs) || 0);
  return {
    seed: saved.seed,
    level: saved.level,
    session: {
      ...saved.session,
      startedAt: now - elapsed,
      pausedMs: 0,
      pauseStartedAt: null,
      pausedFrom: null,
    },
  };
}

/**
 * 🔴 ОТЛОЖЕННАЯ ЗАПИСЬ ПАРТИИ — ЯДРО БЕЗ REACT, И ЭТО НЕ УКРАШЕНИЕ.
 *
 * Живая проверка 19.08.2026 поймала ровно этот баг: таймер записи висел на
 * эффекте с зависимостью от флага «есть что терять», флаг меняется РОВНО ОДИН
 * РАЗ — на первой положенной вещи, — эффект больше не перезапускался, и в
 * хранилище навсегда оставался снимок из первых секунд партии. Снаружи всё
 * выглядело работающим: запись есть, «Продолжить» предлагается, — а
 * восстанавливались два предмета из пяти.
 *
 * Такое не ловится чтением исходника и не падает само. Поэтому правило вынесено
 * из разметки сюда обычным объектом и гоняется в тесте по-настоящему: КАЖДОЕ
 * изменение партии перезаводит запись, подряд идущие ходы дают ОДНУ запись, и
 * записывается ПОСЛЕДНЕЕ состояние, а не первое.
 *
 * Таймер приходит снаружи: в приложении это setTimeout, в тесте — подставной,
 * который можно дёрнуть руками, не завися от настоящих часов.
 */
export interface PartySaver {
  /** Партия изменилась — отложенная запись перезаводится. */
  changed: () => void;
  /** Отменить отложенную запись: партия доиграна либо экран сносят. */
  cancel: () => void;
}

export interface PartySaverDeps {
  delayMs: number;
  /** Сама запись: читает ЖИВОЕ состояние в момент срабатывания, а не в момент планирования. */
  save: () => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export function createPartySaver(deps: PartySaverDeps): PartySaver {
  let handle: unknown = null;
  const cancel = () => {
    if (handle === null) return;
    deps.clearTimer(handle);
    handle = null;
  };
  return {
    cancel,
    changed() {
      cancel();
      handle = deps.setTimer(() => { handle = null; deps.save(); }, deps.delayMs);
    },
  };
}

/**
 * ЗВЁЗДЫ СЧИТАЕМ ПО ТОЧНОСТИ МЕСТ, А НЕ ПО ОБЩЕЙ.
 *
 * Общая точность модуля — взвешенная сумма трёх разных вопросов (узнал предмет
 * 0.35 · вспомнил место 0.45 · сохранил порядок 0.20). Узнавание предметов там
 * почти даровое: кандидатов всего на 2–4 больше, чем нужно, и человек, тыкающий
 * наугад, набирает высокий процент «знания предметов», ничего не помня. Предмет
 * игры — привязка предмета к МЕСТУ, по ней и награда.
 */
export function memoryPalaceStars(metrics: MemoryPalaceMetrics): number {
  const loc = metrics.specific.locationAccuracy;
  return loc >= 0.95 ? 3 : loc >= 0.8 ? 2 : 1;
}

/**
 * Прохождение берём каноническое, модульное: accuracy ≥ 0.70 И места ≥ 0.60 И
 * каждое направление ≥ 0.50. Свой порог здесь был бы хуже, и вот почему: правило
 * модуля стережёт ровно то, что в этой игре можно подделать — узнавание
 * предметов и односторонний прогон маршрута не должны закрывать провал по
 * местам. Одним числом такое не выражается.
 */
export function memoryPalacePassed(metrics: MemoryPalaceMetrics): boolean {
  return isPassed(metrics);
}

/** Полоса сложности для истории сессий: 15 уровней делим на три равные трети. */
export function memoryPalaceDifficulty(level: number): 'easy' | 'medium' | 'hard' {
  return level <= 5 ? 'easy' : level <= 10 ? 'medium' : 'hard';
}

/** Строка разбора: что стояло на месте и попал ли человек в каждом направлении. */
export interface MemoryPalaceReviewRow {
  order: number;
  locus: string;
  item: string;
  forwardOk: boolean;
  reverseOk: boolean;
}

/**
 * РАЗБОР ПОСЛЕ ПАРТИИ — ГЛАВНОЕ, ЧЕГО У МЕТОДА МЕСТ НЕ БЫВАЕТ БЕЗ ОБРАТНОЙ СВЯЗИ.
 *
 * Итоговые проценты говорят «шесть из восьми», но не говорят ГДЕ. А метод мест
 * тем и тренируется: человек видит, что на «Балконе» он спотыкается оба раза, и
 * в следующий раз делает связку ярче именно там. Модуль наружу отдаёт только
 * сводные числа, поэтому построчный разбор считаем здесь из самой партии.
 *
 * Обратный проход идёт от последнего места к первому — ответ i относится к месту
 * `lociCount − 1 − i`. Перепутать индексы легко, и молча: проценты сойдутся, а
 * разбор будет показывать чужие ошибки.
 */
export function memoryPalaceReview(
  session: MemoryPalaceSession | null,
  locale: MemoryPalaceLocale,
): MemoryPalaceReviewRow[] {
  const placed = session?.finalizedPlacements;
  if (!session || !placed) return [];
  const total = session.round.lociCount;
  const byId = new Map(session.round.recallCandidates.map((item) => [item.id, item]));
  return session.round.loci.map((locus, index) => {
    const itemId = placed[index] ?? '';
    const item = byId.get(itemId);
    return {
      order: locus.order,
      locus: getLocusLabel(locus, locale),
      item: item ? getItemLabel(item, locale) : '—',
      forwardOk: session.forwardResponses[index] === itemId,
      reverseOk: session.reverseResponses[total - 1 - index] === itemId,
    };
  });
}

/**
 * Сколько мест на уровне — для подписи на экране настройки. Считается тем же
 * генератором, что и партия: подпись, посчитанная своей формулой, разъезжается с
 * игрой на первом же изменении лесенки.
 */
export function memoryPalaceLociForLevel(level: number): number {
  return generateMemoryPalaceRound('preview', level).lociCount;
}
