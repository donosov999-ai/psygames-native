/* psygames-whats-new-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 «ЧТО НОВОГО» ПОД ОБОЛОЧКОЙ ОТДАЁТ МОДЕЛЬ — ТЕ ЖЕ ЗАПИСИ, ЧТО РИСУЕТ САМ (задача 84df0687;
 * приём — `services/hostScreens.ts`).
 *
 * Модель: все записи `WHATS_NEW` по порядку, пункты — на языке человека (русский — `ru`, остальные —
 * `en`, как у разметки), подпись кнопки проверки — с текущей версией. «Проверить обновления» делает
 * оболочка (у сайта нет CORS для WebView), поэтому действие у страницы одно — «назад».
 * Образец модели — для проб Flutter (`flutter/test/fixtures/whats_new_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/whats-new',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    Stack: { Screen: () => null },
    router,
  };
});
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');   // eslint-disable-line @typescript-eslint/no-require-imports
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: { Consumer: ({ children }: any) => children(insets) },
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 390, height: 844 } },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { WHATS_NEW } = require('@/src/constants/whatsNew');
const { currentVersion } = require('@/src/services/appUpdates');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTE = '/whats-new';
const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.clearAllMocks();
});

async function смонтировать(language: string, host = true) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'nzt48');
  await AsyncStorage.setItem('language', language);
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', ROUTE];
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/whats-new').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen)))));
  });
  await TestRenderer.act(async () => {
    for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  return { sent, last };
}

describe('«Что нового» под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать('ru', false);
    expect(sent).toEqual([]);
  });

  it('🔴 все записи по порядку, пункты по-русски; кнопка — с текущей версией', async () => {
    const { last } = await смонтировать('ru');
    const m = last();
    expect(m.entries.map((e: any) => e.version)).toEqual(WHATS_NEW.map((e: any) => `v${e.version}`));
    expect(m.entries[0].items).toEqual(WHATS_NEW[0].ru);
    expect(m.entries[0].date).toBe(WHATS_NEW[0].date);
    expect(m.check).toContain(`v${currentVersion()}`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/whats_new_model.json');
    if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(m, null, 1)}\n`, 'utf8');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('🔴 не русский язык — пункты по-английски, как у разметки', async () => {
    const { last } = await смонтировать('de');
    expect(last().entries[0].items).toEqual(WHATS_NEW[0].en);
  });

  it('«назад» — goBackOrHome', async () => {
    await смонтировать('ru');
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE].back(); });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
