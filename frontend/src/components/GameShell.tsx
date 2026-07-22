/**
 * GameShell — единый каркас игрового экрана (v1.128.0).
 *
 * ЗАЧЕМ. У 62 игр не было общего каркаса: header копировался в 52 файлах,
 * playArea — в 48, и при формально одинаковом `justifyContent:'center'` поле
 * у всех оказывалось в разном месте. Отсюда волна репортов: «почему кнопки
 * не внизу», «поле не по центру», «тулбар то есть, то нет». Эталоном
 * тестировщики назвали math-sprint («тулбар плавающий внизу — надо так везде»).
 *
 * РЕШЕНИЯ ПО API (зафиксированы, чтобы миграция не переделывалась):
 *  1. Тулбар действий — ПРИБИТЫЙ нижний футер с разделителем, а не «кнопки
 *     в конце центрированной колонки». Так место действий постоянно и не
 *     зависит от высоты поля.
 *  2. Скроллящееся поле — ПРОП `scrollableField`, а не второй компонент:
 *     10 игр (mnemonics, counter, cloze, lexical-decision, proofreading,
 *     semantic-sort, schulte, targets, vocab-srs, word-pairs) держат длинный
 *     контент, остальным хватает центрирования.
 *  3. Правый слот шапки (`headerRight`) — под справку «?», чтобы плавающая
 *     кнопка не висела над игровым полем.
 *
 * Футер оставляет отступ слева (FAB_GUTTER) под плавающую кнопку фидбека —
 * она смонтирована глобально в _layout и иначе перекрывает крайнюю кнопку.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';

/** Ширина зоны, которую занимает плавающая кнопка фидбека слева снизу. */
const FAB_GUTTER = 66;

export interface GameShellProps {
  /** Заголовок игры (уже переведённый). */
  title: string;
  /** Кнопка «назад». */
  onBack: () => void;
  /** Строка счётчиков под шапкой (раунд/время/ошибки). Опционально. */
  stats?: React.ReactNode;
  /** Кнопки действий — прибиты к низу экрана. Опционально. */
  toolbar?: React.ReactNode;
  /** Слот справа в шапке (обычно «?»-справка). */
  headerRight?: React.ReactNode;
  /** true — игровое поле в ScrollView (длинный контент: списки слов и т.п.). */
  scrollableField?: boolean;
  /** Само игровое поле. */
  children: React.ReactNode;
}

export default function GameShell({
  title, onBack, stats, toolbar, headerRight, scrollableField, children,
}: GameShellProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const field = scrollableField ? (
    <ScrollView
      style={styles.fieldScroll}
      contentContainerStyle={styles.fieldScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.field}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Шапка: назад — заголовок — правый слот. Заголовок ужимается, кнопки нет. */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.headerBtn, { backgroundColor: colors.surface }]}
          accessibilityLabel="Назад"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {/* Правый слот фиксированной ширины — держит заголовок по центру */}
        <View style={styles.headerRight}>{headerRight}</View>
      </View>

      {stats ? <View style={styles.stats}>{stats}</View> : null}

      {field}

      {toolbar ? (
        <View
          style={[
            styles.toolbar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 10),
              paddingLeft: FAB_GUTTER,   // не залезать под кнопку фидбека
            },
          ]}
        >
          {toolbar}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // flexShrink+minWidth: при системном крупном шрифте длинный заголовок
  // ужимается, а не выталкивает кнопку «назад» за край (репорт «кнопка уехала»).
  title: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  headerBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  headerRight: { width: 44, alignItems: 'flex-end', flexShrink: 0 },
  stats: { paddingHorizontal: 16, paddingBottom: 6 },
  // Поле забирает всё свободное место и центрирует содержимое — единое
  // поведение для всех игр вместо разнобоя.
  field: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  fieldScroll: { flex: 1 },
  fieldScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingRight: 16,
    ...(Platform.OS === 'web' ? { cursor: 'default' as any } : null),
  },
});
