#!/usr/bin/env node
/* psygames-gen-game-versions · VER 1 · 20.08.2026 */
/**
 * СОБИРАЕТ РЕДАКЦИИ ЭКРАНОВ В ОДИН РЕЕСТР, ЧТОБЫ ИХ ВИДЕЛО ПРИЛОЖЕНИЕ.
 *
 * 🔴 ЗАЧЕМ. Штамп редакции стоит первой строкой каждого экрана, но это
 * КОММЕНТАРИЙ — приложение его не читает и в репорт тестировщика он не попадает.
 * Из-за этого жалобу Вали «всё поплыло» пришлось привязывать к сборке целиком
 * (1.204.0), хотя вопрос был к конкретной редакции сортировки товаров.
 *
 * ⚠️ ФАЙЛ ГЕНЕРИРУЕТСЯ, А НЕ ПИШЕТСЯ РУКАМИ. Руками он разойдётся со штампами в
 * первый же день, и репорт начнёт врать про редакцию — это хуже, чем не иметь
 * редакции вовсе. Гейт сверяет сгенерированное с исходниками.
 *
 * Запуск: node scripts/gen-game-versions.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = join(ROOT, 'app/games');
// Куда писать. Переопределяется переменной окружения — этим пользуется гейт:
// он собирает реестр во временный файл и сверяет с закоммиченным, не трогая его.
const OUT = process.env.GAME_VERSIONS_OUT || join(ROOT, 'src/constants/gameVersions.ts');

/** `/* psygames-game-<имя> · VER <N> · <дд.мм.гггг> *​/` — ровно первая строка файла. */
const STAMP = /^\/\*\s*psygames-game-([a-z0-9-]+)\s*·\s*VER\s*(\d+)\s*·\s*(\d{2}\.\d{2}\.\d{4})\s*\*\//;

export function readStamps(dir = GAMES) {
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx')).sort()) {
    const first = readFileSync(join(dir, f), 'utf8').split('\n')[0];
    const m = STAMP.exec(first.trim());
    if (!m) continue;
    out[f.replace(/\.tsx$/, '')] = { ver: Number(m[2]), date: m[3], name: m[1] };
  }
  return out;
}

export function render(stamps) {
  const lines = Object.entries(stamps)
    .map(([id, v]) => `  '${id}': { ver: ${v.ver}, date: '${v.date}' },`)
    .join('\n');
  return `/* psygames-game-versions · VER 1 · 20.08.2026 */
/**
 * РЕДАКЦИИ ЭКРАНОВ УПРАЖНЕНИЙ — СГЕНЕРИРОВАНО, РУКАМИ НЕ ПРАВИТЬ.
 *
 * Источник — штамп первой строкой в \`app/games/*.tsx\`. Пересобрать:
 *   node scripts/gen-game-versions.mjs
 *
 * 🔴 ЗАЧЕМ ЭТО В КОДЕ. Репорт тестировщика несёт версию приложения, но не
 * редакцию экрана, на который жалуются. Жалоба «всё поплыло» на сборке 1.204.0
 * ничего не говорит о том, какая тогда была сортировка товаров; редакция —
 * говорит. Ключ — имя файла экрана, то же, что уходит в репорт как \`game_id\`.
 */
export interface GameVersion { ver: number; date: string }

export const GAME_VERSIONS: Record<string, GameVersion> = {
${lines}
};

/** Редакция экрана по его id. \`null\`, если экран не проштампован. */
export function gameVersionOf(gameId?: string | null): GameVersion | null {
  if (!gameId) return null;
  return GAME_VERSIONS[gameId] ?? null;
}

/** Короткая подпись для репорта: \`VER 1 · 19.08.2026\`. */
export function gameVersionLabel(gameId?: string | null): string | null {
  const v = gameVersionOf(gameId);
  return v ? \`VER \${v.ver} · \${v.date}\` : null;
}
`;
}

const isMain = process.argv[1] && process.argv[1].endsWith('gen-game-versions.mjs');
if (isMain) {
  const stamps = readStamps();
  writeFileSync(OUT, render(stamps), 'utf8');
  console.log(`✅ редакций записано: ${Object.keys(stamps).length} → src/constants/gameVersions.ts`);
}
