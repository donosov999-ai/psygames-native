/* psygames-game-proofreading · VER 2 · 22.08.2026 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { LANGUAGES, useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { SCRIPTS, SCRIPT_IDS, ScriptId } from '@/src/constants/scripts';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import {
  FILLWORDS_INK,
  FILLWORDS_LOCALES,
  applyTrace,
  createFillwordsSession,
  fillwordsLevel,
  generateFillwords,
  getFillwordsStrings,
  interpolate,
  isCleared,
  isFillwordsLocale,
  lettersLeft,
  stepTrace,
  takeHint,
  tintForFoundOrder,
  type FillwordsHint,
  type FillwordsPuzzle,
  type FillwordsSession,
} from '@/src/games/fillwords/core';

const GRADIENT = ['#a8edea', '#fed6e3'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.32 (норма AA 4.5), стало 11.12.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

const PROOFREADING_BENEFITS = [
  { icon: 'document-text-outline', textKey: 'benefitProofreading1' },
  { icon: 'eye-outline', textKey: 'benefitProofreading2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitProofreading3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

/**
 * ДВА ЗАДАНИЯ НА ОДНОМ ЭКРАНЕ: КОРРЕКТУРА И ФИЛВОРДЫ.
 *
 * ПОЧЕМУ ФИЛВОРДЫ ЖИВУТ ЗДЕСЬ, А НЕ ОТДЕЛЬНОЙ ИГРОЙ. Задача у них одна и та же:
 * СКАНИРОВАНИЕ БУКВЕННОГО ПОЛЯ. В корректуре человек ищет заданный знак среди
 * похожих, в филвордах — осмысленную цепочку среди тех же букв. Разное только
 * то, что считается целью; поле, размер, лимит времени, лесенка уровней и
 * бухгалтерия результата общие. Заводить вторую игру значило бы копировать
 * весь экран ради одной подмены правила — и потом чинить их по отдельности.
 *
 * ⚠️ ЭТО НЕ ТОТ ЖЕ ПЕРЕКЛЮЧАТЕЛЬ, ЧТО «УРОВНИ / СВОБОДНО». Здесь меняется
 * ЗАДАНИЕ, а не способ задать параметры: лесенка уровней работает в обоих
 * режимах и в обоих задаёт партию целиком. Поэтому общая панель
 * `GameModeSwitch` тут не при чём (реестр `game-mode-switch.test.ts` прямо
 * говорит, что этому экрану она не положена), а кнопки режима сделаны тем же
 * рядом, что и уже стоящий на экране выбор письменности.
 */
type TaskMode = 'letters' | 'fillwords';

/**
 * Подсказок на уровень филвордов. Три, и каждая идёт в звёзды наравне с
 * промахом: подсказка обязана стоить, иначе ею проходят уровень целиком, а
 * ценность прохождения обнуляется.
 */
const FILLWORDS_HINTS = 3;

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

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('proofreading');
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в блок «Об игре» (GameAbout);
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

  // ── Филворды ──────────────────────────────────────────────────────────────
  const fwStrings = getFillwordsStrings(language);
  /**
   * Есть ли словарь ЯЗЫКА ИНТЕРФЕЙСА. Нет — режим не предлагается вовсе, а
   * вместо кнопки человек читает, почему и на каких языках он есть. Показать
   * кнопку и выдать по ней пустое поле было бы хуже, чем не показывать её.
   */
  const fwAvailable = isFillwordsLocale(language);
  const [taskMode, setTaskMode] = useState<TaskMode>('letters');
  /** Зерно поля. Меняется на каждый новый раунд — иначе повтор уровня даст ту же раскладку. */
  const [fwSeed, setFwSeed] = useState(() => Math.floor(Math.random() * 1e9) + 1);
  const [fwSession, setFwSession] = useState<FillwordsSession | null>(null);
  /** Клетки, по которым сейчас ведут палец (черновик ответа, ещё не сдан). */
  const [fwTrace, setFwTrace] = useState<number[]>([]);
  const [fwHint, setFwHint] = useState<FillwordsHint | null>(null);
  // Рефы: обработчик жеста и колбэк таймера живут вне ре-рендеров — state в них устарел бы.
  const fwSessionRef = useRef<FillwordsSession | null>(null);
  const fwTraceRef = useRef<number[]>([]);
  const fwRoundRef = useRef(false);
  /** Двигался ли палец: тапы линию НАБИРАЮТ, а сдаёт её только протягивание. */
  const fwDragRef = useRef(false);

  /**
   * ПОЛЕ СОБИРАЕТСЯ ЗАРАНЕЕ, А НЕ ПО НАЖАТИЮ «НАЧАТЬ». Две причины, обе видны
   * человеку: на экране настройки показано ЧИСЛО СЛОВ этого уровня — а узнать
   * его можно только собрав раскладку; и сборка (перебор гамильтонова пути) не
   * попадает в первые секунды партии, когда уже идёт отсчёт времени.
   *
   * ⚠️ Здесь же граница честности: при `fwAvailable === false` поле не
   * собирается вовсе — `generateFillwords` на языке без словаря бросает, и
   * ловить это исключение молча значило бы вернуть тот самый пустой экран.
   */
  const fwPuzzle = useMemo<FillwordsPuzzle | null>(() => {
    if (!fwAvailable) return null;
    const cfg = fillwordsLevel(lvl.level);
    return generateFillwords({
      rows: cfg.rows,
      cols: cfg.cols,
      locale: language,
      seed: fwSeed,
      maxWordLen: cfg.maxWordLen,
    });
  }, [fwAvailable, language, lvl.level, fwSeed]);

  /** Языки, на которых словарь есть — их имена, а не коды: человеку читать. */
  const fwLangNames = FILLWORDS_LOCALES
    .map((code) => LANGUAGES.find((l) => l.code === code)?.name || code)
    .join(', ');

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
    /**
     * Филворды идут только в личной игре и только там, где есть словарь.
     *
     * ⚠️ ЗАРЯДКА ОСТАЁТСЯ НА БУКВАХ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Пресет зарядки
     * приходит со своими размерами поля и без лимита времени, а его сценарий
     * рассчитан по времени всей связки упражнений. Подменить ему задание значит
     * подменить длительность шага — человек получит зарядку, которая не влезает
     * в обещанные минуты.
     */
    const fillwordsRound = !isPreset && taskMode === 'fillwords' && fwPuzzle !== null;
    let r: number, c: number;
    if (fillwordsRound) {
      const puzzle = fwPuzzle as FillwordsPuzzle;
      const cfg = fillwordsLevel(lvl.level);
      r = cfg.rows; c = cfg.cols;
      setRows(r); setCols(c);
      timeLimitRef.current = cfg.timeLimitSec;
      minFoundPctRef.current = 1;              // поле разбирается целиком, порога «≥N%» тут нет
      const session = createFillwordsSession(puzzle);
      fwSessionRef.current = session;
      setFwSession(session);
      fwTraceRef.current = [];
      setFwTrace([]);
      setFwHint(null);
      targetTotalRef.current = puzzle.words.length;
      foundRef.current = 0;
    } else if (isPreset) {
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
    fwRoundRef.current = fillwordsRound;
    levelRef.current = lvl.level;
    rowsRef.current = r;
    colsRef.current = c;
    errorsRef.current = 0;
    finishedRef.current = false;
    if (!fillwordsRound) generateGrid(r, c);
    setErrors(0);
    setElapsedTime(0);
    setPhase('playing');
    startTimeRef.current = gameNow();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = (gameNow() - startTimeRef.current) / 1000;
      setElapsedTime(elapsed);
      // Лимит времени уровня: не успел — раунд закрывается с тем, что найдено
      if (timeLimitRef.current > 0 && elapsed >= timeLimitRef.current) finish();
    }, 100);
  };

  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const rawTime = (gameNow() - startTimeRef.current) / 1000;
    const finalTime = timeLimitRef.current > 0 ? Math.min(rawTime, timeLimitRef.current) : rawTime;
    setElapsedTime(finalTime);

    const total = targetTotalRef.current;
    const found = foundRef.current;
    const missed = Math.max(0, total - found);
    const errs = errorsRef.current;
    /** Подсказка — цена уровня: в звёздах она стоит столько же, сколько промах. */
    const hintsTaken = fwRoundRef.current && fwSessionRef.current ? fwSessionRef.current.hints : 0;
    /**
     * ПРОХОД УРОВНЯ СЧИТАЕТСЯ ПО-РАЗНОМУ, И ЭТО ГЛАВНОЕ ОТЛИЧИЕ ДВУХ ЗАДАНИЙ.
     *
     * В корректуре есть допуск: нашёл ≥N% целей — уровень взят. В филвордах
     * допуска нет и быть не может: поле либо разобрано ЦЕЛИКОМ, либо нет.
     * Оставшиеся буквы — это не «почти собрал», это нерешённое поле, и зачесть
     * его значило бы отменить единственное правило филвордов.
     */
    const passed = fwRoundRef.current
      ? fwSessionRef.current !== null && isCleared(fwSessionRef.current)
      : !isPreset && total > 0 && found >= Math.ceil(total * minFoundPctRef.current);
    // Звёзды: 0 промахов (пропуски+ложные клики+подсказки) = 3, ≤2 = 2, иначе 1
    const mistakes = missed + errs + hintsTaken;
    // Следующее поле — с новым зерном. Без этого повтор того же уровня выдавал бы
    // ту же раскладку, а вторая попытка превращалась бы в проверку памяти.
    if (fwRoundRef.current) setFwSeed(Math.floor(Math.random() * 1e9) + 1);
    setLastStars(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
    // Пресет зарядки — статистика в GameResult (уровень не трогаем).
    // Уровневый проход — всегда общий баннер LevelCleared: passed=true → следующий,
    // passed=false → «почти, ещё раз» с авто-рестартом того же (или пониженного) уровня.
    if (isPreset) {
      setPhase('result');
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
        setClearedPassed(true);
        setPhase('boss');
      } else {
        setClearedPassed(passed);
        setPhase('cleared');   // непрерывный поток без тупика
      }
    }

    try {
      await saveSession({
        passed,
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
          // Режим задания в разборе результатов: две разные задачи под одним game_type
          task_mode: fwRoundRef.current ? 'fillwords' : 'letters',
          hints: hintsTaken,
          letters_left: fwRoundRef.current && fwSessionRef.current ? lettersLeft(fwSessionRef.current) : 0,
        },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  const handleCellPress = (index: number) => {
    if (finishedRef.current || foundIndices.has(index)) return;

    if (targetIndices.has(index)) {
      hapticSuccess();
      const newFound = new Set(foundIndices);
      newFound.add(index);
      foundRef.current = newFound.size;
      setFoundIndices(newFound);

      // Check if all found — досрочное завершение
      if (newFound.size === targetIndices.size) finish();
    } else {
      hapticError();
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

  // ── Филворды: ведение пальца по буквам ────────────────────────────────────
  /** Идёт ли сейчас партия филвордов (решает, что рисовать в поле). */
  const fwPlaying = taskMode === 'fillwords' && !isPreset && fwSession !== null;

  /**
   * Клетка под пальцем. Шаг сетки равен `cellSize`: у клеток `margin: 1` внутри
   * этого шага, поэтому делить надо на шаг, а не на видимую ширину плитки —
   * иначе к правому краю накопится сдвиг на целую клетку.
   */
  const fwCellFromPoint = (x: number, y: number): number => {
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x / cellSize)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y / cellSize)));
    return row * cols + col;
  };

  /** Черновик линии держим в рефе И в state: реф читает жест, state рисует. */
  const fwSetTrace = (next: number[]) => { fwTraceRef.current = next; setFwTrace(next); };

  /**
   * Слово засчитывается В ТОТ ЖЕ МИГ, когда линия его накрыла, — не дожидаясь,
   * пока человек отпустит палец.
   *
   * ⚠️ Это безопасно ровно потому, что раскладка — РАЗБИЕНИЕ: клетки слов не
   * пересекаются, значит недостроенная линия одного слова физически не может
   * совпасть с полным путём другого. Будь раскладка «словами в шуме», ранний
   * зачёт съедал бы чужие буквы на полпути.
   */
  const fwCommit = (next: number[]) => {
    const session = fwSessionRef.current;
    if (!session) return;
    const step = applyTrace(session, next);
    if (!step.trace.ok) { fwSetTrace(next); return; }
    hapticSuccess();
    fwSessionRef.current = step.session;
    setFwSession(step.session);
    foundRef.current = step.session.found.length;
    fwSetTrace([]);
    const takenIndex = step.trace.wordIndex;
    // Подсказка гаснет вместе со словом, которое показывала.
    setFwHint((h) => (h && h.wordIndex === takenIndex ? null : h));
    if (isCleared(step.session)) finish();
  };

  /**
   * Один шаг линии, откуда бы он ни пришёл — от пальца или от тапа. Само
   * ПРАВИЛО шага живёт в ядре (`stepTrace`): экран только сообщает клетку и
   * решает, что делать с новым черновиком.
   */
  const fwStep = (cell: number) => {
    const session = fwSessionRef.current;
    const path = fwTraceRef.current;
    if (!session || finishedRef.current) return;
    const next = stepTrace(session, path, cell);
    if (next.length === path.length) return;         // шаг незаконный или на месте
    if (next.length < path.length) { fwSetTrace(next); return; }   // стёрли хвост
    fwCommit(next);
  };

  /**
   * ⚠️ ТАП ТОЖЕ ВЕДЁТ ЛИНИЮ, И ЭТО НЕ УКРАШЕНИЕ. Поле лежит в СКРОЛЛЯЩЕМСЯ
   * каркасе (`scrollableField`), а скролл и протягивание пальца спорят за один
   * и тот же жест. Там, где спор выиграет скролл, у человека останется рабочий
   * способ собрать слово: коснуться первой буквы, потом соседней, и так далее.
   */
  const fwBegin = (cell: number) => {
    const session = fwSessionRef.current;
    if (!session || finishedRef.current) return;
    const path = fwTraceRef.current;
    // Касание НЕ рядом с концом линии начинает новую: человек передумал и взялся
    // за другое слово, а не продолжает старое через полполя.
    if (path.length > 0 && stepTrace(session, path, cell).length !== path.length) { fwStep(cell); return; }
    fwSetTrace(session.owner[cell] === -1 ? [cell] : []);
  };

  const fwExtend = (cell: number) => {
    fwDragRef.current = true;
    fwStep(cell);
  };

  const fwRelease = () => {
    const session = fwSessionRef.current;
    const path = fwTraceRef.current;
    const dragged = fwDragRef.current;
    fwDragRef.current = false;
    // Линия, набранная ТАПАМИ, при отпускании не сдаётся: человек ещё набирает,
    // и штрафовать его за каждую промежуточную букву было бы наказанием за
    // выбранный способ ввода. Сданная линия — только протянутая пальцем.
    if (!dragged) return;
    fwSetTrace([]);
    if (!session || finishedRef.current || path.length < 2) return;
    const step = applyTrace(session, path);
    // Попадание уже засчитано в fwCommit по ходу ведения — сюда доходит только промах.
    if (!step.trace.ok && step.trace.reason === 'no-match') {
      hapticError();
      fwSessionRef.current = step.session;
      setFwSession(step.session);
      errorsRef.current = step.session.mistakes;
      setErrors(errorsRef.current);
    }
  };

  /**
   * ⚠️ Обработчик собирается на каждый рендер НАМЕРЕННО. Он замыкает геометрию
   * поля (`cellSize`, `cols`, `rows`), а она меняется при повороте экрана и на
   * новом уровне: запомненный однажды обработчик считал бы клетку по старому
   * размеру и попадал бы мимо букв.
   */
  const fwPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      fwDragRef.current = false;
      fwBegin(fwCellFromPoint(e.nativeEvent.locationX, e.nativeEvent.locationY));
    },
    onPanResponderMove: (e) => fwExtend(fwCellFromPoint(e.nativeEvent.locationX, e.nativeEvent.locationY)),
    onPanResponderRelease: fwRelease,
    onPanResponderTerminate: fwRelease,
    onPanResponderTerminationRequest: () => false,
  });

  const fwHintsLeft = Math.max(0, FILLWORDS_HINTS - (fwSession ? fwSession.hints : 0));
  const fwFound = fwSession ? fwSession.found.length : 0;
  const fwTotalWords = fwSession ? fwSession.puzzle.words.length : 0;
  const fwLettersLeft = fwSession ? lettersLeft(fwSession) : 0;

  const fwTakeHint = () => {
    const session = fwSessionRef.current;
    if (!session || finishedRef.current || session.hints >= FILLWORDS_HINTS) return;
    const taken = takeHint(session);
    fwSessionRef.current = taken.session;
    setFwSession(taken.session);
    setFwHint(taken.hint);
  };

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
          <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{t('proofreading')}</Text>
          <Text style={[styles.configDesc, { color: ON_GRAD_SOFT }]}>{t('proofreadingDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="proofreadingIntroDesc" benefits={PROOFREADING_BENEFITS} accent={GRADIENT[0]} />

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {taskMode === 'fillwords' ? fwStrings.rules : t('desc_proofreading')}
          </Text>
        </View>

        {/* Задание: искать знак (корректура) или слово (филворды). Ряд кнопок — тот
            же, что у письменностей ниже: на этом экране режимы всегда так и выбирали. */}
        {fwAvailable ? (
          <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
            <View style={styles.optionButtons}>
              {(['letters', 'fillwords'] as const).map((m) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: taskMode === m }}
                  key={m}
                  style={[
                    styles.sizeButton,
                    taskMode === m && { backgroundColor: GRADIENT[0] },
                    taskMode !== m && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                  onPress={() => setTaskMode(m)}
                >
                  <Text style={[styles.sizeButtonText, { color: taskMode === m ? '#333' : colors.text }]}>
                    {m === 'fillwords' ? fwStrings.modeName : t('proofreading')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          /* 🔴 ЧЕСТНЫЙ ОТКАЗ ВМЕСТО ПУСТОГО ЭКРАНА. Филворды живут на словах, а
             словарь есть не на всех двенадцати языках. Молча спрятать режим —
             значит оставить человека гадать, почему у соседа он есть; показать
             кнопку и выдать пустое поле — ещё хуже. Пишем прямо: чего не хватает
             и где режим уже работает. */
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="language-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {interpolate(fwStrings.noDictionary, { langs: fwLangNames })}
            </Text>
          </View>
        )}

        {/* Скрипт-режимы (Полиглот v1.27.0): 6 письменностей + цифры.
            У филвордов письменность задаёт язык слов, а не выбор человека, — ряд прячем. */}
        {taskMode === 'letters' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('scriptLabel')}
          </Text>
          <View style={styles.optionButtons}>
            {([...SCRIPT_IDS, 'digits'] as const).map((m) => (
              <TouchableOpacity
                accessibilityRole="button"
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
        )}

        {/* Уровневый режим вместо ручных селекторов строк/колонок (паттерн cpt/simon) */}
        <LevelProgressMap bestLevel={lvl.best} gameId="proofreading" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {taskMode === 'fillwords' && fwPuzzle
              ? interpolate(fwStrings.levelLine, {
                rows: fwPuzzle.rows,
                cols: fwPuzzle.cols,
                words: fwPuzzle.words.length,
                sec: fillwordsLevel(lvl.level).timeLimitSec,
              })
              : t('proofLvlParams').replace('{r}', String(p.rows)).replace('{c}', String(p.cols)).replace('{w}', String(p.timeLimitSec))}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {taskMode === 'fillwords'
              ? fwStrings.pass
              : t('proofPass').replace('{p}', String(Math.round(p.minFoundPct * 100)))}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          accessibilityRole="button" style={styles.startButton} onPress={startGame}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startButtonGradient}
          >
            <Ionicons name="play" size={24} color="#333" />
            <Text style={[styles.startButtonText, { color: ON_GRAD.color }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
    );
  };

  // playing-фаза — на едином каркасе GameShell (сетка букв в скролл-поле, кнопок действий нет)
  const renderGame = () => (
    <GameShell
      title={t('proofreading')}
      onBack={() => goBackOrHome()}
      scrollableField
      headerActions={fwPlaying ? (
        /* Подсказка — СЛУЖЕБНОЕ действие (тратит ресурс уровня), поэтому она в
           шапке, а не в нижней полосе: правило слотов каркаса, см. GameShell. */
        <GameAuxBar>
          <GameAuxAction
            icon="bulb-outline" tint="#0d9488"
            label={t('btn_hint')} count={fwHintsLeft}
            disabled={fwHintsLeft === 0} onPress={fwTakeHint}
          />
        </GameAuxBar>
      ) : undefined}
      stats={
        <View style={styles.gameHeader}>
          {fwPlaying ? (
            /* Числа шапки подписаны словами из общего словаря: «Слова 3/7»,
               «Буквы 18». Своих ключей на это не заводим — эти уже переведены. */
            <View style={[styles.targetBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.targetLabel, { color: colors.text }]}>{t('label_words')}</Text>
              <Text style={[styles.fwCount, { color: colors.text }]}>{fwFound}/{fwTotalWords}</Text>
              <Text style={[styles.targetLabel, { color: colors.text }]}>{t('label_letters')}</Text>
              <Text style={[styles.fwCount, { color: colors.text }]}>{fwLettersLeft}</Text>
            </View>
          ) : (
          <View style={[styles.targetBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.targetLabel, { color: colors.text }]}>{t('find')}:</Text>
            {targetLetters.map((tl, i) => (
              <View key={i} style={[styles.targetChip, { backgroundColor: i === 0 ? '#34d399' : '#fbbf24' }]}>
                <Text style={styles.targetChipText}>{tl}</Text>
              </View>
            ))}
            <Text style={[styles.targetCount, { color: colors.textSecondary }]}>
              {t('label_found')} {foundIndices.size}/{targetIndices.size}
            </Text>
          </View>
          )}
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Ionicons name="time-outline" size={18} color={colors.text} />
            {/* На уровне — обратный отсчёт лимита (красный на последних 10с); в пресете — секундомер */}
            <Text style={[styles.timerText, {
              color: timeLimitRef.current > 0 && timeLimitRef.current - elapsedTime <= 10 ? '#f43f5e' : colors.text,
            }]}>
              {timeLimitRef.current > 0
                ? `${t('timeLeftLabel')} ${Math.max(0, Math.ceil(timeLimitRef.current - elapsedTime))}${t('secShort')}`
                : `${t('time')} ${Math.floor(elapsedTime)}${t('secShort')}`}
            </Text>
            {errors > 0 && (
              <Text style={[styles.timerText, { color: '#f43f5e' }]}>{t('hud_errors')} {errors}</Text>
            )}
          </View>
        </View>
      }
    >
      {fwPlaying ? (
        <View style={styles.fwField}>
          {/* Строка «что делать» — над полем, как у лабораторных модулей. */}
          <Text style={[styles.fwTask, { color: colors.textSecondary }]}>{fwStrings.task}</Text>
          <View style={[styles.gridContainer, { width: gridWidth }]} {...fwPan.panHandlers}>
            {(fwSession as FillwordsSession).puzzle.letters.map((letter, index) => {
              const session = fwSession as FillwordsSession;
              const owner = session.owner[index];
              const traced = fwTrace.indexOf(index) >= 0;
              const hinted = fwHint !== null && fwHint.cells.indexOf(index) >= 0;
              // Разобранное слово остаётся на поле СВОИМ цветом: видно, что уже
              // съедено, и не приходится держать это в голове.
              const takenTint = owner >= 0 ? tintForFoundOrder(session.found.indexOf(owner)) : colors.surface;
              return (
                <View
                  key={index}
                  accessible
                  accessibilityLabel={letter}
                  style={[
                    styles.cell,
                    {
                      width: cellSize - 2,
                      height: cellSize - 2,
                      backgroundColor: traced ? GRADIENT[0] : takenTint,
                      borderWidth: hinted ? 2 : 0,
                      borderColor: '#b45309',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.cellText,
                      {
                        fontSize: Math.min(cellSize * 0.5, 24),
                        color: traced ? '#333' : owner >= 0 ? FILLWORDS_INK : colors.text,
                        fontWeight: traced || owner >= 0 ? '700' : '500',
                      },
                    ]}
                  >
                    {letter}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
      <View style={[styles.gridContainer, { width: gridWidth }]}>
        {grid.map((letter, index) => {
          const isTarget = targetIndices.has(index);
          const isFound = foundIndices.has(index);

          return (
            <TouchableOpacity
              accessibilityRole="button"
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
      )}
    </GameShell>
  );


  if (phase === 'playing') return renderGame();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('proofreading')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'oddletter', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={(win) => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
    borderRadius: 16,
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
    height: 48,
    paddingHorizontal: 8,
    borderRadius: 16,
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
  // alignSelf: сетка с явной width центрируется в скролл-поле каркаса (у него нет alignItems)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: 1,
    borderRadius: 4,
  },
  cellText: {},
  // Филворды: поле с строкой задания над сеткой
  fwField: { alignItems: 'center', width: '100%' },
  fwTask: { fontSize: 14, textAlign: 'center', marginBottom: 8, paddingHorizontal: 8 },
  fwCount: { fontSize: 16, fontWeight: '700' },
});
