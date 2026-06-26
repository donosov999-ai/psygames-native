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
import LevelCleared from '@/src/components/LevelCleared';

const GRADIENT = ['#536976', '#292e49'];
const VS_BENEFITS = [
  { icon: 'eye-outline',           textKey: 'benefitVs1' },
  { icon: 'scan-outline',          textKey: 'benefitVs2' },
  { icon: 'speedometer-outline',   textKey: 'benefitVs3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type Shape = 'T' | 'L' | 'G' | 'plus';

interface Item { x: number; y: number; rot: number; isTarget: boolean; found: boolean; shape: Shape; color: string; }

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

const SHAPES_ALL: Shape[] = ['T', 'L', 'G', 'plus'];
// Конъюнктивный поиск (фаза-2, высокие уровни): цель = цвет + форма. NEUTRAL — для feature-уровней (поиск по форме).
const NEUTRAL_STROKE = '#ffffff';
const COLORS_ALL: string[] = ['#60a5fa', '#fbbf24', '#f472b6'];   // голубой / янтарь / розовый — различимы на тёмном поле
const CONJ_FROM_LEVEL = 8;                                        // с L8 включается конъюнкция

// «Найди фигуру такого цвета и формы» (конъюнкция) — инлайн-карта языков
const FIND_CONJ: Record<string, string> = {
  ru: 'Найди фигуру такого цвета и формы', en: 'Find the shape with this colour and form',
  es: 'Encuentra la figura de este color y forma', pt: 'Encontre a forma desta cor e formato',
  de: 'Finde die Form in dieser Farbe', zh: '找出这种颜色和形状的图形', hi: 'इस रंग और आकार की आकृति खोजें',
};

// «Найди все такие фигуры» на 7 языках (инлайн-карта, как в OrientationGuard — без правки i18n)
const FIND_TXT: Record<string, string> = {
  ru: 'Найди все такие фигуры', en: 'Find all of these shapes',
  es: 'Encuentra todas estas figuras', pt: 'Encontre todas estas formas',
  de: 'Finde alle diese Formen', zh: '找出所有这种图形', hi: 'ये सभी आकृतियाँ खोजें',
};

// Уровень (1..15+) задаёт базовую сложность; раунды внутри сессии добавляют объекты.
// Дистракторов больше с уровнем; целей 1→2→3→4 по мере роста уровня. (Конъюнктивный поиск цвет+форма — фаза 2.)
function levelParams(level: number, round: number): { count: number; targetCount: number; conjunction: boolean } {
  const base = Math.min(72, 14 + level * 4);                            // L1≈18 → L14≈70 объектов
  const growth = 3 + Math.floor(level / 4);                              // прирост/раунд растёт с уровнем
  const count = Math.min(96, base + (round - 1) * growth);
  const maxT = level <= 3 ? 1 : level <= 7 ? 2 : level <= 11 ? 3 : 4;    // целей: 1→2→3→4 с уровнем
  const targetCount = Math.min(maxT, 1 + Math.floor((round - 1) / 2));
  const conjunction = level >= CONJ_FROM_LEVEL;                          // фаза-2: цель по 2 признакам (цвет+форма)
  return { count, targetCount, conjunction };
}

function makeBoard(count: number, targetShape: Shape, targetColor: string, targetCount: number, conjunction: boolean, w: number, h: number): Item[] {
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
  const otherShapes = SHAPES_ALL.filter((s) => s !== targetShape);
  const otherColors = COLORS_ALL.filter((c) => c !== targetColor);
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return picked.map((s, i) => {
    const isT = targetSet.has(i);
    let shape: Shape, color: string;
    if (isT) {
      shape = targetShape; color = conjunction ? targetColor : NEUTRAL_STROKE;
    } else if (conjunction) {
      // КОНЪЮНКЦИЯ: дистрактор делит РОВНО один признак с целью (нет элемента с обоими → нет pop-out, серийный поиск)
      if (Math.random() < 0.5) { color = targetColor; shape = pick(otherShapes); }      // тот же цвет, другая форма
      else { color = pick(otherColors); shape = targetShape; }                            // другой цвет, та же форма
    } else {
      shape = pick(otherShapes); color = NEUTRAL_STROKE;                                  // feature-поиск: только форма
    }
    return {
      x: s.cx + (Math.random() - 0.5) * cellW * 0.3,
      y: s.cy + (Math.random() - 0.5) * cellH * 0.3,
      rot: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
      isTarget: isT, found: false, shape, color,
    };
  });
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
  const [targetColor, setTargetColor] = useState<string>(NEUTRAL_STROKE);  // цвет цели (конъюнкция, фаза-2)
  const conjRef = useRef(false);   // текущий раунд — конъюнктивный (цвет+форма)?
  const [targetCount, setTargetCount] = useState(1);           // сколько целей в раунде
  const [foundCount, setFoundCount] = useState(0);             // сколько уже найдено

  // рефы = источник истины логики раунда (без stale-closure при быстрых тапах и в таймере)
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const roundRef = useRef(0);
  const foundRef = useRef(0);
  const targetCountRef = useRef(1);
  const levelRef = useRef(1);            // текущий уровень партии (рулит сложностью)

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

  const newRound = (r: number) => {
    const { count, targetCount: tc, conjunction } = levelParams(levelRef.current, r);
    const shape = SHAPES_ALL[Math.floor(Math.random() * SHAPES_ALL.length)];
    const color = conjunction ? COLORS_ALL[Math.floor(Math.random() * COLORS_ALL.length)] : NEUTRAL_STROKE;
    roundRef.current = r;
    targetCountRef.current = tc;
    conjRef.current = conjunction;
    foundRef.current = 0;
    setRound(r);
    setTargetShape(shape);
    setTargetColor(color);
    setTargetCount(tc);
    setFoundCount(0);
    setItems(makeBoard(count, shape, color, tc, conjunction, boardW, boardH));
    setFeedback(null);
    setStimAt(Date.now());
  };

  const startGame = () => {
    // личная игра → уровень рулит сложностью; пресет (зарядка) → тир маппится в уровень
    const presetDiff = (str('diff', 'medium') as Difficulty);
    const effLevel = isPreset ? ({ easy: 2, medium: 6, hard: 11 } as Record<Difficulty, number>)[presetDiff] ?? 6 : lvl.level;
    levelRef.current = effLevel;
    hitsRef.current = 0; errorsRef.current = 0; rtsRef.current = [];
    setHits(0); setErrors(0); setRts([]);
    newRound(1);
    setPhase('playing');
    setStartTime(Date.now());
  };

  const finishOrNext = async () => {
    if (roundRef.current >= trials) {
      const totalTime = (Date.now() - startTime) / 1000;
      const arr = rtsRef.current;
      const meanRt = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const last = levelParams(levelRef.current, trials);
      const passed = !isPreset && errorsRef.current <= 1;
      if (passed) lvl.reach(lvl.level + 1);   // прошёл серию точно → +уровень
      setPhase(passed ? 'cleared' : 'result');   // авто-поток к следующему уровню
      try {
        await saveSession({
          game_type: 'visual_search',
          score: Math.max(0, Math.round(hitsRef.current * 100 - errorsRef.current * 50 - meanRt * 0.05)),
          time_seconds: totalTime,
          difficulty: levelRef.current <= 3 ? 'easy' : levelRef.current <= 9 ? 'medium' : 'hard',
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Уровень' : 'Level'}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary }]}>
          {language === 'ru' ? `Ур. ${lvl.level} — растёт сам по результату (объектов и целей больше)` : `Lv ${lvl.level} — grows with results (more items & targets)`}
        </Text>
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
    const stroke = item.color || NEUTRAL_STROKE, sw = 3;
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
          {(conjRef.current ? (FIND_CONJ[language] || FIND_CONJ.en) : (FIND_TXT[language] || FIND_TXT.en))}{targetCount > 1 ? ` ×${targetCount}` : ''}
        </Text>
        <View style={styles.targetRef}>{renderLetter({ shape: targetShape, color: targetColor, rot: 0, x: 0, y: 0, isTarget: true, found: false })}</View>
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
      {phase === 'cleared' && (
        <LevelCleared level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
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
