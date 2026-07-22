import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  ScrollView,
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
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';

const GRADIENT = ['#ff0844', '#ffb199'];

const TARGETS_BENEFITS = [
  { icon: 'car-outline', textKey: 'benefitTargets1' },
  { icon: 'football-outline', textKey: 'benefitTargets2' },
  { icon: 'flash-outline', textKey: 'benefitTargets3' },
];

type GamePhase = 'intro' | 'config' | 'ready' | 'playing' | 'result';
type GameMode = 'field' | 'joker';

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];

// Уровень (1..15+): темп появления↑ (delay↓) + число квадратов↑ (труднее найти совпадение). Размер цели↓ — фаза 2.
function levelParams(level: number): { delay: number; numSquares: number } {
  const delay = Math.max(450, 2100 - level * 120);          // L1≈1980мс → L14≈450мс
  const numSquares = 2 + Math.floor((level - 1) / 4);        // L1-4=2 → L5-8=3 → L9-12=4 → L13+=5
  return { delay, numSquares };
}

export default function TargetsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('targets');   // персист достигнутого уровня (раньше сбрасывался)
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [mode, setMode] = useState<GameMode>(() => (str('mode', 'field') as GameMode));
  const [level, setLevel] = useState(() => num('level', 1));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  // Рендерится только то, что реально видно на экране. Раньше тут же жили
  // round/isTarget/showTime/gameOver — в JSX они НЕ используются, но каждый setState
  // гонял лишний ре-рендер игрового поля (LinearGradient + фигуры) по 4 раза за раунд.
  // Их значения переехали в рефы ниже (см. levelRef/isTargetRef/showTimeRef/gameOverRef).
  const [shapes, setShapes] = useState<{ type: 'circle' | 'square'; color: string }[]>([]);
  const [prevCircleColor, setPrevCircleColor] = useState<string | null>(null);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'hit' | 'miss' | 'wrong' | null>(null);

  const roundsPerLevel = 10;

  // Рефы для значений, читаемых из таймерных колбэков (фикс stale-closure).
  // generateRound/nextRound/handleMiss вызываются из setTimeout со СТАРЫМ замыканием,
  // поэтому level/round «застревали» и потом скакали (2→9). Источник истины — рефы,
  // state (setLevel/setLives/...) остаётся только для рендера HUD.
  const levelRef = useRef(level);
  const roundRef = useRef(0);
  const livesRef = useRef(3);
  const gameOverRef = useRef(false);
  const isTargetRef = useRef(false);
  const prevColorRef = useRef<string | null>(null);
  const showTimeRef = useRef(0);                 // момент показа стимула — нужен только для RT, не для рендера
  const scoreRef = useRef(0);                    // endGame зовётся из setTimeout → state в его замыкании отстаёт
  const rtRef = useRef<number[]>([]);            // на последний хит; в БД уходили бы старые очки/RT

  // ── ОДИН слот таймера на весь игровой цикл ──────────────────────────────────
  // ЗАЧЕМ: цикл строго последовательный (показ → ответ/промах → пауза → показ),
  // одновременно живых шагов не бывает. Раньше в timerRef хранился ТОЛЬКО таймер
  // авто-промаха, а таймауты фидбэка (300мс), паузы между раундами (200мс) и старта
  // (500мс) не хранились нигде и не отменялись. Итог: тап в паузе между раундами
  // (или дабл-тап по «НАЧАТЬ») запускал ВТОРУЮ независимую цепочку generateRound,
  // и дальше два-три цикла крутились параллельно — каждый со своим таймером и своим
  // раундом. Отсюда и репорты: цвета/крестик «мигают», а темп «ускоряется» к концу
  // уровня (цепочки копятся по ходу уровня и никогда не схлопываются).
  // Единственный слот делает лишнюю цепочку невозможной: новый шаг отменяет прошлый.
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);              // размонтировали/ушли назад — таймеры молчат
  const roundLiveRef = useRef(false);            // стимул на экране и ещё не отвечен

  const clearAllTimers = () => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const schedule = (fn: () => void, ms: number) => {
    clearAllTimers();
    stepTimerRef.current = setTimeout(() => {
      stepTimerRef.current = null;
      if (stoppedRef.current) return;
      fn();
    }, ms);
  };

  useEffect(() => () => { stoppedRef.current = true; clearAllTimers(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const getLifeBonus = (lvl: number): number => {
    if (lvl <= 3) return 1;
    if (lvl <= 6) return 3;
    return 5;
  };

  const generateRound = () => {
    if (stoppedRef.current || gameOverRef.current) return;

    const newShapes: { type: 'circle' | 'square'; color: string }[] = [];
    
    // Generate circle
    const circleColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    newShapes.push({ type: 'circle', color: circleColor });
    
    // Generate N squares (число растёт с уровнем)
    const ns = levelParams(levelRef.current).numSquares;
    const squareColors = Array.from({ length: ns }, () => COLORS[Math.floor(Math.random() * COLORS.length)]);
    squareColors.forEach((c) => newShapes.push({ type: 'square', color: c }));

    // Determine if this is a target
    let target = false;
    if (mode === 'field') {
      // Field: target если есть ЛЮБОЕ совпадение цвета среди {круг, квадраты}
      const all = [circleColor, ...squareColors];
      target = new Set(all).size < all.length;
    } else {
      // Joker: target если цвет ПРЕДЫДУЩЕГО круга встречается среди квадратов
      target = !!prevColorRef.current && squareColors.includes(prevColorRef.current);
    }
    
    prevColorRef.current = circleColor;
    isTargetRef.current = target;
    showTimeRef.current = Date.now();
    roundLiveRef.current = true;        // с этого момента тап засчитывается (см. handleClick)
    // Один синхронный блок = один ре-рендер поля (React 18+ батчит), фигуры не «моргают»
    setPrevCircleColor(circleColor);
    setShapes(newShapes);

    // Auto-advance after delay (по СВЕЖЕМУ уровню из рефа, не из stale-замыкания)
    const delay = levelParams(levelRef.current).delay;
    // Передаём СВЕЖИЙ target в таймаут: handleMiss из этого замыкания читал бы stale isTarget
    // (значение ПРОШЛОГО раунда — setIsTarget ещё не применился) → снимал жизнь на НЕ-мишени,
    // если прошлый раунд был мишенью. Теперь решение по факту текущего раунда.
    schedule(() => handleMiss(target), delay);
  };

  const startGame = () => {
    clearAllTimers();                   // «Играть снова» не должно наследовать таймер прошлой партии
    stoppedRef.current = false;
    roundLiveRef.current = false;
    const startLvl = isPreset ? level : Math.max(level, lvl.level);   // старт с сохранённого уровня
    if (!isPreset) setLevel(startLvl);
    scoreRef.current = 0;
    setScore(0);
    livesRef.current = 3 + getLifeBonus(startLvl);
    setLives(livesRef.current);
    roundRef.current = 0;
    levelRef.current = startLvl;        // стартовый уровень (сохранённый или из конфига)
    gameOverRef.current = false;
    isTargetRef.current = false;
    prevColorRef.current = null;
    rtRef.current = [];
    setReactionTimes([]);
    setPrevCircleColor(null);
    setShapes([]);
    setFeedback(null);
    setPhase('ready');
  };

  const beginRounds = () => {
    setPhase('playing');
    // через общий слот: дабл-тап по «НАЧАТЬ» больше не даёт двух параллельных циклов
    schedule(generateRound, 500);
  };

  const handleClick = () => {
    // ЗАЧЕМ roundLiveRef: тап засчитывается ТОЛЬКО пока стимул на экране и не отвечен.
    // Раньше тап в паузе между раундами (200/300мс) читал isTargetRef ПРОШЛОГО раунда —
    // фантомный «хит» с завышенным RT или потеря жизни ни за что — и вдобавок заводил
    // вторую цепочку таймеров. На высоких уровнях (delay 450мс) в паузы попадали
    // постоянно → мигание цветов и «ускорение» ближе к концу уровня.
    if (stoppedRef.current || gameOverRef.current || !roundLiveRef.current) return;
    roundLiveRef.current = false;
    clearAllTimers();                                  // снять авто-промах текущего раунда

    const reactionTime = Date.now() - showTimeRef.current;

    if (isTargetRef.current) {
      // Correct hit!
      setFeedback('hit');
      rtRef.current = [...rtRef.current, reactionTime];
      setReactionTimes(rtRef.current);

      // Calculate points
      const delay = levelParams(levelRef.current).delay;
      const points = Math.floor((levelRef.current * levelRef.current) * Math.max(0, delay - reactionTime) / 100);
      scoreRef.current += points;
      setScore(scoreRef.current);
    } else {
      // Wrong click
      setFeedback('wrong');
      livesRef.current -= 1;
      setLives(livesRef.current);

      if (livesRef.current <= 0) {
        gameOverRef.current = true;
        schedule(endGame, 500);
        return;
      }
    }

    schedule(() => {
      setFeedback(null);
      nextRound();
    }, 300);
  };

  const handleMiss = (wasTarget: boolean) => {
    if (stoppedRef.current || gameOverRef.current) return;
    roundLiveRef.current = false;                      // окно ответа закрыто

    if (wasTarget) {
      // Missed a target
      setFeedback('miss');
      livesRef.current -= 1;
      setLives(livesRef.current);

      if (livesRef.current <= 0) {
        gameOverRef.current = true;
        schedule(endGame, 500);
        return;
      }

      schedule(() => {
        setFeedback(null);
        nextRound();
      }, 300);
    } else {
      // Correctly didn't click on non-target
      nextRound();
    }
  };

  const nextRound = () => {
    if (stoppedRef.current || gameOverRef.current) return;

    roundRef.current += 1;

    if (roundRef.current >= roundsPerLevel) {
      // Уровень пройден — следующий (равномерно, каждые 10 раундов)
      if (levelRef.current < 15) {
        levelRef.current += 1;
        roundRef.current = 0;
        livesRef.current += getLifeBonus(levelRef.current);
        setLevel(levelRef.current);
        if (!isPreset) lvl.reach(levelRef.current);   // сохранить достигнутый уровень между сессиями
        setLives(livesRef.current);
      } else {
        // Все уровни пройдены
        gameOverRef.current = true;
        endGame();
        return;
      }
    }

    schedule(generateRound, 200);
  };

  const endGame = async () => {
    clearAllTimers();
    roundLiveRef.current = false;

    // Из рефов, а не из state: endGame запускается через setTimeout(500) и его
    // замыкание относится к рендеру ДО последнего setScore/setReactionTimes —
    // в БД улетали очки и RT без последнего попадания.
    const rts = rtRef.current;
    const avgReaction = rts.length > 0
      ? rts.reduce((a, b) => a + b, 0) / rts.length
      : 0;
    // Standard deviation of RT — variability marker (higher std = more attention drift)
    const rtVariance = rts.length > 1
      ? rts.reduce((s, rt) => s + Math.pow(rt - avgReaction, 2), 0) / rts.length
      : 0;
    const rtStd = Math.sqrt(rtVariance);

    try {
      await saveSession({
        game_type: 'targets',
        score: scoreRef.current,
        time_seconds: avgReaction / 1000,
        difficulty: `Level ${levelRef.current}`,
        mode: mode,
        errors: 0,
        details: {
          hits: rts.length,
          mean_rt: Math.round(avgReaction),
          std_rt: Math.round(rtStd),
          n_targets: rts.length,
        },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
    
    setPhase('result');
  };

  // Кнопка «МИШЕНЬ!» статична, но лежит в том же поддереве, что и фигуры/HUD,
  // и раньше пересобиралась (вместе с LinearGradient) на КАЖДЫЙ setState раунда.
  // Стабильный onPress + useMemo → тяжёлый градиент рендерится один раз за партию,
  // а не 4 раза за раунд. handleClick читается через реф, поэтому не устаревает.
  const handleClickRef = useRef(handleClick);
  handleClickRef.current = handleClick;
  const onTargetPress = useCallback(() => handleClickRef.current(), []);
  const clickButton = useMemo(() => (
    <TouchableOpacity
      style={styles.clickButton}
      onPress={onTargetPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={GRADIENT as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.clickButtonGradient}
      >
        <Text style={styles.clickButtonText}>
          {t('label_target_excl')}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  ), [onTargetPress, t]);

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.configCard}
        >
          <Ionicons name="disc" size={48} color="#FFFFFF" />
          <Text style={styles.configTitle}>{t('targets')}</Text>
          <Text style={styles.configDesc}>{t('targetsDesc')}</Text>
        </LinearGradient>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('desc_targets')}
          </Text>
        </View>

        {/* Mode Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
          <View style={styles.optionButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'field' && { backgroundColor: GRADIENT[0] },
                mode !== 'field' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('field')}
            >
              <Ionicons
                name="grid-outline"
                size={20}
                color={mode === 'field' ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'field' ? '#FFFFFF' : colors.text }]}>
                {t('field')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'joker' && { backgroundColor: GRADIENT[0] },
                mode !== 'joker' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('joker')}
            >
              <Ionicons
                name="sparkles-outline"
                size={20}
                color={mode === 'joker' ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'joker' ? '#FFFFFF' : colors.text }]}>
                {t('joker')}
              </Text>
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.modeHint, { color: colors.textSecondary }]}>
            {mode === 'field'
              ? t('hint_targets_field')
              : t('hint_targets_joker')
            }
          </Text>
        </View>

        {/* Level Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
          <View style={styles.levelButtons}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
              <TouchableOpacity
                key={lvl}
                style={[
                  styles.levelButton,
                  level === lvl && { backgroundColor: GRADIENT[0] },
                  level !== lvl && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setLevel(lvl)}
              >
                <Text
                  style={[
                    styles.levelButtonText,
                    { color: level === lvl ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {lvl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.startButton} onPress={startGame}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startButtonGradient}
          >
            <Ionicons name="play" size={24} color="#FFFFFF" />
            <Text style={styles.startButtonText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderReady = () => (
    <View style={styles.readyContainer}>
      <Text style={[styles.readyTitle, { color: colors.text }]}>
        {t('label_ready')}
      </Text>
      <Text style={[styles.readyHint, { color: colors.textSecondary }]}>
        {t('hint_targets_press')}
      </Text>
      
      <TouchableOpacity style={styles.startButton} onPress={beginRounds}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Text style={styles.startButtonText}>
            {t('btn_start_caps')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  // playing-фаза — на едином каркасе GameShell (кнопочная миграция: поле тапов не скроллится,
  // мемоизированная кнопка «МИШЕНЬ!» прибита к низу в тулбаре)
  const renderGame = () => (
    <GameShell
      title={t('targets')}
      onBack={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}
      stats={
        <View style={styles.gameHeader}>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('level')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{level}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('score')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{score}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('label_lives')}
            </Text>
            <Text style={[styles.statValue, { color: lives <= 2 ? colors.error : colors.text }]}>
              {lives}
            </Text>
          </View>
        </View>
      }
      toolbar={clickButton}
    >
      <View style={styles.fieldCol}>
        {/* Shapes Display */}
        <View style={[styles.shapesArea, { backgroundColor: colors.surface }]}>
          {feedback && (
            <View style={[
              styles.feedbackBadge,
              { backgroundColor: feedback === 'hit' ? colors.success : colors.error }
            ]}>
              <Ionicons
                name={feedback === 'hit' ? 'checkmark' : 'close'}
                size={28}
                color="#FFFFFF"
              />
            </View>
          )}

          <View style={styles.shapesRow}>
            {shapes.map((shape, index) => (
              <View
                key={index}
                style={[
                  shape.type === 'circle' ? styles.circle : styles.square,
                  { backgroundColor: shape.color }
                ]}
              />
            ))}
          </View>

          {mode === 'joker' && prevCircleColor && (
            <View style={styles.prevCircleHint}>
              <Text style={[styles.prevCircleLabel, { color: colors.textSecondary }]}>
                {t('label_prev_circle')}
              </Text>
              <View style={[styles.miniCircle, { backgroundColor: prevCircleColor }]} />
            </View>
          )}
        </View>

        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {t('hint_targets_tap_if')}
        </Text>
      </View>
    </GameShell>
  );

  if (phase === 'playing') return renderGame();

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="targets"
          icon="disc"
          gradient={GRADIENT}
          skillKey="skillReaction"
          descriptionKey="targetsIntroDesc"
          benefits={TARGETS_BENEFITS}
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
          onPress={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('targets')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'ready' && renderReady()}
      {phase === 'result' && (
        <GameResult
          time={reactionTimes.length > 0 
            ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length / 1000 
            : 0}
          score={score}
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
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700' },
  placeholder: { width: 44 },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 12, paddingBottom: 20 },
  configCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  configTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  configDesc: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 13, flex: 1 },
  optionCard: { padding: 14, borderRadius: 16 },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  optionButtons: { flexDirection: 'row' },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 6,
  },
  modeButtonText: { fontSize: 15, fontWeight: '600' },
  modeHint: { fontSize: 12, textAlign: 'center' },
  levelButtons: { flexDirection: 'row', flexWrap: 'wrap' },
  levelButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelButtonText: { fontSize: 16, fontWeight: '600' },
  startButton: { marginTop: 10 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 8,
  },
  startButtonText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  readyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  readyTitle: { fontSize: 32, fontWeight: '800', marginBottom: 16 },
  readyHint: { fontSize: 16, textAlign: 'center', marginBottom: 40 },
  // Колонка поля: растянута на всё поле каркаса (оно центрирует и не тянет детей по ширине)
  fieldCol: { flex: 1, alignSelf: 'stretch' },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  shapesArea: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  feedbackBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shapesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 24,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  square: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  prevCircleHint: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  prevCircleLabel: { fontSize: 14 },
  miniCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  // В тулбаре каркаса: тянется на всю ширину ряда (нижний отступ даёт сам тулбар)
  clickButton: {
    flex: 1,
  },
  clickButtonGradient: {
    paddingVertical: 22,
    borderRadius: 16,
    alignItems: 'center',
  },
  clickButtonText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hintText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
});
