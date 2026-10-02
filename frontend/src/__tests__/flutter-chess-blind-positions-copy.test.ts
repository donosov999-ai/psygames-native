/* psygames-flutter-chess-blind-positions-copy · VER 1 · 01.10.2026 */
/**
 * ПОЗИЦИИ «ДОСКИ В УМЕ» У FLUTTER — ПОБАЙТНАЯ КОПИЯ ВЕБ-ФАЙЛА (задача 02c7d73b).
 *
 * `flutter/assets/chess_blind/positions.json` — копия
 * `frontend/src/games/chess-blind/data/lichess-positions.json`, а копировщика в
 * репо не было: правка веба расходилась бы с приложением молча, и первая же
 * пересборка ассетов стёрла бы ручную правку копии. Здесь — гейт, а не скрипт:
 * разошлись — CI красный, и в сообщении стоит команда, которая чинит.
 */
declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { resolve(...p: string[]): string };

const webFile = path.resolve(__dirname, '../games/chess-blind/data/lichess-positions.json');
const flutterFile = path.resolve(__dirname, '../../../flutter/assets/chess_blind/positions.json');
const fix =
  'cp frontend/src/games/chess-blind/data/lichess-positions.json flutter/assets/chess_blind/positions.json';

describe('позиции «Доски в уме»: копия Flutter совпадает с веб-файлом', () => {
  it('побайтно', () => {
    // Чтение строкой utf8: файлы — JSON, и любое расхождение байтов здесь видно.
    const web = fs.readFileSync(webFile, 'utf8');
    const app = fs.readFileSync(flutterFile, 'utf8');
    if (web !== app) {
      throw new Error(`flutter/assets/chess_blind/positions.json разошёлся с веб-файлом. Почини из корня репо:\n  ${fix}`);
    }
    expect(web.length).toBeGreaterThan(100000);
  });
});
