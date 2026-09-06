/* psygames-attention-load · VER 1 · 06.09.2026 · [Claude·MAC] */
/**
 * СВОЯ МЕРА КАЖДОЙ ПРОБЕ. ПЯТЬ ФОРМУЛ, А НЕ ОДНА.
 *
 * 🔴 ЗАЧЕМ ФАЙЛ. Пять методик меряют разное, и ОДНА общая мерка объявит часть
 * режимов пустыми — не потому что они пустые, а потому что мерка не про них.
 * Соседний раздел на этом обжёгся 06.09.2026: общая мерка разнообразия объявила
 * три режима из пяти пустыми (коммит «Сортировка: у каждого режима своя мерка»).
 * Здесь у каждой пробы СВОЯ валюта, и складывать их между собой нельзя — сравнение
 * осмысленно только внутри одной пробы.
 *
 * ⚠️ ДВЕ ВЕЛИЧИНЫ НА ПРОБУ, И ЭТО НЕ ИЗБЫТОЧНОСТЬ.
 *   • МЕРА ПРОХОДА — исход человека (`interference_ms`, `flanker_effect_ms`, …).
 *     Есть только после партии, зависит от игрока, пишется в `saveSession`.
 *   • МЕРА УРОВНЯ (этот файл) — считается от одних параметров уровня,
 *     детерминированно, БЕЗ игрока. По ней строится лестница, её прогоняет гейт.
 * Гейту нужна вторая: прогнать пятнадцать уровней без человека иначе нельзя.
 * Но вторая обязана быть СПРОСОМ НА ПЕРВУЮ, а не «секундами вообще» — иначе это
 * снова общая мерка, только переименованная.
 *
 * 🔴 ПАРАМЕТРЫ БЕРУТСЯ ИЗ ЖИВЫХ ЭКРАНОВ, А НЕ ПЕРЕПИСАНЫ СЮДА. Копия формулы
 * разошлась бы с экраном молча, и гейт стерёг бы прошлогоднюю лестницу. Поэтому
 * `levelParams` импортируется у каждой игры (в `targets`/`wcst` он для этого
 * открыт наружу этой же правкой).
 */
import { levelParams as stroopParams } from '@/app/games/stroop';
import { levelParams as flankerParams } from '@/app/games/flanker';
import { levelParams as cptParams } from '@/app/games/cpt';
import { levelParams as targetsParams } from '@/app/games/targets';
import { levelParams as wcstParams, MAX_LEVEL as WCST_MAX_LEVEL } from '@/app/games/wcst';

export type AttentionMode = 'stroop' | 'flanker' | 'cpt' | 'targets' | 'wcst';

/**
 * Полоса уровней, на которой лестница обязана РАСТИ. Не «сколько уровней бывает»,
 * а «до какого уровня содержание меняется».
 *
 * 🔴 У `targets` верхняя пара уровней была дублем: пол задержки 450 мс достигался
 * на L14, а число квадратов совпадало, и L15 не отличался от L14 ничем. Правка
 * шага 120 → 110 (targets.tsx) доводит лестницу до того же пола ровно на L15;
 * замер после: дублей среди L1..L15 — ноль.
 */
export const LADDER_RANGE: Record<AttentionMode, number> = {
  stroop: 15,   // окно упирается в пол 1200 мс на L15, объём проб — в 34 там же
  flanker: 15,  // окно упирается в пол 1000 мс на L15
  cpt: 15,      // ISI упирается в пол 500 мс, доля похожих — в 0,5, оба на L15
  targets: 15,  // потолок игры: targets.tsx:393 `if (levelRef.current < 15)`
  wcst: WCST_MAX_LEVEL,
};

/** Что пишется в партию у этой пробы, и чем это меряется в методике. */
export const SESSION_MEASURE: Record<AttentionMode, { field: string; norm: string }> = {
  stroop:  { field: 'interference_ms',     norm: 'интерференция ~70–200 мс у взрослых; при SOA 0 классические 72 мс' },
  flanker: { field: 'flanker_effect_ms',   norm: 'эффект фланкера 70–100 мс у здоровых взрослых' },
  cpt:     { field: 'vigilance_decrement', norm: 'наклон RT по квартилям; падение ТОЧНОСТИ к концу пока не пишется' },
  targets: { field: 'mean_rt/std_rt',      norm: 'go/no-go: доля no-go 25 % либо 50 %; у нас TARGET_RATE = 0.5' },
  wcst:    { field: 'perseverative',       norm: 'канон: смена правила после 10 подряд верных (Heaton 1993)' },
};

/**
 * СТРУП — «теснота окна».
 *
 * Доля конфликтных здесь ЗАМОРОЖЕНА каноном 50/50 (`INCONGRUENT_RATIO`,
 * stroop.tsx:133) и ручкой сложности быть не может: величину измеряемого эффекта
 * задаёт сама доля, и «сложнее» уменьшало бы ровно то, ради чего игра есть.
 * Значит вся нагрузка ложится на срок, за который надо успеть подавить чтение.
 * Валюта: во сколько раз окно уже, чем на первом уровне.
 */
export function stroopLoad(level: number): number {
  const base = stroopParams(1).windowMs;
  return base / stroopParams(level).windowMs;
}

/**
 * ФЛАНКЕР — «цена помехи».
 *
 * ⚠️ ЗДЕСЬ ЛЕСТНИЦА И ПОКАЗАТЕЛЬ ТЯНУТ В РАЗНЫЕ СТОРОНЫ, И ЭТО ЗАПИСАННЫЙ ДЕФЕКТ,
 * А НЕ ОСОБЕННОСТЬ ФОРМУЛЫ. Уровень растёт долей конфликтных (0,30 → 0,65), а
 * proportion-congruent effect говорит, что чем больше доля конфликтных, тем МЕНЬШЕ
 * измеряемый эффект. То есть ручка, которой растёт уровень, уменьшает величину,
 * ради которой проба существует. Разбор и числа — PROJECT_REF §0, ДЕФЕКТ 1.
 * Нагрузка считается по факту (как есть сейчас); сторожит это `congruentTrials`.
 */
export function flankerLoad(level: number): number {
  const p = flankerParams(level);
  const base = flankerParams(1).windowMs;
  return p.pIncong * (base / p.windowMs);
}

/**
 * Сколько СОГЛАСОВАННЫХ проб даёт уровень. Из них считается `mean_rt_congruent` —
 * половина разности `flanker_effect_ms`. Мало проб → среднее по горстке, и
 * показатель превращается в шум. Тот же довод записан у Струпа (stroop.tsx:120-126).
 */
export function flankerCongruentTrials(level: number): number {
  const p = flankerParams(level);
  return Math.round(p.trials * p.pCong);
}

/**
 * CPT — «темп × нагрузка на контекст».
 *
 * Три слагаемых, и все три не про секунды по отдельности: скорость подачи (ISI),
 * переход X → AX (появляется удержание контекста в рабочей памяти) и доля
 * угловатых букв, похожих на X при беглом взгляде (перцептивная нагрузка).
 */
export function cptLoad(level: number): number {
  const p = cptParams(level);
  const base = cptParams(1).isiMs;
  const contextLoad = p.mode === 'AX' ? 1.5 : 1;
  return (base / p.isiMs) * contextLoad * (1 + p.confusableRatio);
}

/**
 * МИШЕНИ — «плотность помех».
 *
 * Ровно та величина, которую Денис назвал для этой пробы: сколько отвлекающих
 * квадратов приходится на решение и за какой срок его надо принять.
 */
export function targetsLoad(level: number): number {
  const p = targetsParams(level);
  const base = targetsParams(1).delay;
  return p.numSquares * (base / p.delay);
}

/**
 * WCST — «частота смены правила».
 *
 * Величина прохода — сколько ходов уходит на перехват нового правила; спрос на неё
 * со стороны уровня — как часто правило меняется, то есть сколько раз за партию
 * человеку придётся этот перехват совершить.
 *
 * ⚠️ ОТСТУПЛЕНИЕ ОТ КАНОНА, ЧИСЛОМ. Канон WCST — смена после 10 подряд верных
 * (Heaton et al. 1993). У нас 9 на L1 и 3 на L12 (wcst.tsx:114), то есть ниже
 * канона на ВСЕХ уровнях, а на верхнем — втрое. При серии в 3 «перехватил правило»
 * и «трижды угадал» перестают различаться.
 */
export function wcstLoad(level: number): number {
  const p = wcstParams(level);
  return p.trials / p.ruleChangeStreak;
}

/** Мера уровня для любой из пяти. Складывать между пробами НЕЛЬЗЯ — валюты разные. */
export function attentionLoad(mode: AttentionMode, level: number): number {
  switch (mode) {
    case 'stroop':  return stroopLoad(level);
    case 'flanker': return flankerLoad(level);
    case 'cpt':     return cptLoad(level);
    case 'targets': return targetsLoad(level);
    case 'wcst':    return wcstLoad(level);
  }
}

export const ATTENTION_MODES: AttentionMode[] = ['stroop', 'flanker', 'cpt', 'targets', 'wcst'];
