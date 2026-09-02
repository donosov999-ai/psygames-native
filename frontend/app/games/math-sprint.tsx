/* psygames-game-math-sprint · VER 1 · 19.08.2026 */
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
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndTimerTick, sndTimerEnd } from '@/src/services/feedback';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import BossRound from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const MS_RULES: LevelRule[] = [
  { key: 'mult', fromLevel: 3, toLevel: 4 },   // lr_math_sprint_mult_*
  { key: 'div', fromLevel: 5 },   // lr_math_sprint_div_*
];

const GRADIENT = ['#fc4a1a', '#f7b733'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.78 (норма AA 4.5), стало 4.96.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const MATH_BENEFITS = [
  { icon: 'calculator-outline', textKey: 'benefitMath1' },
  { icon: 'cash-outline', textKey: 'benefitMath2' },
  { icon: 'flash-outline', textKey: 'benefitMath3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
const BOSS_EVERY = 3;   // веха-босс каждые 3 уровня (резкая смена: счёт → «дополни ряд 1-9»)
type Difficulty = 'easy' | 'medium' | 'hard';
type Op = '+' | '-' | '*' | '/';

interface Problem {
  a: number;
  b: number;
  op: Op;
  answer: number;
}

// Уровень (1..15+) задаёт набор операций И величину чисел. Сложность растёт ТРУДНОСТЬЮ задачи, не временем.
// L1-2: + −  · L3-4: + − ×  · L5+: + − × ÷  · разрядность чисел плавно растёт. (Степени/скобки — фаза 2.)
function generateProblem(level: number): Problem {
  const ops: Op[] =
    level <= 2 ? ['+', '-'] :
    level <= 4 ? ['+', '-', '*'] :
    ['+', '-', '*', '/'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const rng = (n: number) => Math.floor(Math.random() * Math.max(1, Math.round(n)));
  let a: number, b: number, answer: number;
  if (op === '*') {
    a = 2 + rng(6 + level * 1.6);
    b = 2 + rng(5 + level);
    answer = a * b;
  } else if (op === '/') {
    b = 2 + rng(4 + level);
    const q = 2 + rng(5 + level);
    a = b * q; answer = q;                              // деление всегда нацело
  } else {
    const range = Math.round(15 * (1 + level * 0.6));    // разрядность растёт с уровнем
    a = 5 + rng(range);
    b = 1 + rng(range);
    if (op === '-' && b > a) { [a, b] = [b, a]; }
    answer = op === '+' ? a + b : a - b;
  }
  return { a, b, op, answer };
}

export default function MathSprintGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const gate = useLevelGate('math_sprint');
  const lvl = usePersistentLevel('math_sprint');   // уровень → тир (1=easy, 2=medium, ≥3=hard)

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [clearedPassed, setClearedPassed] = useState(true);   // память итога: true=прошёл (звёзды), false=«почти, ещё раз»
  const [bossWon, setBossWon] = useState<boolean | null>(null);   // итог босса-вехи (null = босса не было)
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'easy') as Difficulty));
  const [duration, setDuration] = useState(() => num('duration', 60));
  const [timeLeft, setTimeLeft] = useState(60);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const levelRef = useRef(1);            // текущий уровень партии (рулит набором операций и числами)

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  // Справка правил уровня: только в личной игре (в зарядке-пресете тир выбран вручную, бейдж скрыт)
  const levelRules = useLevelRules('math_sprint', lvl.level, MS_RULES, phase === 'playing' && !isPreset);

  const startGame = () => {
    setCorrect(0); setErrors(0); setStreak(0); setBestStreak(0); setScore(0);
    setBossWon(null);
    setUserAnswer('');
    setFeedback(null);
    // личная игра → уровень рулит; пресет (зарядка) → выбранный тир маппится в уровень
    const effLevel = isPreset ? ({ easy: 2, medium: 6, hard: 11 } as Record<Difficulty, number>)[difficulty] ?? 6 : lvl.level;
    levelRef.current = effLevel;
    setTimeLeft(duration);
    setProblem(generateProblem(effLevel));
    setPhase('playing');
    const start = gameNow();
    setStartTime(start);
    let lastSec = Math.ceil(duration);
    tickRef.current = setInterval(() => {
      const elapsed = (gameNow() - start) / 1000;
      setElapsedTime(elapsed);
      const remaining = Math.max(0, duration - elapsed);
      setTimeLeft(remaining);
      const s = Math.ceil(remaining);
      if (s !== lastSec) { lastSec = s; if (s > 0 && s <= 5) sndTimerTick(); }   // SND-T: тик последних 5с
      if (remaining <= 0) finishGame();
    }, 100);
  };

  const finishGame = async () => {
    if (tickRef.current) clearInterval(tickRef.current);
    sndTimerEnd();   // SND-T: «время вышло»
    const passed = !isPreset && correct >= 12;
    if (passed) lvl.reach(lvl.level + 1);   // ≥12 верных → +уровень
    else if (!isPreset) lvl.fail();          // и обратно: три провала подряд → −1 уровень
    try {
      await saveSession({
        passed,
        game_type: 'math_sprint',
        score,
        time_seconds: duration,
        difficulty: levelRef.current <= 4 ? 'easy' : levelRef.current <= 9 ? 'medium' : 'hard',
        mode: `${duration}s`,
        errors,
        details: { level: levelRef.current, correct, bestStreak },
      });
    } catch (e) { console.error(e); }
    // веха-босс: при чистом прохождении каждые BOSS_EVERY уровней → битва с боссом (счёт → «дополни ряд»)
    if (passed && levelRef.current % BOSS_EVERY === 0) { setBossWon(null); setClearedPassed(true); setPhase('boss'); }
    else if (isPreset) setPhase('result');   // пресет/свободный режим → экран статистики (уровень не трогаем)
    else { setClearedPassed(passed); setPhase('cleared'); }   // уровневый проход ИЛИ провал → баннер (passed=true звёзды / false «почти, ещё раз» + авто-рестарт того же уровня)
  };

  /** Свежая `submit` для авто-приёма: эффект не должен ловить старое замыкание. */
  const submitRef = useRef<() => void>(() => {});

  /**
   * 🔴 ВЕРНЫЙ ОТВЕТ ПРИНИМАЕТСЯ САМ. Игра ждала «Проверить» даже когда набранное
   * число УЖЕ равно ответу — спорить не о чем, а человек тянется к кнопке. На
   * счётном упражнении со секундомером это ещё и время в замер.
   *
   * ⚠️ ПРИНИМАЕМ ТОЛЬКО СОВПАДЕНИЕ. Неверное число само не отвергается: человек
   * мог не дописать (набирает 15, а по дороге показалось 1). Кнопка остаётся —
   * она для «я закончил, проверь», а не для «подтверди очевидное».
   *
   * ⚠️ Ложного срабатывания на приставке не бывает: верное значение ровно одно, и
   * пока набранное ему не равно, ничего не происходит.
   */
  useEffect(() => {
    if (!problem || userAnswer === '' || feedback !== null) return;
    if (parseInt(userAnswer, 10) === problem.answer) submitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAnswer, problem, feedback]);

  const submit = () => {
    if (!problem || userAnswer === '') return;
    const ans = parseInt(userAnswer, 10);
    let nextCorrect = correct;
    if (ans === problem.answer) {
      const newStreak = streak + 1;
      nextCorrect = correct + 1;
      const points = 10 + Math.min(newStreak * 2, 30);
      setCorrect(nextCorrect);
      setStreak(newStreak);
      setBestStreak(Math.max(bestStreak, newStreak));
      setScore((s) => s + points);
      setFeedback('correct');
      hapticSuccess();   // тактильно-звуковой отклик «верно»
    } else {
      setErrors((e) => e + 1);
      setStreak(0);
      setScore((s) => Math.max(0, s - 5));
      setFeedback('wrong');
      hapticError();   // тактильно-звуковой отклик «неверно»
    }
    setUserAnswer('');
    setTimeout(() => {
      setProblem(generateProblem(levelRef.current));
      setFeedback(null);
      inputRef.current?.focus();   // десктоп: вернуть фокус в поле, чтобы печатать дальше без клика мышью
    }, 250);
  }
  submitRef.current = submit;
;

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="calculator" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('mathSprint')}</Text>
        <Text style={styles.configDesc}>{t('mathSprintDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="mathSprintIntroDesc" benefits={MATH_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="math_sprint" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => {
            const locked = gate.isLocked(d);
            return (
            <TouchableOpacity
              accessibilityRole="button" key={d} disabled={locked}
              style={[styles.modeButton, difficulty === d && !locked
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 }]}
              onPress={() => !locked && setDifficulty(d)}>
              <Text style={[styles.modeButtonText, { color: difficulty === d && !locked ? textOn(GRADIENT[0]) : colors.text }]}>
                {d === 'easy' ? t('easy') : d === 'medium' ? t('medium') : t('hard')}{locked ? ' 🔒' : ''}
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('duration')}</Text>
        <View style={styles.optionButtons}>
          {[30, 60, 120].map((n) => (
            <TouchableOpacity
              accessibilityRole="button" key={n} style={[styles.modeButton, duration === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDuration(n)}>
              <Text style={[styles.modeButtonText, { color: duration === n ? textOn(GRADIENT[0]) : colors.text }]}>{n}{t('secShort')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      </View>
    </View>
  );

  // playing-фаза — на едином каркасе GameShell: скроллящееся поле (подстраховка для старых
  // WebView без interactive-widget — при клавиатуре контент доскролливается), кнопка
  // «Проверить» прибита к низу в тулбаре; модалка правил поверх каркаса
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('mathSprint')}
          onBack={() => goBackOrHome()}
          scrollableField
          /**
           * Счётчики ДАННЫМИ (см. `HudItem`): каркас рисует их одинаково во всех
           * играх, и правка вида приходит сразу везде.
           *
           * ⚠️ Ошибок в шапке нет намеренно: при подстройке сложности они норма по
           * построению, и красный счётчик наказывает ровно за то, чего требует
           * обучение (§12.4 карты геймификации). Серия показывается с трёх — раньше
           * это не серия, а совпадение.
           */
          hud={[
            { key: 'time', icon: 'time', label: t('timeLeftLabel'), value: `${timeLeft.toFixed(1)}${t('secShort')}`, tone: timeLeft <= 5 ? 'warn' as const : 'neutral' as const },
            { key: 'score', icon: 'star', label: t('score'), value: score, tone: 'accent' as const, pop: true },
            { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: correct, tone: 'good' as const },
            ...(streak >= 3 ? [{ key: 'streak', icon: 'flame' as const, label: t('hud_streak'), value: streak, tone: 'warn' as const }]
              : !isPreset ? [{ key: 'lvl', icon: 'flag' as const, label: t('label_level_short'), value: lvl.level }] : []),
          ]}
          stats={!isPreset ? (
            <View style={styles.statsRow}>
              <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />
            </View>
          ) : undefined}
          toolbar={
            <TouchableOpacity
              accessibilityRole="button" onPress={submit} style={[styles.submitBtn, { backgroundColor: GRADIENT[0] }]}>
              <Text style={[styles.submitText, { color: textOn(GRADIENT[0]) }]}>{t('check')}</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.fieldCol}>
            <View style={[styles.problemArea, {
              backgroundColor: feedback === 'correct' ? 'rgba(34,197,94,0.15)' : feedback === 'wrong' ? 'rgba(244,63,94,0.15)' : 'transparent',
            }]}>
              {problem && (
                <Text style={[styles.problemText, { color: colors.text }]}>
                  {problem.a} {problem.op === '*' ? '×' : problem.op === '/' ? '÷' : problem.op} {problem.b} = ?
                </Text>
              )}
            </View>
            <TextInput
              ref={inputRef}
              value={userAnswer}
              onChangeText={(s) => setUserAnswer(s.replace(/[^-0-9]/g, ''))}
              onSubmitEditing={submit}
              autoFocus
              keyboardType="numeric"
              placeholder="?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, {
                color: colors.text, borderColor: colors.border, backgroundColor: colors.surface,
              }]}
            />
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('mathHint')}</Text>
          </View>
        </GameShell>
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('mathSprint')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'boss' && (
        <BossRound config={{ type: 'completeline', gradient: GRADIENT as [string, string] }}
          language={language} colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('cleared'); }} />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="math_sprint" level={levelRef.current} passed={clearedPassed} stars={bossWon === true ? 3 : (errors === 0 ? 3 : errors <= 2 ? 2 : 1)}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult score={score + (bossWon ? 50 : 0)} time={duration} errors={errors}
          stars={bossWon === true ? 3 : undefined}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  // Прибитый низ настроек: кнопка «начать» всегда на экране, над системной навигацией.
  // Раньше она была последней в прокрутке — на невысоком экране до неё приходилось
  // доскроллить, а решение «во что играю» оказывалось в двух разных местах.
  // Отступ слева — под плавающую кнопку отзыва, она висит поверх и накрывала бы её.
  configSticky: { paddingTop: 10, paddingHorizontal: 16, paddingLeft: 68, borderTopWidth: StyleSheet.hairlineWidth },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 16 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', maxWidth: '100%' },
  statText: { fontSize: 16, fontWeight: '700' },
  problemArea: { paddingVertical: 32, paddingHorizontal: 28, borderRadius: 14, minWidth: 240, alignItems: 'center' },
  // RTL-пин: «a − b = ?» в RTL-bidi перестраивается в «? = b − a» — математика всегда LTR
  problemText: { fontSize: 48, fontWeight: '900', writingDirection: 'ltr' },
  input: {
    fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: 4,
    paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 2,
    minWidth: 180,
  },
  submitBtn: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 48, borderRadius: 16 , justifyContent: 'center'},
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center' },
});
