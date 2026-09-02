/**
 * 🔴 ТРИ ПРИЁМА ИЗ ВОЛН 1–2, КОТОРЫЕ ДЕЛАЮТ ПАРТИЮ ЖИВОЙ.
 *
 * Выбор Дениса 02.09.2026 из плана: свечение подсказки (1.7), трещины на замке (1.8),
 * разбор сцены (2.6). Все три взяты с разбора эталона жанра и все три про одно —
 * событие должно быть ВИДНО, а не выведено из цифры.
 *
 * ⚠️ Гейт проверяет то, что ломается молча:
 *  · трещины ДЕТЕРМИНИРОВАНЫ — случайные дёргались бы на каждом ходу, и разрушение
 *    читалось бы как рябь;
 *  · разъезд УВОДИТ ряды за край доски, а не останавливает их посередине;
 *  · щадящий режим пропускает разъезд — итог не должен ждать анимацию.
 */
import React from 'react';
import Cracks from '../components/juice/Cracks';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ИГРА = fs.readFileSync(path.join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;

/** Достаём линии трещин из отрисованного дерева, не поднимая экран целиком. */
function линии(progress: number, cellKey: number): any[] {
  const el = Cracks({ size: 100, progress, cellKey }) as any;
  if (!el) return [];
  const дети = el.props?.children ?? [];
  return (Array.isArray(дети) ? дети : [дети]).filter(Boolean);
}

describe('сок партии: свечение, трещины, разбор сцены', () => {
  it('🔴 трещины растут вместе с разрушением', () => {
    expect(линии(0, 3).length).toBe(0);            // целый замок — без трещин
    const мало = линии(0.2, 3).length;
    const средне = линии(0.5, 3).length;
    const много = линии(0.9, 3).length;
    expect(мало).toBeGreaterThan(0);
    expect(средне).toBeGreaterThan(мало);
    expect(много).toBeGreaterThan(средне);
  });

  it('🔴 рисунок трещин детерминирован: не дёргается между перерисовками', () => {
    const a = JSON.stringify(линии(0.6, 7).map((x: any) => x.props.style));
    const b = JSON.stringify(линии(0.6, 7).map((x: any) => x.props.style));
    expect(a).toBe(b);
    // …и при этом РАЗНЫЙ у разных ниш — иначе доска выглядит штампованной.
    const c = JSON.stringify(линии(0.6, 8).map((x: any) => x.props.style));
    expect(c).not.toBe(a);
  });

  it('🔴 подсказка светится, а не только обведена рамкой', () => {
    expect(ИГРА).toMatch(/hint\?\.toCell === i \|\| aimed/);
    expect(ИГРА).toMatch(/shadowOpacity: 0\.85/);
  });

  it('🔴 разъезд уводит ряды ЗА край доски и уважает щадящий режим', () => {
    // Сдвиг считается от ширины поля, а не константой: иначе на планшете ряд
    // остановится посреди экрана.
    expect(ИГРА).toMatch(/outputRange: \[0, \(row % 2 === 0 \? -1 : 1\) \* \(boardW \+ 60\)\]/);
    // Щадящий режим показывает итог сразу, без ожидания анимации.
    expect(ИГРА).toMatch(/if \(reduced\) \{\s*\n\s*setLevelBanner\(done\);/);
    // Новая доска приезжает собранной.
    expect(ИГРА).toMatch(/scatter\.setValue\(0\)/);
  });
});
