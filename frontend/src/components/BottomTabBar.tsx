/* psygames-bottom-tab-bar · VER 1 · 07.09.2026 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { TABS, TAB_BAR_H, activeTab, tabBarVisible } from '@/src/services/tabBar';

/**
 * НИЖНИЙ ТУЛБАР — ПЯТЬ ВКЛАДОК (решение Дениса 07.09.2026).
 *
 * 🔴 ЗАЧЕМ. Замер главной на полном профиле (окно 375×812): 3195 px содержимого
 * в окне 644 px — пять экранов прокрутки, 208 строк, из них 65 до первого
 * раздела игр. Человек, зашедший сыграть, листал мимо четырёх экранов чужого.
 *
 * ⚠️ ЭТО НАЛОЖЕНИЕ, А НЕ `expo-router/Tabs` — разбор в шапке `services/tabBar.ts`:
 * настоящие вкладки требуют перестройки дерева маршрутов и трогают возврат у
 * четырнадцати экранов, а видимый результат тот же.
 *
 * ⚠️ ПЕРЕХОД — `replace`, А НЕ `push`. Вкладки не складываются в стопку: пять
 * нажатий по кругу не должны оставлять пять записей истории, иначе системная
 * кнопка «назад» на Android уводит человека по его же вкладкам вместо выхода.
 */
export default function BottomTabBar() {
  const pathname = usePathname() || '';
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLanguage();

  if (!tabBarVisible(pathname)) return null;
  const активная = activeTab(pathname);

  return (
    <View
      style={[
        styles.bar,
        {
          height: TAB_BAR_H + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
      testID="bottom-tab-bar"
    >
      {TABS.map((вкладка) => {
        const выбрана = активная === вкладка.route;
        const цвет = выбрана ? colors.primary : colors.textSecondary;
        return (
          <Pressable
            key={вкладка.route}
            accessibilityRole="button"
            accessibilityState={{ selected: выбрана }}
            accessibilityLabel={t(вкладка.labelKey)}
            testID={`tab-${вкладка.route}`}
            onPress={() => { if (!выбрана) router.replace(вкладка.route as any); }}
            style={styles.tab}
          >
            <Ionicons name={вкладка.icon as any} size={22} color={цвет} />
            <Text numberOfLines={1} style={[styles.label, { color: цвет }]}>
              {t(вкладка.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    // Над питомцем (60) и кнопкой отзыва: полоса — навигация, её нельзя закрыть.
    zIndex: 70,
    ...Platform.select({ web: { boxShadow: '0 -2px 10px rgba(0,0,0,0.06)' } as any, default: {} }),
  },
  // ⚠️ Вся высота вкладки кликабельна, а не только значок: порог поля из
  // tap-target-audit — 48 px, и подпись входит в цель нажатия.
  tab: { flex: 1, height: TAB_BAR_H, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, fontWeight: '600' },
});
