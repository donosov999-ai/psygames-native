/* psygames-lint-ratchet · VER 1 · 23.08.2026 */
/**
 * ЛИНТ В СБОРКЕ — ХРАПОВИКОМ: ДОЛГ МОЖЕТ ТОЛЬКО УМЕНЬШАТЬСЯ.
 *
 * 🔴 ЗАЧЕМ. В package.json скрипт `lint` лежит с самого начала, и НИ ОДИН
 * workflow его не звал: линта в сборке не было вообще (задача TeamOps 0940eb0a,
 * пункт 3).
 *
 * ⚠️ ПОЧЕМУ НЕ ПРОСТО `npx eslint .` БЛОКИРУЮЩИМ ШАГОМ. Замер 23.08.2026 на
 * чистом дереве: 606 ошибок и 404 предупреждения. Блокирующий шаг положил бы
 * КАЖДУЮ сборку в тот же день, и его сняли бы к вечеру — то есть линта снова не
 * стало бы, только с лишним оборотом. Почти весь долг — не стиль, а находки
 * React-компилятора («Cannot access refs during render», setState внутри
 * эффекта) и 113 нарушений правил хуков; чинить их надо, но не одним заходом.
 *
 * ⚠️ И НЕ `continue-on-error`. Проверка, которая не может покраснеть, — не
 * проверка, а строчка в логе, которую никто не читает.
 *
 * ЧТО ДЕЛАЕТ ЭТОТ ХРАПОВИК. Держит потолок. Стало больше — красное с точным
 * списком файлов, где прибыло. Стало меньше — красное ТОЖЕ, с требованием
 * опустить потолок: иначе долг «уменьшился» один раз, а место под него осталось,
 * и следующая правка тихо занимает освободившееся.
 *
 * Тот же приём уже стоит в проекте у `tap-target-audit` (ROUTE_DEBT/FIELD_DEBT)
 * и у `test-discipline-gate` (нижние пороги) — это не новая выдумка.
 */
import { execFileSync } from 'node:child_process';

/** Потолок долга. Замер 23.08.2026. Опускать при каждой чистке — не поднимать. */
const CEILING = { errors: 597, warnings: 416 };

/** Насколько ниже потолка можно опуститься, не переписывая его. */
const SLACK = 25;

function run() {
  try {
    return execFileSync('npx', ['eslint', '.', '--format', 'json'], {
      encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
      // ⚠️ ЗАПАС ПО ПАМЯТИ ОБЯЗАТЕЛЕН. 23.08.2026 на этом дереве eslint упал с
      // SIGABRT (код 134) на куче по умолчанию — и упал МОЛЧА для того, кто
      // читает только код возврата команды. Отсюда явный лимит.
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
    });
  } catch (e) {
    // eslint возвращает 1 при найденных ошибках — это ожидаемо, отчёт в stdout.
    if (e.stdout) return e.stdout;
    throw e;
  }
}

const report = JSON.parse(run());
let errors = 0, warnings = 0;
const perFile = [];
for (const f of report) {
  if (!f.errorCount && !f.warningCount) continue;
  errors += f.errorCount;
  warnings += f.warningCount;
  perFile.push({ file: f.filePath.replace(process.cwd() + '/', ''), e: f.errorCount, w: f.warningCount });
}

console.log(`Линт: ошибок ${errors} (потолок ${CEILING.errors}) · предупреждений ${warnings} (потолок ${CEILING.warnings})`);

const grew = errors > CEILING.errors || warnings > CEILING.warnings;
if (grew) {
  console.error('\n🔴 ДОЛГ ВЫРОС. Худшие файлы:');
  perFile.sort((a, b) => (b.e * 10 + b.w) - (a.e * 10 + a.w)).slice(0, 15)
    .forEach((f) => console.error(`   ${String(f.e).padStart(4)} ош · ${String(f.w).padStart(4)} пред   ${f.file}`));
  console.error('\nПравка обязана чинить свои замечания, а не добавлять их к чужим.');
  process.exit(1);
}

const shrank = errors < CEILING.errors - SLACK || warnings < CEILING.warnings - SLACK;
if (shrank) {
  console.error(`\n🔴 ДОЛГ УПАЛ НИЖЕ ПОТОЛКА БОЛЬШЕ ЧЕМ НА ${SLACK} — опусти потолок в scripts/lint-ratchet.mjs:`);
  console.error(`   const CEILING = { errors: ${errors}, warnings: ${warnings} };`);
  console.error('Иначе освободившееся место молча займёт следующая правка.');
  process.exit(1);
}

console.log('Долг не вырос.');
