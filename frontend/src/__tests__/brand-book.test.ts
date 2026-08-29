/* psygames-brand-book-gate · VER 1 · 29.08.2026 */
/**
 * БРЕНД-БУК ПРОФИЛЕЙ — ЧТОБЫ КНИГА НЕ РАЗЪЕХАЛАСЬ С КОДОМ (задача f74a7f52).
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ И ПОЧЕМУ. Сам файл BRAND_BOOK_PROFILES.md лежит в
 * .gitignore (внутренний документ, как PROJECT_REF.md), поэтому в CI его нет и
 * сверять с ним нечего. Сверяются ДАННЫЕ, из которых он собирается: если у профиля
 * пропал носитель стиля или появился профиль без стиля вовсе — краснеет здесь, а
 * не обнаруживается на экране у Дениса.
 *
 * 🔴 ПОЧЕМУ ИМПОРТОМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА. Генератор книги читает те же файлы
 * регулярками (под node их не импортировать — тянут react-native). Регулярка может
 * промахнуться молча: не так записали ключ, добавили профиль другим синтаксисом.
 * Здесь берутся ЖИВЫЕ карты приложения — и расхождение двух путей всплывает.
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');
import { PROFILES } from '@/src/constants/profiles';
import { PROFILE_BACKGROUNDS } from '@/src/constants/profileBackgrounds';
import { PROFILE_BADGES } from '@/src/constants/profileBadges';
import { logoForProfile, logoPlateFor, LOGO_VARIANTS } from '@/src/constants/profileLogos';
import { PROFILE_THEME_SPEC, themeArtFor, THEME_KEYS } from '@/src/constants/profileThemes';

const FRONT = path.join(__dirname, '..', '..');
const spec = JSON.parse(fs.readFileSync(path.join(FRONT, 'src/constants/profileThemes.json'), 'utf8'));

/** Профили, которым носитель стиля не положен ПО РОЛИ (см. правила 2 и 3 книги). */
const SERVICE_PROFILES = new Set(['odv999', 'whatsnew', 'free']);

describe('бренд-бук: у каждого профиля есть чем себя показать', () => {
  it('🔴 у каждого продаваемого профиля свои фон, значок и тема карты', () => {
    const naked: string[] = [];
    for (const p of PROFILES) {
      if (SERVICE_PROFILES.has(p.id)) continue;
      const missing = [
        PROFILE_BACKGROUNDS[p.id] ? null : 'фон',
        PROFILE_BADGES[p.id] ? null : 'значок',
        PROFILE_THEME_SPEC[p.id] ? null : 'тема карты',
      ].filter(Boolean);
      if (missing.length) naked.push(`${p.id}: нет ${missing.join(', ')}`);
    }
    expect(naked).toEqual([]);
  });

  it('вордмарк есть у всех, включая служебные — знак приложения показывается всегда', () => {
    for (const p of PROFILES) {
      expect(`${p.id}: вордмарк ${logoForProfile(p.id) !== undefined}`).toBe(`${p.id}: вордмарк true`);
      expect(['light', 'dark']).toContain(logoPlateFor(p.id));
    }
  });

  it('у каждого профиля СВОЙ вордмарк — общий знак остаётся фолбэком, а не правилом', () => {
    const used = PROFILES.map((p) => LOGO_VARIANTS.indexOf(logoForProfile(p.id)));
    const dupes = used.filter((v, i) => used.indexOf(v) !== i);
    // Одно совпадение допустимо: у профиля без своей записи фолбэк — logo6.
    expect(dupes.length).toBeLessThanOrEqual(1);
  });

  it('палитра профиля — валидный hex, а не пустая строка', () => {
    for (const p of PROFILES) {
      expect(`${p.id}: ${/^#[0-9a-fA-F]{6}$/.test(p.color ?? '')}`).toBe(`${p.id}: true`);
    }
  });
});

describe('бренд-бук: темы карты уровней', () => {
  it('🔴 каждая тема из json имеет файл на диске и строку в require-карте', () => {
    for (const id of Object.keys(spec.themes)) {
      const file = path.join(FRONT, spec.outDir, `${id}.webp`);
      expect(`${id}: файл ${fs.existsSync(file)}`).toBe(`${id}: файл true`);
      expect(THEME_KEYS).toContain(id);
    }
  });

  it('профиль без темы получает нейтральный free, а не пустоту', () => {
    const withoutTheme = PROFILES.filter((p) => !PROFILE_THEME_SPEC[p.id]);
    for (const p of withoutTheme) {
      expect(themeArtFor(p.id)).toBe(themeArtFor('free'));
    }
  });

  it('🔴 у каждой темы написано ПОЧЕМУ она такая — иначе это случайный фильтр', () => {
    for (const [id, t] of Object.entries(spec.themes) as [string, { why?: string }][]) {
      expect(`${id}: причина ${(t.why ?? '').length > 10}`).toBe(`${id}: причина true`);
    }
  });

  it('повтор рецепта разрешён только с параметрами — иначе две одинаковые темы', () => {
    const seen = new Map<string, string>();
    for (const [id, t] of Object.entries(spec.themes) as [string, { effect: string; params?: object }][]) {
      const twin = seen.get(t.effect);
      if (twin) {
        expect(`${id} повторяет рецепт ${twin}, params: ${t.params ? 'есть' : 'нет'}`)
          .toBe(`${id} повторяет рецепт ${twin}, params: есть`);
      } else {
        seen.set(t.effect, id);
      }
    }
  });
});

describe('бренд-бук: генератор жив и не захардкожен', () => {
  const gen = fs.readFileSync(path.join(FRONT, 'scripts/build-brand-book.mjs'), 'utf8');

  it('список профилей берётся из profiles.ts, а не переписан в скрипте', () => {
    expect(gen).toContain('src/constants/profiles.ts');
    // Захардкоженный список — главный способ, которым книга тихо отстаёт от кода.
    for (const p of PROFILES) {
      const hardcoded = new RegExp(`['"]${p.id}['"]`).test(gen);
      expect(`${p.id} вписан в генератор руками: ${hardcoded}`).toBe(`${p.id} вписан в генератор руками: false`);
    }
  });

  it('генератор падает, если ассет пропал, а не пишет книгу с битой ссылкой', () => {
    expect(gen).toContain('missing.push');
    expect(gen).toContain('process.exit(1)');
  });
});
