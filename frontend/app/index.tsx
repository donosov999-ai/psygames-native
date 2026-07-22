import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  Image,
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
import { FEATURE_ICONS } from '@/src/constants/featureIcons';
import { profileBadge } from '@/src/constants/profileBadges';
import { logoForProfile } from '@/src/constants/profileLogos';
import { getEquippedFrameColor, getEquippedTitle, getEquippedAvatarKey } from '@/src/services/cosmetics';
import { avatarImage } from '@/src/constants/avatars';
import { getTokens, levelInfo, dailyCheckIn } from '@/src/services/tokens';
import { getTodayChallenge, challengeToParams, loadChallengeStreak, setPendingChallenge, isChallengeDoneToday, ChallengeStreak } from '@/src/services/daily-challenge';
import { useAllLevelStars } from '@/src/hooks/useAllLevelStars';
import { sndToken, sndLevelUp, sndStreak, startMusic, stopMusic, getMusicEnabled } from '@/src/services/feedback';
import { useFocusEffect } from 'expo-router';
import { GAMES, CATEGORY_ORDER, CATEGORY_META, GameCategory, GameConfig } from '@/src/constants/games';
import { filterAllowedGames } from '@/src/constants/profiles';
import {
  buildMorningWarmupPlaylist, buildEveningWarmupPlaylist, buildFixedPlaylist, getCurrentWeekday, loadWarmupHistory, computeStreak, WarmupHistoryEntry,
  getFinancialCooldown, FINANCIAL_COOLDOWN_DAYS,
} from '@/src/services/warmup';
import { getAssessmentStatus } from '@/src/services/assessment';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnlocked } from '@/src/services/achievements';
import { ACHIEVEMENTS } from '@/src/services/achievements';
import ProfileSwitcherModal from '@/src/components/ProfileSwitcherModal';
import SynapsePet from '@/src/components/pet/SynapsePet';
import { getPetStats, PetStage } from '@/src/services/pet';

const MAX_CONTAINER_WIDTH = 1100;
const CONTAINER_PADDING = 16;
const GRID_GAP = 12;

export default function HomeScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const warmup = useWarmup();
  const { profile } = useProfile();
  const eveningMeta = buildEveningWarmupPlaylist({ weekday: getCurrentWeekday(), profileEvening: profile.evening_playlist });   // вечер: ротация по дню (или профильный фикс)
  const { width: winWidth } = useWindowDimensions();
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [history, setHistory] = useState<WarmupHistoryEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [finCooldown, setFinCooldown] = useState<{ ready: boolean; daysLeft: number; lastDate: string | null }>({ ready: true, daysLeft: 0, lastDate: null });
  const [assessStatus, setAssessStatus] = useState<{ hasAssessment: boolean; daysSince: number | null; lastDate: string | null }>({ hasAssessment: false, daysSince: null, lastDate: null });

  const [achievementsCount, setAchievementsCount] = useState(0);
  // v1.7.0: ProfileSwitcherModal — открывается из шапки (профиль-чип или 👤 кнопка)
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Общие очки-токены ЦЕНТРА (копятся со всех игр; перечит на фокусе главного после игры)
  const [tokens, setTokens] = useState(0);
  const [levelUp, setLevelUp] = useState<number | null>(null);   // оверлей «Уровень N!» при повышении
  const [streakDays, setStreakDays] = useState(0);
  const [streakToast, setStreakToast] = useState<number | null>(null);   // тост «🔥 +N за стрик»
  const [challengeStreak, setChallengeStreak] = useState<ChallengeStreak>({ streak: 0, total: 0, last: '' });
  // v1.114.0 — косметика профильного чипа: рамка/титул/аватар из магазина (null = ничего не надето)
  const [frameColor, setFrameColor] = useState<string | null>(null);
  const [titleLabel, setTitleLabel] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  // Стадия питомца «Синапс» в шапке — из реального счётчика тренировок (глобальный, без профиля)
  const [petStage, setPetStage] = useState<PetStage>(1);
  useFocusEffect(useCallback(() => {
    getPetStats().then((s) => setPetStage(s.stage)).catch(() => {});
  }, []));
  const todayChallenge = useMemo(() => getTodayChallenge(), []);   // ротация игр — детерминировано по дате
  const prevTokensRef = useRef<number | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  useFocusEffect(useCallback(() => {
    if (!profile?.id) return;
    (async () => {
      const ci = await dailyCheckIn(profile.id);   // T2: отметка дня + бонус токенов (раз в сутки)
      setStreakDays(ci.streak);
      if (ci.isNew && ci.awarded > 0) { setStreakToast(ci.awarded); sndStreak(); setTimeout(() => setStreakToast(null), 2600); }
      setChallengeStreak(await loadChallengeStreak(profile.id));   // ежедневный вызов — стрик обновляем на фокусе
      const v = await getTokens(profile.id);
      if (prevTokensRef.current !== null && v > prevTokensRef.current) sndToken();   // звон когда очки выросли
      const lv = levelInfo(v).level;
      if (prevLevelRef.current !== null && lv > prevLevelRef.current) {   // повысился уровень
        setLevelUp(lv); sndLevelUp(); setTimeout(() => setLevelUp(null), 2200);
      }
      prevTokensRef.current = v; prevLevelRef.current = lv;
      setTokens(v);
      // Косметика профильного чипа — обновляем на фокусе (сразу видно после покупки в магазине)
      setFrameColor(await getEquippedFrameColor(profile.id));
      setTitleLabel(await getEquippedTitle(profile.id, language));
      setAvatarKey(await getEquippedAvatarKey(profile.id));
    })();
  }, [profile?.id, language]));
  const lvl = levelInfo(tokens);
  // S1: фоновая музыка меню — играет на главной (если включена в настройках), стоп при уходе в игру.
  // v1.122.0: ждём getMusicEnabled(). startMusic() читает флаг синхронно, а грузится он из
  // AsyncStorage асинхронно → на холодном старте вызов приходил раньше, чем флаг, и музыка
  // молча не включалась у тех, кто её включил.
  useFocusEffect(useCallback(() => {
    let alive = true;
    getMusicEnabled().then((on) => { if (alive && on) startMusic(); }).catch(() => {});
    return () => { alive = false; stopMusic(); };
  }, []));

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

  // v1.6.1 — Container/card width strategy:
  //
  // WEB: используем CSS Grid через style-passthrough (RN Web поддерживает с 0.18+).
  //      grid-template-columns: repeat(auto-fill, minmax(MIN_CARD_W, 1fr)) — браузер
  //      сам рассчитает сколько карточек влезет, ширина гарантированно одинаковая
  //      между секциями (это была главная проблема flex+wrap'а).
  //      GameCard в web-режиме = width 100%, заполняет grid-ячейку.
  //
  // NATIVE (iOS/Android RN): grid не поддерживается, fallback на flex+wrap с
  //      явной cardWidth в пикселях (как было). На native flex стабильно работает.
  const MIN_CARD_WIDTH = 170;   // Минимум px для одной карточки на web grid
  const containerWidth = Math.min(winWidth, MAX_CONTAINER_WIDTH) - CONTAINER_PADDING * 2;
  // Native-fallback расчёт (web игнорирует, использует grid auto-fill)
  const cols = containerWidth >= 880 ? 5 : containerWidth >= 700 ? 4 : containerWidth >= 520 ? 3 : 2;
  const CARD_MARGIN = 10;
  const cardWidth = Math.floor((containerWidth - CARD_MARGIN * cols) / cols);
  const cardHeight = Math.round(cardWidth * 1.2);
  const isWeb = Platform.OS === 'web';

  // E1: filter games by active profile + hide games merged into group cards
  const visibleGames = useMemo(
    () => filterAllowedGames(profile).filter((g) => !g.hideFromMenu),
    [profile],
  );

  const grouped = useMemo(() => {
    const map: Record<GameCategory, GameConfig[]> = {
      memory: [], attention: [], logic: [], intuition: [], action: [], recovery: [],
    };
    for (const g of visibleGames) map[g.category].push(g);
    return map;
  }, [visibleGames]);

  // «⭐ X/15» на карточках — сводка пройденных уровней (пишет LevelCleared), multiGet на фокусе
  const visibleGameIds = useMemo(() => visibleGames.map((g) => g.id), [visibleGames]);
  const levelStarsSummary = useAllLevelStars(profile?.id, visibleGameIds);

  // Preview the playlist for current weekday
  const todayPreview = useMemo(() => {
    // Фиксированный утренний набор профиля (полиглот и др.) — иначе превью врёт (показывает дефолтный weekday).
    if (profile.morning_playlist && profile.morning_playlist.length > 0) {
      return buildFixedPlaylist(profile.morning_playlist, 'morning', getCurrentWeekday());
    }
    return buildMorningWarmupPlaylist({ duration, weekday: getCurrentWeekday(), profilePlaylists: profile.custom_playlists });
  }, [duration, profile]);

  const lastScore = history.length > 0 ? history[history.length - 1].total_score : 0;
  const bestScore = history.length > 0 ? Math.max(...history.map((h) => h.total_score)) : 0;

  const startWarmup = () => {
    warmup.startWarmup(duration);
  };

  const startDailyChallenge = async () => {
    // Стрик коммитится при ЗАВЕРШЕНИИ раунда (saveSession → commitChallengeIfPending), не при старте
    if (profile?.id) await setPendingChallenge(profile.id, todayChallenge.game.id);
    router.push({ pathname: todayChallenge.game.route, params: challengeToParams(todayChallenge) } as any);
  };

  const isRest = todayPreview.track === 'rest';
  const isMeasurement = todayPreview.track.startsWith('measure');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Стилизация профиля: лёгкий акцент-фон сверху под цвет активного профиля */}
      <LinearGradient colors={[colors.primary + '26', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260 }} pointerEvents="none" />
      {streakToast !== null && (
        <View style={{ position: 'absolute', top: 76, left: 0, right: 0, alignItems: 'center', zIndex: 150 }} pointerEvents="none">
          <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 }}>🔥</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{language === 'ru' ? 'Стрик' : 'Streak'} {streakDays} · +{streakToast} ⭐</Text>
          </View>
        </View>
      )}
      {levelUp !== null && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 200 }} pointerEvents="none">
          <View style={{ backgroundColor: '#f59e0b', paddingHorizontal: 34, paddingVertical: 22, borderRadius: 22, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 40 }}>⭐</Text>
            <Text style={{ color: '#3f2b00', fontWeight: '900', fontSize: 24 }}>{language === 'ru' ? 'Уровень' : 'Level'} {levelUp}!</Text>
            <Text style={{ color: '#3f2b00', fontWeight: '800', fontSize: 15 }}>{language === 'ru' ? lvl.titleRu : lvl.titleEn}</Text>
          </View>
        </View>
      )}
      {/* Header — v1.7.0: профиль-чип теперь кликабельный (открывает switcher) */}
      <View style={styles.header}>
        {/* v1.30.6: заголовок — на ОТДЕЛЬНОЙ строке во всю ширину (раньше делил ряд с иконками → на Android «PsyGames» переносился/обрезался) */}
        {/* Лого-вордмарк под профиль (9 вариантов, «пока в каждом режиме свой») вместо текста PsyGames */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Лого ужимается первым: лого(190) + плашка очков(~143) = 333 > 320 на 360dp → плашка уезжала за край */}
          <View style={{ flex: 1, minWidth: 0, marginRight: 8, alignItems: 'flex-start' }}>
            {/* D1 v1.122.1: лёгкая подложка под лого-webp — вордмарк тонул на фоне темы без контраста.
                Полупрозрачная плашка по теме + мягкая тень; hug под ширину лого (alignSelf), раскладку не двигает. */}
            {/* v1.128.0: лого стояло ВПРИТЫК к плашке (maxWidth 174 = ровно её внутренняя
                ширина) — крайние буквы читались как «срезанные» (репорт). Убрали maxWidth
                у Image, добавили полям воздуха, скругление ≤ паддинга — углы не съедает. */}
            <View style={{ alignSelf: 'flex-start', maxWidth: 190, width: '100%', backgroundColor: colors.surface + 'CC', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}>
              <Image source={logoForProfile(profile?.id)} style={{ height: 40, width: '100%' }} resizeMode="contain" />
            </View>
          </View>
          {/* Очки-токены центра (⭐) + уровень профиля от накопленных токенов (T1 геймификация) */}
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/shop' as any)} style={{ alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fbbf2422', borderWidth: 1.5, borderColor: '#f59e0b', paddingVertical: 4, paddingHorizontal: 11, borderRadius: 100 }}>
              <Text style={{ fontSize: 14 }}>⭐</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{tokens}</Text>
              <View style={{ width: 1, height: 12, backgroundColor: '#f59e0b88' }} />
              <Text style={{ color: '#b45309', fontWeight: '800', fontSize: 12 }}>Lv {lvl.level}</Text>
              {streakDays > 0 && <Text style={{ fontSize: 13 }}>🔥{streakDays}</Text>}
              <Text style={{ fontSize: 12 }}>🛍️</Text>
            </View>
            {lvl.span !== null && (
              <View style={{ width: 104, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(lvl.progress * 100)}%`, height: 4, backgroundColor: '#f59e0b' }} />
              </View>
            )}
          </TouchableOpacity>
          {/* Мини-аватар питомца «Синапс» → /pet. Шапка недавно чинена на адаптивность:
              аватар с фикс-шириной и flexShrink:0, ужиматься продолжает ТОЛЬКО лого (flex:1) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/pet' as any)}
            accessibilityLabel={language === 'ru' ? 'Питомец Синапс' : 'Synapse pet'}
            style={{ width: 36, flexShrink: 0, marginLeft: 6, alignItems: 'center', alignSelf: 'center' }}
          >
            <SynapsePet stage={petStage} size={30} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRow}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0, gap: 6 }}>
          {/* Клик-чип "Сменить профиль" — заметный, с chevron ▾. v1.114.0: рамка/аватар из магазина
              (frameColor перекрывает цвет профиля, avatarKey — стандартный бейдж). */}
          <TouchableOpacity
            onPress={() => setSwitcherOpen(true)}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              backgroundColor: profile.color + '22',
              borderWidth: frameColor ? 2.5 : 1.5,
              borderColor: frameColor ?? profile.color + '88',
              paddingVertical: 5,
              paddingHorizontal: 10,
              borderRadius: 100,
              marginTop: 2,
              maxWidth: '100%',
            }}
          >
            {avatarKey && avatarImage(avatarKey) ? (
              <Image source={avatarImage(avatarKey)} style={{ width: 20, height: 20, borderRadius: 6 }} />
            ) : profileBadge(profile.id) ? (
              <Image source={profileBadge(profile.id)} style={{ width: 20, height: 20, borderRadius: 6 }} />
            ) : (
              <Text style={{ fontSize: 14 }}>{profile.emoji}</Text>
            )}
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
              {t('profileName_' + profile.id)}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.text} />
          </TouchableOpacity>
          {/* Титул из магазина — подпись под чипом (когда надет) */}
          {titleLabel && (
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginTop: -2, marginLeft: 2 }}>
              {titleLabel}
            </Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          {/* C2 v1.122.1: убрана дублирующая круглая 👤-кнопка — профиль-чип слева уже
              открывает switcher и информативнее (показывает имя профиля + chevron). */}
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/achievements' as any)}
            accessibilityLabel={t('a11yAchievements')}
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
            onPress={() => router.push('/shop' as any)}
            accessibilityLabel={language === 'ru' ? 'Магазин' : 'Shop'}
          >
            <Ionicons name="bag-handle" size={21} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/statistics')}
            accessibilityLabel={t('statistics')}
          >
            <Ionicons name="stats-chart" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/settings')}
            accessibilityLabel={t('settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        </View>
        {/* v1.122.0: подпись — ОТДЕЛЬНОЙ строкой во всю ширину. Раньше делила ряд с 5 иконками
            (252px жёстких) → на 375px тексту оставалось ~83px, и он вставал в столбик,
            разрываясь посреди слова. При системном крупном шрифте съедал пол-экрана. */}
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={3}>
          {t('trainYourBrain')} · {t('homeSwitchHint')}
        </Text>
      </View>

      {/* Profile switcher modal — открывается чипом или 👤 кнопкой */}
      <ProfileSwitcherModal visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.gamesContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* v1.130.0: «Гимнастика для глаз» + «Вызов дня» — ОДНИМ рядом 50/50 (запрос Дениса:
            две полноширинные карточки ели слишком много вертикали). Обе в hero-формате. */}
        <View style={styles.heroRow}>
          {/* 👁 Быстрый перерыв для глаз */}
          <TouchableOpacity style={styles.heroCardWrap} onPress={() => router.push('/games/eye-gym' as any)} activeOpacity={0.85}>
            <LinearGradient colors={['#43cea2', '#185a9d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Image source={FEATURE_ICONS.eyegym} style={{ width: 34, height: 34, borderRadius: 10 }} />
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]} numberOfLines={2}>{t('eyeGym')}</Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={2}>{t('eyeGymDesc')}</Text>
              <View style={[styles.heroCta, { backgroundColor: '#FFF' }]}>
                <Ionicons name="play" size={14} color="#185a9d" />
                <Text style={[styles.heroCtaText, { color: '#185a9d' }]}>{t('ctaStart')}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* 🎯 Ежедневный вызов — ротация игр, детерминировано по дате */}
          <TouchableOpacity style={styles.heroCardWrap} onPress={startDailyChallenge} activeOpacity={0.85}>
            <LinearGradient colors={todayChallenge.game.gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Ionicons name="flash" size={26} color="#FFF" />
                <View style={styles.heroChipMini}>
                  <Text style={styles.heroChipMiniText}>
                    {isChallengeDoneToday(challengeStreak) ? '✓' : '🔥' + challengeStreak.streak}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]}>
                {language === 'ru' ? 'Вызов дня' : 'Daily challenge'}
              </Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={3}>
                {t(todayChallenge.game.nameKey)} · {t(todayChallenge.difficulty)}
              </Text>
              <View style={[styles.heroCta, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                <Ionicons name="play" size={14} color="#FFF" />
                <Text style={[styles.heroCtaText, { color: '#FFF' }]}>
                  {isChallengeDoneToday(challengeStreak) ? t('ctaRepeat') : t('ctaStart')}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

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
                <Image source={FEATURE_ICONS.warmup} style={{ width: 30, height: 30, borderRadius: 8 }} />
                {streak > 0 && (
                  <View style={styles.heroChipMini}>
                    <Text style={styles.heroChipMiniText}>🔥{streak}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: isRest ? '#FFF' : '#000' }]}>{t('complexWarmup')}</Text>
              <Text style={[styles.heroSub, { color: isRest ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)' }]} numberOfLines={3}>
                {isRest
                  ? t('restDay')
                  : `${todayPreview.steps.length} ${todayPreview.steps.length === 1 ? t('unitGame') : t('unitGames')} · ~${Math.round(todayPreview.est_total_sec / 60)} ${t('unitMin')}`}
              </Text>
              {!isRest && (
                <View style={styles.heroCta}>
                  <Ionicons name="play" size={14} color="#fbbf24" />
                  <Text style={styles.heroCtaText}>{t('ctaStart')}</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
          )}

          {/* CARD 1b: Вечерний комплекс (перед сном) — v1.23 */}
          {profile.warmup_enabled && (profile.evening_enabled || (profile.evening_playlist?.length ?? 0) > 0) && (
          <TouchableOpacity
            style={styles.heroCardWrap}
            onPress={() => warmup.startEvening()}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#6366f1', '#4338ca']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <Image source={FEATURE_ICONS.night} style={{ width: 30, height: 30, borderRadius: 8 }} />
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]}>{t('complexEvening')}</Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={3}>
                {eveningMeta.steps.length} {t('unitGames')} · ~{Math.round(eveningMeta.est_total_sec / 60)} {t('unitMin')} · {t('calm')}
              </Text>
              <View style={[styles.heroCta, { backgroundColor: '#000' }]}>
                <Ionicons name="play" size={14} color="#818cf8" />
                <Text style={[styles.heroCtaText, { color: '#818cf8' }]}>{t('ctaStart')}</Text>
              </View>
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
                <Image source={FEATURE_ICONS.assessment} style={{ width: 30, height: 30, borderRadius: 8 }} />
                {assessStatus.hasAssessment ? (
                  <View style={[styles.heroChipMini, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#FFF' }]}>
                      {assessStatus.daysSince === 0 ? '✓' : `${assessStatus.daysSince}${t('unitDayShort')}`}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.heroChipMini, { backgroundColor: '#fbbf24' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#000' }]}>★</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]}>{t('complexAssessment')}</Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={3}>
                {t('assessmentMeta')}
              </Text>
              <View style={[styles.heroCta, { backgroundColor: '#000' }]}>
                <Ionicons name="play" size={14} color="#ec4899" />
                <Text style={[styles.heroCtaText, { color: '#ec4899' }]}>
                  {assessStatus.hasAssessment ? t('ctaRepeat') : t('ctaStart')}
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
                <Image source={FEATURE_ICONS.financial} style={{ width: 30, height: 30, borderRadius: 8 }} />
                {finCooldown.ready ? (
                  <View style={[styles.heroChipMini, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#FFF' }]}>🟢</Text>
                  </View>
                ) : (
                  <View style={[styles.heroChipMini, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                    <Text style={[styles.heroChipMiniText, { color: '#FFF' }]}>⏳{finCooldown.daysLeft}{t('unitDayShort')}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]}>FIN BRAIN</Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={3}>
                {t('finBrainMeta')}
              </Text>
              {finCooldown.ready ? (
                <View style={[styles.heroCta, { backgroundColor: '#000' }]}>
                  <Ionicons name="play" size={14} color="#22c55e" />
                  <Text style={[styles.heroCtaText, { color: '#22c55e' }]}>{t('ctaStart')}</Text>
                </View>
              ) : (
                <View style={[styles.heroCta, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                  <Text style={[styles.heroCtaText, { color: 'rgba(255,255,255,0.75)' }]}>
                    {t('ctaWait')}
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
              {/* v1.6.1 — Web: CSS Grid (одинаковая ширина между секциями).
                  Native: старая flex-wrap + per-card margin. */}
              <View
                style={isWeb ? ({
                  // @ts-ignore — RN Web style passthrough для CSS Grid (тип ViewStyle не знает grid)
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_CARD_WIDTH}px, 1fr))`,
                  gap: 10,
                  width: '100%',
                } as any) : styles.gamesGrid}
              >
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    id={game.id}
                    nameKey={game.nameKey}
                    descKey={game.descKey}
                    skillKey={game.skillKey}
                    gradient={game.gradient}
                    icon={game.icon}
                    // На web ширина = '100%' (заполнит ячейку grid).
                    // На native — фикс. cardWidth в px.
                    width={isWeb ? '100%' as any : cardWidth}
                    height={isWeb ? undefined : cardHeight}
                    starsInfo={levelStarsSummary[game.id]}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxWidth: MAX_CONTAINER_WIDTH,
    width: '100%',
    alignSelf: 'center',
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    // flexWrap + flexBasis:180 у левой колонки: 180 + 252 (иконки) + 8 > 320 (телефон 360dp)
    // → ряд иконок переносится на свою строку, чипу достаётся вся ширина.
    // На планшете/десктопе (MAX_CONTAINER_WIDTH 1100) 440 влезает → вёрстка прежняя.
    flexWrap: 'wrap',
    rowGap: 8,
  },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14 },
  // flexShrink: 0 — иконки не сплющиваются; flexWrap — при системном крупном шрифте,
  // когда чип профиля разбухает, ряд переносится, а не выдавливает текст за экран.
  headerButtons: { flexDirection: 'row', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
  iconButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  // flexShrink:0 — кнопка не сплющивается; при крупном шрифте она росла и выдавливала заголовок в 4 строки
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
    // v1.122.0: height → minHeight. Ровную высоту даёт alignItems:'stretch' на heroRow (см. ниже),
    // а фикс. height обрезал текст при системном крупном шрифте. Прошлый фикс лечил симптом не там.
    minHeight: 150,
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
  // v1.128.0: фикс. lineHeight:14 убран — при системном крупном шрифте (WebView textZoom)
  // fontSize растёт, а px-межстрочник нет → строки наезжали и резались (репорт fontScale 1.25)
  heroSub: { fontSize: 11, fontWeight: '600' },
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
  // RN Web flex-wrap with `gap` distributes leftover inconsistently across rows.
  // Use alignContent + alignItems flex-start to keep rows tight + no stretching.
  gamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
    alignItems: 'flex-start',
  },
});
