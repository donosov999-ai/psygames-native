/**
 * 🔴 ЛИНИИ СЕТКИ СУДОКУ НЕ ЗАДАЮТСЯ ДРОБНОЙ ТОЧКОЙ.
 *
 * Два отчёта Валентины (2.22.1): «границы между числами гуляют, то появляются, то
 * исчезли» и «опять границы стёрлись где цифры 6».
 *
 * Причина не в цвете и не в теме: толщина стояла `0.5` — половина ЛОГИЧЕСКОЙ точки.
 * На экране плотности 2 это ровно пиксель, на 3 — полтора, и округление зависит от
 * того, куда попал край клетки: одна линия выходит в пиксель, соседняя в ноль.
 * `StyleSheet.hairlineWidth` — один физический пиксель на любой плотности.
 *
 * ⚠️ Гейт по коду, а не по прогону: увидеть это можно только на устройстве с
 * плотностью 3, а в тестовой среде плотность одна.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

describe('сетка судоку рисуется целыми пикселями', () => {
  const src: string = fs.readFileSync(path.join(__dirname, '../../app/games/sudoku.tsx'), 'utf8');
  // Читаем ТОЛЬКО описание клетки доски: в файле есть и другие рамки.
  const at = src.indexOf('borderRightWidth: variant');
  const блок = at === -1 ? '' : src.slice(at, at + 900);

  it('есть что проверять: описание границ клетки найдено', () => {
    expect(`блок найден: ${блок.length > 0}`).toBe('блок найден: true');
  });

  it('🔴 тонкая линия — hairlineWidth, а не дробная точка', () => {
    expect(блок).toContain('StyleSheet.hairlineWidth');
    const дробные = блок.match(/borderRightWidth[^,]*:\s*[\s\S]{0,160}?\b0?\.\d+\b/g) ?? [];
    expect(`дробных толщин: ${дробные.length}`).toBe('дробных толщин: 0');
  });

  it('🔴 граница блока и линия клетки различаются ЦВЕТОМ, а не только толщиной', () => {
    expect(блок).toContain('borderRightColor');
    expect(блок).toContain('borderBottomColor');
    expect(блок).toContain('colors.border');
  });
});
