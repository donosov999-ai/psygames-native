import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  value: string | number;
  colors?: [string, string];   // верх (светлее) → низ (темнее)
  tint?: string;               // цвет текста/иконки
  pop?: boolean;               // дёрнуть масштаб при изменении value
  style?: ViewStyle;
}

// Объёмный бейдж-пилюля для HUD (уровень/таймер/счёт/цель):
// градиент-грань + верхний блик + тень = глубина. Не сухой текст.
export default function HudBadge({ icon, label, value, colors = ['#3b82f6', '#1d4ed8'], tint = '#fff', pop, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!pop) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.16, duration: 110, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [value, pop, scale]);
  return (
    <Animated.View style={[styles.shadow, { transform: [{ scale }] }, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.pill}>
        <View style={styles.highlight} pointerEvents="none" />
        {icon ? <Ionicons name={icon} size={15} color={tint} style={{ marginRight: 5 }} /> : null}
        {label ? <Text style={[styles.label, { color: tint }]}>{label} </Text> : null}
        <Text style={[styles.value, { color: tint }]}>{value}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.16)' },
  label: { fontSize: 12, fontWeight: '700', opacity: 0.85 },
  value: { fontSize: 15, fontWeight: '900' },
});
