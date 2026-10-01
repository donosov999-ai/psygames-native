/* psygames-flutter-chess-blind-strings · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА СЛОВАРЯ «ДОСКИ В УМЕ» ДЛЯ FLUTTER — из собственного модуля языков
 * веб-игры (`src/games/chess-blind/core/i18n.ts`, 12 языков).
 *
 * 🔴 ОДИН ИСТОЧНИК, А НЕ ДВА. Строки серии (правила блоков, врезка, разбор
 * T₁/T₂/T₃, «уровень держит блок…») живут в модуле игры, а не в общем словаре.
 * Переписать их в общий словарь значило бы завести вторую копию, которая молча
 * разойдётся с первой. Поэтому приложение читает ВЫГРУЗКУ этого модуля.
 * Перевыпуск — из `frontend/`, после любой правки i18n.ts:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-chess-blind-strings.test.ts'
 */
import { CHESS_BLIND_LOCALES, getChessBlindStrings } from '@/src/games/chess-blind/core/i18n';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const АССЕТ = path.resolve(__dirname, '../../flutter/assets/chess_blind/strings.json');

describe('словарь «Доски в уме» для Flutter', () => {
  it('выгружает все 12 языков с одинаковым набором ключей', () => {
    const out: Record<string, Record<string, string>> = {};
    for (const loc of CHESS_BLIND_LOCALES) out[loc] = { ...getChessBlindStrings(loc) } as unknown as Record<string, string>;
    const keys = Object.keys(out.ru).sort();
    for (const loc of CHESS_BLIND_LOCALES) expect(Object.keys(out[loc]).sort()).toEqual(keys);
    fs.mkdirSync(path.dirname(АССЕТ), { recursive: true });
    fs.writeFileSync(АССЕТ, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  });
});
