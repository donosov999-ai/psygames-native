import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Image, ScrollView, DeviceEventEmitter } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, translateFor } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GlassButton from '@/src/components/GlassButton';
import BossRound, { BossType } from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameAbout from '@/src/components/GameAbout';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useProfile } from '@/src/contexts/ProfileContext';
import { digitsForStyle, defaultStyleForProfile, DIGIT_STYLES } from '@/src/constants/digitThemes';
import type { DigitStyle } from '@/src/constants/digitThemes';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { FEEDBACK_OPEN_EVENT } from '@/src/services/appFeedback';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { useGameKeyboard, digitKeys } from '@/src/hooks/useGameKeyboard';
import { saveResume, loadResume, clearResume } from '@/src/services/resume';
import { failurePolicy, formatErrorCount, isOver as isFailOver } from '@/src/services/failure';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Line, Rect } from 'react-native-svg';

const GRADIENT = ['#7f7fd5', '#86a8e7'];
const CELL_COLORS = ['#8B5CF6', '#0EA5E9', '#22C55E', '#F59E0B', '#EC4899'] as const;
// Okabe–Ito: отдельная палитра для режима дальтонизма, а не перестановка тех же цветов.
const CELL_COLORS_CB = ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7'] as const;
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
  Cell, Variant, ThermoPN, ArrowMap, SudokuDifficultyTier,
  dimsForSize, blanksFor, killerBlanks, generateCages, levelConfig,
  sudokuDifficultyTier, variantLabel, variantRule, shuffle, generatePuzzle, HYPER_BOXES,
} from '@/src/services/sudoku-core';
import { generateLogical } from '@/src/services/sudoku-grade';
import { clearGameContextHelp, publishGameContextHelp } from '@/src/services/gameContextHelp';
import {
  emptySudokuCellColors,
  normalizeSudokuCellColors,
  SudokuCellColors,
  toggleSudokuCellColor,
} from '@/src/services/sudoku-coloring';

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';

// KILLER: подкрас cage-групп (тинт = subtle blend с фоном темы → виден и на свету, и в тьме).

// Оттенки клавиш ввода: своя устойчивая краска на каждую цифру. Смешиваются с
// поверхностью темы (blendHex), поэтому держатся стилистики приложения и читаются
// и в светлой, и в тёмной. Порядок — по кругу цветового круга, чтобы соседние
// цифры не сливались.
const DIGIT_TINT = ['#e8564f', '#ef8f27', '#e7c229', '#4fb455', '#2fa3a8', '#3f7fd5', '#7f5ad5', '#c94fa8', '#8a6f4f'] as const;

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
// v1.137: тексты в словаре (sudokuEx_*), берём через translateFor — работают все 12 языков.
function exampleCaption(variant: Variant | 'killer', lang: string): string {
  if (variant === 'none') return '';
  return translateFor(lang, 'sudokuEx_' + variant);
}

function RulesHelpModal({ visible, variant, killer, N, colors, language, onClose }: {
  visible: boolean; variant: Variant; killer: boolean; N: number; colors: any; language: string; onClose: () => void;
}) {
  if (!visible) return null;
  const grid = exampleGrid(variant);
  const key: Variant | 'killer' = killer ? 'killer' : variant;
  const CELL = 34;
  return (
    <View style={rhStyles.backdrop}>
      <View style={[rhStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[rhStyles.title, { color: colors.text }]}>
          {killer ? 'Killer' : variant !== 'none' ? variantLabel(variant, language) : translateFor(language, 'btn_rules')}
        </Text>
        <Text style={[rhStyles.base, { color: colors.textSecondary }]}>
          {translateFor(language, 'sudokuBaseRule').replace('{n}', String(N))}
        </Text>
        {(variant !== 'none' || killer) && (
          <Text style={[rhStyles.rule, { color: colors.text }]}>
            {killer
              ? translateFor(language, 'sudokuKillerRule')
              : variantRule(variant, language)}
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
        <Text style={[rhStyles.caption, { color: colors.textSecondary }]}>{exampleCaption(key, language)}</Text>
        {/* Пока правила открыты, плавающая кнопка репорта накрыта этим окном и
            недоступна — а сказать «в правилах ошибка» хочется именно отсюда.
            Расшифровка голосового репорта 02.08 (прочитана только 12.08, месяц
            пролежала): «кнопка отправки ошибки недоступна, если открываешь окно
            с правилами». В общей справке такой выход уже сделан по репорту Rulon,
            а у судоку своё окно правил — и там его не было. */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => { onClose(); DeviceEventEmitter.emit(FEEDBACK_OPEN_EVENT); }}
          style={rhStyles.reportLink} activeOpacity={0.7}>
          <Text style={[rhStyles.reportText, { color: colors.textSecondary }]}>
            {translateFor(language, 'feedbackFabLabel')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button" style={rhStyles.okBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={rhStyles.okText}>{translateFor(language, 'ctaGotIt')}</Text>
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
  reportLink: { marginTop: 8, paddingVertical: 6, alignSelf: 'center' },
  reportText: { fontSize: 13, textDecorationLine: 'underline' },
  okBtn: { minHeight: 48, justifyContent: 'center', marginTop: 6, alignSelf: 'stretch', backgroundColor: '#7f7fd5', borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  okText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
});

const GAME_ID = 'sudoku';
const SUDOKU_LAST_LEVEL = 52;
const SUDOKU_TIER_KEYS: Record<SudokuDifficultyTier, string> = {
  beginner: 'sudokuTierBeginner',
  easy: 'sudokuTierEasy',
  medium: 'sudokuTierMedium',
  hard: 'sudokuTierHard',
  expert: 'sudokuTierExpert',
  extreme: 'sudokuTierExtreme',
};

/**
 * Версия формата незаконченной партии. Поднимать при ЛЮБОМ изменении полей SudokuResume:
 * старая запись тогда не подойдёт под новый код и будет молча выброшена, а не уронит экран.
 */
const RESUME_V = 2;

/** Ход: что стояло в клетке до него и что стало. Назад отыгрывает экран, лента только помнит. */
interface SudokuMove { r: number; c: number; from: Cell; to: Cell }

/**
 * Снимок незаконченной партии. Кладём ВСЁ, что нужно, чтобы доска ожила ровно такой,
 * какой её оставили: саму доску, правила варианта (у судоку их 12, и без карты регионов
 * или термометров доска станет нерешаемой), счётчики и ленту ходов.
 */
interface SudokuResume {
  mode: 'levels' | 'free' | 'killer';
  level: number;
  difficulty: 'easy' | 'medium' | 'hard';
  size: 6 | 9;
  variant: Variant;
  dims: { N: number; BR: number; BC: number };
  puzzle: Cell[][];
  solution: Cell[][];
  grid: Cell[][];
  given: boolean[][];
  cellColors: SudokuCellColors;
  regions: number[][] | null;
  cages: number[][] | null;
  cageSums: number[];
  cageAnchors: number[];
  parityMarks: number[][] | null;
  kropki: { h: number[][]; v: number[][] } | null;
  sandwich: { rows: number[]; cols: number[] } | null;
  thermo: ThermoPN | null;
  arrow: ArrowMap | null;
  errors: number;
  hintUses: number;
  hintMax: number;
  backtrackCount: number;
  /** Накопленные секунды, а не момент старта: между сессиями настенные часы уходят вперёд. */
  elapsed: number;
  history: { past: SudokuMove[]; future: SudokuMove[] };
}

export default function SudokuGame() {
  const { colors, isDark, colorblind } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const insets = useSafeAreaInsets();   // v1.150: sticky-футер над системной навигацией
  const [digitStyle, setDigitStyle] = useState<DigitStyle>(() => defaultStyleForProfile(profile?.id));
  const DIGIT_IMG = digitsForStyle(digitStyle);
  // Тип цифр: 'plain' = обычный чёткий текст (дефолт — ровный размер, по центру, без тени), 'drawn' = рисованные наборы.
  const [digitMode, setDigitMode] = useState<'plain' | 'drawn'>('plain');
  useEffect(() => { AsyncStorage.getItem('psygames_sudoku_digitmode').then((v) => { if (v === 'plain' || v === 'drawn') setDigitMode(v); }).catch(() => {}); }, []);
  const changeDigitMode = (m: 'plain' | 'drawn') => { setDigitMode(m); AsyncStorage.setItem('psygames_sudoku_digitmode', m).catch(() => {}); };
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, autostart, str } = useGamePreset();
  useEffect(() => { if (autostart) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  // Открываемся сразу на настройках: описание переехало в сворачиваемый блок наверху
  // (см. GameAbout). Раньше до игры было два экрана подряд, и второй раз человек
  // пролистывал то, что прочитал в первый.
  const [phase, setPhase] = useState<GamePhase>('config');
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
  const [cellColors, setCellColors] = useState<SudokuCellColors>([]);
  const [paintColor, setPaintColor] = useState<number | null>(null);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  // Модель провала — свойство РЕЖИМА, а не константа экрана (см. services/failure).
  // Сейчас все режимы судоку короткие → 'standard', три жизни, как было. Длинные режимы
  // (самурай, фрактал) возьмут 'longform': ошибки считаются, но час работы не обрывают.
  const failure = failurePolicy('standard');
  // Лента ходов для отмены. Хранит ЧТО было в клетке до хода — назад отыгрывает экран.
  const hist = useMoveHistory<SudokuMove>();
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
  const paintPalette = colorblind ? CELL_COLORS_CB : CELL_COLORS;

  // Большая глобальная кнопка «Правила» раньше показывала только общую статью,
  // поэтому на доске Кропки/диагонали человек не видел правило текущей партии.
  // Публикуем его в общий оверлей; локальный бейдж у таймера остаётся как был.
  useEffect(() => {
    if (phase !== 'playing') {
      clearGameContextHelp(GAME_ID);
      return;
    }
    const base = translateFor(language, 'sudokuBaseRule').replace('{n}', String(N));
    const specific = mode === 'killer'
      ? translateFor(language, 'sudokuKillerRule')
      : variantRule(variant, language);
    publishGameContextHelp({
      gameId: GAME_ID,
      title: mode === 'killer'
        ? 'Killer'
        : variant !== 'none'
          ? variantLabel(variant, language)
          : translateFor(language, 'btn_rules'),
      body: specific ? `${base}\n\n${specific}` : base,
    });
    return () => clearGameContextHelp(GAME_ID);
  }, [phase, mode, variant, N, language]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // SUDOKU-LVL: подтянуть сохранённый уровень профиля
  useEffect(() => {
    const pid = profile?.id;
    if (!pid) return;
    AsyncStorage.getItem(`psygames_sudoku_level_${pid}`).then((v) => { const n = parseInt(v || '1', 10); if (n >= 1) setLevel(n); }).catch(() => {});
  }, [profile?.id]);

  const startGame = (lvlOverride?: number) => {
    // Новая партия заменяет незаконченную: старую доску продолжать уже нечем.
    const pidStart = profile?.id;
    if (pidStart) clearResume(GAME_ID, pidStart).catch(() => {});
    hist.reset();
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
    // Режим уровней генерируется ОТ ЛОГИКИ: клетка выкалывается, только если пазл
    // остаётся решаемым техниками не выше потолка уровня. Отсюда два следствия сразу:
    //   • сложность растёт по уровням, а не по числу дырок (замер старого пути: с 5-го
    //     по 37-й почти всё бралось голыми одиночками — «начиная с 34 уровня всё очень
    //     лёгкое», «с 30 по 34 сложность не меняется»);
    //   • решение ЕДИНСТВЕННО по построению — каждый шаг логики вынужден, второму
    //     решению взяться неоткуда («игра имеет несколько вариантов победы» — репорты Вали).
    // Если конкретная попытка логического пути не уложилась в бюджет, generateLogical
    // сохраняет безопасный fallback с проверкой единственности.
    const { puzzle: p, solution: s, regions: rg, parity: pa, kropki: kr, sandwich: sw, thermo: th, arrow: ar } =
      mode === 'levels'
        ? generateLogical(lvlOverride ?? level, blanks, d.N, d.BR, d.BC, vr, { budgetMs: 2200 }).gen
        : generatePuzzle(blanks, d.N, d.BR, d.BC, vr);
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
    setCellColors(emptySudokuCellColors(d.N));
    setPaintColor(null);
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

  /** Снимок партии для слоя незаконченной игры. */
  const snapshot = (): SudokuResume => ({
    mode, level, difficulty, size, variant, dims,
    puzzle, solution, grid, given, cellColors,
    regions, cages, cageSums, cageAnchors, parityMarks, kropki, sandwich, thermo, arrow,
    errors, hintUses, hintMax, backtrackCount,
    elapsed: elapsedTime,
    history: hist.serialize(),
  });

  /** Поднять партию из снимка — доска оживает ровно такой, какой её оставили. */
  const applyResume = (s: SudokuResume) => {
    setMode(s.mode); setLevel(s.level); setDifficulty(s.difficulty); setSize(s.size);
    setVariant(s.variant); setDims(s.dims);
    setPuzzle(s.puzzle); setSolution(s.solution); setGrid(s.grid); setGiven(s.given);
    setCellColors(normalizeSudokuCellColors(s.cellColors, s.dims.N));
    setPaintColor(null);
    setRegions(s.regions); setCages(s.cages); setCageSums(s.cageSums); setCageAnchors(s.cageAnchors);
    setParityMarks(s.parityMarks); setKropki(s.kropki); setSandwich(s.sandwich);
    setThermo(s.thermo); setArrow(s.arrow);
    setErrors(s.errors); setHintUses(s.hintUses); setHintMax(s.hintMax); setBacktrackCount(s.backtrackCount);
    setSelected(null); setOver(false); setBossWon(null);
    hist.restore(s.history);
    // Таймер продолжаем с накопленного: настенные часы между сессиями ушли вперёд,
    // и от прежнего startTime партия «шла» бы всё то время, что телефон лежал в кармане.
    const start = Date.now() - Math.max(0, s.elapsed) * 1000;
    setStartTime(start);
    setElapsedTime(s.elapsed);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
    setPhase('playing');
  };

  // Поднять незаконченную партию при входе на экран. Не трогаем путь зарядки (autostart):
  // там человек явно запустил свежий раунд, и startGame сам выбросит старую партию.
  const bootRef = useRef(false);
  useEffect(() => {
    if (autostart || bootRef.current) return;
    const pid = profile?.id;
    if (!pid) return;
    bootRef.current = true;
    let cancelled = false;
    loadResume<SudokuResume>(GAME_ID, pid, RESUME_V)
      .then((saved) => {
        if (cancelled || !saved || !Array.isArray(saved.grid) || !saved.grid.length) return;
        applyResume(saved);
      })
      .catch(() => { /* нет партии — обычный вход через интро */ });
    return () => { cancelled = true; };
  }, [profile?.id, autostart]);   // eslint-disable-line react-hooks/exhaustive-deps — разовый подъём партии

  // Автосохранение по ходу партии. Записываем с задержкой: подряд идущие касания
  // не должны бить по хранилищу каждым нажатием.
  useEffect(() => {
    if (phase !== 'playing' || over || !grid.length) return;
    const pid = profile?.id;
    if (!pid) return;
    const snap = snapshot();
    const tm = setTimeout(() => { saveResume(GAME_ID, pid, RESUME_V, snap).catch(() => {}); }, 400);
    return () => clearTimeout(tm);
  }, [grid, cellColors, errors, hintUses, backtrackCount, phase, over]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Уход с экрана. Отложенная запись выше на этом моменте отменяется своим clearTimeout,
  // поэтому сохраняем ещё раз здесь — и с ЖИВЫМ временем, а не с тем, что было на прошлом ходу.
  const liveRef = useRef<{ ok: boolean; pid?: string; snap: () => SudokuResume }>({ ok: false, snap: () => ({} as SudokuResume) });
  liveRef.current = { ok: phase === 'playing' && !over && grid.length > 0, pid: profile?.id, snap: snapshot };
  useEffect(() => () => {
    const l = liveRef.current;
    if (l.ok && l.pid) saveResume(GAME_ID, l.pid, RESUME_V, l.snap()).catch(() => {});
  }, []);

  /**
   * Отмена хода. Возвращает КЛЕТКУ, но НЕ возвращает жизнь: иначе три жизни превращаются
   * в бесконечные и модель сложности рассыпается. Промах пальцем чинится, счёт ошибок —
   * нет. В длинных режимах жизней не будет вовсе (см. services/failure).
   */
  const handleUndo = () => {
    const m = hist.undo();
    if (!m) return;
    const ng = grid.map((row) => [...row]);
    ng[m.r][m.c] = m.from;
    setGrid(ng);
    setSelected({ r: m.r, c: m.c });
  };

  const handleCellPress = (r: number, c: number) => {
    if (paintColor !== null) {
      setCellColors((current) => toggleSudokuCellColor(current, N, r, c, paintColor));
      return;
    }
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
    hist.push({ r, c, from: previousValue, to: n });
    if (n !== 0) { (solution[r][c] === n) ? hapticSuccess() : hapticError(); }   // верно: звук+вибро; неверно: звук+вибро
    if (n !== 0 && solution[r][c] !== n) {
      const ne = errors + 1;
      setErrors(ne);
      if (isFailOver(failure, ne)) {                 // жизни кончились → game over
        if (timerRef.current) clearInterval(timerRef.current);
        setOver(true);
        const pid = profile?.id;
        if (pid) clearResume(GAME_ID, pid).catch(() => {});   // партия проиграна — продолжать нечего
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
      const pidDone = profile?.id;
      if (mode === 'levels' && pidDone) {
        AsyncStorage.setItem(`psygames_sudoku_level_${pidDone}`, String(level + 1)).catch(() => {});
      }
      if (pidDone) clearResume(GAME_ID, pidDone).catch(() => {});   // доиграна — продолжать нечего
      const baseScore = mode === 'levels' ? 1500 + level * 150 : 2000;
      try {
        await saveSession({
          passed: true,   // сессия пишется только когда уровень собран
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
      // Обычный уровень (не веха) в режиме levels → cleared-баннер общего авто-потока
      // («Уровень N ✓» → следующий стартует сам). Free/killer → полноэкранный GameResult.
      if (mode === 'levels' && level % BOSS_EVERY === 0) {
        bossTypeRef.current = nextSudokuBoss();
        setBossWon(null);
        setPhase('boss');
      } else if (mode === 'levels') {
        setPhase('cleared');
      } else {
        setPhase('result');
      }
    }
  };

  /**
   * КЛАВИАТУРА. На компьютере к цифрам тянутся рефлекторно, и раньше нажатие не делало
   * ничего — человек читал это как «приложение подтормаживает», а не «клавиатуру не
   * поддержали». Раскладка привычная: цифры ставят, Backspace стирает, стрелки ходят.
   *
   * Стрелки перескакивают через ДАННЫЕ клетки: в них всё равно нельзя писать
   * (handleCellPress их не выбирает), и остановка на такой клетке выглядела бы как
   * зависшее управление — курсор стоит, цифры не вводятся, причина не видна.
   */
  const moveSelection = (dr: number, dc: number) => {
    if (!grid.length) return;
    let { r, c } = selected ?? { r: dr < 0 ? N : -1, c: dc < 0 ? N : -1 };
    for (let step = 0; step < N * N; step++) {
      r += dr; c += dc;
      if (r < 0 || r >= N || c < 0 || c >= N) return;   // упёрлись в край — стоим
      if (!given[r][c]) { setSelected({ r, c }); return; }
    }
  };

  useGameKeyboard(
    {
      ...digitKeys((n) => { void handleNumPress(n); }, { maxDigit: N }),
      ArrowUp: () => moveSelection(-1, 0),
      ArrowDown: () => moveSelection(1, 0),
      ArrowLeft: () => moveSelection(0, -1),
      ArrowRight: () => moveSelection(0, 1),
    },
    phase === 'playing' && !over,
  );

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
  // Ширинные бюджеты подогнаны под каркас GameShell (поле имеет paddingHorizontal 16×2):
  // портрет 28→36 (34 = 32 паддинга + 4 рамка сетки), landscape 210→240 (паддинг + gap 22 + цифры сбоку).
  const cellSize = landscape
    ? Math.max(16, Math.floor(Math.min((height - 96) / N, (width - 240) / N, 92)))
    : Math.max(14, Math.floor(Math.min((width - 36) / N, (height - 330) / N, 92)));
  // v1.164 (репорт Вали ур.29 «где нижняя строка????»): floor в Math.max не даёт
  // ячейке ужаться ниже 14px, поэтому на невысоком экране (или при крупном системном
  // шрифте, когда шапка и счётчики съедают больше) доска перерастает поле и нижний ряд
  // просто обрезается — доскроллить некуда, поле у каркаса не скроллится. Считаем, влезла
  // ли доска в бюджет высоты, и если нет — включаем прокрутку поля. Обрезка невозможна
  // в принципе: не влезло по высоте → доступно скроллом.
  const boardOverflows = !landscape && cellSize * N > height - 330;

  const renderConfig = () => (
    // v1.150: раньше конфиг был голым View → на невысоком экране кнопка «играть»
    // уходила под системную навигацию без возможности доскроллить (репорт Вали
    // «где нижняя строка», Samsung). Теперь: опции в ScrollView + кнопка прибита
    // sticky-футером над навигацией — видна ВСЕГДА.
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="apps" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('sudoku')}</Text>
        <Text style={styles.configDesc}>{t('sudokuDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="sudokuIntroDesc" benefits={SUDOKU_BENEFITS} accent={GRADIENT[0]} />
      {/* SUDOKU-LVL: режим — уровни (прогрессия) или свободно (селекторы) */}

      {/* Вход в отдельный режим «Самурай» (5 перекрытых сеток 9×9) — открывает /games/sudoku-samurai */}
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.optionCard, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => router.push('/games/sudoku-samurai' as any)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>🎴 {t('samuraiTitle')}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
            {t('sudokuSamuraiTeaser')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
      </TouchableOpacity>

      {mode === 'levels' && (() => {
        const cfg = levelConfig(level);
        const tierLabel = (value: number) => t(SUDOKU_TIER_KEYS[sudokuDifficultyTier(value)]);
        return (
          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')} {level} · {tierLabel(level)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {cfg.N}×{cfg.N}{` · ${t('blanksLabel')} ${cfg.blanks} · ${t('hintsLabel')} ${cfg.hintMax}`}{cfg.variant !== 'none' ? ` · ${variantLabel(cfg.variant, language)}` : ''}
            </Text>
            {cfg.variant !== 'none' && (
              <Text style={{ color: GRADIENT[0], fontSize: 12, marginTop: 3, fontWeight: '600' }}>
                {variantRule(cfg.variant, language)}
              </Text>
            )}
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {t('sudokuNextUnlocks')}
            </Text>
            <LevelProgressMap
              gameId={GAME_ID}
              currentLevel={level}
              maxLevel={Math.max(SUDOKU_LAST_LEVEL, level)}
              colors={colors}
              language={language}
              levelLabel={tierLabel}
            />
          </View>
        );
      })()}

      {mode === 'killer' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>Killer Sudoku</Text>
          <Text style={{ color: GRADIENT[0], fontSize: 12, marginTop: 2, fontWeight: '600', lineHeight: 17 }}>
            {t('killerCageRule')}
          </Text>
        </View>
      )}
      {mode === 'free' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('boardSize')}</Text>
          <View style={styles.optionButtons}>
            {([6, 9] as const).map((s) => (
              <TouchableOpacity
                accessibilityRole="button" key={s} style={[styles.modeButton, size === s
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
              <TouchableOpacity
                accessibilityRole="button" key={d} style={[styles.modeButton, difficulty === d
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('digitsLabel')}</Text>
        <View style={styles.optionButtons}>
          {([['plain', t('digitsPlain')], ['drawn', t('digitsDrawn')]] as const).map(([m, lbl]) => (
            <TouchableOpacity
              accessibilityRole="button" key={m} onPress={() => changeDigitMode(m as 'plain' | 'drawn')}
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
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('digitStyle')}</Text>
          <View style={styles.optionButtons}>
            {DIGIT_STYLES.map((st, si) => (
              <TouchableOpacity key={st} onPress={() => setDigitStyle(st)}
                accessibilityRole="button" accessibilityLabel={`${t('a11yDigitStyle')} ${si + 1}`}
                accessibilityState={{ selected: digitStyle === st }}
                style={[styles.modeButton, { paddingVertical: 6, paddingHorizontal: 10 }, digitStyle === st
                  ? { backgroundColor: GRADIENT[0], borderWidth: 2, borderColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border }]}>
                <Image source={digitsForStyle(st)[5]} style={{ width: 30, height: 30 }} resizeMode="contain" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
    {/* Sticky-футер: кнопка «играть» всегда на экране, над системной навигацией */}
    <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
      {/* Выбор режима и справка — В ПРИБИТОМ НИЗУ, а не карточкой в прокрутке
          (просьба Дениса 12.08). Раньше режим лежал первой карточкой: чтобы его
          сменить, надо было прокрутить экран вверх, а кнопка «играть» при этом
          оставалась внизу — два разных места для одного решения «во что играю».
          Теперь оба рядом и всегда на экране. */}
      <View style={styles.configBar}>
        {([['levels', t('sudokuModeLevels')], ['free', t('sudokuModeFree')], ['killer', 'Killer']] as const).map(([m, lbl]) => (
          <GlassButton
            key={m}
            grow
            label={lbl}
            active={mode === m}
            onPress={() => setMode(m as 'levels' | 'free' | 'killer')}
          />
        ))}
        <GlassButton
          icon="help-circle-outline"
          accessibilityLabel={t('rulesWord')}
          onPress={() => setRulesOpen(true)}
        />
      </View>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={() => startGame()}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{mode === 'levels' ? t('playLevelN').replace('{n}', String(level)) : t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
    </View>
  );

  const renderPlaying = () => {
    const statsEl = (
      <View style={styles.statsRow}>
        {mode === 'levels' && <Text style={[styles.statText, { color: GRADIENT[0] }]}>{t('label_level_short')}{level}</Text>}
        <Text style={[styles.statText, { color: '#f43f5e' }]}>{t('errors')} {formatErrorCount(failure, errors)}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{t('secShort')}</Text>
        {/* Счётчик переделок переехал сюда из ряда действий: он показатель, а не кнопка,
            и там отбирал ширину у трёх капсул, из-за чего первая уезжала за край экрана. */}
        {/* Остаток подсказок и число переделок — показатели, а не подписи на кнопках:
            в капсулу они не помещались и резали слово «Подсказка» до «Подск…». */}
        <Text style={[styles.statText, { color: colors.textSecondary }]}>💡 {hintMax - hintUses}</Text>
        {backtrackCount > 0 && (
          <Text style={[styles.statText, { color: colors.textSecondary }]}>↻ {backtrackCount}</Text>
        )}
        <TouchableOpacity
          accessibilityRole="button" onPress={() => setRulesOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
          <Text style={[styles.statText, { color: GRADIENT[0] }]}>
            {mode === 'killer' ? 'Killer' : variant !== 'none' ? variantLabel(variant, language).split(' ')[0] : t('rulesWord')} ⓘ
          </Text>
        </TouchableOpacity>
      </View>
    );
    const gridEl = (
      // RTL-пин: зеркалирование ломает жирные границы боксов (физический borderRight на логической
      // колонке), сегменты thermo/arrow (физический left «к соседу справа») и SVG-оверлеи
      // (диагональ/клетки рисуются в физических координатах поверх перевёрнутой сетки)
      <View style={{ alignSelf: 'center', writingDirection: 'ltr' } as any}>
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
          const markColor = cellColors[r]?.[c] ?? -1;
          // Есть ли под цифрой рисунок варианта: кружок, колба, заливка клетки.
          // Если да — цифру рисуем текстом, иначе картинка выцветает на тонировке.
          const hasDecorBehind = !!(
            (variant === 'evenodd' && parityMarks && parityMarks[r][c] !== 0)
            || (variant === 'thermo' && thermo && thermo[r][c])
            || (variant === 'arrow' && arrow && arrow[r][c])
            || (variant === 'kropki' && kropki && (
                 (c < N - 1 && kropki.h[r][c] !== 0) || (c > 0 && kropki.h[r][c - 1] !== 0)
                 || (r < N - 1 && kropki.v[r][c] !== 0) || (r > 0 && kropki.v[r - 1][c] !== 0)))
            || (mode === 'killer' && cages)
          );
          let bg = (mode === 'killer' && cages) ? blendHex(colors.surface, CAGE_ACCENTS[cages[r][c] % CAGE_ACCENTS.length], 0.16) : colors.surface;
          if (markColor >= 0 && markColor < paintPalette.length) {
            bg = blendHex(bg, paintPalette[markColor], isDark ? 0.34 : 0.24);
          }
          if (wrongVal) bg = isSel ? '#ef4444' : '#fecaca';  // ошибка: яркий красный если выделена, светло-красный иначе
          // v1.152: фон выделения затемнён #7f7fd5→#5b4fd1. Была светлая лаванда,
          // на ней БЕЛАЯ цифра (line ~652) не читалась (репорт Вали L30 «введённая
          // цифра светлая, не видно», контраст ~2.9:1). Теперь ~6:1, тема-независимо.
          else if (isSel) bg = '#5b4fd1';
          else if (sameVal) bg = markColor >= 0 ? blendHex(bg, GRADIENT[0], 0.10) : colors.card;
          else if (sameRow) bg = markColor >= 0 ? blendHex(bg, GRADIENT[0], 0.08) : colors.card;
          // v1.113.0: заливку доп. зон убрали — её перебивала подсветка строки/столбца выделения
          // (Валя: «то голубые то нет»). Зоны теперь рамкой поверх сетки (см. SVG ниже, как диагональ).
          // ДИАГОНАЛЬ: не заливаем фон и не рисуем по клеткам (границы клеток резали линию на
          // сегменты) — единая SVG-линия через ВСЮ доску рисуется ниже, поверх сетки клеток
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${t('a11yCell')} ${r + 1}, ${c + 1}${markColor >= 0 ? ` · ${t('sudokuColorMode')} ${markColor + 1}` : ''}`}
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
              {/* ⚠️ Заливку метки мешаем с ФОНОМ ЭТОЙ клетки (bg), а не с colors.surface.
                  Пять раз приходил один и тот же репорт: «ставишь цифру — она белая, почти
                  прозрачная, почему в кружочке не станет чёрной». Причина была не в цифре:
                  метка рисуется ПОВЕРХ фона клетки, и на выделенной клетке (тёмно-фиолетовый
                  #5b4fd1) она клала сверху светлое пятно от colors.surface — белая цифра на
                  нём исчезала. Правка v1.175 сменила начертание цифры, но базу заливки не
                  трогала, поэтому ничего и не изменилось. */}
              {variant === 'evenodd' && parityMarks && parityMarks[r][c] !== 0 && (
                <View style={{ position: 'absolute', width: cellSize * 0.6, height: cellSize * 0.6, borderRadius: parityMarks[r][c] === 2 ? cellSize * 0.3 : Math.max(3, Math.round(cellSize * 0.1)), backgroundColor: blendHex(bg, GRADIENT[1], 0.20), borderWidth: 1, borderColor: blendHex(bg, GRADIENT[1], 0.45) }} />
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
              {/* В «чётное/нечётное» клетка залита меткой-кружком/квадратом, и
                  декоративная цифра-картинка поверх тонировки читается как
                  выцветшая («после тридцатого уровня цифра становится прозрачной,
                  надо чтобы была тоже чёрной» — репорт Вали, v1.169). На таких
                  клетках рисуем цифру обычным текстом цветом текста темы: контраст
                  важнее единообразия начертания. */}
              {/* ⚠️ ЦИФРА ПОВЕРХ ЛЮБОЙ ПОДЛОЖКИ — ТОЛЬКО ТЕКСТОМ.
                  Валя писала об этом ПЯТЬ раз («когда ставишь цифру, она становится белой
                  почти прозрачной, почему она в кружочке не становится чёрной сразу»).
                  В v1.169 починили ОДИН вариант — «чёт/нечёт», перечислив его руками.
                  Перечисление и было ошибкой: кружки и заливки есть ещё в «термометре»
                  (колба), «стрелке» (круг), «клетках» killer и «точках» Кропки, и там
                  цифра-картинка поверх тонировки читается так же выцветшей.
                  Поэтому условие теперь по СУТИ, а не по списку: под цифрой что-то
                  нарисовано → цифра рисуется текстом цветом темы. Контраст важнее
                  единообразия начертания — читаемость цифры и есть игра. */}
              {v !== 0 && (
                (isSel || wrongVal || digitMode === 'plain' || hasDecorBehind) ? (
                  <Text style={{ color: isSel ? '#FFF' : wrongVal ? '#b91c1c' : colors.text, fontWeight: '700', fontSize: Math.round(cellSize * 0.52) }}>{v}</Text>
                ) : (
                  <Image source={DIGIT_IMG[v]} accessibilityLabel={String(v)}
                    style={{ width: cellSize * 0.72, height: cellSize * 0.72 }} resizeMode="contain" />
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
        {/* v1.113.0: доп. зоны (Windoku) — рамка поверх сетки, НЕ заливка клеток (та гасла от
            подсветки строки/столбца выделения — баг-репорт Вали «то голубые то нет»). Рамка
            стабильна независимо от того, что сейчас выделено. */}
        {variant === 'hyper' && (
          <Svg width={cellSize * N} height={cellSize * N} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
            {HYPER_BOXES.map(([hr, hc], i) => (
              <Rect key={i} x={hc * cellSize + 1.5} y={hr * cellSize + 1.5} width={cellSize * 3 - 3} height={cellSize * 3 - 3}
                fill="none" stroke={GRADIENT[0]} strokeWidth={2.5} rx={4} opacity={0.85} />
            ))}
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
            accessibilityRole="button"
            key={n}
            onPress={() => handleNumPress(n)}
            style={[styles.numBtn, {
              backgroundColor: blendHex(colors.surface, DIGIT_TINT[(n - 1) % DIGIT_TINT.length], isDark ? 0.34 : 0.20),
              borderWidth: 1,
              borderColor: blendHex(colors.border, DIGIT_TINT[(n - 1) % DIGIT_TINT.length], 0.55),
            }]}
          >
            {digitMode === 'plain'
              ? <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>{n}</Text>
              : <Image source={DIGIT_IMG[n]} accessibilityLabel={String(n)}
              style={{ width: 46, height: 46 }} resizeMode="contain" />}
          </TouchableOpacity>
        ))}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yErase')}
          onPress={() => handleNumPress(0)} style={[styles.numBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="backspace-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
    {/* Hint button + biomarker counters */}
    const hintEl = (
      <View style={styles.hintBlock}>
        <View style={styles.hintRow}>
          <GlassButton
            grow
            tone="warn"
            icon="bulb"
            label={t('btn_hint')}
            onPress={handleHint}
            disabled={!selected || hintUses >= hintMax}
          />
          <GlassButton
            grow
            icon="arrow-undo"
            label={t('btn_undo')}
            onPress={handleUndo}
            disabled={!hist.canUndo}
          />
          <GlassButton
            grow
            icon="color-palette-outline"
            label={t('sudokuColorMode')}
            active={paintColor !== null}
            onPress={() => { setPaintColor((current) => current === null ? 0 : null); setSelected(null); }}
          />
        </View>
        {paintColor !== null && (
          <>
            <View style={styles.paintPalette}>
              {paintPalette.map((accent, index) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${t('sudokuColorMode')} ${index + 1}`}
                  accessibilityState={{ selected: paintColor === index }}
                  key={accent}
                  onPress={() => setPaintColor(index)}
                  style={[
                    styles.paintSwatch,
                    {
                      backgroundColor: blendHex(colors.surface, accent, isDark ? 0.62 : 0.44),
                      borderColor: paintColor === index ? colors.text : colors.border,
                    },
                  ]}
                >
                  {paintColor === index && <Ionicons name="checkmark" size={16} color={colors.text} />}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.paintHint, { color: colors.textSecondary }]}>{t('sudokuColorHint')}</Text>
          </>
        )}
      </View>
    );
    // Единый каркас GameShell: статы — в props каркаса (обе ориентации).
    // Portrait: numPad+hint в прибитом нижнем тулбаре. Landscape: сетка | цифры рядом
    // (numPad остаётся сбоку, тулбара нет) — рабочий landscape v1.30.6 сохранён.
    return (
      <GameShell
        title={t('sudoku').replace(/\s*\d+\s*[×xX]\s*\d+\s*$/, '') + ` ${N}×${N}`}
        onBack={() => goBackOrHome()}
        stats={statsEl}
        // ПОРТРЕТ: подсказка, отмена и цвет уезжают наверх, внизу остаются только цифры.
        // Раньше низ держал два ряда управления подряд — клавиатуру и действия под ней;
        // на телефоне рука закрывала оба сразу, а ряд действий читался как часть доски.
        //
        // ЛАНДШАФТ не трогаем: там управление и так стоит СБОКУ от поля, теснота не
        // возникает, и переносить нечего.
        // Действия наверху ВСЕГДА (решение Дениса 12.08 — «делай везде»), в обеих
        // раскладках. Внизу и сбоку остаются только цифры: место вспомогательных
        // кнопок должно совпадать, куда бы ни повернули экран.
        headerActions={hintEl}
        // Клавиатура больше НЕ в прибитом низу: между доской и цифрами оставалась
        // пустота почти в пол-экрана, и рука тянулась вниз через весь телефон.
        // Теперь цифры идут сразу под доской, где на них и смотрят.
        toolbar={undefined}
        scrollableField={boardOverflows}
      >
        {landscape ? (
          <View style={styles.playAreaLand}>
            {gridEl}
            <View style={styles.landControls}>{padEl}</View>
          </View>
        ) : (
          // Вертикаль: доска и цифры ОДНОЙ колонкой — клавиатура идёт сразу под доской.
          // Раньше она была прибита к низу экрана, и между доской и цифрами зияла
          // пустота почти в пол-экрана: рука тянулась вниз через весь телефон.
          <View style={styles.playAreaCol}>
            {gridEl}
            {padEl}
          </View>
        )}
      </GameShell>
    );
  };

  // Игровая фаза — на едином каркасе GameShell; справка правил и game-over — оверлеи
  // поверх каркаса (обёртка View flex:1, паттерн digit-span).
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        {renderPlaying()}
        {/* v1.111.0: справка правил уровня (авто при первом входе на вариант / тап по бейджу ⓘ) */}
        <RulesHelpModal visible={rulesOpen} variant={variant} killer={mode === 'killer'} N={N}
          colors={colors} language={language} onClose={() => setRulesOpen(false)} />
        {over && (
          <View style={styles.overWrap}>
            <View style={[styles.overCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.overEmoji}>💔</Text>
              <Text style={[styles.overTitle, { color: colors.text }]}>{t('outOfLives')}</Text>
              <Text style={[styles.overSub, { color: colors.textSecondary }]}>{t('outOfLivesHint')}</Text>
              <TouchableOpacity
                accessibilityRole="button" style={styles.startBtn} onPress={() => startGame()}>
                <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                  <Text style={styles.startBtnText}>{t('restart')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button" onPress={() => goBackOrHome()} style={{ marginTop: 10 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('goHome')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('sudoku').replace(/\s*\d+\s*[×xX]\s*\d+\s*$/, '')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {/* v1.111.0: справка правил уровня (на конфиге — если открыта) */}
      <RulesHelpModal visible={rulesOpen} variant={variant} killer={mode === 'killer'} N={N}
        colors={colors} language={language} onClose={() => setRulesOpen(false)} />
      {phase === 'boss' && (
        <BossRound
          config={{ type: bossTypeRef.current, gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('result'); }}
        />
      )}
      {/* Обычный уровень пройден чисто (без вехи-босса) → баннер авто-потока: следующий стартует сам. */}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="sudoku"
          level={level}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          onContinue={() => { const nx = level + 1; setLevel(nx); startGame(nx); }}
          onStop={() => setPhase('config')}
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
            <Text style={[styles.overTitle, { color: colors.text }]}>{t('levelDone').replace('{n}', String(level))}</Text>
            <Text style={[styles.overSub, { color: colors.textSecondary }]}>
              {t('timeErrorsLine').replace('{t}', elapsedTime.toFixed(1)).replace('{n}', String(errors))}
            </Text>
            {bossWon === true && <Text style={[styles.overSub, { color: '#f59e0b', fontWeight: '800' }]}>{t('bossDefeated')}</Text>}
            {bossWon === false && <Text style={[styles.overSub, { color: colors.textSecondary }]}>{t('bossSurvived')}</Text>}
            <TouchableOpacity
              accessibilityRole="button" style={styles.startBtn} onPress={() => { const nx = level + 1; setLevel(nx); startGame(nx); }}>
              <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                <Text style={styles.startBtnText}>{`${t('level')} ${level + 1} →`}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" onPress={() => setPhase('config')} style={{ marginTop: 10 }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('sudokuMenu')}</Text>
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
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  // крупный системный шрифт: заголовок не ужимался и выдавливал кнопку «назад» за край
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, marginHorizontal: 8 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  // Отступ слева — под плавающую кнопку отзыва: она смонтирована глобально и висит
  // поверх экрана, накрывая первую кнопку строки. Общий каркас игр резервирует под
  // неё те же 66 точек (FAB_GUTTER в GameShell), здесь низ рисуется свой — значит
  // и место надо оставить своё.
  configBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingLeft: 52 },
  stickyFooter: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playAreaLand: { flexDirection: 'row', gap: 22, alignItems: 'center' },   // landscape: сетка | цифры
  landControls: { gap: 14, alignItems: 'center', justifyContent: 'center' },
  toolbarCol: { flex: 1, alignItems: 'center', gap: 8 },           // portrait: numPad+hint колонкой в тулбаре каркаса
  numPadLand: { maxWidth: 56 * 3 },                                // 3 столбца цифр справа
  // до 4 счётчиков (уровень/жизни/время/правила) при крупном шрифте не влезали в ряд → перенос
  statsRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  gridArea: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 4, position: 'relative' },
  cell: { justifyContent: 'center', alignItems: 'center' },
  cellText: { fontSize: 28, fontWeight: '600' },
  // RTL-пин: цифровой ряд 1..9 не зеркалится (конвенция цифровых клавиатур в RTL-локалях)
  // Нижний отступ поднимает колонку над плавающей кнопкой отзыва: она висит
  // в левом нижнем углу поверх экрана и накрывала вторую строку клавиш.
  playAreaCol: { alignItems: 'center', gap: 14, marginBottom: 76 },
  numPad: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', writingDirection: 'ltr' },
  numBtn: { width: 64, height: 64, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  numText: { color: '#FFF', fontSize: 26, fontWeight: '800' },
  // alignItems:'stretch' — иначе ряд кнопок сжимается по содержимому и вылезает
  // за экран: на 375px первая капсула уезжала за левый край и обрезалась.
  hintBlock: { alignSelf: 'stretch', alignItems: 'stretch', gap: 5 },
  // Кнопки тянутся по ширине панели поровну (flex: 1) и держат минимум 48 точек по
  // высоте. Было paddingVertical: 8 — около 36 точек, ниже минимума, при котором палец
  // попадает надёжно (44 у Apple, 48 у Material). Промах по «Отменить» в судоку стоит
  // дорого: рядом «Подсказка», а она тратит лимит и режет счёт.
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 0, width: '100%' },
  paintPalette: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  paintSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  paintHint: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  overWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 24, zIndex: 100 },
  overCard: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 24, alignItems: 'center', gap: 6 },
  overEmoji: { fontSize: 46 },
  overTitle: { fontSize: 20, fontWeight: '800' },
  overSub: { fontSize: 14, textAlign: 'center', marginBottom: 10 },
  hintBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 12, minHeight: 48, borderRadius: 16 },
  hintBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  undoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 12, minHeight: 48, borderRadius: 16, borderWidth: 1 },
  undoBtnText: { fontSize: 14, fontWeight: '700' },
  metaText: { fontSize: 12, fontWeight: '700' },
});
