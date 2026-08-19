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
     * ТРИ ЗАКОННЫХ СПОСОБА, А НЕ ДВА.
     *
     * Семь игр, приехавших из лаборатории 19.08.2026, стартуют строкой
     * `if (autostart) setPhase('playing')` — у них `start()` это и есть
     * `setAttempt(n + 1); setPhase('playing')`, то есть переход в фазу партии
     * и есть старт. Гейт этого не знал и краснел на исправных экранах.
     *
     * Проверка от этого НЕ слабеет: переход по-прежнему обязан висеть на
     * `autostart`. Экран, который просто где-то зовёт setPhase('playing'),
     * условию не отвечает — регулярка требует `if (autostart …)` перед ним.
     */
    const auto = src.includes('useAutostart(')
      || /if \(autostart\)\s*start/.test(src)
      || /if \(autostart[^)]*\)\s*(?:\{\s*)?(?:start\(|setPhase\('playing'\))/.test(src);
    expect(auto).toBe(true);
  });
});
