/* psygames-feedback-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 ФОРМА ОТЗЫВА ПОД ОБОЛОЧКОЙ: ДУМАЕТ ВИДЖЕТ, РИСУЕТ ОБОЛОЧКА (задача c092cd47; приём —
 * `services/hostScreens.ts`, окно `#feedback`).
 *
 * Виджет монтируется на настоящих провайдерах и хранилище; отправка, снимок, запись и диалог
 * подменены — живой inbox (`app_feedback`) этот прогон не трогает ни разу.
 *   Открытие оболочкой: экран-источник и снимок нативного экрана — её (`open(адрес, снимок)`), игра и
 *   уровень — по источнику; страница сама не снимается (под нативным экраном она устарела).
 *   Открытие страницей (кнопка, окно правил): снимок — страницы, как раньше.
 *   Под оболочкой своей шторки нет вовсе: поле в WebView поймало бы фокус и подняло клавиатуру.
 *   Нажатия — те же решения: вид, текст (с номером правки), снимок, вкладки, отправка с засовом,
 *   развилки «обрывок» и «немая запись», отказ отправки строкой модели (`alert` в WebView не виден).
 * Образец модели — для проб Flutter (`flutter/test/fixtures/feedback_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

const mockSend = jest.fn();
const mockPageShot = jest.fn();
const mockHostShot = jest.fn();
jest.mock('@/src/services/appFeedback', () => ({
  FEEDBACK_ENABLED: true,
  FEEDBACK_OPEN_EVENT: 'psygames-feedback-open',
  getDevChatVisible: () => Promise.resolve(true),
  captureScreenshot: () => mockPageShot(),
  shotFromHost: (url: string) => mockHostShot(url),
  sendFeedback: (a: unknown) => mockSend(a),
}));
let mockSilent = false;
const mockNote = { blob: { size: 4000 }, seconds: 4, mime: 'audio/webm', peak: 0.4, filePeak: 0.5, measured: true, track: null, source: 'raw', access: null, micGate: 'granted' };
let mockTick: ((sec: number, level: number) => void) | null = null;
jest.mock('@/src/services/voiceNote', () => ({
  canRecord: () => true,
  startRecording: (onTick: (sec: number, level: number) => void) => {
    mockTick = onTick;
    return Promise.resolve({ stop: () => Promise.resolve(mockNote), cancel: () => {} });
  },
  shouldWarnSilent: () => mockSilent,
  staleWebViewMajor: () => null,
  SILENCE_PEAK: 0.02,
}));
jest.mock('@/src/services/feedbackDialog', () => ({
  getMyDialog: () => Promise.resolve([
    { key: 'a', who: 'me', text: 'Не понял правила', at: '2026-10-06T12:30:00Z' },
    { key: 'b', who: 'dev', text: 'Починили', at: '2026-10-07T09:05:00Z', fixedIn: '2.56.15' },
  ]),
}));
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useGlobalSearchParams: () => ({}),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, canGoBack: () => false }),
}));
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return { useSafeAreaInsets: () => insets, SafeAreaProvider: ({ children }: any) => children };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { DeviceEventEmitter } = require('react-native');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTE = '#feedback';
const PID = 'nzt48';
const поднятые: any[] = [];
const ok = { ok: true, queued: false, audioSent: false, audioLost: false };

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', PID);
  await AsyncStorage.setItem('language', 'ru');
  await AsyncStorage.setItem(`psygames_schulte_level_${PID}`, '7');
  mockSilent = false;
  mockTick = null;
  mockSend.mockReset().mockResolvedValue(ok);
  mockPageShot.mockReset().mockResolvedValue({ size: 10, from: 'page' });
  mockHostShot.mockReset().mockImplementation((url: string) => Promise.resolve({ size: 20, from: url }));
});
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.useRealTimers();
});

const осесть = async () => {
  await TestRenderer.act(async () => {
    for (let i = 0; i < 12; i += 1) { jest.advanceTimersByTime(5); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
};

async function смонтировать(host = true) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', ROUTE];
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Widget = require('@/src/components/FeedbackWidget').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Widget)))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  const act = async (name: string, ...args: any[]) => {
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE][name](...args); });
    await осесть();
  };
  return { r, sent, last, act };
}

const поля = (r: any) => r.root.findAll((x: any) => typeof x.type === 'string' && typeof x.props?.onChangeText === 'function');

describe('Форма отзыва под оболочкой', () => {
  it('без оболочки модели нет, шторка своя', async () => {
    const { r, sent } = await смонтировать(false);
    await TestRenderer.act(async () => { DeviceEventEmitter.emit('psygames-feedback-open'); });
    await осесть();
    expect(sent).toEqual([]);
    expect(поля(r).length).toBe(1);
  });

  it('🔴 оболочка открыла с нативного экрана: источник и снимок — её, игра и уровень — по источнику', async () => {
    const { r, last, act } = await смонтировать();
    expect(last().open).toBe(false);
    await act('open', '/games/schulte?mode=levels', '/__psy_shot/1.png');
    const m = last();
    expect(m.open).toBe(true);
    expect(mockHostShot).toHaveBeenCalledWith('/__psy_shot/1.png');
    expect(mockPageShot).not.toHaveBeenCalled();
    expect(m.form.ctx).toContain('🎮 schulte');
    expect(m.form.ctx).toContain('7');
    expect(m.form.shot.on).toBe(true);
    expect(m.form.kinds.map((k: any) => k.key)).toEqual(['confusion', 'bug', 'idea']);
    expect(m.form.kinds[0].on).toBe(true);
    expect(m.form.voice.button.icon).toBe('mic-outline');
    expect(m.footer).toEqual(expect.objectContaining({ mode: 'send', enabled: false }));
    // Своей шторки под оболочкой нет: поле в WebView поймало бы фокус и подняло клавиатуру.
    expect(поля(r).length).toBe(0);
    await act('text', 'В таблице Шульте не видно последней цифры на маленьком экране', 3);
    await act('kind', 'bug');
    expect(last().form.text).toContain('Шульте');
    expect(last().form.textSeq).toBe(3);
    expect(last().form.kinds[1].on).toBe(true);
    expect(last().footer.enabled).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/feedback_model.json');
    if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(last(), null, 1)}\n`, 'utf8');
    expect(fs.existsSync(file)).toBe(true);

    await act('send');
    expect(mockSend).toHaveBeenCalledTimes(1);
    const a = mockSend.mock.calls[0][0];
    expect(a.screen).toBe('/games/schulte');
    expect(a.gameId).toBe('schulte');
    expect(a.kind).toBe('bug');
    expect(a.shot).toEqual({ size: 20, from: '/__psy_shot/1.png' });
    expect(a.context.level).toBe(7);
    expect(a.context.route_params).toEqual(expect.objectContaining({ mode: 'levels' }));
    expect(last().thanks.icon).toBe('🙏');
    expect(last().form).toBe(null);
    await TestRenderer.act(async () => { jest.advanceTimersByTime(3300); });
    await осесть();
    expect(last().open).toBe(false);
  });

  it('открыла страница (кнопка, окно правил): снимок — страницы, источник — её адрес', async () => {
    const { last } = await смонтировать();
    await TestRenderer.act(async () => { DeviceEventEmitter.emit('psygames-feedback-open'); });
    await осесть();
    expect(last().open).toBe(true);
    expect(mockPageShot).toHaveBeenCalledTimes(1);
    expect(mockHostShot).not.toHaveBeenCalled();
    expect(last().form.ctx).not.toContain('🎮');
  });

  it('🔴 два «Отправить» подряд — один отчёт; снимок можно снять; без снимка — без снимка', async () => {
    let done!: (v: unknown) => void;
    mockSend.mockImplementation(() => new Promise((res) => { done = res; }));
    const { last, act } = await смонтировать();
    await act('open', '/statistics', '/__psy_shot/2.png');
    await act('attach');
    expect(last().form.shot.on).toBe(false);
    await act('text', 'Прогресс за неделю не совпадает с календарём', 1);
    await act('send');
    expect(last().footer.sending).toBe(true);
    await act('send');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].shot).toBe(null);
    expect(mockSend.mock.calls[0][0].screen).toBe('/statistics');
    await TestRenderer.act(async () => { done(ok); });
    await осесть();
    expect(last().thanks).not.toBe(null);
  });

  it('🔴 отказ отправки — строкой модели, текст не теряется; «закрыть» — окно закрыто', async () => {
    mockSend.mockResolvedValue({ ok: false, queued: false, audioSent: false, audioLost: false });
    const alert = jest.fn();
    (globalThis as any).alert = alert;
    const { last, act } = await смонтировать();
    await act('open', '/', null);
    await act('text', 'Главная пустая после обновления', 1);
    await act('send');
    expect(alert).not.toHaveBeenCalled();
    expect(typeof last().error).toBe('string');
    expect(last().error.length).toBeGreaterThan(3);
    expect(last().form.text).toBe('Главная пустая после обновления');
    await act('clearError');
    expect(last().error).toBe(null);
    await act('close');
    expect(last().open).toBe(false);
  });

  it('🔴 обрывок — развилка вместо «Отправить»; «всё равно» отправляет', async () => {
    const { last, act } = await смонтировать();
    await act('open', '/', null);
    await act('text', 'I', 1);
    expect(last().footer).toEqual(expect.objectContaining({ mode: 'choice' }));
    expect(last().footer.keep.action).toBe('focus');
    expect(last().footer.go.action).toBe('sendShort');
    await act('send');
    expect(mockSend).not.toHaveBeenCalled();
    await act('sendShort');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].message).toBe('I');
  });

  it('🔴 голос: запись с живым уровнем, заметка с прослушиванием; немая — развилка и «как есть»', async () => {
    const { last, act } = await смонтировать();
    await act('open', '/', null);
    await act('record');
    await TestRenderer.act(async () => { mockTick?.(4, 0.3); });
    await осесть();
    let v = last().form.voice;
    expect(v.button.icon).toBe('stop-circle');
    expect(v.level.frac).toBeCloseTo(0.42);
    expect(v.levelText.color).toBe('#22c55e');
    mockSilent = true;
    await act('record');
    v = last().form.voice;
    expect(v.button.icon).toBe('alert-circle');
    expect(v.play).not.toBe(null);
    expect(last().footer.mode).toBe('choice');
    expect(last().footer.go.action).toBe('sendSilent');
    await act('sendSilent');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].audio.silentAck).toBe(true);
  });

  it('вкладка «Диалог» — лента с ответом-починкой; «Написать» возвращает форму', async () => {
    const { last, act } = await смонтировать();
    await act('open', '/', null);
    await act('tab', 'dialog');
    const d = last().dialog;
    expect(d.loading).toBe(false);
    expect(d.bubbles.map((b: any) => b.me)).toEqual([true, false]);
    expect(d.bubbles[1].fixed).toContain('2.56.15');
    expect(d.bubbles[0].at).toBe('2026-10-06 12:30');
    expect(last().footer).toBe(null);
    await act('tab', 'form');
    expect(last().form).not.toBe(null);
  });
});
