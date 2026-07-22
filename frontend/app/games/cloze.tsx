/**
 * Cloze (Полиглот TIER 1 п.4, v1.29.0) — пропущенное слово во фразе на целевом языке.
 * Грамматика + извлечение слова в контексте. Фразы — src/constants/clozePhrases.ts
 * (ответ привязан к словарю через answerEn), дистракторы — слова ТОЙ ЖЕ категории
 * (семантически близкие → выбор не угадывается по форме).
 *
 * Уровни (persist, по паттерну cpt/simon): ручной селектор числа раундов заменён на
 * usePersistentLevel('cloze') + levelParams. В данных градации сложности фраз нет
 * (по 16 фраз A1 на язык) → ось усложнения = объём + темп:
 *   - число фраз за раунд растёт 6 → 16 (потолок = пул фраз языка)
 *   - лимит времени на фразу сокращается 14с → 4.5с (не успел = ошибка, ответ показывается)
 * Проход уровня: ≥80% верных ответов → LevelCleared (авто-поток к следующему).
 * Селектор целевого ЯЗЫКА остаётся (меняет правило, не сложность); уровень общий
 * на все языки — пул везде одинаковый (16 фраз), параметры языков не ломают.
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
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { CLOZE_PHRASES } from '@/src/constants/clozePhrases';

const GRADIENT = ['#f59e0b', '#ef4444'];

const CLOZE_BENEFITS = [
  { icon: 'text-outline', textKey: 'benefitCloze1' },
  { icon: 'construct-outline', textKey: 'benefitCloze2' },
  { icon: 'chatbubbles-outline', textKey: 'benefitCloze3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
interface Round { text: string; answer: string; options: string[] }

/** Сентинел «время вышло»: picked не совпадает ни с одной опцией →
 *  подсветится только правильный ответ (зелёным), как reveal. */
const TIMEOUT_PICK = '⏰';

// Уровень 1..15: раундов больше (6 → 16), лимит на фразу короче (14с → 4.5с).
// Пул = 16 фраз на язык, поэтому раунды упираются в потолок пула.
function levelParams(level: number): { rounds: number; timeLimitMs: number } {
  const rounds = Math.min(16, 5 + level);                        // 6 → 16
  const timeLimitMs = Math.max(4500, 14000 - (level - 1) * 700); // 14с → 4.5с
  return { rounds, timeLimitMs };
}

/** Сколько фраз языка реально играбельны (answerEn найден в словаре и переведён). */
function availablePhrases(tgt: string): number {
  return (CLOZE_PHRASES[tgt] ?? []).filter((p) => {
    const e = TRANSLATION_VOCAB.find((w) => w.en === p.answerEn);
    return !!(e && e[tgt]);
  }).length;
}

export default function ClozeGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('cloze');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  // Число раундов: в уровневом режиме — из levelParams; пресеты (зарядка) по-прежнему задают своё
  const [presetRounds] = useState(() => num('rounds', 10));

  const [rounds, setRounds] = useState<Round[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  // Рефы — прогресс раунда и таймерная цепочка (дедлайн → reveal → следующая фраза)
  // живут вне ре-рендеров, state в колбэках setTimeout был бы устаревшим (паттерн simon/cpt).
  const roundsRef = useRef<Round[]>([]);
  const idxRef = useRef(0);
  const correctRef = useRef(0);
  const errorsRef = useRef(0);
  const answeredRef = useRef(false);
  const rtSumRef = useRef(0);
  const shownAtRef = useRef(0);
  const startTimeRef = useRef(0);
  const levelRef = useRef(1);
  const timeLimitRef = useRef(0);   // 0 = без лимита (пресеты — прежнее поведение)

  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = () => {
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
  };
  useEffect(() => () => clearAllTimers(), []);

  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;

  /** Показ новой фразы: сброс флага ответа + дедлайн уровня (0 = лимита нет). */
  const armDeadline = () => {
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    answeredRef.current = false;
    shownAtRef.current = Date.now();
    const limit = timeLimitRef.current;
    if (limit > 0) {
      setTimeLeft(Math.ceil(limit / 1000));
      tickIntervalRef.current = setInterval(() => {
        setTimeLeft(Math.max(0, Math.ceil((shownAtRef.current + limit - Date.now()) / 1000)));
      }, 250);
      deadlineTimerRef.current = setTimeout(onTimeout, limit);
    }
  };

  /** Не успел в лимит: ошибка + reveal правильного ответа, дальше сам. */
  const onTimeout = () => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    rtSumRef.current += timeLimitRef.current;
    errorsRef.current += 1;
    setErrorsCount(errorsRef.current);
    setPicked(TIMEOUT_PICK);
    advanceTimerRef.current = setTimeout(advance, 1200);
  };

  const advance = () => {
    const next = idxRef.current + 1;
    if (next >= roundsRef.current.length) { finish(); return; }
    idxRef.current = next;
    setIdx(next);
    setPicked(null);
    armDeadline();
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    timeLimitRef.current = isPreset ? 0 : p.timeLimitMs;
    const roundsCount = isPreset ? presetRounds : p.rounds;

    const phrases = [...(CLOZE_PHRASES[tgt] ?? [])];
    for (let i = phrases.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [phrases[i], phrases[j]] = [phrases[j], phrases[i]];
    }
    const newRounds: Round[] = [];
    for (const p2 of phrases) {
      if (newRounds.length >= roundsCount) break;
      const entry = TRANSLATION_VOCAB.find((w) => w.en === p2.answerEn);
      if (!entry || !entry[tgt]) continue; // фраза с неизвестным answerEn — пропуск
      const answer = entry[tgt];
      // дистракторы той же категории; добор из всего словаря, если категория мала
      const sameCat = TRANSLATION_VOCAB.filter((w) => w.cat === entry.cat && w[tgt] && w[tgt] !== answer).map((w) => w[tgt]);
      const anyOther = TRANSLATION_VOCAB.filter((w) => w[tgt] && w[tgt] !== answer).map((w) => w[tgt]);
      const distractors = new Set<string>();
      const pickFrom = (arr: string[]) => {
        let guard = 0;
        while (distractors.size < 3 && guard < 60 && arr.length > 0) {
          guard += 1;
          distractors.add(arr[Math.floor(Math.random() * arr.length)]);
        }
      };
      pickFrom(sameCat);
      if (distractors.size < 3) pickFrom(anyOther);
      const options = [answer, ...distractors];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      newRounds.push({ text: p2.text, answer, options });
    }
    roundsRef.current = newRounds;
    idxRef.current = 0;
    correctRef.current = 0;
    errorsRef.current = 0;
    rtSumRef.current = 0;
    setRounds(newRounds);
    setIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setErrorsCount(0);
    startTimeRef.current = Date.now();
    setPhase('playing');
    armDeadline();
  };

  const finish = async () => {
    clearAllTimers();
    const total = roundsRef.current.length;
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const c = correctRef.current;
    const e = errorsRef.current;
    const accuracy = total > 0 ? c / total : 0;
    // Проход уровня: ≥80% верных (тайм-аут по лимиту = ошибка)
    const passed = !isPreset && total > 0 && accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — экран статистики
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');   // непрерывный поток: и проход, и провал → баннер уровня с авто-рестартом
    }
    try {
      await saveSession({
        game_type: 'cloze',
        score: c,
        time_seconds: finalTime,
        difficulty: `${tgt} · ${total}`,
        mode: isPreset ? 'preset' : `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          target_lang: tgt,
          rounds: total,
          accuracy,
          mean_rt_ms: total > 0 ? Math.round(rtSumRef.current / total) : 0,
          time_limit_ms: timeLimitRef.current,
        },
      });
    } catch (err) {
      console.error('Error saving session:', err);
    }
  };

  const handlePick = (option: string) => {
    if (picked !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    const round = roundsRef.current[idxRef.current];
    rtSumRef.current += Date.now() - shownAtRef.current;
    const isCorrect = option === round.answer;
    setPicked(option);
    if (isCorrect) {
      correctRef.current += 1;
      setCorrectCount(correctRef.current);
    } else {
      errorsRef.current += 1;
      setErrorsCount(errorsRef.current);
    }
    advanceTimerRef.current = setTimeout(advance, isCorrect ? 400 : 1200);
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const planned = Math.min(p.rounds, availablePhrases(tgt));
    return (
      <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.configContainer}>
          <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
            <Ionicons name="create" size={48} color="#fff" />
            <Text style={[styles.configTitle, { color: '#fff' }]}>{t('cloze')}</Text>
            <Text style={[styles.configDesc, { color: 'rgba(255,255,255,0.8)' }]}>{t('clozeDesc')}</Text>
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

          <LevelProgressMap gameId="cloze" currentLevel={lvl.level} colors={colors} language={language} />
          <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12, alignItems: 'center', gap: 6 }]}>
            <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
              {t('level')} {lvl.level}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {t('clozeLvlParams').replace('{n}', String(planned)).replace('{w}', (p.timeLimitMs / 1000).toFixed(1))}
            </Text>
            {/* Критерий прохождения уровня виден игроку (паттерн cpt) */}
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
              {t('clozePass')}
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

  // playing-фаза — на едином каркасе GameShell (фраза в скролл-поле, варианты ответов прибиты к низу)
  const renderPlaying = () => {
    const round = rounds[idx];
    if (!round) return null;
    const lowTime = timeLeft <= 2;
    return (
      <GameShell
        title={t('cloze')}
        onBack={() => { clearAllTimers(); goBackOrHome(); }}
        scrollableField
        stats={
          <View style={styles.hudRow}>
            <Text style={[styles.hudText, { color: colors.textSecondary }]}>{idx + 1}/{rounds.length}</Text>
            {timeLimitRef.current > 0 && (
              <Text style={[styles.hudText, { color: lowTime ? '#f43f5e' : colors.textSecondary }]}>⏱ {timeLeft}</Text>
            )}
            <Text style={[styles.hudText, { color: colors.textSecondary }]}>✓ {correctCount} · ✗ {errorsCount}</Text>
          </View>
        }
        toolbar={
          <View style={styles.toolbarOptions}>
            {round.options.map((o) => {
              const isRight = picked !== null && o === round.answer;
              const isWrongPick = picked === o && o !== round.answer;
              return (
                <TouchableOpacity
                  key={o}
                  style={[
                    styles.answerButton,
                    styles.toolbarOptionBtn,
                    { backgroundColor: colors.surface, borderColor: colors.textSecondary },
                    isRight && { backgroundColor: '#34d399', borderColor: '#34d399' },
                    isWrongPick && { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
                  ]}
                  onPress={() => handlePick(o)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.answerText, { color: isRight || isWrongPick ? '#fff' : colors.text }]}>{o}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        }
      >
        <View style={[styles.promptCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.promptPhrase, { color: colors.text }]}>{round.text}</Text>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('clozeHint')}</Text>
      </GameShell>
    );
  };

  if (phase === 'playing') return renderPlaying();

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="cloze"
          icon="create"
          gradient={GRADIENT}
          skillKey="skillVocabulary"
          descriptionKey="clozeIntroDesc"
          benefits={CLOZE_BENEFITS}
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
        <Text style={[styles.title, { color: colors.text }]}>{t('cloze')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="cloze"
          level={levelRef.current}
          passed={clearedPassed}
          stars={errorsCount === 0 ? 3 : errorsCount <= 2 ? 2 : 1}
          gradient={GRADIENT}
          language={language}
          colors={colors}
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
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  hudText: { fontSize: 15, fontWeight: '600' },
  promptCard: {
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(128,128,128,0.3)',
  },
  promptPhrase: { fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 34 },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 14 },
  // Варианты ответов в тулбаре каркаса: сетка 2×N на всю ширину ряда
  toolbarOptions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toolbarOptionBtn: { flexGrow: 1, flexBasis: '45%' },
  answerButton: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  answerText: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
});
