/* psygames-shop-showcase-gate · VER 1 · 29.08.2026 */
/**
 * ВИТРИНА ТЕМ (Т4+Т5, задача eddd19b9) — полнота и честность реестра.
 *
 * Класс бага, который тут сторожится: позиция магазина указывает value, которого
 * нет в реестре арта — покупка проходит, деньги списаны, а надетая вещь молча
 * не рендерится (Image с undefined source). Это хуже краша: списание без товара.
 *
 * Второй инвариант — экономический: новые позиции не дешевле 750
 * (правило «после ×3-подъёма 28.08» из задачи + гейт abilities-economy
 * держит cheapCos ≥ cheapAb×3).
 */
import { COSMETICS } from '@/src/services/cosmetics';
import { DIGIT_STYLES } from '@/src/constants/digitThemes';
import { THEME_KEYS, themeArtByKey } from '@/src/constants/profileThemes';
import { PROFILE_BACKGROUNDS } from '@/src/constants/profileBackgrounds';
import { PROFILE_BADGES } from '@/src/constants/profileBadges';
import { PROFILES } from '@/src/constants/profiles';

const byType = (t: string) => COSMETICS.filter((c) => c.type === t);

describe('витрина тем: каждый товар указывает на существующий арт', () => {
  it('digits: value — реальный стиль, candy (общий дефолт) не продаётся', () => {
    const items = byType('digits');
    expect(items.length).toBe(4);
    for (const c of items) {
      expect(DIGIT_STYLES).toContain(c.value);
      expect(c.value).not.toBe('candy');
    }
  });

  it('theme: все 11 ключей движка тем покрыты, каждый value даёт арт', () => {
    const items = byType('theme');
    expect(items.map((c) => c.value).sort()).toEqual([...THEME_KEYS].sort());
    for (const c of items) expect(themeArtByKey(c.value)).toBeDefined();
  });

  it('background: ровно те 9 профилей, у которых фон существует', () => {
    const items = byType('background');
    expect(items.map((c) => c.value).sort()).toEqual(Object.keys(PROFILE_BACKGROUNDS).sort());
  });

  it('badge: ровно те 12 профилей, у которых значок существует', () => {
    const items = byType('badge');
    expect(items.map((c) => c.value).sort()).toEqual(Object.keys(PROFILE_BADGES).sort());
  });

  it('имена для theme/background/badge разрешимы: value — известный профиль', () => {
    const ids = new Set(PROFILES.map((p) => p.id));
    for (const c of COSMETICS) {
      if (c.type === 'theme' || c.type === 'background' || c.type === 'badge') {
        expect(ids.has(c.value as any)).toBe(true);
      }
    }
  });

  it('цены: новые позиции не дешевле 750 и не ломают престиж-потолок', () => {
    const fresh = COSMETICS.filter((c) => ['digits', 'theme', 'background', 'badge'].includes(c.type));
    expect(fresh.length).toBe(4 + 11 + 9 + 12);
    for (const c of fresh) expect(c.cost).toBeGreaterThanOrEqual(750);
    const dearest = Math.max(...COSMETICS.map((c) => c.cost));
    for (const c of fresh) expect(c.cost).toBeLessThan(dearest);   // престиж-полка остаётся вершиной
  });

  it('id уникальны по всему реестру (столкновение тихо ломает unlock)', () => {
    const ids = COSMETICS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
