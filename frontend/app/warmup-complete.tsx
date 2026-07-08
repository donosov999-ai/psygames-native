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
import {
  loadWarmupHistory, computeStreak, brainTodayVerdict, WarmupHistoryEntry,
  PlaylistMeta,
} from '@/src/services/warmup';
import { addTokens, comboBonus } from '@/src/services/tokens';
import { loadReminderSettings, saveReminderSettings, applyReminders, requestReminderPermission, DEFAULT_REMINDERS } from '@/src/services/reminders';
import type { StepResult } from '@/src/contexts/WarmupContext';

// Промпт «включить напоминания?» показываем после завершённой зарядки, пока
// напоминания выключены и юзер не ответил (флаг). Только натив — на web no-op.
const REMINDER_PROMPT_FLAG = 'psygames_reminder_prompt_dismissed';

const GRADIENT_GOLD = ['#fbbf24', '#f59e0b'];
const GRADIENT_GREEN = ['#22c55e', '#0d9488'];

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
  const completed = meta ? results.length >= meta.steps.length : false;

  // Persist & compute streak/verdict
  useEffect(() => {
    (async () => {
      if (!persisted) {
        await warmup.stopWarmup(completed);
        setPersisted(true);
        // Комбо-множитель ×1.5: 3 чистые игры подряд в сессии → бонус токенов сверху
        // (каждая игра уже начислила свои токены отдельно через saveSession/addTokens).
        const c = comboBonus(results);
        setCombo(c);
        if (c.bonus > 0 && profile?.id) addTokens(profile.id, c.bonus).catch(() => {});
      }
      const h = await loadWarmupHistory();
      setHistory(h);
      setStreak(computeStreak(h));
      setVerdict(brainTodayVerdict(h, language));
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
  const playAgain = () => {
    if (meta) warmup.startWarmup(meta.duration_min as any);
  };

  if (!meta) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          <Text style={{ color: colors.text }}>{language === 'ru' ? 'Сессия не найдена' : 'Session not found'}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#fbbf24' }]} onPress={goHome}>
            <Text style={[styles.btnText, { color: '#000' }]}>{language === 'ru' ? 'На главную' : 'Home'}</Text>
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
  const isPersonalBest = totalScore > 0 && totalScore >= sameKindBest;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero header */}
        <LinearGradient
          colors={(completed ? GRADIENT_GOLD : ['#94a3b8', '#64748b']) as [string, string]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <Text style={styles.heroEmoji}>{completed ? '🎉' : '⏸'}</Text>
          <Text style={styles.heroTitle}>{completed ? (language === 'ru' ? 'ЗАРЯДКА ЗАВЕРШЕНА' : 'WARM-UP COMPLETE') : (language === 'ru' ? 'ЗАРЯДКА ОСТАНОВЛЕНА' : 'WARM-UP STOPPED')}</Text>
          <Text style={styles.heroSubtitle}>
            {meta.weekday_name} · {meta.track_label} · {elapsedMin}:{elapsedSecRem.toString().padStart(2, '0')}
          </Text>
          {isPersonalBest && completed && (
            <View style={styles.pbBadge}>
              <Ionicons name="trophy" size={16} color="#fbbf24" />
              <Text style={styles.pbText}>{language === 'ru' ? 'Личный рекорд' : 'Personal best'}</Text>
            </View>
          )}
        </LinearGradient>

        {/* Per-game breakdown */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{language === 'ru' ? 'Результаты' : 'Results'}</Text>
          {results.map((r, i) => {
            const game = GAMES.find((g) => g.id === r.game_type);
            return (
              <View key={i} style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={[styles.rowDot, { backgroundColor: game?.gradient[0] || '#fbbf24' }]} />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowGame, { color: colors.text }]}>
                    {game ? t(game.nameKey) : r.game_type}
                  </Text>
                  <View style={styles.rowMetrics}>
                    <Text style={[styles.metric, { color: '#22c55e' }]}>+{r.score}</Text>
                    <Text style={[styles.metric, { color: colors.textSecondary }]}>{r.time_seconds.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
                    {r.errors > 0 && <Text style={[styles.metric, { color: '#f43f5e' }]}>✗{r.errors}</Text>}
                  </View>
                </View>
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
              </View>
            );
          })}
          {meta.steps.length > results.length && (
            <Text style={[styles.skipped, { color: colors.textSecondary }]}>
              {language === 'ru' ? 'Пропущено: ' : 'Skipped: '}{meta.steps.length - results.length}{language === 'ru' ? ' игр' : ' games'}
            </Text>
          )}
        </View>

        {/* Total */}
        <View style={[styles.totalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>{language === 'ru' ? 'Общий счёт' : 'Total score'}</Text>
          <Text style={[styles.totalValue, { color: '#fbbf24' }]}>{totalScore}</Text>
          {sameKindBest > 0 && (
            <Text style={[styles.totalCompare, { color: colors.textSecondary }]}>
              {isPersonalBest ? (language === 'ru' ? '👑 Лучший в этой категории' : '👑 Best in this category') : (language === 'ru' ? `Лучший: ${sameKindBest}` : `Best: ${sameKindBest}`)}
            </Text>
          )}
          {combo && combo.bonus > 0 && (
            <View style={styles.comboBadge}>
              <Text style={styles.comboText}>
                {language === 'ru'
                  ? `🔥 Комбо ×1.5! ${combo.streakLen} чистых подряд · +${combo.bonus}`
                  : `🔥 Combo ×1.5! ${combo.streakLen} clean in a row · +${combo.bonus}`}
              </Text>
            </View>
          )}
        </View>

        {/* Streak */}
        {streak > 0 && (
          <LinearGradient colors={GRADIENT_GREEN as [string, string]} style={styles.streakCard}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View>
              <Text style={styles.streakValue}>{language === 'ru' ? `${streak} ${streak === 1 ? 'день' : 'дней'} подряд` : `${streak} ${streak === 1 ? 'day' : 'days'} in a row`}</Text>
              <Text style={styles.streakLabel}>{language === 'ru' ? 'Не сломай серию' : "Don't break the streak"}</Text>
            </View>
          </LinearGradient>
        )}

        {/* Brain today verdict */}
        {verdict && (
          <View style={[styles.verdictCard, {
            backgroundColor: colors.surface,
            borderLeftColor: verdict.delta_pct > 5 ? '#22c55e' : verdict.delta_pct < -5 ? '#f43f5e' : '#fbbf24',
          }]}>
            <Text style={[styles.verdictTitle, { color: colors.textSecondary }]}>{language === 'ru' ? '🧠 МОЗГ СЕГОДНЯ' : '🧠 BRAIN TODAY'}</Text>
            <Text style={[styles.verdictMsg, { color: colors.text }]}>{verdict.message}</Text>
          </View>
        )}

        {/* Промпт напоминаний (натив, пока выключены) */}
        {reminderPrompt === 'show' && (
          <View style={[styles.reminderCard, { backgroundColor: colors.surface, borderColor: '#8b5cf6' }]}>
            <Text style={styles.reminderEmoji}>🔔</Text>
            <Text style={[styles.reminderTitle, { color: colors.text }]}>
              {language === 'ru' ? 'Напомнить завтра?' : 'Remind you tomorrow?'}
            </Text>
            <Text style={[styles.reminderBody, { color: colors.textSecondary }]}>
              {language === 'ru'
                ? 'Одно мягкое напоминание утром в 9:00 — и стрик не сгорит. Время меняется в Settings.'
                : 'One gentle reminder at 9:00 AM keeps your streak alive. Change the time in Settings.'}
            </Text>
            <TouchableOpacity style={styles.reminderBtn} onPress={enableReminders}>
              <LinearGradient colors={['#8b5cf6', '#6366f1']} style={styles.btnGrad}>
                <Ionicons name="notifications" size={18} color="#FFF" />
                <Text style={[styles.btnText, { color: '#FFF', paddingVertical: 0 }]}>{language === 'ru' ? 'ВКЛЮЧИТЬ' : 'ENABLE'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismissReminders}>
              <Text style={[styles.reminderLater, { color: colors.textSecondary }]}>{language === 'ru' ? 'Не сейчас' : 'Not now'}</Text>
            </TouchableOpacity>
          </View>
        )}
        {reminderPrompt === 'enabled' && (
          <View style={[styles.reminderCard, { backgroundColor: colors.surface, borderColor: '#22c55e' }]}>
            <Text style={[styles.reminderTitle, { color: '#22c55e' }]}>
              {language === 'ru' ? '✓ Напомню утром в 9:00' : '✓ Will remind you at 9:00 AM'}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btn} onPress={playAgain}>
            <LinearGradient colors={GRADIENT_GOLD as [string, string]} style={styles.btnGrad}>
              <Ionicons name="refresh" size={18} color="#000" />
              <Text style={[styles.btnText, { color: '#000' }]}>{language === 'ru' ? 'ЕЩЁ РАЗ' : 'AGAIN'}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={goHome}>
            <Text style={[styles.btnText, { color: colors.text }]}>{language === 'ru' ? 'На главную' : 'Home'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 14, maxWidth: 540, alignSelf: 'center', width: '100%' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hero: { padding: 22, borderRadius: 16, alignItems: 'center', gap: 6 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { color: '#000', fontSize: 22, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  heroSubtitle: { color: 'rgba(0,0,0,0.7)', fontSize: 13, fontWeight: '700' },
  pbBadge: { marginTop: 8, flexDirection: 'row', gap: 6, backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pbText: { color: '#000', fontSize: 12, fontWeight: '800' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 10 },
  rowDot: { width: 4, height: 36, borderRadius: 2 },
  rowMain: { flex: 1 },
  rowGame: { fontSize: 15, fontWeight: '700' },
  rowMetrics: { flexDirection: 'row', gap: 12, marginTop: 2 },
  metric: { fontSize: 13, fontWeight: '700' },
  skipped: { fontSize: 12, textAlign: 'center', marginTop: 4 },
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
  reminderBtn: { borderRadius: 12, overflow: 'hidden', alignSelf: 'stretch', marginTop: 4 },
  reminderLater: { fontSize: 13, fontWeight: '600', paddingVertical: 6 },
  actions: { gap: 10, marginTop: 8 },
  btn: { borderRadius: 12, overflow: 'hidden' },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnText: { fontSize: 15, fontWeight: '800', letterSpacing: 1, paddingVertical: 14, textAlign: 'center' },
});
