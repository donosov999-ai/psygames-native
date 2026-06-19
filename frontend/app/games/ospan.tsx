import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView
} from 'react-native';
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

const GRADIENT = ['#cb356b', '#bdfff3'];
const OSPAN_BENEFITS = [
  { icon: 'calculator-outline',  textKey: 'benefitOs1' },
  { icon: 'library-outline',     textKey: 'benefitOs2' },
  { icon: 'shield-outline',      textKey: 'benefitOs3' },
];

// Operation Span: alternate (math equation → letter to remember) for N steps,
// then recall letters in order. Math + storage = working memory under load.

type GamePhase = 'intro' | 'config' | 'eq' | 'letter' | 'recall' | 'result';

const LETTERS_RU = ['А','Б','В','Г','Д','Е','Ж','З','К','Л','М','Н','П','Р','С','Т','Ф','Х','Ц','Ш'];
const LETTERS_EN = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','V','X'];

interface Equation { left: string; right: number; isCorrect: boolean; }

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function makeEquation(): Equation {
  // a OP b = R, then offer R or R±k
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const op = Math.random() < 0.5 ? '+' : '-';
  const real = op === '+' ? a + b : a - b;
  const isCorrect = Math.random() < 0.5;
  const shown = isCorrect ? real : real + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
  return { left: `${a} ${op} ${b}`, right: shown, isCorrect: shown === real };
}

export default function OSpanGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [setSize, setSetSize] = useState(4);

  const [stepIdx, setStepIdx] = useState(0);
  const [eq, setEq] = useState<Equation>({ left: '', right: 0, isCorrect: false });
  const [letter, setLetter] = useState('');
  const [letters, setLetters] = useState<string[]>([]);
  const [mathHits, setMathHits] = useState(0);
  const [mathErrors, setMathErrors] = useState(0);
  const [recallInput, setRecallInput] = useState('');
  const [recallHits, setRecallHits] = useState(0);
  const [recallErrors, setRecallErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const letterPool = language === 'en' ? LETTERS_EN : LETTERS_RU;

  const startGame = () => {
    setStepIdx(0);
    setLetters([]);
    setMathHits(0); setMathErrors(0);
    setRecallHits(0); setRecallErrors(0);
    setRecallInput('');
    setFeedback(null);
    setEq(makeEquation());
    setPhase('eq');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleEquation = (says: boolean) => {
    if (feedback !== null) return;
    const ok = says === eq.isCorrect;
    if (ok) setMathHits(h => h + 1); else setMathErrors(e => e + 1);
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(() => {
      setFeedback(null);
      // show letter
      const next = rndItem(letterPool);
      setLetter(next);
      setLetters(prev => [...prev, next]);
      setPhase('letter');
      setTimeout(() => {
        if (stepIdx + 1 >= setSize) setPhase('recall');
        else {
          setStepIdx(stepIdx + 1);
          setEq(makeEquation());
          setPhase('eq');
        }
      }, 1100);
    }, 350);
  };

  const handleRecall = async () => {
    const expected = letters;
    const given = recallInput.toUpperCase().split(/[\s,]+/).filter(Boolean);
    let h = 0, e = 0;
    for (let i = 0; i < expected.length; i++) {
      if (given[i] === expected[i].toUpperCase()) h++;
      else e++;
    }
    setRecallHits(h); setRecallErrors(e);
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'ospan',
        score: Math.max(0, h * 100 + mathHits * 30 - e * 50 - mathErrors * 30),
        time_seconds: finalTime,
        difficulty: setSize <= 3 ? 'easy' : setSize <= 5 ? 'medium' : 'hard',
        mode: `${setSize}-set`,
        errors: e,
        details: { math_hits: mathHits, math_errors: mathErrors, letters: letters.join('') },
      });
    } catch (err) { console.error(err); }
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="calculator" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('ospan')}</Text>
        <Text style={styles.configDesc}>{t('ospanDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('setSize')}</Text>
        <View style={styles.optionButtons}>
          {[3, 4, 5, 6].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, setSize === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setSetSize(n)}>
              <Text style={[styles.modeButtonText, { color: setSize === n ? '#FFF' : colors.text }]}>{n}</Text>
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

  const renderEq = () => {
    const fbColor = feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.text;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{stepIdx + 1}/{setSize}</Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>✓math {mathHits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗math {mathErrors}</Text>
        </View>
        <View style={[styles.eqBox, { backgroundColor: colors.surface, borderColor: feedback ? fbColor : colors.border, borderWidth: feedback ? 3 : 1 }]}>
          <Text style={[styles.eqText, { color: fbColor }]}>{eq.left} = {eq.right}</Text>
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('ospanEqHint')}</Text>
        <View style={styles.choiceRow}>
          <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: '#22c55e' }]} onPress={() => handleEquation(true)}>
            <Ionicons name="checkmark" size={28} color="#FFF" />
            <Text style={styles.choiceText}>{t('correct')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: '#f43f5e' }]} onPress={() => handleEquation(false)}>
            <Ionicons name="close" size={28} color="#FFF" />
            <Text style={styles.choiceText}>{t('incorrect')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderLetter = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{stepIdx + 1}/{setSize}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('ospanRememberLetter')}</Text>
      <View style={[styles.letterBox, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
        <Text style={[styles.bigLetter, { color: colors.text }]}>{letter}</Text>
      </View>
    </View>
  );

  const renderRecall = () => (
    <View style={styles.playArea}>
      <Text style={[styles.recallTitle, { color: colors.text }]}>{t('recallNow')}</Text>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('ospanRecallHint')}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        placeholder={letterPool.slice(0, setSize).join(' ')}
        placeholderTextColor={colors.textSecondary}
        value={recallInput}
        onChangeText={setRecallInput}
        autoFocus
        autoCorrect={false}
        autoCapitalize="characters"
      />
      <TouchableOpacity style={styles.startBtn} onPress={handleRecall}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('validateBtn')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('ospan')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="ospan" icon="calculator" gradient={GRADIENT as [string, string]}
          skillKey="skillWorkingMemory" descriptionKey="ospanIntroDesc"
          benefits={OSPAN_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'eq' && renderEq()}
      {phase === 'letter' && renderLetter()}
      {phase === 'recall' && renderRecall()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, recallHits * 100 + mathHits * 30 - recallErrors * 50 - mathErrors * 30)}
          time={elapsedTime} errors={recallErrors + mathErrors}
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
  playArea: { flex: 1, padding: 18, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  eqBox: { paddingHorizontal: 30, paddingVertical: 22, borderRadius: 16 },
  eqText: { fontSize: 36, fontWeight: '900' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  choiceRow: { flexDirection: 'row', gap: 16 },
  choiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12 },
  choiceText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  letterBox: { width: 160, height: 160, borderRadius: 24, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  bigLetter: { fontSize: 88, fontWeight: '900' },
  recallTitle: { fontSize: 22, fontWeight: '800' },
  input: { width: '100%', maxWidth: 360, minHeight: 56, padding: 14, fontSize: 20, borderRadius: 12, borderWidth: 1, textAlign: 'center', fontWeight: '700', letterSpacing: 4 },
});
