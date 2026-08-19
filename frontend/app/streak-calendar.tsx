import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import {
  completedWarmupDateKeys,
  computeLongestStreak,
  computeStreak,
  loadWarmupHistory,
  localDateKey,
  WarmupHistoryEntry,
} from '@/src/services/warmup';

const LOCALES: Record<string, string> = {
  ru: 'ru-RU', en: 'en-US', es: 'es-ES', pt: 'pt-BR', hi: 'hi-IN', zh: 'zh-CN',
  de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar',
};

function monthCells(month: Date): Array<number | null> {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const mondayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const total = Math.ceil((mondayOffset + days) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = index - mondayOffset + 1;
    return day >= 1 && day <= days ? day : null;
  });
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftedDateKey(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + delta);
  return localDateKey(next);
}

export default function StreakCalendarScreen() {
  if (isWebDemo()) return <Redirect href="/" />;
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [history, setHistory] = useState<WarmupHistoryEntry[]>([]);
  const [shownMonth, setShownMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    loadWarmupHistory().then((items) => { if (active) setHistory(items); });
    return () => { active = false; };
  }, []));

  const locale = LOCALES[language] || 'en-US';
  const days = useMemo(() => new Set(completedWarmupDateKeys(history)), [history]);
  const cells = useMemo(() => monthCells(shownMonth), [shownMonth]);
  const currentStreak = computeStreak(history);
  const bestStreak = computeLongestStreak(history);
  const now = new Date();
  const isCurrentMonth = shownMonth.getFullYear() === now.getFullYear()
    && shownMonth.getMonth() === now.getMonth();
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(shownMonth);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => (
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + index))
  )), [locale]);

  const moveMonth = (delta: number) => {
    setShownMonth((value) => new Date(value.getFullYear(), value.getMonth() + delta, 1));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('a11yBack')}
          style={[styles.headerButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          🔥 {t('streakCalendarTitle')}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.metrics}>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.metricEmoji}>🔥</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{currentStreak}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('streakCurrent')}</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: '#f97316' }]}>
            <Text style={styles.metricEmoji}>🏆</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{bestStreak}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('personalBest')}</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.metricEmoji}>📅</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{days.size}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('streakTrainingDays')}</Text>
          </View>
        </View>

        <Text style={[styles.bestCaption, { color: colors.textSecondary }]}>
          {t('streakBestCaption')}
        </Text>

        <View style={[styles.calendarCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('streakPreviousMonth')}
              onPress={() => moveMonth(-1)}
              style={[styles.monthButton, { backgroundColor: colors.background }]}
            >
              <Ionicons name={isRTLLang(language) ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.text }]}>{monthTitle}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('streakNextMonth')}
              accessibilityState={{ disabled: isCurrentMonth }}
              disabled={isCurrentMonth}
              onPress={() => moveMonth(1)}
              style={[styles.monthButton, { backgroundColor: colors.background, opacity: isCurrentMonth ? 0.28 : 1 }]}
            >
              <Ionicons name={isRTLLang(language) ? 'chevron-back' : 'chevron-forward'} size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {weekdays.map((weekday, index) => (
              <Text key={`${weekday}-${index}`} style={[styles.weekday, { color: colors.textSecondary }]}>{weekday}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {cells.map((day, index) => {
              if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const key = dateKey(shownMonth.getFullYear(), shownMonth.getMonth(), day);
              const trained = days.has(key);
              const column = index % 7;
              const connectLeft = trained && column > 0 && days.has(shiftedDateKey(key, -1));
              const connectRight = trained && column < 6 && days.has(shiftedDateKey(key, 1));
              const isToday = key === localDateKey(now);
              const spokenDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
                .format(new Date(shownMonth.getFullYear(), shownMonth.getMonth(), day));
              return (
                <View
                  key={key}
                  style={styles.dayCell}
                  accessible
                  accessibilityLabel={`${spokenDate}. ${t(trained ? 'streakTrainingDay' : 'streakNoTraining')}`}
                >
                  {connectLeft && <View style={[styles.streakStrip, styles.stripLeft]} />}
                  {connectRight && <View style={[styles.streakStrip, styles.stripRight]} />}
                  <View style={[
                    styles.dayCircle,
                    trained && styles.trainedDay,
                    isToday && { borderColor: colors.primary, borderWidth: 2 },
                  ]}>
                    <Text style={[styles.dayNumber, { color: trained ? '#fff' : colors.text }]}>{day}</Text>
                    {trained && <Text style={styles.fire}>🔥</Text>}
                  </View>
                </View>
              );
            })}
          </View>

          {days.size === 0 && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('streakEmpty')}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  headerPlaceholder: { width: 44 },
  title: { fontSize: 19, fontWeight: '900', flexShrink: 1, textAlign: 'center' },
  scroll: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 96, gap: 12 },
  metrics: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, minWidth: 0, minHeight: 112, borderRadius: 16, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  metricEmoji: { fontSize: 22 },
  metricValue: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  metricLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  bestCaption: { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
  calendarCard: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 10, paddingTop: 14, paddingBottom: 18, overflow: 'hidden' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 14 },
  monthButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center', flexShrink: 1, paddingHorizontal: 8 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', height: 50, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  streakStrip: { position: 'absolute', top: 21, height: 8, backgroundColor: '#fb923c66' },
  stripLeft: { left: 0, right: '50%' },
  stripRight: { left: '50%', right: 0 },
  dayCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  trainedDay: { backgroundColor: '#f97316', shadowColor: '#f97316', shadowOpacity: 0.28, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  dayNumber: { fontSize: 14, fontWeight: '800', marginTop: -5 },
  fire: { position: 'absolute', bottom: 1, fontSize: 11 },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 18, marginTop: 12, paddingHorizontal: 16 },
});
