/**
 * Switching Task — переключение между двумя правилами (task switching, switch cost)
 *
 * Парадигма: каждая проба — стимул + плашка-cue «ЧТО оценивать сейчас» (одно из
 * двух заданий режима). Между пробами задание случайно переключается — switch
 * trial медленнее repeat trial (switch cost = цена переключения).
 *
 * Уровни (persist, по паттерну cpt/simon): ручные селекторы сложности и числа
 * проб заменены на usePersistentLevel('switching_task') + levelParams. Ось:
 *   - частота переключений правил растёт 30% → 75%
 *   - окно ответа сокращается 3400мс → 1400мс (не успел = ошибка-пропуск)
 *   - число проб растёт ступенями 12 → 16 → 20
 * Селектор режима стимула (mix/num2/num3/letters) ОСТАВЛЕН — он меняет ПРАВИЛО
 * игры (какие два задания), а не сложность.
 * Проход уровня: ≥80% верных ответов за раунд → LevelCleared (авто-поток).
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
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

const GRADIENT = ['#7873f5', '#ff6ec4'];
const SW_BENEFITS = [
  { icon: 'swap-horizontal-outline', textKey: 'benefitSw1' },
  { icon: 'speedometer-outline',     textKey: 'benefitSw2' },
  { icon: 'shuffle-outline',         textKey: 'benefitSw3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
// Режим стимула (выбор в настройках). У каждого — ДВА задания, между которыми идёт переключение.
type StimMode = 'mix' | 'num2' | 'num3' | 'letters';

const DIGITS = ['2', '3', '4', '5', '6', '7', '8', '9'];
const LETTERS = ['A', 'E', 'I', 'U', 'B', 'D', 'F', 'G', 'K', 'M', 'N', 'P', 'R', 'S', 'T'];
const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

const MODES: { key: StimMode; ru: string; en: string }[] = [
  { key: 'mix', ru: 'Цифра+буква', en: 'Digit+letter' },
  { key: 'num2', ru: 'Двузначные', en: '2-digit' },
  { key: 'num3', ru: 'Трёхзначные', en: '3-digit' },
  { key: 'letters', ru: 'Только буквы', en: 'Letters' },
];

// Уровень 1..15: частота переключений правил растёт, окно ответа сокращается,
// число проб растёт ступенями (12 → 16 → 20).
function levelParams(level: number): { trials: number; switchProb: number; windowMs: number } {
  const trials = level <= 5 ? 12 : level <= 10 ? 16 : 20;
  const switchProb = Math.min(0.75, 0.30 + (level - 1) * 0.032);   // 30% → 75%
  const windowMs = Math.max(1400, 3400 - (level - 1) * 145);       // 3400мс → 1400мс
  return { trials, switchProb, windowMs };
}

function midFor(mode: StimMode): number { return mode === 'num3' ? 500 : 50; }

// Метаданные задания (cue + подписи кнопок + что подсветить) по режиму и индексу задания (0/1).
function taskMeta(mode: StimMode, idx: number, lang: string) {
  const ru = lang === 'ru';
  if (mode === 'mix') {
    return idx === 0
      ? { cue: ru ? 'ЧИСЛО' : 'NUMBER', left: ru ? 'нечёт' : 'odd', right: ru ? 'чёт' : 'even', icon: 'calculator' as const, color: '#3b82f6', emph: 'num' as const }
      : { cue: ru ? 'БУКВА' : 'LETTER', left: ru ? 'гласная' : 'vowel', right: ru ? 'согласная' : 'conson.', icon: 'text' as const, color: '#f59e0b', emph: 'letter' as const };
  }
  if (mode === 'num2' || mode === 'num3') {
    const mid = midFor(mode);
    return idx === 0
      ? { cue: ru ? 'ЧЁТНОСТЬ' : 'PARITY', left: ru ? 'нечёт' : 'odd', right: ru ? 'чёт' : 'even', icon: 'calculator' as const, color: '#3b82f6', emph: 'num' as const }
      : { cue: ru ? 'РАЗМЕР' : 'SIZE', left: `< ${mid}`, right: `≥ ${mid}`, icon: 'resize' as const, color: '#10b981', emph: 'num' as const };
  }
  // letters
  return idx === 0
    ? { cue: ru ? 'ГЛАСНАЯ?' : 'VOWEL?', left: ru ? 'гласная' : 'vowel', right: ru ? 'согласная' : 'conson.', icon: 'text' as const, color: '#f59e0b', emph: 'letter' as const }
    : { cue: ru ? 'ПОЛОВИНА' : 'HALF', left: 'A–M', right: 'N–Z', icon: 'swap-horizontal' as const, color: '#8b5cf6', emph: 'letter' as const };
}

function modeHint(mode: StimMode, lang: string): string {
  const a = taskMeta(mode, 0, lang), b = taskMeta(mode, 1, lang);
  return `${a.cue} → ${a.left}/${a.right}  ·  ${b.cue} → ${b.left}/${b.right}`;
}

interface Trial { taskIdx: number; num: number; letter: string; full: string; correctLeft: boolean; isSwitch: boolean; }

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function genStim(mode: StimMode): { num: number; letter: string; full: string } {
  if (mode === 'mix') { const num = parseInt(rndItem(DIGITS), 10); const letter = rndItem(LETTERS); return { num, letter, full: `${num}${letter}` }; }
  if (mode === 'num2') { const num = 10 + Math.floor(Math.random() * 90); return { num, letter: '', full: String(num) }; }
  if (mode === 'num3') { const num = 100 + Math.floor(Math.random() * 900); return { num, letter: '', full: String(num) }; }
  const letter = rndItem(ALL_LETTERS); return { num: 0, letter, full: letter };
}

function judgeLeft(mode: StimMode, idx: number, num: number, letter: string): boolean {
  if (mode === 'mix') return idx === 0 ? num % 2 === 1 : VOWELS.has(letter);
  if (mode === 'num2' || mode === 'num3') return idx === 0 ? num % 2 === 1 : num < midFor(mode);
  return idx === 0 ? VOWELS.has(letter) : letter <= 'M';
}

export default function SwitchingTaskGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { width } = useWindowDimensions();
  const stStim = Math.min(width - 36, 320);
  const router = useRouter();

  const { isPreset, str } = useGamePreset();
  const lvl = usePersistentLevel('switching_task');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [clearedPassed, setClearedPassed] = useState(true);
  const [mode, setMode] = useState<StimMode>(() => (str('stimMode', 'mix') as StimMode));

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(12);
  const [trial, setTrial] = useState<Trial>({ taskIdx: 0, num: 0, letter: '', full: '', correctLeft: true, isSwitch: false });
  const [showStim, setShowStim] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);

  // Рефы — таймерная цепочка (стимул → дедлайн окна → следующая проба) живёт вне
  // ре-рендеров, state в её колбэках был бы устаревшим (паттерн cpt/simon).
  const levelRef = useRef(1);
  const switchProbRef = useRef(0.30);
  const windowMsRef = useRef(3400);
  const totalTrialsRef = useRef(12);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const switchRtsRef = useRef<number[]>([]);
  const trialRef = useRef<Trial>({ taskIdx: 0, num: 0, letter: '', full: '', correctLeft: true, isSwitch: false });
  const stimAtRef = useRef(0);
  const answeredRef = useRef(false);
  const startTimeRef = useRef(0);
  const lastTaskRef = useRef<number | null>(null);
  const modeRef = useRef<StimMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [stimTimerRef, deadlineTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []);

  const makeTrial = (): Trial => {
    const m = modeRef.current;
    const last = lastTaskRef.current;
    let taskIdx: number;
    if (last === null) taskIdx = Math.random() < 0.5 ? 0 : 1;
    else if (Math.random() < switchProbRef.current) taskIdx = last === 0 ? 1 : 0;
    else taskIdx = last;
    const isSwitch = last !== null && last !== taskIdx;
    lastTaskRef.current = taskIdx;
    const { num: n, letter, full } = genStim(m);
    return { taskIdx, num: n, letter, full, correctLeft: judgeLeft(m, taskIdx, n, letter), isSwitch };
  };

  const newTrial = () => {
    setShowStim(false);
    setFeedback(null);
    const tr = makeTrial();
    trialRef.current = tr;
    setTrial(tr);
    stimTimerRef.current = setTimeout(() => {
      stimAtRef.current = Date.now();
      answeredRef.current = false;
      setShowStim(true);
      // Окно ответа уровня: не успел — ошибка-пропуск, проба закрывается сама
      deadlineTimerRef.current = setTimeout(() => {
        if (answeredRef.current) return;
        answeredRef.current = true;
        errorsRef.current += 1;
        setErrors(errorsRef.current);
        setFeedback('wrong');
        fbTimerRef.current = setTimeout(advance, 350);
      }, windowMsRef.current);
    }, 500);
  };

  const advance = () => {
    if (roundRef.current >= totalTrialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    newTrial();
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    switchProbRef.current = p.switchProb;
    windowMsRef.current = p.windowMs;
    totalTrialsRef.current = p.trials;
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0;
    rtsRef.current = []; switchRtsRef.current = [];
    lastTaskRef.current = null;
    answeredRef.current = false;
    roundRef.current = 1;
    setHits(0); setErrors(0); setRts([]);
    setRound(1);
    setPhase('playing');
    startTimeRef.current = Date.now();
    newTrial();
  };

  const finish = async () => {
    clearAllTimers();
    const totalTime = (Date.now() - startTimeRef.current) / 1000;
    const allRts = rtsRef.current;
    const swRts = switchRtsRef.current;
    const meanRt = allRts.length ? allRts.reduce((a, b) => a + b, 0) / allRts.length : 0;
    const swMean = swRts.length ? swRts.reduce((a, b) => a + b, 0) / swRts.length : 0;
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = totalTrialsRef.current > 0 ? h / totalTrialsRef.current : 0;
    // Проход уровня: ≥80% верных за раунд (пропуски по окну = ошибки)
    const passed = !isPreset && accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');                       // пресет/свободный режим — статистика, уровень не трогаем
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');                       // непрерывный поток: провал → баннер «почти, ещё раз» + авто-рестарт того же уровня
    }
    try {
      await saveSession({
        game_type: 'switching_task',
        score: Math.max(0, Math.round(h * 80 - e * 50 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `${modeRef.current}·lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          switch_cost_ms: Math.round(swMean - meanRt),
          accuracy: Math.round(accuracy * 100),
          n_trials: totalTrialsRef.current,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (left: boolean) => {
    if (!showStim || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = Date.now() - stimAtRef.current;
    const tr = trialRef.current;
    const ok = left === tr.correctLeft;
    if (ok) {
      hitsRef.current += 1;
      setHits(hitsRef.current);
      rtsRef.current.push(rt);
      if (tr.isSwitch) switchRtsRef.current.push(rt);
      setRts([...rtsRef.current]);
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(advance, 350);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
  const meta = taskMeta(mode, trial.taskIdx, language);

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="swap-horizontal" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('switchingTask')}</Text>
          <Text style={styles.configDesc}>{t('switchingTaskDesc')}</Text>
        </LinearGradient>

        {/* Режим стимула + ПРАВИЛА (что оценивать) — меняет ПРАВИЛО игры, не сложность → оставлен */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Что показывать' : 'Stimulus'}</Text>
          <View style={styles.optionButtons}>
            {MODES.map((m) => (
              <TouchableOpacity key={m.key} style={[styles.modeButton, mode === m.key
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setMode(m.key)}>
                <Text style={[styles.modeButtonText, { color: mode === m.key ? '#FFF' : colors.text }]}>{language === 'ru' ? m.ru : m.en}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.rulesBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.rulesText, { color: colors.text }]}>{language === 'ru' ? 'Правила:' : 'Rules:'} {modeHint(mode, language)}</Text>
            <Text style={[styles.rulesSub, { color: colors.textSecondary }]}>
              {language === 'ru' ? 'Плашка сверху скажет, ЧТО оценивать сейчас. Левая кнопка / правая кнопка.' : 'The top badge tells WHAT to judge now. Left / right button.'}
            </Text>
          </View>
        </View>

        <LevelProgressMap gameId="switching_task" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.trials} проб · переключений ~${Math.round(p.switchProb * 100)}% · окно ответа ${(p.windowMs / 1000).toFixed(1)} с`
              : `${p.trials} trials · ~${Math.round(p.switchProb * 100)}% switches · ${(p.windowMs / 1000).toFixed(1)} s response window`}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
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

        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderStim = () => {
    if (!showStim) return <Text style={[styles.stimText, { fontSize: stStim * 0.4, color: colors.textSecondary }]}>•</Text>;
    if (mode === 'mix') {
      const numOn = meta.emph === 'num';
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.stimText, { fontSize: stStim * 0.42, color: numOn ? meta.color : colors.textSecondary, opacity: numOn ? 1 : 0.3 }]}>{trial.num}</Text>
          <Text style={[styles.stimText, { fontSize: stStim * 0.42, color: !numOn ? meta.color : colors.textSecondary, opacity: !numOn ? 1 : 0.3 }]}>{trial.letter}</Text>
        </View>
      );
    }
    return <Text style={[styles.stimText, { fontSize: stStim * (mode === 'num3' ? 0.3 : 0.36), color: meta.color }]}>{trial.full}</Text>;
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{meanRt}{language === 'ru' ? 'мс' : 'ms'}</Text>
      </View>
      {/* Крупная заметная плашка: ЧТО оценивать сейчас (+ ↻ если задание сменилось) */}
      <View style={[styles.cueBadge, { backgroundColor: meta.color }]}>
        <Ionicons name={meta.icon} size={20} color="#FFF" />
        <Text style={styles.cueText}>{language === 'ru' ? 'ОЦЕНИ' : 'JUDGE'}: {meta.cue}</Text>
        {trial.isSwitch && showStim && <Text style={styles.cueSwitch}>↻</Text>}
      </View>
      <View style={[styles.stimBox, {
        width: stStim, height: stStim,
        backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
        borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.textSecondary,
      }]}>
        {renderStim()}
      </View>
      <View style={[styles.choiceRow, { width: stStim }]}>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[0], flex: 1 }]} onPress={() => handleAnswer(true)}>
          <Text style={styles.choiceTextSmall}>← {meta.left}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[1], flex: 1 }]} onPress={() => handleAnswer(false)}>
          <Text style={styles.choiceTextSmall}>{meta.right} →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('switchingTask')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="switchingTask" icon="swap-horizontal" gradient={GRADIENT as [string, string]}
          skillKey="skillSwitching" descriptionKey="switchingTaskIntroDesc"
          benefits={SW_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="switching_task" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed} gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 80 - errors * 50 - meanRt * 0.05))}
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
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  rulesBox: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 4 },
  rulesText: { fontSize: 13, fontWeight: '700' },
  rulesSub: { fontSize: 12, lineHeight: 16 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 18, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  cueBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22 },
  cueText: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  cueSwitch: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  stimBox: { borderRadius: 24, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  stimText: { fontWeight: '900' },
  choiceRow: { flexDirection: 'row', gap: 16 },
  choiceBtn: { paddingVertical: 16, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center' },
  choiceTextSmall: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
