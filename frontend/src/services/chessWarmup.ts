/* psygames-theme-warmup · VER 2 · 06.09.2026 */
/**
 * 🔴 ШАХМАТНАЯ ЗАРЯДКА: ОБА УПРАЖНЕНИЯ ПОДРЯД, ПО СВОИМ УРОВНЯМ, НА ЗАДАННОЕ ВРЕМЯ.
 *
 * 📍 ОТЧЁТ ДЕНИСА 05.09.2026 из хаба «Шахматы», дословно: «Надо стерео типа
 * зарядки собрать и с обоих этих штук и чтобы они типа потекли по уровням и
 * желательно чтобы можно было задавать время типа как в режиме потока».
 *
 * Три требования, и каждое здесь выполнено буквально:
 *   · «с обоих этих штук» — шаги чередуют «Доску в уме» и «Детский мат»;
 *   · «потекли по уровням» — уровень каждого шага берётся из ЕГО СОБСТВЕННОЙ
 *     лестницы, а не задаётся заново: человек продолжает с того места, где стоит;
 *   · «задавать время» — набор набирается до выбранной длительности, а не до
 *     фиксированного числа шагов.
 *
 * ⚠️ ПОЧЕМУ ЧЕРЕДОВАНИЕ, А НЕ «СНАЧАЛА ОДНО, ПОТОМ ДРУГОЕ». Навыки у них
 * разные: «Доска в уме» держит позицию В ГОЛОВЕ и идёт медленно, «Детский мат»
 * показывает позицию и меряет скорость узнавания. Подряд идущие блоки одного
 * вида — это два коротких занятия, а не зарядка; чередование не даёт ни одному
 * из них уйти в монотонность.
 *
 * ⚠️ УРОВЕНЬ ЗАРЯДКИ НЕ ДВИГАЕТ ЛЕСТНИЦУ. Шаг зарядки идёт с `wu=1`, а по
 * общему правилу игры (`levelOutcome`) заданный извне уровень ступень не
 * трогает — ни вверх, ни вниз. Это нарочно: «прошёл» в зарядке несравнимо с
 * «прошёл» на своей тропинке.
 */
import type { PlaylistMeta, PlaylistStep, Difficulty } from './warmup';

/** Сколько минут длится зарядка. Те же три числа, что у общей зарядки. */
export type ChessWarmupMinutes = 5 | 10 | 15;
/** Те же три числа для любой тематической зарядки — общий выбор длительности. */
export type WarmupMinutes = ChessWarmupMinutes;
export const ДЛИТЕЛЬНОСТИ: readonly WarmupMinutes[] = [5, 10, 15];

/**
 * 🔴 ТЕМАТИЧЕСКАЯ ЗАРЯДКА — ОДНО УСТРОЙСТВО НА ЛЮБУЮ РАЗВИЛКУ.
 *
 * 📍 ПРОСЬБА ДЕНИСА 06.09.2026: «надо зарядку по словам собрать на 5–10 минут;
 * надо по идее выбор сделать в зарядках по времени, чтобы понять, какую серию
 * запускают». Шахматная зарядка уже так устроена; выносим общее, чтобы вторая и
 * третья не были её копиями — копия расходится с оригиналом молча.
 *
 * Три правила те же и они не случайны:
 *   · упражнения ЧЕРЕДУЮТСЯ (подряд идущие блоки одного вида — два коротких
 *     занятия, а не зарядка);
 *   · уровень каждого шага берётся из ЕГО СОБСТВЕННОЙ лестницы;
 *   · набор набирается до выбранного времени, а последний шаг берётся только
 *     если влезает хотя бы наполовину.
 */
export interface ТемаЗарядки {
  game_id: string;
  game_route: string;
  /** Оценка длительности круга в секундах — из самого упражнения, не на глаз. */
  секунд: number;
  /** Уровень из собственной лестницы этой игры. */
  уровень: number;
  /** Что передать игре сверх уровня (режим, язык слов и прочее). */
  настройки?: Record<string, string | number>;
}

export function темаШаги(темы: readonly ТемаЗарядки[], minutes: WarmupMinutes): PlaylistStep[] {
  if (темы.length === 0) return [];
  const бюджет = minutes * 60;
  const шаги: PlaylistStep[] = [];
  let занято = 0;
  for (let i = 0; занято < бюджет; i++) {
    const т = темы[i % темы.length]!;
    if (занято > 0 && занято + т.секунд / 2 > бюджет) break;
    const уровень = Math.max(1, Math.floor(т.уровень));
    шаги.push({
      game_id: т.game_id,
      game_route: т.game_route,
      difficulty: сложность(уровень),
      est_duration_sec: т.секунд,
      settings: { level: уровень, ...(т.настройки ?? {}) },
    });
    занято += т.секунд;
  }
  return шаги;
}

export function собратьТемуЗарядки(
  темы: readonly ТемаЗарядки[],
  minutes: WarmupMinutes,
  ярлык: string,
): PlaylistMeta {
  const steps = темаШаги(темы, minutes);
  const total = steps.reduce((s, x) => s + x.est_duration_sec, 0);
  return {
    duration_min: Math.max(1, Math.round(total / 60)),
    weekday: 0,
    weekday_name: '',
    track: 'training',
    track_label: ярлык,
    steps,
    est_total_sec: total,
    slot: 'day',
  };
}

/**
 * Оценка длительности шага, в секундах. Взята из самих упражнений, а не на глаз:
 * · «Детский мат» — 10 позиций по 20…4 секунды на уровень плюс разбор ошибки;
 * · «Доска в уме» — ходы обдумывают, круг заметно длиннее.
 */
export const ШАГ_МАТ_СЕК = 90;
export const ШАГ_ДОСКА_СЕК = 150;

export interface ChessWarmupOpts {
  minutes: ChessWarmupMinutes;
  /** Уровень «Доски в уме» — из её собственной лестницы. */
  blindLevel: number;
  /** Уровень «Детского мата» — из его собственной лестницы. */
  mateLevel: number;
  /** Ступень нагрузки для общей статистики зарядки. */
  difficulty?: Difficulty;
}

function сложность(level: number): Difficulty {
  if (level <= 8) return 'easy';
  if (level <= 22) return 'medium';
  return 'hard';
}

/**
 * Набор шагов на заданное время. Чередование начинается с «Детского мата»:
 * он короче и раскачивает, а «Доска в уме» требует уже собранного внимания.
 */
export function chessWarmupSteps(o: ChessWarmupOpts): PlaylistStep[] {
  /**
   * ⚠️ ЧЕРЕЗ ОБЩЕЕ УСТРОЙСТВО, А НЕ СВОЕЙ КОПИЕЙ. Правила чередования, уровней
   * и времени одни на все тематические зарядки; своя копия разошлась бы с
   * оригиналом при первой же правке — в этом проекте так уже случалось
   * с высотой полки и с правилом уровня.
   */
  return темаШаги([
    { game_id: 'scholars_mate', game_route: '/games/scholars-mate', секунд: ШАГ_МАТ_СЕК, уровень: o.mateLevel },
    { game_id: 'chess_blind', game_route: '/games/chess-blind', секунд: ШАГ_ДОСКА_СЕК, уровень: o.blindLevel },
  ], o.minutes);
}

export function buildChessWarmup(o: ChessWarmupOpts): PlaylistMeta {
  const steps = chessWarmupSteps(o);
  const total = steps.reduce((s, x) => s + x.est_duration_sec, 0);
  return {
    duration_min: Math.max(1, Math.round(total / 60)),
    weekday: 0,
    weekday_name: '',
    track: 'training',
    track_label: 'шахматы',
    steps,
    est_total_sec: total,
    slot: 'day',
  };
}

/**
 * 🔴 СЛОВЕСНАЯ ЗАРЯДКА. Просьба Дениса 06.09.2026: «надо зарядку по словам
 * собрать на 5–10 минут». Собирается тем же устройством, что и шахматная.
 *
 * Три упражнения, и они РАЗНЫЕ по нагрузке, а не три вида одного:
 *   · анаграммы — собрать слово из данных букв (порождение из набора);
 *   · филворды в «Корректуре» — найти слова в поле букв (поиск в шуме);
 *   · беглость речи — назвать слова на букву (извлечение из памяти).
 */
export const ШАГ_АНАГРАММЫ_СЕК = 90;
export const ШАГ_ФИЛВОРДЫ_СЕК = 120;
export const ШАГ_БЕГЛОСТЬ_СЕК = 60;

export interface WordWarmupOpts {
  minutes: WarmupMinutes;
  anagramsLevel: number;
  proofreadingLevel: number;
}

export function wordWarmupSteps(o: WordWarmupOpts): PlaylistStep[] {
  return темаШаги([
    { game_id: 'anagrams', game_route: '/games/anagrams', секунд: ШАГ_АНАГРАММЫ_СЕК, уровень: o.anagramsLevel },
    { game_id: 'proofreading', game_route: '/games/proofreading', секунд: ШАГ_ФИЛВОРДЫ_СЕК, уровень: o.proofreadingLevel, настройки: { mode: 'fillwords' } },
    // «Беглость речи» без лестницы — там уровень задаёт длительность круга.
    { game_id: 'phonemic_fluency', game_route: '/games/phonemic-fluency', секунд: ШАГ_БЕГЛОСТЬ_СЕК, уровень: 1 },
  ], o.minutes);
}

export function buildWordWarmup(o: WordWarmupOpts): PlaylistMeta {
  const steps = wordWarmupSteps(o);
  const total = steps.reduce((s, x) => s + x.est_duration_sec, 0);
  return {
    duration_min: Math.max(1, Math.round(total / 60)),
    weekday: 0,
    weekday_name: '',
    track: 'training',
    track_label: 'слова',
    steps,
    est_total_sec: total,
    slot: 'day',
  };
}
