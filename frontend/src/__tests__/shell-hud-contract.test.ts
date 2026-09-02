/**
 * КАРКАС ПРИНИМАЕТ ДАННЫЕ, А НЕ ВЁРСТКУ — И ДЕРЖИТ ПОТОЛОК СЧЁТЧИКОВ.
 *
 * 🔴 ЗАЧЕМ. Репорт Вали 01.09.2026 со скриншотом: у сортировки было шесть
 * бейджей, они ломались во второй ряд, поле оставалось на трети экрана,
 * а цифры 7-8-9 в судоку уезжали под нижний край.
 *
 * Пока игра передавала готовую вёрстку (`stats`), правило «не больше четырёх»
 * применить было негде: каждая из 72 игр решала сама. Теперь игра отдаёт
 * список, а каркас решает, сколько влезет и как это выглядит — значит вид всех
 * игр меняется в одном месте.
 *
 * ⚠️ Проверяется ИСХОДНИК: собрать 72 экрана в jsdom дороже, чем вся правка.
 * Зато ловится тот способ сломать, который случается на деле — «добавлю пятый
 * счётчик, он же важный».
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'components', 'GameShell.tsx'), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const shellCode = strip(shell);

describe('договор шапки каркаса', () => {
  it('есть что проверять: каркас на месте', () => {
    expect(shell.length).toBeGreaterThan(5000);
  });

  it('🔴 каркас принимает данные: HudItem и ModItem объявлены и экспортированы', () => {
    expect(/export interface HudItem/.test(shell)).toBe(true);
    expect(/export interface ModItem/.test(shell)).toBe(true);
    // Тон — смысл, а не цвет: игра не должна передавать шестнадцатеричные коды.
    expect(/tone\?: 'neutral' \| 'accent' \| 'good' \| 'warn' \| 'bad'/.test(shell)).toBe(true);
  });

  it('🔴 потолок счётчиков живёт в каркасе и применяется', () => {
    const cap = /const HUD_MAX = (\d)/.exec(shellCode);
    expect(cap).not.toBeNull();
    expect(Number(cap![1])).toBeLessThanOrEqual(4);
    // Потолок не просто объявлен — им режут список.
    expect(/hud\.slice\(0, HUD_MAX\)/.test(shellCode)).toBe(true);
  });

  it('🔴 старый способ (stats) продолжает работать — иначе 72 игры ослепнут разом', () => {
    expect(/\) : stats}/.test(shellCode)).toBe(true);
  });

  it('🔴 нижняя полоса переключается объявлением, а не угадыванием', () => {
    expect(/bottom\?: 'answer' \| 'actions'/.test(shell)).toBe(true);
    expect(/headerActions && bottom !== 'actions'/.test(shellCode)).toBe(true);
    expect(/headerActions && bottom === 'actions'/.test(shellCode)).toBe(true);
  });

  it('отступы каркаса заданы двумя числами, а не рассыпаны по стилям', () => {
    expect(/const PAD_H = \d+;/.test(shellCode)).toBe(true);
    expect(/const PAD_V = \d+;/.test(shellCode)).toBe(true);
    // Полосы берут их, а не свои значения.
    for (const style of ['header', 'statsOuter', 'headerActions', 'field']) {
      const re = new RegExp(`${style}: \\{[^}]*PAD_[HV]`);
      expect(`${style}: ${re.test(shellCode)}`).toBe(`${style}: true`);
    }
  });
});

describe('сортировка переведена на данные', () => {
  const gs = strip(fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'goods-sort.tsx'), 'utf8'));

  it('🔴 счётчики отдаются списком, а не вёрсткой', () => {
    expect(/hud=\{\(\(\) =>/.test(gs)).toBe(true);
    expect(gs.includes('const items: HudItem[]')).toBe(true);
  });

  it('🔴 в списке не больше четырёх счётчиков', () => {
    const block = /hud=\{[\s\S]*?return items;/.exec(gs);
    expect(block).not.toBeNull();
    const pushes = (block![0].match(/key: '/g) || []).length;
    expect(`счётчиков у сортировки: ${pushes}`).toBe('счётчиков у сортировки: 4');
  });

  it('у каждого счётчика есть слово из словаря — этого требует hud-labels', () => {
    const block = /hud=\{[\s\S]*?return items;/.exec(gs)![0];
    const keys = (block.match(/key: '/g) || []).length;
    const labels = (block.match(/label: t\(/g) || []).length;
    expect(`подписей ${labels} на ${keys} счётчиков`).toBe(`подписей ${keys} на ${keys} счётчиков`);
  });
});
