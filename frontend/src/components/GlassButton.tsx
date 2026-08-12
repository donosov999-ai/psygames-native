/**
 * GlassButton — кнопка-капсула со стеклянной подложкой.
 *
 * ЗАЧЕМ. Два требования Дениса от 12.08.2026 сразу: капсульная форма со стеклом
 * вместо нынешних прямоугольников со скруглением 8, и попадание пальцем.
 *
 * ⚠️ РАЗМЕР ЗДЕСЬ НЕ УКРАШЕНИЕ. Замер на экране телефона (390×844) нашёл кнопки
 * высотой 21, 35 и 36 точек при минимуме 44 у Apple и 48 у Material. Промах по
 * такой кнопке человек не считает промахом: он думает «не нажалось» и жмёт ещё
 * раз, а второе нажатие часто означает уже другое действие. В судоку «Отменить»
 * стоит вплотную к «Подсказке», и промах тратит лимит подсказок и режет счёт —
 * виноватым человек считает не свой палец. Поэтому MIN_TAP зашит в компонент и
 * не выносится в проп: возможность задать 32 означала бы, что где-то её зададут.
 *
 * ПОЧЕМУ НЕ BlurView, хотя expo-blur в проекте есть. Настоящее размытие требует
 * отдельного слоя под содержимым и ломает раскладку внутри строки кнопок, а на
 * Android-сборке (она у нас WebView) стоит кадров больше, чем даёт на вид. Здесь
 * стекло собрано дешевле: полупрозрачная заливка + светлая кромка сверху + размытие
 * фона средствами браузера там, где оно есть. Выглядит так же, а стоит почти ничего.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';

/** Минимальная сторона, при которой палец попадает надёжно. Apple 44, Material 48. */
export const MIN_TAP = 48;

export type GlassTone = 'plain' | 'accent' | 'warn';

export interface GlassButtonProps {
  label?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  /** plain — обычное стекло, accent — подсвеченное, warn — тёплое (подсказка). */
  tone?: GlassTone;
  /** Растянуть по ширине строки: несколько кнопок делят её поровну. */
  grow?: boolean;
  /** Кнопка «нажата»/включена — например, режим цвета. */
  active?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/** Полупрозрачные заливки. Светлая тема — белое стекло, тёмная — светлое на тёмном. */
function surfaces(dark: boolean, tone: GlassTone, active: boolean) {
  if (tone === 'warn') {
    return { bg: dark ? 'rgba(251,191,36,0.22)' : 'rgba(251,191,36,0.85)', border: 'rgba(251,191,36,0.55)' };
  }
  if (tone === 'accent' || active) {
    return { bg: dark ? 'rgba(127,127,213,0.30)' : 'rgba(127,127,213,0.18)', border: 'rgba(127,127,213,0.55)' };
  }
  return {
    bg: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)',
    border: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
  };
}

export default function GlassButton({
  label, icon, onPress, disabled, tone = 'plain', grow, active, accessibilityLabel, style,
}: GlassButtonProps) {
  const { colors, isDark } = useTheme();
  const s = surfaces(!!isDark, tone, !!active);
  // Тёплое стекло — тёмная надпись: жёлтый фон со светлым текстом не читается.
  const fg = tone === 'warn' ? '#1C1C1E' : colors.text;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        grow ? styles.grow : null,
        { backgroundColor: s.bg, borderColor: s.border, opacity: disabled ? 0.4 : 1 },
        // Размытие фона — только там, где браузер умеет. На нативе строка игнорируется.
        Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px)' } as any) : null,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      {label ? <Text numberOfLines={1} style={[styles.label, { color: fg }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Отступы тесные намеренно: на экране 375 три кнопки делят строку по 109 точек,
    // и при 12+6 подпись «Подсказка» не помещалась — обрезалась до «Подск…».
    gap: 4,
    minHeight: MIN_TAP,
    paddingHorizontal: 8,
    paddingVertical: 10,
    // Скруглённые углы, НЕ капсула: Денис 12.08 — «не нужны круглые или овальные,
    // нужны просто скруглённые углы». 16 держит форму прямоугольной и при переносе
    // подписи на вторую строку, чего радиус в половину высоты не умеет.
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1, minWidth: 0 },
  label: { fontSize: 13, fontWeight: '700' },
});
