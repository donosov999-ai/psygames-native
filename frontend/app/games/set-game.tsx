/* psygames-game-set-game · VER 1 · 19.08.2026 */
import GradientSurface from '@/src/components/GradientSurface';
import { hudTime } from '@/src/services/hudTime';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveSession } from '@/src/services/api';
import {saveResume, clearResume} from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { hapticSuccess, hapticError, HudBadge } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const SG_RULES: LevelRule[] = [
  {
    key: 'timelimit', fromLevel: 11,
    ru: { title: 'Лимит времени', rule: 'Теперь на поиск SET даётся ограниченное время. Не успел — штраф ✗ и новая раскладка. С каждым уровнем лимит жмёт сильнее.', example: 'Пример: L11 — 26 с на SET, дальше −4 с за уровень (минимум 8 с).' },
    en: { title: 'Time limit', rule: 'You now have limited time to find a SET. Run out — penalty ✗ and a fresh board. The limit tightens every level.', example: 'Example: L11 — 26 s per SET, then −4 s per level (8 s minimum).' },
  },
];

const GRADIENT = ['#43cea2', '#185a9d'];
// Сплошным цветом этот градиент AA не берёт (белый 1.98, чёрный 2.99) —
// GradientSurface кладёт вуаль цветом самого градиента, цвет текста считает сервис.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const SET_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitSet1' },
  { icon: 'layers-outline', textKey: 'benefitSet2' },
  { icon: 'shapes-outline', textKey: 'benefitSet3' },
];

// SET cards: 4 attributes × 3 values = 81 unique cards
type ShapeType = 'circle' | 'square' | 'triangle';
type FillType = 'solid' | 'striped' | 'open';
type ColorType = 'red' | 'green' | 'purple';
type CountType = 1 | 2 | 3;

export interface Card {
  shape: ShapeType;
  fill: FillType;
  color: ColorType;
  count: CountType;
  id: string;
}

const SHAPES: ShapeType[] = ['circle', 'square', 'triangle'];
const FILLS: FillType[] = ['solid', 'striped', 'open'];
const COLORS: ColorType[] = ['red', 'green', 'purple'];
const COUNTS: CountType[] = [1, 2, 3];
const COLOR_HEX: Record<ColorType, string> = { red: '#e63946', green: '#2a9d8f', purple: '#7b2cbf' };
// Okabe-Ito: киноварь / сине-зелёный / красно-фиолетовый. Цвет здесь один из трёх
// признаков карты, но без него сет не собрать.
const COLOR_HEX_CB: Record<ColorType, string> = { red: '#d55e00', green: '#009e73', purple: '#cc79a7' };

const allCards = (): Card[] => {
  const out: Card[] = [];
  for (const s of SHAPES) for (const f of FILLS) for (const c of COLORS) for (const n of COUNTS) {
    out.push({ shape: s, fill: f, color: c, count: n, id: `${s}-${f}-${c}-${n}` });
  }
  return out;
};

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function isSet(a: Card, b: Card, c: Card): boolean {
  const allSameOrAllDiff = (x: any, y: any, z: any) =>
    (x === y && y === z) || (x !== y && y !== z && x !== z);
  return allSameOrAllDiff(a.shape, b.shape, c.shape) &&
         allSameOrAllDiff(a.fill, b.fill, c.fill) &&
         allSameOrAllDiff(a.color, b.color, c.color) &&
         allSameOrAllDiff(a.count, b.count, c.count);
}

// Per-attribute breakdown for hint when subject picks a non-SET triple.
function explainSet(a: Card, b: Card, c: Card): { shape: boolean; fill: boolean; color: boolean; count: boolean } {
  const allSameOrAllDiff = (x: any, y: any, z: any) =>
    (x === y && y === z) || (x !== y && y !== z && x !== z);
  return {
    shape: allSameOrAllDiff(a.shape, b.shape, c.shape),
    fill:  allSameOrAllDiff(a.fill,  b.fill,  c.fill),
    color: allSameOrAllDiff(a.color, b.color, c.color),
    count: allSameOrAllDiff(a.count, b.count, c.count),
  };
}

// v1.131.0+: наглядный пример «валидный SET vs невалидный» в конфиге (волна фидбека:
// справка была только текстом). Карточки рисуются теми же примитивами, что и в игре.
// Валидная тройка: форма и заливка одинаковы у ВСЕХ, цвет и число — у ВСЕХ разные.
const EXAMPLE_VALID: Card[] = [
  { shape: 'circle', fill: 'solid', color: 'red', count: 1, id: 'ex-v-1' },
  { shape: 'circle', fill: 'solid', color: 'green', count: 2, id: 'ex-v-2' },
  { shape: 'circle', fill: 'solid', color: 'purple', count: 3, id: 'ex-v-3' },
];
// Невалидная: те же карты, но у второй цвет = красный → признак «цвет» совпал у двух из трёх.
const EXAMPLE_INVALID: Card[] = [
  { shape: 'circle', fill: 'solid', color: 'red', count: 1, id: 'ex-i-1' },
  { shape: 'circle', fill: 'solid', color: 'red', count: 2, id: 'ex-i-2' },
  { shape: 'circle', fill: 'solid', color: 'purple', count: 3, id: 'ex-i-3' },
];

function findAnySet(cards: Card[]): [number, number, number] | null {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (isSet(cards[i], cards[j], cards[k])) return [i, j, k];
  return null;
}

/** Карт на столе. Отдельной константой — по ней же сверяется поднятая из хранилища партия. */
export const SET_BOARD_SIZE = 12;

// Build a board of 12 cards that contains at least one SET (and not too many).
function buildBoard(): Card[] {
  const deck = shuffle(allCards());
  let board = deck.slice(0, SET_BOARD_SIZE);
  let guard = 0;
  while (!findAnySet(board) && guard < 100) {
    board = shuffle(allCards()).slice(0, SET_BOARD_SIZE);
    guard++;
  }
  return board;
}

export type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

// Уровень (1..15+): L1-10 trials 6→15 (выносливость) · L11-15 лимит времени на SET (давление, убывает).
function levelParams(level: number): { trials: number; timeLimit: number } {
  const trials = Math.min(15, 5 + level);                       // L1=6 → L10=15
  const over = Math.max(0, level - 10);
  const timeLimit = over > 0 ? Math.max(8, 30 - over * 4) : 0;   // 0 = без лимита; L11≈26с → L15≈10с
  return { trials, timeLimit };
}

/* ─────────────────────── незаконченная партия ───────────────────────
 *
 * 🔴 ЧТО ЛОМАЛОСЬ (замер 19.08.2026). Партия здесь — `trials` раскладов подряд
 * (6 на первом уровне, 15 на десятом), а с L11 на каждый расклад ещё и лимит
 * времени. Это минуты. Выход с экрана — промах пальцем по «назад» в шапке или
 * аппаратная «назад» — уводил МОЛЧА и стирал всё: раскладку, счёт верных и
 * ошибок, номер расклада, накопленное время. Ни вопроса, ни хранения.
 *
 * ⚠️ ПОЧЕМУ СНИМОК И ПОДЪЁМ — ОБЫЧНЫЕ ФУНКЦИИ, А НЕ КУСОК КОМПОНЕНТА. Рендерера
 * компонентов в зависимостях проекта нет (`testMatch` — только `*.test.ts`),
 * а самое ломкое здесь — АРИФМЕТИКА ВРЕМЕНИ: остаток лимита при подъёме обязан
 * быть тем же, что был на момент ухода. Ошибись знаком — расклад либо начнётся
 * заново (бесплатное время), либо окажется просроченным (штраф ни за что), и
 * чтением исходника это не ловится. Вынесено сюда → гоняется в
 * `src/__tests__/set-game-resume.test.ts` по-настоящему.
 *
 * ⚠️ ЧАСЫ ЗДЕСЬ ИГРОВЫЕ (`gameNow`), а не настенные: пока человек пишет отзыв,
 * игра держит паузу. Момент `now` приходит снаружи одним аргументом — обе
 * стороны, и снимок, и подъём, обязаны мерить одними часами.
 */

/** Ключ незаконченной партии. Совпадает с id в реестре игр — карточка «Продолжить» ищет по нему. */
export const SET_GAME_ID = 'set_game';
/** Версия формата снимка. Поменяли набор полей — подняли, старые записи просто не поднимутся. */
export const SET_RESUME_V = 1;
/** Задержка отложенной записи: подряд идущие касания не бьют по хранилищу каждым нажатием. */
const RESUME_DEBOUNCE_MS = 400;

/** Что видно на экране в момент снимка: разбор ошибки, показанный сет или чистое поле. */
export type SetVerdict = 'none' | 'right' | 'wrong' | 'revealed';

/** Снимок незаконченной партии. Лежит на устройстве, на сервер не уходит. */
export interface SetResume {
  level: number;
  trials: number;
  round: number;
  hits: number;
  errors: number;
  /** Сам расклад: генерация случайная, по номеру уровня её не воспроизвести. */
  board: Card[];
  picked: number[];
  /** Накопленное ИГРОВОЕ время партии, мс. */
  elapsedMs: number;
  /** Лимит на расклад, с (0 = на этом уровне лимита нет). */
  dealLimitSec: number;
  /**
   * Остаток на ТЕКУЩИЙ расклад, мс — то самое, что нельзя ни обнулить, ни
   * начать заново. `null` = отсчёт в момент ухода не шёл (висел разбор ошибки),
   * и при подъёме расклад получает полный лимит — ровно как по кнопке «Понятно».
   */
  dealLeftMs: number | null;
  /** Расклад отыгран (сет собран либо показан по таймауту) → при подъёме раздать новый. */
  freshDeal: boolean;
}

/** Живая партия — то, что экран знает о себе в момент снимка. */
export interface SetLiveParty {
  phase: GamePhase;
  level: number;
  trials: number;
  round: number;
  hits: number;
  errors: number;
  board: Card[];
  picked: number[];
  /** Отметка игровых часов, от которой идёт партия. */
  startedAt: number;
  dealLimitSec: number;
  /** Отметка игровых часов, когда истекает расклад; 0 = отсчёта сейчас нет. */
  dealEndAt: number;
  verdict: SetVerdict;
}

/** Поднятая партия: экран раскладывает это по своим состояниям. */
export interface SetRestored {
  level: number;
  trials: number;
  round: number;
  hits: number;
  errors: number;
  board: Card[];
  picked: number[];
  /** Отметка игровых часов, с которой считать общее время партии. */
  startedAt: number;
  dealLimitSec: number;
  /** Куда ставить дедлайн расклада; 0 = лимита нет. */
  dealEndAt: number;
  /** Расклад из снимка отыгран — экран обязан раздать свежий. */
  freshDeal: boolean;
}

/**
 * ЕСТЬ ЛИ ЧТО ТЕРЯТЬ. Вопрос при выходе там, где терять нечего, раздражает
 * сильнее, чем помогает, поэтому «идёт партия» тут не критерий.
 *
 * ⚠️ `round > 1`, а не `round > 0`: счёт раскладов ЕДИНИЧНЫЙ (`setRound(1)` в
 * startGame), так что `round > 0` означало бы «всегда, пока открыта игра» — то
 * есть вопрос и на свежем раскладе, где не сделано ни одного действия. Смысл
 * условия — «первый расклад ещё ничего личного не накопил», и на языке
 * единичного счёта это `round > 1`. Ошибка на ПЕРВОМ раскладе уже считается
 * (по ✗ решается проход уровня) — поэтому `errors > 0` стоит отдельно.
 */
export function setHasSomethingToLose(p: { phase: GamePhase; hits: number; errors: number; round: number }): boolean {
  if (p.phase !== 'playing') return false;
  return p.hits > 0 || p.errors > 0 || p.round > 1;
}

/**
 * Снимок для хранилища. `null` = сохранять нечего, и это не ошибка: мусорные
 * записи потом всплывают карточкой «Продолжить» на главной и обещают партию,
 * которой нет.
 */
export function snapshotSetParty(live: SetLiveParty, now: number): SetResume | null {
  if (!setHasSomethingToLose(live)) return null;
  if (!Array.isArray(live.board) || live.board.length === 0) return null;
  // Верный ответ на ПОСЛЕДНЕМ раскладе — партия уже дописывается на сервер
  // (через 700 мс экран уйдёт в итог). Продолжать нечего.
  if (live.verdict === 'right' && live.round >= live.trials) return null;

  // Расклад отыгран: сет либо собран, либо показан по таймауту. Класть его в
  // снимок нельзя — вернувшись, человек получил бы поле с уже известным сетом.
  const played = live.verdict === 'right' || live.verdict === 'revealed';
  // Отсчёт идёт только на чистом поле: и разбор ошибки, и показ сета его снимают.
  const clockRuns = live.verdict === 'none' && live.dealEndAt > 0;

  return {
    level: live.level,
    trials: live.trials,
    // Верный ответ засчитан сразу, а номер расклада двигался бы через 700 мс —
    // в снимке двигаем сами, иначе тот же расклад пришлось бы играть дважды.
    round: live.verdict === 'right' ? live.round + 1 : live.round,
    hits: live.hits,
    errors: live.errors,
    board: played ? [] : [...live.board],
    // Выбранные, но не проверенные карты — состояние руки; после вердикта их и так нет.
    picked: live.verdict === 'none' ? [...live.picked] : [],
    elapsedMs: Math.max(0, now - live.startedAt),
    dealLimitSec: live.dealLimitSec,
    dealLeftMs: clockRuns ? Math.max(0, live.dealEndAt - now) : null,
    freshDeal: played,
  };
}

const isCardShape = (c: any): c is Card =>
  !!c && (SHAPES as string[]).includes(c.shape) && (FILLS as string[]).includes(c.fill)
      && (COLORS as string[]).includes(c.color) && (COUNTS as number[]).includes(c.count);

/**
 * Поднять партию из снимка. `null` = продолжать нечего (записи нет, она битая
 * или отыгранная), экран просто заходит через конфиг.
 *
 * Часы заводим ЗАДНИМ ЧИСЛОМ на накопленное время: разность `now − startedAt`
 * сразу даёт настоящую длительность партии, а не срок хранения записи.
 */
export function restoreSetParty(saved: SetResume | null | undefined, now: number): SetRestored | null {
  if (!saved || typeof saved !== 'object') return null;
  const freshDeal = !!saved.freshDeal;
  const board = Array.isArray(saved.board) ? saved.board : [];
  // Свежий расклад экран раздаст сам, поэтому доску из снимка сверяем только
  // тогда, когда собираемся её показать.
  if (!freshDeal && (board.length !== SET_BOARD_SIZE || !board.every(isCardShape))) return null;

  const trials = Math.max(1, Math.floor(Number(saved.trials) || 0));
  const round = Math.min(trials, Math.max(1, Math.floor(Number(saved.round) || 1)));
  const limit = Math.max(0, Number(saved.dealLimitSec) || 0);
  // null (разбор висел) → полный лимит. Иначе ровно тот остаток, что был на момент ухода.
  const leftMs = saved.dealLeftMs === null || saved.dealLeftMs === undefined
    ? limit * 1000
    : Math.max(0, Number(saved.dealLeftMs) || 0);

  return {
    level: Math.max(1, Math.floor(Number(saved.level) || 1)),
    trials,
    round,
    hits: Math.max(0, Math.floor(Number(saved.hits) || 0)),
    errors: Math.max(0, Math.floor(Number(saved.errors) || 0)),
    board: freshDeal ? [] : board,
    // Тройка выбранных карт без вердикта — тупик: togglePick четвёртую не примет,
    // а проверять уже некому. Поднимаем максимум две.
    picked: freshDeal ? [] : (Array.isArray(saved.picked) ? saved.picked : [])
      .filter((i, k, arr) => Number.isInteger(i) && i >= 0 && i < board.length && arr.indexOf(i) === k)
      .slice(0, 2),
    startedAt: now - Math.max(0, Number(saved.elapsedMs) || 0),
    dealLimitSec: limit,
    // Свежий расклад получает полный лимит — как при обычной раздаче.
    dealEndAt: limit > 0 ? now + (freshDeal ? limit * 1000 : leftMs) : 0,
    freshDeal,
  };
}

export default function SetGame() {
  const { colors, colorblind } = useTheme();
  const HEX = colorblind ? COLOR_HEX_CB : COLOR_HEX;
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const router = useRouter();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('set_game');   // персист-уровень = trials − 5 (эндуранс серии)
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [trials, setTrials] = useState(() => num('trials', 6));
  const [round, setRound] = useState(0);
  const [board, setBoard] = useState<Card[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [hintBreakdown, setHintBreakdown] = useState<{ shape: boolean; fill: boolean; color: boolean; count: boolean } | null>(null);
  // v1.148: 💡 подсказка — подсветить одну карту гарантированного сета (Валя
  // «нет правильного ответа»: сет есть всегда, но найти бывает трудно).
  const [hintCardIdx, setHintCardIdx] = useState<number | null>(null);
  // v1.169 (репорт Вали «тут нет правильного ответа»): при истечении времени доска
  // МОЛЧА подменялась на новую — ошибка засчитана, стол исчез. С места игрока это
  // неотличимо от «сета тут и не было», а доказать обратное нечем: подсказка
  // помогает только если успел нажать ДО таймера. Сет на столе есть всегда
  // (buildBoard пересдаёт, пока не найдёт), поэтому просто показываем какой.
  const [revealedSet, setRevealedSet] = useState<number[] | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата для баннера (проход/«почти»)
  // v1.164: блок «Пример» РАЗВЁРНУТ по умолчанию. Сам пример «валидный vs невалидный
  // SET» есть с v1.148, но был свёрнут — тестировщик его просто не нашёл («не нашёл "?"»).
  // Правила SET неочевидны с нуля, поэтому первый экран должен показывать их сразу;
  // кому не нужно — сворачивает одним нажатием.
  const [showExample, setShowExample] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);
  const timeLimitRef = useRef(0);
  /**
   * v1.176: ЛИМИТ НА РАСКЛАД БОЛЬШЕ НЕ НЕВИДИМКА.
   *
   * 🔴 ЧТО ЛОМАЛОСЬ. С L11 на каждый расклад даётся max(8, 30−(L−10)·4) секунд
   * (26 с на L11 → 10 с на L15). Не успел — штраф ✗, а проход уровня решается
   * ровно по числу ошибок. В шапке при этом висел только общий секундомер: он
   * растёт, а сколько осталось на ТЕКУЩИЙ расклад — не было видно нигде.
   * Человек терял уровень по часам, которых ему не показали.
   *
   * ⚠️ ПОЧЕМУ ЗАМЕНИЛ setTimeout НА ДЕДЛАЙН ПО ИГРОВЫМ ЧАСАМ. Два повода:
   *  1) setTimeout идёт по настенным часам и НЕ замирает на паузе (gamePause):
   *     пока человек пишет отзыв, расклад успевал протухнуть. Ровно тот репорт
   *     «пока я писала отзыв, игра моя закончилась».
   *  2) Показывать остаток можно только от дедлайна — из setTimeout остаток не
   *     достать. Один источник правды (`dealEndRef`) лучше двух рассинхронных.
   */
  const dealEndRef = useRef(0);                 // отметка игровых часов, когда расклад истекает; 0 = лимита нет
  const [dealLimit, setDealLimit] = useState(0);  // лимит текущей партии в секундах (0 = его нет) — рулит показом бейджа
  const [dealLeft, setDealLeft] = useState(0);    // сколько осталось на расклад — то самое, чего не было видно
  /**
   * Колбэк таймера обязан видеть СВЕЖУЮ доску. Прежний `setTimeout(() =>
   * handleTimeout())` захватывал замыкание того рендера, в котором раздавали
   * расклад, а доска там ещё прошлая — findAnySet считал сет по старой раздаче
   * и подсвечивал произвольные три карты на новой. Ref всегда указывает на
   * обработчик последнего рендера.
   */
  const timeoutFnRef = useRef<() => void>(() => {});

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Справка правил уровня: только в личной игре (в зарядке-пресете лимита времени нет, бейдж скрыт)
  const levelRules = useLevelRules('set_game', lvl.level, SG_RULES, phase === 'playing' && !isPreset);

  const handleTimeout = () => {
    dealEndRef.current = 0;    // отсчёт снят: дальше висит разбор, время на него не капает
    setDealLeft(0);
    setErrors((e) => e + 1);   // не успел найти SET за лимит → штраф
    // Не забираем доску молча: подсвечиваем сет, который тут был, и ждём «Понятно».
    // Так штраф превращается в объяснение, а не в «игра меня обманула».
    const s = findAnySet(board);
    if (s) { setRevealedSet(s); return; }
    newRound();   // теоретически недостижимо — buildBoard гарантирует сет
  };
  timeoutFnRef.current = handleTimeout;   // каждый рендер — свежий обработчик для тика часов

  /** Пустить отсчёт на текущий расклад заново (раздача или закрытый разбор ошибки). */
  const armDealClock = () => {
    if (timeLimitRef.current <= 0) { dealEndRef.current = 0; setDealLeft(0); return; }
    dealEndRef.current = gameNow() + timeLimitRef.current * 1000;
    setDealLeft(timeLimitRef.current);
  };

  /** Закрыть показ «вот он был» и раздать новую доску. */
  const dismissRevealed = () => {
    setRevealedSet(null);
    newRound();
  };

  const newRound = () => {
    setBoard(buildBoard()); setPicked([]); setFeedback(null); setHintBreakdown(null); setHintCardIdx(null); setRevealedSet(null);
    armDealClock();   // лимит времени на SET — теперь виден в шапке
  };

  // 💡 Подсветить первую карту любого валидного сета на поле. Бесплатно —
  // цена и так зашита во время (score штрафуется секундами).
  const showHintCard = () => {
    const s = findAnySet(board);
    if (s) setHintCardIdx(s[0]);
  };

  // «Понятно» после ошибки: разбор висит, пока человек его не закрыл
  // (Валя: «показал ошибки так быстро, что не успела прочитать»).
  const dismissWrong = () => {
    setPicked([]);
    setFeedback(null);
    setHintBreakdown(null);
    armDealClock();   // разбор закрыт — отсчёт пошёл заново, с полного лимита
  };

  /**
   * Один тик на всё: и общий секундомер, и остаток на расклад. Часы игровые —
   * на паузе (виджет отзыва) стоят оба, иначе расклад сгорал бы, пока человек пишет.
   * `start` приходит аргументом: у свежей партии это «сейчас», у поднятой из
   * хранилища — «сейчас минус накопленное», чтобы секундомер продолжил, а не начал.
   */
  const runClock = (start: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const now = gameNow();
      setElapsedTime((now - start) / 1000);
      if (dealEndRef.current > 0) {
        const left = (dealEndRef.current - now) / 1000;
        setDealLeft(Math.max(0, left));
        if (left <= 0) timeoutFnRef.current();   // штраф — ровно в тот момент, когда ноль виден на экране
      }
    }, 100);
  };

  const startGame = () => {
    // Новая партия заменяет незаконченную: старую раскладку продолжать уже нечем.
    const pidStart = profile?.id;
    if (pidStart) clearResume(SET_GAME_ID, pidStart).catch(() => {});
    const p = isPreset ? { trials, timeLimit: 0 } : levelParams(lvl.level);   // уровень рулит: trials → лимит времени на SET
    levelRef.current = lvl.level;
    timeLimitRef.current = p.timeLimit;
    setDealLimit(p.timeLimit);
    if (!isPreset) setTrials(p.trials);
    setHits(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = gameNow();
    setStartTime(start);
    setElapsedTime(0);
    runClock(start);
  };

  /** Поднять партию из снимка — стол оживает ровно таким, каким его оставили. */
  const applyResume = (r: SetRestored) => {
    levelRef.current = r.level;
    timeLimitRef.current = r.dealLimitSec;
    setDealLimit(r.dealLimitSec);
    setTrials(r.trials);
    setRound(r.round);
    setHits(r.hits);
    setErrors(r.errors);
    setFeedback(null); setHintBreakdown(null); setHintCardIdx(null); setRevealedSet(null);
    if (r.freshDeal) {
      // Прошлый расклад отыгран (сет собран или показан по таймауту) — раздаём новый.
      setBoard(buildBoard());
      setPicked([]);
    } else {
      setBoard(r.board);
      setPicked(r.picked);
    }
    // ⚠️ Дедлайн ставим САМИ, а не через armDealClock: тот всегда даёт полный лимит,
    // а здесь обязан остаться ровно тот остаток, что был на момент ухода.
    dealEndRef.current = r.dealEndAt;
    setDealLeft(r.dealEndAt > 0 ? Math.max(0, (r.dealEndAt - gameNow()) / 1000) : 0);
    setStartTime(r.startedAt);
    setElapsedTime(Math.max(0, (gameNow() - r.startedAt) / 1000));
    runClock(r.startedAt);
    setPhase('playing');
  };

  /** Есть что терять → «назад» спросит, а не выбросит молча (см. setHasSomethingToLose). */
  const armed = setHasSomethingToLose({ phase, hits, errors, round });

  /**
   * Живая партия для записи. Читаем через ref, а не из замыкания: снимок обязан
   * быть свежим на МОМЕНТ ухода, иначе допишем состояние прошлого хода — и
   * остаток лимита окажется от него же.
   */
  const liveRef = useRef<{ pid?: string; snap: () => SetResume | null }>({ snap: () => null });
  liveRef.current = {
    pid: profile?.id,
    snap: () => snapshotSetParty({
      phase, level: levelRef.current, trials, round, hits, errors, board, picked,
      startedAt: startTime,
      dealLimitSec: dealLimit,
      dealEndAt: dealEndRef.current,
      verdict: revealedSet ? 'revealed' : feedback === 'right' ? 'right' : feedback === 'wrong' ? 'wrong' : 'none',
    }, gameNow()),
  };

  /**
   * Дописать партию. Зовётся из двух мест: ПЕРЕД вопросом при выходе
   * (`onSaveBeforeExit` у каркаса) и отложенно по ходу партии. Первое
   * обязательно: человек видит «партия сохранится» — обещание должно быть уже
   * выполнено, а не зависеть от того, доживёт ли экран до размонтажа.
   */
  const saveParty = useCallback(() => {
    const { pid, snap } = liveRef.current;
    if (!pid) return;
    const s = snap();
    if (!s) return;
    saveResume<SetResume>(SET_GAME_ID, pid, SET_RESUME_V, s).catch(() => {});
  }, []);

  /**
   * Отложенная запись по ходу партии — страховка на случай, когда экран сносят
   * мимо всех кнопок (система убила приложение). Пишет ЖИВОЕ состояние в момент
   * срабатывания, поэтому задержка стоит максимум 400 мс свежести, а не целый ход.
   */
  useEffect(() => {
    if (!armed) return;
    const tm = setTimeout(saveParty, RESUME_DEBOUNCE_MS);
    return () => clearTimeout(tm);
  }, [armed, board, picked, hits, errors, round, feedback, revealedSet, saveParty]);

  /**
   * Подъём партии при входе. Путь зарядки (autostart) не трогаем: там человек
   * явно запустил свежий шаг, и поднятая партия подменила бы заданный уровень.
   */
  useResumeBoot<SetResume>(SET_GAME_ID, SET_RESUME_V, (saved) => {
    const live = restoreSetParty(saved, gameNow());
    if (live) applyResume(live);
  }, autostart);

  const togglePick = (i: number) => {
    if (feedback !== null) return;
    if (picked.includes(i)) { setPicked(picked.filter((x) => x !== i)); return; }
    if (picked.length >= 3) return;
    const next = [...picked, i];
    setPicked(next);
    if (next.length === 3) checkSet(next);
  };

  const checkSet = async (sel: number[]) => {
    dealEndRef.current = 0;   // ответ дан — снять лимит времени на расклад
    const ok = isSet(board[sel[0]], board[sel[1]], board[sel[2]]);
    setFeedback(ok ? 'right' : 'wrong');
    if (ok) { hapticSuccess(); setHits((h) => h + 1); } else {
      hapticError();
      setErrors((e) => e + 1);
      // Generate hint breakdown for wrong answer
      setHintBreakdown(explainSet(board[sel[0]], board[sel[1]], board[sel[2]]));
    }
    // v1.148: разбор ошибки больше НЕ исчезает сам — закрывается кнопкой
    // «Понятно» (dismissWrong). Автотаймер остался только у верного ответа.
    if (!ok) return;
    const delay = 700;
    setTimeout(async () => {
      if (ok) {
        if (round >= trials) {
          if (timerRef.current) clearInterval(timerRef.current);
          const pidDone = profile?.id;
          if (pidDone) clearResume(SET_GAME_ID, pidDone).catch(() => {});   // доиграна — продолжать нечего
          const finalTime = (gameNow() - startTime) / 1000;
          setElapsedTime(finalTime);
          const passed = !isPreset && errors <= 1;
          if (isPreset) {
            setPhase('result');   // пресет/свободный режим — экран статистики, уровень не трогаем
          } else {
            if (passed) lvl.reach(levelRef.current + 1);   // серия почти без ошибок → +уровень
            else lvl.fail();                                // и обратно: три провала подряд → −1 уровень
            if (passed && levelRef.current % BOSS_EVERY === 0) {
              // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
              setClearedPassed(true);
              setPhase('boss');
            } else {
              setClearedPassed(passed);
              setPhase('cleared');   // непрерывный поток: и проход, и провал → баннер (passed рулит текстом), без тупика
            }
          }
          try {
            await saveSession({
              passed,
              game_type: 'set_game',
              score: Math.max(0, (hits + 1) * 200 - errors * 50 - Math.floor(finalTime)),
              time_seconds: finalTime,
              difficulty: 'medium',
              mode: `${trials}t`,
              errors,
              details: { level: levelRef.current, hits: hits + 1, errors, trials },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound((r) => r + 1);
          newRound();
        }
      }
    }, delay);
  };

  // Скринридер не видит фигуру — собираем описание из тех же 4 признаков,
  // по которым игрок ищет сет: количество, цвет, заливка, форма.
  const cardLabel = (c: Card) =>
    `${c.count} ${t('color_' + c.color).toLowerCase()} ${t('fill_' + c.fill)} ${t('shape_' + c.shape)}`;

  const renderShape = (card: Card, key: number) => {
    const c = HEX[card.color];
    const size = 18;
    const common = { width: size, height: size, marginHorizontal: 2, overflow: 'hidden' as const };
    // v1.148: штриховка — РЕАЛЬНЫЕ полоски вместо полупрозрачной заливки
    // (репорт Вали: «нет правильного ответа» — сет был через striped, но
    // бледная заливка на разных формах читалась то как open, то как solid).
    // Один и тот же рисунок полос на всех трёх формах.
    const fillStyle = card.fill === 'solid'
      ? { backgroundColor: c, borderColor: c, borderWidth: 2 }
      : { backgroundColor: 'transparent', borderColor: c, borderWidth: 2 };
    const stripes = card.fill === 'striped' ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <View style={{ position: 'absolute', top: '22%', left: 0, right: 0, height: 2, backgroundColor: c }} />
        <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, backgroundColor: c }} />
        <View style={{ position: 'absolute', top: '78%', left: 0, right: 0, height: 2, backgroundColor: c }} />
      </View>
    ) : null;
    if (card.shape === 'circle') {
      return <View key={key} style={[common, { borderRadius: size / 2 }, fillStyle]}>{stripes}</View>;
    }
    if (card.shape === 'square') {
      return <View key={key} style={[common, { borderRadius: 3 }, fillStyle]}>{stripes}</View>;
    }
    // triangle: use rotated square w/ clip — simple approximation with View
    return (
      <View key={key} style={[common, { borderRadius: 3, transform: [{ rotate: '45deg' }] }, fillStyle]}>{stripes}</View>
    );
  };

  const renderCard = (card: Card, i: number) => {
    const sel = picked.includes(i);
    const hinted = (hintCardIdx === i || !!revealedSet?.includes(i)) && !sel;
    const fbColor = sel && feedback === 'right' ? '#22c55e' : sel && feedback === 'wrong' ? '#f43f5e' : null;
    return (
      <TouchableOpacity key={i} onPress={() => togglePick(i)} disabled={feedback !== null || revealedSet !== null}
        accessibilityRole="button" accessibilityLabel={cardLabel(card)}
        accessibilityState={{ selected: sel, disabled: feedback !== null }}
        style={[styles.card, {
          backgroundColor: colors.surface,
          borderColor: fbColor || (sel ? GRADIENT[1] : hinted ? '#f5b50a' : colors.border),
          borderWidth: sel || hinted ? 3 : 1,
        }]}>
        <View style={styles.shapeRow}>
          {Array.from({ length: card.count }).map((_, k) => renderShape(card, k))}
        </View>
      </TouchableOpacity>
    );
  };

  // Статичная карточка для примера: тот же вид, что в игре (styles.card + renderShape), но без тапа.
  const renderExampleCard = (card: Card, verdictColor: string) => (
    <View key={card.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: verdictColor, borderWidth: 2 }]}>
      <View style={styles.shapeRow}>
        {Array.from({ length: card.count }).map((_, k) => renderShape(card, k))}
      </View>
    </View>
  );

  // ЗАЧЕМ ScrollView: раскрытый «Пример» удлиняет конфиг — на малых экранах кнопка
  // «Старт» уезжала бы за край (паттерн конфига-скролла как в mnemonics/schulte).
  const renderConfig = () => (
    <>
    <ScrollView showsVerticalScrollIndicator={false}>
    <View style={styles.configContainer}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="shapes" size={48} color={ON_GRAD.color} />
        <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{t('setGame')}</Text>
        <Text style={[styles.configDesc, { color: ON_GRAD_SOFT }]}>{t('setGameDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="setGameIntroDesc" benefits={SET_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="set_game" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          accessibilityRole="button" style={styles.exampleHeader} onPress={() => setShowExample((v) => !v)}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('setExampleTitle')}
          </Text>
          <Ionicons name={showExample ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        {showExample && (
          <View style={styles.exampleBody}>
            <View style={styles.exampleRow}>{EXAMPLE_VALID.map((c) => renderExampleCard(c, '#22c55e'))}</View>
            <Text style={[styles.exampleCaption, { color: '#22c55e' }]}>
              {t('setExampleValid')}
            </Text>
            <View style={styles.exampleRow}>{EXAMPLE_INVALID.map((c) => renderExampleCard(c, '#f43f5e'))}</View>
            <Text style={[styles.exampleCaption, { color: '#f43f5e' }]}>
              {t('setExampleInvalid')}
            </Text>
            <Text style={[styles.exampleNote, { color: colors.textSecondary }]}>
              {t('setExampleNote')}
            </Text>
            {/* v1.148: советы по логике поиска (запрос Дениса по волне Вали) */}
            <View style={[styles.tipsBox, { borderColor: colors.border }]}>
              <Text style={[styles.tipsTitle, { color: colors.text }]}>{t('setTipsTitle')}</Text>
              <Text style={[styles.tipItem, { color: colors.textSecondary }]}>1. {t('setTip1')}</Text>
              <Text style={[styles.tipItem, { color: colors.textSecondary }]}>2. {t('setTip2')}</Text>
              <Text style={[styles.tipItem, { color: colors.textSecondary }]}>3. {t('setTip3')}</Text>
            </View>
          </View>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[3, 6, 10].map((n) => (
            <TouchableOpacity
              accessibilityRole="button" key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
    </ScrollView>
    {/* Прибитая полоса: «Начать» видно сразу. Отчёт Дениса 02.09.2026 пришёл
        именно с этого экрана — он длинный, и кнопка лежала ниже окна. */}
    <GameSetupBar label={t('start')} onStart={startGame}
      colors={GRADIENT as [string, string]} tint={ON_GRAD.color} />
    </>
  );

  // игровая фаза — на едином каркасе GameShell; модалка правил уровня — поверх (паттерн digit-span)
  // Доска остаётся видна и после победы — она и есть награда; карточка итога
  // висит поверх неё (решение Дениса «карточка над всей доской»).
  if (phase === 'playing' || phase === 'cleared') {
    return (
      <View style={{ flex: 1 }}>
        {phase === 'cleared' && (
          <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
            <LevelCleared
          variant="overlay" gameId="set_game" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
          </View>
        )}
        <GameShell
          title={t('setGame')}
          onBack={() => goBackOrHome()}
          /**
           * Выход из живой партии больше не молчит. Спрашиваем только когда терять
           * действительно есть что: на свежем раскладе без единого действия вопрос
           * был бы шумом (см. setHasSomethingToLose). `resumable` здесь правда —
           * потому текст и обещает продолжение: партия ложится в хранилище ещё до
           * вопроса, а не после ответа.
           */
          confirmExit={armed}
          resumable
          onSaveBeforeExit={saveParty}
        /**
         * Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4).
         * Остаток времени на расклад остаётся в `stats` отдельной плашкой: по нему
         * начисляется ✗, а по ✗ решается проход уровня.
         */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${trials}`, pop: true },
          { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
          { key: 'time', icon: 'time', label: t('time'), value: hudTime(elapsedTime, t('secShort')) },
          ...(!isPreset ? [{ key: 'lvl', icon: 'flag' as const, label: t('label_level_short'), value: lvl.level }] : []),
        ]}
          stats={
            <View style={styles.statsRow}>
              {/* Остаток на ТЕКУЩИЙ расклад. Бейдж-пилюля, а не ещё одна серая
                  цифра в ряду: по этим секундам начисляется ✗, а по ✗ решается
                  проход уровня — промахнуться взглядом мимо неё нельзя.
                  Краснеет на последних 5 с. */}
              {dealLimit > 0 && (
                <HudBadge
                  icon="timer-outline" label={t('timeLeftLabel')}
                  value={`${Math.ceil(dealLeft)}${t('secShort')}`}
                  colors={dealLeft <= 5 ? ['#fb7185', '#e11d48'] : ['#60a5fa', '#2563eb']}
                  pop={dealLeft <= 5}
                />
              )}
              {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />}
            </View>
          }
        >
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('setHint')}</Text>
            {hintBreakdown && feedback === 'wrong' && (
              <View style={[styles.hintBox, { backgroundColor: '#f43f5e22', borderColor: '#f43f5e' }]}>
                <Text style={[styles.hintTitle, { color: '#f43f5e' }]}>{t('label_not_set')}</Text>
                <View style={styles.hintRow}>
                  <Text style={[styles.hintItem, { color: hintBreakdown.shape ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.shape ? '✓' : '✗'} {t('label_shape')}
                  </Text>
                  <Text style={[styles.hintItem, { color: hintBreakdown.color ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.color ? '✓' : '✗'} {t('label_color')}
                  </Text>
                  <Text style={[styles.hintItem, { color: hintBreakdown.fill ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.fill ? '✓' : '✗'} {t('label_fill')}
                  </Text>
                  <Text style={[styles.hintItem, { color: hintBreakdown.count ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.count ? '✓' : '✗'} {t('label_count_short')}
                  </Text>
                </View>
                <Text style={[styles.hintRule, { color: colors.textSecondary }]}>
                  {t('hint_set_rule')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button" onPress={dismissWrong} style={[styles.gotItBtn, { backgroundColor: '#f43f5e' }]}>
                  <Text style={styles.gotItText}>{t('setGotIt')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* v1.169: время вышло — вместо молчаливой подмены доски показываем сет,
                который на ней был. Подсвечены все три карты, панель ждёт «Понятно».
                Прямой ответ на «тут нет правильного ответа»: вот он. */}
            {revealedSet && (
              <View style={[styles.hintBox, { backgroundColor: '#f5b50a22', borderColor: '#f5b50a' }]}>
                <Text style={[styles.hintTitle, { color: '#f5b50a' }]}>{t('setTimeUpTitle')}</Text>
                <Text style={[styles.hintRule, { color: colors.textSecondary }]}>{t('setTimeUpBody')}</Text>
                <TouchableOpacity
                  accessibilityRole="button" onPress={dismissRevealed}
                  style={[styles.gotItBtn, { backgroundColor: '#f5b50a' }]}>
                  <Text style={styles.gotItText}>{t('setGotIt')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.boardArea}>
              {board.map(renderCard)}
            </View>
            {feedback === null && (
              <TouchableOpacity
                accessibilityRole="button" onPress={showHintCard} disabled={hintCardIdx !== null}
                style={[styles.hintBtn, { borderColor: '#f5b50a', opacity: hintCardIdx !== null ? 0.45 : 1 }]}>
                <Text style={[styles.hintBtnText, { color: '#b8860b' }]}>💡 {t('setHintBtn')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </GameShell>
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
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
        <Text style={[styles.title, { color: colors.text }]}>{t('setGame')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'lightning', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />

      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 200 - errors * 50 - Math.floor(elapsedTime))}
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
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700' },
  configDesc: { fontSize: 13, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  exampleHeader: { minHeight: 48,  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exampleBody: { gap: 8, alignItems: 'center', marginTop: 2 },
  exampleRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  exampleCaption: { fontSize: 12, fontWeight: '600', textAlign: 'center', maxWidth: 320 },
  exampleNote: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', maxWidth: 320, marginTop: 2 },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 , alignItems: 'center'},
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 12 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center', maxWidth: 360, width: '100%' },
  hintBox: { padding: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', gap: 6, maxWidth: 480, width: '100%' },
  hintTitle: { fontSize: 13, fontWeight: '800' },
  hintRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  hintItem: { fontSize: 13, fontWeight: '700' },
  hintRule: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', maxWidth: 360, width: '100%' },
  gotItBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 26, borderRadius: 16, marginTop: 2 },
  gotItText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  hintBtn: { minHeight: 48, borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18 , justifyContent: 'center'},
  hintBtnText: { fontSize: 13, fontWeight: '700' },
  tipsBox: { borderTopWidth: 1, paddingTop: 8, marginTop: 4, gap: 4, alignSelf: 'stretch' },
  tipsTitle: { fontSize: 12.5, fontWeight: '700' },
  tipItem: { fontSize: 11.5, lineHeight: 16 },
  boardArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 480, width: '100%' },
  card: { width: 88, height: 64, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  shapeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
