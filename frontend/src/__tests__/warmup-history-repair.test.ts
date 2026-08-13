/**
 * Восстановление отметок календаря из собственных сессий.
 *
 * ЗАЧЕМ. История зарядок стиралась целиком при сбое чтения, и вместе с ней исчезали
 * все отметки. Репорт Вали 12.08: «Куда деваются огонечки, было много — все исчезли».
 * Починить запись мало — потерянное надо вернуть, и вернуть ЧЕСТНО: только те дни,
 * в которые человек действительно играл внутри зарядки.
 */
import { daysFromSessions } from '../services/warmup';

describe('дни зарядок из сессий', () => {
  it('берёт только партии внутри зарядки', () => {
    const days = daysFromSessions([
      { timestamp: '2026-08-01T10:00:00Z', warmup_id: 'a' },
      { timestamp: '2026-08-02T10:00:00Z' },              // без зарядки — не день зарядки
      { timestamp: '2026-08-03T10:00:00Z', warmup_id: 'b' },
    ]);
    expect(days).toEqual(['2026-08-01', '2026-08-03']);
  });

  it('несколько партий за день дают ОДИН день', () => {
    const days = daysFromSessions([
      { timestamp: '2026-08-06T09:00:00Z', warmup_id: 'a' },
      { timestamp: '2026-08-06T09:05:00Z', warmup_id: 'a' },
      { timestamp: '2026-08-06T09:10:00Z', warmup_id: 'b' },
    ]);
    expect(days).toEqual(['2026-08-06']);
  });

  it('битую дату пропускает, а не роняет всё', () => {
    const days = daysFromSessions([
      { timestamp: 'не дата', warmup_id: 'a' },
      { timestamp: '2026-08-09T10:00:00Z', warmup_id: 'b' },
    ]);
    expect(days).toEqual(['2026-08-09']);
  });

  it('дни идут по возрастанию — календарь читает их по порядку', () => {
    const days = daysFromSessions([
      { timestamp: '2026-08-10T10:00:00Z', warmup_id: 'c' },
      { timestamp: '2026-08-01T10:00:00Z', warmup_id: 'a' },
      { timestamp: '2026-08-05T10:00:00Z', warmup_id: 'b' },
    ]);
    expect(days).toEqual(['2026-08-01', '2026-08-05', '2026-08-10']);
  });

  it('пустой список не даёт дней', () => {
    expect(daysFromSessions([])).toEqual([]);
  });
});
