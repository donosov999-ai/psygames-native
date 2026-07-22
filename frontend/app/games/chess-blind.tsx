import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

/**
 * Слепые шахматы (chess_blind) — тренировка удержания позиции в уме.
 * Позиция показывается → все фигуры маскируются одинаковыми фишками →
 * (на старших уровнях фигуры вслепую ходят) → квиз: «что стоит здесь?» / «где фигура X?».
 * Подготовка к игре вслепую: игрок держит в голове, какая фишка что.
 */

const GRADIENT = ['#334155', '#0f172a'];   // шахматный тёмный
const CHESS_BENEFITS = [
  { icon: 'eye-off-outline', textKey: 'benefitChessBlind1' },
  { icon: 'grid-outline', textKey: 'benefitChessBlind2' },
  { icon: 'bulb-outline', textKey: 'benefitChessBlind3' },
];

type GamePhase = 'intro' | 'config' | 'expose' | 'mask' | 'quiz' | 'cleared' | 'result';
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
function PieceGlyph({ combo, boxW, boxH, fontSize }: {
  combo: Combo; boxW: number; boxH: number; fontSize: number;
}) {
  const glyph = glyphOf(combo);
  const fill = combo.white ? '#f8fafc' : '#111827';
  const stroke = combo.white ? '#0f172a' : '#f8fafc';
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
const RU_NAME: Record<PieceType, { n: string; fem: boolean }> = {
  K: { n: 'король', fem: false }, Q: { n: 'ферзь', fem: false }, R: { n: 'ладья', fem: true },
  B: { n: 'слон', fem: false }, N: { n: 'конь', fem: false }, P: { n: 'пешка', fem: true },
};
const EN_NAME: Record<PieceType, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };

function pieceName(c: Combo, ru: boolean): string {
  if (ru) {
    const { n, fem } = RU_NAME[c.type];
    return `${c.white ? (fem ? 'белая' : 'белый') : (fem ? 'чёрная' : 'чёрный')} ${n}`;
  }
  return `${c.white ? 'white' : 'black'} ${EN_NAME[c.type]}`;
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

function stageName(level: number, ru: boolean): string {
  if (level <= 5) return ru ? 'Вспышка' : 'Flash';
  if (level <= 10) return ru ? 'Слепые ходы' : 'Blind moves';
  return ru ? 'Розыск' : 'Locate';
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
  const ru = language === 'ru';
  const { width, height } = useWindowDimensions();

  const lvl = usePersistentLevel('chess_blind');
  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');
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
  };
  useEffect(() => () => clearTimers(), []);   // очистка всех таймеров на unmount

  const cellSize = Math.floor(Math.min(width - 24, height - 360, 480) / 8);
  const boardSize = cellSize * 8;

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
    qIndexRef.current = 0; qLockRef.current = false;
    setQIndex(0); setRevealOpt(null); setRevealSq(null); setWrongSq(null);
    setMoveHl(null); setMoveNum(0);
    startTimeRef.current = Date.now();
    setPhase('expose');

    // таймер-полоска показа
    const totalMs = p.exposeSec * 1000;
    const endAt = Date.now() + totalMs;
    setExposePct(100);
    setExposeLeft(p.exposeSec);
    exposeIvRef.current = setInterval(() => {
      const leftMs = Math.max(0, endAt - Date.now());
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
    const timeSec = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(timeSec);
    const fHits = hitsRef.current;
    const fErrors = errorsRef.current;
    const p = prmRef.current;
    const levelPassed = fErrors <= 1;
    const passed = !isPreset && levelPassed;
    if (passed) lvl.reach(levelRef.current + 1);
    saveSession({
      game_type: 'chess_blind',
      score: fHits * 150 - fErrors * 50,
      time_seconds: timeSec,
      difficulty: `L${levelRef.current}`,
      mode: p.quizType,
      errors: fErrors,
      details: { hits: fHits, errors: fErrors, pieces: p.pieces, moves: p.moves, quiz_type: p.quizType },
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
    const ni = qIndexRef.current + 1;
    if (ni >= questionsRef.current.length) { finishGame(); return; }
    qIndexRef.current = ni;
    setQIndex(ni);
    qLockRef.current = false;
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
    const pickTargetSq = phase === 'quiz' && prm.quizType === 'pick' && currentQ ? currentQ.sq : -1;

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
              if (pickTargetSq === sq) hl = '#38bdf8';
              if (revealSq === sq) hl = '#22c55e';
              if (wrongSq === sq) hl = '#f43f5e';
              const p = bySq.get(sq);
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.8}
                  onPress={() => answerLocate(sq)}
                  disabled={!(phase === 'quiz' && prm.quizType === 'locate')}
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

  // ─── игровой экран (expose / mask / quiz) ───
  const renderPlay = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{ru ? 'Ур.' : 'Lv'}{levelRef.current}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        {phase === 'quiz' && (
          <Text style={[styles.statText, { color: colors.text }]}>
            {ru ? 'Вопрос' : 'Q'} {qIndex + 1}/{prm.questions}
          </Text>
        )}
      </View>

      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {phase === 'expose'
          ? `${ru ? 'Запомни позицию' : 'Memorize the position'} · ${exposeLeft}${ru ? 'с' : 's'}`
          : phase === 'mask'
          ? (prm.moves > 0
              ? `${ru ? 'Фигуры ходят вслепую' : 'Blind moves'}: ${moveNum}/${prm.moves}`
              : (ru ? 'Фигуры скрыты…' : 'Pieces are hidden…'))
          : prm.quizType === 'pick'
          ? (ru ? 'Что стоит на подсвеченной клетке?' : 'What is on the highlighted square?')
          : currentQ
          ? `${ru ? 'Где' : 'Where is the'} ${pieceName(currentQ.answer, ru)} ${glyphOf(currentQ.answer)}? ${ru ? 'Тапни клетку' : 'Tap the square'}`
          : ''}
      </Text>

      {phase === 'expose' && (
        <View style={[styles.barTrack, { width: boardSize, backgroundColor: colors.surface }]}>
          <View style={[styles.barFill, { width: `${exposePct}%` }]} />
        </View>
      )}

      {renderBoard()}

      {phase === 'quiz' && prm.quizType === 'pick' && currentQ && (
        <View style={[styles.optionsWrap, { width: boardSize }]}>
          {currentQ.options.map((opt, i) => {
            const isReveal = revealOpt && opt.type === revealOpt.type && opt.white === revealOpt.white;
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.8}
                onPress={() => answerPick(opt)}
                style={[
                  styles.optBtn,
                  { backgroundColor: '#334155', borderColor: isReveal ? '#22c55e' : '#1e293b', borderWidth: isReveal ? 3 : 1 },
                ]}
              >
                <PieceGlyph combo={opt} boxW={60} boxH={48} fontSize={40} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  // ─── конфиг ───
  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const descBits = [
      `${p.pieces} ${ru ? 'фигур' : 'pieces'}`,
      `${ru ? 'показ' : 'expose'} ${p.exposeSec}${ru ? 'с' : 's'}`,
      ...(p.moves > 0 ? [`${p.moves} ${ru ? 'ходов вслепую' : 'blind moves'}`] : []),
      p.quizType === 'pick' ? (ru ? 'вопрос «что здесь?»' : '“what is here?” quiz') : (ru ? 'вопрос «где фигура?»' : '“where is it?” quiz'),
    ];
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Text style={styles.configGlyph}>♞</Text>
          <Text style={styles.configTitle}>{t('chessBlind')}</Text>
          <Text style={styles.configDesc}>
            {ru
              ? 'Запомни позицию — фигуры замаскируются одинаковыми фишками. Держи в голове, какая фишка что, даже когда они ходят.'
              : 'Memorize the position — the pieces get masked as identical tokens. Keep track of what each token is, even as they move.'}
          </Text>
        </LinearGradient>
        <LevelProgressMap gameId="chess_blind" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {stageName(lvl.level, ru)} · {ru ? 'Ур.' : 'Lv'}{lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {descBits.join(' · ')}
          </Text>
        </View>
        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('lvlTargetBtn').replace('{n}', String(lvl.level))}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('chessBlind')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="chessBlind"
          icon="grid"
          gradient={GRADIENT as [string, string]}
          skillKey="skillVisualMemory"
          descriptionKey="chessBlindIntroDesc"
          benefits={CHESS_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {(phase === 'expose' || phase === 'mask' || phase === 'quiz') && renderPlay()}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configGlyph: { fontSize: 48, color: '#FFF' },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center', lineHeight: 19 },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  statText: { fontSize: 15, fontWeight: '700' },
  hintText: { fontSize: 14, textAlign: 'center', minHeight: 20, fontWeight: '600' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#38bdf8' },
  coord: { position: 'absolute', fontSize: 8, fontWeight: '700' },
  glyphLayer: { position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center' },
  hlOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderRadius: 4 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  optBtn: { width: 64, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
