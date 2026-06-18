/**
 * Лексическое решение (Полиглот TIER 1 п.2, v1.29.0).
 * Классическая lexical decision task: «реальное слово L2 или нет?» — 2 кнопки, тахистоскопный темп.
 * Псевдослова — src/services/pseudowords.ts (мутация реальных слов словаря).
 * Биомаркеры: hits / false alarms / mean RT — скорость доступа к ментальному лексикону.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { generatePseudowords, sampleRealWords } from '@/src/services/pseudowords';

const GRADIENT = ['#0ea5e9', '#6366f1'];

const LD_BENEFITS = [
  { icon: 'flash-outline', textKey: 'benefitLd1' },
  { icon: 'library-outline', textKey: 'benefitLd2' },
  { icon: 'eye-outline', textKey: 'benefitLd3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
interface Trial { text: string; isWord: boolean }

export default function LexicalDecisionGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const [trialsCount, setTrialsCount] = useState(() => num('trials', 30));

  const [trials, setTrials] = useState<Trial[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null); // выбор юзера на текущей пробе
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const hitsRef = useRef(0);            // слово → «слово»
  const faRef = useRef(0);              // псевдо → «слово» (false alarm)
  const missRef = useRef(0);            // слово → «не слово»
  const crRef = useRef(0);              // псевдо → «не слово» (correct rejection)
  const rtSumRef = useRef(0);
  const shownAtRef = useRef(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;

  const startGame = () => {
    const half = Math.floor(trialsCount / 2);
    const real = sampleRealWords(tgt, trialsCount - half).map((w) => ({ text: w, isWord: true }));
    const pseudo = generatePseudowords(tgt, half).map((w) => ({ text: w, isWord: false }));
    const all = [...real, ...pseudo];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    setTrials(all);
    setIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setErrorsCount(0);
    hitsRef.current = 0; faRef.current = 0; missRef.current = 0; crRef.current = 0;
    rtSumRef.current = 0;
    setStartTime(Date.now());
    shownAtRef.current = Date.now();
    setPhase('playing');
  };

  const finish = async (total: number) => {
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'lexical_decision',
        score: correctCount,
        time_seconds: finalTime,
        difficulty: `${tgt} · ${total}`,
        errors: errorsCount,
        details: {
          target_lang: tgt,
          trials: total,
          hits: hitsRef.current,
          false_alarms: faRef.current,
          misses: missRef.current,
          correct_rejections: crRef.current,
          accuracy: total > 0 ? correctCount / total : 0,
          mean_rt_ms: total > 0 ? Math.round(rtSumRef.current / total) : 0,
        },
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }
  };

  const handleAnswer = (saysWord: boolean) => {
    if (picked !== null) return;
    const trial = trials[idx];
    const rt = Date.now() - shownAtRef.current;
    rtSumRef.current += rt;
    const isCorrect = saysWord === trial.isWord;
    setPicked(saysWord);
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      if (trial.isWord) hitsRef.current += 1; else crRef.current += 1;
    } else {
      setErrorsCount((c) => c + 1);
      if (trial.isWord) missRef.current += 1; else faRef.current += 1;
    }
    setTimeout(() => {
      const next = idx + 1;
      if (next >= trials.length) {
        finish(trials.length);
      } else {
        setIdx(next);
        setPicked(null);
        shownAtRef.current = Date.now();
      }
    }, isCorrect ? 300 : 800);
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="flash" size={48} color="#fff" />
          <Text style={[styles.configTitle, { color: '#fff' }]}>{t('lexicalDecision')}</Text>
          <Text style={[styles.configDesc, { color: 'rgba(255,255,255,0.8)' }]}>{t('lexicalDecisionDesc')}</Text>
        </LinearGradient>

        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {LANGUAGES.find((l) => l.code === language)?.name} →
          </Text>
          <View style={styles.optionButtons}>
            {LANGUAGES.filter((l) => l.code !== language).map((l) => (
              <TouchableOpacity
                key={l.code}
                style={[
                  styles.sizeButton,
                  tgt === l.code && { backgroundColor: GRADIENT[0] },
                  tgt !== l.code && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setTargetLang(l.code)}
              >
                <Text style={[styles.sizeButtonText, { color: tgt === l.code ? '#fff' : colors.text }]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
          <View style={styles.optionButtons}>
            {[20, 30, 40].map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.sizeButton,
                  trialsCount === n && { backgroundColor: GRADIENT[0] },
                  trialsCount !== n && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setTrialsCount(n)}
              >
                <Text style={[styles.sizeButtonText, { color: trialsCount === n ? '#fff' : colors.text }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.startButton} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startButtonGradient}>
            <Ionicons name="play" size={24} color="#fff" />
            <Text style={[styles.startButtonText, { color: '#fff' }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderPlaying = () => {
    const trial = trials[idx];
    if (!trial) return null;
    const showFeedback = picked !== null;
    const wasCorrect = showFeedback && picked === trial.isWord;
    return (
      <View style={styles.gameContainer}>
        <View style={styles.hudRow}>
          <Text style={[styles.hudText, { color: colors.textSecondary }]}>{idx + 1}/{trials.length}</Text>
          <Text style={[styles.hudText, { color: colors.textSecondary }]}>✓ {correctCount} · ✗ {errorsCount}</Text>
        </View>

        <View
          style={[
            styles.promptCard,
            { backgroundColor: colors.surface },
            showFeedback && { backgroundColor: wasCorrect ? '#34d399' : '#f43f5e' },
          ]}
        >
          <Text style={[styles.promptWord, { color: showFeedback ? '#fff' : colors.text }]}>{trial.text}</Text>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('ldHint')}</Text>

        <View style={styles.answerRow}>
          <TouchableOpacity
            style={[styles.bigButton, { backgroundColor: '#34d399' }]}
            onPress={() => handleAnswer(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark" size={28} color="#fff" />
            <Text style={styles.bigButtonText}>{t('ldWordBtn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bigButton, { backgroundColor: '#f43f5e' }]}
            onPress={() => handleAnswer(false)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={28} color="#fff" />
            <Text style={styles.bigButtonText}>{t('ldNonwordBtn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="lexicalDecision"
          icon="flash"
          gradient={GRADIENT}
          skillKey="skillVocabulary"
          descriptionKey="lexicalDecisionIntroDesc"
          benefits={LD_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('lexicalDecision')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime}
          score={correctCount}
          errors={errorsCount}
          gradient={GRADIENT}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => router.push('/')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  placeholder: { width: 44 },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 16, paddingBottom: 20 },
  configCard: { padding: 24, borderRadius: 20, alignItems: 'center', marginBottom: 8 },
  configTitle: { fontSize: 24, fontWeight: '700' },
  configDesc: { fontSize: 14, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sizeButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, minWidth: 56, alignItems: 'center' },
  sizeButtonText: { fontSize: 15, fontWeight: '600' },
  startButton: { marginTop: 10 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 8,
    gap: 8,
  },
  startButtonText: { fontSize: 18, fontWeight: '700' },
  gameContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  hudText: { fontSize: 15, fontWeight: '600' },
  promptCard: {
    borderRadius: 20,
    paddingVertical: 56,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  promptWord: { fontSize: 36, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  answerRow: { flexDirection: 'row', gap: 12 },
  bigButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bigButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
