#!/usr/bin/env node
/* psygames-capture-where-error · VER 1 · 17.09.2026 */
/**
 * «ГДЕ ОШИБКА?» — СНИМОК С МОСТА ДЛЯ ПРОБЫ `puzzle-where-error` (задача 9022b6ff).
 *
 *   node scripts/capture-where-error.mjs   → src/__tests__/tatham-where-error.generated.json
 *
 * Под jest мост не играет (`psy_generate` → 0), поэтому поведение снимается здесь, в node, и привязывается
 * к md5 моста: пересобрали мост без пересъёмки — проба краснеет.
 *
 * Для каждого режима из `ЦВЕТ_ЛИНИИ` (сейчас «Галактики», первая ступень, зерно 5):
 *   · ставятся внутренние вертикальные границы по очереди, пока не найдутся ВЕРНАЯ (есть в решении) и
 *     НЕВЕРНАЯ (нет в решении); после каждой пробы ход отменяется;
 *   · на каждой: рисунок доски, рисунок решения (решить), рисунок после отмены решения и позиции в истории;
 *   · номер цвета, которым движок нарисовал поставленную границу, — им проба сверяет `ЦВЕТ_ЛИНИИ`.
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
const тап = (x, y) => { жест(x, y, 0); жест(x, y, 2); };
const позиция = () => M.ccall('psy_statepos', 'number', [], []);
const движки = new Map();
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) движки.set(M.ccall('psy_name', 'string', ['number'], [i]), i);

/** Прямоугольники рисунка: ключ «x y ш в» → цвет. */
const прямоугольники = (рис) => new Map(рис.split('\n').filter((l) => l.startsWith('R ')).map((l) => {
  const ч = l.split(' ');
  return [`${ч[1]} ${ч[2]} ${ч[3]} ${ч[4]}`, Number(ч[5])];
}));

const режимы = {};
for (const [имя, зерно] of [['Galaxies', 5]]) {
  const i = движки.get(имя);
  const параметры = строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [i, 0]));
  M.ccall('psy_open', 'number', ['number', 'string', 'number'], [i, параметры, зерно]);
  const начало = рисунок();
  // Клетки — фоновые квадраты самого частого размера (у «Галактик» фон клетки рисуется прямоугольником ш = в).
  const квадраты = [...прямоугольники(начало).keys()].map((к) => к.split(' ').map(Number)).filter((r) => r[2] === r[3] && r[2] > 8);
  const размеры = new Map(); for (const r of квадраты) размеры.set(r[2], (размеры.get(r[2]) ?? 0) + 1);
  const клетка = [...размеры].sort((a, b) => b[1] - a[1])[0][0];
  const клетки = квадраты.filter((r) => r[2] === клетка);
  const xs = [...new Set(клетки.map((r) => r[0]))].sort((a, b) => a - b);
  const ys = [...new Set(клетки.map((r) => r[1]))].sort((a, b) => a - b);
  const пробы = {};
  for (let yi = 0; yi < ys.length && !(пробы.верная && пробы.неверная); yi++) {
    for (let xi = 1; xi < xs.length && !(пробы.верная && пробы.неверная); xi++) {
      const до = рисунок(); const позДо = позиция();
      тап(xs[xi], ys[yi] + клетка / 2);
      if (позиция() === позДо) continue;
      const доска = рисунок(); const позДоски = позиция();
      const было = прямоугольники(до);
      const новые = [...прямоугольники(доска)].filter(([к]) => !было.has(к));
      M.ccall('psy_solve', 'number', [], []);
      const решение = рисунок();
      M.ccall('psy_undo', 'number', [], []);
      const после = рисунок();
      const вРешении = прямоугольники(решение);
      const лишних = новые.filter(([к]) => !вРешении.has(к)).length;
      const вид = лишних ? 'неверная' : 'верная';
      if (!пробы[вид]) {
        пробы[вид] = {
          шов: { x: xs[xi], y: ys[yi], клетка },
          цветаНовых: [...new Set(новые.map(([, ц]) => ц))],
          доска, решение,
          вернулосьРисунком: после === доска,
          вернулосьПозицией: позиция() === позДоски,
        };
      }
      M.ccall('psy_undo', 'number', [], []);   // убрать поставленную границу перед следующей пробой
    }
  }
  режимы[имя] = { параметры, зерно, ...пробы };
}

const md5 = createHash('md5').update(readFileSync(МОСТ)).digest('hex');
writeFileSync(ВЫХОД, JSON.stringify({ мост: md5, режимы }, null, 1) + '\n');
for (const [имя, р] of Object.entries(режимы)) {
  console.log(`${имя} ${р.параметры}#${р.зерно}: верная ${р.верная ? 'есть' : 'НЕТ'}, неверная ${р.неверная ? 'есть' : 'НЕТ'}; ` +
    `вернулось ${р.неверная?.вернулосьРисунком}/${р.неверная?.вернулосьПозицией}; цвета границы ${р.неверная?.цветаНовых}`);
}
console.log('→', path.relative(process.cwd(), ВЫХОД), 'мост', md5);
