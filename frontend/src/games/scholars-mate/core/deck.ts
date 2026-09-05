/* psygames-scholars-mate-deck · VER 1 · 05.09.2026 */
/**
 * Набор позиций на подход и лестница трудности.
 *
 * 🔴 ТРУДНОСТЬ РАСТЁТ ВРЕМЕНЕМ, А НЕ ЗАПУТАННОСТЬЮ. Узор детского мата один и
 * тот же на всех уровнях — в этом смысл упражнения: он ЗАУЧЕН, меряется
 * скорость узнавания. Поэтому вверх по лестнице сокращается время на позицию и
 * подмешиваются позиции из настоящих партий (рейтинг Lichess), а под конец —
 * маты с жертвой в два-три хода.
 *
 * ⚠️ Позиции из партий добавляются НЕ вместо своих, а рядом: свои узнаваемы
 * (первые 3–7 ходов классического дебюта), партии — те же мотивы в чужой
 * обстановке. Смысл в переносе узора, а не в замене одного другим.
 */
import сырые from '../data/puzzles.json';
import type { ScholarsKind, ScholarsLevel, ScholarsPuzzle } from './types';

interface СыраяЗапись {
  f: string; p?: string; s?: string[]; n?: string[]; a?: string[];
  d?: number; r?: number; t?: boolean; o?: number; u?: string;
}
interface СыройНабор {
  mate: СыраяЗапись[]; defend: СыраяЗапись[]; threat: СыраяЗапись[];
  fromGames: СыраяЗапись[]; sacrifice: СыраяЗапись[];
}

const НАБОР = сырые as unknown as СыройНабор;

function перевести(kind: ScholarsKind, x: СыраяЗапись): ScholarsPuzzle {
  return {
    kind,
    fen: x.f,
    pre: x.p,
    solutions: x.s ?? [],
    san: x.n,
    line: x.a,
    mateIn: x.d ?? 1,
    rating: x.r ?? 0,
    threat: x.t,
    url: x.u,
  };
}

const ПО_ВИДАМ: Record<ScholarsKind, СыраяЗапись[]> = {
  mate: НАБОР.mate ?? [],
  defend: НАБОР.defend ?? [],
  threat: НАБОР.threat ?? [],
  fromGames: НАБОР.fromGames ?? [],
  sacrifice: НАБОР.sacrifice ?? [],
};

/** Все позиции одного вида. Порядок исходный: у Lichess он по рейтингу. */
export function puzzlesOf(kind: ScholarsKind): ScholarsPuzzle[] {
  return (ПО_ВИДАМ[kind] ?? []).map((x) => перевести(kind, x));
}

/** Сколько всего позиций каждого вида — для проб и для экрана «об игре». */
export function counts(): Record<ScholarsKind, number> {
  return {
    mate: ПО_ВИДАМ.mate.length,
    defend: ПО_ВИДАМ.defend.length,
    threat: ПО_ВИДАМ.threat.length,
    fromGames: ПО_ВИДАМ.fromGames.length,
    sacrifice: ПО_ВИДАМ.sacrifice.length,
  };
}

export const LEVELS = 40;

/**
 * 🔴 СЕКУНДЫ ПАДАЮТ СТРОГО МОНОТОННО: 20 → 4, без единого возврата назад.
 *
 * 📍 ЧТО БЫЛО СЛОМАНО В VER 1. Формула `max(4, 20 − (L−1)·0,42)` давала 20→12
 * и упиралась в 12 уже на L19, а надбавки `+4` (L21–30) и `+8` (L31–40)
 * ОТКАТЫВАЛИ время назад: L20 = 12 с, L21 = 16 с, L31 = 15 с. Четыре секунды,
 * обещанные в тексте игры на четырёх языках и в справочнике, не выдавались
 * никогда. Уровень 40 был ровно так же лёгок, как уровень 20.
 *
 * Теперь одна прямая на всю лестницу — и это единственная ось.
 */
export function secondsAt(level: number): number {
  const L = Math.max(1, Math.min(LEVELS, Math.floor(level) || 1));
  return Math.round(20 - ((L - 1) * 16) / (LEVELS - 1));
}

/**
 * Множитель времени по виду задания.
 *
 * ⚠️ ПОЧЕМУ МНОЖИТЕЛЬ, А НЕ НАДБАВКА К УРОВНЮ. «Защитись» требует перебора, а
 * не узнавания: там честно нужно больше времени. Но надбавка, привязанная к
 * УРОВНЮ, ломает лестницу — она отматывает время назад на стыке участков.
 * Множитель привязан к ВИДУ ЗАДАНИЯ, поэтому лестница остаётся монотонной, а
 * каждая позиция получает время по своей работе.
 */
export const ВРЕМЯ_ПО_ВИДУ: Record<ScholarsKind, number> = {
  mate: 1,
  fromGames: 1,
  threat: 1.1,
  defend: 1.7,
  sacrifice: 2.4,
};

/** Сколько секунд даётся на КОНКРЕТНУЮ позицию этого уровня. */
export function secondsFor(kind: ScholarsKind, level: number): number {
  return Math.max(3, Math.round(secondsAt(level) * ВРЕМЯ_ПО_ВИДУ[kind]));
}

/**
 * Полоса рейтинга по уровню: и низ, и верх растут.
 *
 * 📍 Распределение пула (16 427 задач): 400–600 — 1480, 600–800 — 4260,
 * 800–1000 — 5684, 1000–1200 — 3347, 1200–1400 — 1122, 1400–1600 — 372,
 * 1600+ — 103. Полоса поэтому расширяется кверху: наверху задач физически
 * меньше, и узкое окно оставило бы уровень без набора.
 */
function полоса(L: number): { minRating: number; maxRating: number } {
  const доля = (L - 1) / (LEVELS - 1);                  // 0…1
  const низ = Math.round(399 + доля * 900);             // 399 → 1299
  const верх = Math.round(700 + доля * 1300);           // 700 → 2000
  return { minRating: низ, maxRating: верх };
}

/**
 * Лестница из четырёх участков. Вид заданий меняется, время падает монотонно.
 */
export function levelParams(level: number): ScholarsLevel {
  const L = Math.max(1, Math.min(LEVELS, Math.floor(level) || 1));
  const секунды = secondsAt(L);
  const { minRating, maxRating } = полоса(L);

  // 1…8 — свои дебютные позиции: узор в чистом виде, без чужой обстановки.
  if (L <= 8) return { level: L, kinds: ['mate'], count: 8, seconds: секунды, minRating: 0, maxRating: 0 };
  // 9…18 — тот же узор в настоящих партиях.
  if (L <= 18) return { level: L, kinds: ['mate', 'fromGames'], count: 10, seconds: секунды, minRating, maxRating };
  // 19…28 — узнать угрозу и защититься: тот же узор с другой стороны доски.
  if (L <= 28) return { level: L, kinds: ['threat', 'defend', 'fromGames'], count: 10, seconds: секунды, minRating, maxRating };
  // 29…40 — мат с ЖЕРТВОЙ в 2–3 хода плюс самые трудные позиции из партий.
  return { level: L, kinds: ['sacrifice', 'fromGames'], count: 8, seconds: секунды, minRating, maxRating };
}

/**
 * Ключ позиции по тому, ЧТО УВИДИТ ЧЕЛОВЕК. Пре-ход входит в ключ, потому что
 * с ним и без него это разные доски.
 */
function показанныйКлюч(x: ScholarsPuzzle): string {
  return `${x.fen}|${x.pre ?? ''}`;
}

/** Простой повторимый генератор: один и тот же уровень даёт один и тот же набор. */
function случай(seed: number): () => number {
  let x = (seed | 0) || 1;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

/**
 * Набор на подход.
 *
 * 🔴 ПОЗИЦИИ НЕ ПОВТОРЯЮТСЯ ВНУТРИ ПОДХОДА. В упражнении на скорость повтор —
 * не «ещё одна попытка», а подсказка: вторая встреча той же позиции решается
 * памятью о предыдущей, и замер времени портится.
 */
export function buildDeck(level: number, seed = 1): ScholarsPuzzle[] {
  const п = levelParams(level);
  const rnd = случай(seed * 7919 + п.level * 104729);
  const колода: ScholarsPuzzle[] = [];
  const взятые = new Set<string>();

  for (let i = 0; колода.length < п.count && i < п.count * 60; i++) {
    const kind = п.kinds[Math.floor(rnd() * п.kinds.length)]!;
    let пул = puzzlesOf(kind);
    if (п.maxRating > 0 && kind !== 'mate') {
      // 🔴 ПОЛОСА, А НЕ ПОТОЛОК: односторонний фильтр лестницы не строит.
      const в = пул.filter((x) => x.rating >= п.minRating && x.rating <= п.maxRating);
      // Если полоса пуста (наверху задач мало) — расширяем вниз, но не до самого дна.
      пул = в.length >= п.count ? в : пул.filter((x) => x.rating >= п.minRating * 0.75);
      if (пул.length < п.count) пул = puzzlesOf(kind);
    }
    if (!пул.length) continue;
    const x = пул[Math.floor(rnd() * пул.length)]!;
    /**
     * 🔴 КЛЮЧ — ПО ПОКАЗАННОЙ ПОЗИЦИИ, а не по виду задания.
     *
     * 📍 В VER 1 ключ включал `kind`, и одна и та же доска приезжала в подход
     * дважды: все 378 позиций «грозит ли — да» были теми же, что в «защитись».
     * Замер: 8 повторов на 200 подходов уровней 21–30. Повтор в упражнении на
     * скорость — не вторая попытка, а подсказка.
     */
    const ключ = показанныйКлюч(x);
    if (взятые.has(ключ)) continue;
    взятые.add(ключ);
    колода.push(x);
  }
  return колода;
}
