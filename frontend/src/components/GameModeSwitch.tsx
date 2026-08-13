import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * GameModeSwitch — переключатель «Уровни / Свободно» на экране настроек игры.
 *
 * ЗАЧЕМ. Правило Дениса: у каждой игры три режима — уровни, свободно, зарядка.
 * Зарядка приходит извне (маршрутом), а вот выбор между уровнями и свободной
 * партией человек должен видеть глазами. До этого он был выражен по-разному и
 * почти нигде: в судоку липким футером, в Шульте — фразой «or customize your
 * table below and tap Free play» и кнопкой, до которой надо доскроллить мимо всех
 * настроек, в остальных не выражен вовсе. Денис ткнул в Шульте и был прав:
 * «щас одиночные битвы то с тем, то с другим».
 *
 * ЧТО ЭТО МЕНЯЕТ. Не механику — она везде уже есть, — а видимость выбора.
 * В режиме уровней ручные настройки прячутся: они и есть свободная партия, и
 * показывать их рядом с лесенкой значит предлагать два взаимоисключающих способа
 * играть одновременно.
 *
 * ⚠️ КЛЮЧИ ПОДПИСЕЙ НАЗЫВАЮТСЯ sudokuMode*, потому что впервые появились в судоку.
 * Строки в них общие («Уровни» / «Свободно») и уже переведены на все 12 языков;
 * заводить вторую пару ключей ради имени — двенадцать правок и риск разъехавшегося
 * перевода. Переименование — отдельная механическая замена, когда панель доедет
 * до всех экранов.
 */
export type PlayMode = 'levels' | 'free';

interface Props {
  mode: PlayMode;
  onChange: (m: PlayMode) => void;
  colors: any;
  /** Цвет выбранного режима — фирменный цвет игры, чтобы панель не выбивалась. */
  accent: string;
  /** Подпись t(key) — прокидывается игрой, чтобы компонент не зависел от контекста языка. */
  t: (key: string) => string;
}

export default function GameModeSwitch({ mode, onChange, colors, accent, t }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        {([['levels', 'sudokuModeLevels'], ['free', 'sudokuModeFree']] as const).map(([m, k]) => {
          const on = mode === m;
          return (
            <TouchableOpacity
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.btn,
                on
                  ? { backgroundColor: accent }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => onChange(m)}
            >
              <Text style={[styles.label, { color: on ? '#FFF' : colors.text }]}>{t(k)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', gap: 8 },
  // 48 — минимальный размер, при котором палец попадает уверенно (аудит кнопок).
  btn: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12 },
  label: { fontSize: 15, fontWeight: '700' },
});
