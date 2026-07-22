import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#3a1c71', '#d76d77'];
const TOL_BENEFITS = [
  { icon: 'git-branch-outline', textKey: 'benefitTol1' },
  { icon: 'eye-outline',         textKey: 'benefitTol2' },
  { icon: 'extension-puzzle-outline', textKey: 'benefitTol3' },
];

// 3 pegs. Balls R/G/B (3) + Y (4-й шар на L11+). Вместимости меняются по числу шаров.
type Ball = 'R' | 'G' | 'B' | 'Y';
const BALL_GRADIENTS: Record<Ball, [string, string]> = {
  R: ['#fca5a5', '#dc2626'], G: ['#86efac', '#16a34a'], B: ['#93c5fd', '#2563eb'], Y: ['#fde68a', '#d97706'],
};
// A1 колор-блайнд — Okabe-Ito (вермильон/бирюз-зелёный/синий/жёлтый, различимы при дальтонизме).
const BALL_GRADIENTS_CB: Record<Ball, [string, string]> = {
  R: ['#f0a07a', '#c44d00'], G: ['#7fd9bf', '#007a59'], B: ['#7fb8e0', '#005a8c'], Y: ['#f5e79e', '#b8920a'],
};
// Вместимости стержней. 3 шара → [3,2,1]; 4 шара (L11+) → [4,3,1]. makePuzzle переключает по ballCount.
let CURRENT_CAPS = [3, 2, 1];

type State = Ball[][]; // 3 arrays bottom→top
type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

function cloneState(s: State): State { return s.map(p => [...p]); }
function stateKey(s: State): string { return s.map(p => p.join('')).join('|'); }

function legalMoves(s: State): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = 0; from < 3; from++) {
    if (s[from].length === 0) continue;
    for (let to = 0; to < 3; to++) {
      if (from === to) continue;
      if (s[to].length >= CURRENT_CAPS[to]) continue;
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
  while (frontier.length && depth < 16) {
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

// targetMoves — целевая длина плана (minMoves). ballCount 3 (caps[3,2,1]) или 4 на L11+ (caps[4,3,1]).
function makePuzzle(targetMoves: number, ballCount: number = 3): { start: State; goal: State; minMoves: number } {
  CURRENT_CAPS = ballCount >= 4 ? [4, 3, 1] : [3, 2, 1];   // вместимости под число шаров (для legalMoves/bfsMin)
  const startBalls: Ball[] = ballCount >= 4 ? ['R', 'G', 'B', 'Y'] : ['R', 'G', 'B'];
  for (let attempt = 0; attempt < 60; attempt++) {
    // start with all balls on peg 0
    const start: State = [[...startBalls], [], []];
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
  const start: State = [[...startBalls], [], []];
  const goal: State = ballCount >= 4 ? [['Y'], ['R', 'G'], ['B']] : [['B'], ['R', 'G'], []];
  return { start, goal, minMoves: bfsMin(start, goal) };
}

export default function TowerLondonGame() {
  const { colors, colorblind } = useTheme();
  const BG = colorblind ? BALL_GRADIENTS_CB : BALL_GRADIENTS;
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('tower_london');   // уровень → тир (1=easy, 2=medium, ≥3=hard)
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [clearedPassed, setClearedPassed] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 5));

  const [round, setRound] = useState(0);
  const [puzzle, setPuzzle] = useState(() => makePuzzle(5));
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
  const levelRef = useRef(1);
  const targetMovesRef = useRef(5);
  const ballsRef = useRef(3);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = (tm: number = targetMovesRef.current, balls: number = ballsRef.current) => {
    const p = makePuzzle(tm, balls);
    setPuzzle(p);
    setState(cloneState(p.start));
    setSelPeg(null);
    setMoves(0);
    setFeedback(null);
  };

  const startGame = () => {
    // уровень → длина плана (minMoves цель). 3 шара дают 2..7, дальше fallback; 4-5 шаров + лимит времени = фаза 2.
    const tm = isPreset ? (difficulty === 'easy' ? 3 : difficulty === 'medium' ? 5 : 7) : Math.min(8, 1 + lvl.level);
    const balls = isPreset ? 3 : (lvl.level >= 11 ? 4 : 3);   // 4-й шар (жёлтый) на верхних уровнях
    levelRef.current = lvl.level;
    targetMovesRef.current = tm;
    ballsRef.current = balls;
    setSolved(0); setExtraMoves(0); setErrors(0); setRound(1);
    newRound(tm, balls);
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
    if (state[i].length >= CURRENT_CAPS[i]) {
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
          const passed = !isPreset && (extraMoves + extra) <= trials;
          if (!isPreset) { if (passed) lvl.reach(levelRef.current + 1); else lvl.fail(); }   // вверх / гистерезис вниз
          setClearedPassed(passed);
          setPhase(!isPreset ? 'cleared' : 'result');   // непрерывный поток: провал → баннер «ещё раз», не тупик
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
            <LinearGradient key={i} colors={BG[b]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={styles.ball}>
              <View style={styles.ballShine} pointerEvents="none" />
            </LinearGradient>
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
      <LevelProgressMap gameId="tower_london" currentLevel={lvl.level} colors={colors} language={language} />
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
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}{!isPreset ? ` · ${t('label_level_short')}${lvl.level}` : ''}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{solved}</Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>{moves}/{puzzle.minMoves}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{t('secShort')}</Text>
      </View>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('goalState')}</Text>
      <View style={styles.pegRow}>
        {puzzle.goal.map((balls, i) => renderPeg(i, balls, CURRENT_CAPS[i], true))}
      </View>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('currentState')}</Text>
      <View style={styles.pegRow}>
        {state.map((balls, i) => renderPeg(i, balls, CURRENT_CAPS[i], false))}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('towerHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('towerLondon')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="towerLondon" icon="git-branch" gradient={GRADIENT as [string, string]}
          skillKey="skillPlanning" descriptionKey="towerLondonIntroDesc"
          benefits={TOL_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="tower_london" passed={clearedPassed} level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, solved * 200 - extraMoves * 30 - errors * 20 - Math.floor(elapsedTime))}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  pegRow: { flexDirection: 'row', gap: 24, alignItems: 'flex-end' },
  peg: { width: 70, justifyContent: 'flex-end', alignItems: 'center', borderRadius: 8 },
  pegStack: { gap: 2, paddingBottom: 4 },
  pegBase: { width: 64, height: 4, borderRadius: 2 },
  ball: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  ballShine: { position: 'absolute', top: 4, left: 6, width: 11, height: 8, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.55)' },
  hintText: { fontSize: 12, textAlign: 'center', color: '#888', marginTop: 8 },
});
