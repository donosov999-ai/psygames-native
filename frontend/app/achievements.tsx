import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { ACHIEVEMENTS, getUnlocked, UnlockedRecord } from '@/src/services/achievements';

export default function AchievementsScreen() {
  const { colors } = useTheme();
  const { language } = useLanguage() as any;
  const router = useRouter();
  const [unlocked, setUnlocked] = useState<UnlockedRecord[]>([]);

  useEffect(() => {
    (async () => setUnlocked(await getUnlocked()))();
  }, []);

  const unlockedSet = new Set(unlocked.map(u => u.id));

  const grouped = ACHIEVEMENTS.reduce((acc, a) => {
    if (!acc[a.category]) acc[a.category] = [];
    acc[a.category].push(a);
    return acc;
  }, {} as Record<string, typeof ACHIEVEMENTS>);

  const CATEGORIES = [
    { key: 'milestone', label_ru: '🏁 Вехи', label_en: '🏁 Milestones' },
    { key: 'volume',    label_ru: '🎮 Объём', label_en: '🎮 Volume' },
    { key: 'streak',    label_ru: '🔥 Серии', label_en: '🔥 Streaks' },
    { key: 'breadth',   label_ru: '🌈 Разнообразие', label_en: '🌈 Breadth' },
    { key: 'quality',   label_ru: '⭐ Качество', label_en: '⭐ Quality' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        {/* flexShrink+numberOfLines: длинный заголовок со счётчиком при крупном шрифте не толкает кнопку за край */}
        <Text style={[styles.title, { color: colors.text, flexShrink: 1, minWidth: 0, textAlign: 'center' }]} numberOfLines={1}>
          🏆 {language === 'en' ? 'Achievements' : 'Достижения'} {unlocked.length}/{ACHIEVEMENTS.length}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {CATEGORIES.map(cat => (
          <View key={cat.key} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {language === 'en' ? cat.label_en : cat.label_ru}
            </Text>
            <View style={styles.grid}>
              {(grouped[cat.key] || []).map(a => {
                const isUnlocked = unlockedSet.has(a.id);
                const date = unlocked.find(u => u.id === a.id)?.date;
                return (
                  <View key={a.id} style={[styles.card, {
                    backgroundColor: colors.surface,
                    opacity: isUnlocked ? 1 : 0.4,
                    borderColor: isUnlocked ? '#fbbf24' : colors.border,
                  }]}>
                    <Text style={[styles.cardEmoji, { opacity: isUnlocked ? 1 : 0.5 }]}>{a.emoji}</Text>
                    <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                      {language === 'en' ? a.name_en : a.name_ru}
                    </Text>
                    <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                      {language === 'en' ? a.desc_en : a.desc_ru}
                    </Text>
                    {date && (
                      <Text style={[styles.cardDate, { color: '#fbbf24' }]}>{date}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          {language === 'en'
            ? `Achievements are checked after each game. ${ACHIEVEMENTS.length - unlocked.length} left.`
            : `Достижения проверяются после каждой игры. ${ACHIEVEMENTS.length - unlocked.length} осталось.`}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  placeholder: { width: 44 },
  scroll: { padding: 16, gap: 18, maxWidth: 720, alignSelf: 'center', width: '100%' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  card: { width: 145, padding: 12, borderRadius: 12, borderWidth: 2, alignItems: 'center', gap: 4, minHeight: 130 },
  cardEmoji: { fontSize: 32 },
  cardName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cardDesc: { fontSize: 10, textAlign: 'center', lineHeight: 13 },
  cardDate: { fontSize: 10, fontWeight: '700', marginTop: 4 },
  footer: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', marginTop: 12 },
});
