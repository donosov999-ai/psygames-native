/* psygames-flutter-tabs-asset-fresh · VER 1 · 07.10.2026 */
/**
 * ПРАВИЛА НИЖНЕЙ ПОЛОСЫ ДЛЯ НАТИВНОЙ ОБОЛОЧКИ — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача 5136754e).
 *
 * Пять вкладок, их значки и подписи, адреса без полосы живут в `src/services/tabBar.ts`. Натив
 * читает `flutter/assets/tabs.json`; без выгрузки правило на Dart отстало бы от веба молча —
 * например, новая служебная страница получила бы полосу только в одной из половин.
 *
 * ⚠️ СТОРОЖ: без WRITE сравнивает и краснеет. Перевыпуск из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-tabs-asset-fresh.test.ts
 */
import { TABS, NO_TAB_BAR_PREFIXES, TAB_BAR_H, tabBarVisible } from '@/src/services/tabBar';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/tabs.json');

function build(): string {
  return `${JSON.stringify({ height: TAB_BAR_H, tabs: TABS, noBar: NO_TAB_BAR_PREFIXES }, null, 1)}\n`;
}

describe('flutter/assets/tabs.json — правила нижней полосы', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-tabs-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('список начал — это и есть правило веба (функция не держит своих исключений)', () => {
    for (const p of ['/', '/games', '/games/span', '/onboarding', '/settings', '/assessment-result', '/pet']) {
      expect([p, tabBarVisible(p)]).toEqual([p, !NO_TAB_BAR_PREFIXES.some((x) => p.startsWith(x))]);
    }
  });
});
