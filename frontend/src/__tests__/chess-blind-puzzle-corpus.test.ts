/* psygames-chess-blind-puzzle-corpus-gate · VER 1 · 27.08.2026 */
/**
 * КЛАССИЧЕСКАЯ ПАРТИЯ ВСЛЕПУЮ БЕРЁТ ПОЗИЦИЮ ИЗ ЗАГОТОВЛЕННОГО КОРПУСА, А НЕ
 * СОБИРАЕТ ЕЁ `Math.random()` В МОМЕНТ НАЖАТИЯ.
 *
 * ЧТО ЛЕЧИТСЯ. До 27.08.2026 `startGame` звал `generatePosition(pieces)` —
 * два короля плюс добор из пула, всё на случайных клетках. Это КОНТРОЛЬНОЕ
 * условие Chase & Simon (1973), придуманное ровно затем, чтобы эффект знания
 * структуры ИСЧЕЗ: цепляться памяти не за что. Игра носила имя методики,
 * воспроизводя её контроль (`PSYGAMES_DEFECTS.md` §239), а заодно считала
 * материал на телефоне под дедлайном — то самое, от чего в этом проекте уже
 * было замирание на 54 секунды в классической судоку.
 *
 * ⚠️ ЗЕЛЁНОЕ ВСЛЕПУЮ ЗДЕСЬ ОСОБЕННО ДЁШЕВО, И ВОТ ЧЕМ ИМЕННО.
 *
 *   1. «Позиция из корпуса» — правда и для пустого множества сравнения: если
 *      набор board-FEN собран криво и пуст, `has()` вернёт false, а если в него
 *      по ошибке попало всё подряд — true на что угодно. Поэтому набор сперва
 *      обязан ОТВЕРГНУТЬ расстановку, собранную СТАРЫМ способом.
 *   2. «Фигур сколько надо» — правда и для полосы шириной в доску. Поэтому
 *      ширина полосы проверяется отдельно, до содержательной проверки.
 *   3. «Уникальных хватает» — правда и тогда, когда в корпусе их хватает у ВСЕХ,
 *      то есть требование не делает ничего. Поэтому считается, сколько позиций
 *      полосы требование ОТСЕИВАЕТ: ноль отсеянных = проба сторожит пустоту.
 *   4. «Доска не перевёрнута» — правда и при сравнении координат с самими собой.
 *      Поэтому имя поля пересобирается ПО ФОРМУЛЕ САМОЙ СЕТКИ ЭКРАНА
 *      (`'abcdefgh'[c]` и `8 - r` — так экран подписывает клетки в `renderBoard`),
 *      а рядом доказывается, что тождественный перевод эту сверку роняет.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BOARD_SIDE,
  BOARD_SQUARES,
  boardFen,
  corpusEntries,
  isLightSquare,
  pieceCount,
  positionFromFen,
  puzzleLevelParams,
  puzzleMinUnique,
  puzzlePiecesBand,
  puzzlePosition,
  PUZZLE_MAX_LEVEL,
  PUZZLE_MIN_LEVEL,
  screenIndex,
  squareName,
  toScreenPieces,
  uniquePieceCount,
} from '@/src/games/chess-blind/core';

/** Зерно вместо `Math.random`: прогон обязан повторяться, иначе краснота неуловима. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Все уровни лесенки — берутся у ЯДРА, а не переписаны рядом с пробой. */
const LEVELS = Array.from(
  { length: PUZZLE_MAX_LEVEL - PUZZLE_MIN_LEVEL + 1 },
  (_, i) => i + PUZZLE_MIN_LEVEL,
);

/** Сколько раз дёргаем каждый уровень. 24 — чтобы зацепить и редкие ветки выбора. */
const DRAWS = 24;

/** Расстановочное поле FEN каждой записи корпуса — то, с чем сверяется доска. */
const CORPUS_BOARDS = new Set(corpusEntries().map((e) => e.fen.split(' ')[0]));

/**
 * Расстановка СТАРЫМ способом: два короля и добор, всё на случайных клетках.
 * Держим её здесь не для красоты — это встречный образец, на котором доказывается,
 * что сверка с корпусом умеет говорить «нет».
 */
function legacyRandomBoardFen(random: () => number): string {
  const POOL = 'qrrbbnnpppp'.split('');
  const cells: (string | null)[] = new Array<string | null>(BOARD_SQUARES).fill(null);
  const put = (glyph: string) => {
    for (let tries = 0; tries < 500; tries += 1) {
      const at = Math.floor(random() * BOARD_SQUARES) % BOARD_SQUARES;
      const rank = Math.floor(at / BOARD_SIDE);
      if (cells[at]) continue;
      if (glyph.toLowerCase() === 'p' && (rank === 0 || rank === BOARD_SIDE - 1)) continue;
      cells[at] = glyph;
      return;
    }
  };
  put('K');
  put('k');
  for (let i = 0; i < 3; i += 1) {
    put(POOL[Math.floor(random() * POOL.length) % POOL.length].toUpperCase());
    put(POOL[Math.floor(random() * POOL.length) % POOL.length]);
  }
  const rows: string[] = [];
  for (let rank = BOARD_SIDE - 1; rank >= 0; rank -= 1) {
    let row = '';
    let gap = 0;
    for (let file = 0; file < BOARD_SIDE; file += 1) {
      const glyph = cells[rank * BOARD_SIDE + file];
      if (!glyph) { gap += 1; continue; }
      if (gap > 0) { row += String(gap); gap = 0; }
      row += glyph;
    }
    if (gap > 0) row += String(gap);
    rows.push(row);
  }
  return rows.join('/');
}

describe('партия вслепую: материал заготовлен офлайн', () => {
  it('смотреть есть на что: корпус полон, лесенка на месте', () => {
    expect(corpusEntries().length).toBeGreaterThanOrEqual(2000);
    expect(CORPUS_BOARDS.size).toBeGreaterThanOrEqual(2000);   // повторов в корпусе нет
    expect(LEVELS).toHaveLength(15);
    // Ручки уровня и правда РАЗНЫЕ по лесенке — иначе проверять «трудность растёт» не на чем.
    expect(new Set(LEVELS.map((l) => puzzleLevelParams(l).pieces)).size).toBeGreaterThan(1);
    expect(new Set(LEVELS.map((l) => puzzleLevelParams(l).moves)).size).toBeGreaterThan(1);
    expect(new Set(LEVELS.map((l) => puzzleLevelParams(l).quizType)).size).toBe(2);
  });

  it('🔴 сверка с корпусом умеет говорить «нет» — старая случайная расстановка отвергается', () => {
    const random = seeded(4242);
    let rejected = 0;
    for (let i = 0; i < 60; i += 1) {
      if (!CORPUS_BOARDS.has(legacyRandomBoardFen(random))) rejected += 1;
    }
    // Ни одна из шестидесяти случайных расстановок не имеет права найтись в корпусе:
    // совпадение восьми фигур на 64 клетках с живой задачей — событие, которого не бывает.
    expect(rejected).toBe(60);
  });

  it('🔴 позиция каждого уровня НАЙДЕНА В КОРПУСЕ — посимвольно, а не «похожа»', () => {
    const chance: string[] = [];
    for (const level of LEVELS) {
      const { pieces, quizType } = puzzleLevelParams(level);
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const picked = puzzlePosition(pieces, puzzleMinUnique(quizType), seeded(level * 1000 + draw));
        expect(picked.source).toBe('lichess');
        if (!CORPUS_BOARDS.has(boardFen(picked.position))) {
          chance.push(`уровень ${level}, попытка ${draw}: ${boardFen(picked.position)}`);
        }
      }
    }
    expect(chance).toEqual([]);
  });

  it('🔴 фигур на доске столько, сколько объявлено человеку — и считано ПО ДОСКЕ', () => {
    // Сперва: полоса УЗКАЯ. «Попало в полосу» шириной в доску не значит ничего.
    //
    // 🔴 ГРАНИЦА ЗДЕСЬ — ЛИТЕРАЛ, А НЕ `PUZZLE_PIECES_TOLERANCE`. Первая редакция
    // этой пробы писала `≤ 2 * PUZZLE_PIECES_TOLERANCE` и была ПУСТОЙ: раздуй
    // допуск с 1 до 8 — вместе с ним раздуется и порог, проба останется зелёной.
    // Поймано мутацией 27.08.2026, и это ровно тот случай, ради которого мутацию
    // и делают. Число 2 берётся не из константы, а из САМОЙ ЛЕСЕНКИ: соседние
    // уровни просят 4, 6, 8, 10, 12 — шаг два. Полоса шире двух начинает
    // накрывать соседний уровень, и «4 фигуры» перестаёт отличаться от «6».
    const MAX_BAND_WIDTH = 2;
    for (const level of LEVELS) {
      const band = puzzlePiecesBand(puzzleLevelParams(level).pieces);
      expect(band.max - band.min).toBeLessThanOrEqual(MAX_BAND_WIDTH);
    }
    // Соседние ступени лесенки не сливаются: полоса четырёх не достаёт до шести.
    expect(puzzlePiecesBand(4).max).toBeLessThan(6);
    // И полоса отвергает чужое: доска на 20 фигур в полосу четырёх не попадает.
    const four = puzzlePiecesBand(4);
    expect(20 >= four.min && 20 <= four.max).toBe(false);

    const outside: string[] = [];
    for (const level of LEVELS) {
      const { pieces, quizType } = puzzleLevelParams(level);
      const band = puzzlePiecesBand(pieces);
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const picked = puzzlePosition(pieces, puzzleMinUnique(quizType), seeded(level * 77 + draw));
        // Судья — доска, а не поле `pieces` записи корпуса и не то, что вернула сама функция.
        const onBoard = pieceCount(picked.position);
        if (onBoard < band.min || onBoard > band.max) {
          outside.push(`уровень ${level}: просили ${pieces} (${band.min}–${band.max}), на доске ${onBoard}`);
        }
        expect(picked.pieces).toBe(onBoard);   // ответ не повторяет запрос, а описывает доску
      }
    }
    expect(outside).toEqual([]);
  });

  it('🔴 на уровнях «розыска» уникальных фигур хватает на ВСЕ ТРИ вопроса', () => {
    const locateLevels = LEVELS.filter((l) => puzzleLevelParams(l).quizType === 'locate');
    expect(locateLevels.length).toBeGreaterThan(0);
    const need = puzzleMinUnique('locate');
    expect(need).toBe(3);

    // Анти-пустота: требование обязано КОГО-ТО отсеивать. Если в полосе все позиции
    // и так годятся, проба сторожит пустое место и о поломке не скажет ничего.
    let thrownOut = 0;
    let inBands = 0;
    for (const level of locateLevels) {
      const band = puzzlePiecesBand(puzzleLevelParams(level).pieces);
      for (const entry of corpusEntries()) {
        if (entry.pieces < band.min || entry.pieces > band.max) continue;
        inBands += 1;
        if (uniquePieceCount(positionFromFen(entry.fen)) < need) thrownOut += 1;
      }
    }
    expect(inBands).toBeGreaterThan(100);
    expect(thrownOut).toBeGreaterThan(0);

    const short: string[] = [];
    for (const level of locateLevels) {
      const { pieces } = puzzleLevelParams(level);
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const picked = puzzlePosition(pieces, need, seeded(level * 31 + draw));
        const unique = uniquePieceCount(picked.position);
        if (unique < need) short.push(`уровень ${level}: уникальных ${unique}, нужно ${need}`);
      }
    }
    expect(short).toEqual([]);
  });
});

describe('партия вслепую: доска не перевёрнута при переходе на экран', () => {
  /** Как САМ экран подписывает клетку сетки: `'abcdefgh'[c]` внизу и `8 - r` слева. */
  const screenLabel = (square: number): string => {
    const r = Math.floor(square / BOARD_SIDE);
    const c = square % BOARD_SIDE;
    return `${'abcdefgh'[c]}${BOARD_SIDE - r}`;
  };

  it('🔴 имя поля совпадает с подписью сетки экрана — все 64 клетки', () => {
    const wrong: string[] = [];
    for (let i = 0; i < BOARD_SQUARES; i += 1) {
      const label = screenLabel(screenIndex(i));
      if (label !== squareName(i)) wrong.push(`${squareName(i)} → нарисовано как ${label}`);
    }
    expect(wrong).toEqual([]);
    // Опорные точки, читаемые глазом: a1 — левый НИЖНИЙ угол сетки, h8 — правый верхний.
    expect(screenIndex(0)).toBe(56);
    expect(screenIndex(BOARD_SQUARES - 1)).toBe(7);
  });

  it('🔴 сверка умеет краснеть: перевод БЕЗ переворота роняет её на a1', () => {
    // Мутант — тождественный перевод, ровно то, что получится, если забыть вычитание.
    const flat = (i: number) => i;
    const broken: string[] = [];
    for (let i = 0; i < BOARD_SQUARES; i += 1) {
      if (screenLabel(flat(i)) !== squareName(i)) broken.push(squareName(i));
    }
    // Роняет ВСЕ 64: подпись сетки считает `8 - r`, имя поля — `r + 1`, и совпасть
    // они могли бы только при r = 3,5. Число здесь не украшение — оно отделяет
    // «проба покраснела от мутанта» от «проба покраснела бы от чего угодно».
    expect(broken).toContain('a1');
    expect(broken).toContain('h8');
    expect(broken.length).toBe(BOARD_SQUARES);
  });

  it('цвет клетки на экране тот же, что у поля по нотации — иначе доска зеркальна', () => {
    const wrong: string[] = [];
    for (let i = 0; i < BOARD_SQUARES; i += 1) {
      const square = screenIndex(i);
      const r = Math.floor(square / BOARD_SIDE);
      const c = square % BOARD_SIDE;
      const paintedLight = (r + c) % 2 === 0;     // формула из `renderBoard`
      if (paintedLight !== isLightSquare(i)) wrong.push(squareName(i));
    }
    expect(wrong).toEqual([]);
    // Канон: h1 светлая, a1 тёмная. Без этого «совпало» может значить «оба врут одинаково».
    expect(isLightSquare(7)).toBe(true);
    expect(isLightSquare(0)).toBe(false);
  });

  it('🔴 фигуры переезжают на экран все, поштучно и на СВОИ клетки', () => {
    // Позиция взята записью, а не выбором: имена полей в ней известны заранее и
    // проверяются глазом. Чёрный король на e5, белый — на e3, по три пешки у каждого.
    const position = positionFromFen('8/8/8/4kppp/8/4KPPP/8/8 b - - 0 35');
    const pieces = toScreenPieces(position);
    expect(pieces).toHaveLength(8);
    expect(pieces.length).toBe(pieceCount(position));

    const byName = new Map(pieces.map((p) => [screenLabel(p.sq), `${p.white ? 'w' : 'b'}${p.type}`]));
    expect(byName.size).toBe(8);                      // две фигуры на одной клетке — недопустимо
    expect(byName.get('e5')).toBe('bK');
    expect(byName.get('e3')).toBe('wK');
    expect(byName.get('f5')).toBe('bP');
    expect(byName.get('h3')).toBe('wP');
    // 🔴 И главное, что видно ГЛАЗОМ: чёрные нарисованы ВЫШЕ белых. Доска
    // показывается со стороны белых, значит строка чёрного короля меньше строки
    // белого. Забыть переворот — и стороны меняются местами, а сама позиция при
    // этом остаётся законной: те же восемь фигур, те же цвета клеток.
    const rowOf = (p: (typeof pieces)[number]) => Math.floor(p.sq / BOARD_SIDE);
    const blackKing = pieces.find((p) => p.type === 'K' && !p.white)!;
    const whiteKing = pieces.find((p) => p.type === 'K' && p.white)!;
    expect(rowOf(blackKing)).toBe(3);
    expect(rowOf(whiteKing)).toBe(5);
    expect(rowOf(blackKing)).toBeLessThan(rowOf(whiteKing));
    // Занятыми оказались ровно две строки сетки — третья и пятая сверху.
    expect(new Set(pieces.map(rowOf))).toEqual(new Set([3, 5]));
  });

  it('вид фигуры переведён в запись экрана, а цвет не потерян', () => {
    const position = positionFromFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4');
    const pieces = toScreenPieces(position);
    expect(pieces.length).toBe(pieceCount(position));
    // Прописные — и никаких строчных: экран ищет глиф по ключу 'N', а не 'n'.
    expect(pieces.every((p) => 'KQRBNP'.includes(p.type))).toBe(true);
    // Цвет не схлопнулся в одну сторону: в этой позиции сторон поровну, 16 на 16.
    expect(pieces.filter((p) => p.white).length).toBe(16);
    expect(pieces.filter((p) => !p.white).length).toBe(16);
    // Идентификаторы уникальны — по ним экран двигает фишки вслепую.
    expect(new Set(pieces.map((p) => p.id)).size).toBe(pieces.length);
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 * И ТЕПЕРЬ САМОЕ ГЛАВНОЕ: ЧТО ЭТИМ ПОЛЬЗУЕТСЯ ЭКРАН.
 *
 * 🔴 ВСЁ ВЫШЕ ПРОВЕРЯЕТ ЯДРО, А ОШИБКА ЖИВЁТ В ПРОВОДКЕ. Верни кто-нибудь в
 * `startGame` строку `generatePosition(p.pieces)` — и каждая проба выше останется
 * ЗЕЛЁНОЙ: `puzzlePosition` по-прежнему отдаёт позиции корпуса, просто её больше
 * никто не зовёт. Поэтому расстановка читается с ОТРИСОВАННОГО ДЕРЕВА живого
 * экрана: доска обходится по подписям клеток, из знаков собирается запись FEN и
 * ищется в корпусе. Проверять надо то место, где ошибка случается.
 * ────────────────────────────────────────────────────────────────────────────── */

declare function require(m: string): any;

const TestRenderer = require('react-test-renderer');

jest.setTimeout(120000);

/** Параметры маршрута: `wu=1` запускает партию сразу, `level` задаёт ступень. */
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => mockParams,
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

/** Каркас GameShell спрашивает безопасные поля — без метрик он падает на монтаже. */
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
/** ⚠️ Только внешние совпадения: TouchableOpacity отдаёт второй узел с теми же пропами. */
const OUTER = { deep: false };

/** Знак → буква FEN. Тот же набор, которым доска и рисует фигуры. */
const GLYPH_TO_FEN: Record<string, string> = {
  '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♙': 'P',
  '♚': 'k', '♛': 'q', '♜': 'r', '♝': 'b', '♞': 'n', '♟': 'p',
};

function textsIn(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string') { out.push(n); return; }
    if (typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) (n.children as any[]).forEach(walk);
  };
  walk(node);
  return out;
}

async function settle() {
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
}

async function mountPuzzle(level: number) {
  mockParams = { wu: '1', level: String(level) };
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/chess-blind').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  await settle();
  return r;
}

const SQUARE_LABEL = /^[a-h][1-8]$/;

/**
 * Расстановка так, как её ВИДИТ человек: поле → буква FEN.
 *
 * ⚠️ ЗНАК БЕРЁТСЯ ТОЛЬКО ИЗ ФИГУРНЫХ СИМВОЛОВ. В клетках левого столбца и нижней
 * строки экран рисует ещё и координаты («1», «a»), а сама фигура рисуется девятью
 * копиями знака (восемь — обводка, девятая — заливка). Отсюда и отбор по набору
 * знаков, и `Set`: иначе в расстановку попали бы подписи, а фигуры — по девять раз.
 */
function screenLayout(r: any): Map<string, string> {
  const out = new Map<string, string>();
  for (const cell of r.root.findAll(
    (n: any) => SQUARE_LABEL.test(String(n.props?.accessibilityLabel ?? '')),
    OUTER,
  )) {
    const glyphs = Array.from(new Set(textsIn(cell))).filter((s) => GLYPH_TO_FEN[s]);
    if (glyphs.length === 1) out.set(String(cell.props.accessibilityLabel), GLYPH_TO_FEN[glyphs[0]]);
    else if (glyphs.length > 1) out.set(String(cell.props.accessibilityLabel), '?');
  }
  return out;
}

/** Расстановочное поле FEN из прочитанного с экрана. Сравнивать — только посимвольно. */
function layoutToBoardFen(layout: Map<string, string>): string {
  const rows: string[] = [];
  for (let rank = BOARD_SIDE; rank >= 1; rank -= 1) {
    let row = '';
    let gap = 0;
    for (let file = 0; file < BOARD_SIDE; file += 1) {
      const letter = layout.get(`${'abcdefgh'[file]}${rank}`);
      if (!letter) { gap += 1; continue; }
      if (gap > 0) { row += String(gap); gap = 0; }
      row += letter;
    }
    if (gap > 0) row += String(gap);
    rows.push(row);
  }
  return rows.join('/');
}

describe('партия вслепую: корпусом пользуется САМ ЭКРАН', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 расстановка, нарисованная на доске, НАЙДЕНА В КОРПУСЕ — на всех ступенях', async () => {
    // Ступени взяты по одной из каждой полосы лесенки: 1 — четыре фигуры без
    // слепых ходов, 5 — двенадцать, 8 — квиз «что стоит», 13 — квиз «розыск».
    for (const level of [1, 5, 8, 13]) {
      const r = await mountPuzzle(level);
      const layout = screenLayout(r);

      // Сперва — что смотреть есть на что: доска нарисована целиком и фигуры на ней есть.
      expect(r.root.findAll(
        (n: any) => SQUARE_LABEL.test(String(n.props?.accessibilityLabel ?? '')),
        OUTER,
      )).toHaveLength(BOARD_SQUARES);
      expect(layout.size).toBeGreaterThan(0);
      expect([...layout.values()]).not.toContain('?');   // в клетке ровно одна фигура

      // Фигур на экране столько, сколько объявлено ступенью.
      const band = puzzlePiecesBand(puzzleLevelParams(level).pieces);
      expect(layout.size).toBeGreaterThanOrEqual(band.min);
      expect(layout.size).toBeLessThanOrEqual(band.max);

      // И главное: это ЖИВАЯ позиция из заготовленного корпуса, а не собранная сейчас.
      const drawn = layoutToBoardFen(layout);
      expect(CORPUS_BOARDS.has(drawn)).toBe(true);

      // Оба короля на месте — читаем с экрана, а не из данных экрана.
      const letters = [...layout.values()];
      expect(letters.filter((l) => l === 'K')).toHaveLength(1);
      expect(letters.filter((l) => l === 'k')).toHaveLength(1);

      await TestRenderer.act(async () => { r.unmount(); });
    }
  });
});
