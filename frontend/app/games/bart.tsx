import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#ff5e62', '#ff9966'];
const BART_BENEFITS = [
  { icon: 'speedometer-outline', textKey: 'benefitBart1' },
  { icon: 'analytics-outline',   textKey: 'benefitBart2' },
  { icon: 'shield-outline',      textKey: 'benefitBart3' },
];

// BART (Lejuez et al., 2002): each balloon has hidden burst point, drawn from 1..N (uniform).
// Each pump: +1¢ pending. Cash out → into bank. Burst → pending lost.
// Metric: "adjusted average pumps" = mean pumps on non-burst balloons.

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

const MAX_BURST_BY_DIFF: Record<Difficulty, number> = { easy: 64, medium: 32, hard: 16 };
// average burst = MAX/2; at MAX-1 pump, P(burst this pump) = 1

export default function BARTGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [balloons, setBalloons] = useState(15);

  const [round, setRound] = useState(0);
  const [pumps, setPumps] = useState(0);
  const [pending, setPending] = useState(0);
  const [bank, setBank] = useState(0);
  const [burstAt, setBurstAt] = useState<number>(0);
  const [popped, setPopped] = useState(false);
  const [history, setHistory] = useState<{pumps: number, popped: boolean}[]>([]);
  const [animScale] = useState(new Animated.Value(1));
  const [feedback, setFeedback] = useState<'pop' | 'cash' | null>(null);

  useEffect(() => {
    if (phase === 'playing') resetBalloon();
  }, [round]);

  const resetBalloon = () => {
    const max = MAX_BURST_BY_DIFF[difficulty];
    setBurstAt(1 + Math.floor(Math.random() * max));
    setPumps(0);
    setPending(0);
    setPopped(false);
    setFeedback(null);
    animScale.setValue(1);
  };

  const startGame = () => {
    setBank(0); setHistory([]); setRound(1);
    setPhase('playing');
  };

  const finish = async (finalBank: number, finalHist: typeof history) => {
    const nonBurst = finalHist.filter(h => !h.popped);
    const adjAvg = nonBurst.length ? nonBurst.reduce((s, h) => s + h.pumps, 0) / nonBurst.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'bart',
        score: finalBank,
        time_seconds: 0,
        difficulty,
        mode: `${balloons}b`,
        errors: finalHist.filter(h => h.popped).length,
        details: { adj_avg_pumps: Math.round(adjAvg * 10) / 10, total_balloons: balloons, popped_count: finalHist.filter(h => h.popped).length },
      });
    } catch (e) { console.error(e); }
  };

  const pump = () => {
    if (popped || feedback !== null) return;
    const nextPumps = pumps + 1;
    setPumps(nextPumps);
    setPending(nextPumps);
    Animated.sequence([
      Animated.timing(animScale, { toValue: 1 + nextPumps * 0.04, duration: 80, useNativeDriver: true }),
    ]).start();
    if (nextPumps >= burstAt) {
      // pop
      setPopped(true);
      setPending(0);
      setFeedback('pop');
      const nh = [...history, { pumps: nextPumps, popped: true }];
      setHistory(nh);
      Animated.timing(animScale, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      setTimeout(() => {
        if (round >= balloons) finish(bank, nh);
        else setRound(r => r + 1);
      }, 1200);
    }
  };

  const cashOut = () => {
    if (popped || feedback !== null) return;
    setFeedback('cash');
    const newBank = bank + pending;
    setBank(newBank);
    const nh = [...history, { pumps, popped: false }];
    setHistory(nh);
    setTimeout(() => {
      if (round >= balloons) finish(newBank, nh);
      else setRound(r => r + 1);
    }, 800);
  };

  const adjAvg = (() => {
    const ne = history.filter(h => !h.popped);
    return ne.length ? Math.round((ne.reduce((s, h) => s + h.pumps, 0) / ne.length) * 10) / 10 : 0;
  })();
  const popCount = history.filter(h => h.popped).length;

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="warning" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('bart')}</Text>
        <Text style={styles.configDesc}>{t('bartDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => (
            <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDifficulty(d)}>
              <Text style={[styles.modeButtonText, { color: difficulty === d ? '#FFF' : colors.text }]}>
                {t(d)} (max~{MAX_BURST_BY_DIFF[d]})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('balloonsCount')}</Text>
        <View style={styles.optionButtons}>
          {[10, 15, 20].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, balloons === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setBalloons(n)}>
              <Text style={[styles.modeButtonText, { color: balloons === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const balloonSize = 60 + pumps * 4;

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{language === 'ru' ? 'Шар' : 'Balloon'} {round}/{balloons}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>💰{bank}¢</Text>
        <Text style={[styles.statText, { color: '#fbbf24' }]}>⏳{pending}¢</Text>
        <Text style={[styles.statText, { color: '#ef4444' }]}>💥{popCount}</Text>
        <Text style={[styles.statText, { color: GRADIENT[0] }]}>μ{adjAvg}</Text>
      </View>
      <View style={styles.balloonArea}>
        <Animated.View style={{
          width: balloonSize, height: balloonSize * 1.2, borderRadius: balloonSize/2,
          backgroundColor: feedback === 'pop' ? '#ef4444' : GRADIENT[0],
          transform: [{ scale: animScale }],
          justifyContent: 'center', alignItems: 'center',
          shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        }}>
          {!popped && <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '900' }}>{pumps}</Text>}
          {feedback === 'pop' && <Text style={{ color: '#FFF', fontSize: 32 }}>💥</Text>}
        </Animated.View>
      </View>

      {/* Risk-meter (educational): показывает текущую вероятность взрыва ПРИ СЛЕДУЮЩЕМ pump'е */}
      {!popped && (() => {
        const max = MAX_BURST_BY_DIFF[difficulty];
        // P(burst on next pump) = 1 / (max - pumps), при условии что не лопнул до этого pump'а
        const remaining = Math.max(1, max - pumps);
        const nextRisk = Math.min(1, 1 / remaining);
        const riskPct = Math.round(nextRisk * 100);
        const riskColor =
          nextRisk < 0.05 ? '#22c55e' :
          nextRisk < 0.15 ? '#84cc16' :
          nextRisk < 0.30 ? '#fbbf24' :
          nextRisk < 0.50 ? '#f97316' :
          '#ef4444';
        return (
          <View style={styles.riskMeter}>
            <View style={styles.riskHeader}>
              <Text style={[styles.riskLabel, { color: colors.textSecondary }]}>{language === 'ru' ? 'Риск взрыва на след. pump' : 'Burst risk on next pump'}</Text>
              <Text style={[styles.riskValue, { color: riskColor }]}>{riskPct}%</Text>
            </View>
            <View style={[styles.riskBar, { backgroundColor: colors.surface }]}>
              <View style={{
                height: '100%',
                width: `${Math.min(100, nextRisk * 100)}%`,
                backgroundColor: riskColor,
                borderRadius: 4,
              }} />
            </View>
            <Text style={[styles.riskHint, { color: colors.textSecondary }]}>
              {language === 'ru'
                ? (nextRisk < 0.10 ? '🟢 Безопасно — копи дальше' :
                   nextRisk < 0.25 ? '🟡 Внимание — pending растёт' :
                   nextRisk < 0.50 ? '🟠 Рискованно — может стоит cash?' :
                   '🔴 Очень опасно — почти гарантированный взрыв')
                : (nextRisk < 0.10 ? '🟢 Safe — keep banking' :
                   nextRisk < 0.25 ? '🟡 Caution — pending is growing' :
                   nextRisk < 0.50 ? '🟠 Risky — maybe cash out?' :
                   '🔴 Very dangerous — burst almost guaranteed')}
            </Text>
          </View>
        );
      })()}

      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {feedback === 'pop' ? t('bartPopped') : feedback === 'cash' ? t('bartCashed') : t('bartHint')}
      </Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity disabled={popped || feedback !== null}
          style={[styles.actionBtn, { backgroundColor: GRADIENT[0], opacity: popped || feedback ? 0.5 : 1 }]}
          onPress={pump}>
          <Ionicons name="add-circle" size={22} color="#FFF" />
          <Text style={styles.actionText}>{t('bartPump')}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={popped || feedback !== null || pumps === 0}
          style={[styles.actionBtn, { backgroundColor: '#22c55e', opacity: popped || feedback || pumps === 0 ? 0.5 : 1 }]}
          onPress={cashOut}>
          <Ionicons name="cash" size={22} color="#FFF" />
          <Text style={styles.actionText}>{t('bartCash')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('bart')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="bart" icon="warning" gradient={GRADIENT as [string, string]}
          skillKey="skillRisk" descriptionKey="bartIntroDesc"
          benefits={BART_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={bank}
          time={undefined} errors={popCount}
          onPlayAgain={() => setPhase('config')} onGoHome={() => router.back()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  modeButtonText: { fontSize: 12, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  balloonArea: { width: 280, height: 280, justifyContent: 'center', alignItems: 'center' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  actionsRow: { flexDirection: 'row', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12 },
  actionText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  riskMeter: { width: 280, gap: 6, marginTop: 6 },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  riskLabel: { fontSize: 11, fontWeight: '600' },
  riskValue: { fontSize: 16, fontWeight: '900' },
  riskBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  riskHint: { fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
});
