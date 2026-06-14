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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { RUSSIAN_WORDS, ENGLISH_WORDS } from '@/src/constants/games';

const GRADIENT = ['#4facfe', '#00f2fe'];
const PENALTY_SECONDS = 15;

const MNEMONICS_BENEFITS = [
  { icon: 'cart-outline', textKey: 'benefitMnemonics1' },
  { icon: 'call-outline', textKey: 'benefitMnemonics2' },
  { icon: 'list-outline', textKey: 'benefitMnemonics3' },
];

type GamePhase = 'intro' | 'config' | 'memorize' | 'check' | 'result';
type GameMode = 'words' | 'numbers';

export default function MnemonicsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [mode, setMode] = useState<GameMode>(() => (str('mode', 'words') as GameMode));
  const [itemCount, setItemCount] = useState(() => num('itemCount', 10));
  const [items, setItems] = useState<string[]>([]);
  const [shuffledItems, setShuffledItems] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const generateItems = (): string[] => {
    if (mode === 'words') {
      const words = language === 'ru' ? [...RUSSIAN_WORDS] : [...ENGLISH_WORDS];
      // Shuffle
      for (let i = words.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [words[i], words[j]] = [words[j], words[i]];
      }
      return words.slice(0, itemCount);
    } else {
      // Generate random 2-digit numbers
      const numbers: string[] = [];
      const used = new Set<number>();
      while (numbers.length < itemCount) {
        const num = Math.floor(Math.random() * 90) + 10; // 10-99
        if (!used.has(num)) {
          used.add(num);
          numbers.push(num.toString());
        }
      }
      return numbers;
    }
  };

  const startGame = () => {
    const newItems = generateItems();
    setItems(newItems);
    setSelectedOrder([]);
    setErrors(0);
    setPhase('memorize');
    setStartTime(Date.now());
    
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
    }, 100);
  };

  const startCheck = () => {
    // Shuffle items for checking
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setShuffledItems(shuffled);
    setPhase('check');
    
    // Stop timer for single exercises
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleItemSelect = async (item: string) => {
    if (selectedOrder.includes(item)) return;
    
    const expectedIndex = selectedOrder.length;
    const expectedItem = items[expectedIndex];
    
    if (item === expectedItem) {
      // Correct
      const newOrder = [...selectedOrder, item];
      setSelectedOrder(newOrder);
      
      // Check if all items selected
      if (newOrder.length === items.length) {
        const finalTime = elapsedTime + (errors * PENALTY_SECONDS);
        setPhase('result');
        
        try {
          await saveSession({
            game_type: 'mnemonics',
            score: items.length - errors,
            time_seconds: finalTime,
            difficulty: `${itemCount} ${mode}`,
            mode: mode,  // 'words' | 'numbers'
            errors: errors,
            details: {
              hits: items.length - errors,
              errors: errors,
              item_count: items.length,
            },
          });
        } catch (error) {
          console.error('Error saving session:', error);
        }
      }
    } else {
      // Wrong - penalty
      setErrors(prev => prev + 1);
    }
  };

  // Calculate columns and item size based on count
  // For better readability, use fewer columns for words
  const getColumns = () => {
    if (mode === 'words') {
      // Words need more space - always use 2 columns for readability
      return 2;
    }
    if (itemCount <= 10) return 2;
    if (itemCount <= 20) return 3;
    return 4;
  };
  
  const columns = getColumns();
  const itemWidth = (width - 32 - (columns - 1) * 12) / columns;
  // Increased height for better touch targets and larger text
  const itemHeight = mode === 'numbers' ? 100 : 90;

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.configCard}
        >
          <Ionicons name="bulb" size={48} color="#FFFFFF" />
          <Text style={styles.configTitle}>
            {t('label_mnemonics')}
          </Text>
          <Text style={styles.configDesc}>
            {t('desc_mnemonics_short')}
          </Text>
        </LinearGradient>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('desc_mnemonics_rules')}
          </Text>
        </View>

        {/* Mode Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('mode')}
          </Text>
          <View style={styles.optionButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'words' && { backgroundColor: GRADIENT[0] },
                mode !== 'words' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('words')}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={mode === 'words' ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'words' ? '#FFFFFF' : colors.text }]}>
                {t('label_words')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'numbers' && { backgroundColor: GRADIENT[0] },
                mode !== 'numbers' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('numbers')}
            >
              <Ionicons
                name="calculator-outline"
                size={22}
                color={mode === 'numbers' ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'numbers' ? '#FFFFFF' : colors.text }]}>
                {t('catVocab_numbers')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Count Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('label_count')}
          </Text>
          <View style={styles.optionButtons}>
            {[10, 20, 30].map((count) => (
              <TouchableOpacity
                key={count}
                style={[
                  styles.countButton,
                  itemCount === count && { backgroundColor: GRADIENT[0] },
                  itemCount !== count && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setItemCount(count)}
              >
                <Text
                  style={[
                    styles.countButtonText,
                    { color: itemCount === count ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {count}
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

  const renderMemorize = () => (
    <View style={styles.gameContainer}>
      <View style={styles.gameHeader}>
        <View style={[styles.timerBox, { backgroundColor: GRADIENT[0] }]}>
          <Ionicons name="time-outline" size={20} color="#FFFFFF" />
          <Text style={styles.timerText}>{elapsedTime.toFixed(1)}s</Text>
        </View>
      </View>
      
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {language === 'ru' 
          ? `Запомните ${itemCount} ${mode === 'words' ? 'слов' : 'чисел'}`
          : `Memorize ${itemCount} ${mode}`}
      </Text>
      
      <ScrollView style={styles.itemsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.itemsGrid}>
          {items.map((item, index) => (
            <View
              key={index}
              style={[
                styles.itemCell,
                { 
                  width: itemWidth, 
                  height: itemHeight,
                  backgroundColor: colors.surface,
                }
              ]}
            >
              <Text style={[styles.itemNumber, { color: GRADIENT[0] }]}>
                {index + 1}
              </Text>
              <Text style={[styles.itemText, { color: colors.text, fontSize: mode === 'numbers' ? 32 : 24 }]}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      
      <TouchableOpacity style={styles.checkButton} onPress={startCheck}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
          <Text style={styles.startButtonText}>
            {t('btn_check')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderCheck = () => (
    <View style={styles.gameContainer}>
      <View style={styles.statsHeader}>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('time')}</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{elapsedTime.toFixed(1)}s</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('errors')}</Text>
          <Text style={[styles.statValue, { color: errors > 0 ? colors.error : colors.text }]}>
            {errors} (+{errors * PENALTY_SECONDS}s)
          </Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {t('label_selected')}
          </Text>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {selectedOrder.length}/{items.length}
          </Text>
        </View>
      </View>
      
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {t('label_restore_order')}
      </Text>
      <Text style={[styles.phaseSubtitle, { color: colors.textSecondary }]}>
        {t('hint_top_to_bottom')}
      </Text>
      
      <ScrollView style={styles.itemsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.itemsGrid}>
          {shuffledItems.map((item, index) => {
            const isSelected = selectedOrder.includes(item);
            const orderIndex = selectedOrder.indexOf(item);
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.checkItemCell,
                  { 
                    width: itemWidth, 
                    height: itemHeight,
                    backgroundColor: isSelected ? colors.success : colors.surface,
                  }
                ]}
                onPress={() => !isSelected && handleItemSelect(item)}
                disabled={isSelected}
              >
                {isSelected && (
                  <Text style={styles.selectedNumber}>{orderIndex + 1}</Text>
                )}
                <Text style={[
                  styles.checkItemText, 
                  { 
                    color: isSelected ? '#FFFFFF' : colors.text,
                    fontSize: mode === 'numbers' ? 32 : 24,
                  }
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="mnemonics"
          icon="bulb"
          gradient={GRADIENT}
          skillKey="skillSequence"
          descriptionKey="mnemonicsIntroDesc"
          benefits={MNEMONICS_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('label_mnemonics')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'memorize' && renderMemorize()}
      {phase === 'check' && renderCheck()}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime + (errors * PENALTY_SECONDS)}
          score={items.length - errors}
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
  configDesc: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 13, flex: 1 },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap' },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  modeButtonText: { fontSize: 16, fontWeight: '600' },
  countButton: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  countButtonText: { fontSize: 20, fontWeight: '700' },
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
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  timerText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  phaseTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  phaseSubtitle: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  itemsContainer: { flex: 1 },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    paddingBottom: 20,
  },
  itemCell: {
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumber: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  itemText: { fontWeight: '600', textAlign: 'center', fontSize: 24 },
  checkButton: { marginBottom: 16 },
  checkItemCell: {
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
  },
  selectedNumber: {
    position: 'absolute',
    top: 8,
    left: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  checkItemText: { fontWeight: '700', textAlign: 'center', fontSize: 24 },
});
