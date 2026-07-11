/**
 * Counter — «Собери сумму» (устный счёт): сетка чисел, кликами собери заданную сумму.
 *
 * Уровни (persist, по паттерну cpt/simon): ручной селектор размера сетки (3/6/9)
 * заменён на usePersistentLevel('counter') + levelParams. Оси усложнения:
 *   - размер сетки растёт 3×3 → 9×9 (якоря старого селектора 3/6/9 + промежуточные)
 *   - лимит времени на раунд сокращается 15с → 6с (не успел собрать сумму = ошибка-пропуск)
 * Проход уровня: решено ≥80% раундов (8 из 10) → LevelCleared (авто-поток).
 * Звёзды: 0 ошибок (перебор суммы/просрочка) = 3, ≤2 = 2, иначе 1.
 */
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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#fa709a', '#fee140'];

const COUNTER_BENEFITS = [
  { icon: 'cart-outline', textKey: 'benefitCounter1' },
  { icon: 'wallet-outline', textKey: 'benefitCounter2' },
  { icon: 'flash-outline', textKey: 'benefitCounter3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';

interface Cell {
  value: number;
  selected: boolean;
}

// Уровень 1..15: сетка растёт 3×3 → 9×9 (якоря старого ручного селектора 3/6/9),
// лимит времени на раунд в целом сокращается 15с → 6с. Больше клеток = больше
// подходящих пар, поэтому главный пресс сложности — таймер, а не только размер.
const LEVEL_TABLE: { size: number; limitSec: number }[] = [
  { size: 3, limitSec: 15 },  // L1
  { size: 3, limitSec: 12 },  // L2
  { size: 3, limitSec: 9 },   // L3
  { size: 4, limitSec: 12 },  // L4
  { size: 4, limitSec: 9 },   // L5
  { size: 5, limitSec: 12 },  // L6
  { size: 5, limitSec: 9 },   // L7
  { size: 6, limitSec: 11 },  // L8
  { size: 6, limitSec: 8 },   // L9
  { size: 7, limitSec: 10 },  // L10
  { size: 7, limitSec: 8 },   // L11
  { size: 8, limitSec: 9 },   // L12
  { size: 8, limitSec: 7 },   // L13
  { size: 9, limitSec: 8 },   // L14
  { size: 9, limitSec: 6 },   // L15+
];

const TOTAL_ROUNDS = 10;
const PASS_ACCURACY = 0.8;   // решено ≥80% раундов = проход уровня

function levelParams(level: number): { gridSize: number; roundLimitMs: number; rounds: number } {
  const row = LEVEL_TABLE[Math.min(Math.max(level, 1), LEVEL_TABLE.length) - 1];
  return { gridSize: row.size, roundLimitMs: row.limitSec * 1000, rounds: TOTAL_ROUNDS };
}

export default function CounterGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('counter');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [gridSize, setGridSize] = useState(3);
  const [grid, setGrid] = useState<Cell[]>([]);
  const [targetSum, setTargetSum] = useState(0);
  const [selectedSum, setSelectedSum] = useState(0);
  const [score, setScore] = useState(0);          // решённые раунды (hits)
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(TOTAL_ROUNDS);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [roundLeft, setRoundLeft] = useState(0);  // сек до конца текущего раунда
  const [errors, setErrors] = useState(0);        // перебор суммы + просроченные раунды
  const [showSuccess, setShowSuccess] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);

  // Рефы — раундовая цепочка (сетка → дедлайн → следующий раунд) живёт вне
  // ре-рендеров, state в колбэках таймеров был бы устаревшим (паттерн cpt/simon).
  const levelRef = useRef(1);
  const gridSizeRef = useRef(3);
  const roundLimitRef = useRef(15000);
  const totalRoundsRef = useRef(TOTAL_ROUNDS);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const timeoutsRef = useRef(0);
  const startTimeRef = useRef(0);
  const roundDeadlineRef = useRef(0);   // 0 = раунд «на паузе» (success/timeout), отсчёт не тикает

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetSelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    [deadlineTimerRef, pauseTimerRef, resetSelTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []);

  const generateGrid = (gs: number): Cell[] => {
    const totalCells = gs * gs;
    const numbers = Array.from({ length: totalCells }, () =>
      Math.floor(Math.random() * 9) + 1
    );

    // Целевая сумма всегда достижима: сумма 2 случайных клеток
    const idx1 = Math.floor(Math.random() * totalCells);
    let idx2 = Math.floor(Math.random() * totalCells);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * totalCells);
    }

    const target = numbers[idx1] + numbers[idx2];
    setTargetSum(target);
    setSelectedSum(0);
    setShowSuccess(false);
    setShowTimeout(false);

    return numbers.map(value => ({ value, selected: false }));
  };

  // Новый раунд: свежая сетка + дедлайн уровня (не успел = ошибка-пропуск)
  const beginRound = () => {
    setGrid(generateGrid(gridSizeRef.current));
    roundDeadlineRef.current = Date.now() + roundLimitRef.current;
    setRoundLeft(roundLimitRef.current / 1000);
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    deadlineTimerRef.current = setTimeout(onRoundTimeout, roundLimitRef.current);
  };

  const advance = () => {
    if (roundRef.current >= totalRoundsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    beginRound();
  };

  const onRoundTimeout = () => {
    roundDeadlineRef.current = 0;
    setRoundLeft(0);
    timeoutsRef.current += 1;
    errorsRef.current += 1;
    setErrors(errorsRef.current);
    setShowTimeout(true);
    pauseTimerRef.current = setTimeout(advance, 700);
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    gridSizeRef.current = p.gridSize;
    roundLimitRef.current = p.roundLimitMs;
    totalRoundsRef.current = p.rounds;
    setGridSize(p.gridSize);
    setTotalRounds(p.rounds);
    hitsRef.current = 0; errorsRef.current = 0; timeoutsRef.current = 0;
    roundRef.current = 1;
    setScore(0); setErrors(0); setRound(1);
    setElapsedTime(0);
    setPhase('playing');
    startTimeRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - startTimeRef.current) / 1000);
      if (roundDeadlineRef.current > 0) {
        setRoundLeft(Math.max(0, (roundDeadlineRef.current - Date.now()) / 1000));
      }
    }, 100);

    beginRound();
  };

  const finish = async () => {
    clearAllTimers();
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const hits = hitsRef.current;
    const accuracy = totalRoundsRef.current > 0 ? hits / totalRoundsRef.current : 0;
    // Проход уровня: решено ≥80% раундов (просрочка = провал раунда)
    const passed = !isPreset && accuracy >= PASS_ACCURACY;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    setPhase(passed ? 'cleared' : 'result');   // авто-поток к следующему уровню
    try {
      await saveSession({
        game_type: 'counter',
        score: hits,
        time_seconds: finalTime,
        difficulty: `${gridSizeRef.current}x${gridSizeRef.current}`,
        mode: `lvl${levelRef.current}`,
        errors: errorsRef.current,
        details: {
          level: levelRef.current,
          hits,
          errors: errorsRef.current,
          timeouts: timeoutsRef.current,
          grid_size: gridSizeRef.current,
          accuracy: Math.round(accuracy * 100),
          round_limit_ms: roundLimitRef.current,
          n_rounds: totalRoundsRef.current,
        },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  const handleCellPress = (index: number) => {
    if (showSuccess || showTimeout) return; // Клики во время фидбека заблокированы

    const newGrid = [...grid];
    newGrid[index].selected = !newGrid[index].selected;
    setGrid(newGrid);

    const sum = newGrid
      .filter(cell => cell.selected)
      .reduce((acc, cell) => acc + cell.value, 0);
    setSelectedSum(sum);

    if (sum === targetSum) {
      // Верно! Дедлайн стоп, короткий success-фидбек → следующий раунд
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
      roundDeadlineRef.current = 0;
      hitsRef.current += 1;
      setScore(hitsRef.current);
      setShowSuccess(true);
      pauseTimerRef.current = setTimeout(advance, 800);
    } else if (sum > targetSum) {
      // Перебор — ошибка, сброс выбора (функциональный апдейт: клик в 300мс окна не потеряется)
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      resetSelTimerRef.current = setTimeout(() => {
        setGrid(g => g.map(cell => ({ ...cell, selected: false })));
        setSelectedSum(0);
      }, 300);
    }
  };

  // v1.29.3 (мобайл): потолок 90px делал сетку мелкой по центру (3×3 = 76% ширины).
  // Теперь тянется на всю ширину; высотный лимит держит ландшафт/десктоп.
  const cellSize = Math.min(
    (width - 28 - (gridSize - 1) * 8) / gridSize,
    (height - 320 - (gridSize - 1) * 8) / gridSize,
    140
  );

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const passNeed = Math.ceil(p.rounds * PASS_ACCURACY);
    return (
      <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.configContainer}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.configCard}
          >
            <Ionicons name="add-circle" size={48} color="#FFFFFF" />
            <Text style={styles.configTitle}>{t('counter')}</Text>
            <Text style={styles.configDesc}>{t('counterDesc')}</Text>
          </LinearGradient>

          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {t('desc_counter_rules')}
            </Text>
          </View>

          <LevelProgressMap gameId="counter" currentLevel={lvl.level} colors={colors} language={language} />

          {/* Карточка уровня: параметры + видимый критерий прохода + сброс ↺1 */}
          <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center', gap: 6, marginTop: 12 }]}>
            <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
              {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {language === 'ru'
                ? `сетка ${p.gridSize}×${p.gridSize} · ${p.rounds} раундов · ${p.roundLimitMs / 1000} с на раунд`
                : `${p.gridSize}×${p.gridSize} grid · ${p.rounds} rounds · ${p.roundLimitMs / 1000}s per round`}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
              {language === 'ru'
                ? `Проход уровня: собрать сумму в ≥${passNeed} из ${p.rounds} раундов до конца времени`
                : `To pass: hit the target sum in ≥${passNeed} of ${p.rounds} rounds before time runs out`}
            </Text>
            {lvl.level > 1 && (
              <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
              </TouchableOpacity>
            )}
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
  };

  const renderGame = () => (
    <View style={styles.gameContainer}>
      {/* Target Sum - Big and Clear */}
      <View style={[styles.targetContainer, { backgroundColor: showSuccess ? colors.success : showTimeout ? colors.error : GRADIENT[0] }]}>
        <Text style={styles.targetLabel}>
          {t('label_find_sum')}
        </Text>
        <Text style={styles.targetValue}>{targetSum}</Text>
      </View>

      {/* Current Sum Display */}
      <View style={[styles.sumDisplay, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>
          {t('label_your_sum')}
        </Text>
        <Text style={[
          styles.sumValue,
          { color: showSuccess ? colors.success : selectedSum > targetSum ? colors.error : colors.text }
        ]}>
          {selectedSum}
        </Text>
        {showSuccess && (
          <View style={[styles.successBadge, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
            <Text style={styles.successText}>
              {t('label_correct_excl')}
            </Text>
          </View>
        )}
        {showTimeout && (
          <View style={[styles.successBadge, { backgroundColor: colors.error }]}>
            <Ionicons name="time-outline" size={24} color="#FFFFFF" />
            <Text style={styles.successText}>
              {language === 'ru' ? 'Время вышло' : 'Time is up'}
            </Text>
          </View>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {t('round')}
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{round}/{totalRounds}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {language === 'ru' ? 'Осталось' : 'Time left'}
          </Text>
          <Text style={[styles.statValue, { color: roundLeft <= 3 ? colors.error : colors.text }]}>
            {roundLeft.toFixed(1)}{language === 'ru' ? 'с' : 's'}
          </Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('errors')}</Text>
          <Text style={[styles.statValue, { color: errors > 0 ? colors.error : colors.text }]}>{errors}</Text>
        </View>
      </View>

      {/* Grid */}
      <View style={styles.gridContainer}>
        <View style={[
          styles.grid,
          { width: cellSize * gridSize + (gridSize - 1) * 8 }
        ]}>
          {grid.map((cell, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.cell,
                {
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: cell.selected
                    ? (showSuccess ? colors.success : GRADIENT[0])
                    : colors.surface,
                  borderWidth: cell.selected ? 3 : 0,
                  borderColor: showSuccess ? colors.success : GRADIENT[0],
                },
              ]}
              onPress={() => handleCellPress(index)}
              activeOpacity={0.7}
              disabled={showSuccess || showTimeout}
            >
              <Text
                style={[
                  styles.cellText,
                  {
                    fontSize: Math.min(cellSize * 0.45, 32),
                    color: cell.selected ? '#FFFFFF' : colors.text,
                  },
                ]}
              >
                {cell.value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="counter"
          icon="add-circle"
          gradient={GRADIENT}
          skillKey="skillMath"
          descriptionKey="counterIntroDesc"
          benefits={COUNTER_BENEFITS}
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
        <Text style={[styles.title, { color: colors.text }]}>{t('counter')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderGame()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="counter"
          level={levelRef.current}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
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
          score={score}
          errors={errors}
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
  configContainer: { paddingHorizontal: 16, marginBottom: 16, paddingBottom: 20 },
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
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 14, flex: 1 },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  startButton: { marginTop: 10 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 8,
  },
  startButtonText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  gameContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  targetContainer: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  targetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  targetValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sumDisplay: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sumLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  sumValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 6,
  },
  successText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  gridContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  cell: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: { fontWeight: '700' },
});
