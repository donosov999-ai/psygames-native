/* psygames-feedback-send-timing · VER 1 · 29.10.2026 */
/**
 * ⏱ ОТЗЫВ НЕСЁТ ВРЕМЯ СВОИХ ЭТАПОВ (задача 3a7f4077). Денис: «отправка иногда ждёт 10–20 с»; в
 * контексте отзывов за 14 дней времени не было ни разу. Проба отправляет настоящим sendFeedback через
 * подставной клиент: загрузка снимка «идёт» 40 мс, и строка обязана это записать.
 */
const inserted: any[] = [];
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const fakeClient = {
  storage: {
    from: (bucket: string) => ({
      upload: async () => { await wait(bucket.includes('audio') || bucket.includes('voice') ? 25 : 40); return { error: null }; },
    }),
  },
  from: () => ({ insert: async (row: any) => { inserted.push(row); return { error: null }; } }),
};
jest.mock('@/src/services/supabase', () => ({
  getSupabase: () => fakeClient,
  altSupabase: () => null,
  altBaseName: () => 'relay',
  supabaseNetInfo: () => ({ base: 'direct', how: 'direct' }),
}));
jest.mock('@/src/services/crumbs', () => ({ readCrumbs: async () => [], readConsoleErrors: async () => [] }));

import { sendFeedback } from '@/src/services/appFeedback';

describe('время этапов отправки — в контексте отзыва', () => {
  beforeEach(() => { inserted.length = 0; });

  it('🔴 снимок: shot — время его загрузки, pre — всё до записи строки', async () => {
    const res = await sendFeedback({
      kind: 'bug', message: 'тест', shot: new Blob(['x'.repeat(100)], { type: 'image/jpeg' }),
    } as any);
    expect(res.ok).toBe(true);
    const t = inserted[0].context.send_ms;
    expect(t.shot).toBeGreaterThanOrEqual(30);
    expect(t.audio).toBeNull();
    expect(t.pre).toBeGreaterThanOrEqual(t.shot);
  });

  it('голос, который не загрузился (в jest import() модуля голоса падает), — времени загрузки нет', async () => {
    await sendFeedback({
      kind: 'bug', message: 'тест',
      audio: { blob: new Blob(['y'.repeat(100)], { type: 'audio/webm' }), seconds: 2, mime: 'audio/webm' },
    } as any);
    expect(inserted[0].context.audio_up).toMatch(/^threw:/);
    expect(inserted[0].context.send_ms.audio).toBeNull();
  });

  it('без вложений — shot и audio пустые, pre есть', async () => {
    await sendFeedback({ kind: 'bug', message: 'тест' } as any);
    expect(inserted[0].context.send_ms).toEqual({ shot: null, audio: null, pre: expect.any(Number) });
  });
});
