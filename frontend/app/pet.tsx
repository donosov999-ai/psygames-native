/**
 * /pet — экран питомца «Синапс» (порт блока NeuroPet с промо-сайта).
 *
 * Показывает: персонажа крупно (стадия из реального числа тренировок),
 * уровень + счётчик тренировок и 4 шкалы навыков, посчитанные из НАСТОЯЩЕГО
 * лога сессий (getSessions) — никаких выдуманных цифр, питомец отражает то,
 * что человек реально натренировал. Математика — в src/services/pet.ts.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, Redirect } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import SynapsePet from '@/src/components/pet/SynapsePet';
import { getPetStats, pickReaction, PetStats } from '@/src/services/pet';

/** Цвета шкал — 1:1 с сайта (.pet-skill-memory и т.д.) */
const SKILL_COLORS: Record<keyof PetStats['skills'], string> = {
  memory: '#8a68f5',
  attention: '#25b989',
  logic: '#e55fa2',
  speed: '#4a91ed',
};
const SKILL_ORDER: (keyof PetStats['skills'])[] = ['memory', 'attention', 'logic', 'speed'];

/** Русские формы «N тренировок» (1 тренировка / 2 тренировки / 5 тренировок). */
function ruTrainings(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'тренировка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'тренировки';
  return 'тренировок';
}

export default function PetScreen() {
  // Web-demo: экран недоступен — только демо-лендинг и игры. Гейт статичен (build-time флаг).
  if (isWebDemo()) return <Redirect href="/" />;
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const ru = language === 'ru';   // остался только для русской плюрализации (ruTrainings)

  const [stats, setStats] = React.useState<PetStats | null>(null);
  // Реплика выбирается раз на визит (не на каждый рендер) — питомец «здоровается»
  const [greeting, setGreeting] = React.useState('');

  // На фокусе, не на маунте: вернулся с тренировки → шкалы уже подросли
  useFocusEffect(
    React.useCallback(() => {
      getPetStats().then(setStats).catch(() => {});
      setGreeting(pickReaction(language));
    }, [language]),
  );

  const skillLabel = (k: keyof PetStats['skills']): string => {
    switch (k) {
      case 'memory': return t('catMemory');
      case 'attention': return t('catAttention');
      case 'logic': return t('petSkillLogic');
      case 'speed': return t('petSkillSpeed');
    }
  };

  const stage = stats?.stage ?? 1;
  const stageName = t(`petStage${stage}`);
  const total = stats?.total ?? 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {t('petName')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Пузырь-приветствие (стиль .pet-speech сайта) */}
        <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.bubbleText, { color: colors.text }]}>{greeting}</Text>
        </View>

        <SynapsePet stage={stage} size={160} />
        <Text style={[styles.stageName, { color: colors.text }]}>{stageName}</Text>
        <Text style={[styles.stageHint, { color: colors.textSecondary }]}>
          {t('petGrowsHint')}
        </Text>

        {/* Уровень + счётчик тренировок (как .pet-status на сайте) */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statusBig, { color: colors.text }]}>{stats?.level ?? 1}</Text>
            <Text style={[styles.statusSmall, { color: colors.textSecondary }]}>{t('level')}</Text>
          </View>
          <View style={[styles.statusBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statusBig, { color: colors.text }]}>{total}</Text>
            <Text style={[styles.statusSmall, { color: colors.textSecondary }]}>
              {ru ? ruTrainings(total) : t(total === 1 ? 'unitTrainingOne' : 'unitTrainings')}
            </Text>
          </View>
        </View>

        {/* 4 шкалы навыков из реальных сессий */}
        <View style={styles.skills}>
          {SKILL_ORDER.map((k) => {
            const value = stats?.skills[k] ?? 0;
            return (
              <View key={k} style={[styles.skillCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.skillTop}>
                  <Text style={[styles.skillLabel, { color: colors.text }]}>{skillLabel(k)}</Text>
                  <Text style={[styles.skillValue, { color: SKILL_COLORS[k] }]}>{value}</Text>
                </View>
                <View style={[styles.meter, { backgroundColor: colors.border }]}>
                  <View style={[styles.meterFill, { width: `${value}%`, backgroundColor: SKILL_COLORS[k] }]} />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Шапка — как на других экранах (achievements/statistics)
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', flexShrink: 1, minWidth: 0, textAlign: 'center' },
  placeholder: { width: 44 },
  scroll: { padding: 16, alignItems: 'center', maxWidth: 520, alignSelf: 'center', width: '100%', gap: 6 },
  bubble: {
    maxWidth: 260, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1,
    borderRadius: 15, borderBottomLeftRadius: 4, marginBottom: 6,
  },
  bubbleText: { fontSize: 13, fontWeight: '700', lineHeight: 18, textAlign: 'center' },
  stageName: { fontSize: 24, fontWeight: '900', marginTop: 2 },
  stageHint: { fontSize: 12.5, textAlign: 'center' },
  statusRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 6 },
  statusBox: {
    minWidth: 112, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1,
    borderRadius: 15, alignItems: 'center',
  },
  statusBig: { fontSize: 20, fontWeight: '900' },
  statusSmall: { fontSize: 11.5, marginTop: 1 },
  skills: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
  skillCard: { borderWidth: 1, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 14 },
  skillTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  skillLabel: { fontSize: 13.5, fontWeight: '700' },
  skillValue: { fontSize: 15, fontWeight: '900' },
  meter: { height: 7, borderRadius: 999, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 999 },
});
