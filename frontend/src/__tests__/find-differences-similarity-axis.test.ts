/* psygames-find-differences-similarity-axis · VER 1 · 09.09.2026 */
/**
 * 🔴 ЧЕТВЁРТАЯ ОСЬ «НАЙДИ ОТЛИЧИЯ»: СХОДСТВО СОСЕДЕЙ. Правило «потолков нет нигде».
 *
 * ЗАМЕР ДО (09.09.2026, исполнением): лестница кончалась на 15 — раньше всех в
 * разделе (зрительный поиск 31, быстрый счёт 41, слежение 41, маджонг 28,
 * Шульте 18). Три прежние оси упирались в потолок ещё раньше: отличий 6 с L13,
 * объектов 19 с L15, время 15 с с L13. То есть L16 и L40 не отличались НИЧЕМ.
 *
 * ЧТО РАСТЁТ. Алфавит спрайтов — из скольких разных зверей набирается сцена.
 * До L15 их двенадцать; дальше алфавит сужается по одному через уровень до трёх.
 * Меньше алфавит → больше двойников → человек сравнивает левого зверя с ЕГО
 * ДВОЙНИКОМ справа, а не с самим собой. Ложное «нашёл» приходит на настоящем,
 * хорошо видном объекте — просто не на том.
 *
 * ⚠️ ЗДЕСЬ ПРОГОНЯЕТСЯ СБОРКА СЦЕНЫ, А НЕ ЧИТАЕТСЯ ИСХОДНИК. Ось, проверенная
 * по коду («в файле есть слово spriteAlphabet»), зеленела бы и тогда, когда
 * число до сцены не доезжает. Поэтому сцены строятся по-настоящему, много раз,
 * и считается то, что видит игрок.
 *
 * ⚠️ ВРЕМЯ НЕ ТРОГАЕТСЯ НАМЕРЕННО: вечерний слот (`isCalm`) запрещает наказание
 * временем, и `evening-calm` держит это дословно. Ось сходства работает
 * одинаково и там, где таймера нет вовсе.
 */
import {
  levelParams, FIND_DIFFERENCES_LEVELS, generateScene, withDifference,
} from '@/app/games/find-differences';
import { SPRITE_COUNT } from '@/src/constants/pairThemes';

/** Среднее число копий на один ВСТРЕЧАЮЩИЙСЯ вид: 1 = все разные. */
function копийНаВид(уровень: number, сцен = 200): number {
  const p = levelParams(уровень);
  let сумма = 0;
  for (let i = 0; i < сцен; i += 1) {
    const сцена = generateScene(440, 340, p.objectCount, p.spriteAlphabet);
    const виды = new Set(сцена.map((s) => s.sprite));
    сумма += сцена.length / Math.max(1, виды.size);
  }
  return сумма / сцен;
}

describe('🔴 «найди отличия»: ось сходства соседей', () => {
  it('есть что проверять: сцена строится и отдаёт объекты', () => {
    const p = levelParams(1);
    const сцена = generateScene(440, 340, p.objectCount, p.spriteAlphabet);
    expect(сцена.length).toBe(p.objectCount);
  });

  it('🔴 лестница переросла пол карты, а не осталась на нём', () => {
    // LADDER_MIN = 15 — умолчание карты уровней. Игра стояла ровно на нём.
    expect(`потолок ${FIND_DIFFERENCES_LEVELS > 15}`).toBe('потолок true');
  });

  it('🔴 ось и правда двигает настройки ПОСЛЕ прежнего потолка', () => {
    // Прежние три оси все насыщаются к 15. Если новая не работает, подписи
    // уровней 16 и 33 совпадут, и «потолок 33» будет обманом.
    const шестнадцать = JSON.stringify(levelParams(16));
    const верх = JSON.stringify(levelParams(FIND_DIFFERENCES_LEVELS));
    expect(`L16 отличается от верха: ${шестнадцать !== верх}`).toBe('L16 отличается от верха: true');
  });

  it('🔴 алфавит только сужается и не проваливается ниже трёх', () => {
    let прежний = levelParams(1).spriteAlphabet;
    const плохо: string[] = [];
    for (let L = 2; L <= 60; L += 1) {
      const a = levelParams(L).spriteAlphabet;
      if (a > прежний) плохо.push(`L${L}: алфавит вырос ${прежний} → ${a}`);
      if (a < 3) плохо.push(`L${L}: алфавит ${a} — меньше трёх, сцена вырождается`);
      if (a > SPRITE_COUNT) плохо.push(`L${L}: алфавит ${a} больше набора ${SPRITE_COUNT}`);
      прежний = a;
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 ЗАМЕР ИСПОЛНЕНИЕМ: двойников в сцене становится БОЛЬШЕ с уровнем', () => {
    // Ось названа «сходство» — значит и мерить надо сходство, а не константу.
    const низ = копийНаВид(15);
    const верх = копийНаВид(FIND_DIFFERENCES_LEVELS);
    expect(`копий на вид растёт: ${верх > низ * 1.5}`).toBe('копий на вид растёт: true');
    // И заодно: на верхнем уровне двойник есть почти у каждого объекта.
    expect(`на верху копий на вид ≥ 3: ${верх >= 3}`).toBe('на верху копий на вид ≥ 3: true');
  });

  it('🔴 ОТЛИЧИЕ ОСТАЁТСЯ ОТЛИЧИМЫМ на самом верхнем уровне', () => {
    // Приманка обязана путать, а не делать задачу нерешаемой: сколько бы ни было
    // двойников, изменённый объект обязан ОТЛИЧАТЬСЯ от себя же в первой сцене.
    const p = levelParams(FIND_DIFFERENCES_LEVELS);
    const непохожие: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const сцена = generateScene(440, 340, p.objectCount, p.spriteAlphabet);
      const { altered, diffIdx } = withDifference(сцена, p.diffCount, p.spriteAlphabet);
      if (diffIdx.length !== p.diffCount) непохожие.push(`сцена ${i}: отличий ${diffIdx.length} вместо ${p.diffCount}`);
      for (const idx of diffIdx) {
        const a = сцена[idx]; const b = altered[idx];
        const отличается = a.sprite !== b.sprite || a.size !== b.size || a.rot !== b.rot;
        if (!отличается) непохожие.push(`сцена ${i}, объект ${idx}: помечен отличием, но не изменён`);
      }
    }
    expect(непохожие.slice(0, 5)).toEqual([]);
  });

  it('🔴 подмена зверя НЕ выходит за алфавит — иначе отличие выдаёт себя само', () => {
    // В сцене из трёх видов появившийся четвёртый виден, не сравнивая картинки
    // вовсе, и ось сходства работала бы наоборот: чем выше уровень, тем легче.
    const p = levelParams(FIND_DIFFERENCES_LEVELS);
    const чужие: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const сцена = generateScene(440, 340, p.objectCount, p.spriteAlphabet);
      const { altered } = withDifference(сцена, p.diffCount, p.spriteAlphabet);
      for (const s of altered) {
        if (s.sprite >= p.spriteAlphabet) чужие.push(`сцена ${i}: зверь ${s.sprite} вне алфавита ${p.spriteAlphabet}`);
      }
    }
    expect(чужие.slice(0, 5)).toEqual([]);
  });

  it('🔴 на нижних уровнях ось МОЛЧИТ — прежние пятнадцать не тронуты', () => {
    // Ось обязана добавлять сверху, а не переписывать то, что человек уже прошёл.
    const плохо: string[] = [];
    for (let L = 1; L <= 15; L += 1) {
      const a = levelParams(L).spriteAlphabet;
      if (a !== SPRITE_COUNT) плохо.push(`L${L}: алфавит ${a}, а до 15 обязан быть полным (${SPRITE_COUNT})`);
    }
    expect(плохо).toEqual([]);
  });
});
