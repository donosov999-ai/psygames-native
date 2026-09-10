/* psygames-pet-medallion-fits-head · VER 1 · 10.09.2026 */
/**
 * ГОЛОВА ЦЕЛИКОМ ВЛЕЗАЕТ В ОКНО МЕДАЛЬОНА — У ВСЕХ ТРЁХ ОБЛИКОВ, А НЕ ТОЛЬКО У КОТА.
 *
 * 🔴 ПОВОД. Денис 10.09.2026: «зарезанные части… на экране питомца, в шапке игры».
 * Медальон режет хвост и лапы НАМЕРЕННО — это его же заказ «типа в окошке голова
 * торчит» (GamePet.tsx). Поэтому вопрос не «режет ли», а «влезает ли ГОЛОВА».
 *
 * ЗАМЕР по всем состояниям трёх обликов, арифметикой самого медальона (зум ×2, окно
 * ровно половина кадра по каждой оси, сдвиг зажат границами кадра):
 *   кот           — голова целиком в 34 состояниях из 34;
 *   робот         — макушка ВНЕ окна в 6 состояниях из 6;
 *   созвездие     — в 5 из 5.
 * Пример: робот `idle` — глаза на 72 % кадра, макушка на 46 %, окно 47…97 %,
 * и свод черепа срезан. Причина не в якорях, а в форме: у круглого облика глаза
 * сидят низко относительно головы, и половина кадра от глаз до макушки не достаёт.
 *
 * ⚠️ Проба считает через `petHeadCenter` ИЗ МОДУЛЯ и повторяет зажим из `GamePet`.
 * Своя формула здесь была бы слепа к правке кода — на этом я уже спотыкался сегодня
 * в `pet-motion-steady`, где срез кадров был вписан в пробу числом.
 */
import { petHeadCenter, type PetSkin, type PetState } from '@/src/components/pet/PetSprite';
import { FRAME_ANCHORS } from '@/src/components/pet/petAnchors.generated';

/** Зум и зажим — как в `GamePet.tsx`; при их правке эта проба обязана обновиться. */
const ЗУМ = 2;
const зажать = (сдвиг: number, size: number) => Math.max(-(size * ЗУМ - size), Math.min(0, сдвиг));

/** Окно медальона в координатах кадра, в процентах. */
function окно(skin: PetSkin, state: PetState) {
  const size = 100;
  const c = petHeadCenter(skin, state);
  const mt = зажать(-(c.y / 100) * size * ЗУМ + size / 2, size);
  const ml = зажать(-(c.x / 100) * size * ЗУМ + size / 2, size);
  const y0 = (-mt) / (size * ЗУМ) * 100;
  const x0 = (-ml) / (size * ЗУМ) * 100;
  return { x0, x1: x0 + 100 / ЗУМ, y0, y1: y0 + 100 / ЗУМ };
}

describe('медальон шапки показывает голову целиком', () => {
  it('есть что проверять — иначе проба зелена вслепую', () => {
    expect(Object.keys(FRAME_ANCHORS).length).toBe(3);
    expect(Object.keys(FRAME_ANCHORS.cat!).length).toBeGreaterThan(20);
  });

  it('🔴 макушка внутри окна во всех состояниях всех обликов', () => {
    const срезано: string[] = [];
    for (const [skin, состояния] of Object.entries(FRAME_ANCHORS)) {
      for (const [state, кадры] of Object.entries(состояния ?? {})) {
        if (!Array.isArray(кадры) || !кадры.length) continue;
        const о = окно(skin as PetSkin, state as PetState);
        const мимо = кадры.filter((f) => {
          const т = f.head_top;
          if (!т || (f.off ?? []).includes('head_top')) return false;
          return т.y < о.y0 || т.y > о.y1 || т.x < о.x0 || т.x > о.x1;
        });
        if (мимо.length) срезано.push(`${skin}/${state}: ${мимо.length} из ${кадры.length}`);
      }
    }
    expect(срезано).toEqual([]);
  });

  it('🔴 контрпроба: окно, поставленное по ГЛАЗАМ, режет робота — значит проба зрячая', () => {
    // Прежняя формула. Если она проходит, значит проба ничего не меряет.
    const size = 100;
    const кадры = FRAME_ANCHORS.robot?.idle ?? [];
    const ey = кадры.reduce((a, f) => a + f.eyes.y, 0) / (кадры.length || 1);
    const mt = зажать(-(ey / 100) * size * ЗУМ + size / 2, size);
    const y0 = (-mt) / (size * ЗУМ) * 100;
    const мимо = кадры.filter((f) => f.head_top && f.head_top.y < y0).length;
    expect(`по глазам робот теряет макушку в ${мимо} кадрах: ${мимо > 0}`)
      .toBe(`по глазам робот теряет макушку в ${мимо} кадрах: true`);
  });
});
