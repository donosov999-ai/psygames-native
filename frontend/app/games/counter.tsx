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

const GRADIENT = ['#fa709a', '#fee140'];

const COUNTER_BENEFITS = [
  { icon: 'cart-outline', textKey: 'benefitCounter1' },
  { icon: 'wallet-outline', textKey: 'benefitCounter2' },
  { icon: 'flash-outline', textKey: 'benefitCounter3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

interface Cell {
  value: number;
  selected: boolean;
}

export default function CounterGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [gridSize, setGridSize] = useState(3);
  const [grid, setGrid] = useState<Cell[]>([]);
  const [targetSum, setTargetSum] = useState(0);
  const [selectedSum, setSelectedSum] = useState(0);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [totalRounds] = useState(10);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const generateGrid = () => {
    const totalCells = gridSize * gridSize;
    const numbers = Array.from({ length: totalCells }, () => 
      Math.floor(Math.random() * 9) + 1
    );
    
    // Generate valid target sum (sum of 2 random cells)
    const idx1 = Math.floor(Math.random() * totalCells);
    let idx2 = Math.floor(Math.random() * totalCells);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * totalCells);
    }
    
    const target = numbers[idx1] + numbers[idx2];
    setTargetSum(target);
    setSelectedSum(0);
    setShowSuccess(false);
    
    return numbers.map(value => ({ value, selected: false }));
  };

  const startGame = () => {
    setGrid(generateGrid());
    setScore(0);
    setRound(1);
    setErrors(0);
    setPhase('playing');
    setStartTime(Date.now());
    
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
    }, 100);
  };

  const handleCellPress = (index: number) => {
    if (showSuccess) return; // Prevent clicks during success animation
    
    const newGrid = [...grid];
    newGrid[index].selected = !newGrid[index].selected;
    setGrid(newGrid);
    
    const sum = newGrid
      .filter(cell => cell.selected)
      .reduce((acc, cell) => acc + cell.value, 0);
    setSelectedSum(sum);
    
    if (sum === targetSum) {
      // Correct! Show success feedback
      setShowSuccess(true);
      const newScore = score + 1;
      setScore(newScore);

      // Wait to show success, then next round. Передаём СВЕЖИЙ счёт: nextRound вызывается из
      // таймера и читал бы score из устаревшего замыкания → сохранённый счёт терял последний раунд.
      setTimeout(() => {
        nextRound(newScore);
      }, 800);
    } else if (sum > targetSum) {
      // Wrong, reset selection
      setErrors(prev => prev + 1);
      setTimeout(() => {
        setGrid(grid.map(cell => ({ ...cell, selected: false })));
        setSelectedSum(0);
      }, 300);
    }
  };

  const nextRound = async (finalScore: number) => {
    if (round >= totalRounds) {
      // Game complete
      if (timerRef.current) clearInterval(timerRef.current);
      const finalTime = (Date.now() - startTime) / 1000;
      setElapsedTime(finalTime);
      setPhase('result');
      
      try {
        await saveSession({
          game_type: 'counter',
          score: finalScore,
          time_seconds: finalTime,
          difficulty: `${gridSize}x${gridSize}`,
          errors: errors,
          details: { hits: finalScore, errors, grid_size: gridSize },
        });
      } catch (error) {
        console.error('Error saving session:', error);
      }
    } else {
      setRound(prev => prev + 1);
      setGrid(generateGrid());
    }
  };

  // v1.29.3 (мобайл): потолок 90px делал сетку мелкой по центру (3×3 = 76% ширины).
  // Теперь тянется на всю ширину; высотный лимит держит ландшафт/десктоп.
  const cellSize = Math.min(
    (width - 28 - (gridSize - 1) * 8) / gridSize,
    (height - 320 - (gridSize - 1) * 8) / gridSize,
    140
  );

  const renderConfig = () => (
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

        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('size')}</Text>
          <View style={styles.optionButtons}>
            {[3, 6, 9].map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.sizeButton,
                  gridSize === size && { backgroundColor: GRADIENT[0] },
                  gridSize !== size && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setGridSize(size)}
              >
                <Text
                  style={[
                    styles.sizeButtonText,
                    { color: gridSize === size ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {size}x{size}
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

  const renderGame = () => (
    <View style={styles.gameContainer}>
      {/* Target Sum - Big and Clear */}
      <View style={[styles.targetContainer, { backgroundColor: showSuccess ? colors.success : GRADIENT[0] }]}>
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
              disabled={showSuccess}
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
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('counter')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderGame()}
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
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap' },
  sizeButton: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  sizeButtonText: { fontSize: 18, fontWeight: '600' },
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
