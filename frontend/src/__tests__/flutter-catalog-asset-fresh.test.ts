/* psygames-flutter-catalog-asset-fresh · VER 1 · 02.10.2026 */
/**
 * КАТАЛОГ ИГР ДЛЯ НАТИВНОГО ЭКРАНА «ИГРЫ» — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS, И СВЕЖЕСТЬ ПОД СТОРОЖЕМ
 * (задачи f5025027 поиск и фильтр, 9bd1b15d перенос каталога).
 *
 * 🔴 ПОЧЕМУ ВЫГРУЗКА, А НЕ КОПИЯ. Раздел, навык, ключи названия и описания, градиент живут в
 * `GAMES` (`src/constants/games.ts`, 1500+ строк). Список на Dart стал бы вторым реестром,
 * который отстанет от первого молча — ровно так 23.09 развилки говорили по-русски на всех языках.
 * Натив читает `flutter/assets/catalog.json`, эта проба держит его свежим.
 *
 * Чего здесь НЕТ: отбора по профилю. Его считает веб той же функцией, что рисует свою вкладку,
 * и кладёт в общую память (`hubVisibility().catalog`, `psygames_hub_visible`).
 *
 * ⚠️ ЭТО СТОРОЖ: без переменной WRITE он сравнивает и КРАСНЕЕТ, если игры поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-catalog-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs` (ключи навыков и разделов словарь берёт отсюда).
 */
import { GAMES, CATEGORY_ORDER, CATEGORY_META } from '@/src/constants/games';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/catalog.json');

/** Поля карточки вкладки «Игры» (`GameCard` в `CategorySections`) и то, по чему ищут и фильтруют. */
const FIELDS = ['id', 'route', 'nameKey', 'descKey', 'skillKey', 'category', 'icon', 'gradient', 'hub', 'sandbox', 'hideFromMenu'] as const;

function build(): string {
  const games = GAMES.map((g) => {
    const o: Record<string, unknown> = {};
    for (const f of FIELDS) if ((g as any)[f] !== undefined) o[f] = (g as any)[f];
    return o;
  });
  const categories = CATEGORY_ORDER.map((id) => ({ id, ...CATEGORY_META[id] }));
  // По записи на строку: два PR, тронувшие разные игры, сводятся сами.
  const top = (k: string, v: unknown[]) => `${JSON.stringify(k)}:[\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
  return `{\n${top('categories', categories)},\n${top('games', games)}\n}\n`;
}

describe('flutter/assets/catalog.json — свежая выгрузка каталога', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    // Сообщение — команда, а не загадка: тот, кто правил игры, чинит одним запуском.
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-catalog-asset-fresh.test.ts && node ../flutter/tools/embed-l10n.mjs' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('у каждой игры есть раздел из порядка разделов и ключ навыка', () => {
    const cats = new Set<string>(CATEGORY_ORDER);
    const bad = GAMES.filter((g) => !cats.has(g.category) || !g.skillKey).map((g) => g.id);
    expect(bad).toEqual([]);
  });
});
