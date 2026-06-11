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
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#43cea2', '#185a9d'];
const SET_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitSet1' },
  { icon: 'layers-outline', textKey: 'benefitSet2' },
  { icon: 'shapes-outline', textKey: 'benefitSet3' },
];

// SET cards: 4 attributes × 3 values = 81 unique cards
type ShapeType = 'circle' | 'square' | 'triangle';
type FillType = 'solid' | 'striped' | 'open';
type ColorType = 'red' | 'green' | 'purple';
type CountType = 1 | 2 | 3;

interface Card {
  shape: ShapeType;
  fill: FillType;
  color: ColorType;
  count: CountType;
  id: string;
}

const SHAPES: ShapeType[] = ['circle', 'square', 'triangle'];
const FILLS: FillType[] = ['solid', 'striped', 'open'];
const COLORS: ColorType[] = ['red', 'green', 'purple'];
const COUNTS: CountType[] = [1, 2, 3];
const COLOR_HEX: Record<ColorType, string> = { red: '#e63946', green: '#2a9d8f', purple: '#7b2cbf' };

const allCards = (): Card[] => {
  const out: Card[] = [];
  for (const s of SHAPES) for (const f of FILLS) for (const c of COLORS) for (const n of COUNTS) {
    out.push({ shape: s, fill: f, color: c, count: n, id: `${s}-${f}-${c}-${n}` });
  }
  return out;
};

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function isSet(a: Card, b: Card, c: Card): boolean {
  const allSameOrAllDiff = (x: any, y: any, z: any) =>
    (x === y && y === z) || (x !== y && y !== z && x !== z);
  return allSameOrAllDiff(a.shape, b.shape, c.shape) &&
         allSameOrAllDiff(a.fill, b.fill, c.fill) &&
         allSameOrAllDiff(a.color, b.color, c.color) &&
         allSameOrAllDiff(a.count, b.count, c.count);
}

// Per-attribute breakdown for hint when subject picks a non-SET triple.
function explainSet(a: Card, b: Card, c: Card): { shape: boolean; fill: boolean; color: boolean; count: boolean } {
  const allSameOrAllDiff = (x: any, y: any, z: any) =>
    (x === y && y === z) || (x !== y && y !== z && x !== z);
  return {
    shape: allSameOrAllDiff(a.shape, b.shape, c.shape),
    fill:  allSameOrAllDiff(a.fill,  b.fill,  c.fill),
    color: allSameOrAllDiff(a.color, b.color, c.color),
    count: allSameOrAllDiff(a.count, b.count, c.count),
  };
}

function findAnySet(cards: Card[]): [number, number, number] | null {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (isSet(cards[i], cards[j], cards[k])) return [i, j, k];
  return null;
}

// Build a board of 12 cards that contains at least one SET (and not too many).
function buildBoard(): Card[] {
  const deck = shuffle(allCards());
  let board = deck.slice(0, 12);
  let guard = 0;
  while (!findAnySet(board) && guard < 100) {
    board = shuffle(allCards()).slice(0, 12);
    guard++;
  }
  return board;
}

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

export default function SetGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trials, setTrials] = useState(() => num('trials', 6));
  const [round, setRound] = useState(0);
  const [board, setBoard] = useState<Card[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [hintBreakdown, setHintBreakdown] = useState<{ shape: boolean; fill: boolean; color: boolean; count: boolean } | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = () => { setBoard(buildBoard()); setPicked([]); setFeedback(null); setHintBreakdown(null); };

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const togglePick = (i: number) => {
    if (feedback !== null) return;
    if (picked.includes(i)) { setPicked(picked.filter((x) => x !== i)); return; }
    if (picked.length >= 3) return;
    const next = [...picked, i];
    setPicked(next);
    if (next.length === 3) checkSet(next);
  };

  const checkSet = async (sel: number[]) => {
    const ok = isSet(board[sel[0]], board[sel[1]], board[sel[2]]);
    setFeedback(ok ? 'right' : 'wrong');
    if (ok) setHits((h) => h + 1); else {
      setErrors((e) => e + 1);
      // Generate hint breakdown for wrong answer
      setHintBreakdown(explainSet(board[sel[0]], board[sel[1]], board[sel[2]]));
    }
    // Wrong answers stay on screen 2.5 sec so user can see hint
    const delay = ok ? 700 : 2500;
    setTimeout(async () => {
      if (ok) {
        if (round >= trials) {
          if (timerRef.current) clearInterval(timerRef.current);
          const finalTime = (Date.now() - startTime) / 1000;
          setElapsedTime(finalTime);
          setPhase('result');
          try {
            await saveSession({
              game_type: 'set_game',
              score: Math.max(0, (hits + 1) * 200 - errors * 50 - Math.floor(finalTime)),
              time_seconds: finalTime,
              difficulty: 'medium',
              mode: `${trials}t`,
              errors,
              details: { hits: hits + 1, errors, trials },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound((r) => r + 1);
          newRound();
        }
      } else {
        setPicked([]);
        setFeedback(null);
        setHintBreakdown(null);
      }
    }, delay);
  };

  const renderShape = (card: Card, key: number) => {
    const c = COLOR_HEX[card.color];
    const size = 18;
    const common = { width: size, height: size, marginHorizontal: 2 } as const;
    const fillStyle = card.fill === 'solid'
      ? { backgroundColor: c, borderColor: c, borderWidth: 2 }
      : card.fill === 'open'
      ? { backgroundColor: 'transparent', borderColor: c, borderWidth: 2 }
      : { backgroundColor: c + '55', borderColor: c, borderWidth: 2 };
    if (card.shape === 'circle') {
      return <View key={key} style={[common, { borderRadius: size / 2 }, fillStyle]} />;
    }
    if (card.shape === 'square') {
      return <View key={key} style={[common, { borderRadius: 3 }, fillStyle]} />;
    }
    // triangle: use rotated square w/ clip — simple approximation with View
    return (
      <View key={key} style={[common, { borderRadius: 3, transform: [{ rotate: '45deg' }] }, fillStyle]} />
    );
  };

  const renderCard = (card: Card, i: number) => {
    const sel = picked.includes(i);
    const fbColor = sel && feedback === 'right' ? '#22c55e' : sel && feedback === 'wrong' ? '#f43f5e' : null;
    return (
      <TouchableOpacity key={i} onPress={() => togglePick(i)} disabled={feedback !== null}
        style={[styles.card, {
          backgroundColor: colors.surface,
          borderColor: fbColor || (sel ? GRADIENT[1] : colors.border),
          borderWidth: sel ? 3 : 1,
        }]}>
        <View style={styles.shapeRow}>
          {Array.from({ length: card.count }).map((_, k) => renderShape(card, k))}
        </View>
      </TouchableOpacity>
    );
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="shapes" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('setGame')}</Text>
        <Text style={styles.configDesc}>{t('setGameDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[3, 6, 10].map((n) => (
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
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('setHint')}</Text>
      {hintBreakdown && feedback === 'wrong' && (
        <View style={[styles.hintBox, { backgroundColor: '#f43f5e22', borderColor: '#f43f5e' }]}>
          <Text style={[styles.hintTitle, { color: '#f43f5e' }]}>{language === 'ru' ? 'Не SET — разбор по признакам:' : 'Not a SET — attribute breakdown:'}</Text>
          <View style={styles.hintRow}>
            <Text style={[styles.hintItem, { color: hintBreakdown.shape ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.shape ? '✓' : '✗'} {language === 'ru' ? 'Форма' : 'Shape'}
            </Text>
            <Text style={[styles.hintItem, { color: hintBreakdown.color ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.color ? '✓' : '✗'} {language === 'ru' ? 'Цвет' : 'Color'}
            </Text>
            <Text style={[styles.hintItem, { color: hintBreakdown.fill ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.fill ? '✓' : '✗'} {language === 'ru' ? 'Штрих' : 'Fill'}
            </Text>
            <Text style={[styles.hintItem, { color: hintBreakdown.count ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.count ? '✓' : '✗'} {language === 'ru' ? 'Кол-во' : 'Count'}
            </Text>
          </View>
          <Text style={[styles.hintRule, { color: colors.textSecondary }]}>
            {language === 'ru' ? 'Каждый признак должен быть либо ОДИНАКОВ на всех 3, либо РАЗНЫЙ на всех 3' : 'Each attribute must be either ALL SAME across the 3 or ALL DIFFERENT across the 3'}
          </Text>
        </View>
      )}
      <View style={styles.boardArea}>
        {board.map(renderCard)}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('setGame')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="setGame" icon="shapes" gradient={GRADIENT as [string, string]}
          skillKey="skillReasoning" descriptionKey="setGameIntroDesc"
          benefits={SET_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 200 - errors * 50 - Math.floor(elapsedTime))}
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
  playArea: { flex: 1, padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center', maxWidth: 360 },
  hintBox: { padding: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', gap: 6, maxWidth: 480 },
  hintTitle: { fontSize: 13, fontWeight: '800' },
  hintRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  hintItem: { fontSize: 13, fontWeight: '700' },
  hintRule: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', maxWidth: 360 },
  boardArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 480 },
  card: { width: 88, height: 64, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  shapeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
