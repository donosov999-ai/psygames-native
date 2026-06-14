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
import { SCRIPTS, SCRIPT_IDS, ScriptId } from '@/src/constants/scripts';

const GRADIENT = ['#a8edea', '#fed6e3'];

const PROOFREADING_BENEFITS = [
  { icon: 'document-text-outline', textKey: 'benefitProofreading1' },
  { icon: 'eye-outline', textKey: 'benefitProofreading2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitProofreading3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

export default function ProofreadingGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [rows, setRows] = useState(() => num('rows', 14));
  const [cols, setCols] = useState(() => num('cols', 12));
  const [mode, setMode] = useState<ScriptId | 'digits'>(() => (str('mode', language === 'ru' ? 'cyrillic' : 'latin') as ScriptId | 'digits'));
  const [wrongFlash, setWrongFlash] = useState<number | null>(null);
  const [grid, setGrid] = useState<string[]>([]);
  const [targetLetters, setTargetLetters] = useState<string[]>([]);
  const [foundIndices, setFoundIndices] = useState<Set<number>>(new Set());
  const [targetIndices, setTargetIndices] = useState<Set<number>>(new Set());
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const generateGrid = () => {
    const alphabet = mode === 'digits' ? '0123456789' : SCRIPTS[mode].chars;
    const totalCells = rows * cols;
    
    // Generate random letters
    const letters = Array.from({ length: totalCells }, () => 
      alphabet[Math.floor(Math.random() * alphabet.length)]
    );
    
    // Select 2 target letters
    const targets = [
      alphabet[Math.floor(Math.random() * alphabet.length)],
      alphabet[Math.floor(Math.random() * alphabet.length)],
    ];
    while (targets[1] === targets[0]) {
      targets[1] = alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    
    // Find all indices where target letters appear
    const indices = new Set<number>();
    letters.forEach((letter, index) => {
      if (targets.includes(letter)) {
        indices.add(index);
      }
    });
    
    setGrid(letters);
    setTargetLetters(targets);
    setTargetIndices(indices);
    setFoundIndices(new Set());
  };

  const startGame = () => {
    generateGrid();
    setErrors(0);
    setPhase('playing');
    setStartTime(Date.now());
    
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
    }, 100);
  };

  const handleCellPress = async (index: number) => {
    if (foundIndices.has(index)) return;
    
    if (targetIndices.has(index)) {
      const newFound = new Set(foundIndices);
      newFound.add(index);
      setFoundIndices(newFound);
      
      // Check if all found
      if (newFound.size === targetIndices.size) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        setPhase('result');
        
        try {
          await saveSession({
            game_type: 'proofreading',
            score: targetIndices.size,
            time_seconds: finalTime,
            difficulty: `${rows}x${cols}`,
            errors: errors,
            details: { hits: targetIndices.size, errors, rows, cols },
          });
        } catch (error) {
          console.error('Error saving session:', error);
        }
      }
    } else {
      setErrors(prev => prev + 1);
      setWrongFlash(index);
      setTimeout(() => setWrongFlash((f) => (f === index ? null : f)), 350);
    }
  };

  // Calculate cell size — fit within both width AND height to avoid overflow
  // Reserve ~280px for header/HUD/target-letters above the grid + safe area
  // Компромисс: сетка ВСЕГДА влезает (cell = min по ширине И высоте, без overflow),
  // но не мельчит — выше потолок контейнера/клетки и меньше резерв сверху → на
  // просторных экранах клетки крупные, на узких — ужимаются ровно до помещения.
  const reservedHeight = 210;
  const availableHeight = Math.max(200, height - reservedHeight);
  const containerW = Math.min(width - 24, 760);
  const widthBased = Math.floor(containerW / cols);
  const heightBased = Math.floor(availableHeight / rows);
  const cellSize = Math.max(22, Math.min(widthBased, heightBased, 72));   // clamp 22-72px
  const gridWidth = cellSize * cols;

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.configCard}
        >
          <Ionicons name="search" size={48} color="#333" />
          <Text style={[styles.configTitle, { color: '#333' }]}>{t('proofreading')}</Text>
          <Text style={[styles.configDesc, { color: 'rgba(0,0,0,0.6)' }]}>{t('proofreadingDesc')}</Text>
        </LinearGradient>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('desc_proofreading')}
          </Text>
        </View>

        {/* Скрипт-режимы (Полиглот v1.27.0): 6 письменностей + цифры */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('scriptLabel')}
          </Text>
          <View style={styles.optionButtons}>
            {([...SCRIPT_IDS, 'digits'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.sizeButton,
                  mode === m && { backgroundColor: GRADIENT[0] },
                  mode !== m && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.sizeButtonText, { color: mode === m ? '#333' : colors.text }]}>
                  {t(m === 'digits' ? 'scriptDigits' : SCRIPTS[m].labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Rows Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('label_rows')}
          </Text>
          <View style={styles.optionButtons}>
            {[10, 12, 15, 18].map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.sizeButton,
                  rows === r && { backgroundColor: GRADIENT[0] },
                  rows !== r && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setRows(r)}
              >
                <Text style={[styles.sizeButtonText, { color: rows === r ? '#333' : colors.text }]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Columns Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('label_columns')}
          </Text>
          <View style={styles.optionButtons}>
            {[8, 10, 12, 16].map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.sizeButton,
                  cols === c && { backgroundColor: GRADIENT[0] },
                  cols !== c && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setCols(c)}
              >
                <Text style={[styles.sizeButtonText, { color: cols === c ? '#333' : colors.text }]}>
                  {c}
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
            <Ionicons name="play" size={24} color="#333" />
            <Text style={[styles.startButtonText, { color: '#333' }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderGame = () => (
    <View style={styles.gameContainer}>
      {/* Game Header */}
      <View style={styles.gameHeader}>
        <View style={[styles.targetBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.targetLabel, { color: colors.text }]}>{t('find')}:</Text>
          {targetLetters.map((tl, i) => (
            <View key={i} style={[styles.targetChip, { backgroundColor: i === 0 ? '#34d399' : '#fbbf24' }]}>
              <Text style={styles.targetChipText}>{tl}</Text>
            </View>
          ))}
          <Text style={[styles.targetCount, { color: colors.textSecondary }]}>
            {foundIndices.size}/{targetIndices.size}
          </Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Ionicons name="time-outline" size={18} color={colors.text} />
          <Text style={[styles.timerText, { color: colors.text }]}>
            {Math.floor(elapsedTime)}s
          </Text>
        </View>
      </View>

      {/* Grid */}
      <ScrollView 
        style={styles.gridScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.gridScrollContent}
      >
        <View style={[styles.gridContainer, { width: gridWidth }]}>
          {grid.map((letter, index) => {
            const isTarget = targetIndices.has(index);
            const isFound = foundIndices.has(index);
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.cell,
                  {
                    width: cellSize - 2,
                    height: cellSize - 2,
                    backgroundColor: isFound ? GRADIENT[0] : wrongFlash === index ? '#f43f5e' : colors.surface,
                  },
                ]}
                onPress={() => handleCellPress(index)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.cellText,
                    {
                      fontSize: Math.min(cellSize * 0.5, 24),
                      color: isFound ? '#333' : wrongFlash === index ? '#fff' : colors.text,
                      fontWeight: isFound || wrongFlash === index ? '700' : '500',
                    },
                  ]}
                >
                  {letter}
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
          nameKey="proofreading"
          icon="search"
          gradient={GRADIENT}
          skillKey="skillFocus"
          descriptionKey="proofreadingIntroDesc"
          benefits={PROOFREADING_BENEFITS}
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
        <Text style={[styles.title, { color: colors.text }]}>{t('proofreading')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderGame()}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime}
          score={targetIndices.size}
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
  configTitle: { fontSize: 24, fontWeight: '700' },
  configDesc: { fontSize: 14 },
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  sizeButtonText: { fontSize: 16, fontWeight: '600' },
  startButton: { marginTop: 10 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  startButtonText: { fontSize: 18, fontWeight: '700' },
  gameContainer: { flex: 1, paddingHorizontal: 16 },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  targetBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  targetLabel: { fontSize: 14 },
  targetChip: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetChipText: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  targetCount: { fontSize: 15, fontWeight: '600', marginLeft: 'auto' },
  statBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
  },
  timerText: { fontSize: 16, fontWeight: '600' },
  gridScroll: { flex: 1 },
  gridScrollContent: { alignItems: 'center', paddingBottom: 20 },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: 1,
    borderRadius: 4,
  },
  cellText: {},
});
