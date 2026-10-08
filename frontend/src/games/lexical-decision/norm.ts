/* psygames-lexical-decision-norm · VER 1 · 02.10.2026 */
/**
 * РЕЖИМ «ПО НОРМЕ?» ИГРЫ «СЛОВО ИЛИ НЕТ?» (задача d0ad03d9).
 *
 * Показывается не «слово или нет», а «так по литературной норме или нет»:
 * половина проб — ненормативные формы из данных (`ихний`, `irregardless`),
 * половина — нормы ДРУГИХ пар (`их`, `regardless`). Нормы берутся из тех же
 * пар, а не из словаря: иначе «незнакомое на вид = не норма» отвечало бы за
 * игрока.
 *
 * Ось трудности — ступени данных (`tier`), потолка нет: темп и число проб
 * растут по общей `levelParams`, ступени сдвигаются от грубых форм к ударению.
 */
import { NONSTANDARD_FORMS, type NonstandardForm } from '@/src/constants/nonstandardForms';

export interface NormTrial {
  text: string;
  /** Показана норма (а не ненормативная форма). */
  isNorm: boolean;
  item: NonstandardForm;
}

/** Ступени данных на уровне: 1–5 — грубые формы, 6–10 — грубые и близкие к норме, дальше — близкие и ударение. */
export function normTiers(level: number): (1 | 2 | 3)[] {
  if (level <= 5) return [1];
  if (level <= 10) return [1, 2];
  return [2, 3];
}

/** Пары языка на этих ступенях — в порядке данных. */
export function normPool(lang: string, tiers: readonly number[]): NonstandardForm[] {
  return (NONSTANDARD_FORMS[lang] ?? []).filter((x) => tiers.includes(x.tier));
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Партия из `count` проб: ⌊count/2⌋ ненормативных форм и остальное — нормы
 * других пар. Один и тот же текст дважды не показывается (у «ехай» и «едь»
 * норма одна — «поезжай»). Если пар не хватает, круг идёт заново.
 */
export function buildNormTrials(opts: { target: string; level: number; count: number; rnd?: () => number }): NormTrial[] {
  const { target, level, count } = opts;
  const rnd = opts.rnd ?? Math.random;
  const pool = normPool(target, normTiers(level));
  if (pool.length === 0 || count <= 0) return [];
  const order = shuffle(pool, rnd);
  const fakes = Math.floor(count / 2);
  const out: NormTrial[] = [];
  const seen = new Set<string>();
  for (let k = 0; out.length < count && k < order.length * 3; k++) {
    const item = order[k % order.length]!;
    const isNorm = out.length >= fakes;
    const text = isNorm ? item.norm : item.form;
    if (seen.has(text) && k < order.length * 2) continue;
    seen.add(text);
    out.push({ text, isNorm, item });
  }
  return shuffle(out, rnd);
}
