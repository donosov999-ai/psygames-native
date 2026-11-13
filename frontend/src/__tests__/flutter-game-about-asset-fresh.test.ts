/* psygames-flutter-game-about-asset-fresh · VER 1 · 12.11.2026 */
/**
 * «ОБ ИГРЕ» ВО FLUTTER = `<GameAbout>` ВЕБ-ЭКРАНОВ (задача 3a365b5d).
 *
 * Блок «Об игре» во Flutter один — в паузе каркаса (`flutter/lib/shell/game_about.dart`), а описание и
 * польза каждой игры лежат таблицей `flutter/assets/game_about.json`. Таблицу выгружает
 * `flutter/tools/export-game-about.mjs` из `frontend/app/games/*.tsx`. Сторож: поменяли пользу или
 * описание в веб-экране и не перевыгрузили — красный.
 *
 * Перевыпуск из `flutter/`: `node tools/export-game-about.mjs`, затем `node tools/embed-l10n.mjs` из корня.
 */
declare const require: (id: string) => any;
declare const __dirname: string;
declare const process: { execPath: string };
const { execFileSync } = require('child_process') as {
  execFileSync(cmd: string, args: string[], o: object): string;
};
const path = require('path') as { resolve(...p: string[]): string };

const FLUTTER = path.resolve(__dirname, '../../../flutter');

describe('flutter/assets/game_about.json — свежая выгрузка веб-экранов', () => {
  it('совпадает с <GameAbout> в frontend/app/games', () => {
    const out = execFileSync(process.execPath, ['tools/export-game-about.mjs', '--check'], {
      cwd: FLUTTER,
      encoding: 'utf8',
    });
    expect(out).toMatch(/^ok: \d+ игр/);
  });
});
