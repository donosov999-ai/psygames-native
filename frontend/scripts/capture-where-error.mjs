#!/usr/bin/env node
/* psygames-capture-where-error · VER 3 · 17.09.2026 */
/**
 * «ГДЕ ОШИБКА?» — СНИМОК С МОСТА ДЛЯ ПРОБЫ `puzzle-where-error` (задача 9022b6ff).
 *
 *   node scripts/capture-where-error.mjs   → src/__tests__/tatham-where-error.generated.json
 *
 * Под jest мост не играет (`psy_generate` → 0), поэтому поведение снимается здесь, в node, и привязывается
 * к md5 моста: пересобрали мост без пересъёмки — проба краснеет.
 *
 * Для каждого режима из `ЦВЕТ_ЛИНИИ` (первая ступень, зерно 5) линии ставятся по очереди, пока не найдутся ВЕРНАЯ
 * (есть в решении) и НЕВЕРНАЯ (нет в решении); после каждой пробы ход отменяется:
 *   · «Галактики» — внутренние вертикальные границы клеток, тычком в шов;
 *   · «Мосты» — мост протяжкой между соседними островами строки или столбца.
 * На каждой пробе: рисунок доски, рисунок решения, возврат после отмены решения (рисунок и позиция), цвета
 * поставленной линии и `точка` — середина поставленной линии, её обязана накрыть рамка.
 * «Мосты» дополнительно: `перегруз` — двойной мост, после которого у острова мосты красные (COL_WARNING, 8):
 * сверка обязана видеть и красные куски, иначе на перегруженной доске сказала бы «лишних нет».
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');
const ВЫХОД = path.join(ЗДЕСЬ, '../src/__tests__/tatham-where-error.generated.json');

const M = await require_(МОСТ)();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
const рисунок = () => строка(M.ccall('psy_draw', 'number', [], []));
const жест = (x, y, вид) => M.ccall('psy_pointer', 'number', ['number', 'number', 'number'], [Math.round(x), Math.round(y), вид]);
const позиция = () => M.ccall('psy_statepos', 'number', [], []);
const движки = new Map();
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) движки.set(M.ccall('psy_name', 'string', ['number'], [i]), i);

/** Прямоугольники рисунка: ключ «x y ш в» → цвет. */
const прямоугольники = (рис) => new Map(рис.split('\n').filter((l) => l.startsWith('R ')).map((l) => {
  const ч = l.split(' ');
  return [`${ч[1]} ${ч[2]} ${ч[3]} ${ч[4]}`, Number(ч[5])];
}));

/** Кандидаты линий режима: как поставить и где середина. */
function кандидаты(имя, начало) {
  if (имя === 'Galaxies') {
    // Клетки — фоновые квадраты самого частого размера.
    const квадраты = [...прямоугольники(начало).keys()].map((к) => к.split(' ').map(Number)).filter((r) => r[2] === r[3] && r[2] > 8);
    const размеры = new Map(); for (const r of квадраты) размеры.set(r[2], (размеры.get(r[2]) ?? 0) + 1);
    const клетка = [...размеры].sort((a, b) => b[1] - a[1])[0][0];
    const клетки = квадраты.filter((r) => r[2] === клетка);
    const xs = [...new Set(клетки.map((r) => r[0]))].sort((a, b) => a - b);
    const ys = [...new Set(клетки.map((r) => r[1]))].sort((a, b) => a - b);
    return ys.flatMap((y) => xs.slice(1).map((x) => ({
      поставить: () => { жест(x, y + клетка / 2, 0); жест(x, y + клетка / 2, 2); },
      точка: { x, y: y + клетка / 2 },
    })));
  }
  if (имя === 'Bridges') {
    // Острова — самые крупные круги; движок рисует остров несколько раз под разными обрезками, поэтому без повторов.
    const круги = начало.split('\n').filter((l) => l.startsWith('C ')).map((l) => l.split(' ').map(Number));
    const r = Math.max(...круги.map((c) => c[3]));
    const острова = [...new Map(круги.filter((c) => c[3] === r).map((c) => [`${c[1]} ${c[2]}`, { x: c[1], y: c[2] }])).values()];
    const пары = [];
    for (const а of острова) {
      const справа = острова.filter((б) => б.y === а.y && б.x > а.x).sort((p, q) => p.x - q.x)[0];
      const снизу = острова.filter((б) => б.x === а.x && б.y > а.y).sort((p, q) => p.y - q.y)[0];
      for (const б of [справа, снизу]) if (б) пары.push([а, б]);
    }
    return пары.map(([а, б]) => ({
      поставить: () => { жест(а.x, а.y, 0); жест(б.x, б.y, 1); жест(б.x, б.y, 2); },
      точка: { x: (а.x + б.x) / 2, y: (а.y + б.y) / 2 },
    }));
  }
  throw new Error(`нет способа ставить линии режиму ${имя}`);
}

const режимы = {};
for (const [имя, зерно] of [['Galaxies', 5], ['Bridges', 5]]) {
  const i = движки.get(имя);
  const параметры = строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [i, 0]));
  M.ccall('psy_open', 'number', ['number', 'string', 'number'], [i, параметры, зерно]);
  const пробы = {};
  for (const к of кандидаты(имя, рисунок())) {
    if (пробы.верная && пробы.неверная) break;
    const до = рисунок(); const позДо = позиция();
    к.поставить();
    if (позиция() === позДо) continue;
    const доска = рисунок(); const позДоски = позиция();
    const было = прямоугольники(до);
    const новые = [...прямоугольники(доска)].filter(([ключ, цвет]) => было.get(ключ) !== цвет);
    M.ccall('psy_solve', 'number', [], []);
    const решение = рисунок();
    M.ccall('psy_undo', 'number', [], []);
    const после = рисунок();
    const вРешении = прямоугольники(решение);
    const лишних = новые.filter(([ключ]) => !вРешении.has(ключ)).length;
    const вид = лишних ? 'неверная' : 'верная';
    if (!пробы[вид]) {
      пробы[вид] = {
        точка: к.точка,
        цветаНовых: [...new Set(новые.map(([, цвет]) => цвет))].sort((a, b) => a - b),
        доска, решение,
        вернулосьРисунком: после === доска,
        вернулосьПозицией: позиция() === позДоски,
      };
    }
    M.ccall('psy_undo', 'number', [], []);   // убрать поставленную линию перед следующей пробой
  }
  // «Мосты»: перегруженный остров — мосты у него движок красит COL_WARNING (8). Двойные мосты по очереди, пока
  // у какого-нибудь острова мосты не покраснеют (двойной мост к острову с числом 1 перегружает его).
  if (имя === 'Bridges') {
    for (const к of кандидаты(имя, рисунок())) {
      if (пробы.перегруз) break;
      const позДо = позиция();
      к.поставить(); к.поставить();          // второй раз по тому же пролёту — двойной мост
      const доска = рисунок();
      const красных = [...прямоугольники(доска).values()].filter((ц) => ц === 8).length;
      if (красных) {
        M.ccall('psy_solve', 'number', [], []);
        const решение = рисунок();
        M.ccall('psy_undo', 'number', [], []);
        пробы.перегруз = { точка: к.точка, красных, доска, решение, вернулосьРисунком: рисунок() === доска };
      }
      while (позиция() > позДо) M.ccall('psy_undo', 'number', [], []);
    }
  }
  режимы[имя] = { параметры, зерно, ...пробы };
}

const md5 = createHash('md5').update(readFileSync(МОСТ)).digest('hex');
writeFileSync(ВЫХОД, JSON.stringify({ мост: md5, режимы }, null, 1) + '\n');
for (const [имя, р] of Object.entries(режимы)) {
  console.log(`${имя} ${р.параметры}#${р.зерно}: верная ${р.верная ? 'есть' : 'НЕТ'}, неверная ${р.неверная ? 'есть' : 'НЕТ'}; ` +
    `вернулось ${р.неверная?.вернулосьРисунком}/${р.неверная?.вернулосьПозицией}; цвета линии ${р.неверная?.цветаНовых} / ${р.верная?.цветаНовых}`);
}
console.log('→', path.relative(process.cwd(), ВЫХОД), 'мост', md5);
