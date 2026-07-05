import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import { sndPlace, sndWrong } from '@/src/services/feedback';

const GRADIENT = ['#7f7fd5', '#86a8e7'];
// Непрозрачная подсветка: смешать base (фон темы) с over (акцент) — как в sudoku.tsx,
// чтобы полупрозрачный цвет поверх «чёрного» gridArea не давал чёрных клеток в тёмной теме.
function blendHex(base: string, over: string, t: number): string {
  const b = base.replace('#', ''), o = over.replace('#', '');
  if (b.length !== 6 || o.length !== 6) return over;
  const ch = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(ch(b, i) * (1 - t) + ch(o, i) * t).toString(16).padStart(2, '0');
  return '#' + mix(0) + mix(2) + mix(4);
}

type Cell = number; // 0 = empty (та же типизация, что в sudoku.tsx)
type GamePhase = 'config' | 'playing' | 'result';

// САМУРАЙ: 5 перекрывающихся сеток 9×9 на поле 21×21. [r0,c0] = левый-верхний угол сетки.
// TL, TR, BL, BR + Center, центр перекрывает каждый угол одним блоком 3×3.
const SIZE = 21;
const GRIDS: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, 12], [12, 0], [12, 12], [6, 6]];

// Все сетки, которым принадлежит клетка (r,c). Клетка-«дырка» (вне всех сеток) → пустой массив.
function gridsOf(r: number, c: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const g of GRIDS) { const [r0, c0] = g; if (r >= r0 && r < r0 + 9 && c >= c0 && c < c0 + 9) out.push(g); }
  return out;
}
// Валидные клетки = часть хотя бы одной сетки. Клетки-дырки НЕ рендерятся и не выбираются.
const CELLS: Array<[number, number]> = [];
for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (gridsOf(r, c).length) CELLS.push([r, c]);

// КЛЮЧЕВАЯ ИДЕЯ: клетки перекрытия — это ОДНА общая клетка в массиве 21×21, поэтому один solver
// автоматически согласует все 5 сеток. isValid проверяет правило судоку в КАЖДОЙ сетке клетки.
function isValid(g: Cell[][], r: number, c: number, val: number): boolean {
  for (const [r0, c0] of gridsOf(r, c)) {
    for (let cc = c0; cc < c0 + 9; cc++) if (g[r][cc] === val) return false;          // строка внутри сетки
    for (let rr = r0; rr < r0 + 9; rr++) if (g[rr][c] === val) return false;          // столбец внутри сетки
    const br = r0 + Math.floor((r - r0) / 3) * 3, bc = c0 + Math.floor((c - c0) / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (g[br + i][bc + j] === val) return false;   // блок 3×3
  }
  return true;
}

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// MRV-solver: заполняем самую ОГРАНИЧЕННУЮ пустую клетку — почти без бэктрекинга. budget = страховка по шагам.
function solve(g: Cell[][], budget?: { steps: number }): boolean {
  let bR = -1, bC = -1, bCands: number[] | null = null, bCount = 10;
  for (const [r, c] of CELLS) if (g[r][c] === 0) {
    const cn: number[] = [];
    for (let n = 1; n <= 9; n++) if (isValid(g, r, c, n)) cn.push(n);
    if (cn.length < bCount) { bCount = cn.length; bR = r; bC = c; bCands = cn; if (bCount === 0) return false; }
  }
  if (bR < 0) return true;   // пустых нет → решено
  if (budget) { if (budget.steps <= 0) return false; budget.steps--; }
  for (const n of shuffle(bCands!)) { g[bR][bC] = n; if (solve(g, budget)) return true; g[bR][bC] = 0; }
  return false;
}

// Счёт решений до limit (обычно 2). MRV как solve; исчерпание бюджета = limit
// (консервативно «единственность не доказана»). Возвращает grid в исходное состояние.
function countSolutions(g: Cell[][], limit = 2, budget: { steps: number } = { steps: 12000 }): number {
  let count = 0;
  const walk = (): boolean => {
    let bR = -1, bC = -1, bCands: number[] | null = null, bCount = 10;
    for (const [r, c] of CELLS) if (g[r][c] === 0) {
      const cn: number[] = [];
      for (let n = 1; n <= 9; n++) if (isValid(g, r, c, n)) cn.push(n);
      if (cn.length < bCount) { bCount = cn.length; bR = r; bC = c; bCands = cn; if (bCount === 0) return false; }
    }
    if (bR < 0) { count++; return count >= limit; }
    if (budget.steps-- <= 0) { count = limit; return true; }
    for (const n of bCands!) {
      g[bR][bC] = n;
      const stop = walk();
      g[bR][bC] = 0;
      if (stop) return true;
    }
    return false;
  };
  walk();
  return count;
}

// Генерация партии: решаем полное поле 21×21 (это РЕШЕНИЕ), копируем в PUZZLE и выкалываем
// ~52% валидных клеток. v1.112.0 — dig-with-uniqueness (тот же баг-класс, что в судоку v1.111.0):
// клетка выкалывается только если решение остаётся ЕДИНСТВЕННЫМ, иначе честный ход игрока
// мог помечаться «ошибкой» (сверка идёт с одним зашитым решением). Дедлайн держит UI живым.
function generatePuzzle(): { puzzle: Cell[][]; solution: Cell[][] } {
  const sol: Cell[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  solve(sol, { steps: 200000 });
  const puzzle: Cell[][] = sol.map((row) => [...row]);
  const blanks = Math.round(CELLS.length * 0.52);   // оставляем разумное число подсказок
  const order = shuffle(CELLS.map((_, i) => i));
  const deadline = Date.now() + 3000;
  let dug = 0;
  for (const idx of order) {
    if (dug >= blanks || Date.now() > deadline) break;
    const [r, c] = CELLS[idx];
    const keep = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle, 2, { steps: 12000 }) !== 1) puzzle[r][c] = keep;
    else dug++;
  }
  return { puzzle, solution: sol };
}

export default function SamuraiSudokuGame() {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { width } = useWindowDimensions();

  const [phase, setPhase] = useState<GamePhase>('config');
  const [solution, setSolution] = useState<Cell[][]>([]);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [given, setGiven] = useState<boolean[][]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [zoom, setZoom] = useState<'fit' | 'zoom'>('fit');   // дефолт — вся фигура «крест» видна целиком
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startGame = () => {
    const { puzzle: p, solution: s } = generatePuzzle();
    setSolution(s);
    setGrid(p.map((r) => [...r]));
    setGiven(p.map((r) => r.map((v) => v !== 0)));
    setSelected(null);
    setErrors(0);
    setZoom('fit');
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    setElapsedTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleCellPress = (r: number, c: number) => {
    if (!gridsOf(r, c).length) return;   // дырка — не выбирается
    if (given[r][c]) return;
    setSelected({ r, c });
  };

  const handleNumPress = async (n: number) => {
    if (!selected) return;
    const { r, c } = selected;
    if (given[r][c]) return;
    const ng = grid.map((row) => [...row]);
    ng[r][c] = n;
    setGrid(ng);
    if (n !== 0) { (solution[r][c] === n) ? sndPlace() : sndWrong(); }   // тик при верной, бузз при неверной
    if (n !== 0 && solution[r][c] !== n) setErrors((e) => e + 1);
    // Победа: каждая валидная клетка совпала с решением.
    let complete = true;
    for (const [i, j] of CELLS) if (ng[i][j] !== solution[i][j]) { complete = false; break; }
    if (complete) {
      if (timerRef.current) clearInterval(timerRef.current);
      const finalTime = (Date.now() - startTime) / 1000;
      setElapsedTime(finalTime);
      setPhase('result');
      try {
        await saveSession({
          game_type: 'sudoku',
          score: Math.max(0, Math.round(4000 - errors * 50 - finalTime * 2)),
          time_seconds: finalTime,
          difficulty: 'hard',
          mode: 'samurai',
          errors,
          details: { errors, completed: true, samurai: true },
        });
      } catch (e) { console.error(e); }
    }
  };

  // ZOOM: 'fit' — всё поле 21×21 видно (≈17px на телефоне), 'zoom' — вдвое крупнее со скроллом.
  const fitCell = Math.floor((Math.min(width, 600) - 16) / SIZE);
  const cellSize = zoom === 'fit' ? Math.max(12, fitCell) : Math.max(24, fitCell * 2);

  const renderConfig = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Text style={{ fontSize: 44 }}>🎴</Text>
        <Text style={styles.configTitle}>{language === 'ru' ? 'Самурай' : 'Samurai'}</Text>
        <Text style={styles.configDesc}>
          {language === 'ru'
            ? 'Пять сеток 9×9 с общими угловыми блоками. Правила судоку в каждой.'
            : 'Five overlapping 9×9 grids sharing corner blocks; standard sudoku in each.'}
        </Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Как играть' : 'How to play'}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {language === 'ru'
            ? 'Поле 21×21 = пять судоку, перекрытых углами. Заполни каждую клетку так, чтобы в каждой сетке 9×9 строки, столбцы и блоки 3×3 содержали 1–9 без повторов. Кнопкой 🔍 переключай масштаб: «вся фигура» или «крупно со скроллом».'
            : 'A 21×21 board = five sudoku overlapping at the corners. Fill every cell so each 9×9 grid has 1–9 with no repeats in rows, columns and 3×3 boxes. Use 🔍 to toggle zoom: whole shape or zoomed-in with scroll.'}
        </Text>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{language === 'ru' ? 'Играть' : 'Play'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  // Одна клетка поля. Дырки (вне всех сеток) рисуем прозрачными — так видна фигура-крест из 5 сеток.
  const renderCell = (r: number, c: number) => {
    const owners = gridsOf(r, c);
    if (!owners.length) {
      return <View key={`${r}-${c}`} style={{ width: cellSize, height: cellSize, backgroundColor: 'transparent' }} />;
    }
    const v = grid[r][c];
    const isSel = selected?.r === r && selected?.c === c;
    const sameRow = selected?.r === r || selected?.c === c;
    const sameVal = v !== 0 && selected && grid[selected.r][selected.c] === v;
    const isGiven = given[r][c];
    // Конфликт: размещённая цифра дублируется в любой сетке, которой принадлежит клетка.
    const conflict = v !== 0 && (() => {
      for (const [r0, c0] of owners) {
        for (let cc = c0; cc < c0 + 9; cc++) if (cc !== c && grid[r][cc] === v) return true;
        for (let rr = r0; rr < r0 + 9; rr++) if (rr !== r && grid[rr][c] === v) return true;
        const br = r0 + Math.floor((r - r0) / 3) * 3, bc = c0 + Math.floor((c - c0) / 3) * 3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const rr = br + i, cc = bc + j; if ((rr !== r || cc !== c) && grid[rr][cc] === v) return true; }
      }
      return false;
    })();

    let bg = colors.surface;
    if (conflict) bg = isSel ? '#ef4444' : '#fecaca';   // ошибка-дубль: яркий красный если выделена, иначе светло-красный
    else if (isSel) bg = GRADIENT[0];
    else if (sameVal) bg = colors.card;
    else if (sameRow) bg = colors.card;

    // Толстые границы — по краям блока 3×3 ВНУТРИ каждой сетки + по внешнему контуру сетки.
    // Считаем по «первой» сетке-владельцу: локальные координаты определяют шаг блоков (origin кратен 3 → совпадает у пересечений).
    const [pr0, pc0] = owners[0];
    const lr = r - pr0, lc = c - pc0;
    const rightThick = gridsOf(r, c + 1).length === 0 || (lc + 1) % 3 === 0;
    const bottomThick = gridsOf(r + 1, c).length === 0 || (lr + 1) % 3 === 0;
    const leftThick = gridsOf(r, c - 1).length === 0;
    const topThick = gridsOf(r - 1, c).length === 0;

    return (
      <TouchableOpacity
        key={`${r}-${c}`}
        activeOpacity={0.6}
        onPress={() => handleCellPress(r, c)}
        style={{
          width: cellSize, height: cellSize, backgroundColor: bg,
          justifyContent: 'center', alignItems: 'center',
          borderColor: colors.text,
          borderRightWidth: rightThick ? 2 : 0.5,
          borderBottomWidth: bottomThick ? 2 : 0.5,
          borderLeftWidth: leftThick ? 2 : 0,
          borderTopWidth: topThick ? 2 : 0,
        }}
      >
        {v !== 0 && (
          <Text style={{
            color: isSel ? '#FFF' : conflict ? '#b91c1c' : isGiven ? colors.text : GRADIENT[0],
            fontWeight: isGiven ? '800' : '700',
            fontSize: Math.round(cellSize * 0.56),
          }}>{v}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const boardEl = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cellSize * SIZE }}>
      {grid.map((row, r) => row.map((_, c) => renderCell(r, c)))}
    </View>
  );

  const renderPlaying = () => {
    const statsEl = (
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>{language === 'ru' ? `Ошибок ${errors}` : `Errors ${errors}`}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
        <TouchableOpacity onPress={() => setZoom((z) => (z === 'fit' ? 'zoom' : 'fit'))} style={[styles.zoomBtn, { borderColor: colors.border }]}>
          <Ionicons name={zoom === 'fit' ? 'search' : 'contract'} size={15} color={colors.text} />
          <Text style={[styles.statText, { color: colors.text, fontSize: 12 }]}>{zoom === 'fit' ? (language === 'ru' ? 'Крупно' : 'Zoom') : (language === 'ru' ? 'Всё поле' : 'Fit')}</Text>
        </TouchableOpacity>
      </View>
    );
    // В режиме 'zoom' оборачиваем поле в 2D-скролл (вложенные ScrollView — работают и в вебе, и нативно).
    const boardWrap = zoom === 'zoom'
      ? (
        // flex:1 (не фиксированный maxHeight) — доска занимает РОВНО остаток экрана
        // после statsEl/padEl, поэтому цифровая панель ГАРАНТИРОВАННО остаётся видна,
        // не нужно отдалять зум чтобы до неё дотянуться.
        <ScrollView horizontal style={styles.zoomScroll} contentContainerStyle={{ padding: 6 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 0 }}>{boardEl}</ScrollView>
        </ScrollView>
      )
      : <View style={{ alignSelf: 'center' }}>{boardEl}</View>;

    const padEl = (
      <View style={styles.numPad}>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
          <TouchableOpacity key={n} onPress={() => handleNumPress(n)}
            style={[styles.numBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{n}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => handleNumPress(0)} style={[styles.numBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="backspace-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    );

    return (
      <View style={styles.playArea}>
        {statsEl}
        {boardWrap}
        {padEl}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{language === 'ru' ? 'Самурай' : 'Samurai'}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(4000 - errors * 50 - elapsedTime * 2))}
          time={elapsedTime} errors={errors}
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
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 14, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  zoomBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  zoomScroll: { flex: 1, alignSelf: 'stretch' },
  numPad: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  numBtn: { width: 46, height: 46, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
});
