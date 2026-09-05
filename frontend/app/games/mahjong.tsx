/* psygames-game-mahjong · VER 3 · 27.08.2026 */
import GradientSurface from '@/src/components/GradientSurface';
import { hudTime } from '@/src/services/hudTime';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { mahjongLevel, mahjongHidden, canShuffle, shufflesLeft } from '@/src/services/mahjongLevels';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import GameAbout from '@/src/components/GameAbout';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import {HudBadge, ScorePopupLayer, useScorePopups, hapticTap, hapticSuccess, hapticError } from '@/src/components/juice';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import {saveResume, clearResume} from '@/src/services/resume';
import { availablePairs, blockersOf, coveredFromAbove, isFree, tilePlacement, tileScaleFor, layerShadeFor, type Tile, layerOffsetFor } from '@/src/games/mahjong/board';
import { buildPositions, silhouetteForLevel, type SilhouetteKey } from '@/src/games/mahjong/silhouettes';
import { layoutForLevel } from '@/src/games/mahjong/layouts';
import { mahjongExtent } from '@/src/games/mahjong/extent';
import { dealSolvable, type Place } from '@/src/games/mahjong/vendor/solvable';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';

/** Костяная плашка под символом. Толщину плитки по-прежнему рисует код
 *  (`borderBottomWidth`): в картинке только ЛИЦО, вид строго сверху. */
const ПЛАШКА = require('@/assets/images/games/mahjong-tile.webp');

const GRADIENT = ['#2d6a4f', '#95d5b2'];
// Тёмно-зелёный `#04341f` был подобран на глаз и на тёмном конце давал 2.17 —
// сплошным цветом этот градиент AA не берёт вовсе. Цвет и вуаль считает сервис.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const MAHJONG_BENEFITS = [
  { icon: 'search-outline', textKey: 'benefitMahjong1' },
  { icon: 'git-branch-outline', textKey: 'benefitMahjong2' },
  { icon: 'eye-outline', textKey: 'benefitMahjong3' },
];

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»).
// Главное, что игрок не понимает — правило СВОБОДНОЙ плитки, поэтому оно в обоих текстах.
const MAHJONG_RULES: LevelRule[] = [
  {
    key: 'layers2', fromLevel: 1, toLevel: 3,
    ru: { title: 'Два слоя', rule: 'Плитки теперь лежат в 2 слоя. Брать можно только СВОБОДНУЮ плитку: на ней никто не лежит И у неё открыт левый или правый край. Тусклые плитки заблокированы.', example: 'Пример: плитка под другой плиткой или зажатая соседями с обоих боков — не нажимается, сначала освободи её.' },
    en: { title: 'Two layers', rule: 'Tiles now stack in 2 layers. You can only pick a FREE tile: nothing lies on it AND its left or right side is open. Dimmed tiles are blocked.', example: 'Example: a tile under another tile, or squeezed by neighbors on both sides, cannot be tapped — free it first.' },
  },
  {
    key: 'layers3', fromLevel: 4, toLevel: 8,
    ru: { title: 'Три слоя', rule: 'Пирамида теперь в 3 слоя. Правило то же: свободна плитка, на которой НИЧЕГО не лежит и у которой открыт левый ИЛИ правый край. Разбирай пирамиду сверху вниз.', example: 'Пример: нижняя плитка станет доступна, когда снимешь всё, что её накрывает, и один её бок открыт.' },
    en: { title: 'Three layers', rule: 'The pyramid now has 3 layers. Same rule: a tile is free when NOTHING lies on it and its left OR right side is open. Dismantle the pyramid top-down.', example: 'Example: a bottom tile becomes available once everything covering it is removed and one of its sides is open.' },
  },
  // ⚠️ ПРАВИЛА ОБЯЗАНЫ СОВПАДАТЬ СО СЛОЯМИ из mahjongLevels.ts. До этой правки
  // «Три слоя» стояло без верхней границы, и на 18 уровне игра объясняла три слоя,
  // выкладывая четыре — та самая «молчаливая механика», ради которой правила и заведены.
  {
    key: 'layers4', fromLevel: 9, toLevel: 14,
    ru: { title: 'Четыре слоя', rule: 'Слоёв стало 4, и перетасовка теперь одна на уровень. Правило свободной плитки не меняется — меняется цена ошибки: снимать надо сверху и с краёв, иначе запрёшь низ.', example: 'Пример: пара в самом низу может стать недоступной, если разобрать середину не с того края. Смотри на два хода вперёд.' },
    en: { title: 'Four layers', rule: 'Four layers now, and you get one shuffle per level. The free-tile rule is unchanged — what changes is the cost of a mistake: clear from the top and the edges, or you will lock the bottom.', example: 'Example: a bottom pair can become unreachable if you open the middle from the wrong side. Think two moves ahead.' },
  },
  /**
   * СКРЫТАЯ ИНФОРМАЦИЯ (ec15d176, §20): каждый третий уровень с десятого лица
   * накрытых плиток прячет — правило объясняется на первом таком уровне.
   * Тексты ТОЛЬКО в словаре (lr_mahjong_hidden_*): инлайн ru/en в новых
   * правилах запрещён — он знает два языка из двенадцати.
   */
  { key: 'hidden', fromLevel: 10, toLevel: 10 },
  {
    key: 'layers5', fromLevel: 15,
    ru: { title: 'Пять слоёв', rule: 'Пять слоёв — верх пирамиды узкий, низ широкий. Перетасовка одна. Здесь уже нельзя брать любую доступную пару: почти каждый снятый тайл открывает или запирает что-то ниже.', example: 'Пример: две одинаковые плитки свободны, но одна из них держит крышку над последней парой — бери ту, что не держит.' },
    en: { title: 'Five layers', rule: 'Five layers — a narrow top over a wide base. One shuffle. You can no longer take just any available pair: almost every tile you remove opens or locks something below.', example: 'Example: two identical tiles are free, but one of them caps the last pair — take the other one.' },
  },
];

// Символы тайлов — эмодзи (универсально, без ассетов). До 12 видов, кладутся ПАРАМИ.
/**
 * РИСУНКИ ПЛИТОК — ТРИДЦАТЬ ШЕСТЬ, КАК В НАБОРЕ.
 *
 * 🔴 БЫЛО ДВЕНАДЦАТЬ, И ЭТО ЛОМАЛО ИГРУ НА ВЕРХНИХ УРОВНЯХ. Символы раздаются
 * по кругу (`k % SYMBOLS.length`), поэтому при 72 парах на двенадцати рисунках
 * выходило по ШЕСТЬ пар каждого — двенадцать одинаковых плиток на доске. Замер:
 *
 *     ур. 1  (10 пар) — максимум 2 копии символа
 *     ур. 12 (36 пар) — 6 копий
 *     ур. 20 (60 пар) — 10 копий
 *     ур. 40 (72 пары) — 12 копий
 *
 * В настоящем наборе маджонга копий РОВНО ЧЕТЫРЕ: 36 рисунков × 4 = 144 плитки.
 * Двенадцать одинаковых — это не сложнее, а проще и уродливее: пара находится
 * взглядом мгновенно, а доска читается как стена из повторов. Тридцать шесть
 * рисунков дают ровно две пары на рисунок при полном наборе — то есть четыре
 * копии, как положено.
 *
 * ⚠️ Только широко поддержанные знаки (Emoji 1.0–5.0): на телефоне 2016 года
 * новинка нарисуется квадратом, и плитка станет неотличима от другой такой же.
 */
const SYMBOLS = [
  '🀄', '🎋', '🌸', '🐉', '🀙', '⭐', '🍀', '🔥', '💎', '🌙', '🎴', '🐲',
  '🍁', '🌊', '⚡', '❄️', '☀️', '🍎', '🍇', '🍋', '🐟', '🦋', '🐢', '🐧',
  '🐝', '🌺', '🌵', '🍄', '🎯', '🎲', '🔔', '⚓', '🎵', '🌈', '🎈', '🍒',
];

/** Копий одного рисунка в настоящем наборе. Больше — уже не маджонг. */
export const MAX_COPIES = 4;

/** Сколько держится подсветка виновных плиток. Дольше — она станет разметкой. */
const BLOCKERS_MS = 1600;

/** Сколько рисунков в наборе — наружу ради проверок. */
export const SYMBOL_COUNT = SYMBOLS.length;
export { SYMBOLS };

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

/**
 * Плитка, правило свободы и счётчик доступных пар переехали в
 * `src/games/mahjong/board.ts` — их зовут и силуэты, и проверки, и шапка, а тянуть
 * ради них весь экран с роутером и контекстами незачем. Реэкспорт оставлен: старые
 * импорты `from '@/app/games/mahjong'` работают как работали.
 */
export type { Tile };
export { isFree, availablePairs };

/** Ключ незаконченной партии — совпадает с id в реестре игр (карточка «Продолжить»). */
const GAME_ID = 'mahjong';

/**
 * Версия формата снимка. Поднимать при ЛЮБОМ изменении полей MahjongResume:
 * старая запись тогда не подойдёт под новый код и будет молча выброшена,
 * а не оживит доску с недостающими полями.
 */
const RESUME_V = 1;

/**
 * Снимок недоигранной раскладки.
 *
 * ⚠️ ПОЧЕМУ ЦЕЛИКОМ tiles, А НЕ «уровень + сколько снято». Раскладка строится
 * случайно (buildPositions + shuffle символов): по номеру уровня её не
 * воспроизвести, а по числу снятых пар — тем более. Пирамида, которую человек
 * разбирал двадцать минут, существует ровно в одном экземпляре.
 *
 * `aliveMask` не храним: игра после каждой снятой пары пересобирает массив
 * tiles и делает маску сплошь живой — она выводится из самих tiles.
 */
interface MahjongResume {
  level: number;
  tiles: Tile[];
  matched: number;
  pairsTotal: number;
  errors: number;
  score: number;
  shufflesUsed: number;
  /** Накопленные секунды, а не момент старта: между сессиями настенные часы уходят вперёд. */
  elapsed: number;
  /**
   * Потраченные отмены — ресурс уровня, как и перетасовки, поэтому переживает выход.
   * Не храни его — и «выйти-зайти» стало бы бесплатной дозаправкой бюджета.
   *
   * ⚠️ ПОЧЕМУ RESUME_V НЕ ПОДНЯТ. Поле ДОБАВЛЕНО и НЕОБЯЗАТЕЛЬНО: у старой записи
   * его нет, читается оно через `?? 0`, и никакая доска не оживает с дырой. Правило
   * «поднимать версию при изменении полей» стережёт ровно этот случай — недостающее
   * обязательное поле; здесь его нет, а бампом версии мы выбросили бы все
   * недоигранные пирамиды ради одного счётчика.
   */
  undosUsed?: number;
  /**
   * Метрики скрытого режима (ec15d176) — та же история, что undosUsed: поле
   * ДОБАВЛЕНО и необязательно, у старых записей его нет, читается с дефолтом,
   * RESUME_V не поднят. Без него «выйти-зайти» обнуляло бы счётчик пересмотров
   * и время первого хода на скрытом уровне.
   */
  hiddenStats?: { firstMoveMs: number | null; planRevisions: number; movesBeforeFirstReveal: number | null; moves: number };
}

/**
 * Снимок доски ПЕРЕД снятием пары. Всё, что снятие меняет, — здесь.
 *
 * Почему снимок, а не «положить две плитки обратно». Снятие пары перестраивает
 * массив `tiles` целиком (фильтрация ломает индексы), заново собирает маску живых
 * и двигает два счётчика сразу. Обратный ход пришлось бы держать в согласии со
 * всеми четырьмя местами; разойдётся хоть одно — доска встанет в состояние,
 * которого в игре никогда не было, а это хуже, чем отсутствие отмены.
 *
 * `errors` тут нет намеренно: промах по НЕ-паре плиток не снимает, это не ход и
 * откатывать в нём нечего. `pairsTotal` не меняется. `shufflesUsed` — см. ниже,
 * перетасовка ленту обнуляет.
 */
interface MahjongSnapshot {
  tiles: Tile[];
  matched: number;
  score: number;
}

/**
 * СКОЛЬКО ОТМЕН НА УРОВЕНЬ — И ПОЧЕМУ ОНИ ВООБЩЕ ПЛАТНЫЕ.
 *
 * 🔴 В сортировке товаров отмена бесплатна, и это правильно: там игра с ПОЛНОЙ
 * информацией, все товары на виду, перебором ничего не разведаешь. Маджонг —
 * другой случай, и разница ровно одна: плитка верхнего слоя ЗАКРЫВАЕТ ту, что под
 * ней. Снял пару — увидел, что лежало ниже. Отмена возвращает плитки на место, но
 * УВИДЕННОЕ не забирает. Значит бесплатная отмена — это «вскрыл всю пирамиду,
 * посмотрел, откатил»: разведка задаром, а вся сложность верхних уровней («не
 * запри низ») держится именно на том, что низа не видно.
 *
 * Поэтому бюджет, и на том же языке, что и перетасовки: остаток виден НА кнопке.
 *
 * Три — не круглое число, а прикидка: хватает исправить промах пальцем и одну
 * настоящую ошибку в разборе, не хватает просветить пирамиду из тридцати с
 * лишним пар. Бюджет НЕ ужимается с уровнем, в отличие от перетасовок: чем
 * глубже уровень, тем дороже стоит именно случайное касание, и наказывать за
 * дрогнувший палец сильнее там, где партия длиннее, — ровно наоборот здравому
 * смыслу.
 */
const UNDOS_PER_LEVEL = 3;

// Параметры уровня живут в services/mahjongLevels.ts — там же лимит перетасовок
// и объяснение, почему вверх растим слои, а не количество плиток.
const levelParams = mahjongLevel;

// ── Построение позиций раскладки ─────────────────────────────────────
/**
 * СИЛУЭТ РАСКЛАДКИ — в `src/games/mahjong/silhouettes.ts`.
 *
 * 🔴 ЧТО БЫЛО ЗДЕСЬ. Одна функция `layerCells`, рисовавшая РОМБ, и `buildPositions`,
 * складывавшая ромбы стопкой со сдвигом на клетку вбок. Силуэт был ровно один: любая
 * доска первого уровня и любая сорокового отличались только числом плиток. У
 * образцов (Vita Mahjong, Mahjong Blast) витринная строка — «сотни раскладок», и
 * держится она на форме, а не на количестве.
 *
 * Теперь форм семь (черепаха, пирамида, крепость, бабочка, мост, паук, ромб), уровень
 * выбирает свою по номеру, и соседние уровни никогда не совпадают по виду.
 */

// ── Генерация РЕШАЕМОЙ раскладки («обратный» метод) ──────────────────
// 1) Берём позиции пирамиды. 2) Повторно выбираем ДВЕ свободные позиции и
//    назначаем им одинаковый символ, «снимая» их — порядок снятия = гарантия
//    решаемости (мы строим решение задом наперёд). Символы идут парами.
/**
 * Порядок, в котором пары СНИМАЛИСЬ при сборке. Обратный ему — готовое решение
 * доски, и это единственное, чем решаемость здесь гарантируется. Наружу отдаётся
 * ради проверки: обещание, которое нечем перепроверить, живёт ровно до первой
 * правки генератора.
 */
export interface MahjongDeal { tiles: Tile[]; peelOrder: [number, number][] }

/** Пустой ответ = собрать разбираемую доску не вышло, надо пересобрать. */
export function generate(
  layers: number, pairs: number, cols: number, shape: SilhouetteKey = 'diamond', places?: Place[],
): Tile[] {
  return generateDeal(layers, pairs, cols, shape, places).tiles;
}

/**
 * РАЗДАЧА УРОВНЯ. `places` — места из библиотеки раскладок (`layouts.ts`); без них
 * места рисует силуэт, как раньше.
 *
 * 🔴 САМА РАЗДАЧА ПЕРЕЕХАЛА В `vendor/solvable.ts` (алгоритм ffalt/mah, MIT). Здесь
 * стояла его самодельная копия, и повторы при неудаче жили в ЭКРАНЕ: любой второй
 * вызывающий — перетасовка, проверка — получал гарантию слабее, чем думал. Теперь
 * «доска решаема» держит та функция, которая это обещает.
 */
export function generateDeal(
  layers: number, pairs: number, cols: number, shape: SilhouetteKey = 'diamond', places?: Place[],
  /**
   * ⚠️ ИСТОЧНИК СЛУЧАЙНОСТИ — ПАРАМЕТР, И ЭТО РАДИ ПРОВЕРОК, А НЕ РАДИ ИГРЫ.
   * В бою остаётся `Math.random`. Без этого проверка решаемости раздавала доски
   * случайно и оказалась шаткой: локально зелёная, на сборочной машине красная
   * («ур.28 заход 23: budget»). Гейт, который то краснеет, то нет, приучает
   * перезапускать до зелёного — это хуже, чем гейта не иметь.
   */
  rnd: () => number = Math.random,
): MahjongDeal {
  const need = pairs * 2;
  const pos: Place[] = places && places.length >= 2
    ? places
    : buildPositions(layers, need, cols, shape);
  return dealSolvable(pos, SYMBOLS.length, undefined, rnd);
}

export default function MahjongGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { popups, spawn } = useScorePopups();

  const { isPreset, autostart, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечер и ночь: победный звук общей карточки тоже молчит
  const { profile } = useProfile();
  const lvl = usePersistentLevel('mahjong');   // персист достигнутого уровня между сессиями
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [level, setLevel] = useState(1);
  const levelRef = useRef(1);
  const [levelBanner, setLevelBanner] = useState<number | null>(null);
  // Перетасовки ограничены с 6 уровня: без лимита любой расклад пробивался
  // тасованием, и сложность раскладки ничего не решала (отзыв «можно сложнее?»).
  const [shufflesUsed, setShufflesUsed] = useState(0);
  /** Потраченные отмены на этом уровне (бюджет — UNDOS_PER_LEVEL, см. шапку). */
  const [undosUsed, setUndosUsed] = useState(0);
  /** Лента снимков доски: снятие пары обратимо, и в маджонге это половина игры. */
  const history = useMoveHistory<MahjongSnapshot>();
  // Маджонг в зарядке — полноценный пройденный уровень: следующий вход через
  // зарядку должен продолжать лесенку, а не каждый раз возвращать на L1.
  // ⚠️ `phase !== 'playing'` появилось вместе со слоем незаконченной партии.
  // Поднятая из хранилища раскладка задаёт СВОЙ уровень (например 12), а
  // usePersistentLevel догружается позже и своим значением (8) сбивал бы и
  // подпись в HUD, и бюджет перетасовок — доска от одного уровня, правила от
  // другого. Пока идёт партия, уровень задаёт только она сама.
  useEffect(() => { if (lvl.loaded && phase !== 'playing') setLevel(lvl.level); }, [lvl.loaded, lvl.level, phase]);

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  /**
   * 🔴 КТО ДЕРЖИТ ПЛИТКУ — ПОКАЗЫВАЕМ, А НЕ ОСТАВЛЯЕМ ДОГАДЫВАТЬСЯ. Тап по занятой
   * плитке отвечал только вибрацией: «нельзя» есть, «почему» нет. Правило свободной
   * плитки написано в справке, но на доске из шестидесяти штук глазами его не
   * применить. Теперь тап подсвечивает ровно тех, кто её держит.
   */
  const [blockers, setBlockers] = useState<number[]>([]);
  const blockersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [matched, setMatched] = useState(0);          // снятых пар
  const [pairsTotal, setPairsTotal] = useState(0);
  const [errors, setErrors] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scoreRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // alive по id (для рендера/логики свободы из текущих tiles)
  const aliveMaskRef = useRef<boolean[]>([]);
  /**
   * МЕТРИКИ СКРЫТОГО РЕЖИМА (ec15d176, §20.4) — те же три, что в goods-sort:
   * сколько думал до первого хода · сколько раз пересматривал план (отмены) ·
   * сколько ходов сделал до первого вскрытия лица. «Ходы сверх минимума» здесь
   * не считаются и не считались: минимума при неполной информации не существует.
   */
  const hiddenStatsRef = useRef({ firstMoveMs: null as number | null, planRevisions: 0, movesBeforeFirstReveal: null as number | null, moves: 0 });

  // Справка правил уровня (в пресете не всплываем — там свой поток).
  // levelBanner === null: не открывать модалку поверх баннера «Уровень N ✓» — пусть покажется на новой раскладке.
  const levelRules = useLevelRules('mahjong', level, MAHJONG_RULES,
    phase === 'playing' && !isPreset && levelBanner === null);

  const loadLevel = (L: number) => {
    const p = levelParams(L);
    /**
     * ⚠️ ПЕРЕСОБИРАЕМ, ПОКА РАСКЛАД НЕ ВЫЙДЕТ РАЗБИРАЕМЫМ. Сборка снятием пар
     * иногда упирается в тупик (см. `generate`) — это её природа, а не поломка.
     * Двадцать попыток с запасом: замер 22.08.2026 по 200 сборок на каждый из семи
     * силуэтов дал худшее 25 % (пирамида, 20 уровень), значит двадцать подряд —
     * это 0,25²⁰ ≈ 10⁻¹². Если и они не дали, отдаём последнюю: зависший экран
     * хуже трудной доски.
     */
    // Силуэт задаётся НОМЕРОМ уровня: соседние уровни выглядят по-разному, а один
    // и тот же уровень — всегда одинаково (иначе поднятая из хранилища партия
    // оживала бы в другой форме).
    const shape = silhouetteForLevel(L);
    /**
     * РАСКЛАДКА — ИЗ БИБЛИОТЕКИ (84 рисованные вручную доски, ffalt/mah, MIT).
     * Силуэт остаётся запасным путём: если для уровня годной раскладки не нашлось,
     * места рисует формула, как раньше. Пустой экран не показываем ни при каком
     * раскладе.
     */
    const layout = layoutForLevel(L);
    let deck = generate(p.layers, p.pairs, p.cols, shape, layout?.places);
    for (let tries = 0; tries < 20 && deck.length === 0; tries++) {
      deck = generate(p.layers, p.pairs, p.cols, shape, layout?.places);
    }
    aliveMaskRef.current = new Array(deck.length).fill(true);
    setTiles(deck);
    setPairsTotal(deck.length / 2);
    setMatched(0); setErrors(0); setSelected(null);
    setShufflesUsed(0);   // бюджет перетасовок — на уровень, а не на партию
    setUndosUsed(0);      // и бюджет отмен тоже: новая пирамида — новые три попытки
    hiddenStatsRef.current = { firstMoveMs: null, planRevisions: 0, movesBeforeFirstReveal: null, moves: 0 };
    history.reset();      // чужая раскладка в ленте отмены не годится
    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow();
    setStartTime(start); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((gameNow() - start) / 1000), 100);
  };

  const startGame = () => {
    if (!lvl.loaded) return;
    // Новая партия заменяет незаконченную: старую пирамиду продолжать уже нечем.
    if (profile?.id) clearResume(GAME_ID, profile.id).catch(() => {});
    const startLvl = lvl.level;
    scoreRef.current = 0; setScore(0);
    setLevel(startLvl); levelRef.current = startLvl; setLevelBanner(null);
    setShufflesUsed(0);
    loadLevel(startLvl);
    setPhase('playing');
  };

  // AsyncStorage обязан загрузиться до auto-start, иначе тёплый вход стартует с L1.
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ── незаконченная партия ────────────────────────────────────────────────
  /** Что в этой партии уже сделано руками — то, ради чего и стоит спрашивать при выходе. */
  const touched = matched > 0 || errors > 0 || selected !== null || shufflesUsed > 0 || undosUsed > 0;
  /** Живая партия: доска на экране, итог ещё не показан. */
  const liveGame = phase === 'playing' && levelBanner === null && tiles.length > 0;

  const snapshot = (): MahjongResume => ({
    level, tiles, matched, pairsTotal, errors,
    score: scoreRef.current, shufflesUsed, elapsed, undosUsed,
    hiddenStats: { ...hiddenStatsRef.current },
  });

  /** Поднять раскладку из снимка — пирамида оживает ровно такой, какой её оставили. */
  const applyResume = (r: MahjongResume) => {
    aliveMaskRef.current = new Array(r.tiles.length).fill(true);
    setTiles(r.tiles);
    setLevel(r.level); levelRef.current = r.level;
    setPairsTotal(r.pairsTotal); setMatched(r.matched); setErrors(r.errors);
    setShufflesUsed(r.shufflesUsed);
    // `?? 0` — у записи, сделанной до появления отмены, поля просто нет (см. MahjongResume).
    setUndosUsed(r.undosUsed ?? 0);
    hiddenStatsRef.current = r.hiddenStats ?? { firstMoveMs: null, planRevisions: 0, movesBeforeFirstReveal: null, moves: 0 };
    /**
     * Ленту снимков через хранилище НЕ тащим, и это не забывчивость: доска
     * поднимается ровно такой, какой её оставили, а откатывать ходы прошлой
     * сессии нечего — их уже не помнит и сам игрок. Потраченный бюджет при этом
     * цел, поэтому дозаправиться выходом-входом нельзя.
     */
    history.reset();
    scoreRef.current = r.score; setScore(r.score);
    setSelected(null); setLevelBanner(null);
    // Секундомер продолжаем с НАКОПЛЕННОГО: от прежнего startTime партия «шла» бы
    // всё то время, что телефон лежал в кармане.
    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow() - Math.max(0, r.elapsed) * 1000;
    setStartTime(start); setElapsed(r.elapsed);
    timerRef.current = setInterval(() => setElapsed((gameNow() - start) / 1000), 100);
    setPhase('playing');
  };

  // Подъём партии при входе на экран. Путь зарядки (autostart) не трогаем: там
  // человек явно запустил свежий раунд, и startGame сам выбросит старую партию.
  useResumeBoot<MahjongResume>(GAME_ID, RESUME_V, (saved) => {
    if (!saved || !Array.isArray(saved.tiles) || !saved.tiles.length) return;
    applyResume(saved);
  }, autostart);

  // Автосохранение по ходу партии, с задержкой: подряд идущие касания не должны
  // бить по хранилищу каждым нажатием.
  useEffect(() => {
    if (!liveGame || !touched) return;
    const pid = profile?.id;
    if (!pid) return;
    const snap = snapshot();
    const tm = setTimeout(() => { saveResume(GAME_ID, pid, RESUME_V, snap).catch(() => {}); }, 400);
    return () => clearTimeout(tm);
  }, [tiles, matched, errors, shufflesUsed, undosUsed, liveGame, touched]);   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Дописать партию перед уходом. Отложенная запись выше на этом моменте
   * отменяется своим clearTimeout — поэтому пишем ещё раз здесь, и с ЖИВЫМ
   * временем, а не с тем, что было на прошлом ходу.
   */
  const saveBeforeExit = () => {
    const pid = profile?.id;
    if (!pid || !liveGame || !touched) return;
    saveResume(GAME_ID, pid, RESUME_V, snapshot()).catch(() => {});
  };

  const advanceLevel = (finalTime: number) => {
    hapticSuccess();
    const done = levelRef.current;
    const p = levelParams(done);
    scoreRef.current += Math.max(60, Math.round(500 - errors * 20 - finalTime * 2));
    setScore(scoreRef.current);
    saveSession({
      passed: true,   // сессия пишется только когда уровень собран
      game_type: 'mahjong', score: scoreRef.current, time_seconds: finalTime,
      difficulty: done <= 5 ? 'easy' : done <= 10 ? 'medium' : 'hard', mode: `lvl${done}`, errors,
      // Скрытый уровень пишет три метрики §20.4; «ходов сверх минимума» нет ни в
      // одном режиме — минимума при неполной информации не существует.
      details: mahjongHidden(done)
        ? {
            level: done, pairs: p.pairs, layers: p.layers, hidden_info: true,
            time_to_first_move_ms: hiddenStatsRef.current.firstMoveMs,
            plan_revisions: hiddenStatsRef.current.planRevisions,
            moves_before_first_reveal: hiddenStatsRef.current.movesBeforeFirstReveal,
          }
        : { level: done, pairs: p.pairs, layers: p.layers },
    }).catch((e) => console.error(e));
    const next = done + 1;
    setLevel(next); levelRef.current = next;
    // ⚠️ reach, а НЕ setLevel: прямая установка срезала бы потолок после переигровки
    // пройденного уровня. pick следом продолжает цепочку с того места, где играли.
    lvl.reach(next);
    lvl.pick(next);   // выше потолка pick сам обнуляется
    // Итог показывает общая карточка ПОВЕРХ доски (см. рендер): она же и решает,
    // запускать ли следующий уровень — правило режима живёт в ней одной. Своего
    // таймера здесь больше нет: раньше он спорил с таймером зарядки, и человек
    // видел начавшийся уровень 2 и вылет (репорт Вали на v1.193.0).
    setLevelBanner(done);
    // Раскладка разобрана — продолжать нечего, иначе «Продолжить» позвало бы
    // на пустую доску уже пройденного уровня.
    if (profile?.id) clearResume(GAME_ID, profile.id).catch(() => {});
  };

  // Свободен ли тайл с данным индексом среди живых (для тапа и подсветки).
  const tileFree = (i: number) => isFree(tiles, aliveMaskRef.current, i);

  // Экран сняли — гасим подсветку виновных: ставить её некуда.
  useEffect(() => () => { if (blockersTimerRef.current) clearTimeout(blockersTimerRef.current); }, []);

  const handleTilePress = (i: number) => {
    if (phase !== 'playing') return;
    if (!aliveMaskRef.current[i]) return;
    if (!tileFree(i)) {
      // Занята — вибрируем И показываем виновных: отказ без объяснения читается
      // как «не нажалось», а не как «правило не пускает».
      hapticError();
      setBlockers(blockersOf(tiles, aliveMaskRef.current, i));
      if (blockersTimerRef.current) clearTimeout(blockersTimerRef.current);
      blockersTimerRef.current = setTimeout(() => setBlockers([]), BLOCKERS_MS);
      return;
    }
    if (selected === null) { setSelected(i); hapticTap(); return; }
    if (selected === i) { setSelected(null); return; }   // снять выбор

    if (tiles[selected].symbol === tiles[i].symbol) {
      // пара — убираем оба
      // Снимок кладём ДО правки доски: снятие уже необратимо руками (массив
      // пересобирается), и восстановить его можно только из целого снимка.
      history.push({ tiles, matched, score: scoreRef.current });
      const a = selected, b = i;
      // Метрики скрытого режима — ДО правки доски: «вскрылось ли лицо» отвечает
      // сравнение «был накрыт → перестал», а после фильтрации массива старых
      // индексов уже нет. Проверяем только соседей снятой пары: вскрыться могла
      // лишь плитка, которую держали a или b.
      if (mahjongHidden(levelRef.current)) {
        const st = hiddenStatsRef.current;
        st.moves += 1;
        if (st.firstMoveMs === null) st.firstMoveMs = Math.round(gameNow() - startTime);
        if (st.movesBeforeFirstReveal === null) {
          const aliveAfter = aliveMaskRef.current.map((v, idx) => v && idx !== a && idx !== b);
          const uncovered = tiles.some((t2, idx) => {
            if (!aliveAfter[idx]) return false;
            if (!coveredFromAbove(tiles, aliveMaskRef.current, idx)) return false;   // и так был открыт
            return !coveredFromAbove(tiles, aliveAfter, idx);                        // вскрылся этой парой
          });
          if (uncovered) st.movesBeforeFirstReveal = st.moves - 1;
        }
      }
      aliveMaskRef.current[a] = false;
      aliveMaskRef.current[b] = false;
      setTiles((ts) => ts.filter((_, idx) => idx !== a && idx !== b)
        // фильтрация ломает индексы alive-маски → перестроим маску ниже
      );
      // tiles изменили длину — пересоберём alive-маску под новый массив
      const newTiles = tiles.filter((_, idx) => idx !== a && idx !== b);
      aliveMaskRef.current = new Array(newTiles.length).fill(true);
      setSelected(null);
      const m = matched + 1;
      setMatched(m);
      scoreRef.current += 20; setScore(scoreRef.current);
      hapticSuccess();
      spawn(width / 2 - 16, 120, '+1', '#a7f3d0');
      if (m >= pairsTotal) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (gameNow() - startTime) / 1000;
        setElapsed(finalTime);
        // Уровень собран — лента гаснет. Иначе кнопка отмены осталась бы живой
        // над победной карточкой и «отменяла» бы выигранный уровень: очки уже
        // начислены, сессия записана, а доска поехала бы назад.
        history.reset();
        advanceLevel(finalTime);
      }
    } else {
      // не совпали — перевыбор на новый
      setErrors((e) => e + 1);
      hapticError();
      setSelected(i);
    }
  };

  /**
   * Вернуть последнюю снятую пару. Возвращает ВСЁ, что снятие поменяло: доску,
   * маску живых, счётчик пар и очки. Частичный откат (например доска назад, а очки
   * оставить) дал бы фарм очков «снял — отменил — снял».
   */
  const undoMove = () => {
    if (phase !== 'playing' || levelBanner !== null) return;
    if (undosUsed >= UNDOS_PER_LEVEL) return;
    const snap = history.undo();
    if (!snap) return;
    setUndosUsed((n) => n + 1);
    if (mahjongHidden(levelRef.current)) hiddenStatsRef.current.planRevisions += 1;
    // Маска строится по ДЛИНЕ снимка: после снятия она пересобиралась сплошь живой
    // под укороченный массив, и та же логика верна в обратную сторону.
    aliveMaskRef.current = new Array(snap.tiles.length).fill(true);
    setTiles(snap.tiles);
    setMatched(snap.matched);
    scoreRef.current = snap.score; setScore(snap.score);
    setSelected(null);
    hapticTap();
  };

  // Перемешать символы ОСТАВШИХСЯ тайлов (страховка от тупика) — заново решаемо.
  const reshuffle = () => {
    if (tiles.length === 0) return;
    // Перетасовка — расходуемый ресурс, а не бесплатная кнопка «сделай проще».
    if (!canShuffle(levelParams(level).shuffles, shufflesUsed)) return;
    const positions = tiles.map((t) => ({ x: t.x, y: t.y, layer: t.layer }));
    /**
     * 🔴 ЗДЕСЬ ЖИЛ ТОТ ЖЕ ДЕФЕКТ, ЧТО В `generateDeal`, И БИЛ ОН БОЛЬНЕЕ.
     *
     * Перетасовка назначает символы заново тем же снятием пар — и при нехватке
     * свободных так же брала «любые две живые», кладя один символ на пару,
     * которую не взять. То есть человек тратил РЕДКИЙ ресурс (их три на уровень)
     * и получал ровно такую же мёртвую доску. Замер разбора 22.08.2026: на
     * заклинившей раскладке 2000 перетасовок дали НОЛЬ решаемых.
     *
     * Теперь: пробуем до двадцати раз, и если разбираемой расстановки не вышло —
     * перетасовку НЕ ТРАТИМ. Пусть лучше кнопка не сработает, чем сработает и
     * отберёт ресурс впустую.
     */
    const dealSymbols = (): number[] | null => {
      // Тот же раздатчик, что и на старте уровня: перетасовка обязана давать
      // ТАКУЮ ЖЕ гарантию, а не свою копию алгоритма, которая с ним разъедется.
      const deal = dealSolvable(positions, SYMBOLS.length, 20);
      return deal.tiles.length === 0 ? null : deal.tiles.map((t) => t.symbol);
    };

    const symbolOf: number[] | null = dealSymbols();
    if (symbolOf === null) return;                 // ресурс не тратим

    setShufflesUsed((n) => n + 1);
    const total = positions.length - (positions.length % 2);
    const baseTiles: Tile[] = positions.slice(0, total).map((p, i) => ({ id: i, x: p.x, y: p.y, layer: p.layer, symbol: -1 }));
    const next = baseTiles.map((tt, i) => ({ ...tt, symbol: (symbolOf as number[])[i] >= 0 ? (symbolOf as number[])[i] : 0 }));
    aliveMaskRef.current = new Array(next.length).fill(true);
    /**
     * 🔴 ПЕРЕТАСОВКА ОБНУЛЯЕТ ЛЕНТУ ОТМЕНЫ. После неё это ДРУГАЯ доска: символы
     * назначены заново, у плиток новые id. Снимок из старой ленты вернул бы
     * раскладку, которой в этой партии уже нет, — и заодно отменил бы саму
     * перетасовку, оставив её потраченной. Тот же урок, что в сортировке
     * товаров: отмена честна, пока возвращает ровно то, что было.
     */
    history.reset();
    setTiles(next); setSelected(null); hapticTap();
  };

  /**
   * СКОЛЬКО ПАР МОЖНО СНЯТЬ ПРЯМО СЕЙЧАС — цифра в шапку.
   *
   * 🔴 ЗАЧЕМ ЭТО ПОЯВИЛОСЬ. Верхний по полезности отзыв к Vita Mahjong (100 млн
   * установок) — жалоба на то, что из игры убрали окошко «сколько пар ещё можно
   * собрать»: без него человек жмёт перетасовку ВСЛЕПУЮ, не понимая, доска встала
   * или он просто не видит пару. У нас перетасовка расходуемая (одна-три на
   * уровень), значит цена слепого нажатия ещё выше.
   *
   * ЗАМЕР 22.08.2026: случайный разбор (берём любую доступную пару) упирается в НОЛЬ
   * ходов в 31 % партий на 6 уровне, 38 % на 12-м, 44 % на 20-м — по 100 партий на
   * уровень. Каждая третья партия доходила до состояния, о котором игра не сообщала
   * ничем: плитки на месте, тапы не работают, объяснения нет.
   *
   * Считает `availablePairs` из ядра доски — ТЕМ ЖЕ кодом, которым экран решает,
   * нажимается ли плитка. Своя формула здесь разошлась бы с доской при первой же
   * правке правила свободы, и цифра начала бы врать.
   *
   * useMemo по `tiles`: массив пересобирается на каждом снятии пары, отмене и
   * перетасовке — то есть ровно тогда, когда число и меняется.
   */
  const openPairs = React.useMemo(
    () => availablePairs(tiles, aliveMaskRef.current), [tiles],
  );
  /** Ходов нет. Молчать об этом нельзя: человек будет жать плитки, думая, что промахивается. */
  const boardStuck = openPairs === 0 && tiles.length > 0 && levelBanner === null;

  // ── вёрстка пирамиды ─────────────────────────────────────────────────
  // Габариты поля в полуклетках → размер тайла под ширину экрана.
  /**
   * 🔴 ГАБАРИТЫ ПОЛЯ — ПОСТОЯННАЯ УРОВНЯ, А НЕ МАКСИМУМ ПО ОСТАВШИМСЯ ПЛИТКАМ.
   *
   * Денис 02.09.2026: «маджонг кривит ряды, скачут при выделении двух одинаковых;
   * вроде чинил — опять скачет». Чинил соседнюю половину той же болезни: 26.08
   * так же прыгал ПОДЪЁМ слоёв (`maxLayer`), и он стал постоянной уровня. А
   * ширина с высотой остались считаться по живым плиткам — и болезнь вернулась
   * с другой стороны.
   *
   * Механизм. Здесь стояло `tiles.reduce(max(t.x + 2))`, то есть край по ТЕКУЩИМ
   * плиткам. Снятая пара физически уходит из массива (`filter` в обработчике
   * совпадения). Если она стояла с краю — `maxHalfX` падает, из него считается
   * `half` (размер полуклетки), а из `half` — размер плитки, зазор слоёв и
   * координаты ВСЕХ плиток разом. Человек снял пару у края, и доска поехала:
   * ряды разъезжаются, плитки меняют размер. На узких раскладках заметнее, потому
   * что `half` там упирается в пол 10 и прыгает крупными ступенями.
   *
   * Лечение — брать край из раскладки уровня, а не из выживших. Раскладка
   * детерминирована номером уровня (`layoutForLevel` кэширует по нему, `buildPositions`
   * чистая), поэтому цифра одна и та же на всём уровне и при подъёме сохранённой
   * партии. Плитки всегда подмножество этих мест: `generateDeal` раздаёт символы
   * ровно по ним.
   *
   * ⚠️ Подстраховки «а вдруг раздача вылезла за предсказанные места» здесь нет
   * намеренно. Такая защёлка была написана первой и добавила девять придирок
   * линта («ref во время отрисовки»), а защищала от невозможного: `generateDeal`
   * расставляет символы РОВНО по местам раскладки, значит плитки — всегда её
   * подмножество. Это не рассуждение на словах: `mahjongExtent.test.ts` сверяет
   * предсказание с фактическим краем трёх раздач на каждом из сорока уровней.
   */
  const край = React.useMemo(() => mahjongExtent(level), [level]);
  const maxHalfX = край.x;
  const maxHalfY = край.y;
  const boardW = Math.min(width - 36, 460);   // 24→36: поле GameShell имеет paddingHorizontal 16×2
  /**
   * ⚠️ ДЕЛИМ НА ШИРИНУ ВМЕСТЕ СО СДВИГОМ СЛОЁВ, А НИЖНИЙ ПОЛ — 10, А НЕ 14.
   *
   * Прежние силуэты рисовались на 8-12 колонках (до 24 полуклеток) и в 460 px
   * влезали всегда, поэтому пол 14 никогда не срабатывал. Раскладки библиотеки
   * доходят до 26 полуклеток: при поле 14 доска шириной 26×14 = 364 px + сдвиг
   * слоёв вылезала бы за контейнер и обрезалась по краю. Пол оставлен (на первом
   * кадре веб-сборки `width` приходит нулём — см. screen-width-guard), но опущен
   * до 10: это 18 px на плитку, ещё читаемо.
   */
  const half = Math.max(10, Math.floor(boardW / Math.max(8, maxHalfX + 2)));   // размер полуклетки в px
  const tileW = half * 2 - 2;
  const tileH = half * 2 - 2;
  /**
   * 🔴 СДВИГ СЛОЁВ ОБЯЗАН СОГЛАСОВЫВАТЬСЯ С ПРАВИЛОМ ДОСТУПНОСТИ.
   *
   * Отчёт Дениса 03.09.2026: «слои всё ещё криво доступны и скачут». Два прежних
   * лечения (постоянный верхний слой, край из раскладки) убрали прыжки геометрии, а
   * это — другое: врала САМА КАРТИНКА.
   *
   * ЗАМЕР, а не рассуждение. Доступность считается по СЕТКЕ: плитка накрыта, если
   * выше лежит другая с |Δx| < 2 и |Δy| < 2 полуклетки (`overlaps`). А рисовалась она
   * со сдвигом `half * 0.35`, который НАКАПЛИВАЕТСЯ по слоям и о сетке ничего не
   * знает. На пяти слоях сдвиг набегал больше полуклетки, и картинка расходилась с
   * правилом в обе стороны. Прогон по всем 40 уровням (`mahjong-layer-offset-honest`):
   *
   *   было `half*0.35` → 4283 плитки ВЫГЛЯДЯТ накрытыми, будучи свободными,
   *                    и 369 накрыты по правилу, но по виду свободны;
   *   стало `6/слои`   → 0 и 0.
   *
   * Отсюда и «скачут»: доступность менялась не там, где её ждёшь, и предсказать её
   * глазом было нельзя.
   *
   * ⚠️ ЦЕНА ЧЕСТНОСТИ. На пятислойных уровнях сдвиг падает до 1 px, и доска выглядит
   * площе. Это осознанный размен: глубина ради глубины мешала играть, а свободу от
   * занятости и так показывают заливка и приглушение. Тень по слоям усилена, чтобы
   * стопка читалась без вранья.
   *
   * ⚠️ ПРАВИЛЬНОЕ ЛЕЧЕНИЕ ВДОЛГУЮ — вернуть сдвиг В ДАННЫЕ раскладки, чтобы `overlaps`
   * его ВИДЕЛ, а обрезание краёв лечить отступом контейнера (из-за него сдвиг из
   * данных когда-то и убрали, см. `tilePlacement`). Тогда картинка и правило совпадут
   * по построению, а не по подобранному числу.
   *
   * `maxLayer` берётся из параметров уровня, а не из живых плиток: величина постоянна
   * на весь уровень, поэтому сдвиг не может поехать посреди партии.
   */
  const layerOffset = layerOffsetFor(levelParams(level).layers - 1);
  const boardPxW = maxHalfX * half + (levelParams(level).layers) * layerOffset;
  const boardPxH = maxHalfY * half + (levelParams(level).layers) * layerOffset;

  /**
   * 🔴 ВЕРХНИЙ СЛОЙ — ПОСТОЯННАЯ УРОВНЯ, А НЕ МАКСИМУМ ПО ОСТАВШИМСЯ ПЛИТКАМ.
   *
   * Репорт Дениса 26.08.2026 со скриншотами: «в маджонге будто уровни прыгают,
   * открывается странно — не по уровням, а будто прыгают».
   *
   * Здесь стояло `tiles.reduce((m, t) => Math.max(m, t.layer), 0)`, то есть
   * максимум по ТЕКУЩИМ плиткам. `tilePlacement` считает подъём как
   * `(maxLayer - t.layer) * layerOffset`. Пока верхний слой цел — всё ровно; но
   * стоит снять с него ПОСЛЕДНЮЮ плитку, и `maxLayer` падает на единицу, а
   * вместе с ним РАЗОМ съезжает вниз ВСЯ доска: каждая уцелевшая плитка меняет
   * `top` на `layerOffset`. Человек снял одну пару — прыгнуло всё поле.
   *
   * Слои нумеруются с нуля (`silhouettes.ts:369` кладёт `layer: k`), поэтому
   * верхний индекс это `layers - 1`. Величина постоянна на весь уровень по
   * построению — значит прыгать нечему. Та же `levelParams(level).layers` уже
   * используется двумя строками выше для высоты доски, так что запас под подъём
   * зарезервирован даже если силуэт занял не все слои.
   */
  const maxLayer = levelParams(level).layers - 1;

  const renderTile = (tt: Tile, i: number) => {
    const free = tileFree(i);
    const sel = selected === i;
    const blames = blockers.includes(i);
    /**
     * СКРЫТАЯ ИНФОРМАЦИЯ (ec15d176): на скрытых уровнях лицо накрытой плитки —
     * «?». Смещение слоёв и так прячет символ лишь НАПОЛОВИНУ при полуперекрытии —
     * этого хватало, чтобы планировать по выглядывающим половинкам; режим прячет
     * честно. Зажатая с боков, но не накрытая плитка лицо показывает: соседние
     * лица в жизни видны. Подсветка виновных лицо не открывает — она про то,
     * КТО держит, а не что под ним.
     */
    const masked = mahjongHidden(levelRef.current) && coveredFromAbove(tiles, aliveMaskRef.current, i);
    const { left, top } = tilePlacement(tt, maxLayer, half, layerOffset);
    /**
     * ГЛУБИНА ДЕРЖИТСЯ НА РАЗМЕРЕ, А НЕ НА СДВИГЕ (см. `tileScaleFor`). Плитка
     * верхнего слоя меньше и стоит по центру своей клетки — нижняя выглядывает
     * из-под неё рамкой, и стопка читается глазами. Сдвиг для этого не годится:
     * он уводит верхнюю плитку на СОСЕДНЮЮ нижнюю, которую она не накрывает, и
     * на этом краснеет проба честности слоёв.
     */
    const масштаб = tileScaleFor(tt.layer, maxLayer);
    const ш = Math.round(tileW * масштаб);
    const в = Math.round(tileH * масштаб);
    const дх = Math.round((tileW - ш) / 2);
    const ду = Math.round((tileH - в) / 2);
    return (
      <TouchableOpacity
        accessibilityRole="button"
        key={tt.id}
        activeOpacity={0.85}
        onPress={() => handleTilePress(i)}
        style={[
          styles.tile,
          {
            width: ш, height: в, left: left + дх, top: top + ду,
            zIndex: tt.layer * 100 + tt.y,
            /**
             * ПОД ПЛИТКОЙ ТЕПЕРЬ КОСТЯНАЯ ПЛАШКА, А НЕ ЗАЛИВКА ЦВЕТОМ.
             * Денис 05.09.2026 прислал референс костяных плиток: «отрисуй для
             * маджонга тоже новые». Заливка `#b6c2d1` была не «сдержанной», а
             * никакой — доска читалась как таблица, а не как разбираемая стопка.
             *
             * ⚠️ Признаки этажа при этом ОСТАЛИСЬ ТЕ ЖЕ: размер (`tileScaleFor`),
             * тон (`layerShadeFor` — тёмная плёнка поверх кости, тем гуще, чем ниже) и
             * растущая тень. Замени тон на «просто картинку без плёнки» — и проба
             * `mahjong-layers-are-visible` покраснеет, потому что этажи снова
             * станут неразличимы.
             */
            backgroundColor: 'transparent',
            borderColor: blames ? '#dc2626' : sel ? '#f59e0b' : '#94a3b8',
            borderWidth: blames ? 3 : 1.5,
            // Виновную видно даже в нижнем слое: приглушение снимаем.
            opacity: blames ? 1 : free ? 1 : 0.6,
            /**
             * Тень растёт со слоем — второй признак высоты после размера. Радиус
             * и смещение тоже растут: тень радиусом 3 при белом фоне доски не
             * видна вовсе, а это и был единственный признак этажа до правки.
             */
            shadowOpacity: 0.18 + tt.layer * 0.14,
            shadowRadius: 2 + tt.layer * 2.5,
            shadowOffset: { width: 1 + tt.layer, height: 2 + tt.layer * 2 },
            elevation: 2 + tt.layer * 3,
            /** Толщина: тёмная полоса по нижнему краю ВНУТРИ клетки — плитка «имеет бок». */
            borderBottomWidth: 1.5 + tt.layer * 1.5,
            borderBottomColor: blames ? '#dc2626' : '#7c8ba1',
          },
        ]}
      >
        <Image
          source={ПЛАШКА}
          style={StyleSheet.absoluteFill as any}
          resizeMode="stretch"
          fadeDuration={0}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        {/*
          Плёнка поверх кости: тон этажа, выбор и подсветка виновной. Полупрозрачная —
          кость обязана просвечивать, иначе от новой плашки ничего не остаётся.
        */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill as any,
            {
              backgroundColor: blames ? '#fecaca' : sel ? '#fde68a'
                : free ? '#262a34' : '#7b8798',
              opacity: blames ? 0.55 : sel ? 0.5
                : free ? layerShadeFor(tt.layer, maxLayer) : 0.42,
            },
          ]}
        />
        <Text style={{ fontSize: ш * 0.5, opacity: blames || free ? 1 : 0.7 }}>{masked ? '?' : (SYMBOLS[tt.symbol] ?? '🀄')}</Text>
      </TouchableOpacity>
    );
  };

  const renderConfig = () => {
    const p = levelParams(level);
    return (
      <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <GradientSurface colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="grid" size={48} color={ON_GRAD.color} />
          <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{t('mahjong')}</Text>
          <Text style={[styles.configDesc, { color: ON_GRAD_SOFT }]}>{t('mahjongDesc')}</Text>
        </GradientSurface>
        <GameAbout descriptionKey="mahjongIntroDesc" benefits={MAHJONG_BENEFITS} accent={GRADIENT[0]} />

        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {p.pairs} {t('pairsWord')} · {p.layers} {p.layers === 1 ? t('layerOne') : t('layerMany')}
          </Text>
          {level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => { setLevel(1); levelRef.current = 1; if (!isPreset) lvl.setLevel(1); }} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        <LevelProgressMap bestLevel={lvl.best}
          gameId="mahjong"
          currentLevel={level}
          maxLevel={Math.max(15, level, lvl.best)}
          onPickLevel={lvl.pick}
          colors={colors}
          language={language}
        />

      </ScrollView>
      <GameSetupBar label={t('playLevelBtn').replace('{n}', String(level))} onStart={startGame}
        colors={GRADIENT as [string, string]} tint="#04341f" />
      </>
    );
  };

  // Единый каркас GameShell: HUD-бейджи — в props stats, «Перемешать» — в прибитом тулбаре.
  // Слои плиток (absolute-позиции) переносятся контейнером boardPxW×boardPxH целиком.
  const renderPlaying = () => (
    <GameShell
      title={t('mahjong')}
      onBack={() => goBackOrHome()}
      confirmExit={liveGame && touched}
      resumable
      onSaveBeforeExit={saveBeforeExit}
      stats={
        <View style={styles.statsRow}>
          {/**
            * 🔴 ПОКА КАРТОЧКА ИТОГА НА ЭКРАНЕ, В ШАПКЕ СТОИТ ПРОЙДЕННЫЙ УРОВЕНЬ.
            *
            * Отчёт Дениса 04.09.2026: «скачут уровни после взятия пар, ни с того ни
            * с сего открывается карточка». Скачок настоящий и виден в КАЖДОМ
            * завершении: при сборе доски `setLevel(next)` переключает счётчик на
            * следующий уровень СРАЗУ, а карточка поверх доски говорит про
            * пройденный. За спиной у карточки номер уже другой — и выглядит это
            * так, будто игра перескочила сама.
            *
            * Проверял и вторую догадку — что доска отдаёт меньше пар, чем обещает
            * счётчик «12/20»: замер по девяти уровням (L1…L20) показал совпадение
            * до пары везде. Дело было не в этом.
            */}
          <HudBadge icon="flag" value={`${t('unitLevelShort')} ${levelBanner ?? level}`} colors={['#fbbf24', '#d97706']} tint="#3f2b00" pop />
          <HudBadge icon="star" value={score} colors={['#34d399', '#059669']} pop />
          <HudBadge icon="checkmark-done" value={`${matched}/${pairsTotal}`} colors={['#5eead4', '#0d9488']} pop />
          {/*
            Счётчик доступных пар. Ноль обязан ЧИТАТЬСЯ как «доска встала», а не
            молчать: поэтому на нуле пилюля краснеет, а под доской встаёт прямая
            строка о том, что делать (см. `boardStuck` ниже).
          */}
          <HudBadge
            icon="git-compare" label={t('mahjongPairsOpen')} value={openPairs}
            colors={boardStuck ? ['#fb7185', '#e11d48'] : ['#c4b5fd', '#7c3aed']}
            pop
          />
          <HudBadge icon="close" value={errors} colors={['#fb7185', '#e11d48']} />
          {/*
            🔴 В вечернем шаге секундомер ПРЯЧЕМ. Репорт 18.08.2026: «даже на
            маджонг теперь таймер. Нельзя таймер, но в этом и был смысл вечерней
            зарядки». Предела времени в маджонге нет и не было — но бегущая
            цифра на экране торопит ничуть не хуже обратного отсчёта, а вечерний
            набор задуман ровно наоборот. Время всё равно считается и уезжает
            в сессию, просто не давит на глаза.
          */}
          {!isCalm && (
            <HudBadge icon="time" value={hudTime(elapsed, t('secShort'))} colors={['#60a5fa', '#2563eb']} />
          )}
          {!isPreset && <LevelRuleBadge lr={levelRules} color="#0d9488" ru={language === 'ru'} />}
        </View>
      }
      /*
        🔴 ОБЕ КНОПКИ УЕХАЛИ ВНИЗ→ВВЕРХ. Раньше здесь стояло обоснование
        «низ не занят вводом — плитки жмут прямо на доске, значит служебному
        внизу самое место». Оно и было той самой ошибкой: низ каркаса во всём
        приложении означает ОТВЕТ игрока (← → во фланкере, «Слово/Не слово» в
        лексическом решении), и человек, натренированный теми играми, бил сюда
        рефлекторно — а тут «Перемешать», которого на уровень всего три.
        Ни отмена, ни перетасовка ответом не являются: обе тратят лимит и
        перекладывают доску, то есть трогают ИГРУ. Место им в шапке.

        Побочная выгода замерена на 390×844: две пилюли не влезали в один ряд
        (перенос по строкам + отступ под кнопку фидбека) и занимали ДВЕ строки
        нижней полосы — около 180 px, отобранных у доски. Теперь их нет.
      */
      headerActions={(() => {
        // Остаток перетасовок виден НА кнопке: ресурс, о котором узнаёшь, только
        // когда он кончился, воспринимается как поломка, а не как правило.
        const budget = levelParams(level).shuffles;
        const left = shufflesLeft(budget, shufflesUsed);
        const can = canShuffle(budget, shufflesUsed);
        // Остаток отмен — на кнопке по той же причине, что и остаток перетасовок.
        const undoLeft = Math.max(0, UNDOS_PER_LEVEL - undosUsed);
        const canUndo = history.canUndo && undoLeft > 0 && levelBanner === null;
        return (
          <GameAuxBar>
            <GameAuxAction
              icon="arrow-undo" tint="#d97706"
              ladder="undo" label={t('btn_undo')} count={undoLeft}
              disabled={!canUndo} onPress={undoMove}
            />
            <GameAuxAction
              icon="shuffle" tint="#0d9488"
              label={t('shuffleBtn')} count={left < 0 ? undefined : left}
              disabled={!can} onPress={reshuffle}
            />
          </GameAuxBar>
        );
      })()}
    >
      <View style={styles.fieldCol}>
        <Text style={[styles.hintText, boardStuck ? styles.hintStuck : null, { color: boardStuck ? '#e11d48' : colors.textSecondary }]}>
          {boardStuck ? t('mahjongNoPairs') : t('mahjongHint')}
        </Text>
        <View style={{ width: boardPxW, height: boardPxH, alignSelf: 'center', marginTop: 6 }}>
          {tiles.map((tt, i) => renderTile(tt, i))}
        </View>
      </View>
    </GameShell>
  );

  // Игровая фаза — на едином каркасе GameShell; поверх (обёртка View flex:1, паттерн
  // digit-span): очки-попапы, баннер «Уровень N ✓», модалка правил уровня.
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        {renderPlaying()}
        <ScorePopupLayer popups={popups} />
        {/* Итог уровня — общей карточкой ПОВЕРХ доски. Своя плашка показывала
            «Уровень N ✓» и всё: звёзды не сохранялись, серия чистых не считалась,
            глаз-разрядка не тикала — всё это живёт в общей карточке. Доска при этом
            видна по-прежнему: разобранный маджонг и есть награда. */}
        {levelBanner !== null && (
          <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
            <LevelCleared
              level={levelBanner}
              stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
              gradient={GRADIENT}
              colors={colors}
              language={language}
              gameId="mahjong"
              variant="overlay"
              onContinue={() => { setLevelBanner(null); loadLevel(levelBanner + 1); }}
              onStop={() => { setLevelBanner(null); setPhase('config'); }}
            />
          </View>
        )}
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
        <Text style={[styles.title, { color: colors.text }]}>{t('mahjong')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'result' && (
        <GameResult score={score} time={elapsed} errors={errors}
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
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14, paddingBottom: 16 + SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700' },
  configDesc: { fontSize: 13, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  fieldCol: { alignItems: 'center', gap: 8 },   // hint + контейнер слоёв плиток внутри поля каркаса
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap', maxWidth: '100%' },
  hintText: { fontSize: 12, textAlign: 'center' },
  hintStuck: { fontSize: 13, fontWeight: '700' },   // доска встала — строка обязана быть заметнее обычной подсказки
  tile: {
    position: 'absolute', borderRadius: 6, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#04341f', shadowRadius: 3, shadowOffset: { width: 1, height: 2 },
  },
  // ⚠️ Осиротело после разводки слотов: отмена и перетасовка уехали в шапку (GameAuxAction).
  // Стили ниже (shuffleBtn, shuffleText) больше никем не берутся; оставлены
  // намеренно — удаление чужого кода в этом проекте только с разрешения.
  shuffleBtn: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, marginTop: 8 },
  shuffleText: { fontSize: 14, fontWeight: '700' },
});
