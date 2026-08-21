/* psygames-stroop-colorblind · VER 1 · 22.08.2026 */
/**
 * СТРУП ОБЯЗАН БЫТЬ ИГРАБЕЛЕН ПРИ ДАЛЬТОНИЗМЕ — ИНАЧЕ ЗАДАЧА НЕРЕШАЕМА.
 *
 * 🔴 ЧТО НАШЛОСЬ 22.08.2026. В настройках написано дословно: «Действует там, где
 * цвет несёт смысл: судоку, SET, Струп, Висконсинский тест, Башня Лондона».
 * Из пяти названных игр четыре флаг читали, а Струп — не читал ВОВСЕ: слова
 * `colorblind` в экране не было ни разу. Обещание в настройках было, кода не было.
 *
 * Цена ошибки здесь выше, чем в других играх: в Струпе надо назвать ЦВЕТ ЧЕРНИЛ.
 * Замер обычной палитры с имитацией дальтонизма (Viénot): при дейтеранопии
 * минимальная разница между четырьмя цветами ΔE 11.0, при протанопии 8.4. Два
 * цвета из четырёх сливаются — правильный ответ невозможен в принципе.
 *
 * ⚠️ ПРОВЕРЯЕМ РАЗЛИЧИМОСТЬ, А НЕ СПИСОК ЦВЕТОВ. Сверка «палитра равна вот
 * этому» краснела бы на любой смене оттенка, включая правильную, и молчала бы о
 * том, ради чего всё делалось. Здесь считается ΔE между всеми парами ПОСЛЕ
 * имитации каждого из трёх видов дальтонизма.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

import { STROOP_PALETTES, stroopLabelColor } from '@/app/games/stroop';

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);

/** Матрицы имитации дальтонизма в линейном RGB (Viénot, Brettel, Mollon). */
const SIM: Record<string, number[][]> = {
  дейтеранопия: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  протанопия: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  тританопия: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
};

function lab(hex: string, kind?: string): [number, number, number] {
  let [r, g, b] = rgb(hex).map(lin);
  if (kind) {
    const M = SIM[kind];
    [r, g, b] = [0, 1, 2].map((i) => M[i][0] * r + M[i][1] * g + M[i][2] * b);
  }
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const minDelta = (hexes: string[], kind?: string) => {
  let m = Infinity;
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      m = Math.min(m, Math.hypot(...lab(hexes[i], kind).map((v, k) => v - lab(hexes[j], kind)[k])));
    }
  }
  return m;
};
const contrast = (bg: string, fg: string) => {
  const lum = (h: string) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(bg) + 0.05, lum(fg) + 0.05];
  return a > b ? a / b : b / a;
};

/** Ниже этого два цвета читаются как один. Замер обычной палитры давал 8.4. */
const MIN_DELTA_E = 25;

describe('Струп при дальтонизме', () => {
  const cb = STROOP_PALETTES.colorblind.map((c) => c.hex);
  const normal = STROOP_PALETTES.normal.map((c) => c.hex);

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(cb).toHaveLength(4);
    expect(normal).toHaveLength(4);
    expect(Object.keys(SIM)).toHaveLength(3);
  });

  it('🔴 палитра дальтонизма различима при КАЖДОМ из трёх видов', () => {
    const bad = Object.keys(SIM)
      .map((k) => [k, minDelta(cb, k)] as const)
      .filter(([, d]) => d < MIN_DELTA_E)
      .map(([k, d]) => `${k}: ΔE ${d.toFixed(1)} < ${MIN_DELTA_E}`);
    expect(bad).toEqual([]);
  });

  it('🔴 и при обычном зрении она тоже различима — режим не портит игру зрячим', () => {
    expect(minDelta(cb)).toBeGreaterThan(MIN_DELTA_E);
  });

  /**
   * Замер обычной палитры — не придирка к ней, а объяснение, зачем вторая:
   * если бы обычная и так проходила, отдельный режим был бы не нужен.
   */
  it('🔴 обычная палитра при дальтонизме и правда сливается — иначе режим не нужен', () => {
    const worst = Math.min(...Object.keys(SIM).map((k) => minDelta(normal, k)));
    expect(`обычная при дальтонизме ΔE ${worst < MIN_DELTA_E}`).toBe('обычная при дальтонизме ΔE true');
  });

  it('🔴 подпись читается на КАЖДОЙ кнопке обеих палитр', () => {
    const weak: string[] = [];
    for (const [name, pal] of Object.entries(STROOP_PALETTES)) {
      for (const c of pal) {
        const k = contrast(c.hex, stroopLabelColor(c.hex));
        if (k < 4.5) weak.push(`${name}/${c.name}: ${k.toFixed(1)} < 4.5`);
      }
    }
    expect(weak).toEqual([]);
  });

  it('имена цветов в обеих палитрах одни и те же — кнопки называются одинаково', () => {
    expect(STROOP_PALETTES.colorblind.map((c) => c.name)).toEqual(STROOP_PALETTES.normal.map((c) => c.name));
  });

  /** Экран обязан СПРАШИВАТЬ флаг, а не просто иметь вторую палитру в файле. */
  it('🔴 экран читает флаг дальтонизма, а не держит палитру мёртвым грузом', () => {
    const src = (readFileSync(join(__dirname, '../../app/games/stroop.tsx'), 'utf8') as string)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(/colorblind\s*\}\s*=\s*useTheme\(\)/.test(src)).toBe(true);
    expect(src).toContain('colorblind ? COLORS_CB : COLORS_DEF');
    // и генерация берёт выбранную палитру, а не жёстко обычную
    expect(/COLORS_DEF\[Math\.floor/.test(src)).toBe(false);
  });

});

/**
 * ТОТ ЖЕ ВОПРОС К «ПОИСКУ»: с 8-го уровня цель задаётся парой «форма + цвет»,
 * дистрактор делит с ней ровно один признак — значит цвет там несёт смысл
 * наравне с формой, и флаг обязан действовать.
 *
 * ⚠️ ЧЕСТНО О МАСШТАБЕ: обычная тройка проходит частые виды (дейтеранопия 34.7,
 * протанопия 45.1) и валится только на тританопии — 14.8. Вид редкий, но играть
 * человеку с ним было нечем, а флаг не помогал никак.
 */
describe('Поиск при дальтонизме', () => {
  const src = (readFileSync(join(__dirname, '../../app/games/visual-search.tsx'), 'utf8') as string)
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const palette = (name: string): string[] => {
    const m = src.match(new RegExp(name + "[^=]*=\\s*\\[([^\\]]*)\\]"));
    return m ? [...m[1].matchAll(/'(#[0-9a-f]{6})'/gi)].map((x) => x[1]) : [];
  };

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(palette('COLORS_ALL')).toHaveLength(3);
    expect(palette('COLORS_CB')).toHaveLength(3);
  });

  it('🔴 экран читает флаг и берёт вторую палитру', () => {
    expect(/colorblind\s*\}\s*=\s*useTheme\(\)/.test(src)).toBe(true);
    expect(src).toContain('colorblind ? COLORS_CB : COLORS_ALL');
    // и доска строится ВЫБРАННОЙ палитрой, а не глобальной
    expect(src).toContain('boardH, PALETTE)');
  });

  it('🔴 палитра дальтонизма различима при каждом из трёх видов', () => {
    const bad = Object.keys(SIM)
      .map((k) => [k, minDelta(palette('COLORS_CB'), k)] as const)
      .filter(([, d]) => d < MIN_DELTA_E)
      .map(([k, d]) => `${k}: ΔE ${d.toFixed(1)}`);
    expect(bad).toEqual([]);
  });

  /** Белый занят обычным режимом, где цвет не значит ничего: спутать нельзя. */
  it('🔴 ни один цвет конъюнкции не сливается с нейтральным белым', () => {
    const close = palette('COLORS_CB')
      .map((c) => [c, Math.min(...[undefined, ...Object.keys(SIM)].map((k) => minDelta([c, '#ffffff'], k as any)))] as const)
      .filter(([, d]) => d < 20)
      .map(([c, d]) => `${c}: до белого ΔE ${d.toFixed(1)}`);
    expect(close).toEqual([]);
  });
});
