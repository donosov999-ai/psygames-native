#!/usr/bin/env node
/* psygames-ball-colors-gate · VER 1 · 24.09.2026 */
/**
 * 🔴 ЦВЕТ ШАРА ОБЯЗАН СОВПАДАТЬ С ЕГО ИМЕНЕМ.
 *
 * 📍 ПОВОД (задача 9e80c3c4). 23.09 при переносе сосудов на Flutter нашлось, что
 * `glossy-green` нарисован ЖЁЛТЫМ, `glossy-orange` КРАСНЫМ, `glossy-red` вообще
 * СЕРЕБРЯНЫМ, а мятного шара не нарисовано ни у одной из пяти непрозрачных фактур.
 * Экран берёт спрайт ПО ИМЕНИ (`nearestPieceColor` → `<стиль>-<имя>.webp`), значит
 * игровой зелёный показывался жёлтым шаром. Полтора месяца этого никто не видел:
 * ни компилятор, ни пробы цвет картинки не читают.
 *
 * 🔴 ГЕЙТ СТОИТ НА ТРЁХ ПРОВЕРКАХ, И ТРЕТЬЯ — ГЛАВНАЯ:
 * 1. КАЖДЫЙ спрайт совпадает с ЗАПИСАННЫМ замером (ΔE ≤ 5). Ловит пересборку
 *    листа со сдвигом порядка — ровно то, как дефект и возник.
 * 2. Внутри фактуры все десять РАЗЛИЧИМЫ (попарно ΔE ≥ 12). Ловит «мятного нет,
 *    зелёный дважды» — состояние, в котором набор был полтора месяца.
 * 3. Ближайшее имя палитры к замеру — СВОЁ. Исключения названы поимённо и с
 *    причиной; список закрытый, новое исключение красит гейт.
 *
 * ⚠️ ПОЧЕМУ ИСКЛЮЧЕНИЯ ЕСТЬ И ЭТО НЕ ПОДГОНКА. У `stone` шары из настоящих
 * минералов, они приглушённые: нефрит по ΔE ближе к мятному, амазонит к голубому.
 * Глазами (лист `sorting-chat/art/shots/шарики-24-09/final-check.png`) все десять
 * названы верно. Метод «средний цвет ядра» на приглушённых камнях слеп — это
 * свойство прибора, а не дефект арта, и оно записано здесь, а не спрятано.
 *
 * ЗАПУСК:
 *   node scripts/ball-colors-match-names.mjs            # проверить
 *   node scripts/ball-colors-match-names.mjs --write    # ЗАПИСАТЬ эталон заново
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ШАРЫ = join(HERE, '..', 'assets/images/games/balls');
const ЭТАЛОН = join(HERE, '..', 'src/games/balls/ballColors.generated.json');

/** Палитра игры — та же, что в `ballChoice.ts` (`ЦВЕТ_НАБОРА`). */
const ПАЛИТРА = {
  red: [214, 58, 58], orange: [232, 138, 44], yellow: [235, 202, 60],
  green: [104, 190, 74], mint: [116, 214, 172], cyan: [78, 196, 226],
  blue: [72, 118, 214], purple: [166, 84, 214], pink: [234, 128, 176],
  white: [238, 240, 244],
};

/**
 * Исключения третьей проверки: приглушённые минералы. Каждое с причиной и с тем,
 * чем проверено глазами. Список ЗАКРЫТЫЙ — новое расхождение красит гейт.
 */
const МИНЕРАЛЫ = {
  'stone-green': 'нефрит — приглушённый зелёный, по ΔE ближе к мятному',
  'stone-purple': 'чароит — тёмный фиолетовый с чёрным, по ΔE ближе к синему',
  'stone-yellow': 'жёлтый мрамор — бледный, по ΔE ближе к белому',
};

const вLab = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g_ = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [g_(x), g_(y), g_(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const ΔE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Средний цвет ЯДРА шара: круг 0,55 радиуса, без верхних и нижних 12 % по
 * светлоте — блик и обводка иначе тянут среднее на себя.
 */
async function замер(файл) {
  const { data, info } = await sharp(файл).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const cx = w / 2, cy = h / 2, R = (Math.min(w, h) * 0.55) / 2;
  const точки = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 200) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      точки.push([0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b]);
    }
  }
  if (точки.length < 30) return null;
  точки.sort((p, q) => p[0] - q[0]);
  const срез = Math.max(1, Math.floor(точки.length * 0.12));
  const ядро = точки.slice(срез, точки.length - срез);
  const сумма = ядро.reduce((acc, p) => [acc[0] + p[1], acc[1] + p[2], acc[2] + p[3]], [0, 0, 0]);
  return сумма.map((v) => Math.round(v / ядро.length));
}

const файлы = readdirSync(ШАРЫ).filter((f) => /^[a-z]+-[a-z]+\.webp$/.test(f)).sort();
const замеры = {};
for (const f of файлы) {
  const c = await замер(join(ШАРЫ, f));
  if (c) замеры[f.replace('.webp', '')] = c;
}

if (process.argv.includes('--write')) {
  writeFileSync(ЭТАЛОН, `${JSON.stringify({
    note: 'Замеренный цвет каждого спрайта шара. Пишет scripts/ball-colors-match-names.mjs --write',
    colors: замеры,
  }, null, 1)}\n`);
  console.log(`записано ${Object.keys(замеры).length} замеров → ${ЭТАЛОН}`);
  process.exit(0);
}

const эталон = JSON.parse(readFileSync(ЭТАЛОН, 'utf8')).colors;
const беды = [];

// 1. совпадение с записанным
for (const [имя, цвет] of Object.entries(замеры)) {
  const был = эталон[имя];
  if (!был) { беды.push(`${имя}: спрайт новый, а замера нет — прогони --write и посмотри глазами`); continue; }
  const d = ΔE(вLab(цвет), вLab(был));
  if (d > 5) беды.push(`${имя}: цвет уехал от записанного на ΔE ${d.toFixed(1)} (было ${был}, стало ${цвет})`);
}
for (const имя of Object.keys(эталон)) if (!замеры[имя]) беды.push(`${имя}: спрайт пропал`);

// 2. различимость внутри фактуры
const поФактуре = {};
for (const [имя, цвет] of Object.entries(замеры)) {
  const [тех] = имя.split('-');
  (поФактуре[тех] ??= []).push([имя, цвет]);
}
for (const [тех, список] of Object.entries(поФактуре)) {
  if (тех === 'bubble' || тех === 'chrome' || тех === 'glass') continue;   // прозрачные: ядро не их цвет
  for (let i = 0; i < список.length; i += 1) {
    for (let j = i + 1; j < список.length; j += 1) {
      const d = ΔE(вLab(список[i][1]), вLab(список[j][1]));
      if (d < 12) беды.push(`${список[i][0]} и ${список[j][0]}: неразличимы, ΔE ${d.toFixed(1)}`);
    }
  }
}

// 3. ближайшее имя палитры — своё
const палитраLab = Object.fromEntries(Object.entries(ПАЛИТРА).map(([k, v]) => [k, вLab(v)]));
const исключения = new Set();
for (const [имя, цвет] of Object.entries(замеры)) {
  const [тех, своё] = имя.split('-');
  if (тех === 'bubble' || тех === 'chrome' || тех === 'glass') continue;
  const lab = вLab(цвет);
  const ближайшее = Object.entries(палитраLab).sort((a, b) => ΔE(lab, a[1]) - ΔE(lab, b[1]))[0][0];
  if (ближайшее === своё) continue;
  if (МИНЕРАЛЫ[имя]) { исключения.add(имя); continue; }
  беды.push(`${имя}: нарисован как «${ближайшее}», а назван «${своё}»`);
}
const лишние = Object.keys(МИНЕРАЛЫ).filter((k) => !исключения.has(k));
if (лишние.length) беды.push(`исключения устарели, эти спрайты больше не расходятся: ${лишние.join(', ')} — убери их из МИНЕРАЛЫ`);

if (беды.length) {
  console.error(`🔴 цвета шаров не сходятся с именами (${беды.length}):`);
  for (const b of беды) console.error(`   · ${b}`);
  process.exit(1);
}
console.log(`🟢 ${Object.keys(замеры).length} спрайтов: цвет совпадает с именем, внутри фактуры все различимы`
  + ` (исключений ${исключения.size}: приглушённые минералы stone)`);
