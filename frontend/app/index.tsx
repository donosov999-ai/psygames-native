import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import GameCard from '@/src/components/GameCard';
import { GAMES, CATEGORY_ORDER, CATEGORY_META, GameCategory, GameConfig } from '@/src/constants/games';
import { filterAllowedGames } from '@/src/constants/profiles';
import {
  buildMorningWarmupPlaylist, getCurrentWeekday, loadWarmupHistory, computeStreak, WarmupHistoryEntry,
  getFinancialCooldown, FINANCIAL_COOLDOWN_DAYS,
} from '@/src/services/warmup';
import { getAssessmentStatus } from '@/src/services/assessment';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnlocked } from '@/src/services/achievements';
import { ACHIEVEMENTS } from '@/src/services/achievements';

const MAX_CONTAINER_WIDTH = 1100;
const CONTAINER_PADDING = 16;
const GRID_GAP = 12;

export default function HomeScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const warmup = useWarmup();
  const { profile } = useProfile();
  const { width: winWidth } = useWindowDimensions();
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [history, setHistory] = useState<WarmupHistoryEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [finCooldown, setFinCooldown] = useState<{ ready: boolean; daysLeft: number; lastDate: string | null }>({ ready: true, daysLeft: 0, lastDate: null });
  const [assessStatus, setAssessStatus] = useState<{ hasAssessment: boolean; daysSince: number | null; lastDate: string | null }>({ hasAssessment: false, daysSince: null, lastDate: null });

  const [achievementsCount, setAchievementsCount] = useState(0);

  useEffect(() => {
    (async () => {
      // First-time onboarding gate
      try {
        const onboarded = await AsyncStorage.getItem('psygames_onboarded');
        if (onboarded !== 'true') {
          router.replace('/onboarding' as any);
          return;
        }
      } catch {}

      const h = await loadWarmupHistory();
      setHistory(h);
      setStreak(computeStreak(h));
      const fc = await getFinancialCooldown();
      setFinCooldown(fc);
      const as = await getAssessmentStatus();
      setAssessStatus(as);
      const unlocked = await getUnlocked();
      setAchievementsCount(unlocked.length);
    })();
  }, []);

  // Container width sizing
  const containerWidth = Math.min(winWidth, MAX_CONTAINER_WIDTH) - CONTAINER_PADDING * 2;
  const cols = containerWidth >= 880 ? 5 : containerWidth >= 700 ? 4 : containerWidth >= 520 ? 3 : 2;
  const cardWidth = Math.floor((containerWidth - GRID_GAP * (cols - 1)) / cols);
  const cardHeight = Math.round(cardWidth * 1.2);

  // E1: filter games by active profile + hide games merged into group cards
  const visibleGames = useMemo(
    () => filterAllowedGames(profile).filter((g) => !g.hideFromMenu),
    [profile],
  );

  const grouped = useMemo(() => {
    const map: Record<GameCategory, GameConfig[]> = {
      memory: [], attention: [], logic: [], action: [],
    };
    for (const g of visibleGames) map[g.category].push(g);
    return map;
  }, [visibleGames]);

  // Preview the playlist for current weekday
  const todayPreview = useMemo(() => {
    return buildMorningWarmupPlaylist({ duration, weekday: getCurrentWeekday() });
  }, [duration]);

  const lastScore = history.length > 0 ? history[history.length - 1].total_score : 0;
  const bestScore = history.length > 0 ? Math.max(...history.map((h) => h.total_score)) : 0;

  const startWarmup = () => {
    warmup.startWarmup(duration);
  };

  const isRest = todayPreview.track === 'rest';
  const isMeasurement = todayPreview.track.startsWith('measure');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>
            PsyGames
            <Text style={{ color: profile.color, fontSize: 16 }}>  {profile.emoji} {profile.display_name}</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('trainYourBrain')}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/achievements' as any)}
          >
            <Ionicons name="trophy" size={20} color="#fbbf24" />
            {achievementsCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#fbbf24', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ color: '#000', fontSize: 10, fontWeight: '900' }}>{achievementsCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/statistics')}
          >
            <Ionicons name="stats-chart" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.gamesContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* === 3 HERO CARDS in a row (compact) === (each gated by profile) */}
        {(profile.warmup_enabled || profile.assessment_enabled || profile.financial_brain_day_enabled) && (
        <View style={styles.heroRow}>

          {/* CARD 1: Утренняя зарядка */}
          {profile.warmup_enabled && (
          <TouchableOpacity
            style={styles.heroCardWrap}
            onPress={isRest ? undefined : startWarmup}
            disabled={isRest}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={isMeasurement ? ['#ee0979', '#ff6a00'] : isRest ? ['#475569', '#64748b'] : ['#fbbf24', '#f59e0b']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <Ionicons name="flash" size={22} color={isRest ? '#FFF' : '#000'} />
                {streak > 0 && (
                  <View style={styles.heroChipMini}>
                    <Text style={styles.heroChipMiniText}>🔥{streak}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: isRest ? '#FFF' : '#000' }]}>ЗАРЯДКА</Text>
              <Text style={[styles.heroSub, { color: isRest ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)' }]} numberOfLines={2}>
                {isRest
                  ? 'Brain Workshop день'
                  : `${todayPreview.steps.length} ${todayPreview.steps.length === 1 ? 'игра' : 'игр'} · ~${Math.round(todayPreview.est_total_sec / 60)} мин`}
              </Text>
              {!isRest && (
                <View style={styles.heroCta}>
                  <Ionicons name="play" size={14} color="#fbbf24" />
                  <Text style={styles.heroCtaText}>СТАРТ</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
          )}

          {/* CARD 2: Assessment (профиль) */}
          {profile.assessment_enabled && (
          <TouchableOpacity
            style={styles.heroCardWrap}
            onPress={() => warmup.startAssessment()}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#7c3aed', '#ec4899']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <Ionicons name="locate" size={22} color="#FFF" />
                {assessStatus.hasAssessment ? (
                  <View style={[styles.heroChipMini, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#FFF' }]}>
                      {assessStatus.daysSince === 0 ? '✓' : `${assessStatus.daysSince}д`}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.heroChipMini, { backgroundColor: '#fbbf24' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#000' }]}>★</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]}>ПРОФИЛЬ</Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={2}>
                12 тестов · ~12 мин
              </Text>
              <View style={[styles.heroCta, { backgroundColor: '#000' }]}>
                <Ionicons name="play" size={14} color="#ec4899" />
                <Text style={[styles.heroCtaText, { color: '#ec4899' }]}>
                  {assessStatus.hasAssessment ? 'ПОВТОР' : 'СТАРТ'}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
          )}

          {/* CARD 3: Financial Brain Day */}
          {profile.financial_brain_day_enabled && (
          <TouchableOpacity
            style={styles.heroCardWrap}
            onPress={finCooldown.ready ? () => warmup.startFinancialBattery() : undefined}
            disabled={!finCooldown.ready}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={finCooldown.ready ? ['#22c55e', '#0d9488'] : ['#475569', '#64748b']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <Ionicons name="cash" size={22} color="#FFF" />
                {finCooldown.ready ? (
                  <View style={[styles.heroChipMini, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#FFF' }]}>🟢</Text>
                  </View>
                ) : (
                  <View style={[styles.heroChipMini, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#FFF' }]}>⏳{finCooldown.daysLeft}д</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]}>FIN BRAIN</Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={2}>
                Iowa→BART→PRL · ~25 мин
              </Text>
              {finCooldown.ready ? (
                <View style={[styles.heroCta, { backgroundColor: '#000' }]}>
                  <Ionicons name="play" size={14} color="#22c55e" />
                  <Text style={[styles.heroCtaText, { color: '#22c55e' }]}>СТАРТ</Text>
                </View>
              ) : (
                <View style={[styles.heroCta, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                  <Text style={[styles.heroCtaText, { color: 'rgba(255,255,255,0.75)' }]}>
                    ЖДЁМ
                  </Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
          )}

        </View>
        )}

        {/* === Manual category sections === */}
        {CATEGORY_ORDER.map((cat) => {
          const games = grouped[cat];
          if (!games.length) return null;
          const meta = CATEGORY_META[cat];
          return (
            <View key={cat} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: meta.color }]} />
                <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t(meta.titleKey)}
                </Text>
                <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
                  {games.length}
                </Text>
              </View>
              <View style={[styles.gamesGrid, { gap: GRID_GAP }]}>
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    nameKey={game.nameKey}
                    descKey={game.descKey}
                    skillKey={game.skillKey}
                    gradient={game.gradient}
                    icon={game.icon}
                    width={cardWidth}
                    height={cardHeight}
                    onPress={() => router.push(game.route as any)}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxWidth: MAX_CONTAINER_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 4 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  gamesContainer: {
    paddingHorizontal: CONTAINER_PADDING,
    paddingBottom: 32,
    maxWidth: MAX_CONTAINER_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },

  // Compact 3-hero-card row (2026-05-17)
  heroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
    alignItems: 'stretch',
  },
  heroCardWrap: {
    flex: 1,
    minWidth: 0,   // allow shrinking on narrow screens
  },
  heroCard: {
    padding: 12,
    borderRadius: 14,
    gap: 6,
    minHeight: 130,
    justifyContent: 'space-between',
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroChipMini: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 22,
    alignItems: 'center',
  },
  heroChipMiniText: { color: '#000', fontWeight: '900', fontSize: 10 },
  heroTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  heroSub: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  heroCta: {
    backgroundColor: '#000',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  heroCtaText: { color: '#fbbf24', fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  // Warmup block (LEGACY — used by other places, keep)
  warmupBlock: {
    padding: 20,
    borderRadius: 18,
    marginBottom: 24,
    gap: 12,
  },
  warmupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  warmupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  warmupTitle: { color: '#000', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  streakChip: { backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  streakChipText: { color: '#000', fontWeight: '900', fontSize: 13 },
  warmupDesc: { color: 'rgba(0,0,0,0.85)', fontSize: 13, fontWeight: '600' },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  durationText: { fontSize: 14, fontWeight: '800' },
  startBtn: { backgroundColor: '#000', borderRadius: 10, marginTop: 4 },
  startBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  startBtnText: { color: '#fbbf24', fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  statsLine: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 4 },
  statsText: { color: 'rgba(0,0,0,0.7)', fontSize: 12, fontWeight: '600' },
  statsBold: { fontWeight: '900', color: '#000' },

  // Sections
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 4 },
  sectionDot: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  sectionCount: { fontSize: 13, fontWeight: '600' },
  gamesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
});
