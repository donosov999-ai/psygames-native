import GradientSurface from '@/src/components/GradientSurface';
import { onGradientText, onGradientTextMuted, innerScrim } from '@/src/services/onGradientText';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { GAMES } from '@/src/constants/games';
import { разборПоНавыкам, type Разбор } from '@/src/services/warmupBreakdown';
import { saveWeakSkill } from '@/src/services/weakSkill';
import { getSessions } from '@/src/services/api';
import {
  loadWarmupHistory, computeStreak, brainTodayVerdict, WarmupHistoryEntry,
  PlaylistMeta, играПартии, повторСерии, очкиСоЗнаком, серияЗасчитана, серияБезСчёта,
} from '@/src/services/warmup';
import { имяШага } from '@/src/services/stepName';
import { addTokens, comboBonus } from '@/src/services/tokens';
import { loadReminderSettings, saveReminderSettings, applyReminders, requestReminderPermission, DEFAULT_REMINDERS } from '@/src/services/reminders';
import { getAiInsight, toneForProfile, dayKey } from '@/src/services/aiInsight';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';
import type { StepResult } from '@/src/contexts/WarmupContext';

// Промпт «включить напоминания?» показываем после завершённой зарядки, пока
// напоминания выключены и юзер не ответил (флаг). Только натив — на web no-op.
const REMINDER_PROMPT_FLAG = 'psygames_reminder_prompt_dismissed';

const GRADIENT_GOLD = ['#fbbf24', '#f59e0b'];
const GRADIENT_GREEN = ['#22c55e', '#0d9488'];
const GRADIENT_REMIND = ['#8b5cf6', '#6366f1'];
// Зашитый белый на зелёной плашке серии давал 2.28 — считаем по обоим концам.
const ON_GREEN = onGradientText(GRADIENT_GREEN[0], GRADIENT_GREEN[1]);
const ON_GREEN_SOFT = onGradientTextMuted(ON_GREEN);
const ON_REMIND = onGradientText(GRADIENT_REMIND[0], GRADIENT_REMIND[1]);
const GRADIENT_STOPPED = ['#94a3b8', '#64748b'];
const ON_GOLD = onGradientText(GRADIENT_GOLD[0], GRADIENT_GOLD[1]);
const ON_GOLD_SOFT = onGradientTextMuted(ON_GOLD);
const ON_STOPPED = onGradientText(GRADIENT_STOPPED[0], GRADIENT_STOPPED[1]);
const ON_STOPPED_SOFT = onGradientTextMuted(ON_STOPPED);

export default function WarmupComplete() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const warmup = useWarmup();
  const { profile } = useProfile();
  const [history, setHistory] = useState<WarmupHistoryEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [verdict, setVerdict] = useState<{ delta_pct: number; message: string } | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [combo, setCombo] = useState<{ bonus: number; streakLen: number } | null>(null);
  const [reminderPrompt, setReminderPrompt] = useState<'hidden' | 'show' | 'enabled'>('hidden');
  // v1.115.0: ИИ-версия «Мозг сегодня» — прогрессивное улучшение. rule-based verdict
  // (brainTodayVerdict) рисуется МГНОВЕННО, aiVerdictText подменяет текст, когда придёт
  // (кэш на день — первая зарядка дня зовёт сеть, остальные показы за этот день читают кэш).
  const [aiVerdictText, setAiVerdictText] = useState<string | null>(null);

  /**
   * Разбор по навыкам (отчёт 0660eb0a). Свёрнут по умолчанию: человек только что
   * закончил зарядку, и первое, что он хочет видеть, — что она закончена, а не
   * таблицу. Разворачивается одним касанием.
   */
  const [разбор, setРазбор] = useState<Разбор | null>(null);
  const [разборРаскрыт, setРазборРаскрыт] = useState(false);

  // v1.13.2 fix: snapshot meta/results/startTime СРАЗУ при mount.
  // stopWarmup() в useEffect занулит warmup.meta=null в WarmupContext →
  // re-render бы показал «Сессия не найдена», даже если зарядка ОК завершена.
  // Snapshot держит данные стабильно для всего жизненного цикла экрана.
  const [snap] = useState<{
    meta: PlaylistMeta | null;
    results: StepResult[];
    startTime: number;
  }>(() => ({
    meta: warmup.meta,
    results: warmup.results,
    startTime: warmup.startTime,
  }));

  const meta = snap.meta;
  const results = snap.results;
  const totalScore = results.reduce((a, b) => a + (b.score || 0), 0);
  const elapsedSec = snap.startTime > 0 ? (Date.now() - snap.startTime) / 1000 : 0;
  const elapsedMin = Math.floor(elapsedSec / 60);
  const elapsedSecRem = Math.floor(elapsedSec % 60);
  // Засчитана при ≥ 80 % сыгранных шагов (решение Дениса 17.09.2026, `серияЗасчитана`).
  const completed = meta ? серияЗасчитана(meta.steps.length, results.length) : false;
  // «Не спится»: ни очков, ни разбора, ни стрика (`серияБезСчёта`).
  const безСчёта = серияБезСчёта(meta);

  /**
   * ⚠️ ПРОШЛЫЕ ПАРТИИ БЕРЁМ БЕЗ СЕГОДНЯШНИХ. Партии этой зарядки уже записаны в
   * общую историю к моменту показа итога, и если их не отсечь, игра сравнится
   * сама с собой — отклонение всегда выйдет около нуля, а блок будет выглядеть
   * работающим. Отсекаем по количеству: у каждой игры выбрасываем столько
   * последних записей, сколько её партий было сегодня.
   */
  useEffect(() => {
    // «Не спится» навыков не разбирает и слабое место в совет не пишет.
    if (безСчёта) return;
    let жив = true;
    getSessions().then((все) => {
      if (!жив) return;
      const сегодня = results.map((r) => ({ game_type: r.game_type, score: r.score }));
      const убрать = new Map<string, number>();
      for (const r of сегодня) убрать.set(r.game_type, (убрать.get(r.game_type) ?? 0) + 1);
      const прошлые: { game_type: string; score: number }[] = [];
      for (let i = все.length - 1; i >= 0; i -= 1) {
        const s = все[i]!;
        // Результаты зарядки записаны именем шага, партии — корзиной экрана: сводим к одному.
        const игра = играПартии(s);
        const надо = убрать.get(игра) ?? 0;
        if (надо > 0) { убрать.set(игра, надо - 1); continue; }
        прошлые.push({ game_type: игра, score: s.score });
      }
      const р = разборПоНавыкам(сегодня, прошлые,
        (id) => GAMES.find((g) => g.id === id)?.skillKey);
      setРазбор(р);
      // Слабое место уезжает в совет «рекомендуем сегодня»: считать его дважды
      // в двух местах значило бы получить два разных ответа на один вопрос.
      void saveWeakSkill(р);
    }).catch(() => {});
    return () => { жив = false; };
  }, [results, безСчёта]);

  // PlaylistMeta исторически хранит русские подписи (ПН / перед сном).
  // В интерфейсе показываем язык пользователя, не меняя формат сохранённой истории.
  const metaWeekday = meta
    ? new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2024, 0, 7 + meta.weekday)))
        .replace(/\.$/, '')
    : '';
  // Набор (своя серия, серия развилки, тема хаба) подписан своим названием: слот у него
  // служебный, и «Утренняя» под «Рабочей памятью · 5 мин» — неправда (см. `PlaylistMeta.вид`).
  const metaSlot = meta?.вид === 'набор' ? meta.track_label
    : meta?.slot === 'morning' ? t('slotMorning')
    : meta?.slot === 'day' ? t('slotDay')
      : meta?.slot === 'evening' ? t('slotEvening')
        : meta?.slot === 'night' ? t('slotNight')
          : meta?.track_label || '';

  // Persist & compute streak/verdict
  useEffect(() => {
    (async () => {
      if (!persisted) {
        await warmup.stopWarmup(completed);
        setPersisted(true);
        // Комбо-множитель ×1.5: 3 чистые игры подряд в сессии → бонус токенов сверху
        // (каждая игра уже начислила свои токены отдельно через saveSession/addTokens).
        const c = безСчёта ? { bonus: 0, streakLen: 0 } : comboBonus(results);
        setCombo(c);
        if (c.bonus > 0 && profile?.id) addTokens(profile.id, c.bonus).catch(() => {});
      }
      const h = await loadWarmupHistory();
      setHistory(h);
      // «Не спится»: ни стрика, ни «Мозга сегодня», ни похода к ИИ — напоминание ниже остаётся.
      const streakVal = безСчёта ? 0 : computeStreak(h);
      setStreak(streakVal);
      const ruleVerdict = безСчёта ? null : brainTodayVerdict(h, language);
      setVerdict(ruleVerdict);
      // ИИ-версия — только если есть о чём говорить (та же база, что и rule-based verdict).
      // Тихий fallback: любая ошибка/нет ключа на сервере → aiVerdictText остаётся null,
      // рисуется ruleVerdict.message (уже показан выше, не ждём сеть).
      if (ruleVerdict && profile?.id) {
        const completedHist = h.filter((e) => e.completed);
        const prevScores = completedHist.slice(-11, -1).map((e) => e.total_score);
        getAiInsight(
          'daily_verdict', profile.id, dayKey(), language, toneForProfile(profile.id),
          {
            todayScore: totalScore, medianOfPrevious: prevScores, deltaPct: Math.round(ruleVerdict.delta_pct),
            streakDays: streakVal, gamesToday: results.map((r) => ({ game: r.game_type, score: r.score, errors: r.errors })),
          },
        ).then((text) => { if (text) setAiVerdictText(text); }).catch(() => {});
      }
      // Промпт напоминаний: натив + зарядка завершена + оба напоминания выключены + не отвечал
      if (Platform.OS !== 'web' && completed) {
        try {
          const dismissed = await AsyncStorage.getItem(REMINDER_PROMPT_FLAG);
          const rs = await loadReminderSettings();
          if (dismissed !== 'true' && !rs.morning && !rs.evening) setReminderPrompt('show');
        } catch {}
      }
    })();
  }, []);

  const enableReminders = async () => {
    try {
      const granted = await requestReminderPermission();
      await AsyncStorage.setItem(REMINDER_PROMPT_FLAG, 'true');
      if (granted) {
        const s = { ...DEFAULT_REMINDERS, morning: true };
        await saveReminderSettings(s);
        await applyReminders(s, language);
        setReminderPrompt('enabled');
        return;
      }
    } catch {}
    setReminderPrompt('hidden');   // отказ в системном диалоге — не приставать
  };

  const dismissReminders = async () => {
    try { await AsyncStorage.setItem(REMINDER_PROMPT_FLAG, 'true'); } catch {}
    setReminderPrompt('hidden');
  };

  const goHome = () => router.replace('/' as any);
  // «Ещё раз» — ТОТ ЖЕ набор той же длины, а не новая сборка по слоту (см. `повторСерии`).
  // У замеров с остыванием повтора нет, и кнопки нет.
  const повтор = повторСерии(meta);
  const playAgain = () => { if (повтор) warmup.startPlaylist(повтор); };

  if (!meta) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          <Text style={{ color: colors.text }}>{t('sessionNotFound')}</Text>
          <TouchableOpacity
            accessibilityRole="button" style={[styles.btn, { backgroundColor: '#fbbf24' }]} onPress={goHome}>
            <Text style={[styles.btnText, { color: '#000' }]}>{t('goHome')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Best ever for this duration/track
  const sameKindBest = Math.max(
    0,
    ...history
      .filter((h) => h.duration_min === meta.duration_min && h.track === meta.track && h.completed)
      .map((h) => h.total_score)
  );
  const isPersonalBest = !безСчёта && totalScore > 0 && totalScore >= sameKindBest;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingBottom: FAB_CLEARANCE }]} showsVerticalScrollIndicator={false}>
        {/* Hero header */}
        {/* Две плашки, а не тернарник в `colors`: у золотой и у серой РАЗНАЯ
            глубина, единого цвета текста на оба градиента нет (чёрный на `#64748b`
            даёт 4.41 — мимо), а серой нужна лёгкая вуаль. Разведя состояния, мы
            делаем каждую пару «фон + текст» неподвижной и проверяемой счётом. */}
        {completed ? (
        <GradientSurface
          colors={GRADIENT_GOLD as [string, string]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <Text style={styles.heroEmoji}>🎉</Text>
          <Text style={[styles.heroTitle, { color: ON_GOLD.color }]}>{t('warmupDoneTitle')}</Text>
          <Text style={[styles.heroSubtitle, { color: ON_GOLD_SOFT }]}>
            {metaWeekday} · {metaSlot} · {elapsedMin}:{elapsedSecRem.toString().padStart(2, '0')}
          </Text>
          {isPersonalBest && (
            <View style={[styles.pbBadge, { backgroundColor: innerScrim(ON_GOLD, 0.2) }]}>
              <Ionicons name="trophy" size={16} color={ON_GOLD.color} />
              <Text style={[styles.pbText, { color: ON_GOLD.color }]}>{t('personalBest')}</Text>
            </View>
          )}
        </GradientSurface>
        ) : (
        <GradientSurface
          colors={GRADIENT_STOPPED as [string, string]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <Text style={styles.heroEmoji}>⏸</Text>
          <Text style={[styles.heroTitle, { color: ON_STOPPED.color }]}>{t('warmupStoppedTitle')}</Text>
          <Text style={[styles.heroSubtitle, { color: ON_STOPPED_SOFT }]}>
            {metaWeekday} · {metaSlot} · {elapsedMin}:{elapsedSecRem.toString().padStart(2, '0')}
          </Text>
        </GradientSurface>
        )}

        {/* Per-game breakdown */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('resultsTitle')}</Text>
          {results.map((r, i) => {
            const game = GAMES.find((g) => g.id === r.game_type);
            // Имя — по шагу набора (режим головоломки), а не по общей карточке экрана.
            const шаг = r.шаг !== undefined ? meta.steps[r.шаг] : undefined;
            return (
              <View key={i} style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={[styles.rowDot, { backgroundColor: game?.gradient[0] || '#fbbf24' }]} />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowGame, { color: colors.text }]}>
                    {шаг ? имяШага(шаг, t) : game ? t(game.nameKey) : r.game_type}
                  </Text>
                  <View style={styles.rowMetrics}>
                    {!безСчёта && <Text style={[styles.metric, { color: r.score < 0 ? '#f43f5e' : '#22c55e' }]}>{очкиСоЗнаком(r.score)}</Text>}
                    <Text style={[styles.metric, { color: colors.textSecondary }]}>{r.time_seconds.toFixed(1)}{t('secShort')}</Text>
                    {!безСчёта && r.errors > 0 && <Text style={[styles.metric, { color: '#f43f5e' }]}>✗{r.errors}</Text>}
                  </View>
                </View>
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
              </View>
            );
          })}
          {/* v1.166: раньше тут было «Пропущено: N игр» — голое число читалось как
              ошибка приложения («ни 1 игры не было пропущено»). Называем игры
              поимённо: тогда видно, что это был выбор человека, а не сбой. */}
          {meta.steps.length > results.length && (() => {
            // Пропущенные — шаги без результата с их номером; результаты без номера — по имени, как было.
            const поНомеру = results.length > 0 && results.every((r) => r.шаг !== undefined);
            const сыграны = new Set(results.map((r) => r.шаг));
            const doneIds = results.map((r) => r.game_type);
            const missed = meta.steps
              .filter((st, i) => (поНомеру ? !сыграны.has(i) : !doneIds.includes(st.game_id)))
              .map((st) => имяШага(st, t));
            return (
              <Text style={[styles.skipped, { color: colors.textSecondary }]}>
                {t('skippedNamed')}: {missed.join(', ')}
              </Text>
            );
          })()}
        </View>

        {/*
          РАЗБОР ПО НАВЫКАМ — свёрнутый (отчёт 0660eb0a: «развернуть статистику,
          сказать, где молодец и где провал, дать тенденцию и рекомендации,
          в свёрнутом виде»).
          Показываем только когда есть ЧТО сказать: без истории игры сравнивать
          не с чем, и пустой раскрывающийся блок был бы обещанием без содержания.
        */}
        {разбор && разбор.навыки.length > 0 && (
          <View style={[styles.totalCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: разборРаскрыт }}
              onPress={() => setРазборРаскрыт((v) => !v)}
              style={styles.breakdownHead}
            >
              <Text style={[styles.breakdownTitle, { color: colors.text }]}>{t('warmupBreakdownTitle')}</Text>
              <Ionicons name={разборРаскрыт ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Сводка видна и в свёрнутом виде: ради неё блок и открывают. */}
            <Text style={[styles.breakdownLead, { color: colors.textSecondary }]}>
              {разбор.лучший
                ? t('warmupBreakdownUp').replace('{skill}', t(разбор.лучший.skillKey)).replace('{pct}', String(Math.round(разбор.лучший.delta)))
                : разбор.худший
                ? t('warmupBreakdownDown').replace('{skill}', t(разбор.худший.skillKey)).replace('{pct}', String(Math.abs(Math.round(разбор.худший.delta))))
                : t('warmupBreakdownFlat')}
            </Text>

            {разборРаскрыт && (
              <View style={styles.breakdownBody}>
                {разбор.навыки.map((н) => (
                  <View key={н.skillKey} style={styles.breakdownRow}>
                    <Text style={[styles.breakdownSkill, { color: colors.text }]} numberOfLines={1}>{t(н.skillKey)}</Text>
                    <Text style={[styles.breakdownDelta, { color: н.delta >= 0 ? '#22c55e' : '#f43f5e' }]}>
                      {н.delta >= 0 ? '+' : ''}{Math.round(н.delta)}%
                    </Text>
                  </View>
                ))}
                {разбор.худший && (
                  <Text style={[styles.breakdownHint, { color: colors.textSecondary }]}>
                    {t('warmupBreakdownAdvice').replace('{skill}', t(разбор.худший.skillKey))}
                  </Text>
                )}
                {разбор.безИстории > 0 && (
                  <Text style={[styles.breakdownHint, { color: colors.textSecondary }]}>
                    {t('warmupBreakdownNoHistory').replace('{n}', String(разбор.безИстории))}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Total — у «Не спится» счёта нет вовсе */}
        {!безСчёта && (
        <View style={[styles.totalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>{t('totalScoreLabel')}</Text>
          <Text style={[styles.totalValue, { color: '#fbbf24' }]}>{totalScore}</Text>
          {sameKindBest > 0 && (
            <Text style={[styles.totalCompare, { color: colors.textSecondary }]}>
              {isPersonalBest ? t('bestInCategory') : t('bestScoreN').replace('{n}', String(sameKindBest))}
            </Text>
          )}
          {combo && combo.bonus > 0 && (
            <View style={styles.comboBadge}>
              <Text style={styles.comboText}>
                {t('comboLine').replace('{n}', String(combo.streakLen)).replace('{b}', String(combo.bonus))}
              </Text>
            </View>
          )}
        </View>
        )}

        {/* Streak */}
        {streak > 0 && (
          <GradientSurface colors={GRADIENT_GREEN as [string, string]} style={styles.streakCard}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View>
              <Text style={[styles.streakValue, { color: ON_GREEN.color }]}>{(streak === 1 ? t('streakDayOne') : t('streakDaysMany')).replace('{n}', String(streak))}</Text>
              <Text style={[styles.streakLabel, { color: ON_GREEN_SOFT }]}>{t('dontBreakStreak')}</Text>
            </View>
          </GradientSurface>
        )}

        {/* Brain today verdict */}
        {verdict && (
          <View style={[styles.verdictCard, {
            backgroundColor: colors.surface,
            borderLeftColor: verdict.delta_pct > 5 ? '#22c55e' : verdict.delta_pct < -5 ? '#f43f5e' : '#fbbf24',
          }]}>
            <Text style={[styles.verdictTitle, { color: colors.textSecondary }]}>{t('brainTodayTitle')}</Text>
            <Text style={[styles.verdictMsg, { color: colors.text }]}>{aiVerdictText || verdict.message}</Text>
          </View>
        )}

        {/* Промпт напоминаний (натив, пока выключены) */}
        {reminderPrompt === 'show' && (
          <View style={[styles.reminderCard, { backgroundColor: colors.surface, borderColor: '#8b5cf6' }]}>
            <Text style={styles.reminderEmoji}>🔔</Text>
            <Text style={[styles.reminderTitle, { color: colors.text }]}>
              {t('remindTomorrowQ')}
            </Text>
            <Text style={[styles.reminderBody, { color: colors.textSecondary }]}>
              {t('remindTomorrowBody')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button" style={styles.reminderBtn} onPress={enableReminders}>
              <GradientSurface colors={GRADIENT_REMIND as [string, string]} style={styles.btnGrad}>
                <Ionicons name="notifications" size={18} color={ON_REMIND.color} />
                <Text style={[styles.btnText, { color: ON_REMIND.color, paddingVertical: 0 }]}>{t('ctaEnable')}</Text>
              </GradientSurface>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" onPress={dismissReminders}>
              <Text style={[styles.reminderLater, { color: colors.textSecondary }]}>{t('notNow')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {reminderPrompt === 'enabled' && (
          <View style={[styles.reminderCard, { backgroundColor: colors.surface, borderColor: '#22c55e' }]}>
            <Text style={[styles.reminderTitle, { color: '#22c55e' }]}>
              {t('remindSetMorning')}
            </Text>
          </View>
        )}

      </ScrollView>

      {/*
        🔴 «ЕЩЁ РАЗ» И «НА ГЛАВНУЮ» ЗАКРЕПЛЕНЫ ВНИЗУ, А НЕ ЕДУТ В КОНЦЕ СПИСКА.

        Отчёты 1e47d75d и fef9d101 (13.09.2026, 2.54.5, iOS 403×873, NZT-48), два подряд:
        «во всех упражнениях зарядке серии нужно сделать нижний тулбар фиксированно».
        Замер 17.09.2026 на экспорт-сборке 390×844: у дневной зарядки из пяти результатов
        кнопки стояли ниже края экрана — итог длинный (результаты, разбор по навыкам, общий
        счёт, серия), и до выхода приходилось листать. Панель — как у экрана выбора
        зарядки: вне прокрутки, с рамкой сверху. Список внизу оставляет место под кнопку
        отзыва (`FAB_CLEARANCE`), иначе последняя строка легла бы под неё.
      */}
      <View testID="warmup-complete-actions" style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.actions}>
          {повтор && (
          <TouchableOpacity
            accessibilityRole="button" style={[styles.btn, { flex: 1 }]} onPress={playAgain}>
            <LinearGradient colors={GRADIENT_GOLD as [string, string]} style={styles.btnGrad}>
              <Ionicons name="refresh" size={18} color="#000" />
              <Text style={[styles.btnText, { color: '#000' }]}>{t('ctaAgain')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          )}
          {/* v1.166 (репорт Вали «нет кнопки вернуться на главную, есть только повторить»):
              кнопка была, но уезжала под сгиб за «Ещё раз». Ставим её В РЯД, а не
              под ним — на невысоком экране видны обе. */}
          <TouchableOpacity
            accessibilityRole="button" style={[styles.btn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={goHome}>
            <Text style={[styles.btnText, { color: colors.text }]}>{t('goHome')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 14, maxWidth: 540, alignSelf: 'center', width: '100%' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hero: { padding: 22, borderRadius: 16, alignItems: 'center', gap: 6 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { fontSize: 22, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  heroSubtitle: { fontSize: 13, fontWeight: '700' },
  pbBadge: { marginTop: 8, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pbText: { fontSize: 12, fontWeight: '800' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 10 },
  rowDot: { width: 4, height: 36, borderRadius: 2 },
  rowMain: { flex: 1 },
  rowGame: { fontSize: 15, fontWeight: '700' },
  rowMetrics: { flexDirection: 'row', gap: 12, marginTop: 2 },
  metric: { fontSize: 13, fontWeight: '700' },
  skipped: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  breakdownHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44 },
  breakdownTitle: { fontSize: 16, fontWeight: '800' },
  breakdownLead: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  breakdownBody: { width: '100%', marginTop: 10, gap: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  breakdownSkill: { flex: 1, fontSize: 14 },
  breakdownDelta: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  breakdownHint: { fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  totalCard: { padding: 18, borderRadius: 14, alignItems: 'center' },
  totalLabel: { fontSize: 12, fontWeight: '600' },
  totalValue: { fontSize: 42, fontWeight: '900' },
  totalCompare: { fontSize: 12, marginTop: 4 },
  comboBadge: { marginTop: 10, backgroundColor: '#fbbf24', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  comboText: { color: '#000', fontSize: 13, fontWeight: '800' },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14 },
  streakEmoji: { fontSize: 36 },
  streakValue: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  streakLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  verdictCard: { padding: 14, borderRadius: 12, borderLeftWidth: 4, gap: 4 },
  verdictTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  verdictMsg: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  reminderCard: { padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 8 },
  reminderEmoji: { fontSize: 32 },
  reminderTitle: { fontSize: 16, fontWeight: '800' },
  reminderBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  reminderBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', alignSelf: 'stretch', marginTop: 4 },
  reminderLater: { fontSize: 13, fontWeight: '600', paddingVertical: 6 },
  bar: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'stretch', maxWidth: 540, alignSelf: 'center', width: '100%' },
  btn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden' },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnText: { fontSize: 15, fontWeight: '800', letterSpacing: 1, paddingVertical: 14, textAlign: 'center' },
});
