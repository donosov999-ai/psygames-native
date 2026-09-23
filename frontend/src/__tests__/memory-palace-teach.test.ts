/* psygames-memory-palace-teach · VER 1 · 24.09.2026 */
/**
 * 🎓 РАЗБОР «ДВОРЦА ПАМЯТИ» ПОКАЗЫВАЕТ РОВНО ТО, ЧТО ИГРА ЗАСЧИТЫВАЕТ.
 *
 * 🔴 ЗАЧЕМ ИМЕННО ТАК. Обучение, которое расходится с игрой, хуже отсутствия обучения:
 * человек делает, как показали, и получает ошибку. Поэтому проба не сверяет тексты — она
 * БЕРЁТ раскладку и ответы прямо из карточек разбора, играет ими настоящую партию и требует
 * идеального результата. Разойдётся разбор с правилами — покраснеет здесь.
 *
 * ⚠️ Материал НАСТОЯЩИЙ: расклад того же генератора, что раздаёт игру, а не выдуманный пример.
 */
import {
  confirmMemoryPalacePlacements,
  continueToPlacement,
  continueToReverseRecall,
  createMemoryPalaceSession,
  generateMemoryPalaceRound,
  memoryPalaceLociCountForLevel,
  placeSelectedItemAtLocus,
  selectPlacementItem,
  selectRecallItem,
  startMemoryPalaceRecall,
  startMemoryPalaceRound,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';
import { собратьРазборДворца } from '@/src/games/memory-palace/teach';

/**
 * Сыграть партию ровно так, как ПОКАЗАНО ЧЕЛОВЕКУ.
 *
 * 🔴 ХОДЫ БЕРУТСЯ ИЗ САМИХ КАРТОЧЕК, а не из сводного массива раскладки. Первая редакция
 * играла массивом — и мутация это вскрыла: расходись карточки со сводкой, проба осталась бы
 * зелёной, а человек, повторивший показанное, получил бы ошибку. Играем тем, что видно.
 */
function сыгратьПоРазбору(seed: string, level: number) {
  const round = generateMemoryPalaceRound(seed, level);
  const разбор = собратьРазборДворца(round);
  const связки = разбор.карточки.filter((к) => к.вид === 'связь');
  const вспоминания = разбор.карточки.filter((к) => к.вид === 'вспомнить');
  let s: MemoryPalaceSession = continueToPlacement(
    startMemoryPalaceRound(createMemoryPalaceSession({ seed, level }), 0),
  );
  связки.forEach((к, место) => {
    s = selectPlacementItem(s, String(к.поля!.item));
    s = placeSelectedItemAtLocus(s, место);
  });
  s = confirmMemoryPalacePlacements(s);
  s = startMemoryPalaceRecall(s);
  вспоминания.forEach((к) => { s = selectRecallItem(s, String(к.поля!.item), 10_000); });
  s = continueToReverseRecall(s);
  [...вспоминания].reverse().forEach((к) => { s = selectRecallItem(s, String(к.поля!.item), 20_000); });
  return { round, разбор, s, связки, вспоминания };
}

describe('разбор «Дворца памяти»', () => {
  it('🔴 раскладка и ответы из разбора дают в игре идеальный результат', () => {
    for (const level of [1, 2, 3]) {
      const { s, связки, вспоминания } = сыгратьПоРазбору('teach-check', level);
      // Вспоминание обязано называть ТЕ ЖЕ предметы, что клали: иначе разбор учит одному,
      // а игра считает другое.
      expect(вспоминания.map((к) => к.поля!.item)).toEqual(связки.map((к) => к.поля!.item));
      expect(s.phase).toBe('result');
      expect(s.result?.accuracy).toBe(1);
      expect(s.result?.specific.locationAccuracy).toBe(1);
      expect(s.result?.errors).toBe(0);
    }
  });

  it('🔴 разбор идёт по НАСТОЯЩИМ местам и предметам уровня, а не по выдуманным', () => {
    const round = generateMemoryPalaceRound('teach-check', 2);
    const { карточки, раскладка } = собратьРазборДворца(round);
    const местаРасклада = round.loci.map((l) => l.id);
    const предметыРасклада = round.targetItems.map((i) => i.id);
    expect(раскладка).toEqual(предметыРасклада.slice(0, round.lociCount));
    for (const к of карточки) {
      if (к.поля?.place !== undefined) expect(местаРасклада).toContain(к.поля.place);
      if (к.поля?.item !== undefined) expect(предметыРасклада).toContain(к.поля.item);
    }
  });

  it('карточек столько, сколько мест, плюс рамка приёма — и ни одной без ключа', () => {
    for (const level of [1, 3, 5]) {
      const round = generateMemoryPalaceRound('teach-len', level);
      const { карточки } = собратьРазборДворца(round);
      const мест = memoryPalaceLociCountForLevel(level);
      // приём + связки + маршрут + вспоминания + обратный ход + готово
      expect(карточки).toHaveLength(1 + мест + 1 + мест + 1 + 1);
      expect(карточки.filter((к) => !к.ключ)).toEqual([]);
      expect(карточки[карточки.length - 1]!.вид).toBe('готово');
    }
  });

  it('🔴 раскладка накапливается по шагам: на первой связке лежит один предмет, на последней — все', () => {
    const round = generateMemoryPalaceRound('teach-steps', 1);
    const { карточки } = собратьРазборДворца(round);
    const связки = карточки.filter((к) => к.вид === 'связь');
    expect(связки[0]!.раскладка.filter(Boolean)).toHaveLength(1);
    expect(связки[связки.length - 1]!.раскладка.filter(Boolean)).toHaveLength(round.lociCount);
  });

  it('обратный ход объяснён одной карточкой, а не повтором всего маршрута', () => {
    const round = generateMemoryPalaceRound('teach-back', 4);
    const { карточки } = собратьРазборДворца(round);
    expect(карточки.filter((к) => к.вид === 'обратно')).toHaveLength(1);
  });
});
