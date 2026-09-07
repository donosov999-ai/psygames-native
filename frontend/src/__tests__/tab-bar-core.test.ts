/* psygames-tab-bar-gate · VER 1 · 07.09.2026 */
/**
 * НИЖНИЙ ТУЛБАР: ГДЕ ОН ЕСТЬ, ГДЕ ЕГО НЕТ И ЧТО ПОДСВЕЧЕНО.
 *
 * ⚠️ Проверяется исполнением на маршрутах, а не чтением исходника: гейт-чтец
 * зеленеет и от строки в комментарии.
 */
import { TABS, TAB_BAR_H, tabBarVisible, activeTab } from '@/src/services/tabBar';
import { favouriteCategories, categoryPlays, FAVOURITE_SECTIONS } from '@/src/services/favouriteCategories';
import { GAMES, CATEGORY_ORDER, sessionTypeOf, type GameConfig } from '@/src/constants/games';

describe('нижний тулбар', () => {
  it('пять вкладок, решение Дениса 07.09.2026', () => {
    expect(TABS.map((t) => t.route)).toEqual(['/', '/games', '/warmup-picker', '/statistics', '/pet']);
  });

  it('у каждой вкладки есть значок и ключ подписи', () => {
    for (const t of TABS) {
      expect(`${t.route}: значок ${!!t.icon} подпись ${!!t.labelKey}`)
        .toBe(`${t.route}: значок true подпись true`);
    }
  });

  describe('где полосы быть не должно', () => {
    it('🔴 внутри игры — доска считается от высоты экрана', () => {
      expect(tabBarVisible('/games/schulte')).toBe(false);
      expect(tabBarVisible('/games/sudoku')).toBe(false);
    });

    it('🔴 но САМ каталог /games полосу показывает — иначе из него некуда уйти', () => {
      expect(tabBarVisible('/games')).toBe(true);
    });

    it('онбординг и служебные экраны комплекса — без полосы', () => {
      for (const p of ['/onboarding', '/warmup-bridge', '/warmup-complete', '/assessment-result']) {
        expect(`${p}: ${tabBarVisible(p)}`).toBe(`${p}: false`);
      }
    });

    it('обычные экраны полосу показывают', () => {
      for (const p of ['/', '/statistics', '/pet', '/warmup-picker', '/shop', '/settings']) {
        expect(`${p}: ${tabBarVisible(p)}`).toBe(`${p}: true`);
      }
    });
  });

  describe('подсветка', () => {
    it('маршрут вкладки подсвечивает её саму', () => {
      expect(activeTab('/')).toBe('/');
      expect(activeTab('/games')).toBe('/games');
      expect(activeTab('/pet')).toBe('/pet');
    });

    it('🔴 «/» не совпадает со всем подряд', () => {
      expect(activeTab('/statistics')).toBe('/statistics');
      expect(activeTab('/warmup-picker')).toBe('/warmup-picker');
    });

    it('🔴 на не-вкладке не подсвечено НИЧЕГО — врать подсветкой хуже', () => {
      expect(activeTab('/shop')).toBeNull();
      expect(activeTab('/settings')).toBeNull();
      expect(activeTab('/achievements')).toBeNull();
    });

    it('вложенный маршрут вкладки подсвечивает её', () => {
      expect(activeTab('/pet/skins')).toBe('/pet');
    });
  });

  it('🔴 высота — одно число на троих: полоса, кнопка отзыва, питомец', () => {
    // Число само по себе не проверяется — проверяется, что оно ОДНО и живое.
    expect(TAB_BAR_H).toBeGreaterThan(40);
    expect(TAB_BAR_H).toBeLessThan(90);
  });
});

describe('три любимых раздела на главной', () => {
  const партия = (t: string) => ({ game_type: t });
  const типПервой = (кат: string): string => sessionTypeOf(GAMES.find((g) => g.category === кат)!);

  it('🔴 партий нет — разделов нет, выдумывать нечего', () => {
    expect(favouriteCategories([], GAMES)).toEqual([]);
  });

  it('раздел без единой партии в любимые не попадает', () => {
    const только = favouriteCategories([партия(типПервой('memory'))], GAMES);
    expect(только).toEqual(['memory']);
  });

  it('🔴 порядок — по числу партий, а не по каталогу', () => {
    const s = [
      ...Array(5).fill(партия(типПервой('action'))),
      ...Array(3).fill(партия(типПервой('memory'))),
      ...Array(9).fill(партия(типПервой('logic'))),
    ];
    expect(favouriteCategories(s, GAMES)).toEqual(['logic', 'action', 'memory']);
  });

  it('берётся не больше трёх', () => {
    const s = CATEGORY_ORDER.map((c) => партия(типПервой(c)));
    expect(favouriteCategories(s, GAMES).length).toBe(FAVOURITE_SECTIONS);
  });

  it('🔴 ничья разрешается порядком каталога, а не как выйдет', () => {
    const s = [партия(типПервой('action')), партия(типПервой('memory'))];
    // memory стоит в каталоге раньше action — при равном счёте он и первый.
    expect(favouriteCategories(s, GAMES)).toEqual(['memory', 'action']);
  });

  /**
   * 🔴 САМАЯ ВАЖНАЯ ПРОБА НАБОРА. У трёх судоку `id` и `game_type` расходятся
   * (дефис против подчёркивания). Считай мы по `id` — партии этих игр не попали
   * бы в раздел ВООБЩЕ, и человек, играющий фрактальную судоку каждый день,
   * увидел бы логику как нетронутую. Ровно этой ошибкой уже болела нагрузка
   * веток, разбор — при поле `sessionType` в games.ts.
   */
  it('🔴 партия узнаётся по game_type, а не по id каталога', () => {
    const расходятся = GAMES.filter((g: GameConfig) => g.sessionType && g.sessionType !== g.id);
    expect(`игр с расхождением: ${расходятся.length > 0}`).toBe('игр с расхождением: true');
    for (const g of расходятся) {
      const по_типу = favouriteCategories(Array(4).fill(партия(sessionTypeOf(g))), GAMES);
      const по_id = favouriteCategories(Array(4).fill(партия(g.id)), GAMES);
      expect(`${g.id}: по game_type ${по_типу[0] ?? 'нет'}`).toBe(`${g.id}: по game_type ${g.category}`);
      expect(`${g.id}: по id ${по_id.length}`).toBe(`${g.id}: по id 0`);
    }
  });

  it('чужой game_type не роняет и не засчитывается', () => {
    expect(favouriteCategories([партия('такой_игры_нет'), партия(типПервой('memory'))], GAMES)).toEqual(['memory']);
    expect(categoryPlays([{}], GAMES)).toEqual([]);
  });
});
