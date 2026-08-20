/* psygames-upload-retry · VER 1 · 21.08.2026 */
/**
 * ЗАПИСЬ, КОТОРАЯ НЕ ДОЛЕТЕЛА, — ЭТО ПОТЕРЯННЫЙ РАССКАЗ О ПРОБЛЕМЕ.
 *
 * 🔴 ЧТО СЛУЧИЛОСЬ. 20.08.2026 отчёт тестировщицы приехал ЧЕРЕЗ РЕЛЕЙ (прямой
 * адрес её сеть не пустила), а заливка голосовой заметки упала с `Failed to
 * fetch`; скриншот тем же. В заметке было 15 299 байт — живая речь: у немых
 * записей поток 235 байт/с, тут на порядок больше. Попытка была ОДНА, и запись
 * пропала навсегда, при том что человек увидел «спасибо».
 *
 * ⚠️ ПЕРЕД ПОЧИНКОЙ ПРОВЕРЕНО РУКАМИ, ЧТО ДЕЛО НЕ В АДРЕСЕ: релей проносит
 * заливку 15 КБ так же, как прямой (оба 200), предполётный запрос одинаков,
 * ограничения тела на релее нет. Чинится единственность попытки, а не маршрут.
 */
import { shouldRetryUpload, uploadWithRetry } from '@/src/services/appFeedback';

describe('что повторяем, а что нет', () => {
  it('🔴 сетевой отказ — повторяем', () => {
    for (const o of ['err:Failed to fetch', 'timeout', 'err:NetworkError when attempting to fetch',
                     'threw:TypeError: Failed to fetch', 'err:ECONNRESET', 'err:aborted']) {
      expect(`${o} → ${shouldRetryUpload(o)}`).toBe(`${o} → true`);
    }
  });

  /**
   * ⚠️ ЭТО ВАЖНЕЕ, ЧЕМ КАЖЕТСЯ. Повтор по отказу «по существу» не помогает
   * никогда, а стоит человеку ещё одного ожидания на экране отправки.
   */
  it('🔴 отказ по существу — НЕ повторяем', () => {
    for (const o of ['ok', 'too_big', 'err:The resource already exists',
                     'err:Bucket not found', 'err:new row violates row-level security policy']) {
      expect(`${o} → ${shouldRetryUpload(o)}`).toBe(`${o} → false`);
    }
  });

  it('успех второй попытки тоже успех — повторять его нечего', () => {
    expect(shouldRetryUpload('ok-relay')).toBe(false);
    expect(shouldRetryUpload('ok-direct')).toBe(false);
  });
});

describe('вторая попытка другим адресом', () => {
  const firstClient = { имя: 'первый' };
  const altClient = { имя: 'второй' };

  it('первая попытка удалась — второго адреса не трогаем вовсе', async () => {
    const seen: any[] = [];
    let altAsked = 0;
    const out = await uploadWithRetry(
      async (c) => { seen.push(c); return 'ok'; },
      firstClient, () => { altAsked++; return altClient; }, 'relay',
    );
    expect(out).toBe('ok');
    expect(seen).toEqual([firstClient]);
    expect(altAsked).toBe(0);
  });

  it('🔴 сеть моргнула — вторая попытка идёт ДРУГИМ клиентом и спасает запись', async () => {
    const seen: any[] = [];
    const out = await uploadWithRetry(
      async (c) => { seen.push(c); return c === altClient ? 'ok' : 'err:Failed to fetch'; },
      firstClient, () => altClient, 'relay',
    );
    expect(out).toBe('ok-relay');
    expect(seen).toEqual([firstClient, altClient]);
  });

  it('🔴 отказ по существу — второй попытки НЕТ', async () => {
    const seen: any[] = [];
    const out = await uploadWithRetry(
      async (c) => { seen.push(c); return 'err:The resource already exists'; },
      firstClient, () => altClient, 'relay',
    );
    expect(out).toBe('err:The resource already exists');
    expect(seen).toEqual([firstClient]);
  });

  /** Оба исхода видны в репорте — иначе снова будем гадать, помог повтор или нет. */
  it('🔴 не помогла и вторая — в репорт уходят ОБА исхода, а не последний', async () => {
    const out = await uploadWithRetry(
      async () => 'err:Failed to fetch',
      firstClient, () => altClient, 'direct',
    );
    expect(out).toContain('Failed to fetch');
    expect(out).toContain('direct:');
  });

  it('исключение на первой попытке не съедает вторую', async () => {
    const seen: any[] = [];
    const out = await uploadWithRetry(
      async (c) => { seen.push(c); if (c === firstClient) throw new Error('Failed to fetch'); return 'ok'; },
      firstClient, () => altClient, 'relay',
    );
    expect(out).toBe('ok-relay');
    expect(seen.length).toBe(2);
  });

  it('исключение на второй попытке не роняет отправку репорта', async () => {
    const out = await uploadWithRetry(
      async () => { throw new Error('Failed to fetch'); },
      firstClient, () => altClient, 'relay',
    );
    expect(typeof out).toBe('string');
    expect(out).toContain('relay:threw');
  });
});
