/**
 * Каждая игра, которая может попасть в плейлист зарядки, обязана авто-стартовать
 * при ?wu=1 — иначе человек внутри зарядки упирается в экран «Начать» и жмёт его
 * руками на каждом шаге. Ровно это ловили в репортах: «зарядка не идёт сама».
 *
 * Проверяем статически по исходникам: id из warmup.ts/profiles.ts → route из
 * games.ts → в файле экрана есть useAutostart(...) либо ручной `if (isPreset) start…`.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const APP = path.resolve(SRC, '../app');
const read = (p: string) => fs.readFileSync(p, 'utf-8') as string;

function playlistGameIds(): string[] {
  const blob = read(path.join(SRC, 'services/warmup.ts')) + read(path.join(SRC, 'constants/profiles.ts'));
  return [...new Set([...blob.matchAll(/game_id:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]))].sort();
}

function routeById(): Record<string, string> {
  const games = read(path.join(SRC, 'constants/games.ts'));
  const out: Record<string, string> = {};
  for (const m of games.matchAll(/id:\s*'([a-z0-9_]+)'[\s\S]{0,400}?route:\s*'\/games\/([a-z0-9-]+)'/g)) out[m[1]] = m[2];
  return out;
}

describe('плейлист зарядки: авто-старт', () => {
  const ids = playlistGameIds();
  const routes = routeById();

  it('в плейлистах есть игры (защита от пустой выборки — иначе тест «зелёный» ни о чём)', () => {
    expect(ids.length).toBeGreaterThan(20);
  });

  it.each(ids)('%s — есть экран и он авто-стартует по ?wu=1', (id) => {
    const route = routes[id];
    expect(route).toBeDefined();
    const file = path.join(APP, 'games', `${route}.tsx`);
    expect(fs.existsSync(file)).toBe(true);
    const src = read(file);
    /**
     * ⚠️ ПРОВЕРЯЕМ СМЫСЛ, А НЕ ФОРМУ. Прежняя редакция перечисляла три дословных
     * написания старта и краснела на исправных экранах, стоило написать четвёртым
     * способом. Требование одно: переход в партию висит на признаке автостарта.
     */
    const auto = /useAutostart(?:WhenReady)?\(/.test(src)
      || /if \(autostart[^)]*\)\s*(?:\{\s*)?(?:start|setPhase\('playing'\))/.test(src);
    expect(auto).toBe(true);
  });

  /**
   * 🔴 И СТАРТ ЖДЁТ ЗАГРУЗКИ УРОВНЯ.
   *
   * Уровень читается из хранилища асинхронно, а эффект монтирования всегда раньше
   * промиса — значит автостарт видел стартовую единицу вместо достигнутого. Человек
   * с двенадцатым уровнем открывал «Вызов дня», получал задачу ПЕРВОГО, безупречно
   * её проходил — и уровень не двигался: `reach(2)` при достигнутом 12 не делает
   * ничего. Дословный репорт: «уровней 15, но дальше первого я не ухожу».
   *
   * Лекарство было написано и стояло в ДВУХ экранах из шестидесяти шести. Здесь
   * оно требуется со всех сразу — иначе новый экран заведёт ту же беду заново.
   */
  it.each(ids)('%s — автостарт ждёт загрузки уровня', (id) => {
    const route = routes[id];
    const src = read(path.join(APP, 'games', `${route}.tsx`));
    const lvl = /const\s+([A-Za-z_$][\w$]*)\s*=\s*usePersistentLevel\(/.exec(src);
    if (!lvl) return;   // экран без персист-уровня ждать нечего
    const calls = [...src.matchAll(/useAutostart(?:WhenReady)?\(([\s\S]*?),\s*(?:\(\)|[A-Za-z_$])/g)]
      .map((m) => m[1] as string);
    const manual = [...src.matchAll(/if \(autostart([^)]*)\)/g)].map((m) => m[1] as string);
    const conds = calls.concat(manual);
    expect(`${id}: условий автостарта ${conds.length > 0}`).toBe(`${id}: условий автостарта true`);
    for (const c of conds) {
      expect(`${id}: «${c.trim().slice(0, 50)}» ждёт уровня`).toBe(`${id}: «${c.trim().slice(0, 50)}» ждёт уровня`.replace(/ждёт уровня$/, c.includes(`${lvl[1]}.loaded`) ? 'ждёт уровня' : 'НЕ ждёт уровня'));
    }
  });
});
