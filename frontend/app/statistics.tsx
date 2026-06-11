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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { getAllStats, GameStats } from '@/src/services/api';
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

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const allStats = await getAllStats();
      setStats(allStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '-';
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => router.back()}
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
