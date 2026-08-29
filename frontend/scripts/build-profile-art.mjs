#!/usr/bin/env node
/* psygames-build-profile-art · VER 1 · 28.08.2026 */
/**
 * ТЕМЫ ПРОФИЛЕЙ — ПРЕДОБРАБОТКА КАРТИНОК НА СБОРКЕ (задача c4fc6173).
 *
 * Замысел Дениса 26.08: «10 тем, и картинки будут автоматом предобработку
 * получать перед показыванием». Обработка идёт ЗДЕСЬ, а не перед показом:
 * в .apk пиксельный фильтр гнать не на чем (ни GL, ни Skia в зависимостях,
 * замер 26.08), и 9 из 12 рецептов сами помечены cost=precompute-*.
 *
 * Устройство: ОДИН базовый арт × рецепт темы каждого профиля → готовый webp
 * в assets/images/level-map-themes/. Первый потребитель — подложка карты
 * уровней (LevelProgressMap). Таблица тем — src/constants/profileThemes.json,
 * ЕДИНСТВЕННЫЙ источник: его же читает рантайм и сверяет гейт.
 *
 * Рецепты — живой src/games/pause/core/imageEffects.ts, который до этой
 * задачи не звался НИКЕМ (написан, экспортирован — и мёртв; проверено грепом
 * 26.08). Скрипт компилирует его tsc-ом в scratch и исполняет тот же код,
 * что поедет в приложение, — а не копию формул.
 *
 * Все рецепты deterministic: true → результат воспроизводим и живёт в git.
 *
 * ЗАПУСК: node scripts/build-profile-art.mjs   (из frontend/)
 *
 * ⚠️ ДЕКОДЕР. Как в measure-pet-anchors: sharp в зависимостях НЕТ (транзитом
 * не приходит), порядок попыток — import('sharp') → node_modules соседнего
 * psygames-astro (там sharp живёт для сборки сайта). Оба мимо — честная
 * ошибка с командой установки, а не тихий пропуск.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');

async function loadSharp() {
  try { return (await import('sharp')).default; } catch {}
  try {
    const req = createRequire('/Users/denisonosov/dev/psygames-astro/package.json');
    return req('sharp');
  } catch {}
  throw new Error('sharp не найден ни в проекте, ни в psygames-astro. Поставь: npm i -D sharp');
}

/**
 * Компилируем ЖИВОЙ imageEffects.ts и грузим его. Времянка нужна из-за
 * единственного type-import из './engine': tsc в одиночном режиме требует
 * существующий модуль даже для типа. В КОПИИ строка заменяется на локальный
 * алиас типа — формулы рецептов при этом остаются исходными байт-в-байт.
 */
async function loadEffects() {
  const out = join(tmpdir(), `psygames-image-effects-${process.pid}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const srcPath = join(FRONT, 'src', 'games', 'pause', 'core', 'imageEffects.ts');
  const src = readFileSync(srcPath, 'utf8').replace(
    /import type \{ VisualGuideFrame \} from '\.\/engine';/,
    'type VisualGuideFrame = any;   // тип из ./engine нужен только buildImagePhaseRecipe, которую скрипт не зовёт',
  );
  if (src.includes("from './engine'")) throw new Error('импорт engine не срезался — обнови регулярку');
  const tmpTs = join(out, 'imageEffects.ts');
  writeFileSync(tmpTs, src);
  const tsc = join(FRONT, 'node_modules', '.bin', 'tsc');
  execFileSync(tsc, [
    '--target', 'es2020', '--module', 'esnext', '--moduleResolution', 'bundler',
    '--outDir', out, '--skipLibCheck', '--isolatedModules', '--ignoreConfig',
    tmpTs,
  ], { stdio: 'inherit' });
  const mod = await import(pathToFileURL(join(out, 'imageEffects.js')).href);
  rmSync(out, { recursive: true, force: true });
  return mod;
}

const sharp = await loadSharp();
const { applyImageEffect, IMAGE_EFFECT_CATALOG } = await loadEffects();
const spec = JSON.parse(readFileSync(join(FRONT, 'src', 'constants', 'profileThemes.json'), 'utf8'));

const known = new Set(IMAGE_EFFECT_CATALOG.map((e) => e.id));
for (const [profile, t] of Object.entries(spec.themes)) {
  if (!known.has(t.effect)) throw new Error(`${profile}: рецепта «${t.effect}» нет в imageEffects.ts`);
}

const baseFile = join(FRONT, spec.base);
const img = sharp(baseFile);
const meta = await img.metadata();
const raw = await img.ensureAlpha().raw().toBuffer();
const base = { width: meta.width, height: meta.height, data: new Uint8ClampedArray(raw) };
console.log(`база: ${spec.base} ${base.width}×${base.height}`);

const outDir = join(FRONT, spec.outDir);
mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [profile, t] of Object.entries(spec.themes)) {
  // seed фиксирован: у стохастических рецептов (brightness-noise) результат
  // обязан быть воспроизводимым — иначе каждый прогон меняет байты в git.
  // Параметры рецепта (`params`) — то, чем один и тот же фильтр даёт РАЗНЫЕ темы.
  // Без них тем ровно столько, сколько рецептов, и двенадцатому профилю достаётся
  // единственный оставшийся — а он оказался самым тяжёлым (зерно, 225 КБ).
  const outSurface = applyImageEffect(base, { id: t.effect, seed: 7, parameters: t.params });
  const file = join(outDir, `${profile}.webp`);
  await sharp(Buffer.from(outSurface.data.buffer, 0, outSurface.data.length), {
    raw: { width: outSurface.width, height: outSurface.height, channels: 4 },
  }).webp({ quality: 62 }).toFile(file);
  const kb = Math.round(readFileSync(file).length / 1024);
  total += kb;
  const tune = t.params ? ' ' + JSON.stringify(t.params) : '';
  console.log(`  ${profile.padEnd(10)} ${(t.effect + tune).padEnd(28)} ${kb} КБ`);
}
console.log(`итого: ${Object.keys(spec.themes).length} тем, ${total} КБ`);

/**
 * 🔴 ТЕМЫ ОБЯЗАНЫ РАЗЛИЧАТЬСЯ, И ЭТО ПРОВЕРЯЕТСЯ ЧИСЛОМ, А НЕ ВЕРОЙ.
 * Замер 29.08.2026: четыре темы из двенадцати оказались почти одинаковыми —
 * drivers↔students 2,5 из 255, free↔drivers 3,1, free↔students 3,2,
 * free↔seniors 3,4. Рецепты РАЗНЫЕ (color-planes, sharpen, water-colour, blur),
 * а на этом арте все четыре давали один и тот же мягкий луг. То есть «двенадцать
 * тем» было отчасти выдумкой, и заметить это можно только сравнив картинки.
 *
 * ⚠️ ПОРОГ — ПОЛ, А НЕ ВЕРДИКТ. Большое число не значит «красиво», малое не всегда
 * значит «одинаково»: execs и polyglot отличаются на 13,6, но это металл против
 * гравюры — разные материи. Поэтому здесь ловятся только клоны, а вид проверяется
 * глазами по листу тем.
 */
const MIN_DIFF = 4;
const thumbs = new Map();
for (const profile of Object.keys(spec.themes)) {
  thumbs.set(profile, await sharp(join(outDir, `${profile}.webp`)).resize(120, 68).raw().toBuffer());
}
const clones = [];
const ids = [...thumbs.keys()];
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = thumbs.get(ids[i]);
    const b = thumbs.get(ids[j]);
    let sum = 0;
    for (let k = 0; k < a.length; k++) sum += Math.abs(a[k] - b[k]);
    const diff = sum / a.length;
    if (diff < MIN_DIFF) clones.push(`${ids[i]} ↔ ${ids[j]}: ${diff.toFixed(1)} из 255`);
  }
}
if (clones.length) {
  console.error(`\n🔴 темы неразличимы (порог ${MIN_DIFF}):`);
  for (const c of clones) console.error('  · ' + c);
  console.error('  Лечится параметрами рецепта (`params` в profileThemes.json), а не новым фильтром.');
  process.exit(1);
}
console.log(`различимость: все ${(ids.length * (ids.length - 1)) / 2} пар выше порога ${MIN_DIFF}`);
