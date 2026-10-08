import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { GameSession, getSessions, statsOfSessions } from '@/src/services/api';
import { getTokens, levelInfo, getStreak } from '@/src/services/tokens';
import { GAMES, categoryOfSessionType } from '@/src/constants/games';
import { areaBreakdown, weakestArea, type AreaStat } from '@/src/services/analytics';
import {
  belongsToProfile,
  buildTrainingHistory,
  historyView,
  MAX_HISTORY_DAYS,
  type HistoryEntry,
  type HistoryUnit,
} from '@/src/services/trainingHistory';
import { localDateKey } from '@/src/services/warmup';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfile } from '@/src/contexts/ProfileContext';
import { isGameAllowed } from '@/src/constants/profiles';
import { getAiInsight, toneForProfile, isoWeekKey } from '@/src/services/aiInsight';
import { postScreenModel, registerScreenActions } from '@/src/services/hostScreens';

/**
 * 🔴 ВЫХОД В WEB-DEMO — В ОБЁРТКЕ БЕЗ ХУКОВ, А НЕ ПЕРВОЙ СТРОКОЙ ЭКРАНА.
 *
 * Стоял первой строкой, ДО всех хуков: `if (isWebDemo()) return <Redirect/>`.
 * Условный ранний выход перед хуками — это разное их число между рендерами и
 * ошибка React #310. Замер 09.09.2026: `react-hooks/rules-of-hooks` насчитал
 * 53 нарушения по проекту, из них StatisticsScreen держал свою долю; отчёт
 * тестировщика 6ec1941e — экран «Что-то сломалось» на `/achievements`.
 * Тот же приём применён в `pet.tsx`, `span.tsx` и `sudoku-hub.tsx` 05.09.2026.
 *
 * Обёртка хуков не вызывает вовсе, поэтому возвращать из неё по условию законно.
 */
export default function StatisticsScreen() {
  // Web-demo: экран недоступен — только демо-лендинг и игры. Гейт статичен (build-time флаг).
  if (isWebDemo()) return <Redirect href="/" />;
  return <StatisticsScreenBody />;
}

function StatisticsScreenBody() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  // Вкладки: сводка (итоги) и история (движение). Обе живут на ОДНОЙ загрузке —
  // переключение не ходит в хранилище, иначе клик по вкладке давал бы спиннер.
  const [tab, setTab] = useState<'summary' | 'history'>('summary');
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const { profile } = useProfile();
  const [scopeAll, setScopeAll] = useState(false);  // false = текущий профиль, true = все игры
  const [tokens, setTokens] = useState(0);          // D1: токены/уровень/стрик в герое
  const [streakDays, setStreakDays] = useState(0);
  /*
   * Баланс тренировок по областям: чего человек качает, а что обходит стороной.
   *
   * 🔴 СЧИТАЕТСЯ ПО ВЫБРАННОМУ ПРОФИЛЮ, А НЕ ПО ВСЕМУ УСТРОЙСТВУ. Отчёты dfd6b290 и
   * 54c73576 (18–19.09.2026): «у двух разных людей одна фигура». На кадре переключатель
   * стоит на «Микро-релакс», а в балансе 458 партий всего устройства, восстановление
   * 1 %. Баланс считался ОДИН раз при загрузке, по всем партиям всех профилей за всё
   * время, и переключателя не слушал; у Вали в её профиле восстановление — 8 % (замер
   * по облаку 30.09). Теперь профиль — его партии, «Все игры» — все.
   * «Своя» партия — та же, что во вкладке «История» (`belongsToProfile`): где так
   * написано в ней самой. Догадок о ничьих партиях нет.
   *
   * Раздел берётся по ТИПУ ПАРТИИ, а не по id карточки: у трёх судоку они различаются
   * (id через дефис, партия через подчёркивание), и эти партии выпадали из баланса молча.
   */
  const profileId = profile?.id;
  /**
   * 🔴 КАРТОЧКИ ИГР — ПО ТЕМ ЖЕ ПАРТИЯМ, ЧТО И БАЛАНС (задача a6b99ecc, 07.10.2026). Карточки
   * строились из `getAllStats()` — по ВСЕМ партиям устройства, — и фильтровались только по составу
   * профиля: у «Микро-релакс» в «Судоку» стояло «Всего игр 16» при своих 4, у nzt48 — «Дыхание»
   * другого профиля. Теперь охват один на весь экран: итоги, карточки, столбики, баланс.
   */
  const scopedSessions = useMemo(
    () => (scopeAll || !profileId ? sessions : sessions.filter((s) => belongsToProfile(s, profileId))),
    [sessions, scopeAll, profileId],
  );
  const stats = useMemo(() => {
    const catalog = GAMES.map((g) => g.id);
    const extras = [...new Set(scopedSessions.map((s) => s.game_type))].filter((id) => !!id && !catalog.includes(id));
    return [...catalog, ...extras].map((id) => statsOfSessions(id, scopedSessions));
  }, [scopedSessions]);
  // Очки по играм в хронологии — для столбиков; те же партии охвата.
  const sessionsByGame = useMemo(() => {
    const byGame: Record<string, number[]> = {};
    for (const s of scopedSessions) {
      if (!s.game_type) continue;
      (byGame[s.game_type] ||= []).push(typeof s.score === 'number' && isFinite(s.score) ? s.score : 0);
    }
    return byGame;
  }, [scopedSessions]);
  const areas = useMemo<AreaStat[]>(
    () => areaBreakdown(scopedSessions as any, categoryOfSessionType),
    [scopedSessions],
  );
  /**
   * 🔴 ОЧКИ И СЕРИЯ — ПРОФИЛЯ, КОТОРЫЙ ВЫБРАН СЕЙЧАС (a6b99ecc). `loadStats` звался один раз при
   * монтировании и читал их для `profile?.id` в тот момент: холодный заход на /statistics (ссылка,
   * перезагрузка) брал профиль по умолчанию — на кадре «0 очков» при 1240.
   */
  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    Promise.all([getTokens(profileId), getStreak(profileId)])
      .then(([tk, st]) => { if (alive) { setTokens(tk); setStreakDays(st); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [profileId]);
  // v1.115.0: недельный ИИ-дайджест — кэш на ISO-неделю (isoWeekKey), молчаливый null = карточка просто не рисуется
  const [aiDigest, setAiDigest] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      let freshStreak = 0;
      if (profile?.id) { setTokens(await getTokens(profile.id)); freshStreak = await getStreak(profile.id); setStreakDays(freshStreak); }
      // D1.2: сгруппировать очки по играм в хронологии для спарклайнов
      const allSessions = await getSessions();
      setSessions(allSessions);   // сырые сессии — вкладкам «Сводка» и «История»; карточки считаются из них по охвату
      // Недельный дайджест — компактный агрегат за последние 7 дней (не сырой дамп сессий)
      if (profile?.id) {
        const weekAgo = Date.now() - 7 * 86400_000;
        const thisWeek = allSessions.filter((s) => s.timestamp && new Date(s.timestamp).getTime() >= weekAgo);
        const byWeekday: Record<number, number> = {};
        for (const s of thisWeek) { if (s.timestamp) { const wd = new Date(s.timestamp).getDay(); byWeekday[wd] = (byWeekday[wd] || 0) + 1; } }
        const totalGamesLocal = allSessions.filter((s) => !!s.game_type).length;
        getAiInsight(
          'weekly_digest', profile.id, isoWeekKey(), language, toneForProfile(profile.id),
          { sessionsThisWeek: thisWeek.length, uniqueGamesThisWeek: new Set(thisWeek.map((s) => s.game_type)).size,
            currentStreakDays: freshStreak, sessionsByWeekday: byWeekday, totalGamesEver: totalGamesLocal },
        ).then((text) => { if (text) setAiDigest(text); }).catch(() => {});
      }
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

  // ───────────── История тренировок ─────────────
  // Строится из ТЕХ ЖЕ сессий, что уже загружены для сводки: своего хранилища у истории
  // нет и не нужно — иначе она появилась бы только у тех, кто играл после этой правки.
  const historyDays = useMemo(() => buildTrainingHistory(
    sessions.filter((s) => {
      // Игра не из реестра (переименованная, снятая) — рисовать нечем: ни имени, ни цвета.
      if (!GAMES.some((g) => g.id === s.game_type)) return false;
      if (scopeAll) return true;
      return isGameAllowed(profile, s.game_type) && belongsToProfile(s, profile.id);
    }),
  ), [sessions, scopeAll, profile]);

  const view = historyView(historyDays, { anySessions: sessions.length > 0, scoped: !scopeAll });

  /** Результат партии словами. `—` только там, где данные битые (мусорное время). */
  const formatResult = (value: number | null, unit: HistoryUnit): string => {
    if (value === null) return '—';
    return unit === 'seconds' ? formatTime(value) : String(Math.round(value));
  };

  /** Вердикт: лучше / хуже / так же / новая сложность / первый раз.
   *  Направление и «с чем сравнивать» уже решены в сервисе. */
  const verdictText = (e: HistoryEntry): string => {
    if (e.verdict === 'newTask') return t('historyNewTask');
    if (e.verdict === null || e.diff === null) return t('historyFirstRun');
    if (e.verdict === 'same') return t('historySame');
    return t(e.verdict === 'better' ? 'historyBetter' : 'historyWorse')
      .replace('{n}', formatResult(e.diff, e.unit));
  };

  const verdictColor = (e: HistoryEntry): string =>
    e.verdict === 'better' ? '#1f6b4a' : e.verdict === 'worse' ? '#9e2b2b' : colors.textSecondary;

  /** «Сегодня» / «Вчера» / «12 августа». Локаль берём кодом языка — Intl понимает его сам. */
  const dayLabel = (key: string): string => {
    const now = new Date();
    if (key === localDateKey(now)) return t('today');
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    if (key === localDateKey(yest)) return t('historyYesterday');
    const [y, m, d] = key.split('-').map(Number);
    try {
      return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
    } catch {
      return key;   // экзотическая среда без Intl — лучше сырая дата, чем падение экрана
    }
  };

  const timeLabel = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // D1: агрегаты прогресса для героя
  const lvl = levelInfo(tokens);
  const totalGames = stats.reduce((s, x) => s + x.total_sessions, 0);
  const totalTime = stats.reduce((s, x) => s + (isFinite(x.total_time) && x.total_time > 0 && x.total_time <= 86400 * 365 ? x.total_time : 0), 0);
  const formatTotal = (s: number) => s >= 3600 ? `${(s / 3600).toFixed(1)}${t('unitHourShort')}` : `${Math.round(s / 60)}${t('unitMinShort')}`;

  /**
   * 🔴 ПОД ОБОЛОЧКОЙ ЭТОТ ЭКРАН РИСУЕТ FLUTTER (задача 6ff4a966, `services/hostScreens.ts`).
   * Модель — перекладка того, что рисует разметка ниже, ТЕМИ ЖЕ функциями (formatTime, вердикты,
   * подписи дней, sparkBars). Вне оболочки `postScreenModel` молчит.
   */
  const statsModel = useMemo(() => {
    const shownStats = stats.filter((st) => st.total_sessions > 0 && (scopeAll || isGameAllowed(profile, st.game_type)));
    const areaLabel = (a: string) => t(`cat${a.charAt(0).toUpperCase()}${a.slice(1)}`);
    const weak = weakestArea(areas);
    return {
      v: 1,
      title: t('statistics'),
      primary: colors.primary,
      labels: { back: t('a11yBack'), refresh: t('a11yRefresh'), summary: t('statsTabSummary'), history: t('statsTabHistory') },
      loading,
      scope: { profile: `${profile.emoji} ${t('profileName_' + profile.id)}`, all: t('allGames'), isAll: scopeAll },
      totalPlayed: loading ? null : t('totalPlayedCompleted').replace('{n}', String(stats.reduce((sum, st) => sum + st.total_sessions, 0))),
      hero: {
        tokens, tokensLabel: t('tokensLabel'), level: `Lv ${lvl.level}`, levelTitle: t(lvl.titleKey),
        streak: streakDays, streakLabel: t('streakLabel'), progress: lvl.span !== null ? lvl.progress : null,
        games: `${totalGames} ${t('gamesPlayed')}`, time: `${formatTotal(totalTime)} ${t('inGameTime')}`,
      },
      areas: areas.length > 0 ? {
        title: t('areaBalanceTitle'), hint: t('areaBalanceHint'),
        rows: areas.map((a) => {
          const pct = Math.round(a.share * 100);
          const trendPct = a.trend === null ? null : Math.round(a.trend * 100);
          return {
            area: a.area, label: areaLabel(a.area), pct, text: `${pct}% · ${a.sessions}`,
            a11y: `${areaLabel(a.area)}: ${pct}%, ${a.sessions}`,
            trend: trendPct !== null && trendPct !== 0
              ? { up: trendPct > 0, text: (trendPct > 0 ? t('areaTrendUp') : t('areaTrendDown')).replace('{n}', String(Math.abs(trendPct))) }
              : null,
          };
        }),
        weak: weak ? t('areaBalanceWeak').replace('{area}', areaLabel(weak)) : null,
      } : null,
      ai: aiDigest ? { title: `📅 ${t('weekInReview')}`, text: aiDigest } : null,
      games: shownStats.flatMap((stat) => {
        const cfg = getGameConfig(stat.game_type);
        if (!cfg) return [];
        const arr = sessionsByGame[stat.game_type] ?? [];
        const shown = arr.slice(-12);
        const best = arr.length ? Math.max(...arr) : 0;
        const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        return [{
          id: stat.game_type, name: t(cfg.nameKey), icon: cfg.icon,
          gradient: [...(cfg.gradient as string[])],
          stats: [
            { label: stat.outcome_known > 0 ? t('statPassedOfPlayed') : t('totalGames'),
              value: stat.outcome_known > 0 ? `${stat.passed_sessions}/${stat.total_sessions}` : String(stat.total_sessions) },
            { label: t('statFastest'), value: stat.best_results.length > 0 ? formatTime(stat.best_results[0].time_seconds) : '-' },
            { label: t('statSlowest'), value: stat.worst_time > 0 ? formatTime(stat.worst_time) : '-' },
            { label: t('averageTime'), value: formatTime(stat.average_time) },
          ],
          spark: arr.length >= 2 ? {
            caption: t('statScoreBars').replace('{n}', String(shown.length)), bars: sparkBars(shown),
            color: (cfg.gradient as string[])[1], older: t('statOlder'), newer: t('statNewer'),
            numbers: best > 0 ? t('scoreBestAvg').replace('{best}', String(best)).replace('{avg}', String(avg)) : t('trendRecentGames'),
          } : null,
        }];
      }),
      empty: stats.every((st) => st.total_sessions === 0) ? t('statsEmptyHint') : null,
      history: view.kind === 'days'
        ? {
            kind: 'days',
            days: view.days.map((day) => ({
              label: dayLabel(day.dateKey),
              entries: day.entries.map((e) => {
                const cfg = getGameConfig(e.gameType)!;
                const value = formatResult(e.value, e.unit);
                const verdict = verdictText(e);
                const level = e.level === null ? '' : t('historyLevelShort').replace('{n}', String(e.level));
                return {
                  name: t(cfg.nameKey), icon: cfg.icon, color: (cfg.gradient as string[])[0], verdict, verdictColor: verdictColor(e),
                  level: level || null, value, time: timeLabel(e.timestamp),
                  label: `${t(cfg.nameKey)}${level ? ', ' + level : ''}, ${timeLabel(e.timestamp)}, ${value}, ${verdict}`,
                };
              }),
            })),
            tail: view.days.length >= MAX_HISTORY_DAYS ? t('historyTailHint').replace('{n}', String(MAX_HISTORY_DAYS)) : null,
          }
        : {
            kind: view.kind, icon: view.kind === 'empty' ? 'time-outline' : 'funnel-outline',
            title: t(view.titleKey), hint: t(view.hintKey), cta: t(view.ctaKey), action: view.kind === 'empty' ? 'home' : 'scopeAll',
          },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- форматтеры экрана пересоздаются каждым рендером; модель зависит от данных
  }, [stats, scopeAll, profile, areas, aiDigest, sessionsByGame, tokens, streakDays, loading, historyDays, sessions.length, language, colors.primary, t]);
  useEffect(() => { postScreenModel('/statistics', statsModel); }, [statsModel]);
  // Свежая `loadStats` для действия оболочки: функция пересоздаётся каждым рендером, а действия
  // регистрируются один раз.
  const statsActs = React.useRef({ loadStats });
  useEffect(() => { statsActs.current = { loadStats }; });
  useEffect(() => registerScreenActions('/statistics', {
    scope: (all: boolean) => setScopeAll(!!all),
    refresh: () => { void statsActs.current.loadStats(); },
    back: () => goBackOrHome(),
  }), []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name={isRTLLang(language) ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('statistics')}</Text>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yRefresh')}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={loadStats}
        >
          <Ionicons name="refresh" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Вкладки. Сводка отвечает «сколько всего», история — «что менялось». Второе и
          есть повод вернуться: итог одинаков вчера и сегодня, а движение — нет.
          Оба списка строятся из одной загрузки, поэтому переключение мгновенное. */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 10 }}>
        {([['summary', 'statsTabSummary'], ['history', 'statsTabHistory']] as const).map(([id, key]) => (
          <TouchableOpacity
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={{ flex: 1, paddingVertical: 10, minHeight: 48, justifyContent: 'center', alignItems: 'center',
              borderBottomWidth: 3, borderBottomColor: tab === id ? colors.primary : 'transparent' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: tab === id ? colors.primary : colors.textSecondary }}>
              {t(key)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* v1.15.0: scope toggle — статистика этого профиля vs все игры */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 10 }}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setScopeAll(false)}
          style={{ flex: 1, paddingVertical: 8, minHeight: 48, justifyContent: 'center', borderRadius: 10, alignItems: 'center',
            backgroundColor: !scopeAll ? colors.primary : colors.surface,
            borderWidth: 1, borderColor: !scopeAll ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: !scopeAll ? '#fff' : colors.text }}>
            {profile.emoji} {t('profileName_' + profile.id)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setScopeAll(true)}
          style={{ flex: 1, paddingVertical: 8, minHeight: 48, justifyContent: 'center', borderRadius: 10, alignItems: 'center',
            backgroundColor: scopeAll ? colors.primary : colors.surface,
            borderWidth: 1, borderColor: scopeAll ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: scopeAll ? '#fff' : colors.text }}>
            {t('allGames')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Истинный total по всем играм (не зависит от фильтра профиля) — чтобы было видно
          реальное число сыгранного, а не только игры текущего профиля. Считаются ЗАВЕРШЁННЫЕ
          сессии (брошенные на середине не сохраняются). */}
      {!loading && (
        <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
          {t('totalPlayedCompleted').replace('{n}', String(stats.reduce((sum, s) => sum + s.total_sessions, 0)))}
        </Text>
      )}

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {!loading && tab === 'summary' && (
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
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>{t('tokensLabel')}</Text>
              </View>
              {/* flexShrink+minWidth: длинный титул уровня при крупном шрифте не распирает ряд за край карточки */}
              <View style={{ alignItems: 'center', flexShrink: 1, minWidth: 0 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 2 }}>Lv {lvl.level}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>{t(lvl.titleKey)}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>🔥</Text>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{streakDays}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>{t('streakLabel')}</Text>
              </View>
            </View>
            {lvl.span !== null && (
              <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 12, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(lvl.progress * 100)}%`, height: 6, backgroundColor: '#fff' }} />
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{totalGames} {t('gamesPlayed')}</Text>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{formatTotal(totalTime)} {t('inGameTime')}</Text>
            </View>
          </LinearGradient>

          {/* Баланс тренировок по областям.
              ⚠️ Полоса — ДОЛЯ ТРЕНИРОВОК, а не оценка способности. Сказать «ваше внимание
              на 59%» мы не можем: для этого нужны нормы по возрасту, которых у нас нет, а
              выдумать их — то же, что обещать рост IQ, чего мы прямо не обещаем в карточке
              Play. Доля же — проверяемый факт, и с перекосом можно что-то сделать. */}
          {areas.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>
                {t('areaBalanceTitle')}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginBottom: 10 }}>
                {t('areaBalanceHint')}
              </Text>
              {areas.map((a) => {
                const label = t(`cat${a.area.charAt(0).toUpperCase()}${a.area.slice(1)}`);
                const pct = Math.round(a.share * 100);
                const trendPct = a.trend === null ? null : Math.round(a.trend * 100);
                return (
                  <View
                    key={a.area}
                    accessibilityRole="text"
                    accessibilityLabel={`${label}: ${pct}%, ${a.sessions}`}
                    style={{ marginBottom: 9 }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>{label}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                        {pct}% · {a.sessions}
                      </Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: 8, backgroundColor: colors.primary || '#7f7fd5' }} />
                    </View>
                    {/* Сдвиг показываем ТОЛЬКО когда есть что сравнивать. «0%» вместо
                        «нет данных» сообщил бы о застое там, где данных просто мало. */}
                    {trendPct !== null && trendPct !== 0 && (
                      <Text style={{ color: trendPct > 0 ? '#1f6b4a' : '#9e2b2b', fontSize: 11.5, marginTop: 2 }}>
                        {(trendPct > 0 ? t('areaTrendUp') : t('areaTrendDown')).replace('{n}', String(Math.abs(trendPct)))}
                      </Text>
                    )}
                  </View>
                );
              })}
              {weakestArea(areas) && (
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 2 }}>
                  {t('areaBalanceWeak').replace('{area}', t(`cat${weakestArea(areas)!.charAt(0).toUpperCase()}${weakestArea(areas)!.slice(1)}`))}
                </Text>
              )}
            </View>
          )}


          {/* v1.115.0: недельный ИИ-дайджест — молчаливо не рисуется, пока нет текста (нет ключа/сеть/мало данных) */}
          {aiDigest && (
            <View style={[styles.aiCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
              <Text style={[styles.aiTitle, { color: colors.primary }]}>📅 {t('weekInReview')}</Text>
              <Text style={[styles.aiText, { color: colors.text }]}>{aiDigest}</Text>
            </View>
          )}

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
                  {/* flexShrink+minWidth: длинное имя игры при крупном шрифте не вылезает за карточку (overflow:hidden обрезал бы) */}
                  <Text style={[styles.cardTitle, { flexShrink: 1, minWidth: 0 }]} numberOfLines={2}>{t(gameConfig.nameKey)}</Text>
                </LinearGradient>
                <View style={[styles.cardBody, { backgroundColor: colors.surface }]}>
                  {/* v1.163 (репорт Вали): «почему нет по времени сколько максимальная была
                      игра, сколько минимальная» + «должны считаться только те игры, где я
                      выиграла». Показываем и самую долгую попытку, и долю пройденных —
                      там, где у игры вообще есть победа (у тестов вроде RMET её нет). */}
                  <View style={styles.statRow}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {stat.outcome_known > 0 ? t('statPassedOfPlayed') : t('totalGames')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {stat.outcome_known > 0
                          ? `${stat.passed_sessions}/${stat.total_sessions}`
                          : stat.total_sessions}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('statFastest')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {stat.best_results.length > 0
                          ? formatTime(stat.best_results[0].time_seconds)
                          : '-'}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('statSlowest')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {stat.worst_time > 0 ? formatTime(stat.worst_time) : '-'}
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
                    const shown = arr.slice(-12);
                    // v1.163 (репорт Вали): «что это за диаграмма, где-то я активнее, где-то
                    // менее активная» — она читала столбики как активность по дням. Это не дни
                    // и не активность: столбик = ОЧКИ за одну попытку, слева старые, справа
                    // свежие. Пишем это прямым текстом и подписываем края.
                    const caption = t('statScoreBars').replace('{n}', String(shown.length));
                    const numbers = best > 0
                      ? t('scoreBestAvg').replace('{best}', String(best)).replace('{avg}', String(avg))
                      : t('trendRecentGames');
                    return (
                      <View>
                        <Text style={[styles.statLabel, { color: colors.textSecondary, marginTop: 12 }]}>{caption}</Text>
                        <Sparkline data={shown} color={(gameConfig.gradient as string[])[1]} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{t('statOlder')}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{numbers}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{t('statNewer')}</Text>
                        </View>
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
              {/* было t('language') === 'ru' — сравнение с ПЕРЕВОДОМ слова «Язык», ru-ветка
                  никогда не срабатывала; теперь нормальный ключ словаря */}
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('statsEmptyHint')}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ───────────── ИСТОРИЯ ─────────────
          День → упражнения этого дня → результат и что с ним стало относительно
          ПРОШЛОГО РАЗА этого же упражнения. Все три состояния (дни / пусто у нового
          человека / всё спрятал фильтр) решает historyView — в разметке такое правило
          проверялось бы только глазами. */}
      {!loading && tab === 'history' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {view.kind === 'days' && view.days.map((day) => (
            <View key={day.dateKey} style={{ marginBottom: 18 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }}>
                {dayLabel(day.dateKey)}
              </Text>
              {day.entries.map((e, i) => {
                const cfg = getGameConfig(e.gameType)!;
                const value = formatResult(e.value, e.unit);
                const verdict = verdictText(e);
                // Уровень подписан рядом с вердиктом: без него «новая сложность»
                // выглядит капризом, а с ним видно, что задача правда сменилась.
                const level = e.level === null ? '' : t('historyLevelShort').replace('{n}', String(e.level));
                return (
                  <View
                    key={`${e.timestamp}-${i}`}
                    accessibilityRole="text"
                    accessibilityLabel={`${t(cfg.nameKey)}${level ? ', ' + level : ''}, ${timeLabel(e.timestamp)}, ${value}, ${verdict}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
                      borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: (cfg.gradient as string[])[0] }}>
                      <Ionicons name={cfg.icon as any} size={18} color="#fff" />
                    </View>
                    {/* minWidth:0 — длинное имя упражнения ужимается, а не выдавливает результат за край */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                        {t(cfg.nameKey)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                        <Text style={{ color: verdictColor(e), fontSize: 12 }}>{verdict}</Text>
                        {!!level && <Text style={{ color: colors.textSecondary, fontSize: 11 }}>· {level}</Text>}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                        {value}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{timeLabel(e.timestamp)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {view.kind === 'days' && view.days.length >= MAX_HISTORY_DAYS && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              {t('historyTailHint').replace('{n}', String(MAX_HISTORY_DAYS))}
            </Text>
          )}

          {/* Пусто у нового человека — обычное дело, а не поломка: зовём сыграть.
              Никаких «примерных» данных: чужой прогресс под видом своего — обман. */}
          {view.kind === 'empty' && (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={64} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>
                {t(view.titleKey)}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 8 }]}>
                {t(view.hintKey)}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => router.replace('/')}
                style={{ marginTop: 18, minHeight: 48, justifyContent: 'center', paddingHorizontal: 22,
                  borderRadius: 12, backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{t(view.ctaKey)}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Партии есть, но их спрятал фильтр профиля — показываем выход, а не пустоту. */}
          {view.kind === 'scoped' && (
            <View style={styles.emptyState}>
              <Ionicons name="funnel-outline" size={64} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>
                {t(view.titleKey)}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 8 }]}>
                {t(view.hintKey)}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setScopeAll(true)}
                style={{ marginTop: 18, minHeight: 48, justifyContent: 'center', paddingHorizontal: 22,
                  borderRadius: 12, backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{t(view.ctaKey)}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * Столбики спарклайна: высота 5..24 по размаху min..max, прозрачность от старых к свежим.
 * Одна формула для веба и нативной оболочки (модель экрана) — вынесено 07.10.2026.
 */
export function sparkBars(data: readonly number[]): { h: number; op: number }[] {
  if (data.length < 2) return [];
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  return data.map((v, i) => ({ h: 5 + Math.round(((v - min) / span) * 19), op: 0.35 + 0.65 * (i / (data.length - 1)) }));
}

// D1.2: мини-спарклайн тренда очков (бары; нормализация min..max; ramp прозрачности старое→свежее)
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const bars = sparkBars(data);
  if (!bars.length) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 26, gap: 2, marginTop: 6 }}>
      {bars.map((b, i) => <View key={i} style={{ flex: 1, height: b.h, backgroundColor: color, borderRadius: 2, opacity: b.op }} />)}
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
    paddingBottom: FAB_CLEARANCE,
    marginBottom: 16,
  },
  aiCard: { padding: 14, borderRadius: 12, borderWidth: 1.5, gap: 6, marginBottom: 14 },
  aiTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  aiText: { fontSize: 14, lineHeight: 21 },
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
