/* psygames-game-schulte · VER 2 · 23.08.2026 */
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
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getUnlockedLevels, getNextLockedLevel, formatUnlockHint } from '@/src/services/level-unlocks';
import { LEVELS_BY_GAME } from '@/src/constants/level-progression';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { capPresetByLevel } from '@/src/services/presetCap';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { SCRIPTS, SCRIPT_IDS, ScriptId } from '@/src/constants/scripts';
import BossRound from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameModeSwitch from '@/src/components/GameModeSwitch';
import LeaderboardModal from '@/src/components/LeaderboardModal';
import { countsForRecord, fetchBest, getPersonalBest, submitScore } from '@/src/services/leaderboard';
import { getSessionHistory, recordSessionScore } from '@/src/services/sessionHistory';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recordBlock, seriesComplete, seriesDiffs, seriesSession, startSeries,
  type SeriesRun,
} from '@/src/services/series';
import {
  SCHULTE_SERIES_PLAN, afterSeriesRun, blockDone, blockKeyAt, blockTarget, buildSchulteField,
  getSchulteSeriesStrings, interpolate, nextBlock, openBlock, pairSum, parseSeriesProgress,
  pressSeriesCell, seriesEntry, EMPTY_SERIES_PROGRESS,
  type SchulteBlockKey, type SchulteSeriesProgress, type SchulteSeriesState, type SeriesOutcome,
} from '@/src/games/schulte/core';

const GRADIENT = ['#667eea', '#764ba2'];
// Оранжевая кнопка «уровень N» — свой градиент, значит и свой цвет текста:
// одним ON_GRAD тут не обойтись, стиль startButtonText лежит сразу на двух плашках.
const LEVEL_GRADIENT = ['#f7971e', '#ffd200'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFFFFF' — контраст 3.66 на фиолетовой и 1.45 на оранжевой (норма AA 4.5).
// Фиолетовую сплошным цветом AA не берёт вовсе: белый даёт 3.66, чёрный 3.30 —
// поэтому GradientSurface кладёт поверх вуаль цветом самого градиента.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const ON_LEVEL = onGradientText(LEVEL_GRADIENT[0], LEVEL_GRADIENT[1]);

// Benefits for intro screen
const SCHULTE_BENEFITS = [
  { icon: 'book-outline', textKey: 'benefitSchulte1' },
  { icon: 'eye-outline', textKey: 'benefitSchulte2' },
  { icon: 'search-outline', textKey: 'benefitSchulte3' },
];

/**
 * `series` — блок серии на поле · `interlude` — врезка со сменой правила между
 * блоками · `seriesResult` — разбор с разностями. Обычная партия ('playing') их
 * не касается: серия это РЕЖИМ этого же экрана, а не вторая игра рядом.
 */
type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result'
  | 'series' | 'interlude' | 'seriesResult';
// Синергия (пилот): каждые BOSS_EVERY уровней лесенки прошёл таблицу → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;
/**
 * Врезка между блоками (§11.2, глубина 2): 2–3 секунды на прочтение нового
 * правила. Она НЕ входит во время блока — часы блока стартуют, когда врезка
 * ушла, иначе её длительность села бы прямо в разность.
 */
const INTERLUDE_MS = 2500;
/**
 * У серии свой `game_type`: три блока с чужим правилом — не таблица Шульте.
 * Под общим ключом эта запись поехала бы и в лидерборд, и в восстановление
 * уровня (`getMaxLevelFromSessions` читает `details.level`), где `level` серии
 * означает размер поля, а не ступень лесенки.
 */
const SERIES_GAME_TYPE = 'schulte_series';
type ContentMode = 'numbers' | 'letters' | 'mixed';

/**
 * Наибольшая сетка, которую алфавит вообще может обслужить.
 *
 * 🔴 «Смешанному» потолок не ставился вовсе. Шульте-Горбов раскладывает половину
 * клеток цифрами, половину буквами: на 10×10 это пятьдесят букв, а латиница даёт
 * 26, кириллица 33 — не подходит НИ ОДИН алфавит. Партия не завершалась, а
 * таймера у Шульте нет: экран висел, пока человек не уйдёт сам.
 *
 * Экспортируется, чтобы гейт звал ЭТОТ расчёт, а не переписывал его у себя.
 */
export function maxGridFor(mode: ContentMode, alphabetSize: number): number {
  if (mode === 'numbers') return 10;
  for (let n = 10; n >= 2; n -= 1) {
    const need = mode === 'letters' ? n * n : Math.ceil((n * n) / 2);
    if (need <= alphabetSize) return n;
  }
  return 2;
}
/** v1.10.0: направление поиска. 'forward' = 1→25 / А→Я, 'backward' = 25→1 / Я→А.
 *  'center-out' (v1.116.0, свободный режим, только numbers): от центра наружу — 13,14,12,15,11...
 *  Для mixed (Шульте-Горбов) backward/center-out не применяются (нелогично). */
type Direction = 'forward' | 'backward' | 'center-out';

// От центра наружу: h, h+1, h-1, h+2, h-2... (паттерн drafterleo/schulte «divergent»).
function centerOutOrder(n: number): number[] {
  const mid = Math.floor((n + 1) / 2);
  const order: number[] = [mid];
  let lo = mid - 1, hi = mid + 1;
  while (order.length < n) {
    if (hi <= n) order.push(hi++);
    if (order.length < n && lo >= 1) order.push(lo--);
  }
  return order;
}

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
  const { isPreset, autostart, num, bool, isCalm } = useGamePreset();
  /** Шаг зарядки может попросить именно серию: `?series=1` (см. §11 — пилот живёт на зарядке). */
  const seriesPreset = bool('series');
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('schulte_table');
  /**
   * Уровни против свободной партии. Механика тут была всегда — startGame(true)
   * идёт по уровню, startGame(false) по ручным настройкам, — но выбор не был
   * виден: кнопка «Free play» лежала внизу за всеми настройками, а сверху стояла
   * фраза «или настрой таблицу ниже». Денис ткнул сюда прямо: «одиночные битвы
   * то с тем, то с другим». Теперь это явный переключатель, как в остальных играх.
   */
  const [playMode, setPlayMode] = useState<'levels' | 'free'>('levels');   // персональный уровень (лесенка); отдельно от ручного config и gating
  const levelRef = useRef(1);
  const useLevelRef = useRef(false);   // запущено по уровню? (для reach)
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  // ⚠️ Серия ждёт ЕЩЁ И свой прогресс: без него автостарт посадил бы человека на
  // минимальное поле, даже если блоки давно выросли (та же беда, что с уровнем).
  useAutostartWhenReady(
    () => autostart && lvl.loaded && (!seriesPreset || seriesLoaded),
    () => (seriesPreset ? beginSeries() : startGame(false)),
  );
  // ⚠️ ГЛУШИЛКА ПРАВИЛА ЗДЕСЬ НЕ РАБОТАЛА. Пояснение через тире линтер читает как
  // часть ИМЕНИ правила: такого правила нет, глушилка не глушила ничего и сама
  // становилась ошибкой линта. Пояснение живёт обычным комментарием: список
  // зависимостей намеренно неполон — эффект обязан сработать один раз на
  // готовности, а не пересобираться на каждое изменение замыканий.
  const [gridSize, setGridSize] = useState(() => num('size', 5));
  const [colorMode, setColorMode] = useState(false);
  const [contentMode, setContentMode] = useState<ContentMode>('numbers');
  const [direction, setDirection] = useState<Direction>('forward');
  // v1.116.0: разделённое внимание (numbers-only, свободный режим) — 2-4 группы своих
  // счётчиков в ОДНОЙ перемешанной сетке, различаются цветом; ищем по кругу текущее
  // число КАЖДОЙ группы (паттерн drafterleo/schulte). groupCount=1 = классика.
  const [groupCount, setGroupCount] = useState(1);
  const [cellGroup, setCellGroup] = useState<number[]>([]);         // group id (0..groupCount-1) на клетку
  const [groupTargets, setGroupTargets] = useState<number[]>([]);    // текущее искомое число КАЖДОЙ группы
  const [groupSizes, setGroupSizes] = useState<number[]>([]);        // сколько чисел всего в каждой группе
  const [activeGroup, setActiveGroup] = useState(0);
  // v1.116.0: «убегающая цель» — после каждого верного клика сетка перемешивается заново
  // (не только найденная клетка), заставляет пересканировать поле, а не помнить позиции.
  const [reshuffleOnClick, setReshuffleOnClick] = useState(false);
  // v1.27.0 (Полиглот): письменность для letters/mixed — латиница/кириллица/греческий/деванагари/кана/иероглифы
  const [script, setScript] = useState<ScriptId>(language === 'ru' ? 'cyrillic' : 'latin');

  // При смене на mixed — direction всегда forward (backward/center-out бессмысленны)
  useEffect(() => {
    if (contentMode === 'mixed' && direction !== 'forward') {
      setDirection('forward');
    }
  }, [contentMode]);

  // Разделённое внимание — только numbers (letters/mixed не поддержаны, см. комментарий у groupCount)
  useEffect(() => {
    if (contentMode !== 'numbers' && groupCount > 1) setGroupCount(1);
  }, [contentMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // letters: сетка не может быть больше алфавита (greek 24 < 5×5 — скрыт фильтром чипов);
  // кламп защищает и старый кейс «выбрал 8×8, потом переключился на буквы»
  /**
   * 🔴 «СМЕШАННОМУ» ТОЖЕ НУЖНЫ БУКВЫ, И ПОТОЛОК ЕМУ НЕ СТАВИЛСЯ.
   *
   * Шульте-Горбов раскладывает половину клеток цифрами, половину буквами. На
   * сетке 10×10 это пятьдесят букв, а латиница даёт 26, кириллица 33 — не
   * подходит НИ ОДИН алфавит. Ограничение стояло только для режима «буквы», а
   * «смешанный» пускали до десяти: партия не завершалась, а таймера у Шульте
   * нет — экран висел до тех пор, пока человек не уйдёт сам.
   *
   * Потолок считается от того, сколько знаков реально нужно: буквам все клетки,
   * смешанному — половина с округлением вверх.
   */
  const maxSizeFor = (mode: ContentMode): number => maxGridFor(mode, SCRIPTS[script].chars.length);
  const lettersMaxSize = maxSizeFor('letters');
  useEffect(() => {
    const cap = maxSizeFor(contentMode);
    if (gridSize > cap) setGridSize(cap);
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
      // v1.142: строка собирается из словаря (12 языков) с фолбэком на манифест
      setNextHint(next ? formatUnlockHint(language, 'schulte_table', next) : null);
    })();
  }, [isThemed, profile.person, language]);

  // Game state
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в блок «Об игре» (GameAbout);
  const [clearedPassed, setClearedPassed] = useState(true);   // прошёл ли уровень (для баннера LevelCleared: true=звёзды, false=«почти, ещё раз»)
  const [bossWon, setBossWon] = useState<boolean | null>(null);   // итог босса-вехи (null = босса не было)
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [resultBenchmark, setResultBenchmark] = useState<{ own: number; best: number; source: 'players' | 'personal' } | null>(null);
  const [timeHistory, setTimeHistory] = useState<number[]>([]);
  const [grid, setGrid] = useState<(number | string)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const [cellColors, setCellColors] = useState<string[]>([]);
  const [sequence, setSequence] = useState<(number | string)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // СЕРИЯ БЛОКОВ (пилот §11): три правила подряд по ОДНОМУ полю.
  // Ход партии и правила блоков живут в `src/games/schulte/core`, замер и
  // уровень — в `src/services/series.ts`. Здесь только состояние экрана.
  // ───────────────────────────────────────────────────────────────────────────
  const seriesStrings = getSchulteSeriesStrings(language);
  const [seriesState, setSeriesState] = useState<SchulteSeriesState | null>(null);
  const [seriesProgress, setSeriesProgress] = useState<SchulteSeriesProgress>(EMPTY_SERIES_PROGRESS);
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [seriesOutcome, setSeriesOutcome] = useState<SeriesOutcome | null>(null);
  const [seriesFinished, setSeriesFinished] = useState<SeriesRun | null>(null);
  /** Прогон серии живёт в ref: блоки дописываются из обработчиков нажатий. */
  const seriesRunRef = useRef<SeriesRun | null>(null);
  const blockStartRef = useRef(0);
  /** Блок открыт и ещё не записан — чтобы выход во время врезки не записал его дважды. */
  const blockOpenRef = useRef(false);
  const seriesKey = `psygames_schulte_series_${(profile as any)?.id ?? 'default'}`;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(seriesKey)
      .then((raw) => { if (alive) setSeriesProgress(parseSeriesProgress(raw)); })
      .catch(() => {})
      .then(() => { if (alive) setSeriesLoaded(true); });
    return () => { alive = false; };
  }, [seriesKey]);

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

    // Разделённое внимание: numbers-only, свои независимые счётчики по группам вперемешку.
    if (groupCount > 1 && cm === 'numbers') {
      const gc = groupCount;
      const sizes = Array.from({ length: gc }, (_, g) => Math.floor(totalCells / gc) + (g < totalCells % gc ? 1 : 0));
      const values: number[] = [];
      const groupsOf: number[] = [];
      sizes.forEach((size, g) => { for (let n = 1; n <= size; n++) { values.push(n); groupsOf.push(g); } });
      // shuffle value+group вместе (позиции), Fisher-Yates
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
        [groupsOf[i], groupsOf[j]] = [groupsOf[j], groupsOf[i]];
      }
      setGrid(values);
      setCellGroup(groupsOf);
      setGroupSizes(sizes);
      setGroupTargets(new Array(gc).fill(1));
      setActiveGroup(0);
      setCellColors(groupsOf.map((g) => COLORS[g % COLORS.length]));   // цвет = ID группы, не рандом — иначе группы не различить
      setSequence([]);   // не используется в group-режиме
      return;
    }
    setCellGroup([]);

    let items: (number | string)[];
    let orderedSequence: (number | string)[];

    if (cm === 'numbers') {
      items = Array.from({ length: totalCells }, (_, i) => i + 1);
      orderedSequence = dir === 'center-out' ? centerOutOrder(totalCells) : [...items];
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
      if (isPreset) {
        /**
         * ⚠️ Пресет — потолок желания (см. `presetCap`). В программах стоит
         * `size: 6`, то есть таблица 6×6 — 36 чисел; лесенка на первых уровнях
         * даёт 3×3 и 4×4. Разница не в «чуть труднее», а в разы по времени.
         */
        const размер = capPresetByLevel({
          want: gridSize,
          atLevel: levelParams(lvl.level).gridSize,
          atTop: levelParams(lvl.level).gridSize >= 7,
        });
        setGridSize(размер);
        generateGrid(размер, contentMode, direction);
      } else {
        generateGrid();   // свободный режим — ручной выбор
      }
    }
    setCurrentIndex(0);
    setErrors(0);
    setElapsedTime(0);
    setResultBenchmark(null);
    setBossWon(null);
    setPhase('playing');

    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow();
    setStartTime(start);
    timerRef.current = setInterval(() => {
      setElapsedTime((gameNow() - start) / 1000);
    }, 100);
  };

  // Общее завершение раунда (классика и разделённое внимание сходятся сюда) — сохранение
  // сессии + авто-поток (босс/баннер/обычный результат), errsArg — т.к. errors-стейт может
  // отставать на один клик в замыкании onPress.
  const finishRound = async (totalCells: number, errsArg: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    const passed = !isPreset && useLevelRef.current && errsArg <= 2;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset && useLevelRef.current) lvl.fail();   // не прошёл чисто по уровню → гистерезис понижения
    // Лидерборд + спарклайн — только «классика» (иначе время между режимами несравнимо).
    // Само условие живёт в services/leaderboard.ts рядом с описанием игры: пока оно
    // стояло здесь, «какая конфигурация считается» знал только этот экран, и проверить
    // это исполнением было нечем — теперь это чистая функция, и её гоняет гейт.
    if (countsForRecord('schulte_table_5x5', { gridSize, contentMode, direction, colorMode, groupCount, reshuffleOnClick })) {
      // UI сразу получает честный офлайн-фолбэк; сеть и сохранённый личный рекорд
      // уточнят строку асинхронно и не задержат переход на экран итога.
      setResultBenchmark({ own: finalTime, best: finalTime, source: 'personal' });
      const submit = submitScore('schulte_table_5x5', finalTime);
      const pid = (profile as any)?.id ?? 'default';
      Promise.all([
        getSessionHistory('schulte_table_5x5', pid),
        submit.then(() => fetchBest('schulte_table_5x5')),
        getPersonalBest('schulte_table_5x5'),
      ]).then(([history, playersBest, storedPersonalBest]) => {
        setTimeHistory(history);
        const personalBest = Math.min(finalTime, storedPersonalBest ?? finalTime, ...history.filter((n) => Number.isFinite(n) && n > 0));
        setResultBenchmark({
          own: finalTime,
          best: playersBest ?? personalBest,
          source: playersBest === null ? 'personal' : 'players',
        });
      });
      submit.catch(() => {});
      recordSessionScore('schulte_table_5x5', pid, finalTime).catch(() => {});
    } else {
      setTimeHistory([]);
      setResultBenchmark(null);
    }
    try {
      await saveSession({
        passed,
        game_type: 'schulte_table',
        score: totalCells - errsArg,
        time_seconds: finalTime,
        difficulty: `${gridSize}x${gridSize}`,
        mode: groupCount > 1 ? `divided_attention_${groupCount}g` : `${contentMode}_${direction}_${colorMode ? 'color' : 'bw'}${reshuffleOnClick ? '_moving' : ''}`,
        errors: errsArg,
        details: {
          // Резерв прогресса: getMaxLevelFromSessions восстановит уровень отсюда,
          // если локальный ключ потерян (переустановка, сброс профиля).
          level: levelRef.current,
          hits: totalCells - errsArg,
          errors: errsArg,
          total_cells: totalCells,
          mean_rt_per_cell: totalCells > 0 ? finalTime / totalCells : 0,
          ...(contentMode !== 'numbers' && groupCount <= 1 ? { script } : {}),
          ...(groupCount > 1 ? { group_count: groupCount } : {}),
        },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
    // Непрерывный поток: уровневый проход И провал уходят в баннер 'cleared' (passed=false → «почти, ещё раз» + авто-рестарт того же уровня).
    // Пресет / свободный режим — как было: экран статистики 'result'.
    const isLevelRun = !isPreset && useLevelRef.current;
    if (passed && levelRef.current % BOSS_EVERY === 0) {
      setClearedPassed(true);
      setBossWon(null);
      setPhase('boss');
    } else if (isLevelRun) {
      setClearedPassed(passed);
      setPhase('cleared');
    } else {
      setPhase('result');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // СЕРИЯ БЛОКОВ — ход партии
  // ───────────────────────────────────────────────────────────────────────────

  /** Какое поле человек уже держит в ОБЫЧНОМ Шульте — стартовый уровень блока «поиск». */
  const ladderSize = (): number => levelParams(lvl.level).gridSize;

  const blockLabel = (key: SchulteBlockKey): string => (
    key === 'order' ? seriesStrings.blockOrder
      : key === 'alternate' ? seriesStrings.blockAlternate
        : seriesStrings.blockSum
  );

  const blockRule = (key: SchulteBlockKey, total: number): string => interpolate(
    key === 'order' ? seriesStrings.ruleOrder
      : key === 'alternate' ? seriesStrings.ruleAlternate
        : seriesStrings.ruleSum,
    { last: total, sum: pairSum(total) },
  );

  /** Часы блока. Каждый блок мерится отдельно — из этих времён и берутся разности. */
  const beginBlockClock = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow();
    blockStartRef.current = start;
    blockOpenRef.current = true;
    setStartTime(start);
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime((gameNow() - start) / 1000);
    }, 100);
  };

  /**
   * Старт серии. Поле собирается ОДИН раз на все три блока — в этом весь замер:
   * перегенерируй его между блоками, и в разность попадёт разница полей.
   */
  const beginSeries = () => {
    const entry = seriesEntry(seriesProgress, ladderSize());
    const field = buildSchulteField(entry.level);
    seriesRunRef.current = startSeries(SERIES_GAME_TYPE, entry.level, SCHULTE_SERIES_PLAN, gameNow());
    setSeriesOutcome(null);
    setSeriesFinished(null);
    setSeriesState(openBlock(field, 0));
    beginBlockClock();
    setPhase('series');
  };

  /** Конец серии: одна сессия с массивом блоков внутри, разности — только у полной. */
  const finishSeries = async (run: SeriesRun, show: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current);
    blockOpenRef.current = false;
    const outcome = afterSeriesRun(seriesProgress, run, ladderSize());
    setSeriesProgress(outcome.progress);
    AsyncStorage.setItem(seriesKey, JSON.stringify(outcome.progress)).catch(() => {});
    setSeriesOutcome(outcome);
    setSeriesFinished(run);
    seriesRunRef.current = null;
    setPhase(show ? 'seriesResult' : 'config');
    try {
      await saveSession({
        ...seriesSession(run),
        passed: seriesComplete(run),
        difficulty: `${run.level}x${run.level}`,
      });
    } catch (error) {
      console.error('Error saving series session:', error);
    }
  };

  /** Блок доигран (или оборван): дописываем его в прогон и решаем, что дальше. */
  const closeBlock = (state: SchulteSeriesState, done: boolean) => {
    const run = seriesRunRef.current;
    if (!run || !blockOpenRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    blockOpenRef.current = false;
    const updated = recordBlock(run, {
      key: blockKeyAt(state.blockIndex),
      timeMs: gameNow() - blockStartRef.current,
      errors: state.errors,
      done,
    });
    seriesRunRef.current = updated;
    const isLast = state.blockIndex >= SCHULTE_SERIES_PLAN.length - 1;
    if (done && !isLast) { setPhase('interlude'); return; }
    finishSeries(updated, true);
  };

  /**
   * Уход из серии посреди неё. Блоки пишем как есть — человек играл, это его
   * время, — но `series_complete: false` и НИКАКИХ разностей (§11.5).
   */
  const leaveSeries = (show: boolean) => {
    const run = seriesRunRef.current;
    if (!run) return;
    if (blockOpenRef.current && seriesState) {
      if (timerRef.current) clearInterval(timerRef.current);
      blockOpenRef.current = false;
      const updated = recordBlock(run, {
        key: blockKeyAt(seriesState.blockIndex),
        timeMs: gameNow() - blockStartRef.current,
        errors: seriesState.errors,
        done: false,
      });
      seriesRunRef.current = updated;
      finishSeries(updated, show);
      return;
    }
    finishSeries(run, show);
  };

  const onSeriesCell = (index: number) => {
    if (!seriesState) return;
    const step = pressSeriesCell(seriesState, index);
    if (step.result === 'hit') hapticSuccess();
    else if (step.result === 'miss') hapticError();
    setSeriesState(step.state);
    if (step.result === 'hit' && blockDone(step.state)) closeBlock(step.state, true);
  };

  /**
   * Врезка сама уводит в следующий блок — по ТОМУ ЖЕ полю (`nextBlock` переносит
   * его как есть). Часы блока стартуют здесь, поэтому 2,5 секунды чтения правила
   * в замер не попадают.
   */
  useEffect(() => {
    if (phase !== 'interlude' || !seriesState) return;
    const id = setTimeout(() => {
      setSeriesState(nextBlock(seriesState));
      beginBlockClock();
      setPhase('series');
    }, INTERLUDE_MS);
    return () => clearTimeout(id);
    // Врезка живёт ровно одну фазу: зависимости — фаза и состояние блока, часы
    // заводятся ВНУТРИ таймаута, поэтому больше эффекту ничего не нужно.
  }, [phase, seriesState]);

  // Зеркало состояния в ref — только для ухода с экрана: обработчик размонтажа
  // регистрируется один раз и до state текущего кадра иначе не дотянется.
  const seriesStateRef = useRef<SchulteSeriesState | null>(null);
  useEffect(() => { seriesStateRef.current = seriesState; }, [seriesState]);

  /**
   * УХОД МИМО КНОПОК (аппаратная «назад», переключение вкладки) серию не теряет:
   * блоки сыграны, это время человека. Пишем их так же, как при выходе кнопкой —
   * `series_complete: false` и без разностей. Состояние здесь не трогаем: экран
   * уже уходит, а `seriesRunRef` обнуляется в `finishSeries`, поэтому доигранная
   * серия вторую запись не получит.
   */
  useEffect(() => () => {
    const run = seriesRunRef.current;
    if (!run) return;
    const state = seriesStateRef.current;
    const partial = blockOpenRef.current && state
      ? recordBlock(run, {
        key: blockKeyAt(state.blockIndex),
        timeMs: gameNow() - blockStartRef.current,
        errors: state.errors,
        done: false,
      })
      : run;
    seriesRunRef.current = null;
    if (partial.blocks.length === 0) return;   // серию, которую не начинали, писать нечем
    saveSession({
      ...seriesSession(partial),
      passed: seriesComplete(partial),
      difficulty: `${partial.level}x${partial.level}`,
    }).catch(() => {});
  }, []);

  // Реролл позиций (не значений/цепочки поиска) после верного клика — «убегающая цель».
  const reshufflePositions = () => {
    setGrid((prevGrid) => {
      const positions = prevGrid.map((_, i) => i);
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      const newGrid = positions.map((p) => prevGrid[p]);
      if (cellColors.length === prevGrid.length) setCellColors(positions.map((p) => cellColors[p]));
      if (cellGroup.length === prevGrid.length) setCellGroup(positions.map((p) => cellGroup[p]));
      return newGrid;
    });
  };

  const handleGroupCellPress = async (value: number | string, index: number) => {
    const g = cellGroup[index];
    if (g !== activeGroup || value !== groupTargets[activeGroup]) {
      hapticError();
      setErrors((prev) => prev + 1);
      return;
    }
    hapticSuccess();
    const totalCells = gridSize * gridSize;
    const newTargets = [...groupTargets];
    newTargets[activeGroup] += 1;
    const totalDone = newTargets.reduce((s, tgt) => s + (tgt - 1), 0);
    setGroupTargets(newTargets);
    if (totalDone >= totalCells) {
      await finishRound(totalCells, errors);
      return;
    }
    let next = activeGroup;
    for (let step = 0; step < groupCount; step++) {
      next = (next + 1) % groupCount;
      if (newTargets[next] <= groupSizes[next]) break;
    }
    setActiveGroup(next);
    if (reshuffleOnClick) reshufflePositions();
  };

  const handleCellPress = async (value: number | string, index: number) => {
    if (groupCount > 1 && cellGroup.length > 0) { await handleGroupCellPress(value, index); return; }
    const expectedValue = sequence[currentIndex];

    if (value === expectedValue) {
      hapticSuccess();
      const totalCells = gridSize * gridSize;
      if (currentIndex === totalCells - 1) {
        await finishRound(totalCells, errors);
      } else {
        setCurrentIndex((prev) => prev + 1);
        if (reshuffleOnClick) reshufflePositions();
      }
    } else {
      hapticError();
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
  // Размер клетки считается ОТ СТОРОНЫ поля: у серии своя сторона (уровень серии),
  // и переписывать ту же арифметику второй раз значило бы развести их со временем.
  const cellSizeFor = (side: number): number => Math.min(
    (windowDimensions.width - 32 - (side - 1) * 4) / side,
    (windowDimensions.height - 230 - (side - 1) * 4) / side,
    120
  );
  const cellSize = cellSizeFor(gridSize);

  /**
   * С какого поля пойдёт серия и какие поля у блоков сейчас. Считается ДО входа,
   * потому что человеку это надо показать ЗАРАНЕЕ: старт с минимума молча
   * читается как откат прогресса (§12.5).
   */
  const seriesDoor = seriesEntry(seriesProgress, levelParams(lvl.level).gridSize);

  // v1.13.3: ScrollView вокруг configContainer — на Windows / маленьких экранах
  // кнопка «Старт» уходила за viewport, не достать. Schulte имеет 4+ optionCard
  // (Тип/Направление/Цвет/Размер) + hero + кнопка → больше чем 720px высоты часто.
  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface
        colors={GRADIENT as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.configCard}
      >
        <Ionicons name="grid" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('schulteTable')}</Text>
        <Text style={styles.configDesc}>{t('schulteTableDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="schulteIntroDesc" benefits={SCHULTE_BENEFITS} accent={GRADIENT[0]} />
      {!isPreset && (
        <GameModeSwitch mode={playMode} onChange={setPlayMode} colors={colors} accent={GRADIENT[0]} t={t} />
      )}
      {/* Подсказка «или настрой таблицу ниже и нажми Free play» убрана намеренно:
          с явным переключателем она объясняла бы уже несуществующий обходной путь. */}
      {(isPreset || playMode === 'levels') && (<>
        <LevelProgressMap bestLevel={lvl.best} gameId="schulte_table" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        {!isPreset && (
          <TouchableOpacity
            accessibilityRole="button"
            /* ⚠️ marginTop у startButton — 'auto': стиль рассчитан на кнопку, прибитую
               к низу длинного экрана настроек. У кнопки уровня настроек над ней нет,
               и 'auto' раздувал пустую полосу между тропинкой и кнопкой. */
            style={[styles.startButton, { marginTop: 8 }]}
            onPress={() => startGame(true)}>
            <LinearGradient colors={LEVEL_GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startButtonGradient}>
              <Ionicons name="flag" size={22} color={ON_LEVEL.color} />
              <Text style={[styles.startButtonText, { color: ON_LEVEL.color }]}>{t('lvlTargetBtn').replace('{n}', String(lvl.level))}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
        {/* СЕРИЯ БЛОКОВ (пилот §11). Под кнопкой — с какого поля она начнётся и
            какие поля у блоков сейчас: иначе старт с минимума читается как откат. */}
        {!isPreset && (
          <View>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.startButton, { marginTop: 8 }]}
              onPress={() => beginSeries()}>
              <GradientSurface
                colors={GRADIENT as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startButtonGradient}
              >
                <Ionicons name="layers-outline" size={22} color={ON_GRAD.color} />
                <Text style={styles.startButtonText}>{seriesStrings.entry}</Text>
              </GradientSurface>
            </TouchableOpacity>
            <Text style={[styles.seriesNote, { color: colors.text }]}>
              {interpolate(seriesStrings.startsAt, { size: seriesDoor.level })}
            </Text>
            <Text style={[styles.seriesNote, { color: colors.textSecondary }]}>
              {interpolate(seriesStrings.yourLevels, {
                order: `${seriesDoor.perBlock.order}×${seriesDoor.perBlock.order}`,
                alternate: `${seriesDoor.perBlock.alternate}×${seriesDoor.perBlock.alternate}`,
                sum: `${seriesDoor.perBlock.sum}×${seriesDoor.perBlock.sum}`,
              })}
            </Text>
          </View>
        )}
      </>)}
      <TouchableOpacity
        accessibilityRole="button" style={[styles.optionCard, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} onPress={() => setShowLeaderboard(true)}>
        <Ionicons name="trophy-outline" size={18} color={colors.text} />
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('schulteLeaderboard')}</Text>
      </TouchableOpacity>

      {(isPreset || playMode === 'free') && (<>
      {/* Content Mode Selection (Numbers/Letters) */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {t('label_type')}
        </Text>
        <View style={styles.optionButtons}>
          <TouchableOpacity
            accessibilityRole="button"
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
              color={contentMode === 'numbers' ? textOn(GRADIENT[0]) : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: contentMode === 'numbers' ? textOn(GRADIENT[0]) : colors.text },
              ]}
            >
              {t('label_digits_numbers')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
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
              color={contentMode === 'letters' ? textOn(GRADIENT[0]) : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: contentMode === 'letters' ? textOn(GRADIENT[0]) : colors.text },
              ]}
            >
              {t('label_letters')}
            </Text>
          </TouchableOpacity>
          {/* Schulte-Gorbov: chase 1, A, 2, B, 3, C... — самый сильный вариант */}
          <TouchableOpacity
            accessibilityRole="button"
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
              color={contentMode === 'mixed' ? textOn(GRADIENT[0]) : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: contentMode === 'mixed' ? textOn(GRADIENT[0]) : colors.text },
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
                  accessibilityRole="button"
                  key={id}
                  style={[
                    styles.sizeButton,
                    script === id && { backgroundColor: GRADIENT[0] },
                    script !== id && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                  onPress={() => setScript(id)}
                >
                  <Text style={[styles.sizeButtonText, { color: script === id ? textOn(GRADIENT[0]) : colors.text }]}>
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
              accessibilityRole="button"
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
                color={direction === 'forward' ? textOn(GRADIENT[0]) : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: direction === 'forward' ? textOn(GRADIENT[0]) : colors.text }]}>
                {contentMode === 'numbers'
                  ? '1 → 25'
                  : `${SCRIPTS[script].chars[0]} → ${SCRIPTS[script].chars[SCRIPTS[script].chars.length - 1]}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
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
                color={direction === 'backward' ? textOn(GRADIENT[0]) : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: direction === 'backward' ? textOn(GRADIENT[0]) : colors.text }]}>
                {contentMode === 'numbers'
                  ? '25 → 1'
                  : `${SCRIPTS[script].chars[SCRIPTS[script].chars.length - 1]} → ${SCRIPTS[script].chars[0]}`}
              </Text>
            </TouchableOpacity>
            {contentMode === 'numbers' && groupCount <= 1 && (
              <TouchableOpacity
                accessibilityRole="button"
                style={[
                  styles.modeButton,
                  direction === 'center-out' && { backgroundColor: GRADIENT[0] },
                  direction !== 'center-out' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setDirection('center-out')}
              >
                <Ionicons name="radio-button-on-outline" size={20} color={direction === 'center-out' ? textOn(GRADIENT[0]) : colors.text} />
                <Text style={[styles.modeButtonText, { color: direction === 'center-out' ? textOn(GRADIENT[0]) : colors.text }]}>
                  {t('schulteCenterOut')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
            {t('hint_backward_harder')}
          </Text>
        </View>
      )}

      {/* v1.116.0: Разделённое внимание — 2-4 группы своих счётчиков вперемешку (numbers-only) */}
      {contentMode === 'numbers' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('schulteDivided')}
          </Text>
          <View style={styles.optionButtons}>
            {[1, 2, 3, 4].map((gc) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={gc}
                style={[
                  styles.sizeButton,
                  groupCount === gc && { backgroundColor: GRADIENT[0] },
                  groupCount !== gc && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setGroupCount(gc)}
              >
                <Text style={[styles.sizeButtonText, { color: groupCount === gc ? textOn(GRADIENT[0]) : colors.text }]}>
                  {gc === 1 ? t('classicLabel') : `${gc}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
            {t('schulteDividedHint')}
          </Text>
        </View>
      )}

      {/* v1.116.0: «Убегающая цель» — реролл позиций после каждого верного клика */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {t('schulteMoving')}
        </Text>
        <View style={styles.optionButtons}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.modeButton, !reshuffleOnClick && { backgroundColor: GRADIENT[0] }, reshuffleOnClick && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => setReshuffleOnClick(false)}
          >
            <Text style={[styles.modeButtonText, { color: !reshuffleOnClick ? textOn(GRADIENT[0]) : colors.text }]}>{t('label_off')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.modeButton, reshuffleOnClick && { backgroundColor: GRADIENT[0] }, !reshuffleOnClick && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => setReshuffleOnClick(true)}
          >
            <Text style={[styles.modeButtonText, { color: reshuffleOnClick ? textOn(GRADIENT[0]) : colors.text }]}>{t('label_on')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
          {t('schulteMovingHint')}
        </Text>
      </View>

      {/* Size Selection */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('size')}</Text>
        <View style={styles.optionButtons}>
          {[5, 6, 7, 8, 9, 10].map((size) => {
            // Limit max size for letters mode based on selected script length
            const maxSize = maxSizeFor(contentMode);
            const modeDisabled = size > maxSize;
            // Level-progression lock (themed profiles only)
            const sizeKey = `${size}x${size}`;
            const levelLocked = isThemed && unlockedSet.size > 0 && !unlockedSet.has(sizeKey);
            const isDisabled = modeDisabled || levelLocked;

            return (
              <TouchableOpacity
                accessibilityRole="button"
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
                    { color: gridSize === size && !isDisabled ? textOn(GRADIENT[0]) : colors.text },
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

      {/* Color Mode Selection — скрыт в разделённом внимании (свой цвет=ID группы, не выбирается) */}
      {groupCount <= 1 && (
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
        <View style={styles.optionButtons}>
          <TouchableOpacity
            accessibilityRole="button"
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
              color={!colorMode ? textOn(GRADIENT[0]) : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: !colorMode ? textOn(GRADIENT[0]) : colors.text },
              ]}
            >
              {t('bwMode')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
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
              color={colorMode ? textOn(GRADIENT[0]) : colors.text}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: colorMode ? textOn(GRADIENT[0]) : colors.text },
              ]}
            >
              {t('colorMode')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      )}

      <TouchableOpacity
        accessibilityRole="button" style={[styles.startButton, !isPreset && { marginTop: 8 }]} onPress={() => startGame(false)}>
        <GradientSurface
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Ionicons name="play" size={24} color={ON_GRAD.color} />
          <Text style={styles.startButtonText}>{!isPreset ? t('freePlay') : t('start')}</Text>
        </GradientSurface>
      </TouchableOpacity>
      </>)}
    </ScrollView>
  );

  // playing-фаза — на едином каркасе GameShell (кнопочная миграция: сетка вписана в экран,
  // скролла нет; рестарт-кнопка переехала в правый слот шапки)
  const renderGame = () => {
    const isGroupMode = groupCount > 1 && cellGroup.length > 0;
    const currentTarget = isGroupMode ? groupTargets[activeGroup] : sequence[currentIndex];

    return (
      <GameShell
        title={t('schulteTable')}
        onBack={() => goBackOrHome()}
        headerRight={
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yNewTable')}
            style={[styles.backButton, { backgroundColor: colors.surface }]}
            onPress={() => setPhase('config')}
          >
            <Ionicons name="refresh" size={24} color={colors.text} />
          </TouchableOpacity>
        }
        stats={
          <View style={styles.gameHeader}>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('find')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isGroupMode && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS[activeGroup % COLORS.length] }} />}
                <Text style={[styles.statValue, { color: colors.text }]}>{currentTarget}</Text>
              </View>
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
        }
      >
        <View style={[
          styles.grid,
          { width: cellSize * gridSize + (gridSize - 1) * 4 }
        ]}>
            {grid.map((value, index) => {
              const isFound = isGroupMode
                ? (typeof value === 'number' && value < groupTargets[cellGroup[index]])
                : sequence.indexOf(value) < currentIndex;
              const backgroundColor = isGroupMode || colorMode
                ? cellColors[index]
                : isFound
                  ? colors.border
                  : colors.surface;

              return (
                <TouchableOpacity
                  accessibilityRole="button"
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
                  onPress={() => !isFound && handleCellPress(value, index)}
                  disabled={isFound}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.cellText,
                      {
                        fontSize: cellSize * 0.4,
                        color: isGroupMode || colorMode ? '#FFFFFF' : colors.text,
                      },
                    ]}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>
        {/* Строка «что делать»: без неё правило видно только в справке, а
            в справку во время партии не ходят. */}
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('schulteHint')}</Text>
      </GameShell>
    );
  };

  /**
   * БЛОК СЕРИИ. Сетка та же, что в обычной партии, но клетки берутся из
   * `seriesState.field` — ЕДИНСТВЕННОГО поля на все три блока. Меняется только
   * правило: что искать, говорит шапка, а как — строка под полем.
   */
  const renderSeries = () => {
    if (!seriesState) return null;
    const key = blockKeyAt(seriesState.blockIndex);
    const side = seriesState.field.size;
    const total = seriesState.field.cells.length;
    const cs = cellSizeFor(side);
    // Подпись искомого — ключ словаря, а не ветка с текстом: в блоке счёта ищут
    // СУММУ, которой на поле нет, и «Найдите: 26» читалось бы как обещание клетки.
    const targetLabelKey = key === 'sum' ? 'label_find_sum' : 'find';

    return (
      <GameShell
        title={seriesStrings.entry}
        onBack={() => { leaveSeries(false); goBackOrHome(); }}
        headerRight={
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yNewTable')}
            style={[styles.backButton, { backgroundColor: colors.surface }]}
            onPress={() => leaveSeries(true)}
          >
            <Ionicons name="refresh" size={24} color={colors.text} />
          </TouchableOpacity>
        }
        stats={
          <View style={styles.gameHeader}>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t(targetLabelKey)}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{blockTarget(seriesState)}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('time')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{formatTime(elapsedTime)}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('errors')}</Text>
              <Text style={[styles.statValue, { color: seriesState.errors > 0 ? colors.error : colors.text }]}>{seriesState.errors}</Text>
            </View>
          </View>
        }
      >
        <Text style={[styles.seriesBlockLine, { color: colors.textSecondary }]}>
          {`${interpolate(seriesStrings.blockOf, { n: seriesState.blockIndex + 1, total: SCHULTE_SERIES_PLAN.length })} · ${blockLabel(key)}`}
        </Text>
        <View style={[styles.grid, { width: cs * side + (side - 1) * 4 }]}>
          {seriesState.field.cells.map((value, index) => {
            const isTaken = seriesState.taken[index];
            // Первая клетка пары подсвечена: без этого человек не видит, что уже выбрал.
            const isPending = seriesState.pending === index;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                key={index}
                style={[
                  styles.cell,
                  {
                    width: cs,
                    height: cs,
                    backgroundColor: isPending ? GRADIENT[0] : isTaken ? colors.border : colors.surface,
                    opacity: isTaken ? 0.3 : 1,
                  },
                ]}
                onPress={() => !isTaken && onSeriesCell(index)}
                disabled={isTaken}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.cellText,
                    { fontSize: cs * 0.4, color: isPending ? textOn(GRADIENT[0]) : colors.text },
                  ]}
                >
                  {value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{blockRule(key, total)}</Text>
      </GameShell>
    );
  };

  /**
   * ВРЕЗКА между блоками. Её работа — назвать новое правило и сказать главное:
   * поле НЕ менялось. Без этой фразы смена правила читается как новая игра, и
   * серия распадается на три упражнения подряд.
   */
  const renderInterlude = () => {
    if (!seriesState) return null;
    const nextKey = blockKeyAt(seriesState.blockIndex + 1);
    const total = seriesState.field.cells.length;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.interlude}>
          <Ionicons name="swap-horizontal" size={44} color={GRADIENT[0]} />
          <Text style={[styles.interludeTitle, { color: colors.text }]}>{seriesStrings.ruleChanges}</Text>
          <Text style={[styles.interludeBlock, { color: colors.text }]}>{blockLabel(nextKey)}</Text>
          <Text style={[styles.interludeRule, { color: colors.textSecondary }]}>{blockRule(nextKey, total)}</Text>
          <Text style={[styles.interludeSame, { color: colors.textSecondary }]}>{seriesStrings.sameField}</Text>
        </View>
      </SafeAreaView>
    );
  };

  if (phase === 'playing') return renderGame();
  if (phase === 'series') return renderSeries();
  if (phase === 'interlude') return renderInterlude();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {phase === 'config' ? t('configureGame') : t('schulteTable')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      <LeaderboardModal
        visible={showLeaderboard} onClose={() => setShowLeaderboard(false)}
        gameId="schulte_table_5x5" language={language} colors={colors} gradient={GRADIENT}
        formatScore={(s) => `${s.toFixed(1)}s`}
      />
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="schulte_table"
          level={levelRef.current}
          passed={clearedPassed}
          stars={bossWon === true ? 3 : (errors === 0 ? 3 : errors <= 2 ? 2 : 1)}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          comparisonLine={resultBenchmark
            ? `${resultBenchmark.own.toFixed(1)} ${t('seconds')} · ${t(resultBenchmark.source === 'players' ? 'bestAmongPlayers' : 'personalBest')}: ${resultBenchmark.best.toFixed(1)} ${t('seconds')}`
            : undefined}
          onContinue={() => startGame(true)}
          onStop={() => setPhase('config')}
        />
      )}
      {/* РАЗБОР СЕРИИ. Главное здесь не очки, а две разности: T₂−T₁ и T₃−T₁.
          У неполной серии их нет ВООБЩЕ — вместо чисел говорим об этом прямо. */}
      {phase === 'seriesResult' && seriesFinished && (
        <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
          <GradientSurface
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.configCard}
          >
            <Ionicons name="layers-outline" size={44} color={ON_GRAD.color} />
            <Text style={styles.configTitle}>{seriesStrings.seriesDone}</Text>
          </GradientSurface>
          {(() => {
            const diffs = seriesDiffs(seriesFinished);
            if (!diffs) {
              return (
                <Text style={[styles.seriesNote, { color: colors.error }]}>{seriesStrings.notFinished}</Text>
              );
            }
            // Имена разностей собирает ядро из ключей блоков — не переписываем их строкой.
            const base = SCHULTE_SERIES_PLAN[0];
            const signed = (ms: number): string => `${ms > 0 ? '+' : ''}${(ms / 1000).toFixed(1)} ${t('seconds')}`;
            return (
              <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.seriesRow, { color: colors.text }]}>
                  {`${seriesStrings.speed}: ${(seriesFinished.blocks[0].timeMs / 1000).toFixed(1)} ${t('seconds')}`}
                </Text>
                <Text style={[styles.seriesRow, { color: colors.text }]}>
                  {`${seriesStrings.switchCost}: ${signed(diffs[`${SCHULTE_SERIES_PLAN[1]}_minus_${base}`])}`}
                </Text>
                <Text style={[styles.seriesRow, { color: colors.text }]}>
                  {`${seriesStrings.holdCost}: ${signed(diffs[`${SCHULTE_SERIES_PLAN[2]}_minus_${base}`])}`}
                </Text>
              </View>
            );
          })()}
          {seriesOutcome && (
            <Text style={[styles.seriesNote, { color: colors.textSecondary }]}>
              {seriesOutcome.raised
                ? interpolate(seriesStrings.levelUp, { size: seriesOutcome.nextLevel })
                : interpolate(seriesStrings.heldBy, {
                  block: blockLabel(seriesOutcome.weakest),
                  runs: Math.max(1, seriesOutcome.runsLeft),
                })}
            </Text>
          )}
          <TouchableOpacity
            accessibilityRole="button" style={[styles.startButton, { marginTop: 8 }]} onPress={() => beginSeries()}>
            <GradientSurface
              colors={GRADIENT as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButtonGradient}
            >
              <Ionicons name="refresh" size={22} color={ON_GRAD.color} />
              <Text style={styles.startButtonText}>{seriesStrings.again}</Text>
            </GradientSurface>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}
            onPress={() => setPhase('config')}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{seriesStrings.leave}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime}
          score={gridSize * gridSize - errors + (bossWon ? 5 : 0)}
          errors={errors}
          stars={bossWon === true ? 3 : undefined}
          gradient={GRADIENT}
          onPlayAgain={() => {
            setPhase('config');
          }}
          onGoHome={() => router.push('/')}
          shareText={t('schulteShare').replace(/\{g\}/g, String(gridSize)).replace('{t}', elapsedTime.toFixed(1))}
          sparkline={timeHistory.length >= 2 ? { history: timeHistory, current: elapsedTime, lowerIsBetter: true } : undefined}
          comparisonLine={resultBenchmark
            ? `${resultBenchmark.own.toFixed(1)} ${t('seconds')} · ${t(resultBenchmark.source === 'players' ? 'bestAmongPlayers' : 'personalBest')}: ${resultBenchmark.best.toFixed(1)} ${t('seconds')}`
            : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320, marginTop: 12 },
  // ── серия блоков ──
  seriesNote: { fontSize: 13, lineHeight: 18, marginBottom: 6, paddingHorizontal: 4 },
  seriesBlockLine: { fontSize: 13, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  seriesRow: { fontSize: 15, marginBottom: 6 },
  interlude: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  interludeTitle: { fontSize: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  interludeBlock: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  interludeRule: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
  interludeSame: { fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
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
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    // крупный системный шрифт: заголовок не ужимался и выдавливал кнопки хедера за край
    flexShrink: 1,
    minWidth: 0,
    marginHorizontal: 8,
  },
  placeholder: {
    width: 44,
  },
  configScroll: { flex: 1 },
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
    color: ON_GRAD.color,
  },
  configDesc: {
    fontSize: 14,
    color: ON_GRAD_SOFT,
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
  sizeButton: { minHeight: 48, justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 52,
    alignItems: 'center',
  },
  sizeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modeButton: { minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
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
    color: ON_GRAD.color,
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
