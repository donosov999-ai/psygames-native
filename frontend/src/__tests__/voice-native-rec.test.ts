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
    // Мост БЕЗ recLevel (сборка до 04.09.2026) мерить не умеет — заметка обязана
    // честно это сказать, а не отдать peak:0 с measured:true (читалось бы «тишина»).
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

/**
 * 🔴 УРОВЕНЬ НА НАТИВНОМ ПУТИ — ГЛАВНОЕ, ЧЕГО НЕ ХВАТАЛО.
 *
 * Замер 04.09.2026 по всем 98 голосовым базы: 80 файлов с OnePlus 8 Pro немы
 * (−91 дБ на обоих путях записи при `granted`), 18 файлов с Pixel/Xiaomi/Samsung/
 * Redmi — со звуком (пики −2,1…0,0 дБ). Глушит запись само устройство, из кода это
 * не лечится. Лечится то, что человек об этом НЕ ЗНАЛ: полоска уровня на нативном
 * пути не рисовалась вовсе, и 169-секундная жалоба уходила в тишину незамеченной.
 *
 * Мост отдаёт `recLevel()` = `MediaRecorder.getMaxAmplitude()` (0..32767). Первый
 * ответ после старта сбрасывает базу и в пик не идёт.
 */
describe('уровень на нативном пути', () => {
  it('мост с recLevel: уровень доходит наверх, пик попадает в заметку, measured=true', async () => {
    setUA(STALE_UA);
    const уровни = [0, 16383, 32767, 8192];   // первый — сброс базы
    let i = 0;
    mockBridge({ recLevel: () => уровни[Math.min(i++, уровни.length - 1)]! });
    const тики: Array<{ sec: number; level: number }> = [];
    const rec = await startRecording((sec, level) => тики.push({ sec, level }));
    expect((rec as any).metered).toBe(true);
    await new Promise((r) => setTimeout(r, 1600));   // три тика по 500 мс
    const note = await rec.stop();
    expect(note!.measured).toBe(true);
    expect(тики.some((т) => т.level > 0)).toBe(true);
    expect(note!.peak).toBeGreaterThan(0.4);          // 16383/32767 ≈ 0,5
    expect(note!.peak).toBeLessThanOrEqual(1);
  });

  it('тишина на живой записи видна: пик остаётся нулевым, но замер честный', async () => {
    setUA(STALE_UA);
    let первый = true;
    mockBridge({ recLevel: () => { if (первый) { первый = false; return 0; } return 0; } });
    const rec = await startRecording();
    expect((rec as any).metered).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    const note = await rec.stop();
    expect(note!.measured).toBe(true);               // мерили и знаем, что тихо
    expect(note!.peak).toBe(0);                      // ровно то, что видит человек
  });

  it('мост без recLevel: полоски нет и врать не начинаем', async () => {
    setUA(STALE_UA);
    mockBridge();                                     // recLevel отсутствует
    const rec = await startRecording();
    expect((rec as any).metered).toBe(false);
    const note = await rec.stop();
    expect(note!.measured).toBe(false);
    expect(note!.peak).toBe(0);
  });

  it('recLevel вернул −1 (запись не идёт) — путь считается неизмеримым', async () => {
    setUA(STALE_UA);
    mockBridge({ recLevel: () => -1 });
    const rec = await startRecording();
    expect((rec as any).metered).toBe(false);
    const note = await rec.stop();
    expect(note!.measured).toBe(false);
  });
});
