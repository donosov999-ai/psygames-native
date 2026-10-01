/**
 * 🔴 ВШИТЫЕ УРОВНИ ПИЛОТА FLUTTER СОВПАДАЮТ С ГЕНЕРАТОРОМ ВЕБА (задача 3dc0168c).
 *
 * Нативные «Соедини точки» и «Одной линией» играют уровни из ассетов, веб — генератором.
 * Поменяли генератор — ассет молча остался старым, и две половины приложения дают разные
 * уровни под одним номером. Тогда выгрузить заново: scripts/flutter-pilot-levels.test.ts.
 */
import { pilotDotsConnect, pilotOneLine } from '@/src/services/flutterPilotLevels';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { resolve(...p: string[]): string };
const read = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../flutter/assets/levels', f), 'utf8'));

describe('уровни пилота Flutter = генератор веба', () => {
  it('«Соедини точки»: тренировка и 40 уровней', () => {
    const file = read('dots_connect.json');
    const now = pilotDotsConnect();
    expect(now.training).toEqual(file.training);
    now.levels.forEach((l, i) => expect([i + 1, l]).toEqual([i + 1, file.levels[i]]));
    expect(file.levels).toHaveLength(now.levels.length);
  }, 300_000);

  it('«Одной линией»: 30 уровней', () => {
    const file = read('one_line.json');
    const now = pilotOneLine();
    now.levels.forEach((l, i) => expect([i + 1, l]).toEqual([i + 1, file.levels[i]]));
    expect(file.levels).toHaveLength(now.levels.length);
  }, 300_000);
});
