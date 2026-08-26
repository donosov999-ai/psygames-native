#!/usr/bin/env node
/* psygames-stamp-core-modules · VER 1 · 26.08.2026 */
/**
 * ШТАМП РЕДАКЦИИ НА ЯДРА УПРАЖНЕНИЙ — ИЗ ИСТОРИИ GIT, А НЕ ИЗ ГОЛОВЫ.
 *
 * ━━━ ЗАЧЕМ ━━━
 * Правило Дениса §10 (PROJECT_REF_RULES.md, 16.08.2026): у каждого модуля первой
 * строкой редакция и дата, иначе «ни хрена не понятно, как сличать, только дату
 * создания файла видно». Время файла врёт: rsync, checkout и пересборка меняют
 * mtime, не трогая содержимого.
 *
 * Экраны `app/games/*.tsx` подписаны все 73 и держатся гейтом `game-version-stamp`.
 * У ЯДЕР — `src/games/<игра>/core/*` — подписано было 69 из 147. Это хуже, чем
 * звучит: жалоба тестировщика привязывается к редакции ЭКРАНА, а поведение, на
 * которое жалуются, чаще живёт в ядре. Генератор судоку и раскладчик маджонга —
 * это ядра, экран их только рисует.
 *
 * ━━━ 🔴 ПОЧЕМУ ДАТА БЕРЁТСЯ ИЗ GIT, А НЕ СТАВИТСЯ СЕГОДНЯШНЕЙ ━━━
 * Проставить 78 файлам «VER 1 · 26.08.2026» — значит соврать одинаково про все:
 * штамп сказал бы, что их трогали сегодня, тогда как половина не менялась с июня.
 * Штамп нужен ровно для сличения, и неверный штамп ХУЖЕ отсутствующего: он
 * выглядит достоверно. Поэтому:
 *   VER  = сколько коммитов трогало файл (правка №5 — это VER 5);
 *   дата = день последнего коммита по этому файлу.
 * Обе цифры проверяемы: `git log --oneline -- <файл>`.
 *
 * ⚠️ Уже проставленные штампы НЕ ТРОГАЮТСЯ. У восьми старых дата — день выпуска
 * редакции в лаборатории игр, а не день коммита, и это осознанно (так же
 * рассуждает гейт `game-version-stamp`). Переписать их «точнее» значит стереть
 * сведения, которых в git нет.
 *
 * ЗАПУСК:  node scripts/stamp-core-modules.mjs          — проставить
 *          node scripts/stamp-core-modules.mjs --check  — только показать, без правки
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Штамп ровно первой строкой — всё, что ниже, штампом не считается. */
export const STAMP_RE = /^\/\* (psygames-[a-z0-9-]+) · VER (\d+) · (\d{2})\.(\d{2})\.(\d{4}) \*\/$/;

/** `FacesNamesGame` → `faces-names-game`. */
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase();

/**
 * Имя в штампе по пути файла. Правило выведено НЕ из головы: оно обязано
 * воспроизводить имена у 69 файлов, подписанных раньше, — это и есть его проверка.
 *   src/games/<игра>/core/<имя>.ts   → psygames-<игра>-<имя>
 *   ...                 core/index.ts → psygames-<игра>-core-index   (иначе спутать
 *                                        с index верхнего уровня)
 *   src/games/<игра>/<Имя>.tsx        → psygames-<игра>-<имя>, но без повтора
 *                                        имени игры: FacesNamesGame → faces-names-game
 */
export function stampNameFor(relPath) {
  const parts = relPath.split('/');            // src games <игра> [core] <файл>
  const game = parts[2];
  const base = parts[parts.length - 1].replace(/\.tsx?$/, '');
  const inCore = parts.includes('core');
  let tail = kebab(base);
  if (inCore && tail === 'index') tail = 'core-index';
  // Повтор имени игры в начале файла убираем: FacesNamesGame в папке faces-names
  // должен дать faces-names-game, а не faces-names-faces-names-game.
  if (tail.startsWith(`${game}-`)) tail = tail.slice(game.length + 1);
  else if (tail === game) tail = base.toLowerCase();
  return `psygames-${game}-${tail}`;
}

/** Сколько коммитов трогало файл и когда был последний. */
function historyOf(relPath) {
  const count = Number(git(['rev-list', '--count', 'HEAD', '--', relPath]) || '0');
  const iso = git(['log', '-1', '--format=%cs', '--', relPath]);   // ГГГГ-ММ-ДД
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return { ver: Math.max(1, count), date: `${d}.${m}.${y}` };
}

const files = git(['ls-files', 'src/games'])
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));

const already = [];
const stamped = [];
const skipped = [];

for (const rel of files) {
  const abs = join(ROOT, rel);
  const src = readFileSync(abs, 'utf8');
  const first = src.split('\n')[0].trim();
  if (STAMP_RE.test(first)) { already.push(rel); continue; }

  const h = historyOf(rel);
  if (!h) { skipped.push([rel, 'нет истории в git']); continue; }

  const line = `/* ${stampNameFor(rel)} · VER ${h.ver} · ${h.date} */`;
  if (!CHECK_ONLY) writeFileSync(abs, `${line}\n${src}`, 'utf8');
  stamped.push([rel, line]);
}

console.log(`уже подписано: ${already.length}`);
console.log(`${CHECK_ONLY ? 'будет подписано' : 'подписано'}: ${stamped.length}`);
for (const [rel, line] of stamped.slice(0, 8)) console.log(`   ${line}   ${rel}`);
if (stamped.length > 8) console.log(`   … и ещё ${stamped.length - 8}`);
if (skipped.length) {
  console.log(`🔴 пропущено: ${skipped.length}`);
  for (const [rel, why] of skipped) console.log(`   ${rel} — ${why}`);
}
