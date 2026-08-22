/* psygames-trail-nodes-dont-overlap · VER 1 · 22.08.2026 */
/**
 * УЗЛЫ «ТРОПИНОК» НЕ НАКЛАДЫВАЮТСЯ — И ЭТО ДОКАЗЫВАЕТСЯ, А НЕ ОБЕЩАЕТСЯ.
 *
 * 🔴 ЧТО НАШЛОСЬ. В коде стояло «узлы гарантированно не накладываются». Сетка разводила
 * ЦЕНТРЫ, а накладывались КРУЖКИ: диаметр 44 был константой и о размере ячейки не знал.
 * Замер по 200 раскладок на размер канвы:
 *
 *     канва 328×352 (телефон 360×640), 22 узла → минимальное расстояние 39,3 при
 *                                                диаметре 44; перекрытие в 88,5 %
 *     канва 358×460 (телефон 390×844), 22 узла → 0 %
 *
 * Беда жила только на мелком экране — потому её и не видели. Хуже того, «гарантия» была
 * случайной: 25 узлов ложились ЛУЧШЕ 22 (7 % против 88,5 %), потому что число колонок
 * случайно попадало удачнее. Наложенный узел оказывается под соседом и не нажимается —
 * а это проба на время, где застрять негде.
 *
 * Теперь разведение выводится: колонки берём те, что дают самую крупную ячейку, диаметр
 * подчиняем ячейке, а дрожание ограничиваем так, что
 *
 *     расстояние ≥ ячейка · (1 − дрожание) ≥ диаметр.
 *
 * ⚠️ И РАЗБРОС СОХРАНЯЕМ. Развести можно и решёткой (дрожание в ноль) — тогда наложений
 * тоже нет, но поиск идёт рядами, и проба перестаёт быть пробой. Поэтому сперва отдаём
 * диаметр, и только упёршись в нижнюю границу — разброс.
 */
import { makeNodes, JITTER_MAX, LAYOUT_PAD, NODE_MAX, NODE_MIN } from '@/app/games/trail-making';

/** Канвы: `playW = min(ширина−32, 600)`, `playH = min(высота·0.55, 460)`. */
const CANVAS: Array<[string, number, number]> = [
  ['крошечное окно 272×472', 240, 260],
  ['узкий 320×568', 288, 312],
  ['мелкий 360×640', 328, 352],
  ['обычный 390×844', 358, 460],
  ['крупный 430×932', 398, 460],
  ['планшет', 600, 460],
];
const RUNS: Array<['A' | 'B', number]> = [['A', 15], ['A', 22], ['A', 25], ['B', 8], ['B', 11], ['B', 13]];
const TRIES = 60;

describe('«Тропинки»: раскладка узлов', () => {
  it('есть что проверять — узлов много и они разные', () => {
    const l = makeNodes('B', 11, 'ru', 358, 460);
    expect(l.nodes.length).toBe(22);
    expect(new Set(l.nodes.map((n) => n.label)).size).toBe(22);
  });

  it('🔴 ни в одной раскладке два узла не ближе своего диаметра', () => {
    const bad: string[] = [];
    for (const [name, w, h] of CANVAS) {
      for (const [mode, count] of RUNS) {
        let worst = Infinity;
        for (let k = 0; k < TRIES; k++) {
          const { nodes, size } = makeNodes(mode, count, 'ru', w, h);
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const d = Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y);
              if (d < worst) worst = d;
              if (d < size && bad.length < 3) bad.push(`${name} ${mode}/${count}: ${d.toFixed(1)} при диаметре ${size.toFixed(1)}`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 кружок остаётся нажимаемым и не раздувается', () => {
    for (const [name, w, h] of CANVAS) {
      for (const [mode, count] of RUNS) {
        const { size } = makeNodes(mode, count, 'ru', w, h);
        expect(`${name} ${mode}/${count}: ${size >= NODE_MIN && size <= NODE_MAX}`).toBe(`${name} ${mode}/${count}: true`);
      }
    }
  });

  it('🔴 узел целиком внутри канвы — иначе до него не дотянуться', () => {
    const bad: string[] = [];
    for (const [name, w, h] of CANVAS) {
      for (const [mode, count] of RUNS) {
        for (let k = 0; k < TRIES; k++) {
          const { nodes, size } = makeNodes(mode, count, 'ru', w, h);
          for (const n of nodes) {
            const out = n.x - size / 2 < 0 || n.y - size / 2 < 0 || n.x + size / 2 > w || n.y + size / 2 > h;
            if (out && bad.length < 3) bad.push(`${name} ${mode}/${count}: узел ${n.label} в (${n.x.toFixed(0)},${n.y.toFixed(0)})`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА: развести можно и решёткой. Тогда узлы стоят рядами, и поиск
   * идёт не глазами по полю, а по строкам — это уже другая проба. Требуем, чтобы у
   * подавляющего большинства узлов координаты были свои.
   */
  it('🔴 раскладка не выродилась в решётку', () => {
    for (const [name, w, h] of CANVAS) {
      for (const [mode, count] of RUNS) {
        const { size, jitter, nodes } = makeNodes(mode, count, 'ru', w, h);
        // Разброс отдаём ТОЛЬКО упёршись в нижнюю границу диаметра — иначе он полный.
        const ok = size > NODE_MIN ? jitter >= JITTER_MAX - 1e-9 : jitter >= 0;
        expect(`${name} ${mode}/${count}: диаметр ${size.toFixed(1)}, разброс ${jitter.toFixed(3)} → ${ok}`)
          .toBe(`${name} ${mode}/${count}: диаметр ${size.toFixed(1)}, разброс ${jitter.toFixed(3)} → true`);
        // и он действительно применён: координаты не садятся на решётку
        if (jitter > 0) {
          expect(new Set(nodes.map((n) => n.x)).size).toBe(nodes.length);
          expect(new Set(nodes.map((n) => n.y)).size).toBe(nodes.length);
        }
      }
    }
  });

  /**
   * ⚠️ КРУЖОК НЕ ДОЛЖЕН БЫТЬ МЕЛЬЧЕ, ЧЕМ ВЫНУЖДЕН. Развести узлы можно и ужав их
   * заранее — наложений не будет, но играть станет мельче без всякой причины. Оракул
   * независимый: перебираем ВСЕ разбиения на колонки и берём самую крупную ячейку.
   */
  it('🔴 ячейка выбрана самая крупная из возможных', () => {
    for (const [name, w, h] of CANVAS) {
      for (const [mode, count] of RUNS) {
        const { nodes, cell } = makeNodes(mode, count, 'ru', w, h);
        const gw = Math.max(1, w - LAYOUT_PAD * 2), gh = Math.max(1, h - LAYOUT_PAD * 2);
        let best = 0;
        for (let k = 1; k <= nodes.length; k++) best = Math.max(best, Math.min(gw / k, gh / Math.ceil(nodes.length / k)));
        expect(`${name} ${mode}/${count}: ${cell.toFixed(2)} из ${best.toFixed(2)}`).toBe(`${name} ${mode}/${count}: ${best.toFixed(2)} из ${best.toFixed(2)}`);
      }
    }
  });

  it('🔴 узлов ровно столько, сколько заказано, и метки не повторяются', () => {
    for (const [mode, count] of RUNS) {
      const { nodes } = makeNodes(mode, count, 'ru', 358, 460);
      const want = mode === 'A' ? count : count * 2;
      expect(`${mode}/${count}: ${nodes.length} меток, различных ${new Set(nodes.map((n) => n.label)).size}`)
        .toBe(`${mode}/${count}: ${want} меток, различных ${want}`);
    }
  });

  /** Правило одно: экран рисует кружок ровно того размера, подо что разведены центры. */
  it('🔴 экран берёт диаметр из раскладки, а не из числа в стиле', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/trail-making.tsx'), 'utf8');
    const body = src.slice(src.indexOf('styles.node,'));
    expect(body).toMatch(/left: n\.x - nodeSize \/ 2/);
    expect(body).toMatch(/width: nodeSize/);
    expect(body).not.toMatch(/left: n\.x - 22/);
  });
});

declare const __dirname: string;
declare function require(id: string): any;
