/* psygames-failure-policy · VER 1 · 22.08.2026 */
/**
 * «ТРИ ОШИБКИ И ПАРТИЯ КОНЧИЛАСЬ» — И ГДЕ ЭТО ПРАВИЛО НЕ ДЕЙСТВУЕТ.
 *
 * 🔴 ЧТО НАШЛОСЬ 22.08.2026. Всю модель провала не проверял НИКТО. Три мутации
 * подряд остались зелёными: провал на одну ошибку позже, длинная партия начала
 * обрываться, и три жизни превратились в одну. Любая из них меняет ощущение от
 * приложения целиком — жизни считаются во всех коротких партиях.
 *
 * ⚠️ ЧЕМ ДОРОГА ИМЕННО ВТОРАЯ. Самурай и фрактальная судоку решаются час и
 * больше. Отдать час из-за третьего промаха пальцем — не сложность, а наказание;
 * ради этого политику и вынесли из экрана наружу. Мутация возвращала ровно ту
 * беду, от которой уходили, и ни один набор не покраснел.
 */
import {
  STANDARD_LIVES,
  failurePolicy,
  formatErrorCount,
  isOver,
  livesLeft,
} from '@/src/services/failure';

const short = failurePolicy('standard');
const long = failurePolicy('longform');

describe('короткая партия — ошибки тратят жизни', () => {
  it('жизней несколько, но немного: одна — это не вызов, а рулетка', () => {
    expect(STANDARD_LIVES).toBeGreaterThanOrEqual(3);
    expect(STANDARD_LIVES).toBeLessThanOrEqual(5);
  });

  /**
   * 🔴 ГРАНИЦА ПРОВЕРЯЕТСЯ С ОБЕИХ СТОРОН. Ошибка ровно по числу жизней обязана
   * заканчивать партию, на одну меньше — не заканчивать. Проверка только «сверху»
   * пропустила бы сдвиг границы на единицу, а это лишняя жизнь в каждой партии.
   */
  it('партия кончается ровно на последней жизни, не позже', () => {
    expect(isOver(short, STANDARD_LIVES - 1)).toBe(false);
    expect(isOver(short, STANDARD_LIVES)).toBe(true);
    expect(isOver(short, STANDARD_LIVES + 1)).toBe(true);
  });

  it('без ошибок партия не кончается', () => {
    expect(isOver(short, 0)).toBe(false);
  });

  it('остаток жизней убывает по одной и упирается в ноль', () => {
    expect(livesLeft(short, 0)).toBe(STANDARD_LIVES);
    expect(livesLeft(short, 1)).toBe(STANDARD_LIVES - 1);
    expect(livesLeft(short, STANDARD_LIVES)).toBe(0);
    expect(livesLeft(short, STANDARD_LIVES + 5)).toBe(0);   // в минус не уходит
  });

  it('счётчик показывает «сделано из всего», а не голое число', () => {
    expect(formatErrorCount(short, 1)).toBe(`1/${STANDARD_LIVES}`);
    expect(formatErrorCount(short, 0)).toBe(`0/${STANDARD_LIVES}`);
  });
});

describe('длинная партия — ошибки считаются, но час работы не отбирают', () => {
  it('не обрывается никогда, сколько бы ни ошибся', () => {
    expect(long.fatal).toBe(false);
    expect(isOver(long, 0)).toBe(false);
    expect(isOver(long, 3)).toBe(false);
    expect(isOver(long, 999)).toBe(false);
  });

  it('сердечек не рисуем — считать нечего', () => {
    expect(livesLeft(long, 7)).toBe(Infinity);
  });

  /**
   * `0/∞` на экране — бессмыслица. В длинной партии показываем просто число
   * ошибок, без знаменателя.
   */
  it('счётчик без знаменателя', () => {
    expect(formatErrorCount(long, 7)).toBe('7');
    expect(formatErrorCount(long, 0)).toBe('0');
  });

  it('ошибки всё равно считаются — их просто не за что отнимать', () => {
    expect(formatErrorCount(long, 12)).toBe('12');
  });
});

describe('два режима — это два РАЗНЫХ режима', () => {
  it('короткая обрывается, длинная нет — иначе политика ничего не решает', () => {
    expect(short.fatal).toBe(true);
    expect(long.fatal).toBe(false);
    expect(short.fatal).not.toBe(long.fatal);
  });

  it('дробные и отрицательные ошибки счётчик не ломают', () => {
    expect(formatErrorCount(short, -3)).toBe(`0/${STANDARD_LIVES}`);
    expect(formatErrorCount(short, 1.7)).toBe(`1/${STANDARD_LIVES}`);
  });
});
