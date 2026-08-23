/* psygames-game-chess-blind · VER 3 · 23.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameAbout from '@/src/components/GameAbout';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { nextUnanswered } from '@/src/games/chess-blind/core/blocks';
import { useProfile } from '@/src/contexts/ProfileContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recordBlock, seriesComplete, seriesSession, startSeries,
  type SeriesRun,
} from '@/src/services/series';
import {
  BOARD_SIDE,
  CHESS_SERIES_PLAN,
  EMPTY_CHESS_PROGRESS,
  afterSeriesRun,
  answerLabels,
  answerQuestion,
  blockDone,
  blockHeader,
  blockInterlude,
  blockKeyAt,
  blockTitle,
  currentQuestion,
  getChessBlindStrings,
  isLightSquare,
  memorizeLine,
  nextBlock,
  openBlock,
  parseChessProgress,
  pieceGlyph,
  positionForLevel,
  questionText,
  seriesEntry,
  seriesIntro,
  seriesRecap,
  levelMoveLine,
  squareName,
  truthLabel,
  type ChessPosition,
  type ChessSeriesOutcome,
  type ChessSeriesProgress,
  type ChessSeriesState,
  type RecallQuestion,
} from '@/src/games/chess-blind/core';

/**
 * Слепые шахматы (chess_blind) — тренировка удержания позиции в уме.
 * Позиция показывается → все фигуры маскируются одинаковыми фишками →
 * (на старших уровнях фигуры вслепую ходят) → квиз: «что стоит здесь?» / «где фигура X?».
 * Подготовка к игре вслепую: игрок держит в голове, какая фишка что.
 */

const GRADIENT = ['#334155', '#0f172a'];   // шахматный тёмный
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 10.35 (норма AA 4.5), стало 7.92.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const CHESS_BENEFITS = [
  { icon: 'eye-off-outline', textKey: 'benefitChessBlind1' },
  { icon: 'grid-outline', textKey: 'benefitChessBlind2' },
  { icon: 'bulb-outline', textKey: 'benefitChessBlind3' },
];

/**
 * Что меняется с уровнем — вслух, а не молча.
 *
 * ЗАЧЕМ. Из 61 игры смену правил объясняли 14; остальные растили сложность
 * незаметно, и человек упирался, не понимая во что. Приоритет Дениса 16.08.2026.
 */
const CHESSBLIND_RULES: LevelRule[] = [
  { key: 'moves', fromLevel: 6 },   // lr_chess_blind_moves_*
  { key: 'locate', fromLevel: 11 },   // lr_chess_blind_locate_*
];

/**
 * `series` — блок серии · `interlude` — врезка со сменой правила между блоками ·
 * `seriesResult` — разбор с разностями. Обычная партия ('expose'/'mask'/'quiz')
 * их не касается: серия это РЕЖИМ этого же экрана, а не вторая игра рядом.
 */
type GamePhase = 'intro' | 'config' | 'expose' | 'mask' | 'quiz' | 'cleared' | 'result'
  | 'series' | 'interlude' | 'seriesResult';

/**
 * Врезка между блоками: 2–3 секунды на прочтение нового правила. Она НЕ входит
 * во время блока — часы блока стартуют, когда врезка ушла, иначе её длительность
 * села бы прямо в разность T₂ − T₁.
 */
const INTERLUDE_MS = 2500;
/**
 * Сколько показывают позицию в блоке «память». Число ОДНО на все уровни, и это
 * решение: сделай показ длиннее на густой доске — и T₃ на разных уровнях станет
 * мерить ещё и щедрость показа. Трудность растёт числом фигур, показ постоянен.
 *
 * 🔴 ПОКАЗ НЕ ВХОДИТ В ЗАМЕР БЛОКА, И НАЧИНАЕТ ЕГО ЧЕЛОВЕК. Часы блока «память»
 * стартуют, когда позицию УБРАЛИ: иначе в T₃ попало бы время разглядывания,
 * одинаковое по правилу и разное по тому, отвлёкся ли человек в этот момент.
 */
const RECALL_EXPOSE_MS = 8000;
/**
 * У серии свой `game_type`: три правила на одной позиции — не партия вслепую.
 * Под общим ключом эта запись поехала бы и в лидерборд, и в восстановление
 * уровня (`getMaxLevelFromSessions` читает `details.level`), где `level` серии
 * означает полосу по числу фигур, а не ступень лесенки.
 */
const SERIES_GAME_TYPE = 'chess_blind_series';
/** Что сейчас на экране в блоке «память»: ждём готовности → показ → вопросы. */
type RecallStage = 'ready' | 'memorize' | 'ask';
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type QuizType = 'pick' | 'locate';

interface Piece { id: number; type: PieceType; white: boolean; sq: number }  // sq: 0..63, row0 = 8-я горизонталь (верх)
interface Combo { type: PieceType; white: boolean }
interface Move { pieceId: number; from: number; to: number }
interface Question { sq: number; answer: Combo; options: Combo[] }

// Два набора unicode-глифов: белые — КОНТУРНЫЕ (outline) символы ♔♕♖♗♘♙,
// чёрные — ЗАЛИТЫЕ ♚♛♜♝♞♟. Так стороны различаются ФОРМОЙ (контур vs заливка),
// а не только цветом текста → фигуры читаются намного легче (репорт «плохо видно фигурки»).
const GLYPH_WHITE: Record<PieceType, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
const GLYPH_BLACK: Record<PieceType, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyphOf = (c: Combo): string => (c.white ? GLYPH_WHITE : GLYPH_BLACK)[c.type];

// Сдвиги для 8-направленной обводки (по кругу вокруг символа).
const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

// Глиф фигуры с многонаправленной ОБВОДКОЙ. В RN нет text-stroke, поэтому тем же
// символом рисуем 8 копий цветом обводки со сдвигом по кругу, а сверху — символ
// заливки. Белые: светлая заливка + тёмная обводка; чёрные: тёмная заливка +
// светлая обводка → фигура контрастна и на светлых, и на тёмных клетках доски.
// Работает одинаково на web (Tauri-WebView) и native, без нетипизированного CSS.
function PieceGlyph({ combo, boxW, boxH, fontSize, onLight }: {
  combo: Combo; boxW: number; boxH: number; fontSize: number;
  /** Глиф стоит на СВЕТЛОЙ подложке. Тогда контраст задаёт подложка, а не сторона
   *  фигуры: иначе белая фигура со светлой заливкой на светлой плашке исчезает. */
  onLight?: boolean;
}) {
  const glyph = glyphOf(combo);
  const fill = onLight === undefined ? (combo.white ? '#f8fafc' : '#111827') : (onLight ? '#0f172a' : '#f8fafc');
  const stroke = onLight === undefined ? (combo.white ? '#0f172a' : '#f8fafc') : (onLight ? '#f8fafc' : '#0f172a');
  const o = Math.max(1.4, Math.round(fontSize * 0.055));   // толщина обводки ∝ размеру
  return (
    <View pointerEvents="none" style={{ width: boxW, height: boxH }}>
      {OUTLINE_OFFSETS.map(([dx, dy], i) => (
        <Text
          key={i}
          style={[styles.glyphLayer, {
            height: boxH, lineHeight: boxH, fontSize, color: stroke,
            transform: [{ translateX: dx * o }, { translateY: dy * o }],
          }]}
        >
          {glyph}
        </Text>
      ))}
      <Text style={[styles.glyphLayer, { height: boxH, lineHeight: boxH, fontSize, color: fill }]}>
        {glyph}
      </Text>
    </View>
  );
}
// Название фигуры — ОДНИМ ключом на цвет+фигуру, а не сборкой «цвет» + «фигура».
// В половине языков прилагательное согласуется с родом («белая ладья», но «белый конь»,
// la torre blanca / el caballo blanco) — из двух кусков это не склеить.
function pieceName(c: Combo, t: (k: string) => string): string {
  return t(`chessPc${c.white ? 'W' : 'B'}${c.type}`);
}

// Лесенка 15 уровней: сложность ТРУДНОСТЬЮ (фигуры/показ/слепые ходы/тип квиза), не временем
function levelParams(level: number): { pieces: number; exposeSec: number; moves: number; quizType: QuizType; questions: number } {
  const L = Math.max(1, Math.min(15, level));
  const pieces =    [4, 6, 8, 10, 12,  6, 6, 6, 8, 8,  10, 10, 12, 10, 12][L - 1];
  const exposeSec = [8, 8, 7, 6, 5,    8, 8, 8, 8, 8,   8, 7, 7, 6, 6][L - 1];
  const moves =     [0, 0, 0, 0, 0,    2, 3, 4, 4, 6,   6, 8, 8, 10, 12][L - 1];
  const quizType: QuizType = L >= 11 ? 'locate' : 'pick';
  return { pieces, exposeSec, moves, quizType, questions: 3 };
}

function stageName(level: number, t: (k: string) => string): string {
  if (level <= 5) return t('chessStageFlash');
  if (level <= 10) return t('chessStageBlind');
  return t('chessStageLocate');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Пул добора (кроме королей) на каждый цвет
const POOL: PieceType[] = ['Q', 'R', 'R', 'B', 'B', 'N', 'N', 'P', 'P', 'P', 'P'];

// Генерация позиции: оба короля обязательно; пешки не на 1-й/8-й горизонтали; все на разных клетках.
// forLocate: ферзь форсируется в добор каждого цвета → минимум 4 уникальные фигуры (2K + 2Q) для «розыска».
function generatePosition(count: number, forLocate: boolean): Piece[] {
  const rest = Math.max(0, count - 2);
  const nWhite = Math.ceil(rest / 2);
  const nBlack = rest - nWhite;
  const draw = (n: number): PieceType[] => {
    const pool = shuffle([...POOL]);
    if (forLocate) {
      const qi = pool.indexOf('Q');
      pool.splice(qi, 1);
      pool.unshift('Q');   // ферзь гарантированно в доборе (в пуле он один → максимум 1 на цвет)
    }
    return pool.slice(0, n);
  };
  const combos: Combo[] = [
    { type: 'K', white: true }, { type: 'K', white: false },
    ...draw(nWhite).map((t) => ({ type: t, white: true })),
    ...draw(nBlack).map((t) => ({ type: t, white: false })),
  ];
  const used = new Set<number>();
  const pieces: Piece[] = [];
  let id = 1;
  for (const c of combos) {
    const candidates: number[] = [];
    for (let s = 0; s < 64; s++) {
      if (used.has(s)) continue;
      const row = Math.floor(s / 8);
      if (c.type === 'P' && (row === 0 || row === 7)) continue;   // пешки не на крайних горизонталях
      candidates.push(s);
    }
    const sq = candidates[Math.floor(Math.random() * candidates.length)];
    used.add(sq);
    pieces.push({ id: id++, type: c.type, white: c.white, sq });
  }
  return pieces;
}

const DIRS_ROOK = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIRS_BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

// Валидные ходы фигуры: клетка-назначение пуста (взятий нет — v1), R/B/Q не перепрыгивают
function movesFor(p: Piece, occ: Set<number>): number[] {
  const r = Math.floor(p.sq / 8), c = p.sq % 8;
  const out: number[] = [];
  const push = (rr: number, cc: number) => {
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const s = rr * 8 + cc;
      if (!occ.has(s)) out.push(s);
    }
  };
  const slide = (dirs: number[][]) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const s = rr * 8 + cc;
        if (occ.has(s)) break;
        out.push(s);
        rr += dr; cc += dc;
      }
    }
  };
  switch (p.type) {
    case 'K':
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr || dc) push(r + dr, c + dc); }
      break;
    case 'N': for (const [dr, dc] of KNIGHT) push(r + dr, c + dc); break;
    case 'R': slide(DIRS_ROOK); break;
    case 'B': slide(DIRS_BISHOP); break;
    case 'Q': slide([...DIRS_ROOK, ...DIRS_BISHOP]); break;
    case 'P': {
      // белые идут вверх (row-1), чёрные вниз; не заходим на крайние горизонтали (без превращений)
      const rr = r + (p.white ? -1 : 1);
      if (rr >= 1 && rr <= 6) { const s = rr * 8 + c; if (!occ.has(s)) out.push(s); }
      break;
    }
  }
  return out;
}

// Последовательность из n случайных валидных ходов, применённых к копии позиции
function generateMoves(pos: Piece[], n: number): { moves: Move[]; final: Piece[] } {
  const ps = pos.map((p) => ({ ...p }));
  const moves: Move[] = [];
  for (let i = 0; i < n; i++) {
    const occ = new Set(ps.map((p) => p.sq));
    const order = shuffle([...ps]);
    let done = false;
    for (const p of order) {
      const ms = movesFor(p, occ);
      if (ms.length > 0) {
        const to = ms[Math.floor(Math.random() * ms.length)];
        moves.push({ pieceId: p.id, from: p.sq, to });
        p.sq = to;
        done = true;
        break;
      }
    }
    if (!done) break;   // ни у кого нет ходов (практически невозможно)
  }
  return { moves, final: ps };
}

const comboKey = (c: Combo) => `${c.type}${c.white ? 'w' : 'b'}`;

// 6 вариантов для 'pick': правильный + дистракторы из реально стоящих на доске, добор случайными
function buildOptions(final: Piece[], answer: Combo): Combo[] {
  const onBoard = new Map<string, Combo>();
  final.forEach((p) => onBoard.set(comboKey(p), { type: p.type, white: p.white }));
  onBoard.delete(comboKey(answer));
  const opts: Combo[] = [answer, ...shuffle([...onBoard.values()]).slice(0, 5)];
  if (opts.length < 6) {
    const all: Combo[] = shuffle((['K', 'Q', 'R', 'B', 'N', 'P'] as PieceType[])
      .flatMap((t) => [{ type: t, white: true }, { type: t, white: false }]));
    for (const c of all) {
      if (opts.length >= 6) break;
      if (!opts.some((o) => o.type === c.type && o.white === c.white)) opts.push(c);
    }
  }
  return shuffle(opts);
}

// 3 вопроса по АКТУАЛЬНОЙ (после всех ходов) позиции
function buildQuestions(final: Piece[], quizType: QuizType, questions: number): Question[] {
  if (quizType === 'pick') {
    return shuffle([...final]).slice(0, Math.min(questions, final.length)).map((p) => ({
      sq: p.sq,
      answer: { type: p.type, white: p.white },
      options: buildOptions(final, { type: p.type, white: p.white }),
    }));
  }
  // locate: только фигуры в ЕДИНСТВЕННОМ экземпляре типа+цвета (K/Q гарантированы, R/N/B если один)
  const cnt = new Map<string, number>();
  final.forEach((p) => cnt.set(comboKey(p), (cnt.get(comboKey(p)) || 0) + 1));
  const uniques = final.filter((p) => cnt.get(comboKey(p)) === 1);
  return shuffle([...uniques]).slice(0, Math.min(questions, uniques.length)).map((p) => ({
    sq: p.sq,
    answer: { type: p.type, white: p.white },
    options: [],
  }));
}

export default function ChessBlindGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { width, height } = useWindowDimensions();
  const { profile } = useProfile();

  const lvl = usePersistentLevel('chess_blind');
  const { isPreset, autostart, num, bool, isCalm } = useGamePreset();
  /**
   * Шаг «Зарядки» может попросить именно СЕРИЮ: `?series=1`.
   *
   * 🔴 БЕЗ ЧТЕНИЯ ПАРАМЕТРА МАРШРУТ БЕСПОЛЕЗЕН. Ровно это уже случилось с
   * корректуркой: запись в «Зарядке» была, параметра экран не читал — и человек
   * попадал в обычную партию, думая, что играет серию.
   */
  const seriesPreset = bool('series');
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  // ⚠️ Серия ждёт ЕЩЁ И свой прогресс: без него автостарт посадил бы человека на
  // самую бедную доску, даже если блоки давно выросли (та же беда, что с уровнем).
  useAutostartWhenReady(
    () => autostart && lvl.loaded && (!seriesPreset || seriesLoaded),
    () => (seriesPreset ? beginSeries() : startGame()),
  );
  // ⚠️ ГЛУШИЛКА ПРАВИЛА ЗДЕСЬ НЕ РАБОТАЛА. Пояснение через тире линтер читает как
  // часть ИМЕНИ правила: такого правила нет, глушилка не глушила ничего и сама
  // становилась ошибкой линта. Пояснение живёт обычным комментарием: список
  // зависимостей намеренно неполон — эффект обязан сработать один раз на
  // готовности, а не пересобираться на каждое изменение замыканий.

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  // Правила уровня: показать при первом входе и дать перечитать по бейджу.
  const levelRules = useLevelRules('chess_blind', lvl.level, CHESSBLIND_RULES, phase === 'quiz');
  const [dispPieces, setDispPieces] = useState<Piece[]>([]);
  const [prm, setPrm] = useState(() => levelParams(1));
  const [exposePct, setExposePct] = useState(100);
  const [exposeLeft, setExposeLeft] = useState(0);
  const [moveNum, setMoveNum] = useState(0);           // показанный ход i/N в фазе mask
  const [moveHl, setMoveHl] = useState<{ from: number; to: number } | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [revealOpt, setRevealOpt] = useState<Combo | null>(null);   // pick: подсветка правильной кнопки после ошибки
  const [revealSq, setRevealSq] = useState<number | null>(null);     // locate: подсветка правильной клетки
  const [wrongSq, setWrongSq] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  const levelRef = useRef(1);
  const prmRef = useRef(levelParams(1));
  const questionsRef = useRef<Question[]>([]);
  const qIndexRef = useRef(0);
  /**
   * 🔴 ОТВЕЧАТЬ МОЖНО В ЛЮБОМ ПОРЯДКЕ. Раньше игра сама вела по клеткам 1/3 → 2/3 → 3/3,
   * и человек, помнящий вторую и третью, обязан был сперва промахнуться по первой.
   * Репорт Дениса 23.08.2026: «нельзя вручную выбрать те, что помнишь — он навязывает
   * свою последовательность». Теперь подсвечены ВСЕ неотвеченные клетки, тап выбирает,
   * про какую отвечаешь; по умолчанию выбрана первая неотвеченная, поэтому у того, кто
   * ничего не выбирает, поведение прежнее.
   * ⚠️ Набор клеток и их число НЕ меняются — меняется только порядок. Иначе поехала бы
   * сама мера: разности между блоками считаются на одинаковых заданиях.
   */
  const answeredRef = useRef<Set<number>>(new Set());
  const [answeredTick, setAnsweredTick] = useState(0);
  const qLockRef = useRef(false);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const startTimeRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const exposeIvRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const later = (fn: () => void, ms: number) => { timersRef.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (exposeIvRef.current) { clearInterval(exposeIvRef.current); exposeIvRef.current = null; }
    // Часы блока серии — тот же одноразовый интервал: уходя с экрана, гасим и его.
    if (seriesIvRef.current) { clearInterval(seriesIvRef.current); seriesIvRef.current = null; }
  };
  useEffect(() => () => clearTimers(), []);   // очистка всех таймеров на unmount

  const cellSize = Math.floor(Math.min(width - 36, height - 360, 480) / 8);   // 24→36: поле GameShell имеет paddingHorizontal 16×2
  const boardSize = cellSize * 8;

  // ───────────────────────────────────────────────────────────────────────────
  // СЕРИЯ ИЗ ТРЁХ БЛОКОВ НА ОДНОЙ ПОЗИЦИИ
  //
  // Правила блоков, вопросы, уровень и подписи живут в `src/games/chess-blind/core`,
  // замер серии — в `src/services/series.ts`. Здесь только состояние экрана:
  //
  //   поле   → T₁ координатная работа
  //   конь   → T₂ − T₁ цена правила хода
  //   память → T₃ − T₁ цена удержания
  //
  // 🔴 ПОЗИЦИЯ БЕРЁТСЯ РОВНО ОДИН РАЗ — в `beginSeries`. Между блоками ходит
  // `nextBlock`, у которого доступа к источнику позиций нет вовсе: переносить
  // ему нечего, кроме уже выбранной. Позови экран `positionForLevel` ещё раз на
  // старте блока — он выглядел бы совершенно исправным, а в разность T₂ − T₁
  // тихо поехала бы разница ПОЗИЦИЙ.
  //
  // 🔴 ОТВЕТ ВЕЗДЕ ДВОИЧНЫЙ, ОДНО КАСАНИЕ. Меню вариантов хоть в одном блоке — и
  // разность начнёт мерить набор ответа, а не добавленное требование.
  // ───────────────────────────────────────────────────────────────────────────
  const chessStrings = getChessBlindStrings(language);
  const [seriesState, setSeriesState] = useState<ChessSeriesState | null>(null);
  /** Состояние СЛЕДУЮЩЕГО блока: собирается на входе во врезку, чтобы она называла его правило. */
  const [nextSeriesState, setNextSeriesState] = useState<ChessSeriesState | null>(null);
  const [seriesProgress, setSeriesProgress] = useState<ChessSeriesProgress>(EMPTY_CHESS_PROGRESS);
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [seriesOutcome, setSeriesOutcome] = useState<ChessSeriesOutcome | null>(null);
  const [seriesFinished, setSeriesFinished] = useState<SeriesRun | null>(null);
  const [recallStage, setRecallStage] = useState<RecallStage>('ask');
  /** Неверные ответы блока «память» — для разбора: что стояло на поле НА САМОМ ДЕЛЕ. */
  const [recallMisses, setRecallMisses] = useState<RecallQuestion[]>([]);
  const [seriesTime, setSeriesTime] = useState(0);
  /** Прогон серии живёт в ref: блоки дописываются из обработчиков нажатий. */
  const seriesRunRef = useRef<SeriesRun | null>(null);
  const seriesStateRef = useRef<ChessSeriesState | null>(null);
  const blockStartRef = useRef(0);
  /** Блок открыт и ещё не записан — чтобы выход во время врезки не записал его дважды. */
  const blockOpenRef = useRef(false);
  const seriesIvRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seriesKey = `psygames_chess_blind_series_${(profile as any)?.id ?? 'default'}`;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(seriesKey)
      .then((raw) => { if (!alive) return; setSeriesProgress(parseChessProgress(raw)); setSeriesLoaded(true); })
      .catch(() => { if (alive) setSeriesLoaded(true); });
    return () => { alive = false; };
  }, [seriesKey]);

  const setSeries = (next: ChessSeriesState | null) => { seriesStateRef.current = next; setSeriesState(next); };

  /** С какой полосы пойдёт серия и какие уровни у блоков сейчас — считается ДО входа. */
  const seriesDoor = seriesEntry(seriesProgress);
  const seriesIntroText = seriesIntro(chessStrings, seriesDoor.band, seriesDoor.perBlock);

  /** Часы блока. Каждый блок мерится отдельно — из этих времён и берутся разности. */
  const beginBlockClock = () => {
    if (seriesIvRef.current) clearInterval(seriesIvRef.current);
    const start = gameNow();
    blockStartRef.current = start;
    blockOpenRef.current = true;
    setSeriesTime(0);
    seriesIvRef.current = setInterval(() => { setSeriesTime((gameNow() - start) / 1000); }, 100);
  };

  const stopBlockClock = () => {
    if (seriesIvRef.current) { clearInterval(seriesIvRef.current); seriesIvRef.current = null; }
  };

  /** Старт серии. Позиция берётся ОДИН раз на все три блока — в этом весь замер. */
  const beginSeries = () => {
    clearTimers();
    const entry = seriesEntry(seriesProgress);
    const picked = positionForLevel(entry.level);
    seriesRunRef.current = startSeries(SERIES_GAME_TYPE, entry.level, CHESS_SERIES_PLAN, gameNow());
    setSeriesOutcome(null);
    setSeriesFinished(null);
    setNextSeriesState(null);
    setRecallMisses([]);
    setRecallStage('ask');
    setSeries(openBlock(picked.position, 0, entry.level));
    beginBlockClock();
    setPhase('series');
  };

  /** Конец серии: ОДНА сессия с массивом блоков внутри, разности — только у полной. */
  const finishSeries = async (run: SeriesRun, show: boolean) => {
    stopBlockClock();
    clearTimers();
    blockOpenRef.current = false;
    const outcome = afterSeriesRun(seriesProgress, run);
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
        difficulty: `L${run.level}`,
      });
    } catch (error) {
      console.error('Error saving series session:', error);
    }
  };

  /** Блок доигран (или оборван): дописываем его в прогон и решаем, что дальше. */
  const closeBlock = (state: ChessSeriesState, done: boolean) => {
    const run = seriesRunRef.current;
    if (!run || !blockOpenRef.current) return;
    stopBlockClock();
    blockOpenRef.current = false;
    const updated = recordBlock(run, {
      key: blockKeyAt(state.blockIndex),
      timeMs: gameNow() - blockStartRef.current,
      errors: state.errors,
      done,
    });
    seriesRunRef.current = updated;
    const isLast = state.blockIndex >= CHESS_SERIES_PLAN.length - 1;
    if (done && !isLast) {
      // ТА ЖЕ позиция — `nextBlock` переносит её как есть, выбирать заново нечего.
      setNextSeriesState(nextBlock(state));
      setPhase('interlude');
      return;
    }
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
      stopBlockClock();
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

  /** Ответ «да»/«нет». Одно касание — во всех трёх блоках одинаково. */
  const onSeriesAnswer = (said: boolean) => {
    const state = seriesStateRef.current;
    if (!state || !blockOpenRef.current) return;
    const asked = currentQuestion(state);
    const step = answerQuestion(state, said);
    if (step.result === 'ignored') return;
    if (step.result === 'hit') sndCorrect();
    else {
      sndWrong();
      // Что было на самом деле — понадобится в разборе; вопрос уже отвечен.
      if (asked && asked.kind === 'recall') setRecallMisses((prev) => [...prev, asked]);
    }
    setSeries(step.state);
    if (blockDone(step.state)) closeBlock(step.state, true);
  };

  /**
   * Показ позиции в блоке «память» начинает ЧЕЛОВЕК, а не таймер: иначе в замер
   * попало бы то, отвлёкся ли он в этот момент. Часы блока стартуют, когда
   * позицию убрали.
   */
  const beginRecallExposure = () => {
    setRecallStage('memorize');
    const totalMs = RECALL_EXPOSE_MS;
    const endAt = gameNow() + totalMs;
    setExposePct(100);
    setExposeLeft(Math.ceil(totalMs / 1000));
    exposeIvRef.current = setInterval(() => {
      const leftMs = Math.max(0, endAt - gameNow());
      setExposePct((leftMs / totalMs) * 100);
      setExposeLeft(Math.ceil(leftMs / 1000));
    }, 100);
    later(() => {
      if (exposeIvRef.current) { clearInterval(exposeIvRef.current); exposeIvRef.current = null; }
      setRecallStage('ask');
      beginBlockClock();
    }, totalMs);
  };

  /**
   * Врезка сама уводит в следующий блок — по ТОЙ ЖЕ позиции. Часы блока
   * стартуют здесь, поэтому 2,5 секунды чтения правила в замер не попадают.
   * У блока «память» часы ждут ещё дольше: сперва человек смотрит позицию.
   */
  useEffect(() => {
    if (phase !== 'interlude' || !nextSeriesState) return;
    const id = setTimeout(() => {
      setSeries(nextSeriesState);
      setNextSeriesState(null);
      if (blockKeyAt(nextSeriesState.blockIndex) === 'recall') setRecallStage('ready');
      else { setRecallStage('ask'); beginBlockClock(); }
      setPhase('series');
    }, INTERLUDE_MS);
    return () => clearTimeout(id);
    // Врезка живёт ровно одну фазу: зависимости — фаза и заготовленный блок.
  }, [phase, nextSeriesState]);

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
      difficulty: `L${partial.level}`,
    }).catch(() => {});
  }, []);

  const startGame = () => {
    clearTimers();
    const level = isPreset ? num('level', 1) : lvl.level;
    levelRef.current = level;
    const p = levelParams(level);
    prmRef.current = p;
    setPrm(p);

    const pos = generatePosition(p.pieces, p.quizType === 'locate');
    const { moves, final } = generateMoves(pos, p.moves);
    questionsRef.current = buildQuestions(final, p.quizType, p.questions);

    setDispPieces(pos.map((x) => ({ ...x })));
    hitsRef.current = 0; errorsRef.current = 0;
    setHits(0); setErrors(0);
    qIndexRef.current = 0; qLockRef.current = false; answeredRef.current = new Set(); setAnsweredTick(0);
    setQIndex(0); setRevealOpt(null); setRevealSq(null); setWrongSq(null);
    setMoveHl(null); setMoveNum(0);
    startTimeRef.current = gameNow();
    setPhase('expose');

    // таймер-полоска показа
    const totalMs = p.exposeSec * 1000;
    const endAt = gameNow() + totalMs;
    setExposePct(100);
    setExposeLeft(p.exposeSec);
    exposeIvRef.current = setInterval(() => {
      const leftMs = Math.max(0, endAt - gameNow());
      setExposePct((leftMs / totalMs) * 100);
      setExposeLeft(Math.ceil(leftMs / 1000));
    }, 100);
    later(() => {
      if (exposeIvRef.current) { clearInterval(exposeIvRef.current); exposeIvRef.current = null; }
      beginMask(moves);
    }, totalMs);
  };

  // Маскировка: все фигуры → одинаковые фишки; ходы анимируются setTimeout-цепочкой через ref
  const beginMask = (moves: Move[]) => {
    setPhase('mask');
    if (moves.length === 0) {
      later(() => beginQuiz(), 800);
      return;
    }
    moves.forEach((m, i) => {
      const base = 600 + i * 1400;   // интервал между ходами ~1400мс
      later(() => { setMoveHl({ from: m.from, to: m.to }); setMoveNum(i + 1); }, base);
      later(() => { setDispPieces((ps) => ps.map((p) => (p.id === m.pieceId ? { ...p, sq: m.to } : p))); }, base + 450);
      later(() => setMoveHl(null), base + 900);   // подсветка откуда/куда ~900мс
    });
    later(() => beginQuiz(), 600 + moves.length * 1400 + 400);
  };

  const beginQuiz = () => {
    setMoveHl(null);
    setPhase('quiz');
  };

  const finishGame = () => {
    const timeSec = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(timeSec);
    const fHits = hitsRef.current;
    const fErrors = errorsRef.current;
    const p = prmRef.current;
    const levelPassed = fErrors <= 1;
    const passed = !isPreset && levelPassed;
    if (passed) lvl.reach(levelRef.current + 1);
    saveSession({
      passed,
      game_type: 'chess_blind',
      score: fHits * 150 - fErrors * 50,
      time_seconds: timeSec,
      difficulty: `L${levelRef.current}`,
      mode: p.quizType,
      errors: fErrors,
      details: { level: levelRef.current, hits: fHits, errors: fErrors, pieces: p.pieces, moves: p.moves, quiz_type: p.quizType },
    }).catch((e) => console.error(e));
    // Уровневый режим: и проход, и недобор → общий баннер LevelCleared (passed=false = «почти, ещё раз», авто-рестарт).
    // Пресет/свободный режим — как было: экран статистики GameResult.
    if (isPreset) {
      setPhase('result');
    } else {
      setClearedPassed(levelPassed);
      setPhase('cleared');
    }
  };

  const nextQuestion = () => {
    setRevealOpt(null); setRevealSq(null); setWrongSq(null);
    answeredRef.current.add(qIndexRef.current);
    setAnsweredTick((x) => x + 1);
    // Следующий НЕОТВЕЧЕННЫЙ, а не следующий по счёту: человек мог отвечать вразнобой.
    const ni = nextUnanswered(qIndexRef.current, questionsRef.current.length, answeredRef.current);
    if (ni < 0) { finishGame(); return; }
    qIndexRef.current = ni;
    setQIndex(ni);
    qLockRef.current = false;
  };

  /** Тап по подсвеченной клетке в режиме «что стоит» — выбрать, про какую отвечаем. */
  const selectQuestionAt = (sq: number) => {
    if (qLockRef.current) return;
    const idx = questionsRef.current.findIndex((q, i) => q.sq === sq && !answeredRef.current.has(i));
    if (idx < 0) return;
    qIndexRef.current = idx;
    setQIndex(idx);
    setRevealOpt(null); setRevealSq(null); setWrongSq(null);
  };

  // 'pick': тап по кнопке-глифу
  const answerPick = (opt: Combo) => {
    if (qLockRef.current) return;
    const q = questionsRef.current[qIndexRef.current];
    if (!q) return;
    qLockRef.current = true;
    const correct = opt.type === q.answer.type && opt.white === q.answer.white;
    if (correct) {
      hitsRef.current += 1; setHits((h) => h + 1);
      sndCorrect();
      later(nextQuestion, 350);
    } else {
      errorsRef.current += 1; setErrors((e) => e + 1);
      sndWrong();
      setRevealOpt(q.answer);   // показать правильный ответ подсветкой на 1с
      later(nextQuestion, 1000);
    }
  };

  // 'locate': тап по клетке маскированной доски
  const answerLocate = (sq: number) => {
    if (qLockRef.current || phase !== 'quiz' || prmRef.current.quizType !== 'locate') return;
    const q = questionsRef.current[qIndexRef.current];
    if (!q) return;
    qLockRef.current = true;
    if (sq === q.sq) {
      hitsRef.current += 1; setHits((h) => h + 1);
      sndCorrect();
      setRevealSq(q.sq);
      later(nextQuestion, 450);
    } else {
      errorsRef.current += 1; setErrors((e) => e + 1);
      sndWrong();
      setWrongSq(sq);
      setRevealSq(q.sq);   // подсветить правильную клетку
      later(nextQuestion, 1000);
    }
  };

  const currentQ: Question | undefined = questionsRef.current[qIndex];

  // ─── доска ───
  const renderBoard = () => {
    const showPieces = phase === 'expose';
    const bySq = new Map<number, Piece>();
    dispPieces.forEach((p) => bySq.set(p.sq, p));
    const isPick = phase === 'quiz' && prm.quizType === 'pick';
    const pickTargetSq = isPick && currentQ ? currentQ.sq : -1;
    // Все ещё не отвеченные клетки — подсвечены бледнее выбранной и кликабельны.
    const pendingSqs = new Set<number>(
      isPick ? questionsRef.current.filter((_, i) => !answeredRef.current.has(i)).map((q) => q.sq) : [],
    );
    void answeredTick;   // перерисовка после ответа: набор живёт в ref

    return (
      // RTL-пин: шахматная доска канонически LTR (a-файл слева, светлая клетка справа внизу) —
      // зеркальная доска нарушает нотацию; writingDirection → CSS direction на web, нативу no-op
      <View style={{ width: boardSize, height: boardSize, borderRadius: 6, overflow: 'hidden', writingDirection: 'ltr' } as any}>
        {Array.from({ length: 8 }).map((_, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {Array.from({ length: 8 }).map((_, c) => {
              const sq = r * 8 + c;
              const isLight = (r + c) % 2 === 0;
              const bg = isLight ? '#9c7a5b' : '#6b4f3a';
              const coordColor = isLight ? '#5d4433' : '#c9b29a';
              let hl: string | null = null;
              if (moveHl && (moveHl.from === sq || moveHl.to === sq)) hl = '#fbbf24';
              if (pendingSqs.has(sq)) hl = '#38bdf880';   // ждёт ответа — бледная рамка
              if (pickTargetSq === sq) hl = '#38bdf8';       // выбранная сейчас — яркая
              if (revealSq === sq) hl = '#22c55e';
              if (wrongSq === sq) hl = '#f43f5e';
              const p = bySq.get(sq);
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={c}
                  activeOpacity={0.8}
                  onPress={() => (isPick ? selectQuestionAt(sq) : answerLocate(sq))}
                  disabled={!(phase === 'quiz' && (prm.quizType === 'locate' || (isPick && pendingSqs.has(sq))))}
                  style={{ width: cellSize, height: cellSize, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
                >
                  {c === 0 && <Text style={[styles.coord, { top: 1, left: 2, color: coordColor }]}>{8 - r}</Text>}
                  {r === 7 && <Text style={[styles.coord, { bottom: 1, right: 2, color: coordColor }]}>{'abcdefgh'[c]}</Text>}
                  {p && (showPieces ? (
                    // крупнее (0.82 клетки) + контурные белые / залитые чёрные с обводкой
                    <PieceGlyph combo={p} boxW={cellSize} boxH={cellSize} fontSize={Math.round(cellSize * 0.82)} />
                  ) : (
                    // фишка-маска: цвет СТОРОНЫ сохраняется, тип скрыт
                    <View
                      style={{
                        width: Math.round(cellSize * 0.62),
                        height: Math.round(cellSize * 0.62),
                        borderRadius: Math.round(cellSize * 0.31),
                        backgroundColor: p.white ? '#cbd5e1' : '#475569',
                        borderWidth: 2,
                        borderColor: p.white ? '#94a3b8' : '#1e293b',
                      }}
                    />
                  ))}
                  {hl && <View pointerEvents="none" style={[styles.hlOverlay, { borderColor: hl }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // ─── доска серии ───
  /**
   * ПОЗИЦИЯ СЕРИИ НА ДОСКЕ. Клетка подписана своим именем («e4») — это и подпись
   * для читалки экрана, и единственный честный способ прочитать расстановку с
   * ОТРИСОВАННОГО дерева: сравнить её поэлементно между блоками.
   *
   * ⚠️ ФИГУРА РИСУЕТСЯ ОДНИМ ЗНАКОМ ИЗ ЯДРА (`pieceGlyph`), а не своим набором
   * глифов экрана: иначе на доске стояло бы одно, а вопрос спрашивал бы про
   * другое, и разошлись бы они молча. Контраст даёт обводка тенью, а не второй
   * набор символов.
   */
  const renderSeriesBoard = (position: ChessPosition) => (
    // RTL-пин: доска канонически LTR (a-файл слева) — зеркальная нарушает нотацию.
    <View style={{ width: boardSize, height: boardSize, borderRadius: 6, overflow: 'hidden', writingDirection: 'ltr' } as any}>
      {Array.from({ length: BOARD_SIDE }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: BOARD_SIDE }).map((_, col) => {
            // Наш индекс считается СНИЗУ ВВЕРХ (0 = a1), а рисуем сверху вниз.
            const index = (BOARD_SIDE - 1 - row) * BOARD_SIDE + col;
            const piece = position.squares[index];
            const light = isLightSquare(index);
            return (
              <View
                key={col}
                accessible
                accessibilityLabel={squareName(index)}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: light ? '#9c7a5b' : '#6b4f3a',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {piece ? (
                  <Text
                    style={[styles.seriesGlyph, {
                      fontSize: Math.round(cellSize * 0.78),
                      lineHeight: cellSize,
                      color: piece.color === 'w' ? '#f8fafc' : '#111827',
                      textShadowColor: piece.color === 'w' ? '#0f172a' : '#f8fafc',
                    }]}
                  >
                    {pieceGlyph(piece)}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );

  /**
   * БЛОК СЕРИИ. Вопрос — строкой, ответ — двумя кнопками, и так во всех трёх
   * блоках: одинаковый ввод и есть то, что делает разности сравнимыми.
   *
   * 🔴 ДОСКИ ВО ВРЕМЯ ВОПРОСОВ НЕТ, И ЭТО НЕ ЭКОНОМИЯ МЕСТА. Нарисуй её — и
   * блок «поле» перестанет мерить работу в уме: цвет клеток видно глазами, а
   * «одного ли цвета a3 и f6» превратится в поиск двух клеток на картинке.
   * Позицию показывают дважды и оба раза ВНЕ замера: во врезке между блоками и
   * перед вопросами блока «память».
   */
  const renderSeries = () => {
    const state = seriesState;
    if (!state) return null;
    const header = blockHeader(chessStrings, state);
    const labels = answerLabels(chessStrings);
    const question = currentQuestion(state);
    const asking = recallStage === 'ask' && !!question;
    return (
      <GameShell
        title={chessStrings.entry}
        onBack={() => { leaveSeries(false); goBackOrHome(); }}
        headerRight={
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('exitConfirmLeave')}
            style={[styles.backBtn, { backgroundColor: colors.surface }]}
            onPress={() => leaveSeries(true)}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        }
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>
              {`${t('chessQuestionShort')} ${Math.min(state.step + 1, state.questions.length)}/${state.questions.length}`}
            </Text>
            <Text style={[styles.statText, { color: colors.text }]}>
              {`${t('time')} ${Math.floor(seriesTime)}${t('secShort')}`}
            </Text>
            <Text style={[styles.statText, { color: state.errors > 0 ? '#f43f5e' : colors.text }]}>
              {`${t('hud_errors')} ${state.errors}`}
            </Text>
          </View>
        }
        toolbar={asking ? (
          <View style={styles.answerRow}>
            <TouchableOpacity
              accessibilityRole="button" style={[styles.answerBtn, { backgroundColor: '#166534' }]}
              onPress={() => onSeriesAnswer(true)}
            >
              <Text style={styles.answerText}>{labels.yes}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" style={[styles.answerBtn, { backgroundColor: '#7f1d1d' }]}
              onPress={() => onSeriesAnswer(false)}
            >
              <Text style={styles.answerText}>{labels.no}</Text>
            </TouchableOpacity>
          </View>
        ) : undefined}
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.seriesBlockLine, { color: colors.textSecondary }]}>
            {`${header.counter} · ${header.title}`}
          </Text>
          {asking && question ? (
            <>
              <Text style={[styles.seriesQuestion, { color: colors.text }]}>
                {questionText(chessStrings, question)}
              </Text>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>{header.rule}</Text>
            </>
          ) : recallStage === 'ready' ? (
            <>
              <Text style={[styles.seriesQuestion, { color: colors.text }]}>{t('label_ready')}</Text>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>{memorizeLine(chessStrings)}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.startBtn} onPress={beginRecallExposure}>
                <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                  <Text style={styles.startBtnText}>{t('start')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : recallStage === 'memorize' ? (
            <>
              <Text style={[styles.seriesQuestion, { color: colors.text }]}>
                {`${memorizeLine(chessStrings)} · ${exposeLeft}${t('secShort')}`}
              </Text>
              <View style={[styles.barTrack, { width: boardSize, backgroundColor: colors.surface }]}>
                <View style={[styles.barFill, { width: `${exposePct}%` }]} />
              </View>
              {renderSeriesBoard(state.position)}
            </>
          ) : null}
        </View>
      </GameShell>
    );
  };

  /**
   * ВРЕЗКА между блоками. Её работа — назвать новое правило и сказать главное:
   * позиция НЕ менялась. Слова об этом мало — позиция тут же и показана, а стоит
   * этот показ ноль: врезка лежит между часами двух блоков, в замер не входит.
   */
  const renderInterlude = () => {
    const next = nextSeriesState;
    if (!next) return null;
    const card = blockInterlude(chessStrings, next);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.interlude}>
          <Ionicons name="swap-horizontal" size={44} color={GRADIENT[0]} />
          <Text style={[styles.interludeTitle, { color: colors.text }]}>{card.heading}</Text>
          <Text style={[styles.interludeBlock, { color: colors.text }]}>{card.title}</Text>
          <Text style={[styles.interludeRule, { color: colors.textSecondary }]}>{card.rule}</Text>
          <Text style={[styles.interludeSame, { color: colors.textSecondary }]}>{card.same}</Text>
          {renderSeriesBoard(next.position)}
        </View>
      </SafeAreaView>
    );
  };

  // ─── игровой экран (expose / mask / quiz) — на едином каркасе GameShell ───
  // Статы — в props каркаса; кнопки-глифы pick-квиза — в прибитом нижнем тулбаре
  // (эталон math-sprint); RTL-пин на контейнере доски сохранён внутри renderBoard.
  const renderPlay = () => (
    <GameShell
      title={t('chessBlind')}
      onBack={() => goBackOrHome()}
      stats={
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{t('label_level_short')}{levelRef.current}</Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>{t('hud_correct')} {hits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>{t('hud_errors')} {errors}</Text>
          {phase === 'quiz' && (
            <Text style={[styles.statText, { color: colors.text }]}>
              {/* ⚠️ Отвечать можно вразнобой, поэтому счётчик показывает ПРОГРЕСС
                   (сколько закрыто), а не номер выбранной клетки: с номером он прыгал
                   бы 1/3 → 3/3 → 2/3 при тапе по другой клетке и читался как ошибка. */}
              {t('chessQuestionShort')} {answeredTick}/{prm.questions}
            </Text>
          )}
        </View>
      }
      toolbar={
        phase === 'quiz' && prm.quizType === 'pick' && currentQ ? (
          <View style={[styles.optionsWrap, { width: boardSize }]}>
            {currentQ.options.map((opt, i) => {
              const isReveal = revealOpt && opt.type === revealOpt.type && opt.white === revealOpt.white;
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => answerPick(opt)}
                  accessibilityRole="button" accessibilityLabel={pieceName(opt, t)}
                  style={[
                    styles.optBtn,
                    {
                      // 🔴 СТОРОНА ФИГУРЫ — ЦВЕТОМ САМОЙ ПЛАШКИ. Раньше у всех шести кнопок
                      // был один тёмный фон #334155, и белую фигуру от чёрной отличала
                      // только инверсия заливки и обводки. На тёмной плашке это читается
                      // как «сплошная светлая» против «светлого контура» — репорт Дениса
                      // 23.08.2026: «не выглядит как белый, и чёрный король — проблема с
                      // различением чёрных и белых фигур». Теперь сторону несёт плашка,
                      // тип — форма глифа, и каналы независимы.
                      backgroundColor: opt.white ? '#e2e8f0' : '#1e293b',
                      borderColor: isReveal ? '#22c55e' : (opt.white ? '#94a3b8' : '#475569'),
                      borderWidth: isReveal ? 3 : 2,
                    },
                  ]}
                >
                  <PieceGlyph combo={opt} boxW={60} boxH={48} fontSize={40} onLight={opt.white} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : undefined
      }
    >
      <View style={styles.fieldCol}>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {phase === 'expose'
            ? `${t('chessHintMemorize')} · ${exposeLeft}${t('secShort')}`
            : phase === 'mask'
            ? (prm.moves > 0
                ? `${t('chessHintBlindMoves')}: ${moveNum}/${prm.moves}`
                : t('chessHintHidden'))
            : prm.quizType === 'pick'
            ? t('chessHintWhatSquare')
            : currentQ
            ? t('chessHintWhereIs').replace('{piece}', pieceName(currentQ.answer, t)).replace('{glyph}', glyphOf(currentQ.answer))
            : ''}
        </Text>

        {phase === 'expose' && (
          <View style={[styles.barTrack, { width: boardSize, backgroundColor: colors.surface }]}>
            <View style={[styles.barFill, { width: `${exposePct}%` }]} />
          </View>
        )}

        {renderBoard()}
      </View>
    </GameShell>
  );

  // ─── конфиг ───
  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const descBits = [
      `${p.pieces} ${t('chessCfgPieces')}`,
      `${t('chessCfgExpose')} ${p.exposeSec}${t('secShort')}`,
      ...(p.moves > 0 ? [`${p.moves} ${t('chessCfgBlindMoves')}`] : []),
      t(p.quizType === 'pick' ? 'chessCfgQuizPick' : 'chessCfgQuizLocate'),
    ];
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Text style={styles.configGlyph}>♞</Text>
          <Text style={styles.configTitle}>{t('chessBlind')}</Text>
          <Text style={styles.configDesc}>
            {t('chessBlindConfigDesc')}
          </Text>
        </LinearGradient>
        <GameAbout descriptionKey="chessBlindIntroDesc" benefits={CHESS_BENEFITS} accent={GRADIENT[0]} />
        <LevelProgressMap bestLevel={lvl.best} gameId="chess_blind" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {stageName(lvl.level, t)} · {t('label_level_short')}{lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {descBits.join(' · ')}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('lvlTargetBtn').replace('{n}', String(lvl.level))}</Text>
          </LinearGradient>
        </TouchableOpacity>
        {/* СЕРИЯ ИЗ ТРЁХ БЛОКОВ. Под кнопкой — с какой полосы она начнётся и какие
            уровни у блоков сейчас: иначе старт с минимума читается как откат. */}
        {!isPreset && (
          <View>
            <TouchableOpacity
              accessibilityRole="button" style={styles.startBtn} onPress={() => beginSeries()}>
              <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                <Text style={styles.startBtnText}>{seriesIntroText.entry}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[styles.seriesNote, { color: colors.text }]}>{seriesIntroText.startsAt}</Text>
            <Text style={[styles.seriesNote, { color: colors.textSecondary }]}>{seriesIntroText.yourLevels}</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  // Игровые фазы — на едином каркасе GameShell (без самодельной шапки).
  if (phase === 'expose' || phase === 'mask' || phase === 'quiz') {
    // ⚠️ Окно правил — ВНУТРИ возвращаемого дерева, а не строкой после `return`:
    // там оно недостижимо, а хук всё равно ставит флаг «правило показано», и
    // объяснение уровня человек не увидит уже никогда.
    return (<>{renderPlay()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>);
  }
  if (phase === 'series') return (<>{renderSeries()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>);
  if (phase === 'interlude') return (<>{renderInterlude()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('chessBlind')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared gameId="chess_blind" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 1 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult score={hits * 150 - errors * 50} time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
      {/* РАЗБОР СЕРИИ. Главное здесь не очки, а T₁/T₂/T₃ и две разности: цена
          правила хода и цена удержания. У неполной серии разностей нет ВООБЩЕ —
          вместо чисел говорим об этом прямо. */}
      {phase === 'seriesResult' && seriesFinished && (
        <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
          {(() => {
            const recap = seriesRecap(chessStrings, seriesFinished);
            const sec = (ms: number): string => `${(ms / 1000).toFixed(1)} ${t('seconds')}`;
            const signed = (ms: number): string => `${ms > 0 ? '+' : ''}${sec(ms)}`;
            return (
              <>
                <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
                  <Ionicons name="layers-outline" size={44} color={ON_GRAD.color} />
                  <Text style={styles.configTitle}>{recap.title}</Text>
                </LinearGradient>
                {/* T₁, T₂, T₃ — время каждого блока как оно есть. */}
                <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
                  {seriesFinished.blocks.map((b, i) => (
                    <Text key={b.key} style={[styles.seriesRow, { color: colors.text }]}>
                      {`${i + 1}. ${blockTitle(chessStrings, blockKeyAt(i))}: ${sec(b.timeMs)}`}
                    </Text>
                  ))}
                </View>
                {recap.note ? (
                  <Text style={[styles.seriesNote, { color: '#f43f5e' }]}>{recap.note}</Text>
                ) : (
                  // Разности собирает ядро из ключей блоков — не переписываем их строкой.
                  <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
                    {recap.rows.map((row, i) => (
                      <Text key={row.key} style={[styles.seriesRow, { color: colors.text }]}>
                        {`${row.label}: ${i === 0 ? sec(row.ms) : signed(row.ms)}`}
                      </Text>
                    ))}
                  </View>
                )}
                {/* Что стояло на поле НА САМОМ ДЕЛЕ — там, где ответ был неверным.
                    Без этого блок «память» ничему не учит: человек знает, что
                    ошибся, и не знает, чем. */}
                {recallMisses.length > 0 && (
                  <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.optionLabel, { color: colors.text }]}>{t('errors')}</Text>
                    {recallMisses.map((q) => (
                      <Text key={q.square} style={[styles.seriesRow, { color: colors.textSecondary }]}>
                        {`${squareName(q.square)} — ${truthLabel(chessStrings, q)}`}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            );
          })()}
          {seriesOutcome && (
            <Text style={[styles.seriesNote, { color: colors.textSecondary }]}>
              {levelMoveLine(chessStrings, {
                raised: seriesOutcome.raised,
                band: seriesOutcome.band,
                weakest: seriesOutcome.weakest,
                runsLeft: Math.max(1, seriesOutcome.runsLeft),
              })}
            </Text>
          )}
          <TouchableOpacity accessibilityRole="button" style={styles.startBtn} onPress={() => beginSeries()}>
            <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
              <Text style={styles.startBtnText}>{t('retry')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}
            onPress={() => setPhase('config')}
          >
            <Text style={[styles.optionLabel, { color: colors.text }]}>{t('back')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configGlyph: { fontSize: 48, color: ON_GRAD.color },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center', lineHeight: 19 },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 12 },   // hint + таймер-бар + доска внутри поля каркаса
  statsRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  statText: { fontSize: 15, fontWeight: '700' },
  hintText: { fontSize: 14, textAlign: 'center', minHeight: 20, fontWeight: '600' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#38bdf8' },
  coord: { position: 'absolute', fontSize: 8, fontWeight: '700' },
  glyphLayer: { position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center' },
  hlOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderRadius: 4 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  optBtn: { width: 64, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  // ── серия из трёх блоков ──
  seriesGlyph: { textAlign: 'center', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  seriesBlockLine: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  seriesQuestion: { fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 30 },
  seriesRow: { fontSize: 15 },
  seriesNote: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  answerRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  answerBtn: { minWidth: 128, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  answerText: { color: '#f8fafc', fontSize: 20, fontWeight: '700' },
  interlude: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  interludeTitle: { fontSize: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  interludeBlock: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  interludeRule: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
  interludeSame: { fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
});
