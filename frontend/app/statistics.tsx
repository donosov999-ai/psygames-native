import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { getAllStats, GameStats, getSessions } from '@/src/services/api';
import { getTokens, levelInfo, getStreak } from '@/src/services/tokens';
import { GAMES } from '@/src/constants/games';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfile } from '@/src/contexts/ProfileContext';
import { isGameAllowed } from '@/src/constants/profiles';

export default function StatisticsScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [stats, setStats] = useState<GameStats[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useProfile();
  const [scopeAll, setScopeAll] = useState(false);  // false = текущий профиль, true = все игры
  const [tokens, setTokens] = useState(0);          // D1: токены/уровень/стрик в герое
  const [streakDays, setStreakDays] = useState(0);
  const [sessionsByGame, setSessionsByGame] = useState<Record<string, number[]>>({});  // D1.2: тренды очков

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const allStats = await getAllStats();
      setStats(allStats);
      if (profile?.id) { setTokens(await getTokens(profile.id)); setStreakDays(await getStreak(profile.id)); }
      // D1.2: сгруппировать очки по играм в хронологии для спарклайнов
      const allSessions = await getSessions();
      const byGame: Record<string, number[]> = {};
      for (const s of allSessions) {
        if (!s.game_type) continue;
        (byGame[s.game_type] ||= []).push(typeof s.score === 'number' && isFinite(s.score) ? s.score : 0);
      }
      setSessionsByGame(byGame);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    // защита от мусора: таймстамп-баг (startTime=0 → Date.now()/1000 ≈ 1.78e9), NaN, отрицательное, >24ч
    if (seconds == null || !isFinite(seconds) || seconds < 0 || seconds > 86400) return '—';
    if (seconds === 0) return '—';
    if (seconds < 1) return `${seconds.toFixed(1)}s`;   // реакционные игры — доли секунды (было «0s»)
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  const getGameConfig = (gameType: string) => {
    return GAMES.find((g) => g.id === gameType);
  };

  // D1: агрегаты прогресса для героя
  const lvl = levelInfo(tokens);
  const totalGames = stats.reduce((s, x) => s + x.total_sessions, 0);
  const totalTime = stats.reduce((s, x) => s + (isFinite(x.total_time) && x.total_time > 0 && x.total_time <= 86400 * 365 ? x.total_time : 0), 0);
  const formatTotal = (s: number) => s >= 3600 ? `${(s / 3600).toFixed(1)}${language === 'ru' ? 'ч' : 'h'}` : `${Math.round(s / 60)}${language === 'ru' ? 'м' : 'm'}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('statistics')}</Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={loadStats}
        >
          <Ionicons name="refresh" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* v1.15.0: scope toggle — статистика этого профиля vs все игры */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 10 }}>
        <TouchableOpacity
          onPress={() => setScopeAll(false)}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
            backgroundColor: !scopeAll ? colors.primary : colors.surface,
            borderWidth: 1, borderColor: !scopeAll ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: !scopeAll ? '#fff' : colors.text }}>
            {profile.emoji} {t('profileName_' + profile.id)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setScopeAll(true)}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
            backgroundColor: scopeAll ? colors.primary : colors.surface,
            borderWidth: 1, borderColor: scopeAll ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: scopeAll ? '#fff' : colors.text }}>
            {language === 'ru' ? 'Все игры' : 'All games'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Истинный total по всем играм (не зависит от фильтра профиля) — чтобы было видно
          реальное число сыгранного, а не только игры текущего профиля. Считаются ЗАВЕРШЁННЫЕ
          сессии (брошенные на середине не сохраняются). */}
      {!loading && (
        <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
          {language === 'ru' ? 'Всего сыграно: ' : 'Total played: '}
          {stats.reduce((sum, s) => sum + s.total_sessions, 0)}
          {language === 'ru' ? ' игр (завершённых)' : ' games (completed)'}
        </Text>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* D1: Прогресс-герой — токены/уровень/стрик + итоги (связь с геймификацией T1/T2) */}
          <LinearGradient colors={[colors.primary, colors.primary + 'bb']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 18, padding: 16, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>⭐</Text>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{tokens}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>{language === 'ru' ? 'Очки' : 'Tokens'}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 2 }}>Lv {lvl.level}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' }}>{language === 'ru' ? lvl.titleRu : lvl.titleEn}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>🔥</Text>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{streakDays}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>{language === 'ru' ? 'Стрик' : 'Streak'}</Text>
              </View>
            </View>
            {lvl.span !== null && (
              <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 12, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(lvl.progress * 100)}%`, height: 6, backgroundColor: '#fff' }} />
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{totalGames} {language === 'ru' ? 'игр сыграно' : 'games played'}</Text>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{formatTotal(totalTime)} {language === 'ru' ? 'в игре' : 'in game'}</Text>
            </View>
          </LinearGradient>
          {/* v1.13.4: фильтр — показывать только реально пройденные игры,
              а не пустые карточки для всех 48+. Денис: «лишняя инфа».
              Раньше .map() рендерил все 48 stats включая нулевые. */}
          {stats.filter(s => s.total_sessions > 0 && (scopeAll || isGameAllowed(profile, s.game_type))).map((stat) => {
            const gameConfig = getGameConfig(stat.game_type);
            if (!gameConfig) return null;

            return (
              <View key={stat.game_type} style={styles.statCard}>
                <LinearGradient
                  colors={gameConfig.gradient as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.cardHeader}
                >
                  <Ionicons name={gameConfig.icon as any} size={24} color="#FFFFFF" />
                  <Text style={styles.cardTitle}>{t(gameConfig.nameKey)}</Text>
                </LinearGradient>
                <View style={[styles.cardBody, { backgroundColor: colors.surface }]}>
                  <View style={styles.statRow}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('totalGames')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {stat.total_sessions}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('bestTime')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {stat.best_results.length > 0
                          ? formatTime(stat.best_results[0].time_seconds)
                          : '-'}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('averageTime')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {formatTime(stat.average_time)}
                      </Text>
                    </View>
                  </View>
                  {(sessionsByGame[stat.game_type]?.length ?? 0) >= 2 && (() => {
                    const arr = sessionsByGame[stat.game_type];
                    const best = Math.max(...arr);
                    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
                    const caption = best > 0
                      ? (language === 'ru' ? `Очки — рекорд ${best} · ⌀ ${avg}` : `Score — best ${best} · avg ${avg}`)
                      : (language === 'ru' ? 'Динамика — последние игры' : 'Trend — recent games');
                    return (
                      <View>
                        <Text style={[styles.statLabel, { color: colors.textSecondary, marginTop: 12 }]}>{caption}</Text>
                        <Sparkline data={arr.slice(-12)} color={(gameConfig.gradient as string[])[1]} />
                      </View>
                    );
                  })()}
                </View>
              </View>
            );
          })}

          {stats.every((s) => s.total_sessions === 0) && (
            <View style={styles.emptyState}>
              <Ionicons name="bar-chart-outline" size={64} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('language') === 'ru'
                  ? 'Сыграйте несколько игр, чтобы увидеть статистику'
                  : 'Play some games to see statistics'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// D1.2: мини-спарклайн тренда очков (бары; нормализация min..max; ramp прозрачности старое→свежее)
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 26, gap: 2, marginTop: 6 }}>
      {data.map((v, i) => {
        const h = 5 + Math.round(((v - min) / span) * 19);
        const op = 0.35 + 0.65 * (i / (data.length - 1));
        return <View key={i} style={{ flex: 1, height: h, backgroundColor: color, borderRadius: 2, opacity: op }} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    marginBottom: 16,
  },
  statCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardBody: {
    padding: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
