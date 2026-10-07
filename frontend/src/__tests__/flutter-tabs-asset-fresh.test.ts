/* psygames-flutter-tabs-asset-fresh · VER 3 · 07.10.2026 */
/**
 * ПРАВИЛА НИЖНЕЙ ПОЛОСЫ ДЛЯ НАТИВНОЙ ОБОЛОЧКИ — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача 5136754e).
 *
 * VER 2: плюс кнопка отзыва (`fab`) — на нативной вкладке её рисует оболочка, а место, порог
 * перетаскивания, ключ запомненного места и ключ «скрыть кнопку» живут в `fabPosition.ts` и
 * `appFeedback.ts`.
 *
 * Пять вкладок, их значки и подписи, адреса без полосы живут в `src/services/tabBar.ts`. Натив
 * читает `flutter/assets/tabs.json`; без выгрузки правило на Dart отстало бы от веба молча —
 * например, новая служебная страница получила бы полосу только в одной из половин.
 *
 * ⚠️ СТОРОЖ: без WRITE сравнивает и краснеет. Перевыпуск из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-tabs-asset-fresh.test.ts
 */
import { TABS, NO_TAB_BAR_PREFIXES, TAB_BAR_H, tabBarVisible } from '@/src/services/tabBar';
import { FAB_SIZE, FAB_BOTTOM, FAB_CLEARANCE, EDGE, DRAG_THRESHOLD, FAB_SPOT_KEY, FAB_COLOR } from '@/src/services/fabPosition';
import { textOn } from '@/src/services/onGradientText';
import { DEVCHAT_KEY } from '@/src/services/appFeedback';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/tabs.json');

function build(): string {
  const fab = {
    size: FAB_SIZE, bottom: FAB_BOTTOM, clearance: FAB_CLEARANCE, edge: EDGE, dragThreshold: DRAG_THRESHOLD,
    color: FAB_COLOR, iconColor: textOn(FAB_COLOR), spotKey: FAB_SPOT_KEY, visibleKey: DEVCHAT_KEY,
  };
  return `${JSON.stringify({ height: TAB_BAR_H, tabs: TABS, noBar: NO_TAB_BAR_PREFIXES, fab }, null, 1)}\n`;
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
