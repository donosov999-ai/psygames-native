import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Image } from 'react-native';
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
import { useProfile } from '@/src/contexts/ProfileContext';
import { digitsForStyle, defaultStyleForProfile, DIGIT_STYLES } from '@/src/constants/digitThemes';
import type { DigitStyle } from '@/src/constants/digitThemes';
import { sndPlace, sndWrong } from '@/src/services/feedback';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GRADIENT = ['#7f7fd5', '#86a8e7'];
// Непрозрачная подсветка: смешать base (фон темы) с over (акцент). Полупрозрачный цвет поверх
// чёрного gridArea (colors.text) давал «чёрные» диагональные клетки в тёмной теме — баг.
function blendHex(base: string, over: string, t: number): string {
  const b = base.replace('#', ''), o = over.replace('#', '');
  if (b.length !== 6 || o.length !== 6) return over;
  const ch = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(ch(b, i) * (1 - t) + ch(o, i) * t).toString(16).padStart(2, '0');
  return '#' + mix(0) + mix(2) + mix(4);
}
// Рисованные цифры — набор под активный профиль (см. src/constants/digitThemes.ts).
const SUDOKU_BENEFITS = [
  { icon: 'extension-puzzle-outline', textKey: 'benefitSudoku1' },
  { icon: 'analytics-outline', textKey: 'benefitSudoku2' },
  { icon: 'pulse-outline', textKey: 'benefitSudoku3' },
];

type Cell = number; // 0 = empty
type GamePhase = 'intro' | 'config' | 'playing' | 'result';

// C2: размер РАЗВЯЗАН от сложности — селектор 6×6 / 9×9; сложность = плотность пустых клеток.
function dimsForSize(size: 6 | 9) {
  return size === 9 ? { N: 9, BR: 3, BC: 3 } : { N: 6, BR: 2, BC: 3 };
}
function blanksFor(size: 6 | 9, diff: 'easy' | 'medium' | 'hard') {
  if (size === 9) return diff === 'easy' ? 36 : diff === 'medium' ? 46 : 54;   // из 81
  return diff === 'easy' ? 12 : diff === 'medium' ? 18 : 24;                    // из 36
}

// SUDOKU-VARIANTS: правила-варианты на сетке 9×9. Применяются ТОЛЬКО при генерации решения
// (solve уважает правило → решение легально под вариантом). В игре механика «впиши решение»,
// поэтому вариант не энфорсится в рантайме — он задаёт характер решения + показывается игроку.
type Variant = 'none' | 'diagonal' | 'antiknight' | 'hyper' | 'nonconsec' | 'jigsaw' | 'antiking' | 'evenodd' | 'kropki';
const HYPER_BOXES = [[1, 1], [1, 5], [5, 1], [5, 5]] as const;   // Windoku: 4 доп. зоны 3×3 (левые-верхние углы)
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;
const KING = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;   // anti-king: диагональные соседи (ортогональные уже закрыты строкой/столбцом)
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
function inHyper(r: number, c: number): readonly [number, number] | null {
  for (const [hr, hc] of HYPER_BOXES) if (r >= hr && r < hr + 3 && c >= hc && c < hc + 3) return [hr, hc];
  return null;
}
function variantLabel(v: Variant, ru: boolean): string {
  switch (v) {
    case 'diagonal': return ru ? '⟍ диагональ' : '⟍ diagonal';
    case 'antiknight': return ru ? '♞ ход коня' : '♞ anti-knight';
    case 'hyper': return ru ? '⊞ доп. зоны' : '⊞ hyper';
    case 'nonconsec': return ru ? '≠ не подряд' : '≠ non-consecutive';
    case 'jigsaw': return ru ? '⧉ кривые блоки' : '⧉ jigsaw';
    case 'antiking': return ru ? '♚ ход короля' : '♚ anti-king';
    case 'evenodd': return ru ? '◩ чёт/нечёт' : '◩ even/odd';
    case 'kropki': return ru ? '⦿ точки' : '⦿ kropki';
    default: return '';
  }
}
function variantRule(v: Variant, ru: boolean): string {
  switch (v) {
    case 'diagonal': return ru ? 'Цифры уникальны ещё и по двум диагоналям.' : 'Digits are also unique along both diagonals.';
    case 'antiknight': return ru ? 'Одинаковые цифры не стоят на расстоянии хода коня.' : 'Equal digits cannot be a knight’s move apart.';
    case 'hyper': return ru ? 'Четыре доп. зоны 3×3 тоже содержат 1–9 без повторов.' : 'Four extra 3×3 regions also hold 1–9 with no repeats.';
    case 'nonconsec': return ru ? 'Соседние по стороне клетки не отличаются на 1.' : 'Orthogonally adjacent cells cannot differ by 1.';
    case 'jigsaw': return ru ? 'Блоки кривые, а не квадраты — в каждом тоже 1–9 без повторов.' : 'Blocks are irregular, not squares — each still holds 1–9.';
    case 'antiking': return ru ? 'Одинаковые цифры не касаются даже по диагонали (ход короля).' : 'Equal digits cannot touch even diagonally (a king’s move).';
    case 'evenodd': return ru ? '□ — чётная цифра, ○ — нечётная: форма подсказывает чётность.' : '□ even, ○ odd — the shape hints each cell’s parity.';
    case 'kropki': return ru ? 'Белая точка между клетками — соседние ±1, чёрная — одно вдвое больше.' : 'White dot between cells: consecutive (±1). Black dot: one is double the other.';
    default: return '';
  }
}

// Jigsaw: 9 связных регионов по 9 клеток. Region-growing «расти меньший растущий», рестарт при тупике.
function generateRegions(N: number): number[][] {
  for (let attempt = 0; attempt < 400; attempt++) {
    const reg: number[][] = Array.from({ length: N }, () => Array(N).fill(-1));
    const sizes = Array(N).fill(0);
    shuffle(Array.from({ length: N * N }, (_, i) => i)).slice(0, N).forEach((p, id) => { reg[Math.floor(p / N)][p % N] = id; sizes[id] = 1; });
    let filled = N, stuck = false;
    while (filled < N * N) {
      // анти-orphan: назначаем самую «угловую» неназначенную клетку (мин. свободных соседей),
      // у которой есть растущий сосед-регион, её НАИМЕНЬШЕМУ соседнему региону → карманы не остаются.
      let target = -1, tFree = 99, tReg = -1;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (reg[r][c] === -1) {
        let free = 0; const adj: number[] = [];
        for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N) { const v = reg[nr][nc]; if (v === -1) free++; else if (sizes[v] < N) adj.push(v); } }
        if (!adj.length) continue;
        if (free < tFree) { tFree = free; target = r * N + c; tReg = adj.sort((a, b) => sizes[a] - sizes[b])[0]; }
      }
      if (target < 0) { stuck = true; break; }
      reg[Math.floor(target / N)][target % N] = tReg; sizes[tReg]++; filled++;
    }
    if (!stuck && filled === N * N && sizes.every((s) => s === N)) return reg;
  }
  // фолбэк: квадратные блоки
  const { BR, BC } = dimsForSize(N as 6 | 9);
  const perRow = Math.floor(N / BC);
  const reg: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) reg[r][c] = Math.floor(r / BR) * perRow + Math.floor(c / BC);
  return reg;
}

// KILLER: отдельный режим. Подкрас cage-групп (тинт = subtle blend с фоном темы → виден и на свету, и в тьме).
const CAGE_ACCENTS = ['#7f7fd5', '#86a8e7', '#d58a7f', '#7fd5a8', '#d5c97f', '#b07fd5'] as const;
function killerBlanks(diff: 'easy' | 'medium' | 'hard'): number {
  return diff === 'easy' ? 44 : diff === 'medium' ? 52 : 60;   // из 81 — cages помогают дедукции, можно больше пустых
}
// Разбиение решения на cages: связные группы 2–4 клеток с РАЗНЫМИ цифрами (правило Killer) + сумма каждой.
function generateCages(sol: Cell[][], N: number): { cageOf: number[][]; sum: number[]; anchor: number[] } {
  const cageOf: number[][] = Array.from({ length: N }, () => Array(N).fill(-1));
  const sum: number[] = [], anchor: number[] = [];
  let cid = 0;
  for (const start of shuffle(Array.from({ length: N * N }, (_, i) => i))) {
    const sr = Math.floor(start / N), sc = start % N;
    if (cageOf[sr][sc] !== -1) continue;
    const target = 2 + Math.floor(Math.random() * 3);   // 2..4 клетки
    const cells: [number, number][] = [[sr, sc]];
    const digits = new Set<number>([sol[sr][sc]]);
    cageOf[sr][sc] = cid;
    while (cells.length < target) {
      const fr: [number, number][] = [];
      for (const [r, c] of cells) for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && cageOf[nr][nc] === -1 && !digits.has(sol[nr][nc])) fr.push([nr, nc]); }
      if (!fr.length) break;
      const [nr, nc] = fr[Math.floor(Math.random() * fr.length)];
      cageOf[nr][nc] = cid; cells.push([nr, nc]); digits.add(sol[nr][nc]);
    }
    cid++;
  }
  // вливаем одиночные cage в соседний (разные цифры, цель < 5) — чтобы не было «1-клеточных» групп
  const cellsOf = (id: number) => { const a: [number, number][] = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (cageOf[r][c] === id) a.push([r, c]); return a; };
  for (let id = 0; id < cid; id++) {
    const cells = cellsOf(id);
    if (cells.length !== 1) continue;
    const [r, c] = cells[0], d = sol[r][c];
    for (const [dr, dc] of shuffle(ORTHO.map((x) => x))) {
      const nr = r + dr, nc = c + dc; if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const nid = cageOf[nr][nc]; if (nid === id) continue;
      const tgt = cellsOf(nid);
      if (tgt.length >= 5 || tgt.some(([rr, cc]) => sol[rr][cc] === d)) continue;
      cageOf[r][c] = nid; break;
    }
  }
  // суммы + якоря по финальным cage (id могут иметь пропуски после слияния — это ок)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const id = cageOf[r][c];
    sum[id] = (sum[id] || 0) + sol[r][c];
    anchor[id] = anchor[id] === undefined ? r * N + c : Math.min(anchor[id], r * N + c);
  }
  return { cageOf, sum, anchor };
}

// SUDOKU-LVL: уровневая прогрессия. 1–4 = 6×6, 5–8 = 9×9, 9–13 = диагональ, далее фазы-варианты:
// 14–17 anti-knight, 18–21 hyper, 22+ non-consecutive (jigsaw — следующей итерацией).
interface LevelCfg { size: 6 | 9; N: number; BR: number; BC: number; blanks: number; variant: Variant; hintMax: number; }
function levelConfig(level: number): LevelCfg {
  const lv = Math.max(1, level);
  const size: 6 | 9 = lv <= 4 ? 6 : 9;
  const { N, BR, BC } = dimsForSize(size);
  let variant: Variant = 'none';
  if (lv >= 9 && lv <= 13) variant = 'diagonal';
  else if (lv >= 14 && lv <= 17) variant = 'antiknight';
  else if (lv >= 18 && lv <= 21) variant = 'hyper';
  else if (lv >= 22 && lv <= 25) variant = 'nonconsec';
  else if (lv >= 26 && lv <= 29) variant = 'antiking';
  else if (lv >= 30 && lv <= 33) variant = 'evenodd';
  else if (lv >= 34 && lv <= 37) variant = 'kropki';
  else if (lv >= 38) variant = 'jigsaw';
  const blanks = size === 6
    ? Math.min(24, 8 + lv * 3)                                   // L1..4 → 11,14,17,20
    : (variant === 'none' || variant === 'diagonal')
      ? Math.min(58, 34 + (lv - 5) * 3)                          // L5..13 классика/диагональ → 34..58
      : Math.min(52, 44 + Math.floor((lv - 14) / 4) * 2);        // фазы-варианты → 44,46,48,50,52 (правило добавляет сложность)
  const hintMax = lv <= 4 ? 3 : lv <= 8 ? 2 : 1;
  return { size, N, BR, BC, blanks, variant, hintMax };
}

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function isValid(grid: Cell[][], r: number, c: number, val: number, N: number, BR: number, BC: number, variant: Variant = 'none', regions?: number[][]): boolean {
  for (let i = 0; i < N; i++) if (grid[r][i] === val || grid[i][c] === val) return false;
  if (variant === 'jigsaw' && regions) {
    const reg = regions[r][c];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (regions[i][j] === reg && grid[i][j] === val) return false;   // бокс заменён регионом
  } else {
    const br = Math.floor(r / BR) * BR, bc = Math.floor(c / BC) * BC;
    for (let i = 0; i < BR; i++) for (let j = 0; j < BC; j++) if (grid[br + i][bc + j] === val) return false;
  }
  if (variant === 'diagonal') {
    if (r === c) { for (let i = 0; i < N; i++) if (grid[i][i] === val) return false; }                 // главная диагональ
    if (r + c === N - 1) { for (let i = 0; i < N; i++) if (grid[i][N - 1 - i] === val) return false; }  // побочная
  } else if (variant === 'antiknight') {
    for (const [dr, dc] of KNIGHT) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr][nc] === val) return false; }
  } else if (variant === 'hyper') {
    const h = inHyper(r, c); if (h) { const [hr, hc] = h; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (grid[hr + i][hc + j] === val) return false; }
  } else if (variant === 'nonconsec') {
    for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N) { const v = grid[nr][nc]; if (v !== 0 && Math.abs(v - val) === 1) return false; } }
  } else if (variant === 'antiking') {
    for (const [dr, dc] of KING) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr][nc] === val) return false; }
  }
  return true;
}

function solve(grid: Cell[][], N: number, BR: number, BC: number, variant: Variant = 'none', regions?: number[][], budget?: { steps: number }): boolean {
  // MRV: заполняем самую ОГРАНИЧЕННУЮ пустую клетку (минимум кандидатов) — почти без бэктрекинга.
  let bR = -1, bC = -1, bCands: number[] | null = null, bCount = N + 1;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] === 0) {
    const cands: number[] = [];
    for (let n = 1; n <= N; n++) if (isValid(grid, r, c, n, N, BR, BC, variant, regions)) cands.push(n);
    if (cands.length < bCount) { bCount = cands.length; bR = r; bC = c; bCands = cands; if (bCount === 0) return false; }
  }
  if (bR < 0) return true;   // пустых нет → решено
  if (budget) { if (budget.steps <= 0) return false; budget.steps--; }   // лимит шагов: нерешаемую jigsaw-раскладку бросаем быстро
  for (const n of shuffle(bCands!)) { grid[bR][bC] = n; if (solve(grid, N, BR, BC, variant, regions, budget)) return true; grid[bR][bC] = 0; }
  return false;
}

function generatePuzzle(blanks: number, N: number, BR: number, BC: number, variant: Variant = 'none'): { puzzle: Cell[][]; solution: Cell[][]; regions?: number[][]; parity?: number[][]; kropki?: { h: number[][]; v: number[][] } } {
  const sol: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0));
  let regions: number[][] | undefined;
  if (variant === 'jigsaw') {
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) { regions = generateRegions(N); for (const row of sol) row.fill(0); ok = solve(sol, N, BR, BC, 'jigsaw', regions, { steps: 1500 }); }   // budget низкий: ~90% раскладок нерешаемы, дешёвый отказ + ретрай
    if (!ok) { regions = undefined; for (const row of sol) row.fill(0); solve(sol, N, BR, BC, 'none'); }   // редкий фолбэк на классику
  } else {
    solve(sol, N, BR, BC, variant);
  }
  const puzzle: Cell[][] = sol.map((row) => [...row]);
  const positions = shuffle(Array.from({ length: N * N }, (_, i) => i));
  for (let i = 0; i < blanks; i++) {
    const p = positions[i];
    puzzle[Math.floor(p / N)][p % N] = 0;
  }
  let parity: number[][] | undefined;
  if (variant === 'evenodd') {   // помечаем ~55% пустых клеток их чётностью: 1 = чёт (квадрат), 2 = нечёт (круг)
    parity = Array.from({ length: N }, () => Array(N).fill(0));
    const blank: [number, number][] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (puzzle[r][c] === 0) blank.push([r, c]);
    for (const [r, c] of shuffle(blank).slice(0, Math.round(blank.length * 0.55))) parity[r][c] = sol[r][c] % 2 === 0 ? 1 : 2;
  }
  let kropki: { h: number[][]; v: number[][] } | undefined;
  if (variant === 'kropki') {   // точки из решения: 2 = чёрная (одно вдвое больше), 1 = белая (±1), 0 = нет
    const dot = (a: number, b: number) => (Math.max(a, b) === 2 * Math.min(a, b) ? 2 : Math.abs(a - b) === 1 ? 1 : 0);
    const h = Array.from({ length: N }, () => Array(N).fill(0));   // h[r][c]: грань между (r,c) и (r,c+1)
    const vrt = Array.from({ length: N }, () => Array(N).fill(0)); // vrt[r][c]: грань между (r,c) и (r+1,c)
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (c < N - 1) h[r][c] = dot(sol[r][c], sol[r][c + 1]);
      if (r < N - 1) vrt[r][c] = dot(sol[r][c], sol[r + 1][c]);
    }
    kropki = { h, v: vrt };
  }
  return { puzzle, solution: sol, regions, parity, kropki };
}

export default function SudokuGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const [digitStyle, setDigitStyle] = useState<DigitStyle>(() => defaultStyleForProfile(profile?.id));
  const DIGIT_IMG = digitsForStyle(digitStyle);
  // Тип цифр: 'plain' = обычный чёткий текст (дефолт — ровный размер, по центру, без тени), 'drawn' = рисованные наборы.
  const [digitMode, setDigitMode] = useState<'plain' | 'drawn'>('plain');
  useEffect(() => { AsyncStorage.getItem('psygames_sudoku_digitmode').then((v) => { if (v === 'plain' || v === 'drawn') setDigitMode(v); }).catch(() => {}); }, []);
  const changeDigitMode = (m: 'plain' | 'drawn') => { setDigitMode(m); AsyncStorage.setItem('psygames_sudoku_digitmode', m).catch(() => {}); };
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, str } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(() => (str('diff', 'medium') as 'easy' | 'medium' | 'hard'));
  const [size, setSize] = useState<6 | 9>(6);   // C2: явный размер поля (свободный режим)
  const [mode, setMode] = useState<'levels' | 'free' | 'killer'>('levels');   // уровни (дефолт) / свободно / killer
  const [level, setLevel] = useState(1);
  const [variant, setVariant] = useState<Variant>('none');   // активный вариант-правило текущей партии
  const [regions, setRegions] = useState<number[][] | null>(null);   // jigsaw: карта регионов текущей партии
  const [cages, setCages] = useState<number[][] | null>(null);       // killer: cageId каждой клетки
  const [cageSums, setCageSums] = useState<number[]>([]);            // killer: сумма каждой cage
  const [cageAnchors, setCageAnchors] = useState<number[]>([]);      // killer: клетка-якорь cage (метка суммы)
  const [parityMarks, setParityMarks] = useState<number[][] | null>(null);   // evenodd: 1=чёт(квадрат), 2=нечёт(круг), 0=без метки
  const [kropki, setKropki] = useState<{ h: number[][]; v: number[][] } | null>(null);   // kropki: точки на гранях клеток
  const [dims, setDims] = useState({ N: 6, BR: 2, BC: 3 });
  const [puzzle, setPuzzle] = useState<Cell[][]>([]);
  const [solution, setSolution] = useState<Cell[][]>([]);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [given, setGiven] = useState<boolean[][]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const LIVES = 3;   // 3 жизни до перезапуска
  const [hintMax, setHintMax] = useState(3);   // лимит подсказок (меньше на высоких уровнях)
  const [errors, setErrors] = useState(0);
  const [over, setOver] = useState(false);   // жизни кончились (3 ошибки) → game over + рестарт
  const [hintUses, setHintUses] = useState(0);
  const [backtrackCount, setBacktrackCount] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { N, BR, BC } = dims;   // размеры сетки текущей партии (6×6 или 9×9)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // SUDOKU-LVL: подтянуть сохранённый уровень профиля
  useEffect(() => {
    const pid = profile?.id;
    if (!pid) return;
    AsyncStorage.getItem(`psygames_sudoku_level_${pid}`).then((v) => { const n = parseInt(v || '1', 10); if (n >= 1) setLevel(n); }).catch(() => {});
  }, [profile?.id]);

  const startGame = (lvlOverride?: number) => {
    let d: { N: number; BR: number; BC: number };
    let blanks: number, vr: Variant = 'none', hMax = 3;
    if (mode === 'levels') {
      const cfg = levelConfig(lvlOverride ?? level);
      d = { N: cfg.N, BR: cfg.BR, BC: cfg.BC };
      blanks = cfg.blanks; vr = cfg.variant; hMax = cfg.hintMax;
    } else if (mode === 'killer') {
      d = dimsForSize(9);
      blanks = killerBlanks(difficulty);
    } else {
      d = dimsForSize(size);
      blanks = blanksFor(size, difficulty);
    }
    setDims(d);
    setVariant(vr);
    setHintMax(hMax);
    const { puzzle: p, solution: s, regions: rg, parity: pa, kropki: kr } = generatePuzzle(blanks, d.N, d.BR, d.BC, vr);
    setRegions(rg ?? null);
    setParityMarks(pa ?? null);
    setKropki(kr ?? null);
    if (mode === 'killer') { const cg = generateCages(s, d.N); setCages(cg.cageOf); setCageSums(cg.sum); setCageAnchors(cg.anchor); } else setCages(null);
    setPuzzle(p); setSolution(s);
    setGrid(p.map((r) => [...r]));
    setGiven(p.map((r) => r.map((v) => v !== 0)));
    setSelected(null);
    setErrors(0);
    setOver(false);
    setHintUses(0);
    setBacktrackCount(0);
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleCellPress = (r: number, c: number) => {
    if (given[r][c]) return;
    setSelected({ r, c });
  };

  const handleNumPress = async (n: number) => {
    if (!selected) return;
    const { r, c } = selected;
    if (given[r][c]) return;
    const previousValue = grid[r][c];
    const ng = grid.map((row) => [...row]);
    ng[r][c] = n;
    setGrid(ng);
    if (n !== 0) { (solution[r][c] === n) ? sndPlace() : sndWrong(); }   // тик при верной цифре, бузз при неверной
    if (n !== 0 && solution[r][c] !== n) {
      const ne = errors + 1;
      setErrors(ne);
      if (ne >= LIVES) {                              // жизни кончились → game over
        if (timerRef.current) clearInterval(timerRef.current);
        setOver(true);
      }
    }
    // Backtrack detection: if user previously placed a non-zero value and now changes/clears it
    // (proxy для "решил неуверенно — пришлось переделывать")
    if (previousValue !== 0 && previousValue !== n) {
      setBacktrackCount((b) => b + 1);
    }
    // Check completion
    let complete = true;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (ng[i][j] !== solution[i][j]) { complete = false; break; }
    }
    if (complete) {
      if (timerRef.current) clearInterval(timerRef.current);
      const finalTime = (Date.now() - startTime) / 1000;
      setElapsedTime(finalTime);
      setPhase('result');
      // SUDOKU-LVL: уровни — сохранить прогресс на следующий уровень (счёт растёт с уровнем)
      if (mode === 'levels') {
        const pid = profile?.id;
        if (pid) AsyncStorage.setItem(`psygames_sudoku_level_${pid}`, String(level + 1)).catch(() => {});
      }
      const baseScore = mode === 'levels' ? 1500 + level * 150 : 2000;
      try {
        await saveSession({
          game_type: 'sudoku',
          // hint_uses penalize score lightly (each hint = -50 pts), backtracks already implicit in errors
          score: Math.max(0, Math.round(baseScore - errors * 50 - finalTime * 2 - hintUses * 50)),
          time_seconds: finalTime,
          difficulty: mode === 'levels' ? (level <= 4 ? 'easy' : level <= 9 ? 'medium' : 'hard') : difficulty,
          mode: mode === 'levels' ? `level-${level}${variant !== 'none' ? '-' + variant : ''}` : mode === 'killer' ? `killer-${difficulty}` : `${N}x${N}`,
          errors,
          details: {
            errors, completed: true,
            hint_uses: hintUses,
            backtrack_count: backtrackCount,
            ...(mode === 'levels' ? { level, variant } : {}),
          },
        });
      } catch (e) { console.error(e); }
    }
  };

  // Hint: fill the selected cell with the correct value (penalizes biomarker)
  const handleHint = () => {
    if (!selected || hintUses >= hintMax) return;
    const { r, c } = selected;
    if (given[r][c]) return;
    const ng = grid.map((row) => [...row]);
    const correct = solution[r][c];
    if (ng[r][c] !== correct) {
      ng[r][c] = correct;
      setGrid(ng);
      setHintUses((h) => h + 1);
    }
  };

  // v1.30.6: рабочий landscape — сетка слева, панель цифр справа. В landscape размер ячейки
  // считаем по ВЫСОТЕ (она ограничивает), оставляя справа ~210px под цифры. Портрет — как был.
  const landscape = width > height;
  const cellSize = landscape
    ? Math.max(16, Math.floor(Math.min((height - 96) / N, (width - 210) / N, 92)))
    : Math.max(14, Math.floor(Math.min((width - 28) / N, (height - 330) / N, 92)));

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="apps" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('sudoku')}</Text>
        <Text style={styles.configDesc}>{t('sudokuDesc')}</Text>
      </LinearGradient>
      {/* SUDOKU-LVL: режим — уровни (прогрессия) или свободно (селекторы) */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Режим' : 'Mode'}</Text>
        <View style={styles.optionButtons}>
          {([['levels', language === 'ru' ? 'Уровни' : 'Levels'], ['free', language === 'ru' ? 'Свободно' : 'Free'], ['killer', 'Killer']] as const).map(([m, lbl]) => (
            <TouchableOpacity key={m} style={[styles.modeButton, mode === m
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setMode(m as 'levels' | 'free' | 'killer')}>
              <Text style={[styles.modeButtonText, { color: mode === m ? '#FFF' : colors.text }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {mode === 'levels' && (() => {
        const cfg = levelConfig(level);
        return (
          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? `Уровень ${level}` : `Level ${level}`}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {cfg.N}×{cfg.N}{` · ${language === 'ru' ? 'пусто' : 'blanks'} ${cfg.blanks} · ${language === 'ru' ? 'подсказок' : 'hints'} ${cfg.hintMax}`}{cfg.variant !== 'none' ? ` · ${variantLabel(cfg.variant, language === 'ru')}` : ''}
            </Text>
            {cfg.variant !== 'none' && (
              <Text style={{ color: GRADIENT[0], fontSize: 12, marginTop: 3, fontWeight: '600' }}>
                {variantRule(cfg.variant, language === 'ru')}
              </Text>
            )}
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {language === 'ru' ? 'Прошёл — откроется следующий, сложнее.' : 'Beat it — the next unlocks, harder.'}
            </Text>
          </View>
        );
      })()}

      {mode === 'killer' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>Killer Sudoku</Text>
          <Text style={{ color: GRADIENT[0], fontSize: 12, marginTop: 2, fontWeight: '600', lineHeight: 17 }}>
            {language === 'ru' ? 'Цифры в каждой цветной группе в сумме дают число в её углу и не повторяются.' : 'Digits in each coloured cage add up to the number in its corner and never repeat.'}
          </Text>
        </View>
      )}
      {mode === 'free' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Размер поля' : 'Board size'}</Text>
          <View style={styles.optionButtons}>
            {([6, 9] as const).map((s) => (
              <TouchableOpacity key={s} style={[styles.modeButton, size === s
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setSize(s)}>
                <Text style={[styles.modeButtonText, { color: size === s ? '#FFF' : colors.text }]}>{s}×{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {(mode === 'free' || mode === 'killer') && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
          <View style={styles.optionButtons}>
            {(['easy','medium','hard'] as const).map((d) => (
              <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setDifficulty(d)}>
                <Text style={[styles.modeButtonText, { color: difficulty === d ? '#FFF' : colors.text }]}>
                  {d === 'easy' ? t('easy') : d === 'medium' ? t('medium') : t('hard')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {/* Тип цифр: обычные (чёткий текст) или рисованные */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Цифры' : 'Digits'}</Text>
        <View style={styles.optionButtons}>
          {([['plain', language === 'ru' ? 'Обычные' : 'Plain'], ['drawn', language === 'ru' ? 'Рисованные' : 'Drawn']] as const).map(([m, lbl]) => (
            <TouchableOpacity key={m} onPress={() => changeDigitMode(m as 'plain' | 'drawn')}
              style={[styles.modeButton, digitMode === m
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[styles.modeButtonText, { color: digitMode === m ? '#FFF' : colors.text }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {/* Стиль рисованных цифр — только в режиме «Рисованные» */}
      {digitMode === 'drawn' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Стиль цифр' : 'Digit style'}</Text>
          <View style={styles.optionButtons}>
            {DIGIT_STYLES.map((st) => (
              <TouchableOpacity key={st} onPress={() => setDigitStyle(st)}
                style={[styles.modeButton, { paddingVertical: 6, paddingHorizontal: 10 }, digitStyle === st
                  ? { backgroundColor: GRADIENT[0], borderWidth: 2, borderColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border }]}>
                <Image source={digitsForStyle(st)[5]} style={{ width: 30, height: 30 }} resizeMode="contain" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <TouchableOpacity style={styles.startBtn} onPress={() => startGame()}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{mode === 'levels' ? (language === 'ru' ? `Уровень ${level} — играть` : `Play level ${level}`) : t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderPlaying = () => {
    const statsEl = (
      <View style={styles.statsRow}>
        {mode === 'levels' && <Text style={[styles.statText, { color: GRADIENT[0] }]}>{language === 'ru' ? `Ур.${level}` : `Lv${level}`}</Text>}
        <Text style={[styles.statText, { color: '#f43f5e' }]}>{'❤️'.repeat(Math.max(0, LIVES - errors))}{'🤍'.repeat(Math.min(errors, LIVES))}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
        {variant !== 'none' && <Text style={[styles.statText, { color: GRADIENT[0] }]}>{variantLabel(variant, language === 'ru').split(' ')[0]}</Text>}
      </View>
    );
    const gridEl = (
      <View style={[styles.gridArea, { width: cellSize * N + 4, backgroundColor: colors.text }]}>
        {grid.map((row, r) => row.map((v, c) => {
          const isSel = selected?.r === r && selected?.c === c;
          const sameRow = selected?.r === r || selected?.c === c;
          const sameVal = v !== 0 && selected && grid[selected.r][selected.c] === v;
          const wrongVal = v !== 0 && solution[r] && solution[r][c] !== v;
          let bg = (mode === 'killer' && cages) ? blendHex(colors.surface, CAGE_ACCENTS[cages[r][c] % CAGE_ACCENTS.length], 0.16) : colors.surface;
          if (wrongVal) bg = isSel ? '#ef4444' : '#fecaca';  // ошибка: яркий красный если выделена, светло-красный иначе
          else if (isSel) bg = GRADIENT[0];
          else if (sameVal) bg = colors.card;
          else if (sameRow) bg = colors.card;
          else if (variant === 'hyper' && inHyper(r, c)) bg = blendHex(colors.surface, GRADIENT[0], 0.14);   // непрозрачная подсветка доп. зон (Windoku)
          // ДИАГОНАЛЬ: НЕ заливаем фон (залитый квадрат скрывает цифру) — рисуем тонкую линию через клетку, см. ниже
          return (
            <TouchableOpacity
              key={`${r}-${c}`}
              activeOpacity={0.6}
              onPress={() => handleCellPress(r, c)}
              style={[
                styles.cell,
                {
                  width: cellSize, height: cellSize, backgroundColor: bg,
                  borderRightWidth: variant === 'jigsaw' && regions
                    ? (c !== N - 1 && regions[r][c] !== regions[r][c + 1] ? 2 : 0.5)
                    : ((c + 1) % BC === 0 && c !== N - 1 ? 2 : 0.5),
                  borderBottomWidth: variant === 'jigsaw' && regions
                    ? (r !== N - 1 && regions[r][c] !== regions[r + 1][c] ? 2 : 0.5)
                    : ((r + 1) % BR === 0 && r !== N - 1 ? 2 : 0.5),
                  borderColor: colors.text,
                },
              ]}
            >
              {variant === 'diagonal' && r === c && (
                <View style={{ position: 'absolute', width: cellSize * 1.42, height: 2.5, left: cellSize / 2 - cellSize * 0.71, top: cellSize / 2 - 1.25, backgroundColor: GRADIENT[0], opacity: 0.6, transform: [{ rotate: '45deg' }], pointerEvents: 'none' }} />
              )}
              {variant === 'diagonal' && r + c === N - 1 && (
                <View style={{ position: 'absolute', width: cellSize * 1.42, height: 2.5, left: cellSize / 2 - cellSize * 0.71, top: cellSize / 2 - 1.25, backgroundColor: GRADIENT[0], opacity: 0.6, transform: [{ rotate: '-45deg' }], pointerEvents: 'none' }} />
              )}
              {variant === 'evenodd' && parityMarks && parityMarks[r][c] !== 0 && (
                <View style={{ position: 'absolute', width: cellSize * 0.6, height: cellSize * 0.6, borderRadius: parityMarks[r][c] === 2 ? cellSize * 0.3 : Math.max(3, Math.round(cellSize * 0.1)), backgroundColor: blendHex(colors.surface, GRADIENT[1], 0.20), borderWidth: 1, borderColor: blendHex(colors.surface, GRADIENT[1], 0.45) }} />
              )}
              {variant === 'kropki' && kropki && c < N - 1 && kropki.h[r][c] !== 0 && (
                <View style={{ position: 'absolute', width: cellSize * 0.2, height: cellSize * 0.2, borderRadius: cellSize * 0.1, right: -cellSize * 0.1, top: cellSize / 2 - cellSize * 0.1, backgroundColor: kropki.h[r][c] === 2 ? colors.text : colors.surface, borderWidth: 1.5, borderColor: colors.text, zIndex: 5, pointerEvents: 'none' }} />
              )}
              {variant === 'kropki' && kropki && r < N - 1 && kropki.v[r][c] !== 0 && (
                <View style={{ position: 'absolute', width: cellSize * 0.2, height: cellSize * 0.2, borderRadius: cellSize * 0.1, bottom: -cellSize * 0.1, left: cellSize / 2 - cellSize * 0.1, backgroundColor: kropki.v[r][c] === 2 ? colors.text : colors.surface, borderWidth: 1.5, borderColor: colors.text, zIndex: 5, pointerEvents: 'none' }} />
              )}
              {mode === 'killer' && cages && cageAnchors[cages[r][c]] === r * N + c && (
                <Text style={{ position: 'absolute', top: 1, left: 2, fontSize: Math.max(8, Math.round(cellSize * 0.27)), fontWeight: '800', color: colors.text }}>{cageSums[cages[r][c]]}</Text>
              )}
              {v !== 0 && (
                (isSel || wrongVal || digitMode === 'plain') ? (
                  <Text style={{ color: isSel ? '#FFF' : wrongVal ? '#b91c1c' : colors.text, fontWeight: '700', fontSize: Math.round(cellSize * 0.52) }}>{v}</Text>
                ) : (
                  <Image source={DIGIT_IMG[v]} style={{ width: cellSize * 0.72, height: cellSize * 0.72 }} resizeMode="contain" />
                )
              )}
            </TouchableOpacity>
          );
        }))}
      </View>
    );
    const padEl = (
      <View style={[styles.numPad, landscape && styles.numPadLand]}>
        {Array.from({ length: N }, (_, i) => i + 1).map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => handleNumPress(n)}
            style={[styles.numBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          >
            {digitMode === 'plain'
              ? <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{n}</Text>
              : <Image source={DIGIT_IMG[n]} style={{ width: 36, height: 36 }} resizeMode="contain" />}
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => handleNumPress(0)} style={[styles.numBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="backspace-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
    {/* Hint button + biomarker counters */}
    const hintEl = (
      <View style={styles.hintRow}>
        <TouchableOpacity
          onPress={handleHint}
          disabled={!selected || hintUses >= hintMax}
          style={[styles.hintBtn, { backgroundColor: '#fbbf24', opacity: (selected && hintUses < hintMax) ? 1 : 0.4 }]}
        >
          <Ionicons name="bulb" size={16} color="#000" />
          <Text style={styles.hintBtnText}>{t('btn_hint')} ({hintUses}/{hintMax})</Text>
        </TouchableOpacity>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          ↻ {backtrackCount}
        </Text>
      </View>
    );
    if (landscape) {
      return (
        <View style={[styles.playArea, styles.playAreaLand]}>
          {gridEl}
          <View style={styles.landControls}>{statsEl}{padEl}{hintEl}</View>
        </View>
      );
    }
    return (
      <View style={styles.playArea}>
        {statsEl}
        {gridEl}
        {padEl}
        {hintEl}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('sudoku').replace(/\s*\d+\s*[×xX]\s*\d+\s*$/, '') + (phase === 'playing' ? ` ${N}×${N}` : '')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="sudoku" icon="apps" gradient={GRADIENT as [string, string]}
          skillKey="skillLogic" descriptionKey="sudokuIntroDesc"
          benefits={SUDOKU_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'playing' && over && (
        <View style={styles.overWrap}>
          <View style={[styles.overCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.overEmoji}>💔</Text>
            <Text style={[styles.overTitle, { color: colors.text }]}>{language === 'ru' ? 'Жизни закончились' : 'Out of lives'}</Text>
            <Text style={[styles.overSub, { color: colors.textSecondary }]}>{language === 'ru' ? '3 ошибки. Сыграй заново — поле новое.' : '3 mistakes. Play again — fresh board.'}</Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => startGame()}>
              <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                <Text style={styles.startBtnText}>{language === 'ru' ? 'Заново' : 'Restart'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goBackOrHome()} style={{ marginTop: 10 }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{language === 'ru' ? 'На главную' : 'Home'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {phase === 'result' && mode === 'free' && (
        <GameResult score={Math.max(0, Math.round(2000 - errors * 50 - elapsedTime * 2))}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
      {phase === 'result' && mode === 'levels' && (
        <View style={styles.overWrap}>
          <View style={[styles.overCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.overEmoji}>🎉</Text>
            <Text style={[styles.overTitle, { color: colors.text }]}>{language === 'ru' ? `Уровень ${level} пройден!` : `Level ${level} done!`}</Text>
            <Text style={[styles.overSub, { color: colors.textSecondary }]}>
              {language === 'ru' ? `Время ${elapsedTime.toFixed(1)}с · ошибок ${errors}` : `Time ${elapsedTime.toFixed(1)}s · errors ${errors}`}
            </Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => { const nx = level + 1; setLevel(nx); startGame(nx); }}>
              <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                <Text style={styles.startBtnText}>{language === 'ru' ? `Уровень ${level + 1} →` : `Level ${level + 1} →`}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPhase('config')} style={{ marginTop: 10 }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{language === 'ru' ? 'Меню судоку' : 'Sudoku menu'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 14, alignItems: 'center' },
  playAreaLand: { flexDirection: 'row', gap: 22 },                 // landscape: сетка | цифры
  landControls: { gap: 14, alignItems: 'center', justifyContent: 'center' },
  numPadLand: { maxWidth: 56 * 3 },                                // 3 столбца цифр справа
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  gridArea: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 4 },
  cell: { justifyContent: 'center', alignItems: 'center' },
  cellText: { fontSize: 28, fontWeight: '600' },
  numPad: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  numBtn: { width: 50, height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  numText: { color: '#FFF', fontSize: 26, fontWeight: '800' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  overWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 24, zIndex: 100 },
  overCard: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 24, alignItems: 'center', gap: 6 },
  overEmoji: { fontSize: 46 },
  overTitle: { fontSize: 20, fontWeight: '800' },
  overSub: { fontSize: 14, textAlign: 'center', marginBottom: 10 },
  hintBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  hintBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  metaText: { fontSize: 12, fontWeight: '700' },
});
