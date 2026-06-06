import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#536976', '#292e49'];
const VS_BENEFITS = [
  { icon: 'eye-outline',           textKey: 'benefitVs1' },
  { icon: 'scan-outline',          textKey: 'benefitVs2' },
  { icon: 'speedometer-outline',   textKey: 'benefitVs3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Item { x: number; y: number; rot: number; isTarget: boolean; shape: 'T' | 'L' | 'G' | 'plus'; }

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

const COUNTS: Record<Difficulty, number> = { easy: 24, medium: 48, hard: 72 };

function makeBoard(diff: Difficulty, w: number, h: number): Item[] {
  const n = COUNTS[diff];
  // grid for non-overlap
  const cols = Math.ceil(Math.sqrt(n * (w / h)));
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const slots: { cx: number; cy: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      slots.push({ cx: c * cellW + cellW / 2, cy: r * cellH + cellH / 2 });
  const picked = shuffle(slots).slice(0, n);
  const targetIdx = Math.floor(Math.random() * n);
  const DISTRACT: Item['shape'][] = ['L', 'G', 'plus'];
  return picked.map((s, i) => ({
    x: s.cx + (Math.random() - 0.5) * cellW * 0.3,
    y: s.cy + (Math.random() - 0.5) * cellH * 0.3,
    rot: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
    isTarget: i === targetIdx,
    // цель — T; дистракторы РАЗНЫЕ (L / Г / +) → гетерогенный поиск, труднее
    shape: (i === targetIdx ? 'T' : DISTRACT[Math.floor(Math.random() * DISTRACT.length)]),
  }));
}

export default function VisualSearchGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [trials, setTrials] = useState(8);

  const [round, setRound] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [stimAt, setStimAt] = useState(0);
  const [startTime, setStartTime] = useState(0);

  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (fbTimerRef.current) clearTimeout(fbTimerRef.current); }, []);

  const boardW = Math.min(width - 32, 480);
  const boardH = Math.round(boardW * 1.0);

  const newRound = () => {
    setItems(makeBoard(difficulty, boardW, boardH));
    setFeedback(null);
    setStimAt(Date.now());
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRts([]); setRound(1);
    newRound();
    setPhase('playing');
    setStartTime(Date.now());
  };

  const handlePick = async (idx: number) => {
    if (feedback !== null) return;
    const ok = items[idx].isTarget;
    const rt = Date.now() - stimAt;
    let newHits = hits, newErrors = errors, newRts = rts;
    if (ok) { newHits = hits + 1; newRts = [...rts, rt]; }
    else { newErrors = errors + 1; }
    setHits(newHits); setErrors(newErrors); setRts(newRts);
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(async () => {
      if (ok) {
        if (round >= trials) {
          const totalTime = (Date.now() - startTime) / 1000;
          const meanRt = newRts.length ? newRts.reduce((a, b) => a + b, 0) / newRts.length : 0;
          setPhase('result');
          try {
            await saveSession({
              game_type: 'visual_search',
              score: Math.max(0, Math.round(newHits * 100 - newErrors * 50 - meanRt * 0.05)),
              time_seconds: totalTime,
              difficulty,
              mode: `${trials}t`,
              errors: newErrors,
              details: { mean_rt: Math.round(meanRt), n_distractors: COUNTS[difficulty] - 1 },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound(r => r + 1);
          newRound();
        }
      } else {
        setFeedback(null);
      }
    }, 500);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="scan" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('visualSearch')}</Text>
        <Text style={styles.configDesc}>{t('visualSearchDesc')}</Text>
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
                {t(d)} ({COUNTS[d]})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[5, 8, 12].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[0] }
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

  // Render letter-shaped target/distractors using SVG-like primitives via Views
  const renderLetter = (item: Item) => {
    const stroke = '#fff', sw = 3;
    const s = item.shape;
    const centerStem = s === 'T' || s === 'plus';   // T и + — стебель по центру; L и Г — слева
    return (
      <View style={{ width: 26, height: 26, position: 'relative' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: centerStem ? 11 : 5, width: sw, backgroundColor: stroke }} />
        {s === 'T' && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: sw, backgroundColor: stroke }} />}
        {s === 'plus' && <View style={{ position: 'absolute', top: 11, left: 0, right: 0, height: sw, backgroundColor: stroke }} />}
        {s === 'L' && <View style={{ position: 'absolute', bottom: 0, left: 5, right: 0, height: sw, backgroundColor: stroke }} />}
        {s === 'G' && <View style={{ position: 'absolute', top: 0, left: 5, right: 0, height: sw, backgroundColor: stroke }} />}
      </View>
    );
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{meanRt}мс</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('visualSearchHint')}</Text>
      <View style={[styles.boardArea, { width: boardW, height: boardH, backgroundColor: '#1f2937', borderColor: colors.border }]}>
        {items.map((it, i) => (
          <TouchableOpacity key={i}
            onPress={() => handlePick(i)}
            disabled={feedback !== null}
            style={{
              position: 'absolute',
              left: it.x - 16, top: it.y - 16,
              width: 32, height: 32,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: feedback && it.isTarget ? (feedback === 'right' ? '#22c55e44' : '#f43f5e44') : 'transparent',
              borderRadius: 4,
              transform: [{ rotate: `${it.rot}deg` }],
            }}
          >
            {renderLetter(it)}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('visualSearch')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="visualSearch" icon="scan" gradient={GRADIENT as [string, string]}
          skillKey="skillFocus" descriptionKey="visualSearchIntroDesc"
          benefits={VS_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 100 - errors * 50 - meanRt * 0.05))}
          time={meanRt / 1000} errors={errors}
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
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  boardArea: { borderRadius: 12, borderWidth: 1, position: 'relative', overflow: 'hidden' },
});
