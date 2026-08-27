// Анонимный лидерборд. Без регистрации: стабильный player_id в AsyncStorage → сервер сам
// генерит анон-имя (детерминированное от player_id) → RPC валидирует правдоподобие score и
// хранит только personal best. Архитектура — паттерн freefocusgames, но на Supabase.
//
// v1.116.0 — пилот на двух играх (schulte_table_5x5 / n_back).
// 19.08.2026 — шесть игр: + digit_span, corsi, trail_making, choice_rt (см. LEADERBOARD_GAMES).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@/src/services/supabase';

const PLAYER_ID_KEY = 'psygames_leaderboard_player_id';
const PERSONAL_BEST_KEY = 'psygames_leaderboard_personal_best';

// Cross-platform UUID (тот же паттерн, что WarmupContext.genUUID — не изобретаем заново).
function genUUID(): string {
  try {
    // @ts-ignore — crypto may be available
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedPlayerId: string | null = null;

export async function getPlayerId(): Promise<string> {
  if (cachedPlayerId) return cachedPlayerId;
  try {
    const stored = await AsyncStorage.getItem(PLAYER_ID_KEY);
    if (stored) { cachedPlayerId = stored; return stored; }
  } catch {}
  const fresh = genUUID();
  cachedPlayerId = fresh;
  try { await AsyncStorage.setItem(PLAYER_ID_KEY, fresh); } catch {}
  return fresh;
}

/**
 * 🔴 СРАВНИМОСТЬ — ЕДИНСТВЕННОЕ, ЗАЧЕМ ЭТА ТАБЛИЦА СУЩЕСТВУЕТ.
 *
 * Рекорд имеет смысл, только если все сравниваемые играли ОДНО И ТО ЖЕ. Поэтому ключ
 * называется `schulte_table_5x5`, а не `schulte`: размер таблицы вшит в само имя, и
 * результат на 4×4 туда не попадает никогда. То же правило распространено на остальные
 * пять: у каждой записи ниже сказано ЧТО сравнивается, В КАКОЙ конфигурации партия
 * засчитывается и ПОЧЕМУ именно эта конфигурация выбрана.
 *
 * ⚠️ ПОЧЕМУ ЗАЧЁТНАЯ КОНФИГУРАЦИЯ ЧЕТЫРЁХ НОВЫХ ИГР — УРОВЕНЬ 1. У этих экранов
 * параметры партии выводит ЧИСТАЯ функция `levelParams(level)` — длина ряда, скорость
 * показа, число узлов, окно ответа. Значит одно число (уровень) фиксирует партию целиком,
 * и пин делается одним сравнением, а не перечислением полей. Взят именно первый уровень,
 * потому что он единственный, который играет КАЖДЫЙ:
 *   · в веб-демо (psy-games.pro) прогресс вообще не растёт — `IS_WEB_DEMO` в
 *     usePersistentLevel держит уровень на 1, то есть вся веб-аудитория попадает в
 *     зачётную конфигурацию по умолчанию, ничего специально не делая;
 *   · в приложении на пройденный уровень всегда можно вернуться по тропинке (`lvl.pick`),
 *     и провал переигровки не понижает достигнутое — то есть заход за рекордом ничего
 *     не стоит игроку сотого уровня.
 * Любой другой уровень был бы либо недоступен новичку, либо необязателен для ветерана.
 *
 * 🔴 ЭТА ТАБЛИЦА — ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ, И СВЯЗЬ ПРОВЕРЯЕТ МАШИНА.
 *
 * Те же три факта про игру (направление, `min`, `max`) живут ещё и на
 * сервере — в ветках RPC `psygames_submit_score` (Supabase personal-nzt), где из
 * направления считается `rank_score`: `score` при `asc`, `-score` при `desc`. Копия
 * опасна не тем, что она копия, а тем, что расходится МОЛЧА: перевернув направление в
 * одном месте, получаешь таблицу, где первым стоит ХУДШИЙ результат, и замечает это
 * игрок, а не мы. Ни tsc, ни jest этого не видят — тесты в базу не ходят.
 *
 * Поэтому `scripts/leaderboard-rules-gate.mjs` на каждой сборке берёт ЖИВЫЕ строки
 * решения боевой функции (RPC `psygames_leaderboard_rules()` отдаёт их через
 * `pg_get_functiondef`, публикуемым ключом, ничего никуда не записывая) и сверяет с этой
 * таблицей поигрово: направление (`less` здесь = `asc` там), `min`, `max` и сам состав
 * игр в обе стороны. Разошлось — сборка красная и печатает готовый SQL.
 *
 * Добавляя игру сюда, добавь ветку там — иначе сервер ответит `unknown_game`, таблица
 * будет вечно пустой, и гейт скажет об этом до выпуска, а не после.
 */
export interface LeaderboardGameSpec {
  /** Куда «лучше»: less — меньше (время), more — больше (уровень, длина ряда, счёт). */
  better: 'less' | 'more';
  /**
   * Границы правдоподобия: результат вне [min, max] сервер отвергает как
   * `implausible_score`, не записав ничего. Стоят здесь, а не только в SQL, по той же
   * причине, что и направление: гейт сверяет их с живой функцией, и «подкрутили порог на
   * сервере, а в коде осталось старое» перестаёт быть незаметным. Единицы — те же, что у
   * `metric` (секунды, миллисекунды, длина ряда).
   */
  min: number;
  max: number;
  /** Один числовой результат партии, который сравнивается. */
  metric: string;
  /** ЕДИНСТВЕННАЯ конфигурация, в которой партия идёт в рекорд. */
  config: string;
  /** Почему именно эта конфигурация, а не другая. */
  why: string;
}

export const LEADERBOARD_GAMES = {
  schulte_table_5x5: {
    better: 'less',
    min: 3,
    max: 180,
    metric: 'время прохождения таблицы, секунды',
    config: 'сетка 5×5, цифры, прямой порядок, без цвета, одна группа, без перетасовки по клику',
    why: 'это набор по умолчанию на экране настройки и то, что словом «таблица Шульте» называют по умолчанию; 4×4 и 7×7, буквы, обратный порядок и разделённое внимание — другие задачи, их время несравнимо',
  },
  n_back: {
    better: 'more',
    min: 1,
    max: 30,
    metric: 'достигнутый N (номер уровня лестницы N → скорость → dual)',
    config: '20 проб за раунд, точность ≥80% по худшему из каналов, личная игра (не шаг зарядки)',
    why: '20 проб стоит по умолчанию; 15 и 30 выбираются рядом одной кнопкой, а на пятнадцати пробах порог 80% держать заметно легче — без пина уровень можно было накрутить укороченным раундом',
  },
  digit_span: {
    better: 'more',
    min: 1,
    max: 12,
    metric: 'максимальная верно воспроизведённая длина ряда цифр',
    config: 'уровень 1: старт с 4 цифр, показ 700 мс, пауза 1100 мс, прямой порядок',
    why: 'скорость показа и стартовая длина выводятся из уровня, поэтому спан с разных уровней несравним; уровень 1 доступен всем (веб-демо не растит прогресс, в приложении есть возврат по тропинке)',
  },
  corsi: {
    better: 'more',
    min: 1,
    max: 9,
    metric: 'максимальная верно повторённая длина последовательности блоков',
    config: 'уровень 1: старт с 3 блоков, шаг 800 мс, вспышка 500 мс, прямой порядок',
    why: 'та же причина, что у digit_span: темп показа и стартовая длина заданы уровнем; на уровне 1 диапазон спана 3..9 — разброс здоровый, потолок не упирается',
  },
  trail_making: {
    better: 'less',
    min: 1,
    max: 300,
    metric: 'время соединения всех узлов, секунды',
    config: 'уровень 1 (Trail-A, 6 узлов, только цифры) и партия без единой ошибки',
    why: 'уровень задаёт и режим A/B, и число узлов, так что время между уровнями несравнимо; Trail-A взят ещё и потому, что в нём нет букв — иначе алфавит зависел бы от языка игрока (RU/EN), а ошибки не блокируют ход и без гейта «0 ошибок» время выигрывалось бы наугад',
  },
  choice_rt: {
    better: 'less',
    min: 100,
    max: 2000,
    metric: 'среднее время реакции по всем пробам, миллисекунды',
    config: 'уровень 1 (12 проб, две стрелки, окно 2000 мс) и 12 верных из 12',
    why: 'число альтернатив — это закон Хика, RT на двух и четырёх стрелках несравнимо в принципе; «12 из 12» обязательно, потому что в среднее попадают только верные ответы: без гейта выгодно жать наугад и ронять сомнительные пробы в тайм-аут',
  },
  go_no_go: {
    better: 'less',
    min: 150,
    max: 1100,
    metric: 'средний RT по go-пробам, миллисекунды',
    config: 'уровень 1 (24 пробы, окно 1100 мс, no-go 25%) и ЧИСТАЯ партия: 0 пропусков go и 0 ложных нажатий',
    why: 'окно и темп выводятся из уровня — RT с разных ступеней несравним; чистота обязательна, потому что в среднее идут только пойманные go: без неё выгодно жать всё подряд (ложные не штрафуют среднее) или пропускать медленные пробы',
  },
  hanoi: {
    better: 'less',
    min: 1.5,
    max: 120,
    metric: 'время решения, секунды',
    config: 'уровень 1 (3 диска, 3 стержня) и решение РОВНО за 7 ходов — математический минимум',
    why: 'число дисков и стержней задаёт уровень, время между конфигурациями несравнимо; пин «ровно минимум ходов» делает время единственной осью — иначе быстрое тыканье лишними ходами обгоняло бы обдуманное решение',
  },
  counter: {
    better: 'less',
    min: 5,
    max: 150,
    metric: 'время десяти раундов, секунды',
    config: 'уровень 1 (сетка 3×3, лимит раунда 15 с, 10 раундов) и все 10 решены без единой ошибки',
    why: 'размер сетки и лимит выводятся из уровня; «10 из 10 без ошибок» обязательно, потому что перебор суммы и просрочка не останавливают партию — без гейта время выигрывалось бы бросанием безнадёжных раундов',
  },
} as const satisfies Record<string, LeaderboardGameSpec>;

export type LeaderboardGameId = keyof typeof LEADERBOARD_GAMES;

/**
 * Что экран обязан рассказать о партии, чтобы можно было решить — рекорд это или нет.
 * Формы разные, потому что и пины разные: у Шульте перечисление полей настройки, у
 * лестничных игр — номер уровня плюс признак чистой партии.
 */
export interface RecordRunShape {
  schulte_table_5x5: {
    gridSize: number; contentMode: string; direction: string;
    colorMode: boolean; groupCount: number; reshuffleOnClick: boolean;
  };
  n_back: { isPreset: boolean; passed: boolean; trials: number };
  digit_span: { isPreset: boolean; level: number };
  corsi: { isPreset: boolean; level: number };
  trail_making: { isPreset: boolean; level: number; errors: number };
  choice_rt: { isPreset: boolean; level: number; hits: number; trials: number };
  go_no_go: { isPreset: boolean; level: number; misses: number; falseAlarms: number };
  hanoi: { isPreset: boolean; level: number; moves: number; optimal: number };
  counter: { isPreset: boolean; level: number; hits: number; errors: number };
}

/**
 * ⚠️ `isPreset` (шаг зарядки) отсекается у всех, кроме Шульте. Причина не в том, что
 * зарядка «хуже»: в пресете параметры партии диктует плейлист, а НЕ лестница уровня —
 * digit-span берёт длину из URL и фиксирует показ на 700 мс, corsi берёт стартовый спан
 * из URL, trail-making вообще не обновляет levelRef, так что номер уровня перестаёт
 * описывать реальную партию. У Шульте пин перечисляет ВСЕ поля настройки поимённо, и
 * поэтому шагу зарядки на классической 5×5 верить можно: это буквально та же партия.
 */
const ELIGIBLE: { [K in LeaderboardGameId]: (run: RecordRunShape[K]) => boolean } = {
  schulte_table_5x5: (r) => r.gridSize === 5 && r.contentMode === 'numbers' && r.direction === 'forward'
    && !r.colorMode && r.groupCount <= 1 && !r.reshuffleOnClick,
  n_back: (r) => !r.isPreset && r.passed && r.trials === 20,
  digit_span: (r) => !r.isPreset && r.level === 1,
  corsi: (r) => !r.isPreset && r.level === 1,
  trail_making: (r) => !r.isPreset && r.level === 1 && r.errors === 0,
  choice_rt: (r) => !r.isPreset && r.level === 1 && r.trials > 0 && r.hits === r.trials,
  go_no_go: (r) => !r.isPreset && r.level === 1 && r.misses === 0 && r.falseAlarms === 0,
  hanoi: (r) => !r.isPreset && r.level === 1 && r.optimal > 0 && r.moves === r.optimal,
  counter: (r) => !r.isPreset && r.level === 1 && r.hits === 10 && r.errors === 0,
};

/**
 * Идёт ли партия в рекорд. Незачётная конфигурация отваливается МОЛЧА — человек играл
 * ради игры, а не ради таблицы, и ругаться на него за 4×4 не за что.
 */
export function countsForRecord<K extends LeaderboardGameId>(gameId: K, run: RecordRunShape[K]): boolean {
  return (ELIGIBLE[gameId] as (r: RecordRunShape[K]) => boolean)(run);
}

function personalBestKey(gameId: LeaderboardGameId): string {
  return `${PERSONAL_BEST_KEY}_${gameId}`;
}

/**
 * Куда «лучше» — из таблицы игр, а не из тернарника по имени игры. Раньше здесь стояло
 * `gameId === 'schulte_table_5x5' ? candidate < current : candidate > current`, то есть
 * «меньше лучше» знала ровно одна игра, а любая следующая игра на время (trail_making,
 * choice_rt) молча получила бы перевёрнутый рекорд: в личном рекорде осело бы САМОЕ
 * МЕДЛЕННОЕ время, и человек увидел бы, что стал хуже, чем больше тренируется.
 */
function isBetter(gameId: LeaderboardGameId, candidate: number, current: number): boolean {
  return LEADERBOARD_GAMES[gameId].better === 'less' ? candidate < current : candidate > current;
}

async function rememberPersonalBest(gameId: LeaderboardGameId, score: number): Promise<void> {
  if (!Number.isFinite(score)) return;
  try {
    const key = personalBestKey(gameId);
    const raw = await AsyncStorage.getItem(key);
    const current = raw === null ? null : Number(raw);
    if (current === null || !Number.isFinite(current) || isBetter(gameId, score, current)) {
      await AsyncStorage.setItem(key, String(score));
    }
  } catch {}
}

/** Личный рекорд нужен как офлайн-фолбэк, когда общий лидерборд недоступен. */
export async function getPersonalBest(gameId: LeaderboardGameId): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(personalBestKey(gameId));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export interface SubmitScoreResult {
  ok: boolean;
  improved?: boolean;
  playerName?: string;
  error?: string;
}

/** Отправить результат — тихо игнорит сетевые ошибки (лидерборд необязателен для игры). */
export async function submitScore(gameId: LeaderboardGameId, score: number): Promise<SubmitScoreResult> {
  // Сначала локально: даже при отсутствии сети результат не должен потеряться.
  await rememberPersonalBest(gameId, score);
  try {
    const playerId = await getPlayerId();
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_submit_score', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_score: score,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: !!data?.ok, improved: !!data?.improved, playerName: data?.player_name, error: data?.error };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export interface LeaderboardEntry {
  player_name: string;
  score: number;
  updated_at: string;
}

export async function fetchTop(gameId: LeaderboardGameId, limit = 20): Promise<LeaderboardEntry[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_leaderboard_top', { p_game_id: gameId, p_limit: limit });
    if (error || !data) return [];
    return data as LeaderboardEntry[];
  } catch {
    return [];
  }
}

/**
 * Что рисовать в модалке. Решение вынесено из компонента чистой функцией по одной
 * причине: правило «пустая таблица → показываем СВОЙ рекорд, а не пустоту» иначе живёт
 * в JSX и проверяется только глазами. `fetchTop` отдаёт `[]` и когда в таблице правда
 * никого, и когда сети нет, и когда сервер не знает такую игру, — а человек с личным
 * рекордом в этих случаях видел бы «Пока пусто» и читал это как поломку.
 */
export type LeaderboardView =
  | { kind: 'loading' }
  | { kind: 'top'; entries: LeaderboardEntry[] }
  | { kind: 'personal'; score: number }
  | { kind: 'empty' };

export function leaderboardView(entries: LeaderboardEntry[] | null, personalBest: number | null): LeaderboardView {
  if (entries === null) return { kind: 'loading' };
  if (entries.length > 0) return { kind: 'top', entries };
  if (personalBest !== null && Number.isFinite(personalBest)) return { kind: 'personal', score: personalBest };
  return { kind: 'empty' };   // чужих нет И своего нет — вот тут «стань первым» честно
}

/** Лучший результат среди игроков; сеть/пустая таблица → null без ошибки для UI. */
export async function fetchBest(gameId: LeaderboardGameId): Promise<number | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_leaderboard_top', { p_game_id: gameId, p_limit: 1 });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const score = Number(data[0]?.score);
    return Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}
