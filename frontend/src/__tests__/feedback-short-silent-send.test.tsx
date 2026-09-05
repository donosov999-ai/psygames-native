/**
 * ОБРЫВОК НЕ СМЕЕТ УЙТИ МОЛЧА — ПРОВЕРКА ПОВЕДЕНИЕМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА.
 *
 * Рядом уже лежит `feedback-too-short.test.ts`, и он проверяет ФУНКЦИЮ порога
 * плюс наличие строк `askShort` / `submit(false, true)` в тексте виджета. Такая
 * проверка зеленеет от одного присутствия слов и не отвечает на единственный
 * важный вопрос: МОЖЕТ ЛИ обрывок доехать до `sendFeedback` без вопроса
 * человеку. Здесь виджет монтируется и на него нажимают.
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';

const отправлено: string[] = [];

jest.mock('@/src/services/appFeedback', () => ({
  FEEDBACK_ENABLED: true,
  FEEDBACK_OPEN_EVENT: 'psygames-feedback-open',
  getDevChatVisible: () => Promise.resolve(true),
  captureScreenshot: () => Promise.resolve(null),
  sendFeedback: (a: any) => {
    отправлено.push(a.message);
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
jest.mock('expo-router', () => ({ usePathname: () => '/games/schulte' }));
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

import FeedbackWidget from '@/src/components/FeedbackWidget';

type Renderer = TestRenderer.ReactTestRenderer;

/** Дать промисам внутри обработчиков доиграть — открытие шторки асинхронно. */
async function settle(): Promise<void> {
  await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

/**
 * ⚠️ ОДНА КНОПКА — ОДИН СЧЁТ. `TouchableOpacity` видна в дереве дважды: своим
 * композитом и узлом под ним, пропсы у обоих одни и те же. Считать их за две
 * кнопки значит мерить дерево, а не интерфейс, поэтому схлопываем по САМОМУ
 * обработчику: один и тот же `onPress` — одна и та же кнопка.
 */
function уникальные(узлы: any[]): any[] {
  const виденные = new Set<unknown>();
  return узлы.filter((n) => {
    if (виденные.has(n.props.onPress)) return false;
    виденные.add(n.props.onPress);
    return true;
  });
}

function byLabel(r: Renderer, label: string) {
  return уникальные(r.root.findAll((n) => n.props?.accessibilityLabel === label
    && typeof n.props?.onPress === 'function'));
}

/**
 * Весь текст внутри узла. Идём по `children` дерева, а не по `props.children`:
 * пропсы хостового узла держат ссылки назад и на них падает любой обход.
 */
function текстВнутри(узел: any): string {
  const части: string[] = [];
  const обойти = (n: any): void => {
    if (typeof n === 'string') { части.push(n); return; }
    for (const c of n.children ?? []) обойти(c);
  };
  обойти(узел);
  return части.join(' ');
}

/** Кнопки с ролью «button», подпись которых содержит ключ перевода. */
function кнопкиС(r: Renderer, ключ: string) {
  return уникальные(r.root.findAll((n) => typeof n.props?.onPress === 'function'
    && n.props?.accessibilityRole === 'button'
    && текстВнутри(n).includes(ключ)));
}

/** Кнопка «Отправить» — та, что несёт подпись `send` (ключ перевода). */
const кнопкаОтправить = (r: Renderer) => кнопкиС(r, 'send');
/** Кнопка «отправить как есть» из развилки. */
const кнопкаВсёРавно = (r: Renderer) => кнопкиС(r, 'voiceSendAnyway');

function поле(r: Renderer) {
  const n = r.root.findAll((x) => typeof x.type === 'string'
    && typeof x.props?.onChangeText === 'function');
  expect(`полей ввода: ${n.length}`).toBe('полей ввода: 1');
  return n[0]!;
}

async function печатать(r: Renderer, s: string): Promise<void> {
  await TestRenderer.act(async () => { поле(r).props.onChangeText(s); });
}

/** Нажать плавающую кнопку — открыть шторку отзыва. */
async function открытьСнова(r: Renderer): Promise<void> {
  const fab = byLabel(r, 'feedbackFabLabel');
  expect(`плавающих кнопок: ${fab.length}`).toBe('плавающих кнопок: 1');
  await TestRenderer.act(async () => { fab[0].props.onPress(); });
  await settle();
}

async function открыть(): Promise<Renderer> {
  let r!: Renderer;
  await TestRenderer.act(async () => { r = TestRenderer.create(React.createElement(FeedbackWidget)); });
  await settle();
  await открытьСнова(r);
  return r;
}

describe('обрывок в живом виджете', () => {
  // Шторка «спасибо» закрывается по таймеру — без поддельных часов прогон
  // держит его открытым и jest не выходит.
  beforeAll(() => { jest.useFakeTimers(); });
  afterAll(() => { jest.useRealTimers(); });
  beforeEach(() => { отправлено.length = 0; });

  it('🔴 «I» с первого нажатия НЕ уезжает — вместо кнопки развилка', async () => {
    const r = await открыть();
    await печатать(r, 'I');
    expect(`кнопок «Отправить»: ${кнопкаОтправить(r).length}`).toBe('кнопок «Отправить»: 0');
    expect(`развилок: ${кнопкаВсёРавно(r).length}`).toBe('развилок: 1');
    expect(отправлено).toEqual([]);
  });

  it('🔴 согласие «отправить как есть» довозит обрывок — запрета нет', async () => {
    const r = await открыть();
    await печатать(r, 'I');
    await TestRenderer.act(async () => { кнопкаВсёРавно(r)[0].props.onPress(); });
    await settle();
    expect(отправлено).toEqual(['I']);
  });

  /**
   * 🔴 ГЛАВНОЕ, И ИМЕННО ЭТО СЛУЧИЛОСЬ ЖИВЬЁМ. Согласие даётся ОДНОМУ
   * сообщению, а не виджету навсегда. Тестировщик пишет отчёты подряд, не
   * закрывая приложение: в базе у одного устройства их десятки за вечер.
   * Стоит один раз согласиться «отправить как есть» — и если флаг согласия
   * не снять, каждый следующий обрывок уезжает МОЛЧА, без вопроса.
   */
  it('🔴 согласие не переносится на СЛЕДУЮЩИЙ отчёт', async () => {
    const r = await открыть();
    await печатать(r, 'I');
    await TestRenderer.act(async () => { кнопкаВсёРавно(r)[0].props.onPress(); });
    await settle();
    expect(отправлено).toEqual(['I']);

    // Тот же сеанс, следующий отчёт: человек снова жмёт плавающую кнопку.
    await открытьСнова(r);
    await печатать(r, 'The');

    // Жмём то, что виджет ПРЕДЛАГАЕТ. Спросил — уедет ноль; промолчал — уедет «The».
    const обычная = кнопкаОтправить(r);
    if (обычная.length) await TestRenderer.act(async () => { обычная[0].props.onPress(); });
    await settle();

    expect(`развилок на втором обрывке: ${кнопкаВсёРавно(r).length}`)
      .toBe('развилок на втором обрывке: 1');
    expect(`уехало без вопроса: ${отправлено.slice(1).join(',') || '—'}`)
      .toBe('уехало без вопроса: —');
  });

  /**
   * 🔴 ТОТ ЖЕ ОБРЫВОК ВТОРОЙ РАЗ. В базе «I» лежит ПЯТЬ раз, и это не выдумка
   * ради полноты: согласие, привязанное к тексту, обязано умереть вместе со
   * своим сообщением, иначе повтор совпадёт с уже одобренной строкой и пройдёт
   * молча — ровно тем же путём, каким прошли эти пять.
   */
  it('🔴 повтор ТОГО ЖЕ обрывка спрашивает заново', async () => {
    const r = await открыть();
    await печатать(r, 'I');
    await TestRenderer.act(async () => { кнопкаВсёРавно(r)[0].props.onPress(); });
    await settle();

    await открытьСнова(r);
    await печатать(r, 'I');
    const обычная = кнопкаОтправить(r);
    if (обычная.length) await TestRenderer.act(async () => { обычная[0].props.onPress(); });
    await settle();

    expect(`развилок на повторе: ${кнопкаВсёРавно(r).length}`).toBe('развилок на повторе: 1');
    expect(`уехало без вопроса: ${отправлено.slice(1).join(',') || '—'}`)
      .toBe('уехало без вопроса: —');
  });

  /**
   * 🔴 ДРОГНУВШИЙ ПАЛЕЦ — НЕ ДВА ОТЧЁТА. Засов отправки лежал в состоянии, а оно
   * до перерисовки не меняется: два тапа подряд читали `sending === false` оба и
   * уезжали двумя строками. Замер по боевой базе (402 строки): две пары «тот же
   * текст, то же устройство» с разницей 0,47 и 0,32 секунды — за треть секунды
   * второй отчёт не пишут. Обе пары голосовые, то есть это ещё и вторая заливка
   * того же файла.
   */
  it('🔴 два тапа подряд дают ОДИН отчёт, а не два', async () => {
    const r = await открыть();
    await печатать(r, 'Кнопка выхода не нажимается совсем');
    const send = кнопкаОтправить(r);
    expect(`кнопок «Отправить»: ${send.length}`).toBe('кнопок «Отправить»: 1');
    // Оба нажатия ДО перерисовки — спиннера человек ещё не видит.
    await TestRenderer.act(async () => { send[0].props.onPress(); send[0].props.onPress(); });
    await settle();
    expect(`отправок за два тапа: ${отправлено.length}`).toBe('отправок за два тапа: 1');
  });
});
