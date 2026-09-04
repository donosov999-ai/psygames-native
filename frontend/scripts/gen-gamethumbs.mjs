/* psygames-gen-gamethumbs · VER 1 · 19.08.2026
 *
 * ПРЕВЬЮ КАРТОЧКИ КАТАЛОГА РИСУЕМ КОДОМ, А НЕ ГЕНЕРАТОРОМ КАРТИНОК.
 *
 * Как устроен ряд превью (см. шапку src/constants/gameThumbs.ts): 48 штук взяты
 * скринами с промо-сайта psy-games.pro и лежат как 760x1440, ещё 13 дорисованы
 * пиктограммами 160x160 — плоский вектор, светлая плашка #F8F8FA со скруглением
 * 24, ~2-4 КБ webp. Этот скрипт продолжает ВТОРОЙ ряд: тот же холст, та же
 * палитра, та же толщина линий.
 *
 * ПОЧЕМУ SVG, А НЕ kie/DALL-E. Это схематичные пиктограммы: маршрут с четырьмя
 * остановками, эйлеров обход домика, четыре пары точек в сетке. У них обязана
 * быть ТОЧНАЯ геометрия — генератор рисует «примерно похоже», путает число
 * элементов и коверкает подписи, а рядом с 13 существующими такая карточка сразу
 * выпадает из ряда.
 *
 * ПАЛИТРА снята пиксельным замером с существующих 13 превью, а не придумана:
 * фон #F8F8FA, чернила #111827, синий #4F90F7, коралл #EF5F66, янтарь #F5BE3A,
 * бирюза #06B6D4, зелёный #0F9489, индиго #6166EF, серый #D9DDE2.
 *
 * ЗАПУСК: node scripts/gen-gamethumbs.mjs [id ...]
 * Без аргументов перерисовывает все семь. Существующие 61 превью не трогает —
 * пишет ровно те файлы, что перечислены в THUMBS ниже.
 */
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'assets', 'images', 'gamethumbs');

// Палитра — замер по существующим превью (см. шапку).
const C = {
  bg: '#F8F8FA',
  white: '#FFFFFF',
  ink: '#111827',
  blue: '#4F90F7',
  blueLight: '#93BCFA',
  coral: '#EF5F66',
  coralLight: '#F4A0A5',
  amber: '#F5BE3A',
  cyan: '#06B6D4',
  teal: '#0F9489',
  tealLight: '#72C4BE',
  indigo: '#6166EF',
  indigoLight: '#A9AEF6',
  grey: '#D9DDE2',
  greyRoute: '#C0C7D2',
  greyLine: '#E7EAEF',
  slate: '#5A6472',
  skin: '#F0C6A0',
  hair: '#4B3B33',
};

const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

/** Общий холст: плашка #F8F8FA 160x160 со скруглением 24, вне её — прозрачность. */
const frame = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">` +
  `<rect width="160" height="160" rx="24" fill="${C.bg}"/>` +
  body +
  `</svg>`;

/* ─────────────────────────── ДВОРЕЦ ПАМЯТИ ───────────────────────────
 * «Разложите предметы по маршруту и вспомните их вперёд и в обратном порядке».
 * Ломаная-маршрут и четыре остановки-места, на каждой свой предмет (квадрат,
 * треугольник, круг, ромб) — фигуры разные, чтобы читалось «предметы», а не
 * «одинаковые точки».
 */
const memoryPalace = () => {
  const stops = [
    { x: 32, y: 124, color: C.teal, glyph: `<rect x="27" y="119" width="10" height="10" rx="2" fill="${C.teal}"/>` },
    { x: 46, y: 62, color: C.amber, glyph: `<path d="M46 56 L52 67 H40 Z" fill="${C.amber}"/>` },
    { x: 96, y: 104, color: C.coral, glyph: `<circle cx="96" cy="104" r="5.4" fill="${C.coral}"/>` },
    { x: 128, y: 44, color: C.blue, glyph: `<path d="M128 37.5 L134.5 44 L128 50.5 L121.5 44 Z" fill="${C.blue}"/>` },
  ];
  return frame(
    `<path d="M32 124 L46 62 L96 104 L128 44" fill="none" stroke="${C.greyRoute}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
      stops
        .map(
          (s) =>
            `<circle cx="${s.x}" cy="${s.y}" r="13" fill="${C.white}" stroke="${s.color}" stroke-width="3"/>${s.glyph}`,
        )
        .join('')
  );
};

/* ─────────────────────────── РИТМ И ВЫСОТА ───────────────────────────
 * «Повторяйте ритмы и запоминайте последовательности высот».
 * Сверху — ритмический рисунок: столбики неравной высоты на общей рейке,
 * промежутки НЕРАВНЫЕ (ровная гребёнка читалась бы как метроном, а не ритм).
 * Снизу — ступеньки высот: узлы на трёх линейках, связанные контуром.
 */
const rhythmPitch = () => {
  const beats = [
    [30, 26], [50, 15], [61, 15], [84, 26], [106, 15], [126, 26],
  ];
  const rail = `<rect x="22" y="59" width="116" height="3" rx="1.5" fill="${C.greyLine}"/>`;
  const bars = beats
    .map(([x, h]) =>
      `<rect x="${x - 3.5}" y="${59 - h}" width="7" height="${h}" rx="3.5" fill="${h > 20 ? C.indigo : C.indigoLight}"/>`,
    )
    .join('');

  const lines = [90, 108, 126]
    .map((y) => `<rect x="24" y="${y - 1.25}" width="112" height="2.5" rx="1.25" fill="${C.greyLine}"/>`)
    .join('');
  const nodes = [
    [34, 126], [66, 108], [98, 90], [130, 108],
  ];
  const contour = `<path d="M${nodes.map(([x, y]) => `${x} ${y}`).join(' L')}" fill="none" stroke="${C.cyan}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dots = nodes
    .map(([x, y]) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="4" fill="${C.cyan}"/>`)
    .join('');

  return frame(rail + bars + lines + contour + dots);
};

/* ───────────────────────────── НАВИГАТОР ─────────────────────────────
 * «Запоминайте маршруты, последовательности поворотов и направление к старту».
 * Путь ровно с тремя поворотами под прямым углом + компас со стрелкой:
 * два разных умения игры на одной картинке.
 */
const navigator = () => {
  const route =
    `<path d="M30 118 L30 78 L72 78 L72 42 L108 42" fill="none" stroke="${C.blue}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M108 34 L124 42 L108 50 Z" fill="${C.blue}"/>` +
    `<circle cx="30" cy="118" r="7" fill="${C.teal}"/>`;
  const compass =
    `<circle cx="116" cy="112" r="24" fill="${C.white}" stroke="${C.grey}" stroke-width="3"/>` +
    `<g transform="rotate(-38 116 112)">` +
    `<path d="M116 93 L124 116 L116 111 L108 116 Z" fill="${C.coral}"/>` +
    `<path d="M116 131 L108 108 L116 113 L124 108 Z" fill="${C.slate}"/>` +
    `</g>`;
  return frame(route + compass);
};

/* ────────────────────────── ТРЕКЕР ОБЪЕКТОВ ──────────────────────────
 * «Следите за отмеченными объектами в движущейся группе».
 * Семь шаров, три помечены (коралл + янтарный ореол), четыре нейтральны —
 * ровно это и есть задание игры: держать взглядом отмеченные среди одинаковых.
 *
 * ⚠️ ХВОСТЫ ДВИЖЕНИЯ УБРАНЫ НАРОЧНО. Первая версия рисовала за двумя шарами
 * серые дуги-следы. Вплотную к шару дуга читалась как ножка леденца, с зазором
 * — как случайная царапина посреди плашки; ни один из 13 соседних значков такой
 * штриховки не имеет. Движение и так задано ореолами, дуги только сорили.
 */
const objectTracker = () => {
  const marked = [[44, 50], [114, 44], [66, 116]];
  const plain = [[92, 82], [126, 102], [32, 92], [100, 130]];
  const plainBalls = plain.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${C.grey}"/>`).join('');
  const markedBalls = marked
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="19" fill="none" stroke="${C.amber}" stroke-width="3"/>` +
        `<circle cx="${x}" cy="${y}" r="13" fill="${C.coral}"/>`,
    )
    .join('');
  return frame(plainBalls + markedBalls);
};

/* ─────────────────────────── ЛИЦА И ИМЕНА ────────────────────────────
 * «Свяжи лицо с именем и фактом». Лицо собрано по мотивам SyntheticFace самой
 * игры (та же схема: плашка-фон, овал, чёлка, точки-глаза, дуга-рот), под ним —
 * табличка с именем. Имя взято из пула игры (core/content.ts), не выдумано.
 */
const facesNames = () => {
  const card = `<rect x="48" y="20" width="64" height="66" rx="16" fill="#DCEBFF"/>`;
  const head =
    `<circle cx="59" cy="56" r="4" fill="${C.skin}"/><circle cx="101" cy="56" r="4" fill="${C.skin}"/>` +
    `<ellipse cx="80" cy="55" rx="18" ry="22" fill="${C.skin}"/>` +
    `<path d="M62 52 C62 34 98 34 98 52 C92 43 68 43 62 52 Z" fill="${C.hair}"/>` +
    `<circle cx="73.5" cy="54" r="2.6" fill="${C.ink}"/><circle cx="86.5" cy="54" r="2.6" fill="${C.ink}"/>` +
    `<path d="M72 66 Q80 72 88 66" fill="none" stroke="#B4525F" stroke-width="2.4" stroke-linecap="round"/>`;
  const plate =
    `<rect x="28" y="98" width="104" height="36" rx="12" fill="${C.white}" stroke="${C.greyLine}" stroke-width="2.5"/>` +
    `<text x="80" y="123" text-anchor="middle" font-family="${FONT}" font-size="21" font-weight="700" fill="${C.ink}">Mei</text>`;
  return frame(card + head + plate);
};

/* ───────────────────────────── ОДНА ЛИНИЯ ────────────────────────────
 * «Проведите одну непрерывную линию по всем рёбрам, не проходя ни одно дважды».
 * Классический «домик»: 5 вершин, 8 рёбер, ровно две нечётные (нижние углы) —
 * эйлеров путь существует. Ломаная ниже проходит все 8 рёбер по одному разу,
 * это НЕ декоративный набор отрезков, а настоящее решение:
 *   A(36,132) → C → E → D → C → B → D → A → B
 * Старт помечен бирюзой, финиш — кораллом.
 */
const oneLine = () => {
  const euler = 'M36 132 L124 68 L80 32 L36 68 L124 68 L124 132 L36 68 L36 132 L124 132';
  const nodes = [[124, 68], [80, 32], [36, 68]];
  return frame(
    `<path d="${euler}" fill="none" stroke="${C.indigo}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
      nodes
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${C.white}" stroke="${C.indigo}" stroke-width="3"/>`)
        .join('') +
      `<circle cx="36" cy="132" r="7" fill="${C.teal}"/>` +
      `<circle cx="124" cy="132" r="7" fill="${C.coral}"/>`
  );
};

/* ──────────────────────────── СОЕДИНИ ТОЧКИ ──────────────────────────
 * «Соединяйте одинаковые точки непересекающимися путями и заполните всю сетку».
 * Сетка 4x4, три пары. Клетки трёх путей НЕ пересекаются (проверено поимённо):
 *   коралл {11,12,13,14,24,23}, синий {21,31,41,42,32}, бирюза {33,43,44,34}.
 * Свободна одна клетка (2,2) — она и показывает, что сетку ещё заполняют.
 */
const dotsConnect = () => {
  const at = (c, r) => [38 + 28 * (c - 1), 38 + 28 * (r - 1)];
  const line = (cells) => `M${cells.map(([c, r]) => at(c, r).join(' ')).join(' L')}`;

  const pipes = [
    { cells: [[1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [2, 3]], color: C.coral, light: C.coralLight },
    { cells: [[2, 1], [3, 1], [4, 1], [4, 2], [3, 2]], color: C.blue, light: C.blueLight },
    { cells: [[3, 3], [4, 3], [4, 4], [3, 4]], color: C.teal, light: C.tealLight },
  ];

  const grid = [38, 66, 94, 122]
    .map((v) =>
      `<rect x="${v - 1}" y="24" width="2" height="112" fill="${C.greyLine}"/>` +
      `<rect x="24" y="${v - 1}" width="112" height="2" fill="${C.greyLine}"/>`,
    )
    .join('');

  const paths = pipes
    .map(
      (p) =>
        `<path d="${line(p.cells)}" fill="none" stroke="${p.light}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  const ends = pipes
    .map((p) => {
      const a = at(...p.cells[0]);
      const b = at(...p.cells[p.cells.length - 1]);
      return `<circle cx="${a[0]}" cy="${a[1]}" r="9" fill="${p.color}"/><circle cx="${b[0]}" cy="${b[1]}" r="9" fill="${p.color}"/>`;
    })
    .join('');
  const free = `<circle cx="${at(2, 2)[0]}" cy="${at(2, 2)[1]}" r="3" fill="${C.grey}"/>`;

  return frame(grid + paths + free + ends);
};

/* ─────────────────────────── ТОНЫ КИТАЙСКОГО ───────────────────────────
 * «Звучит слог — какой в нём тон». Рисуем ровно то, что человек выбирает:
 * четыре контура высоты — ровный, восходящий, падающе-восходящий, падающий.
 * Не иероглиф: иероглиф на превью означал бы чтение, а упражнение про СЛУХ.
 */
const chineseTones = () => {
  // Каждая клетка 60×46, контур внутри неё — ломаная из точек (доля клетки).
  const клетки = [
    [16, 22, [[0, 0.5], [1, 0.5]]],                    // 1: ровный
    [86, 22, [[0, 0.85], [1, 0.15]]],                  // 2: восходящий
    [16, 88, [[0, 0.3], [0.5, 0.9], [1, 0.2]]],        // 3: падающе-восходящий
    [86, 88, [[0, 0.15], [1, 0.9]]],                   // 4: падающий
  ];
  const W = 58, H = 44;
  const цвета = [C.coral, C.amber, C.teal, C.indigo];
  return frame(клетки.map(([x, y, точки], i) => {
    const плашка = `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="12" fill="${C.white}"/>`;
    const путь = точки.map(([dx, dy], j) => `${j ? 'L' : 'M'}${x + 6 + dx * (W - 12)} ${y + 6 + dy * (H - 12)}`).join(' ');
    return плашка + `<path d="${путь}" fill="none" stroke="${цвета[i]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join(''));
};

/* ─────────────────────────── ДИКТАНТ ───────────────────────────
 * «Фраза звучит — вы печатаете её целиком». Рисуем ровно это: слева волна звука,
 * справа строка набора, где часть знаков уже введена, а остальное ещё точками.
 * Не клавиатура: клавиатура означала бы «печать вообще», а тут связка ухо → рука.
 */
const dictation = () => {
  const волна = [18, 30, 44, 30, 22, 36, 26]
    .map((h, i) => `<rect x="${18 + i * 9}" y="${80 - h / 2}" width="5" height="${h}" rx="2.5" fill="${i % 2 ? C.tealLight : C.teal}"/>`)
    .join('');
  const набрано = [0, 1, 2, 3].map((i) => `<rect x="${20 + i * 14}" y="104" width="10" height="12" rx="3" fill="${C.teal}"/>`).join('');
  const точки = [4, 5, 6, 7, 8].map((i) => `<circle cx="${25 + i * 14}" cy="110" r="2.5" fill="${C.grey}"/>`).join('');
  const строка = `<rect x="14" y="96" width="132" height="28" rx="8" fill="${C.white}" stroke="${C.grey}" stroke-width="1.5"/>`;
  return frame(волна + строка + набрано + точки);
};

const THUMBS = {
  dictation,
  chinese_tones: chineseTones,
  memory_palace: memoryPalace,
  rhythm_pitch: rhythmPitch,
  navigator,
  object_tracker: objectTracker,
  faces_names: facesNames,
  one_line: oneLine,
  dots_connect: dotsConnect,
};

const wanted = process.argv.slice(2);
const ids = wanted.length ? wanted : Object.keys(THUMBS);

for (const id of ids) {
  const draw = THUMBS[id];
  if (!draw) {
    console.error(`нет рецепта для «${id}»; есть: ${Object.keys(THUMBS).join(', ')}`);
    process.exitCode = 1;
    continue;
  }
  const file = path.join(OUT_DIR, `${id}.webp`);
  // quality 88 — на плоском векторе визуально без потерь, держит файл в ряду 2-4 КБ
  await sharp(Buffer.from(draw())).webp({ quality: 88 }).toFile(file);
  console.log(`${id}.webp — ${fs.statSync(file).size} Б`);
}
