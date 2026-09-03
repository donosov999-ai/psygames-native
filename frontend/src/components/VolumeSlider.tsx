/* psygames-volume-slider · VER 1 · 03.09.2026 */
import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';

/**
 * ПОЛЗУНОК ГРОМКОСТИ — задача fe7f2020.
 *
 * 🔴 ЗАЧЕМ СВОЙ, А НЕ БИБЛИОТЕЧНЫЙ. `@react-native-community/slider` тянет
 * нативный модуль, а приложение живёт в WebView на всех пяти платформах — значит
 * ещё одна вещь, которая ведёт себя по-разному на вебе и на нативе. Здесь нужна
 * одна горизонтальная полоска: тридцать строк против зависимости с нативной частью.
 *
 * ⚠️ ЖЕСТ И КНОПКИ ВМЕСТЕ, И ЭТО НЕ ИЗБЫТОК. Тащить ползунок точно на «сорок» на
 * телефоне неудобно, а без жеста он не читается как ползунок вовсе. Кнопки ∓10
 * дают точность, жест — понятность; и та же пара делает его доступным с клавиатуры
 * и скринридера, где перетаскивания нет в принципе.
 *
 * ⚠️ Шаг 5, а не 1: разницу в один процент никто не слышит, зато промах пальцем на
 * пиксель менял бы число и заставлял целиться.
 */
export function VolumeSlider({
  value, onChange, label,
}: { value: number; onChange: (v: number) => void; label: string }) {
  const { colors } = useTheme();
  /**
   * ⚠️ Ширина живёт ТОЛЬКО в ссылке, не в состоянии: отрисовке она не нужна
   * (заливка и бегунок считаются в процентах), а обработчику жеста нужна свежая.
   * Пишется в `onLayout` — это СОБЫТИЕ, а не отрисовка; запись во время отрисовки
   * линтер справедливо запрещает.
   */
  const ширинаRef = useRef(0);

  /**
   * Точка касания → громкость. Обычная функция, а не `PanResponder`: у `View` уже
   * есть свои обработчики отклика, и они не требуют ни хука, ни чтения ссылки во
   * время отрисовки — линтер это запрещает справедливо, жест там создаётся заново
   * на каждый кадр.
   *
   * Шаг 5, а не 1: разницу в один процент не слышно, зато промах пальцем на пиксель
   * менял бы число и заставлял целиться.
   */
  const поКасанию = (x: number) => {
    const w = ширинаRef.current;
    if (w <= 0) return;
    onChange(Math.max(0, Math.min(100, Math.round((x / w) * 20) * 5)));
  };

  const шаг = (d: number) => onChange(Math.max(0, Math.min(100, value + d)));

  return (
    <View style={styles.row}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label} −10`}
        testID="volume-down"
        onPress={() => шаг(-10)}
        style={styles.step}
      >
        <Ionicons name="remove" size={18} color={colors.text} />
      </TouchableOpacity>

      <View
        style={styles.trackBox}
        onLayout={(e) => {
          ширинаRef.current = Math.round(e.nativeEvent.layout.width);
        }}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: value }}
        testID="volume-track"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => поКасанию(e.nativeEvent.locationX)}
        onResponderMove={(e) => поКасанию(e.nativeEvent.locationX)}
      >
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${value}%` }]} />
        </View>
        <View style={[styles.knob, { backgroundColor: colors.primary, left: `${value}%` }]} />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label} +10`}
        testID="volume-up"
        onPress={() => шаг(10)}
        style={styles.step}
      >
        <Ionicons name="add" size={18} color={colors.text} />
      </TouchableOpacity>

      <Text style={[styles.value, { color: colors.textSecondary }]}>{value}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  /** 48×48 — норма для того, по чему стучат (тот же порог, что у служебных кнопок). */
  step: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  /** Коробка выше полоски: попасть пальцем в 4 px нельзя, а в 44 — можно. */
  trackBox: { flex: 1, minWidth: 0, height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
  knob: { position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9 },
  value: { fontSize: 13, fontWeight: '700', minWidth: 42, textAlign: 'right' },
});

export default VolumeSlider;
