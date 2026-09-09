/* psygames-test-hub-not-empty-in-every-profile · VER 1 · 09.09.2026 */
/**
 * НИ ОДНА РАЗВИЛКА НЕ ОТКРЫВАЕТСЯ ПУСТОЙ НИ В ОДНОМ ПРОФИЛЕ.
 *
 * 🔴 ПОВОД. 09.09.2026 «Ментальная ротация» открывалась пустой у ДЕСЯТИ профилей из
 * тринадцати: заголовок «Выбери упражнение» на месте, карточек под ним ноль. Обе игры
 * развилки я прописал только в набор «Шахматиста» и проверял под ним же — а фильтр
 * наборов в проекте существует ровно для того, чтобы у разных профилей был разный
 * состав. Денис нашёл это руками, словами «не запускается, ошибка».
 *
 * Правило, которое здесь закрепляется: если развилка ВИДНА в каталоге профиля, внутри
 * неё обязана быть хотя бы одна карточка. Обе половины считает одна и та же функция,
 * что и экран (`filterAllowedGames` + `visibleHubCards`), поэтому расходиться нечему.
 */
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';
import { HUB_CONTENTS, visibleHubCards } from '@/src/constants/hubContents';

describe('развилки в профилях', () => {
  it('есть что проверять: профилей больше десяти, развилок больше пяти', () => {
    expect(PROFILES.length).toBeGreaterThan(10);
    expect(Object.keys(HUB_CONTENTS).length).toBeGreaterThan(5);
  });

  it('🔴 видна в каталоге — значит внутри есть хотя бы одно упражнение', () => {
    const пустые: string[] = [];
    for (const p of PROFILES as any[]) {
      const открыто = filterAllowedGames(p);
      const можно = new Set(открыто.map((g: any) => g.route));
      for (const hub of Object.keys(HUB_CONTENTS)) {
        if (!можно.has(hub)) continue;                    // развилка закрыта — проверять нечего
        const карточек = visibleHubCards(hub, можно, (k: string) => k).length;
        if (карточек === 0) пустые.push(`${p.id} → ${hub}: 0 карточек`);
      }
    }
    expect(пустые).toEqual([]);
  });

  it('🔴 «Ментальная ротация» — во всех профилях и в полном составе (решение Дениса 09.09.2026)', () => {
    const плохо: string[] = [];
    for (const p of PROFILES as any[]) {
      const можно = new Set(filterAllowedGames(p).map((g: any) => g.route));
      const карточек = visibleHubCards('/games/spatial-hub', можно, (k: string) => k).length;
      if (!можно.has('/games/spatial-hub') || карточек !== 3) {
        плохо.push(`${p.id}: развилка ${можно.has('/games/spatial-hub')}, карточек ${карточек} из 3`);
      }
    }
    expect(плохо).toEqual([]);
  });

  it('проба не зелена вслепую: подменный профиль без этих игр ловится', () => {
    const пустой = { id: 'проба', allowed_games: ['sudoku'], allow_sandbox: false } as any;
    const можно = new Set(filterAllowedGames(пустой).map((g: any) => g.route));
    // Развилка закрыта — первый тест её пропустит; проверяем, что состав действительно считается.
    expect(visibleHubCards('/games/spatial-hub', new Set(['/games/spatial-hub']), (k: string) => k).length).toBe(0);
    expect(можно.has('/games/spatial-hub')).toBe(true);   // ← ALWAYS_ALLOWED открывает её и здесь
  });
});
