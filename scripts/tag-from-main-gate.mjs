#!/usr/bin/env node
/* psygames-tag-from-main-gate · VER 1 · 09.09.2026 */
/**
 * МЕТКА ВЫПУСКА ОБЯЗАНА ЛЕЖАТЬ НА ЛИНИИ `main`.
 *
 * 🔴 ПОВОД, ЗАМЕРЕННЫЙ 09.09.2026. Метки v2.52.6…v2.52.10 резались не от `main`, а
 * от отдельной линии выпуска, и в `main` вливались потом. Всё, что лежало в `main`,
 * в эти метки не попадало ПО ПОСТРОЕНИЮ: `git rev-list --count <метка>..origin/main`
 * давал 25, 24, 23, 22, 21 коммит — чужую работу восьми разделов. Проверка на той
 * линии `main`, что была до слияния (5c9c758b):
 *
 *     v2.52.5   fd5dc550  достижим с main      ← резалась от main, всё в порядке
 *     v2.52.6   9e8e176d  НЕ достижим с main
 *     v2.52.9   3fd376bc  НЕ достижим с main
 *     v2.52.10  0c94dd3c  НЕ достижим с main
 *
 * Предложил заслон psygames-span-claude-mac (задача TeamOps d31608c9, пункт 3):
 * «метку ставить ТОЛЬКО на коммит, достижимый с main».
 *
 * ⚠️ ПОЧЕМУ ДОСТИЖИМОСТЬ, А НЕ СЧЁТ КОММИТОВ. Первое, что просится, —
 * `git rev-list --count <метка>..origin/main == 0`. Так нельзя: девять чатов пишут в
 * `main` непрерывно, и пока прогон метки считается, в `main` приезжают новые коммиты.
 * Счётчик покраснел бы на ЗДОРОВОЙ метке (работа просто уедет следующей), а больную
 * поймал бы ровно так же. Достижимость от этого не зависит: коммит метки либо лежит
 * в истории `main`, либо не лежит.
 *
 * ⚠️ И ПОЧЕМУ ССЫЛКИ ПРОВЕРЯЮТСЯ ДО СРАВНЕНИЯ. `git merge-base --is-ancestor` даёт
 * ненулевой код и когда предка нет, и когда НЕТ САМОЙ ССЫЛКИ. В свежем worktree или
 * при `fetch-depth: 1` в CI ветки `origin/main` просто не существует — и «проверка»
 * молча превратилась бы в «всегда красный» или, при обратном порядке, в «всегда
 * зелёный». Поэтому обе ссылки сперва разрешаются, и не разрешённая — это отказ
 * прибора, а не вердикт.
 *
 * ЗАПУСК:
 *   node scripts/tag-from-main-gate.mjs              — из CI, метку берёт из GITHUB_REF
 *   node scripts/tag-from-main-gate.mjs v2.52.12     — перед тем как ставить метку
 */
import { execFileSync } from 'node:child_process';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Разрешает ссылку в коммит или возвращает null. Молчит — решение принимает вызвавший. */
function коммит(ссылка) {
  try { return git('rev-parse', '-q', '--verify', `${ссылка}^{commit}`); } catch { return null; }
}

const ссылкаМетки =
  process.argv[2] ||
  (process.env.GITHUB_REF?.startsWith('refs/tags/') ? process.env.GITHUB_REF.slice('refs/tags/'.length) : '');

if (!ссылкаМетки) {
  console.log('⏭  не метка выпуска — проверка «метка от main» не применима');
  process.exit(0);
}

const МЕТКА = коммит(ссылкаМетки);
if (!МЕТКА) {
  console.error(`❌ метка ${ссылкаМетки} не разрешается в коммит — проверять нечего.`);
  console.error('   Это отказ прибора, а не вердикт: сделай `git fetch --tags` и повтори.');
  process.exit(2);
}

/**
 * `origin/main` в CI появляется только при `fetch-depth: 0` плюс явном fetch ветки —
 * checkout по метке тянет одну её историю. Пробуем обе формы записи, и если ни одна
 * не разрешилась, это отказ прибора.
 */
const MAIN = коммит('origin/main') || коммит('refs/remotes/origin/main') || коммит('main');
if (!MAIN) {
  console.error('❌ ссылка на main не разрешается — проверка невозможна, и молча зеленеть она не будет.');
  console.error('   В CI: actions/checkout с fetch-depth: 0 + `git fetch origin main:refs/remotes/origin/main`.');
  process.exit(2);
}

const наЛинии = (() => {
  try { git('merge-base', '--is-ancestor', МЕТКА, MAIN); return true; } catch { return false; }
})();

const послеМетки = Number(git('rev-list', '--count', `${МЕТКА}..${MAIN}`));

console.log(`метка ${ссылкаМетки} → ${МЕТКА.slice(0, 8)} · main → ${MAIN.slice(0, 8)}`);

if (наЛинии) {
  console.log(`✅ метка лежит на линии main. Коммитов main после метки: ${послеМетки} — они уедут следующим выпуском.`);
  process.exit(0);
}

const потеряно = git('log', '--format=%h %an %s', `${МЕТКА}..${MAIN}`).split('\n').filter(Boolean);
console.error('');
console.error('❌ МЕТКА СРЕЗАНА НЕ С main — она уносит выпуск мимо чужой работы.');
console.error(`   Коммит метки не достижим из main. В main лежит ${потеряно.length} коммитов, которых в метке нет:`);
for (const строка of потеряно.slice(0, 15)) console.error('     ' + строка);
if (потеряно.length > 15) console.error(`     … и ещё ${потеряно.length - 15}`);
console.error('');
console.error('   Лечение: поставить метку на коммит из main.');
console.error('     git switch main && git pull --rebase && git tag -f ' + ссылкаМетки + ' && git push -f --tags');
console.error('   Красный main — это работа (починить пробу или её премису), а не повод увести линию выпуска.');
process.exit(1);
