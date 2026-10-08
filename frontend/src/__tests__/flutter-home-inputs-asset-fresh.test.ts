/* psygames-flutter-home-inputs-asset-fresh · VER 1 · 08.10.2026 */
/**
 * ДАННЫЕ ВХОДОВ ГЛАВНОЙ ДЛЯ DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача d6a60b02, вариант Б, Главная — шаг 7б).
 *
 * Входы `buildHomeModel` (что Главная читает из хранилища и как раскладывает) Dart собирает сам
 * (`lib/shell/home_inputs.dart`). Правила переносятся кодом, а ТАБЛИЦЫ — здесь, одной выгрузкой:
 * картинки профилей (фон, вордмарк, плашка, значок), аватары, вещи витрины, кадры питомца по облику
 * и состоянию (`petRenderSpec`), реплики окна цели, лестница замков, свежие игры, правила
 * рекомендаций, игры доменов оценки, сроки цели. Вторая копия любой из них на Dart разошлась бы
 * с вебом при первой правке.
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-home-inputs-asset-fresh.test.ts
 */
import { PROFILES } from '@/src/constants/profiles';
import { profileBackground } from '@/src/constants/profileBackgrounds';
import { logoForProfile, logoPlateFor } from '@/src/constants/profileLogos';
import { profileBadge } from '@/src/constants/profileBadges';
import { AVATAR_IMAGES } from '@/src/constants/avatars';
import { FEATURE_ICONS } from '@/src/constants/featureIcons';
import { LOGO_PLATE_BG, TODAY_ROWS_MAX } from '@/src/constants/homeHero';
import { FRESH, FRESH_DAYS, FRESH_MIN } from '@/src/constants/freshGames';
import { COSMETICS } from '@/src/services/cosmetics';
import { petRenderSpec } from '@/src/components/pet/PetSprite';
import { goalLineLanguages, pickGoalLine } from '@/src/services/goalPetLines';
import { FEATURE_LADDER } from '@/src/services/featureLadder';
import {
  RECO_COUNT, RECO_STALE_DAYS, RECO_BRANCH_WINDOW_DAYS, RECO_FRESH_EVERY, RECO_EVENING_BANNED, RECO_STARTERS, RECO_REASON_KEY,
} from '@/src/services/recommend';
import { DOMAINS } from '@/src/services/assessment';
import { GOAL_DAYS, ASK_EVERY_DAYS } from '@/src/services/streakGoal';
import { STREAK_COUNTS_FROM } from '@/src/services/goalSuggest';
import { СВЕЖЕСТЬ_ДНЕЙ } from '@/src/services/weakSkill';
import { RESUME_MAX_AGE_MS } from '@/src/services/resume';
import { DAY_GOAL_MAX_LEN, DAY_GOAL_EXAMPLE_KEYS } from '@/src/services/dailyGoal';
import { DAY_STREAK_FOR_MULT } from '@/src/services/earn';
import { FAVOURITE_SECTIONS } from '@/src/services/favouriteCategories';
import { MAX_CONTAINER_WIDTH, CONTAINER_PADDING } from '@/src/components/CategorySections';
import { assetUri } from '@/src/services/hostScreens';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/home_inputs.json');

/**
 * Картинка → адрес сборки `/assets/…`. В jest `require` картинки — относительный путь до файла (с
 * именем рабочей папки), а встроенный сервер отдаёт файл по такому адресу без хеша экспорта
 * (`AssetServer.unhashedIndex`). Глубоко — вместе с кадрами питомца.
 */
const clean = (v: any): any => {
  if (typeof v === 'string') return v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/');
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
  }
  return v;
};
const uri = (src: unknown): string | null => {
  const u = assetUri(src);
  return u == null ? null : clean(u);
};

const PET_SKINS = ['cat', 'robot', 'constellation'] as const;
const ASK_REASONS = ['first', 'broken', 'reached', 'weekly'] as const;

function build(): string {
  const goalLines: Record<string, Record<string, { text: string; state: string }>> = {};
  for (const lang of goalLineLanguages()) {
    goalLines[lang] = Object.fromEntries(ASK_REASONS.map((r) => {
      const l = pickGoalLine(lang, r);
      return [r, { text: l.text, state: l.state }];
    }));
  }
  const petStates = [...new Set<string>(['idle', ...Object.values(goalLines).flatMap((x) => Object.values(x).map((l) => l.state))])].sort();
  const data = {
    profileImages: Object.fromEntries(PROFILES.map((p) => [p.id, {
      bg: uri(profileBackground(p.id)),
      logo: uri(logoForProfile(p.id)),
      plate: LOGO_PLATE_BG[logoPlateFor(p.id)],
      badge: uri(profileBadge(p.id)),
    }])),
    avatars: Object.fromEntries(Object.keys(AVATAR_IMAGES).sort().map((k) => [k, uri(AVATAR_IMAGES[k])])),
    warmupIcon: uri(FEATURE_ICONS.warmup),
    cosmetics: COSMETICS.filter((c) => ['frame', 'title', 'avatar', 'background', 'badge'].includes(c.type))
      .map((c) => ({ id: c.id, type: c.type, value: c.value, nameKey: c.nameKey })),
    pet: Object.fromEntries(PET_SKINS.map((s) => [s, Object.fromEntries(petStates.map((st) => [st, clean(petRenderSpec(s, st as any, null, null))]))])),
    goalLines,
    ladder: FEATURE_LADDER.map((l) => ({ key: l.key, level: l.level, titleKey: l.titleKey })),
    fresh: { entries: FRESH.map((e) => ({ id: e.id, since: e.since })), days: FRESH_DAYS, min: FRESH_MIN },
    reco: {
      count: RECO_COUNT, staleDays: RECO_STALE_DAYS, branchWindowDays: RECO_BRANCH_WINDOW_DAYS, freshEvery: RECO_FRESH_EVERY,
      eveningBanned: RECO_EVENING_BANNED, starters: RECO_STARTERS, reasonKey: RECO_REASON_KEY,
    },
    domainGames: Object.fromEntries(DOMAINS.map((d) => [d.id, d.game_id])),
    goal: { days: GOAL_DAYS, askEveryDays: ASK_EVERY_DAYS, streakCountsFrom: STREAK_COUNTS_FROM, maxLen: DAY_GOAL_MAX_LEN, exampleKeys: DAY_GOAL_EXAMPLE_KEYS },
    weakSkillFreshDays: СВЕЖЕСТЬ_ДНЕЙ,
    resumeMaxAgeMs: RESUME_MAX_AGE_MS,
    todayRowsMax: TODAY_ROWS_MAX,
    dayStreakForMult: DAY_STREAK_FOR_MULT,
    favouriteSections: FAVOURITE_SECTIONS,
    layout: { maxContainerWidth: MAX_CONTAINER_WIDTH, containerPadding: CONTAINER_PADDING },
  };
  return `${JSON.stringify(data, null, 1)}\n`;
}

describe('flutter/assets/home_inputs.json — свежая выгрузка данных входов Главной', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-home-inputs-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('адреса — сборки, без имени рабочей папки; вордмарк у каждого профиля, значок — где он нарисован', () => {
    const data = JSON.parse(build());
    expect(JSON.stringify(data)).not.toMatch(/\.\.\/|frontend\//);
    for (const p of PROFILES) {
      expect(data.profileImages[p.id].logo).toMatch(/^\/assets\//);
      // Значка нет у служебного профиля «Что нового» — чип Главной тогда без картинки, как в вебе.
      if (p.id !== 'whatsnew') expect(data.profileImages[p.id].badge).toMatch(/^\/assets\//);
    }
    for (const s of PET_SKINS) expect(data.pet[s].idle.uris.length).toBeGreaterThan(0);
  });
});
