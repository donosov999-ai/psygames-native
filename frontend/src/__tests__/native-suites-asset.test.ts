/**
 * 🔴 НАБОРЫ ДЛЯ НАТИВА = НАБОРЫ ВЕБА. Нативный переключатель режимов (flutter/lib/shell/suite_switch.dart)
 * читает flutter/assets/game_suites.json — выгрузку `GAME_SUITES` скриптом flutter/tools/embed-suites.mjs.
 * Правка набора без перевыгрузки дала бы две правды: веб переключал бы на один список, натив — на другой.
 *
 * Покраснело — выгрузить заново: node flutter/tools/embed-suites.mjs && node flutter/tools/embed-l10n.mjs
 */
import { GAME_SUITES } from '@/src/constants/gameSuites';

// Через `require`: у проверки типов в CI нет типов node (как в fab-clearance.test.ts и соседях).
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as { readFileSync(p: string, e: string): string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as { resolve(...p: string[]): string };

const asset = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../flutter/assets/game_suites.json'), 'utf8'),
) as { suites: { id: string; titleKey: string; descKey: string; modes: { route: string; labelKey: string }[] }[] };

describe('наборы игр для нативной половины', () => {
  it('ассет совпадает с gameSuites.ts: наборы, порядок, маршруты и подписи режимов', () => {
    const fromWeb = GAME_SUITES.map((s) => ({
      id: s.id,
      titleKey: s.titleKey,
      descKey: s.descKey,
      modes: s.modes.map((m) => ({ route: m.route, labelKey: m.labelKey })),
    }));
    expect(asset.suites).toEqual(fromWeb);
  });

  it('наборов больше одного, и у каждого не меньше двух режимов — иначе переключать нечего', () => {
    expect(asset.suites.length).toBeGreaterThan(1);
    for (const s of asset.suites) expect([s.id, s.modes.length >= 2]).toEqual([s.id, true]);
  });
});
