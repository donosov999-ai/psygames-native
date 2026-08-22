/* psygames-targets-honest · VER 1 · 22.08.2026 */
/**
 * «МИШЕНИ»: ДОЛЯ МИШЕНЕЙ ЗАДАНА, ИСХОД НАСТОЯЩИЙ, ОШИБКИ СЧИТАЮТСЯ.
 *
 * 🔴 ТРИ ДЕФЕКТА, КАЖДЫЙ ЛОМАЛ СВОЁ:
 *
 * 1. С 21-го уровня вероятность мишени была ровно 1.0000. «Мишень» получалась
 *    сама собой из совпадения цветов; квадратов росло без потолка, цветов семь —
 *    и с восьми фигур совпадение стало неизбежным по принципу Дирихле.
 *    Стратегия «жать всегда» делалась безошибочной, и проба на ТОРМОЖЕНИЕ
 *    переставала мерить торможение.
 *
 * 2. После полного проигрыша экран поздравлял победой: признак «пройдено» не
 *    передавался, а умолчание — «да». Победный звук, засчитанная серия.
 *
 * 3. В историю писалось `errors: 0` константой — у игры ВСЕГДА ноль ошибок,
 *    сравнить себя с собой нечем, любой отчёт по ней врал.
 */
import { buildRoundColors } from '@/app/games/targets';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const PALETTE = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/** Есть ли совпадение цвета среди круга и квадратов — правило режима «поле». */
const hasRepeat = (r: { circle: string; squares: string[] }) =>
  new Set([r.circle, ...r.squares]).size < r.squares.length + 1;

describe('🔴 раунд строится ПОД задуманный исход', () => {
  it('поле: «не мишень» правда без совпадений — на всех размерах', () => {
    const bad: string[] = [];
    for (let ns = 2; ns <= PALETTE.length - 1; ns += 1) {
      for (let i = 0; i < 60; i += 1) {
        const r = buildRoundColors(ns, 'field', false, null, PALETTE);
        if (r.isTarget) bad.push(`ns=${ns}: помечен мишенью`);
        if (hasRepeat(r)) bad.push(`ns=${ns}: совпадение есть, а не должно`);
      }
    }
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it('поле: «мишень» правда с совпадением — на всех размерах', () => {
    const bad: string[] = [];
    for (let ns = 2; ns <= PALETTE.length - 1; ns += 1) {
      for (let i = 0; i < 60; i += 1) {
        const r = buildRoundColors(ns, 'field', true, null, PALETTE);
        if (!r.isTarget) bad.push(`ns=${ns}: не помечен мишенью`);
        if (!hasRepeat(r)) bad.push(`ns=${ns}: совпадения нет, а должно`);
      }
    }
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it('джокер: мишень содержит ПРЕЖНИЙ цвет, не-мишень не содержит', () => {
    for (let i = 0; i < 60; i += 1) {
      const hit = buildRoundColors(3, 'joker', true, 'a', PALETTE);
      expect(hit.squares).toContain('a');
      expect(hit.isTarget).toBe(true);
      const miss = buildRoundColors(3, 'joker', false, 'a', PALETTE);
      expect(miss.squares).not.toContain('a');
      expect(miss.isTarget).toBe(false);
    }
  });

  it('джокер: первый раунд мишенью быть не может — прежнего цвета нет', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(buildRoundColors(3, 'joker', true, null, PALETTE).isTarget).toBe(false);
    }
  });

  it('число квадратов всегда совпадает с заказанным', () => {
    for (let ns = 2; ns <= 6; ns += 1) {
      expect(buildRoundColors(ns, 'field', true, null, PALETTE).squares.length).toBe(ns);
      expect(buildRoundColors(ns, 'joker', false, 'a', PALETTE).squares.length).toBe(ns);
    }
  });
});

describe('🔴 фигур не больше, чем цветов', () => {
  const screen = code(read('../../app/games/targets.tsx'));

  it('число квадратов ограничено палитрой', () => {
    expect(screen).toMatch(/Math\.min\(wanted, COLORS\.length - 1\)/);
  });

  it('доля мишеней задана числом, а не выпадает из арифметики', () => {
    expect(screen).toMatch(/TARGET_RATE/);
    expect(screen).toMatch(/Math\.random\(\) < TARGET_RATE/);
    /**
     * ⚠️ И САМО ЗНАЧЕНИЕ, А НЕ ТОЛЬКО ИМЯ. Проверка на текст `Math.random() < TARGET_RATE`
     * зелена при ЛЮБОЙ константе, включая единицу — то есть ровно при той поломке,
     * ради которой пункт и заведён. Поймано мутацией 23.08.2026: `TARGET_RATE = 1`
     * проходил гейт насквозь. Доля мишеней обязана быть строго между нулём и единицей.
     */
    const rate = Number(/const TARGET_RATE = ([0-9.]+);/.exec(screen)?.[1]);
    expect(`доля мишеней ${rate}: строго между 0 и 1 — ${rate > 0 && rate < 1}`)
      .toBe(`доля мишеней ${rate}: строго между 0 и 1 — true`);
  });

  it('прежнего «совпало — значит мишень» больше нет', () => {
    expect(screen).not.toMatch(/target = new Set\(all\)\.size < all\.length/);
  });
});

describe('🔴 итог и история честные', () => {
  const screen = code(read('../../app/games/targets.tsx'));

  it('экран итога получает НАСТОЯЩИЙ исход', () => {
    expect(screen).toMatch(/passed=\{!gameOverRef\.current\}/);
  });

  it('ошибки считаются и уходят в историю', () => {
    expect(screen).toMatch(/errorsRef\.current \+= 1/);
    expect(screen).toMatch(/errors: errorsRef\.current/);
    expect(screen).not.toMatch(/errors: 0,/);
  });

  it('счётчик ошибок обнуляется на старте партии', () => {
    expect(screen).toMatch(/errorsRef\.current = 0/);
  });
});
