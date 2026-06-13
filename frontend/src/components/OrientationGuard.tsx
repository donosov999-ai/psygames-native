import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

// Приложение спроектировано под ПОРТРЕТ (app.json orientation:portrait — натив залочен).
// На web/webview браузер крутится свободно → сетки игр (судоку 9×9, шульте и др.), у которых
// размер привязан к высоте, в landscape схлопываются (ячейки 0–3px, «не видно полей»).
// Этот оверлей в ТЕЛЕФОННОМ landscape (узкая высота) просит повернуть устройство.
// Десктоп (Mac/Win/браузер) НЕ трогаем: там landscape нормален → условие height < 480.
const TXT: Record<string, [string, string]> = {
  ru: ['Поверни телефон вертикально', 'Приложение работает в портретном режиме'],
  en: ['Rotate your phone to portrait', 'The app works in portrait mode'],
  es: ['Gira el teléfono en vertical', 'La app funciona en modo vertical'],
  pt: ['Gire o telefone na vertical', 'O app funciona no modo retrato'],
  de: ['Drehe dein Handy ins Hochformat', 'Die App läuft im Hochformat'],
  zh: ['请将手机竖屏', '应用为竖屏模式'],
  hi: ['फ़ोन को लंबवत घुमाएँ', 'ऐप पोर्ट्रेट मोड में चलता है'],
};

export default function OrientationGuard() {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const { language } = useLanguage();

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
