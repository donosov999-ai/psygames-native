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
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#11998e', '#38ef7d'];
const DIGIT_BENEFITS = [
  { icon: 'call-outline', textKey: 'benefitDigit1' },
  { icon: 'create-outline', textKey: 'benefitDigit2' },
  { icon: 'fitness-outline', textKey: 'benefitDigit3' },
];

type GamePhase = 'intro' | 'config' | 'showing' | 'input' | 'result';
type Direction = 'forward' | 'backward';

export default function DigitSpanGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const gate = useLevelGate('digit_span');
  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [direction, setDirection] = useState<Direction>(() => (str('mode', 'forward') as Direction));
  const [seqLen, setSeqLen] = useState(() => num('startLen', 4));
  const [sequence, setSequence] = useState<number[]>([]);
  const [showIdx, setShowIdx] = useState(-1);
  const [userInput, setUserInput] = useState('');
  const [lastFeedback, setLastFeedback] = useState<'right' | 'wrong' | null>(null);
  const submittingRef = useRef(false);
  const [correctRounds, setCorrectRounds] = useState(0);
  const [maxSpan, setMaxSpan] = useState(0);
  const [round, setRound] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const showTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (showTimerRef.current) clearInterval(showTimerRef.current); };
  }, []);

  const generateSeq = (len: number) => {
    const seq: number[] = [];
    for (let i = 0; i < len; i++) seq.push(Math.floor(Math.random() * 10));
    return seq;
  };

  const startGame = () => {
    setCorrectRounds(0); setMaxSpan(0); setRound(1); setErrors(0);
    setStartTime(Date.now());
    showSequence(seqLen);
  };

  const showSequence = (len: number) => {
    const seq = generateSeq(len);
    setSequence(seq);
    setShowIdx(-1);
    setUserInput('');
    setLastFeedback(null);
    submittingRef.current = false;
    setPhase('showing');
    let i = 0;
    showTimerRef.current = setInterval(() => {
      if (i >= seq.length) {
        if (showTimerRef.current) clearInterval(showTimerRef.current);
        setShowIdx(-2); // hidden between digits
        setTimeout(() => setPhase('input'), 300);
        return;
      }
      setShowIdx(i);
      setTimeout(() => setShowIdx(-2), 700);
      i++;
    }, 1100);
    // Show first digit immediately
    setShowIdx(0);
    setTimeout(() => setShowIdx(-2), 700);
    i = 1;
  };

  // Auto-submit когда юзер ввёл столько же цифр сколько в последовательности
  useEffect(() => {
    if (phase !== 'input') return;
    if (userInput.length === seqLen && !submittingRef.current) {
      submittingRef.current = true;
      // Небольшая задержка чтобы юзер увидел свою последнюю цифру
      setTimeout(() => handleSubmit(), 250);
    }
  }, [userInput, phase, seqLen]);

  const handleSubmit = async () => {
    const expected = direction === 'forward' ? sequence : [...sequence].reverse();
    const expectedStr = expected.join('');
    const correct = userInput === expectedStr;
    setLastFeedback(correct ? 'right' : 'wrong');
    let nextLen = seqLen;
    let cont = true;
    let updatedMax = maxSpan;
    let updatedCorrect = correctRounds;
    let updatedErrors = errors;

    if (correct) {
      updatedCorrect += 1;
      updatedMax = Math.max(updatedMax, seqLen);
      nextLen = seqLen + 1;
    } else {
      updatedErrors += 1;
      // 2 errors at same length => stop
      if (errors >= 1 || round >= 12) cont = false;
    }
    setCorrectRounds(updatedCorrect);
    setMaxSpan(updatedMax);
    setErrors(updatedErrors);

    if (!cont || nextLen > 12) {
      const finalTime = (Date.now() - startTime) / 1000;
      setElapsedTime(finalTime);
      setPhase('result');
      try {
        await saveSession({
          game_type: 'digit_span',
          score: updatedMax * 10,
          time_seconds: finalTime,
          difficulty: direction,
          mode: `start${seqLen}`,
          errors: updatedErrors,
          details: { maxSpan: updatedMax, correctRounds: updatedCorrect, finalLength: seqLen },
        });
      } catch (e) { console.error(e); }
    } else {
      setSeqLen(correct ? nextLen : seqLen);
      setRound((r) => r + 1);
      setTimeout(() => showSequence(correct ? nextLen : seqLen), 600);
    }
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="call" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('digitSpan')}</Text>
        <Text style={styles.configDesc}>{t('digitSpanDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('directionLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['forward', 'backward'] as Direction[]).map((d) => {
            const locked = gate.isLocked(d);
            return (
            <TouchableOpacity
              key={d}
              disabled={locked}
              style={[
                styles.modeButton,
                direction === d && !locked
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 },
              ]}
              onPress={() => !locked && setDirection(d)}
            >
              <Text style={[styles.modeButtonText, { color: direction === d && !locked ? '#FFF' : colors.text }]}>
                {d === 'forward' ? t('directionForward') : t('directionBackward')}{locked ? ' 🔒' : ''}
              </Text>
            </TouchableOpacity>
            );
          })}
        </View>
        {gate.nextHint && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 8, fontStyle: 'italic' }}>
            {gate.nextHint}
          </Text>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('startLengthLabel')}</Text>
        <View style={styles.optionButtons}>
          {[3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.modeButton,
                seqLen === n
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setSeqLen(n)}
            >
              <Text style={[styles.modeButtonText, { color: seqLen === n ? '#FFF' : colors.text }]}>{n}</Text>
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

  const renderShowing = () => (
    <View style={styles.playArea}>
      <Text style={[styles.statText, { color: colors.textSecondary }]}>{t('memorize')} ({seqLen})</Text>
      <View style={styles.digitArea}>
        <Text style={[styles.bigDigit, { color: colors.text }]}>
          {showIdx >= 0 && showIdx < sequence.length ? sequence[showIdx] : ' '}
        </Text>
      </View>
    </View>
  );

  const renderInput = () => (
    <View style={styles.playArea}>
      <Text style={[styles.statText, { color: colors.text }]}>
        {direction === 'forward' ? t('typeAsShown') : t('typeReversed')}
      </Text>
      <Text style={[styles.statText, { color: colors.textSecondary }]}>
        {t('lengthLabel')}: {seqLen} · {t('round')} {round}
      </Text>
      <TextInput
        value={userInput}
        onChangeText={(s) => setUserInput(s.replace(/[^0-9]/g, '').slice(0, seqLen))}
        keyboardType="numeric"
        autoFocus
        maxLength={seqLen}
        editable={lastFeedback === null}
        style={[styles.inputField, {
          color: colors.text,
          borderColor: lastFeedback === 'right' ? '#22c55e' : lastFeedback === 'wrong' ? '#f43f5e' : colors.border,
          borderWidth: lastFeedback ? 3 : 1,
          backgroundColor: colors.surface,
        }]}
        placeholder={'•'.repeat(seqLen)}
        placeholderTextColor={colors.textSecondary}
      />
      {/* Status badge (replaces manual Check button — auto-submit happens on last digit) */}
      {lastFeedback === null ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' }}>
          {userInput.length}/{seqLen} — {t('hint_autocheck')}
        </Text>
      ) : lastFeedback === 'right' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
          <Text style={{ color: '#22c55e', fontSize: 18, fontWeight: '800' }}>{t('msg_correct_level_up')}</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Ionicons name="close-circle" size={28} color="#f43f5e" />
          <Text style={{ color: '#f43f5e', fontSize: 16, fontWeight: '700' }}>
            {t('label_was')}: {(direction === 'forward' ? sequence : [...sequence].reverse()).join('')}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('digitSpan')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="digitSpan"
          icon="call"
          gradient={GRADIENT as [string, string]}
          skillKey="skillShortTermMemory"
          descriptionKey="digitSpanIntroDesc"
          benefits={DIGIT_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'showing' && renderShowing()}
      {phase === 'input' && renderInput()}
      {phase === 'result' && (
        <GameResult score={maxSpan * 10} time={elapsedTime} errors={errors}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 24, gap: 18, alignItems: 'center', justifyContent: 'center' },
  statText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  digitArea: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center' },
  bigDigit: { fontSize: 140, fontWeight: '900' },
  inputField: {
    fontSize: 32, fontWeight: '700', textAlign: 'center', letterSpacing: 8,
    paddingVertical: 18, paddingHorizontal: 24, borderRadius: 12, borderWidth: 2,
    minWidth: 200,
  },
});
