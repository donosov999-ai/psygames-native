/**
 * ПЕРЕТАСКИВАНИЕ КЛАДЁТ ТОВАР В ТУ НИШУ, НА КОТОРУЮ ЕГО ОТПУСТИЛИ.
 *
 * ЗАЧЕМ. Ход в «Сортировке товаров» до сих пор делался двумя тапами: тап по
 * товару выбирает, тап по нише перекладывает. Тапу нишу называет сам React —
 * нажали на кнопку ниши №5, обработчик получил 5. Перетаскиванию не называет
 * НИКТО: жест отдаёт голые координаты экрана, и в какую нишу они попали, игра
 * считает арифметикой (`nicheAtPoint`). Отсюда два класса поломок, которых у
 * тапа не бывает в принципе:
 *
 *  1. 🔴 ПРОМАХ НА ОДНУ НИШУ. Ниши нумеруются по СУЩЕСТВУЮЩИМ: маска формы
 *     вырезает в шкафу дырки, и восьмая клетка сетки может быть шестой нишей.
 *     Промахнись нумерация на дырку — товар молча поедет не туда. Со стороны
 *     это неотличимо от «игра решила иначе»: анимация та же, ход засчитан,
 *     просто товар оказался в соседней ячейке.
 *  2. 🔴 РАСХОЖДЕНИЕ ДВУХ СПОСОБОВ ХОДА. Если перетаскивание заведёт свою
 *     проверку «а можно ли сюда», то однажды им пройдёт то, что тапом не
 *     проходит — например, в запертую нишу или в примёрзший ряд. Это читается
 *     не как две разных проверки, а как то, что игра сжульничала.
 *
 * ЧТО ТУТ НАСТОЯЩЕЕ. Геометрию гоняем живыми функциями экрана — `nicheAtPoint`,
 * `nicheRect`, `itemAtX` — на живых раскладках из `levelCfg` (все 60 уровней,
 * обе сетки: телефон и десктоп). Своей копии формулы попадания здесь нет: гейт,
 * который повторяет правило, зелен вслепую.
 *
 * ⚠️ Размеры ниши НЕ берём из вёрстки нарочно. Инвариант «центр ниши i
 * опознаётся как ниша i» обязан держаться при ЛЮБЫХ cellW/nicheH — иначе он
 * сломается на первом же экране другой ширины. Поэтому перебираем диапазон.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { nicheAtPoint, nicheRect, itemAtX, levelCfg, rowOfNiche, BoardGeom } from '@/src/games/goods-sort/core/level';

declare const __dirname: string;
declare function require(m: string): any;

const POOL = 8;                       // столько же товаров, сколько в боевых наборах
const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);
const PAD = 9, GAP = 9;               // styles.cabinet.padding / .gap, они же shelfRow.gap

/**
 * Раскладка уровня + доска заданного размера. `slack` — остаток от `floor` при
 * расчёте ширины ниши: ряд центрирован, и этот остаток делится по бокам. Он и
 * ловит самую подлую ошибку — промах в пару пикселей у крайних ниш.
 */
function board(cols: number, cellW: number, nicheH: number, rows: number, slack: number): BoardGeom {
  return { cols, rows, cellW, nicheH, pad: PAD, gap: GAP, boardW: 2 * PAD + cols * cellW + (cols - 1) * GAP + slack };
}

/** Все живые раскладки игры: 60 уровней × телефон/десктоп. */
const LAYOUTS = LEVELS.flatMap((L) => [false, true].map((narrow) => {
  const cfg = levelCfg(L, POOL, narrow);
  return { L, narrow, cols: cfg.cols, rows: cfg.rows, slots: cfg.slots, mask: cfg.mask as boolean[] };
}));

describe('перетаскивание: попадание в нишу', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    // Дырки в шкафу обязаны встречаться, иначе плотная нумерация не проверяется.
    const holed = LAYOUTS.filter((l) => l.mask.some((on) => !on));
    expect(holed.length).toBeGreaterThan(20);
    // И сетки должны быть разные — иначе проверен один частный случай.
    expect(new Set(LAYOUTS.map((l) => `${l.cols}x${l.rows}`)).size).toBeGreaterThanOrEqual(3);
  });

  /**
   * 🔴 ГЛАВНАЯ ПРОВЕРКА. Центр каждой ниши обязан опознаваться как ОНА САМА.
   * Ломается — товар уезжает не туда, и заметить это можно только глазами.
   */
  it('центр ниши опознаётся как эта же ниша — на всех формах и размерах', () => {
    for (const l of LAYOUTS) {
      // Размеры — по краям реального диапазона (замер 19.08: ниша от 42 до 118px).
      // Интересна тут не их середина, а `slack`: именно остаток от `floor` ломает
      // крайние ниши, и его перебираем целиком.
      for (const cellW of [42, 118]) {
        for (const nicheH of [46, 140]) {
          for (const slack of [0, 1, 3, 7]) {
            const g = board(l.cols, cellW, nicheH, l.rows, slack);
            for (let i = 0; i < l.slots; i++) {
              const r = nicheRect(i, g, l.mask)!;
              expect(r).not.toBeNull();
              const hit = nicheAtPoint(r.x + cellW / 2, r.y + nicheH / 2, g, l.mask);
              expect({ L: l.L, narrow: l.narrow, i, cellW, nicheH, slack, hit }).toEqual(
                { L: l.L, narrow: l.narrow, i, cellW, nicheH, slack, hit: i });
            }
          }
        }
      }
    }
  });

  /**
   * Дырка формы — не ниша. Отпустил товар над дыркой — он возвращается, а не
   * летит в соседнюю: сам шкаф в этом месте пустой, класть некуда.
   */
  it('дырка в форме не считается нишей', () => {
    let checked = 0;
    for (const l of LAYOUTS) {
      const g = board(l.cols, 79, 88, l.rows, 3);
      for (let pos = 0; pos < l.cols * l.rows; pos++) {
        if (l.mask[pos]) continue;
        const x = (PAD + (pos % l.cols) * (79 + GAP)) + 79 / 2;
        const y = (PAD + Math.floor(pos / l.cols) * (88 + GAP)) + 88 / 2;
        expect(nicheAtPoint(x, y, g, l.mask)).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  /**
   * Ниш ровно столько, сколько насчитал `levelCfg`, и они пронумерованы подряд
   * без пропусков. Считаем НЕ своей копией обхода маски, а перебором точек: так
   * ловится и сдвиг нумерации на дырку, и две ниши, схлопнутые в одну.
   */
  it('нумерация плотная и совпадает со `slots` уровня', () => {
    for (const l of LAYOUTS) {
      const g = board(l.cols, 79, 88, l.rows, 3);
      const seen = new Set<number>();
      for (let pos = 0; pos < l.cols * l.rows; pos++) {
        const x = (PAD + (pos % l.cols) * (79 + GAP)) + 79 / 2;
        const y = (PAD + Math.floor(pos / l.cols) * (88 + GAP)) + 88 / 2;
        const hit = nicheAtPoint(x, y, g, l.mask);
        if (hit !== null) seen.add(hit);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: l.slots }, (_, k) => k));
    }
  });

  /**
   * Сверка с ЧУЖОЙ функцией. `rowOfNiche` — та же, по которой `cellUsable`
   * определяет примёрзший ряд. Если геометрия перетаскивания и логика
   * препятствий разойдутся в понимании «какой это ряд», игрок увидит запрет не
   * там, где иней.
   */
  it('ряд ниши по геометрии совпадает с рядом по `rowOfNiche`', () => {
    for (const l of LAYOUTS) {
      const g = board(l.cols, 79, 88, l.rows, 0);
      for (let i = 0; i < l.slots; i++) {
        const r = nicheRect(i, g, l.mask)!;
        const rowByGeom = Math.round((r.y - PAD) / (88 + GAP));
        expect(rowByGeom).toBe(rowOfNiche(i, l.mask, l.cols));
      }
    }
  });

  /**
   * 🔴 РЯД СТОИТ ПО ЦЕНТРУ КОРОБА, А НЕ ПРИЖАТ К ЛЕВОМУ КРАЮ.
   *
   * Найдено мутацией 19.08.2026, и находка важнее самой поправки. Круговая
   * проверка «центр ниши i опознаётся как i» эту ошибку НЕ ЛОВИТ: начало
   * отсчёта одно на `nicheAtPoint` и `nicheRect`, и сдвинув его, сдвигаешь обе
   * стороны сразу — ошибка сокращается сама с собой, а гейт остаётся зелёным.
   * Пальцу же начало отсчёта никто не сдвинет: он придёт по настоящим
   * координатам экрана, и товар поедет не в ту нишу.
   *
   * Ловим СВОЙСТВОМ, а не копией формулы: `shelfRow` центрирует ряд, значит
   * поля слева и справа равны. Копия формулы сошлась бы с кодом и при общей
   * ошибке — ровно то, от чего страдает круговая проверка.
   */
  it('ряд ниш стоит по центру короба, а не прижат к краю', () => {
    let checked = 0;
    for (const l of LAYOUTS) {
      for (const slack of [0, 1, 3, 7]) {
        const g = board(l.cols, 79, 88, l.rows, slack);
        // Берём ряд, у которого целы обе крайние ниши — иначе поля мерить не по чему.
        for (let row = 0; row < l.rows; row++) {
          const a = row * l.cols, b = row * l.cols + l.cols - 1;
          if (!l.mask[a] || !l.mask[b]) continue;
          const first = nicheRect(l.mask.slice(0, a).filter(Boolean).length, g, l.mask)!;
          const last = nicheRect(l.mask.slice(0, b).filter(Boolean).length, g, l.mask)!;
          const leftGap = first.x, rightGap = g.boardW - (last.x + g.cellW);
          expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);   // floor даёт не больше пикселя
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  /** Отпустил мимо доски — товар возвращается, ход не тратится. */
  it('мимо доски — null', () => {
    const l = LAYOUTS[0];
    const g = board(l.cols, 79, 88, l.rows, 3);
    const w = g.boardW, h = 2 * PAD + l.rows * 88 + (l.rows - 1) * GAP;
    expect(nicheAtPoint(-20, 40, g, l.mask)).toBeNull();       // левее шкафа
    expect(nicheAtPoint(40, -20, g, l.mask)).toBeNull();       // выше шкафа
    expect(nicheAtPoint(w + 60, 40, g, l.mask)).toBeNull();    // правее шкафа
    expect(nicheAtPoint(40, h + 60, g, l.mask)).toBeNull();    // ниже шкафа
  });

  /**
   * Шов между нишами (9px) достаётся ЛЕВОЙ соседке — это решение, а не случай:
   * человек целил в нишу, а не в щель, и отменять из-за этого весь жест значит
   * наказывать за точность пальца. Проверяем, чтобы решение не отменили молча.
   */
  it('шов между нишами не проваливается в никуда', () => {
    const l = LAYOUTS.find((x) => x.mask.slice(0, 2).every(Boolean))!;
    const g = board(l.cols, 79, 88, l.rows, 0);
    const r0 = nicheRect(0, g, l.mask)!;
    expect(nicheAtPoint(r0.x + 79 + GAP / 2, r0.y + 44, g, l.mask)).toBe(0);
  });
});

describe('перетаскивание: за какой товар взялись', () => {
  /**
   * Тапом можно вынести СРЕДНИЙ товар из трёх. Перетаскивание не имеет права
   * уметь меньше — иначе два способа хода разойдутся по возможностям, и
   * человек, привыкший тащить, не сможет сделать ход, который делает сосед.
   */
  it('центр каждого товара опознаётся как он сам', () => {
    for (const cellW of [42, 79, 118]) {
      for (const itemSize of [18, 23, 36]) {
        for (let count = 1; count <= 3; count++) {
          const rowW = count * itemSize + (count - 1) * 2;
          const left = (cellW - rowW) / 2;
          for (let s = 0; s < count; s++) {
            const cx = left + s * (itemSize + 2) + itemSize / 2;
            expect({ cellW, itemSize, count, s, hit: itemAtX(cx, count, cellW, itemSize) })
              .toEqual({ cellW, itemSize, count, s, hit: s });
          }
        }
      }
    }
  });

  /** Чуть мимо — берём ближний, а не отменяем жест: товар шириной 18px пальцем не поймать. */
  it('за краем ряда берётся ближний товар', () => {
    expect(itemAtX(-40, 3, 79, 23)).toBe(0);
    expect(itemAtX(999, 3, 79, 23)).toBe(2);
  });

  it('в пустой нише брать нечего', () => {
    expect(itemAtX(40, 0, 79, 23)).toBeNull();
  });
});

/**
 * СТРУКТУРНЫЕ ГАРАНТИИ. Их нельзя проверить вызовом функции — они про то, как
 * жест сшит с экраном, — но именно они держат два требования, ради которых всё
 * и затевалось: тапы живы, и правила хода в ОДНОМ месте.
 */
describe('перетаскивание не отменяет тапы и не заводит своих правил', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;
  /** Комментарии выкидываем: слово в объяснении не должно засчитываться за код. */
  const code = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
  const dragBlock = code.slice(code.indexOf('const pan = useRef('), code.indexOf('}),\n  ).current;'));
  const moveBody = code.slice(code.indexOf('const moveItem = ('), code.indexOf('const handleItemTap'));

  it('есть что проверять — блок жеста найден', () => {
    expect(dragBlock.length).toBeGreaterThan(400);
    expect(moveBody.length).toBeGreaterThan(400);
  });

  /**
   * 🔴 ТАП ОБЯЗАН ОСТАТЬСЯ. Со скринридером перетащить нельзя в принципе:
   * озвучка забирает жест себе, а игрок ведёт экран по одной кнопке за раз.
   * Игра доступна сегодня и обязана остаться доступной завтра.
   */
  it('оба тап-обработчика по-прежнему висят на кнопках', () => {
    expect(code).toMatch(/onPress=\{\(\) => handleItemTap\(i, s\)\}/);
    expect(code).toMatch(/onPress=\{\(\) => handleCellTap\(i\)\}/);
  });

  it('ниша и товар остаются кнопками для озвучки', () => {
    const cellRender = code.slice(code.indexOf('const renderCell = ('), code.indexOf('const renderConfig'));
    expect((cellRender.match(/accessibilityRole="button"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(cellRender).toMatch(/accessibilityLabel=\{cellLabel\(i, cell\)\}/);
  });

  /**
   * Касание жест НЕ перехватывает — иначе короткий тап достался бы и кнопке, и
   * жесту, и один ход посчитался бы за два. Захват включается только после
   * DRAG_SLOP, то есть когда палец реально поехал.
   */
  it('короткий тап достаётся кнопке, а не жесту', () => {
    expect(dragBlock).toMatch(/onStartShouldSetPanResponder: \(\) => false/);
    expect(dragBlock).toMatch(/onMoveShouldSetPanResponderCapture: [^\n]*DRAG_SLOP/);
    const slop = Number((code.match(/const DRAG_SLOP = (\d+)/) || [])[1]);
    expect(slop).toBeGreaterThanOrEqual(4);   // меньше — дрожание руки читается как перетаскивание
    expect(slop).toBeLessThanOrEqual(20);     // больше — тащить приходится «с разбега»
  });

  /**
   * 🔴 ЕДИНСТВЕННАЯ ТОЧКА ПРАВДЫ. Жест обязан ходить через `moveItem`: там и
   * препятствия, и вместимость, и каскад, и счётчик ходов, и снятие замков, и
   * проверка цели. Своей проверки «а можно ли сюда» в блоке жеста быть не должно.
   */
  it('ход делает `moveItem`, а не сам жест', () => {
    expect(dragBlock).toMatch(/liveRef\.current\.move\(held\.cell, held\.idx, target\)/);
    expect(code).toMatch(/move: moveItem/);
    for (const forbidden of [/obstacles\[/, /frozen/, />= CAP/, /movesRef/, /setCells/, /goalMet/]) {
      expect(dragBlock).not.toMatch(forbidden);
    }
  });

  /** Ход стоит РОВНО один ход. Два инкремента — и лимит ходов съедается вдвое быстрее. */
  it('один ход считается один раз', () => {
    expect((moveBody.match(/movesRef\.current \+= 1/g) || []).length).toBe(1);
  });

  /**
   * Подсветка цели и сам ход спрашивают ОДНО И ТО ЖЕ. Иначе запертая ниша
   * обводится как доступная, товар летит в неё и отскакивает.
   */
  it('подсветка ниши считается тем же предикатом, что и ход', () => {
    // ⚠️ Смысл, а не запись: предикат может быть и стрелкой в одну строку, и
    // телом с ранними выходами — важно, что он один и что спрашивает обе стороны.
    expect(code).toMatch(/const canPlaceInto = \(fromCell: number, toCell: number\)/);
    const pred = code.slice(code.indexOf('const canPlaceInto'), code.indexOf('const moveItem'));
    expect(pred).toMatch(/cellUsable\(fromCell\)/);
    expect(pred).toMatch(/cellUsable\(toCell\)/);
    expect(code).toMatch(/const canDrop = !!held && canPlaceInto\(held\.cell, i\)/);
    expect(moveBody).toMatch(/if \(!canPlaceInto\(fromCell, toCell\)\)/);
  });

  /** Пока идёт карточка итога или партия не начата — тащить нечего. */
  it('жест выключен вне партии', () => {
    expect(code).toMatch(/live: phase === 'playing' && levelBanner === null/);
    expect(dragBlock).toMatch(/if \(!L\.live\) return;/);
  });
});
