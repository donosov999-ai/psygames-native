import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
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

const GRADIENT = ['#536976', '#292e49'];
const VS_BENEFITS = [
  { icon: 'eye-outline',           textKey: 'benefitVs1' },
  { icon: 'scan-outline',          textKey: 'benefitVs2' },
  { icon: 'speedometer-outline',   textKey: 'benefitVs3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type Shape = 'T' | 'L' | 'G' | 'plus';

interface Item { x: number; y: number; rot: number; isTarget: boolean; found: boolean; shape: Shape; }

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

const SHAPES_ALL: Shape[] = ['T', 'L', 'G', 'plus'];

// «Найди все такие фигуры» на 7 языках (инлайн-карта, как в OrientationGuard — без правки i18n)
const FIND_TXT: Record<string, string> = {
  ru: 'Найди все такие фигуры', en: 'Find all of these shapes',
  es: 'Encuentra todas estas figuras', pt: 'Encontre todas estas formas',
  de: 'Finde alle diese Formen', zh: '找出所有这种图形', hi: 'ये सभी आकृतियाँ खोजें',
};

// Прогрессия по раундам (= уровням, как в Мишенях): каждый следующий раунд = БОЛЬШЕ объектов,
// а через несколько раундов — и БОЛЬШЕ целей. База/прирост/потолок целей зависят от сложности.
function roundParams(diff: Difficulty, round: number): { count: number; targetCount: number } {
  const base = { easy: 18, medium: 28, hard: 40 }[diff];
  const growth = { easy: 3, medium: 5, hard: 7 }[diff];
  const maxT = { easy: 2, medium: 3, hard: 4 }[diff];
  const count = Math.min(96, base + (round - 1) * growth);
  const targetCount = Math.min(maxT, 1 + Math.floor((round - 1) / 3));
  return { count, targetCount };
}

function makeBoard(count: number, targetShape: Shape, targetCount: number, w: number, h: number): Item[] {
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const slots: { cx: number; cy: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      slots.push({ cx: c * cellW + cellW / 2, cy: r * cellH + cellH / 2 });
  const picked = shuffle(slots).slice(0, count);
  // targetCount РАЗНЫХ ячеек назначаем целями
  const targetSet = new Set(shuffle(picked.map((_, i) => i)).slice(0, targetCount));
  const distractors = SHAPES_ALL.filter((s) => s !== targetShape);
  return picked.map((s, i) => ({
    x: s.cx + (Math.random() - 0.5) * cellW * 0.3,
    y: s.cy + (Math.random() - 0.5) * cellH * 0.3,
    rot: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
    isTarget: targetSet.has(i),
    found: false,
    // цель — targetShape (меняется каждый раунд, НЕ всегда T); дистракторы — остальные 3 фигуры
    shape: targetSet.has(i) ? targetShape : distractors[Math.floor(Math.random() * distractors.length)],
  }));
}

export default function VisualSearchGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('visual_search');   // уровень → тир (1=easy, 2=medium, ≥3=hard)
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 8));

  const [round, setRound] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [stimAt, setStimAt] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [now, setNow] = useState(0);   // живой таймер текущей пробы
  const [targetShape, setTargetShape] = useState<Shape>('T');  // искомая фигура раунда (меняется)
  const [targetCount, setTargetCount] = useState(1);           // сколько целей в раунде
  const [foundCount, setFoundCount] = useState(0);             // сколько уже найдено

  // рефы = источник истины логики раунда (без stale-closure при быстрых тапах и в таймере)
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const roundRef = useRef(0);
  const foundRef = useRef(0);
  const targetCountRef = useRef(1);

  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (fbTimerRef.current) clearTimeout(fbTimerRef.current); }, []);
  // живой таймер: тикаем пока идёт игра (раньше в шапке показывался прыгающий средний RT — «кривой»)
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [phase]);

  const boardW = Math.min(width - 32, 480);
  const boardH = Math.round(boardW * 1.0);

  const newRound = (r: number, d: Difficulty = difficulty) => {
    const { count, targetCount: tc } = roundParams(d, r);
    const shape = SHAPES_ALL[Math.floor(Math.random() * SHAPES_ALL.length)];
    roundRef.current = r;
    targetCountRef.current = tc;
    foundRef.current = 0;
    setRound(r);
    setTargetShape(shape);
    setTargetCount(tc);
    setFoundCount(0);
    setItems(makeBoard(count, shape, tc, boardW, boardH));
    setFeedback(null);
    setStimAt(Date.now());
  };

  const startGame = () => {
    const diff: Difficulty = isPreset ? difficulty : (lvl.level <= 1 ? 'easy' : lvl.level === 2 ? 'medium' : 'hard');   // тир от уровня
    if (!isPreset) setDifficulty(diff);
    hitsRef.current = 0; errorsRef.current = 0; rtsRef.current = [];
    setHits(0); setErrors(0); setRts([]);
    newRound(1, diff);
    setPhase('playing');
    setStartTime(Date.now());
  };

  const finishOrNext = async () => {
    if (roundRef.current >= trials) {
      const totalTime = (Date.now() - startTime) / 1000;
      const arr = rtsRef.current;
      const meanRt = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const last = roundParams(difficulty, trials);
      if (!isPreset && errorsRef.current <= 1) lvl.reach((difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3) + 1);   // прошёл серию точно → +уровень/тир
      setPhase('result');
      try {
        await saveSession({
          game_type: 'visual_search',
          score: Math.max(0, Math.round(hitsRef.current * 100 - errorsRef.current * 50 - meanRt * 0.05)),
          time_seconds: totalTime,
          difficulty,
          mode: `${trials}t`,
          errors: errorsRef.current,
          details: { mean_rt: Math.round(meanRt), max_items: last.count, max_targets: last.targetCount },
        });
      } catch (e) { console.error(e); }
    } else {
      newRound(roundRef.current + 1);
    }
  };

  const handlePick = (idx: number) => {
    if (feedback !== null) return;          // окно «верно/неверно» — клики заблокированы
    const it = items[idx];
    if (it.found) return;                   // эту цель уже нашли в этом раунде
    const rt = Date.now() - stimAt;
    if (it.isTarget) {
      foundRef.current += 1;
      const found = foundRef.current;
      setFoundCount(found);
      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, found: true } : x)));
      if (found >= targetCountRef.current) {
        // все цели раунда найдены → раунд засчитан, дальше следующий уровень
        hitsRef.current += 1;
        rtsRef.current = [...rtsRef.current, rt];
        setHits(hitsRef.current);
        setRts(rtsRef.current);
        setFeedback('right');
        fbTimerRef.current = setTimeout(() => { finishOrNext(); }, 500);
      }
      // иначе: промежуточная цель — отмечаем зелёным (found), ищем дальше без блокировки
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFeedback('wrong');
      fbTimerRef.current = setTimeout(() => setFeedback(null), 450);
    }
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
                {t(d)}
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
        <Text style={[styles.statText, { color: colors.text }]}>{t('label_level_short')} {round}/{trials}{!isPreset ? ` · ${language === 'ru' ? 'Ур.' : 'Lv'}${lvl.level}` : ''}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        {targetCount > 1 && (
          <Text style={[styles.statText, { color: '#3b82f6' }]}>🎯 {foundCount}/{targetCount}</Text>
        )}
        <Text style={[styles.statText, { color: colors.primary }]}>⏱ {Math.max(0, (now - stimAt) / 1000).toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
      <View style={styles.hintRow}>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {FIND_TXT[language] || FIND_TXT.en}{targetCount > 1 ? ` ×${targetCount}` : ''}
        </Text>
        <View style={styles.targetRef}>{renderLetter({ shape: targetShape, rot: 0, x: 0, y: 0, isTarget: true, found: false })}</View>
      </View>
      <View style={[styles.boardArea, { width: boardW, height: boardH, backgroundColor: '#1f2937', borderColor: feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
        {items.map((it, i) => (
          <TouchableOpacity key={i}
            onPress={() => handlePick(i)}
            disabled={feedback !== null}
            style={{
              position: 'absolute',
              left: it.x - 16, top: it.y - 16,
              width: 32, height: 32,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: it.found ? '#22c55e66' : 'transparent',
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
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('visualSearch')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="visualSearch" icon="scan" gradient={GRADIENT as [string, string]}
          skillKey="skillFocus" descriptionKey="visualSearchIntroDesc"
          benefits={VS_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 100 - errors * 50 - meanRt * 0.05))}
          time={meanRt / 1000} errors={errors}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 2 },
  targetRef: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#3b82f6' },
  boardArea: { borderRadius: 12, borderWidth: 1, position: 'relative', overflow: 'hidden' },
});
