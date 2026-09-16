/* psygames-arrow-pad · VER 1 · 16.09.2026 */
/**
 * КРЕСТОВИНА СТРЕЛОК — ОДНА НА ВСЁ ПРИЛОЖЕНИЕ.
 *
 * 🔴 РЕШЕНИЕ ДЕНИСА 16.09.2026, по кадру раскладки клавиш: «это оптимальная схема,
 * скажи всем, у кого есть стрелки, чтобы поправили у себя на такую». Схема —
 * ПЕРЕВЁРНУТАЯ «Т»: ↑ отдельной строкой над рядом ← ↓ →.
 *
 * ЧТО БЫЛО И ЧЕМ ЭТО ПЛОХО. В `puzzles.tsx` стрелки стояли ОДНИМ РЯДОМ в порядке
 * ← ↑ ↓ →: «вверх» и «вниз» лежали рядом ПО ГОРИЗОНТАЛИ и различались только
 * значком. Палец целится в МЕСТО, а не читает иконку, поэтому ряд из четырёх
 * заставляет каждый раз читать — и управление читается как «перенесли
 * компьютерную версию», о чём Денис и говорил про весь раздел.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ПРАВКА НА МЕСТЕ. Стрелки нужны не одному
 * экрану. Если каждый раздел нарисует свои, схема разъедется снова — ровно так
 * разъехались справка (четыре независимых механизма за день) и подписи второго
 * действия (две карты с одним ключом и красный tsc). Один компонент — одна схема.
 *
 * КАК ПОЛЬЗОВАТЬСЯ:
 *   <ArrowPad onPress={(куда) => …} />                     // четыре направления
 *   <ArrowPad восемь onPress={(куда) => …} />              // блок 3×3, середина пуста
 * `куда` приходит словом: 'вверх' | 'вниз' | 'влево' | 'вправо' и, для блока 3×3,
 * 'вверх-влево' | 'вверх-вправо' | 'вниз-влево' | 'вниз-вправо'.
 *
 * ⚠️ РАЗМЕР КНОПКИ 54×48 — НЕ «ПОКРУГЛЕЕ», А ПОЛ `tap-target-audit` (48×48). На 46
 * CI уже ловил кнопку второго действия 182×46 и был прав.
 *
 * Сторожит `arrow-pad-is-an-inverted-t`.
 */
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type Направление =
  | 'вверх' | 'вниз' | 'влево' | 'вправо'
  | 'вверх-влево' | 'вверх-вправо' | 'вниз-влево' | 'вниз-вправо';

/** Прямые направления — те, что понимает `psy_cursor`. */
export const ПРЯМЫЕ: readonly Направление[] = ['вверх', 'вниз', 'влево', 'вправо'];

type Клетка = readonly [Направление, keyof typeof Ionicons.glyphMap, string] | null;

/** Перевёрнутая «Т»: ↑ сверху, ← ↓ → снизу. */
const Т: readonly (readonly Клетка[])[] = [
  [['вверх', 'chevron-up', '0deg']],
  [['влево', 'chevron-back', '0deg'], ['вниз', 'chevron-down', '0deg'], ['вправо', 'chevron-forward', '0deg']],
];

/** Блок 3×3: каждая кнопка стоит там, куда ведёт; середина пуста. */
const БЛОК: readonly (readonly Клетка[])[] = [
  [['вверх-влево', 'arrow-up-outline', '-45deg'], ['вверх', 'chevron-up', '0deg'], ['вверх-вправо', 'arrow-up-outline', '45deg']],
  [['влево', 'chevron-back', '0deg'], null, ['вправо', 'chevron-forward', '0deg']],
  [['вниз-влево', 'arrow-down-outline', '45deg'], ['вниз', 'chevron-down', '0deg'], ['вниз-вправо', 'arrow-down-outline', '-45deg']],
];

export default function ArrowPad({ onPress, восемь, цвета, testID }: {
  onPress: (куда: Направление) => void;
  /** Восемь направлений вместо четырёх — блок 3×3. */
  восемь?: boolean;
  цвета?: { border: string; card: string; text: string };
  testID?: string;
}) {
  const ряды = восемь ? БЛОК : Т;
  const обводка = цвета?.border ?? '#D0D0D5';
  const фон = цвета?.card ?? '#FFFFFF';
  const знак = цвета?.text ?? '#1C1C1E';
  return (
    <View style={styles.крестовина} testID={testID ?? (восемь ? 'arrow-pad-8' : 'arrow-pad')}>
      {ряды.map((ряд, i) => (
        <View key={i} style={styles.ряд} testID={`arrow-pad-row-${i}`}>
          {ряд.map((клетка, j) => (клетка ? (
            <Pressable
              key={клетка[0]}
              accessibilityRole="button"
              accessibilityLabel={клетка[0]}
              onPress={() => onPress(клетка[0])}
              style={[styles.кнопка, { borderColor: обводка, backgroundColor: фон }]}
            >
              <Ionicons name={клетка[1]} size={22} color={знак} style={{ transform: [{ rotate: клетка[2] }] }} />
            </Pressable>
          ) : (
            // Дырка в середине блока того же размера — иначе ряды разъезжаются.
            <View key={`пусто-${j}`} style={styles.дырка} />
          )))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  крестовина: { alignItems: 'center', gap: 10 },
  ряд: { flexDirection: 'row', gap: 10 },
  кнопка: { width: 54, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  дырка: { width: 54, height: 48 },
});
