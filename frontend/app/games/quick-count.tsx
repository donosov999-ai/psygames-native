/* psygames-game-quick-count · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';

// Быстрый подсчёт (subitizing) — новая игра v1.117.0. Отдельный когнитивный навык:
// оценить КОЛИЧЕСТВО объектов за долю секунды БЕЗ пересчёта по одному — не пересекается
// ни с одной из существующих игр (counter.tsx — это арифметика на сумму, не восприятие
// количества). Идея из разбора данных конкурента (freefocusgames/counting-boxes),
// реализация с нуля (репо AGPL — код не копировался, только сама задача из когнитивной психологии).
const GRADIENT = ['#f7971e', '#ffd200'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.45 (норма AA 4.5), стало 7.07.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

const QUICKCOUNT_BENEFITS = [
  { icon: 'flash-outline', textKey: 'benefitQuickCount1' },
  { icon: 'eye-outline', textKey: 'benefitQuickCount2' },
  { icon: 'calculator-outline', textKey: 'benefitQuickCount3' },
];

type GamePhase = 'intro' | 'config' | 'flash' | 'answer' | 'boss' | 'cleared' | 'result';
const BOSS_EVERY = 3;
const TRIALS_PER_ROUND = 12;

interface Dot { x: number; y: number }

// Уровень: диапазон количества точек растёт, время показа падает. Дно 300мс —
// ниже человек физически не успевает даже мельком зафиксировать взглядом.
/** Больше двадцати точек на экране телефона не различить — это потолок задачи. */
const MAX_DOTS = 20;

/**
 * 🔴 ДИАПАЗОН ПЕРЕВОРАЧИВАЛСЯ С СОРОКОВОГО УРОВНЯ. Нижняя граница росла без
 * потолка, верхняя упиралась в двадцать — и с L40 нижняя обгоняла верхнюю.
 * Последствия росли: на 43-м верного ответа на экране почти никогда не было
 * (кнопка одна, ответ из четырёх возможных), на 45-м кнопок не оставалось
 * НИ ОДНОЙ — партия вставала намертво.
 *
 * Теперь потолок держит ОБЕ границы, и между ними всегда остаётся хотя бы три
 * возможных ответа: иначе это уже не счёт, а угадывание одной кнопки.
 */
export function levelParams(level: number): { minN: number; maxN: number; exposureMs: number } {
  const spread = 2 + Math.floor(level / 5);
  const wanted = 3 + Math.floor((level - 1) / 2);
  const maxN = Math.min(MAX_DOTS, wanted + spread);
  const minN = Math.max(2, Math.min(wanted, maxN - 2));
  return { minN, maxN, exposureMs: Math.max(300, 900 - level * 40) };
}

/**
 * Кнопки ответа. Обязаны накрывать ВЕСЬ возможный диапазон плюс запас с обеих
 * сторон — иначе верного ответа на экране может не оказаться.
 */
export function answerChoices(p: { minN: number; maxN: number }): number[] {
  const lo = Math.max(1, p.minN - 2);
  const hi = p.maxN + 2;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

// Раскидать N точек без наложения (rejection sampling, лимит попыток — не зависать).
function scatterDots(n: number, w: number, h: number, r: number): Dot[] {
  const dots: Dot[] = [];
  const pad = r + 8;
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 60 && !placed; attempt++) {
      const x = pad + Math.random() * Math.max(1, w - pad * 2);
      const y = pad + Math.random() * Math.max(1, h - pad * 2);
      const ok = dots.every((d) => Math.hypot(d.x - x, d.y - y) >= r * 2.4);
      if (ok) { dots.push({ x, y }); placed = true; }
    }
    if (!placed) dots.push({ x: pad + Math.random() * Math.max(1, w - pad * 2), y: pad + Math.random() * Math.max(1, h - pad * 2) });
  }
  return dots;
}

export default function QuickCountGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('quick_count');
  const levelRef = useRef(1);
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [bossWon, setBossWon] = useState<boolean | null>(null);
  const [clearedPassed, setClearedPassed] = useState(true);
  const [trial, setTrial] = useState(0);
  const [actualN, setActualN] = useState(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trialRef = useRef(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);

  const fieldW = Math.min(width - 48, 380);
  const fieldH = Math.min(height * 0.4, 320);
  const dotR = 16;

  useEffect(() => {
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, []);

  const startGame = () => {
    levelRef.current = lvl.level;
    correctRef.current = 0; wrongRef.current = 0; trialRef.current = 0;
    setCorrect(0); setWrong(0); setTrial(0); setBossWon(null);
    setStartTime(gameNow());
    runTrial(0);
  };

  const runTrial = (idx: number) => {
    if (idx >= TRIALS_PER_ROUND) { finishRound(); return; }
    const p = levelParams(levelRef.current);
    const n = p.minN + Math.floor(Math.random() * (p.maxN - p.minN + 1));
    setActualN(n);
    setDots(scatterDots(n, fieldW, fieldH, dotR));
    setPhase('flash');
    flashTimerRef.current = setTimeout(() => setPhase('answer'), p.exposureMs);
  };

  const handleAnswer = (guess: number) => {
    if (guess === actualN) { hapticSuccess(); correctRef.current++; setCorrect((c) => c + 1); }
    else { hapticError(); wrongRef.current++; setWrong((w) => w + 1); }
    const next = trialRef.current + 1;
    trialRef.current = next;
    setTrial(next);
    setTimeout(() => runTrial(next), 250);
  };

  const finishRound = async () => {
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    const total = correctRef.current + wrongRef.current;
    const accuracy = total > 0 ? Math.round((correctRef.current / total) * 100) : 0;
    const passed = !isPreset && accuracy >= 80;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    try {
      await saveSession({
        passed,
        game_type: 'quick_count',
        score: correctRef.current * 10 - wrongRef.current * 5,
        time_seconds: finalTime,
        difficulty: `Level ${levelRef.current}`,
        mode: `${TRIALS_PER_ROUND}t`,
        errors: wrongRef.current,
        details: { level: levelRef.current, correct: correctRef.current, wrong: wrongRef.current, accuracy },
      });
    } catch (e) { console.error(e); }
    if (isPreset) {
      setPhase('result');
    } else if (passed && levelRef.current % BOSS_EVERY === 0) {
      setClearedPassed(true);
      setBossWon(null);
      setPhase('boss');   // веха: настоящий босс-раунд (резкая смена правила — go/no-go на подавление)
    } else {
      // непрерывный поток: и прохождение, и недобор порога → общий баннер LevelCleared
      // (passed=false рисует «почти, ещё раз» + авто-рестарт того же уровня, без тупика)
      setClearedPassed(passed);
      setPhase('cleared');
    }
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="flash" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('quickCount')}</Text>
        <Text style={styles.configDesc}>{t('quickCountDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="quickCountIntroDesc" benefits={QUICKCOUNT_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="quick_count" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  // игровые фазы (вспышка и ответ) — на едином каркасе GameShell (кнопки-варианты прибиты к низу)
  if (phase === 'flash' || phase === 'answer') {
    const p = levelParams(levelRef.current);
    const choices = answerChoices(p);
    return (
      <GameShell
        title={t('quickCount')}
        onBack={() => goBackOrHome()}
        /**
         * Счётчики ДАННЫМИ (см. `HudItem`): каркас рисует их одинаково во всех
         * играх, и правка вида приходит сразу везде.
         *
         * ⚠️ Счётчика ошибок здесь нет намеренно: при подстройке сложности ошибки —
         * норма по построению, и красный счётчик наказывает ровно за то, чего
         * требует обучение (§12.4 карты геймификации).
         */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${trial + 1}/${TRIALS_PER_ROUND}` },
          { key: 'hud_correct', icon: 'checkmark-circle', label: t('hud_correct'), value: correct, tone: 'good' as const },
        ]}
        stats={
          phase === 'answer' ? (
            <View style={styles.statsRow} />
          ) : undefined
        }
        toolbar={
          phase === 'answer' ? (
            <View style={styles.choiceGrid}>
              {choices.map((n) => (
                <TouchableOpacity
                  accessibilityRole="button" key={n} style={[styles.choiceBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => handleAnswer(n)}>
                  <Text style={[styles.choiceText, { color: colors.text }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : undefined
        }
      >
        {phase === 'flash' ? (
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('quickCountLookHint')}</Text>
            <View style={[styles.field, { width: fieldW, height: fieldH, backgroundColor: colors.surface }]}>
              {dots.map((d, i) => (
                <View key={i} style={[styles.dot, { left: d.x - dotR, top: d.y - dotR, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: GRADIENT[0] }]} />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('quickCountAnswerHint')}</Text>
            <View style={[styles.field, { width: fieldW, height: fieldH * 0.4, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]} />
          </View>
        )}
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('quickCount')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="quick_count" level={levelRef.current} passed={clearedPassed} stars={bossWon ? 3 : (wrong === 0 ? 3 : wrong <= 2 ? 2 : 1)}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={correct * 10 - wrong * 5} time={elapsedTime} errors={wrong}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
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
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 16 },
  statsRow: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  field: { borderRadius: 16, position: 'relative', overflow: 'hidden' },
  dot: { position: 'absolute' },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 380 },
  choiceBtn: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  choiceText: { fontSize: 18, fontWeight: '700' },
});
