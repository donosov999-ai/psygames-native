/* psygames-voice-native-rec-test · VER 1 · 29.08.2026 */
/**
 * НАТИВНАЯ ЗАПИСЬ ЗА МОСТОМ (задача 06790750) — клиентский путь фикстурой моста.
 *
 * Сага немых голосовых: устаревший Android System WebView (Chrome<100) отдаёт
 * PCM-нули при живом getUserMedia. Обход — запись нативным MediaRecorder по ту
 * сторону моста PsyNative. Здесь проверяется РАЗВИЛКА и ЧЕСТНОСТЬ полей:
 * когда идём нативно, когда нет, и что заметка не врёт про то, чего не мерила.
 *
 * ⚠️ Урок саги: якорь по ВЫЗОВУ, проверка прогоном. Нативная часть патча
 * прогоняется на заготовке MainActivity в CI (build.yml сам валит сборку,
 * если мост не встал); здесь — только клиентская половина.
 */
import { startRecording, MAX_RECORD_SEC } from '@/src/services/voiceNote';

const STALE_UA = 'Mozilla/5.0 (Linux; Android 11; ONEPLUS 8 Pro; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.210 Mobile Safari/537.36';
const FRESH_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36';

// m4a-заглушка: содержимое не декодируется тестом, важен только путь байтов.
const FAKE_BYTES = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const FAKE_B64 = btoa(String.fromCharCode(...FAKE_BYTES));

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

function mockBridge(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const b = {
    micState: () => 'granted',
    requestMic: () => { calls.push('requestMic'); },
    startRec: () => { calls.push('startRec'); return 'ok'; },
    stopRec: () => { calls.push('stopRec'); return FAKE_B64; },
    cancelRec: () => { calls.push('cancelRec'); },
    ...overrides,
  };
  (window as any).PsyNative = b;
  return { b, calls };
}

afterEach(() => {
  delete (window as any).PsyNative;
});

describe('нативная запись за мостом', () => {
  it('🔴 старый WebView + мост с записью → пишем нативно, заметка честная', async () => {
    setUA(STALE_UA);
    const { calls } = mockBridge();
    const rec = await startRecording();
    expect(calls).toContain('startRec');
    const note = await rec.stop();
    expect(calls).toContain('stopRec');
    expect(note).not.toBeNull();
    expect(note!.mime).toBe('audio/mp4');
    expect(note!.source).toBe('native');
    // Уровень нативно не меряется — заметка обязана честно это сказать,
    // а не отдать peak:0 с measured:true (это читалось бы как «тишина»).
    expect(note!.measured).toBe(false);
    expect(note!.blob.size).toBe(FAKE_BYTES.length);
    expect(note!.seconds).toBeGreaterThanOrEqual(1);
    expect(note!.seconds).toBeLessThanOrEqual(MAX_RECORD_SEC);
  });

  it('cancel зовёт cancelRec и отдаёт null — файл не собирается', async () => {
    setUA(STALE_UA);
    const { calls } = mockBridge();
    const rec = await startRecording();
    rec.cancel();
    expect(calls).toContain('cancelRec');
    expect(calls).not.toContain('stopRec');
  });

  it('stopRec вернул error → null, не пустой блоб', async () => {
    setUA(STALE_UA);
    mockBridge({ stopRec: () => 'error:empty' });
    const rec = await startRecording();
    const note = await rec.stop();
    expect(note).toBeNull();
  });

  it('🔴 свежий WebView НЕ идёт нативно: там стек жив и умеет уровень', async () => {
    setUA(FRESH_UA);
    const { calls } = mockBridge();
    // Обычный путь упрётся в отсутствие getUserMedia в jsdom — этого достаточно:
    // важно, что нативная ветка даже не попробовала стартовать.
    await expect(startRecording()).rejects.toBeTruthy();
    expect(calls).not.toContain('startRec');
  });

  it('startRec ответил не-ok → нативная ветка уступает обычному пути', async () => {
    setUA(STALE_UA);
    const { calls } = mockBridge({ startRec: () => { calls.push('startRec'); return 'error:busy'; } });
    await expect(startRecording()).rejects.toBeTruthy();   // обычный путь в jsdom падает — ветка ушла туда
    expect(calls).toContain('startRec');
    expect(calls).not.toContain('stopRec');
  });

  it('второй stop после первого отдаёт ту же заметку (finish идемпотентен)', async () => {
    setUA(STALE_UA);
    const { calls } = mockBridge();
    const rec = await startRecording();
    const a = await rec.stop();
    const b = await rec.stop();
    expect(a).toBe(b);
    expect(calls.filter((c) => c === 'stopRec').length).toBe(1);
  });
});
