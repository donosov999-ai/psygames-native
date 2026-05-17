import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#3a1c71', '#d76d77'];
const TOL_BENEFITS = [
  { icon: 'git-branch-outline', textKey: 'benefitTol1' },
  { icon: 'eye-outline',         textKey: 'benefitTol2' },
  { icon: 'extension-puzzle-outline', textKey: 'benefitTol3' },
];

// 3 pegs of capacity [3, 2, 1]. Balls labeled R/G/B, max 3 balls total.
type Ball = 'R' | 'G' | 'B';
const BALL_COLORS: Record<Ball, string> = { R: '#ef4444', G: '#22c55e', B: '#3b82f6' };
const PEG_CAPS = [3, 2, 1];

type State = Ball[][]; // 3 arrays bottom→top
type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

function cloneState(s: State): State { return s.map(p => [...p]); }
function stateKey(s: State): string { return s.map(p => p.join('')).join('|'); }

function legalMoves(s: State): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = 0; from < 3; from++) {
    if (s[from].length === 0) continue;
    for (let to = 0; to < 3; to++) {
      if (from === to) continue;
      if (s[to].length >= PEG_CAPS[to]) continue;
      out.push({ from, to });
    }
  }
  return out;
}

function bfsMin(start: State, goal: State): number {
  const goalKey = stateKey(goal);
  if (stateKey(start) === goalKey) return 0;
  const visited = new Set<string>([stateKey(start)]);
  let frontier: State[] = [start];
  let depth = 0;
  while (frontier.length && depth < 12) {
    const next: State[] = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = cloneState(st);
        ns[m.to].push(ns[m.from].pop()!);
        const k = stateKey(ns);
        if (visited.has(k)) continue;
        visited.add(k);
        if (k === goalKey) return depth + 1;
        next.push(ns);
      }
    }
    frontier = next;
    depth++;
  }
  return depth;
}

function makePuzzle(diff: Difficulty): { start: State; goal: State; minMoves: number } {
  const targetMoves = diff === 'easy' ? 3 : diff === 'medium' ? 5 : 7;
  for (let attempt = 0; attempt < 50; attempt++) {
    // start with all 3 balls on peg 0
    const start: State = [['R','G','B'], [], []];
    // do random walk for "targetMoves * 2" steps to get a goal
    let cur = cloneState(start);
    const steps = targetMoves * 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < steps; i++) {
      const moves = legalMoves(cur);
      const m = moves[Math.floor(Math.random() * moves.length)];
      cur[m.to].push(cur[m.from].pop()!);
    }
    const goal = cur;
    if (stateKey(start) === stateKey(goal)) continue;
    const minMoves = bfsMin(start, goal);
    if (minMoves >= targetMoves - 1 && minMoves <= targetMoves + 1) {
      return { start, goal, minMoves };
    }
  }
  // fallback
  const start: State = [['R','G','B'], [], []];
  const goal: State = [['B'], ['R','G'], []];
  return { start, goal, minMoves: bfsMin(start, goal) };
}

export default function TowerLondonGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [trials, setTrials] = useState(5);

  const [round, setRound] = useState(0);
  const [puzzle, setPuzzle] = useState(() => makePuzzle('medium'));
  const [state, setState] = useState<State>([[],[],[]]);
  const [selPeg, setSelPeg] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(0);
  const [extraMoves, setExtraMoves] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = () => {
    const p = makePuzzle(difficulty);
    setPuzzle(p);
    setState(cloneState(p.start));
    setSelPeg(null);
    setMoves(0);
    setFeedback(null);
  };

  const startGame = () => {
    setSolved(0); setExtraMoves(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handlePeg = async (i: number) => {
    if (feedback !== null) return;
    if (selPeg === null) {
      if (state[i].length === 0) return;
      setSelPeg(i);
      return;
    }
    if (selPeg === i) { setSelPeg(null); return; }
    // try move
    if (state[i].length >= PEG_CAPS[i]) {
      setErrors(e => e + 1);
      setSelPeg(null);
      return;
    }
    const ns = cloneState(state);
    ns[i].push(ns[selPeg].pop()!);
    setState(ns);
    setMoves(m => m + 1);
    setSelPeg(null);
    if (stateKey(ns) === stateKey(puzzle.goal)) {
      const movesUsed = moves + 1;
      const extra = Math.max(0, movesUsed - puzzle.minMoves);
      setExtraMoves(e => e + extra);
      setSolved(s => s + 1);
      setFeedback('right');
      setTimeout(async () => {
        if (round >= trials) {
          if (timerRef.current) clearInterval(timerRef.current);
          const finalTime = (Date.now() - startTime) / 1000;
          setElapsedTime(finalTime);
          setPhase('result');
          try {
            await saveSession({
              game_type: 'tower_london',
              score: Math.max(0, (solved + 1) * 200 - (extraMoves + extra) * 30 - errors * 20 - Math.floor(finalTime)),
              time_seconds: finalTime,
              difficulty,
              mode: `${trials}t`,
              errors,
              details: { extra_moves: extraMoves + extra, optimal_moves: puzzle.minMoves },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound(r => r + 1);
          newRound();
        }
      }, 600);
    }
  };

  const renderPeg = (pegIdx: number, balls: Ball[], cap: number, isGoal: boolean) => {
    const pegHeight = 36 * cap + 20;
    return (
      <TouchableOpacity
        disabled={isGoal || feedback !== null}
        activeOpacity={0.7}
        onPress={() => !isGoal && handlePeg(pegIdx)}
        style={[styles.peg, { height: pegHeight, borderColor: selPeg === pegIdx ? GRADIENT[1] : colors.border, borderWidth: selPeg === pegIdx ? 3 : 1 }]}
      >
        {/* balls bottom to top */}
        <View style={styles.pegStack}>
          {balls.map((b, i) => (
            <View key={i} style={[styles.ball, { backgroundColor: BALL_COLORS[b] }]} />
          ))}
        </View>
        <View style={[styles.pegBase, { backgroundColor: colors.text }]} />
      </TouchableOpacity>
    );
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="git-branch" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('towerLondon')}</Text>
        <Text style={styles.configDesc}>{t('towerLondonDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => (
            <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDifficulty(d)}>
              <Text style={[styles.modeButtonText, { color: difficulty === d ? '#FFF' : colors.text }]}>{t(d)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[3, 5, 8].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{solved}</Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>{moves}/{puzzle.minMoves}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}с</Text>
      </View>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('goalState')}</Text>
      <View style={styles.pegRow}>
        {puzzle.goal.map((balls, i) => renderPeg(i, balls, PEG_CAPS[i], true))}
      </View>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('currentState')}</Text>
      <View style={styles.pegRow}>
        {state.map((balls, i) => renderPeg(i, balls, PEG_CAPS[i], false))}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('towerHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('towerLondon')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="towerLondon" icon="git-branch" gradient={GRADIENT as [string, string]}
          skillKey="skillPlanning" descriptionKey="towerLondonIntroDesc"
          benefits={TOL_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, solved * 200 - extraMoves * 30 - errors * 20 - Math.floor(elapsedTime))}
          time={elapsedTime} errors={errors}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 12, gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  pegRow: { flexDirection: 'row', gap: 24, alignItems: 'flex-end' },
  peg: { width: 70, justifyContent: 'flex-end', alignItems: 'center', borderRadius: 8 },
  pegStack: { gap: 2, paddingBottom: 4 },
  pegBase: { width: 64, height: 4, borderRadius: 2 },
  ball: { width: 32, height: 32, borderRadius: 16 },
  hintText: { fontSize: 12, textAlign: 'center', color: '#888', marginTop: 8 },
});
