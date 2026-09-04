/* psygames-game-suite-switch · VER 1 · 05.09.2026 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { suiteOfRoute } from '@/src/constants/gameSuites';
import { useProfile } from '@/src/contexts/ProfileContext';
import { filterAllowedGames } from '@/src/constants/profiles';

/**
 * ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМОВ НАБОРА — плашки под шапкой на экране настройки игры.
 *
 * Ставится ОДНОЙ строкой в неигровую фазу экрана. Если маршрут не входит ни в
 * один набор (`gameSuites.ts`), компонент не рисует ничего — поэтому его можно
 * не бояться поставить лишний раз и не надо оборачивать в условие на месте.
 *
 * ⚠️ ПЕРЕКЛЮЧЕНИЕ — ЭТО `router.replace`, А НЕ `push`. Режим не должен копиться
 * в истории: человек, потыкавший четыре плашки и нажавший «назад», обязан выйти
 * в хаб, а не пройти обратно по четырём своим тыкам.
 *
 * 🔴 ТОЛЬКО ДО СТАРТА ПАРТИИ. Компонент живёт в фазе настройки, потому что смена
 * маршрута размонтирует экран: нажатая посреди партии плашка стёрла бы ход. В
 * играх набора игровая фаза рисуется отдельной веткой (`phase === 'playing'` →
 * `GameShell`), и туда переключатель не попадает по устройству — а не потому,
 * что мы помним об этом при каждой правке.
 */
export default function GameSuiteSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();

  const { profile } = useProfile();
  /**
   * 🔴 ПЛАШКИ ПОКАЗЫВАЮТ ТОЛЬКО ОТКРЫТОЕ ПРОФИЛЮ. Замер 05.09.2026: у «chess» из
   * четырёх стрелочных парадигм открыта одна (`choice-rt`) — остальные три плашки
   * были бы приглашением в игру, которой у человека нет. Один открытый режим —
   * переключать не из чего, панель не рисуется вовсе.
   */
  const можно = React.useMemo(
    () => new Set(filterAllowedGames(profile).map((g: { route?: string }) => g.route as string)),
    [profile],
  );

  const набор = suiteOfRoute(pathname || '');
  const режимы = (набор?.modes ?? []).filter((m) => можно.has(m.route));
  if (!набор || режимы.length < 2) return null;

  const текущий = режимы.find((m) => (pathname || '').endsWith(m.route))?.route
    ?? режимы.find((m) => (pathname || '').includes(m.route))?.route;

  return (
    <View style={styles.обёртка}>
      <Text style={[styles.подпись, { color: colors.textSecondary }]}>{t('mode')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ряд}>
        {режимы.map((m) => {
          const выбран = m.route === текущий;
          return (
            <TouchableOpacity
              key={m.route}
              accessibilityRole="button"
              accessibilityState={{ selected: выбран }}
              accessibilityLabel={t(m.labelKey)}
              onPress={() => { if (!выбран) router.replace(m.route as never); }}
              style={[
                styles.плашка,
                { backgroundColor: выбран ? colors.primary : colors.surface, borderColor: выбран ? colors.primary : colors.border },
              ]}
            >
              <Text style={[styles.текст, { color: выбран ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
                {t(m.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  обёртка: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  подпись: { fontSize: 12, marginBottom: 6 },
  ряд: { gap: 8, paddingRight: 16 },
  // 🔴 minHeight 44: плашка — цель нажатия, а аудит целей требует 44×44.
  плашка: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  текст: { fontSize: 14, fontWeight: '600' },
});
