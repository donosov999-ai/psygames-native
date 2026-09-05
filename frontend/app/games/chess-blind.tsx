/* psygames-game-chess-blind · VER 5 · 27.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrHome } from '@/src/utils/nav';
import { hudTime } from '@/src/services/hudTime';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
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
import { SvgXml } from 'react-native-svg';
import { CHESS_PIECE_SVG } from '@/src/games/chess-blind/core/pieces';
import { readChessAssist, writeChessAssist, CHESS_ASSIST_DEFAULT, type ChessAssist } from '@/src/games/chess-blind/core/assist';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';
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
  coreIndex,
  currentQuestion,
  getChessBlindStrings,
  isLightSquare,
  memorizeLine,
  nextBlock,
  openBlock,
  parseChessProgress,
  pieceGlyph,
  positionForLevel,
  puzzlePiecesBand,
  puzzlePosition,
  questionText,
  puzzleLevelParams,
  puzzleMinUnique,
  toScreenPieces,
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
  type PuzzlePiece,
  type PuzzlePieceType,
  type PuzzleQuizType,
  type RecallQuestion,
} from '@/src/games/chess-blind/core';

/**
 * ТРЕНАЖЁР ВИЗУАЛИЗАЦИИ ДОСКИ (`chess_blind`) — два режима на одном экране.
 *
 * ПАРТИЯ (лесенка 1–15): позицию показали → фигуры замаскировались одинаковыми
 * фишками → на старших уровнях фишки вслепую ходят → квиз «что стоит здесь?» и
 * «где фигура X?». Ручки трудности: число фигур, длина показа, слепые ходы, тип
 * квиза.
 *
 * СЕРИЯ (три блока на ОДНОЙ позиции): цвет полей → ход коня → память о позиции.
 * Каждый следующий блок добавляет РОВНО ОДНО требование, и разность времён —
 * цена добавленного звена. Состояние серии ведётся ниже по файлу, правила — в
 * `src/games/chess-blind/core`.
 *
 * 🔴 ЭТО ТРЕНАЖЁР, А НЕ ВОСПРОИЗВЕДЕНИЕ МЕТОДИКИ, И НАЗЫВАТЬСЯ ОН ДОЛЖЕН ТАК ЖЕ.
 * Имя «слепые шахматы» тянуло за собой заявку на парадигму Chase & Simon (1973),
 * которой здесь нет и не было: у них случайная расстановка — это КОНТРОЛЬНОЕ
 * условие, где эффект знания структуры ГАСИТСЯ, а игра до 27.08.2026 расставляла
 * фигуры именно случайно. То есть носила имя методики, воспроизводя её контроль
 * (реестр: `PSYGAMES_DEFECTS.md` §239). Расстановка вылечена — материал берётся
 * из заготовленного офлайн корпуса живых позиций; заявка на парадигму снята
 * вместе с ней, и разности блоков серии не называются «оценкой мозга»: T₂ − T₁ —
 * цена ОДНОГО правила в ЭТОЙ партии на ЭТОЙ позиции, и ничего сверх того.
 */

/**
 * ЦВЕТ КЛЕТОК. Было тёмное дерево (#9c7a5b / #6b4f3a) — на нём чёрная фигура
 * сливалась с полем, и её приходилось обводить светлым. Классическая пара lichess
 * светлее и контрастнее: чёрная фигура читается на обеих клетках без обводки.
 */
const BOARD_LIGHT = '#f0d9b5';
const BOARD_DARK = '#b58863';

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
// Виды фигур и сама фигура — типы ЯДРА, не вторая их запись: там же лежит сборка
// `toScreenPieces`, применяющая переворот координат, и расходиться им нельзя.
type PieceType = PuzzlePieceType;
// Тот же тип, что у ядра, — не вторая его запись: два независимых списка видов
// квиза разъезжаются молча (tsc их структурное совпадение принимает и молчит).
type QuizType = PuzzleQuizType;

type Piece = PuzzlePiece;   // sq: 0..63, row0 = 8-я горизонталь (верх)
interface Combo { type: PieceType; white: boolean }
interface Move { pieceId: number; from: number; to: number }
interface Question { sq: number; answer: Combo; options: Combo[] }

// Два набора unicode-глифов: белые — КОНТУРНЫЕ (outline) символы ♔♕♖♗♘♙,
// чёрные — ЗАЛИТЫЕ ♚♛♜♝♞♟. Так стороны различаются ФОРМОЙ (контур vs заливка),
// а не только цветом текста → фигуры читаются намного легче (репорт «плохо видно фигурки»).
const GLYPH_WHITE: Record<PieceType, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
const GLYPH_BLACK: Record<PieceType, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyphOf = (c: Combo): string => (c.white ? GLYPH_WHITE : GLYPH_BLACK)[c.type];


// ⚠️ 03.09.2026 ОБВОДКА ИЗ ВОСЬМИ КОПИЙ ТЕКСТА УБРАНА ВМЕСТЕ С ГЛИФАМИ. Она нужна
// была шрифтовому знаку: в RN нет text-stroke, и контраст на светлой и тёмной клетке
// добирался восемью сдвинутыми копиями. У картинки набора Cburnett контур нарисован
// в самой фигуре, и подпорка стала лишней.
/**
 * ФИГУРА КАРТИНКОЙ. Набор Cburnett (BSD-3, Викисклад) — разбор в шапке
 * `src/games/chess-blind/core/pieces.ts`.
 *
 * 🔴 ПОЧЕМУ НЕ ШРИФТ. Просьба Дениса 03.09.2026: «найди нормальную доску и нормальные
 * фигуры, убогие эти». Шрифтовой знак ♞ система на iOS подменяет своим «пластиковым»
 * глифом, и на доске он выглядит игрушкой; ни толщину линии, ни пропорции у него не
 * поправить. У картинки контур и заливка заданы самим рисунком, поэтому обводка из
 * восьми копий текста больше не нужна.
 */
function PieceImage({ combo, size, glyph }: { combo: Combo; size: number; glyph?: string }) {
  /* ⚠️ Ядро доски зовёт типы строчными ('n'), а корпус задач — прописными ('N').
     Ключ набора один, поэтому приводим к прописной здесь, а не в двух местах вызова. */
  const xml = CHESS_PIECE_SVG[(combo.white ? 'W' : 'B') + String(combo.type).toUpperCase()];
  if (!xml) return null;
  /**
   * ⚠️ ФИГУРА НАЗЫВАЕТ СЕБЯ В ДЕРЕВЕ. До картинок её опознавали по тексту глифа
   * внутри клетки — на этом держатся пробы, которые сверяют нарисованную
   * расстановку с корпусом и проверяют, что во всех трёх блоках позиция ОДНА.
   * У картинки текста нет, поэтому опознавательный знак задан явно: `testID`
   * машине, человеческая подпись — скринридеру.
   */
  /**
   * 🔴 ОПОЗНАВАТЕЛЬНЫЙ ЗНАК БЕРЁТСЯ У ЗОВУЩЕГО, А НЕ СЧИТАЕТСЯ ЗДЕСЬ. В этом файле
   * уже записано, почему: «фигура рисуется одним знаком ИЗ ЯДРА (`pieceGlyph`), а не
   * своим набором глифов экрана: иначе на доске стояло бы одно, а вопрос спрашивал бы
   * про другое». Свой `glyphOf` я тут и подставил — и проба «вопрос спрашивает про ту
   * же доску» немедленно покраснела. Теперь знак приходит оттуда же, откуда фигура.
   */
  const знак = glyph ?? glyphOf(combo);
  return (
    <View testID={`piece:${знак}`} accessibilityLabel={знак}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

// Название фигуры — ОДНИМ ключом на цвет+фигуру, а не сборкой «цвет» + «фигура».
// В половине языков прилагательное согласуется с родом («белая ладья», но «белый конь»,
// la torre blanca / el caballo blanco) — из двух кусков это не склеить.
function pieceName(c: Combo, t: (k: string) => string): string {
  return t(`chessPc${c.white ? 'W' : 'B'}${c.type}`);
}

/**
 * Лесенка 15 уровней: сложность ТРУДНОСТЬЮ (фигуры / показ / слепые ходы / тип
 * квиза), не временем и не долей проб.
 *
 * ⚠️ САМА ТАБЛИЦА ЖИВЁТ В `core/puzzle.ts`, А НЕ ЗДЕСЬ (переехала 27.08.2026).
 * По ней выбирается МАТЕРИАЛ партии — позиция из корпуса и требование к числу
 * уникальных фигур, — а до файла маршрута проба не дотягивается: наружу он
 * отдаёт только компонент. Гейту пришлось бы держать копию чисел рядом с собой,
 * а копия зеленеет сама по себе.
 */
const levelParams = puzzleLevelParams;

function stageName(level: number, t: (k: string) => string): string {
  if (level <= 5) return t('chessStageFlash');
  if (level <= 10) return t('chessStageBlind');
  return t('chessStageLocate');
}

/**
 * Перемешивание. ⚠️ КОПИЯ, А НЕ АРГУМЕНТ: до 27.08.2026 функция тасовала
 * переданный массив на месте и возвращала его же. Все семь вызовов на сегодня
 * передают свежий массив или копию и потому не страдали — но реестр дефектов
 * держит эту строку в списке ловушек (`PSYGAMES_DEFECTS.md` §153: «не копирует
 * массив, мутирует аргумент»), потому что следующий вызов с живым массивом
 * испортил бы его молча. Копия стоит одну строку.
 */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
  /**
   * 🔴 ОТВЕТИЛ — ВИДНО, ЧТО ВЫШЛО. Денис написал об этом ТРИ РАЗА (63969cc9,
   * 52267f4f, плюс голосом): «ты вслепую ответ дал и не знаешь толком, ошибся или
   * нет», «чтобы можно было видеть, где ошибка… если тапнул по фигуре — ответы
   * чтоб показывались, если неправильно, то подсвечивались красным».
   *
   * Так и было: при ВЕРНОМ ответе не происходило ничего — звук и через 350 мс
   * следующий вопрос. При неверном подсвечивалась правильная КНОПКА, но не было
   * видно ни своего промаха, ни того, что стояло на клетке.
   *
   * Теперь после любого ответа фишка-маска на спрошенной клетке ПЕРЕВОРАЧИВАЕТСЯ
   * в настоящую фигуру, клетка обводится зелёным или красным, а нажатая кнопка
   * красится по результату. Пауза при верном ответе поднята с 350 до 700 мс —
   * иначе показ не успевает прочитаться.
   */
  const [flipSq, setFlipSq] = useState<number | null>(null);         // клетка, где фишка открыта после ответа
  const [flipRight, setFlipRight] = useState(false);                 // ответ был верным
  const [pickedOpt, setPickedOpt] = useState<Combo | null>(null);    // что человек нажал
  const [revealSq, setRevealSq] = useState<number | null>(null);     // locate: подсветка правильной клетки
  const [wrongSq, setWrongSq] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  const levelRef = useRef(1);
  const prmRef = useRef(levelParams(1));
  /**
   * Фигур НА ДОСКЕ в этой партии. Не то же самое, что `prm.pieces`: тот —
   * ЗАПРОС уровня, а корпус отдаёт позицию в полосе ±1 (почему именно так —
   * замер в `PUZZLE_PIECES_TOLERANCE`). В отчёт сессии уходит эта цифра, иначе
   * `details.pieces` рассказывал бы про запрос, а не про то, что человек видел.
   */
  const piecesOnBoardRef = useRef(0);
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

  /**
   * ПОДСКАЗКИ: пустая доска и подписи полей. Просьба Дениса 03.09.2026 по кадру
   * блока «Цвет полей». Выключено по умолчанию — почему именно так, разобрано в
   * шапке `src/games/chess-blind/core/assist.ts`.
   */
  const [assist, setAssist] = React.useState<ChessAssist>(CHESS_ASSIST_DEFAULT);
  React.useEffect(() => { void readChessAssist((profile as any)?.id).then(setAssist); }, [profile]);
  const переключить = React.useCallback((поле: keyof ChessAssist) => {
    setAssist((было) => {
      const стало = { ...было, [поле]: !было[поле] };
      void writeChessAssist((profile as any)?.id, стало);
      return стало;
    });
  }, [profile]);

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

    // 🔴 ПОЗИЦИЯ ЗАГОТОВЛЕНА ОФЛАЙН, А НЕ СОБРАНА СЕЙЧАС. До 27.08.2026 здесь
    // стоял `generatePosition` — 4–12 фигур, разбросанных `Math.random()` в
    // момент нажатия. Это КОНТРОЛЬНОЕ условие Chase & Simon (1973): на случайной
    // расстановке памяти не за что зацепиться, и преимущество опытного игрока
    // ИСЧЕЗАЕТ — то есть игра меряла голый зрительно-пространственный объём,
    // дублируя «Клетки» и «Матрицу памяти» фишками в форме коней
    // (`PSYGAMES_DEFECTS.md` §239). Теперь материал — выборка задач Lichess (CC0,
    // 2000 живых позиций), общая с серией: пешечные цепи, король за своими
    // пешками, ладья на линии. Ровно тот же вывод второй раз пришёл со стороны:
    // конкурент Dawikk держит свои 5000 задач заготовленными, а не считает их на
    // телефоне (разбор — `PSYGAMES_MERGE_PLAN.md` §21).
    const picked = puzzlePosition(p.pieces, puzzleMinUnique(p.quizType));
    piecesOnBoardRef.current = picked.pieces;
    const pos = toScreenPieces(picked.position);
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
    else if (!isPreset) lvl.fail();   // симметрия лестницы: три провала подряд → −1 уровень
    saveSession({
      passed,
      game_type: 'chess_blind',
      score: fHits * 150 - fErrors * 50,
      time_seconds: timeSec,
      difficulty: `L${levelRef.current}`,
      mode: p.quizType,
      errors: fErrors,
      // `pieces` — сколько фигур СТОЯЛО, а не сколько просил уровень: см. piecesOnBoardRef.
      details: { level: levelRef.current, hits: fHits, errors: fErrors, pieces: piecesOnBoardRef.current, moves: p.moves, quiz_type: p.quizType },
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
    setFlipSq(null); setPickedOpt(null);
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
    // Показываем результат ВСЕГДА: клетка открывается, нажатая кнопка красится.
    setPickedOpt(opt);
    setFlipSq(q.sq);
    setFlipRight(correct);
    if (correct) {
      hitsRef.current += 1; setHits((h) => h + 1);
      sndCorrect();
      later(nextQuestion, 700);   // было 350 — открытую фигуру не успевали увидеть
    } else {
      errorsRef.current += 1; setErrors((e) => e + 1);
      sndWrong();
      setRevealOpt(q.answer);   // подсветить ПРАВИЛЬНУЮ кнопку рядом с нажатой
      later(nextQuestion, 1400);
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
              const bg = isLight ? BOARD_LIGHT : BOARD_DARK;
              const coordColor = isLight ? '#5d4433' : '#c9b29a';
              let hl: string | null = null;
              /**
               * 🔴 СПРАШИВАЕМАЯ КЛЕТКА — ЗАЛИВКОЙ, А НЕ ВОЛОСКОМ.
               * Отчёт a4cc1a7d (04.09.2026): «подсветка, не видно нихуя, какую
               * фигуру выделять» — уже ВТОРОЙ про то же. Замер в браузере показал,
               * что рамки доезжают до экрана (3 штуки, 45×45, 3 px), то есть дело
               * не в проводке: линия в 3 точки по краю клетки 45 — это 7% её
               * ширины, и на охристой доске под фишкой она теряется. Поэтому у
               * СПРАШИВАЕМОЙ клетки рамка 5 и заливка: её видно целиком, а не по
               * контуру.
               */
              let сильная = false;
              if (moveHl && (moveHl.from === sq || moveHl.to === sq)) hl = '#fbbf24';
              if (pendingSqs.has(sq)) hl = '#38bdf8aa';   // ждёт ответа — рамка бледнее
              if (pickTargetSq === sq) { hl = '#0284c7'; сильная = true; }   // спрашиваемая сейчас
              if (revealSq === sq) hl = '#22c55e';
              if (wrongSq === sq) hl = '#f43f5e';
              if (flipSq === sq) hl = flipRight ? '#22c55e' : '#f43f5e';
              const p = bySq.get(sq);
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  // Имя поля вслух. Читалке экрана иначе достаются 64 безымянные
                  // кнопки, а на «розыске» нажать нужное поле вслепую нельзя вовсе.
                  // Той же подписью проба читает расстановку с ОТРИСОВАННОГО дерева,
                  // а не из внутренних данных экрана.
                  accessibilityLabel={squareName(coreIndex(sq))}
                  key={c}
                  activeOpacity={0.8}
                  onPress={() => (isPick ? selectQuestionAt(sq) : answerLocate(sq))}
                  disabled={!(phase === 'quiz' && (prm.quizType === 'locate' || (isPick && pendingSqs.has(sq))))}
                  style={{ width: cellSize, height: cellSize, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
                >
                  {/* Мелкие подписи в углах клеток — только когда крайние выключены:
                      иначе одно и то же написано дважды. */}
                  {!assist.coords && c === 0 && <Text style={[styles.coord, { top: 1, left: 2, color: coordColor }]}>{8 - r}</Text>}
                  {!assist.coords && r === 7 && <Text style={[styles.coord, { bottom: 1, right: 2, color: coordColor }]}>{'abcdefgh'[c]}</Text>}
                  {p && (showPieces || flipSq === sq ? (
                    // 🔴 ФИГУРА КРУПНЕЕ: 0.82 → 0.96 клетки. Два отчёта 02.09.2026:
                    // «ни хуя фигуры непонятно, хуёво отрисовать» и «картинки на
                    // доске можно покрупнее сделать». Unicode-глиф шахматной фигуры
                    // несёт заметные внутренние поля: при кегле 0.82 сама фигура
                    // занимает около двух третей ширины клетки — на телефоне это
                    // тридцать пикселей вместе с обводкой, и форма читается плохо.
                    // Контурные белые против залитых чёрных при таком размере тоже
                    // различаются хуже, чем задумано.
                    // 03.09.2026: картинка вместо шрифтового знака — форма и толщина
                    // линии заданы рисунком, поэтому «крупнее» больше не упирается в
                    // внутренние поля глифа.
                    <PieceImage combo={p} glyph={glyphOf(p)} size={Math.round(cellSize * 0.86)} />
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
                  {hl && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.hlOverlay,
                        { borderColor: hl },
                        сильная && { borderWidth: 5, backgroundColor: '#38bdf855' },
                      ]}
                    />
                  )}
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
  /**
   * ПОДПИСИ ПОЛЕЙ ПО КРАЯМ — a–h снизу и 1–8 слева.
   *
   * Просьба Дениса 03.09.2026: «и ещё как опция показывать разметку a, b и т. д. по
   * краям доски». Раньше буквы и цифры рисовались ВНУТРИ угловых клеток мелким
   * серым — на телефоне их не видно, и человек считал файлы пальцем от края.
   */
  const ФАЙЛЫ = 'abcdefgh';
  const renderCoords = (сторона: 'files' | 'ranks') => (
    <View style={сторона === 'files'
      ? { flexDirection: 'row', width: boardSize }
      : { flexDirection: 'column', height: boardSize, justifyContent: 'space-between' }}>
      {Array.from({ length: BOARD_SIDE }).map((_, i) => (
        <Text
          key={i}
          style={{
            color: colors.textSecondary, fontSize: Math.max(10, Math.round(cellSize * 0.28)),
            fontWeight: '600', textAlign: 'center',
            ...(сторона === 'files' ? { width: cellSize } : { height: cellSize, lineHeight: cellSize, width: 16 }),
          }}
        >
          {сторона === 'files' ? ФАЙЛЫ[i] : String(BOARD_SIDE - i)}
        </Text>
      ))}
    </View>
  );

  /**
   * Доска с подписями по краям, если они включены. `position === null` — ПУСТАЯ
   * доска-подсказка: она помогает найти e1 и f7, но не выдаёт запомненную позицию.
   */
  const renderBoardWithCoords = (position: ChessPosition | null) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'center' }}>
      {assist.coords ? renderCoords('ranks') : null}
      <View>
        {position ? renderSeriesBoard(position) : renderEmptyBoard()}
        {assist.coords ? renderCoords('files') : null}
      </View>
    </View>
  );

  /** Пустая доска — только клетки, без фигур. */
  const renderEmptyBoard = () => (
    <View style={{ width: boardSize, height: boardSize, borderRadius: 6, overflow: 'hidden', writingDirection: 'ltr' } as any}>
      {Array.from({ length: BOARD_SIDE }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: BOARD_SIDE }).map((_, col) => {
            const index = coreIndex(row * BOARD_SIDE + col);
            return (
              <View
                key={col}
                accessible
                accessibilityLabel={squareName(index)}
                style={{ width: cellSize, height: cellSize, backgroundColor: isLightSquare(index) ? BOARD_LIGHT : BOARD_DARK }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

  const renderSeriesBoard = (position: ChessPosition) => (
    // RTL-пин: доска канонически LTR (a-файл слева) — зеркальная нарушает нотацию.
    <View style={{ width: boardSize, height: boardSize, borderRadius: 6, overflow: 'hidden', writingDirection: 'ltr' } as any}>
      {Array.from({ length: BOARD_SIDE }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: BOARD_SIDE }).map((_, col) => {
            // Наш индекс считается СНИЗУ ВВЕРХ (0 = a1), а рисуем сверху вниз.
            // Переворот берётся у ядра: своя копия формулы здесь была третьей.
            const index = coreIndex(row * BOARD_SIDE + col);
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
                  backgroundColor: light ? BOARD_LIGHT : BOARD_DARK,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {piece ? (
                  <PieceImage
                    combo={{ type: piece.type as PieceType, white: piece.color === 'w' }}
                    glyph={pieceGlyph(piece)}
                    size={Math.round(cellSize * 0.86)}
                  />
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
        /** Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4). */
        hud={[
          { key: 'q', icon: 'help-circle', label: t('chessQuestionShort'), value: `${Math.min(state.step + 1, state.questions.length)}/${state.questions.length}`, pop: true },
          { key: 'time', icon: 'time', label: t('time'), value: hudTime(seriesTime, t('secShort')) },
        ]}
        stats={
          <View style={styles.statsRow}>
            {/* Правило уровня — объяснение механики, а не счётчик: остаётся в шапке. */}
            <LevelRuleBadge lr={levelRules} color={colors.primary} ru={language === 'ru'} />
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
              {/* Подсказка: ПУСТАЯ доска. Позиции на ней нет — иначе блок памяти
                  превратился бы в чтение с картинки. */}
              {assist.board ? renderBoardWithCoords(null) : null}
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
              {renderBoardWithCoords(state.position)}
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
      /** Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4). */
      hud={[
        { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: levelRef.current },
        { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const, pop: true },
        /**
         * ⚠️ Отвечать можно вразнобой, поэтому счётчик показывает ПРОГРЕСС
         * (сколько закрыто), а не номер выбранной клетки: с номером он прыгал бы
         * 1/3 → 3/3 → 2/3 при тапе по другой клетке и читался как ошибка.
         */
        ...(phase === 'quiz' ? [{ key: 'q', icon: 'help-circle' as const, label: t('chessQuestionShort'), value: `${answeredTick}/${prm.questions}`, tone: 'accent' as const }] : []),
      ]}
      toolbar={
        phase === 'quiz' && prm.quizType === 'pick' && currentQ ? (
          <View style={[styles.optionsWrap, { width: boardSize }]}>
            {currentQ.options.map((opt, i) => {
              const isReveal = revealOpt && opt.type === revealOpt.type && opt.white === revealOpt.white;
              // Нажатая кнопка красится по результату — без этого промах не виден вовсе.
              const isPicked = pickedOpt && opt.type === pickedOpt.type && opt.white === pickedOpt.white;
              const рамка = isPicked ? (flipRight ? '#22c55e' : '#f43f5e') : isReveal ? '#22c55e' : null;
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
                      borderColor: рамка ?? (opt.white ? '#94a3b8' : '#475569'),
                      borderWidth: рамка ? 4 : 2,
                    },
                  ]}
                >
                  <PieceImage combo={opt} size={44} />
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
            /**
             * 🔴 КЛЕТКА НАЗВАНА В САМОМ ВОПРОСЕ, А НЕ ТОЛЬКО ПОДСВЕЧЕНА.
             *
             * Отчёт Дениса 03.09.2026 со скриншотом (`9e1e38f3`): «не могу выбрать
             * фигуру на доске которую хочу вспомнить сейчас». Замер по его кадру:
             * на клетках с фишками НОЛЬ синих точек — рамка-подсветка до экрана не
             * дошла, хотя в коде она есть и проба на текущей сборке её находит
             * (`chess-blind-pick-highlight`). Воспроизвести путь, где она пропадает,
             * я не смог.
             *
             * Поэтому вопрос перестаёт ЗАВИСЕТЬ от подсветки: имя поля написано
             * словами. Даже если рамка не нарисуется, человек знает, про какую
             * клетку спрашивают, — а это ровно то, чего он не мог понять.
             */
            ? (currentQ ? t('chessHintWhatSquareAt').replace(/[:\s]+$/, '') : t('chessHintWhatSquare'))
            : currentQ
            ? t('chessHintWhereIs').replace('{piece}', pieceName(currentQ.answer, t)).replace('{glyph}', glyphOf(currentQ.answer))
            : ''}
        </Text>

        {/*
          🔴 ВТОРОЙ ОТВЕТ НА ТОТ ЖЕ ОТЧЁТ — КООРДИНАТА КРУПНО.
          Отчёт f87b180b (04.09.2026): «сделать как режимы: один вариант —
          подсвечивать какую нужно вставить, а второй — писать более крупными
          буквами цифру-букву, которую нужно определить, типа „Г три“».
          Режимом не делаю: оба варианта не мешают друг другу, а лишний
          переключатель — это ещё один экран настроек и ещё одно состояние.
          Клетка залита цветом И названа крупно; работает даже если рамка
          почему-то не нарисуется, а именно на это была жалоба 03.09.
        */}
        {phase === 'quiz' && prm.quizType === 'pick' && currentQ ? (
          <Text style={[styles.askSquare, { color: colors.primary }]} accessibilityRole="header">
            {squareName(coreIndex(currentQ.sq))}
          </Text>
        ) : null}

        {phase === 'expose' && (
          <View style={[styles.barTrack, { width: boardSize, backgroundColor: colors.surface }]}>
            <View style={[styles.barFill, { width: `${exposePct}%` }]} />
          </View>
        )}

        {/* Крайние подписи полей — те же, что в серии: одно правило на обе доски. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'center' }}>
          {assist.coords ? renderCoords('ranks') : null}
          <View>
            {renderBoard()}
            {assist.coords ? renderCoords('files') : null}
          </View>
        </View>
      </View>
    </GameShell>
  );

  // ─── конфиг ───
  const renderConfig = () => {
    const p = levelParams(lvl.level);
    // Полоса, а не число: корпус отдаёт позицию в пределах ±1 от запроса уровня,
    // и написать «4 фигуры», выдав пять, — мелкое враньё, которое ловится первым
    // же пересчётом на доске. Ни одного нового ключа словаря это не требует:
    // «3–5» собирается из цифр, слово «фигур» уже есть.
    const piecesBand = puzzlePiecesBand(p.pieces);
    const descBits = [
      `${piecesBand.min}–${piecesBand.max} ${t('chessCfgPieces')}`,
      `${t('chessCfgExpose')} ${p.exposeSec}${t('secShort')}`,
      ...(p.moves > 0 ? [`${p.moves} ${t('chessCfgBlindMoves')}`] : []),
      t(p.quizType === 'pick' ? 'chessCfgQuizPick' : 'chessCfgQuizLocate'),
    ];
    return (
      <>
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
        {/**
          * ПОДСКАЗКИ. Просьба Дениса 03.09.2026: доска и разметка полей — опциями.
          * Подпись под переключателем не смягчена нарочно: с доской это уже не работа
          * вслепую, и человек должен это знать, а не обнаружить по лёгкости.
          */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('chessAssistTitle')}</Text>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: assist.board }}
            onPress={() => переключить('board')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10 }}
          >
            <Ionicons name={assist.board ? 'checkbox' : 'square-outline'} size={22} color={GRADIENT[0]} />
            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{t('chessAssistBoard')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: assist.coords }}
            onPress={() => переключить('coords')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10 }}
          >
            <Ionicons name={assist.coords ? 'checkbox' : 'square-outline'} size={22} color={GRADIENT[0]} />
            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{t('chessAssistCoords')}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {t('chessAssistNote')}
          </Text>
        </View>
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
      {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
      <GameSetupBar label={t('lvlTargetBtn').replace('{n}', String(lvl.level))} onStart={startGame} colors={GRADIENT as [string, string]} />
      </>
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
        <View style={{ width: HELP_CORNER_SPACE }} />
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
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
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
  statsRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', flexWrap: 'wrap', maxWidth: '100%' },
  statText: { fontSize: 15, fontWeight: '700' },
  hintText: { fontSize: 14, textAlign: 'center', minHeight: 20, fontWeight: '600' },
  /** Имя клетки — крупно: на него смотрят, а не на подпись под ним. */
  askSquare: { fontSize: 40, lineHeight: 46, fontWeight: '900', textAlign: 'center', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#38bdf8' },
  coord: { position: 'absolute', fontSize: 8, fontWeight: '700' },
  glyphLayer: { position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center' },
  hlOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderRadius: 4 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: '100%' },
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
