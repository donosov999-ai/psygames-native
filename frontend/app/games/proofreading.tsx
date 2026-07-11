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
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { SCRIPTS, SCRIPT_IDS, ScriptId } from '@/src/constants/scripts';

const GRADIENT = ['#a8edea', '#fed6e3'];

const PROOFREADING_BENEFITS = [
  { icon: 'document-text-outline', textKey: 'benefitProofreading1' },
  { icon: 'eye-outline', textKey: 'benefitProofreading2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitProofreading3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';

// Уровень 1..15 (паттерн cpt/simon): ручные селекторы строк/колонок заменены
// уровневым режимом. Ось усложнения:
//   - объём «текста» растёт: 8×8 (64 клетки) → 16×12 (192 клетки)
//   - скорость сканирования: бюджет времени на клетку 1.0с → 0.45с (лимит раунда ~60-90с)
//   - допуск пропущенных целей снижается: найти ≥80% → ≥90% → 100% целей до конца времени
function levelParams(level: number): { rows: number; cols: number; timeLimitSec: number; minFoundPct: number } {
  const rows = level <= 5 ? 7 + level : level <= 10 ? 4 + level : Math.min(16, 1 + level);  // 8→12, 10→14, 12→16
  const cols = level <= 5 ? 8 : level <= 10 ? 10 : 12;
  const perCellSec = Math.max(0.45, 1.0 - (level - 1) * 0.04);   // темп сканирования растёт
  const timeLimitSec = Math.round(rows * cols * perCellSec);
  const minFoundPct = level <= 5 ? 0.8 : level <= 10 ? 0.9 : 1;
  return { rows, cols, timeLimitSec, minFoundPct };
}

export default function ProofreadingGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('proofreading');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  // rows/cols из пресета зарядки; в личной игре перезаписываются параметрами уровня
  const [rows, setRows] = useState(() => num('rows', 14));
  const [cols, setCols] = useState(() => num('cols', 12));
  const [mode, setMode] = useState<ScriptId | 'digits'>(() => (str('mode', language === 'ru' ? 'cyrillic' : 'latin') as ScriptId | 'digits'));
  const [wrongFlash, setWrongFlash] = useState<number | null>(null);
  const [grid, setGrid] = useState<string[]>([]);
  const [targetLetters, setTargetLetters] = useState<string[]>([]);
  const [foundIndices, setFoundIndices] = useState<Set<number>>(new Set());
  const [targetIndices, setTargetIndices] = useState<Set<number>>(new Set());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const [lastStars, setLastStars] = useState(3);
  const [clearedPassed, setClearedPassed] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Рефы — таймер лимита времени живёт вне ре-рендеров, state в его колбэке
  // был бы устаревшим (паттерн cpt/simon).
  const levelRef = useRef(1);
  const rowsRef = useRef(14);
  const colsRef = useRef(12);
  const timeLimitRef = useRef(0);          // 0 = без лимита (пресет зарядки)
  const minFoundPctRef = useRef(1);
  const targetTotalRef = useRef(0);
  const foundRef = useRef(0);
  const errorsRef = useRef(0);
  const startTimeRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const generateGrid = (r: number, c: number) => {
    const alphabet = mode === 'digits' ? '0123456789' : SCRIPTS[mode].chars;
    const totalCells = r * c;

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

    // Гарантия минимума целей: на больших алфавитах (иероглифы/кана) цели могли
    // выпасть 0-2 раза — критерий «найти ≥N% целей» терял смысл, а при 0 раунд
    // не завершался вовсе. Досеиваем цели в случайные не-целевые клетки.
    const minTargets = Math.max(4, Math.round(totalCells / 16));
    let present = letters.filter((l) => targets.includes(l)).length;
    while (present < minTargets) {
      const idx = Math.floor(Math.random() * totalCells);
      if (!targets.includes(letters[idx])) {
        letters[idx] = targets[Math.floor(Math.random() * 2)];
        present++;
      }
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
    targetTotalRef.current = indices.size;
    foundRef.current = 0;
  };

  const startGame = () => {
    let r: number, c: number;
    if (isPreset) {
      // Пресет зарядки: размеры из warmup-параметров, без лимита времени (как раньше)
      r = rows; c = cols;
      timeLimitRef.current = 0;
      minFoundPctRef.current = 1;
    } else {
      const p = levelParams(lvl.level);
      r = p.rows; c = p.cols;
      setRows(r); setCols(c);
      timeLimitRef.current = p.timeLimitSec;
      minFoundPctRef.current = p.minFoundPct;
    }
    levelRef.current = lvl.level;
    rowsRef.current = r;
    colsRef.current = c;
    errorsRef.current = 0;
    finishedRef.current = false;
    generateGrid(r, c);
    setErrors(0);
    setElapsedTime(0);
    setPhase('playing');
    startTimeRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(elapsed);
      // Лимит времени уровня: не успел — раунд закрывается с тем, что найдено
      if (timeLimitRef.current > 0 && elapsed >= timeLimitRef.current) finish();
    }, 100);
  };

  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const rawTime = (Date.now() - startTimeRef.current) / 1000;
    const finalTime = timeLimitRef.current > 0 ? Math.min(rawTime, timeLimitRef.current) : rawTime;
    setElapsedTime(finalTime);

    const total = targetTotalRef.current;
    const found = foundRef.current;
    const missed = Math.max(0, total - found);
    const errs = errorsRef.current;
    // Проход уровня: найдено ≥N% целей до истечения лимита (допуск пропусков сужается с уровнем)
    const passed = !isPreset && total > 0 && found >= Math.ceil(total * minFoundPctRef.current);
    // Звёзды: 0 промахов (пропуски+ложные клики) = 3, ≤2 = 2, иначе 1
    const mistakes = missed + errs;
    setLastStars(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
    // Пресет зарядки — статистика в GameResult (уровень не трогаем).
    // Уровневый проход — всегда общий баннер LevelCleared: passed=true → следующий,
    // passed=false → «почти, ещё раз» с авто-рестартом того же (или пониженного) уровня.
    if (isPreset) {
      setPhase('result');
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');   // непрерывный поток без тупика
    }

    try {
      await saveSession({
        game_type: 'proofreading',
        score: found,
        time_seconds: finalTime,
        difficulty: `${rowsRef.current}x${colsRef.current}`,
        ...(isPreset ? {} : { mode: `lvl${levelRef.current}` }),
        errors: errs,
        details: {
          level: levelRef.current,
          hits: found,
          errors: errs,
          missed,
          n_targets: total,
          accuracy: total > 0 ? Math.round((found / total) * 100) : 100,
          rows: rowsRef.current,
          cols: colsRef.current,
          time_limit_sec: timeLimitRef.current,
        },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  const handleCellPress = (index: number) => {
    if (finishedRef.current || foundIndices.has(index)) return;

    if (targetIndices.has(index)) {
      const newFound = new Set(foundIndices);
      newFound.add(index);
      foundRef.current = newFound.size;
      setFoundIndices(newFound);

      // Check if all found — досрочное завершение
      if (newFound.size === targetIndices.size) finish();
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
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

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
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

        {/* Уровневый режим вместо ручных селекторов строк/колонок (паттерн cpt/simon) */}
        <LevelProgressMap gameId="proofreading" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `Поле ${p.rows}×${p.cols} · лимит ${p.timeLimitSec} с`
              : `${p.rows}×${p.cols} grid · ${p.timeLimitSec} s limit`}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? `Проход уровня: найти ≥${Math.round(p.minFoundPct * 100)}% целей до конца времени (ложные нажатия и пропуски снижают звёзды)`
              : `To pass: find ≥${Math.round(p.minFoundPct * 100)}% of targets before time runs out (false taps and misses cost stars)`}
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
            <Ionicons name="play" size={24} color="#333" />
            <Text style={[styles.startButtonText, { color: '#333' }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
    );
  };

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
          {/* На уровне — обратный отсчёт лимита (красный на последних 10с); в пресете — секундомер */}
          <Text style={[styles.timerText, {
            color: timeLimitRef.current > 0 && timeLimitRef.current - elapsedTime <= 10 ? '#f43f5e' : colors.text,
          }]}>
            {timeLimitRef.current > 0
              ? `${Math.max(0, Math.ceil(timeLimitRef.current - elapsedTime))}s`
              : `${Math.floor(elapsedTime)}s`}
          </Text>
          {errors > 0 && (
            <Text style={[styles.timerText, { color: '#f43f5e' }]}>✗{errors}</Text>
          )}
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
        <Text style={[styles.title, { color: colors.text }]}>{t('proofreading')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderGame()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="proofreading"
          level={levelRef.current}
          stars={lastStars}
          passed={clearedPassed}
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
          score={foundIndices.size}
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
