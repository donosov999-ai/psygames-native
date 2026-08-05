/**
 * Техника, заданная шагом комплекса, обязана существовать в игре.
 *
 * ЗАЧЕМ. В профилях шаг дыхания приходит параметром `tech: 'calm478'`. Игра ищет
 * технику по этому ключу и при промахе МОЛЧА берёт первую из списка — то есть
 * вечерний набор вместо «Перед сном» запустил бы «Квадрат», и никто бы не узнал.
 * Ровно этот риск возникает при переименовании: 03.08 подписи техник меняли
 * (цифры ушли во вторую строку), и ключи уцелели только потому, что о них помнили.
 *
 * Проверяем файлами, а не импортом: TECHNIQUES объявлены внутри экрана игры и
 * наружу не экспортируются, а тащить их в отдельный модуль ради теста — лишняя
 * перестройка ради теста.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../..');

describe('ключи техник дыхания', () => {
  it('каждый tech из профилей есть в списке техник игры', () => {
    const game = readFileSync(join(ROOT, 'app/games/breathing.tsx'), 'utf8');
    const known = new Set(
      [...game.matchAll(/\{\s*key:\s*'([a-z0-9]+)'/g)].map((m: RegExpMatchArray) => m[1]),
    );
    expect(known.size).toBeGreaterThan(3);   // список действительно нашёлся

    const profiles = readFileSync(join(ROOT, 'src/constants/profiles.ts'), 'utf8');
    const used = [...profiles.matchAll(/tech:\s*'([a-z0-9]+)'/g)].map((m: RegExpMatchArray) => m[1]);

    const missing = used.filter((k: string) => !known.has(k));
    expect(missing).toEqual([]);
  });
});
