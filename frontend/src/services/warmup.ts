/**
 * Утренняя Зарядка — сервис подбора плейлиста.
 *
 * Архитектура (3 трека):
 *   - ТРЕНИРОВКА: ПН/ВТ/ПТ/СБ — короткие лёгкие игры из разных категорий
 *   - ЗАМЕР:      ЧТ peak (после BOOST) + ВС baseline (до BOOST) — фиксированный набор
 *   - ЭПИЗОДИЧ.:  Iowa/BART/WCST/ANT — 1×/мес каждая, отдельный слот (НЕ в утренней рутине)
 *
 * Вызов:
 *   const playlist = buildMorningWarmupPlaylist({ duration: 5|10|15, weekday: 0..6 })
 */

import { isSandboxGame } from '@/src/constants/games';
import { GameSession } from '@/src/services/api';
import { translateFor } from '@/src/contexts/LanguageContext';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ...

export interface PlaylistStep {
  game_id: string;        // matches GAMES[].id
  game_route: string;     // /games/<slug>
  difficulty: Difficulty;
  trials?: number;        // override default trials count
  mode?: string;          // override default mode (game-specific)
  settings?: Record<string, string | number>;  // arbitrary preset для игры (напр. {targetLang:'en', pairCount:10, modality:'single'}) — передаётся в URL-params, игра применяет через useGamePreset
  est_duration_sec: number;
  is_fixed_baseline?: boolean; // marker for ЧТ peak / ВС baseline trials
}

/**
 * Время суток, под которое подбирается набор. Одна кнопка «Зарядка» на главной
 * меняет по нему подпись и предвыбор (решение Дениса 02.08).
 *
 * `night` — намеренно НЕ тренировка: человек открывает её потому, что не спится,
 * и счёт с таймером его разбудят. Отсюда у неё нет стрика, очков и итогового
 * экрана; см. `isTrainingSlot` ниже и `ROADMAP.md`.
 */
export type WarmupSlot = 'morning' | 'day' | 'evening' | 'night';

/** Границы согласованы с Денисом 02.08: 5-12 · 12-18 · 18-00 · 00-05. */
export function slotForHour(hour: number): WarmupSlot {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18) return 'evening';
  return 'night';                       // 00:00-04:59
}

/** Текущий слот. Отдельной функцией — чтобы тесты могли подставить свой час. */
export function currentSlot(date: Date = new Date()): WarmupSlot {
  return slotForHour(date.getHours());
}

/**
 * Пишет ли этот набор результат как тренировку. Ночь — нет: она не должна
 * двигать стрик и счётчик дней, иначе «не спится» превратится в обязанность.
 */
export function isTrainingSlot(slot: WarmupSlot): boolean {
  return slot !== 'night';
}

export interface PlaylistMeta {
  duration_min: number;
  weekday: Weekday;
  weekday_name: string;
  track: 'training' | 'measure-peak' | 'measure-baseline' | 'rest' | 'financial-battery' | 'assessment';
  track_label: string;
  steps: PlaylistStep[];
  est_total_sec: number;
  slot?: WarmupSlot;              // время суток: утро / день / вечер / «не спится»
}

/**
 * Конвертирует шаг плейлиста в URL-params для маршрута игры.
 * Игры с хуком useGamePreset() применяют их (конфиг + авто-старт); остальные игнорят.
 * `wu:'1'` — флаг «запущено из зарядки/комплекса».
 */
/**
 * 🔴 ВЕЧЕРНИЙ ШАГ ПОМЕЧАЕТСЯ `calm=1` — И ИГРЫ ОБЯЗАНЫ ЭТО УВАЖАТЬ.
 *
 * ЗАЧЕМ. Репорт тестировщицы 18.08.2026 дословно: «Это же вечерняя зарядка, а
 * зачем добавили время, когда есть время хочется сразу торопиться» и «даже на
 * маджонг теперь таймер. НЕЛЬЗЯ таймер, но в этом и был смысл вечерней
 * зарядки». Она права по существу: вечерний набор задуман как успокоение перед
 * сном, а обратный отсчёт делает ровно обратное.
 *
 * Раньше игра не знала, в каком слоте её запустили: `wu=1` одинаково означало
 * и утро, и вечер. Поэтому «Отличия» валили раунд по нулю таймера и в вечернем
 * наборе «Микро-релакса» (find_differences · mahjong · goods_sort · breathing).
 *
 * ⚠️ Пометка идёт от СЛОТА, а не от имени игры: список вечерних наборов у
 * каждого профиля свой, и перечислять игры поимённо значит забыть новую.
 */
export function stepToParams(step: PlaylistStep, slot?: WarmupSlot): Record<string, string> {
  const p: Record<string, string> = { wu: '1', diff: step.difficulty };
  // Вечер И НОЧЬ: в полночь торопить человека тем более незачем.
  if (slot === 'evening' || slot === 'night') p.calm = '1';
  if (step.trials != null) p.trials = String(step.trials);
  if (step.mode) p.mode = step.mode;
  if (step.settings) {
    for (const k of Object.keys(step.settings)) p[k] = String(step.settings[k]);
  }
  return p;
}

/**
 * Строит PlaylistMeta из фиксированного набора шагов (для per-profile утро/вечер,
 * где порядок задан в profiles.ts, а не вычисляется по дню недели).
 */
export function buildFixedPlaylist(
  steps: PlaylistStep[],
  slot: 'morning' | 'evening',
  weekday: Weekday,
  allow?: AllowFn,
): PlaylistMeta {
  steps = keepAllowed(steps, allow);
  const total = steps.reduce((s, x) => s + x.est_duration_sec, 0);
  return {
    duration_min: Math.max(1, Math.round(total / 60)),
    weekday,
    weekday_name: WEEKDAY_NAMES[weekday],
    track: 'training',
    track_label: slot === 'evening' ? 'перед сном' : 'тренировка',
    steps: steps.map((s) => ({ ...s })),
    est_total_sec: total,
    slot,
  };
}

const WEEKDAY_NAMES = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
/**
 * Тренировочный набор для дня, ГАРАНТИРОВАННО не являющийся замером.
 *
 * ⚠️ ЛОВУШКА, НА КОТОРОЙ Я СПОТКНУЛСЯ 16.08.2026. В `TRAINING_BY_WEEKDAY`
 * четверг и воскресенье ССЫЛАЮТСЯ НА ТУ ЖЕ `FIXED_BATTERY`. Поэтому «если
 * батарея профилю недоступна — дадим тренировку» не работало: тренировкой в
 * эти дни оказывалась ровно та же батарея, только урезанная фильтром. Первый
 * гейт это и поймал — сам по себе отказ от батареи ничего не менял.
 *
 * Берём ближайший предыдущий день, у которого набор свой. Именно предыдущий, а
 * не случайный: набор дня осмысленный (понедельник мягче, пятница нагруженнее),
 * и «вчерашняя тренировка» ближе по смыслу, чем набор с другого конца недели.
 */
export function trainingSetFor(weekday: Weekday): PlaylistStep[] {
  for (let i = 0; i < 7; i++) {
    const d = (((weekday - i) % 7) + 7) % 7 as Weekday;
    const set = TRAINING_BY_WEEKDAY[d];
    if (set && set !== SNAPSHOT_CORE) return set;
  }
  return TRAINING_BY_WEEKDAY[1];      // недостижимо: понедельник всегда свой
}


/**
 * ЗАРЯДКА СОБИРАЕТСЯ ИЗ ИГР ПРОФИЛЯ, А НЕ ИЗ ВСЕГО КАТАЛОГА.
 *
 * 🔴 ПОВОД, 16.08.2026. Денис открыл зарядку всем профилям (раньше её не было у
 * «Стандарта»). Само по себе это одна строка, но плейлисты тянут 33 игры, а на
 * «Стандарте» разрешено 9 — и главная это правило СОБЛЮДАЕТ (`filterAllowedGames`,
 * оттого «Память · 2»). Без фильтра зарядка стала бы чёрным ходом: в каталоге
 * девять игр, а по кнопке «Старт» играются любые. Платный каталог утёк бы весь.
 *
 * Предикат приходит снаружи и по умолчанию пропускает всё: тесты и старые
 * вызовы, которые про профиль ничего не знают, работают как раньше.
 */
type AllowFn = (gameId: string) => boolean;

/**
 * 🔴 ПЕСОЧНИЦА ВЫРЕЗАЕТСЯ ВСЕГДА, ДАЖЕ БЕЗ ФИЛЬТРА ПРОФИЛЯ.
 *
 * Отбор по профилю приходит снаружи и по умолчанию пропускает всё — а главный
 * экран строит утреннюю зарядку БЕЗ него (`app/index.tsx`). При этом четыре
 * сырые игры зашиты прямо в плейлисты: `memory_palace`, `object_tracker`,
 * `one_line`, `rhythm_pitch`. То есть человек получал сырое в зарядке, вообще
 * не заходя в каталог, и никакой профиль его от этого не спасал.
 *
 * Поэтому здесь ДВА среза, а не один: профиль — по желанию зовущего, песочница —
 * безусловно. Вернуть игру в зарядку можно одним снятием пометки в каталоге.
 */
const keepAllowed = (steps: PlaylistStep[], allow?: AllowFn): PlaylistStep[] => {
  const shown = steps.filter((s) => !isSandboxGame(s.game_id));
  return allow ? shown.filter((s) => allow(s.game_id)) : shown;
};


/**
 * 🔴 ЯДРО ЗАРЯДКИ = БЫСТРЫЙ СНИМОК (задача bed1249e, решение Дениса 22.08:
 * «оценка почти 15 минут, утомительно»). Пять доменов, выбранных по
 * «домен важен × метрика починена» (все пять починены 27.08, v1.243.0):
 *   corsi — пространственная РП · sdmt — скорость обработки · flanker —
 *   торможение · mental_rotation — преобразование · switching_task — гибкость.
 *
 * Человек не делает «оценку» — он делает утреннюю зарядку, а она же меряет.
 *
 * 🔴 УСЛОВИЕ, БЕЗ КОТОРОГО ВСЁ РАЗВАЛИТСЯ: ядро идёт в НЕИЗМЕННОЙ конфигурации —
 * тот же размер, то же число проб, тот же порядок, каждый день. Изменится
 * конфигурация → замеры несравнимы между днями → кривая прогресса = шум.
 * Конфиги совпадают с ASSESSMENT_PLAYLIST (после починки метрик игры пресета
 * стартуют в фиксированной постановке, не на личном уровне — isPreset-ветки).
 *
 * ⚠️ Числа est честные, по шагам батареи: сумма 380 с ≈ 6,3 мин, а не
 * маркетинговые «пять минут по 60 c на игру» из ТЗ. Резать пробы ради цифры 5
 * запрещает само ТЗ (часть 5: короткая проба даёт шум). Если по часам снимок
 * не влезет в желаемое — решение «что резать: пробы или домен» за Денисом.
 */
/**
 * З2 (29.08.2026, чек-лист зарядок): ядро-снимок идёт НЕ каждый день.
 * Ежедневный замер надоедает («каждое утро одни и те же 5 игр») и портит
 * сравнимость — тренируется сам тест. ПН — тренировочный день с ядром впереди
 * (свежая неделя, честная точка), ЧТ/ВС — замерные дни (peak/baseline), там
 * ядро обязательно по построению. Остальные утра — чистая тренировка дня:
 * сетка TRAINING_BY_WEEKDAY снова достижима.
 */
export const CORE_DAYS: ReadonlySet<Weekday> = new Set<Weekday>([1, 4, 0]);

export const SNAPSHOT_CORE: PlaylistStep[] = [
  { game_id: 'corsi',           game_route: '/games/corsi',           difficulty: 'medium', mode: 'forward', est_duration_sec: 60, is_fixed_baseline: true },
  { game_id: 'sdmt',            game_route: '/games/sdmt',            difficulty: 'medium', mode: '60s',     est_duration_sec: 70, is_fixed_baseline: true },
  { game_id: 'flanker',         game_route: '/games/flanker',         difficulty: 'medium', trials: 15,      est_duration_sec: 70, is_fixed_baseline: true },
  { game_id: 'mental_rotation', game_route: '/games/mental-rotation', difficulty: 'medium', trials: 5,       est_duration_sec: 90, is_fixed_baseline: true },
  { game_id: 'switching_task',  game_route: '/games/switching-task',  difficulty: 'medium', trials: 15,      est_duration_sec: 90, is_fixed_baseline: true },
];

/**
 * ⚠️ FIXED_BATTERY (шесть игр, 490 с, только ЧТ/ВС) ЗАМЕНЕНА ядром SNAPSHOT_CORE
 * 27.08.2026 (bed1249e): два канона замера рядом — это два несравнимых ряда, и
 * человек не понимал, какой из них «настоящий». Ряды старой батареи в истории
 * сравнимы сами с собой; новый ряд ядра начинается со дня замены. Теги
 * ЧТ/ВС (peak/baseline — до/после стека) живут как жили: меняется НАБОР, не смысл.
 */

// PER-WEEKDAY TRAINING playlists (5-min default), tuned per the agreed schedule.
//
// ⚠️ НАВЯЗАННЫХ ДНЕЙ ОТДЫХА НЕТ — зарядка идёт КАЖДЫЙ день (решение Дениса 03.08).
// До v1.182 среда была пустой: в самом первом коммите её отвели под Brain Workshop,
// внешнюю программу, которой пользуется Денис. Это личный график, а он утёк в общее
// расписание — и профиль НЗТ-48, у которого своего утреннего набора нет, получал
// по средам пустоту и подпись «Brain Workshop день» про незнакомую ему программу.
const TRAINING_BY_WEEKDAY: Record<Weekday, PlaylistStep[]> = {
  // ПН — мягкий вход после выходных
  1: [
    { game_id: 'choice_rt',    game_route: '/games/choice-rt',    difficulty: 'easy',   trials: 15, mode: '2dir', est_duration_sec: 50 },
    { game_id: 'picture_pairs',game_route: '/games/picture-pairs',difficulty: 'easy',   mode: '6 pairs',          est_duration_sec: 90 },
    { game_id: 'math_sprint',  game_route: '/games/math-sprint',  difficulty: 'easy',   mode: '30s',              est_duration_sec: 35 },
    { game_id: 'pattern',      game_route: '/games/pattern',      difficulty: 'easy',   trials: 5,                est_duration_sec: 90 },
  ],
  // ВТ — фокус + spatial training (Mental Rotation 1× из 3×/нед для слабого места)
  2: [
    { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'medium', mode: '5x5',  est_duration_sec: 60 },
    { game_id: 'flanker',        game_route: '/games/flanker',         difficulty: 'medium', trials: 20,    est_duration_sec: 90 },
    { game_id: 'mental_rotation',game_route: '/games/mental-rotation', difficulty: 'easy',   trials: 5,     est_duration_sec: 90 },
    { game_id: 'posner',         game_route: '/games/posner',          difficulty: 'medium', trials: 20,    est_duration_sec: 90 },
    { game_id: 'sdmt',           game_route: '/games/sdmt',            difficulty: 'medium', mode: '60s',   est_duration_sec: 70 },
    // Внимание к ДВИЖУЩЕМУСЯ — в дне его больше нет ни у кого. level 9 = две цели из
    // 6-9 объектов: уже не «следи за одним», но ещё без перегруза (INTEGRATION §7).
    // ⚠️ В вечерний и ночной набор НЕ ставить: раунд нельзя делать вполглаза, а
    // вечерний слот существует ровно для обратного.
    { game_id: 'object_tracker', game_route: '/games/object-tracker', difficulty: 'medium', settings: { level: 9 }, est_duration_sec: 60 },
  ],
  // СР — рабочая память. В неделе она иначе НЕ тренируется: n-back, corsi и
  // digit span стоят только в замерах ЧТ/ВС, то есть их меряют, но не качают.
  // Среда между ними — естественное место. Плюс анаграммы: вербальное во всей
  // неделе тоже было только по субботам.
  3: [
    { game_id: 'n_back',      game_route: '/games/n-back',      difficulty: 'easy', trials: 20, mode: '1-back', est_duration_sec: 90 },
    { game_id: 'corsi',       game_route: '/games/corsi',       difficulty: 'easy',                              est_duration_sec: 90 },
    { game_id: 'digit_span',  game_route: '/games/digit-span',  difficulty: 'easy', mode: 'forward',             est_duration_sec: 90 },
    { game_id: 'anagrams',    game_route: '/games/anagrams',    difficulty: 'easy',                              est_duration_sec: 90 },
    /**
     * Две игры лаборатории, 19.08.2026: слуховая рабочая память и метод мест. Обе
     * про память, обеим место в дне памяти, и обе в неделе не тренируются больше нигде.
     *
     * ⚠️ level У «Ритма» ПРИБИТ НАРОЧНО, хотя INTEGRATION §6 уровня не называет.
     * Без него шаг взял бы сохранённый уровень человека, а на верхних уровнях допуск
     * ритма сжимается до 34 мс (INTEGRATION §2а: замер показал зачёт 1 партии из 3 уже
     * на первом уровне). Прибитая третья ступень делает шаг предсказуемым, как у всех.
     *
     * 🔴 «Ритм и высота» НЕ идёт в EVENING_BY_WEEKDAY, NIGHT_STEPS и COOLDOWN_POOL:
     * там calm=1 → soundOn() === false, а звук здесь и есть содержание задания.
     * Шаг стал бы тупиком — партия не сыграна, сессия не записана, набор стоит.
     * «Дворец памяти» вечером не запрещён технически, но требует произвольного
     * усилия на «оживите ассоциации» — это против задачи вечернего набора.
     */
    { game_id: 'rhythm_pitch',  game_route: '/games/rhythm-pitch',  difficulty: 'easy', settings: { level: 3 }, est_duration_sec: 90 },
    { game_id: 'memory_palace', game_route: '/games/memory-palace', difficulty: 'easy', settings: { level: 3 }, est_duration_sec: 180 },
  ],
  // ЧТ — PEAK MEASUREMENT (after BOOST)
  4: SNAPSHOT_CORE,
  // ПТ — Inhibition Stack (D3) + Mental Rotation (2× из 3×/нед для слабого места)
  //   flanker    = spatial interference
  //   stroop     = lexical interference
  //   switching  = rule-based interference
  //   mental_rotation = spatial cooldown (medium difficulty — повышение от ВТ easy)
  5: [
    { game_id: 'flanker',         game_route: '/games/flanker',         difficulty: 'medium', trials: 20,                     est_duration_sec: 90 },
    { game_id: 'stroop',          game_route: '/games/stroop',          difficulty: 'medium', trials: 20, mode: 'classic',    est_duration_sec: 70 },
    { game_id: 'switching_task',  game_route: '/games/switching-task',  difficulty: 'medium', trials: 20,                     est_duration_sec: 120 },
    { game_id: 'mental_rotation', game_route: '/games/mental-rotation', difficulty: 'medium', trials: 5,                      est_duration_sec: 90 },
  ],
  // СБ — logic + verbal touch (Mental Rotation в 3-й раз/нед остаётся; Word Pairs добавлен
  // как 6-я игра — следствие коллегиного решения 2: умеренная вербалка раз в неделю
  // без выкидывания SET, который Денис любит за абстрактный attribute-mapping)
  6: [
    { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'hard',   mode: '6x6',           est_duration_sec: 90 },
    { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'medium', trials: 10,            est_duration_sec: 120 },
    { game_id: 'tower_london',   game_route: '/games/tower-london',    difficulty: 'medium', trials: 5,             est_duration_sec: 150 },
    { game_id: 'set_game',       game_route: '/games/set-game',        difficulty: 'medium', trials: 6,             est_duration_sec: 120 },
    { game_id: 'mental_rotation',game_route: '/games/mental-rotation', difficulty: 'medium', trials: 10,            est_duration_sec: 120 },
    { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy',   mode: '6 pairs',       est_duration_sec: 90 },
    // Эйлеров путь: шесть вершин, граф без подсказки старта — собирается за минуту-полторы.
    // ⚠️ Вечером не ставить: человек упирается в тупик и переигрывает, это активирующая
    // нагрузка. Та же логика, по которой у маджонга вечером прячут секундомер.
    { game_id: 'one_line',       game_route: '/games/one-line',        difficulty: 'medium', settings: { level: 6 }, est_duration_sec: 120 },
  ],
  // ВС — BASELINE MEASUREMENT (before BOOST)
  0: SNAPSHOT_CORE,
};

// ВЕЧЕРНЯЯ РОТАЦИЯ (перед сном) — 7 дней, РАЗНЫЕ каждый вечер (раньше был фикс из 4 игр).
// Только СПОКОЙНЫЕ игры (память + мягкая логика) — НЕ реакция/торможение перед сном.
// Намеренно втягивает ранее не использованные игры: corsi / story_recall / span /
// reading_span / memory_matrix / spatial_span / anagrams / number_bonds.
// По дизайну не пересекается с утром того же дня (утро = шульте/фланкер/струп/ротация/замеры).
const EVENING_BY_WEEKDAY: Record<Weekday, PlaylistStep[]> = {
  0: [ // ВС
    { game_id: 'corsi',        game_route: '/games/corsi',        difficulty: 'easy',   est_duration_sec: 90 },
    { game_id: 'story_recall', game_route: '/games/story-recall', difficulty: 'easy',   est_duration_sec: 150 },
    { game_id: 'sudoku',       game_route: '/games/sudoku',       difficulty: 'easy',   est_duration_sec: 120 },
  ],
  1: [ // ПН
    { game_id: 'mnemonics',    game_route: '/games/mnemonics',    difficulty: 'easy', mode: 'words', settings: { itemCount: 5 }, est_duration_sec: 70 },
    { game_id: 'digit_span',   game_route: '/games/digit-span',   difficulty: 'easy', mode: 'forward', est_duration_sec: 90 },
    { game_id: 'hanoi',        game_route: '/games/hanoi',        difficulty: 'medium', settings: { discs: 4 }, est_duration_sec: 120 },
  ],
  2: [ // ВТ
    { game_id: 'reading_span', game_route: '/games/reading-span', difficulty: 'easy',   est_duration_sec: 120 },
    { game_id: 'memory_matrix',game_route: '/games/memory-matrix',difficulty: 'easy', mode: '4x4', est_duration_sec: 100 },
    { game_id: 'set_game',     game_route: '/games/set-game',     difficulty: 'easy', trials: 5,    est_duration_sec: 110 },
  ],
  3: [ // СР
    { game_id: 'spatial_span', game_route: '/games/spatial-span', difficulty: 'easy',   est_duration_sec: 90 },
    { game_id: 'anagrams',     game_route: '/games/anagrams',     difficulty: 'easy',   est_duration_sec: 120 },
    { game_id: 'sudoku',       game_route: '/games/sudoku',       difficulty: 'easy',   est_duration_sec: 120 },
  ],
  4: [ // ЧТ
    { game_id: 'corsi',        game_route: '/games/corsi',        difficulty: 'easy',   est_duration_sec: 90 },
    { game_id: 'word_pairs',   game_route: '/games/word-pairs',   difficulty: 'easy', mode: '6 pairs', est_duration_sec: 90 },
    { game_id: 'hanoi',        game_route: '/games/hanoi',        difficulty: 'easy', settings: { discs: 3 }, est_duration_sec: 90 },
  ],
  5: [ // ПТ
    { game_id: 'number_bonds', game_route: '/games/number-bonds', difficulty: 'easy',   est_duration_sec: 90 },
    { game_id: 'picture_pairs',game_route: '/games/picture-pairs',difficulty: 'easy', settings: { pairsCount: 8 }, est_duration_sec: 120 },
    { game_id: 'sudoku',       game_route: '/games/sudoku',       difficulty: 'easy',   est_duration_sec: 120 },
  ],
  6: [ // СБ
    { game_id: 'mnemonics',    game_route: '/games/mnemonics',    difficulty: 'easy', mode: 'words', settings: { itemCount: 6 }, est_duration_sec: 75 },
    { game_id: 'reading_span', game_route: '/games/reading-span', difficulty: 'easy',   est_duration_sec: 120 },
    { game_id: 'spatial_span', game_route: '/games/spatial-span', difficulty: 'easy',   est_duration_sec: 90 },
  ],
};

// Вечерний комплекс с РОТАЦИЕЙ по дню + дедуп против утра того же дня (утро≠вечер).
// profileEvening (если профиль задал свой фикс-вечер) имеет приоритет над ротацией.
/**
 * ДНЕВНОЙ набор — перерыв в работе, а не тренировка «на максимум».
 *
 * Контекст: послеобеденный провал, человек оторвался от дел на пару минут.
 * Задача — сбить залипание и вернуть фокус, поэтому коротко и без разгона:
 * Шульте будит поиск, фланкер — избирательное внимание, гимнастика для глаз
 * закрывает буквальную причину усталости, если человек весь день в экране.
 *
 * Ротации по дням недели здесь НЕТ намеренно (решение 02.08): у утра и вечера
 * она оправдана ежедневностью, а перерыв берут нерегулярно — разнообразия никто
 * не заметит, зато плейлистов стало бы вдвое больше.
 */
const DAY_STEPS: PlaylistStep[] = [
  { game_id: 'schulte_table', game_route: '/games/schulte',  difficulty: 'easy', est_duration_sec: 60 },
  { game_id: 'flanker',       game_route: '/games/flanker',  difficulty: 'easy', settings: { trials: 20 }, est_duration_sec: 60 },
  { game_id: 'eye_gym',       game_route: '/games/eye-gym',  difficulty: 'easy', est_duration_sec: 60 },
];

/**
 * НОЧНОЙ набор — «Не спится». НЕ тренировка, согласовано с Денисом 02.08.
 *
 * Человек открывает это, потому что не может заснуть. Всё, что бодрит — счёт,
 * таймер, стрик, итоговый экран с очками — работает против задачи, поэтому
 * ночь исключена из тренировочной механики (`isTrainingSlot`). Состав один:
 * дыхание 4-7-8, где выдох вдвое длиннее вдоха.
 */
const NIGHT_STEPS: PlaylistStep[] = [
  // dim=1 → приглушённая палитра экрана: ночью яркий градиент бодрит.
  { game_id: 'breathing', game_route: '/games/breathing', difficulty: 'easy', settings: { tech: 'calm478', dim: 1 }, est_duration_sec: 120 },
];

/**
 * Дневной перерыв. Фиксированный, от дня недели не зависит.
 *
 * 🔴 `allow` ОБЯЗАТЕЛЕН ПО СМЫСЛУ, ХОТЬ И НЕОБЯЗАТЕЛЕН ПО ТИПУ. Утренний, вечерний
 * и фиксированный наборы фильтруют состав по профилю с самого начала, а дневной —
 * нет, и это была не мелочь: в наборе стоят `flanker` и `eye_gym`, которых в
 * профиле «Стандарт» (9 упражнений) НЕТ. То есть перерыв раздавал two из трёх
 * упражнений мимо профиля — молча и всем.
 *
 * Без `allow` берём весь состав: так зовут места, где профиля ещё нет (тесты,
 * предпросмотр каталога). В приложении зовущий обязан передать фильтр.
 */
export function buildDayPlaylist(weekday: Weekday, allow?: AllowFn): PlaylistMeta {
  const steps = keepAllowed(DAY_STEPS.map((s) => ({ ...s })), allow);
  return {
    duration_min: Math.max(1, Math.round(sumDuration(steps) / 60)),
    weekday, weekday_name: WEEKDAY_NAMES[weekday],
    track: 'training', track_label: 'перерыв',
    steps, est_total_sec: sumDuration(steps), slot: 'day',
  };
}

/**
 * «Не спится». Один шаг, вне тренировочной механики.
 *
 * ⚠️ ПО ПРОФИЛЮ НЕ ФИЛЬТРУЕТСЯ — И ЭТО РЕШЕНИЕ, А НЕ ЗАБЫВЧИВОСТЬ. Ночь выведена
 * из тренировочной механики нарочно (`isTrainingSlot`): человек открывает это не
 * ради прогресса, а потому что не может заснуть. Состав — одно дыхание 4-7-8.
 * Отфильтровать его по профилю значит показать в три часа ночи пустой экран
 * (в «Стандарте» `breathing` не разрешён) и превратить помощь со сном в повод
 * для покупки.
 *
 * Если решим гейтить и это — одна строка: `keepAllowed(..., allow)`, как в дне.
 */
export function buildNightPlaylist(weekday: Weekday): PlaylistMeta {
  const steps = NIGHT_STEPS.map((s) => ({ ...s }));
  return {
    duration_min: Math.max(1, Math.round(sumDuration(steps) / 60)),
    weekday, weekday_name: WEEKDAY_NAMES[weekday],
    track: 'rest', track_label: 'не спится',
    steps, est_total_sec: sumDuration(steps), slot: 'night',
  };
}

export function buildEveningWarmupPlaylist(opts: {
  weekday: Weekday;
  excludeGameIds?: string[];          // id игр утреннего комплекса сегодня — не повторять вечером
  profileEvening?: PlaylistStep[];    // профильный фикс-вечер (override)
  allow?: AllowFn;                    // игры профиля; без него — весь каталог
}): PlaylistMeta {
  const { weekday, excludeGameIds, profileEvening, allow } = opts;
  const fixed = !!(profileEvening && profileEvening.length);
  const base = fixed ? profileEvening! : EVENING_BY_WEEKDAY[weekday];
  // v1.157 (репорт Вали «почему всего одна игра перед сном?»): дедуп против утра
  // применяем ТОЛЬКО к авто-ротации. Если профиль задал вечер ЯВНО — это осознанный
  // выбор автора профиля (у «Микро-релакса» утро и вечер намеренно пересекаются:
  // отличия/парные картинки — залипательные казуалки для обоих слотов). Раньше дедуп
  // срезал их и от 3 игр оставалась 1, при этом карточка на главной (строится БЕЗ
  // excludeGameIds) обещала 3 — расхождение обещания и запуска.
  const ex = new Set(fixed ? [] : (excludeGameIds || []));
  let steps = keepAllowed(base.filter((s) => !ex.has(s.game_id)).map((s) => ({ ...s })), allow);

  /**
   * Пустой вечер — та же сломанная кнопка, что и пустое утро (см. комментарий в
   * buildMorningWarmupPlaylist). У «Стандарта» после отсева пустыми выходили три
   * вечера из семи. Добираем набором предыдущих дней; парные картинки и дыхание
   * доступны в любом профиле, поэтому что-то найдётся всегда.
   */
  if (steps.length === 0 && allow) {
    for (let i = 1; i <= 7 && steps.length === 0; i++) {
      const d = (((weekday - i) % 7) + 7) % 7 as Weekday;
      steps = keepAllowed(EVENING_BY_WEEKDAY[d].map((x) => ({ ...x })), allow);
    }
  }
  return {
    duration_min: Math.max(1, Math.round(sumDuration(steps) / 60)),
    weekday,
    weekday_name: WEEKDAY_NAMES[weekday],
    track: 'training',
    track_label: 'перед сном',
    steps,
    est_total_sec: sumDuration(steps),
    slot: 'evening',
  };
}

const TRACK_LABEL: Record<string, string> = {
  training:           'тренировка',
  'measure-peak':     'ЗАМЕР · PEAK (после стека)',
  'measure-baseline': 'ЗАМЕР · BASELINE (до стека)',
  rest:               'без нагрузки',
  'financial-battery':'FINANCIAL · vmPFC чекап',
  'assessment':       'ОЦЕНКА ПРОФИЛЯ · 12 доменов',
};

function getTrack(weekday: Weekday): PlaylistMeta['track'] {
  if (weekday === 4) return 'measure-peak';
  if (weekday === 0) return 'measure-baseline';
  // среда больше не выходной — см. комментарий к TRAINING_BY_WEEKDAY
  return 'training';
}

/**
 * Build a morning warmup playlist for the given duration and current weekday.
 *
 * - duration === 5  → first N steps fitting into ~5 min
 * - duration === 10 → up to ~10 min (full ЧТ/ВС battery exactly fits here)
 * - duration === 15 → all available steps + an extra "cool-down" round
 *
 * For ЧТ/ВС this returns the FIXED battery regardless of duration request
 * (you cannot half-measure a baseline — either you do it or you don't).
 */
export function buildMorningWarmupPlaylist(opts: {
  duration: 5 | 10 | 15;
  weekday: Weekday;
  history?: GameSession[];
  profilePlaylists?: Partial<Record<Weekday, PlaylistStep[]>>;  // E1: per-profile override
  allow?: AllowFn;                    // игры профиля; без него — весь каталог
}): PlaylistMeta {
  const { duration, weekday, profilePlaylists, allow } = opts;
  const track = getTrack(weekday);
  let steps: PlaylistStep[];

  if (track === 'rest') {
    steps = [];
  } else if ((track === 'measure-peak' || track === 'measure-baseline')
             && SNAPSHOT_CORE.every((s) => !allow || allow(s.game_id))) {
    // Замерный день = ядро-снимок (≈6 мин). Плюс хвост, если просили длиннее:
    // замер не должен ОТМЕНЯТЬ тренировку — раньше ЧТ/ВС съедали её целиком.
    steps = SNAPSHOT_CORE.map((s) => ({ ...s }));
    if (duration >= 10) {
      const tail = keepAllowed(trainingSetFor(weekday).map((x) => ({ ...x })), allow)
        .filter((a) => !SNAPSHOT_CORE.some((c) => c.game_id === a.game_id));
      steps.push(...pickSteps(tail, duration * 60 - sumDuration(steps)));
    }
  } else {
    /**
     * ⚠️ УРЕЗАННУЮ БАТАРЕЮ НЕ ЗАПУСКАЕМ — лучше обычная тренировка.
     * FIXED_BATTERY существует ради одного: «тот же набор всегда», чтобы замер
     * можно было сравнивать с собой годами. На «Стандарте» из шести её игр
     * доступны две. Прогнать две и записать это как замер — значит испортить
     * ряд сравнения молча: цифра есть, а сравнивать её не с чем. Поэтому в
     * такой день профиль получает тренировочный трек.
     */
    /**
     * 🔴 ЗАРЯДКА = ЯДРО + ХВОСТ (bed1249e). Каждый день впереди идёт ядро-снимок
     * в неизменной конфигурации — оно и есть быстрый замер; хвост — тренировка
     * дня, меняется как угодно. Кнопка «5 минут» отдаёт ядро целиком (≈6 мин):
     * половина снимка — не снимок, тот же довод, что у прежней батареи ЧТ/ВС.
     * Профилю без пяти игр ядра (урезанный каталог) ядро не ставим вовсе —
     * запись «замера» из трёх игр испортила бы ряд сравнения молча.
     */
    const coreOk = CORE_DAYS.has(weekday) && SNAPSHOT_CORE.every((c) => !allow || allow(c.game_id));
    const core = coreOk ? SNAPSHOT_CORE.map((c) => ({ ...c })) : [];
    // Хвост не повторяет игры ядра: вторник нёс flanker/sdmt/rotation — с ядром
    // человек играл бы их дважды за утро. Домен ядром уже тренирован.
    const rawSteps = (profilePlaylists && profilePlaylists[weekday]) || trainingSetFor(weekday);
    const allSteps = coreOk ? rawSteps.filter((a) => !SNAPSHOT_CORE.some((c) => c.game_id === a.game_id)) : rawSteps;
    const targetSec = duration * 60;
    if (duration === 5) {
      steps = coreOk ? core : pickSteps(allSteps, targetSec);
    } else if (duration === 10) {
      // Ядро + хвост по остатку. CPT-финал 10-минутки жил на свободных ~360 с;
      // с ядром их нет — финал остаётся привилегией 15-минутки.
      steps = [...core, ...pickSteps(allSteps, targetSec - sumDuration(core))];
      if (!coreOk) {
        const remaining = targetSec - sumDuration(steps);
        if (CPT_DAYS.has(weekday) && remaining >= CPT_STEP.est_duration_sec - 30) steps.push(CPT_STEP);
        else steps.push(...pickCooldown(weekday, remaining));
      }
    } else {
      // 15-min: ядро + вся тренировка дня + CPT-финал (день внимания/логики) + добор.
      steps = [...core, ...allSteps];
      const remainingFor = (st: PlaylistStep[]) => targetSec - sumDuration(st);
      if (CPT_DAYS.has(weekday) && remainingFor(steps) >= CPT_STEP.est_duration_sec - 30) {
        steps.push(CPT_STEP);
      }
      steps.push(...pickCooldown(weekday, remainingFor(steps)));
    }
  }

  // Отсев по профилю — ОДНОЙ строкой на выходе, а не в каждой ветке:
  // веток пять (отдых, батарея, 5/10/15 с добавками), и фильтр, размазанный
  // по ним, однажды забудут в новой.
  steps = keepAllowed(steps, allow);

  /**
   * 🔴 ПУСТАЯ ЗАРЯДКА ХУЖЕ ОТСУТСТВУЮЩЕЙ. Найдено гейтом 16.08.2026: у
   * «Стандарта» в пятницу после отсева не оставалось НИ ОДНОЙ игры — карточка
   * на главной есть, кнопка «Старт» есть, а нажатие вело сразу на экран
   * «готово». Для человека это сломанная кнопка, и никакой ошибки в логах.
   *
   * Поэтому пустоту добираем набором предыдущих дней. Хотя бы одна игра
   * найдётся всегда: парные картинки и дыхание доступны во всех профилях
   * (ALWAYS_ALLOWED в profiles.ts).
   */
  if (track !== 'rest' && steps.length === 0 && allow) {
    for (let i = 1; i <= 7 && steps.length === 0; i++) {
      const d = (((weekday - i) % 7) + 7) % 7 as Weekday;
      steps = keepAllowed(trainingSetFor(d).map((x) => ({ ...x })), allow);
    }
  }

  return {
    duration_min: duration,
    weekday,
    weekday_name: WEEKDAY_NAMES[weekday],
    track,
    track_label: TRACK_LABEL[track],
    steps,
    est_total_sec: sumDuration(steps),
    slot: 'morning',
  };
}

function sumDuration(steps: PlaylistStep[]): number {
  return steps.reduce((s, x) => s + x.est_duration_sec, 0);
}

function pickSteps(steps: PlaylistStep[], targetSec: number): PlaylistStep[] {
  // Greedy: take steps in order until target reached
  const out: PlaylistStep[] = [];
  let acc = 0;
  for (const s of steps) {
    if (acc >= targetSec * 0.85) break;
    out.push(s);
    acc += s.est_duration_sec;
  }
  return out.length > 0 ? out : steps.slice(0, 1); // at least 1 step
}

const COOLDOWN_POOL: PlaylistStep[] = [
  { game_id: 'picture_pairs', game_route: '/games/picture-pairs', difficulty: 'easy', mode: '6 pairs', est_duration_sec: 90 },
  { game_id: 'math_sprint',   game_route: '/games/math-sprint',   difficulty: 'easy', mode: '30s',     est_duration_sec: 35 },
  { game_id: 'memory_matrix', game_route: '/games/memory-matrix', difficulty: 'easy', mode: '4x4',     est_duration_sec: 100 },
  { game_id: 'find_differences', game_route: '/games/find-differences', difficulty: 'easy', mode: '4 diffs', est_duration_sec: 120 },
];

// CPT — sustained attention test. Берём только для длинных пресетов (10/15 мин)
// и только в дни внимания (ВТ) или logic-day (СБ). НЕ в peak/baseline (ЧТ/ВС)
// чтобы не ломать фиксированную замерную батарею.
//
// CPT 4-min ≈ 240 сек — это полноценная самостоятельная сессия, ставится в КОНЕЦ
// серии после "разогрева" — измеряет sustained attention уже в утомлённом состоянии,
// что и есть цель: "упадёт ли внимание на 4-м часу NZT".
const CPT_STEP: PlaylistStep = {
  game_id: 'cpt',
  game_route: '/games/cpt',
  difficulty: 'medium',
  mode: '4min',
  est_duration_sec: 240,
};
const CPT_DAYS: Set<Weekday> = new Set([2, 6]); // ВТ, СБ — attention/logic days, не measurement

function pickCooldown(weekday: Weekday, secAvailable: number): PlaylistStep[] {
  const used = new Set(TRAINING_BY_WEEKDAY[weekday].map((s) => s.game_id));
  const available = COOLDOWN_POOL.filter((s) => !used.has(s.game_id));
  const out: PlaylistStep[] = [];
  let acc = 0;
  for (const s of available) {
    if (acc + s.est_duration_sec > secAvailable + 30) break;
    out.push(s);
    acc += s.est_duration_sec;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// D1 — Financial Brain Day
// vmPFC measurement battery: Iowa Gambling + BART + PRL in one session.
// Recommended frequency: 1×/2 weeks (cooldown enforced in UI).
// Direct correlate of financial decision-making for Денис's business context.

const FINANCIAL_BATTERY_PLAYLIST: PlaylistStep[] = [
  { game_id: 'iowa', game_route: '/games/iowa', difficulty: 'medium', mode: '60t',          est_duration_sec: 600, is_fixed_baseline: true },
  { game_id: 'bart', game_route: '/games/bart', difficulty: 'medium', mode: '15 balloons',  est_duration_sec: 240, is_fixed_baseline: true },
  { game_id: 'prl',  game_route: '/games/prl',  difficulty: 'medium', mode: '60t-80%',      est_duration_sec: 600, is_fixed_baseline: true },
];

export function buildFinancialBatteryPlaylist(): PlaylistMeta {
  const wd = getCurrentWeekday();
  return {
    duration_min: Math.round(FINANCIAL_BATTERY_PLAYLIST.reduce((s, x) => s + x.est_duration_sec, 0) / 60),
    weekday: wd,
    weekday_name: WEEKDAY_NAMES[wd],
    track: 'financial-battery',
    track_label: TRACK_LABEL['financial-battery'],
    steps: FINANCIAL_BATTERY_PLAYLIST.map(s => ({ ...s })),
    est_total_sec: FINANCIAL_BATTERY_PLAYLIST.reduce((s, x) => s + x.est_duration_sec, 0),
  };
}

// G1 — Initial Skill Assessment battery (12 short tests, ~12 min)
export function buildAssessmentPlaylist(): PlaylistMeta {
  // Lazy import to avoid circular dependency
  const { ASSESSMENT_PLAYLIST } = require('@/src/services/assessment');
  const wd = getCurrentWeekday();
  return {
    duration_min: Math.round(ASSESSMENT_PLAYLIST.reduce((s: number, x: PlaylistStep) => s + x.est_duration_sec, 0) / 60),
    weekday: wd,
    weekday_name: WEEKDAY_NAMES[wd],
    track: 'assessment',
    track_label: TRACK_LABEL['assessment'],
    steps: ASSESSMENT_PLAYLIST.map((s: PlaylistStep) => ({ ...s })),
    est_total_sec: ASSESSMENT_PLAYLIST.reduce((s: number, x: PlaylistStep) => s + x.est_duration_sec, 0),
  };
}

// Cooldown logic: показывать кнопку «можно сейчас» только если прошло 14+ дней
// со последней FINANCIAL сессии. Иначе — показываем сколько ещё ждать.
export const FINANCIAL_COOLDOWN_DAYS = 14;

export async function getFinancialCooldown(): Promise<{ ready: boolean; daysLeft: number; lastDate: string | null }> {
  const history = await loadWarmupHistory();
  const fin = history.filter(h => h.track === 'financial-battery' && h.completed);
  if (fin.length === 0) return { ready: true, daysLeft: 0, lastDate: null };
  const last = fin[fin.length - 1];
  const lastTime = new Date(last.date).getTime();
  const now = Date.now();
  const daysSince = Math.floor((now - lastTime) / (24 * 60 * 60 * 1000));
  const daysLeft = Math.max(0, FINANCIAL_COOLDOWN_DAYS - daysSince);
  return { ready: daysLeft <= 0, daysLeft, lastDate: last.date };
}

// ────────────────────────────────────────────────────────────────────────────
// Streak + analytics utils

const WARMUP_HISTORY_KEY = 'psygames_warmup_history';

export interface WarmupHistoryEntry {
  date: string;            // YYYY-MM-DD
  weekday: Weekday;
  duration_min: number;
  track: PlaylistMeta['track'];
  total_score: number;
  completed: boolean;      // finished all steps vs aborted
  steps_done: number;
  steps_total: number;
  /**
   * З3: сумма очков по шагам ядра-снимка (is_fixed_baseline), когда ядро сыграно
   * ЦЕЛИКОМ и по порядку. Вердикт «Мозг сегодня» сравнивает ЭТО поле, а не
   * total_score: составы зарядок разные (5 и 10 минут, с ядром и без), и
   * сравнение полных сумм означало бы «мозг просел» при «зарядка была короче».
   * Отсутствует у старых записей и у зарядок без ядра.
   */
  core_score?: number;
}

/**
 * Чтение истории с РАЗЛИЧЕНИЕМ «пусто» и «не смогли прочитать».
 *
 * ⚠️ ЗАЧЕМ РАЗЛИЧАТЬ. Раньше любая ошибка — сбой хранилища, битый JSON — молча давала
 * пустой список, а следующая запись сохраняла его же плюс одну запись. Вся история
 * зарядок стиралась без единого сообщения, и вместе с ней исчезали все отметки в
 * календаре серии. Репорт Вали 12.08: «Куда деваются огонечки, было много — все исчезли».
 *
 * Теперь неудачное чтение возвращает null, и запись в этом случае НЕ ТРОГАЕТ хранилище:
 * лучше потерять одну сегодняшнюю отметку, чем всю историю за месяцы.
 */
/**
 * Решение «писать или не писать», отделённое от хранилища.
 *
 * Вынесено отдельно, потому что проверить его через настоящее хранилище не выходит:
 * warmup.ts берёт AsyncStorage динамическим импортом внутри функции, и подмены в тесте
 * до этого экземпляра не достают — тест на вызовы оказывался зелёным просто потому,
 * что записи не было НИ В ОДНОМ случае. Такую проверку легко принять за настоящую.
 * Здесь же правило видно целиком и проверяется без подделок.
 *
 * @param current  прочитанная история; null — прочитать НЕ УДАЛОСЬ
 * @returns        что писать, либо null — не трогать хранилище
 */
export function mergeHistory(
  current: WarmupHistoryEntry[] | null,
  entry: WarmupHistoryEntry,
): WarmupHistoryEntry[] | null {
  if (current === null) return null;   // читать не смогли → писать нельзя, затрём всё
  return [...current, entry];
}

async function readHistoryRaw(): Promise<WarmupHistoryEntry[] | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(WARMUP_HISTORY_KEY);
    if (raw == null) return [];                 // ключа нет — человек новый, это честное «пусто»
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;   // не массив — считаем сбоем, не пустотой
  } catch { return null; }
}

export async function loadWarmupHistory(): Promise<WarmupHistoryEntry[]> {
  return (await readHistoryRaw()) ?? [];
}

export async function saveWarmupHistory(entry: WarmupHistoryEntry): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const next = mergeHistory(await readHistoryRaw(), entry);
    if (next === null) {
      // Прочитать не удалось. Записать сейчас — значит затереть всё, что было.
      console.warn('warmup history unreadable — skipping write to avoid wiping it');
      return;
    }
    await AsyncStorage.setItem(WARMUP_HISTORY_KEY, JSON.stringify(next));
  } catch (e) { console.warn('Failed to save warmup history', e); }
}

/**
 * РАЗОВОЕ ВОССТАНОВЛЕНИЕ ОТМЕТОК КАЛЕНДАРЯ ИЗ СОБСТВЕННЫХ СЕССИЙ.
 *
 * ЗАЧЕМ. История зарядок стиралась целиком при неудачном чтении (см. readHistoryRaw):
 * пустой список молча сохранялся поверх накопленного. Репорт Вали 12.08: «Куда деваются
 * огонечки, было много — все исчезли». Отметки — это месяцы её работы, и просто починить
 * запись мало: потерянное надо вернуть.
 *
 * ОТКУДА БЕРЁМ ПРАВДУ. Из сессий на самом устройстве: каждая партия внутри зарядки несёт
 * warmup_id. День, в который есть хоть одна такая сессия, — это день, когда человек
 * тренировался. Ничего не выдумываем: только то, что он сам сыграл.
 *
 * ⚠️ ПОЧЕМУ ЗАСЧИТЫВАЕМ И НЕПОЛНЫЕ ДНИ. Строгое «зарядка пройдена до конца» отняло бы у
 * Вали половину дней — а обрывались они из-за НАШЕЙ ошибки: игра запускала следующий
 * уровень, зарядка уводила экран, и набор ломался на первой же игре (см. useGameMode).
 * Наказывать человека за наш баг нельзя.
 *
 * Отметка ставится только там, где записи за этот день нет — существующие не трогаем.
 * Идёт один раз, флаг ниже.
 */
const HISTORY_REPAIR_FLAG = 'psygames_warmup_history_repaired_v1';

export function daysFromSessions(
  sessions: { timestamp?: string; warmup_id?: string }[],
): string[] {
  const days = new Set<string>();
  for (const s of sessions) {
    if (!s.warmup_id || !s.timestamp) continue;
    const d = new Date(s.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    days.add(localDateKey(d));
  }
  return [...days].sort();
}

export async function repairWarmupHistoryOnce(
  getSessions: () => Promise<{ timestamp?: string; warmup_id?: string }[]>,
): Promise<number> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    if (await AsyncStorage.getItem(HISTORY_REPAIR_FLAG)) return 0;

    const current = await readHistoryRaw();
    if (current === null) return 0;   // не прочитали — чинить вслепую нельзя

    const have = new Set(current.map((e) => e.date));
    const restored: WarmupHistoryEntry[] = [];
    for (const day of daysFromSessions(await getSessions())) {
      if (have.has(day)) continue;
      restored.push({
        date: day,
        weekday: new Date(day + 'T12:00:00Z').getUTCDay() as WarmupHistoryEntry['weekday'],
        duration_min: 5,
        track: 'training',
        total_score: 0,
        completed: true,
        steps_done: 0,
        steps_total: 0,
      } as WarmupHistoryEntry);
    }

    if (restored.length) {
      await AsyncStorage.setItem(WARMUP_HISTORY_KEY, JSON.stringify([...current, ...restored]));
    }
    await AsyncStorage.setItem(HISTORY_REPAIR_FLAG, '1');
    return restored.length;
  } catch { return 0; }
}

/**
 * Уникальные завершённые дни тренировки в хронологическом порядке.
 *
 * История могла накопить повторные записи за один день или старые битые даты,
 * поэтому календарь и рекорд серии получают один нормализованный источник.
 */
export function completedWarmupDateKeys(history: WarmupHistoryEntry[]): string[] {
  const valid = new Set<string>();
  for (const entry of history) {
    if (!entry.completed) continue;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry.date);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) continue;
    valid.add(entry.date);
  }
  return [...valid].sort();
}

/**
 * Самая длинная серия за всю историю. Использует ту же политику, что
 * computeStreak(): один изолированный пропуск не рвёт серию, два подряд — рвут.
 * Пропущенный день не прибавляется к длине: считаются только тренировки.
 */
export function computeLongestStreak(history: WarmupHistoryEntry[]): number {
  const dates = completedWarmupDateKeys(history);
  let best = 0;
  let current = 0;
  let previousOrdinal: number | null = null;

  for (const key of dates) {
    const [year, month, day] = key.split('-').map(Number);
    const ordinal = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
    const gap = previousOrdinal === null ? 0 : ordinal - previousOrdinal;
    current = previousOrdinal === null || gap <= 2 ? current + 1 : 1;
    best = Math.max(best, current);
    previousOrdinal = ordinal;
  }

  return best;
}

// Streak with 1-day grace: ОДИН пропуск подряд не ломает streak.
// (Жизнь случается; одна суббота в командировке не должна обнулять 30 дней.)
// Два пропуска подряд = streak обрывается.
export function computeStreak(history: WarmupHistoryEntry[]): number {
  if (history.length === 0) return 0;
  const dates = new Set(history.filter((h) => h.completed).map((h) => h.date));
  let streak = 0;
  let graceUsed = false;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    if (dates.has(key)) {
      streak++;
      // Reset grace when day is hit — grace only saves a single isolated miss
      if (i > 0) graceUsed = false;
    } else if (i === 0) {
      // today not yet done — don't penalize
      continue;
    } else if (!graceUsed) {
      // 1-day grace
      graceUsed = true;
    } else {
      // 2nd miss in a row — streak ends
      break;
    }
  }
  return streak;
}

export function getCurrentWeekday(): Weekday {
  return new Date().getDay() as Weekday;
}

// ЛОКАЛЬНАЯ дата (НЕ UTC). toISOString() возвращает UTC → у UTC+5 (Екб) ночные сессии
// «уезжали» в соседний день и ломали стрик и счёт «сегодня» («вечер не считает»).
// Один форматтер для todayDateKey И computeStreak — иначе ключи рассинхронятся (баг стрика).
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
export function todayDateKey(): string {
  return localDateKey(new Date());
}

/**
 * "Brain today" verdict — compares last warmup score vs the median of last 10.
 * Returns null if not enough history.
 */
export function brainTodayVerdict(history: WarmupHistoryEntry[], lang: string = 'ru'): {
  delta_pct: number;
  message: string;
} | null {
  /**
   * З3 (29.08.2026): сравниваем ТОЛЬКО ядро с ядром. total_score зарядок
   * несравним по построению — состав и длительность плавают (5/10/15 минут,
   * тренировка дня без ядра). Вердикт молчит, пока не накопится база из
   * ядровых записей, — честнее, чем дельта, означающая «сегодня было короче».
   */
  const cored = history.filter((h) => h.completed && (h.core_score ?? 0) > 0);
  if (cored.length < 4) return null;            // сегодняшняя + ≥3 базы
  const last = cored[cored.length - 1];
  if (last.date !== todayDateKey()) return null; // сегодня ядра не было — сравнивать нечего
  const prev = cored.slice(-11, -1);
  if (prev.length < 3) return null;
  const sorted = [...prev.map((h) => h.core_score!)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median === 0) return null;
  const delta = ((last.core_score! - median) / median) * 100;
  // Тексты вердикта — в словаре LanguageContext (brainDelta*, все 12 языков, {d} = ±NN).
  // Сервис вне React-дерева → translateFor(lang, key).
  const d = `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}`;
  const key = delta > 10 ? 'brainDeltaUp' : delta < -10 ? 'brainDeltaDown' : 'brainDeltaNorm';
  return { delta_pct: delta, message: translateFor(lang, key).replace('{d}', d) };
}

/** Пауза, за которую повторный вызов перехода считается дублем (напр. двойной сейв сессии). */
export const ADVANCE_DEBOUNCE_MS = 800;

/**
 * Делать ли переход к следующему шагу зарядки.
 *
 * Вынесено из WarmupContext ради теста: авто-переход планируется на 2000–3500 мс,
 * и если человек за это время сам жмёт «Далее», переход случается дважды —
 * руками и по таймеру, — а шаг между ними проглатывается. У Вали так вечерняя
 * зарядка схлопывалась в «одна игра и сразу дыхание».
 *
 * @param fromIdx номер шага, для которого переход был запланирован (undefined = ручной)
 */
export function shouldAdvance(o: {
  fromIdx?: number; currentIdx: number; now: number; lastAdvanceAt: number;
}): boolean {
  if (o.fromIdx !== undefined && o.fromIdx !== o.currentIdx) return false;   // шаг уже сменили
  if (o.now - o.lastAdvanceAt < ADVANCE_DEBOUNCE_MS) return false;           // дубль
  return true;
}
