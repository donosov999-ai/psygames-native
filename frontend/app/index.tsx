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
      memory: [], attention: [], logic: [], control: [], math: [], speed: [],
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
        {/* === BIG WARMUP BLOCK === (gated by profile) */}
        {profile.warmup_enabled && (
        <LinearGradient
          colors={isMeasurement ? ['#ee0979', '#ff6a00'] : isRest ? ['#475569', '#64748b'] : ['#fbbf24', '#f59e0b']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.warmupBlock}
        >
          <View style={styles.warmupHeader}>
            <View style={styles.warmupTitleRow}>
              <Ionicons name="flash" size={28} color="#000" />
              <Text style={styles.warmupTitle}>УТРЕННЯЯ ЗАРЯДКА</Text>
            </View>
            {streak > 0 && (
              <View style={styles.streakChip}>
                <Text style={styles.streakChipText}>🔥 {streak}</Text>
              </View>
            )}
          </View>

          {isRest ? (
            <Text style={styles.warmupDesc}>
              Сегодня СРЕДА — Brain Workshop день. PsyGames-зарядка пропущена.
            </Text>
          ) : (
            <Text style={styles.warmupDesc}>
              {todayPreview.weekday_name} · {todayPreview.steps.length} {todayPreview.steps.length === 1 ? 'игра' : 'игр'} · ~{Math.round(todayPreview.est_total_sec / 60)} мин · {todayPreview.track_label}
            </Text>
          )}

          {!isRest && (
            <>
              {/* Duration buttons */}
              <View style={styles.durationRow}>
                {([5, 10, 15] as const).map((d) => {
                  const active = duration === d;
                  const disabled = isMeasurement && d !== 10; // measurement is fixed ~10
                  return (
                    <TouchableOpacity
                      key={d}
                      disabled={disabled}
                      style={[styles.durationBtn, {
                        backgroundColor: active ? '#000' : 'rgba(0,0,0,0.15)',
                        opacity: disabled ? 0.4 : 1,
                      }]}
                      onPress={() => setDuration(d)}
                    >
                      <Text style={[styles.durationText, { color: active ? '#fbbf24' : '#000' }]}>{d} мин</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Start button */}
              <TouchableOpacity style={styles.startBtn} onPress={startWarmup}>
                <View style={styles.startBtnInner}>
                  <Ionicons name="play" size={22} color="#fbbf24" />
                  <Text style={styles.startBtnText}>СТАРТ</Text>
                </View>
              </TouchableOpacity>

              {/* Stats line */}
              {(lastScore > 0 || bestScore > 0) && (
                <View style={styles.statsLine}>
                  {lastScore > 0 && <Text style={styles.statsText}>Last: <Text style={styles.statsBold}>{lastScore}</Text></Text>}
                  {bestScore > 0 && <Text style={styles.statsText}>Best: <Text style={styles.statsBold}>{bestScore}</Text></Text>}
                </View>
              )}
            </>
          )}
        </LinearGradient>
        )}

        {/* === ASSESSMENT (G1) === (gated by profile) */}
        {profile.assessment_enabled && (
        <LinearGradient
          colors={['#7c3aed', '#ec4899']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.warmupBlock}
        >
          <View style={styles.warmupHeader}>
            <View style={styles.warmupTitleRow}>
              <Ionicons name="locate" size={26} color="#FFF" />
              <Text style={[styles.warmupTitle, { color: '#FFF' }]}>ОЦЕНИТЬ ПРОФИЛЬ</Text>
            </View>
            {assessStatus.hasAssessment ? (
              <View style={[styles.streakChip, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                <Text style={[styles.streakChipText, { color: '#FFF' }]}>
                  {assessStatus.daysSince === 0 ? 'сегодня' : `${assessStatus.daysSince} дн назад`}
                </Text>
              </View>
            ) : (
              <View style={[styles.streakChip, { backgroundColor: '#fbbf24' }]}>
                <Text style={[styles.streakChipText, { color: '#000' }]}>★ НОВОЕ</Text>
              </View>
            )}
          </View>
          <Text style={[styles.warmupDesc, { color: 'rgba(255,255,255,0.9)' }]}>
            12 коротких тестов · ~12 мин · radar chart сильных/слабых доменов
          </Text>
          <TouchableOpacity style={[styles.startBtn, { backgroundColor: '#000' }]} onPress={() => warmup.startAssessment()}>
            <View style={styles.startBtnInner}>
              <Ionicons name="play" size={20} color="#ec4899" />
              <Text style={[styles.startBtnText, { color: '#ec4899' }]}>
                {assessStatus.hasAssessment ? 'ПОВТОРИТЬ' : 'НАЧАТЬ'}
              </Text>
            </View>
          </TouchableOpacity>
          {assessStatus.hasAssessment && assessStatus.daysSince !== null && assessStatus.daysSince >= 90 && (
            <Text style={[styles.statsText, { color: 'rgba(255,255,255,0.85)', textAlign: 'center' }]}>
              💡 Прошло 3+ мес — пора повторить чтобы увидеть прогресс
            </Text>
          )}
        </LinearGradient>
        )}

        {/* === FINANCIAL BRAIN DAY === (gated by profile) */}
        {profile.financial_brain_day_enabled && (
        <LinearGradient
          colors={finCooldown.ready ? ['#22c55e', '#0d9488'] : ['#475569', '#64748b']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.warmupBlock}
        >
          <View style={styles.warmupHeader}>
            <View style={styles.warmupTitleRow}>
              <Ionicons name="cash" size={26} color="#FFF" />
              <Text style={[styles.warmupTitle, { color: '#FFF' }]}>FINANCIAL BRAIN DAY</Text>
            </View>
            {finCooldown.ready ? (
              <View style={[styles.streakChip, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[styles.streakChipText, { color: '#FFF' }]}>🟢 готов</Text>
              </View>
            ) : (
              <View style={[styles.streakChip, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                <Text style={[styles.streakChipText, { color: '#FFF' }]}>⏳ {finCooldown.daysLeft} дн</Text>
              </View>
            )}
          </View>

          <Text style={[styles.warmupDesc, { color: 'rgba(255,255,255,0.9)' }]}>
            Iowa → BART → PRL · ~25 мин · vmPFC чекап раз в 2 нед
          </Text>

          {finCooldown.ready ? (
            <TouchableOpacity style={[styles.startBtn, { backgroundColor: '#000' }]} onPress={() => warmup.startFinancialBattery()}>
              <View style={styles.startBtnInner}>
                <Ionicons name="play" size={20} color="#22c55e" />
                <Text style={[styles.startBtnText, { color: '#22c55e' }]}>СТАРТ</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.startBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
              <View style={styles.startBtnInner}>
                <Ionicons name="time" size={18} color="rgba(255,255,255,0.6)" />
                <Text style={[styles.startBtnText, { color: 'rgba(255,255,255,0.7)', fontSize: 14 }]}>
                  ВЕРНИСЬ ЧЕРЕЗ {finCooldown.daysLeft} {finCooldown.daysLeft === 1 ? 'ДЕНЬ' : 'ДН'}
                </Text>
              </View>
            </View>
          )}

          {finCooldown.lastDate && (
            <Text style={[styles.statsText, { color: 'rgba(255,255,255,0.7)', textAlign: 'center' }]}>
              Last: {finCooldown.lastDate} · cooldown {FINANCIAL_COOLDOWN_DAYS} дней
            </Text>
          )}
        </LinearGradient>
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

  // Warmup block
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
