/* psygames-profile-themes-gate · VER 1 · 28.08.2026 */
/**
 * ДВИЖОК ТЕМ ПРОФИЛЕЙ (c4fc6173) — гейт полноты и живости.
 *
 * Что сторожится и почему:
 *   · каждая тема из json существует ФАЙЛОМ (скрипт прогнан, а не забыт) и
 *     СТРОКОЙ в require-карте (метро не умеет динамический require);
 *   · рецепт каждой темы существует в живом каталоге imageEffects — иначе
 *     сборщик упадёт только при следующем прогоне, а не на CI;
 *   · подложка реально подключена к карте уровней: движок без потребителя —
 *     ровно та болезнь, с которой всё началось (imageEffects был написан,
 *     экспортирован и НЕ ЗВАЛСЯ никем, замер 26.08);
 *   · суммарный вес тем ограничен: 11 webp не должны раздувать бандл.
 */
import { IMAGE_EFFECT_CATALOG } from '@/src/games/pause/core/imageEffects';
import { PROFILE_THEME_SPEC } from '@/src/constants/profileThemes';

declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync, existsSync, statSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..');

describe('движок тем профилей', () => {
  const themes = Object.entries(PROFILE_THEME_SPEC);

  it('есть что проверять — тем не меньше девяти (замысел «9–10 тем»)', () => {
    expect(themes.length).toBeGreaterThanOrEqual(9);
  });

  it('рецепт каждой темы существует в живом каталоге эффектов', () => {
    const known = new Set(IMAGE_EFFECT_CATALOG.map((e) => e.id));
    for (const [profile, t] of themes) {
      expect(`${profile}: ${t.effect} известен=${known.has(t.effect as never)}`)
        .toBe(`${profile}: ${t.effect} известен=true`);
    }
  });

  it('🔴 каждая тема сгенерирована файлом и прописана в require-карте', () => {
    const map = readFileSync(join(ROOT, 'src', 'constants', 'profileThemes.ts'), 'utf8');
    for (const [profile] of themes) {
      const file = join(ROOT, 'assets', 'images', 'level-map-themes', `${profile}.webp`);
      expect(`${profile}: файл=${existsSync(file)}`).toBe(`${profile}: файл=true`);
      expect(`${profile}: в карте=${map.includes(`level-map-themes/${profile}.webp`)}`)
        .toBe(`${profile}: в карте=true`);
    }
  });

  it('🔴 у движка есть потребитель — подложка карты уровней', () => {
    const src = readFileSync(join(ROOT, 'src', 'components', 'LevelProgressMap.tsx'), 'utf8');
    expect(src).toMatch(/themeArtFor\(profile\?\.id\)/);
  });

  it('вес тем не раздувает бандл (≤ 900 КБ на все)', () => {
    let total = 0;
    for (const [profile] of themes) {
      total += statSync(join(ROOT, 'assets', 'images', 'level-map-themes', `${profile}.webp`)).size;
    }
    const kb = Math.round(total / 1024);
    expect(`суммарно ${kb} КБ`).toBe(`суммарно ${Math.min(kb, 900)} КБ`);
  });
});
