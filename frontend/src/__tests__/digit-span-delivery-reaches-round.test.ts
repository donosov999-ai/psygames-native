/**
 * 🔴 ВЫБРАННЫЙ СПОСОБ ПОДАЧИ ОБЯЗАН ДОЕХАТЬ ДО ПАРТИИ.
 *
 * ЗАМЕР ДО (07.09.2026). `effectiveDelivery('all', …)` возвращал `'screen'` при
 * ЛЮБОЙ доступности озвучки: условие проверяло только голос, а всё остальное
 * схлопывало в экран. Человек выбирал «весь ряд разом», а играл показом по одной;
 * ветка `deliveryRef.current === 'all'` не исполнялась никогда.
 *
 * ⚠️ ПОЧЕМУ ЭТО ПРОЖИЛО ДОЛГО. Пятьдесят восемь зелёных проб раздела проверяли
 * `allAtOnceMs` и длину `DELIVERIES` — ОБЪЯВЛЕНИЕ режима. Доходит ли выбор до
 * партии, не спрашивала ни одна. Режим просила тестировщица (отчёт NZT-48
 * 05.09.2026), и задача считалась закрытой.
 */
import { effectiveDelivery, DELIVERIES, type Delivery } from '@/app/games/digit-span';

describe('digit-span: способ подачи доезжает до партии', () => {
  it('🔴 каждый объявленный режим отдаёт САМ СЕБЯ, когда озвучка доступна', () => {
    const схлопнулись = DELIVERIES.filter((d) => effectiveDelivery(d, null) !== d);
    expect(`схлопнулись в другой режим: ${схлопнулись.join(', ') || 'ни один'}`)
      .toBe('схлопнулись в другой режим: ни один');
  });

  it('без озвучки уступает ТОЛЬКО голосовой — экранные два не трогаются', () => {
    expect(effectiveDelivery('voice' as Delivery, 'sound-off')).toBe('screen');
    expect(effectiveDelivery('voice' as Delivery, null)).toBe('voice');
    expect(effectiveDelivery('screen' as Delivery, 'sound-off')).toBe('screen');
    // ⚠️ вот это и было сломано: «разом» показывается на экране, озвучка ему не нужна
    expect(effectiveDelivery('all' as Delivery, 'sound-off')).toBe('all');
  });
});
