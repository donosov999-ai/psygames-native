/* psygames-game-stroop · VER 1 · 19.08.2026 */
/**
 * Stroop — классический тест интерференции (цвет чернил vs значение слова).
 *
 * Система уровней (по паттерну cpt.tsx): сложность растёт ТРУДНОСТЬЮ, не временем:
 *   - окно ответа на пробу сокращается с уровнем (3.5с → 1.2с);
 *   - доля конфликтных проб (incongruent: слово ≠ цвет чернил) растёт (50% → 90%);
 *   - на верхних уровнях (11+) растёт число трейлов (20 → 30).
 * Просрочка окна ответа = ошибка (miss). Проход уровня: точность ≥85% за раунд.
 *
 * Биомаркеры: mean RT congruent/incongruent, interference_ms (Stroop effect).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';

const GRADIENT = ['#fc466b', '#3f5efb'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 3.37 (норма AA 4.5), стало 4.53.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #feb5c4 @0.08 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const STROOP_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitStroop1' },
  { icon: 'shuffle-outline', textKey: 'benefitStroop2' },
  { icon: 'bulb-outline', textKey: 'benefitStroop3' },
];

const COLORS_DEF = [
  { name: 'red', ru: 'КРАСНЫЙ', en: 'RED', hex: '#ef4444' },
  { name: 'blue', ru: 'СИНИЙ', en: 'BLUE', hex: '#3b82f6' },
  { name: 'green', ru: 'ЗЕЛЁНЫЙ', en: 'GREEN', hex: '#22c55e' },
  { name: 'yellow', ru: 'ЖЁЛТЫЙ', en: 'YELLOW', hex: '#eab308' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Mode = 'word' | 'ink';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

// Маппинг уровня (1..15) в параметры сложности:
//   L1-5  — окно 3500→2840мс, конфликтных 50→62%, 20 трейлов
//   L6-10 — окно 2675→2015мс, конфликтных 65→77%, 20 трейлов
//   L11-15— окно 1850→1200мс, конфликтных 80→90%, трейлы 22→30
function levelParams(level: number): { trials: number; windowMs: number; incongruentRatio: number } {
  const trials = level <= 10 ? 20 : Math.min(30, 20 + (level - 10) * 2);
  const windowMs = Math.max(1200, 3500 - (level - 1) * 165);
  const incongruentRatio = Math.min(0.9, 0.5 + (level - 1) * 0.03);
  return { trials, windowMs, incongruentRatio };
}

export default function StroopGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('stroop');
  useEffect(() => { if (autostart) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [mode, setMode] = useState<Mode>(() => (str('mode', 'ink') === 'word' ? 'word' : 'ink'));
  const [word, setWord] = useState(COLORS_DEF[0]);
  const [inkColor, setInkColor] = useState(COLORS_DEF[1]);
  const [round, setRound] = useState(0);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  // refs — таймер окна ответа живёт вне ре-рендера (без stale closures)
  const levelRef = useRef(1);
  const trialsRef = useRef(20);
  const windowMsRef = useRef(3500);
  const incongruentRef = useRef(0.5);
  const modeRef = useRef<Mode>('ink');
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const missesRef = useRef(0);
  const rtsCongruentRef = useRef<number[]>([]);
  const rtsIncongruentRef = useRef<number[]>([]);
  const wordRef = useRef(COLORS_DEF[0]);
  const inkRef = useRef(COLORS_DEF[1]);
  const trialStartRef = useRef(0);
  const startTimeRef = useRef(0);
  const answeredRef = useRef(false);
  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => () => {
    stoppedRef.current = true;
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
  }, []);

  const nextRound = () => {
    if (stoppedRef.current) return;
    const w = COLORS_DEF[Math.floor(Math.random() * 4)];
    let c;
    if (Math.random() < incongruentRef.current) {
      do { c = COLORS_DEF[Math.floor(Math.random() * 4)]; } while (c.name === w.name);
    } else {
      c = w;
    }
    wordRef.current = w; inkRef.current = c;
    setWord(w); setInkColor(c);
    answeredRef.current = false;
    trialStartRef.current = gameNow();
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
    windowTimerRef.current = setTimeout(handleTimeout, windowMsRef.current);
  };

  const advanceOrFinish = () => {
    if (roundRef.current >= trialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    nextRound();
  };

  // просрочка окна ответа = ошибка (miss)
  const handleTimeout = () => {
    if (stoppedRef.current || answeredRef.current) return;
    answeredRef.current = true;
    missesRef.current += 1;
    errorsRef.current += 1;
    setErrors(errorsRef.current);
    advanceOrFinish();
  };

  const handleAnswer = (chosen: typeof COLORS_DEF[0]) => {
    if (stoppedRef.current || answeredRef.current) return;
    answeredRef.current = true;
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
    const correctName = modeRef.current === 'ink' ? inkRef.current.name : wordRef.current.name;
    const isCongruent = inkRef.current.name === wordRef.current.name;
    const rt = gameNow() - trialStartRef.current;
    if (chosen.name === correctName) {
      hapticSuccess();
      hitsRef.current += 1;
      setHits(hitsRef.current);
      // record RT only on correct trials (standard psychometric convention)
      if (isCongruent) rtsCongruentRef.current.push(rt);
      else rtsIncongruentRef.current.push(rt);
    } else {
      hapticError();
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    advanceOrFinish();
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    trialsRef.current = isPreset ? num('trials', p.trials) : p.trials;
    windowMsRef.current = p.windowMs;
    incongruentRef.current = p.incongruentRatio;
    modeRef.current = mode;
    stoppedRef.current = false;
    hitsRef.current = 0; errorsRef.current = 0; missesRef.current = 0;
    rtsCongruentRef.current = []; rtsIncongruentRef.current = [];
    roundRef.current = 1;
    setHits(0); setErrors(0); setRound(1);
    setPhase('playing');
    startTimeRef.current = gameNow();
    nextRound();
  };

  const finish = async () => {
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const totalHits = hitsRef.current;
    const totalErrors = errorsRef.current;
    const accuracy = trialsRef.current > 0 ? totalHits / trialsRef.current : 0;
    const rc = rtsCongruentRef.current;
    const ri = rtsIncongruentRef.current;
    const meanCongr = rc.length ? Math.round(rc.reduce((a, b) => a + b, 0) / rc.length) : 0;
    const meanIncongr = ri.length ? Math.round(ri.reduce((a, b) => a + b, 0) / ri.length) : 0;
    const interferenceMs = meanCongr && meanIncongr ? meanIncongr - meanCongr : 0;
    // проход уровня: точность ≥85% за раунд (просрочки окна считаются ошибками);
    // на пресет-запусках (зарядка) уровень не трогаем — ни reach, ни fail
    const passed = !isPreset && accuracy >= 0.85;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    // непрерывный поток: уровневый провал больше не тупик — общий баннер с passed={false}
    // и авто-рестартом того же (или пониженного) уровня; пресет/зарядка → статистика (result)
    if (isPreset) {
      setPhase('result');
    } else if (passed && levelRef.current % BOSS_EVERY === 0) {
      // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
      setClearedPassed(true);
      setPhase('boss');
    } else {
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: 'stroop',
        score: totalHits,
        time_seconds: finalTime,
        difficulty: modeRef.current,
        mode: `lvl${levelRef.current}`,
        errors: totalErrors,
        details: {
          level: levelRef.current,
          hits: totalHits,
          errors: totalErrors,
          misses: missesRef.current,
          accuracy: Math.round(accuracy * 100),
          window_ms: windowMsRef.current,
          incongruent_ratio: incongruentRef.current,
          mean_rt_congruent: meanCongr,
          mean_rt_incongruent: meanIncongr,
          interference_ms: interferenceMs,
        },
      });
    } catch (e) { console.error(e); }
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <View style={{ flex: 1 }}>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="eye" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('stroop')}</Text>
          <Text style={styles.configDesc}>{t('stroopDesc')}</Text>
        </GradientSurface>
        <GameAbout descriptionKey="stroopIntroDesc" benefits={STROOP_BENEFITS} accent={GRADIENT[0]} />
        <LevelProgressMap gameId="stroop" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('stroopLvlParams').replace('{n}', String(p.trials)).replace('{w}', (p.windowMs / 1000).toFixed(1)).replace('{p}', String(Math.round(p.incongruentRatio * 100)))}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {t('stroopPass')}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('stroopModeLabel')}</Text>
          <View style={styles.optionButtons}>
            {(['ink', 'word'] as Mode[]).map((m) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={m}
                style={[
                  styles.modeButton,
                  mode === m
                    ? { backgroundColor: GRADIENT[0] }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.modeButtonText, { color: mode === m ? '#FFF' : colors.text }]}>
                  {m === 'ink' ? t('stroopByInk') : t('stroopByWord')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
          <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </GradientSurface>
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  // playing-фаза — на едином каркасе GameShell (цветные кнопки прибиты к низу)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('stroop')}
        onBack={() => { stoppedRef.current = true; if (windowTimerRef.current) clearTimeout(windowTimerRef.current); goBackOrHome(); }}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>{t('round')} {round}/{trialsRef.current}</Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>{t('hud_correct')} {hits}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>{t('hud_errors')} {errors}</Text>
          </View>
        }
        toolbar={
          <View style={styles.answersGrid}>
            {COLORS_DEF.map((c) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={c.name}
                style={[styles.answerBtn, { backgroundColor: c.hex }]}
                onPress={() => handleAnswer(c)}
              >
                <Text style={styles.answerText}>{language === 'ru' ? c.ru : c.en}</Text>
              </TouchableOpacity>
            ))}
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.bigWord, { color: inkColor.hex }]}>
            {language === 'ru' ? word.ru : word.en}
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {mode === 'ink' ? t('stroopHintInk') : t('stroopHintWord')}
          </Text>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { stoppedRef.current = true; if (windowTimerRef.current) clearTimeout(windowTimerRef.current); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('stroop')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="stroop" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult score={hits} time={elapsedTime} errors={errors}
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
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 20 },
  bigWord: { fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  answersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 360 },
  answerBtn: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16, minWidth: 140, alignItems: 'center' },
  answerText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
