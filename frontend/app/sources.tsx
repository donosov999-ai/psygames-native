/**
 * ЭКРАН «ИСТОЧНИКИ» — где взяты данные и графика, и на каких условиях.
 *
 * Появился 04.09.2026 вместе с китайским словарём (задача b8ea8ac8): лицензия
 * источника обязана быть видна человеку, а не лежать в репозитории. Заодно
 * закрыл давнюю дыру — уведомление BSD-3 о шахматных фигурах существовало
 * константой и нигде не показывалось.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { SOURCES } from '@/src/constants/sources';
import { VOICE_LIVE_CREDITS } from '@/src/constants/voiceLive.generated';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';

export default function SourcesScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('sourcesTitle')}</Text>
      </View>

      {/* Отступ снизу — по общей константе: угол занят кнопкой отзыва и питомцем. */}
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: FAB_CLEARANCE }]}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t('sourcesIntro')}</Text>
        {SOURCES.map((и) => (
          <View key={и.name} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.name, { color: colors.text }]}>{и.name}</Text>
            <Text style={[styles.what, { color: colors.textSecondary }]}>{t(и.key)}</Text>
            <View style={styles.row}>
              <Text style={[styles.license, { color: colors.primary }]}>{и.license}</Text>
              {и.credit ? <Text style={[styles.credit, { color: colors.textSecondary }]}>· {и.credit}</Text> : null}
            </View>
            <TouchableOpacity
              accessibilityRole="link"
              accessibilityLabel={и.url}
              onPress={() => Linking.openURL(и.url).catch(() => {})}
              style={styles.linkBtn}
            >
              <Text style={[styles.link, { color: colors.primary }]} numberOfLines={1}>{и.url}</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/*
          🔴 ИМЕНА ЧТЕЦОВ — ЧАСТЬ ЛИЦЕНЗИИ, А НЕ ПРИЛОЖЕНИЕ К НЕЙ. CC BY и CC BY-SA
          разрешают распространять записи, в том числе за деньги, ровно при одном
          условии: назвать автора. Список приезжает из того же файла, что и сам
          корпус (`voiceLive.generated`), поэтому разъехаться с записями не может:
          сгенерированы одним проходом скрипта.
        */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.name, { color: colors.text }]}>{t('voiceCreditsTitle')}</Text>
          {VOICE_LIVE_CREDITS.map((к) => (
            <View key={`${к.author}·${к.license}`} style={styles.row}>
              <Text style={[styles.credit, { color: colors.text }]}>{к.author}</Text>
              <Text style={[styles.license, { color: colors.primary }]}>{к.license}</Text>
              <Text style={[styles.what, { color: colors.textSecondary }]}>· {к.count}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  // 48 — норма цели нажатия: экран проходит тот же аудит, что и остальные.
  backBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800' },
  list: { padding: 16, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  name: { fontSize: 16, fontWeight: '800' },
  what: { fontSize: 14, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  license: { fontSize: 13, fontWeight: '800' },
  credit: { fontSize: 13, fontWeight: '600' },
  linkBtn: { minHeight: 48, justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600' },
});
