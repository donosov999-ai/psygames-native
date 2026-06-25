import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
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
import { useProfile } from '@/src/contexts/ProfileContext';
import { getUnlockedLevels, getNextLockedLevel } from '@/src/services/level-unlocks';
import { LEVELS_BY_GAME } from '@/src/constants/level-progression';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { SCRIPTS, SCRIPT_IDS, ScriptId } from '@/src/constants/scripts';

const GRADIENT = ['#667eea', '#764ba2'];

// Benefits for intro screen
const SCHULTE_BENEFITS = [
  { icon: 'book-outline', textKey: 'benefitSchulte1' },
  { icon: 'eye-outline', textKey: 'benefitSchulte2' },
  { icon: 'search-outline', textKey: 'benefitSchulte3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type ContentMode = 'numbers' | 'letters' | 'mixed';
/** v1.10.0: направление поиска. 'forward' = 1→25 / А→Я, 'backward' = 25→1 / Я→А.
 *  Для mixed (Шульте-Горбов) backward не применяется (нелогично). */
type Direction = 'forward' | 'backward';

// Персональная лесенка 15 ступеней: размер → обратный → буквы → цвет → Горбов → Горбов+цвет.
// Буквы держим 5×5 (рус/латиница ограничены алфавитом). Сложность растёт ТРУДНОСТЬЮ.
function levelParams(level: number): { gridSize: number; contentMode: ContentMode; direction: Direction; colorMode: boolean } {
  const L = level;
  if (L <= 1) return { gridSize: 5, contentMode: 'numbers', direction: 'forward', colorMode: false };
  if (L === 2) return { gridSize: 6, contentMode: 'numbers', direction: 'forward', colorMode: false };
  if (L === 3) return { gridSize: 7, contentMode: 'numbers', direction: 'forward', colorMode: false };
  if (L === 4) return { gridSize: 5, contentMode: 'numbers', direction: 'backward', colorMode: false };
  if (L === 5) return { gridSize: 6, contentMode: 'numbers', direction: 'backward', colorMode: false };
  if (L === 6) return { gridSize: 5, contentMode: 'letters', direction: 'forward', colorMode: false };
  if (L === 7) return { gridSize: 5, contentMode: 'letters', direction: 'backward', colorMode: false };
  if (L === 8) return { gridSize: 5, contentMode: 'numbers', direction: 'forward', colorMode: true };
  if (L === 9) return { gridSize: 6, contentMode: 'numbers', direction: 'forward', colorMode: true };
  if (L === 10) return { gridSize: 5, contentMode: 'letters', direction: 'forward', colorMode: true };
  if (L === 11) return { gridSize: 5, contentMode: 'letters', direction: 'backward', colorMode: true };
  if (L === 12) return { gridSize: 5, contentMode: 'mixed', direction: 'forward', colorMode: false };
  if (L === 13) return { gridSize: 6, contentMode: 'mixed', direction: 'forward', colorMode: false };
  if (L === 14) return { gridSize: 5, contentMode: 'mixed', direction: 'forward', colorMode: true };
  return { gridSize: 6, contentMode: 'mixed', direction: 'forward', colorMode: true };   // L15+
}

export default function SchulteGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const windowDimensions = useWindowDimensions();
  const { profile } = useProfile();
  const isThemed = profile.group === 'themed';

  // Game configuration
  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('schulte_table');   // персональный уровень (лесенка); отдельно от ручного config и gating
  const levelRef = useRef(1);
  const useLevelRef = useRef(false);   // запущено по уровню? (для reach)
  useEffect(() => { if (isPreset) startGame(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [gridSize, setGridSize] = useState(() => num('size', 5));
  const [colorMode, setColorMode] = useState(false);
  const [contentMode, setContentMode] = useState<ContentMode>('numbers');
  const [direction, setDirection] = useState<Direction>('forward');
  // v1.27.0 (Полиглот): письменность для letters/mixed — латиница/кириллица/греческий/деванагари/кана/иероглифы
  const [script, setScript] = useState<ScriptId>(language === 'ru' ? 'cyrillic' : 'latin');

  // При смене на mixed — direction всегда forward (backward бессмыслен)
  useEffect(() => {
    if (contentMode === 'mixed' && direction !== 'forward') {
      setDirection('forward');
    }
  }, [contentMode]);

  // letters: сетка не может быть больше алфавита (greek 24 < 5×5 — скрыт фильтром чипов);
  // кламп защищает и старый кейс «выбрал 8×8, потом переключился на буквы»
  const lettersMaxSize = Math.floor(Math.sqrt(SCRIPTS[script].chars.length));
  useEffect(() => {
    if (contentMode === 'letters' && gridSize > lettersMaxSize) {
      setGridSize(lettersMaxSize);
    }
  }, [contentMode, script]); // eslint-disable-line react-hooks/exhaustive-deps

  // Level-progression: which grid sizes are unlocked for this themed profile?
  // Personal profiles get an empty array meaning "no gating".
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());
  const [nextHint, setNextHint] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!isThemed) { setUnlockedSet(new Set()); setNextHint(null); return; }
      const unlocked = await getUnlockedLevels(profile.person, true, 'schulte_table');
      setUnlockedSet(new Set(unlocked));
      const next = await getNextLockedLevel(profile.person, true, 'schulte_table');
      if (next) {
        const dot = next.consecutiveDone > 0
          ? (language === 'ru'
            ? ` · прогресс ${next.consecutiveDone}/${next.condition.consecutive ?? 1}`
            : ` · progress ${next.consecutiveDone}/${next.condition.consecutive ?? 1}`)
          : '';
        setNextHint(language === 'ru'
          ? `🔒 Следующий ${next.level.label}: ${next.condition.human_hint}${dot}`
          : `🔒 Next ${next.level.label_en ?? next.level.label}: ${next.condition.human_hint_en ?? next.condition.human_hint}${dot}`);
      } else {
        setNextHint(null);
      }
    })();
  }, [isThemed, profile.person, language]);

  // Game state
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [grid, setGrid] = useState<(number | string)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const [cellColors, setCellColors] = useState<string[]>([]);
  const [sequence, setSequence] = useState<(number | string)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cell colors for color mode
  const COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8B500', '#2ECC71',
  ];

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const generateGrid = useCallback((gsArg?: number, cmArg?: ContentMode, dirArg?: Direction) => {
    // явные параметры (из уровня) приоритетнее state — иначе stale при setState+generateGrid в одном тике
    const gs = gsArg ?? gridSize;
    const cm = cmArg ?? contentMode;
    const dir = dirArg ?? direction;
    const totalCells = gs * gs;
    let items: (number | string)[];
    let orderedSequence: (number | string)[];

    if (cm === 'numbers') {
      items = Array.from({ length: totalCells }, (_, i) => i + 1);
      orderedSequence = [...items];
    } else if (cm === 'letters') {
      const alphabet = SCRIPTS[script].chars;
      items = alphabet.slice(0, totalCells).split('');
      orderedSequence = [...items];
    } else {
      // Mixed (Schulte-Gorbov): 1, A, 2, B, 3, C, ... — backward не применяется
      const half = Math.ceil(totalCells / 2);
      const numbers = Array.from({ length: half }, (_, i) => i + 1);
      const alphabet = SCRIPTS[script].chars;
      const letters = alphabet.slice(0, totalCells - half).split('');
      orderedSequence = [];
      for (let i = 0; i < half; i++) {
        orderedSequence.push(numbers[i]);
        if (i < letters.length) orderedSequence.push(letters[i]);
      }
      orderedSequence = orderedSequence.slice(0, totalCells);
      items = [...orderedSequence];
    }

    if (dir === 'backward' && cm !== 'mixed') {
      orderedSequence = [...orderedSequence].reverse();
    }

    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    const colors = items.map(() => COLORS[Math.floor(Math.random() * COLORS.length)]);

    setGrid(items);
    setCellColors(colors);
    setSequence(orderedSequence);
  }, [gridSize, contentMode, script, direction]);

  const startGame = (useLevel = false) => {
    if (useLevel && !isPreset) {
      // запуск ПО УРОВНЮ: параметры из лесенки (поверх ручного config, gating не трогаем)
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      useLevelRef.current = true;
      setGridSize(p.gridSize); setContentMode(p.contentMode); setDirection(p.direction); setColorMode(p.colorMode);
      generateGrid(p.gridSize, p.contentMode, p.direction);
    } else {
      useLevelRef.current = false;
      generateGrid();   // свободный режим / пресет — ручной выбор
    }
    setCurrentIndex(0);
    setErrors(0);
    setElapsedTime(0);
    setPhase('playing');

    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
    }, 100);
  };

  const handleCellPress = async (value: number | string) => {
    const expectedValue = sequence[currentIndex];
    
    if (value === expectedValue) {
      const totalCells = gridSize * gridSize;
      if (currentIndex === totalCells - 1) {
        // Game complete
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        if (!isPreset && useLevelRef.current && errors <= 2) lvl.reach(levelRef.current + 1);   // прошёл уровень чисто → +уровень
        setPhase('result');
        
        // Save session
        try {
          await saveSession({
            game_type: 'schulte_table',
            score: totalCells - errors,
            time_seconds: finalTime,
            difficulty: `${gridSize}x${gridSize}`,
            mode: `${contentMode}_${direction}_${colorMode ? 'color' : 'bw'}`,
            errors: errors,
            details: {
              hits: totalCells - errors,
              errors,
              total_cells: totalCells,
              mean_rt_per_cell: totalCells > 0 ? finalTime / totalCells : 0,
              ...(contentMode !== 'numbers' ? { script } : {}),
            },
          });
        } catch (error) {
          console.error('Error saving session:', error);
        }
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    } else {
      setErrors((prev) => prev + 1);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    }
    return `${secs}.${ms}`;
  };

  // v1.29.1 (мобайл): сетка тянется на ВСЮ ширину экрана — потолок 60px делал её
  // мелкой по центру (390px телефон, 5×5: было 316px). Лимит по высоте (хедер+HUD ≈ 230)
  // не даёт вылезти в ландшафте/десктопе; 120 — мягкий потолок для больших окон.
  const cellSize = Math.min(
    (windowDimensions.width - 32 - (gridSize - 1) * 4) / gridSize,
    (windowDimensions.height - 230 - (gridSize - 1) * 4) / gridSize,
    120
  );

  // v1.13.3: ScrollView вокруг configContainer — на Windows / маленьких экранах
  // кнопка «Старт» уходила за viewport, не достать. Schulte имеет 4+ optionCard
  // (Тип/Направление/Цвет/Размер) + hero + кнопка → больше чем 720px высоты часто.
  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={GRADIENT as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.configCard}
      >
        <Ionicons name="grid" size={48} color="#FFFFFF" />
        <Text style={styles.configTitle}>{t('schulteTable')}</Text>
        <Text style={styles.configDesc}>{t('schulteTableDesc')}</Text>
      </LinearGradient>

      {/* Content Mode Selection (Numbers/Letters) */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {t('label_type')}
        </Text>
        <View style={styles.optionButtons}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              contentMode === 'numbers' && { backgroundColor: GRADIENT[0] },
              contentMode !== 'numbers' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
            ]}
            onPress={() => setContentMode('numbers')}
          >
            <Ionicons
              name="calculator-outline"
              size={20}
              color={contentMode === 'numbers' ? '#FFFFFF' : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: contentMode === 'numbers' ? '#FFFFFF' : colors.text },
              ]}
            >
              {t('label_digits_numbers')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              contentMode === 'letters' && { backgroundColor: GRADIENT[0] },
              contentMode !== 'letters' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
            ]}
            onPress={() => setContentMode('letters')}
          >
            <Ionicons
              name="text-outline"
              size={20}
              color={contentMode === 'letters' ? '#FFFFFF' : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: contentMode === 'letters' ? '#FFFFFF' : colors.text },
              ]}
            >
              {t('label_letters')}
            </Text>
          </TouchableOpacity>
          {/* Schulte-Gorbov: chase 1, A, 2, B, 3, C... — самый сильный вариант */}
          <TouchableOpacity
            style={[
              styles.modeButton,
              contentMode === 'mixed' && { backgroundColor: GRADIENT[0] },
              contentMode !== 'mixed' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
            ]}
            onPress={() => setContentMode('mixed')}
          >
            <Ionicons
              name="shuffle-outline"
              size={20}
              color={contentMode === 'mixed' ? '#FFFFFF' : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: contentMode === 'mixed' ? '#FFFFFF' : colors.text },
              ]}
            >
              {t('label_mixed_1a2b')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* v1.27.0 (Полиглот): выбор письменности для letters/mixed.
          Для letters скрыты алфавиты короче 25 символов (greek 24 < 5×5). */}
      {contentMode !== 'numbers' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('scriptLabel')}</Text>
          <View style={styles.optionButtons}>
            {SCRIPT_IDS
              .filter((id) => contentMode === 'mixed' || SCRIPTS[id].chars.length >= 25)
              .map((id) => (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.sizeButton,
                    script === id && { backgroundColor: GRADIENT[0] },
                    script !== id && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                  onPress={() => setScript(id)}
                >
                  <Text style={[styles.sizeButtonText, { color: script === id ? '#FFFFFF' : colors.text }]}>
                    {t(SCRIPTS[id].labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>
      )}

      {/* v1.10.0: Direction toggle — forward (1→25 / А→Я) или backward.
          Скрыт для mixed-режима (там всегда forward). */}
      {contentMode !== 'mixed' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('srsDirection')}
          </Text>
          <View style={styles.optionButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                direction === 'forward' && { backgroundColor: GRADIENT[0] },
                direction !== 'forward' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setDirection('forward')}
            >
              <Ionicons
                name="arrow-forward-outline"
                size={20}
                color={direction === 'forward' ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: direction === 'forward' ? '#FFFFFF' : colors.text }]}>
                {contentMode === 'numbers'
                  ? '1 → 25'
                  : `${SCRIPTS[script].chars[0]} → ${SCRIPTS[script].chars[SCRIPTS[script].chars.length - 1]}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                direction === 'backward' && { backgroundColor: GRADIENT[0] },
                direction !== 'backward' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setDirection('backward')}
            >
              <Ionicons
                name="arrow-back-outline"
                size={20}
                color={direction === 'backward' ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: direction === 'backward' ? '#FFFFFF' : colors.text }]}>
                {contentMode === 'numbers'
                  ? '25 → 1'
                  : `${SCRIPTS[script].chars[SCRIPTS[script].chars.length - 1]} → ${SCRIPTS[script].chars[0]}`}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
            {t('hint_backward_harder')}
          </Text>
        </View>
      )}

      {/* Size Selection */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('size')}</Text>
        <View style={styles.optionButtons}>
          {[5, 6, 7, 8, 9, 10].map((size) => {
            // Limit max size for letters mode based on selected script length
            const maxSize = contentMode === 'letters' ? lettersMaxSize : 10;
            const modeDisabled = size > maxSize;
            // Level-progression lock (themed profiles only)
            const sizeKey = `${size}x${size}`;
            const levelLocked = isThemed && unlockedSet.size > 0 && !unlockedSet.has(sizeKey);
            const isDisabled = modeDisabled || levelLocked;

            return (
              <TouchableOpacity
                key={size}
                style={[
                  styles.sizeButton,
                  gridSize === size && !isDisabled && { backgroundColor: GRADIENT[0] },
                  gridSize !== size && !isDisabled && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  isDisabled && { backgroundColor: colors.card, opacity: 0.4 },
                ]}
                onPress={() => !isDisabled && setGridSize(size)}
                disabled={isDisabled}
              >
                <Text
                  style={[
                    styles.sizeButtonText,
                    { color: gridSize === size && !isDisabled ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {size}x{size}{levelLocked ? ' 🔒' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {nextHint && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 8, fontStyle: 'italic' }}>
            {nextHint}
          </Text>
        )}
      </View>

      {/* Color Mode Selection */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
        <View style={styles.optionButtons}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              !colorMode && { backgroundColor: GRADIENT[0] },
              colorMode && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
            ]}
            onPress={() => setColorMode(false)}
          >
            <Ionicons
              name="contrast-outline"
              size={20}
              color={!colorMode ? '#FFFFFF' : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: !colorMode ? '#FFFFFF' : colors.text },
              ]}
            >
              {t('bwMode')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              colorMode && { backgroundColor: GRADIENT[0] },
              !colorMode && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
            ]}
            onPress={() => setColorMode(true)}
          >
            <Ionicons
              name="color-palette-outline"
              size={20}
              color={colorMode ? '#FFFFFF' : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: colorMode ? '#FFFFFF' : colors.text },
              ]}
            >
              {t('colorMode')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {!isPreset && (
        <TouchableOpacity style={[styles.startButton, { marginTop: 'auto', marginBottom: 10 }]} onPress={() => startGame(true)}>
          <LinearGradient colors={['#f7971e', '#ffd200']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startButtonGradient}>
            <Ionicons name="flag" size={22} color="#FFFFFF" />
            <Text style={styles.startButtonText}>{language === 'ru' ? `🎯 Уровень ${lvl.level} →` : `🎯 Level ${lvl.level} →`}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.startButton, !isPreset && { marginTop: 0 }]} onPress={() => startGame(false)}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Ionicons name="play" size={24} color="#FFFFFF" />
          <Text style={styles.startButtonText}>{!isPreset ? (language === 'ru' ? 'Свободно' : 'Free play') : t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderGame = () => {
    const currentTarget = sequence[currentIndex];
    
    return (
      <View style={styles.gameContainer}>
        {/* Game Header */}
        <View style={styles.gameHeader}>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('find')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{currentTarget}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('time')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{formatTime(elapsedTime)}</Text>
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
            { width: cellSize * gridSize + (gridSize - 1) * 4 }
          ]}>
            {grid.map((value, index) => {
              const sequenceIndex = sequence.indexOf(value);
              const isFound = sequenceIndex < currentIndex;
              const backgroundColor = colorMode
                ? cellColors[index]
                : isFound
                  ? colors.border
                  : colors.surface;
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor,
                      opacity: isFound ? 0.3 : 1,
                    },
                  ]}
                  onPress={() => !isFound && handleCellPress(value)}
                  disabled={isFound}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.cellText,
                      {
                        fontSize: cellSize * 0.4,
                        color: colorMode ? '#FFFFFF' : colors.text,
                      },
                    ]}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="schulteTable"
          icon="grid"
          gradient={GRADIENT}
          skillKey="skillAttention"
          descriptionKey="schulteIntroDesc"
          benefits={SCHULTE_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {phase === 'config' ? t('configureGame') : t('schulteTable')}
        </Text>
        {phase === 'playing' ? (
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surface }]}
            onPress={() => setPhase('config')}
          >
            <Ionicons name="refresh" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderGame()}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime}
          score={gridSize * gridSize - errors}
          errors={errors}
          gradient={GRADIENT}
          onPlayAgain={() => {
            setPhase('config');
          }}
          onGoHome={() => router.push('/')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  placeholder: {
    width: 44,
  },
  configContainer: {
    // v1.20.0 fix: было flex:1 — в contentContainerStyle ScrollView это пиннит
    // контент к высоте экрана → скролл мёртв, кнопка «Старт» (marginTop:auto)
    // уезжает в неинтерактивную зону → тап не срабатывал (Android). flexGrow:1
    // даёт и заполнение когда контент короткий, и скролл + тач когда длинный.
    flexGrow: 1,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  configCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  configTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  configDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  optionCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  sizeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 52,
    alignItems: 'center',
  },
  sizeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 8,
    flex: 1,
    justifyContent: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  startButton: {
    marginTop: 'auto',
    marginBottom: 20,
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gameContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
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
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  gridContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: 4,
  },
  cell: {
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: {
    fontWeight: '700',
  },
});
