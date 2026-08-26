/* psygames-nback-sequence-gate · VER 1 · 26.08.2026 */
/**
 * ДОЛЯ ЦЕЛЕЙ В N-BACK ПОСТОЯННА, А ЛУРЫ ЗАДАНЫ, А НЕ СЛОЖИЛИСЬ.
 *
 * 🔴 ЗАЧЕМ. Аудит 21.08.2026 (`PSYGAMES_DEFECTS.md` §3): экран собирал стимулы по
 * одному прямо при подаче, и отказ от случайного совпадения делался ВТОРЫМ
 * броском монеты — `while (… && Math.random() < 0.5)`. Совпадение выживало с
 * вероятностью около 1/17, заявленные 30% превращались в ~34%, и доля ПЛАВАЛА
 * от блока к блоку.
 *
 * Цена: d′ считается из долей попаданий и ложных тревог. Разная доля целей в
 * двух блоках делает их d′ несравнимыми — и «прогресс» игрока частично
 * оказывается шумом генератора. N-back здесь флагман научного обоснования
 * (Jaeggi et al., 2008), генератор обязан быть безупречным.
 *
 * ⚠️ ПРОВЕРЯЕМ ГОТОВУЮ ПОСЛЕДОВАТЕЛЬНОСТЬ, А НЕ НАМЕРЕНИЕ. Считать «сколько
 * позиций мы пометили целями» бессмысленно: беда была именно в том, что
 * ФАКТИЧЕСКИХ совпадений оказывалось больше помеченных. Поэтому ниже независимый
 * пересчёт по массиву (`countMatches` / `countLures`), а не сверка со списком.
 */
import {
  buildNbackSequence, countMatches, countLures, MATCH_RATE, lureRateFor,
} from '@/src/games/nback/sequence';

/** Простой воспроизводимый ГПСЧ: проверка не должна зависеть от везения. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ALPHABET = 9;
const TRIALS = 40;

describe('n-back: последовательность по квоте', () => {
  it('есть что проверять — блок строится и заполнен целиком', () => {
    const seq = buildNbackSequence(TRIALS, 2, ALPHABET, seeded(1));
    expect(seq.items.length).toBe(TRIALS);
    expect(seq.items.every((v) => v >= 0 && v < ALPHABET)).toBe(true);
  });

  it('🔴 фактических совпадений РОВНО столько, сколько заказано — на всех глубинах и зёрнах', () => {
    const bad: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      for (let seed = 1; seed <= 25; seed++) {
        const seq = buildNbackSequence(TRIALS, n, ALPHABET, seeded(seed));
        const eligible = TRIALS - n;
        const want = Math.round(eligible * MATCH_RATE);
        const got = countMatches(seq.items, n);
        if (got !== want) bad.push(`n=${n} зерно=${seed}: заказано ${want}, вышло ${got}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 луров ровно столько, сколько заказано глубиной', () => {
    const bad: string[] = [];
    for (const n of [2, 3, 4]) {
      for (let seed = 1; seed <= 25; seed++) {
        const seq = buildNbackSequence(TRIALS, n, ALPHABET, seeded(seed));
        const want = Math.round((TRIALS - n) * lureRateFor(n));
        const got = countLures(seq.items, n);
        if (got !== want) bad.push(`n=${n} зерно=${seed}: заказано ${want}, вышло ${got}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 доля целей НЕ зависит от уровня — она не ручка сложности', () => {
    // Тот же дефект, что чинился в пяти конфликтных играх: доля проб задаёт
    // величину измеряемого эффекта, поэтому крутить ею сложность нельзя.
    const rates = [1, 2, 3, 4].map((n) => {
      const seq = buildNbackSequence(TRIALS, n, ALPHABET, seeded(7));
      return countMatches(seq.items, n) / (TRIALS - n);
    });
    for (const r of rates) expect(Math.abs(r - MATCH_RATE)).toBeLessThan(0.02);
  });

  it('🔴 проверка живая: прежний способ на тех же числах доли НЕ держит', () => {
    /**
     * Без этого «доля совпала» могло бы означать, что совпасть иначе и нельзя.
     * Воспроизводим прежний алгоритм экрана — бросок на матч плюс второй бросок,
     * отвергающий случайное совпадение лишь в половине случаев, — и требуем,
     * чтобы доля от заказанной ОТКЛОНЯЛАСЬ.
     */
    const rng = seeded(3);
    const n = 2;
    let worst = 0;
    for (let block = 0; block < 40; block++) {
      const items: number[] = [];
      for (let i = 0; i < TRIALS; i++) {
        const canMatch = i >= n;
        if (canMatch && rng() < MATCH_RATE) { items.push(items[i - n]); continue; }
        let v: number;
        do { v = Math.floor(rng() * ALPHABET); }
        while (canMatch && v === items[i - n] && rng() < 0.5);
        items.push(v);
      }
      const rate = countMatches(items, n) / (TRIALS - n);
      worst = Math.max(worst, Math.abs(rate - MATCH_RATE));
    }
    // Прежний способ промахивается заметно — иначе чинить было бы нечего.
    expect(worst).toBeGreaterThan(0.05);
  });

  it('🔴 позиция не бывает целью и приманкой одновременно', () => {
    // Иначе игрок не может ответить однозначно, и проба не измеряет ничего.
    for (let seed = 1; seed <= 20; seed++) {
      const seq = buildNbackSequence(TRIALS, 3, ALPHABET, seeded(seed));
      const both = seq.matchAt.filter((i) => seq.lureAt.includes(i));
      expect(both).toEqual([]);
    }
  });
});
