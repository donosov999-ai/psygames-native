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
 * Лестница из четырёх участков. Секунды на позицию падают с 20 до 4.
 *
 * ⚠️ 4 секунды — не «на грани возможного», а замер жанра: узнавание знакомого
 * узора у человека занимает меньше секунды, остальное уходит на тап по доске.
 * Ниже опускать нельзя — начнёт мериться скорость пальца, а не глаза.
 */
export function levelParams(level: number): ScholarsLevel {
  const L = Math.max(1, Math.min(LEVELS, Math.floor(level) || 1));
  const секунды = Math.max(4, Math.round(20 - (L - 1) * 0.42));

  if (L <= 10) {
    return { level: L, kinds: ['mate'], count: 8, seconds: секунды, maxRating: 0 };
  }
  if (L <= 20) {
    return {
      level: L,
      kinds: ['mate', 'fromGames'],
      count: 10,
      seconds: секунды,
      maxRating: 600 + (L - 10) * 60,
    };
  }
  if (L <= 30) {
    return {
      level: L,
      kinds: ['threat', 'defend', 'fromGames'],
      count: 10,
      seconds: секунды + 4,          // «защитись» требует перебора, а не узнавания
      maxRating: 900 + (L - 20) * 50,
    };
  }
  return {
    level: L,
    kinds: ['sacrifice', 'fromGames'],
    count: 8,
    seconds: секунды + 8,            // мат в 2–3 хода: время на ответ соперника
    maxRating: 1200 + (L - 30) * 60,
  };
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

  for (let i = 0; колода.length < п.count && i < п.count * 40; i++) {
    const kind = п.kinds[Math.floor(rnd() * п.kinds.length)]!;
    let пул = puzzlesOf(kind);
    if (п.maxRating > 0 && (kind === 'fromGames' || kind === 'sacrifice')) {
      const в = пул.filter((x) => x.rating <= п.maxRating);
      if (в.length >= п.count) пул = в;
    }
    if (!пул.length) continue;
    const x = пул[Math.floor(rnd() * пул.length)]!;
    const ключ = `${x.kind}:${x.fen}:${x.pre ?? ''}`;
    if (взятые.has(ключ)) continue;
    взятые.add(ключ);
    колода.push(x);
  }
  return колода;
}
