/* psygames-flutter-profiles-asset-fresh · VER 1 · 02.10.2026 */
/**
 * ПРОФИЛИ ДЛЯ НАТИВНЫХ НАСТРОЕК — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS, И СВЕЖЕСТЬ ПОД СТОРОЖЕМ (задача eae0879c).
 *
 * 🔴 ПОЧЕМУ ВЫГРУЗКА, А НЕ КОПИЯ. Кто из профилей заперт, решают `requiresUnlock` и
 * `isComingSoon` (`src/services/unlock.ts`) по флагу `UNLOCK_CODES_ENABLED`; поля карточек и
 * порядок — `PROFILES` (`src/constants/profiles.ts`, 1287 строк). Переписать это в Dart —
 * завести второй источник правды, который разойдётся с первым молча. Поэтому натив читает
 * `flutter/assets/profiles.json`, а эта проба держит его свежим.
 *
 * ⚠️ ЭТО СТОРОЖ, А НЕ ТОЛЬКО ВЫГРУЗЧИК: без переменной WRITE он сравнивает и КРАСНЕЕТ, если
 * профили в вебе поменяли, а ассет нет. Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-profiles-asset-fresh.test.ts
 */
import { PROFILES, MONETIZATION_ENABLED, PUBLIC_GAME_COUNT } from '@/src/constants/profiles';
import { UNLOCK_CODES_ENABLED, requiresUnlock, isComingSoon } from '@/src/services/unlock';
import { GAMES } from '@/src/constants/games';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/profiles.json');

/** Поля, которые читает экран настроек (`app/settings.tsx`): карточка, лист деталей, подвал. */
const FIELDS = [
  'id', 'group', 'emoji', 'color', 'allowed_games', 'session_minutes',
  'audience', 'audience_en', 'sales_hook', 'sales_hook_en', 'long_description', 'long_description_en',
  'warmup_enabled', 'financial_brain_day_enabled', 'assessment_enabled',
] as const;

function build(): string {
  const profiles = PROFILES.map((p) => {
    const o: Record<string, unknown> = {};
    for (const f of FIELDS) if ((p as any)[f] !== undefined) o[f] = (p as any)[f];
    o.requiresUnlock = requiresUnlock(p.id);
    o.comingSoon = isComingSoon(p.id);
    return o;
  });
  // Игры из списков профилей — для листа деталей: имя ключом словаря и категория (значок).
  const ids = new Set<string>();
  for (const p of PROFILES) if (Array.isArray(p.allowed_games)) p.allowed_games.forEach((g) => ids.add(g));
  const games: Record<string, { nameKey: string; category: string }> = {};
  for (const g of GAMES) if (ids.has(g.id)) games[g.id] = { nameKey: g.nameKey, category: g.category };
  const data = {
    flags: { MONETIZATION_ENABLED, UNLOCK_CODES_ENABLED, PUBLIC_GAME_COUNT },
    profiles,
    games,
  };
  // По записи на строку верхнего уровня: два PR, тронувшие разные профили, сводятся сами.
  const top = (k: string, v: unknown) =>
    Array.isArray(v)
      ? `${JSON.stringify(k)}:[\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]`
      : `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  return `{\n${Object.entries(data).map(([k, v]) => top(k, v)).join(',\n')}\n}\n`;
}

describe('flutter/assets/profiles.json — свежая выгрузка профилей', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    // Сообщение — команда, а не загадка: тот, кто правил профили, чинит одним запуском.
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-profiles-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });
});
