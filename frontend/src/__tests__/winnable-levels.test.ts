/* psygames-winnable-levels · VER 1 · 22.08.2026 */
/**
 * В ЛЮБОЙ УРОВЕНЬ МОЖНО ДОИГРАТЬ.
 *
 * 🔴 КЛАСС ДЕФЕКТА, КОТОРЫЙ ПОВТОРИЛСЯ ТРИЖДЫ: победа сверяется с числом из
 * КОНФИГА, а доска собирается из того, что реально есть. Пока они совпадают —
 * всё работает; разошлись — партия не завершается НИКОГДА, и заметить это можно
 * только доиграв до того уровня.
 *
 * Где ловилось:
 *   · фрактальная судоку — починено ранее;
 *   · «Пары»: спрайтов ровно двенадцать, а формула с 22-го уровня просила
 *     тринадцать. Все карты открыты, ходов нет, счётчик висит «12/13». Игра при
 *     этом не скрыта из меню и стояла в ротации «Вызова дня».
 *
 * ⚠️ ПРОВЕРЯЕМ ПАРАМЕТРЫ УРОВНЯ ПРОТИВ ЗАПАСА МАТЕРИАЛА, а не «выглядит ли
 * разумно». Число, которого нет в наборе, попросить нельзя.
 */
import { SPRITE_COUNT } from '@/src/constants/pairThemes';
import { levelCfg } from '@/app/games/picture-pairs';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;

describe('«Пары»: групп не больше, чем картинок в наборе', () => {
  const groupsAt = (L: number) => levelCfg(L).pairs;

  it('расчёт взят из ЖИВОЙ игры, а не переписан в тесте', () => {
    expect(typeof groupsAt(1)).toBe('number');
    expect(groupsAt(1)).toBeGreaterThan(1);
  });

  it('🔴 ни на одном уровне до сотого не просят больше, чем есть', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 100; L += 1) {
      const groups = groupsAt(L);
      if (groups > SPRITE_COUNT) bad.push(`L${L}: просит ${groups} из ${SPRITE_COUNT}`);
      if (groups < 2) bad.push(`L${L}: групп ${groups} — играть не во что`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('на 22-м уровне — том самом — просят ровно столько, сколько есть', () => {
    expect(groupsAt(22)).toBe(SPRITE_COUNT);
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ: без ограничителя 22-й уровень обязан просить больше
   * набора. Иначе всё выше зеленеет на пустом месте.
   */
  it('без ограничителя дефект бы вернулся', () => {
    const raw = (L: number) => (L <= 9 ? Math.min(12, 3 + L) : L <= 12 ? 4 + (L - 10) : 4 + (L - 13));
    expect(raw(22)).toBeGreaterThan(SPRITE_COUNT);
  });
});

describe('🔴 счётчик победы берётся из доски, а не из конфига', () => {
  const screen = read('../../app/games/picture-pairs.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('число групп для победы считается по СОБРАННОЙ колоде', () => {
    expect(screen).toMatch(/setPairsCount\(new Set\(deck\.map/);
  });

  it('и больше не приходит из конфига', () => {
    expect(screen).not.toMatch(/setPairsCount\(pairs\)/);
  });
});
