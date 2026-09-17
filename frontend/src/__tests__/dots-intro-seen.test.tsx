/* psygames-dots-intro-seen · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача d952c080, отчёт 96ea896d */
/**
 * «СОЕДИНИ ТОЧКИ»: ПРАВИЛА И ТРЕНИРОВКА САМИ — ТОЛЬКО В ПЕРВЫЙ РАЗ ПО ПРОФИЛЮ.
 *
 * 📍 ПОВОД. Отчёт 96ea896d (17.09.2026, 2.54.17, iPhone 411×873, «Соедини точки», уровень 13):
 * «тренировку показывает при каждом запуске — надо, чтобы только первые запуски». Экран вёл
 * через правила на первом «Начать» за ЗАХОД и на каждом автостарте из зарядки.
 *
 * Проба проверяет ПРОВОДКУ ЭКРАНА: что экран отдаёт модулю (`skipIntro`) и что делает с его
 * сообщением `onProgress(true)` — первым ходом в партии. Модуль подменён узлом с настоящими
 * пропами: как модуль рисует правила по `skipIntro`, сторожат его собственные пробы.
 */
import React from 'react';
import DotsScreen from '@/app/games/dots-connect';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', bg: '#000', text: '#fff', textSecondary: '#999', card: '#222', border: '#333', primary: '#7c6cf0', surface: '#111', success: '#0c0', error: '#c00', warning: '#fa0' }, isDark: true }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
let mockProfileId = 'dots-intro-0';
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: mockProfileId } }) }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, PAD_H: 16, default: ({ children }: any) => React.createElement(View, null, children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/LevelProgressMap', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/LevelCleared', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/GameResult', () => ({ __esModule: true, default: () => null }));
/** Модуль — узел с настоящими пропами: `skipIntro` видно, `onProgress` зовётся тем, что позвал бы модуль. */
jest.mock('@/src/games/dots-connect/DotsConnectGame', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { __esModule: true, default: (p: any) => React.createElement('DotsConnectGame', p) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const хранилище = require('@react-native-async-storage/async-storage');
const AsyncStorage = хранилище.default ?? хранилище;

const деревья: any[] = [];
afterEach(async () => {
  mockParams = {};
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => { try { д.unmount(); } catch { /* снят */ } }); });
});

async function дождаться(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
}
function текст(дерево: any): string {
  const acc: string[] = [];
  const walk = (n: any) => {
    if (n == null || n === false) return;
    if (typeof n === 'string') { acc.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) walk(n.children);
  };
  walk(дерево.toJSON());
  return acc.join(' ');
}
function нажать(дерево: any, подпись: string): void {
  const узел = дерево.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && n.findAll((m: any) => m.props?.children === подпись).length > 0)[0];
  if (!узел) throw new Error(`нет нажимаемого «${подпись}»; на экране: ${текст(дерево).slice(0, 300)}`);
  TestRenderer.act(() => { узел.props.onPress(); });
}
const модуль = (д: any) => д.root.findAll((n: any) => n.type === 'DotsConnectGame')[0] ?? null;

let номер = 0;
const новыйПрофиль = () => { номер += 1; return `dots-seen-${номер}`; };
async function экранПрофиля(профиль: string): Promise<any> {
  mockProfileId = профиль;
  let д: any;
  await TestRenderer.act(async () => { д = TestRenderer.create(React.createElement(DotsScreen)); });
  деревья.push(д);
  await дождаться();
  return д;
}
async function снять(д: any): Promise<void> {
  await TestRenderer.act(async () => { д.unmount(); });
  деревья.splice(деревья.indexOf(д), 1);
}
/** «Начать» и первый ход в партии — так модуль сообщает, что в партии есть что терять. */
async function начатьИСходить(д: any): Promise<void> {
  нажать(д, 'start');
  await дождаться();
  await TestRenderer.act(async () => { модуль(д).props.onProgress(true); });
  await дождаться();
}

describe('«Соедини точки»: знакомство само — только в первый раз по профилю (отчёт 96ea896d)', () => {
  it('новый профиль: первый «Начать» — через знакомство, двери «Как играть» до него нет', async () => {
    const д = await экранПрофиля(новыйПрофиль());
    expect(текст(д)).not.toContain('btn_help');
    нажать(д, 'start');
    await дождаться();
    expect(`skipIntro ${модуль(д).props.skipIntro}`).toBe('skipIntro false');
  });

  it('🔴 после хода в партии новый заход — сразу партия, дверь «Как играть» видна до «Начать» и ведёт в знакомство', async () => {
    const профиль = новыйПрофиль();
    const д1 = await экранПрофиля(профиль);
    await начатьИСходить(д1);
    await снять(д1);

    const д2 = await экранПрофиля(профиль);
    expect(текст(д2)).toContain('btn_help');
    нажать(д2, 'start');
    await дождаться();
    expect(`skipIntro ${модуль(д2).props.skipIntro}`).toBe('skipIntro true');
    await снять(д2);

    const д3 = await экранПрофиля(профиль);
    нажать(д3, 'btn_help');
    await дождаться();
    expect(`skipIntro ${модуль(д3).props.skipIntro}`).toBe('skipIntro false');
  });

  it('«Начать» без хода и выход — знакомство не засчитано', async () => {
    const профиль = новыйПрофиль();
    const д1 = await экранПрофиля(профиль);
    нажать(д1, 'start');
    await дождаться();
    await снять(д1);
    const д2 = await экранПрофиля(профиль);
    нажать(д2, 'start');
    await дождаться();
    expect(`skipIntro ${модуль(д2).props.skipIntro}`).toBe('skipIntro false');
  });

  it('другой профиль на том же телефоне — снова знакомство', async () => {
    const д1 = await экранПрофиля(новыйПрофиль());
    await начатьИСходить(д1);
    await снять(д1);
    const д2 = await экранПрофиля(новыйПрофиль());
    нажать(д2, 'start');
    await дождаться();
    expect(`skipIntro ${модуль(д2).props.skipIntro}`).toBe('skipIntro false');
  });

  it('🔴 запуск из зарядки (автостарт): прошедший знакомство — сразу партия; новый профиль — знакомство', async () => {
    const профиль = новыйПрофиль();
    const д1 = await экранПрофиля(профиль);
    await начатьИСходить(д1);
    await снять(д1);

    mockParams = { auto: '1' };
    const д2 = await экранПрофиля(профиль);
    await дождаться();
    expect(`модуль ${Boolean(модуль(д2))}, skipIntro ${модуль(д2)?.props.skipIntro}`).toBe('модуль true, skipIntro true');
    await снять(д2);

    const д3 = await экранПрофиля(новыйПрофиль());
    await дождаться();
    expect(`модуль ${Boolean(модуль(д3))}, skipIntro ${модуль(д3)?.props.skipIntro}`).toBe('модуль true, skipIntro false');
  });

  it('у кого уже пройдены уровни (обновились с прошлой версии), знакомство само не показывается', async () => {
    const профиль = новыйПрофиль();
    await AsyncStorage.setItem(`psygames_dots_connect_level_${профиль}`, '13');
    const д = await экранПрофиля(профиль);
    await дождаться();
    expect(текст(д)).toContain('btn_help');
    нажать(д, 'start');
    await дождаться();
    expect(`skipIntro ${модуль(д).props.skipIntro}`).toBe('skipIntro true');
  });
});
