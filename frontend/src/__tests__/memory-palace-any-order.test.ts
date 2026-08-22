/* psygames-memory-palace-any-order · VER 1 · 22.08.2026 */
/**
 * РАСКЛАДКА РАБОТАЕТ В ЛЮБОМ ПОРЯДКЕ — И МОЛЧАЛИВОГО ОТКАЗА БОЛЬШЕ НЕТ.
 *
 * 🔴 ОТЧЁТ ВАЛИ 22.08.2026, версия 1.227.0: «Нажимаю разное не запускается не
 * выбирается». Раскладка требовала строгого порядка — сперва предмет, потом
 * место, — и касание МЕСТА до выбора предмета молча возвращало ту же сессию.
 * Ни отклика, ни объяснения. Человек, который думает «вот сюда положу вазу»,
 * упирался в игру, которая не отвечает, и решал, что она сломана.
 *
 * Тот же класс дефекта, что нашёлся в тот день ещё дважды: в судоку (неверная
 * цифра отнимала жизнь без объяснения правила) и в «Одной линии» (поиск старта
 * шёл в счётчик ошибок). Молчаливый отказ — не мелочь интерфейса, а способ
 * потерять человека, который ничего не сделал неправильно.
 */
import {
  createMemoryPalaceSession,
  selectPlacementItem,
  placeSelectedItemAtLocus,
  continueToPlacement,
  startMemoryPalaceRound,
} from '@/src/games/memory-palace/core/session';
import { getMemoryPalaceStrings } from '@/src/games/memory-palace/core/i18n';

/** Довести партию до фазы раскладки. */
function atPlacement() {
  let s = createMemoryPalaceSession({ seed: 'order', level: 3 });
  s = startMemoryPalaceRound(s, 0);
  s = continueToPlacement(s);
  return s;
}

describe('порядок выбора любой', () => {
  it('партия доходит до раскладки — иначе проверка беспредметна', () => {
    expect(atPlacement().phase).toBe('place');
  });

  it('🔴 сначала МЕСТО, потом предмет — так тоже работает', () => {
    const start = atPlacement();
    const withLocus = placeSelectedItemAtLocus(start, 0);
    expect(withLocus.selectedPlacementLocusIndex).toBe(0);

    const item = start.round.targetItems[0]?.id as string;
    const placed = selectPlacementItem(withLocus, item);
    expect(placed.placements[0]).toBe(item);
    expect(placed.selectedPlacementLocusIndex).toBeNull();
    expect(placed.selectedPlacementItemId).toBeNull();
  });

  it('сначала предмет, потом место — как было, ничего не сломалось', () => {
    const start = atPlacement();
    const item = start.round.targetItems[0]?.id as string;
    const placed = placeSelectedItemAtLocus(selectPlacementItem(start, item), 2);
    expect(placed.placements[2]).toBe(item);
    expect(placed.selectedPlacementItemId).toBeNull();
  });

  it('оба порядка дают ОДИН результат — иначе это две разные игры', () => {
    const start = atPlacement();
    const item = start.round.targetItems[1]?.id as string;
    const a = placeSelectedItemAtLocus(selectPlacementItem(start, item), 1);
    const b = selectPlacementItem(placeSelectedItemAtLocus(start, 1), item);
    expect(a.placements).toEqual(b.placements);
    expect(a.placementChanges).toBe(b.placementChanges);
  });

  it('повторное касание того же места выбор снимает', () => {
    const start = atPlacement();
    const once = placeSelectedItemAtLocus(start, 3);
    expect(once.selectedPlacementLocusIndex).toBe(3);
    expect(placeSelectedItemAtLocus(once, 3).selectedPlacementLocusIndex).toBeNull();
  });

  it('несуществующее место выбором не становится', () => {
    const start = atPlacement();
    expect(placeSelectedItemAtLocus(start, -1).selectedPlacementLocusIndex).toBeNull();
    expect(placeSelectedItemAtLocus(start, 999).selectedPlacementLocusIndex).toBeNull();
  });

  /**
   * 🔴 ВЫБОР ОБЯЗАН БЫТЬ ВИДЕН. Невидимый выбор — это тот же молчаливый отказ,
   * только на шаг позже: человек ткнул, что-то произошло, а что — непонятно.
   */
  it('выбранное место названо словами, и на всех двенадцати языках', () => {
    for (const locale of ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'] as const) {
      const s = getMemoryPalaceStrings(locale);
      expect(`${locale}: ${s.selectedLocus.includes('{name}')}`).toBe(`${locale}: true`);
      expect(`${locale}: ${s.selectedLocus.length > 12}`).toBe(`${locale}: true`);
    }
  });
});

declare const __dirname: string;
declare function require(m: string): any;

describe('🔴 выбор доезжает до экрана', () => {
  const read = (rel: string): string => require('fs').readFileSync(
    require('path').join(__dirname, rel), 'utf8',
  ) as string;
  const code = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const screen = code(read('../games/memory-palace/MemoryPalaceGame.tsx'));

  it('выбранное место подсвечивается на сцене', () => {
    expect(screen).toMatch(/selectedPlacementLocusIndex === index/);
  });

  it('выбранное место названо в строке под сценой', () => {
    expect(screen).toMatch(/strings\.selectedLocus/);
  });
});
