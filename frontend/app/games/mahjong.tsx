/* psygames-game-mahjong · VER 1 · 19.08.2026 */
import GradientSurface from '@/src/components/GradientSurface';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { mahjongLevel, canShuffle, shufflesLeft } from '@/src/services/mahjongLevels';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import GameAbout from '@/src/components/GameAbout';
import { useAutostart, useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { HudBadge, JuicyButton, ScorePopupLayer, useScorePopups, hapticTap, hapticSuccess, hapticError } from '@/src/components/juice';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import {saveResume, clearResume} from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';

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
    key: 'layers2', fromLevel: 6, toLevel: 10,
    ru: { title: 'Два слоя', rule: 'Плитки теперь лежат в 2 слоя. Брать можно только СВОБОДНУЮ плитку: на ней никто не лежит И у неё открыт левый или правый край. Тусклые плитки заблокированы.', example: 'Пример: плитка под другой плиткой или зажатая соседями с обоих боков — не нажимается, сначала освободи её.' },
    en: { title: 'Two layers', rule: 'Tiles now stack in 2 layers. You can only pick a FREE tile: nothing lies on it AND its left or right side is open. Dimmed tiles are blocked.', example: 'Example: a tile under another tile, or squeezed by neighbors on both sides, cannot be tapped — free it first.' },
  },
  {
    key: 'layers3', fromLevel: 11, toLevel: 15,
    ru: { title: 'Три слоя', rule: 'Пирамида теперь в 3 слоя. Правило то же: свободна плитка, на которой НИЧЕГО не лежит и у которой открыт левый ИЛИ правый край. Разбирай пирамиду сверху вниз.', example: 'Пример: нижняя плитка станет доступна, когда снимешь всё, что её накрывает, и один её бок открыт.' },
    en: { title: 'Three layers', rule: 'The pyramid now has 3 layers. Same rule: a tile is free when NOTHING lies on it and its left OR right side is open. Dismantle the pyramid top-down.', example: 'Example: a bottom tile becomes available once everything covering it is removed and one of its sides is open.' },
  },
  // ⚠️ ПРАВИЛА ОБЯЗАНЫ СОВПАДАТЬ СО СЛОЯМИ из mahjongLevels.ts. До этой правки
  // «Три слоя» стояло без верхней границы, и на 18 уровне игра объясняла три слоя,
  // выкладывая четыре — та самая «молчаливая механика», ради которой правила и заведены.
  {
    key: 'layers4', fromLevel: 16, toLevel: 22,
    ru: { title: 'Четыре слоя', rule: 'Слоёв стало 4, и перетасовка теперь одна на уровень. Правило свободной плитки не меняется — меняется цена ошибки: снимать надо сверху и с краёв, иначе запрёшь низ.', example: 'Пример: пара в самом низу может стать недоступной, если разобрать середину не с того края. Смотри на два хода вперёд.' },
    en: { title: 'Four layers', rule: 'Four layers now, and you get one shuffle per level. The free-tile rule is unchanged — what changes is the cost of a mistake: clear from the top and the edges, or you will lock the bottom.', example: 'Example: a bottom pair can become unreachable if you open the middle from the wrong side. Think two moves ahead.' },
  },
  {
    key: 'layers5', fromLevel: 23,
    ru: { title: 'Пять слоёв', rule: 'Пять слоёв — верх пирамиды узкий, низ широкий. Перетасовка одна. Здесь уже нельзя брать любую доступную пару: почти каждый снятый тайл открывает или запирает что-то ниже.', example: 'Пример: две одинаковые плитки свободны, но одна из них держит крышку над последней парой — бери ту, что не держит.' },
    en: { title: 'Five layers', rule: 'Five layers — a narrow top over a wide base. One shuffle. You can no longer take just any available pair: almost every tile you remove opens or locks something below.', example: 'Example: two identical tiles are free, but one of them caps the last pair — take the other one.' },
  },
];

// Символы тайлов — эмодзи (универсально, без ассетов). До 12 видов, кладутся ПАРАМИ.
const SYMBOLS = ['🀄', '🎋', '🌸', '🐉', '🀙', '⭐', '🍀', '🔥', '💎', '🌙', '🎴', '🐲'];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
interface Tile { id: number; x: number; y: number; layer: number; symbol: number; }

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Параметры уровня живут в services/mahjongLevels.ts — там же лимит перетасовок
// и объяснение, почему вверх растим слои, а не количество плиток.
const levelParams = mahjongLevel;

// ── Построение позиций пирамиды ──────────────────────────────────────
// Сетка с ПОЛУШАГОМ (x,y в «полуклетках»): тайл занимает 2×2 полуклетки.
// Верхний слой смещён к центру и поднят, образуя классическую «черепаху».
// Возвращает ровно needTiles позиций (needTiles = pairs*2, всегда чётно).
function buildPositions(layers: number, needTiles: number, cols: number): { x: number; y: number; layer: number }[] {
  // Распределяем тайлы по слоям ПИРАМИДАЛЬНО (нижний слой больше верхних): веса layers..1.
  // Раньше slice(0,needTiles) брал только нижний слой → раскладка выходила плоской.
  const weights: number[] = [];
  for (let k = 0; k < layers; k++) weights.push(layers - k);   // напр. 3,2,1
  const wsum = weights.reduce((a, b) => a + b, 0);
  const positions: { x: number; y: number; layer: number }[] = [];
  for (let layer = 0; layer < layers; layer++) {
    const target = layer === layers - 1
      ? Math.max(2, needTiles - positions.length)              // верхний слой добирает остаток
      : Math.max(2, Math.round((needTiles * weights[layer]) / wsum));
    const layerCols = Math.max(2, cols - layer * 2);           // верхние слои уже → пирамида, и центрированы (inset=layer)
    let placed = 0, r = 0;
    while (placed < target) {
      for (let c = 0; c < layerCols && placed < target; c++) {
        positions.push({ x: (layer + c) * 2, y: (layer + r) * 2, layer });
        placed++;
      }
      r++;
    }
  }
  if (positions.length % 2 === 1) positions.pop();             // чётность для пар
  return positions;
}

// «Перекрывает ли» позиция верхнего слоя позицию нижнего (тайл 2×2 в полуклетках).
function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

// Свободен ли тайл i среди ОСТАВШИХСЯ: (а) сверху нет перекрывающего, (б) слева ИЛИ справа открыто.
function isFree(tiles: Tile[], alive: boolean[], i: number): boolean {
  const t = tiles[i];
  // (а) ничего на слое выше, перекрывающего позицию
  for (let j = 0; j < tiles.length; j++) {
    if (!alive[j] || j === i) continue;
    if (tiles[j].layer > t.layer && overlaps(tiles[j], t)) return false;
  }
  // (б) сосед на ТОМ ЖЕ слое вплотную слева / справа (та же y-полоса, x±2)
  let blockedL = false, blockedR = false;
  for (let j = 0; j < tiles.length; j++) {
    if (!alive[j] || j === i) continue;
    if (tiles[j].layer !== t.layer) continue;
    if (Math.abs(tiles[j].y - t.y) < 2) {
      if (Math.abs(tiles[j].x - (t.x - 2)) < 1) blockedL = true;
      if (Math.abs(tiles[j].x - (t.x + 2)) < 1) blockedR = true;
    }
  }
  return !(blockedL && blockedR);
}

// ── Генерация РЕШАЕМОЙ раскладки («обратный» метод) ──────────────────
// 1) Берём позиции пирамиды. 2) Повторно выбираем ДВЕ свободные позиции и
//    назначаем им одинаковый символ, «снимая» их — порядок снятия = гарантия
//    решаемости (мы строим решение задом наперёд). Символы идут парами.
function generate(layers: number, pairs: number, cols: number): Tile[] {
  const need = pairs * 2;
  let pos = buildPositions(layers, need, cols);
  // Подгоняем чётность: число позиций должно быть чётным и == need (или близко).
  if (pos.length % 2 === 1) pos = pos.slice(0, pos.length - 1);
  const total = pos.length;
  const realPairs = total / 2;

  // alive-маска по позициям; symbolOf[i] заполняем парами в обратном порядке снятия.
  const baseTiles: Tile[] = pos.map((p, i) => ({ id: i, x: p.x, y: p.y, layer: p.layer, symbol: -1 }));
  const alive = new Array(total).fill(true);
  const symbolOf = new Array(total).fill(-1);

  // последовательность символов: каждая из realPairs пар = символ (цикл по SYMBOLS).
  const symSeq = shuffle(Array.from({ length: realPairs }, (_, k) => k % SYMBOLS.length));

  let guard = 0;
  for (let p = 0; p < realPairs; p++) {
    // собрать индексы свободных живых позиций
    const free: number[] = [];
    for (let i = 0; i < total; i++) if (alive[i] && isFree(baseTiles, alive, i)) free.push(i);
    if (free.length < 2) {
      // запасной путь — взять любые две живые (теоретически не должно случаться)
      const liveLeft: number[] = [];
      for (let i = 0; i < total; i++) if (alive[i]) liveLeft.push(i);
      const sh = shuffle(liveLeft);
      const a = sh[0], b = sh[1];
      symbolOf[a] = symbolOf[b] = symSeq[p];
      alive[a] = alive[b] = false;
      continue;
    }
    const sh = shuffle(free);
    const a = sh[0], b = sh[1];
    symbolOf[a] = symbolOf[b] = symSeq[p];
    alive[a] = alive[b] = false;
    if (++guard > total * 4) break;
  }
  return baseTiles.map((t, i) => ({ ...t, symbol: symbolOf[i] >= 0 ? symbolOf[i] : 0 }));
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

  // Справка правил уровня (в пресете не всплываем — там свой поток).
  // levelBanner === null: не открывать модалку поверх баннера «Уровень N ✓» — пусть покажется на новой раскладке.
  const levelRules = useLevelRules('mahjong', level, MAHJONG_RULES,
    phase === 'playing' && !isPreset && levelBanner === null);

  const loadLevel = (L: number) => {
    const p = levelParams(L);
    const deck = generate(p.layers, p.pairs, p.cols);
    aliveMaskRef.current = new Array(deck.length).fill(true);
    setTiles(deck);
    setPairsTotal(deck.length / 2);
    setMatched(0); setErrors(0); setSelected(null);
    setShufflesUsed(0);   // бюджет перетасовок — на уровень, а не на партию
    setUndosUsed(0);      // и бюджет отмен тоже: новая пирамида — новые три попытки
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
  useAutostart(autostart && lvl.loaded, startGame);
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
      details: { level: done, pairs: p.pairs, layers: p.layers },
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

  const handleTilePress = (i: number) => {
    if (phase !== 'playing') return;
    if (!aliveMaskRef.current[i]) return;
    if (!tileFree(i)) { hapticError(); return; }   // занят — не реагирует
    if (selected === null) { setSelected(i); hapticTap(); return; }
    if (selected === i) { setSelected(null); return; }   // снять выбор

    if (tiles[selected].symbol === tiles[i].symbol) {
      // пара — убираем оба
      // Снимок кладём ДО правки доски: снятие уже необратимо руками (массив
      // пересобирается), и восстановить его можно только из целого снимка.
      history.push({ tiles, matched, score: scoreRef.current });
      const a = selected, b = i;
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
    setShufflesUsed((n) => n + 1);
    const positions = tiles.map((t) => ({ x: t.x, y: t.y, layer: t.layer }));
    // повторно назначаем символы парами в обратном порядке снятия по ТЕКУЩИМ позициям
    const total = positions.length - (positions.length % 2);
    const baseTiles: Tile[] = positions.slice(0, total).map((p, i) => ({ id: i, x: p.x, y: p.y, layer: p.layer, symbol: -1 }));
    const alive = new Array(total).fill(true);
    const symbolOf = new Array(total).fill(-1);
    const realPairs = total / 2;
    const symSeq = shuffle(Array.from({ length: realPairs }, (_, k) => k % SYMBOLS.length));
    for (let p = 0; p < realPairs; p++) {
      const free: number[] = [];
      for (let i = 0; i < total; i++) if (alive[i] && isFree(baseTiles, alive, i)) free.push(i);
      let a: number, b: number;
      if (free.length >= 2) { const sh = shuffle(free); a = sh[0]; b = sh[1]; }
      else { const live: number[] = []; for (let i = 0; i < total; i++) if (alive[i]) live.push(i); const sh = shuffle(live); a = sh[0]; b = sh[1]; }
      symbolOf[a] = symbolOf[b] = symSeq[p];
      alive[a] = alive[b] = false;
    }
    const next = baseTiles.map((tt, i) => ({ ...tt, symbol: symbolOf[i] >= 0 ? symbolOf[i] : 0 }));
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

  // ── вёрстка пирамиды ─────────────────────────────────────────────────
  // Габариты поля в полуклетках → размер тайла под ширину экрана.
  const maxHalfX = tiles.reduce((m, t) => Math.max(m, t.x + 2), 2);
  const maxHalfY = tiles.reduce((m, t) => Math.max(m, t.y + 2), 2);
  const boardW = Math.min(width - 36, 460);   // 24→36: поле GameShell имеет paddingHorizontal 16×2
  const half = Math.max(14, Math.floor(boardW / Math.max(8, maxHalfX)));   // размер полуклетки в px
  const tileW = half * 2 - 2;
  const tileH = half * 2 - 2;
  const layerOffset = Math.max(3, Math.round(half * 0.35));   // псевдо-3D смещение слоя
  const boardPxW = maxHalfX * half + (levelParams(level).layers) * layerOffset;
  const boardPxH = maxHalfY * half + (levelParams(level).layers) * layerOffset;

  const renderTile = (tt: Tile, i: number) => {
    const free = tileFree(i);
    const sel = selected === i;
    const left = tt.x * half + tt.layer * layerOffset;
    const top = tt.y * half - tt.layer * layerOffset;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        key={tt.id}
        activeOpacity={0.85}
        onPress={() => handleTilePress(i)}
        style={[
          styles.tile,
          {
            width: tileW, height: tileH, left, top,
            zIndex: tt.layer * 100 + tt.y,
            backgroundColor: sel ? '#fde68a' : free ? '#f8fafc' : '#cbd5e1',
            borderColor: sel ? '#f59e0b' : free ? '#94a3b8' : '#94a3b8',
            opacity: free ? 1 : 0.6,
            shadowOpacity: 0.25 + tt.layer * 0.06,
          },
        ]}
      >
        <Text style={{ fontSize: tileW * 0.5, opacity: free ? 1 : 0.7 }}>{SYMBOLS[tt.symbol] ?? '🀄'}</Text>
      </TouchableOpacity>
    );
  };

  const renderConfig = () => {
    const p = levelParams(level);
    return (
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

        <LevelProgressMap
          gameId="mahjong"
          currentLevel={level}
          maxLevel={Math.max(15, level, lvl.best)}
          onPickLevel={lvl.pick}
          colors={colors}
          language={language}
        />

        <JuicyButton
          label={t('playLevelBtn').replace('{n}', String(level))}
          icon="play" colors={GRADIENT as [string, string]} tint="#04341f" onPress={startGame} style={{ marginTop: 8 }} />
      </ScrollView>
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
          <HudBadge icon="flag" value={`${t('unitLevelShort')} ${level}`} colors={['#fbbf24', '#d97706']} tint="#3f2b00" pop />
          <HudBadge icon="star" value={score} colors={['#34d399', '#059669']} pop />
          <HudBadge icon="checkmark-done" value={`${matched}/${pairsTotal}`} colors={['#5eead4', '#0d9488']} pop />
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
            <HudBadge icon="time" value={`${elapsed.toFixed(1)}${t('secShort')}`} colors={['#60a5fa', '#2563eb']} />
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
              label={t('btn_undo')} count={undoLeft}
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
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('mahjongHint')}</Text>
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
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700' },
  configDesc: { fontSize: 13, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  fieldCol: { alignItems: 'center', gap: 8 },   // hint + контейнер слоёв плиток внутри поля каркаса
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  hintText: { fontSize: 12, textAlign: 'center' },
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
