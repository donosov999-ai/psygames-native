import GradientSurface from '@/src/components/GradientSurface';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { textOn, onGradientText, onGradientTextMuted, innerScrim } from '@/src/services/onGradientText';
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
import { profileBackground } from '@/src/constants/profileBackgrounds';
import { logoForProfile, logoPlateFor } from '@/src/constants/profileLogos';
import { getEquippedValue, getEquippedFrameColor, getEquippedTitle, getEquippedAvatarKey } from '@/src/services/cosmetics';
import { avatarImage } from '@/src/constants/avatars';
import { getTokens, levelInfo, dailyCheckIn } from '@/src/services/tokens';
import { wagerTick } from '@/src/services/wager';
import { getTodayChallenge, challengeToParams, loadChallengeStreak, setPendingChallenge, isChallengeDoneToday, ChallengeStreak } from '@/src/services/daily-challenge';
import { useAllLevelStars } from '@/src/hooks/useAllLevelStars';
import { playerLevel, nextLock, levelsToNextLock } from '@/src/services/featureLadder';
import { chestState, earnedTotal, FIGURES } from '@/src/services/collection';
import { sndToken, sndLevelUp, sndStreak, startMusic, stopMusic, getMusicEnabled } from '@/src/services/feedback';
import { useFocusEffect } from 'expo-router';
import { GAMES, CATEGORY_ORDER, CATEGORY_META, visibleInCatalog, GameCategory, GameConfig } from '@/src/constants/games';
import { filterAllowedGames } from '@/src/constants/profiles';
import { loadWeakSkill, gameForWeakSkill } from '@/src/services/weakSkill';
import { hubBadgeCount } from '@/src/constants/hubContents';
import {
  buildMorningWarmupPlaylist, buildEveningWarmupPlaylist, buildFixedPlaylist, getCurrentWeekday, loadWarmupHistory, computeStreak, WarmupHistoryEntry,
  currentSlot, WarmupSlot,
} from '@/src/services/warmup';
import WhatsNewModal from '@/src/components/WhatsNewModal';
import { checkForUpdateDaily, updateUrl } from '@/src/services/appUpdates';
import { Linking } from 'react-native';
import { getUnlocked } from '@/src/services/achievements';
import { ACHIEVEMENTS } from '@/src/services/achievements';
import ProfileSwitcherModal from '@/src/components/ProfileSwitcherModal';
import { PetStill, PetSkin } from '@/src/components/pet/PetSprite';
import { getPetStats, PetStage, getPetSkin } from '@/src/services/pet';
import { IS_WEB_DEMO } from '@/src/services/buildTarget';
import DemoLanding from '@/src/components/DemoLanding';
import { listResumable, resolveResumableGame } from '@/src/services/resume';
import { shouldOpenOnboardingPicker } from '@/src/services/onboarding';
import { recoCards, recoParams } from '@/src/services/recommend';
import { weakestDomainGame } from '@/src/services/assessment';
import { getSessions, GameSession } from '@/src/services/api';
import { todayEarnings, TodaySummary, DAY_STREAK_FOR_MULT } from '@/src/services/earn';
import DailyGoalCard from '@/src/components/DailyGoalCard';
import {
  loadGoalCard, saveDailyGoal, dismissGoalCard, markGoalOutcome, GoalCardData, GoalOutcome,
} from '@/src/services/dailyGoal';

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
/** Сколько игр показывает блок «Сегодня». Больше — и он выдавливает рекомендации. */
const TODAY_ROWS_MAX = 3;

/** Палитра кнопки «Зарядка» по времени суток — совпадает с экраном выбора. */
const SLOT_TINT: Record<WarmupSlot, [string, string]> = {
  morning: ['#f7b733', '#fc4a1a'],
  day:     ['#43cea2', '#185a9d'],
  evening: ['#7b4397', '#dc2430'],
  night:   ['#2c3e50', '#4ca1af'],
};

/**
 * ЦВЕТ ТЕКСТА НА БОЛЬШИХ ПЛАШКАХ ГЛАВНОЙ — СЧИТАЕТСЯ.
 * Здесь стоял зашитый `#FFF`: на `#43cea2→#185a9d` он даёт 1.98, на
 * `#5b86e5→#36d1dc` — 1.86. Это заголовки карточек «Разминка глаз», «Дыхание»
 * и «Оценка» на первом экране. Где сплошным цветом AA не берётся, вуаль кладёт
 * `GradientSurface` — градиент остаётся собой, меняется только глубина.
 */
const HERO_EYE = ['#43cea2', '#185a9d'];
const ON_EYE = onGradientText(HERO_EYE[0], HERO_EYE[1]);
const ON_EYE_SOFT = onGradientTextMuted(ON_EYE);


/** Позиция каталога между пересозданиями главной (см. комментарий у ScrollView). */
let savedHomeScrollY = 0;
export default function HomeScreen() {
  if (IS_WEB_DEMO) return <DemoLanding />;
  return <FullHome />;
}

function FullHome() {
  const homeScrollRef = React.useRef<ScrollView>(null);
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const warmup = useWarmup();
  const { profile, ready: profileReady } = useProfile();
  // Витрина тем: надетые чужой фон/значок перекрывают профильные (Т5).
  const [bgOverride, setBgOverride] = useState<string | null>(null);
  const [badgeOverride, setBadgeOverride] = useState<string | null>(null);
  const profileBg = (bgOverride ? profileBackground(bgOverride) : undefined) ?? profileBackground(profile?.id);
  /**
   * Плашка под вордмарком — по САМОМУ ЗНАКУ, а не по теме. Раньше здесь стоял
   * `colors.surface + 'CC'`: на тёмной теме тёмная плашка под тёмным лого, и
   * «предприниматели — лого херово видно» (замер: logo7 яркостью 71 из 255).
   * Таблица и разбор — в `profileLogos.ts`.
   */
  const logoPlateBg = logoPlateFor(profile?.id) === 'dark' ? '#12151AC7' : '#FFFFFFD1';
  const eveningMeta = buildEveningWarmupPlaylist({ weekday: getCurrentWeekday(), profileEvening: profile.evening_playlist });   // вечер: ротация по дню (или профильный фикс)
  const { width: winWidth } = useWindowDimensions();
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  // З1: длительность выбирается в пикере и запоминается — превью на главной
  // обязано считаться той же цифрой, иначе карточка обещает не тот набор.
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('psygames_warmup_duration')
      .then((v: string | null) => { const n = Number(v); setDuration(n === 10 || n === 15 ? (n as 10 | 15) : 5); })
      .catch(() => {});
  }, []));
  const [history, setHistory] = useState<WarmupHistoryEntry[]>([]);
  const [streak, setStreak] = useState(0);

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
  /**
   * «Рекомендуем сегодня» — партии человека и отметка времени, на которую собран набор.
   *
   * ⚠️ ВРЕМЯ ХРАНИТСЯ В СОСТОЯНИИ, А НЕ БЕРЁТСЯ `new Date()` ПРЯМО В РАЗМЕТКЕ. На
   * Android приложение живёт в WebView и главный экран остаётся смонтированным сутками:
   * посчитанное один раз при запуске застыло бы там навсегда — ровно так уже застывала
   * подпись «Зарядки» на времени старта (репорт Дениса 06.08). Перечитываем на каждом
   * возврате на главную: и партии, и час.
   */
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [recoAt, setRecoAt] = useState<number>(() => Date.now());
  /**
   * «СЕГОДНЯ» — что сыграно за календарные сутки и сколько это принесло.
   *
   * 🔴 ЗАЧЕМ. Магазин с ценами и балансом был, а откуда берутся очки — не сказано нигде:
   * баланс просто однажды оказывался другим. Начисление, которого человек не видит,
   * работы не делает.
   *
   * ⚠️ ПЕРЕЧИТЫВАЕМ НА ФОКУСЕ, как и всё остальное на этом экране. На Android приложение
   * живёт в WebView и главный экран остаётся смонтированным сутками — посчитанное один
   * раз при запуске застыло бы там навсегда (той же болезнью болели подпись «Зарядки» и
   * набор рекомендаций). Заодно это единственный способ увидеть партию, сыгранную минуту
   * назад: возврат с игры и есть фокус.
   */
  const [today, setToday] = useState<TodaySummary>({ rows: [], total: 0, rounds: 0, dayStreak: 0 });
  useFocusEffect(useCallback(() => {
    let active = true;
    todayEarnings(profile.id)
      .then((s) => { if (active) setToday(s); })
      .catch(() => {});
    return () => { active = false; };
  }, [profile.id]));
  /**
   * 🎯 ЦЕЛЬ ДНЯ — причина открыть приложение, названная самим человеком.
   *
   * Все правила (сутки, попрофильность, «закрыл — сегодня не возвращается», отказ
   * писать пустое) живут в `src/services/dailyGoal.ts`; экран только показывает
   * готовое состояние и передаёт нажатия обратно. Считать состояние здесь заново
   * нельзя: правило «ровно сутки» разъехалось бы между двумя местами.
   *
   * ⚠️ ПЕРЕЧИТЫВАЕМ НА ФОКУСЕ — той же болезнью болели подпись «Зарядки» и набор
   * рекомендаций: на Android приложение живёт в WebView, главный экран остаётся
   * смонтированным сутками, и прочитанное один раз при запуске застыло бы на
   * вчерашней цели. Заодно это единственный способ увидеть партию, сыгранную минуту
   * назад: возврат с игры и есть фокус.
   */
  const [goalCard, setGoalCard] = useState<GoalCardData>({ state: 'hidden', goal: null });
  useFocusEffect(useCallback(() => {
    let active = true;
    loadGoalCard(profile.id)
      .then((c) => { if (active) setGoalCard(c); })
      .catch(() => {});
    return () => { active = false; };
  }, [profile.id]));
  // Пустой ввод целью не становится: сервис ничего не пишет и отдаёт null, а карточка
  // остаётся приглашением — вместо того чтобы весь день показывать пустую строку.
  const onGoalSave = useCallback(async (raw: string) => {
    const saved = await saveDailyGoal(profile.id, raw);
    if (!saved) return;
    setGoalCard(await loadGoalCard(profile.id));
  }, [profile.id]);
  const onGoalDismiss = useCallback(async () => {
    await dismissGoalCard(profile.id);
    setGoalCard(await loadGoalCard(profile.id));
  }, [profile.id]);
  /**
   * Отметка исхода — единственное место главной, где деньги приходят БЕЗ ухода с
   * экрана. Число в шапке обновляется на фокусе, поэтому без явного перечитывания
   * кошелька карточка показывала бы «+25 ⭐», а баланс рядом — прежний, до следующего
   * захода. Сколько начислено, спрашиваем у записи, а не считаем здесь заново:
   * правило награды одно и живёт в earn.ts.
   */
  const onGoalOutcome = useCallback(async (outcome: GoalOutcome) => {
    const marked = await markGoalOutcome(profile.id, outcome);
    setGoalCard(await loadGoalCard(profile.id));
    if ((marked?.reward ?? 0) > 0) {
      const v = await getTokens(profile.id);
      prevTokensRef.current = v;      // иначе фокус-эффект зазвонит ещё раз за то же
      setTokens(v);
      sndToken();
    }
  }, [profile.id]);
  useFocusEffect(useCallback(() => {
    let active = true;
    setRecoAt(Date.now());
    getSessions()
      .then((all) => { if (active) setSessions(all); })
      .catch(() => { if (active) setSessions([]); });
    return () => { active = false; };
  }, [profile.id]));
  // Профиль отдаём целиком: отбор сам режет каталог по allowed_games. Передавать сюда
  // готовый список игр нельзя — так протекал дневной перерыв (см. шапку recommend.ts).
  /**
   * Слабейший домен по последней оценке. Читается один раз за монтирование: оценка
   * меняется раз в три месяца, а не между кадрами. Нет оценки — `null`, и основание
   * «здесь пока слабее всего» просто не участвует в отборе.
   */
  const [слабейший, setСлабейший] = useState<string | null>(null);
  /**
   * ⚠️ ДВА ИСТОЧНИКА, И ПОРЯДОК МЕЖДУ НИМИ НЕ СЛУЧАЕН. Оценка (`weakestDomainGame`)
   * считает по нормам и z-баллам, но проходится раз в три месяца — почти всегда её
   * ответ пуст, и основание «здесь пока слабее всего» не участвовало вовсе. Разбор
   * зарядки свежий, но без норм: он говорит «ниже ТВОЕГО обычного», а не «ниже
   * нормы». Поэтому оценка первая, разбор — запасной, и он молчит, если старше
   * недели (см. `weakSkill`).
   */
  useEffect(() => {
    let жив = true;
    (async () => {
      try {
        const w = await weakestDomainGame();
        if (!жив) return;
        if (w?.gameId) { setСлабейший(w.gameId); return; }
        const место = await loadWeakSkill();
        if (!жив || !место) return;
        const разрешено = new Set(filterAllowedGames(profile).map((g) => g.id));
        setСлабейший(gameForWeakSkill(место, разрешено));
      } catch { /* совет просто не появится */ }
    })();
    return () => { жив = false; };
  }, [profile]);
  const reco = useMemo(
    () => recoCards({ profile, sessions, now: new Date(recoAt), weakestGameId: слабейший }),
    [profile, sessions, recoAt, слабейший],
  );
  const todayChallenge = useMemo(() => getTodayChallenge(), []);   // ротация игр — детерминировано по дате
  // Градиент вызова дня меняется вместе с игрой — цвет текста считаем от него же.
  const onChallenge = onGradientText(todayChallenge.game.gradient[0], todayChallenge.game.gradient[todayChallenge.game.gradient.length - 1]);
  const onChallengeSoft = onGradientTextMuted(onChallenge);

  // Время суток для подписи кнопки «Зарядка».
  // ⚠️ РАНЬШЕ считалось ОДИН раз через useMemo(..., []) с рассуждением «экран и так
  // пересоздаётся при возврате». Неверно: на Android приложение живёт в WebView и
  // главный экран остаётся смонтированным сутками — подпись застывала на времени
  // запуска, и утром человек видел ночную зарядку (репорт Дениса 06.08).
  // Пересчитываем на каждом возврате на главную.
  const [slotNow, setSlotNow] = useState<WarmupSlot>(() => currentSlot());
  // Плашка зарядки перекрашивается по времени суток — цвет текста считаем от того
  // градиента, который сейчас на экране, а не от одного «представительного».
  const onSlot = onGradientText(SLOT_TINT[slotNow][0], SLOT_TINT[slotNow][1]);
  const onSlotSoft = onGradientTextMuted(onSlot);
  useFocusEffect(useCallback(() => { setSlotNow(currentSlot()); }, []));
  const prevTokensRef = useRef<number | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  const [wagerToast, setWagerToast] = useState<{ kind: 'won' | 'lost'; amount: number } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!profile?.id) return;
    (async () => {
      const ci = await dailyCheckIn(profile.id);   // T2: отметка дня + бонус токенов (раз в сутки)
      // Ставка «всё или ничего»: свой счёт дней рядом с чек-ином (щит её не спасает).
      const wg = await wagerTick(profile.id);
      if (wg.kind === 'won') { setWagerToast({ kind: 'won', amount: wg.prize }); sndToken(); setTimeout(() => setWagerToast(null), 3200); }
      else if (wg.kind === 'lost') { setWagerToast({ kind: 'lost', amount: wg.stake }); setTimeout(() => setWagerToast(null), 3200); }
      if (ci.isNew && ci.awarded > 0) { setStreakToast(ci.awarded); sndStreak(); setTimeout(() => setStreakToast(null), 2600); }
      setChallengeStreak(await loadChallengeStreak(profile.id));   // ежедневный вызов — стрик обновляем на фокусе
      setBgOverride(await getEquippedValue(profile.id, 'background'));
      setBadgeOverride(await getEquippedValue(profile.id, 'badge'));
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
  // Минимальная ширина карточки в сетке. ⚠️ ЗАВИСИТ ОТ ЭКРАНА, и это не украшение.
  // При жёстких 170 на ширинах 360 и 375 — самых ходовых у телефонов — две колонки
  // НЕ помещаются (170×2 + зазор > доступного), остаётся одна, карточка растягивается
  // на всю ширину, а высота считается от неё: 364 точки при содержимом на 150.
  // Замер на живом: между описанием и бейджем «Тренируем» пустовало 218 точек — шесть
  // десятых карточки. Репорт тестировщика: «в карточке сделать меньше промежуток по
  // высоте между заголовком и training memory».
  // 150 возвращает две колонки на 360–375; на 320 колонка всё равно одна — там она
  // и уместна. На широких экранах порог прежний, раскладка десктопа не меняется.
  const MIN_CARD_WIDTH = winWidth < 480 ? 150 : 170;
  const containerWidth = Math.min(winWidth, MAX_CONTAINER_WIDTH) - CONTAINER_PADDING * 2;
  // Native-fallback расчёт (web игнорирует, использует grid auto-fill)
  const cols = containerWidth >= 880 ? 5 : containerWidth >= 700 ? 4 : containerWidth >= 520 ? 3 : 2;
  const CARD_MARGIN = 10;
  const cardWidth = Math.floor((containerWidth - CARD_MARGIN * cols) / cols);
  const cardHeight = Math.round(cardWidth * 1.2);
  const isWeb = Platform.OS === 'web';

  // E1: filter games by active profile + hide games merged into group cards
  const visibleGames = useMemo(
    () => visibleInCatalog(filterAllowedGames(profile), profile?.id),
    [profile],
  );

  /**
   * 🔴 В КАЖДОЙ КАТЕГОРИИ СНАЧАЛА РАЗВИЛКИ, ПОТОМ ОДИНОЧНЫЕ УПРАЖНЕНИЯ.
   *
   * Просьба Дениса 04.09.2026. Смысл не в красоте: развилка ведёт к нескольким
   * играм, и когда она стоит вперемешку с одиночными, человек сперва открывает
   * три карточки подряд, а потом узнаёт, что четвёртая содержала ещё шесть.
   * Порядок внутри групп сохраняем прежним — он задан каталогом осознанно.
   */
  const grouped = useMemo(() => {
    const map: Record<GameCategory, GameConfig[]> = {
      memory: [], attention: [], logic: [], intuition: [], action: [], recovery: [],
    };
    for (const g of visibleGames) map[g.category].push(g);
    for (const к of Object.keys(map) as GameCategory[]) {
      // Стабильная сортировка: внутри «развилок» и внутри «одиночных» порядок каталога.
      map[к] = [...map[к].filter((g) => g.hub), ...map[к].filter((g) => !g.hub)];
    }
    return map;
  }, [visibleGames]);

  /**
   * 🔴 ЧИСЛО НА ЗНАЧКЕ РАЗВИЛКИ = ДЛИНА ТОГО САМОГО СПИСКА, ЧТО ЧЕЛОВЕК УВИДИТ.
   *
   * 📍 Отзыв тестировщицы 05.09.2026 (запись `291c2cff`), дословно: «написано
   * например один а по факту там два стоит и так абсолютно во всех профилях».
   * Замер в тот же день: расходились 6 развилок из 16, 24 пары профиль×развилка;
   * «Зрительная память» — на значке 2, внутри 3, судоку — 1 против 5.
   *
   * ⚠️ ПОЧЕМУ ЭТО НЕ ЧИНИЛОСЬ ЦИФРОЙ. Здесь стоял свой подсчёт по полю
   * `mergedInto`, а экран развилки рисовал свой рукописный список. Два источника
   * правды, и оба по-своему верные: у игры ОДИН родитель, а стоять она вправе в
   * НЕСКОЛЬКИХ развилках («матрица памяти» принадлежит охвату, но законно есть и
   * в «Зрительной памяти»). Значок считал не то множество, а не ошибался в счёте.
   *
   * Теперь состав развилок живёт одним списком (`src/constants/hubContents.ts`),
   * и `hubBadgeCount` — это буквально длина того, что рисует экран: не «столько
   * же», а то же самое, одной функцией. `mergedInto` остался на своей работе —
   * какая развилка ОТКРЫВАЕТ игру профилю (`filterAllowedGames`).
   *
   * ⚠️ И СЧИТАЕМ ПО ПРОФИЛЮ, А НЕ ПО ВСЕМУ КАТАЛОГУ: экран с 04.09.2026 фильтрует
   * список, значит и обещание на значке обязано быть после фильтра.
   */
  const составРазвилки = useMemo(() => {
    const можно = new Set(filterAllowedGames(profile).map((g) => g.route));
    const из: Record<string, number> = {};
    for (const g of GAMES) if (g.hub) из[g.id] = hubBadgeCount(g.route, можно);
    return из;
  }, [profile]);

  // «⭐ X/15» на карточках — сводка пройденных уровней (пишет LevelCleared), multiGet на фокусе
  const visibleGameIds = useMemo(() => visibleGames.map((g) => g.id), [visibleGames]);
  const levelStarsSummary = useAllLevelStars(profile?.id, visibleGameIds);

  /**
   * 🔴 БЛИЖАЙШАЯ ДВЕРЬ ВПЕРЕДИ. Задача b96bfc4b, видимая половина второй лестницы.
   *
   * Замер эталона: девять замков на первых шестидесяти уровнях, между пятым и
   * десятым — четыре. Смысл не в самих приёмах, а в том, что впереди ВСЕГДА видно,
   * что откроется следующим, и это не стоит денег.
   *
   * У нас лестница была одна и открывалась деньгами: бесплатный игрок видел ровно
   * то, что получил на старте, и повода вернуться завтра у него не было.
   *
   * ⚠️ Уровень считаем по ПРОЙДЕННОМУ во всех играх (см. playerLevel), а не по
   * времени в приложении: иначе замок открывается за то, что человек оставил экран
   * включённым.
   */
  const уровеньИгрока = useMemo(() => playerLevel(levelStarsSummary), [levelStarsSummary]);
  const ближайшийЗамок = useMemo(() => nextLock(уровеньИгрока), [уровеньИгрока]);

  /**
   * ДОЛГАЯ ЦЕЛЬ (задача 6e564484, шаг 3). Мета-слой у нас богаче эталона по
   * составу, но ни лига, ни ранг, ни титул не отвечают на вопрос «к чему я иду»:
   * «ранг вырастет» — это не предмет. Сундук отвечает предметно, и потому он
   * виден на главной ВСЕГДА, а не открывается отдельным экраном.
   *
   * ⚠️ Считается ЗАРАБОТАННОЕ за всё время, а не остаток на счету: иначе покупка
   * в магазине двигала бы цель назад (см. collection.ts).
   */
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
  const сундук = useMemo(() => chestState(заработано), [заработано]);
  const доЗамка = useMemo(() => levelsToNextLock(уровеньИгрока), [уровеньИгрока]);

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
      {/* Заливка усилена с 15% до 30%: при 15% купленный цвет не читался, и покупка
          выглядела впустую («поменяла интерфейс на розовый — незаметно, что их не видно»,
          репорт 02.08). Выше поднимать нельзя — под ней лежат карточки игр со своими
          градиентами, и сильная подложка начала бы с ними спорить. */}
      {/**
        * 🔴 ФОН ПОД ПРОФИЛЬ, А НЕ ОДНА ЗАЛИВКА НА ВСЕХ. Просьба Дениса 26.08.2026:
        * «фон не нравится, чтобы вместо заливки была картинка в низком разрешении
        * на тему» и «я наоборот в предпринимателях хочу уйти от чёрного».
        * Разбор, замеры контраста и вес — в шапке `constants/profileBackgrounds`.
        *
        * ⚠️ ЗАЛИВКА ЦВЕТОМ ОСТАЛАСЬ ПОВЕРХ КАРТИНКИ И НЕ УДАЛЕНА. Она показывает
        * КУПЛЕННЫЙ цвет интерфейса, и без неё покупка снова стала бы незаметной —
        * ровно репорт 02.08 («поменяла интерфейс на розовый, а не видно»). Поэтому
        * поверх фото она идёт слабее (30% → 18%): цвет читается, картинку не топит.
        * У профилей без своего фона всё остаётся как было, на прежних 30%.
        */}
      {profileBg !== undefined && (
        <Image
          source={profileBg}
          /**
           * 🔴 `width/height: '100%'` ОБЯЗАТЕЛЬНЫ, ОДНИХ `top/left/right/bottom` НЕ ХВАТАЕТ.
           * Замер живьём 26.08.2026: элемент фона рисовался ровно `760×428` при
           * окне 1800 — то есть в натуральную величину ассета. У картинки с
           * `require` есть СВОИ размеры, и RN Web подставляет их в стиль; заданные
           * `right`/`bottom` при этом не растягивают, а просто не применяются.
           * Внешне это выглядело как «фон полосой»: обрыв приходился ровно на
           * 760 pt ширины, и два захода подряд я чинил не то — сперва высоту
           * полосы, потом силу вуали, хотя картинка всё это время была
           * недорастянута. Проверять надо было РАЗМЕР ЭЛЕМЕНТА, а не смотреть.
           */
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          resizeMode="cover"
        />
      )}
      {/* Налёт цветом ТЕМЫ — он показывает купленный цвет интерфейса, поэтому
          остаётся и поверх фото, только слабее (30% → 18%): без него смена цвета
          на главной стала бы незаметной, а такой репорт уже был 02.08. */}
      <LinearGradient colors={[colors.primary + (profileBg !== undefined ? '2E' : '4D'), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260 }} pointerEvents="none" />
      {/* 🔴 ФОТО ЗАЛИВАЕТ ВЕСЬ ЭКРАН, А НЕ ПОЛОСУ СВЕРХУ.
          Репорт Дениса 26.08.2026 по живой сборке: «картинка на заднем фоне не во
          весь экран, а должна всё заливать собой, и на телефон тоже, так во всех
          профилях». Раньше снимок жил в полосе 300 px и обрывался — отсюда и
          «right: 0, height: 300», и растворение низа, которое эту полосу прятало.
          Теперь `bottom: 0`: картинка кроет экран целиком на любой ширине.

          ⚠️ ПОВЕРХ ОБЯЗАТЕЛЬНА ВУАЛЬ, И ЭТО НЕ ВОЗВРАТ К «МРАЧНОМУ». Затемнение
          v1 было ВПЕЧЕНО В ФАЙЛ до полной черноты — не отменить и не подкрутить.
          Здесь вуаль лежит в коде цветом ТЕМЫ и неравномерна: наверху её нет
          вовсе (шапка идёт по чистому снимку), к трети экрана она набирает силу,
          дальше держит ровно. Ниже лежат карточки со своими фонами, и картинка
          читается между ними текстурой, а не подложкой под текстом.
          Без вуали внизу белый текст на светлом снимке нечитаем: яркость фонов
          169–233 из 255, замер в шапке `profileBackgrounds`. */}
      {profileBg !== undefined && (
        <LinearGradient
          /**
           * ⚠️ ВУАЛЬ ОСЛАБЛЕНА ПОСЛЕ ЖИВОГО СКРИНШОТА ДЕНИСА (26.08, 20:31).
           * Стояло `D9` к 32% и `F0` к 62% — к двум третям экрана оставался
           * сплошной фон темы, а на СВЕТЛОЙ теме это почти белый. Картинка
           * формально кроет весь экран (проверено по бандлу сборки), но глазом
           * читается всё той же полосой сверху — то есть замер «правка доехала»
           * был верен, а результат негодным.
           * Теперь: до 45% почти чисто, к низу не темнее `D9` — снимок виден до
           * самого низа, а текст всё равно лежит на карточках со своим фоном.
           */
          colors={['transparent', colors.background + '73', colors.background + 'D9']}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        />
      )}
      {streakToast !== null && (
        <View style={{ position: 'absolute', top: 76, left: 0, right: 0, alignItems: 'center', zIndex: 150 }} pointerEvents="none">
          <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 }}>🎁</Text>
            <Text style={{ color: textOn('#ef4444'), fontWeight: '800', fontSize: 14 }}>+{streakToast} ⭐</Text>
          </View>
        </View>
      )}
      {/* Тост ставки: ниже стрик-тоста (top 122), чтобы при одновременном показе не перекрывались. */}
      {wagerToast !== null && (
        <View style={{ position: 'absolute', top: 122, left: 0, right: 0, alignItems: 'center', zIndex: 150 }} pointerEvents="none">
          <View style={{ backgroundColor: wagerToast.kind === 'won' ? '#22c55e' : '#475569', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 }}>{wagerToast.kind === 'won' ? '🏆' : '💸'}</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
              {t(wagerToast.kind === 'won' ? 'wagerWonToast' : 'wagerLostToast').replace('{n}', String(wagerToast.amount))}
            </Text>
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
            <View style={{ alignSelf: 'flex-start', maxWidth: 190, width: '100%', backgroundColor: logoPlateBg, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}>
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
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginVertical: -7, gap: 5, backgroundColor: '#fbbf2422', borderWidth: 1.5, borderColor: '#f59e0b', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 100 }}
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
                style={{ minWidth: 44, minHeight: 44, marginVertical: -5, paddingHorizontal: 7, borderRadius: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f973161c', borderWidth: 1.5, borderColor: '#f97316' }}
              >
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 13 }}>🔥{streak}</Text>
              </TouchableOpacity>
            </View>
            {/* Друзья встали НА ЯРУС ЛИГ, а не шестым значком в ряд назначений, и это
                замер, а не вкус. На 360 dp ряду достаётся 320 точек: пять зон по 44 —
                это 220, плюс база чипа профиля 120 = 340, и flexWrap ломает ряд ЦЕЛИКОМ
                (перенос в вёрстке считается по базам ДО ужимания, поэтому чип не
                сожмётся, а уедет). Замер живой сборки 21.08: шапка 44 → 90 точек, ровно
                тот ярус в полсотни, который убирали в v1.122.0.
                Здесь же ярус лиг занят полоской в 104 точки при колонке в 156 — слева от
                неё пустует 52, и кнопка в 44 встаёт без единой лишней точки по ширине.
                По высоте: отступ полоски ослаблен с −20 до −11, чтобы значок не залезал
                под плашку очков (её видимый край на 5 точек ниже её же коробки). Ярус
                стал 22 точки вместо 4, вся шапка выросла на 9 — против 46 у переноса. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('friendsTitle')}
                activeOpacity={0.8}
                onPress={() => router.push('/friends' as any)}
                style={{ width: 44, height: 44, marginVertical: -11, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="people" size={18} color={colors.primary} />
              </TouchableOpacity>
              {lvl.span !== null && (
                /* Полоска прогресса ведёт в лиги: она и так означает «сколько до следующей
                   ступени», так что это её место по смыслу. Отдельную кнопку в шапку не
                   добавляем — там уже тесно, и каждый лишний значок отодвигает игры вниз. */
                /* Зона нажатия — настоящие 44 точки по высоте, полоска рисуется ВНУТРИ неё.
                   Раньше здесь было 104×4 плюс hitSlop, и замер 12.08 показал, что попасть
                   в лиги почти нельзя: hitSlop на вебе пустышка (см. примечание выше), то
                   есть цель была ровно 4 точки высотой. Отрицательный отступ по вертикали
                   гасит прибавку: растёт зона, не раскладка. */
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('leaguesTitle')}
                  activeOpacity={0.8}
                  onPress={() => router.push('/leagues' as any)}
                  style={{ width: 104, height: 44, marginVertical: -11, justifyContent: 'center' }}
                >
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.round(lvl.progress * 100)}%`, height: 4, backgroundColor: colors.primary }} />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {/* Мини-аватар питомца «Синапс» → /pet. Шапка недавно чинена на адаптивность:
              аватар с фикс-шириной и flexShrink:0, ужиматься продолжает ТОЛЬКО лого (flex:1) */}
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={() => router.push('/pet' as any)}
            accessibilityLabel={t('petSynapse')}
            /* Отчёт 63c255d2 (04.09.2026): «питомец мелкий, надо увеличить в шапке
               его». Было 44×44 с фигурой 32 — цель нажатия по норме, а видно
               плохо. Стало 56×56 с фигурой 48: фигура выросла в полтора раза,
               шапка отдала 12 точек, и отдало их ЛОГО (flex:1), а не счётчики. */
            style={{ width: 56, height: 56, marginVertical: -10, flexShrink: 0, marginLeft: 2, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}
          >
            <PetStill skin={petSkin} state="idle" size={48} />
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
              // Зона нажатия 44 при прежнем виде: отрицательный отступ гасит прибавку,
              // чтобы шапка не разъехалась. Тот же приём, что у полоски лиг.
              minHeight: 44,
              marginVertical: -6,
              /* 🔴 НАД ФОТО ЧИП ЗАЛИВАЕТСЯ В ПОЛНУЮ СИЛУ. Было `+'22'` — 13%
                 прозрачности, то есть почти ничего: белая подпись «Шахматист»
                 ложилась прямо на светлое дерево доски и сливалась (жалоба
                 Дениса 26.08: «сверху текст сливается с фоном, контраст нужен»).
                 Цвет берётся ЕГО ЖЕ — профильный, опознаваемость не теряется. */
              backgroundColor: profileBg !== undefined ? profile.color + 'F2' : profile.color + '22',
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
            ) : profileBadge(badgeOverride ?? profile.id) ? (
              <Image source={profileBadge(badgeOverride ?? profile.id)} style={{ width: 20, height: 20, borderRadius: 6 }} />
            ) : (
              <Text style={{ fontSize: 14 }}>{profile.emoji}</Text>
            )}
            {/* Цвет подписи — автоподбором под заливку чипа, а не `colors.text`:
                на профильной заливке светлого оттенка белым читать нечего. */}
            <Text style={{ color: profileBg !== undefined ? textOn(profile.color) : colors.text, fontWeight: '700', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
              {t('profileName_' + profile.id)}
            </Text>
            <Ionicons name="chevron-down" size={14} color={profileBg !== undefined ? textOn(profile.color) : colors.text} />
          </TouchableOpacity>
          {/* Титул из магазина — подпись под чипом (когда надет) */}
          {titleLabel && (
            <Text style={[{ fontSize: 11, fontWeight: '700', marginTop: -2, marginLeft: 2 }, profileBg !== undefined
              ? { color: '#151A21', textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } }
              : { color: colors.textSecondary }]}>
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
            accessibilityLabel={t('achievementsTitle')}
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
        {/* 🔴 ПОДЗАГОЛОВОК ЛЕЖИТ НА ФОТО, А НЕ НА ФОНЕ ТЕМЫ. Цвет `textSecondary`
            рассчитан на ровную заливку и на светлом снимке сливался (проверено на
            профиле «Шахматист»: подпись шла поверх светлого дерева доски).
            Тёмный цвет со СВЕТЛЫМ ореолом выбран потому, что снимок неоднороден:
            у шахмат рядом и белые, и тёмные клетки — одной заливкой их не покрыть,
            а обводка читается на обеих. Без фото всё остаётся как было. */}
        <Text
          style={[styles.subtitle, profileBg !== undefined
            ? { color: '#151A21', textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } }
            : { color: colors.textSecondary }]}
          numberOfLines={3}
        >
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
        ref={homeScrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.gamesContainer}
        showsVerticalScrollIndicator={false}
        /**
         * ПАМЯТЬ ПРОКРУТКИ КАТАЛОГА. Репорт Вали 22.08 (корректурка): «назад
         * выкидывает в основное меню, а не в меню упражнений — на два шага назад».
         * Разбор: при возврате кнопкой каталог живёт в стеке и позиция цела; а вот
         * подъём незаконченной партии заходит НАПРЯМУЮ на экран игры, истории нет,
         * back делает replace('/') — и человек оказывается на ВЕРХУ каталога, вдали
         * от своего раздела. Позиция хранится в переменной модуля: ей не нужно
         * переживать перезапуск, только пересоздание главной в том же процессе.
         */
        scrollEventThrottle={250}
        onScroll={(e) => { savedHomeScrollY = e.nativeEvent.contentOffset.y; }}
        onContentSizeChange={() => {
          if (savedHomeScrollY > 0) homeScrollRef.current?.scrollTo({ y: savedHomeScrollY, animated: false });
        }}
      >
        {/*
          Ближайшая дверь. Стоит ПЕРЕД «продолжить игру»: это не действие, а
          обещание, и читается оно до того, как рука ушла в игру. Пропадает само,
          когда открыто всё, — строка «поздравляем, дальше ничего нет» хуже её
          отсутствия.
        */}
        {ближайшийЗамок && доЗамка !== null && (
          <View
            accessibilityLabel={t('ladderNext')
              .replace('{n}', String(доЗамка))
              .replace('{what}', t(ближайшийЗамок.titleKey))}
            style={[styles.ladderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
            <Text style={[styles.ladderText, { color: colors.textSecondary }]} numberOfLines={2}>
              {t('ladderNext')
                .replace('{n}', String(доЗамка))
                .replace('{what}', t(ближайшийЗамок.titleKey))}
            </Text>
          </View>
        )}
        {/*
          СУНДУК — единственное место, где видно, КУДА игрок идёт вдолгую. Полоска
          показывает текущую ступень, а не весь путь: «⭐120 из 17000» читается как
          недостижимое, «⭐120 из 150» — как «ещё одна партия».
          ⚠️ Собранное показываем числом X/12 рядом: без него после первой фигурки
          полоска снова уезжает в начало, и прогресс выглядит потерянным.
        */}
        {/*
          🔴 СУНДУК НАЖИМАЕТСЯ И ВЕДЁТ В ВИТРИНУ (задача 6e564484, шаг 2).
          Он говорил «собрано 3 из 12», а посмотреть на эти три было негде: цель
          оставалась числом. У эталона она предметная — двенадцать силуэтов на
          полках. Теперь карточка — вход в место, а не строка в ленте.
        */}
        <TouchableOpacity
          accessibilityRole="button"
          testID="chest-card"
          activeOpacity={0.85}
          onPress={() => router.push('/collection' as any)}
          accessibilityLabel={`${сундук.next
            ? t('chestToNext').replace('{n}', String(сундук.left)).replace('{have}', String(сундук.have)).replace('{all}', String(FIGURES.length))
            : t('chestFull')} — ${t('collectionOpen')}`}
          style={[styles.chestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={styles.chestFace}>{сундук.next ? сундук.next.face : '🏆'}</Text>
          <View style={styles.chestBody}>
            <Text style={[styles.chestText, { color: colors.textSecondary }]} numberOfLines={2}>
              {сундук.next
                ? t('chestToNext').replace('{n}', String(сундук.left)).replace('{have}', String(сундук.have)).replace('{all}', String(FIGURES.length))
                : t('chestFull')}
            </Text>
            <View style={[styles.chestTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.chestFill, { backgroundColor: colors.primary, width: `${Math.round(сундук.ratio * 100)}%` }]} />
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
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

        {/* 🎯 «Цель дня» — одна строка, написанная самим человеком, и что он к ней
            сегодня сделал. Не цитата и не наш лозунг: сервис не сочиняет ни слова
            (см. шапку src/services/dailyGoal.ts). Стоит ВЫШЕ блока «Сегодня»
            намеренно: сначала зачем, потом сколько. Число партий берём из того же
            журнала, что и «Сегодня», — второго счёта в приложении быть не должно.
            Закрытая на сегодня карточка не рисуется вовсе (state='hidden' → null),
            места под собой не оставляет и вернётся только завтра. */}
        <DailyGoalCard
          state={goalCard.state}
          goalText={goalCard.goal?.text ?? null}
          outcome={goalCard.goal?.outcome ?? null}
          reward={goalCard.goal?.reward ?? null}
          roundsToday={today.rounds}
          colors={colors}
          t={t}
          onSave={onGoalSave}
          onDismiss={onGoalDismiss}
          onOutcome={onGoalOutcome}
        />

        {/* 📒 «Сегодня» — что сыграно за календарные сутки и сколько принесло.
            Блок рисуется ВСЕГДА, в том числе на пустом дне: заголовок с приглашением
            честнее исчезнувшего блока — иначе в день, когда ещё не играли, экран молча
            теряет строку, и понять, что она вообще бывает, неоткуда. Строка «партий: N»
            рядом с суммой отвечает на вопрос «за что», а не только «сколько». */}
        {/**
          * 🔴 НЕ БОЛЬШЕ ТРЁХ СТРОК, И БЛОК КЛИКАБЕЛЬНЫЙ. Просьба Дениса 03.09.2026:
          * «надо чтобы блок сегодня давал не больше 3 строк игры, и чтобы можно было
          * кликнуть по нему и перейти уже на развёрнутую статистику по сегодня».
          * В активный день список рос без предела и выдавливал вниз всё остальное —
          * «Рекомендуем сегодня» уезжало за экран. Три строки — столько же, сколько
          * карточек в рекомендациях: полоса читается одним взглядом, а полный список
          * живёт на своём экране.
          */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('today')}
          activeOpacity={0.85}
          onPress={() => router.push('/statistics' as any)}
          style={[styles.todayBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.todayHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#f59e0b' }]} />
            <Ionicons name="today-outline" size={19} color="#f59e0b" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('today')}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${t('todayEarnedTitle')}: ${today.total}`}
              activeOpacity={0.8}
              onPress={() => router.push('/shop' as any)}
              style={styles.todayTotalBtn}
            >
              <Text style={styles.todayTotalText}>+{today.total} ⭐</Text>
              <Ionicons name="chevron-forward" size={13} color="#b45309" />
            </TouchableOpacity>
          </View>
          {today.rows.length === 0 ? (
            <Text style={[styles.todayEmpty, { color: colors.textSecondary }]}>
              {t('todayEmptyHint')}
            </Text>
          ) : (
            <>
              {today.rows.slice(0, TODAY_ROWS_MAX).map((row) => {
                const game = GAMES.find((g) => g.id === row.game);
                return (
                  <View key={row.game} style={styles.todayRow}>
                    <Text style={[styles.todayGame, { color: colors.text }]} numberOfLines={1}>
                      {game ? t(game.nameKey) : row.game}
                    </Text>
                    <Text style={[styles.todayRounds, { color: colors.textSecondary }]} numberOfLines={1}>
                      {t('todayRoundsLabel').replace('{n}', String(row.rounds))}
                    </Text>
                    {row.doubled && (
                      <View style={styles.todayMult}><Text style={styles.todayMultText}>×2</Text></View>
                    )}
                    <Text style={[styles.todayGain, { color: colors.text }]}>+{row.total}</Text>
                  </View>
                );
              })}
              {/* Остальное не прячем молча: строка говорит, сколько игр не поместилось,
                  и ведёт туда же, куда весь блок. */}
              {today.rows.length > TODAY_ROWS_MAX && (
                <Text style={[styles.todayMore, { color: colors.textSecondary }]}>
                  {t('todayMore').replace('{n}', String(today.rows.length - TODAY_ROWS_MAX))}
                </Text>
              )}
              {/* Серия дней показывается только когда она уже даёт множитель: обещать
                  «за режим — вдвое» на первом дне значило бы обещать несбывшееся. */}
              {today.dayStreak >= DAY_STREAK_FOR_MULT && (
                <Text style={[styles.todayEmpty, { color: colors.textSecondary }]}>
                  {t('todayStreakNote').replace('{n}', String(today.dayStreak))}
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>

        {/* 🎯 «Рекомендуем сегодня» — три упражнения вместо выбора из семидесяти одного.
            Под каждым сказано, ПОЧЕМУ оно здесь: причину считает recommend.ts по партиям
            этого человека, разметка её только показывает. Пустой блок не рисуем вовсе —
            заголовок над пустотой читается как поломка. */}
        {reco.length > 0 && (
          <View style={styles.recoBlock}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.primary }]} />
              <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('recoTitle')}</Text>
            </View>
            <Text style={[styles.recoHint, { color: colors.textSecondary }]} numberOfLines={2}>
              {t('recoHint')}
            </Text>
            <View style={styles.heroRow}>
              {reco.map(({ pick, game }) => {
                // Сыграно сегодня — карточка меняет ПОДПИСЬ, а не место: набор заморожен
                // на сутки, но обещать «давно не играли» после сегодняшней партии нельзя.
                const whyKey = pick.doneToday ? 'recoDoneToday' : pick.reasonKey;
                // Градиент у каждой рекомендации свой — и цвет текста тоже свой.
                const onG = onGradientText(game.gradient[0], game.gradient[game.gradient.length - 1]);
                const onGSoft = onGradientTextMuted(onG);
                return (
                  <TouchableOpacity
                    key={pick.gameId}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(game.nameKey)} — ${t(whyKey)}`}
                    style={styles.heroCardWrap}
                    activeOpacity={0.85}
                    // Свободный запуск: ни wu, ни auto. Вечером добавляется calm=1 —
                    // тот же тихий режим, что у вечернего шага зарядки.
                    onPress={() => router.push({ pathname: game.route, params: recoParams() } as any)}
                  >
                    <GradientSurface colors={game.gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
                      <View style={styles.heroTopRow}>
                        <Ionicons name={game.icon as any} size={26} color={onG.color} />
                        {pick.doneToday && (
                          <View style={[styles.heroChipMini, { backgroundColor: innerScrim(onG, 0.35) }]}>
                            <Text style={[styles.heroChipMiniText, { color: onG.color }]}>✓</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.heroTitle, { color: onG.color }]} numberOfLines={2}>{t(game.nameKey)}</Text>
                      <Text style={[styles.heroSub, { color: onGSoft }]} numberOfLines={3}>
                        {t(whyKey)}
                      </Text>
                      <View style={[styles.heroCta, { backgroundColor: innerScrim(onG, 0.35) }]}>
                        <Ionicons name="play" size={14} color={onG.color} />
                        <Text style={[styles.heroCtaText, { color: onG.color }]}>
                          {t(pick.doneToday ? 'ctaRepeat' : 'ctaStart')}
                        </Text>
                      </View>
                    </GradientSurface>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* v1.179: ряд ПРАКТИК — Зарядка · Глаза · Дыхание.
            Зарядка теперь ОДНА кнопка вместо двух («Утренняя» + «Вечерний комплекс»):
            подпись меняется по времени суток, выбор набора — на своём экране. За счёт
            освободившегося слота сюда переехало Дыхание, которого на главной не было
            вовсе (замысел Дениса 02.08). Три карточки — предел: на 360-412pt это
            103-120pt каждая, четвёртая ужимает до 74-88pt и текст перестаёт влезать. */}
        {/**
          * 🔴 У РЯДА ПРАКТИК ПОЯВИЛСЯ ЗАГОЛОВОК. Просьба Дениса 03.09.2026: «блок где
          * зарядки, дыхания, тоже сверху бы подписать, чтобы отдельник визуально не
          * много». Ряд шёл без подписи сразу за «Рекомендуем сегодня» и читался как
          * продолжение рекомендаций, хотя это другое: там упражнения на выбор, здесь —
          * ежедневные практики и вызов. Заголовок той же формы, что у соседей.
          */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: '#10b981' }]} />
          <Ionicons name="leaf-outline" size={19} color="#10b981" />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('practicesTitle')}</Text>
        </View>
        <View style={styles.heroRow}>
          {/* 🏃 Зарядка — подпись по часам, набор выбирается на /warmup-picker */}
          {profile.warmup_enabled && (
          <TouchableOpacity
            accessibilityRole="button" style={styles.heroCardWrap}
            onPress={() => router.push('/warmup-picker' as any)} activeOpacity={0.85}>
            <GradientSurface colors={SLOT_TINT[slotNow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Image source={FEATURE_ICONS.warmup} style={{ width: 30, height: 30, borderRadius: 8 }} />
                {streak > 0 && (
                  <View style={[styles.heroChipMini, { backgroundColor: innerScrim(onSlot, 0.2) }]}>
                    <Text style={[styles.heroChipMiniText, { color: onSlot.color }]}>🔥{streak}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroTitle, { color: onSlot.color }]} numberOfLines={1}>
                {t('warmupPickerTitle')}
              </Text>
              <Text style={[styles.heroSub, { color: onSlotSoft }]} numberOfLines={3}>
                {t('slot' + slotNow.charAt(0).toUpperCase() + slotNow.slice(1))}
                {' · '}
                {t('slot' + slotNow.charAt(0).toUpperCase() + slotNow.slice(1) + 'Desc')}
              </Text>
              <View style={[styles.heroCta, { backgroundColor: innerScrim(onSlot, 0.35) }]}>
                {/* Карточка ведёт на ВЫБОР набора, а не запускает его: «СТАРТ» обещал
                    запуск и обманывал. Значок тоже меняем — стрелка «дальше» вместо
                    «играть», иначе подпись честная, а картинка нет. */}
                <Ionicons name="chevron-forward" size={14} color={onSlot.color} />
                <Text style={[styles.heroCtaText, { color: onSlot.color }]}>{t('ctaChoose')}</Text>
              </View>
            </GradientSurface>
          </TouchableOpacity>
          )}

          {/* 🌿 ПАУЗА — одна кнопка вместо двух: «Гимнастика глаз» и «Дыхание».
              Просьба Дениса 26.08.2026: «надо слить в одну кнопку Гимнастику глаз
              и дыхание, третьей кнопкой можно поставить Вызов дня».
              Слияние НЕ выдумано под кнопку: `breathing` и `eye-gym` — это две из
              двадцати двух практик модуля «Пауза» (`src/games/pause`), рядом с
              лицом, осанкой, подвижностью и расслаблением. То есть две карточки на
              главной вели в два подмножества одного и того же набора, а подпись
              `pauseDesc` уже перечисляла и дыхание, и глаза.
              Отдельные экраны /games/eye-gym и /games/breathing НЕ удалены: они
              остаются в разделах и в «Зарядке», убран только дубль на главной. */}
          <TouchableOpacity
            accessibilityRole="button" style={styles.heroCardWrap}
            onPress={() => router.push('/games/pause' as any)} activeOpacity={0.85}>
            <GradientSurface colors={HERO_EYE as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Ionicons name="leaf-outline" size={26} color={ON_EYE.color} />
              </View>
              <Text style={[styles.heroTitle, { color: ON_EYE.color }]} numberOfLines={2}>{t('pause')}</Text>
              <Text style={[styles.heroSub, { color: ON_EYE_SOFT }]} numberOfLines={3}>{t('pauseDesc')}</Text>
              <View style={[styles.heroCta, { backgroundColor: '#FFF' }]}>
                <Ionicons name="play" size={14} color="#185a9d" />
                <Text style={[styles.heroCtaText, { color: '#185a9d' }]}>{t('ctaStart')}</Text>
              </View>
            </GradientSurface>
          </TouchableOpacity>
          {/* 🎯 Ежедневный вызов — ротация игр, детерминировано по дате */}
          <TouchableOpacity
            accessibilityRole="button" style={styles.heroCardWrap} onPress={startDailyChallenge} activeOpacity={0.85}>
            <GradientSurface colors={todayChallenge.game.gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Ionicons name="flash" size={26} color={onChallenge.color} />
                <View style={[styles.heroChipMini, { backgroundColor: innerScrim(onChallenge, 0.35) }]}>
                  <Text style={[styles.heroChipMiniText, { color: onChallenge.color }]}>
                    {isChallengeDoneToday(challengeStreak) ? '✓' : '🔥' + challengeStreak.streak}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroTitle, { color: onChallenge.color }]} numberOfLines={2}>
                {t('dailyChallenge')}
              </Text>
              <Text style={[styles.heroSub, { color: onChallengeSoft }]} numberOfLines={3}>
                {t(todayChallenge.game.nameKey)} · {t(todayChallenge.difficulty)}
              </Text>
              <View style={[styles.heroCta, { backgroundColor: innerScrim(onChallenge, 0.35) }]}>
                <Ionicons name="play" size={14} color={onChallenge.color} />
                <Text style={[styles.heroCtaText, { color: onChallenge.color }]}>
                  {isChallengeDoneToday(challengeStreak) ? t('ctaRepeat') : t('ctaStart')}
                </Text>
              </View>
            </GradientSurface>
          </TouchableOpacity>
        </View>

        {/* v1.238: ВТОРОГО РЯДА КАРТОЧЕК БОЛЬШЕ НЕТ.
            В нём оставался ровно один жилец — «Вызов дня»: «Оценка» и FIN BRAIN
            уехали в «Зарядку» ещё в v1.232 (решение Дениса 23.08.2026 — «перенести
            в зарядку всё, что идёт сериями»). Ряд из одной карточки растягивал её
            на треть экрана и держал заголовок ряда ради пустоты.
            Теперь «Вызов дня» стоит третьим в ряду выше — там, где Денис его и
            просил 26.08.2026: «третьей кнопкой можно поставить Вызов дня». */}

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
                    hubCount={game.hub ? составРазвилки[game.id] : undefined}
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

  /** Ближайшая дверь второй лестницы: подсказка о том, что откроется по уровню. */
  ladderCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10,
  },
  ladderText: { fontSize: 13, fontWeight: '600', flexShrink: 1, minWidth: 0 },
  chestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12,
  },
  chestFace: { fontSize: 22 },
  // flexShrink + minWidth: 0 обязательны — без них строка не даёт себя сжать и
  // карточка вылезает за край на 360 px (та же грабля, что в служебных рядах).
  chestBody: { flex: 1, minWidth: 0, gap: 6 },
  chestText: { fontSize: 13, fontWeight: '600', flexShrink: 1, minWidth: 0 },
  chestTrack: { height: 5, borderRadius: 3, overflow: 'hidden', width: '100%' },
  chestFill: { height: '100%', borderRadius: 3 },
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
  // Блок рекомендаций: заголовок с подсказкой и ряд карточек. Отступ снизу — тот же,
  // что у карточки «Продолжить», чтобы ритм первого экрана не сбивался.
  todayMore: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  // Блок «Сегодня»: рамка, а не карточка-градиент — он про факт, а не про призыв,
  // и не должен спорить за внимание с рекомендациями и практиками ниже.
  todayBlock: { marginBottom: 14, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Зона нажатия 44 при прежнем виде — отрицательный отступ гасит прибавку (тот же
  // приём, что у полоски лиг и профильного чипа в шапке).
  todayTotalBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44, marginVertical: -12, paddingHorizontal: 10, borderRadius: 100, backgroundColor: '#fbbf2422', borderWidth: 1.5, borderColor: '#f59e0b' },
  todayTotalText: { color: '#b45309', fontWeight: '900', fontSize: 14 },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayGame: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: '700' },
  todayRounds: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  todayMult: { backgroundColor: '#fbbf24', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  todayMultText: { color: '#3f2b00', fontSize: 11, fontWeight: '900' },
  todayGain: { fontSize: 14, fontWeight: '900', minWidth: 34, textAlign: 'right' },
  todayEmpty: { fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  recoBlock: { marginBottom: 14, gap: 6 },
  recoHint: { fontSize: 12, fontWeight: '600', marginTop: -2 },
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
