/* psygames-collection-screen · VER 1 · 03.09.2026 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { FIGURES, chestState, earnedTotal } from '@/src/services/collection';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';

/**
 * ВИТРИНА КОЛЛЕКЦИИ — задача 6e564484, шаг 2 «место, куда возвращаешься».
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ЭКРАН. Сундук на главной говорил «собрано 3 из 12», а
 * посмотреть на эти три было НЕГДЕ. Цель оставалась числом, хотя у эталона она
 * предметная: двенадцать силуэтов на полках, и заполненные видно. Число «3/12»
 * не даёт того, что даёт полка с тремя вещами и девятью пустыми местами.
 *
 * ⚠️ ПУСТАЯ ПОЛКА ПОДПИСАНА. Силуэт без имени — просто дырка; с именем и ценой
 * («Компас · откроется на ⭐3260») он становится обещанием. Поэтому имена всех
 * двенадцати переведены, а не только собранных.
 *
 * ⚠️ ЭКРАН ТОЛЬКО ЧИТАЕТ. Ни одной кнопки, меняющей состояние: коллекция растёт
 * от игры, а не от нажатий здесь. Это место, а не панель управления.
 */
export default function CollectionScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { profile } = useProfile();
  const [заработано, setЗаработано] = useState(0);

  useFocusEffect(useCallback(() => {
    let жив = true;
    (async () => {
      if (!profile?.id) { if (жив) setЗаработано(0); return; }
      const n = await earnedTotal(profile.id).catch(() => 0);
      if (жив) setЗаработано(n);
    })();
    return () => { жив = false; };
  }, [profile?.id]));

  const сундук = chestState(заработано);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Выход закреплён сверху и не прокручивается — см. onboarding-exit-visible. */}
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('a11yBack')}
          testID="collection-exit"
          onPress={() => router.back()}
          style={styles.exit}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('collectionTitle')}</Text>
        <View style={styles.exit} />
      </View>

      {/* Низ занят кнопкой отзыва и питомцем — отступ берём из общей величины,
          а не подбираем на глаз (правило гейта fab-clearance). */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: FAB_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {t('collectionSub')
            .replace('{have}', String(сундук.have))
            .replace('{all}', String(FIGURES.length))
            .replace('{earned}', String(заработано))}
        </Text>

        <View style={styles.shelf}>
          {FIGURES.map((f, i) => {
            const собрана = i < сундук.have;
            const имя = t(`fig${f.key}`);
            return (
              <View
                key={f.key}
                testID={собрана ? 'figure-owned' : 'figure-locked'}
                accessibilityLabel={собрана ? имя : `${имя} — ${t('collectionLocked').replace('{n}', String(f.at))}`}
                style={[styles.slot, {
                  backgroundColor: colors.surface,
                  borderColor: собрана ? colors.primary : colors.border,
                  opacity: собрана ? 1 : 0.55,
                }]}
              >
                {/* Несобранная показана тем же символом, но погашенным: силуэт
                    должен быть УЗНАВАЕМ, иначе обещание не читается. */}
                <Text style={[styles.face, собрана ? null : styles.faceLocked]}>{f.face}</Text>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{имя}</Text>
                <Text style={[styles.price, { color: colors.textSecondary }]} numberOfLines={1}>
                  {собрана ? `⭐${f.at}` : t('collectionLocked').replace('{n}', String(f.at))}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  exit: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  scroll: { padding: 12, gap: 12 },
  sub: { fontSize: 13, textAlign: 'center' },
  /** Полки: сетка с переносом. Ширина слота фиксирована — иначе последний ряд растянется. */
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  slot: { width: 104, minHeight: 120, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 10 },
  face: { fontSize: 38 },
  /** Погашенный силуэт: форму видно, «наполненности» нет. */
  faceLocked: { opacity: 0.35 },
  name: { fontSize: 13, fontWeight: '700' },
  price: { fontSize: 11, fontWeight: '600' },
});
