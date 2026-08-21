/**
 * Экран лиг — «в какой я форме сейчас».
 *
 * ЗАЧЕМ. Над играми до сих пор было пусто: уровни живут внутри каждой игры отдельно, а
 * общего «куда я расту» не было. Расчёт лежит в `services/progression` и покрыт тестами;
 * здесь только показ.
 *
 * ⚠️ ЭТО НЕ ТУРНИРНАЯ ТАБЛИЦА. У конкурента лига — соревнование: попал в двадцатку,
 * поднялся. У нас в лидерборде семь игроков, и таблица на семерых врёт про масштаб —
 * человек видит это с первого экрана. Здесь лига считается по СВОИМ очкам за 30 дней.
 *
 * ⚠️ И ЭТО НЕ УРОВЕНЬ. Уровень (`services/tokens`) считается от всех очков за всё время
 * и только растёт. Лига — темп за месяц, она может и опуститься. Поэтому на экране прямо
 * написано, что падение лиги — это нормально: иначе человек воспримет его как потерю
 * достижения и обидится на приложение, а не на свой пропуск.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { getSessions } from '@/src/services/api';
import {
  LEAGUES, RANKS_PER_LEAGUE, standingFor, isLeagueReached, earnedFrames,
  seasonPointsFrom, SEASON_DAYS,
} from '@/src/services/progression';

export default function LeaguesScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [points, setPoints] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    getSessions()
      .then((s) => { if (active) setPoints(seasonPointsFrom(s)); })
      .catch(() => { if (active) setPoints(0); });
    return () => { active = false; };
  }, []));

  const pts = points ?? 0;
  const standing = standingFor(pts);
  const frames = earnedFrames(pts);
  const back = isRTLLang(language) ? 'chevron-forward' : 'chevron-back';

  // Все хуки вызваны безусловно — выходить можно.
  if (isWebDemo()) return <Redirect href="/" />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('a11yBack')}
          onPress={() => goBackOrHome()}
          style={styles.backBtn}
        >
          <Ionicons name={back as any} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('leaguesTitle')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Очки сезона первым делом: без них лестница ниже — просто список слов. */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.ptsLabel, { color: colors.textSecondary }]}>
            {t('leaguesSeasonPoints').replace('{d}', String(SEASON_DAYS))}
          </Text>
          <Text style={[styles.pts, { color: colors.text }]}>{pts}</Text>
          <Text style={[styles.rank, { color: colors.textSecondary }]}>
            {t('leaguesRank').replace('{n}', String(standing.rank)).replace('{m}', String(RANKS_PER_LEAGUE))}
          </Text>
          <Text style={[styles.toNext, { color: colors.textSecondary }]}>
            {standing.toNext === null
              ? t('leaguesTop')
              : t('leaguesToNext').replace('{n}', String(standing.toNext))}
          </Text>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('leaguesSeasonHint')}</Text>

        {LEAGUES.map((l) => {
          const reached = isLeagueReached(l.id, pts);
          const here = l.id === standing.league.id;
          return (
            <View
              key={l.id}
              accessibilityRole="text"
              accessibilityLabel={`${t(l.nameKey)}. ${here ? t('leaguesCurrent') : reached ? '' : t('leaguesLocked').replace('{n}', String(l.from))}`}
              style={[styles.row, {
                backgroundColor: colors.surface,
                borderColor: here ? (colors.primary || '#7f7fd5') : colors.border,
                borderWidth: here ? 2 : 1,
                opacity: reached ? 1 : 0.55,
              }]}
            >
              <Ionicons
                name={reached ? 'shield-checkmark' : 'lock-closed-outline'}
                size={22}
                color={here ? (colors.primary || '#7f7fd5') : colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: colors.text }]}>{t(l.nameKey)}</Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                  {here ? t('leaguesCurrent') : t('leaguesLocked').replace('{n}', String(l.from))}
                </Text>
              </View>
            </View>
          );
        })}

        {frames.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>{t('leaguesFrames')}</Text>
            <View style={styles.frames}>
              {frames.map((f) => (
                <View key={f.id} style={[styles.frame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="ribbon-outline" size={18} color={colors.primary || '#7f7fd5'} />
                  <Text style={[styles.frameName, { color: colors.text }]}>{t(f.nameKey)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {pts === 0 && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('leaguesEmpty')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  // ⚠️ Отступ снизу — общая мера занятого угла (кнопка отзыва + питомец), а не
  // подобранное число: снимок 21.08.2026 показал кнопку прямо на заголовке
  // «Заработанные рамки» и на плашке лиги, а питомца — на нижней строке.
  body: { padding: 16, gap: 10, paddingBottom: FAB_CLEARANCE },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 2 },
  ptsLabel: { fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase' },
  pts: { fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rank: { fontSize: 14, fontWeight: '700' },
  toNext: { fontSize: 13, marginTop: 2 },
  hint: { fontSize: 13, lineHeight: 19, marginVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14 },
  rowName: { fontSize: 16, fontWeight: '800' },
  rowSub: { fontSize: 12.5, marginTop: 2 },
  section: { fontSize: 15, fontWeight: '800', marginTop: 14 },
  frames: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  frame: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 12 },
  frameName: { fontSize: 13, fontWeight: '700' },
});
