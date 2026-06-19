import React, { useState, useEffect, useRef } from 'react';
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
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#ff0844', '#ffb199'];

const TARGETS_BENEFITS = [
  { icon: 'car-outline', textKey: 'benefitTargets1' },
  { icon: 'football-outline', textKey: 'benefitTargets2' },
  { icon: 'flash-outline', textKey: 'benefitTargets3' },
];

type GamePhase = 'intro' | 'config' | 'ready' | 'playing' | 'result';
type GameMode = 'field' | 'joker';

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];

// Level configs: delay in ms
const LEVEL_DELAYS = [2000, 1800, 1600, 1400, 1200, 1000, 900, 800, 700, 600];

export default function TargetsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [mode, setMode] = useState<GameMode>(() => (str('mode', 'field') as GameMode));
  const [level, setLevel] = useState(() => num('level', 1));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [round, setRound] = useState(0);
  const [isTarget, setIsTarget] = useState(false);
  const [shapes, setShapes] = useState<{ type: 'circle' | 'square'; color: string }[]>([]);
  const [prevCircleColor, setPrevCircleColor] = useState<string | null>(null);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [showTime, setShowTime] = useState(0);
  const [feedback, setFeedback] = useState<'hit' | 'miss' | 'wrong' | null>(null);
  const [gameOver, setGameOver] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundsPerLevel = 10;

  // Рефы для значений, читаемых из таймерных колбэков (фикс stale-closure).
  // generateRound/nextRound/handleMiss вызываются из setTimeout со СТАРЫМ замыканием,
  // поэтому level/round «застревали» и потом скакали (2→9). Источник истины — рефы,
  // state (setLevel/setRound/...) остаётся только для рендера HUD.
  const levelRef = useRef(level);
  const roundRef = useRef(0);
  const livesRef = useRef(3);
  const gameOverRef = useRef(false);
  const isTargetRef = useRef(false);
  const prevColorRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const getLifeBonus = (lvl: number): number => {
    if (lvl <= 3) return 1;
    if (lvl <= 6) return 3;
    return 5;
  };

  const generateRound = () => {
    if (gameOverRef.current) return;

    const newShapes: { type: 'circle' | 'square'; color: string }[] = [];
    
    // Generate circle
    const circleColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    newShapes.push({ type: 'circle', color: circleColor });
    
    // Generate two squares
    const sq1Color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const sq2Color = COLORS[Math.floor(Math.random() * COLORS.length)];
    
    newShapes.push({ type: 'square', color: sq1Color });
    newShapes.push({ type: 'square', color: sq2Color });
    
    // Determine if this is a target
    let target = false;
    
    if (mode === 'field') {
      // Field mode: target if TWO of THREE shapes have same color
      if (circleColor === sq1Color || circleColor === sq2Color || sq1Color === sq2Color) {
        target = true;
      }
    } else {
      // Joker mode: target if previous circle color matches current square color
      if (prevColorRef.current && (prevColorRef.current === sq1Color || prevColorRef.current === sq2Color)) {
        target = true;
      }
    }
    
    prevColorRef.current = circleColor;
    isTargetRef.current = target;
    setPrevCircleColor(circleColor);
    setShapes(newShapes);
    setIsTarget(target);
    setShowTime(Date.now());

    // Auto-advance after delay (по СВЕЖЕМУ уровню из рефа, не из stale-замыкания)
    const delay = LEVEL_DELAYS[levelRef.current - 1];
    // Передаём СВЕЖИЙ target в таймаут: handleMiss из этого замыкания читал бы stale isTarget
    // (значение ПРОШЛОГО раунда — setIsTarget ещё не применился) → снимал жизнь на НЕ-мишени,
    // если прошлый раунд был мишенью. Теперь решение по факту текущего раунда.
    timerRef.current = setTimeout(() => {
      handleMiss(target);
    }, delay);
  };

  const startGame = () => {
    setScore(0);
    livesRef.current = 3 + getLifeBonus(level);
    setLives(livesRef.current);
    roundRef.current = 0;
    setRound(0);
    levelRef.current = level;        // стартовый уровень из конфига
    gameOverRef.current = false;
    isTargetRef.current = false;
    prevColorRef.current = null;
    setReactionTimes([]);
    setPrevCircleColor(null);
    setGameOver(false);
    setFeedback(null);
    setPhase('ready');
  };

  const beginRounds = () => {
    setPhase('playing');
    setTimeout(() => {
      generateRound();
    }, 500);
  };

  const handleClick = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (gameOverRef.current) return;

    const reactionTime = Date.now() - showTime;

    if (isTargetRef.current) {
      // Correct hit!
      setFeedback('hit');
      setReactionTimes(prev => [...prev, reactionTime]);

      // Calculate points
      const delay = LEVEL_DELAYS[levelRef.current - 1];
      const points = Math.floor((levelRef.current * levelRef.current) * Math.max(0, delay - reactionTime) / 100);
      setScore(prev => prev + points);
    } else {
      // Wrong click
      setFeedback('wrong');
      livesRef.current -= 1;
      setLives(livesRef.current);

      if (livesRef.current <= 0) {
        gameOverRef.current = true;
        setGameOver(true);
        setTimeout(() => {
          endGame();
        }, 500);
        return;
      }
    }

    setTimeout(() => {
      setFeedback(null);
      if (!gameOverRef.current) {
        nextRound();
      }
    }, 300);
  };

  const handleMiss = (wasTarget: boolean) => {
    if (gameOverRef.current) return;

    if (wasTarget) {
      // Missed a target
      setFeedback('miss');
      livesRef.current -= 1;
      setLives(livesRef.current);

      if (livesRef.current <= 0) {
        gameOverRef.current = true;
        setGameOver(true);
        setTimeout(() => {
          endGame();
        }, 500);
        return;
      }

      setTimeout(() => {
        setFeedback(null);
        nextRound();
      }, 300);
    } else {
      // Correctly didn't click on non-target
      nextRound();
    }
  };

  const nextRound = () => {
    if (gameOverRef.current) return;

    roundRef.current += 1;

    if (roundRef.current >= roundsPerLevel) {
      // Уровень пройден — следующий (равномерно, каждые 10 раундов)
      if (levelRef.current < 10) {
        levelRef.current += 1;
        roundRef.current = 0;
        livesRef.current += getLifeBonus(levelRef.current);
        setLevel(levelRef.current);
        setLives(livesRef.current);
        setRound(0);
      } else {
        // Все уровни пройдены
        gameOverRef.current = true;
        setGameOver(true);
        endGame();
        return;
      }
    } else {
      setRound(roundRef.current);
    }

    setTimeout(() => {
      if (!gameOverRef.current) {
        generateRound();
      }
    }, 200);
  };

  const endGame = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    
    const avgReaction = reactionTimes.length > 0
      ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
      : 0;
    // Standard deviation of RT — variability marker (higher std = more attention drift)
    const rtVariance = reactionTimes.length > 1
      ? reactionTimes.reduce((s, rt) => s + Math.pow(rt - avgReaction, 2), 0) / reactionTimes.length
      : 0;
    const rtStd = Math.sqrt(rtVariance);

    try {
      await saveSession({
        game_type: 'targets',
        score: score,
        time_seconds: avgReaction / 1000,
        difficulty: `Level ${levelRef.current}`,
        mode: mode,
        errors: 0,
        details: {
          hits: reactionTimes.length,
          mean_rt: Math.round(avgReaction),
          std_rt: Math.round(rtStd),
          n_targets: reactionTimes.length,
        },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
    
    setPhase('result');
  };

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

  const renderGame = () => (
    <View style={styles.gameContainer}>
      {/* Header */}
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

      {/* Click Button */}
      <TouchableOpacity 
        style={styles.clickButton}
        onPress={handleClick}
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

      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {t('hint_targets_tap_if')}
      </Text>
    </View>
  );

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
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('targets')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'ready' && renderReady()}
      {phase === 'playing' && renderGame()}
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
  gameContainer: { flex: 1, paddingHorizontal: 16 },
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
  clickButton: {
    marginBottom: 12,
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
