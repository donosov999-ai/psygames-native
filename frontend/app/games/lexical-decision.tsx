/**
 * Лексическое решение (Полиглот TIER 1 п.2, v1.29.0).
 * Классическая lexical decision task: «реальное слово L2 или нет?» — 2 кнопки, тахистоскопный темп.
 * Псевдослова — src/services/pseudowords.ts (мутация реальных слов словаря).
 * Биомаркеры: hits / false alarms / mean RT — скорость доступа к ментальному лексикону.
 *
 * Уровни (persist, по паттерну cpt/simon): ручной селектор числа проб заменён на
 * usePersistentLevel('lexical_decision') + levelParams. Псевдослова градации похожести
 * не имеют (генератор всегда мутирует 1-2 буквы), поэтому ось усложнения — только темп:
 *   - окно ответа сокращается 3.0с → 1.1с (не успел = ошибка, проба закрывается сама)
 *   - число проб растёт ступенями 14 → 18 → 22
 * Проход уровня: ≥80% верных ответов → LevelCleared (авто-поток).
 * Селектор целевого ЯЗЫКА (меняет правило, не сложность) — остаётся.
 * Пресеты (зарядка): прежний self-paced режим (без дедлайна), trials из params, reach/fail не зовём.
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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { generatePseudowords, sampleRealWords } from '@/src/services/pseudowords';

const GRADIENT = ['#0ea5e9', '#6366f1'];

const LD_BENEFITS = [
  { icon: 'flash-outline', textKey: 'benefitLd1' },
  { icon: 'library-outline', textKey: 'benefitLd2' },
  { icon: 'eye-outline', textKey: 'benefitLd3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
interface Trial { text: string; isWord: boolean }

// Уровень 1..15: окно ответа сокращается 3.0с → 1.1с, число проб растёт ступенями.
// Языковые параметры уровень НЕ трогает — словники всех языков работают как раньше.
function levelParams(level: number): { trials: number; windowMs: number } {
  const trials = level <= 5 ? 14 : level <= 10 ? 18 : 22;
  const windowMs = Math.max(1100, 3000 - (level - 1) * 140);
  return { trials, windowMs };
}

export default function LexicalDecisionGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('lexical_decision');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const presetTrials = num('trials', 30);   // только для пресетов (зарядка передаёт trials)

  const [trials, setTrials] = useState<Trial[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null); // выбор юзера на текущей пробе (или авто-«wrong» по дедлайну)
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  // Рефы — таймерная цепочка (дедлайн → фидбек → следующая проба) живёт вне
  // ре-рендеров, state в её колбэках был бы устаревшим (паттерн cpt/simon).
  const levelRef = useRef(1);
  const windowMsRef = useRef(0);            // 0 = без дедлайна (пресет / self-paced)
  const trialsRef = useRef<Trial[]>([]);
  const idxRef = useRef(0);
  const correctRef = useRef(0);
  const errorsRef = useRef(0);
  const hitsRef = useRef(0);            // слово → «слово»
  const faRef = useRef(0);              // псевдо → «слово» (false alarm)
  const missRef = useRef(0);            // слово → «не слово»
  const crRef = useRef(0);              // псевдо → «не слово» (correct rejection)
  const timeoutsRef = useRef(0);        // не успел в окно ответа
  const rtSumRef = useRef(0);
  const rtCountRef = useRef(0);
  const shownAtRef = useRef(0);
  const answeredRef = useRef(false);
  const startTimeRef = useRef(0);
  const tgtRef = useRef('en');

  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [deadlineTimerRef, advanceTimerRef].forEach((r) => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []);

  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;

  // Показ текущей пробы: фиксируем момент показа + взводим дедлайн уровня.
  const presentTrial = () => {
    answeredRef.current = false;
    shownAtRef.current = Date.now();
    if (windowMsRef.current > 0) {
      deadlineTimerRef.current = setTimeout(() => {
        if (answeredRef.current) return;
        answeredRef.current = true;
        const trial = trialsRef.current[idxRef.current];
        errorsRef.current += 1;
        setErrorsCount(errorsRef.current);
        timeoutsRef.current += 1;
        if (trial?.isWord) missRef.current += 1;   // не успел на слове = пропуск (miss)
        // фидбек «не успел»: подсвечиваем как неверный ответ (picked ≠ isWord → красная карточка)
        setPicked(trial ? !trial.isWord : false);
        advanceTimerRef.current = setTimeout(advance, 800);
      }, windowMsRef.current);
    }
  };

  const advance = () => {
    const next = idxRef.current + 1;
    if (next >= trialsRef.current.length) { finish(); return; }
    idxRef.current = next;
    setIdx(next);
    setPicked(null);
    presentTrial();
  };

  const startGame = () => {
    clearAllTimers();
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    windowMsRef.current = isPreset ? 0 : p.windowMs;   // пресет = прежний self-paced режим
    const count = isPreset ? presetTrials : p.trials;
    tgtRef.current = tgt;
    const half = Math.floor(count / 2);
    const real = sampleRealWords(tgt, count - half).map((w) => ({ text: w, isWord: true }));
    const pseudo = generatePseudowords(tgt, half).map((w) => ({ text: w, isWord: false }));
    const all = [...real, ...pseudo];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    trialsRef.current = all;
    setTrials(all);
    idxRef.current = 0;
    setIdx(0);
    setPicked(null);
    correctRef.current = 0; errorsRef.current = 0;
    setCorrectCount(0);
    setErrorsCount(0);
    hitsRef.current = 0; faRef.current = 0; missRef.current = 0; crRef.current = 0;
    timeoutsRef.current = 0;
    rtSumRef.current = 0; rtCountRef.current = 0;
    startTimeRef.current = Date.now();
    setPhase('playing');
    presentTrial();
  };

  const finish = async () => {
    clearAllTimers();
    const total = trialsRef.current.length;
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const accuracy = total > 0 ? correctRef.current / total : 0;
    // Проход уровня: ≥80% верных ответов (таймаут по окну = ошибка)
    const passed = !isPreset && accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');   // пресет/зарядка: экран статистики, уровень не трогаем
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');   // непрерывный поток: и проход, и недобор → баннер уровня
    }
    try {
      await saveSession({
        game_type: 'lexical_decision',
        score: correctRef.current,
        time_seconds: finalTime,
        difficulty: `${tgtRef.current} · ${total}`,
        mode: `lvl${levelRef.current}`,
        errors: errorsRef.current,
        details: {
          level: levelRef.current,
          target_lang: tgtRef.current,
          trials: total,
          window_ms: windowMsRef.current,
          timeouts: timeoutsRef.current,
          hits: hitsRef.current,
          false_alarms: faRef.current,
          misses: missRef.current,
          correct_rejections: crRef.current,
          accuracy,
          mean_rt_ms: rtCountRef.current > 0 ? Math.round(rtSumRef.current / rtCountRef.current) : 0,
        },
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }
  };

  const handleAnswer = (saysWord: boolean) => {
    if (answeredRef.current || picked !== null) return;
    const trial = trialsRef.current[idxRef.current];
    if (!trial) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = Date.now() - shownAtRef.current;
    rtSumRef.current += rt;
    rtCountRef.current += 1;
    const isCorrect = saysWord === trial.isWord;
    setPicked(saysWord);
    if (isCorrect) {
      correctRef.current += 1;
      setCorrectCount(correctRef.current);
      if (trial.isWord) hitsRef.current += 1; else crRef.current += 1;
    } else {
      errorsRef.current += 1;
      setErrorsCount(errorsRef.current);
      if (trial.isWord) missRef.current += 1; else faRef.current += 1;
    }
    advanceTimerRef.current = setTimeout(advance, isCorrect ? 300 : 800);
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
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

          <LevelProgressMap gameId="lexical_decision" currentLevel={lvl.level} colors={colors} language={language} />

          {/* Карточка уровня: параметры + видимый критерий прохода + сброс ↺1 (паттерн cpt/simon) */}
          <View style={[styles.optionCard, { backgroundColor: colors.surface, marginTop: 12, marginBottom: 12, alignItems: 'center', gap: 6 }]}>
            <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
              {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {language === 'ru'
                ? `${p.trials} проб · окно ответа ${(p.windowMs / 1000).toFixed(1)} с`
                : `${p.trials} trials · ${(p.windowMs / 1000).toFixed(1)} s response window`}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
              {language === 'ru'
                ? 'Проход уровня: ≥80% верных ответов (не успел в окно = ошибка)'
                : 'To pass: ≥80% correct answers (missing the window counts as an error)'}
            </Text>
            {lvl.level > 1 && (
              <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
              </TouchableOpacity>
            )}
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
  };

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
          onPress={() => { clearAllTimers(); goBackOrHome(); }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('lexicalDecision')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="lexical_decision"
          level={levelRef.current}
          stars={errorsCount === 0 ? 3 : errorsCount <= 2 ? 2 : 1}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          passed={clearedPassed}
          onContinue={() => startGame()}
          onStop={() => setPhase('config')}
        />
      )}
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
