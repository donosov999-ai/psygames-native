/* psygames-flutter-home-asset-fresh · VER 1 · 07.10.2026 */
/**
 * ДАННЫЕ ГЛАВНОЙ ДЛЯ МОДЕЛИ НА DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS, И СВЕЖЕСТЬ ПОД СТОРОЖЕМ (задача d6a60b02,
 * вариант Б, Главная).
 *
 * `buildHomeModel` (`services/homeModel.ts`) красит карточки цветами `onLook` — это 330 строк цветовой
 * математики (`onGradientText`, WCAG по обоим концам градиента). На Dart её НЕ переписываем, как и для
 * плиток каталога: набор градиентов Главной конечен (игры, слоты зарядки, «Релаксация»), и готовый
 * ответ веба не разойдётся с вебом по определению. Здесь же — ключи словаря, которые Главная собирает
 * на лету (замки лестницы, слоты, сложности вызова, причины рекомендаций и цели, примеры цели):
 * сборщик словаря натива (`embed-l10n.mjs`) берёт их из поля `textKeys`.
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-home-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs`.
 */
import { GAMES } from '@/src/constants/games';
import { SLOT_TINT, HERO_EYE } from '@/src/constants/homeHero';
import { onLook } from '@/src/services/homeModel';
import { textOn } from '@/src/services/onGradientText';
import { FEATURE_LADDER } from '@/src/services/featureLadder';
import { DIFFS } from '@/src/services/daily-challenge';
import { RECO_REASON_KEY } from '@/src/services/recommend';
import { DAY_GOAL_EXAMPLE_KEYS } from '@/src/services/dailyGoal';
import { SUGGEST_REASONS } from '@/src/services/goalSuggest';
import { translateFor } from '@/src/contexts/LanguageContext';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/home.json');

/** Ключ таблицы цветов: концы градиента карточки, как их берёт `buildHomeModel`. */
const lookKey = (a: string, b: string) => `${a}|${b}`;

function build(): string {
  const pairs: [string, string][] = [
    ...GAMES.map((g) => [g.gradient[0], g.gradient[g.gradient.length - 1]] as [string, string]),
    ...Object.values(SLOT_TINT),
    HERO_EYE,
  ];
  const heroLooks: Record<string, ReturnType<typeof onLook>> = {};
  for (const [a, b] of pairs) heroLooks[lookKey(a, b)] = onLook(a, b);
  const slots = Object.keys(SLOT_TINT).map((s) => `slot${s.charAt(0).toUpperCase()}${s.slice(1)}`);
  const candidates = [
    ...FEATURE_LADDER.map((l) => l.titleKey),
    ...slots, ...slots.map((s) => `${s}Desc`),
    ...DIFFS,
    ...Object.values(RECO_REASON_KEY),
    ...DAY_GOAL_EXAMPLE_KEYS,
    ...SUGGEST_REASONS.map((r) => `goalSuggest_${r}`),
  ];
  // Только ключи, которые в веб-словаре есть: у причин без числа (`start_week`, `no_data`) подписи нет.
  const textKeys = [...new Set(candidates)].filter((k) => translateFor('en', k) !== k).sort();
  const data = {
    heroLooks: Object.fromEntries(Object.entries(heroLooks).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    textOn: { '#22c55e': textOn('#22c55e'), '#ef4444': textOn('#ef4444') },
    slotTint: SLOT_TINT,
    heroEye: HERO_EYE,
    textKeys,
  };
  // По записи на строку: два PR, тронувшие разные игры, сводятся сами.
  const looks = Object.entries(data.heroLooks).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n');
  return `{\n"heroLooks":{\n${looks}\n},\n"textOn":${JSON.stringify(data.textOn)},\n"slotTint":${JSON.stringify(data.slotTint)},\n`
    + `"heroEye":${JSON.stringify(data.heroEye)},\n"textKeys":${JSON.stringify(data.textKeys)}\n}\n`;
}

describe('flutter/assets/home.json — свежая выгрузка данных Главной', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-home-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('ключи на лету есть в словаре: у каждого замка, слота и сложности — строка', () => {
    const data = JSON.parse(build());
    expect(data.textKeys.length).toBeGreaterThan(20);
    for (const l of FEATURE_LADDER) expect(data.textKeys).toContain(l.titleKey);
    for (const d of DIFFS) expect(data.textKeys).toContain(d);
  });
});
