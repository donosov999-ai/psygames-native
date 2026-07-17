import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useProfile } from './ProfileContext';
import type { ProfileId } from '@/src/constants/profiles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getEquippedAccent } from '@/src/services/cosmetics';

interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  success: string;
  error: string;
  warning: string;
}

const lightTheme: ThemeColors = {
  background: '#F5F5F7',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#6E6E73',
  primary: '#007AFF',
  border: '#E5E5EA',
  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',
};

const darkTheme: ThemeColors = {
  background: '#000000',
  surface: '#1C1C1E',
  card: '#2C2C2E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  primary: '#0A84FF',
  border: '#38383A',
  success: '#30D158',
  error: '#FF453A',
  warning: '#FF9F0A',
};

/**
 * v1.21.0: тема под профиль.
 * mood = база (тёмная для биохакеров/профи, светлая для масс-аудитории),
 * accent = курированный акцент (НЕ profile.color напрямую — у части профилей
 * color это тёмный UI-цвет, невидимый как accent, напр. Шахматист #1f2937).
 */
/** Общий на всё приложение, НЕ на профиль: выбор темы не должен слетать при смене профиля. */
const THEME_OVERRIDE_KEY = 'psygames_theme_override';

const PROFILE_THEME: Record<ProfileId, { mood: 'dark' | 'light'; accent: string }> = {
  nzt48:     { mood: 'light', accent: '#a855f7' }, // фиолетовый (светлая тема — по запросу Дениса)
  execs:     { mood: 'dark',  accent: '#14b8a6' }, // teal (ярче для видимости)
  drivers:   { mood: 'dark',  accent: '#f97316' }, // оранжевый
  chess:     { mood: 'dark',  accent: '#eab308' }, // золото (а не тёмный графит)
  odv999:    { mood: 'dark',  accent: '#fbbf24' }, // янтарь (владелец)
  women:     { mood: 'light', accent: '#ec4899' }, // роза — мягкий светлый
  kids:      { mood: 'light', accent: '#10b981' }, // сочный зелёный — игровой
  seniors:   { mood: 'light', accent: '#7c3aed' }, // спокойный фиолет, высокий контраст
  students:  { mood: 'light', accent: '#f97316' }, // свежий оранж
  vasilyeva: { mood: 'light', accent: '#0ea5e9' }, // небесно-синий
  free:      { mood: 'light', accent: '#f59e0b' }, // приветливый янтарь
  polyglot:  { mood: 'light', accent: '#6366f1' }, // индиго — изучающие языки
};

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  colors: ThemeColors;
  /** true = текущая тема задана профилем (нет ручного override). */
  themeFromProfile: boolean;
  /** A1: колор-блайнд режим — игры с цвет-идентичностью (WCST, Башня) берут Okabe-Ito палитру. */
  colorblind: boolean;
  setColorblind: (v: boolean) => void;
  /** Косметика: hex надетого акцента (override профильного), null = профильный. */
  cosmeticAccent: string | null;
  refreshCosmeticAccent: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  // Ручной override темы. null = тему задаёт профиль.
  // v1.122.0: выбор темы — ОБЩИЙ для приложения и переживает перезапуск.
  // Было: жил только в useState → терялся при перезапуске И сбрасывался при каждой
  // смене профиля. Репорт тестировщика: «выбрал тёмную в НЗТ, переключился во FREE —
  // снова светлая. Надо запоминать app wide».
  const [override, setOverride] = useState<null | 'dark' | 'light'>(null);
  useEffect(() => {
    AsyncStorage.getItem(THEME_OVERRIDE_KEY)
      .then((v) => { if (v === 'dark' || v === 'light') setOverride(v); })
      .catch(() => {});
  }, []);
  const [colorblind, setColorblindState] = useState(false);
  useEffect(() => { AsyncStorage.getItem('psygames_colorblind').then((v) => { if (v !== null) setColorblindState(v === 'true'); }).catch(() => {}); }, []);
  const setColorblind = (v: boolean) => { setColorblindState(v); AsyncStorage.setItem('psygames_colorblind', String(v)).catch(() => {}); };

  // Косметика: надетый акцент (override профильного). refreshCosmeticAccent зовёт магазин после equip.
  const [cosmeticAccent, setCosmeticAccent] = useState<string | null>(null);
  const refreshCosmeticAccent = useCallback(() => {
    const pid = (profile as any)?.id;
    if (pid) getEquippedAccent(pid).then(setCosmeticAccent).catch(() => {});
    else setCosmeticAccent(null);
  }, [profile?.id]);
  useEffect(() => { refreshCosmeticAccent(); }, [refreshCosmeticAccent]);

  // v1.122.0: сброс override при смене профиля УБРАН намеренно — он и был причиной
  // «переключился во FREE — снова светлая». Явный выбор пользователя главнее пресета
  // профиля. Акцентный цвет по-прежнему берётся от профиля (см. pt.accent ниже) —
  // меняется только светлота/темнота.

  const pt = PROFILE_THEME[profile.id] ?? { mood: 'dark' as const, accent: '#0A84FF' };
  const mood = override ?? pt.mood;
  const isDark = mood === 'dark';
  const base = isDark ? darkTheme : lightTheme;
  const colors: ThemeColors = { ...base, primary: cosmeticAccent ?? pt.accent };

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setOverride(next);
    AsyncStorage.setItem(THEME_OVERRIDE_KEY, next).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors, themeFromProfile: override === null, colorblind, setColorblind, cosmeticAccent, refreshCosmeticAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
