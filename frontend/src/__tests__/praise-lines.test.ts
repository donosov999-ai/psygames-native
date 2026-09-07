/* psygames-praise-lines-gate · VER 1 · 07.09.2026 */
/**
 * ПИТОМЕЦ ХВАЛИТ ТОЛЬКО ЗА НАСТОЯЩЕЕ — И МОЛЧИТ ЗА РЯДОВОЕ.
 *
 * 🔴 Главная проба здесь — про МОЛЧАНИЕ. Похвала за каждый пройденный уровень
 * обесценивается за вечер, и человек перестаёт её читать раньше, чем доберётся
 * до настоящего достижения. Решение Дениса 07.09.2026.
 */
import { COMEBACK_DAYS, pickPraise, praiseLanguages, praiseReason } from '@/src/services/praiseLines';

describe('за что хвалим', () => {
  it('🔴 рядовой проход — МОЛЧАНИЕ, а не «молодец»', () => {
    expect(praiseReason({})).toBeNull();
    expect(praiseReason({ stars: 1 })).toBeNull();
    expect(praiseReason({ stars: 2 })).toBeNull();
    expect(pickPraise('ru', { stars: 2 })).toBeNull();
  });

  it('🔴 «прошёл уровень» сам по себе поводом НЕ является', () => {
    // Первая редакция брала флаг `passed` — это обычный успех любого уровня,
    // и похвала выпадала бы на каждый. Теперь нужен ЯВНЫЙ ноль ошибок.
    expect(praiseReason({ stars: 1, errors: undefined })).toBeNull();
    expect(praiseReason({ stars: 1, errors: 2 })).toBeNull();
    expect(praiseReason({ stars: 1, errors: 0 })).toBe('clean');
  });

  it('настоящие поводы срабатывают', () => {
    expect(praiseReason({ isRecord: true })).toBe('record');
    expect(praiseReason({ daysAway: 3 })).toBe('comeback');
    expect(praiseReason({ stars: 3 })).toBe('stars');
    expect(praiseReason({ fasterThanLast: true })).toBe('faster');
    expect(praiseReason({ goalDone: 4, goalTotal: 7 })).toBe('goal');
  });

  it('🔴 перерыв считается ЛИТЕРАЛЬНЫМИ днями, а не «на день меньше константы»', () => {
    /*
     * ⚠️ Здесь стояло `daysAway: COMEBACK_DAYS - 1`, и контрпроба это поймала:
     * при подмене константы на 1 проба осталась ЗЕЛЁНОЙ, потому что сама
     * считалась от неё же. Третий случай этого класса за сутки 07.09.2026 —
     * проба, написанная через константу, которую должна пинать, не мерит ничего.
     * Дни выписаны числами: один и два — не возвращение, три — возвращение.
     */
    expect(praiseReason({ daysAway: 0 })).toBeNull();
    expect(praiseReason({ daysAway: 1 })).toBeNull();
    expect(praiseReason({ daysAway: 2 })).toBeNull();
    expect(praiseReason({ daysAway: 3 })).toBe('comeback');
    expect(COMEBACK_DAYS).toBe(3);
  });

  it('достигнутая цель поводом «продвижение» уже не является', () => {
    // 7 из 7 — это не «идёшь к цели», это отдельный разговор в окне цели.
    expect(praiseReason({ goalDone: 7, goalTotal: 7 })).toBeNull();
    expect(praiseReason({ goalDone: 0, goalTotal: 7 })).toBeNull();
  });

  describe('одна фраза за раз, приоритет соблюдается', () => {
    it('🔴 рекорд важнее всего остального вместе взятого', () => {
      const r = praiseReason({ isRecord: true, stars: 3, errors: 0, daysAway: 9, goalDone: 4, goalTotal: 7 });
      expect(r).toBe('record');
    });

    it('возвращение важнее звёзд и цели', () => {
      expect(praiseReason({ daysAway: 5, stars: 3, goalDone: 4, goalTotal: 7 })).toBe('comeback');
    });

    it('цель важнее звёзд', () => {
      expect(praiseReason({ goalDone: 4, goalTotal: 7, stars: 3 })).toBe('goal');
    });

    it('звёзды важнее скорости и чистоты', () => {
      expect(praiseReason({ stars: 3, fasterThanLast: true, errors: 0 })).toBe('stars');
    });
  });
});

describe('слова похвалы', () => {
  it('прогресс к цели подставляет ОБА числа', () => {
    const l = pickPraise('ru', { goalDone: 4, goalTotal: 7 });
    expect(l?.text).toBe('4-й день из 7');
    expect(l?.text).not.toContain('{');
  });

  it('на каждый повод свои слова и свой облик', () => {
    const поводы = [
      { i: { isRecord: true }, r: 'record' },
      { i: { daysAway: 9 }, r: 'comeback' },
      { i: { goalDone: 2, goalTotal: 7 }, r: 'goal' },
      { i: { stars: 3 }, r: 'stars' },
      { i: { fasterThanLast: true }, r: 'faster' },
      { i: { errors: 0 }, r: 'clean' },
    ];
    const тексты = поводы.map((p) => pickPraise('ru', p.i)!.text);
    expect(new Set(тексты).size).toBe(поводы.length);
    for (const p of поводы) expect(pickPraise('ru', p.i)!.reason).toBe(p.r);
  });

  it('незнакомый язык падает на английский, а не на пустоту', () => {
    expect(pickPraise('ko', { stars: 3 })?.text).toBe(pickPraise('en', { stars: 3 })?.text);
  });

  it('🔴 в похвале нет ни упрёка, ни обещания', () => {
    const плохие = ['наконец', 'хоть', 'всего лишь', 'шанс', 'в 2 раза', 'finally', 'at last', 'only'];
    for (const lang of praiseLanguages()) {
      for (const i of [{ isRecord: true }, { daysAway: 9 }, { goalDone: 2, goalTotal: 7 }, { stars: 3 }, { fasterThanLast: true }, { errors: 0 }]) {
        const t = pickPraise(lang, i)!.text.toLowerCase();
        expect(`${lang}: ${плохие.filter((b) => t.includes(b)).join(', ') || 'чисто'}`).toBe(`${lang}: чисто`);
      }
    }
  });
});
