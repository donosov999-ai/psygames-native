import React, { useRef } from 'react';
import { Animated, Pressable, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { hapticTap } from './haptics';

interface Props {
  label: string;
  onPress: () => void;
  colors?: [string, string];   // верх (светлее) → низ (темнее)
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: string;
  style?: ViewStyle | ViewStyle[];   // внешний (flex и т.п. для ряда кнопок)
}

// Яркость hex-цвета (WCAG relative luminance, 0..1). Некорректный/непарсимый цвет → 0
// (трактуем как тёмный → белый текст, безопасный дефолт).
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;   // упрощённая (без гаммы) — хватает для порога
}

// Объёмная CTA-кнопка: градиент-грань + верхний блик + тёмный нижний бордер + тень +
// пружина нажатия + хаптик. Замена плоским «архаичным» кнопкам в меню игр.
export default function JuicyButton({ label, onPress, colors = ['#f857a6', '#ff5858'], icon, tint, style }: Props) {
  // Если tint не задан — берём контраст по яркости ВЕРХНЕГО цвета градиента:
  // светлый градиент → тёмный текст (иначе белый на светлом не читается), тёмный → белый.
  const ink = tint ?? (luminance(colors[0]) > 0.6 ? '#1a1a1a' : '#fff');
  const scale = useRef(new Animated.Value(1)).current;
  const hov = useRef(false);   // десктоп: ховер-подъём при наведении
  const spring = (to: number) => Animated.spring(scale, { toValue: to, friction: 6, tension: 220, useNativeDriver: true }).start();
  return (
    <Pressable style={style}
      onHoverIn={() => { hov.current = true; spring(1.04); }}
      onHoverOut={() => { hov.current = false; spring(1); }}
      onPressIn={() => spring(0.95)} onPressOut={() => spring(hov.current ? 1.04 : 1)}
      onPress={() => { hapticTap(); onPress(); }}>
      <Animated.View style={[styles.shadow, { transform: [{ scale }] }]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.face}>
          <View style={styles.highlight} pointerEvents="none" />
          {icon ? <Ionicons name={icon} size={20} color={ink} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.label, { color: ink }]}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderBottomColor: 'rgba(0,0,0,0.22)', borderBottomWidth: 3, overflow: 'hidden' },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.18)' },
  label: { fontSize: 17, fontWeight: '800' },
});
