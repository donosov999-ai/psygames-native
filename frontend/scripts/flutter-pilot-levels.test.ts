/* psygames-flutter-pilot-levels · VER 1 · 01.10.2026 (задача 3dc0168c)
 * ВЫГРУЗЧИК уровней пилота Flutter. Запуск из frontend/:
 *   npx jest --rootDir . --testMatch '**\/scripts/flutter-pilot-levels.test.ts'
 * Пишет flutter/assets/levels/dots_connect.json и one_line.json тем же генератором, что и веб.
 */
import { pilotDotsConnect, pilotOneLine } from '@/src/services/flutterPilotLevels';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string };
const ПАПКА = path.resolve(__dirname, '../../flutter/assets/levels');

describe('уровни пилота Flutter', () => {
  it('выгружает', () => {
    fs.writeFileSync(path.resolve(ПАПКА, 'dots_connect.json'), JSON.stringify(pilotDotsConnect()), 'utf8');
    fs.writeFileSync(path.resolve(ПАПКА, 'one_line.json'), JSON.stringify(pilotOneLine()), 'utf8');
  }, 300_000);
});
