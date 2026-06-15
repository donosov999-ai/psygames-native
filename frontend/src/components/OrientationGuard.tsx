import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { usePathname } from 'expo-router';

// Приложение в ОСНОВНОМ портретное. С v1.30.10 Android-манифест = sensor (телефон крутится),
// поэтому этот оверлей — ОСНОВНОЙ «портретный» сторож: в телефонном landscape (узкая высота)
// просит повернуть обратно, КРОМЕ экранов из LANDSCAPE_OK (у них своя landscape-раскладка:
// судоку — сетка слева, цифры справа). Десктоп/планшет (height ≥ 480) НЕ трогаем — landscape там ок.
const TXT: Record<string, [string, string]> = {
  ru: ['Поверни телефон вертикально', 'Приложение работает в портретном режиме'],
  en: ['Rotate your phone to portrait', 'The app works in portrait mode'],
  es: ['Gira el teléfono en vertical', 'La app funciona en modo vertical'],
  pt: ['Gire o telefone na vertical', 'O app funciona no modo retrato'],
  de: ['Drehe dein Handy ins Hochformat', 'Die App läuft im Hochformat'],
  zh: ['请将手机竖屏', '应用为竖屏模式'],
  hi: ['फ़ोन को लंबवत घुमाएँ', 'ऐप पोर्ट्रेट मोड में चलता है'],
};

// игры/экраны с собственным рабочим landscape-режимом — оверлей НЕ показываем
const LANDSCAPE_OK = ['/games/sudoku'];

export default function OrientationGuard() {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const pathname = usePathname();

  // у этого экрана свой landscape-режим → не перехватываем
  if (LANDSCAPE_OK.some((r) => pathname?.startsWith(r))) return null;
  // телефон в горизонтали: ширина > высоты И высота мала (десктоп/планшет шире → не блокируем)
  const isPhoneLandscape = width > height && height < 480;
  if (!isPhoneLandscape) return null;

  const [title, sub] = TXT[language] || TXT.en;
  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <Ionicons name="phone-portrait-outline" size={72} color={colors.primary} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 9999,
  },
  title: { fontSize: 21, fontWeight: '800', marginTop: 18, textAlign: 'center' },
  sub: { fontSize: 14, marginTop: 8, textAlign: 'center' },
});
