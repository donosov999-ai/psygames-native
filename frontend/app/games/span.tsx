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
import { useRouter, Redirect } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import GamePreviewBackground from '@/src/components/GamePreviewBackground';

const GRADIENT = ['#0ea5e9', '#10b981'];

const SUB_GAMES = [
  {
    route: '/games/digit-span',
    icon: 'keypad' as const,
    nameKey: 'digitSpan' as const,
    descKey: 'digitSpanDesc' as const,
    typeKey: 'spanTypeDigit' as const,   // «Цифры · forward + backward» — словарь LanguageContext
  },
  {
    route: '/games/corsi',
    icon: 'grid' as const,
    nameKey: 'corsi' as const,
    descKey: 'corsiDesc' as const,
    typeKey: 'spanTypeSpatialFwd' as const,
  },
  {
    route: '/games/spatial-span',
    icon: 'swap-horizontal' as const,
    nameKey: 'spatialSpan' as const,
    descKey: 'spatialSpanDesc' as const,
    typeKey: 'spanTypeSpatialBwd' as const,
  },
];

export default function SpanGame() {
  // Web-demo: хаб-выбор модальности не показываем — сразу первая подигра.
  if (isWebDemo()) return <Redirect href="/games/digit-span" />;

  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('spanGroup')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
          <GamePreviewBackground />
          <Ionicons name="albums" size={48} color="#FFF" />
          <Text style={styles.heroTitle}>{t('spanGroup')}</Text>
          <Text style={styles.heroDesc}>{t('spanGroupDesc')}</Text>
        </LinearGradient>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('spanPickModality')}
        </Text>
        {SUB_GAMES.map((g) => (
          <TouchableOpacity
            key={g.route}
            style={[styles.subCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(g.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: GRADIENT[0] + '22' }]}>
              <Ionicons name={g.icon} size={28} color={GRADIENT[0]} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardName, { color: colors.text }]}>{t(g.nameKey)}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t(g.descKey)}</Text>
              <Text style={[styles.cardTag, { color: GRADIENT[1] }]}>{t(g.typeKey)}</Text>
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
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  heroCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8, overflow: 'hidden' },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF', textAlign: 'center', textShadowColor: 'rgba(0,0,0,.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  heroDesc: { fontSize: 13, color: '#FFF', opacity: 0.92, textAlign: 'center', lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginLeft: 4 },
  subCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, gap: 14, borderWidth: 1 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 12 },
  cardTag: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  footnote: { fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 15, paddingHorizontal: 8 },
});
