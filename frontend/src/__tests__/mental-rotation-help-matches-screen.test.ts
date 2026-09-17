/* psygames-mental-rotation-help-matches-screen · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961, пункт «справка своя» */
/**
 * 🔴 СПРАВКА «МЫСЛЕННОГО ВРАЩЕНИЯ» ОПИСЫВАЕТ ЭКРАН, КОТОРЫЙ ВИДИТ ИГРОК.
 *
 * Сверка 17.09.2026: на всех 12 языках справка говорила «слева — эталон, справа —
 * варианты», а на экране эталон сверху, варианты снизу (и в альбомной ориентации тоже —
 * ряд вариантов под полем). И описывала только поворот, хотя видов заданий восемь: семь
 * из них человек встречал без единого слова в справке. Денис 16.09 про соседние игры:
 * «короткое описание — непонятно, как играть».
 *
 * ⚠️ СПИСОК ВИДОВ БЕРЁТСЯ ИЗ КОДА НАМЕРЕННО: здесь это не порог, а связь. Добавят девятый
 * вид — проба покраснеет и попросит дописать справку, а не промолчит.
 */
import { translateFor, LANGUAGES } from '@/src/contexts/LanguageContext';
import { getMentalRotationStrings, KIND_UNLOCK } from '@/src/games/mental-rotation/core';
import type { MentalRotationLocale, MentalRotationStrings, TaskKind } from '@/src/games/mental-rotation/core';

const ИМЯ: Record<TaskKind, keyof MentalRotationStrings> = {
  rotation: 'taskRotation', projection: 'taskProjection', net: 'taskNet', viewpoint: 'taskViewpoint',
  same: 'taskSame', missing: 'taskMissing', assembly: 'taskAssembly', formation: 'taskFormation', section: 'taskSection',
  memory: 'taskMemory',   // 17.09.2026, задача 69f1810f
};

/** «Слева / справа» на всех языках — литералами. */
const СЛЕВА_СПРАВА = /слева|справа|on the left|on the right|a la izquierda|a la derecha|à esquerda|à direita|\blinks\b|\brechts\b|à gauche|à droite|a sinistra|a destra|左侧|右侧|左側|右側|왼쪽|오른쪽|बाईं|दाईं|على اليسار|على اليمين/i;

describe('справка «Мысленного вращения» и экран', () => {
  it('прибор жив: 12 языков, восемь видов заданий, словарь-ловушка узнаёт старую справку', () => {
    expect(LANGUAGES.length).toBe(12);
    expect(Object.keys(KIND_UNLOCK).sort()).toEqual(Object.keys(ИМЯ).sort());
    expect(СЛЕВА_СПРАВА.test('On the left — a reference shape. On the right — options')).toBe(true);
  });

  it('🔴 ни на одном языке справка не ставит эталон слева, а варианты справа', () => {
    const плохо = LANGUAGES.map(({ code }) => [code, translateFor(code, 'mentalRotationIntroDesc')])
      .filter(([, т]) => СЛЕВА_СПРАВА.test(т)).map(([code, т]) => `${code}: «${т.slice(0, 80)}»`);
    expect(плохо).toEqual([]);
  });

  it('🔴 справка на каждом языке называет КАЖДЫЙ вид заданий так же, как плашка на экране', () => {
    const плохо: string[] = [];
    for (const { code } of LANGUAGES) {
      const справка = translateFor(code, 'mentalRotationIntroDesc').toLowerCase();
      const строки = getMentalRotationStrings(code as MentalRotationLocale);
      for (const вид of Object.keys(KIND_UNLOCK) as TaskKind[]) {
        const имя = строки[ИМЯ[вид]].toLowerCase();
        if (!справка.includes(имя)) плохо.push(`${code}: нет вида «${имя}»`);
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });
});
