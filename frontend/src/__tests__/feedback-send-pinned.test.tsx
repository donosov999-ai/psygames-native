/**
 * 🔴 «ОТПРАВИТЬ» НЕ УХОДИТ ПОД КЛАВИАТУРУ — ОНА ВНЕ ПРОКРУТКИ ЛИСТА (задача e780e5b0).
 *
 * Замер 07.10.2026, emulator-5570, 2.56.12: форма отзыва из нативной игры —
 * второй WebView на /feedback. При открытой клавиатуре «Отправить» стояла последней
 * в прокрутке и уходила под клавиатуру — виден был край кнопки. Тестировщик
 * «Релакс»: «окно жалоб падает вниз настолько сильно, что невозможно нажать
 * кнопку отправить». Здесь виджет монтируется: кнопки отправки во всех ветках
 * («Отправить», «это всё?», «немая запись») обязаны лежать вне ScrollView.
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { ScrollView } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
// jest.mock ниже поднимается над импортами — виджет получает заглушки.
import FeedbackWidget from '@/src/components/FeedbackWidget';

const отправлено: string[] = [];
/** Контекст последнего отправленного отчёта — для проверки параметров экрана. */
const mockКонтексты: any[] = [];
/** Параметры открытого экрана, которые отдаёт роутер (useGlobalSearchParams). */
let mockParams: Record<string, string | string[]> = {};

jest.mock('@/src/services/appFeedback', () => ({
  FEEDBACK_ENABLED: true,
  FEEDBACK_OPEN_EVENT: 'psygames-feedback-open',
  getDevChatVisible: () => Promise.resolve(true),
  captureScreenshot: () => Promise.resolve(null),
  sendFeedback: (a: any) => {
    отправлено.push(a.message);
    mockКонтексты.push(a.context);
    return Promise.resolve({ ok: true, queued: false, audioSent: false, audioLost: false });
  },
}));
// Микрофон в прогоне недоступен — ветка записи не участвует, судим ровно текст.
jest.mock('@/src/services/voiceNote', () => ({
  canRecord: () => false,
  startRecording: () => Promise.reject(new Error('нет микрофона')),
  shouldWarnSilent: () => false,
  staleWebViewMajor: () => null,
  SILENCE_PEAK: 0.02,
}));
jest.mock('@/src/services/feedbackDialog', () => ({ getMyDialog: () => Promise.resolve([]) }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/schulte', useGlobalSearchParams: () => mockParams }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee',
    border: '#ccc', text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'ru' }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
}));


type Renderer = TestRenderer.ReactTestRenderer;

async function settle(): Promise<void> {
  await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function текстВнутри(узел: any): string {
  const части: string[] = [];
  const обойти = (n: any): void => {
    if (typeof n === 'string') { части.push(n); return; }
    for (const c of n.children ?? []) обойти(c);
  };
  обойти(узел);
  return части.join(' ');
}

function кнопкиС(r: Renderer, ключ: string) {
  const виденные = new Set<unknown>();
  return r.root.findAll((n) => typeof n.props?.onPress === 'function'
    && n.props?.accessibilityRole === 'button' && текстВнутри(n).includes(ключ))
    .filter((n) => { if (виденные.has(n.props.onPress)) return false; виденные.add(n.props.onPress); return true; });
}

function внутриПрокрутки(n: any): boolean {
  for (let p = n.parent; p; p = p.parent) if (p.type === ScrollView) return true;
  return false;
}

function вОбластиОтправки(n: any): boolean {
  for (let p = n.parent; p; p = p.parent) if (p.props?.testID === 'feedback-send-area') return true;
  return false;
}

async function открыть(): Promise<Renderer> {
  let r!: Renderer;
  await TestRenderer.act(async () => { r = TestRenderer.create(<FeedbackWidget />); });
  await settle();
  const fab = r.root.findAll((n) => n.props?.accessibilityLabel === 'feedbackFabLabel' && typeof n.props?.onPress === 'function');
  await TestRenderer.act(async () => { fab[0].props.onPress(); });
  await settle();
  return r;
}

async function печатать(r: Renderer, s: string): Promise<void> {
  const поле = r.root.findAll((x) => typeof x.type === 'string' && typeof x.props?.onChangeText === 'function')[0]!;
  await TestRenderer.act(async () => { поле.props.onChangeText(s); });
}

describe('отправка закреплена под прокруткой листа', () => {
  it('«Отправить» — вне ScrollView, в закреплённом низу', async () => {
    const r = await открыть();
    await печатать(r, 'В судоку пропала подсветка цифр, когда выбираешь клетку с цифрой');
    const send = кнопкиС(r, 'send');
    expect(`кнопок «Отправить»: ${send.length}`).toBe('кнопок «Отправить»: 1');
    expect(внутриПрокрутки(send[0])).toBe(false);
    expect(вОбластиОтправки(send[0])).toBe(true);
  });

  it('развилка «это всё?» — её «отправить как есть» тоже вне прокрутки', async () => {
    const r = await открыть();
    await печатать(r, 'тест');
    const anyway = кнопкиС(r, 'voiceSendAnyway');
    expect(`кнопок «как есть»: ${anyway.length}`).toBe('кнопок «как есть»: 1');
    expect(внутриПрокрутки(anyway[0])).toBe(false);
    expect(вОбластиОтправки(anyway[0])).toBe(true);
  });
});

describe('«Что нового» не всплывает поверх формы отзыва', () => {
  it('на маршруте /feedback окно версий не рисуется', () => {
    const s = readFileSync(join(__dirname, '..', 'components', 'WhatsNewModal.tsx'), 'utf8');
    expect(s).toMatch(/window\.location\?\.pathname === '\/feedback'/);
    expect(s).toMatch(/if \(!visible \|\| onFeedbackPage\) return null;/);
  });
});
