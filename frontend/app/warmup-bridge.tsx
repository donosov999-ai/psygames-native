import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { GAMES } from '@/src/constants/games';
import { stepToParams } from '@/src/services/warmup';
import { useLanguage } from '@/src/contexts/LanguageContext';

const GRADIENT = ['#fbbf24', '#f59e0b'];
const AUTOSTART_SEC = 3;

export default function WarmupBridge() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const warmup = useWarmup();
  const [countdown, setCountdown] = useState(() => (warmup.meta?.slot === 'evening' ? 8 : 5));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The just-completed step is the previous one; current step is the next one.
  const meta = warmup.meta;
  const justCompletedIdx = warmup.currentIdx - 1;
  const justCompleted = meta && justCompletedIdx >= 0 ? meta.steps[justCompletedIdx] : null;
  const next = warmup.currentStep;
  const justCompletedResult = warmup.results[warmup.results.length - 1];
  const completedGame = justCompleted ? GAMES.find((g) => g.id === justCompleted.game_id) : null;
  const nextGame = next ? GAMES.find((g) => g.id === next.game_id) : null;
  const isEvening = meta?.slot === 'evening';
  const accent = isEvening ? '#818cf8' : '#fbbf24';

  // ⚠️ Навигация НЕ внутри setState-updater: updater исполняется в фазе рендера, и
  // router.replace оттуда давал «Cannot update NavigationContainerInner while rendering
  // WarmupBridge» — под React 18 такая навигация может теряться/дублироваться по таймингу
  // (симптом: зарядка обрывается раньше времени). Отсчёт только меняет число; переход — в
  // отдельном эффекте по countdown===0, с firedRef-гардом от двойного replace.
  const navFiredRef = useRef(false);
  useEffect(() => {
    if (!warmup.active || !next) {
      router.replace('/' as any);
      return;
    }
    intervalRef.current = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (countdown !== 0 || navFiredRef.current || !next) return;
    navFiredRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    router.replace({ pathname: next.game_route, params: stepToParams(next) } as any);
  }, [countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNow = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (next) router.replace({ pathname: next.game_route, params: stepToParams(next) } as any);
  };

  const skip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    warmup.skipCurrent();
    // next will navigate via context (advance increments idx; but we already advanced)
    // We were just on the bridge for "current" — calling skip moves to next-next.
    // Simpler: just navigate to whatever the new currentStep is after skip.
    setTimeout(() => {
      if (warmup.meta && warmup.currentIdx + 1 < warmup.meta.steps.length) {
        const ns = warmup.meta.steps[warmup.currentIdx + 1];
        router.replace({ pathname: ns.game_route, params: stepToParams(ns) } as any);
      } else {
        router.replace('/warmup-complete' as any);
      }
    }, 50);
  };

  const stop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await warmup.stopWarmup(false);
    router.replace('/' as any);
  };

  if (!warmup.active || !next) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.hud}>
        <Text style={[styles.hudText, { color: accent }]}>
          {isEvening ? (language === 'ru' ? '🌙 ПЕРЕД СНОМ' : '🌙 BEFORE SLEEP') : (language === 'ru' ? '⚡ ЗАРЯДКА' : '⚡ WARM-UP')} · {warmup.currentIdx}/{meta?.steps.length}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(warmup.currentIdx / (meta?.steps.length || 1)) * 100}%`, backgroundColor: accent }]} />
        </View>
      </View>

      <View style={styles.content}>
        {/* Just-completed result */}
        {justCompleted && completedGame && (
          <View style={[styles.completedCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
            <Text style={[styles.completedTitle, { color: colors.text }]}>
              {t(completedGame.nameKey)}
            </Text>
            {justCompletedResult && (
              <View style={styles.statsLine}>
                <Text style={[styles.statBadge, { color: '#22c55e' }]}>+{justCompletedResult.score}</Text>
                <Text style={[styles.statBadge, { color: colors.textSecondary }]}>{justCompletedResult.time_seconds.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
                {justCompletedResult.errors > 0 && <Text style={[styles.statBadge, { color: '#f43f5e' }]}>✗{justCompletedResult.errors}</Text>}
              </View>
            )}
          </View>
        )}

        {/* Next game preview */}
        {nextGame && (
          <LinearGradient colors={nextGame.gradient as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.nextCard}>
            <Text style={styles.nextLabel}>{language === 'ru' ? 'ДАЛЬШЕ:' : 'NEXT:'}</Text>
            <Ionicons name={nextGame.icon as any} size={56} color="#FFF" />
            <Text style={styles.nextTitle}>{t(nextGame.nameKey)}</Text>
            <Text style={styles.nextSkill}>{t(nextGame.skillKey)}</Text>
          </LinearGradient>
        )}

        {/* Countdown */}
        <Text style={[styles.countdown, { color: accent }]}>
          {language === 'ru' ? '⏱ Старт через ' : '⏱ Starting in '}{countdown}...
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionPrimary} onPress={startNow}>
            <LinearGradient colors={GRADIENT as [string, string]} style={styles.actionPrimaryGrad}>
              <Text style={styles.actionPrimaryText}>{language === 'ru' ? 'СТАРТ СЕЙЧАС' : 'START NOW'}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionSecondary, { borderColor: colors.border }]} onPress={skip}>
              <Ionicons name="play-skip-forward" size={18} color={colors.text} />
              <Text style={[styles.actionSecondaryText, { color: colors.text }]}>SKIP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionSecondary, { borderColor: '#f43f5e' }]} onPress={stop}>
              <Ionicons name="stop" size={18} color="#f43f5e" />
              <Text style={[styles.actionSecondaryText, { color: '#f43f5e' }]}>STOP</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hud: { padding: 12, gap: 8 },
  hudText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  progressBar: { height: 4, backgroundColor: '#1c1c40', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fbbf24' },
  content: { flex: 1, padding: 20, justifyContent: 'center', gap: 18, alignItems: 'center', maxWidth: 520, alignSelf: 'center', width: '100%' },
  completedCard: { padding: 16, borderRadius: 14, alignItems: 'center', gap: 8, width: '100%' },
  completedTitle: { fontSize: 18, fontWeight: '700' },
  statsLine: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statBadge: { fontSize: 14, fontWeight: '700' },
  nextCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8, width: '100%' },
  nextLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  nextTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  nextSkill: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  countdown: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  actions: { gap: 12, width: '100%', alignItems: 'center' },
  actionPrimary: { borderRadius: 12, overflow: 'hidden', width: '100%', maxWidth: 320 },
  actionPrimaryGrad: { paddingVertical: 16, alignItems: 'center' },
  actionPrimaryText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionSecondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1 },
  actionSecondaryText: { fontSize: 14, fontWeight: '700' },
});
