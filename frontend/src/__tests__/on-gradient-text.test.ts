/**
 * Арифметика подбора цвета поверх градиента — проверяется на числах.
 *
 * Гейт `on-gradient-contrast.test.ts` следит за экранами; здесь проверяется сам
 * инструмент: что он не врёт про контраст и не кладёт вуаль там, где она не нужна.
 */
import {
  onGradientText, onGradientTextMuted, contrastRatio, relativeLuminance, blend, withAlpha, AA_NORMAL,
} from '@/src/services/onGradientText';

/** Худшие градиенты из замера 19.08.2026 — по ним и била проблема. */
const WORST: [string, string, number][] = [
  ['#cb356b', '#bdfff3', 1.12],   // ospan
  ['#ee9ca7', '#ffdde1', 1.26],   // anagrams
  ['#fa709a', '#fee140', 1.31],   // counter
  ['#a8edea', '#fed6e3', 1.32],   // proofreading
  ['#4facfe', '#00f2fe', 1.39],   // mnemonics
  ['#f7971e', '#ffd200', 1.45],   // goods-sort / quick-count / phoneme-pairs
  ['#11998e', '#38ef7d', 1.52],   // digit-span / go-no-go
  ['#43cea2', '#185a9d', 1.98],   // eye-gym / set-game
  ['#7c3aed', '#ec4899', 3.53],   // attention-conflict
];

const worst = (c: string, ends: string[]) => Math.min(...ends.map((e) => contrastRatio(c, e)));

describe('onGradientText — арифметика', () => {
  it('контраст считается по WCAG, а не «на глаз»', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    // сокращённая запись и регистр не должны менять результат
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 5);
  });

  it('смешивание с прозрачностью — как у браузера, в sRGB', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(blend('#ff0000', '#00ff00', 0)).toBe('#00ff00');
    expect(blend('#ff0000', '#00ff00', 1)).toBe('#ff0000');
    expect(withAlpha('#112233', 0.25)).toBe('rgba(17, 34, 51, 0.25)');
  });

  it('🔴 на всех худших градиентах цвет берёт AA к ОБОИМ концам', () => {
    for (const [c1, c2, before] of WORST) {
      expect(worst('#ffffff', [c1, c2])).toBeCloseTo(before, 1);   // «было» воспроизводится
      const g = onGradientText(c1, c2);
      expect(g.ok).toBe(true);
      expect(worst(g.color, g.ends)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(g.ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('порядок концов не меняет качества — градиент можно объявить в любую сторону', () => {
    for (const [c1, c2] of WORST) {
      expect(onGradientText(c2, c1).ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('вуаль появляется ТОЛЬКО там, где сплошным цветом AA недостижим', () => {
    // тут сплошного хватает — вуали быть не должно
    for (const [c1, c2] of [['#ee9ca7', '#ffdde1'], ['#f7971e', '#ffd200'], ['#0f2027', '#2c5364']] as const) {
      expect(onGradientText(c1, c2).veil).toBeNull();
    }
    // а тут ни белый (1.98), ни чёрный (2.99) не берут — вуаль обязана быть
    const g = onGradientText('#43cea2', '#185a9d');
    expect(g.veil).not.toBeNull();
    expect(g.veilAlpha).toBeGreaterThan(0);
    expect(g.veilAlpha).toBeLessThanOrEqual(0.5);          // вуаль — вуаль, а не перекраска
    // концы под вуалью посчитаны честным смешиванием
    expect(g.ends[0]).toBe(blend(g.veil as string, '#43cea2', g.veilAlpha));
    expect(g.ends[1]).toBe(blend(g.veil as string, '#185a9d', g.veilAlpha));
  });

  it('вуаль сохраняет узнаваемость: она цветом самого градиента, не серая заливка', () => {
    const g = onGradientText('#43cea2', '#185a9d');
    // оттенок вуали недалеко от одного из концов градиента
    const near = Math.min(contrastRatio(g.veil as string, '#43cea2'), contrastRatio(g.veil as string, '#185a9d'));
    expect(near).toBeLessThan(2.2);
  });

  it('приглушённая подпись тоже держит AA — «второй план» не значит «нечитаемо»', () => {
    for (const [c1, c2] of WORST) {
      const g = onGradientText(c1, c2);
      const soft = onGradientTextMuted(g);
      expect(worst(soft, g.ends)).toBeGreaterThanOrEqual(AA_NORMAL);
      // тише основного = ближе к фону, но не за счёт нормы
      expect(worst(soft, g.ends)).toBeLessThanOrEqual(worst(g.color, g.ends) + 1e-9);
    }
  });

  /**
   * Граница, из-за которой «светлый или тёмный» решает не всё. Сплошной тёмный
   * текст возможен, только пока ТЁМНЫЙ конец ещё достаточно светлый, и наоборот.
   * Проверяем не формулу в комментарии, а поведение функции на самой границе.
   */
  it('там, где сплошной цвет арифметически невозможен, функция не делает вид, что всё хорошо', () => {
    const solidPossible = (c1: string, c2: string) => Math.max(
      Math.min(contrastRatio('#000000', c1), contrastRatio('#000000', c2)),
      Math.min(contrastRatio('#ffffff', c1), contrastRatio('#ffffff', c2)),
    ) >= AA_NORMAL;
    for (const [c1, c2] of [...WORST, ['#2d6a4f', '#95d5b2'], ['#3a1c71', '#d76d77']] as [string, string][]) {
      const g = onGradientText(c1, c2);
      expect(g.veil === null).toBe(solidPossible(c1, c2));
    }
  });

  it('одинаковые концы — тоже градиент (сплошная заливка) и тоже читается', () => {
    const g = onGradientText('#4facfe', '#4facfe');
    expect(worst(g.color, g.ends)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
