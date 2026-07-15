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
import BossRound from '@/src/components/BossRound';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const SG_RULES: LevelRule[] = [
  {
    key: 'timelimit', fromLevel: 11,
    ru: { title: 'Лимит времени', rule: 'Теперь на поиск SET даётся ограниченное время. Не успел — штраф ✗ и новая раскладка. С каждым уровнем лимит жмёт сильнее.', example: 'Пример: L11 — 26 с на SET, дальше −4 с за уровень (минимум 8 с).' },
    en: { title: 'Time limit', rule: 'You now have limited time to find a SET. Run out — penalty ✗ and a fresh board. The limit tightens every level.', example: 'Example: L11 — 26 s per SET, then −4 s per level (8 s minimum).' },
  },
];

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

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

// Уровень (1..15+): L1-10 trials 6→15 (выносливость) · L11-15 лимит времени на SET (давление, убывает).
function levelParams(level: number): { trials: number; timeLimit: number } {
  const trials = Math.min(15, 5 + level);                       // L1=6 → L10=15
  const over = Math.max(0, level - 10);
  const timeLimit = over > 0 ? Math.max(8, 30 - over * 4) : 0;   // 0 = без лимита; L11≈26с → L15≈10с
  return { trials, timeLimit };
}

export default function SetGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('set_game');   // персист-уровень = trials − 5 (эндуранс серии)
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
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата для баннера (проход/«почти»)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);
  const timeLimitRef = useRef(0);
  const roundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); if (roundTimerRef.current) clearTimeout(roundTimerRef.current); }, []);

  // Справка правил уровня: только в личной игре (в зарядке-пресете лимита времени нет, бейдж скрыт)
  const levelRules = useLevelRules('set_game', lvl.level, SG_RULES, phase === 'playing' && !isPreset);

  const handleTimeout = () => {
    setErrors((e) => e + 1);   // не успел найти SET за лимит → штраф + новая доска (тот же раунд)
    newRound();
  };

  const newRound = () => {
    setBoard(buildBoard()); setPicked([]); setFeedback(null); setHintBreakdown(null);
    if (roundTimerRef.current) clearTimeout(roundTimerRef.current);
    if (timeLimitRef.current > 0) roundTimerRef.current = setTimeout(() => handleTimeout(), timeLimitRef.current * 1000);   // лимит времени на SET
  };

  const startGame = () => {
    const p = isPreset ? { trials, timeLimit: 0 } : levelParams(lvl.level);   // уровень рулит: trials → лимит времени на SET
    levelRef.current = lvl.level;
    timeLimitRef.current = p.timeLimit;
    if (!isPreset) setTrials(p.trials);
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
    if (roundTimerRef.current) clearTimeout(roundTimerRef.current);   // ответ дан — снять лимит времени
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
          const passed = !isPreset && errors <= 1;
          if (isPreset) {
            setPhase('result');   // пресет/свободный режим — экран статистики, уровень не трогаем
          } else {
            if (passed) lvl.reach(levelRef.current + 1);   // серия почти без ошибок → +уровень
            if (passed && levelRef.current % BOSS_EVERY === 0) {
              // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
              setClearedPassed(true);
              setPhase('boss');
            } else {
              setClearedPassed(passed);
              setPhase('cleared');   // непрерывный поток: и проход, и провал → баннер (passed рулит текстом), без тупика
            }
          }
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
      <LevelProgressMap gameId="set_game" currentLevel={lvl.level} colors={colors} language={language} />
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
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}{!isPreset ? ` · ${language === 'ru' ? 'Ур.' : 'Lv'}${lvl.level}` : ''}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
        {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('setHint')}</Text>
      {hintBreakdown && feedback === 'wrong' && (
        <View style={[styles.hintBox, { backgroundColor: '#f43f5e22', borderColor: '#f43f5e' }]}>
          <Text style={[styles.hintTitle, { color: '#f43f5e' }]}>{t('label_not_set')}</Text>
          <View style={styles.hintRow}>
            <Text style={[styles.hintItem, { color: hintBreakdown.shape ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.shape ? '✓' : '✗'} {t('label_shape')}
            </Text>
            <Text style={[styles.hintItem, { color: hintBreakdown.color ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.color ? '✓' : '✗'} {t('label_color')}
            </Text>
            <Text style={[styles.hintItem, { color: hintBreakdown.fill ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.fill ? '✓' : '✗'} {t('label_fill')}
            </Text>
            <Text style={[styles.hintItem, { color: hintBreakdown.count ? '#22c55e' : '#f43f5e' }]}>
              {hintBreakdown.count ? '✓' : '✗'} {t('label_count_short')}
            </Text>
          </View>
          <Text style={[styles.hintRule, { color: colors.textSecondary }]}>
            {t('hint_set_rule')}
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
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('setGame')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="setGame" icon="shapes" gradient={GRADIENT as [string, string]}
          skillKey="skillReasoning" descriptionKey="setGameIntroDesc"
          benefits={SET_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'lightning', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="set_game" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 200 - errors * 50 - Math.floor(elapsedTime))}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 12, alignItems: 'center' },
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
