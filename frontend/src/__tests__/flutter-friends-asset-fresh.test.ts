/* psygames-flutter-friends-asset-fresh · VER 1 · 20.10.2026 */
/**
 * ДАННЫЕ «ДРУЗЕЙ» ДЛЯ МОДЕЛИ НА DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача d6a60b02, вариант Б).
 *
 * Модель экрана (`lib/shell/friends_model.dart`) берёт отсюда зачётные игры таблицы по порядку чипов
 * (`GAME_IDS`), ключ имени (`NAME_KEY`) и вид очка (`FORMAT`). Вид выводится из того, что `FORMAT` печатает,
 * и вместе с образцами печати на неудобных числах (полушаги, тысячи) едет в ассет: проба Dart печатает те же
 * числа и сверяет строку в строку — `toFixed` и `Math.round` у JS свои.
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-friends-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs`.
 */
import { FORMAT, GAME_IDS, NAME_KEY } from '../../app/friends';
import { RTL_LANGS } from '@/src/services/rtl';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/friends.json');

const SAMPLES = [0, 1, 2.5, 3.25, 3.35, 0.05, 1.005, 4, 12.45, 1499.5, 2500.49, 7];

/** Вид очка по тому, что печатает `FORMAT`: «-back», « ms», «s» после одного знака, иначе — целое. */
function kindOf(f: (s: number) => string): string {
  const v = f(3.25);
  if (v.endsWith('-back')) return 'back';
  if (v.endsWith(' ms')) return 'ms';
  if (/^\d+\.\ds$/.test(v)) return 'seconds';
  if (/^\d+$/.test(v)) return 'round';
  throw new Error(`новый вид очка: ${v}`);
}

function build(): string {
  const data = {
    games: GAME_IDS.map((id) => ({ id, nameKey: NAME_KEY[id], format: kindOf(FORMAT[id]) })),
    samples: Object.fromEntries(GAME_IDS.map((id) => [id, SAMPLES.map((x) => [x, FORMAT[id](x)])])),
    // Языки справа налево — стрелка «назад» (`isRTLLang`).
    rtl: RTL_LANGS,
  };
  return `${JSON.stringify(data, null, 1)}\n`;
}

describe('flutter/assets/friends.json — свежая выгрузка данных «Друзей»', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-friends-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });
});
