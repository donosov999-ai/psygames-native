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
  currentSlot, WarmupSlot,
  getFinancialCooldown, FINANCIAL_COOLDOWN_DAYS,
} from '@/src/services/warmup';
import { getAssessmentStatus } from '@/src/services/assessment';
import WhatsNewModal from '@/src/components/WhatsNewModal';
import { checkForUpdateDaily, updateUrl } from '@/src/services/appUpdates';
import { Linking } from 'react-native';
import { getUnlocked } from '@/src/services/achievements';
import { ACHIEVEMENTS } from '@/src/services/achievements';
import ProfileSwitcherModal from '@/src/components/ProfileSwitcherModal';
import { petFrame, PetSkin } from '@/src/components/pet/PetSprite';
import { getPetStats, PetStage, getPetSkin } from '@/src/services/pet';
import { IS_WEB_DEMO } from '@/src/services/buildTarget';
import DemoLanding from '@/src/components/DemoLanding';
import { listResumable, resolveResumableGame } from '@/src/services/resume';
import { shouldOpenOnboardingPicker } from '@/src/services/onboarding';

const MAX_CONTAINER_WIDTH = 1100;
const CONTAINER_PADDING = 16;
const GRID_GAP = 12;
/** Проверено в браузере: hitSlop в react-native-web НЕ РАБОТАЕТ — elementFromPoint в 3px
 *  за краем кнопки её не находит. Android-сборка живёт в WebView, значит там он тоже
 *  пустышка. Поэтому зона нажатия — настоящие 44×44 (styles.iconButton), а кружок 36×36
 *  рисуется ВНУТРИ неё (styles.iconCircle): вид компактный, палец не обделён. */

// Web-demo (решение Дениса 07.2026): публичный /play/ = ТОЛЬКО ДЕМО.
// Вместо полного каталога — компактный лендинг (игра дня + CTA «Скачать приложение»).
// IS_WEB_DEMO — build-time константа (инлайнится при экспорте), ветка статична:
// FullHome в демо не монтируется вовсе (включая онбординг-гейт psygames_onboarded).
/** Палитра кнопки «Зарядка» по времени суток — совпадает с экраном выбора. */
const SLOT_TINT: Record<WarmupSlot, [string, string]> = {
  morning: ['#f7b733', '#fc4a1a'],
  day:     ['#43cea2', '#185a9d'],
  evening: ['#7b4397', '#dc2430'],
  night:   ['#2c3e50', '#4ca1af'],
};

export default function HomeScreen() {
  if (IS_WEB_DEMO) return <DemoLanding />;
  return <FullHome />;
}

function FullHome() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const warmup = useWarmup();
  const { profile, ready: profileReady } = useProfile();
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
  // v1.148: тихая автопроверка обновлений (раз в сутки) → баннер под шапкой
  const [updAvail, setUpdAvail] = useState<string | null>(null);
  useEffect(() => {
    checkForUpdateDaily().then((info) => {
      if (info?.hasUpdate) setUpdAvail(info.latest);
    }).catch(() => {});
  }, []);
  // Общие очки-токены ЦЕНТРА (копятся со всех игр; перечит на фокусе главного после игры)
  const [tokens, setTokens] = useState(0);
  const [levelUp, setLevelUp] = useState<number | null>(null);   // оверлей «Уровень N!» при повышении
  const [streakToast, setStreakToast] = useState<number | null>(null);   // ежедневный бонус входа; не путать с тренировочным стриком календаря
  const [challengeStreak, setChallengeStreak] = useState<ChallengeStreak>({ streak: 0, total: 0, last: '' });
  // v1.114.0 — косметика профильного чипа: рамка/титул/аватар из магазина (null = ничего не надето)
  const [frameColor, setFrameColor] = useState<string | null>(null);
  const [titleLabel, setTitleLabel] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  // Стадия питомца «Синапс» в шапке — из реального счётчика тренировок (глобальный, без профиля)
  const [petStage, setPetStage] = useState<PetStage>(1);
  const [petSkin, setPetSkinState] = useState<PetSkin>('cat');   // v1.140: скин в шапке
  const [resumeGame, setResumeGame] = useState<GameConfig | null>(null);
  useFocusEffect(useCallback(() => {
    getPetStats().then((s) => setPetStage(s.stage)).catch(() => {});
    getPetSkin().then(setPetSkinState).catch(() => {});
  }, []));
  // Незаконченная партия перечитывается при каждом возврате на главную: после первого
  // хода карточка появляется, после завершения/сброса исчезает. URL берём только из GAMES.
  useFocusEffect(useCallback(() => {
    let active = true;
    setResumeGame(null);
    listResumable(profile.id)
      .then((items) => {
        if (active) setResumeGame(resolveResumableGame(items, GAMES));
      })
      .catch(() => {
        if (active) setResumeGame(null);
      });
    return () => { active = false; };
  }, [profile.id]));
  const todayChallenge = useMemo(() => getTodayChallenge(), []);   // ротация игр — детерминировано по дате

  // Время суток для подписи кнопки «Зарядка».
  // ⚠️ РАНЬШЕ считалось ОДИН раз через useMemo(..., []) с рассуждением «экран и так
  // пересоздаётся при возврате». Неверно: на Android приложение живёт в WebView и
  // главный экран остаётся смонтированным сутками — подпись застывала на времени
  // запуска, и утром человек видел ночную зарядку (репорт Дениса 06.08).
  // Пересчитываем на каждом возврате на главную.
  const [slotNow, setSlotNow] = useState<WarmupSlot>(() => currentSlot());
  useFocusEffect(useCallback(() => { setSlotNow(currentSlot()); }, []));
  const prevTokensRef = useRef<number | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  useFocusEffect(useCallback(() => {
    if (!profile?.id) return;
    (async () => {
      const ci = await dailyCheckIn(profile.id);   // T2: отметка дня + бонус токенов (раз в сутки)
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
    if (!profileReady) return;
    let active = true;
    (async () => {
      // Первый вход в каждый профиль → выбор одной из трёх игр. Старый глобальный
      // psygames_onboarded мигрируется внутри сервиса, чтобы существующих людей
      // не встречать новым экраном внезапно после обновления.
      if (await shouldOpenOnboardingPicker(profile.id)) {
        if (active) {
          router.replace('/onboarding' as any);
        }
        return;
      }

      const h = await loadWarmupHistory();
      if (!active) return;
      setHistory(h);
      setStreak(computeStreak(h));
      const fc = await getFinancialCooldown();
      setFinCooldown(fc);
      const as = await getAssessmentStatus();
      setAssessStatus(as);
      const unlocked = await getUnlocked();
      setAchievementsCount(unlocked.length);
    })();
    return () => { active = false; };
  }, [profile.id, profileReady, router]);

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

  // isRest убран в v1.182: навязанных дней отдыха нет, среда стала тренировочной,
  // а утренняя карточка схлопнута в общую кнопку «Зарядка».
  const isMeasurement = todayPreview.track.startsWith('measure');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Стилизация профиля: лёгкий акцент-фон сверху под цвет активного профиля */}
      <LinearGradient colors={[colors.primary + '26', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260 }} pointerEvents="none" />
      {streakToast !== null && (
        <View style={{ position: 'absolute', top: 76, left: 0, right: 0, alignItems: 'center', zIndex: 150 }} pointerEvents="none">
          <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 }}>🎁</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>+{streakToast} ⭐</Text>
          </View>
        </View>
      )}
      {levelUp !== null && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 200 }} pointerEvents="none">
          <View style={{ backgroundColor: '#f59e0b', paddingHorizontal: 34, paddingVertical: 22, borderRadius: 22, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 40 }}>⭐</Text>
            <Text style={{ color: '#3f2b00', fontWeight: '900', fontSize: 24 }}>{t('level')} {levelUp}!</Text>
            <Text style={{ color: '#3f2b00', fontWeight: '800', fontSize: 15 }}>{t(lvl.titleKey)}</Text>
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
              <Image source={logoForProfile(profile?.id)} accessibilityLabel="PsyGames" style={{ height: 40, width: '100%' }} resizeMode="contain" />
            </View>
          </View>
          {/* Очки/магазин и стрик — отдельные цели тапа. Стрик берётся из истории
              завершённых Зарядок (тот же источник, что календарь и ачивки), а
              dailyCheckIn выше остаётся только ежедневным бонусом токенов. */}
          <View style={{ alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.8}
                onPress={() => router.push('/shop' as any)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fbbf2422', borderWidth: 1.5, borderColor: '#f59e0b', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 100 }}
              >
                <Text style={{ fontSize: 14 }}>⭐</Text>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{tokens}</Text>
                <View style={{ width: 1, height: 12, backgroundColor: '#f59e0b88' }} />
                <Text style={{ color: '#b45309', fontWeight: '800', fontSize: 12 }}>Lv {lvl.level}</Text>
                <Text style={{ fontSize: 12 }}>🛍️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${t('streakLabel')}: ${streak}`}
                activeOpacity={0.8}
                onPress={() => router.push('/streak-calendar' as any)}
                style={{ minWidth: 44, minHeight: 34, paddingHorizontal: 7, borderRadius: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f973161c', borderWidth: 1.5, borderColor: '#f97316' }}
              >
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 13 }}>🔥{streak}</Text>
              </TouchableOpacity>
            </View>
            {lvl.span !== null && (
              /* Полоска прогресса ведёт в лиги: она и так означает «сколько до следующей
                 ступени», так что это её место по смыслу. Отдельную кнопку в шапку не
                 добавляем — там уже тесно, и каждый лишний значок отодвигает игры вниз. */
              /* Зона нажатия — настоящие 44 точки по высоте, полоска рисуется ВНУТРИ неё.
                 Раньше здесь было 104×4 плюс hitSlop, и замер 12.08 показал, что попасть
                 в лиги почти нельзя: hitSlop на вебе пустышка (см. примечание выше), то
                 есть цель была ровно 4 точки высотой. Отрицательный отступ по вертикали
                 гасит прибавку, чтобы шапка не разъехалась: растёт зона, не раскладка. */
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('leaguesTitle')}
                activeOpacity={0.8}
                onPress={() => router.push('/leagues' as any)}
                style={{ width: 104, height: 44, marginVertical: -20, justifyContent: 'center' }}
              >
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(lvl.progress * 100)}%`, height: 4, backgroundColor: '#f59e0b' }} />
                </View>
              </TouchableOpacity>
            )}
          </View>
          {/* Мини-аватар питомца «Синапс» → /pet. Шапка недавно чинена на адаптивность:
              аватар с фикс-шириной и flexShrink:0, ужиматься продолжает ТОЛЬКО лого (flex:1) */}
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={() => router.push('/pet' as any)}
            accessibilityLabel={t('petSynapse')}
            style={{ width: 36, flexShrink: 0, marginLeft: 6, alignItems: 'center', alignSelf: 'center' }}
          >
            <Image source={petFrame(petSkin, 'idle', 0)} style={{ width: 32, height: 32 }} resizeMode="contain" />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRow}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0, gap: 6 }}>
          {/* Клик-чип "Сменить профиль" — заметный, с chevron ▾. v1.114.0: рамка/аватар из магазина
              (frameColor перекрывает цвет профиля, avatarKey — стандартный бейдж). */}
          <TouchableOpacity
            accessibilityRole="button"
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
            accessibilityRole="button"
            style={styles.iconButton}
            onPress={() => router.push('/achievements' as any)}
            accessibilityLabel={t('a11yAchievements')}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.surface }]}>
              <Ionicons name="trophy" size={18} color="#fbbf24" />
            </View>
            {achievementsCount > 0 && (
              <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: '#fbbf24', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ color: '#000', fontSize: 10, fontWeight: '900' }}>{achievementsCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.iconButton}
            onPress={() => router.push('/shop' as any)}
            accessibilityLabel={t('shop')}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.surface }]}><Ionicons name="bag-handle" size={18} color={colors.primary} /></View>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.iconButton}
            onPress={() => router.push('/statistics')}
            accessibilityLabel={t('statistics')}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.surface }]}><Ionicons name="stats-chart" size={18} color={colors.primary} /></View>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.iconButton}
            onPress={() => router.push('/settings')}
            accessibilityLabel={t('settings')}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.surface }]}><Ionicons name="settings-outline" size={18} color={colors.text} /></View>
          </TouchableOpacity>
        </View>
        </View>
        {/* v1.122.0: подпись — ОТДЕЛЬНОЙ строкой во всю ширину. Раньше делила ряд с 5 иконками
            (252px жёстких) → на 375px тексту оставалось ~83px, и он вставал в столбик,
            разрываясь посреди слова. При системном крупном шрифте съедал пол-экрана. */}
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={3}>
          {t('trainYourBrain')} · {t('homeSwitchHint')}
        </Text>
        {/* v1.148: баннер «доступно обновление» (тихая автопроверка раз в сутки) */}
        {updAvail != null && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => Linking.openURL(updateUrl()).catch(() => {})}
            style={[styles.updBanner, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}
          >
            <Ionicons name="arrow-up-circle" size={17} color={colors.primary} />
            <Text style={[styles.updBannerText, { color: colors.primary }]} numberOfLines={1}>
              {t('updAvailable')} v{updAvail} · {t('updDownload')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* v1.148: «Что нового» после обновления — один раз при росте версии */}
      <WhatsNewModal />

      {/* Profile switcher modal — открывается чипом или 👤 кнопкой */}
      <ProfileSwitcherModal visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.gamesContainer}
        showsVerticalScrollIndicator={false}
      >
        {resumeGame && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('resumeGameTitle').replace('{game}', t(resumeGame.nameKey))}
            activeOpacity={0.82}
            onPress={() => router.push(resumeGame.route as any)}
            style={[styles.resumeCard, { backgroundColor: colors.surface, borderColor: resumeGame.gradient[0] }]}
          >
            <LinearGradient
              colors={resumeGame.gradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.resumeIcon}
            >
              <Ionicons name="play" size={22} color="#FFF" />
            </LinearGradient>
            <View style={styles.resumeCopy}>
              <Text style={[styles.resumeTitle, { color: colors.text }]} numberOfLines={2}>
                {t('resumeGameTitle').replace('{game}', t(resumeGame.nameKey))}
              </Text>
              <Text style={[styles.resumeSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {t(resumeGame.skillKey)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={resumeGame.gradient[0]} />
          </TouchableOpacity>
        )}

        {/* v1.179: ряд ПРАКТИК — Зарядка · Глаза · Дыхание.
            Зарядка теперь ОДНА кнопка вместо двух («Утренняя» + «Вечерний комплекс»):
            подпись меняется по времени суток, выбор набора — на своём экране. За счёт
            освободившегося слота сюда переехало Дыхание, которого на главной не было
            вовсе (замысел Дениса 02.08). Три карточки — предел: на 360-412pt это
            103-120pt каждая, четвёртая ужимает до 74-88pt и текст перестаёт влезать. */}
        <View style={styles.heroRow}>
          {/* 🏃 Зарядка — подпись по часам, набор выбирается на /warmup-picker */}
          {profile.warmup_enabled && (
          <TouchableOpacity
            accessibilityRole="button" style={styles.heroCardWrap}
            onPress={() => router.push('/warmup-picker' as any)} activeOpacity={0.85}>
            <LinearGradient colors={SLOT_TINT[slotNow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Image source={FEATURE_ICONS.warmup} style={{ width: 30, height: 30, borderRadius: 8 }} />
                {streak > 0 && (
                  <View style={styles.heroChipMini}>
                    <Text style={styles.heroChipMiniText}>🔥{streak}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]} numberOfLines={1}>
                {t('warmupPickerTitle')}
              </Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={3}>
                {t('slot' + slotNow.charAt(0).toUpperCase() + slotNow.slice(1))}
                {' · '}
                {t('slot' + slotNow.charAt(0).toUpperCase() + slotNow.slice(1) + 'Desc')}
              </Text>
              <View style={[styles.heroCta, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                {/* Карточка ведёт на ВЫБОР набора, а не запускает его: «СТАРТ» обещал
                    запуск и обманывал. Значок тоже меняем — стрелка «дальше» вместо
                    «играть», иначе подпись честная, а картинка нет. */}
                <Ionicons name="chevron-forward" size={14} color="#FFF" />
                <Text style={[styles.heroCtaText, { color: '#FFF' }]}>{t('ctaChoose')}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
          )}

          {/* 👁 Быстрый перерыв для глаз */}
          <TouchableOpacity
            accessibilityRole="button" style={styles.heroCardWrap} onPress={() => router.push('/games/eye-gym' as any)} activeOpacity={0.85}>
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

          {/* 🌬 Дыхание — самостоятельное упражнение, а не только финал вечернего
              набора: в комплексе оно остаётся третьим шагом (решение Дениса 03.08). */}
          <TouchableOpacity
            accessibilityRole="button" style={styles.heroCardWrap}
            onPress={() => router.push('/games/breathing' as any)} activeOpacity={0.85}>
            <LinearGradient colors={['#5b86e5', '#36d1dc']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Ionicons name="leaf-outline" size={26} color="#FFF" />
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]} numberOfLines={2}>{t('breathing')}</Text>
              <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={3}>{t('breathingDesc')}</Text>
              <View style={[styles.heroCta, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                <Ionicons name="play" size={14} color="#FFF" />
                <Text style={[styles.heroCtaText, { color: '#FFF' }]}>{t('ctaStart')}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* === 3 HERO CARDS in a row (compact) === (each gated by profile) */}
        <View style={styles.heroRow}>

          {/* v1.179: «Утренняя зарядка» и «Вечерний комплекс» отсюда УБРАНЫ —
              они схлопнуты в одну кнопку «Зарядка» в ряду практик выше, набор
              выбирается на /warmup-picker. Здесь остались испытания и замеры. */}
          {/* 🎯 Ежедневный вызов — ротация игр, детерминировано по дате */}
          <TouchableOpacity
            accessibilityRole="button" style={styles.heroCardWrap} onPress={startDailyChallenge} activeOpacity={0.85}>
            <LinearGradient colors={todayChallenge.game.gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Ionicons name="flash" size={26} color="#FFF" />
                <View style={styles.heroChipMini}>
                  <Text style={styles.heroChipMiniText}>
                    {isChallengeDoneToday(challengeStreak) ? '✓' : '🔥' + challengeStreak.streak}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroTitle, { color: '#FFF' }]} numberOfLines={2}>
                {t('dailyChallenge')}
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
          {/* CARD 2: Assessment (профиль) */}
          {profile.assessment_enabled && (
          <TouchableOpacity
            accessibilityRole="button"
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
              <Text style={[styles.heroTitle, { color: '#FFF' }]} numberOfLines={2}>{t('complexAssessment')}</Text>
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
            accessibilityRole="button"
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
              <Text style={[styles.heroTitle, { color: '#FFF' }]} numberOfLines={2}>FIN BRAIN</Text>
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
    // Ритм ужат (было 16/8): четыре яруса подряд с воздухом вокруг каждого съедали
    // 202 px из 812 — четверть первого экрана, до контента дело не доходило.
    paddingVertical: 10,
    maxWidth: MAX_CONTAINER_WIDTH,
    width: '100%',
    alignSelf: 'center',
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    // Раньше здесь стоял flexBasis:180 у левой колонки, и 180 + 252 (иконки) + 8 не влезали
    // в 320 (телефон 360dp) → ряд иконок уезжал на СВОЮ строку, добавляя шапке целый ярус
    // в 52 px. Теперь 4×44 = 176 плюс база чипа 120 = 296 < 335 доступных,
    // и всё помещается в одну строку. flexWrap оставлен страховкой на случай
    // системного крупного шрифта — тогда перенос сработает как раньше.
    flexWrap: 'wrap',
    rowGap: 6,
  },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14 },
  updBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'stretch',
    borderWidth: 1.5, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8,
  },
  updBannerText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  // flexShrink: 0 — иконки не сплющиваются; flexWrap — при системном крупном шрифте,
  // когда чип профиля разбухает, ряд переносится, а не выдавливает текст за экран.
  headerButtons: { flexDirection: 'row', gap: 0, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
  // 44×44 — зона нажатия (минимум для пальца), фон на ней НЕ рисуется.
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  // 36×36 — видимый кружок внутри зоны. Между кружками получается 8px воздуха
  // (4+4 от соседних зон) даже при нулевом gap ряда.
  iconCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  // flexShrink:0 — кнопка не сплющивается; при крупном шрифте она росла и выдавливала заголовок в 4 строки
  scrollView: { flex: 1 },
  gamesContainer: {
    paddingHorizontal: CONTAINER_PADDING,
    paddingBottom: 32,
    maxWidth: MAX_CONTAINER_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },

  resumeCard: {
    minHeight: 68,
    marginBottom: 14,
    padding: 11,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resumeIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resumeCopy: { flex: 1, minWidth: 0, gap: 3 },
  resumeTitle: { fontSize: 16, fontWeight: '900' },
  resumeSub: { fontSize: 12, fontWeight: '600' },

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
    // v1.175: без flex:1 растягивалась только обёртка heroCardWrap, а сам градиент
    // сжимался по содержимому — у «Вызова дня» подпись в 3 строки, у «Гимнастики»
    // в 2, и вторая карточка визуально ниже первой («разной высоты» — репорт
    // тестировщика, v1.170). stretch на ряду задаёт высоту обёртке; чтобы её занял
    // фон, растягиваться должен и он.
    flex: 1,
    justifyContent: 'space-between',
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroChipMini: { minHeight: 48, justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 16,
    minWidth: 22,
    alignItems: 'center',
  },
  heroChipMiniText: { color: '#000', fontWeight: '900', fontSize: 10 },
  // Заголовок ВСЕГДА занимает две строки, даже если текст в одну.
  // Репорт 05.08: «в мобильной версии гимнастика написана с переносом на новую строку,
  // это выглядит ужасно». Замер на 375 точках: «Гимнастика для глаз» = 33 точки в две
  // строки, соседнее «Дыхание» = 17 в одну — от этого подпись и кнопка на карточках
  // стояли на разной высоте, и пара выглядела кривой. Само слово не трогаем: сокращать
  // формулировку ради вёрстки нельзя, а вот держать высоту — можно.
  heroTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 1, lineHeight: 17, minHeight: 34 },
  // v1.128.0: фикс. lineHeight:14 убран — при системном крупном шрифте (WebView textZoom)
  // fontSize растёт, а px-межстрочник нет → строки наезжали и резались (репорт fontScale 1.25)
  heroSub: { fontSize: 11, fontWeight: '600' },
  heroCta: { minHeight: 48,
    backgroundColor: '#000',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
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
  streakChip: { minHeight: 48, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  streakChipText: { color: '#000', fontWeight: '900', fontSize: 13 },
  warmupDesc: { color: 'rgba(0,0,0,0.85)', fontSize: 13, fontWeight: '600' },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationBtn: { minHeight: 48, justifyContent: 'center', flex: 1, paddingVertical: 10, borderRadius: 16, alignItems: 'center' },
  durationText: { fontSize: 14, fontWeight: '800' },
  startBtn: { minHeight: 48, justifyContent: 'center', backgroundColor: '#000', borderRadius: 16, marginTop: 4 },
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
