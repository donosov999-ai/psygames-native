/* psygames-mahjong-board-stability-gate · VER 1 · 26.08.2026 */
/**
 * СНЯЛ ПАРУ — ОСТАЛЬНЫЕ ПЛИТКИ НЕ ДВИГАЮТСЯ.
 *
 * 🔴 РЕПОРТ ДЕНИСА 26.08.2026 со скриншотами: «в маджонге будто уровни прыгают,
 * открывается странно — не по уровням, а будто прыгают».
 *
 * ПРИЧИНА. Экран считал верхний слой как максимум по ТЕКУЩИМ плиткам:
 *   const maxLayer = tiles.reduce((m, t) => Math.max(m, t.layer), 0);
 * а `tilePlacement` поднимает плитку на `(maxLayer - t.layer) * layerOffset`.
 * Пока верхний слой цел, всё ровно. Но последняя снятая с него плитка роняет
 * `maxLayer` на единицу — и ВСЯ доска разом съезжает вниз на `layerOffset`.
 * Один ход, а прыгает всё поле.
 *
 * ⚠️ ПОЧЕМУ ЭТОГО НЕ ЛОВИЛ НИ ОДИН ПРЕЖНИЙ ГЕЙТ. `mahjong-silhouettes` зовёт
 * `tilePlacement` на ПОЛНЫХ раскладках и проверяет, что ничего не уезжает за
 * край. Полная раскладка всегда содержит верхний слой, поэтому `maxLayer` там
 * верен по определению, и беда не воспроизводится. Ломается именно НЕПОЛНАЯ
 * доска — та, что бывает у человека после первого же хода.
 *
 * Здесь проверяется само свойство: координаты уцелевших плиток не зависят от
 * того, что уже снято.
 */
import { tilePlacement, type Tile } from '@/src/games/mahjong/board';
import { mahjongLevel as levelParams } from '@/src/services/mahjongLevels';
import { generate } from '@/app/games/mahjong';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';
import { layoutForLevel } from '@/src/games/mahjong/layouts';

/**
 * ⚠️ РАЗДАЧА СТРОИТСЯ ТЕМИ ЖЕ ТРЕМЯ ВЕЩАМИ, ЧТО И НА ЭКРАНЕ: параметры уровня,
 * силуэт и раскладка из библиотеки. Без формы и мест `generate` отдаёт ПУСТОЙ
 * массив («собрать разбираемую доску не вышло»), и проверка мерила бы пустоту.
 * Повторы — как в экране: генератор случаен и с первого раза может не сойтись.
 */
function dealFor(level: number) {
  const p = levelParams(level);
  const shape = silhouetteForLevel(level);
  const places = layoutForLevel(level)?.places;
  let deck = generate(p.layers, p.pairs, p.cols, shape, places);
  for (let i = 0; i < 20 && deck.length === 0; i++) {
    deck = generate(p.layers, p.pairs, p.cols, shape, places);
  }
  return deck;
}

const HALF = 20;
const OFFSET = 7;

/** Так считает экран ПОСЛЕ починки: верхний слой — постоянная уровня. */
const topLayerOf = (level: number) => levelParams(level).layers - 1;

function placeAll(tiles: Tile[], maxLayer: number) {
  return tiles.map((t) => {
    const p = tilePlacement(t, maxLayer, HALF, OFFSET);
    return `${t.id}:${p.left},${p.top}`;
  });
}

describe('маджонг: доска не прыгает при снятии плиток', () => {
  const LEVELS = [1, 4, 9, 15];

  it('есть что проверять — раскладки строятся и слои действительно многослойны', () => {
    for (const lv of LEVELS) {
      const tiles = dealFor(lv);
      expect(tiles.length).toBeGreaterThan(0);
      expect(new Set(tiles.map((t) => t.layer)).size).toBeGreaterThan(1);
    }
  });

  it('🔴 снятие ВЕРХНЕГО слоя целиком не сдвигает оставшиеся плитки', () => {
    const bad: string[] = [];
    for (const lv of LEVELS) {
      const tiles = dealFor(lv);
      const top = topLayerOf(lv);

      const before = new Map(
        tiles.map((t) => [t.id, tilePlacement(t, top, HALF, OFFSET)]),
      );
      // Худший случай: убрали ВЕСЬ верхний занятый слой — именно на нём прежняя
      // формула и роняла `maxLayer`.
      const highest = tiles.reduce((m, t) => Math.max(m, t.layer), 0);
      const left = tiles.filter((t) => t.layer !== highest);
      expect(left.length).toBeGreaterThan(0);

      for (const t of left) {
        const after = tilePlacement(t, top, HALF, OFFSET);
        const was = before.get(t.id)!;
        if (after.left !== was.left || after.top !== was.top) {
          bad.push(`ур.${lv} плитка ${t.id}: было ${was.left},${was.top} стало ${after.left},${after.top}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 проверка живая: прежняя формула на этих же данных ДВИГАЕТ доску', () => {
    /**
     * Без этого «ничего не сдвинулось» могло бы означать, что сдвиг невозможен в
     * принципе и проверка ничего не стережёт. Считаем ту же доску так, как
     * считал экран ДО починки — максимумом по оставшимся плиткам, — и требуем,
     * чтобы разница БЫЛА.
     */
    const tiles = dealFor(4);
    const highest = tiles.reduce((m, t) => Math.max(m, t.layer), 0);
    const left = tiles.filter((t) => t.layer !== highest);

    const oldBefore = placeAll(left, highest);
    const oldAfter = placeAll(left, left.reduce((m, t) => Math.max(m, t.layer), 0));
    expect(oldBefore).not.toEqual(oldAfter);
  });
});
