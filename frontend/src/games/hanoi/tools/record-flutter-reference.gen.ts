/* psygames-hanoi-record-flutter-reference · VER 1 · 02.10.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН ДЛЯ НАТИВНОЙ «ХАНОЙСКОЙ БАШНИ». Пишет `flutter/test/fixtures/hanoi-reference.json`:
 * оптимум Фрейма-Стюарта (он же минимум ходов), звёзды, счёт и лестницу уровней.
 *
 * 🔴 ПОЧЕМУ ВЫГРУЗЧИК ЛЁГ В РЕПО ТОЛЬКО СЕЙЧАС (задача 87ca926a). Эталон положен 23.09 при
 * переносе разовой пробой, которая после выгрузки удалялась. Вшитые данные без выгрузчика не
 * чинятся: правка веба молча расходилась бы с эталоном, а переснять его было бы нечем. Этот
 * файл пересоздаёт эталон 23.09 байт в байт — проверено перегоном 02.10.2026.
 *
 * ⚠️ ОПТИМУМ ДЛЯ 4+ СТЕРЖНЕЙ НЕ «2^n − 1». Формула Фрейма-Стюарта считается перебором
 * разбиений, и на телефоне её надо считать так же: иначе звёзды начнут врать ровно с того
 * уровня, где появляется четвёртый стержень.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `src/games/hanoi/optimal.ts` или `levelParams` в `app/games/hanoi.tsx` —
 * ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ вместе с правкой Dart.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/hanoi/tools/record-flutter-reference.gen.ts'
 */
import { frameStewart, hanoiScore, hanoiStars } from '@/src/games/hanoi/optimal';
import { levelParams } from '@/app/games/hanoi';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/hanoi-reference.json');

describe('эталон «Ханойской башни» для Flutter', () => {
  it('выгружен', () => {
    const optimal = [];
    for (let pegs = 3; pegs <= 6; pegs += 1) {
      for (let n = 0; n <= 14; n += 1) optimal.push({ n, pegs, moves: frameStewart(n, pegs) });
    }
    const levels = [];
    for (let level = 1; level <= 30; level += 1) {
      const p = levelParams(level);
      levels.push({ level, discs: p.discs, pegs: p.pegs, optimal: frameStewart(p.discs, p.pegs) });
    }
    const stars = [];
    for (const min of [7, 15, 31, 129]) {
      for (const moves of [min - 1, min, min + 1, Math.ceil(min * 1.5), Math.ceil(min * 1.5) + 1, min * 3]) {
        stars.push({ moves, min, stars: hanoiStars(moves, min) });
      }
    }
    const scores = [];
    const scoreCases: [number, number, number][] = [[7, 7, 10], [9, 7, 30], [31, 31, 120], [60, 31, 400], [7, 7, 5000]];
    for (const [moves, min, seconds] of scoreCases) {
      scores.push({ moves, min, seconds, score: hanoiScore(moves, min, seconds) });
    }
    writeFileSync(REFERENCE_PATH, `${JSON.stringify({
      source: 'живой TS: src/games/hanoi/optimal.ts + app/games/hanoi.tsx (levelParams)',
      optimal, levels, stars, scores,
    })}\n`);
    expect(optimal.length).toBe(60);
    expect(levels.length).toBe(30);
  }, 300_000);
});
