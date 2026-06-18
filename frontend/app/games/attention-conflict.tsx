/**
 * Конфликт внимания — объединяющая страница для ЧЕТЫРЁХ парадигм
 * interference resolution / cognitive control:
 *  - Струп (классический): цвет vs значение слова
 *  - Эмоциональный Stroop: цвет vs эмоциональная нагрузка слова
 *  - Фланкер (Eriksen): центральная стрелка vs боковые дистракторы
 *  - Simon (v1.9.1): цвет vs позиция стимула — пространственный конфликт
 *
 * Все четыре измеряют одно и то же: способность подавить автоматический
 * конфликтующий ответ. Биомаркер у всех — `interference_effect_ms`
 * (RT_incongruent − RT_congruent). Различаются по типу конфликта:
 * семантический / эмоциональный / визуальный / пространственный.
 *
 * Эта страница — выбор режима → редирект на оригинальную игру.
 * Биомаркеры и история сохраняются под прежними `game_type`.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

const GRADIENT = ['#7c3aed', '#ec4899'];

const SUB_GAMES = [
  {
    route: '/games/stroop',
    icon: 'color-palette' as const,
    nameKey: 'stroop' as const,
    descKey: 'stroopDesc' as const,
    typeLabelRu: 'Цвет vs Слово',
    typeLabelEn: 'Color vs Word',
  },
  {
    route: '/games/stroop-emotional',
    icon: 'heart' as const,
    nameKey: 'stroopEmotional' as const,
    descKey: 'stroopEmotionalDesc' as const,
    typeLabelRu: 'Цвет vs Эмоция',
    typeLabelEn: 'Color vs Emotion',
  },
  {
    route: '/games/flanker',
    icon: 'arrow-forward' as const,
    nameKey: 'flanker' as const,
    descKey: 'flankerDesc' as const,
    typeLabelRu: 'Центр vs Бока',
    typeLabelEn: 'Center vs Flankers',
  },
  // v1.9.1 — Simon Task: 4-я парадигма interference resolution
  {
    route: '/games/simon',
    icon: 'flash' as const,
    nameKey: 'simon' as const,
    descKey: 'simonDesc' as const,
    typeLabelRu: 'Цвет vs Позиция',
    typeLabelEn: 'Color vs Position',
  },
];

export default function AttentionConflictGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('attentionConflict')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
          <Ionicons name="layers" size={48} color="#FFF" />
          <Text style={styles.heroTitle}>{t('attentionConflict')}</Text>
          <Text style={styles.heroDesc}>{t('attentionConflictDesc')}</Text>
        </LinearGradient>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('attentionConflictPickMode')}
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
              <Text style={[styles.cardTag, { color: GRADIENT[1] }]}>{language === 'ru' ? g.typeLabelRu : g.typeLabelEn}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {t('attentionConflictFootnote')}
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
  heroCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF', textAlign: 'center' },
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
