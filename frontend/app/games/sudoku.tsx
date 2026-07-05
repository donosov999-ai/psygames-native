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
import BossRound, { BossType } from '@/src/components/BossRound';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useProfile } from '@/src/contexts/ProfileContext';
import { digitsForStyle, defaultStyleForProfile, DIGIT_STYLES } from '@/src/constants/digitThemes';
import type { DigitStyle } from '@/src/constants/digitThemes';
import { sndPlace, sndWrong } from '@/src/services/feedback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Line } from 'react-native-svg';

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


// v1.111.0: чистое ядро судоку (типы, варианты, генерация с unique-check) вынесено в сервис.
import {
  Cell, Variant, ThermoPN, ArrowMap,
  dimsForSize, blanksFor, killerBlanks, generateCages, levelConfig,
  variantLabel, variantRule, shuffle, generatePuzzle, inHyper,
} from '@/src/services/sudoku-core';

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'result';

// KILLER: подкрас cage-групп (тинт = subtle blend с фоном темы → виден и на свету, и в тьме).

const CAGE_ACCENTS = ['#7f7fd5', '#86a8e7', '#d58a7f', '#7fd5a8', '#d5c97f', '#b07fd5'] as const;

// Босс-веха: каждые 3 уровня — короткий раунд с резко другим правилом (bag-рандом, без повторов подряд).
const BOSS_EVERY = 3;
const SUDOKU_BOSS_BAG: BossType[] = [];
function nextSudokuBoss(): BossType {
  if (SUDOKU_BOSS_BAG.length === 0) SUDOKU_BOSS_BAG.push(...shuffle(['finderror', 'lightning', 'completeline'] as BossType[]));
  return SUDOKU_BOSS_BAG.pop()!;
}


// ─── v1.111.0: СПРАВКА ПРАВИЛ УРОВНЯ (баг-репорт Вали: играла анти-коня, не зная правила) ───
// Доступна ВО ВРЕМЯ игры тапом по бейджу варианта; авто-открывается при первом входе
// на уровень с новым правилом. Пример — наглядная мини-диаграмма.

type ExMark = { t?: string; kind: 'src' | 'ban' | 'zone' };
// Мини-сетка 5×5 для геометрических правил: src = поставленная цифра, ban = сюда такую же нельзя, zone = особая зона.
function exampleGrid(variant: Variant): Record<string, ExMark> | null {
  const m: Record<string, ExMark> = {};
  const put = (r: number, c: number, mark: ExMark) => { m[`${r},${c}`] = mark; };
  switch (variant) {
    case 'antiknight':
      put(2, 2, { t: '3', kind: 'src' });
      for (const [dr, dc] of KNIGHT_EX) put(2 + dr, 2 + dc, { t: '3', kind: 'ban' });
      return m;
    case 'antiking':
      put(2, 2, { t: '3', kind: 'src' });
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) put(2 + dr, 2 + dc, { t: '3', kind: 'ban' });
      return m;
    case 'nonconsec':
      put(2, 2, { t: '3', kind: 'src' });
      put(1, 2, { t: '2', kind: 'ban' }); put(3, 2, { t: '4', kind: 'ban' });
      put(2, 1, { t: '4', kind: 'ban' }); put(2, 3, { t: '2', kind: 'ban' });
      return m;
    case 'diagonal':
      for (let i = 0; i < 5; i++) { put(i, i, { kind: 'zone' }); put(i, 4 - i, { kind: 'zone' }); }
      m['0,0'] = { t: '3', kind: 'src' };
      m['3,3'] = { t: '3', kind: 'ban' };
      return m;
    case 'hyper':
      for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) put(r, c, { kind: 'zone' });
      put(1, 1, { t: '3', kind: 'src' });
      put(3, 3, { t: '3', kind: 'ban' });
      return m;
    default: return null;
  }
}
const KNIGHT_EX = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;

// Текстовый пример для не-геометрических правил (и подпись под диаграммой для геометрических).
function exampleCaption(variant: Variant | 'killer', ru: boolean): string {
  switch (variant) {
    case 'antiknight': return ru ? 'Синяя 3 уже стоит. В красные клетки (буква «Г», как ходит конь) вторую 3 ставить нельзя.' : 'The blue 3 is placed. Red cells (an “L”, like a knight moves) cannot hold another 3.';
    case 'antiking': return ru ? 'Синяя 3 стоит. В красные клетки по диагонали вплотную вторую 3 ставить нельзя.' : 'The blue 3 is placed. Diagonally touching red cells cannot hold another 3.';
    case 'nonconsec': return ru ? 'Рядом с 3 по стороне не может быть 2 или 4 (соседние цифры). Через клетку — можно.' : 'Cells next to a 3 cannot hold 2 or 4 (consecutive digits).';
    case 'diagonal': return ru ? 'Жёлтые клетки — две диагонали. Синяя 3 стоит на диагонали — вторая 3 на той же диагонали (красная) запрещена.' : 'Yellow cells are the two diagonals. A second 3 on the same diagonal (red) is not allowed.';
    case 'hyper': return ru ? 'Жёлтый квадрат — доп. зона 3×3 (на настоящем поле их четыре). Внутри зоны цифры тоже не повторяются.' : 'The yellow square is an extra 3×3 zone (the real board has four). Digits cannot repeat inside it.';
    case 'evenodd': return ru ? 'Пример: в клетке с □ может стоять 2, 4, 6 или 8. В клетке с ○ — 1, 3, 5, 7 или 9.' : 'Example: a □ cell holds 2, 4, 6 or 8. A ○ cell holds 1, 3, 5, 7 or 9.';
    case 'kropki': return ru ? 'Пример: 2 ⚫ 4 — чёрная точка, одно вдвое больше. 4 ⚪ 5 — белая точка, разница 1. Нет точки — ни то, ни другое.' : 'Example: 2 ⚫ 4 — black dot, one is double. 4 ⚪ 5 — white dot, differ by 1. No dot — neither.';
    case 'sandwich': return ru ? 'Пример: в ряду 1·3·5·9·… число у края = 8, потому что между 1 и 9 стоят 3+5.' : 'Example: in a row 1·3·5·9·… the edge clue is 8, because 3+5 sit between the 1 and the 9.';
    case 'thermo': return ru ? 'Пример: по термометру от колбы 2 → 4 → 7 — каждая следующая цифра строго больше.' : 'Example: along a thermometer 2 → 4 → 7 — each digit is strictly larger than the previous.';
    case 'arrow': return ru ? 'Пример: в кружке 8, вдоль стрелки 3 и 5 — их сумма равна числу в кружке.' : 'Example: the circle shows 8, the arrow holds 3 and 5 — they sum to the circle.';
    case 'jigsaw': return ru ? 'Вместо квадратных блоков — фигурные области. В каждой области цифры 1–9 без повторов.' : 'Instead of square boxes — irregular regions. Each region holds 1–9 with no repeats.';
    case 'killer': return ru ? 'Пример: рамка из 2 клеток с меткой «7» — цифры в ней дают в сумме 7 и не повторяются (например 3 и 4).' : 'Example: a 2-cell cage marked “7” — its digits sum to 7 and don’t repeat (e.g. 3 and 4).';
    default: return '';
  }
}

function RulesHelpModal({ visible, variant, killer, N, colors, ru, onClose }: {
  visible: boolean; variant: Variant; killer: boolean; N: number; colors: any; ru: boolean; onClose: () => void;
}) {
  if (!visible) return null;
  const grid = exampleGrid(variant);
  const key: Variant | 'killer' = killer ? 'killer' : variant;
  const CELL = 34;
  return (
    <View style={rhStyles.backdrop}>
      <View style={[rhStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[rhStyles.title, { color: colors.text }]}>
          {killer ? 'Killer' : variant !== 'none' ? variantLabel(variant, ru) : ru ? 'Правила' : 'Rules'}
        </Text>
        <Text style={[rhStyles.base, { color: colors.textSecondary }]}>
          {ru ? `Базово: каждая цифра 1–${N} ровно один раз в строке, столбце и блоке.` : `Base: each digit 1–${N} exactly once per row, column and box.`}
        </Text>
        {(variant !== 'none' || killer) && (
          <Text style={[rhStyles.rule, { color: colors.text }]}>
            {killer
              ? (ru ? 'Killer: поле разбито на рамки-группы. Цифры группы дают указанную сумму и не повторяются внутри рамки.' : 'Killer: the board is split into cages. Digits in a cage sum to its clue and don’t repeat inside it.')
              : variantRule(variant, ru)}
          </Text>
        )}
        {grid && (
          <View style={rhStyles.gridWrap}>
            {Array.from({ length: 5 }, (_, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {Array.from({ length: 5 }, (_, c) => {
                  const mark = grid[`${r},${c}`];
                  const bg = mark?.kind === 'src' ? '#7f7fd5' : mark?.kind === 'ban' ? '#fecaca' : mark?.kind === 'zone' ? '#fde68a' : colors.background;
                  const fg = mark?.kind === 'src' ? '#fff' : mark?.kind === 'ban' ? '#b91c1c' : colors.text;
                  return (
                    <View key={c} style={{ width: CELL, height: CELL, borderWidth: 0.5, borderColor: colors.border, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                      {mark?.t ? <Text style={{ color: fg, fontWeight: '800', fontSize: 16, textDecorationLine: mark.kind === 'ban' ? 'line-through' : 'none' }}>{mark.t}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
        <Text style={[rhStyles.caption, { color: colors.textSecondary }]}>{exampleCaption(key, ru)}</Text>
        <TouchableOpacity style={rhStyles.okBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={rhStyles.okText}>{ru ? 'ПОНЯТНО' : 'GOT IT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const rhStyles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 },
  card: { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center', gap: 10 },
  title: { fontSize: 20, fontWeight: '900' },
  base: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  rule: { fontSize: 15, fontWeight: '700', textAlign: 'center', lineHeight: 21 },
  gridWrap: { marginVertical: 6, borderWidth: 1, borderColor: 'rgba(127,127,213,0.5)' },
  caption: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  okBtn: { marginTop: 6, alignSelf: 'stretch', backgroundColor: '#7f7fd5', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  okText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
});

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
  const [bossWon, setBossWon] = useState<boolean | null>(null);   // итог босса-вехи (null = босса не было)
  const bossTypeRef = useRef<BossType>('lightning');
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
  const [sandwich, setSandwich] = useState<{ rows: number[]; cols: number[] } | null>(null);   // sandwich: суммы у краёв рядов/столбцов
  const [thermo, setThermo] = useState<ThermoPN | null>(null);   // thermo: prev/next-карта термометров
  const [arrow, setArrow] = useState<ArrowMap | null>(null);   // arrow: кружок (сумма) + стрелка
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
  const [rulesOpen, setRulesOpen] = useState(false);   // v1.111.0: справка правил уровня (тап по бейджу / авто при первом входе)
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
    // v1.111.0: первый вход на новое правило → авто-показ справки (баг-репорт Вали:
    // играла анти-коня, не зная про правило коня). Дальше — тап по бейджу у таймера.
    const ruleKey = mode === 'killer' ? 'killer' : vr;
    if (ruleKey !== 'none') {
      AsyncStorage.getItem(`psygames_sudoku_rulehint_${ruleKey}`).then((seen) => {
        if (!seen) { setRulesOpen(true); AsyncStorage.setItem(`psygames_sudoku_rulehint_${ruleKey}`, '1').catch(() => {}); }
      }).catch(() => {});
    }
    setHintMax(hMax);
    const { puzzle: p, solution: s, regions: rg, parity: pa, kropki: kr, sandwich: sw, thermo: th, arrow: ar } = generatePuzzle(blanks, d.N, d.BR, d.BC, vr);
    setRegions(rg ?? null);
    setParityMarks(pa ?? null);
    setKropki(kr ?? null);
    setSandwich(sw ?? null);
    setThermo(th ?? null);
    setArrow(ar ?? null);
    if (mode === 'killer') { const cg = generateCages(s, d.N); setCages(cg.cageOf); setCageSums(cg.sum); setCageAnchors(cg.anchor); } else setCages(null);
    setPuzzle(p); setSolution(s);
    setGrid(p.map((r) => [...r]));
    setGiven(p.map((r) => r.map((v) => v !== 0)));
    setSelected(null);
    setErrors(0);
    setOver(false);
    setHintUses(0);
    setBacktrackCount(0);
    setBossWon(null);
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
      // Веха-босс: каждые BOSS_EVERY уровней (режим levels) → битва с боссом ВМЕСТО результата.
      if (mode === 'levels' && level % BOSS_EVERY === 0) {
        bossTypeRef.current = nextSudokuBoss();
        setBossWon(null);
        setPhase('boss');
      } else {
        setPhase('result');
      }
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

      {/* Вход в отдельный режим «Самурай» (5 перекрытых сеток 9×9) — открывает /games/sudoku-samurai */}
      <TouchableOpacity
        style={[styles.optionCard, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => router.push('/games/sudoku-samurai' as any)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>🎴 {language === 'ru' ? 'Самурай' : 'Samurai'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
            {language === 'ru' ? 'Пять сеток 9×9 с общими угловыми блоками.' : 'Five overlapping 9×9 grids sharing corner blocks.'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
      </TouchableOpacity>

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
        {(variant !== 'none' || mode === 'killer') && (
          <TouchableOpacity onPress={() => setRulesOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
            <Text style={[styles.statText, { color: GRADIENT[0] }]}>
              {mode === 'killer' ? 'Killer' : variantLabel(variant, language === 'ru').split(' ')[0]} ⓘ
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
    const gridEl = (
      <View style={{ alignSelf: 'center' }}>
        {variant === 'sandwich' && sandwich && (
          <View style={{ flexDirection: 'row', marginLeft: Math.round(cellSize * 0.6), marginBottom: 2 }}>
            {sandwich.cols.map((s, c) => (
              <Text key={`sc${c}`} style={{ width: cellSize, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>{s}</Text>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {variant === 'sandwich' && sandwich && (
            <View style={{ width: Math.round(cellSize * 0.6) }}>
              {sandwich.rows.map((s, r) => (
                <Text key={`sr${r}`} style={{ height: cellSize, lineHeight: cellSize, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>{s}</Text>
              ))}
            </View>
          )}
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
          // ДИАГОНАЛЬ: не заливаем фон и не рисуем по клеткам (границы клеток резали линию на
          // сегменты) — единая SVG-линия через ВСЮ доску рисуется ниже, поверх сетки клеток
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
              {variant === 'thermo' && thermo && thermo[r][c] && (() => {
                const pn = thermo[r][c]!;
                const thick = Math.max(3, Math.round(cellSize * 0.16));
                const col = blendHex(colors.surface, GRADIENT[0], 0.5);
                const seg = (cell: [number, number]) => {
                  const dr = cell[0] - r, dc = cell[1] - c;
                  if (dc === 1) return { left: cellSize / 2, top: cellSize / 2 - thick / 2, width: cellSize / 2, height: thick };
                  if (dc === -1) return { left: 0, top: cellSize / 2 - thick / 2, width: cellSize / 2, height: thick };
                  if (dr === 1) return { top: cellSize / 2, left: cellSize / 2 - thick / 2, width: thick, height: cellSize / 2 };
                  return { top: 0, left: cellSize / 2 - thick / 2, width: thick, height: cellSize / 2 };
                };
                return (
                  <>
                    {pn.prev && <View style={{ position: 'absolute', backgroundColor: col, pointerEvents: 'none', ...seg(pn.prev) }} />}
                    {pn.next && <View style={{ position: 'absolute', backgroundColor: col, pointerEvents: 'none', ...seg(pn.next) }} />}
                    {!pn.prev && <View style={{ position: 'absolute', backgroundColor: col, pointerEvents: 'none', width: cellSize * 0.42, height: cellSize * 0.42, borderRadius: cellSize * 0.21, left: cellSize / 2 - cellSize * 0.21, top: cellSize / 2 - cellSize * 0.21 }} />}
                  </>
                );
              })()}
              {variant === 'arrow' && arrow && arrow[r][c] && (() => {
                const m = arrow[r][c]!;
                const thick = Math.max(2, Math.round(cellSize * 0.07));
                const col = blendHex(colors.surface, GRADIENT[1], 0.55);
                const seg = (cell: [number, number]) => {
                  const dr = cell[0] - r, dc = cell[1] - c;
                  if (dc === 1) return { left: cellSize / 2, top: cellSize / 2 - thick / 2, width: cellSize / 2, height: thick };
                  if (dc === -1) return { left: 0, top: cellSize / 2 - thick / 2, width: cellSize / 2, height: thick };
                  if (dr === 1) return { top: cellSize / 2, left: cellSize / 2 - thick / 2, width: thick, height: cellSize / 2 };
                  return { top: 0, left: cellSize / 2 - thick / 2, width: thick, height: cellSize / 2 };
                };
                const hs = Math.max(3, Math.round(cellSize * 0.13));
                const head = () => {
                  if (m.isCircle || m.next || !m.prev) return null;
                  const dr = r - m.prev[0], dc = c - m.prev[1], off = cellSize * 0.24;
                  let left = cellSize / 2 - hs, top = cellSize / 2 - hs * 0.75, rot = '0deg';
                  if (dc === 1) { left += off; rot = '90deg'; }
                  else if (dc === -1) { left -= off; rot = '270deg'; }
                  else if (dr === 1) { top += off; rot = '180deg'; }
                  else { top -= off; }
                  return { left, top, rot };
                };
                const hd = head();
                return (
                  <>
                    {m.prev && <View style={{ position: 'absolute', backgroundColor: col, pointerEvents: 'none', ...seg(m.prev) }} />}
                    {m.next && <View style={{ position: 'absolute', backgroundColor: col, pointerEvents: 'none', ...seg(m.next) }} />}
                    {m.isCircle && <View style={{ position: 'absolute', width: cellSize * 0.64, height: cellSize * 0.64, borderRadius: cellSize * 0.32, left: cellSize / 2 - cellSize * 0.32, top: cellSize / 2 - cellSize * 0.32, borderWidth: thick, borderColor: col, pointerEvents: 'none' }} />}
                    {hd && <View style={{ position: 'absolute', width: 0, height: 0, borderLeftWidth: hs, borderRightWidth: hs, borderBottomWidth: hs * 1.5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: col, left: hd.left, top: hd.top, transform: [{ rotate: hd.rot }], pointerEvents: 'none' }} />}
                  </>
                );
              })()}
              {variant === 'evenodd' && parityMarks && parityMarks[r][c] !== 0 && (
                <View style={{ position: 'absolute', width: cellSize * 0.6, height: cellSize * 0.6, borderRadius: parityMarks[r][c] === 2 ? cellSize * 0.3 : Math.max(3, Math.round(cellSize * 0.1)), backgroundColor: blendHex(colors.surface, GRADIENT[1], 0.20), borderWidth: 1, borderColor: blendHex(colors.surface, GRADIENT[1], 0.45) }} />
              )}
              {variant === 'kropki' && kropki && c < N - 1 && kropki.h[r][c] !== 0 && (
                <View style={{ position: 'absolute', width: cellSize * 0.2, height: cellSize * 0.2, borderRadius: cellSize * 0.1, right: -cellSize * 0.1, top: cellSize / 2 - cellSize * 0.1, backgroundColor: kropki.h[r][c] === 2 ? '#222222' : '#ffffff', borderWidth: 1.5, borderColor: '#777777', zIndex: 5, pointerEvents: 'none' }} />
              )}
              {variant === 'kropki' && kropki && r < N - 1 && kropki.v[r][c] !== 0 && (
                <View style={{ position: 'absolute', width: cellSize * 0.2, height: cellSize * 0.2, borderRadius: cellSize * 0.1, bottom: -cellSize * 0.1, left: cellSize / 2 - cellSize * 0.1, backgroundColor: kropki.v[r][c] === 2 ? '#222222' : '#ffffff', borderWidth: 1.5, borderColor: '#777777', zIndex: 5, pointerEvents: 'none' }} />
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
        {/* Одна цельная линия через всю доску (не по клеткам — границы клеток резали её на
            сегменты). Серый пунктир, ненавязчивый — согласовано с Денисом 2026-07-01. */}
        {variant === 'diagonal' && (
          <Svg width={cellSize * N} height={cellSize * N} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
            <Line x1={0} y1={0} x2={cellSize * N} y2={cellSize * N}
              stroke={colors.textSecondary} strokeWidth={1.5} strokeDasharray="7,6" opacity={0.6} />
            <Line x1={cellSize * N} y1={0} x2={0} y2={cellSize * N}
              stroke={colors.textSecondary} strokeWidth={1.5} strokeDasharray="7,6" opacity={0.6} />
          </Svg>
        )}
          </View>
        </View>
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
      {/* v1.111.0: справка правил уровня (авто при первом входе на вариант / тап по бейджу ⓘ) */}
      <RulesHelpModal visible={rulesOpen} variant={variant} killer={mode === 'killer'} N={N}
        colors={colors} ru={language === 'ru'} onClose={() => setRulesOpen(false)} />
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
      {phase === 'boss' && (
        <BossRound
          config={{ type: bossTypeRef.current, gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('result'); }}
        />
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
            {bossWon === true && <Text style={[styles.overSub, { color: '#f59e0b', fontWeight: '800' }]}>🏆 {language === 'ru' ? 'Босс повержен! +⭐' : 'Boss defeated! +⭐'}</Text>}
            {bossWon === false && <Text style={[styles.overSub, { color: colors.textSecondary }]}>{language === 'ru' ? 'Босс устоял' : 'Boss survived'}</Text>}
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
  gridArea: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 4, position: 'relative' },
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
