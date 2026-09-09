/**
 * 🔴 ВИД ПИТОМЦА ОБЯЗАН СЛЕДОВАТЬ ЗА ЗАБОТОЙ, А НЕ ЖИТЬ ОТДЕЛЬНО.
 *
 * Задача Дениса 05.09.2026: «чтобы забота меняла вид». Легко нарисовать восемь
 * рядов внешности и подключить их так, что кот всё равно всегда выглядит
 * одинаково: правило выбора вернёт `age` во всех случаях, картинки лягут в
 * сборку мёртвым грузом, и никто не заметит — на глаз кот и должен выглядеть
 * нормально, когда за ним ухаживают.
 *
 * Поэтому проба проверяет не «функция что-то вернула», а что РАЗНАЯ забота даёт
 * РАЗНЫЙ вид, и именно тот, который человек ожидает: не кормят — тощий, кормят
 * каждый день — толстый, не моют — грязный, забросили — унылый.
 *
 * ⚠️ Отдельно проверяется, что вид НЕ дёргается от одного пропущенного дня:
 * иначе кот менял бы внешность чаще, чем человек заходит в приложение, и
 * подсказка превратилась бы в шум.
 */
import { petLook, весПоКормлению, свечениеПоНавыкам, LOOK_STAGES, type PetCare } from '@/src/services/petLook';

/** Ухоженный питомец: кормят через день, помыт вчера, играли вчера. */
const УХОЖЕННЫЙ: PetCare = {
  fedDays: 14, daysSinceWash: 1, daysSincePlay: 1, stage: 1, skillAvg: 20,
};

describe('вид питомца следует за заботой', () => {
  it('ухоженный кот показывает возраст, а не нужду', () => {
    expect(petLook(УХОЖЕННЫЙ).axis).toBe('age');
    expect(petLook(УХОЖЕННЫЙ).reason).toBe('growing');
  });

  it('🔴 возраст виден: три стадии дают три РАЗНЫЕ ступени', () => {
    const ст = [1, 2, 3].map((s) => petLook({ ...УХОЖЕННЫЙ, stage: s as 1 | 2 | 3 }).stage);
    expect(new Set(ст).size).toBe(3);
    // и растут по порядку, а не вразнобой
    expect(ст).toEqual([...ст].sort((a, b) => a - b));
  });

  it('🔴 не кормят — тощий; кормят каждый день — норма, а не «перекормлен»', () => {
    // Решение Дениса 09.09.2026: ежедневное кормление — норма. Раньше 14 из 14 давало
    // «перекормлен», и человек, кормивший как просит приложение, видел кота хуже всех.
    const голодный = petLook({ ...УХОЖЕННЫЙ, fedDays: 0 });
    const ежедневно = petLook({ ...УХОЖЕННЫЙ, fedDays: 14 });
    expect(голодный.axis).toBe('weight');
    expect(голодный.reason).toBe('hungry');
    expect(`${ежедневно.axis}/${ежедневно.reason}`).toBe('age/growing');
    expect(голодный.stage).toBeLessThan(весПоКормлению(14));
  });

  it('норма кормления — ежедневное: ступень 3 на 14 из 14, ноль на нуле, перекорма кормлением нет', () => {
    expect(весПоКормлению(14)).toBe(3);
    expect(весПоКормлению(0)).toBe(0);
    expect(весПоКормлению(7)).toBeLessThan(3);
    for (const d of [0, 3, 7, 10, 14, 99]) expect(весПоКормлению(d)).toBeLessThanOrEqual(3);
  });

  it('🔴 неделю не мыли — грязный', () => {
    const л = petLook({ ...УХОЖЕННЫЙ, daysSinceWash: 7 });
    expect(л.axis).toBe('clean');
    expect(л.reason).toBe('dirty');
    expect(л.stage).toBe(LOOK_STAGES - 1);
  });

  it('🔴 неделю не играли — унылый; две недели — больной', () => {
    expect(petLook({ ...УХОЖЕННЫЙ, daysSincePlay: 7 }).reason).toBe('lonely');
    const давно = petLook({ ...УХОЖЕННЫЙ, daysSincePlay: 14 });
    expect(давно.axis).toBe('health');
    expect(давно.reason).toBe('neglected');
  });

  it('🔴 вид не дёргается от одного пропущенного дня', () => {
    for (const d of [1, 2]) {
      expect(petLook({ ...УХОЖЕННЫЙ, daysSinceWash: d }).axis).toBe('age');
      expect(petLook({ ...УХОЖЕННЫЙ, daysSincePlay: d }).axis).toBe('age');
    }
  });

  it('🔴 ступень всегда внутри нарисованного ряда — иначе кадра не существует', () => {
    const крайности: PetCare[] = [];
    for (const fedDays of [0, 3, 7, 14, 99]) {
      for (const daysSinceWash of [0, 3, 7, 400]) {
        for (const daysSincePlay of [0, 5, 9, 400]) {
          for (const stage of [1, 2, 3] as const) {
            крайности.push({ fedDays, daysSinceWash, daysSincePlay, stage, skillAvg: 50 });
          }
        }
      }
    }
    const плохие = крайности
      .map((c) => ({ c, л: petLook(c) }))
      .filter(({ л }) => !Number.isInteger(л.stage) || л.stage < 0 || л.stage >= LOOK_STAGES);
    expect(плохие).toEqual([]);
    expect(крайности.length).toBe(240);          // проба реально прогнала перебор
  });

  it('свечение растёт с навыками и не выходит за ряд', () => {
    expect(свечениеПоНавыкам(0)).toBe(0);
    expect(свечениеПоНавыкам(100)).toBe(LOOK_STAGES - 1);
    expect(свечениеПоНавыкам(50)).toBeGreaterThan(свечениеПоНавыкам(10));
    for (const v of [-50, 0, 33, 100, 900]) {
      expect(свечениеПоНавыкам(v)).toBeGreaterThanOrEqual(0);
      expect(свечениеПоНавыкам(v)).toBeLessThan(LOOK_STAGES);
    }
  });
});
