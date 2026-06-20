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

const GRADIENT = ['#7f7fd5', '#86a8e7'];
// Рисованные цифры — набор под активный профиль (см. src/constants/digitThemes.ts).
const SUDOKU_BENEFITS = [
  { icon: 'extension-puzzle-outline', textKey: 'benefitSudoku1' },
  { icon: 'analytics-outline', textKey: 'benefitSudoku2' },
  { icon: 'pulse-outline', textKey: 'benefitSudoku3' },
];

type Cell = number; // 0 = empty
type GamePhase = 'intro' | 'config' | 'playing' | 'result';

// Sudoku: 6×6 (блоки 2×3) для easy/medium; 9×9 (блоки 3×3) для hard — настоящая сложность.
function dimsFor(diff: 'easy' | 'medium' | 'hard') {
  return diff === 'hard' ? { N: 9, BR: 3, BC: 3 } : { N: 6, BR: 2, BC: 3 };
}

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function isValid(grid: Cell[][], r: number, c: number, val: number, N: number, BR: number, BC: number): boolean {
  for (let i = 0; i < N; i++) if (grid[r][i] === val || grid[i][c] === val) return false;
  const br = Math.floor(r / BR) * BR, bc = Math.floor(c / BC) * BC;
  for (let i = 0; i < BR; i++) for (let j = 0; j < BC; j++) if (grid[br + i][bc + j] === val) return false;
  return true;
}

function solve(grid: Cell[][], N: number, BR: number, BC: number): boolean {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (grid[r][c] === 0) {
      const nums = shuffle(Array.from({ length: N }, (_, i) => i + 1));
      for (const n of nums) {
        if (isValid(grid, r, c, n, N, BR, BC)) {
          grid[r][c] = n;
          if (solve(grid, N, BR, BC)) return true;
          grid[r][c] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

function generatePuzzle(blanks: number, N: number, BR: number, BC: number): { puzzle: Cell[][]; solution: Cell[][] } {
  const sol: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0));
  solve(sol, N, BR, BC);
  const puzzle: Cell[][] = sol.map((row) => [...row]);
  const positions = shuffle(Array.from({ length: N * N }, (_, i) => i));
  for (let i = 0; i < blanks; i++) {
    const p = positions[i];
    puzzle[Math.floor(p / N)][p % N] = 0;
  }
  return { puzzle, solution: sol };
}

export default function SudokuGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const [digitStyle, setDigitStyle] = useState<DigitStyle>(() => defaultStyleForProfile(profile?.id));
  const DIGIT_IMG = digitsForStyle(digitStyle);
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, str } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(() => (str('diff', 'medium') as 'easy' | 'medium' | 'hard'));
  const [dims, setDims] = useState({ N: 6, BR: 2, BC: 3 });
  const [puzzle, setPuzzle] = useState<Cell[][]>([]);
  const [solution, setSolution] = useState<Cell[][]>([]);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [given, setGiven] = useState<boolean[][]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const LIVES = 3, HINT_MAX = 3;   // игровая динамика: 3 жизни + 3 подсказки до перезапуска
  const [errors, setErrors] = useState(0);
  const [over, setOver] = useState(false);   // жизни кончились (3 ошибки) → game over + рестарт
  const [hintUses, setHintUses] = useState(0);
  const [backtrackCount, setBacktrackCount] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { N, BR, BC } = dims;   // размеры сетки текущей партии (6×6 или 9×9)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startGame = () => {
    const d = dimsFor(difficulty);
    setDims(d);
    // 6×6: easy 14 / medium 20 пустых; 9×9 hard: 50 пустых (≈31 подсказка) — настоящая сложность
    const blanks = difficulty === 'easy' ? 14 : difficulty === 'medium' ? 20 : 50;
    const { puzzle: p, solution: s } = generatePuzzle(blanks, d.N, d.BR, d.BC);
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
      try {
        await saveSession({
          game_type: 'sudoku',
          // hint_uses penalize score lightly (each hint = -50 pts), backtracks already implicit in errors
          score: Math.max(0, Math.round(2000 - errors * 50 - finalTime * 2 - hintUses * 50)),
          time_seconds: finalTime,
          difficulty,
          mode: '6x6',
          errors,
          details: {
            errors, completed: true,
            hint_uses: hintUses,
            backtrack_count: backtrackCount,
          },
        });
      } catch (e) { console.error(e); }
    }
  };

  // Hint: fill the selected cell with the correct value (penalizes biomarker)
  const handleHint = () => {
    if (!selected || hintUses >= HINT_MAX) return;
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
      {/* Выбор стиля цифр — кому авто-цвет под профиль не зашёл */}
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
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderPlaying = () => {
    const statsEl = (
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>{'❤️'.repeat(Math.max(0, LIVES - errors))}{'🤍'.repeat(Math.min(errors, LIVES))}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
    );
    const gridEl = (
      <View style={[styles.gridArea, { width: cellSize * N + 4, backgroundColor: colors.text }]}>
        {grid.map((row, r) => row.map((v, c) => {
          const isSel = selected?.r === r && selected?.c === c;
          const sameRow = selected?.r === r || selected?.c === c;
          const sameVal = v !== 0 && selected && grid[selected.r][selected.c] === v;
          const wrongVal = v !== 0 && solution[r] && solution[r][c] !== v;
          let bg = colors.surface;
          if (wrongVal) bg = isSel ? '#ef4444' : '#fecaca';  // ошибка: яркий красный если выделена, светло-красный иначе
          else if (isSel) bg = GRADIENT[0];
          else if (sameVal) bg = colors.card;
          else if (sameRow) bg = colors.card;
          return (
            <TouchableOpacity
              key={`${r}-${c}`}
              activeOpacity={0.6}
              onPress={() => handleCellPress(r, c)}
              style={[
                styles.cell,
                {
                  width: cellSize, height: cellSize, backgroundColor: bg,
                  borderRightWidth: (c + 1) % BC === 0 && c !== N - 1 ? 2 : 0.5,
                  borderBottomWidth: (r + 1) % BR === 0 && r !== N - 1 ? 2 : 0.5,
                  borderColor: colors.text,
                },
              ]}
            >
              {v !== 0 && (
                (isSel || wrongVal) ? (
                  <Text style={[styles.cellText, { color: isSel ? '#FFF' : '#b91c1c', fontWeight: '800' }]}>{v}</Text>
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
            <Image source={DIGIT_IMG[n]} style={{ width: 36, height: 36 }} resizeMode="contain" />
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
          disabled={!selected || hintUses >= HINT_MAX}
          style={[styles.hintBtn, { backgroundColor: '#fbbf24', opacity: (selected && hintUses < HINT_MAX) ? 1 : 0.4 }]}
        >
          <Ionicons name="bulb" size={16} color="#000" />
          <Text style={styles.hintBtnText}>{t('btn_hint')} ({hintUses}/{HINT_MAX})</Text>
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
            <TouchableOpacity style={styles.startBtn} onPress={startGame}>
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
      {phase === 'result' && (
        <GameResult score={Math.max(0, Math.round(2000 - errors * 50 - elapsedTime * 2))}
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
