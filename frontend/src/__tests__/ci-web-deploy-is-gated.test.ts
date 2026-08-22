/* psygames-ci-web-deploy-gate · VER 1 · 23.08.2026 */
/**
 * ВЕБ НЕ УЕЗЖАЕТ ЛЮДЯМ, ПОКА ЕГО НЕ ОТКРЫЛИ ХОТЬ ОДНОЙ ПРОВЕРКОЙ, ВИДЯЩЕЙ ИГРЫ.
 *
 * 🔴 ЧТО БЫЛО (аудит 22.08.2026, задача TeamOps 0940eb0a). `smoke` — единственная
 * проверка, которая открывает все игры, — шла ТОЛЬКО ПО ТЕГУ. А веб-сборка
 * выкладывается с main и держалась на `needs: [typecheck]`, то есть на `tsc` и
 * `jest`. Между правкой в main и живым сайтом не стояло ничего, что запускает
 * игру.
 *
 * 🔴 И САМА `smoke` ИГРУ НЕ ЗАПУСКАЛА. Её звали без `START=1`: открыть роут,
 * подождать 1,6 с, собрать консоль. Кнопку «Начать» она не нажимала ни разу.
 * Цена этого класса известна поимённо: у `goods-sort` 19.08 встал гейт
 * решаемости, а 22.08 нашлись 57 непроходимых уровней из 200 — гейт был
 * зелёным, потому что не исполнял код игры.
 *
 * ⚠️ ПОЧЕМУ ПРОВЕРКА РАЗБИРАЕТ ГРАФ, А НЕ ИЩЕТ СТРОКУ. «В файле есть слово
 * smoke» зелено и когда джоба выключена. Здесь строится карта «джоба → на чём
 * стоит и когда идёт», и утверждения делаются о НЕЙ.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const YML = path.join(__dirname, '../../..', '.github/workflows/build.yml');

interface Job { if?: string; needs?: string[] }

function jobs(): Record<string, Job> {
  const src = fs.readFileSync(YML, 'utf8') as string;
  const out: Record<string, Job> = {};
  let cur: string | null = null;
  for (const line of src.split('\n')) {
    const head = line.match(/^ {2}([a-z0-9_-]+):\s*$/);
    if (head) { cur = head[1]; out[cur] = {}; continue; }
    if (!cur) continue;
    const cond = line.match(/^ {4}if: (.+)$/);
    if (cond) out[cur].if = cond[1].trim();
    const needs = line.match(/^ {4}needs: \[(.+?)\]/);
    if (needs) out[cur].needs = needs[1].split(',').map((s: string) => s.trim());
  }
  return out;
}

const src = () => fs.readFileSync(YML, 'utf8') as string;

describe('выкладка веба', () => {
  it('разбор графа вообще работает — иначе весь файл самообман', () => {
    const j = jobs();
    expect(`джоб найдено: ${Object.keys(j).length > 6} · web-deploy есть: ${!!j['web-deploy']}`)
      .toBe('джоб найдено: true · web-deploy есть: true');
  });

  it('веб-деплой стоит на smoke и на веб-гейтах, а не на одном tsc', () => {
    const needs = jobs()['web-deploy'].needs ?? [];
    const missing = ['typecheck', 'smoke', 'web-gates'].filter((n) => !needs.includes(n));
    expect(`не хватает в needs у web-deploy: ${missing.length ? missing.join(', ') : 'ничего'}`)
      .toBe('не хватает в needs у web-deploy: ничего');
  });

  it('smoke идёт и на main, а не только по тегу', () => {
    const cond = jobs()['smoke'].if;
    expect(`условие запуска smoke: ${cond ?? 'нет — идёт всегда'}`)
      .toBe('условие запуска smoke: нет — идёт всегда');
  });

  it('веб-гейты идут и на main, а не только по тегу', () => {
    const cond = jobs()['web-gates'].if;
    expect(`условие запуска веб-гейтов: ${cond ?? 'нет — идёт всегда'}`)
      .toBe('условие запуска веб-гейтов: нет — идёт всегда');
  });

  it('smoke заходит В ИГРУ: вызывается со START=1', () => {
    const call = (src().match(/^.*scripts\/smoke-games\.mjs.*$/m) || [''])[0];
    expect(`START=1 в вызове: ${/\bSTART=1\b/.test(call)}`).toBe('START=1 в вызове: true');
  });

  it('веб-деплой по-прежнему идёт только с main', () => {
    expect(jobs()['web-deploy'].if).toContain("refs/heads/main");
  });
});
