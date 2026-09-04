/* psygames-game-span · VER 1 · 19.08.2026 */
/**
 * Span — объединяющая страница для парадигмы кратковременной памяти на
 * последовательности (working memory span):
 *  - Запомни цифры (Digit Span): forward / backward
 *  - Кубики Корси (Spatial Span forward): пространственная позиция
 *  - Spatial Span (backward): обратное воспроизведение пространств. посл.
 *
 * Все три — варианты Wechsler / Corsi paradigm. Биомаркер: `max_span`.
 *
 * Эта страница — выбор модальности → редирект на оригинальную игру.
 * Биомаркеры и история сохраняются под прежними `game_type`.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import GamePreviewBackground from '@/src/components/GamePreviewBackground';
import { useProfile } from '@/src/contexts/ProfileContext';
import { filterAllowedGames } from '@/src/constants/profiles';
import { visibleSuiteCards } from '@/src/constants/gameSuites';

const GRADIENT = ['#0ea5e9', '#10b981'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 2.54 (норма AA 4.5), стало 6.15.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

const SUB_GAMES = [
  {
    route: '/games/digit-span',
    icon: 'keypad' as const,
    nameKey: 'digitSpan' as const,
    descKey: 'digitSpanDesc' as const,
    typeKey: 'spanTypeDigit' as const,   // «Цифры · forward + backward» — словарь LanguageContext
  },
  /**
   * КАРТОЧКА НАБОРА «Позиции» — решение Дениса 05.09.2026. Под ней три экрана:
   * матрица памяти (регулярная сетка), кубики Корси (нерегулярные блоки) и
   * spatial-span (та же сетка, обратный порядок). Матрица переехала сюда из
   * «Зрительной памяти»: два из трёх — тесты охвата, и меряют они одно.
   * Разбор и вскрытый по дороге дубль — в шапке `src/constants/gameSuites.ts`.
   */
  {
    route: '/games/memory-matrix',
    icon: 'grid' as const,
    nameKey: 'suitePositions' as const,
    descKey: 'suitePositionsDesc' as const,
    suiteId: 'suite_positions',
  },
  /**
   * Три «охвата с нагрузкой» — добавлены 04.09.2026. Отличие от первых трёх в том,
   * что запоминать приходится НЕ в тишине: между стимулами человек читает, слушает
   * или считает. Именно так объём памяти меряют в клинике, и именно это ближе к
   * жизни, где ничего не запоминается в вакууме.
   */
  {
    route: '/games/listening-span',
    icon: 'headset' as const,
    nameKey: 'listeningSpan' as const,
    descKey: 'listeningSpanDesc' as const,
    typeKey: 'spanTypeListening' as const,
  },
  {
    route: '/games/reading-span',
    icon: 'book' as const,
    nameKey: 'readingSpan' as const,
    descKey: 'readingSpanDesc' as const,
    typeKey: 'spanTypeReading' as const,
  },
  /**
   * N-back — тот же объём удерживаемого в голове, только ряд не кончается:
   * держать надо не «сколько запомнил», а «что было N шагов назад». Стояла
   * отдельной карточкой до 04.09.2026 — при том, что меряет ровно это.
   */
  {
    route: '/games/n-back',
    icon: 'sync' as const,
    nameKey: 'nBack' as const,
    descKey: 'nBackDesc' as const,
    typeKey: 'spanTypeNBack' as const,
  },
];

function DemoSpanRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(('/games/digit-span' + qs) as any);
  }, [router]);
  return null;
}

export default function SpanGame() {
  // Web-demo: хаб-выбор модальности не показываем — сразу первая подигра.
  // Query (embed=1, lang=…) обязан пережить редирект — embed-контракт с сайтом
  // (запись Кодекса в SYNC 22.07: терялись embed/lang → всплывало интро).
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { profile } = useProfile();
  const можно = React.useMemo(
    () => new Set(filterAllowedGames(profile).map((g: { route?: string }) => g.route as string)),
    [profile],
  );
  const карточки = visibleSuiteCards(SUB_GAMES, можно, t);

  /**
   * ⚠️ ВЫХОД В WEB-DEMO СТОИТ ПОСЛЕ ХУКОВ. До правки 05.09.2026 он был выше, и
   * четыре хука подряд оказывались условными: в demo-режиме React видел один
   * порядок вызовов, в обычном другой.
   */
  if (isWebDemo()) {
    return <DemoSpanRedirect />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('spanGroup')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
          <GamePreviewBackground />
          <Ionicons name="albums" size={48} color={ON_GRAD.color} />
          <Text style={styles.heroTitle}>{t('spanGroup')}</Text>
          <Text style={styles.heroDesc}>{t('spanGroupDesc')}</Text>
        </LinearGradient>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('spanPickModality')}
        </Text>
        {карточки.map(({ card: g, route: маршрут, tag: тип }) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={g.route}
            style={[styles.subCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(маршрут as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: GRADIENT[0] + '22' }]}>
              <Ionicons name={g.icon} size={28} color={GRADIENT[0]} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardName, { color: colors.text }]}>{t(g.nameKey)}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t(g.descKey)}</Text>
              {тип ? <Text style={[styles.cardTag, { color: GRADIENT[1] }]}>{тип}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {t('spanFootnote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  heroCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8, overflow: 'hidden' },
  heroTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color, textAlign: 'center', textShadowColor: 'rgba(0,0,0,.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  heroDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center', lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginLeft: 4 },
  subCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, gap: 14, borderWidth: 1 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 12 },
  cardTag: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  footnote: { fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 15, paddingHorizontal: 8 },
});
