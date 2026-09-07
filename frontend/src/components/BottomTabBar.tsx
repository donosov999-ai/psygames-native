/* psygames-bottom-tab-bar · VER 1 · 07.09.2026 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { TABS, TAB_BAR_H, activeTab, tabBarVisible } from '@/src/services/tabBar';

/**
 * СТЕКЛО ПОЛОСЫ — ПОЛУПРОЗРАЧНАЯ ЗАЛИВКА ПЛЮС РАЗМЫТИЕ ФОНА.
 *
 * 🔴 ПРИЁМ ВЗЯТ У `GlassButton` (12.08.2026), А НЕ ИЗОБРЕТЁН ЗАНОВО: заливка с
 * прозрачностью + светлая кромка + `backdropFilter`. Там же записано, почему НЕ
 * `BlurView`, хотя `expo-blur` в зависимостях лежит.
 *
 * 🔴 НО ОДНА ОГОВОРКА ТОЙ ЗАПИСКИ ЗДЕСЬ НЕ ДЕЙСТВУЕТ, и это замер, а не догадка.
 * Там сказано «размытие только там, где браузер умеет, на нативе строка
 * игнорируется». В этом приложении НАТИВНОГО РАНТАЙМА НЕТ: и iOS, и Android
 * собираются Tauri из того же веб-бандла (`Build web for Tauri` → `cargo tauri
 * ios build`, build.yml:433,525,540). То есть `Platform.OS === 'web'` в проде на
 * всех платформах, и размытие работает везде, а не «где повезёт».
 *
 * ⚠️ ПРЕФИКС `-webkit-` ОБЯЗАТЕЛЕН. WKWebView понимает `backdrop-filter` без
 * префикса не во всех версиях, а полоса — навигация: потерять её фон значит
 * получить вкладки поверх текста.
 *
 * ⚠️ 0,72 НЕПРОЗРАЧНОСТИ — НЕ «НА ГЛАЗ», А ЗАПАС НА ОТКАЗ. Если размытие не
 * поддержано вовсе, остаётся просто полупрозрачная панель: подписи читаются, а
 * содержимое под ней слегка просвечивает. При 0,4 без размытия полоса стала бы
 * нечитаемой — а отказ мы увидим не раньше отзыва с чужого телефона.
 *
 * `saturate(180%)` — то, чем «стекло» отличается от «мутного»: под размытием
 * цвета блёкнут, и Apple в своих материалах поднимает насыщенность обратно.
 */
function glass(dark: boolean) {
  return {
    backgroundColor: dark ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.72)',
    borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
    blur: {
      backdropFilter: 'saturate(180%) blur(24px)',
      WebkitBackdropFilter: 'saturate(180%) blur(24px)',
    } as any,
  };
}

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
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  if (!tabBarVisible(pathname)) return null;
  const активная = activeTab(pathname);
  const стекло = glass(!!isDark);

  return (
    <View
      style={[
        styles.bar,
        {
          height: TAB_BAR_H + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: стекло.backgroundColor,
          borderTopColor: стекло.borderColor,
        },
        стекло.blur,
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
    /*
     * ⚠️ ТЕНИ НЕТ НАРОЧНО. Под стеклом она читается как грязь: размытие уже
     * отделяет полосу от содержимого, а тень поверх прозрачного фона рисует
     * серую кайму. У Apple на этом месте волосяной разделитель — он выше.
     */
  },
  // ⚠️ Вся высота вкладки кликабельна, а не только значок: порог поля из
  // tap-target-audit — 48 px, и подпись входит в цель нажатия.
  tab: { flex: 1, height: TAB_BAR_H, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, fontWeight: '600' },
});
