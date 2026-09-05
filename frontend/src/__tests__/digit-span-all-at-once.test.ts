/**
 * 🔴 ТРЕТИЙ СПОСОБ ПОДАЧИ — ВЕСЬ РЯД РАЗОМ.
 *
 * Отчёт тестировщицы 05.09.2026, дословно: «надо добавить вариант, когда цифры
 * сразу показываются на экране, а так получается что это последовательно долго
 * ждать, это утомляет; по-разному в памяти работает».
 *
 * Она права и по механике: показ по одной грузит фонологическую петлю — цифры
 * проговариваются про себя по мере появления; ряд, показанный разом, — это
 * зрительный охват, его считывают глазами и держат картинкой. Разные памяти.
 *
 * ⚠️ ГЛАВНОЕ, ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ — РАВНОЕ ВРЕМЯ. Если ряд держать на экране
 * меньше, чем шёл бы показ по одной, новый способ окажется просто «полегче», а
 * не другим упражнением, и сравнивать замеры будет нельзя.
 */
import { DELIVERIES, allAtOnceMs, type Delivery } from '@/app/games/digit-span';
import { DIGIT_SPAN_LOCALES, getDigitSpanStrings } from '@/src/games/digit-span/core/i18n';

describe('«Охват памяти»: весь ряд разом', () => {
  it('есть что проверять: способ подачи заведён и он третий', () => {
    expect(DELIVERIES).toContain('all' as Delivery);
    expect(DELIVERIES.length).toBe(3);
  });

  it('🔴 подпись есть во ВСЕХ языках, а не в двух', () => {
    expect(DIGIT_SPAN_LOCALES.length).toBeGreaterThanOrEqual(12);
    const без = DIGIT_SPAN_LOCALES.filter((язык) => !getDigitSpanStrings(язык).deliveryAll);
    expect(без).toEqual([]);
    // И это не копия соседней подписи.
    for (const язык of DIGIT_SPAN_LOCALES) {
      const s = getDigitSpanStrings(язык);
      expect(`${язык}: ${s.deliveryAll !== s.deliveryScreen && s.deliveryAll !== s.deliveryVoice}`)
        .toBe(`${язык}: true`);
    }
  });

  /**
   * 🔴 ВРЕМЯ ПОКАЗА РАВНО ПОСЛЕДОВАТЕЛЬНОМУ. Иначе способ не сравним с прежним.
   */
  it('🔴 ряд держится на экране столько же, сколько шёл бы показ по одной', () => {
    for (const gap of [550, 800, 1100]) {
      for (const len of [4, 6, 9]) {
        const разом = allAtOnceMs(len, gap);
        const поОдной = len * gap;
        expect(`len=${len} gap=${gap}: ${разом} против ${поОдной}`)
          .toBe(`len=${len} gap=${gap}: ${поОдной} против ${поОдной}`);
      }
    }
  });

  it('🔴 у самого короткого ряда показ не схлопывается в мгновение', () => {
    // 600 мс — нижняя граница: ниже глаз не успевает считать даже три цифры.
    expect(allAtOnceMs(1, 100)).toBeGreaterThanOrEqual(600);
    expect(allAtOnceMs(2, 200)).toBeGreaterThanOrEqual(600);
  });
});
