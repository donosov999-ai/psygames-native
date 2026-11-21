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

import { GAMES, isSandboxGame, sessionGameType, sessionTypeOf } from '@/src/constants/games';
import { GameSession } from '@/src/services/api';
import { translateFor } from '@/src/contexts/LanguageContext';
import { estimateStepSec } from '@/src/services/gameDuration';
import { cachedLevelValue } from '@/src/services/levelCache';
import { заводскиеЗарядки } from '@/src/services/warmupData';
import { resolveQuietSteps } from '@/src/services/warmupPolicy';
import type { ProfileDef } from '@/src/constants/profiles';

export const quietWarmups = заводскиеЗарядки.политика.тихо;

export type Difficulty = 'easy' | 'medium' | 'hard';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ...

export interface PlaylistStep {
  game_id: string;        // matches GAMES[].id
  game_route: string;     // /games/<slug>
  /** Только где трудность — настройка, а не лестница; у уровневых игр уровень личный (решение 09.09.2026). */
  difficulty?: Difficulty;
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
  /**
   * ЧТО ЗАПУЩЕНО: зарядка времени суток или готовый набор (своя серия, серия развилки, тема
   * хаба). Ставит `WarmupContext` при запуске, а не сборщик набора.
   *
   * 📍 Зачем, замер 17.09.2026: свои серии собираются со `slot: 'morning'`, темы хабов — со
   * `slot: 'day'` (слот им нужен для темпа моста и тишины вечера). Итог по слоту подписывал
   * «Рабочая память · 5 мин» как «Утренняя», а «Ещё раз» запускал вместо серии утреннюю
   * зарядку. Слот отвечает на вопрос «когда», а не «что» — поэтому отдельное поле.
   */
  вид?: 'слот' | 'набор';
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
/**
 * 🔴 С КАКОГО УРОВНЯ ЗАРЯДКА ЗАПУСКАЕТ УПРАЖНЕНИЕ.
 *
 * Просьба Дениса 13.09.2026: «убрать развилку в зарядках и сериях — использовать
 * прогресс по уровням: с первого, или с освоенного, или максимум минус пять, или
 * минус двадцать процентов. Это тоже надо задавать».
 *
 * Развилка правда была: шаг либо не говорил про уровень вовсе — и игра брала
 * личный (решение 09.09.2026), — либо прибивал число намертво. Середины не было,
 * и «дай зарядку чуть полегче освоенного» выразить было нечем.
 *
 * ⚠️ ПРАВИЛО НЕ ПЕРЕБИВАЕТ ПРИБИТЫЙ УРОВЕНЬ. У «Ритма» и «Дворца памяти» уровень
 * задан в шаге НАРОЧНО (на верхних уровнях допуск слишком узкий — см. комментарий
 * у шага). Правило вступает только там, где шаг про уровень промолчал.
 *
 * ⚠️ НЕ ЗНАЕМ ОСВОЕННЫЙ — НЕ ТРОГАЕМ. Кэш уровней может быть холодным (первые
 * кадры после запуска). Подставить в этот миг единицу значило бы дать человеку с
 * сороковым уровнем первый — ровно тот дефект, ради которого заводили тёплый кэш.
 */
export type ПравилоУровня =
  | { как: 'первый' }
  | { как: 'освоенный' }
  | { как: 'минус'; сколько: number }
  | { как: 'процент'; сколько: number };

let правилоУровня: ПравилоУровня | null = null;
let профильДляУровня = 'default';

export function установитьПравилоУровня(правило: ПравилоУровня | null, профиль: string): void {
  правилоУровня = правило;
  профильДляУровня = профиль;
}

/** Чистый расчёт — его и проверяет проба, без хранилища и кэша. */
export function уровеньПоПравилу(правило: ПравилоУровня, освоенный: number): number {
  switch (правило.как) {
    case 'первый': return 1;
    case 'освоенный': return освоенный;
    case 'минус': return Math.max(1, освоенный - Math.max(0, Math.floor(правило.сколько)));
    case 'процент': return Math.max(1, Math.round(освоенный * (1 - Math.min(100, Math.max(0, правило.сколько)) / 100)));
  }
}

function уровеньШага(gameId: string): number | null {
  if (!правилоУровня) return null;
  const сырое = cachedLevelValue(`psygames_${gameId}_level_${профильДляУровня}`);
  const освоенный = Number(сырое);
  if (!Number.isFinite(освоенный) || освоенный < 1) return null;
  return уровеньПоПравилу(правилоУровня, Math.floor(освоенный));
}

/**
 * 🔴 ПРАВИЛО УРОВНЯ НЕ КАСАЕТСЯ ЗАМЕРОВ.
 *
 * Денис 13.09.2026 раскидал правило «освоенный минус 20 %» по всем профилям — и
 * это законная настройка разминки: заходить чуть ниже потолка, чтобы зарядка
 * была зарядкой, а не попыткой максимума.
 *
 * Но ровно то же правило, применённое к ЗАМЕРУ, тихо рвёт ряд сравнения: вчера
 * ядро-снимок шло на двадцатом уровне, сегодня на шестнадцатом, и кривая
 * прогресса показывает падение, которого не было. В шапке `warmupEntries`
 * записано прямо: «состав фиксирован жёстко… иначе замеры разных дней
 * несравнимы» — уровень такая же часть состава, как список игр.
 *
 * Поэтому правило пропускается там, где идёт замер: у шагов с пометкой
 * `is_fixed_baseline` (ядро-снимок ЧТ/ВС) и в мерных дорожках целиком.
 */
const МЕРНЫЕ: ReadonlySet<string> = new Set(['assessment', 'financial-battery', 'measure-peak', 'measure-baseline']);

export function stepToParams(step: PlaylistStep, slot?: WarmupSlot, track?: PlaylistMeta['track']): Record<string, string> {
  const p: Record<string, string> = quietWarmups ? { wu: '1', quiet: '1' } : { wu: '1' };
  const quietSettings = quietWarmups
    ? resolveQuietSteps([step], заводскиеЗарядки.политика, профильДляУровня)
        .find(s => s.game_id === step.game_id)?.settings ?? step.settings
    : step.settings;
  // Training progresses through FULL rounds on its own persistent ladder. A fixed
  // baseline, assessment, night/rest session or deliberately fixed level stays a preset.
  // Do not carry abbreviated trials/size/startLen into a round that earns a level.
  if (track === 'training' && slot !== 'night' && !step.is_fixed_baseline && step.settings?.level === undefined) {
    p.progress = '1';
    p.auto = '1';
    if (step.mode) p.mode = step.mode;
    if (slot === 'evening') p.calm = '1';
    // Presentation options are not shortcuts to completion.
    for (const key of ['delivery', 'modality', 'language', 'targetLang', 'from', 'to']) {
      if (quietSettings?.[key] !== undefined) p[key] = String(quietSettings[key]);
    }
    return p;
  }
  if (step.difficulty) p.diff = step.difficulty;   // у уровневых игр шаг трудность не задаёт — уровень личный
  // Вечер И НОЧЬ: в полночь торопить человека тем более незачем.
  if (slot === 'evening' || slot === 'night') p.calm = '1';
  if (step.trials != null) p.trials = String(step.trials);
  if (step.mode) p.mode = step.mode;
  if (quietSettings) {
    for (const k of Object.keys(quietSettings)) {
      if (k !== 'quiet' && k !== 'wu') p[k] = String(quietSettings[k]);
    }
  }
  /* Уровень по правилу — последним и только если шаг про него молчал. */
  const замер = step.is_fixed_baseline === true || (track !== undefined && МЕРНЫЕ.has(track));
  if (p.level === undefined && !замер) {
    const уровень = уровеньШага(step.game_id);
    if (уровень !== null) p.level = String(уровень);
  }
  return p;
}

/**
 * Строит PlaylistMeta из фиксированного набора шагов (для per-profile утро/вечер,
 * где порядок задан в profiles.ts, а не вычисляется по дню недели).
 */
/**
 * 🔴 НАБОР, НАЗНАЧЕННЫЙ ФАЙЛОМ, НЕ РЕЖЕТСЯ СОСТАВОМ ПРОФИЛЯ.
 *
 * Вопрос Дениса 13.09.2026: «можно отвязать? чтобы в зарядке показывалось, а профиль
 * не перегружать». Да — и это следует из уже записанного здесь правила: срезов ДВА,
 * «профиль — по желанию зовущего, песочница — безусловно». Профильный срез нужен,
 * когда набор СОБИРАЕТСЯ автоматически: там игра попадает в зарядку случайно, и
 * человек мог её не открывать. Набор из файла собран не случайно — его назначил
 * владелец, и резать его составом каталога значит спорить с его же решением.
 *
 * ⚠️ ПЕСОЧНИЦА РЕЖЕТСЯ ВСЕГДА, И ЭТО НЕ ОБСУЖДАЕТСЯ. Сырые игры попадали в зарядку
 * мимо каталога и раньше — «человек получал сырое, вообще не заходя в каталог, и
 * никакой профиль его от этого не спасал». Файл такого права не даёт.
 */
let наборыНазначеныФайлом = false;

export function установитьЯвноеНазначение(да: boolean): void {
  наборыНазначеныФайлом = да;
}

export function buildFixedPlaylist(
  steps: PlaylistStep[],
  slot: 'morning' | 'evening',
  weekday: Weekday,
  allow?: AllowFn,
): PlaylistMeta {
  steps = keepAllowed(steps, наборыНазначеныФайлом ? undefined : allow);
  const total = steps.reduce((s, x) => s + estimateStepSec(x), 0);
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

/**
 * 🔴 СВОЯ СЕРИЯ («ПОТОК») — ЗАПУСКАЕМЫЙ НАБОР ИЗ ФАЙЛА.
 *
 * Денис 13.09.2026, два сообщения подряд: «не вижу, как новую серию создать
 * можно?» и «режим поток — это же серия вроде». Да, это одно и то же, и раньше
 * оно никуда не приезжало: файл свои наборы РАЗБИРАЛ и назначал профилю, а в
 * приложении их не показывал никто — замер по исходникам 13.09.2026 дал ноль
 * мест, где поле `наборы` читается экраном. То есть механизм был, а до человека
 * не доехал.
 *
 * Здесь набор превращается в обычный плейлист: та же механика шагов, что у
 * зарядки, своё имя в подписи.
 *
 * ⚠️ ЭТО НЕ ЗАМЕР. Заводские серии («Оценка профиля», FIN BRAIN) сравнимы между
 * днями именно потому, что их состав прибит. Своя серия правится файлом в любой
 * момент — сравнивать её прогоны между собой можно ровно до следующей правки.
 */
export function buildСвояСерия(название: string, шаги: PlaylistStep[], weekday: Weekday): PlaylistMeta {
  const steps = keepAllowed(шаги.map((s) => ({ ...s })), undefined);
  const total = steps.reduce((s, x) => s + estimateStepSec(x), 0);
  return {
    duration_min: Math.max(1, Math.round(total / 60)),
    weekday, weekday_name: WEEKDAY_NAMES[weekday],
    track: 'training', track_label: название,
    steps, est_total_sec: total, slot: 'morning',
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
    if (set && !заводскиеЗарядки.запас.дни_ядра.includes(d)) return set;
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
const keepAllowed = (steps: PlaylistStep[], allow?: AllowFn, profileId = профильДляУровня): PlaylistStep[] =>
  resolveQuietSteps(steps, заводскиеЗарядки.политика, profileId, id => !isSandboxGame(id) && (!allow || allow(id)));

/** Covers externally built series and saved repeats as well as normal slot builders. */
export function prepareWarmup(meta: PlaylistMeta, profileId?: string): PlaylistMeta {
  const steps = resolveQuietSteps(meta.steps, заводскиеЗарядки.политика, profileId);
  const changed = steps.length !== meta.steps.length || steps.some((s, i) => s.game_id !== meta.steps[i]?.game_id);
  if (!changed) return { ...meta, steps };
  const est_total_sec = sumDuration(steps);
  return { ...meta, steps, est_total_sec, duration_min: Math.max(1, Math.round(est_total_sec / 60)) };
}


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

export const SNAPSHOT_CORE: PlaylistStep[] = заводскиеЗарядки.запас.ядро;

/**
 * 🔴 ЗАМЕР — ТОЛЬКО У НАБОРА, ГДЕ ЯДРО-СНИМОК ЕСТЬ ЦЕЛИКОМ И В ТОЙ ЖЕ НАСТРОЙКЕ.
 *
 * Решение Дениса 17.09.2026: «замер только у набора с полным составом замера, остальное —
 * тренировка». Готовое утро четверга и воскресенья из файла состава шло дорожкой
 * `measure-peak` / `measure-baseline` по одному дню недели: партии ложились в ряд замеров
 * под метками `peak` / `baseline`, а правило уровня молчало (`stepToParams`, МЕРНЫЕ).
 * 📍 Замер 17.09.2026 по defaultPlaylists.json: 13 профилей × 2 дня × 3 длины — ни в одном
 * наборе нет пяти игр ядра; больше всего 4 из 5 по игре и 2 из 5 по настройке.
 *
 * Игра засчитывается только с той же настройкой — трудность, режим, число проб, прочие
 * параметры: corsi на другой трудности — уже другой замер, и ряд сравнения рвётся так же,
 * как без игры вовсе.
 */
export function естьЯдроСнимок(steps: readonly PlaylistStep[]): boolean {
  const настройка = (s: PlaylistStep): string => JSON.stringify([
    s.difficulty ?? null, s.mode ?? null, s.trials ?? null,
    Object.entries(s.settings ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  return SNAPSHOT_CORE.every((ядро) =>
    steps.some((s) => s.game_id === ядро.game_id && настройка(s) === настройка(ядро)));
}

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
const TRAINING_BY_WEEKDAY: Record<Weekday, PlaylistStep[]> = заводскиеЗарядки.запас.утро_по_дням;

// ВЕЧЕРНЯЯ РОТАЦИЯ (перед сном) — 7 дней, РАЗНЫЕ каждый вечер (раньше был фикс из 4 игр).
// Только СПОКОЙНЫЕ игры (память + мягкая логика) — НЕ реакция/торможение перед сном.
// Намеренно втягивает ранее не использованные игры: corsi / story_recall / span /
// reading_span / memory_matrix / spatial_span / anagrams / number_bonds.
// По дизайну не пересекается с утром того же дня (утро = шульте/фланкер/струп/ротация/замеры).
const EVENING_BY_WEEKDAY: Record<Weekday, PlaylistStep[]> = заводскиеЗарядки.запас.вечер_по_дням;

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
const DAY_STEPS: PlaylistStep[] = заводскиеЗарядки.запас.день;

/**
 * НОЧНОЙ набор — «Не спится». НЕ тренировка, согласовано с Денисом 02.08.
 *
 * Человек открывает это, потому что не может заснуть. Всё, что бодрит — счёт,
 * таймер, стрик, итоговый экран с очками — работает против задачи, поэтому
 * ночь исключена из тренировочной механики (`isTrainingSlot`). Состав один:
 * дыхание 4-7-8, где выдох вдвое длиннее вдоха.
 */
const NIGHT_STEPS: PlaylistStep[] = заводскиеЗарядки.запас.ночь;

/**
 * 🔴 НОЧЬ — ТРИ РАСКЛАДКИ, И В НИХ НЕТ СКОРОСТИ.
 *
 * Решение Дениса 13.09.2026: «ночь отбирай простые, типа трубы, которые не
 * требуют скорости; моё решение — 5 минут». До этого ночь была одним дыханием на
 * две минуты, и я защищал это тем, что ночь намеренно НЕ тренировка.
 *
 * Довод остаётся верным — и именно он задаёт отбор. Сюда берутся только те
 * упражнения, где НЕТ ни секундомера, ни серии на скорость, ни проигрыша по
 * времени: «Трубы» и «Клубок» Тэтхэма, судоку, ханойская башня, маджонг, пары.
 * Всё, что меряет реакцию (фланкер, Шульте, счёт на время), ночью запрещено —
 * это и есть та часть прежнего решения, которая не отменяется.
 *
 * ⚠️ ДЫХАНИЕ — ПОСЛЕДНИМ ШАГОМ. Правило «восстановительное в конец» (Денис,
 * 13.09.2026) здесь работает буквально: человек заканчивает выдохом и ложится.
 * У дневного перерыва исключение обратное — там дыхание первым, потому что оно и
 * есть повод открыть приложение.
 *
 * ⚠️ ПО ПРОФИЛЮ НЕ ФИЛЬТРУЕТСЯ — см. разбор у `buildNightPlaylist`. «Трубы» и
 * судоку открыты всем и так, «Пауза» открыта всем с 13.09.2026 (просьба Дениса
 * «открой всем»), остальное приходит из его же решения не перегружать каталог.
 */
const NIGHT_BY_DURATION: Record<Длительность, PlaylistStep[]> = заводскиеЗарядки.запас.ночь_по_длине;

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
/**
 * 🔴 ДЕНЬ И НОЧЬ ТОЖЕ РЕДАКТИРУЮТСЯ — СЛОТОВ ЧЕТЫРЕ, А НЕ ДВА.
 *
 * Заметил Денис 13.09.2026, глядя на редактор: «а где день и вечер? утро и ночь —
 * там же 4 шт». Он прав: `WarmupSlot` знает morning · day · evening · night, но в
 * профиле полей было только два — утро и вечер. День и ночь собирались из общих
 * `DAY_STEPS`/`NIGHT_STEPS`, одинаковых для всех профилей, и задать их было нечем.
 *
 * Теперь профиль может назвать и их. Не назвал — работают общие, как раньше.
 */
let наборДня: PlaylistStep[] | null = null;
let наборНочи: PlaylistStep[] | null = null;

export function установитьНаборыДняИНочи(день: PlaylistStep[] | null, ночь: PlaylistStep[] | null): void {
  наборДня = день;
  наборНочи = ночь;
}

/** Длина зарядки. Выбор человека, а не свойство набора. */
export type Длительность = 5 | 10 | 15;

/**
 * 🔴 ТРИ РАСКЛАДКИ, А НЕ ОДНА УРЕЗАННАЯ.
 *
 * Правка Дениса 13.09.2026: «ты сделал урезку, а должно быть три раскладки — 5
 * минут, 10 минут и 15 минут». Он прав, и вот чем это отличается от прежнего.
 *
 * Раньше на слот был ОДИН список, а кнопки 5/10/15 резали его `pickSteps` под
 * бюджет. У такого отбора нет права выбирать: он идёт подряд и обрывается, где
 * кончился бюджет, — значит «пять минут» получались обрубком пятнадцати, а не
 * самостоятельным набором. Для утра на десяти минутах это давало 0,60 обещанного
 * (замер 08.09.2026), и это не баг отбора, а его природа.
 *
 * Теперь каждая длина — СВОЙ список, составленный целиком: короткая версия может
 * начинаться с другого упражнения, а не быть первой третью длинной.
 *
 * ⚠️ СПИСОК ИЗ СЕТКИ НЕ РЕЖЕТСЯ И НЕ ДОБИРАЕТСЯ. Ни `pickSteps`, ни пул остывания
 * к нему не применяются: его собрал человек, и «поправить» его под бюджет значит
 * вернуть ту самую урезку. Профильный срез тоже снят — по тому же правилу, что и
 * у наборов дня и ночи (набор назначен явно, а не собрался случайно). Песочница
 * режется всегда.
 */
export type СеткаНаборов = Partial<Record<Weekday, Partial<Record<WarmupSlot, Partial<Record<Длительность, PlaylistStep[]>>>>>>;

let сеткаИзФайла: СеткаНаборов | null = null;

export function установитьСеткуИзФайла(сетка: СеткаНаборов | null): void {
  сеткаИзФайла = сетка;
}

/** Есть ли в файле готовая раскладка ровно на этот день, слот и длину. */
export interface SlotPlaylistSource {
  grid: СеткаНаборов | null;
  day?: PlaylistStep[];
  night?: PlaylistStep[];
}

export function изСетки(weekday: Weekday, slot: WarmupSlot, duration: Длительность,
                       grid = сеткаИзФайла): PlaylistStep[] | null {
  const шаги = grid?.[weekday]?.[slot]?.[duration];
  return шаги ? шаги.map((s) => ({ ...s })) : null;
}

/** One resolver for the card and its Start action; the requested grid beats a slot default. */
export function resolveSlotPlaylist(
  profile: Pick<ProfileDef, 'morning_playlist' | 'evening_playlist' | 'custom_playlists'>,
  slot: WarmupSlot, weekday: Weekday, duration: Длительность, allow?: AllowFn, source?: SlotPlaylistSource,
): PlaylistMeta {
  switch (slot) {
    case 'day': return buildDayPlaylist(weekday, allow, duration, source);
    case 'night': return buildNightPlaylist(weekday, duration, source);
    case 'evening': {
      const morning = resolveSlotPlaylist(profile, 'morning', weekday, 15, allow, source);
      return buildEveningWarmupPlaylist({
        weekday, duration, allow, profileEvening: profile.evening_playlist, source,
        excludeGameIds: morning.steps.map(s => s.game_id),
      });
    }
    default:
      return !изСетки(weekday, slot, duration, source?.grid) && profile.morning_playlist !== undefined
        ? buildFixedPlaylist(profile.morning_playlist, slot, weekday, allow)
        : buildMorningWarmupPlaylist({ duration, weekday, profilePlaylists: profile.custom_playlists, allow, source });
  }
}

/**
 * Мета для готовой раскладки.
 *
 * ⚠️ `duration_min` — СУММА, А НЕ ЗАПРОШЕННАЯ КНОПКА. Отчёт `5fb3e5b1`: «подписи
 * расходятся с суммами — 5→6, 10→14, 15→16». Пока список резался под бюджет,
 * обещанием была кнопка; теперь список задан целиком, и честнее показать то, что
 * в нём действительно лежит. От `duration_min` считается вопрос «идём дольше
 * задуманного?» — он тоже должен идти от настоящей длины.
 */
function изГотового(steps: PlaylistStep[], weekday: Weekday, slot: WarmupSlot, label: string,
                    track: PlaylistMeta['track'] = 'training'): PlaylistMeta {
  const годные = keepAllowed(steps, undefined);
  return {
    duration_min: Math.max(1, Math.round(sumDuration(годные) / 60)),
    weekday, weekday_name: WEEKDAY_NAMES[weekday],
    track, track_label: label,
    steps: годные, est_total_sec: sumDuration(годные), slot,
  };
}

/**
 * Набор под запрошенную длину: база плюс добор из пула, без повторов.
 *
 * Пороги те же, что у `pickSteps` (0,9 и 1,15 бюджета) — и это не совпадение:
 * два разных правила отбора в одном экране разошлись бы молча, а человек увидел
 * бы, что «десять минут» у утра и у перерыва меряются по-разному.
 */
function поДлине(база: PlaylistStep[], пул: PlaylistStep[], duration: Длительность): PlaylistStep[] {
  const бюджет = duration * 60;
  const out = (sumDuration(база) > бюджет * 1.15 ? pickSteps(база, бюджет) : база).map((s) => ({ ...s }));
  const взято = new Set(out.map((s) => s.game_id));
  for (const шаг of пул) {
    const набрано = sumDuration(out);
    if (набрано >= бюджет * 0.9) break;
    if (взято.has(шаг.game_id)) continue;
    if (набрано + estimateStepSec(шаг) > бюджет * 1.15) continue;
    out.push({ ...шаг });
    взято.add(шаг.game_id);
  }
  return out;
}

/** Вечерние наборы соседних дней — пул добора для длинного вечера. */
function вечерниеСоседи(weekday: Weekday): PlaylistStep[] {
  const out: PlaylistStep[] = [];
  for (let i = 1; i <= 6; i++) out.push(...EVENING_BY_WEEKDAY[(((weekday - i) % 7) + 7) % 7 as Weekday]);
  return out;
}

/**
 * 🔴 КНОПКА ДЛИНЫ НЕ ДОЛЖНА СТОЯТЬ ТАМ, ГДЕ ОНА НИЧЕГО НЕ МЕНЯЕТ.
 *
 * Денис 13.09.2026: «выбор длины зарядки нужно добавить во все 4». Кнопки теперь
 * есть у всех четырёх слотов — но у слота, чей состав назван целиком (фикс-набор
 * профиля или набор слота из файла), три длины дают один и тот же список. Кнопка,
 * которая не меняет ничего, — сломанная кнопка, а не настройка; поэтому экран
 * спрашивает здесь, показывать ли её.
 *
 * `фиксПрофиля` — есть ли у профиля жёсткий набор на этот слот (`morning_playlist`
 * / `evening_playlist`); про день и ночь эта функция знает сама.
 */
export function длинаВлияет(weekday: Weekday, slot: WarmupSlot, фиксПрофиля = false, source?: SlotPlaylistSource): boolean {
  const вСетке = (source ? source.grid : сеткаИзФайла)?.[weekday]?.[slot];
  if (вСетке && Object.keys(вСетке).length > 0) return true;
  if (slot === 'day') return !(source ? source.day : наборДня);
  if (slot === 'night') return !(source ? source.night : наборНочи);
  return !фиксПрофиля;
}

export function buildDayPlaylist(weekday: Weekday, allow?: AllowFn, duration: Длительность = 5, source?: SlotPlaylistSource): PlaylistMeta {
  const готовое = изСетки(weekday, 'day', duration, source?.grid);
  if (готовое) return изГотового(готовое, weekday, 'day', 'перерыв');
  /* Набор дня из файла назначен явно — ни профильным составом не режем, ни под
     длину не подгоняем: и то и другое спорило бы с решением владельца. */
  /**
   * ⚠️ ГИМНАСТИКА ДЛЯ ГЛАЗ — ПОСЛЕДНЕЙ, А НЕ ТРЕТЬЕЙ. Правило Дениса 13.09.2026
   * («восстановительное ставить в конце»); до добора она и так стояла последней,
   * а после него оказалась бы в середине.
   */
  const базаДня = DAY_STEPS.filter((s) => s.game_id !== 'eye_gym');
  const глаза = DAY_STEPS.filter((s) => s.game_id === 'eye_gym');
  const свойДень = source ? source.day : наборДня;
  const steps = свойДень
    ? keepAllowed(свойДень, undefined)
    : keepAllowed([
        ...поДлине(базаДня, [...COOLDOWN_POOL, ...TRAINING_BY_WEEKDAY[weekday]], duration)
          .filter((s) => s.game_id !== 'eye_gym'),
        ...глаза,
      ], allow);
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
 * ради прогресса, а потому что не может заснуть. Состав — `NIGHT_BY_DURATION`:
 * головоломки без скорости («Трубы», ханойская башня, судоку…) и дыхание последним
 * (решение Дениса 13.09.2026). До 13.09 было одно дыхание 4-7-8 — подпись карточки
 * `slotNightDesc` («только дыхание») пережила ту правку и врала до 07.10.2026.
 * Отфильтровать его по профилю значит показать в три часа ночи пустой экран
 * (в «Стандарте» `breathing` не разрешён) и превратить помощь со сном в повод
 * для покупки.
 *
 * Если решим гейтить и это — одна строка: `keepAllowed(..., allow)`, как в дне.
 */
export function buildNightPlaylist(weekday: Weekday, duration: Длительность = 5, source?: SlotPlaylistSource): PlaylistMeta {
  const готовое = изСетки(weekday, 'night', duration, source?.grid);
  if (готовое) return изГотового(готовое, weekday, 'night', 'не спится', 'rest');
  const steps = keepAllowed((source ? source.night : наборНочи) ?? NIGHT_BY_DURATION[duration] ?? NIGHT_STEPS);
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
  duration?: Длительность;            // 5 / 10 / 15 — выбор человека, как у утра
  source?: SlotPlaylistSource;
}): PlaylistMeta {
  const { weekday, excludeGameIds, profileEvening, allow, duration = 5, source } = opts;
  const готовое = изСетки(weekday, 'evening', duration, source?.grid);
  if (готовое) return изГотового(готовое, weekday, 'evening', 'перед сном');
  const fixed = profileEvening !== undefined;
  const base = fixed ? profileEvening! : EVENING_BY_WEEKDAY[weekday];
  // v1.157 (репорт Вали «почему всего одна игра перед сном?»): дедуп против утра
  // применяем ТОЛЬКО к авто-ротации. Если профиль задал вечер ЯВНО — это осознанный
  // выбор автора профиля (у «Микро-релакса» утро и вечер намеренно пересекаются:
  // отличия/парные картинки — залипательные казуалки для обоих слотов). Раньше дедуп
  // срезал их и от 3 игр оставалась 1, при этом карточка на главной (строится БЕЗ
  // excludeGameIds) обещала 3 — расхождение обещания и запуска.
  const ex = new Set(fixed ? [] : (excludeGameIds || []));
  /* Фикс-вечер профиля берём как есть; ротацию набираем под запрошенную длину. */
  const подДлину = fixed
    ? base.map((s) => ({ ...s }))
    : поДлине(base.filter((s) => !ex.has(s.game_id)), [...COOLDOWN_POOL, ...вечерниеСоседи(weekday)].filter((s) => !ex.has(s.game_id)), duration);
  let steps = keepAllowed(подДлину, allow);

  /**
   * Пустой вечер — та же сломанная кнопка, что и пустое утро (см. комментарий в
   * buildMorningWarmupPlaylist). У «Стандарта» после отсева пустыми выходили три
   * вечера из семи. Добираем набором предыдущих дней; парные картинки и дыхание
   * доступны в любом профиле, поэтому что-то найдётся всегда.
   */
  if (!fixed && steps.length === 0 && allow) {
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
  source?: SlotPlaylistSource;
}): PlaylistMeta {
  const { duration, weekday, profilePlaylists, allow, source } = opts;
  /**
   * Готовая раскладка на этот день и эту длину — берётся целиком, до всех веток.
   * Замером она идёт, только если в ней есть ядро-снимок целиком (`естьЯдроСнимок`),
   * иначе это тренировка — и в четверг, и в воскресенье.
   */
  const готовое = изСетки(weekday, 'morning', duration, source?.grid);
  if (готовое) {
    const поДню = getTrack(weekday);
    const дорожка = (поДню === 'measure-peak' || поДню === 'measure-baseline')
      && !естьЯдроСнимок(keepAllowed(готовое, undefined)) ? 'training' : поДню;
    return изГотового(готовое, weekday, 'morning', TRACK_LABEL[дорожка] ?? 'тренировка', дорожка);
  }
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
    /**
     * 🔴 ОТСЕВ — ДО НАБОРА, А НЕ ТОЛЬКО ПОСЛЕ (08.09.2026).
     *
     * Отбор по бюджету шёл по полному списку дня, а `keepAllowed` на выходе
     * выбрасывал песочные игры — то есть бюджет успевал потратиться на шаги,
     * которых человек не увидит. В среду из пяти набранных шагов оставалось три:
     * 213 секунд вместо трёхсот, 0,71 обещанного, и никакой ошибки в логах.
     * Отсев на выходе (строка ниже по тексту) остаётся страховкой для веток,
     * где своего отбора нет.
     */
    const allSteps = keepAllowed(
      coreOk ? rawSteps.filter((a) => !SNAPSHOT_CORE.some((c) => c.game_id === a.game_id)) : rawSteps,
      allow,
    );
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

  /**
   * 🔴 НЕДОБОР ЗАКРЫВАЕТСЯ ОДНИМ МЕСТОМ НА ВСЕ ВЕТКИ (08.09.2026).
   *
   * Добор жил в двух ветках из пяти, и ровно там, где его не было, обещание и
   * расходилось с делом: вторник на десяти минутах давал 0,60 обещанного,
   * четверг на пятнадцати — 0,70. Причина та же, что у отсева ниже: правило,
   * размазанное по веткам, в новой ветке забудут.
   *
   * Порог в четверть бюджета — не косметика: добирать ради тридцати секунд
   * значит ставить лишнюю игру, а лишнее переключение стоит человеку дороже
   * недостающей полуминуты (замер перехода — 12 секунд).
   *
   * ⚠️ ЯДРО-СНИМОК ЦЕЛИКОМ НЕ ДОБИРАЕТСЯ НИКОГДА. Пятиминутка замерного дня —
   * это ровно пять игр ядра в неизменной постановке; добавь к ним шестую, и
   * человек получит не снимок, а снимок с довеском. Ряд сравнения важнее
   * недостающих секунд.
   */
  const ядроЦеликом = steps.length === SNAPSHOT_CORE.length
    && steps.every((s, i) => s.game_id === SNAPSHOT_CORE[i].game_id);
  /**
   * ⚠️ ПЯТИМИНУТКА ДОБИРАЕТСЯ ТОЖЕ — но только когда своего набора не хватает.
   *
   * Сначала я её исключил: у дня свой смысл (вторник фокус, среда память), и
   * шаг из общего пула этот смысл разбавляет. Но замер показал цену чистоты: у
   * среды в наборе три игры после отсева, у пятницы четыре — 0,71 и 0,64
   * обещанного, то есть ровно та жалоба, ради которой всё и правится («просишь
   * пять минут — получаешь 2:45»).
   *
   * Довод в пользу добора: тем же самым дням пул остывания УЖЕ разрешён на
   * десяти и пятнадцати минутах. Пятиминутка не «чище» десятиминутки — она
   * короче; разной меры для них быть не должно. Порог в четверть бюджета держит
   * добор редким: дни с полным набором его не видят вовсе.
   */
  if (track !== 'rest' && steps.length > 0 && !ядроЦеликом) {
    const budget = duration * 60;
    const remaining = budget - sumDuration(steps);
    if (remaining > budget * 0.25) steps = [...steps, ...pickCooldown(weekday, remaining)];
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

/**
 * 🔴 ПЛАН МЕРЯЕТСЯ ЗАМЕРОМ, А НЕ ОБЪЯВЛЕНИЕМ (`c810938d`, 08.09.2026).
 *
 * `est_duration_sec` — числа, проставленные на глаз при заведении игры, и завышены
 * они примерно вдвое. Набор шагов идёт, пока сумма не упрётся в бюджет, — значит
 * завышенная единица обрывает набор вдвое раньше срока: живой замер по базе дал
 * 0,39 обещанного (35 зарядок «на пять минут» → медиана 116 секунд с переходами).
 *
 * Числа самих шагов НЕ ТРОГАЕМ: `est_duration_sec` объявлен в двух файлах и в
 * профилях, и переписывать двести чисел вручную — способ развести их между собой.
 * Меняется ЕДИНИЦА ИЗМЕРЕНИЯ: `estimateStepSec` берёт медиану живых партий этой
 * игры плюс измеренную стоимость перехода, а объявленное число остаётся запасным
 * для игр, о которых замера пока нет.
 */
function sumDuration(steps: PlaylistStep[]): number {
  return steps.reduce((s, x) => s + estimateStepSec(x), 0);
}

/**
 * Набор шагов под бюджет.
 *
 * 🔴 ДВЕ ПРАВКИ 08.09.2026, обе из замера планов по дням недели.
 *
 * · ПОСЛЕДНИЙ ШАГ БОЛЬШЕ НЕ БЕРЁТСЯ ВНАХЛЁСТ. Прежнее правило проверяло только
 *   «набрано ли 85 % бюджета» ДО шага, а сам шаг мог быть какой угодно длины:
 *   в среду анаграммы (200 секунд) выводили пятиминутку на 413 — 1,38 обещанного.
 *   Теперь шаг, выводящий сумму за 115 % бюджета, пропускается, а набор идёт
 *   дальше: следующий может оказаться коротким и уложиться.
 *
 * · НЕДОБОР ТОЖЕ ДЕФЕКТ. У пятницы в наборе дня всего четыре игры на 193 секунды —
 *   0,64 обещанного, и человек просил пять минут, а получал три. Добор из
 *   `COOLDOWN_POOL` делает то же, что уже делала десятиминутка.
 *
 * ⚠️ Хотя бы один шаг возвращаем всегда: пустая зарядка хуже короткой.
 */
function pickSteps(steps: PlaylistStep[], targetSec: number): PlaylistStep[] {
  const out: PlaylistStep[] = [];
  let acc = 0;
  for (const s of steps) {
    if (acc >= targetSec * 0.9) break;
    const cost = estimateStepSec(s);
    if (out.length > 0 && acc + cost > targetSec * 1.15) continue;   // внахлёст не берём
    out.push(s);
    acc += cost;
  }
  return out.length > 0 ? out : steps.slice(0, 1); // at least 1 step
}

/**
 * Игры «на выдох»: лёгкие, короткие, без смысла дня недели — потому и годятся в
 * конец любого набора.
 *
 * 🔴 РАСШИРИТЬ ЕГО 08.09.2026 НЕ ВЫШЛО — и это записано, чтобы следующий не
 * повторил. Пул мал (четыре игры, да ещё за вычетом игр текущего дня), и я
 * добавил пять самых коротких игр каталога по замеру. Покраснели два гейта, оба
 * по делу: `playlist-autostart` — «Сортировка воды» не умеет авто-стартовать по
 * `?wu=1`, то есть в зарядке встала бы мёртвым экраном; `warmup-level-drift` —
 * три из пяти роняют личный уровень, когда их запускают из зарядки.
 *
 * Значит игра годится в пул не по длине партии, а по двум условиям: авто-старт
 * по `?wu=1` и невмешательство в личный уровень. Пул расширяется ПОСЛЕ починки
 * этих двух вещей у конкретной игры, а не вместо неё.
 */
export const COOLDOWN_POOL: PlaylistStep[] = заводскиеЗарядки.запас.добор;

// CPT — sustained attention test. Берём только для длинных пресетов (10/15 мин)
// и только в дни внимания (ВТ) или logic-day (СБ). НЕ в peak/baseline (ЧТ/ВС)
// чтобы не ломать фиксированную замерную батарею.
//
// CPT 4-min ≈ 240 сек — это полноценная самостоятельная сессия, ставится в КОНЕЦ
// серии после "разогрева" — измеряет sustained attention уже в утомлённом состоянии,
// что и есть цель: "упадёт ли внимание на 4-м часу NZT".
const CPT_STEP: PlaylistStep = заводскиеЗарядки.запас.финал;
const CPT_DAYS: Set<Weekday> = new Set(заводскиеЗарядки.запас.дни_финала); // ВТ, СБ — attention/logic days, не measurement

function pickCooldown(weekday: Weekday, secAvailable: number): PlaylistStep[] {
  const used = new Set(TRAINING_BY_WEEKDAY[weekday].map((s) => s.game_id));
  /**
   * ⚠️ ДОБИРАЕМ ТОЛЬКО ИЗ ПУЛА ОСТЫВАНИЯ, НЕ ИЗ НАБОРОВ ДРУГИХ ДНЕЙ.
   *
   * 08.09.2026 я сделал именно так — и гейт `warmup-snapshot-core` покраснел по
   * делу: у каждого дня свой смысл (вторник — фокус, среда — память), и шаг,
   * взятый из чужого дня, этот смысл ломает молча. Пул остывания смысла дня не
   * несёт по определению: это лёгкие игры «на выдох», их место в конце любого дня.
   * Поэтому недобор лечится РАСШИРЕНИЕМ ПУЛА, а не заимствованием из соседей.
   */
  const available = COOLDOWN_POOL.filter((s) => !used.has(s.game_id));
  const out: PlaylistStep[] = [];
  let acc = 0;
  // Той же мерой, что и весь план: по замеру партии, а не по объявленному числу
  // (иначе добор отказывался брать шаг, который на деле вдвое короче объявления).
  for (const s of available) {
    const cost = estimateStepSec(s);
    if (acc + cost > secAvailable + 30) continue;
    out.push(s);
    acc += cost;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// D1 — Financial Brain Day
// vmPFC measurement battery: Iowa Gambling + BART + PRL in one session.
// Recommended frequency: 1×/2 weeks (cooldown enforced in UI).
// Direct correlate of financial decision-making for Денис's business context.

const FINANCIAL_BATTERY_PLAYLIST: PlaylistStep[] = заводскиеЗарядки.запас.финансы;

export function buildFinancialBatteryPlaylist(): PlaylistMeta {
  const wd = getCurrentWeekday();
  const набор: PlaylistStep[] = серииИзФайла?.financial ?? FINANCIAL_BATTERY_PLAYLIST;
  return {
    duration_min: Math.round(набор.reduce((s, x) => s + x.est_duration_sec, 0) / 60),
    weekday: wd,
    weekday_name: WEEKDAY_NAMES[wd],
    track: 'financial-battery',
    track_label: TRACK_LABEL['financial-battery'],
    steps: набор.map(s => ({ ...s })),
    est_total_sec: набор.reduce((s, x) => s + x.est_duration_sec, 0),
  };
}

// G1 — Initial Skill Assessment battery (12 short tests, ~12 min)
/**
 * 🔴 СОСТАВ СЕРИЙ-ПЛЕЙЛИСТОВ ИЗ ФАЙЛА НАСТРОЕК.
 *
 * Решение Дениса 13.09.2026: «тащи моё решение» — после того, как я назвал риск.
 * Риск называю здесь один раз, чтобы он жил рядом с кодом, а не в переписке:
 *
 * ⚠️ СЕРИЯ — ЗАМЕР, И СМЕНА СОСТАВА ДЕЛАЕТ ЗАМЕРЫ ДО И ПОСЛЕ НЕСРАВНИМЫМИ.
 * Так записано в шапке `services/warmupEntries.ts` (23.08.2026): «состав фиксирован
 * жёстко… иначе замеры разных дней несравнимы и кривая прогресса превращается в
 * шум». Менять состав — законное право владельца; важно лишь понимать, что кривая
 * прогресса на стыке правки разрывается, и сравнивать «до» и «после» нельзя.
 *
 * Заводской состав остаётся в коде и работает, пока файл молчит.
 */
let серииИзФайла: Record<string, PlaylistStep[]> | null = null;

export function установитьСерииИзФайла(x: Record<string, PlaylistStep[]> | null): void {
  серииИзФайла = x;
}

export function buildAssessmentPlaylist(): PlaylistMeta {
  const ASSESSMENT_PLAYLIST: PlaylistStep[] = серииИзФайла?.assessment ?? заводскиеЗарядки.запас.оценка;
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
 * 🔴 «НЕ СПИТСЯ» В СТРИК НЕ ИДЁТ.
 *
 * Так решил Денис 02.08 («ночь не тренировка и не должна двигать стрик» — см. `startSlotPlaylist`
 * в WarmupContext), и это написано на самой карточке ночи: «очки не начисляются и стрик не
 * растёт». Метку партий ночь получала (`manual`), а история — нет: пройденная ночь пишет
 * запись `{ track: 'rest', completed: true }`, и календарь, стрик на итоге и достижения её
 * засчитывали. Замер 17.09.2026 пробой `warmup-night-not-in-streak`: одна ночная запись за
 * сегодня давала стрик 1.
 */
const вСтрик = (h: WarmupHistoryEntry): boolean => h.completed && !серияБезСчёта(h);

/**
 * 🔴 «НЕ СПИТСЯ» — БЕЗ СЧЁТА И БЕЗ СЕРИИ ДНЕЙ.
 *
 * Решение Дениса 17.09.2026. Карточка обещает «очки не начисляются», а итог писал «Общий
 * счёт», очки у каждой игры, разбор по навыкам, «Мозг сегодня» и стрик, мост — очки шага.
 * Теперь итог показывает только сыгранное и время, мост — время; бонус за три чистые игры
 * не начисляется, стрик ночь не двигает. Узнаётся по дорожке `rest`: у своих серий и тем
 * хабов её нет, даже если их запустили ночью.
 */
export function серияБезСчёта(meta: { track?: string } | null | undefined): boolean {
  return meta?.track === 'rest';
}

/**
 * 🔴 СЕРИЯ ЗАСЧИТАНА, ЕСЛИ СЫГРАНО НЕ МЕНЬШЕ 80 % ШАГОВ.
 *
 * Решение Дениса 17.09.2026. Было: засчитывался только набор, сыгранный целиком, — один
 * пропущенный шаг из шести давал «ЗАРЯДКА ОСТАНОВЛЕНА», `completed: false`, и день не шёл
 * в стрик. Живой проход 17.09 (экспорт 1101b52b): дневная пятиминутка дважды остановлена
 * из-за одного шага, который экран не засчитал.
 *
 * Считается в целых, `сыграно · 5 ≥ шагов · 4`, без плавающей точки: 4 из 5 и 8 из 10 проходят
 * ровно на границе. Шесть шагов — нужно пять, семь — шесть, двенадцать — десять.
 */
export function серияЗасчитана(шагов: number, сыграно: number): boolean {
  if (шагов <= 0) return false;
  return Math.min(сыграно, шагов) * 5 >= шагов * 4;
}

/**
 * 🔴 РЕЗУЛЬТАТ ШАГА — ПО НОМЕРУ ШАГА, А НЕ «ПОСЛЕДНИЙ ЗАПИСАННЫЙ».
 *
 * 📍 17.09.2026, «Не спится» живьём (экспорт ветки, nzt48): шаг 1 «Сеть» пропущен, мост пишет
 * «✓ СЫГРАНО · 1/5» и имя пропущенной игры — результатов нет, а карточка «сыгранного» рисуется
 * по номеру шага. После сыгранной игры и следующего пропуска мост показал бы очки ПРЕДЫДУЩЕЙ
 * партии под именем пропущенной.
 *
 * Результаты без номера (подмены в старых пробах) читаются по-старому — последний.
 */
export function результатШага<Р extends { шаг?: number }>(results: readonly Р[], шаг: number): Р | undefined {
  if (results.length > 0 && results.every((r) => r.шаг === undefined)) return results[results.length - 1];
  return results.find((r) => r.шаг === шаг);
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
    if (!вСтрик(entry)) continue;
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
  const dates = new Set(history.filter(вСтрик).map((h) => h.date));
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

/**
 * 🔴 ШАГ ЗАСЧИТЫВАЕТ ПАРТИЮ ПО КОРЗИНЕ, В КОТОРУЮ ЭКРАН ЕЁ ПИШЕТ, А НЕ ПО ИМЕНИ В КАТАЛОГЕ.
 *
 * 📍 Живой проход серий 17.09.2026 (экспорт-сборка 1101b52b). Шаг набора называет игру её
 * `id` из каталога, а экран пишет партию под `game_type`. У «Судоку: фрактал» и «Самурая»
 * это разные строки — `sudoku-fractal` в каталоге, `sudoku_fractal` в партии, — и каталог
 * это расхождение уже объявляет (`sessionType`). Слушатель зарядки сверял строки напрямую,
 * поэтому такой шаг не засчитывался никогда: ни результата, ни перехода на мост, а в итоге —
 * «ЗАРЯДКА ОСТАНОВЛЕНА» и «Пропущено», хотя партия сыграна. Проба на настоящем провайдере:
 * `sudoku_fractal` на шаге `sudoku-fractal` → результатов 0, переходов 0.
 *
 * ⚠️ Прямое совпадение оставлено первым: экран, пишущий партию под `id` каталога, засчитывается
 * как раньше, даже если ему объявят `sessionType` позже.
 */
export function партияЗаШаг(stepGameId: string, s: { game_type?: string; details?: Record<string, any> | null }): boolean {
  if (s.game_type === stepGameId) return true;
  const игра = GAMES.find((g) => g.id === stepGameId);
  return !!игра && sessionGameType(s) === sessionTypeOf(игра);
}

/**
 * 🔴 «ЕЩЁ РАЗ» ПОВТОРЯЕТ ТО, ЧТО ТОЛЬКО ЧТО СЫГРАНО, — ТЕ ЖЕ ШАГИ, ТОЙ ЖЕ ДЛИНЫ.
 *
 * 📍 Живой проход 17.09.2026, экспорт-сборка 1101b52b. Итог собирал повтор ЗАНОВО по слоту:
 * `startDay()` / `startEvening()` / `startNight()` без длины (то есть всегда пять минут, какую
 * бы человек ни выбрал) и `startWarmup(meta.duration_min)` для всего остального. А
 * `duration_min` у набора из файла — сумма оценок шагов (14, 9, 7…), которой в сетке нет, и
 * утро собиралось запасной веткой кода — другим набором. Свои серии и темы хабов туда же:
 * «Ещё раз» после серии запускал утреннюю или дневную зарядку.
 *
 * Повтор — это копия уже собранного набора: день недели, профиль и длина с момента старта
 * не поменялись, пересобирать нечего.
 *
 * ⚠️ У ЗАМЕРОВ С ОСТЫВАНИЕМ ПОВТОРА НЕТ. FIN BRAIN повторяют не раньше чем через 14 дней
 * (`FINANCIAL_COOLDOWN_DAYS`), оценку — раз в квартал: кнопка «ещё раз» сразу после замера
 * мерила бы память о прошлом прогоне, а не решения. Для них — `null`, кнопки нет.
 */
export function повторСерии(meta: PlaylistMeta | null): PlaylistMeta | null {
  if (!meta || meta.steps.length === 0) return null;
  if (meta.track === 'financial-battery' || meta.track === 'assessment') return null;
  return { ...meta, steps: meta.steps.map((s) => ({ ...s })) };
}

/**
 * 🔴 ОДИН ПОТОК — ОДНА КАРТОЧКА, ДЛИНА ПЕРЕКЛЮЧАЕТСЯ, А НЕ ТРИ СТРОКИ.
 *
 * Отчёт 5ff162e1, Денис 17.09.2026: «в «Зарядке» переключатель 5/10/15 минут вместо трёх
 * строк». Замер на экспорт-сборке 1101b52b, профиль nzt48: в «Своих сериях» одиннадцать
 * карточек, девять из них — три длины трёх потоков («Рабочая память · 5 мин», «· 10 мин»,
 * «· 15 мин»). А на выбранной карточке своей серии уже стояли чипы 5/10/15 — мёртвые: запуск
 * своей серии длину не читал.
 *
 * Поток узнаётся по `id` вида `поток-<ключ>-5|10|15` — так их называет и сборщик потоков, и
 * редактор; по названию нельзя, его правят руками. Остальные наборы (серия «Все игры · …»)
 * стоят поодиночке, у них один вариант и переключателя нет. Название потока — название
 * первого варианта без хвоста « · N мин».
 */
export interface ПотокНаборов<Н extends { id: string; название: string }> {
  ключ: string;
  название: string;
  /** По возрастанию длины; у одиночного набора один вариант с `длина: null`. */
  варианты: { длина: Длительность | null; набор: Н }[];
}

export function потокиНаборов<Н extends { id: string; название: string }>(наборы: readonly Н[]): ПотокНаборов<Н>[] {
  const итог: ПотокНаборов<Н>[] = [];
  const поКлючу = new Map<string, ПотокНаборов<Н>>();
  for (const н of наборы) {
    const м = /^(поток-.+)-(5|10|15)$/.exec(н.id);
    if (!м) { итог.push({ ключ: н.id, название: н.название, варианты: [{ длина: null, набор: н }] }); continue; }
    let п = поКлючу.get(м[1]);
    if (!п) {
      п = { ключ: м[1], название: н.название.replace(/\s*·\s*\d+\s*мин\.?\s*$/i, ''), варианты: [] };
      поКлючу.set(м[1], п);
      итог.push(п);
    }
    п.варианты.push({ длина: Number(м[2]) as Длительность, набор: н });
  }
  for (const п of итог) п.варианты.sort((а, б) => (а.длина ?? 0) - (б.длина ?? 0));
  return итог;
}

/**
 * Очки со знаком для строки результата: «+12», «+0», «−6».
 * Замер 17.09.2026: «Мнемоника» с 11 ошибками на 5 словах пишет score −6, и мост с итогом
 * показывали «+-6».
 */
export function очкиСоЗнаком(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/**
 * Какой игре каталога принадлежит сохранённая партия — обратная сторона `sessionTypeOf`.
 * Итог зарядки сравнивает сегодняшние результаты (они записаны именем шага) с прошлыми
 * партиями (они лежат под корзиной экрана); без этого у фрактала «сегодня» и «раньше»
 * оказались бы разными играми.
 */
export function играПартии(s: { game_type?: string; details?: Record<string, any> | null }): string {
  const корзина = sessionGameType(s);
  return GAMES.find((g) => sessionTypeOf(g) === корзина)?.id ?? корзина;
}
