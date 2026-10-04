import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WHATS_NEW, type WhatsNewEntry } from '../constants/whatsNew';
import { unreadReleaseNotes } from '../services/releaseNotes';
import WhatsNewModal from '../components/WhatsNewModal';
declare const __dirname: string;

jest.mock('expo-constants', () => ({ expoConfig: { version: '2.56.12' } }));
jest.mock('react-native', () => ({
  Modal: 'Modal', ScrollView: 'ScrollView', Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View',
  Platform: { OS: 'web' }, StyleSheet: { create: (v: unknown) => v },
}));
jest.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: {} }) }));
let mockLanguage = 'ru';
jest.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({
  language: mockLanguage, t: (key: string) => key,
}) }));
jest.mock('../services/a11y', () => ({ a11yModal: {} }));
jest.mock('../services/feedbackLoop', () => ({
  getMyFixedReports: async () => [], markShown: async () => {},
}));

const KEY = 'psygames_last_seen_version';
const entry = (version: string): WhatsNewEntry => ({ version, date: '2026-10-04', ru: [version], en: [version] });

describe('all skipped release notes', () => {
  test('2.56.9 → 2.56.12 includes all three updates, newest first', () => {
    expect(unreadReleaseNotes('2.56.12', '2.56.9').map((e) => e.version))
      .toEqual(['2.56.12', '2.56.11', '2.56.10']);
  });
  test('no cap across a much older installed version', () => {
    const history = Array.from({ length: 30 }, (_, n) => entry(`2.0.${n}`));
    expect(unreadReleaseNotes('2.0.29', '2.0.0', history)).toHaveLength(29);
  });
  test('sorts numerically, excludes future/already viewed and duplicate versions', () => {
    expect(unreadReleaseNotes('2.0.10', '2.0.8', ['2.0.9', '2.0.11', '2.0.10', '2.0.8', '2.0.9'].map(entry))
      .map((e) => e.version)).toEqual(['2.0.10', '2.0.9']);
  });
  test('same version and downgrade do not show a popup', () => {
    expect(unreadReleaseNotes('2.56.12', '2.56.12')).toEqual([]);
    expect(unreadReleaseNotes('2.56.11', '2.56.12')).toEqual([]);
  });
  test('first install leaves onboarding alone; corrupt old marker shows current only', () => {
    expect(unreadReleaseNotes('2.56.12', '')).toEqual([]);
    expect(unreadReleaseNotes('2.56.12', 'unknown').map((e) => e.version)).toEqual(['2.56.12']);
  });
  test('single popup belongs to app root, not a remounting Home screen', () => {
    const fs = require('fs');
    const path = require('path');
    const app = path.resolve(__dirname, '../../app');
    expect(fs.readFileSync(path.join(app, '_layout.tsx'), 'utf8').match(/<WhatsNewModal\s*\/>/g)).toHaveLength(1);
    expect(fs.readFileSync(path.join(app, 'index.tsx'), 'utf8')).not.toContain('WhatsNewModal');
  });
});

describe('real update notice and durable acknowledgement', () => {
  let root: renderer.ReactTestRenderer;
  beforeEach(async () => { await AsyncStorage.clear(); mockLanguage = 'ru'; });
  afterEach(async () => { if (root!) await act(async () => { root.unmount(); }); });
  const open = async () => { await act(async () => { root = renderer.create(<WhatsNewModal />); }); };
  const shownVersions = () => root.root.findAll((n) => n.type === ('View' as never) &&
    typeof n.props.testID === 'string' && n.props.testID.startsWith('release-notes-'))
    .map((n) => n.props.testID.replace('release-notes-', ''));

  test.each(['ru', 'en'])('all skipped descriptions appear in %s, acknowledgement survives reopen', async (language) => {
    mockLanguage = language;
    await AsyncStorage.setItem(KEY, '2.56.9');
    await open();
    expect(shownVersions()).toEqual(['2.56.12', '2.56.11', '2.56.10']);
    const text = JSON.stringify(root.toJSON());
    for (const v of ['2.56.12', '2.56.11', '2.56.10']) {
      const e = WHATS_NEW.find((it) => it.version === v)!;
      for (const line of language === 'ru' ? e.ru : e.en) expect(text).toContain(line);
    }
    expect(await AsyncStorage.getItem(KEY)).toBe('2.56.9');
    await act(async () => { await root.root.findByProps({ testID: 'whats-new-close' }).props.onPress(); });
    expect(await AsyncStorage.getItem(KEY)).toBe('2.56.12');
    expect(root.toJSON()).toBeNull();
    await act(async () => { root.unmount(); });
    await open();
    expect(root.toJSON()).toBeNull();
  });
  test('closing the app without acknowledgement repeats every unread update', async () => {
    await AsyncStorage.setItem(KEY, '2.56.10');
    await open();
    await act(async () => { root.unmount(); });
    await open();
    expect(shownVersions()).toEqual(['2.56.12', '2.56.11']);
  });
  test('Android Back dismisses without marking notes as read', async () => {
    await AsyncStorage.setItem(KEY, '2.56.11');
    await open();
    await act(async () => { root.root.findByType('Modal' as never).props.onRequestClose(); });
    expect(await AsyncStorage.getItem(KEY)).toBe('2.56.11');
  });
  test('fresh install stores baseline and does not display old change history', async () => {
    await open();
    expect(root.toJSON()).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).toBe('2.56.12');
  });
});
