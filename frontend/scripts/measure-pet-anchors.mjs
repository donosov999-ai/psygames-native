#!/usr/bin/env node
/**
 * Замер якорных точек питомца ПО КАЖДОМУ КАДРУ (3 облика × 5 состояний × 4 кадра).
 *
 * ЗАЧЕМ ЭТОТ СКРИПТ ВООБЩЕ ПОЯВИЛСЯ. Якоря аксессуаров мерили руками по ОДНОМУ
 * кадру idle0 и ставили константой на весь облик. Валя 19.08.2026, экран магазина:
 * «Почему бабочка на пузе, папочка должна быть на шее? Она то на пузе, то на
 * хвосте». Так и есть: у кота якорь шеи стоял намертво на 62.5% высоты кадра, а
 * кот в состоянии sleep лежит — 62.5% приходится на пузо; в jump2 поза другая —
 * на хвост. Один кадр не описывает двадцать.
 *
 * Руками это больше не мерится: перерисуют спрайты — прогнать скрипт заново.
 *
 * ЗАПУСК:
 *   node scripts/measure-pet-anchors.mjs           — пересчитать и записать файлы
 *   node scripts/measure-pet-anchors.mjs --check    — только сверить с записанным
 *   node scripts/measure-pet-anchors.mjs --sheet    — контактные листы с надетой
 *                                                     вещью в scratch/ (глазами)
 *
 * ЧТО ПИШЕТ:
 *   src/components/pet/petAnchors.generated.ts        — таблица якорей (едет в сборку)
 *   src/__tests__/pet-silhouette.generated.json       — силуэты кадров для гейта
 *
 * ДЕКОДЕР WEBP. Своего в зависимостях нет: `sharp` лежит в node_modules, но его
 * НЕТ в package-lock.json (пришёл транзитом и на чистом `npm ci` не появится),
 * поэтому на него нельзя опираться как на данность. Порядок попыток: sharp →
 * `dwebp -pam` (вывод PAM = заголовок + сырой RGBA, разбирается пятью строками).
 * Гейт в jest ничего не декодирует — он работает по записанным силуэтам, чьи
 * sha256 сверяются с картинками на диске (см. шапку гейта).
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');
const PETS = join(FRONT, 'assets/images/pet');

export const SKINS = ['cat', 'robot', 'constellation'];
export const STATES = ['walk', 'idle', 'wave', 'jump', 'sleep'];
export const FRAMES = 4;

/* ─── Пороги замера. Не «на глаз»: эти три числа воспроизводят значения, которые
 *     уже стоят в коде для кадров idle0 (см. --check и гейт). ────────────────── */
/** Альфа, ниже которой пиксель считаем прозрачным. Задано при замере 13.08.2026. */
const ALPHA = 24;
/** Яркость, ниже которой пиксель считаем тёмным (зрачки, обводка). Порог 80
 *  воспроизводит все три записанные строки глаз (кот 49.80, робот 71.09,
 *  созвездие 53.71) до сотых; 60 и 100 промахиваются хотя бы по одному облику. */
const DARK = 80;
/** Доля от самой широкой сплошной полосы кадра, с которой строка считается
 *  черепом, а не ушами/антеннами. Задано при замере 13.08.2026. */
const SKULL_RUN = 0.40;
/** На сколько процентов кадра якорь макушки опускается ВНУТРЬ головы, чтобы
 *  предмет сидел на ней, а не балансировал на кромке. Было заложено в прежние
 *  значения (кот 28.20 при черепе 27.15) — сохраняем. */
const SINK = 1.0;
/** Коэффициент из документированной формулы шеи: neck = eyes + 0.55 × (eyes − head_top). */
const NECK_K = 0.55;

/* ─── Декодирование ────────────────────────────────────────────────────────── */
function decoder() {
  try {
    const require = createRequire(join(FRONT, 'package.json'));
    const sharp = require('sharp');
    return {
      name: 'sharp',
      async read(p) {
        const { data, info } = await sharp(p).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
        return { d: data, w: info.width, h: info.height };
      },
    };
  } catch { /* нет sharp — пробуем dwebp */ }
  try {
    execFileSync('dwebp', ['-version'], { stdio: 'ignore' });
    const tmp = mkdtempSync(join(tmpdir(), 'petanch-'));
    process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
    return {
      name: 'dwebp',
      async read(p) {
        const out = join(tmp, 'f.pam');
        execFileSync('dwebp', [p, '-pam', '-o', out], { stdio: 'ignore' });
        const buf = readFileSync(out);
        // PAM: строки заголовка до ENDHDR\n, дальше сырой RGBA
        const head = buf.subarray(0, 200).toString('latin1');
        const end = head.indexOf('ENDHDR\n') + 7;
        const w = +/WIDTH (\d+)/.exec(head)[1];
        const h = +/HEIGHT (\d+)/.exec(head)[1];
        return { d: buf.subarray(end), w, h };
      },
    };
  } catch { /* и dwebp нет */ }
  throw new Error(
    'Нечем декодировать webp. Поставь `npm i -D sharp` ЛИБО `brew install webp` (даёт dwebp).\n' +
    'Гейт в jest от декодера не зависит — ему нужен только этот скрипт, прогнанный один раз.');
}

/* ─── Построчный разбор кадра ──────────────────────────────────────────────── */
/**
 * По каждой строке кадра: САМАЯ ДЛИННАЯ СПЛОШНАЯ полоса непрозрачных пикселей
 * (её начало и конец) и число тёмных непрозрачных пикселей.
 *
 * Почему именно сплошная полоса, а не общая ширина строки: уши и антенны дают в
 * строке две отдельные полоски, череп — одну широкую. Порог по общей ширине
 * принимал уши за макушку — на этом в прошлый раз всё и сломалось.
 */
function profile({ d, w, h }) {
  const x0 = new Int16Array(h).fill(-1);
  const x1 = new Int16Array(h).fill(-1);
  const dark = new Int16Array(h);
  for (let y = 0; y < h; y++) {
    let best = 0, b0 = -1, b1 = -1, cur = 0, c0 = -1, dn = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] >= ALPHA) {
        if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < DARK) dn++;
        if (cur === 0) c0 = x;
        cur++;
        if (cur > best) { best = cur; b0 = c0; b1 = x; }
      } else cur = 0;
    }
    x0[y] = b0; x1[y] = b1; dark[y] = dn;
  }
  return { x0, x1, dark, w, h };
}

const runW = (p, y) => (p.x0[y] < 0 ? 0 : p.x1[y] - p.x0[y] + 1);
const runC = (p, y) => (p.x0[y] < 0 ? p.w / 2 : (p.x0[y] + p.x1[y]) / 2);

/** Макушка: первая строка, где сплошная полоса превышает SKULL_RUN от максимума кадра. */
export function skullRow(p) {
  let M = 0;
  for (let y = 0; y < p.h; y++) M = Math.max(M, runW(p, y));
  for (let y = 0; y < p.h; y++) if (runW(p, y) > SKULL_RUN * M) return y;
  return 0;
}

/**
 * Ширина головы и её горизонтальная ОСЬ. Ось нужна для x якоря: центр самой
 * верхней полоски черепа гуляет (у кота на idle0 он уходит на 40% кадра, потому
 * что макушка там срезана наискось), а ось головы стоит на месте.
 */
function headAxis(p, H) {
  let wmax = 0, wrow = H;
  const lim = Math.min(p.h - 1, H + Math.round(p.h * 0.35));
  for (let y = H; y <= lim; y++) { const v = runW(p, y); if (v > wmax) { wmax = v; wrow = y; } }
  return { width: wmax, x: runC(p, wrow) };
}

/** Подбородок: первая строка ниже самой широкой части головы, где полоса падает ниже 55% от неё. */
function chinRow(p, H) {
  let run = 0;
  for (let y = H; y < p.h; y++) {
    run = Math.max(run, runW(p, y));
    if (runW(p, y) < 0.55 * run) return y;
  }
  return p.h - 1;
}

/** Строка глаз: максимум тёмных непрозрачных пикселей в пределах головы. */
function eyesRow(p, H) {
  const chin = chinRow(p, H);
  let best = H, bv = -1;
  for (let y = H; y <= chin; y++) if (p.dark[y] > bv) { bv = p.dark[y]; best = y; }
  return { row: best, chin };
}

/* ─── Сборка якорей по кадру ───────────────────────────────────────────────── */
/**
 * ⚠️ ГЛАВНОЕ МЕСТО. Правило глаз («самая тёмная строка головы») молча ломается,
 * когда питомец ЗАКРЫЛ ГЛАЗА: зрачков нет, самой тёмной строкой оказывается тень
 * под животом. Замер это показал числом — у кота в четырёх кадрах sleep глаза
 * «нашлись» на 72–83% высоты, и производная от них шея уехала на 95–112%, то
 * есть ЗА КРАЙ КАДРА. Поставить такие числа покадрово — значит сделать хуже, чем
 * было: бабочка не на пузе, а вообще нигде.
 *
 * ЧТО ДЕЛАЕМ ВМЕСТО ЭТОГО. Голова у всех трёх обликов ЖЁСТКАЯ: между кадрами она
 * ездит целиком, но глаза внутри неё не переезжают. Замер это подтверждает —
 * разность (eyes − head_top) по кадрам, где зрачки видны, держится в ±1.5% на
 * облик. Поэтому:
 *   • ПОЛОЖЕНИЕ ГОЛОВЫ меряем В КАЖДОМ КАДРЕ (силуэт, зрачки не нужны);
 *   • ВНУТРЕННЮЮ ГЕОМЕТРИЮ головы (насколько глаза ниже макушки) берём медианой
 *     по кадрам, где правило применимо, и отбраковываем выбросы по MAD — то есть
 *     по замеру, а не по взгляду.
 * Формулы не менялись: eyes и neck считаются ровно теми же выражениями, просто
 * слагаемое «глубина глаз внутри головы» взято по облику, а не по одному кадру.
 */
function medianMAD(values) {
  const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const m = med(values);
  const mad = med(values.map((v) => Math.abs(v - m)));
  // 1.4826 — перевод MAD в сигму для нормального распределения; 3 сигмы = выброс.
  const cut = Math.max(1.4826 * mad * 3, 1.0);
  const kept = values.filter((v) => Math.abs(v - m) <= cut);
  return { median: med(kept), kept: kept.length, total: values.length, raw: m, cut };
}

async function measureSkin(dec, skin) {
  const frames = [];
  for (const state of STATES) {
    for (let f = 0; f < FRAMES; f++) {
      const file = join(PETS, skin, `${state}${f}.webp`);
      const img = await dec.read(file);
      const p = profile(img);
      const H = skullRow(p);
      const axis = headAxis(p, H);
      const e = eyesRow(p, H);
      frames.push({
        state, f, file, p,
        H, axis, eyesRaw: e.row, chin: e.chin,
        sha: createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16),
      });
    }
  }
  // Глубина глаз внутри головы — медиана по кадрам с видимыми зрачками.
  const depth = medianMAD(frames.map((fr) => ((fr.eyesRaw - fr.H) / fr.p.h) * 100));
  const out = { frames: [], depth };
  for (const fr of frames) {
    const h = fr.p.h, w = fr.p.w;
    const headTopY = (fr.H / h) * 100 + SINK;
    const eyesY = (fr.H / h) * 100 + depth.median;
    const neckY = eyesY + NECK_K * depth.median;
    const rowAt = (yPct) => Math.max(0, Math.min(h - 1, Math.round((yPct / 100) * h)));
    out.frames.push({
      state: fr.state, frame: fr.f, sha: fr.sha, w, h,
      rawSkull: (fr.H / h) * 100, rawEyes: (fr.eyesRaw / h) * 100, rawChin: (fr.chin / h) * 100,
      head_top: { x: (fr.axis.x / w) * 100, y: headTopY },
      eyes:     { x: (runC(fr.p, rowAt(eyesY)) / w) * 100, y: eyesY },
      neck:     { x: (runC(fr.p, rowAt(neckY)) / w) * 100, y: neckY },
      prof: fr.p,
    });
  }
  return out;
}

/* ─── Точка входа ──────────────────────────────────────────────────────────── */
const r2 = (v) => Math.round(v * 100) / 100;

export async function measureAll() {
  const dec = decoder();
  const res = {};
  for (const skin of SKINS) res[skin] = await measureSkin(dec, skin);
  return { decoder: dec.name, res };
}

function tsTable(res) {
  const lines = [];
  for (const skin of SKINS) {
    const d = res[skin].depth;
    lines.push(`  // ${skin}: глубина глаз внутри головы ${r2(d.median)}% (медиана по ${d.kept} из ${d.total} кадров,`);
    lines.push(`  // остальные — с закрытыми глазами, там правило «самая тёмная строка» неприменимо).`);
    lines.push(`  ${skin}: {`);
    for (const st of STATES) {
      const fr = res[skin].frames.filter((x) => x.state === st);
      lines.push(`    ${st}: [`);
      for (const x of fr) {
        lines.push(`      { head_top: { x: ${r2(x.head_top.x)}, y: ${r2(x.head_top.y)} }, ` +
                   `eyes: { x: ${r2(x.eyes.x)}, y: ${r2(x.eyes.y)} }, ` +
                   `neck: { x: ${r2(x.neck.x)}, y: ${r2(x.neck.y)} } },`);
      }
      lines.push(`    ],`);
    }
    lines.push(`  },`);
  }
  return lines.join('\n');
}

function writeAnchors(res) {
  const body = `/**
 * СГЕНЕРИРОВАНО \`node scripts/measure-pet-anchors.mjs\` — РУКАМИ НЕ ПРАВИТЬ.
 *
 * Якорные точки аксессуаров по КАЖДОМУ кадру: 3 облика × 5 состояний × 4 кадра.
 * Проценты 0..100 внутри кадра, origin в левом верхнем углу.
 *
 * Раньше здесь была одна тройка точек на облик, снятая по кадру idle0. Валя
 * 19.08.2026 с экрана магазина: «Почему бабочка на пузе, папочка должна быть на
 * шее? Она то на пузе, то на хвосте». У кота якорь шеи стоял на 62.5% при любой
 * позе: в sleep кот лежит — это пузо, в jump2 поза другая — это хвост.
 *
 * Правило замера и разбор кадров с закрытыми глазами — в шапке скрипта.
 * Гейт: src/__tests__/pet-anchors.test.ts (пересчитывает эти числа по силуэтам).
 */
import type { PetSkin, PetState } from './PetSprite';

export interface AnchorXY { x: number; y: number }
export type AnchorName = 'head_top' | 'eyes' | 'neck';
export type FrameAnchors = Record<AnchorName, AnchorXY>;

export const FRAME_ANCHORS: Record<PetSkin, Record<PetState, FrameAnchors[]>> = {
${tsTable(res)}
};
`;
  writeFileSync(join(FRONT, 'src/components/pet/petAnchors.generated.ts'), body);
}

/**
 * Силуэты для гейта. Гейт в jest не умеет декодировать webp (декодера нет в
 * package-lock.json, а в CI ставится ровно он), поэтому строчные профили кадров
 * кладём сюда — и вместе с ними sha256 самих картинок. Цепочка честности:
 * якоря пересчитываются гейтом ИЗ ЭТИХ силуэтов, а силуэты привязаны к байтам
 * картинок хешом. Подправят числа руками — гейт покраснеет; перерисуют спрайты —
 * покраснеет тоже и потребует прогнать скрипт заново.
 */
function writeSilhouettes(res) {
  const blobs = [];
  const index = [];
  let at = 0;   // СМЕЩЕНИЕ В БАЙТАХ, не номер кадра: гейт читает буфер напрямую
  for (const skin of SKINS) for (const x of res[skin].frames) {
    const { x0, x1, dark } = x.prof;
    const buf = Buffer.alloc(x.h * 6);
    for (let y = 0; y < x.h; y++) {
      buf.writeInt16LE(x0[y], y * 6);
      buf.writeInt16LE(x1[y], y * 6 + 2);
      buf.writeInt16LE(dark[y], y * 6 + 4);
    }
    index.push({ skin, state: x.state, frame: x.frame, w: x.w, h: x.h, sha: x.sha, at });
    blobs.push(buf);
    at += buf.length;
  }
  const json = {
    _: 'СГЕНЕРИРОВАНО node scripts/measure-pet-anchors.mjs — руками не править',
    thresholds: { ALPHA, DARK, SKULL_RUN, SINK, NECK_K },
    index,
    // На строку кадра: x0, x1 самой длинной сплошной полосы и число тёмных пикселей (int16 LE).
    rows: gzipSync(Buffer.concat(blobs), { level: 9 }).toString('base64'),
  };
  const p = join(FRONT, 'src/__tests__/pet-silhouette.generated.json');
  writeFileSync(p, JSON.stringify(json));
  return { path: p, bytes: JSON.stringify(json).length };
}

const argv = process.argv.slice(2);
if (argv.includes('--sheet')) {
  const { res } = await measureAll();
  const { sheets } = await import('./measure-pet-anchors.sheet.mjs');
  await sheets(res);
} else {
  const { decoder: dn, res } = await measureAll();
  console.log(`декодер: ${dn}`);
  for (const skin of SKINS) {
    const d = res[skin].depth;
    console.log(`\n══ ${skin}  глубина глаз в голове ${r2(d.median)}%  (кадров с видимыми зрачками ${d.kept}/${d.total})`);
    for (const st of STATES) {
      const fr = res[skin].frames.filter((x) => x.state === st);
      const col = (g) => fr.map((x) => g(x).toFixed(1).padStart(6)).join('');
      const jit = Math.max(...fr.slice(1).map((x, i) => Math.abs(x.neck.y - fr[i].neck.y)));
      console.log(`  ${st.padEnd(6)} head_top${col((x) => x.head_top.y)}  neck${col((x) => x.neck.y)}` +
                  `  разброс ${(Math.max(...fr.map((x) => x.neck.y)) - Math.min(...fr.map((x) => x.neck.y))).toFixed(1)}` +
                  `  шаг между соседними ≤ ${jit.toFixed(1)}`);
    }
  }
  if (argv.includes('--check')) {
    // Сверяем ТЕКСТ таблицы: скрипт — единственный её автор, поэтому любая правка
    // руками (и любая перерисовка спрайтов) даёт расхождение.
    const cur = readFileSync(join(FRONT, 'src/components/pet/petAnchors.generated.ts'), 'utf8');
    const ok = cur.includes(tsTable(res));
    console.log(ok
      ? '\n--check: таблица в репозитории совпадает с замером по картинкам'
      : '\n--check: РАСХОЖДЕНИЕ таблицы и картинок — прогони скрипт без --check');
    process.exit(ok ? 0 : 1);
  }
  writeAnchors(res);
  const s = writeSilhouettes(res);
  console.log(`\nзаписано: src/components/pet/petAnchors.generated.ts`);
  console.log(`записано: ${s.path.replace(FRONT + '/', '')} (${(s.bytes / 1024).toFixed(0)} КБ)`);
}
