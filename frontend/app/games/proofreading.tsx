/* psygames-game-proofreading · VER 4 · 23.08.2026 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  PanResponder,
  Image,
} from 'react-native';
import { превьюРежимаКорректуры } from '@/src/games/fillwords/core/modeThumbs';
import { useScreenSize } from '@/src/hooks/useScreenWidth';
import { ширинаПодПоле } from '@/src/games/fillwords/core/generator';
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
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { capPresetByLevel } from '@/src/services/presetCap';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/src/contexts/ProfileContext';
import {
  recordBlock,
  seriesComplete,
  seriesDiffs,
  seriesSession,
  startSeries,
  type SeriesRun,
} from '@/src/services/series';
import {
  EMPTY_PROOF_PROGRESS,
  PROOF_SENSE_LOCALES,
  PROOF_SERIES_PLAN,
  afterProofSeries,
  blockDone,
  blockKeyAt,
  blockStep,
  blockStepsTotal,
  buildProofField,
  getProofSeriesStrings,
  isSenseLocale,
  nextBlock,
  openBlock,
  parseProofProgress,
  pressSignCell,
  pressWordTrace,
  proofSeriesEntry,
  type ProofBlockKey,
  type ProofField,
  type ProofSeriesOutcome,
  type ProofSeriesProgress,
  type ProofSeriesState,
} from '@/src/games/proofreading/core';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

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

/**
 * `series` — блок серии на общем поле · `interlude` — врезка со сменой правила
 * между блоками · `seriesResult` — разбор с разностями. Обычная партия
 * ('playing') их не видит: у неё своя лесенка и свой лимит времени.
 */
type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result'
  | 'series' | 'interlude' | 'seriesResult';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

/**
 * Врезка между блоками: назвать новое правило и сказать, что поле прежнее.
 * Часы блока стартуют ПОСЛЕ неё, поэтому чтение правила в замер не попадает.
 */
const INTERLUDE_MS = 2500;

/**
 * Серия пишется ОТДЕЛЬНЫМ типом партии. Смешать её с обычной корректурой нельзя:
 * там одно поле и один результат, здесь три блока и две разности — сложенные в
 * одну кучу, они дали бы среднее по несравнимым величинам.
 */
/**
 * Случайное — ВНЕ компонента.
 *
 * ⚠️ `Math.random()` стоял прямо в теле компонента (выбор целевых букв, досев
 * целей, зерно раскладки), и линтер правил React звал это «impure function
 * during render»: он не может доказать, что тело не вызовется при отрисовке, а
 * непредсказуемый результат в рендере даёт разное дерево на одних и тех же
 * пропах. Сюда рендер не заглядывает, поэтому вопрос снимается на корню.
 *
 * ⚠️ Это НЕ генератор поля: тот детерминирован зерном (`fwSeed`) и живёт в ядре.
 * Здесь только выбор самого зерна и целевых букв корректуры.
 */
function случайноеЦелое(предел: number): number {
  return Math.floor(Math.random() * предел);
}
/** `ArrayLike`, а не массив: алфавит корректуры — СТРОКА, и индексируется так же. */
function случайныйИз<T>(список: ArrayLike<T>): T {
  return список[случайноеЦелое(список.length)];
}

const SERIES_GAME_TYPE = 'proofreading_series';

/**
 * Ключ настройки «показывать слова рядом с полем».
 *
 * ⚠️ ЭТО ВЫБОР ВИДА УПРАЖНЕНИЯ, А НЕ ТУМБЛЕР УДОБСТВА, и потому он обязан
 * переживать выход с экрана. Классические филворды меряют ПОРОЖДЕНИЕ («какие
 * слова тут вообще могут быть»), со списком — УЗНАВАНИЕ («где именно лежит вот
 * это»). Человек, выбравший второе, выбрал другую игру; заставлять его отмечать
 * это заново при каждом заходе — то же самое, что каждый раз сбрасывать язык.
 *
 * Раньше жил в useState(false) и слетал при каждом входе в настройки: замер
 * 06.09.2026 — тумблер стоял на своём месте, а после выхода из партии
 * возвращался в «выкл» без единого касания.
 */
const СПИСОК_КЛЮЧ = 'psygames_fillwords_wordlist';

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
/**
 * ⚠️ ПОДСКАЗКИ БОЛЬШЕ НЕ КОНСТАНТА — ОНИ СТУПЕНЬ ЛЕСТНИЦЫ.
 *
 * Здесь стояло `const FILLWORDS_HINTS = 3` — одно число на все уровни. Константа
 * на экране осью быть не может: уровень о ней не знает, и лестница ею не растёт.
 * С 06.09.2026 число приходит из `fillwordsLevel(...).hints` и убывает 3 → 0
 * после того, как исчерпаны объёмные оси и скорость (см. шапку `fillwordsLevel`).
 *
 * Значение ниже осталось только как запас для случаев, где уровня нет вовсе.
 */
const FILLWORDS_HINTS_ЗАПАС = 3;
/** Сколько подсказок положено на этом уровне. */
function подсказокНаУровне(level: number): number {
  const c = fillwordsLevel(level);
  return typeof c.hints === 'number' ? c.hints : FILLWORDS_HINTS_ЗАПАС;
}

// Уровень 1..15 (паттерн cpt/simon): ручные селекторы строк/колонок заменены
// уровневым режимом. Ось усложнения:
//   - объём «текста» растёт: 8×8 (64 клетки) → 16×12 (192 клетки)
//   - скорость сканирования: бюджет времени на клетку 1.0с → 0.45с (лимит раунда ~60-90с)
//   - допуск пропущенных целей снижается: найти ≥80% → ≥90% → 100% целей до конца времени
/** Экспортирована для гейта `search-ladder-label`: объявленный потолок сверяется ИСПОЛНЕНИЕМ этой функции. */
export function levelParams(level: number): { rows: number; cols: number; timeLimitSec: number; minFoundPct: number } {
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
  const { profile } = useProfile();
  const router = useRouter();
  /*
    🔴 РАЗМЕР ЭКРАНА — ЧЕРЕЗ ХУК, А НЕ НАПРЯМУЮ.

    Голый `useWindowDimensions()` в веб-сборке (а Android и iOS у нас WebView,
    то есть это и телефон) на ПЕРВОМ кадре отдаёт 0 и обновляется только по
    событию `resize`, которого при обычной загрузке экрана не бывает. Ноль
    уезжает в расчёт клетки и запекается там. Здесь его до сих пор гасил только
    нижний ограничитель `Math.max(22, ...)` — то есть случайно, а не по замыслу:
    ровно так эта ловушка описана в шапке самого хука, где за один день 19.08.2026
    она сработала дважды на других экранах.

    `useScreenSize()` спрашивает настоящий размер у окна, когда система его ещё
    не сообщила, и отдаёт константы телефона лишь там, где `window` нет вовсе.
  */
  const { w: width, h: height } = useScreenSize();

  const { isPreset, autostart, str, num, bool, isCalm } = useGamePreset();
  /**
   * Зарядка может попросить именно СЕРИЮ: `?series=1`.
   *
   * 🔴 БЕЗ ЭТОГО СЕРИЮ КОРРЕКТУРКИ НЕЛЬЗЯ БЫЛО ЗАПУСТИТЬ ИЗВНЕ ВООБЩЕ — только
   * руками с экрана игры. У Шульте параметр был с первого дня, у корректурки его
   * забыли, и «Зарядка» вела в обычную партию вместо серии. Добавлено 23.08.2026
   * по замечанию Дениса: «а он где вообще?».
   */
  const seriesPreset = bool('series');
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('proofreading');
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  // ⚠️ Глушилка правила деталей не принимает: «react-hooks/exhaustive-deps —
  // пресет → авто-старт» читается линтером как ИМЯ правила целиком, такого
  // правила нет, и вся строка превращалась в ошибку линта на ровном месте.
  // Пояснение живёт комментарием, а глушить здесь нечего.
  // ⚠️ Серия ждёт ЕЩЁ И своего прогресса: он приезжает из хранилища асинхронно, а
  // стартовый размер поля выводится из него. Стартовать раньше — сесть не на своё поле.
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
  /**
   * 🔴 ЛИНИЯ ГНЁТСЯ ИЛИ ИДЁТ ПРЯМО — ЭТО ОСЬ СЛОЖНОСТИ, А НЕ УКРАШЕНИЕ.
   * Замер: пространство поиска (число самонепересекающихся путей длины L из
   * середины поля 12×9) при запрете диагоналей падает с 444 876 до 1978 на слове
   * из восьми букв — в 225 раз. Прямые линии превращают филворд в «Поиск слов»:
   * сканирование лучами вместо прослеживания змейки.
   */
  const [диагонали, setДиагонали] = useState(true);
  /** Зерно поля. Меняется на каждый новый раунд — иначе повтор уровня даст ту же раскладку. */
  const [fwSeed, setFwSeed] = useState(() => Math.floor(Math.random() * 1e9) + 1);
  const [fwSession, setFwSession] = useState<FillwordsSession | null>(null);
  /** Клетки, по которым сейчас ведут палец (черновик ответа, ещё не сдан). */
  const [fwTrace, setFwTrace] = useState<number[]>([]);
  /**
   * Показывать ли список слов над полем — просьба Дениса 06.09.2026. Пояснение,
   * почему это другой вид упражнения, а не поблажка, — у самой разметки списка.
   */
  const [показыватьСлова, setПоказыватьСлова] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(СПИСОК_КЛЮЧ)
      .then((v) => { if (v === '1') setПоказыватьСлова(true); })
      .catch(() => {});
  }, []);
  const переключитьСписок = (v: boolean) => {
    setПоказыватьСлова(v);
    AsyncStorage.setItem(СПИСОК_КЛЮЧ, v ? '1' : '0').catch(() => {});
  };
  const [fwHint, setFwHint] = useState<FillwordsHint | null>(null);
  const [serHint, setSerHint] = useState<FillwordsHint | null>(null);
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
      minWordLen: cfg.minWordLen,
      диагонали,
    });
  }, [fwAvailable, language, lvl.level, fwSeed, диагонали]);

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
      случайныйИз(alphabet),
      случайныйИз(alphabet),
    ];
    while (targets[1] === targets[0]) {
      targets[1] = случайныйИз(alphabet);
    }

    // Гарантия минимума целей: на больших алфавитах (иероглифы/кана) цели могли
    // выпасть 0-2 раза — критерий «найти ≥N% целей» терял смысл, а при 0 раунд
    // не завершался вовсе. Досеиваем цели в случайные не-целевые клетки.
    const minTargets = Math.max(4, Math.round(totalCells / 16));
    let present = letters.filter((l) => targets.includes(l)).length;
    while (present < minTargets) {
      const idx = случайноеЦелое(totalCells);
      if (!targets.includes(letters[idx])) {
        letters[idx] = targets[случайноеЦелое(2)];
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
      /*
        🔴 СТРОГИЙ ПОРЯДОК ПЕРЕДАЁТСЯ ТОЛЬКО ПРИ ПОКАЗАННОМ СПИСКЕ.

        Уровень ПРЕДЛАГАЕТ порядок сдачи (шестая ось лестницы), но требовать
        «следующее по списку» у человека, который списка не видит, — это
        угадайка, а не трудность: он не может знать, какое слово следующее.
        Поэтому без списка остаётся `свободно`, и уровень для него растёт
        предыдущими осями. Это та же развилка, что и у самого списка: со списком
        это ДРУГОЕ упражнение, а не то же с поблажкой.
      */
      const session = createFillwordsSession(
        puzzle,
        порядокДляПартии(fillwordsLevel(lvl.level).порядок, показыватьСлова),
      );
      fwSessionRef.current = session;
      setFwSession(session);
      fwTraceRef.current = [];
      setFwTrace([]);
      setFwHint(null);
      targetTotalRef.current = puzzle.words.length;
      foundRef.current = 0;
    } else if (isPreset) {
      /**
       * Пресет зарядки: размеры из warmup-параметров, без лимита времени.
       *
       * ⚠️ Но не выше освоенного больше чем на шаг (см. `presetCap`): в программах
       * стоит поле 12×10, а лесенка на первом уровне даёт 8×8 — вчетверо меньше
       * знаков, и на пресете новичок получал стену вместо пробы.
       */
      const пл = levelParams(lvl.level);
      r = capPresetByLevel({ want: rows, atLevel: пл.rows, atTop: пл.rows >= 16 });
      c = capPresetByLevel({ want: cols, atLevel: пл.cols, atTop: пл.cols >= 12 });
      setRows(r); setCols(c);
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
    if (fwRoundRef.current) setFwSeed(случайноеЦелое(1e9) + 1);
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
  /**
   * 🔴 СПИСОК СЛОВ СТОИТ СБОКУ, А НЕ НАД ПОЛЕМ — И ЭТО ЗАМЕР, А НЕ ВКУС.
   *
   * 📍 Над полем список съедает ВЫСОТУ: на экране 320×568 он забирает около 126
   * точек из 358, и полю остаётся 232 — это десять строк при клетке 22. Сбоку он
   * забирает ШИРИНУ, которой у поля с запасом: 90 точек оставляют 206, то есть
   * девять столбцов, а строк снова шестнадцать. Клеток выходит 144 против 90 —
   * поле больше в полтора раза при том же списке.
   *
   * Так же устроено у образца жанра: список сбоку и сгруппирован по длине.
   */
  const списокСбоку = показыватьСлова && taskMode === 'fillwords';
  const ШИРИНА_СПИСКА = Math.min(120, Math.round(width * 0.3));
  // Расчёт живёт в ядре, а не здесь: иначе проба сверяет свою копию формулы сама
  // с собой и не замечает, что экран её не применил.
  const containerW = ширинаПодПоле(width, списокСбоку);
  const widthBased = Math.floor(containerW / cols);
  const heightBased = Math.floor(availableHeight / rows);
  const cellSize = Math.max(22, Math.min(widthBased, heightBased, 72));   // clamp 22-72px
  const gridWidth = cellSize * cols;

  // ── Филворды: ведение пальца по буквам ────────────────────────────────────
  /** Идёт ли сейчас партия филвордов (решает, что рисовать в поле). */
  const fwPlaying = taskMode === 'fillwords' && !isPreset && fwSession !== null;

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


  const fwHintsLeft = Math.max(0, подсказокНаУровне(lvl.level) - (fwSession ? fwSession.hints : 0));
  const fwFound = fwSession ? fwSession.found.length : 0;
  const fwTotalWords = fwSession ? fwSession.puzzle.words.length : 0;
  const fwLettersLeft = fwSession ? lettersLeft(fwSession) : 0;

  const fwTakeHint = () => {
    const session = fwSessionRef.current;
    if (!session || finishedRef.current || session.hints >= подсказокНаУровне(lvl.level)) return;
    const taken = takeHint(session);
    fwSessionRef.current = taken.session;
    setFwSession(taken.session);
    setFwHint(taken.hint);
  };

  // ── Серия из трёх блоков: знак → слово → смысл ────────────────────────────
  /**
   * ТРИ ЗАДАНИЯ НА ОДНОМ И ТОМ ЖЕ ПОЛЕ БУКВ, И В ЭТОМ ВЕСЬ ЗАМЕР.
   *
   * 🔴 Аддитивный метод (Стернберг): каждый следующий блок добавляет РОВНО ОДНО
   * требование, и тогда разность времён — цена добавленного звена:
   *   знак  → T₁ зрительный поиск
   *   слово → T₂ − T₁ цена сегментации (границы слова в буквенном шуме)
   *   смысл → T₃ − T₂ цена семантической классификации
   * Всё это держится на том, что поле ОДНО. Поэтому его собирает `beginSeries`
   * ровно один раз, а переходы между блоками идут через `nextBlock` ядра — там
   * генератора нет вовсе, переносить нечего, кроме уже собранного поля.
   */
  const seriesStrings = getProofSeriesStrings(language);
  /**
   * Есть ли у языка интерфейса словарь С КАТЕГОРИЯМИ. Нет — серия не
   * предлагается вовсе, а вместо кнопки человек читает, чего не хватает и где
   * режим уже работает. Спрятать кнопку молча — оставить его гадать.
   */
  const senseAvailable = isSenseLocale(language);
  const senseLangNames = PROOF_SENSE_LOCALES
    .map((code) => LANGUAGES.find((l) => l.code === code)?.name || code)
    .join(', ');

  const [seriesState, setSeriesState] = useState<ProofSeriesState | null>(null);

  /**
   * 🔴 ПОДСКАЗКА В СЕРИИ. Её тут не было вовсе: у серии свой `GameShell`, и слот
   * `headerActions` в нём просто не заполняли. Человек, вставший на поле букв, не имел
   * НИКАКОГО хода — только смотреть. Репорт Дениса 23.08.2026: «непонятно, сколько слов
   * ждёт система, нет подсказок решения — короче, не доделано явно».
   * Механика та же, что в одиночной игре (`takeHint`): показываются ДВЕ клетки самого
   * короткого ненайденного слова — направление змейки, дальше человек ведёт сам.
   * ⚠️ Взятая подсказка идёт в `session.hints` того же объекта, что и замер блока,
   * поэтому в итог серии она попадает сама — отдельного счётчика заводить не нужно.
   */
  const serHintsLeft = Math.max(0, подсказокНаУровне(lvl.level) - (seriesState ? seriesState.session.hints : 0));
  const serTakeHint = () => {
    if (!seriesState || serHintsLeft === 0) return;
    const taken = takeHint(seriesState.session);
    if (!taken.hint) return;
    // ⚠️ Через `setSeries`, а не `setSeriesState`: обёртка держит ещё и реф, который
    // читают обработчики жеста. Мимо неё реф остался бы со старой партией.
    setSeries({ ...seriesState, session: taken.session });
    setSerHint(taken.hint);
  };

  const [seriesProgress, setSeriesProgress] = useState<ProofSeriesProgress>(EMPTY_PROOF_PROGRESS);
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [seriesOutcome, setSeriesOutcome] = useState<ProofSeriesOutcome | null>(null);
  const [seriesFinished, setSeriesFinished] = useState<SeriesRun | null>(null);
  /**
   * Зерно поля серии. Живёт состоянием и сдвигается ПОСЛЕ каждой серии: иначе
   * второй прогон подряд выдал бы ту же раскладку, и вместо замера вышла бы
   * проверка памяти на уже разобранное поле.
   */
  const [seriesSeed, setSeriesSeed] = useState(() => Math.floor(Math.random() * 1e9) + 1);
  /** Клетки, по которым сейчас ведут линию в блоках «Слово» и «Смысл». */
  const [serTrace, setSerTrace] = useState<number[]>([]);
  // Рефы: обработчики жеста и колбэк часов живут вне ре-рендеров — state в них
  // устарел бы. Состояние блока зеркалим в реф на КАЖДОЙ записи, а не эффектом:
  // палец успевает дать второй шаг раньше, чем эффект догонит кадр.
  const seriesStateRef = useRef<ProofSeriesState | null>(null);
  const seriesRunRef = useRef<SeriesRun | null>(null);
  const blockStartRef = useRef(0);
  const blockOpenRef = useRef(false);
  const serTraceRef = useRef<number[]>([]);
  const serDragRef = useRef(false);

  const seriesKey = `psygames_proofreading_series_${(profile as any)?.id ?? 'default'}`;
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(seriesKey)
      .then((raw) => { if (!alive) return; setSeriesProgress(parseProofProgress(raw)); setSeriesLoaded(true); })
      .catch(() => { if (alive) setSeriesLoaded(true); });
    return () => { alive = false; };
  }, [seriesKey]);

  /** Какое поле человек уже держит в одиночных филвордах — стартовый уровень блока «Слово». */
  const ladderSize = (): number => fillwordsLevel(lvl.level).rows;
  const seriesDoor = proofSeriesEntry(seriesProgress, ladderSize());

  const blockLabel = (key: ProofBlockKey): string => (
    key === 'sign' ? seriesStrings.blockSign
      : key === 'word' ? seriesStrings.blockWord
        : seriesStrings.blockSense
  );

  /**
   * Правило блока. Имя категории берётся из ОБЩЕГО словаря (`catVocab_<cat>`):
   * «Животные» и «Еда» там уже переведены на двенадцать языков, и заводить
   * второй такой список в модуле значило бы поссорить их при первой же правке.
   */
  const blockRule = (key: ProofBlockKey, field: ProofField): string => interpolate(
    key === 'sign' ? seriesStrings.ruleSign
      : key === 'word' ? seriesStrings.ruleWord
        : seriesStrings.ruleSense,
    { sign: field.signs.join(' · '), cat: t(`catVocab_${field.category}`) },
  );

  const setSeries = (next: ProofSeriesState | null) => {
    // Подсказка гаснет, когда её слово собрано или начался другой блок: висящая
    // подсветка на уже закрытых клетках читалась бы как «здесь ещё что-то есть».
    const prev = seriesStateRef.current;
    if (!next || !prev || next.blockIndex !== prev.blockIndex || next.session.found.length !== prev.session.found.length) setSerHint(null);
    seriesStateRef.current = next;
    setSeriesState(next);
  };
  const serSetTrace = (next: number[]) => { serTraceRef.current = next; setSerTrace(next); };

  /** Часы блока. Каждый блок мерится отдельно — из этих времён и берутся разности. */
  const beginBlockClock = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow();
    blockStartRef.current = start;
    blockOpenRef.current = true;
    setElapsedTime(0);
    timerRef.current = setInterval(() => { setElapsedTime((gameNow() - start) / 1000); }, 100);
  };

  /**
   * Старт серии. Поле собирается ОДИН раз на все три блока — в этом весь замер:
   * пересобери его между блоками, и в разность поедет разница полей.
   */
  const beginSeries = () => {
    if (!senseAvailable) return;
    const entry = proofSeriesEntry(seriesProgress, ladderSize());
    const field = buildProofField(language, entry.level, seriesSeed);
    setSeriesSeed((seed) => seed + 1);
    seriesRunRef.current = startSeries(SERIES_GAME_TYPE, entry.level, PROOF_SERIES_PLAN, gameNow());
    setSeriesOutcome(null);
    setSeriesFinished(null);
    serSetTrace([]);
    setSeries(openBlock(field, 0));
    beginBlockClock();
    setPhase('series');
  };

  /*
    ⚠️ ВЫЗОВ СТОИТ ЗДЕСЬ, А НЕ ВВЕРХУ ФАЙЛА. Раньше он шёл до объявления
    `startGame` и `beginSeries`, и линтер звал это «Cannot access variable before
    it is declared»: замыкание, созданное раньше объявления, не обновляется, когда
    значение меняется со временем. Работало это только потому, что хук зовёт
    start() внутри эффекта — то есть уже после объявления; держалось на порядке
    выполнения, а не на устройстве.

    Порядок хуков от переноса не плывёт: вызов безусловный и там, и тут.

    Смысл прежний: ждём загрузки уровня И серии. Без этого автостарт играл первый
    уровень человеку с двенадцатым — уровень приезжает асинхронно, а эффект
    монтирования всегда раньше промиса.
  */
  useAutostartWhenReady(
    () => autostart && lvl.loaded && (!seriesPreset || seriesLoaded),
    () => (seriesPreset ? beginSeries() : startGame()),
  );

  /** Конец серии: ОДНА сессия с массивом блоков внутри, разности — только у полной. */
  const finishSeries = async (run: SeriesRun, show: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current);
    blockOpenRef.current = false;
    const outcome = afterProofSeries(seriesProgress, run, ladderSize());
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
  const closeBlock = (state: ProofSeriesState, done: boolean) => {
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
    const isLast = state.blockIndex >= PROOF_SERIES_PLAN.length - 1;
    if (done && !isLast) { setPhase('interlude'); return; }
    finishSeries(updated, true);
  };

  /**
   * Уход из серии посреди неё. Блоки пишем как есть — человек играл, это его
   * время, — но `series_complete: false` и НИКАКИХ разностей.
   */
  const leaveSeries = (show: boolean) => {
    const run = seriesRunRef.current;
    if (!run) return;
    const state = seriesStateRef.current;
    if (blockOpenRef.current && state) {
      if (timerRef.current) clearInterval(timerRef.current);
      blockOpenRef.current = false;
      const updated = recordBlock(run, {
        key: blockKeyAt(state.blockIndex),
        timeMs: gameNow() - blockStartRef.current,
        errors: state.errors,
        done: false,
      });
      seriesRunRef.current = updated;
      finishSeries(updated, show);
      return;
    }
    finishSeries(run, show);
  };

  /** Нажатие по клетке в блоке «Знак». Промах подсвечивается — как в обычной корректуре. */
  const onSignCell = (index: number) => {
    // Состояние, а не реф: нажатие приходит между кадрами, и `seriesState`
    // здесь всегда свежий. Реф нужен только жесту — там события успевают
    // прилететь пачкой внутри одного кадра.
    if (!seriesState) return;
    const step = pressSignCell(seriesState, index);
    if (step.result === 'ignored') return;
    if (step.result === 'hit') hapticSuccess();
    else {
      hapticError();
      setWrongFlash(index);
      setTimeout(() => setWrongFlash((f) => (f === index ? null : f)), 350);
    }
    setSeries(step.state);
    if (step.result === 'hit' && blockDone(step.state)) closeBlock(step.state, true);
  };

  /**
   * Врезка сама уводит в следующий блок — по ТОМУ ЖЕ полю (`nextBlock` переносит
   * его как есть). Часы блока стартуют здесь, поэтому секунды чтения правила в
   * замер не попадают.
   */
  useEffect(() => {
    if (phase !== 'interlude' || !seriesState) return;
    const id = setTimeout(() => {
      setSeries(nextBlock(seriesState));
      serSetTrace([]);
      beginBlockClock();
      setPhase('series');
    }, INTERLUDE_MS);
    return () => clearTimeout(id);
    // Врезка живёт ровно одну фазу: зависимости — фаза и состояние блока, часы
    // заводятся ВНУТРИ таймаута, поэтому больше эффекту ничего не нужно.
  }, [phase, seriesState]);

  /**
   * УХОД МИМО КНОПОК (аппаратная «назад», переключение вкладки) серию не теряет:
   * блоки сыграны, это время человека. Пишем их так же, как при выходе кнопкой —
   * `series_complete: false` и без разностей. `seriesRunRef` обнуляется в
   * `finishSeries`, поэтому доигранная серия вторую запись не получит.
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

  // Геометрия поля серии считается отдельно от обычной сетки: там rows×cols из
  // уровня корректуры (до 16×12), здесь квадрат 5×5…8×8.
  const seriesSide = seriesState ? seriesState.field.size : 1;
  const seriesCell = Math.max(24, Math.min(
    Math.floor(Math.min(width - 24, 760) / seriesSide),
    Math.floor(Math.max(200, height - 260) / seriesSide),
    72,
  ));

  /**
   * Слово засчитывается в тот же миг, когда линия его накрыла. Промах — только
   * на отпускании: пока палец ведут, «слова тут нет» ещё не ответ, а полпути.
   */
  const serCommit = (next: number[]) => {
    const state = seriesStateRef.current;
    if (!state) return;
    const step = pressWordTrace(state, next);
    if (step.result !== 'hit') { serSetTrace(next); return; }
    hapticSuccess();
    setSeries(step.state);
    serSetTrace([]);
    if (blockDone(step.state)) closeBlock(step.state, true);
  };

  const serStep = (cell: number) => {
    const state = seriesStateRef.current;
    if (!state || blockKeyAt(state.blockIndex) === 'sign') return;
    const path = serTraceRef.current;
    const next = stepTrace(state.session, path, cell);
    if (next.length === path.length) return;                       // шаг незаконный или на месте
    if (next.length < path.length) { serSetTrace(next); return; }  // стёрли хвост
    serCommit(next);
  };

  const serBegin = (cell: number) => {
    const state = seriesStateRef.current;
    if (!state || blockKeyAt(state.blockIndex) === 'sign') return;
    const path = serTraceRef.current;
    if (path.length > 0 && stepTrace(state.session, path, cell).length !== path.length) { serStep(cell); return; }
    serSetTrace(state.session.owner[cell] === -1 ? [cell] : []);
  };

  const serRelease = () => {
    const state = seriesStateRef.current;
    const path = serTraceRef.current;
    const dragged = serDragRef.current;
    serDragRef.current = false;
    // Линия, набранная ТАПАМИ, при отпускании не сдаётся: человек ещё набирает.
    if (!dragged) return;
    serSetTrace([]);
    if (!state || path.length < 2) return;
    const step = pressWordTrace(state, path);
    // Попадание уже засчитано в serCommit по ходу ведения — сюда доходит промах.
    if (step.result === 'miss') {
      hapticError();
      setSeries(step.state);
    }
  };

  /**
   * ОДИН обработчик жеста на ОБА поля — одиночных филвордов и серии.
   *
   * ⚠️ Он собирается на каждый рендер НАМЕРЕННО: замыкает геометрию поля, а она
   * меняется и при повороте экрана, и при переходе в серию (там квадрат 5×5…8×8
   * вместо сетки корректуры до 16×12). Запомненный однажды обработчик считал бы
   * клетку по старому размеру и попадал бы мимо букв.
   *
   * ⚠️ И он ОДИН, а не два рядом: правило ведения линии у филвордов и у серии
   * обязано быть одно (оно и живёт в ядре — `stepTrace`), а два обработчика
   * разошлись бы при первой же правке одного из них. Имя прежнее (`fwPan`):
   * на него смотрит гейт «жест привязан к сетке» (`fillwords-screen.test.ts`).
   */
  const tracingSeries = phase === 'series';
  const traceCell = tracingSeries ? seriesCell : cellSize;
  const traceCols = tracingSeries ? seriesSide : cols;
  const traceRows = tracingSeries ? seriesSide : rows;
  /**
   * Клетка под пальцем. Шаг сетки равен размеру клетки: у плиток `margin: 1`
   * ВНУТРИ этого шага, поэтому делить надо на шаг, а не на видимую ширину
   * плитки — иначе к правому краю накопится сдвиг на целую клетку.
   */
  const traceCellFromPoint = (x: number, y: number): number => {
    const col = Math.min(traceCols - 1, Math.max(0, Math.floor(x / traceCell)));
    const row = Math.min(traceRows - 1, Math.max(0, Math.floor(y / traceCell)));
    return row * traceCols + col;
  };
  const fwPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const cell = traceCellFromPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
      if (tracingSeries) { serDragRef.current = false; serBegin(cell); }
      else { fwDragRef.current = false; fwBegin(cell); }
    },
    onPanResponderMove: (e) => {
      const cell = traceCellFromPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
      if (tracingSeries) { serDragRef.current = true; serStep(cell); }
      else fwExtend(cell);
    },
    onPanResponderRelease: () => (tracingSeries ? serRelease() : fwRelease()),
    onPanResponderTerminate: () => (tracingSeries ? serRelease() : fwRelease()),
    onPanResponderTerminationRequest: () => false,
  });

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
    <>
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
                  {/*
                    Картинка режима — чтобы выбор читался глазом: филворды это
                    змейка по полю букв, корректура — поиск значка в плотном
                    наборе. Под профиль она разная по материалу, карта общая с
                    анаграммами (см. `fillwords/core/modeThumbs.ts`).
                  */}
                  <Image
                    source={превьюРежимаКорректуры(m, profile?.id)}
                    style={styles.modeThumb}
                    resizeMode="cover"
                    accessible={false}
                    importantForAccessibility="no"
                  />
                  <Text style={[styles.sizeButtonText, { color: taskMode === m ? '#333' : colors.text }]}>
                    {m === 'fillwords' ? fwStrings.modeName : t('proofreading')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/*
              Тумблер виден только у филвордов: у корректурной пробы линии нет
              вовсе, и показывать ей выбор «как ведётся линия» значило бы
              предложить настройку, которая ни на что не влияет.
            */}
            {taskMode === 'fillwords' ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.optionLabel, { color: colors.text }]}>{t('fwLineLabel')}</Text>
                <View style={styles.optionButtons}>
                  {([true, false] as const).map((д) => (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ selected: диагонали === д }}
                      key={String(д)}
                      style={[
                        styles.sizeButton,
                        диагонали === д && { backgroundColor: GRADIENT[0] },
                        диагонали !== д && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                      ]}
                      onPress={() => setДиагонали(д)}
                    >
                      <Text style={[styles.sizeButtonText, { color: диагонали === д ? '#333' : colors.text }]}>
                        {д ? t('fwDiagonals') : t('fwStraight')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
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

        {/*
          🔴 ПЕРЕКЛЮЧАТЕЛЬ «ПОКАЗЫВАТЬ СЛОВА» — виден только у филвордов.
          
          📍 ПРОСЬБА ДЕНИСА 06.09.2026: «они просто дают слова, и ты находишь их
          в корректорке — так проще и интереснее». Это не поблажка, а другой вид
          упражнения: классические филворды меряют ПОРОЖДЕНИЕ («какие слова тут
          вообще могут быть»), со списком — УЗНАВАНИЕ («где именно лежит вот
          это»). Второе легче по памяти и потому годится там, где первое
          отпугивает.
        */}
        {taskMode === 'fillwords' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('fwShowWords')}</Text>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: показыватьСлова }}
            accessibilityLabel={t('fwShowWords')}
            onPress={() => переключитьСписок(!показыватьСлова)}
            style={стилиСписка.строка}
          >
            <Ionicons name={показыватьСлова ? 'checkbox' : 'square-outline'} size={20} color={GRADIENT[0]} />
            <Text style={[стилиСписка.подпись, { color: colors.text }]}>{t('fwShowWordsHint')}</Text>
          </TouchableOpacity>
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

        {/* СЕРИЯ ИЗ ТРЁХ БЛОКОВ — отдельная дверь, а не третья кнопка режима.
            Режимы выше меняют ЗАДАНИЕ одной партии, серия меняет саму партию:
            три задания подряд по одному полю и один общий разбор. */}
        {senseAvailable ? (
          <View style={[styles.optionCard, { backgroundColor: colors.surface, gap: 6, marginBottom: 12 }]}>
            <TouchableOpacity
              accessibilityRole="button" style={styles.startButton} onPress={() => beginSeries()}>
              <LinearGradient
                colors={GRADIENT as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startButtonGradient}
              >
                <Ionicons name="layers-outline" size={22} color="#333" />
                <Text style={[styles.startButtonText, { color: ON_GRAD.color }]}>{seriesStrings.entry}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[styles.seriesNote, { color: colors.text }]}>
              {interpolate(seriesStrings.startsAt, { size: seriesDoor.level })}
            </Text>
            {/* Прежние поля блоков названы ЯВНО: старт с минимума иначе читается
                как откат прогресса. */}
            <Text style={[styles.seriesNote, { color: colors.textSecondary }]}>
              {interpolate(seriesStrings.yourLevels, {
                sign: `${seriesDoor.perBlock.sign}×${seriesDoor.perBlock.sign}`,
                word: `${seriesDoor.perBlock.word}×${seriesDoor.perBlock.word}`,
                sense: `${seriesDoor.perBlock.sense}×${seriesDoor.perBlock.sense}`,
              })}
            </Text>
          </View>
        ) : (
          /* 🔴 ЧЕСТНЫЙ ОТКАЗ ВМЕСТО СПРЯТАННОЙ КНОПКИ. Блок «Смысл» живёт на
             словаре С КАТЕГОРИЯМИ, а он есть не на всех двенадцати языках. */
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="layers-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {interpolate(seriesStrings.noSense, { langs: senseLangNames })}
            </Text>
          </View>
        )}

      </View>
    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
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
            ladder="hint" label={t('btn_hint')} count={fwHintsLeft}
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
        <View style={[styles.fwField, списокСбоку
          /*
            ⚠️ ГРУППА «СПИСОК + ПОЛЕ» ЦЕНТРИРУЕТСЯ ЦЕЛИКОМ, А НЕ ПООТДЕЛЬНОСТИ.
            Сначала список прижимался к левому краю, а поле центрировалось в
            оставшемся месте — на экране 1280 между ними зияло 425 точек пустоты
            (замер живьём: список кончался на 122, поле начиналось с 547). На
            телефоне этого не видно, потому что остатка там нет, — потому и
            заметно только на широком.
          */
          ? { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' } : null]}>
          {/*
            Боковой список: колонка слева от поля. Слова идут сверху вниз и
            вычёркиваются по мере находки — как в жанре «найди слова».
          */}
          {списокСбоку && fwSession ? (
            <View style={[стилиСписка.колонка, { width: ШИРИНА_СПИСКА }]}>
              {(fwSession as FillwordsSession).puzzle.words.map((w, i) => {
                const найдено = (fwSession as FillwordsSession).found.indexOf(i) >= 0;
                return (
                  <Text
                    key={`бок-${w.word}-${i}`}
                    accessibilityLabel={найдено ? `${w.word}, найдено` : w.word}
                    style={[стилиСписка.словоБоком, {
                      color: найдено ? colors.textSecondary : colors.text,
                      textDecorationLine: найдено ? 'line-through' : 'none',
                      opacity: найдено ? 0.55 : 1,
                    }]}
                  >
                    {w.word}
                  </Text>
                );
              })}
            </View>
          ) : null}
          <View style={списокСбоку ? { flexShrink: 1, alignItems: 'center' } : { width: '100%', alignItems: 'center' }}>
          {/* Строка «что делать» — над полем, как у лабораторных модулей. */}
          <Text style={[styles.fwTask, { color: colors.textSecondary }]}>{fwStrings.task}</Text>
          {/*
            🔴 СПИСОК СЛОВ НАД ПОЛЕМ — ОТДЕЛЬНЫЙ ВИД ИГРЫ, А НЕ ПОБЛАЖКА.
            
            📍 ПРОСЬБА ДЕНИСА 06.09.2026, дословно: «они вот просто дают слова, и
            ты находишь их в корректорке — так проще и интереснее, типа режим
            подсказки». Он описывает жанр «найди слова»: список показан, найденное
            вычёркивается.
            
            ⚠️ Это ДРУГОЕ упражнение, а не облегчённое то же. Классические
            филворды меряют ПОРОЖДЕНИЕ («какие слова тут вообще могут быть»), а
            со списком — УЗНАВАНИЕ («где именно лежит вот это»). Второе легче по
            нагрузке на память и потому годится туда, где первое отпугивает.
          */}
          {показыватьСлова && !списокСбоку && (
            <View style={стилиСписка.список}>
              {(fwSession as FillwordsSession).puzzle.words.map((w, i) => {
                const найдено = (fwSession as FillwordsSession).found.indexOf(i) >= 0;
                return (
                  <Text
                    key={`${w.word}-${i}`}
                    accessibilityLabel={найдено ? `${w.word}, найдено` : w.word}
                    style={[стилиСписка.слово, {
                      color: найдено ? colors.textSecondary : colors.text,
                      textDecorationLine: найдено ? 'line-through' : 'none',
                      opacity: найдено ? 0.55 : 1,
                    }]}
                  >
                    {w.word.toUpperCase()}
                  </Text>
                );
              })}
            </View>
          )}
          <View style={[styles.gridContainer, { width: gridWidth }]} {...fwPan.panHandlers}>
            {(fwSession as FillwordsSession).puzzle.letters.map((letter, index) => {
              const session = fwSession as FillwordsSession;
              const owner = session.owner[index];
              const traced = fwTrace.indexOf(index) >= 0;
              // Клетку уже разобранного слова подсвечивать нечем — подсказка про неразобранные.
              const hinted = fwHint !== null && fwHint.cells.indexOf(index) >= 0 && owner < 0;
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
                      /**
                       * Подсказка — ЗАЛИВКОЙ, как в серии, а не рамкой 2 px.
                       * Рамка на светлой клетке почти не читается, а подсветка
                       * теперь несёт весь путь слова, и её надо видеть целиком.
                       */
                      backgroundColor: traced ? GRADIENT[0] : hinted ? '#99f6e4' : takenTint,
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
        </View>
      ) : (
      <View style={[styles.gridContainer, { width: gridWidth }]}>
        {grid.map((letter, index) => {
          // Цель до нажатия НЕ подсвечивается — в этом вся проба: её надо
          // увидеть самому. Поэтому здесь только «уже найдено».
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


  /**
   * БЛОК СЕРИИ. Сетка та же, что в обычной партии, но буквы берутся из
   * `seriesState.field.puzzle` — ЕДИНСТВЕННОГО поля на все три блока. Меняется
   * только правило: что искать, говорит шапка, а как — строка под полем.
   *
   * ⚠️ Ввод у блоков разный по необходимости, а не по вкусу: знак закрывают
   * нажатием на клетку, слово — линией по клеткам. Поэтому в блоке «Знак» клетки
   * нажимаемые, а обработчик жеста к полю не подключён вовсе.
   */
  const renderSeries = () => {
    if (!seriesState) return null;
    const field = seriesState.field;
    const key = blockKeyAt(seriesState.blockIndex);
    const isSign = key === 'sign';
    const done = blockStep(seriesState);
    const total = blockStepsTotal(field, key);
    return (
      <GameShell
        title={seriesStrings.entry}
        onBack={() => { leaveSeries(false); goBackOrHome(); }}
        headerRight={
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={seriesStrings.leave}
            style={[styles.backButton, { backgroundColor: colors.surface }]}
            onPress={() => leaveSeries(true)}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        }
        headerActions={isSign ? undefined : (
          /* Подсказка — служебное действие, поэтому в шапке (правило слотов GameShell).
             В блоке «Знак» её нет: там искать нечего, знаки названы прямо в шапке. */
          <GameAuxBar>
            <GameAuxAction
              icon="bulb-outline" tint="#0d9488"
              ladder="hint" label={t('btn_hint')} count={serHintsLeft}
              disabled={serHintsLeft === 0} onPress={serTakeHint}
            />
          </GameAuxBar>
        )}
        stats={
          <View style={styles.gameHeader}>
            <View style={[styles.targetBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.targetLabel, { color: colors.text }]}>{blockLabel(key)}</Text>
              {isSign && field.signs.map((sign, i) => (
                <View key={sign} style={[styles.targetChip, { backgroundColor: i === 0 ? '#34d399' : '#fbbf24' }]}>
                  <Text style={styles.targetChipText}>{sign}</Text>
                </View>
              ))}
              {/* 🔴 ПОДПИСЬ И ЧИСЛО — ОДНОЙ ГРУППОЙ. Комментарий тут стоял верный
                  («3/6» без подписи читается как что угодно), а стиль `targetCount`
                  нёс `marginLeft: 'auto'` и уносил число к другому краю: получалось
                  «Поиск слов  Найдено» слева и «0/7» справа, и пара не читалась как
                  пара. Репорт Дениса 23.08.2026: «непонятно, сколько слов ждёт
                  система». Теперь к краю уезжает ГРУППА, а подпись держится числа. */}
              <View style={styles.foundPair}>
                <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>{t('label_found')}</Text>
                <Text style={[styles.targetCount, { color: colors.textSecondary, marginLeft: 0 }]}>{done}/{total}</Text>
              </View>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Ionicons name="time-outline" size={18} color={colors.text} />
              <Text style={[styles.timerText, { color: colors.text }]}>
                {`${t('time')} ${Math.floor(elapsedTime)}${t('secShort')}`}
              </Text>
              {seriesState.errors > 0 && (
                <Text style={[styles.timerText, { color: '#f43f5e' }]}>{t('hud_errors')} {seriesState.errors}</Text>
              )}
            </View>
          </View>
        }
      >
        <Text style={[styles.seriesBlockLine, { color: colors.textSecondary }]}>
          {`${interpolate(seriesStrings.blockOf, { n: seriesState.blockIndex + 1, total: PROOF_SERIES_PLAN.length })} · ${blockLabel(key)}`}
        </Text>
        <View
          style={[styles.gridContainer, { width: seriesCell * seriesSide }]}
          {...(isSign ? {} : fwPan.panHandlers)}
        >
          {field.puzzle.letters.map((letter, index) => {
            const owner = seriesState.session.owner[index];
            const traced = serTrace.indexOf(index) >= 0;
            const closed = isSign ? seriesState.taken[index] : owner >= 0;
            const hinted = !isSign && serHint !== null && serHint.cells.indexOf(index) >= 0 && owner < 0;
            const tint = isSign
              ? (closed ? GRADIENT[0] : wrongFlash === index ? '#f43f5e' : colors.surface)
              : (traced ? GRADIENT[0] : owner >= 0 ? tintForFoundOrder(seriesState.session.found.indexOf(owner)) : hinted ? '#99f6e4' : colors.surface);
            const ink = isSign
              ? (closed ? '#333' : wrongFlash === index ? '#fff' : colors.text)
              : (traced ? '#333' : owner >= 0 ? FILLWORDS_INK : colors.text);
            const box = {
              width: seriesCell - 2,
              height: seriesCell - 2,
              backgroundColor: tint,
            };
            const text = {
              fontSize: Math.min(seriesCell * 0.5, 24),
              color: ink,
              fontWeight: (closed || traced ? '700' : '500') as '700' | '500',
            };
            return isSign ? (
              <TouchableOpacity
                accessibilityRole="button"
                key={index}
                style={[styles.cell, box]}
                onPress={() => onSignCell(index)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cellText, text]}>{letter}</Text>
              </TouchableOpacity>
            ) : (
              <View key={index} accessible accessibilityLabel={letter} style={[styles.cell, box]}>
                <Text style={[styles.cellText, text]}>{letter}</Text>
              </View>
            );
          })}
        </View>
        <Text style={[styles.fwTask, { color: colors.textSecondary }]}>{blockRule(key, field)}</Text>
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
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.interlude}>
          <Ionicons name="swap-horizontal" size={44} color={GRADIENT[0]} />
          <Text style={[styles.interludeTitle, { color: colors.text }]}>{seriesStrings.ruleChanges}</Text>
          <Text style={[styles.interludeBlock, { color: colors.text }]}>{blockLabel(nextKey)}</Text>
          <Text style={[styles.interludeRule, { color: colors.textSecondary }]}>
            {blockRule(nextKey, seriesState.field)}
          </Text>
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
      {/* РАЗБОР СЕРИИ. Главное здесь не очки, а две разности: цена сегментации и
          цена смысла. У неполной серии их нет ВООБЩЕ — вместо чисел говорим об
          этом прямо. */}
      {phase === 'seriesResult' && seriesFinished && (
        <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.configCard}
          >
            <Ionicons name="layers-outline" size={44} color={ON_GRAD.color} />
            <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{seriesStrings.seriesDone}</Text>
          </LinearGradient>
          {(() => {
            const diffs = seriesDiffs(seriesFinished);
            if (!diffs) {
              return <Text style={[styles.seriesNote, { color: '#f43f5e' }]}>{seriesStrings.notFinished}</Text>;
            }
            // Имена разностей собирает ядро из ключей блоков — не переписываем их строкой.
            const base = PROOF_SERIES_PLAN[0];
            const segment = diffs[`${PROOF_SERIES_PLAN[1]}_minus_${base}`];
            const sense = diffs[`${PROOF_SERIES_PLAN[2]}_minus_${base}`];
            const signed = (ms: number): string => `${ms > 0 ? '+' : ''}${(ms / 1000).toFixed(1)} ${t('seconds')}`;
            return (
              <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.seriesRow, { color: colors.text }]}>
                  {`${seriesStrings.signSpeed}: ${(seriesFinished.blocks[0].timeMs / 1000).toFixed(1)} ${t('seconds')}`}
                </Text>
                <Text style={[styles.seriesRow, { color: colors.text }]}>
                  {`${seriesStrings.segmentCost}: ${signed(segment)}`}
                </Text>
                {/* Цена смысла — это T₃−T₂, а ядро отдаёт обе разности от ПЕРВОГО
                    блока. Считаем её из них: (T₃−T₁) − (T₂−T₁). Так у неполной
                    серии цена смысла не появится ни при каких обстоятельствах —
                    разностей там нет вовсе, и вычитать нечего. */}
                <Text style={[styles.seriesRow, { color: colors.text }]}>
                  {`${seriesStrings.senseCost}: ${signed(sense - segment)}`}
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
            <LinearGradient
              colors={GRADIENT as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButtonGradient}
            >
              <Ionicons name="refresh" size={22} color="#333" />
              <Text style={[styles.startButtonText, { color: ON_GRAD.color }]}>{seriesStrings.again}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setPhase('config')}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{seriesStrings.leave}</Text>
          </TouchableOpacity>
        </ScrollView>
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

const стилиСписка = StyleSheet.create({
  // Боковая колонка: слова сверху вниз, слева от поля. Ширина приходит из экрана.
  колонка: { paddingRight: 8, paddingTop: 2 },
  словоБоком: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  список: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 12, marginBottom: 6 },
  слово: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  // 44 — норма цели нажатия: переключатель жмут пальцем.
  строка: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  подпись: { fontSize: 14, flexShrink: 1 },
});

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
  placeholder: { width: HELP_CORNER_SPACE },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 16, paddingBottom: 20 + SETUP_BAR_SPACE },
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
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%' },
  sizeButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    minWidth: 60,
    alignItems: 'center',
  },
  // Картинка режима над подписью — как в анаграммах, тот же размер цели нажатия.
  modeThumb: { width: 44, height: 44, borderRadius: 10, marginBottom: 6 },
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
  /** Подпись и число держатся вместе, а к краю уезжают ВДВОЁМ — см. шапку серии. */
  foundPair: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
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
  // Серия блоков: строка «Блок n из 3», врезка между блоками, строки разбора
  seriesBlockLine: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
  seriesNote: { fontSize: 14, textAlign: 'center' },
  seriesRow: { fontSize: 16, fontWeight: '600', paddingVertical: 4 },
  interlude: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  interludeTitle: { fontSize: 16, fontWeight: '600' },
  interludeBlock: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  interludeRule: { fontSize: 16, textAlign: 'center' },
  interludeSame: { fontSize: 14, textAlign: 'center', marginTop: 8 },
});
