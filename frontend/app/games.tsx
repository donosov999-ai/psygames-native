/* psygames-games-tab · VER 1 · 07.09.2026 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';
import CategorySections from '@/src/components/CategorySections';
import { CATEGORY_ORDER } from '@/src/constants/games';

/**
 * ВКЛАДКА «ИГРЫ» — ВЕСЬ КАТАЛОГ, ДЕВЯТЬ РАЗДЕЛОВ.
 *
 * 🔴 ЗАЧЕМ ОНА ПОЯВИЛАСЬ. Замер главной 07.09.2026 на полном профиле (окно
 * 375×812): 3195 px содержимого в окне 644 px — пять экранов прокрутки, из них
 * четыре занимал каталог. Человек, зашедший сыграть сегодня, листал мимо всего
 * приложения. Решение Дениса: каталог сюда, на главной остаются три ЛЮБИМЫХ
 * раздела — те, где он реально играл (`services/favouriteCategories`).
 *
 * ⚠️ РАЗМЕТКА РАЗДЕЛОВ НЕ ПОВТОРЕНА, а взята общим компонентом
 * `CategorySections`: главная показывает три раздела ТЕМ ЖЕ кодом. Две копии
 * разошлись бы молча, и в одном приложении оказалось бы два разных каталога.
 *
 * ⚠️ Отступ снизу — общий `FAB_CLEARANCE` (156), он уже покрывает кнопку отзыва,
 * ходячего питомца и полосу вкладок; своего числа здесь нет нарочно.
 */
export default function GamesScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: FAB_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text }]}>{t('tabGames')}</Text>
        </View>
        <CategorySections categories={CATEGORY_ORDER} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  head: { paddingTop: 8, paddingBottom: 14 },
  title: { fontSize: 24, fontWeight: '800' },
});
