/**
 * Подсказка питомца обязана вести в живую игру.
 *
 * ЗАЧЕМ. Голосовой репорт 02.08 (расшифрован 12.08, месяц пролежал): «кликаем на
 * подсказку Синапса — попадаем на 404, и там ссылка вида tauri localhost not found».
 * Адрес собирался из id игры, а у 35 игр из 61 id не совпадает с именем файла экрана —
 * получался «Unmatched Route». Это починили, взяв `game.route` из реестра.
 *
 * Тест закрывает ВТОРУЮ, тихую половину той же дыры: пузырь фильтрует игры по категории,
 * и если категорию когда-нибудь переименуют, выборка станет пустой. Тогда тап по подсказке
 * не откроет 404 — он просто НИЧЕГО не сделает, а это ещё хуже: человек жмёт и не понимает,
 * сломано или так задумано, и репорт об этом уже не напишет.
 */
import { GAMES } from '@/src/constants/games';

/** Те же навыки и то же отображение, что в пузыре WalkingPet. */
const SKILL_TO_CATEGORIES: Record<string, string[]> = {
  attention: ['attention'],
  logic: ['logic', 'intuition'],
  memory: ['memory'],
  speed: ['action'],
};

describe('подсказка питомца ведёт в живую игру', () => {
  it.each(Object.keys(SKILL_TO_CATEGORIES))('для навыка «%s» есть хотя бы одна игра', (skill) => {
    const cats = SKILL_TO_CATEGORIES[skill];
    const pool = GAMES.filter((g: any) => cats.includes(g.category));
    expect(`${skill}: ${pool.length} игр`).not.toBe(`${skill}: 0 игр`);
  });

  it('у каждой предлагаемой игры есть адрес, и он не собран из id', () => {
    const all = Object.values(SKILL_TO_CATEGORIES).flat();
    const pool = GAMES.filter((g: any) => all.includes(g.category));
    expect(pool.length).toBeGreaterThan(0);
    for (const g of pool as any[]) {
      expect(`${g.id} → route: ${typeof g.route === 'string' && g.route.startsWith('/')}`)
        .toBe(`${g.id} → route: true`);
    }
  });

  it('навыки пузыря не разошлись с категориями реестра', () => {
    const known = new Set(GAMES.map((g: any) => g.category));
    const unknown = Object.values(SKILL_TO_CATEGORIES).flat().filter((c) => !known.has(c));
    expect(unknown).toEqual([]);
  });
});
