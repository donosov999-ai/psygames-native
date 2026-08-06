import { shouldAdvance, ADVANCE_DEBOUNCE_MS } from '@/src/services/warmup';

/**
 * Регрессия на «зарядка проглатывает игры».
 *
 * Авто-переход к следующему шагу планируется с задержкой (у вечера — 3500 мс).
 * Если человек за это время сам жмёт «Далее» в результате игры, переход происходит
 * дважды: руками и по таймеру. Дебаунс в 800 мс это не ловит — переходы разнесены
 * на секунды, — и шаг между ними пропадает. У Вали вечерний набор из трёх игр так
 * превращался в «одна игра и сразу дыхание» (репорты 03.08 и 05.08).
 */
describe('переход к следующему шагу зарядки', () => {
  it('ручной переход разрешён', () => {
    expect(shouldAdvance({ currentIdx: 0, now: 10_000, lastAdvanceAt: 0 })).toBe(true);
  });

  it('запланированный переход срабатывает, если шаг не менялся', () => {
    expect(shouldAdvance({ fromIdx: 0, currentIdx: 0, now: 13_500, lastAdvanceAt: 0 })).toBe(true);
  });

  it('ГЛАВНОЕ: таймер, заведённый на шаг 0, не двигает уже перелистнутый вручную шаг 1', () => {
    // t=0 сохранилась сессия игры №1 → запланирован переход с fromIdx=0 на t=3500
    // t=600 человек жмёт «Далее» руками → currentIdx стал 1
    // t=3500 таймер срабатывает — и обязан промолчать, иначе игра №2 будет пропущена
    expect(shouldAdvance({ fromIdx: 0, currentIdx: 1, now: 3_500, lastAdvanceAt: 600 })).toBe(false);
  });

  it('дубль-сейв сессии внутри окна дебаунса не двигает шаг дважды', () => {
    expect(shouldAdvance({ currentIdx: 2, now: 5_000, lastAdvanceAt: 5_000 + 1 - ADVANCE_DEBOUNCE_MS })).toBe(false);
    expect(shouldAdvance({ currentIdx: 2, now: 5_000, lastAdvanceAt: 5_000 - ADVANCE_DEBOUNCE_MS })).toBe(true);
  });

  it('дебаунс не отменяет переход, если пауза уже прошла', () => {
    expect(shouldAdvance({ currentIdx: 1, now: 9_000, lastAdvanceAt: 1_000 })).toBe(true);
  });
});
