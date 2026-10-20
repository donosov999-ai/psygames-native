/* psygames-flutter-onboarding-asset-fresh · VER 1 · 20.10.2026 */
/**
 * ДАННЫЕ «ЗНАКОМСТВА» ДЛЯ МОДЕЛИ НА DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача d6a60b02, вариант Б).
 *
 * Модель экрана (`lib/shell/onboarding_model.dart`) берёт отсюда: игры знакомства (`getOnboardingGames`),
 * три вопроса подбора (`QUIZ`), слайды обучения (`SLIDES`, с видом слайда) и ПОДБОР ГОТОВОЙ ТАБЛИЦЕЙ —
 * `pickGames` на всех 27 сочетаниях ответов: три игры и профиль-подсказка. Подбор — чистая функция от
 * трёх ответов, поэтому переносится данными, а не вторым счётом весов. Ключи словаря, которые Dart зовёт
 * переменной, — поля `nameKey`, `skillKey`, `descKey`, `qKey`, `opts`, `titleKey`, `bodyKey` (`embed-l10n.mjs`).
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-onboarding-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs`.
 */
import { QUIZ, SLIDES } from '../../app/onboarding';
import { getOnboardingGames } from '@/src/services/onboarding';
import { pickGames, type PickerAnswers } from '@/src/services/gamePicker';
import { PROFILES } from '@/src/constants/profiles';
import { gameThumb } from '@/src/constants/gameThumbs';
import { assetUri } from '@/src/services/hostScreens';
import { RTL_LANGS } from '@/src/services/rtl';
import type { GameConfig } from '@/src/constants/games';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/onboarding.json');

/** Адреса картинок — сборки (`/assets/…`): в jest это относительный путь с именем рабочей папки. */
const clean = (v: any): any => (typeof v === 'string' ? v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/') : v);

/** Карточка игры — те же поля, что `card` экрана, ключами словаря. */
const card = (g: GameConfig) => ({
  id: g.id, nameKey: g.nameKey, skillKey: g.skillKey, descKey: g.descKey, gradient: g.gradient, icon: g.icon,
  thumb: clean(assetUri(gameThumb(g.id))) ?? null,
});

function build(): string {
  const picks: Record<string, { games: string[]; profileId: string }> = {};
  const cards: Record<string, ReturnType<typeof card>> = {};
  for (const g of getOnboardingGames()) cards[g.id] = card(g);
  for (const mood of [0, 1, 2] as const) for (const time of [0, 1, 2] as const) for (const taste of [0, 1, 2] as const) {
    const r = pickGames({ mood, time, taste } as PickerAnswers);
    picks[`${mood}${time}${taste}`] = { games: r.games.map((g) => g.id), profileId: r.profileId };
    for (const g of r.games) cards[g.id] = card(g);
  }
  const profileIds = new Set(Object.values(picks).map((p) => p.profileId));
  const data = {
    pickerGames: getOnboardingGames().map((g) => g.id),
    cards,
    picks,
    // Подпись профиля-подсказки: «значок имя» (`recProfile.emoji` и `display_name`).
    profileLabels: Object.fromEntries(PROFILES.filter((p) => profileIds.has(p.id)).map((p) => [p.id, `${p.emoji} ${p.display_name}`])),
    quiz: QUIZ,
    slides: SLIDES,
    // Языки справа налево — стрелки «дальше» и карточек (`isRTLLang`).
    rtl: RTL_LANGS,
  };
  return `${JSON.stringify(data, null, 1)}\n`;
}

describe('flutter/assets/onboarding.json — свежая выгрузка данных «Знакомства»', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-onboarding-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('подбор — на все 27 сочетаний по три игры; картинки — адресами сборки', () => {
    const data = JSON.parse(build());
    expect(JSON.stringify(data)).not.toMatch(/\.\.\/|frontend\//);
    expect(Object.keys(data.picks)).toHaveLength(27);
    for (const p of Object.values(data.picks) as any[]) {
      expect(p.games).toHaveLength(3);
      for (const id of p.games) expect(data.cards[id]).toBeDefined();
      expect(data.profileLabels[p.profileId]).toEqual(expect.any(String));
    }
  });
});
