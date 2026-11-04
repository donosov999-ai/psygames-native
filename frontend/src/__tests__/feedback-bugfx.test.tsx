import React from 'react';
import TestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FeedbackWidget from '@/src/components/FeedbackWidget';

let mockPath = '/';
let mockVisible = true;
let mockHosted = false;
const mockCapture = jest.fn();
const mockSend = jest.fn();
const mockInsets = { top: 44, bottom: 34, left: 0, right: 0 };

// Изолируем UI: ни network/API, ни чужие изменяемые hooks не участвуют.
jest.mock('@/src/hooks/useScreenWidth', () => ({ useScreenSize: () => ({ w: 320, h: 568 }) }));
jest.mock('@/src/services/appFeedback', () => ({
  FEEDBACK_ENABLED: true,
  FEEDBACK_OPEN_EVENT: 'test-feedback-open',
  getDevChatVisible: () => Promise.resolve(mockVisible),
  captureScreenshot: () => mockCapture(),
  shotFromHost: () => Promise.resolve(null),
  sendFeedback: (...args: unknown[]) => mockSend(...args),
}));
jest.mock('@/src/services/voiceNote', () => ({
  canRecord: () => false, shouldWarnSilent: () => false,
  staleWebViewMajor: () => null, SILENCE_PEAK: 0.02,
}));
jest.mock('@/src/services/feedbackDialog', () => ({
  dialogStatusLabel: jest.requireActual('@/src/services/feedbackDialog').dialogStatusLabel, getMyDialog: () => Promise.resolve([]) }));
jest.mock('@/src/services/pet', () => ({ DEVCHAT_VISIBLE_EVENT: 'test-devchat-visible' }));
jest.mock('@/src/services/hostScreens', () => ({
  hostDrawsScreen: () => mockHosted,
  postScreenModel: () => {},
  registerScreenActions: () => () => {},
}));
jest.mock('@/src/services/feedbackGameState', () => ({
  параметрыЭкранаДляОтзыва: () => ({}), publishFeedbackGameState: () => {},
}));
jest.mock('@/src/services/crumbs', () => ({ pushCrumb: () => {} }));
jest.mock('@/src/services/gamePause', () => ({ holdGame: () => () => {} }));
jest.mock('expo-router', () => ({ usePathname: () => mockPath, useGlobalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee', border: '#ccc',
    text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k === 'feedbackFabLabel' ? 'Send feedback' : k, language: 'en' }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'p1', display_name: 'Tester' } }),
}));

const renderers: TestRenderer.ReactTestRenderer[] = [];
async function mount() {
  let r!: TestRenderer.ReactTestRenderer;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(<FeedbackWidget />);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  renderers.push(r);
  return r;
}

function button(r: TestRenderer.ReactTestRenderer) {
  return r.root.findAll((n) => n.props.testID === 'feedback-fab' && typeof n.props.onPress === 'function')[0];
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((c) => typeof c === 'string' ? c : textOf(c)).join('');
}

beforeEach(async () => {
  mockPath = '/';
  mockVisible = true;
  mockHosted = false;
  mockCapture.mockReset().mockResolvedValue(null);
  mockSend.mockReset();
  await AsyncStorage.clear();
});
afterEach(() => {
  for (const r of renderers.splice(0)) TestRenderer.act(() => r.unmount());
  expect(mockSend).not.toHaveBeenCalled();
});

it.each(['/', '/games/hanoi', '/games/leftover-web'])('%s: visible bugFX + bug, not a chat-only button', async (route) => {
  mockPath = route;
  const r = await mount();
  const fab = button(r)!;
  expect(fab.props.accessibilityLabel).toBe('Send feedback');
  const label = fab.findAll((n) => n.props.testID === 'feedback-fab-label')[0];
  expect(textOf(label)).toBe('bugFX');
  expect(label.props.maxFontSizeMultiplier).toBe(2);
  expect(fab.findAll((n) => String(n.type) === 'Ionicons' && n.props.name === 'bug-outline')).toHaveLength(1);
  expect(fab.findAll((n) => n.props.name?.includes('chatbubble'))).toHaveLength(0);
  const style = StyleSheet.flatten(fab.props.style);
  expect(style.width).toBeGreaterThanOrEqual(48);
  expect(style.height).toBeGreaterThanOrEqual(48);
});

it('tap still opens the existing form and label stays visible during capture', async () => {
  let finish!: (value: null) => void;
  mockCapture.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const r = await mount();
  await TestRenderer.act(async () => { button(r)!.props.onPress(); });
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(textOf(button(r)!.findAll((n) => n.props.testID === 'feedback-fab-label')[0])).toBe('bugFX');
  await TestRenderer.act(async () => {
    finish(null);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  expect(r.root.findAll((n) => typeof n.type === 'string' && typeof n.props.onChangeText === 'function')).toHaveLength(1);
});

it('visibility setting hides the whole button; live setting event restores bugFX', async () => {
  mockVisible = false;
  const r = await mount();
  expect(button(r)).toBeUndefined();
  await TestRenderer.act(async () => { DeviceEventEmitter.emit('test-devchat-visible', true); });
  expect(textOf(button(r)!.findAll((n) => n.props.testID === 'feedback-fab-label')[0])).toBe('bugFX');
  await TestRenderer.act(async () => { DeviceEventEmitter.emit('test-devchat-visible', false); });
  expect(button(r)).toBeUndefined();
});

it('hosted leftover web game still renders bugFX, without changing form ownership', async () => {
  mockHosted = true;
  mockPath = '/games/leftover-web';
  const r = await mount();
  expect(button(r)).toBeDefined();
  expect(r.root.findAll((n) => typeof n.type === 'string' && typeof n.props.onChangeText === 'function')).toHaveLength(0);
});

it('saved position remains within small-screen safe bounds with the same 48px footprint', async () => {
  await AsyncStorage.setItem('psygames_feedback_fab_spot', '{"fx":1,"fy":1}');
  const r = await mount();
  const wrap = button(r)!.parent!;
  const style = StyleSheet.flatten(wrap.props.style);
  expect(style.left).toBeGreaterThanOrEqual(mockInsets.left + 6);
  expect(style.top).toBeGreaterThanOrEqual(mockInsets.top + 6);
  expect(style.left + style.width).toBeLessThanOrEqual(320 - mockInsets.right - 6);
  expect(style.top + style.height).toBeLessThanOrEqual(568 - mockInsets.bottom - 6);
  expect(await AsyncStorage.getItem('psygames_feedback_fab_spot')).toBe('{"fx":1,"fy":1}');
});
