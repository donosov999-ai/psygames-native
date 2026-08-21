/* psygames-dots-palette · VER 1 · 22.08.2026 */
/**
 * ЦВЕТА ПАР В «СОЕДИНИ ТОЧКИ» РАЗЛИЧИМЫ, А НЕ ПОХОЖИ.
 *
 * 🔴 ЧТО БЫЛО. Осмотр 21.08.2026: на доске 4×4 из трёх пар две читались как
 * «два красных» — `#be123c` и `#9d174d` (разница по CIELAB ΔE 22.8). Хуже был
 * `#0f766e` против `#047857`: ΔE 15.9, зелёный и бирюзовый. Символы (● против ✖)
 * их различали, но цвет человек читает первым, и поле выглядело мешаниной.
 *
 * ⚠️ МЕРИМ РАССТОЯНИЕ, А НЕ СРАВНИВАЕМ СПИСКИ. Проверка «палитра равна вот этому
 * списку» краснела бы на любой смене оттенка, включая правильную, и не сказала бы
 * ничего о главном — различимы ли цвета. Здесь считается ΔE по CIELAB между всеми
 * парами: соврать этому нельзя, а поменять цвет на другой различимый — можно.
 *
 * ⚠️ И КОНТРАСТ ЗНАЧКА. Внутри точки белый символ; если цвет пары окажется
 * светлым, символ исчезнет, и дальтоник останется вообще без опоры.
 */
import { DOTS_PAIR_STYLES } from '@/src/games/dots-connect/core/generator';

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lin);
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a: string, b: string) =>
  Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const contrastWhite = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
};

/** Ниже этого цвета спорят: замер 21.08 — худшая пара была 15.9 и читалась как один цвет. */
const MIN_DELTA_E = 28;

describe('палитра пар «Соедини точки»', () => {
  const colors = DOTS_PAIR_STYLES.map((s) => s.color);

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(colors.length).toBeGreaterThanOrEqual(8);
    expect(colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
  });

  it('🔴 никакие две пары не читаются как один цвет', () => {
    const clashes: string[] = [];
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const d = dE(colors[i], colors[j]);
        if (d < MIN_DELTA_E) clashes.push(`${colors[i]} и ${colors[j]}: ΔE ${d.toFixed(1)} < ${MIN_DELTA_E}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('🔴 белый значок внутри точки читается на каждом цвете', () => {
    const weak = colors
      .filter((c) => contrastWhite(c) < 4.5)
      .map((c) => `${c}: контраст ${contrastWhite(c).toFixed(1)} < 4.5`);
    expect(weak).toEqual([]);
  });

  /** Символ — вторая опора: цвет читают первым, но дальтонику остаётся форма. */
  it('🔴 у каждой пары свой символ, а не только свой цвет', () => {
    const symbols = DOTS_PAIR_STYLES.map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('цветов и символов поровну — пара без одного из двух не бывает', () => {
    expect(new Set(colors).size).toBe(colors.length);
  });
});
