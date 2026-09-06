/**
 * 🔴 В НЕЗАЩИЩЁННОМ КОНТЕКСТЕ ЗАПИСЬ ИДЁТ НАТИВНО, А НЕ ЧЕРЕЗ ВЕБ.
 *
 * 📍 ЗАМЕР 06.09.2026 по 105 голосовым заметкам в базе: 86 из них (82 %) —
 * цифровая тишина на −91 дБ. Делится это не по версии приложения, а по
 * УСТРОЙСТВУ: у устройств со старым идентификатором тишины 0 из 15, у устройств
 * с идентификатором вида `d-…` — 86 из 90, то есть 96 %.
 *
 * `d-` берётся тогда, когда нет `crypto.randomUUID`, а его нет ровно в
 * НЕЗАЩИЩЁННОМ контексте. Там же браузер калечит `getUserMedia`: разрешение
 * выдаёт, поток отдаёт, а в потоке нули. Немой микрофон и странный
 * идентификатор — ОДИН дефект, а не два.
 *
 * Прежнее условие нативного пути — «WebView старее Chrome 100» — этот случай не
 * покрывало: контекст бывает незащищённым и на свежем WebView.
 */
import { защищённыйКонтекст, startRecording } from '@/src/services/voiceNote';

/** Свежий WebView: по возрасту нативный путь НЕ полагается — решает только контекст. */
const СВЕЖИЙ_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36';

function поставитьUA(ua: string) {
  Object.defineProperty(globalThis.navigator, 'userAgent', { value: ua, configurable: true });
}

/** Мост с записью: считаем, какие его методы позвали. */
function мостСЗаписью() {
  const вызовы: string[] = [];
  (globalThis as { PsyNative?: unknown }).PsyNative = {
    micState: () => 'granted',
    requestMic: () => 'granted',
    startRec: () => { вызовы.push('startRec'); return 'ok'; },
    stopRec: () => { вызовы.push('stopRec'); return 'error:empty'; },
    cancelRec: () => { вызовы.push('cancelRec'); return 'ok'; },
    recLevel: () => 1200,
  };
  return вызовы;
}

describe('защищённый контекст', () => {
  const было = (globalThis as { isSecureContext?: boolean }).isSecureContext;
  afterEach(() => { (globalThis as { isSecureContext?: boolean }).isSecureContext = было; });

  it('читается как есть, когда движок его сообщает', () => {
    (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
    expect(защищённыйКонтекст()).toBe(true);
    (globalThis as { isSecureContext?: boolean }).isSecureContext = false;
    expect(защищённыйКонтекст()).toBe(false);
  });

  it('🔴 неизвестный считается защищённым — там решает возраст WebView', () => {
    // Иначе на движке, который поля не знает, мы бы уводили на нативный путь
    // ВСЕХ, включая тех, у кого веб пишет нормально, и потеряли бы уровень-индикатор.
    delete (globalThis as { isSecureContext?: boolean }).isSecureContext;
    expect(защищённыйКонтекст()).toBe(true);
  });
});

/**
 * 🔴 ПРИЗНАК В ОТЧЁТЕ. Без него класс дефектов неразличим в базе: «микрофон
 * молчит» и «идентификатор странный» выглядели как две разные беды полтора
 * месяца. Проба держит то, что признак вообще собирается.
 */
/**
 * 🔴 ПРОВЕРЯЕМ ПОВЕДЕНИЕ ЗАПИСИ, А НЕ ФУНКЦИЮ В ОДИНОЧКУ.
 *
 * Первая редакция этой пробы держала только `защищённыйКонтекст()` — и мутация
 * (убрать проверку контекста из `startRecording`) прошла мимо неё. Проба, не
 * трогающая тот путь, ради которого написана, зеленеет вслепую.
 */
describe('незащищённый контекст уводит запись на нативный путь', () => {
  const былUA = globalThis.navigator.userAgent;
  const былКонтекст = (globalThis as { isSecureContext?: boolean }).isSecureContext;
  afterEach(() => {
    поставитьUA(былUA);
    (globalThis as { isSecureContext?: boolean }).isSecureContext = былКонтекст;
    delete (globalThis as { PsyNative?: unknown }).PsyNative;
  });

  it('🔴 свежий WebView + НЕзащищённый контекст → идём нативно', async () => {
    поставитьUA(СВЕЖИЙ_UA);
    (globalThis as { isSecureContext?: boolean }).isSecureContext = false;
    const вызовы = мостСЗаписью();
    const rec = await startRecording();
    // Запись сама говорит, каким путём пошла — это и проверяем, а не побочный след.
    expect(rec.native).toBe(true);
    expect(вызовы).toContain('startRec');
    rec.cancel();
  });

  it('свежий WebView + защищённый контекст → нативно НЕ идём', async () => {
    поставитьUA(СВЕЖИЙ_UA);
    (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
    const вызовы = мостСЗаписью();
    // В защищённом контексте идём обычным путём, а он в jsdom без getUserMedia падает.
    await expect(startRecording()).rejects.toBeTruthy();
    expect(вызовы).not.toContain('startRec');
  });
});

declare const __dirname: string;
declare function require(m: string): { readFileSync: (p: string, e: string) => string };

describe('отчёт несёт признаки контекста', () => {
  it('в контексте отчёта есть secure_ctx, has_random_uuid и has_media_devices', () => {
    const fs = require('fs');
    const src = fs.readFileSync(`${__dirname}/../services/appFeedback.ts`, 'utf8');
    for (const поле of ['secure_ctx:', 'has_random_uuid:', 'has_media_devices:']) {
      expect(`${поле} ${src.includes(поле)}`).toBe(`${поле} true`);
    }
  });
});
