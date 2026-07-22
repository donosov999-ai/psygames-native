import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { usePathname } from 'expo-router';

// ЗАЧЕМ ЭТОТ КОМПОНЕНТ И ПОЧЕМУ ОН БОЛЬШЕ НЕ «ЛОК».
// Ориентацию задаёт СИСТЕМА, а не приложение: Android-манифест патчится в
// .github/workflows/build.yml на `fullUser` (автоповорот выключен → телефон не
// крутится вообще). Раньше там стоял `sensor` — он игнорировал системную
// настройку, приложение переворачивалось само, а этот оверлей глухой стеной
// требовал повернуть обратно. Оба поведения убраны.
//
// Компонент остаётся, потому что проблема реальна: у части игр доска считается
// от ВЫСОТЫ экрана (corsi.tsx: `(height - 300) / BOARD_H`; spatial-span.tsx:
// `Math.min(width - 32, height - 300, 520)`), и в телефонном landscape
// (height ≈ 360–420) поле схлопывается в десятки пикселей или уходит в минус.
// Поэтому подсказка сохранена, но обесточена до необходимого минимума:
//   • ТОЛЬКО на /games/* — меню, настройки, статистика, достижения, магазин
//     построены на ScrollView и в горизонтали полностью рабочие; закрывать их
//     оверлеем было чистым раздражением без пользы;
//   • НЕ на экранах из LANDSCAPE_OK — у них своя landscape-раскладка;
//   • с кнопкой «Всё равно играть»: это подсказка, а не запрет. Отказ помним до
//     перезапуска приложения (компонент висит в корне и не размонтируется), так
//     что повторно не пристаём — выбор пользователя уважаем один раз и навсегда.
const TXT: Record<string, [string, string, string]> = {
  ru: ['Лучше держать вертикально', 'В горизонтали поле игры сжимается', 'Всё равно играть'],
  en: ['Better in portrait', 'The board shrinks in landscape', 'Play anyway'],
  es: ['Mejor en vertical', 'En horizontal el tablero se encoge', 'Jugar igualmente'],
  pt: ['Melhor na vertical', 'Na horizontal o tabuleiro encolhe', 'Jogar mesmo assim'],
  de: ['Besser im Hochformat', 'Im Querformat schrumpft das Spielfeld', 'Trotzdem spielen'],
  zh: ['竖屏体验更好', '横屏时棋盘会被压缩', '仍然继续'],
  hi: ['पोर्ट्रेट में बेहतर', 'लैंडस्केप में बोर्ड सिकुड़ जाता है', 'फिर भी खेलें'],
};

// игры/экраны с собственным рабочим landscape-режимом — подсказку НЕ показываем
const LANDSCAPE_OK = ['/games/sudoku'];

export default function OrientationGuard() {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const pathname = usePathname();
  // «Всё равно играть» — осознанный выбор пользователя, держим до перезапуска
  const [dismissed, setDismissed] = React.useState(false);

  // вне игр landscape полностью рабочий (ScrollView) → подсказка не нужна
  if (!pathname?.startsWith('/games/')) return null;
  // у этого экрана свой landscape-режим → не перехватываем
  if (LANDSCAPE_OK.some((r) => pathname.startsWith(r))) return null;
  // телефон в горизонтали: ширина > высоты И высота мала (десктоп/планшет шире → не трогаем)
  const isPhoneLandscape = width > height && height < 480;
  if (!isPhoneLandscape || dismissed) return null;

  const [title, sub, cta] = TXT[language] || TXT.en;
  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <Ionicons name="phone-portrait-outline" size={72} color={colors.primary} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text>
      <TouchableOpacity
        style={[styles.cta, { borderColor: colors.border }]}
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel={cta}
      >
        <Text style={[styles.ctaText, { color: colors.primary }]}>{cta}</Text>
      </TouchableOpacity>
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
  cta: {
    marginTop: 20, paddingVertical: 10, paddingHorizontal: 22,
    borderRadius: 999, borderWidth: 1,
  },
  ctaText: { fontSize: 15, fontWeight: '700' },
});
