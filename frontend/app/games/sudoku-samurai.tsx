/* psygames-game-sudoku-samurai · VER 4 · 20.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useGameKeyboard, digitKeys } from '@/src/hooks/useGameKeyboard';
import { sndPlace, sndWrong } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { saveResume, clearResume } from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import BoardBuilding, { runSteps, nextFrame, type BuildStatus } from '@/src/components/BoardBuilding';
import { TECHNIQUE_TIER, type Technique } from '@/src/services/sudoku-grade';
import { buildSolution, GRID_ORIGINS, isSolved as samuraiSolved } from '@/src/services/samurai';
import {
  emptyPencilMarks, normalizePencilMarks, pencilInput, routeDigitPress,
  visiblePencilDigits, countPencilMarks, type PencilMarks,
} from '@/src/services/pencilMarks';

const GRADIENT = ['#7f7fd5', '#86a8e7'];
/** Норма цели для пальца. Ниже неё в рабочем режиме клетка не опускается. */
const TOUCH_CELL = 48;
// Непрозрачная подсветка: смешать base (фон темы) с over (акцент) — как в sudoku.tsx,
// чтобы полупрозрачный цвет поверх «чёрного» gridArea не давал чёрных клеток в тёмной теме.
function blendHex(base: string, over: string, t: number): string {
  const b = base.replace('#', ''), o = over.replace('#', '');
  if (b.length !== 6 || o.length !== 6) return over;
  const ch = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(ch(b, i) * (1 - t) + ch(o, i) * t).toString(16).padStart(2, '0');
  return '#' + mix(0) + mix(2) + mix(4);
}

/** Размер клетки поля. Вынесено из компонента, чтобы гейт мог проверить цель для пальца. */
export function cellSizeFor(width: number, zoom: 'fit' | 'zoom'): number {
  const fitCell = Math.floor((Math.min(width, 600) - 36) / SIZE);
  return zoom === 'fit' ? Math.max(12, fitCell) : Math.max(TOUCH_CELL, fitCell * 2);
}

/**
 * Ниже этого размера клетки карандашные пометки не рисуются вовсе.
 *
 * ⚠️ ЭТО НЕ ВКУСОВЩИНА, А АРИФМЕТИКА. Девять цифр в клетке — это три ряда по три, то
 * есть цифра в треть клетки. На карте ('fit') клетка 16pt при ширине телефона 390:
 * цифра вышла бы 5pt — не мелкий текст, а грязь, которая ещё и закрасит саму клетку
 * и убьёт единственное, ради чего карта существует, — вид всей фигуры из пяти сеток.
 * Двадцать одна клетка в ряд крупнее не бывает по определению игры (см. cellSizeFor).
 */
export const PENCIL_MIN_CELL = 30;

/**
 * Что видно карандашом в клетке самурая: цифра гасит пометки, а мелкий масштаб —
 * прячет их целиком. Вынесено из компонента, чтобы правило проверялось вызовом на
 * НАСТОЯЩЕЙ геометрии (cellSizeFor), а не чтением разметки.
 */
export function samuraiVisibleMarks(mask: number, value: number, cellSize: number): number[] {
  return cellSize >= PENCIL_MIN_CELL ? visiblePencilDigits(mask, value) : [];
}

type Cell = number; // 0 = empty (та же типизация, что в sudoku.tsx)
// 'building' — доска СОБИРАЕТСЯ. Отдельная фаза, а не флажок поверх 'config':
// на верхних уровнях она длится секунды, и всё это время экран обязан говорить,
// что идёт работа (см. components/BoardBuilding).
type GamePhase = 'config' | 'building' | 'playing' | 'cleared' | 'result';

// СИСТЕМА УРОВНЕЙ. Ступень задаётся ТЕХНИКОЙ, которая нужна для решения, а не долей
// выколотых клеток. Замер 19.08.2026 старого пути (доля 0.42→0.62): на уровнях 1, 3, 5,
// 8 и 12 доска решалась ОДНИМИ голыми одиночками — двенадцать «ступеней» были одной и
// той же задачей разной длины. Вдобавок дедлайн генератора (3 с) обрубал выкалывание
// раньше заказа: заказывали 62% дырок, получали 30%, и на медленном телефоне вышло бы
// ещё меньше — сложность решали часы, а не уровень.
//
// Лестница техник — общая с обычной судоку (services/sudoku-grade, TECHNIQUE_TIER):
//   1 голые одиночки · 2 скрытые одиночки · 3 связанные кандидаты · 4 голые пары/тройки.
//
// Выше четвёртой не поднимаемся, и это ЗАМЕР, а не лень: 5-я (скрытые пары) на этой доске
// не становится НЕОБХОДИМОЙ ни разу за 10 прогонов с потолком 5 — связанные кандидаты на
// 131 зоне (у самурая их вдвое больше обычного, и часть общая для двух сеток) перекрывают
// почти всё, что дали бы скрытые пары. Ставить уровню полку, до которой доска не дотягивает,
// значит вернуть ту же фиктивную сложность, только этажом выше.
export const MAX_LEVEL = 12;

/**
 * Ступень уровня: `min` — ПОЛ («легче не выпускаем»), `max` — потолок («сложнее не
 * выдаём»). Пол здесь главный: без него генератор радостно отдаёт доску на голых
 * одиночках и на первом уровне, и на двенадцатом — ровно то, что и было.
 *
 * ⚠️ ПОЛ И ПОТОЛОК СОВПАДАЮТ НА ВСЕХ ДВЕНАДЦАТИ УРОВНЯХ, и это решение, а не совпадение.
 * Вилка (была [3..4] на верхних пяти) означает «как повезёт»: генератор целится в потолок,
 * отдаёт что вышло, и ступень уровня решает удача выкапывания, а не таблица. Два поля
 * остались потому, что спрашивают РАЗНОЕ: потолком копают (digByLogic — чем сложнее
 * разрешено, тем глубже яма), а по полу останавливаются (attemptEnough).
 */
export function levelBand(level: number): { min: number; max: number } {
  const L = Math.min(Math.max(1, level), MAX_LEVEL);
  if (L <= 2) return { min: 1, max: 1 };    // голые одиночки
  if (L <= 4) return { min: 2, max: 2 };    // без скрытых одиночек не обойтись
  if (L <= 7) return { min: 3, max: 3 };    // связанные кандидаты
  // 🔴 ПОЛ ВЕРХНЕЙ ПОЛОСЫ — 4, И ЭТО ЗАМЕР, А НЕ АМБИЦИЯ.
  //
  // Полоса была [3..4] — «связанные кандидаты, а где повезёт голые пары». Держалось это
  // на цене: старый замер 19.08.2026 говорил, что доска на голых парах выпадает 2 раза
  // из 5, а значит пол в четвёрку — это до пяти заходов и полминуты тишины на телефоне.
  //
  // Перемеряно 20.08.2026 (scripts/measure/samurai-floor.measure.ts), и цена оказалась
  // другой:
  //   · один смёт по 369 клеткам доходит до голых пар в 53% случаев (75 из 142), а не в 40%;
  //   · сам смёт стоит 0.5–2.3 с в ноде (медиана 1.0) и ~590 прогонов решателя — вдвое
  //     дешевле прежнего захода, потому что второй проход выкапывания снимал 0 клеток на
  //     8 досках из 8 и был чистой платой за доказательство очевидного (см. digByLogic);
  //   · заходов до пола уходит медиана 1, максимум 4 из 20 партий верхней полосы.
  // Партия целиком (нода, 10 партий на уровень): было — медиана 4.5 с, максимум 7.2 с при
  // поле «тройка»; стало — медиана 1.3–1.8 с, максимум 9.1 с при поле «голые пары».
  // Итог: пол в четвёрку стоит МЕНЬШЕ, чем прежняя полоса [3..4] со вторым проходом.
  //
  // ⚠️ Ступень выше четвёртой сюда не поставить: скрытые пары не становятся необходимыми
  // ни разу за 10 прогонов с потолком 5 (см. MAX_LEVEL), а доска, докопанная до упора на
  // ступени 3, заперта наглухо — потолок 4 не открывает на ней НИ ОДНОЙ клетки (10 из 10,
  // замер там же). Лестница техник на самурае кончается здесь.
  return { min: 4, max: 4 };                // голые пары/тройки — без них не взять
}

/**
 * Бюджеты ошибок и подсказок по уровням 1..12 — ТАБЛИЦЕЙ, а не формулой.
 *
 * 🔴 ПОЧЕМУ ТАБЛИЦЕЙ. Формулы (`10 - ⌊(L-1)/2⌋` и `4 - ⌊(L-1)/3⌋`) выглядели опрятно, но
 * ступали по разным уровням и в двух местах ступили ОДНОВРЕМЕННО: уровни 5 и 6 выходили
 * одинаковыми по всем параметрам до последнего, и точно так же 11 и 12. Последний уровень
 * игры был буквальной копией предпоследнего. В таблице такое видно глазом, а формула это
 * прятала.
 *
 * ⚠️ ЭТО РЕСУРСНАЯ ОСЬ, А НЕ СЛОЖНОСТЬ ДОСКИ. Она не заменяет ступень техники и не
 * притворяется ею — см. честный расклад в комментарии к levelBand и в levelParams ниже.
 */
const LEVEL_ERRORS = [10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 4];
const LEVEL_HINTS = [4, 4, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1];

/**
 * Доля пустых клеток по уровню. Это НЕ мера сложности (см. выше) — на ступенях 2+ она
 * выходит одна и та же (~75%) независимо от того, какая техника нужна. Число из этой же
 * функции показывается на экране («закрыто {p}% клеток»), поэтому гейт сверяет его с
 * реально выкопанным: старый экран обещал 62%, а отдавал 30%.
 *
 * Связывает она только ступень 1: там пол достигается сам собой, и доску можно оставить
 * подобрее, чтобы первый заход не превращался в час механического заполнения.
 *
 * ⚠️ ЧЕСТНО О ВЕРХНИХ ПЯТИ УРОВНЯХ. После подъёма пола до голых пар уровни 8–12 сравнялись
 * по доске: ступень у всех ровно 4 (выше на самурае нет — см. MAX_LEVEL), выкапывание идёт
 * до упора, и доля дырок у всех одна (73–76%, замер 20.08.2026). Значит различает их только
 * эта таблица — бюджет ошибок и подсказок.
 *
 * Ось ВНУТРИ четвёртой ступени мерили: сколько раз доска упирается в голую пару
 * (SamuraiGrade.hardUses). Она есть, но тонкая — на 52 досках ступени 4 упор был один у
 * 71%, два у 21%, три у 8%. Сделать её полом уровня нельзя по цене: доска с тремя упорами
 * — одна на 22 захода, то есть ~25 с генерации на телефоне против нынешних двух заходов.
 * Дешёвый путь для этой оси — не перебор на телефоне, а библиотека готовых заготовок,
 * отобранных заранее (так сделано у фрактальной судоку, SEED_PUZZLES).
 */
export function levelParams(level: number): { digRatio: number; maxErrors: number; hintMax: number } {
  const L = Math.min(Math.max(1, level), MAX_LEVEL);
  const digRatio = levelBand(L).max === 1 ? (L === 1 ? 0.42 : 0.48) : 0.75;
  return { digRatio, maxErrors: LEVEL_ERRORS[L - 1], hintMax: LEVEL_HINTS[L - 1] };
}

// САМУРАЙ: 5 перекрывающихся сеток 9×9 на поле 21×21. [r0,c0] = левый-верхний угол сетки.
// TL, TR, BL, BR + Center, центр перекрывает каждый угол одним блоком 3×3.
export const SIZE = 21;
// Раскладка берётся из services/samurai — ОДИН источник геометрии на экран и на его
// тесты. Раньше здесь стояла своя копия координат, и весь samurai.test.ts проверял
// код, которого в игре не исполнялось ни строчки (замер 19.08.2026).
export const GRIDS: ReadonlyArray<readonly [number, number]> = GRID_ORIGINS;

// Все сетки, которым принадлежит клетка (r,c). Клетка-«дырка» (вне всех сеток) → пустой массив.
export function gridsOf(r: number, c: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const g of GRIDS) { const [r0, c0] = g; if (r >= r0 && r < r0 + 9 && c >= c0 && c < c0 + 9) out.push(g); }
  return out;
}
/**
 * ОШИБОЧНА ЛИ КЛЕТКА — то, чем экран её красит.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНО. Жизнь снималась по одному правилу (цифра не совпала с решением),
 * а красное показывалось по другому (цифра дублируется внутри сетки). Правила разошлись,
 * и в зазор провалились 42–44 % неверных цифр: счётчик тикал, поле не менялось. Пока
 * правило живёт в двух местах, оно и будет расходиться — поэтому оно здесь одно, и
 * гейт зовёт ровно его.
 *
 * `duplicate` остаётся отдельно: он работает и без решения (например, в разборе доски),
 * и по нему видно ИМЕННО дубль, а не «где-то не то».
 */
export function samuraiCellWrong(
  grid: readonly Cell[][],
  solution: readonly Cell[][],
  r: number,
  c: number,
): { duplicate: boolean; wrongValue: boolean; error: boolean } {
  const v = grid[r]?.[c] ?? 0;
  if (v === 0) return { duplicate: false, wrongValue: false, error: false };
  let duplicate = false;
  for (const [r0, c0] of gridsOf(r, c)) {
    for (let cc = c0; cc < c0 + 9; cc++) if (cc !== c && grid[r]![cc] === v) duplicate = true;
    for (let rr = r0; rr < r0 + 9; rr++) if (rr !== r && grid[rr]![c] === v) duplicate = true;
    const br = r0 + Math.floor((r - r0) / 3) * 3, bc = c0 + Math.floor((c - c0) / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const rr = br + i, cc = bc + j;
      if ((rr !== r || cc !== c) && grid[rr]![cc] === v) duplicate = true;
    }
  }
  // ⚠️ Решение бывает ещё не загружено (первый кадр) — тогда судить не по чему.
  const known = solution[r]?.[c] !== undefined && solution[r]![c] !== 0;
  const wrongValue = known && solution[r]![c] !== v;
  return { duplicate, wrongValue, error: duplicate || wrongValue };
}

// Валидные клетки = часть хотя бы одной сетки. Клетки-дырки НЕ рендерятся и не выбираются.
export const CELLS: Array<[number, number]> = [];
for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (gridsOf(r, c).length) CELLS.push([r, c]);

// КЛЮЧЕВАЯ ИДЕЯ: клетки перекрытия — это ОДНА общая клетка в массиве 21×21, поэтому один solver
// автоматически согласует все 5 сеток. isValid проверяет правило судоку в КАЖДОЙ сетке клетки.
export function isValid(g: Cell[][], r: number, c: number, val: number): boolean {
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

// ОРАКУЛ ДЛЯ ГЕЙТА, не для игры. Пазл строится логическим решателем (gradeSamurai), и
// проверять его единственность тем же решателем — значит проверять код им же самим.
// Полный перебор — независимая вторая пара глаз: гейт сверяет, что решение ровно одно.
// Счёт решений до limit (обычно 2). MRV как solve; исчерпание бюджета = limit
// (консервативно «единственность не доказана»). Возвращает grid в исходное состояние.
export function countSolutions(g: Cell[][], limit = 2, budget: { steps: number } = { steps: 12000 }): number {
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
// digRatio валидных клеток. v1.112.0 — dig-with-uniqueness (тот же баг-класс, что в судоку v1.111.0):
// клетка выкалывается только если решение остаётся ЕДИНСТВЕННЫМ, иначе честный ход игрока
// мог помечаться «ошибкой» (сверка идёт с одним зашитым решением). Дедлайн держит UI живым.
// digRatio задаётся уровнем (см. levelParams) — чем выше уровень, тем больше выколотых клеток.

// ─────────────────────────────────────────────────────────────────────────────
// СЛОЖНОСТЬ = ТЕХНИКА РЕШЕНИЯ, А НЕ ЧИСЛО ДЫРОК
//
// ЗАЧЕМ. Раньше ступень уровня задавалась долей выколотых клеток (0.42 → 0.62).
// Замер 19.08.2026 показал, что это не ось сложности: уровни 1–9 решались ОДНИМИ
// голыми одиночками — то есть ступеней не было вовсе, менялась только длина рутины.
// Тот же баг-класс уже чинили в обычной судоку (services/sudoku-grade): настоящая
// ось — КАКУЮ технику приходится применить, чтобы продвинуться.
//
// Лестницу техник и её нумерацию берём оттуда же (TECHNIQUE_TIER), чтобы «третья
// ступень» значила одно и то же в обеих играх. Свой решатель нужен потому, что
// gradePuzzle жёстко привязан к прямоугольной сетке N×N, а у самурая зоны живут
// на поле 21×21 и часть блоков ОБЩИЕ для двух сеток.
// ─────────────────────────────────────────────────────────────────────────────

/** Плоский индекс клетки поля 21×21. */
const IDX = (r: number, c: number) => r * SIZE + c;

/**
 * Зоны: 90 линий (по 9 строк и 9 столбцов на каждую из пяти сеток) + 41 блок 3×3.
 * Блоков не 45, а 41: угловой блок каждой угловой сетки — ФИЗИЧЕСКИ ТОТ ЖЕ блок
 * центральной. Дубликат зоны не сломал бы решение, но раздул бы все сканы на 10%,
 * поэтому склеиваем по составу клеток, а не по номеру сетки.
 */
export const UNITS: number[][] = (() => {
  const out: number[][] = [];
  const seen = new Set<string>();
  const add = (cells: number[]) => {
    const k = [...cells].sort((a, b) => a - b).join(',');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(cells);
  };
  for (const [r0, c0] of GRIDS) {
    for (let i = 0; i < 9; i++) add(Array.from({ length: 9 }, (_, j) => IDX(r0 + i, c0 + j)));
    for (let j = 0; j < 9; j++) add(Array.from({ length: 9 }, (_, i) => IDX(r0 + i, c0 + j)));
    for (let br = 0; br < 9; br += 3) for (let bc = 0; bc < 9; bc += 3) {
      const cells: number[] = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push(IDX(r0 + br + i, c0 + bc + j));
      add(cells);
    }
  }
  return out;
})();

/** Для каждой клетки — номера её зон. */
const UNITS_OF: number[][] = (() => {
  const out: number[][] = Array.from({ length: SIZE * SIZE }, () => [] as number[]);
  UNITS.forEach((cells, ui) => { for (const i of cells) out[i].push(ui); });
  return out;
})();

/**
 * Соседи клетки — все, кто делит с ней хоть одну зону. У клетки перекрытия соседей
 * вдвое больше: она стоит сразу в двух сетках, и это ровно та связность, ради
 * которой самурай и существует.
 */
const PEERS: Int32Array[] = (() => {
  const out: Int32Array[] = new Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const s = new Set<number>();
    for (const ui of UNITS_OF[i]) for (const j of UNITS[ui]) if (j !== i) s.add(j);
    out[i] = Int32Array.from(s);
  }
  return out;
})();

const CELL_IDX: Int32Array = Int32Array.from(CELLS.map(([r, c]) => IDX(r, c)));

/**
 * Пары зон, которые делят ≥2 клеток, вместе с готовыми масками. «Связанные кандидаты» —
 * это ровно вывод по такой паре: цифра заперта в пересечении → в остальной части второй
 * зоны её нет. Считаем таблицу один раз при загрузке модуля: искать общие зоны на лету
 * (`UNITS_OF[...].includes`) стоило больше, чем вся остальная логика вместе взятая.
 *
 * `inside` — 9-битная маска позиций пересечения ВНУТРИ первой зоны, `outside` — клетки
 * второй зоны за пределами пересечения, из которых и вычёркивается цифра.
 */
const SHARED: { u2: number; inside: number; outside: Int32Array }[][] = (() => {
  const out: { u2: number; inside: number; outside: Int32Array }[][] = UNITS.map(() => []);
  for (let a = 0; a < UNITS.length; a++) {
    const setA = new Set(UNITS[a]);
    for (let b = 0; b < UNITS.length; b++) {
      if (a === b) continue;
      const common = UNITS[b].filter((i) => setA.has(i));
      if (common.length < 2) continue;
      let inside = 0;
      for (let k = 0; k < 9; k++) if (common.includes(UNITS[a][k])) inside |= 1 << k;
      out[a].push({ u2: b, inside, outside: Int32Array.from(UNITS[b].filter((i) => !common.includes(i))) });
    }
  }
  return out;
})();

const bitOf = (v: number) => 1 << (v - 1);
// Таблица числа битов на все 512 масок кандидатов. Считать popcount циклом было
// дороже самой логики: голые пары гоняют его сотнями тысяч раз на одну оценку доски.
const POPCNT: Uint8Array = (() => { const t = new Uint8Array(512); for (let i = 1; i < 512; i++) t[i] = t[i >> 1] + (i & 1); return t; })();
const popcnt = (m: number) => POPCNT[m];
const oneVal = (m: number) => 32 - Math.clz32(m);   // значение старшего бита (для маски из одного бита — он же единственный)

export interface SamuraiGrade {
  solved: boolean;
  /** Ступень самой сложной ПОНАДОБИВШЕЙСЯ техники (см. TECHNIQUE_TIER). 9 = логики не хватило. */
  tier: number;
  hardest: Technique;
  /**
   * Сколько РАЗ по ходу решения пришлось звать самую сложную технику.
   *
   * ЗАЧЕМ СЧИТАТЬ. Лестница техник у самурая кончается на четвёртой ступени (см.
   * MAX_LEVEL), и это единственная измеренная ось ВНУТРИ ступени: доска, где голая пара
   * нужна один раз, и доска, где на неё упираешься трижды, — разные задачи при одной
   * ступени. По этому числу и проверено, что развести им верхние пять уровней НЕ выйдет
   * (levelParams): у 71% досок упор ровно один.
   *
   * Считаем ЗАХОДЫ, а не вычеркнутых кандидатов: техника зовётся, только когда всё, что
   * проще, встало (см. лестницу ниже), — то есть это ровно число тупиков, из которых без
   * неё не выйти.
   */
  hardUses: number;
}

/**
 * Оценка доски: решается ли она логикой и какая техника при этом самая сложная.
 *
 * `tierCap` отсекает лестницу сверху — так можно спросить «а БЕЗ скрытых одиночек
 * это берётся?». На этом стоит ПОЛ сложности уровня: если доска решается техниками
 * ниже целевой ступени, значит ступень фиктивная.
 *
 * ⚠️ Кандидаты пересчитываются ИНКРЕМЕНТАЛЬНО (поставили цифру → вычеркнули у соседей),
 * а не полным refilter'ом, как в судоку 9×9. На 369 клетках полный пересчёт после
 * каждого шага стоил бы ~37 млн операций на одну оценку, а оценка вызывается на каждое
 * выкалывание — генерация уползала бы в минуты.
 */
export function gradeSamurai(puzzle: Cell[][], tierCap = 9): SamuraiGrade {
  const FULL = 0x1ff;
  const val = new Int32Array(SIZE * SIZE);
  const cand = new Int32Array(SIZE * SIZE);
  let left = 0;
  for (const [r, c] of CELLS) {
    const i = IDX(r, c);
    val[i] = puzzle[r][c];
    if (val[i]) cand[i] = 0; else { cand[i] = FULL; left++; }
  }
  for (const i of CELL_IDX) {
    const v = val[i];
    if (!v) continue;
    const b = bitOf(v);
    for (const p of PEERS[i]) cand[p] &= ~b;
  }
  const fail = (): SamuraiGrade => ({ solved: false, tier: TECHNIQUE_TIER.guess, hardest: 'guess', hardUses: 0 });
  for (const i of CELL_IDX) if (!val[i] && cand[i] === 0) return fail();

  let maxTier = 0;
  let hardest: Technique = 'naked_single';
  // Заходов каждой ступени — по ним считается hardUses (см. SamuraiGrade).
  const uses = new Int32Array(TECHNIQUE_TIER.guess + 1);
  const bump = (t: Technique) => {
    const tr = TECHNIQUE_TIER[t];
    uses[tr]++;
    if (tr > maxTier) { maxTier = tr; hardest = t; }
  };

  let broken = false;
  const place = (i: number, v: number) => {
    val[i] = v; cand[i] = 0; left--;
    const b = bitOf(v);
    for (const p of PEERS[i]) {
      if (cand[p] & b) { cand[p] &= ~b; if (cand[p] === 0 && !val[p]) broken = true; }
    }
  };

  const nakedSingles = (): boolean => {
    let hit = false;
    for (const i of CELL_IDX) {
      if (val[i]) continue;
      const m = cand[i];
      if (m !== 0 && (m & (m - 1)) === 0) { place(i, oneVal(m)); hit = true; if (broken) return true; }
    }
    if (hit) bump('naked_single');
    return hit;
  };

  const posScratch = new Int32Array(10);
  const hiddenSingles = (): boolean => {
    let hit = false;
    for (const cells of UNITS) {
      posScratch.fill(0);
      let placed = 0;
      for (let k = 0; k < 9; k++) {
        const i = cells[k];
        if (val[i]) { placed |= bitOf(val[i]); continue; }
        let m = cand[i];
        while (m) { const b = m & -m; posScratch[oneVal(b)] |= 1 << k; m ^= b; }
      }
      for (let v = 1; v <= 9; v++) {
        if (placed & bitOf(v)) continue;
        const p = posScratch[v];
        if (p === 0) { broken = true; return true; }         // цифре в зоне негде стоять — доска противоречива
        if ((p & (p - 1)) !== 0) continue;
        const i = cells[31 - Math.clz32(p)];
        place(i, v); hit = true;
        if (broken) return true;
        break;   // остальные маски этой зоны устарели — доберём на следующем проходе
      }
    }
    if (hit) bump('hidden_single');
    return hit;
  };

  /**
   * Позиции каждой цифры внутри зоны, 9-битной маской (бит k = k-я клетка зоны).
   * Одна общая заготовка на весь вызов: аллокация массива на каждую из 131 зоны в
   * каждом скане съедала больше, чем сама логика.
   */
  const placedScratch = { mask: 0 };
  const fillPos = (cells: number[]) => {
    posScratch.fill(0);
    let placed = 0;
    for (let k = 0; k < 9; k++) {
      const i = cells[k];
      if (val[i]) { placed |= bitOf(val[i]); continue; }
      let m = cand[i];
      while (m) { const b = m & -m; posScratch[oneVal(b)] |= 1 << k; m ^= b; }
    }
    placedScratch.mask = placed;
  };

  // Связанные кандидаты: цифра заперта в пересечении двух зон → в остальной части
  // второй зоны её быть не может. У самурая это работает и МЕЖДУ сетками — общий
  // блок принадлежит двум сеткам сразу, и вывод переносится через него.
  //
  // Вычёркиваем ВСЁ, что нашли за один скан, а не по одному выводу за проход: скан по
  // 131 зоне стоит дорого, и перезапускать лестницу техник ради каждого вычеркнутого
  // кандидата означало гонять его сотни раз (замер: потолок 4 — 15 с на доску).
  const locked = (): boolean => {
    let hitAny = false;
    for (let ui = 0; ui < UNITS.length; ui++) {
      const cells = UNITS[ui];
      fillPos(cells);
      const shared = SHARED[ui];
      for (let v = 1; v <= 9; v++) {
        if (placedScratch.mask & bitOf(v)) continue;
        const p = posScratch[v];
        const n = POPCNT[p];
        if (n < 2 || n > 3) continue;
        const b = bitOf(v);
        for (let k = 0; k < shared.length; k++) {
          const sh = shared[k];
          if (p & ~sh.inside) continue;   // не все позиции цифры лежат в пересечении
          for (const j of sh.outside) {
            if (val[j]) continue;
            if (cand[j] & b) {
              cand[j] &= ~b; hitAny = true;
              if (cand[j] === 0) { broken = true; return true; }
            }
          }
        }
      }
    }
    if (hitAny) bump('locked');
    return hitAny;
  };

  // Голая пара/тройка: k клеток зоны делят ровно k кандидатов → у остальных их нет.
  const openBuf = new Int32Array(9);
  const openMask = new Int32Array(9);
  const nakedSubset = (): boolean => {
    let hitAny = false;
    for (const cells of UNITS) {
      let m = 0;
      for (const i of cells) if (!val[i]) { openBuf[m] = i; openMask[m] = cand[i]; m++; }
      if (m < 3) continue;
      for (let a = 0; a < m; a++) {
        const ca = openMask[a];
        const na = POPCNT[ca];
        if (na < 2 || na > 3) continue;
        for (let b = a + 1; b < m; b++) {
          const cb = openMask[b];
          const nb = POPCNT[cb];
          if (nb < 2 || nb > 3) continue;
          const m2 = ca | cb;
          const n2 = POPCNT[m2];
          if (n2 === 2) {
            for (let x = 0; x < m; x++) {
              if (x === a || x === b) continue;
              const i = openBuf[x];
              if (cand[i] & m2) { cand[i] &= ~m2; openMask[x] = cand[i]; hitAny = true; if (cand[i] === 0) { broken = true; return true; } }
            }
            continue;
          }
          if (n2 > 3) continue;
          for (let c2 = b + 1; c2 < m; c2++) {
            const cc = openMask[c2];
            const nc = POPCNT[cc];
            if (nc < 2 || nc > 3) continue;
            const m3 = m2 | cc;
            if (POPCNT[m3] !== 3) continue;
            for (let x = 0; x < m; x++) {
              if (x === a || x === b || x === c2) continue;
              const i = openBuf[x];
              if (cand[i] & m3) { cand[i] &= ~m3; openMask[x] = cand[i]; hitAny = true; if (cand[i] === 0) { broken = true; return true; } }
            }
          }
        }
      }
    }
    if (hitAny) bump('naked_subset');
    return hitAny;
  };

  // Скрытая пара: две цифры зоны помещаются только в одни и те же две клетки →
  // в этих клетках больше ничего быть не может.
  const hiddenSubset = (): boolean => {
    let hitAny = false;
    for (const cells of UNITS) {
      fillPos(cells);
      for (let a = 1; a <= 8; a++) {
        if (placedScratch.mask & bitOf(a)) continue;
        const pa = posScratch[a];
        if (popcnt(pa) !== 2) continue;
        for (let b = a + 1; b <= 9; b++) {
          if (placedScratch.mask & bitOf(b)) continue;
          if (posScratch[b] !== pa) continue;
          const keep = bitOf(a) | bitOf(b);
          for (let k = 0; k < 9; k++) {
            if (!(pa & (1 << k))) continue;
            const i = cells[k];
            if (cand[i] & ~keep) { cand[i] &= keep; hitAny = true; }
          }
        }
      }
    }
    if (hitAny) bump('hidden_subset');
    return hitAny;
  };

  const ladder: [Technique, () => boolean][] = [
    ['naked_single', nakedSingles],
    ['hidden_single', hiddenSingles],
    ['locked', locked],
    ['naked_subset', nakedSubset],
    ['hidden_subset', hiddenSubset],
  ];
  const steps = ladder.filter(([t]) => TECHNIQUE_TIER[t] <= tierCap).map(([, f]) => f);

  // Потолок проходов — страховка от вечного цикла, а НЕ бюджет по времени: от часов
  // сложность зависеть не должна (см. комментарий у generateSamuraiLevel).
  for (let guard = 0; guard < CELLS.length * 10; guard++) {
    if (broken) return fail();
    if (left === 0) return { solved: true, tier: Math.max(1, maxTier), hardest, hardUses: uses[maxTier] };
    if (!steps.some((f) => f())) break;
  }
  if (!broken && left === 0) return { solved: true, tier: Math.max(1, maxTier), hardest, hardUses: uses[maxTier] };
  return fail();
}



/** Полное решение на поле 21×21 из пяти сеток services/samurai (центр → углы). */
export function buildSolutionCanvas(): Cell[][] {
  const grids = buildSolution();
  if (!samuraiSolved(grids)) throw new Error('samurai: собранное решение не проходит проверку');
  const out: Cell[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let g = 0; g < GRIDS.length; g++) {
    const [r0, c0] = GRIDS[g];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) out[r0 + r][c0 + c] = grids[g][r][c];
  }
  return out;
}

/** Маска цифр, которые ещё можно поставить в клетку по правилам всех её сеток. */
export function candidateMask(puzzle: Cell[][], r: number, c: number): number {
  let m = 0x1ff;
  for (const p of PEERS[IDX(r, c)]) {
    const v = puzzle[Math.floor(p / SIZE)][p % SIZE];
    if (v) m &= ~bitOf(v);
  }
  return m;
}

/**
 * Число решений, но не больше limit. НЕЗАВИСИМЫЙ ПЕРЕБОР — вторая пара глаз для гейта:
 * пазл строится логическим решателем (`gradeSamurai`), и проверять его единственность
 * тем же решателем значит проверять код им же самим.
 *
 * Устройство — как у быстрого перебора фрактальной судоку (services/fractal-sudoku,
 * `countSolutionsFast`): битовые маски занятых цифр + выбор клетки с наименьшим числом
 * кандидатов. Его собственный код переиспользовать нельзя — там маски прибиты к строке,
 * столбцу и блоку ОДНОЙ сетки 9×9, а у самурая 131 зона на поле 21×21, и часть блоков
 * общая для двух сеток. Переносится приём, не функция.
 *
 * Возвращает -1, если бюджет узлов исчерпан: гейт скажет «не доказано», а не повиснет.
 */
export function countSolutionsFast(puzzle: Cell[][], limit = 2, maxNodes = 300000): number {
  const used = new Int32Array(UNITS.length);   // какие цифры уже стоят в каждой зоне
  const grid = new Int32Array(SIZE * SIZE);
  const put = (i: number, b: number) => { grid[i] = oneVal(b); for (const u of UNITS_OF[i]) used[u] |= b; };
  const pull = (i: number) => { const b = bitOf(grid[i]); grid[i] = 0; for (const u of UNITS_OF[i]) used[u] ^= b; };
  const candOf = (i: number) => { let m = 0x1ff; for (const u of UNITS_OF[i]) m &= ~used[u]; return m; };

  for (const i of CELL_IDX) {
    const v = puzzle[(i / SIZE) | 0][i % SIZE];
    if (!v) continue;
    const b = bitOf(v);
    for (const u of UNITS_OF[i]) { if (used[u] & b) return 0; used[u] |= b; }
    grid[i] = v;
  }

  let count = 0, nodes = 0, blown = false;
  const pos = new Int32Array(10);

  const walk = (): boolean => {
    if (++nodes > maxNodes) { blown = true; return true; }
    const trail: number[] = [];
    const rollback = () => { for (let k = trail.length - 1; k >= 0; k--) pull(trail[k]); };

    // ⚠️ ПРОПАГАЦИЯ ПЕРЕД ВЕТВЛЕНИЕМ. Без неё перебор на доске в 75% дырок не заканчивается
    // в разумное время: замер 19.08.2026 — гейт на пяти досках шёл 29 МИНУТ. Голые и скрытые
    // одиночки — выводы БЕЗОШИБОЧНЫЕ (решение потерять нельзя), поэтому применять их внутри
    // счётчика честно: независимость от `gradeSamurai` сохраняется, там своя реализация.
    for (;;) {
      let changed = false;
      for (const i of CELL_IDX) {
        if (grid[i]) continue;
        const m = candOf(i);
        if (m === 0) { rollback(); return false; }
        if ((m & (m - 1)) === 0) { put(i, m); trail.push(i); changed = true; }
      }
      if (changed) continue;
      for (const cells of UNITS) {
        pos.fill(0);
        let placed = 0;
        for (let k = 0; k < 9; k++) {
          const i = cells[k];
          if (grid[i]) { placed |= bitOf(grid[i]); continue; }
          let m = candOf(i);
          while (m) { const b = m & -m; pos[oneVal(b)] |= 1 << k; m ^= b; }
        }
        for (let v = 1; v <= 9; v++) {
          if (placed & bitOf(v)) continue;
          const p = pos[v];
          if (p === 0) { rollback(); return false; }   // цифре в зоне негде стоять
          if ((p & (p - 1)) !== 0) continue;
          const i = cells[31 - Math.clz32(p)];
          put(i, bitOf(v)); trail.push(i); changed = true;
          break;   // остальные маски этой зоны устарели
        }
      }
      if (!changed) break;
    }

    let bi = -1, bm = 0, bn = 10;
    for (const i of CELL_IDX) {
      if (grid[i]) continue;
      const m = candOf(i);
      const n = POPCNT[m];
      if (n < bn) { bn = n; bi = i; bm = m; }
    }
    if (bi < 0) { count++; rollback(); return count >= limit; }
    let m = bm;
    while (m) {
      const t = m & -m; m ^= t;
      put(bi, t);
      const stop = walk();
      pull(bi);
      if (stop) { rollback(); return true; }
    }
    rollback();
    return false;
  };
  walk();
  return blown ? -1 : count;   // -1 = бюджет узлов исчерпан, вердикта нет
}

/** Самая ЛЁГКАЯ техника, которой доска ещё берётся. Это и есть честная ступень уровня. */
export function minTierOf(puzzle: Cell[][], cap = 5): number {
  for (let t = 1; t <= cap; t++) if (gradeSamurai(puzzle, t).solved) return t;
  return TECHNIQUE_TIER.guess;
}

/**
 * Состояние выкапывания: доска, очередь клеток этого захода и где мы в ней стоим.
 * Торчит наружу, чтобы заход можно было проходить ЧАСТЯМИ — и отдавать между ними
 * кадр экрану (см. samuraiBuilder).
 */
export interface DigState {
  puzzle: Cell[][];
  /** Порядок обхода клеток. Мешается ОДИН раз на заход: срез продолжает ту же очередь. */
  queue: Array<[number, number]>;
  /** Сколько клеток очереди уже просмотрено. */
  at: number;
  blanks: number;
  tier: number;
  /** Очередь кончилась (или набран потолок дырок) — заход исчерпан, дальше он бесполезен. */
  done: boolean;
  /**
   * Прогонов решателя (вызовов gradeSamurai) всего. Единица цены, не зависящая от железа:
   * секунды меряют телефон, а прогоны — саму работу.
   *
   * ⚠️ Одна клетка — НЕ один прогон. Лестница `minTierOf` поднимается снизу, поэтому
   * лёгкое снятие стоит один прогон, а отказ — все `tierMax`: в этом и причина, почему
   * срез меряется прогонами, а не клетками (см. ниже).
   */
  solverRuns: number;
  /**
   * Клеток, ради которых решатель звался ХОТЯ БЫ РАЗ. По ним видно, жив ли быстрый путь:
   * даровые снятия решатель не зовут вовсе, и таких снятий большинство.
   */
  solverCells: number;
}

/**
 * Выкалывание ОТ ЛОГИКИ. Клетка убирается, только если доска остаётся решаемой
 * техниками не выше `tierMax`. Отсюда сразу три вещи:
 *   • ступень уровня настоящая — потолок техник задаёт уровень, а не число дырок;
 *   • решение единственно по построению — каждый шаг логики вынужден, второму
 *     решению взяться неоткуда (дорогой countSolutions на этом пути не нужен);
 *   • угадайки нет: доска, которую логика не берёт, просто не выпускается.
 *
 * ⚠️ НИКАКИХ ЧАСОВ. Старый генератор обрывал выкалывание по `gameNow() + 3000`, и это
 * делало сложность лотереей: заказ 62% дырок, факт 30% на ноутбуке и ещё меньше на
 * медленном телефоне. Здесь работа считается КЛЕТКАМИ — сколько бы телефон ни думал,
 * доска выйдет одна и та же.
 *
 * Проверка идёт ЛЕСТНИЦЕЙ СНИЗУ (`minTierOf`), а не сразу полным набором техник.
 * Две причины. Скорость: почти всякое удачное снятие берётся голыми одиночками, и
 * дорогие пары/тройки для него вообще не запускаются (замер: потолок 4 — 15 с →
 * 3 с на доску). И честность: попутно мы БЕСПЛАТНО узнаём, какая техника реально
 * понадобилась после этого снятия, — а это и есть ступень уровня.
 *
 * ⚠️ Пробовали копать «лестницей потолков» (исчерпать потолок 3, потом открыть 4).
 * Ступень при этом ДОКАЗЫВАЛАСЬ бы, но лестница мертва: замер 20.08.2026, 10 досок —
 * после исчерпания потолка 3 потолок 4 не открыл НИ ОДНОЙ клетки, 0 досок из 10 дошли
 * до голых пар. Доска, докопанная до упора на ступени k, заперта: следующая ступень
 * снимает не «ещё немного», а ничего.
 *
 * 🔴 ОДИН СМЁТ ПО КЛЕТКАМ — ЭТО УЖЕ ДО УПОРА, второй проход не нужен. Отказ здесь
 * ОКОНЧАТЕЛЕН: убрать клетку не дали, потому что доска перестала браться техниками
 * ≤ tierMax, а дальше клеток на доске только меньше — с меньшим числом подсказок
 * логике не станет легче. Значит клетка, отвергнутая в начале смёта, отвергается и в
 * конце. Замер 20.08.2026: второй проход снял 0 клеток на 8 досках из 8, а стоил
 * 1.1–3.5 с — ровно столько же, сколько первый, потому что он ЦЕЛИКОМ состоит из
 * дорогих отказов. Это была половина всего времени сборки, потраченная на доказательство
 * того, что и так верно.
 *
 * ⚠️ СМЁТ МОЖНО ДЕЛАТЬ ЧАСТЯМИ. `from` продолжает начатую очередь, `runBudget` говорит,
 * сколько ПРОГОНОВ РЕШАТЕЛЯ разрешено сделать за вызов. Это не ради красоты: замер
 * 20.08.2026 в браузере (уровень 12, тротлинг ×6 = средний телефон) — целый смёт держит
 * поток секундами, и экран всё это время не может даже сменить строку. Срез даёт точку,
 * где поток отпускается.
 *
 * 🔴 СРЕЗ МЕРЯЕТСЯ РАБОТОЙ, А НЕ КЛЕТКАМИ, и это тоже замер. Клетки стоят РАЗНО: в начале
 * очереди почти каждая снимается даром (быстрый путь), в конце почти каждая упирается в
 * полный решатель. Резали по клеткам — три равные трети очереди дали срезы 70 / 290 /
 * 1650 мс (тот же замер в браузере): последний срез держал поток дольше, чем вся остальная
 * сборка, и счётчик шагов замирал именно там, где ждать дольше всего. Прогон решателя —
 * единица одинаковая, и срезы по ней выходят ровными.
 */
export function digByLogic(
  solution: Cell[][], tierMax: number, blankCap: number, runBudget = Infinity,
  from?: DigState,
): DigState {
  const puzzle = from ? from.puzzle : solution.map((row) => [...row]);
  const queue = from ? from.queue : shuffle(CELLS);
  let blanks = from ? from.blanks : 0;
  let tier = from ? from.tier : 1;
  let solverRuns = from ? from.solverRuns : 0;
  let solverCells = from ? from.solverCells : 0;
  let at = from ? from.at : 0;
  let spent = 0;
  while (at < queue.length && blanks < blankCap && spent < runBudget) {
    const [r, c] = queue[at++];
    const keep = puzzle[r][c];
    if (keep === 0) continue;   // клетка уже снята (очередь прогнали второй раз)
    puzzle[r][c] = 0;
    // БЫСТРЫЙ ПУТЬ. Если у клетки после снятия остался ЕДИНСТВЕННЫЙ кандидат, доска
    // берётся ровно тем же набором техник, что и до снятия: голая одиночка сразу
    // возвращает цифру на место. Полный решатель тут не нужен, а таких снятий —
    // подавляющее большинство, особенно в начале. Замер: потолок 4 — 4.3 с → 1.4 с;
    // замер 20.08.2026 — даром снимается 180 клеток из 274 за 5 мс на всю доску.
    if (POPCNT[candidateMask(puzzle, r, c)] === 1) { blanks++; continue; }
    const t = minTierOf(puzzle, tierMax);
    // Прогонов было столько, на какой ступени лестница остановилась: дошла до t — значит
    // t прогонов, не дошла вовсе — значит все tierMax. Считаем именно ПРОГОНЫ, а не
    // клетки: одна клетка стоит от одного прогона (лёгкая, берётся одиночками) до
    // четырёх (отказ — лестница прошла все ступени и ни одна не взяла).
    const runs = t <= tierMax ? t : tierMax;
    solverRuns += runs; spent += runs; solverCells++;
    if (t <= tierMax) { blanks++; if (t > tier) tier = t; }
    else puzzle[r][c] = keep;
  }
  return { puzzle, queue, at, blanks, tier, solverRuns, solverCells, done: at >= queue.length || blanks >= blankCap };
}

export interface SamuraiLevel {
  puzzle: Cell[][];
  solution: Cell[][];
  /** Минимальная достаточная техника — то, чем доска реально берётся. */
  tier: number;
  blanks: number;
}

/**
 * Сколько ЗАХОДОВ генератор может сделать на одну партию и на сколько СРЕЗОВ режется
 * заход. Заход = новое решение + один смёт по всем 369 клеткам (он же и до упора,
 * см. digByLogic). Срез — только точка, где отпускается поток; сложность он не меняет.
 *
 * Числа ФИКСИРОВАННЫЕ, а не «сколько успеем за N миллисекунд»: бюджет по времени вернул
 * бы ту самую зависимость от железа, ради ухода от которой всё и затевалось. Наружу они
 * торчат потому, что экран показывает человеку номер идущего шага — а показывать можно
 * только настоящее число из цикла, не выдуманное.
 *
 * ПОЧЕМУ ЗАХОДОВ ДВЕНАДЦАТЬ. Ступень захода — ЛОТЕРЕЯ: замер 20.08.2026, 142 смёта на
 * потолке 4 — голые пары понадобились 75 раз (53%; по партиям замера разброс 43–71%),
 * остальные доски вышли легче. Пол уровня достаётся только перебором заходов, и вопрос
 * лишь в том, сколько билетов купить. При осторожных 50% удачи двенадцать заходов
 * оставляют промах мимо пола 0.5¹² ≈ 0.02% — раз на пять тысяч партий. Меньше заходов —
 * промахи становятся заметными (восемь дают уже 0.4%), больше — растёт только потолок,
 * которого никто не увидит: в среднем уходит 2 захода.
 *
 * ⚠️ Потолок в 12 заходов НЕ означает 12 заходов на партию. Он означает, что в редчайшем
 * случае человек ждёт дольше — и всё это время видит индикатор (components/BoardBuilding).
 */
export const BUILD_ATTEMPTS = 12;
export const DIG_SLICES = 3;

/**
 * Сколько прогонов решателя отдаётся одному срезу. Смёт стоит 550–670 прогонов (замер
 * 20.08.2026, 40 смётов, медиана 591) — на три среза это ~197.
 *
 * 🔴 ПОСЛЕДНИЙ СРЕЗ ЗАХОДА БЕРЁТ ОСТАТОК ЦЕЛИКОМ, каким бы он ни был. Иначе доска с
 * дорогой раскладкой потребовала бы четвёртого среза, заход вылез бы за потолок шагов,
 * и runSteps оборвал бы сборку на НЕДОКОПАННОЙ доске — то есть выдал бы партию не той
 * сложности. Ровность срезов — удобство, потолок шагов — обязательство.
 *
 * ⚠️ Поэтому бюджет взят ЧУТЬ МЕНЬШЕ трети (190, а не 197): остаток обязан доставаться
 * последнему срезу на КАЖДОЙ доске, а не только на редкой дорогой. Правило, которое
 * срабатывает раз в десять партий, не проверишь гейтом — и оно тихо сломается.
 */
const RUNS_PER_SLICE = 190;

/** Какой из заходов оставить: тот, что потребовал более сложной техники. */
export function betterAttempt(a: SamuraiLevel | null, b: SamuraiLevel): SamuraiLevel {
  return !a || b.tier > a.tier ? b : a;
}

/**
 * Хватит ли этой доски для уровня.
 *
 * 🔴 СВЕРЯЕМСЯ С ПОЛОМ, А НЕ С ПОТОЛКОМ, и в этом вся разница. Пока здесь стоял потолок,
 * пол не проверял НИКТО: генератор отдавал первую же доску, дотянувшую до `max`, а не
 * дотянувшую — тоже отдавал, просто после того, как кончались заходы. Полоса [3..4]
 * означала на деле «как повезёт», и пять верхних уровней отличались надписью.
 */
export function attemptEnough(level: number, best: SamuraiLevel): boolean {
  return best.tier >= levelBand(level).min;
}

/** Отчёт одного шага сборки: лучшее на сейчас, «дальше не надо» и во что это обошлось. */
export interface BuildTick {
  best: SamuraiLevel;
  done: boolean;
  /** Номер идущего захода, с единицы. */
  attempt: number;
  /** Прогонов полного решателя с начала сборки — цена в работе, а не в секундах. */
  solverRuns: number;
}

/**
 * СБОРКА ПАРТИИ ШАГАМИ.
 *
 * Шаг = ОДИН СРЕЗ смёта. Заход (новое решение + смёт по всем клеткам) состоит из
 * DIG_SLICES срезов, заходов может быть до BUILD_ATTEMPTS — отсюда потолок `steps`.
 *
 * 🔴 ЗАЧЕМ ТАКОЕ ДРОБЛЕНИЕ. Замер 20.08.2026 в браузере на уровне 12 (тротлинг ×6 —
 * примерно средний телефон): заход держит поток секундами. Пока шагом был заход, экран
 * всё это время держал одну и ту же строку: отдать кадр было негде, и сказать «уровень
 * сложный, это надолго» — тоже негде. По срезам поток отпускается втрое чаще.
 *
 * ⚠️ Порядок работы тот же, что у сплошного `digByLogic(solution, max, cap)`: та же
 * очередь клеток, тот же смёт. Дробление НЕ меняет сложность — оно меняет только то,
 * где поток отпускается.
 *
 * ⚠️ «Шаг 2 из 36» — это НЕ 6% работы. Это «на втором из тридцати шести возможных»:
 * сборка кончается на любом шаге, как только доска дотянула до пола уровня, а в среднем
 * на это уходит два захода из двенадцати. Ровно поэтому шкалы процентов на экране нет —
 * считать проценты не из чего.
 */
export function samuraiBuilder(level: number): { steps: number; step: () => BuildTick } {
  const { max } = levelBand(level);
  // Потолок дырок связывает только ступень 1: выше пол требует копать до упора, и доля
  // пустых клеток там выходит одна и та же (~75%) независимо от того, какая техника нужна.
  const blankCap = max === 1 ? Math.round(CELLS.length * levelParams(level).digRatio) : CELLS.length;
  let best: SamuraiLevel | null = null;
  let solution: Cell[][] | null = null;
  let dug: DigState | null = null;
  let attempt = 0;
  let slice = 0;
  let solverRuns = 0;
  return {
    steps: BUILD_ATTEMPTS * DIG_SLICES,
    step: (): BuildTick => {
      if (!solution) { solution = buildSolutionCanvas(); dug = null; attempt++; slice = 0; }
      const before = dug ? dug.solverRuns : 0;
      slice++;
      dug = digByLogic(solution, max, blankCap, slice >= DIG_SLICES ? Infinity : RUNS_PER_SLICE, dug ?? undefined);
      solverRuns += dug.solverRuns - before;
      const made: SamuraiLevel = { puzzle: dug.puzzle, solution, tier: dug.tier, blanks: dug.blanks };
      const attemptOver = dug.done;
      if (attemptOver) { best = betterAttempt(best, made); solution = null; }
      const shown = attemptOver ? best! : betterAttempt(best, made);
      // ⚠️ «Хватит» спрашиваем ТОЛЬКО на конце захода. Спросить в середине — значит
      // бросить недокопанную доску, как только она дотянула до пола техник: клеток
      // на ней осталось бы заметно больше заказанного. Дробление придумано, чтобы
      // отдавать кадр, а не чтобы менять сложность, — и вот здесь эта разница живёт.
      return { best: shown, done: attemptOver && attemptEnough(level, shown), attempt, solverRuns };
    },
  };
}

/**
 * Партия уровня целиком, синхронно. Порядок выкалывания случайный, и ступень от него
 * пляшет — один заход то и дело отдаёт доску легче заказанной, поэтому заходов больше
 * одного. Ранний выход по достижении пола — не по часам, а по результату.
 *
 * ⚠️ ЭКРАН ЗОВЁТ НЕ ЭТО, а `samuraiBuilder` по шагам: между шагами ему надо отдать кадр
 * индикатору. Здесь тот же самый строитель, прокрученный до конца без пауз, — он нужен
 * гейтам и всему, где кадры отдавать некому. Логика сборки одна на оба пути.
 */
export function generateSamuraiLevel(level: number, attempts = BUILD_ATTEMPTS): SamuraiLevel {
  return buildSamuraiLevel(level, attempts).best;
}

/** То же самое, но с ценой сборки: сколько ушло заходов и прогонов решателя. */
export function buildSamuraiLevel(level: number, attempts = BUILD_ATTEMPTS): BuildTick {
  const b = samuraiBuilder(level);
  const steps = Math.max(1, attempts) * DIG_SLICES;
  let last: BuildTick | null = null;
  for (let i = 0; i < steps; i++) {
    last = b.step();
    if (last.done) break;
  }
  return last!;
}

/** Ключ незаконченной партии. Совпадает с gameId уровня — реестр «Продолжить» ищет по нему. */
const GAME_ID = 'sudoku_samurai';
/** Тот же ключ наружу — гейт ходит в то же хранилище, что игра (см. sudoku.tsx о направлении). */
export const SAMURAI_GAME_ID = GAME_ID;
/**
 * Версия формата снимка. Поменяли поля доски — подняли, старые записи просто не поднимутся.
 *
 * 2 — 20.08.2026: в снимок добавились карандашные пометки.
 */
const RESUME_V = 2;
/** Та же версия наружу — гейт поднимает партию ровно под ней. */
export const SAMURAI_RESUME_V = RESUME_V;

/** Ход: что стояло в клетке ДО него. Назад отыгрывает экран, лента только помнит. */
interface SamuraiMove { r: number; c: number; from: number; to: number }

/**
 * Снимок незаконченной партии. Кладём и решение тоже: без него доска поднимется, а
 * сверять ходы будет не с чем — генерация не воспроизводима, второй раз то же поле
 * не соберётся.
 */
interface SamuraiResume {
  level: number;
  solution: Cell[][];
  grid: Cell[][];
  given: boolean[][];
  /**
   * Карандашные пометки — ОДНИМ полем 21×21 на всю фигуру, как и сама доска.
   *
   * ⚠️ Именно поэтому клетка перекрытия ведёт себя правильно сама собой: она одна в
   * массиве, значит и набор кандидатов у неё один. Разложи пометки по пяти сеткам — и
   * в общем блоке появились бы ДВА набора на одну клетку, которые разъезжались бы с
   * первого же хода. Партия идёт под час на 369 клетках; без пометок она не решается,
   * а с расходящимися пометками — решается неверно, что хуже.
   */
  marks: PencilMarks;
  errors: number;
  hintUses: number;
  elapsed: number;
  history: ReturnType<ReturnType<typeof useMoveHistory<SamuraiMove>>['serialize']>;
}

export default function SamuraiSudokuGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  // Голый useWindowDimensions в веб-сборке (а Android у нас WebView) отдаёт 0 на первом
  // кадре и обновляется только по resize, которого при загрузке не бывает. У самурая от
  // ширины считается РАЗМЕР КЛЕТКИ — ноль запёк бы доску в невидимую полоску.
  const width = useScreenWidth();

  const { isPreset, autostart } = useGamePreset();
  const { profile } = useProfile();
  /**
   * ⚠️ КЛЮЧ УРОВНЯ У САМУРАЯ СВОЙ И ВСЕГДА БЫЛ СВОИМ (`psygames_sudoku_samurai_level_…`),
   * а вот РЕЗЕРВ этого ключа был мёртв. Потеряв ключ (переустановка, сброс профиля),
   * хук поднимает достигнутое из истории партий — `getMaxLevelFromSessions('sudoku_samurai')`
   * — а партии до 20.08.2026 лежали под именем `sudoku`. Совпадений ноль, значит человек
   * с двадцатого уровня открывал самурая на первом и молча.
   *
   * Разведение корзин чинит и это: новые записи ложатся под `sudoku_samurai`, старые
   * приводятся к нему при чтении по `details.samurai`. Обратной стороной то же самое:
   * классическая судоку больше не поднимет свой уровень из чужой лестницы.
   */
  const lvl = usePersistentLevel('sudoku_samurai');
  // Лента ходов для отмены. Хранит, ЧТО было в клетке до хода — назад отыгрывает экран.
  // Партия идёт под час: один промах пальцем не должен стоить этого часа.
  const hist = useMoveHistory<SamuraiMove>();
  const levelRef = useRef(1);   // уровень ТЕКУЩЕЙ партии (captured at startGame — как в quick-count)

  const [phase, setPhase] = useState<GamePhase>('config');
  const [solution, setSolution] = useState<Cell[][]>([]);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [given, setGiven] = useState<boolean[][]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  /**
   * КАРАНДАШ. Пометки — маска девяти бит на клетку поля 21×21 (services/pencilMarks),
   * режим — отдельный флаг: в нём цифровая клавиатура пишет не в клетку, а в её угол.
   *
   * ЗАЧЕМ ЭТО ЗДЕСЬ ОСТРЕЕ, ЧЕМ ГДЕ-ЛИБО. Пять сеток, 369 клеток, партия под час, и
   * зоны у самурая ОБЩИЕ: вывод из одной сетки переносится в другую через общий блок.
   * Держать такую бухгалтерию в голове нельзя физически — без места, куда записать
   * кандидатов, верхние уровни не решаются, а угадываются.
   */
  const [marks, setMarks] = useState<PencilMarks>([]);
  const [pencil, setPencil] = useState(false);
  const [zoom, setZoom] = useState<'fit' | 'zoom'>('fit');   // дефолт — вся фигура «крест» видна целиком
  const [errors, setErrors] = useState(0);
  const [hintUses, setHintUses] = useState(0);
  const [over, setOver] = useState(false);   // бюджет ошибок исчерпан → уровень НЕ пройден, рестарт
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * ЧТО СЕЙЧАС ДЕЛАЕТ ГЕНЕРАТОР. Живёт только в фазе 'building'.
   *
   * Замер 20.08.2026 в браузере: уровень 12 на маке — 0.39–0.82 с, он же с тротлингом
   * ×6 (примерно средний телефон) — 1.9–4.5 с. Столько экран раньше молчал.
   */
  const [build, setBuild] = useState<BuildStatus>({ step: 1, steps: BUILD_ATTEMPTS * DIG_SLICES, slow: false });
  /**
   * Поколение сборки. Пока доска считается, человек может нажать «назад», начать
   * партию заново или поднять сохранённую — и досчитанная доска не имеет права
   * встать поверх того, что уже на экране. Счётчик растёт на каждом таком событии,
   * и заход со старым номером молча выбрасывает свой результат.
   */
  const buildRef = useRef(0);
  // Подводка доски к клетке, по которой ткнули на карте. Скроллы вложенные:
  // внешний двигает по горизонтали, внутренний — по вертикали.
  const hScrollRef = useRef<ScrollView | null>(null);
  const vScrollRef = useRef<ScrollView | null>(null);
  const jumpRef = useRef<{ r: number; c: number } | null>(null);

  // Экран снесли — гасим таймер и обесцениваем идущую сборку: ставить доску некуда.
  useEffect(() => () => { buildRef.current++; if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Подвести доску к клетке, выбранной на карте. Ждём кадр: в момент смены режима
  // скроллы ещё смонтированы под старый размер клетки, и scrollTo уехал бы не туда.
  useEffect(() => {
    const j = jumpRef.current;
    if (zoom !== 'zoom' || !j) return;
    jumpRef.current = null;
    const cell = cellSizeFor(width, 'zoom');
    const id = setTimeout(() => {
      hScrollRef.current?.scrollTo({ x: Math.max(0, j.c * cell - width / 2 + cell / 2), animated: true });
      vScrollRef.current?.scrollTo({ y: Math.max(0, j.r * cell - cell * 2), animated: true });
    }, 0);
    return () => clearTimeout(id);
  }, [zoom, width]);

  // Пресет (запуск из зарядки) — авто-старт, без изменения уровня (как в других играх).
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps

  const starsFor = (e: number, h: number): number => (e === 0 && h === 0) ? 3 : (e <= 2 && h <= 1) ? 2 : 1;

  /**
   * СТАРТ ПАРТИИ. Сначала показать, что идёт работа, и только ПОТОМ работать.
   *
   * 🔴 ЗАЧЕМ ТАК, А НЕ ОДНОЙ СТРОКОЙ. Раньше здесь стоял синхронный
   * `generateSamuraiLevel`, и на верхних уровнях он держал поток до 4.5 секунд:
   * человек нажал «играть» и смотрел в пустой экран, не понимая, зависло или
   * думает. Поставить рядом `setPhase('building')` НЕ помогло бы — состояние,
   * поменянное перед тяжёлым циклом в том же обработчике, не успевает доехать до
   * экрана и гаснет в том же кадре.
   *
   * Поэтому сборка идёт ШАГАМИ (samuraiBuilder), и перед каждым отдаётся кадр
   * (runSteps + nextFrame). Экран успевает нарисоваться и обновить строку, а счётчик
   * шагов на ней — настоящий номер из цикла, а не выдуманные проценты.
   *
   * ⚠️ ЧАСЫ ПАРТИИ ЗАВОДЯТСЯ ПОСЛЕ СБОРКИ. Возьми `gameNow()` до неё — и человек
   * получил бы партию, начатую с четырёх секунд на секундомере, ни разу не коснувшись
   * доски. Это единственная причина, по которой отсчёт стоит именно здесь, внизу.
   */
  const startGame = () => {
    // Новая партия заменяет незаконченную: старую доску продолжать уже нечем.
    const pidStart = profile?.id;
    if (pidStart) clearResume(GAME_ID, pidStart).catch(() => {});
    hist.reset();
    levelRef.current = lvl.level;
    const level = levelRef.current;
    // Секундомер прошлой партии гасим здесь же: пока идёт сборка, считать нечего.
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setElapsedTime(0);
    const builder = samuraiBuilder(level);
    setBuild({ step: 1, steps: builder.steps, slow: false });
    setPhase('building');
    const gen = ++buildRef.current;
    void (async () => {
      const made = await runSteps<BuildTick>({
        steps: builder.steps,
        step: () => builder.step(),
        enough: (tick) => tick.done,
        show: (st) => { if (gen === buildRef.current) setBuild(st); },
        frame: nextFrame,
        now: gameNow,
      });
      if (gen !== buildRef.current) return;   // за время сборки экран ушёл дальше
      const { puzzle: p, solution: s } = made.best;
      setSolution(s);
      setGrid(p.map((r) => [...r]));
      setGiven(p.map((r) => r.map((v) => v !== 0)));
      setMarks(emptyPencilMarks(SIZE));   // новая доска — чистый лист и в карандашном слое
      setPencil(false);
      setSelected(null);
      setErrors(0);
      setHintUses(0);
      setOver(false);
      setZoom('fit');
      setPhase('playing');
      const start = gameNow();
      setStartTime(start);
      setElapsedTime(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    })();
  };


  /** Снимок партии для слоя незаконченной игры. */
  const snapshot = (): SamuraiResume => ({
    level: levelRef.current,
    solution, grid, given, marks,
    errors, hintUses,
    elapsed: elapsedTime,
    history: hist.serialize(),
  });

  /** Поднять партию из снимка — доска оживает ровно такой, какой её оставили. */
  const applyResume = (sv: SamuraiResume) => {
    buildRef.current++;   // доска, что считается прямо сейчас, поверх поднятой партии не встанет
    levelRef.current = sv.level;
    setSolution(sv.solution);
    setGrid(sv.grid);
    setGiven(sv.given);
    // ⚠️ Пометки прогоняем через normalize: запись лежит на устройстве месяц и переживает
    // обновления приложения. Битая маска нарисовала бы несуществующие цифры, чужой формат
    // уронил бы экран — потерять пометки не страшно, уронить партию страшно.
    setMarks(normalizePencilMarks(sv.marks, SIZE));
    setPencil(false);
    setErrors(sv.errors);
    setHintUses(sv.hintUses);
    setSelected(null);
    setOver(false);
    setZoom('fit');
    hist.restore(sv.history);
    // Таймер продолжаем с НАКОПЛЕННОГО: настенные часы между сессиями ушли вперёд, и от
    // прежнего startTime партия «шла» бы всё то время, что телефон лежал в кармане.
    const start = gameNow() - Math.max(0, sv.elapsed) * 1000;
    setStartTime(start);
    setElapsedTime(sv.elapsed);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    setPhase('playing');
  };

  // Поднять незаконченную партию при входе на экран. Путь зарядки (autostart) не трогаем:
  // там человек явно запустил свежий раунд, и startGame сам выбросит старую партию.
  useResumeBoot<SamuraiResume>(GAME_ID, RESUME_V, (saved) => {
    // Пока запись поднималась с диска, человек мог нажать «играть». Сборка идёт
    // секундами, и старая партия успела бы приехать ей в середину — не воскрешаем.
    if (buildRef.current > 0) return;
    if (!saved || !Array.isArray(saved.grid) || saved.grid.length !== SIZE) return;
    if (!Array.isArray(saved.solution) || saved.solution.length !== SIZE) return;
    applyResume(saved);
  }, autostart);

  // Автосохранение по ходу партии. Пишем с задержкой: подряд идущие касания не должны
  // бить по хранилищу каждым нажатием.
  useEffect(() => {
    if (phase !== 'playing' || over || !grid.length) return;
    const pid = profile?.id;
    if (!pid) return;
    const snap = snapshot();
    const tm = setTimeout(() => { saveResume(GAME_ID, pid, RESUME_V, snap).catch(() => {}); }, 400);
    return () => clearTimeout(tm);
  }, [grid, marks, errors, hintUses, phase, over]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Уход с экрана. Отложенная запись выше на этом моменте отменяется своим clearTimeout,
  // поэтому сохраняем ещё раз здесь — и с ЖИВЫМ временем, а не с тем, что было на прошлом ходу.
  const liveRef = useRef<{ ok: boolean; pid?: string; snap: () => SamuraiResume }>({ ok: false, snap: () => ({} as SamuraiResume) });
  liveRef.current = { ok: phase === 'playing' && !over && grid.length > 0, pid: profile?.id, snap: snapshot };
  /**
   * Дописать партию. Зовётся из двух мест: при сносе экрана (ниже) и ПЕРЕД вопросом
   * при выходе (`onSaveBeforeExit` у каркаса). Второе обязательно: человек нажимает
   * «назад», видит «партия сохранится» — и обещание должно быть уже выполнено, а не
   * зависеть от того, доживёт ли экран до размонтажа.
   *
   * Читаем через `liveRef`, а не из замыкания: снимок обязан быть свежим на момент
   * ухода, иначе допишем состояние прошлого хода.
   */
  const saveParty = React.useCallback(() => {
    const l = liveRef.current;
    if (l.ok && l.pid) saveResume(GAME_ID, l.pid, RESUME_V, l.snap()).catch(() => {});
  }, []);
  useEffect(() => () => saveParty(), [saveParty]);

  /**
   * Отмена хода. Возвращает КЛЕТКУ, но НЕ возвращает потраченную ошибку: иначе бюджет
   * ошибок превращается в бесконечный и уровень перестаёт что-либо значить. Промах
   * пальцем чинится, счёт ошибок — нет (то же правило, что в обычной судоку).
   *
   * ⚠️ ПОМЕТКИ ЛЕНТА ОТМЕНЫ НЕ ТРОГАЕТ — как во фрактальной и обычной судоку, и по той
   * же причине. Цифра — ХОД (тратит ошибку, проверяет победу), пометка — бухгалтерия
   * игрока, и своя отмена у неё короче ленты: повторный тап по цифре снимает её тем же
   * движением, каким поставил. При этом цифра пометки не стирает, а только гасит
   * (samuraiVisibleMarks), поэтому откат цифры возвращает клетку ВМЕСТЕ с кандидатами.
   */
  const handleUndo = () => {
    if (over) return;
    const m = hist.undo();
    if (!m) return;
    const ng = grid.map((row) => [...row]);
    ng[m.r][m.c] = m.from;
    setGrid(ng);
    setSelected({ r: m.r, c: m.c });
  };

  const isSolved = (ng: Cell[][]): boolean => {
    for (const [i, j] of CELLS) if (ng[i][j] !== solution[i][j]) return false;
    return true;
  };

  // Победа: доска решена в рамках бюджета ошибок. Проход уровня → поднять персист-уровень
  // (кроме пресета) и уйти в авто-поток LevelCleared. hintCount передаём явно (state ещё не
  // обновился в этом рендере, если решение пришло от подсказки).
  const finishLevel = async (ng: Cell[][], hintCount: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const pidDone = profile?.id;
    if (pidDone) clearResume(GAME_ID, pidDone).catch(() => {});   // доиграна — продолжать нечего
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    const passed = !isPreset;
    if (passed) lvl.reach(levelRef.current + 1);
    try {
      await saveSession({
        passed,
        /**
         * ⚠️ СВОЯ КОРЗИНА, А НЕ `sudoku`. До 20.08.2026 самурай писал партии в корзину
         * классической судоку со СВОИМ номером уровня — то есть уровни двух разных игр
         * лежали вперемешку. Ломалось от этого не «немножко»: «лучшее время уровня 5» у
         * классической было отчасти про поле 21×21, сводка мешала партию на 81 клетке с
         * партией на 369, а достижение «весь каталог» засчитывало самурая тому, кто в
         * него не заходил. Корзина теперь та же строка, под которой у самурая и так
         * лежат незаконченная партия (`GAME_ID`), уровень и звёзды.
         *
         * ⚠️ `details.samurai` ОСТАЁТСЯ И ПОСЛЕ РАЗВЕДЕНИЯ. Он перестал быть нужен новым
         * записям, но именно по нему разбираются СТАРЫЕ — те, что уже лежат на
         * устройствах под именем `sudoku` (`sessionGameType` в constants/games). Убрать
         * его — значит через один релиз потерять сам ключ к ним.
         */
        game_type: GAME_ID,
        score: Math.max(0, Math.round(4000 + levelRef.current * 150 - errors * 50 - finalTime * 2 - hintCount * 60)),
        time_seconds: finalTime,
        difficulty: `Level ${levelRef.current}`,
        mode: `samurai-level-${levelRef.current}`,
        errors,
        details: { errors, completed: true, samurai: true, level: levelRef.current, hint_uses: hintCount },
      });
    } catch (e) { console.error(e); }
    setPhase(passed ? 'cleared' : 'result');
  };

  const handleCellPress = (r: number, c: number) => {
    if (over) return;
    if (!gridsOf(r, c).length) return;   // дырка — не выбирается
    // Тап по КАРТЕ ('fit') не ставит цифру: клетка там 16pt, попасть в неё нельзя.
    // Он переводит в рабочий режим и подводит доску к этому месту — грубого попадания
    // «примерно в эту область» достаточно, дальше прицеливаются по-крупному.
    if (zoom === 'fit') {
      jumpRef.current = { r, c };
      setZoom('zoom');
      if (!given[r][c]) setSelected({ r, c });
      return;
    }
    if (given[r][c]) return;
    setSelected({ r, c });
  };

  /**
   * КЛАВИАТУРА — та же раскладка, что в обычной судоку: цифры ставят, Backspace стирает,
   * стрелки ходят. Одинаковость здесь не косметика: человек приходит сюда из судоку 9×9
   * с уже наработанной привычкой, и «в той игре Backspace стирал, в этой нет» читается
   * как поломка, а не как разница режимов.
   *
   * Отличие одно, и оно от раскладки поля: на 21×21 между сетками есть ДЫРКИ — клетки,
   * не принадлежащие ни одной сетке. Стрелки пропускают и их, и данные клетки, иначе
   * курсор вставал бы в пустоте, где ввод не работает, и это выглядело бы как зависание.
   */
  const moveSelection = (dr: number, dc: number) => {
    if (!grid.length) return;
    let { r, c } = selected ?? { r: dr < 0 ? SIZE : -1, c: dc < 0 ? SIZE : -1 };
    for (let step = 0; step < SIZE * SIZE; step++) {
      r += dr; c += dc;
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return;
      if (gridsOf(r, c).length && !given[r][c]) { setSelected({ r, c }); return; }
    }
  };

  useGameKeyboard(
    {
      ...digitKeys((n) => { void handleNumPress(n); }),
      ArrowUp: () => moveSelection(-1, 0),
      ArrowDown: () => moveSelection(1, 0),
      ArrowLeft: () => moveSelection(0, -1),
      ArrowRight: () => moveSelection(0, 1),
    },
    phase === 'playing' && !over,
  );

  const handleNumPress = async (n: number) => {
    // Развилка одна на все судоку (services/pencilMarks): карандаш НЕ становится ходом —
    // не тратит ошибку из бюджета, не ложится в ленту отмены и не проверяет доску на победу.
    const route = routeDigitPress({
      pencil, hasSelection: !!selected, blocked: over,
      given: !!selected && given[selected.r][selected.c],
    });
    if (route === 'ignore') return;
    const sel = selected!;
    if (route === 'pencil') {
      // Клетка на стыке сеток — ОДНА клетка поля 21×21, поэтому и набор кандидатов у
      // неё один: пометка, поставленная «из левой верхней сетки», видна и из центральной.
      setMarks((current) => pencilInput(current, SIZE, sel.r, sel.c, n));
      return;
    }
    const { r, c } = sel;
    const previous = grid[r][c];
    const ng = grid.map((row) => [...row]);
    ng[r][c] = n;
    setGrid(ng);
    hist.push({ r, c, from: previous, to: n });
    if (n !== 0) { (solution[r][c] === n) ? sndPlace() : sndWrong(); }   // тик при верной, бузз при неверной
    if (n !== 0 && solution[r][c] !== n) {
      const ne = errors + 1;
      setErrors(ne);
      const { maxErrors } = levelParams(levelRef.current);
      if (ne >= maxErrors) {   // бюджет ошибок исчерпан → уровень провален
        if (timerRef.current) clearInterval(timerRef.current);
        setOver(true);
        const pidFail = profile?.id;
        if (pidFail) clearResume(GAME_ID, pidFail).catch(() => {});   // партия проиграна — продолжать нечего
        if (!isPreset) lvl.fail();   // гистерезис понижения (после N провалов подряд)
        return;
      }
    }
    if (isSolved(ng)) finishLevel(ng, hintUses);
  };

  // Подсказка: вписать верную цифру в выбранную клетку. Лимит по уровню (levelParams.hintMax).
  const handleHint = () => {
    if (over || !selected) return;
    const { hintMax } = levelParams(levelRef.current);
    if (hintUses >= hintMax) return;
    const { r, c } = selected;
    if (given[r][c]) return;
    const correct = solution[r][c];
    if (grid[r][c] === correct) return;
    const ng = grid.map((row) => [...row]);
    ng[r][c] = correct;
    setGrid(ng);
    const nh = hintUses + 1;
    setHintUses(nh);
    sndPlace();
    if (isSolved(ng)) finishLevel(ng, nh);   // подсказка может закрыть последнюю клетку
  };

  /**
   * РАЗМЕР КЛЕТКИ И ПОПАДАНИЕ ПАЛЬЦЕМ.
   *
   * Замер 19.08.2026: в режиме 'fit' клетка выходила 16pt при норме 48, а цифра в ней — 9pt.
   * Двадцать одна клетка в ряд физически не помещается в телефон крупнее: 21 × 48 = 1008pt.
   * Значит «сделать клетку больше» в режиме «вижу весь крест» невозможно в принципе, и
   * чинить надо не размер, а РОЛЬ режима:
   *
   *   'fit'  — КАРТА. Показывает всю фигуру из пяти сеток, по ней ориентируются. Тап по
   *            карте не пытается попасть в 16pt: он перепрыгивает в рабочий режим и
   *            подводит доску к этому месту (см. handleCellPress). Точность нужна грубая —
   *            «примерно сюда», а промах стоит одного лишнего жеста, а не ошибки в партии.
   *   'zoom' — РАБОЧИЙ РЕЖИМ. Клетка ≥48pt, то есть настоящая цель для пальца, цифра 27pt.
   *            Поле больше экрана и скроллится в обе стороны — это и есть цена честной цели.
   *
   * Раньше 'zoom' давал 32pt (fitCell × 2) — тоже мимо нормы, только не так заметно.
   * Бюджет 36 = paddingHorizontal каркаса GameShell 16×2 плюс запас, иначе крест вылезал.
   */
  const cellSize = cellSizeFor(width, zoom);

  const renderConfig = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Text style={{ fontSize: 44 }}>🎴</Text>
        <Text style={styles.configTitle}>{t('samuraiTitle')}</Text>
        <Text style={styles.configDesc}>
          {t('samuraiDesc')}
        </Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')} {lvl.level}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {t('samuraiLvlParams').replace('{p}', String(Math.round(levelParams(lvl.level).digRatio * 100))).replace('{e}', String(levelParams(lvl.level).maxErrors)).replace('{h}', String(levelParams(lvl.level).hintMax))}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
          {t('samuraiNextUnlocks')}
        </Text>
      </View>
      <LevelProgressMap gameId="sudoku_samurai" currentLevel={lvl.level} onPickLevel={lvl.pick} maxLevel={MAX_LEVEL} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('btn_help')}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {t('samuraiHowTo')}
        </Text>
      </View>
      {/* testID — чтобы гейт жал ИМЕННО эту кнопку, а не угадывал её среди узлов тропинки. */}
      <TouchableOpacity
        testID="samurai-start"
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('playLevelN').replace('{n}', String(lvl.level))}</Text>
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
    // Кандидаты этой клетки — считаем один раз на клетку: их 369 на поле, а
    // пересчёт на каждую из девяти цифр стоил бы девяти проходов по маске.
    const penciled = samuraiVisibleMarks(marks[r]?.[c] ?? 0, v, cellSize);
    const isSel = selected?.r === r && selected?.c === c;
    const sameRow = selected?.r === r || selected?.c === c;
    const sameVal = v !== 0 && selected && grid[selected.r][selected.c] === v;
    const isGiven = given[r][c];
    /**
     * 🔴 ОШИБКА СНИМАЛАСЬ МОЛЧА. Жизнь уходила при `solution[r][c] !== n`, а красным
     * клетка становилась ТОЛЬКО при дубле цифры внутри своей сетки. Замер по настоящим
     * доскам: 42,0 % неверных цифр на 4-м уровне, 43,9 % на 12-м, 42,4 % на 25-м не
     * дублировали ничего — счётчик тикал, а на поле из 369 клеток не менялось ничего.
     * На 12-м уровне четырёх таких тиков хватает, чтобы оборвать часовую партию, и
     * человек не знает даже, в какой сетке искать.
     *
     * И классика, и фрактал давно красят такую клетку (`wrongVal`, `wrong`) — самурай
     * остался единственным, кто наказывал вслепую. Метка ничего не выдаёт сверх уже
     * сказанного: счётчик ошибок про эту цифру УЖЕ сообщил, не сказав только — где.
     */
    const conflict = samuraiCellWrong(grid, solution, r, c).error;

    let bg = colors.surface;
    if (conflict) bg = isSel ? '#ef4444' : '#fecaca';   // ошибка: яркий красный если выделена, иначе светло-красный
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
        accessibilityRole="button"
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
        {/* Карандашные пометки — три в ряд, как в углу бумажной клетки. Слоты стоят на
            местах всегда (отсутствующая цифра прозрачна): по неподвижной сетке кандидаты
            читаются взглядом, а по съезжающему списку — чтением. Касаний слой не
            перехватывает: палец обязан попадать в клетку, а не в цифру поверх неё. */}
        {penciled.length > 0 && (
          <View style={styles.markGrid} pointerEvents="none">
            {Array.from({ length: 9 }, (_, k) => k + 1).map((d) => (
              <Text
                key={d}
                style={{
                  width: cellSize / 3, height: cellSize / 3, lineHeight: cellSize / 3,
                  fontSize: Math.max(6, Math.round(cellSize * 0.235)), textAlign: 'center',
                  color: penciled.includes(d) ? (isSel ? '#FFF' : colors.textSecondary) : 'transparent',
                }}
              >
                {d}
              </Text>
            ))}
          </View>
        )}
        {v !== 0 && (
          <Text style={{
            color: isSel ? '#FFF' : conflict ? '#b91c1c' : isGiven ? colors.text : GRADIENT[0],
            fontWeight: isGiven ? '800' : '700',
            // Пол в 11pt: на карте клетка 16pt, и 0.56 давали 9pt — цифру не прочитать
            // даже не пытаясь в неё попасть.
            fontSize: Math.max(11, Math.round(cellSize * 0.56)),
          }}>{v}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const boardEl = (
    // RTL-пин: зеркалирование ломает жирные границы боксов (физические border на логических колонках)
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cellSize * SIZE, writingDirection: 'ltr' } as any}>
      {grid.map((row, r) => row.map((_, c) => renderCell(r, c)))}
    </View>
  );

  const renderPlaying = () => {
    const { maxErrors, hintMax } = levelParams(levelRef.current);
    const marksWritten = countPencilMarks(marks);
    const statsEl = (
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: GRADIENT[0] }]}>{t('label_level_short')}{levelRef.current}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>{t('errorsOfMax').replace('{n}', String(errors)).replace('{max}', String(maxErrors))}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{t('secShort')}</Text>
        <TouchableOpacity
          accessibilityRole="button" onPress={() => setZoom((z) => (z === 'fit' ? 'zoom' : 'fit'))} style={[styles.zoomBtn, { borderColor: colors.border }]}>
          <Ionicons name={zoom === 'fit' ? 'search' : 'contract'} size={15} color={colors.text} />
          <Text style={[styles.statText, { color: colors.text, fontSize: 12 }]}>{zoom === 'fit' ? t('zoomIn') : t('zoomFit')}</Text>
        </TouchableOpacity>
      </View>
    );
    // Действия наверху — как в обычной судоку: подсказка и ОТМЕНА. Расхождение между
    // играми одного семейства человек читает как поломку, а не как разницу режимов.
    const hintEl = (
      <View style={styles.headerActionsRow}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={handleHint}
          disabled={!selected || hintUses >= hintMax}
          style={[styles.hintBtn, { backgroundColor: '#fbbf24', opacity: (selected && hintUses < hintMax) ? 1 : 0.4 }]}
        >
          <Ionicons name="bulb" size={16} color="#000" />
          <Text style={styles.hintBtnText}>{t('btn_hint')} ({hintUses}/{hintMax})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('btn_undo')}
          onPress={handleUndo}
          disabled={!hist.canUndo}
          style={[styles.hintBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: hist.canUndo ? 1 : 0.4 }]}
        >
          <Ionicons name="arrow-undo" size={16} color={colors.text} />
          <Text style={[styles.hintBtnText, { color: colors.text }]}>{t('btn_undo')}</Text>
        </TouchableOpacity>
        {/* КАРАНДАШ. Кнопка ровно того же размера, что соседние (styles.hintBtn, minHeight
            48): промах мимо неё попадает в «Подсказку» и тратит лимит подсказок — цена
            промаха здесь выше, чем «не нажалось». Счётчик на подписи нужен потому, что при
            выключённом карандаше слоя не видно, и без числа непонятно, есть ли там что-то. */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('sudokuPencilMode')}
          accessibilityState={{ selected: pencil }}
          testID="samurai-pencil"
          onPress={() => setPencil((on) => !on)}
          style={[styles.hintBtn, {
            backgroundColor: pencil ? GRADIENT[0] : colors.surface,
            borderWidth: 1, borderColor: pencil ? GRADIENT[0] : colors.border,
          }]}
        >
          <Ionicons name="pencil-outline" size={16} color={pencil ? '#FFF' : colors.text} />
          <Text style={[styles.hintBtnText, { color: pencil ? '#FFF' : colors.text }]}>
            {marksWritten ? `${t('sudokuPencilMode')} ${marksWritten}` : t('sudokuPencilMode')}
          </Text>
        </TouchableOpacity>
      </View>
    );
    // В режиме 'zoom' оборачиваем поле в 2D-скролл (вложенные ScrollView — работают и в вебе, и нативно).
    const boardWrap = zoom === 'zoom'
      ? (
        // flex:1 (не фиксированный maxHeight) — доска занимает РОВНО остаток экрана
        // после statsEl/padEl, поэтому цифровая панель ГАРАНТИРОВАННО остаётся видна,
        // не нужно отдалять зум чтобы до неё дотянуться.
        <ScrollView ref={hScrollRef} horizontal style={styles.zoomScroll} contentContainerStyle={{ padding: 6 }}>
          <ScrollView ref={vScrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 0 }}>{boardEl}</ScrollView>
        </ScrollView>
      )
      : <View style={{ alignSelf: 'center' }}>{boardEl}</View>;

    const padEl = (
      <View style={styles.toolbarCol}>
        {/* Подсказку показываем ТОЛЬКО при включённом карандаше: в выключённом виде это
            была бы строка, объясняющая то, чего сейчас не происходит. */}
        {pencil && (
          <Text numberOfLines={2} style={[styles.pencilHint, { color: colors.textSecondary }]}>
            {t('sudokuPencilHint')}
          </Text>
        )}
      <View style={styles.numPad}>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
          <TouchableOpacity
            accessibilityRole="button" key={n} onPress={() => handleNumPress(n)}
            style={[styles.numBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{n}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yErase')}
          onPress={() => handleNumPress(0)} style={[styles.numBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="backspace-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      </View>
    );

    // Единый каркас GameShell: статы (уровень/ошибки/время/зум) — в props, numPad+hint —
    // в прибитом нижнем тулбаре (в 'zoom' панель гарантированно видна — цель v-flex сохранена:
    // доска-скролл занимает ровно остаток поля, тулбар не съезжает).
    return (
      <GameShell
        title={t('samuraiTitle')}
        onBack={() => goBackOrHome()}
        stats={statsEl}
        // Как в обычной судоку: действия наверху, цифры внизу. Расхождение между
        // играми одного семейства человек читает как поломку, а не как замысел.
        headerActions={hintEl}
        toolbar={padEl}
        /**
         * 🔴 ПЯТЬ СЕТОК 9×9 — ПАРТИЯ НА ЧАС. Промах по «назад» уводил с экрана
         * молча. Слой сохранения тут был с самого начала, то есть партия и не
         * терялась — но человек об этом не знал и считал, что потерял час.
         *
         * Спрашиваем не по факту «идёт партия», а по сделанной работе: пока не
         * сделано ни одного хода И не написано ни одной пометки, терять нечего, и
         * вопрос был бы шумом на пустом месте. Пометки тут наравне с ходами — их
         * расставляют по десять минут, не поставив ни одной цифры. `resumable`
         * здесь правда — потому и текст обещает продолжение, а не потерю.
         */
        confirmExit={phase === 'playing' && !over && (hist.canUndo || marksWritten > 0)}
        resumable
        onSaveBeforeExit={saveParty}
      >
        {boardWrap}
      </GameShell>
    );
  };

  // Игровая фаза — на едином каркасе GameShell; оверлей «лимит ошибок» — поверх каркаса
  // (обёртка View flex:1, паттерн digit-span).
  // Доска остаётся видна и после победы — она и есть награда; карточка итога
  // висит поверх неё (решение Дениса «карточка над всей доской»).
  if (phase === 'playing' || phase === 'cleared') {
    return (
      <View style={{ flex: 1 }}>
        {phase === 'cleared' && (
          <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
            <LevelCleared
          variant="overlay"
          gameId="sudoku_samurai"
          level={levelRef.current}
          stars={starsFor(errors, hintUses)}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          onContinue={() => startGame()}
          onStop={() => setPhase('config')}
        />
          </View>
        )}
        {renderPlaying()}
        {/* Бюджет ошибок исчерпан → уровень провален, рестарт того же уровня */}
        {over && (
          <View style={styles.overWrap}>
            <View style={[styles.overCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.overEmoji}>💔</Text>
              <Text style={[styles.overTitle, { color: colors.text }]}>{t('samuraiOverTitle')}</Text>
              <Text style={[styles.overSub, { color: colors.textSecondary }]}>
                {t('samuraiOverSub').replace('{n}', String(levelParams(levelRef.current).maxErrors))}
              </Text>
              <TouchableOpacity
                accessibilityRole="button" style={styles.startBtn} onPress={() => startGame()}>
                <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
                  <Text style={styles.startBtnText}>{t('restart')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button" onPress={() => setPhase('config')} style={{ marginTop: 10 }}>
                {/* Ключ назван a11yMenu, но текст в нём тот же «Меню»/«Menu» на все 12
                    языков. Заводить второй ключ ради красивого имени запрещает гейт
                    dictionary-duplicates: одно слово — один ключ. */}
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('a11yMenu')}</Text>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('samuraiTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {/* Доска собирается. Экран говорит об этом словами, а не молчит секундами —
          и «назад» в шапке остаётся живым: ожидание не превращается в ловушку. */}
      {phase === 'building' && <BoardBuilding status={build} tint={GRADIENT[0]} />}
      {/* Авто-поток: прошёл уровень чисто → баннер → следующий стартует сам (onContinue) */}

      {/* result — только для пресета (запуск из зарядки, уровень не двигаем) */}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(4000 + levelRef.current * 150 - errors * 50 - elapsedTime * 2 - hintUses * 60))}
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
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  toolbarCol: { flex: 1, alignItems: 'center', gap: 8 },   // numPad+hint колонкой в тулбаре каркаса
  statsRow: { flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  zoomBtn: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  zoomScroll: { flex: 1, alignSelf: 'stretch' },
  // RTL-пин: цифровой ряд 1..9 не зеркалится (конвенция цифровых клавиатур в RTL-локалях)
  numPad: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', writingDirection: 'ltr' },
  numBtn: { width: 46, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  headerActionsRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  hintBtn: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  hintBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  pencilHint: { fontSize: 11, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12 },
  // Карандашные пометки: три в ряд поверх клетки и БЕЗ перехвата касаний —
  // палец должен попадать в саму клетку, а не в цифру поверх неё.
  markGrid: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
  },
  overWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 24, zIndex: 100 },
  overCard: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 24, alignItems: 'center', gap: 6 },
  overEmoji: { fontSize: 46 },
  overTitle: { fontSize: 20, fontWeight: '800' },
  overSub: { fontSize: 14, textAlign: 'center', marginBottom: 10 },
});
