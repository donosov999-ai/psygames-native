/**
 * 🔴 РЕЛИЗНЫЕ ГЕЙТЫ ОБЯЗАНЫ ПАДАТЬ ЗДЕСЬ, А НЕ ЧЕРЕЗ ДВАДЦАТЬ МИНУТ В CI.
 *
 * Замер 05.09.2026: тег v2.37.49 ушёл, сборка крутилась двадцать минут и упала на
 * шаге «Обратный контур — репорты размечены» с одной строкой: «в CHANGELOG.md нет
 * раздела для v2.37.49». Релиз не доехал ни до GitHub Release, ни до Google Play,
 * версия сгорела. Ровно тот же класс, что накануне у аудита попадания пальцем —
 * и накануне же был сделан вывод «та же проверка в локальный прогон». Вывод
 * сделали для одного скрипта, а скриптов в этой джобе три.
 *
 * Поэтому здесь запускаются ВСЕ проверки джобы `typecheck`, которые не ходят в
 * сеть. Секунда в `npm test` против сгоревшего тега.
 *
 * ⚠️ ЗАПУСКАЕМ САМ СКРИПТ, А НЕ ПЕРЕСКАЗЫВАЕМ ЕГО. Копия правила в пробе разошлась
 * бы со скриптом молча, и проба зеленела бы при красном CI — это гейт-призрак.
 * Здесь вызывается тот же файл тем же способом, что и в workflow.
 *
 * ⚠️ ГЕЙТЫ, ХОДЯЩИЕ В СЕТЬ, СЮДА НЕ ПОПАДАЮТ. `leaderboard-rules-gate` читает
 * живой Supabase: в офлайне он валил бы весь прогон, и его выключили бы к вечеру.
 */
declare const __dirname: string;
declare function require(id: string): any;

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const КОРЕНЬ = path.join(__dirname, '../../..');

/** Скрипты джобы typecheck, работающие без сети. */
const ГЕЙТЫ = ['feedback-loop-gate.mjs', 'release-notes-gate.mjs'];

function прогнать(имя: string): { код: number; вывод: string } {
  try {
    const вывод = execFileSync('node', [path.join(КОРЕНЬ, 'scripts', имя)], {
      cwd: КОРЕНЬ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { код: 0, вывод: String(вывод) };
  } catch (e: any) {
    return { код: e.status ?? 1, вывод: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

describe('релизные гейты проходят локально', () => {
  it('есть что запускать — файлы гейтов на месте', () => {
    const нет = ГЕЙТЫ.filter((г) => !fs.existsSync(path.join(КОРЕНЬ, 'scripts', г)));
    expect(нет).toEqual([]);
  });

  for (const г of ГЕЙТЫ) {
    it(`🔴 ${г} — зелёный на текущей версии`, () => {
      const { код, вывод } = прогнать(г);
      expect(`${г}: код ${код}\n${вывод.slice(-400)}`).toBe(`${г}: код 0\n${вывод.slice(-400)}`);
    });
  }

  it('самопроверка: гейт действительно читает версию из package.json', () => {
    const версия = JSON.parse(fs.readFileSync(path.join(КОРЕНЬ, 'frontend/package.json'), 'utf8')).version;
    const changelog: string = fs.readFileSync(path.join(КОРЕНЬ, 'CHANGELOG.md'), 'utf8');
    // если раздела под текущую версию нет — гейт выше обязан был покраснеть
    expect(`раздел [${версия}] в CHANGELOG: ${changelog.includes(`## [${версия}]`)}`)
      .toBe(`раздел [${версия}] в CHANGELOG: true`);
  });
});
