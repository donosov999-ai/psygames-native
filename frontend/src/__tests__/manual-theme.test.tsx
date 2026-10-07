import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

let mockProfile = 'chess';
let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('../contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: mockProfile } }) }));
jest.mock('../services/cosmetics', () => ({ getEquippedAccent: async () => null }));
jest.mock('react-native', () => ({ useColorScheme: () => mockScheme }));

let theme: ReturnType<typeof useTheme>;
function Probe() { theme = useTheme(); return null; }

describe('manual application theme', () => {
  beforeEach(async () => { await AsyncStorage.clear(); mockProfile = 'chess'; mockScheme = 'dark'; });
  it('light/dark override system and profile, persist and restore; system follows device', async () => {
    let root: renderer.ReactTestRenderer;
    await act(async () => { root = renderer.create(<ThemeProvider><Probe /></ThemeProvider>); });
    for (const mode of ['light', 'dark', 'system'] as const) {
      await act(async () => { theme.setThemeMode(mode); });
      expect(await AsyncStorage.getItem('psygames_theme_override')).toBe(mode);
      expect(theme.isDark).toBe(mode !== 'light');
    }
    mockScheme = 'light';
    await act(async () => { root!.update(<ThemeProvider><Probe /></ThemeProvider>); });
    expect(theme.isDark).toBe(false);
    await act(async () => { theme.setThemeMode('dark'); });
    mockProfile = 'free';
    await act(async () => { root!.update(<ThemeProvider><Probe /></ThemeProvider>); });
    expect(theme.isDark).toBe(true);
    await act(async () => { root!.unmount(); });
    await act(async () => { root = renderer.create(<ThemeProvider><Probe /></ThemeProvider>); });
    expect(theme.themeMode).toBe('dark');
    expect(theme.isDark).toBe(true);
    await act(async () => { theme.setThemeMode('profile'); });
    expect(await AsyncStorage.getItem('psygames_theme_override')).toBeNull();
    expect(theme.isDark).toBe(false);
    await act(async () => { root!.unmount(); });
  });
});
