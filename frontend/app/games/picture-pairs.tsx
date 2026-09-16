/* psygames-game-picture-pairs · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView, Image
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { hudTime } from '@/src/services/hudTime';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { capPresetByLevel } from '@/src/services/presetCap';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import GameModeSwitch from '@/src/components/GameModeSwitch';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useProfile } from '@/src/contexts/ProfileContext';
import {saveResume, clearResume} from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import { SPRITE_COUNT, pairSpritesForProfile, pairBackForProfile } from '@/src/constants/pairThemes';
import {FlipCard, HudBadge, ScorePopupLayer, useScorePopups, hapticSuccess, hapticError } from '@/src/components/juice';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { FAB_CLEARANCE } from '@/src/services/fabPosition';
import { ПАЛЕЦ } from '@/src/components/gameLayout';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#f857a6', '#ff5858'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 3.04 (норма AA 4.5), стало 5.67.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const PAIRS_BENEFITS = [
  { icon: 'heart-outline', textKey: 'benefitPairs1' },
  { icon: 'eye-outline', textKey: 'benefitPairs2' },
  { icon: 'time-outline', textKey: 'benefitPairs3' },
];

/**
 * Последний уровень, где ещё растёт ОБЪЁМ. С L13 групп 4 + (L − 13), и на L21 их становится
 * двенадцать — ровно столько картинок в наборе (SPRITE_COUNT). Скорость показа упёрлась в
 * пол 250 мс ещё на L14. Без новой оси L22…L60 были бы копиями L21: 39 пар одинаковых
 * соседних уровней из 59 (замер 16.09.2026, задача 2fb42171).
 */
export const PAIRS_VOLUME_TOP = 13 + SPRITE_COUNT - 4;
/** Сколько пара подсвечена перед обменом и пауза до следующей пары. */
export const SWAP_LIT_MS = 450;
export const SWAP_GAP_MS = 150;
const SWAP_LIT_COLOR = '#fde047';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
export const PAIRS_RULES: LevelRule[] = [
  // Тексты всех трёх правил — в словаре: lr_picture_pairs_<key>_{title,rule,example}, 12 языков.
  // Инлайн ru/en снят 16.09.2026 (долг гейта level-rules-i18n): он знал два языка из двенадцати.
  { key: 'triple', fromLevel: 10, toLevel: 12 },
  { key: 'quad', fromLevel: 13 },
  { key: 'swap', fromLevel: PAIRS_VOLUME_TOP + 1 },
];

// Спрайты карточек подбираются под активный профиль (зверята / шахматы / биохак / …),
// см. src/constants/pairThemes.ts. Любой набор = ровно 12 объектов.

type GameMode = 'game' | 'single';
type GamePhase = 'intro' | 'config' | 'playing' | 'result';

/** Ключ незаконченной партии — совпадает с id в реестре игр (карточка «Продолжить»). */
const GAME_ID = 'picture_pairs';

/** Версия формата снимка: меняешь поля PairsResume — поднимай, иначе старая запись оживит поле без части карт. */
const RESUME_V = 1;

/**
 * Снимок недоигранного поля.
 *
 * ⚠️ РАСКЛАД ЦЕЛИКОМ, а не «уровень + сколько собрано»: колода тасуется
 * случайно, по номеру уровня её не воспроизвести. И главное — человек держит в
 * голове ПОЗИЦИИ увиденных карт; выдать ему другой расклад значит стереть
 * ровно то, что он и запоминал.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕТ: фазы фото-показа. Партия не сохраняется, пока карты лежат
 * лицом вверх, иначе выход и возврат превращались бы в бесконечный показ —
 * то есть в способ обойти саму механику уровней 10+.
 */
interface PairsResume {
  mode: GameMode;
  level: number;
  pairsCount: number;
  groupSize: number;
  cards: Card[];
  moves: number;
  matched: number;
  errors: number;
  score: number;
  /** Накопленные секунды: между сессиями настенные часы уходят вперёд. */
  elapsed: number;
}
interface Card {
  id: number;
  symbol: number;   // индекс карточки в наборе спрайтов (пара = одинаковый индекс)
  flipped: boolean;
  matched: boolean;
}

// Кривая сложности «Игрового режима» (эндлесс, как в Goods Sort):
//  • уровни 1-9 — растёт число пар 4→12 (классическая память, без флеша);
//  • с 10-го — пар 12 + фото-память с убывающим флешем 3000→500мс (память под нагрузкой).
/**
 * Параметры уровня. Экспортируется, чтобы гейт мог позвать ЭТОТ расчёт, а не
 * разбирать исходник регуляркой: разбор ломается на верной правке и перестаёт
 * что-либо стеречь.
 */
export function levelCfg(L: number): { pairs: number; groupSize: number; photo: boolean; previewMs: number; swapsPerMiss: number } {
  // Сложность: L1-9 пары 4→12 · L10-12 ТРОЙКИ (3 одинаковых на символ) · L13-15 ЧЕТВЁРКИ.
  // groupSize = сколько копий каждого символа нужно открыть. previewMs ещё короче с уровнем.
  const groupSize = L <= 9 ? 2 : L <= 12 ? 3 : 4;
  /**
   * 🔴 ЧИСЛО ГРУПП НЕ МОЖЕТ ПРЕВЫСИТЬ ЧИСЛО КАРТИНОК. Спрайтов в наборе ровно
   * двенадцать (SPRITE_COUNT), а формула с 22-го уровня просила тринадцать: колода
   * собиралась из двенадцати, а победа сверялась с числом из конфига — и партия
   * НЕ ЗАВЕРШАЛАСЬ НИКОГДА. Все карты открыты, ходов нет, счётчик висит «12/13».
   * Игра при этом не скрыта из меню и стоит в ротации «Вызова дня».
   *
   * Тот же дефект, что чинился во фрактальном судоку: победа сверялась с
   * конфигом, а не с доской.
   */
  const wanted = L <= 9 ? Math.min(12, 3 + L)           // число ГРУПП: L1-9 пары 4→12
              : L <= 12 ? 4 + (L - 10)                  // L10-12 троек 4,5,6 (12,15,18 карт)
              : 4 + (L - 13);                            // L13+ четвёрок, но не больше набора
  const pairs = Math.min(wanted, SPRITE_COUNT);
  const previewMs = Math.max(250, 800 - L * 40);        // показ быстрее с уровнем
  /**
   * 🔴 ОСЬ ПОСЛЕ ОБЪЁМА — КАРТЫ МЕНЯЮТСЯ МЕСТАМИ ПОСЛЕ ОШИБКИ. Ось 9 из правила раздела
   * «потолков нет» (span-chat/RULE_NO_CEILINGS.md): раскладка меняется ВНУТРИ партии.
   * Число — СРЕДНЕЕ обменов на одну ошибку; дробную часть решает бросок.
   *
   * ПОЧЕМУ НЕ ЗАДЕРЖКА ПОСЛЕ ПОКАЗА, как у семи других игр раздела. Замер моделью
   * партии на 48 картах, игрок помнит всё увиденное: показ, из которого человек уносит
   * около четырёх карт (ёмкость зрительной рабочей памяти — Luck & Vogel, Nature 390,
   * 1997), экономит 3,9 % ходов — задержке после него стирать нечего. А между идеальной
   * памятью по ходу партии и памятью на 16 карт — 25 против 66 ходов. Нагрузка этой
   * игры живёт в САМОЙ ПАРТИИ, и ось обязана бить туда.
   *
   * ПОЧЕМУ ЧЕТВЕРТЬ ОБМЕНА НА УРОВЕНЬ. Та же модель, игрок успевает проследить один
   * обмен из серии, а остальные стирают его знание об обеих клетках: L29 ×1,3 хода к
   * L21, L33 ×2,1, L41 ×6,7, L60 ×50 — и все 600 партий на уровень доходят до конца.
   * Хвост без потолка, но проходимый. Целый обмен на уровень делал бы L30+ неигровыми.
   */
  const swapsPerMiss = Math.max(0, L - PAIRS_VOLUME_TOP) / 4;
  return { pairs, groupSize, photo: true, previewMs, swapsPerMiss };
}

/** Зазор между картами поля. */
const ЗАЗОР_КАРТ = 8;

/**
 * Сетка поля: столбцы и сторона карты.
 *
 * 🔴 СТОРОНА ПОДГОНЯЕТСЯ И ПОД ВЫСОТУ, А НЕ ТОЛЬКО ПОД ШИРИНУ. Пока карта считалась
 * от одной ширины, на 360×640 четыре столбца давали карту 76 и поле L14 (5 рядов)
 * вставало одной картой под кнопку отзыва — замер живой сборки 16.09.2026. Теперь
 * карта не больше того, что влезает по высоте над резервом под кнопку, но и не меньше
 * пальца (ПАЛЕЦ = 48): мельче нажимать нельзя, и там поле честно прокручивается.
 * Ширина — жёсткий предел: на экране 320 шесть столбцов по 48 не помещаются, и карта
 * остаётся той, что влезает (как было до правки), а не вылезает за край.
 *
 * `высотаПоля` = 0 — поле ещё не измерено (первый кадр, пробы без раскладки): тогда
 * считаем только по ширине, то есть ровно как прежде.
 */
export function сеткаПар(p: {
  групп: number;
  карт: number;
  ширинаКонтейнера: number;
  высотаПоля: number;
  резервСнизу: number;
  подсказка: number;
}): { столбцов: number; карта: number; ширина: number; высота: number; безПрокрутки: boolean } {
  const вариант = (столбцов: number) => {
    const рядов = Math.max(1, Math.ceil(p.карт / столбцов));
    const поШирине = (p.ширинаКонтейнера - (столбцов - 1) * ЗАЗОР_КАРТ) / столбцов;
    const поВысоте = p.высотаПоля > 0
      ? (p.высотаПоля - p.резервСнизу - p.подсказка - (рядов - 1) * ЗАЗОР_КАРТ) / рядов
      : Infinity;
    const карта = Math.floor(Math.min(поШирине, Math.max(ПАЛЕЦ, поВысоте)));
    const высота = рядов * карта + (рядов - 1) * ЗАЗОР_КАРТ;
    return {
      столбцов,
      карта,
      ширина: столбцов * карта + (столбцов - 1) * ЗАЗОР_КАРТ,
      высота,
      безПрокрутки: p.высотаПоля <= 0 || высота + p.подсказка + p.резервСнизу <= p.высотаПоля,
    };
  };
  const прежний = p.групп <= 10 ? 4 : 6;
  if (p.высотаПоля <= 0) return вариант(прежний);
  /**
   * 🔴 СТОЛБЦЫ ВЫБИРАЮТСЯ ПО ПОЛЮ, А НЕ ПО ЧИСЛУ ГРУПП. Правило «до десяти групп — четыре
   * столбца» писалось под пары: десять пар — 20 карт, 5 рядов. У четвёрок девять-десять
   * групп — 36–40 карт, и в четыре столбца это 9–10 рядов: на эталонном 390×844 уровни
   * L18 и L19 не помещались над кнопкой (проба `picture-pairs-field-clears-feedback-button`).
   * Берём тот из двух раскладов, что помещается без прокрутки; из подходящих — с картой крупнее.
   */
  const [четыре, шесть] = [вариант(4), вариант(6)];
  if (четыре.безПрокрутки !== шесть.безПрокрутки) return четыре.безПрокрутки ? четыре : шесть;
  if (четыре.карта !== шесть.карта) return четыре.карта > шесть.карта ? четыре : шесть;
  return прежний === 4 ? четыре : шесть;
}

/** Сколько обменов после этой ошибки: целая часть среднего — всегда, дробная — броском. */
export function обменовПослеОшибки(swapsPerMiss: number, rnd: () => number): number {
  const целых = Math.floor(swapsPerMiss);
  return целых + (rnd() < swapsPerMiss - целых ? 1 : 0);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PicturePairsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const router = useRouter();
  const { width } = useWindowDimensions();
  /**
   * 🔴 ПОЛЕ НЕ ЗАХОДИТ ПОД КНОПКУ ОТЗЫВА. Замер живой сборки 16.09.2026, L37, 48 карт:
   * кнопка (слева внизу, поднята на FAB_BOTTOM над вырезом) закрывала «Карточку 43» на
   * 38 % при 390×844 и «Карточку 37» на 94 % при 360×640, прокрутки у поля не было —
   * карту не достать. Держалось с L21; пункт приёмки мерился только на L5 и L14.
   *
   * Резерв снизу — `insets.bottom + FAB_CLEARANCE`, а не `reserveBottom` раздела «Поиск»:
   * тот равен 131 + max(вырез, 10) и на iPhone с вырезом 34 даёт 165 при верхе кнопки
   * 174 — перекрытие 9 точек. Карты мельче пальца (48) делать нельзя, поэтому там, где
   * 48 карт выше кнопки не помещаются (360×640), поле прокручивается.
   */
  const insets = useSafeAreaInsets();
  const резервПодКнопку = insets.bottom + FAB_CLEARANCE;
  /** Высота окна прокрутки поля и строки-подсказки под ним — замер onLayout, не догадка. */
  const [высотаПоля, setВысотаПоля] = useState(0);
  const [высотаПодсказки, setВысотаПодсказки] = useState(44);
  const sprites = pairSpritesForProfile(profile?.id);
  const cardBack = pairBackForProfile(profile?.id);
  const { popups, spawn } = useScorePopups();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const chainNext = shouldChainNextLevel(useGameMode());
  const lvl = usePersistentLevel('picture_pairs');   // персист достигнутого уровня (раньше сбрасывался на 1)
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const gate = useLevelGate('picture_pairs');
  // Пресет (Зарядка) → одиночный раунд по фикс-настройкам; ручной запуск → игровой по умолчанию.
  const [mode, setMode] = useState<GameMode>(isPreset ? 'single' : 'game');
  const [level, setLevel] = useState(1);
  const [levelBanner, setLevelBanner] = useState<number | null>(null);
  // Кнопка «Играть — уровень N» должна показывать реальный сохранённый стартовый уровень, не «1».
  // ⚠️ lvl.level В ЗАВИСИМОСТЯХ ОБЯЗАТЕЛЕН. Без него выбор уровня на тропинке не
  // доезжал бы до игры: нажатие меняет lvl.level, а этот эффект — единственный
  // мост от хука к локальному состоянию, из которого собирается партия.
  useEffect(() => { if (lvl.loaded && !isPreset && mode === 'game') setLevel(lvl.level); }, [lvl.loaded, lvl.level, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pairsCount, setPairsCount] = useState(() => num('pairsCount', 6));
  const [photoMemoryMode, setPhotoMemoryMode] = useState(true);   // одиночный: фото-память ON по умолчанию
  const [previewMs, setPreviewMs] = useState<number>(() => num('previewMs', isPreset ? 3000 : 500));
  const [previewActive, setPreviewActive] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [openIdx, setOpenIdx] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matched, setMatched] = useState(0);
  const [errors, setErrors] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Пара клеток, которые сейчас меняются местами: подсвечена на рубашке. */
  const [swapPair, setSwapPair] = useState<[number, number] | null>(null);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreRef = useRef(0);
  const groupSizeRef = useRef(2);   // сколько одинаковых карт = группа (2 пара / 3 тройка / 4 четвёрка)
  /**
   * 🔴 ПРАВИЛО УРОВНЯ — ДО ПОКАЗА, А НЕ ПОСЛЕ. Отчёт 7d506dbe (08.09.2026, «Релакс»):
   * «для запоминания слишком мало времени».
   *
   * БЫЛО: карточка правила включалась при `!previewActive`, то есть ПОСЛЕ фото-показа.
   * Кадр живой сборки 390×844, L14: карты уже закрыты, секундомер 2 с, поверх —
   * «Четвёрки: совпадение — это ЧЕТЫРЕ одинаковые». На уровнях, где правило меняется
   * (тройки L10, четвёрки L13), человек проходил показ, НЕ ЗНАЯ, что запоминать, а
   * правило читал уже при закрытых картах и под секундомером, который входит в счёт.
   * Сделано так было потому, что уровни идут цепочкой и экрана настройки между ними
   * нет, а модалка поверх показа перекрыла бы его.
   *
   * СТАЛО: проверка правила включается с НАЧАЛА раунда, и если карточка открылась,
   * показ и секундомер останавливаются (эффект ниже). После «Понятно» показ идёт
   * ЦЕЛИКОМ заново — человек видит карты, уже зная правило, — и лишь потом стартует
   * секундомер. Время чтения правила в счёт не идёт.
   */
  const levelRules = useLevelRules('picture_pairs', level, PAIRS_RULES,
    phase === 'playing' && mode === 'game' && !isPreset && levelBanner === null);

  // Живые значения для эффекта правила: он срабатывает по открытию карточки, и через
  // замыкание видел бы ходы и время на момент своей записи, а не на момент события.
  // ⚠️ Пишутся ПОСЛЕ коммита, а не в теле компонента: запись в ref во время рендера —
  // ошибка `react-hooks/refs` (две штуки держали храповик линта красным на метке
  // 2.54.13). Слой-эффект срабатывает раньше обычного эффекта ниже, так что тот
  // читает уже свежие ходы и время — как в `WarmupContext` со `stateRef`.
  // Раскладку и открытость правила читают таймеры обменов — им тоже нужен живой кадр.
  const movesRef = useRef(0);
  const elapsedRef = useRef(0);
  const cardsRef = useRef<Card[]>([]);
  const правилоОткрытоRef = useRef(false);
  useLayoutEffect(() => {
    movesRef.current = moves; elapsedRef.current = elapsedTime;
    cardsRef.current = cards; правилоОткрытоRef.current = levelRules.open;
  }, [moves, elapsedTime, cards, levelRules.open]);
  const правилоОткрывалосьRef = useRef(false);

  /** Секундомер с уже набежавшими секундами — после паузы на правило или на обмены. */
  const запуститьЧасы = (прошлоСек: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow() - прошлоСек * 1000;
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
  };

  const остановитьОбмены = () => {
    if (swapTimerRef.current) { clearTimeout(swapTimerRef.current); swapTimerRef.current = null; }
    setSwapPair(null);
  };

  /**
   * Обмены после ошибки: пары закрытых карт по одной, каждая подсвечена SWAP_LIT_MS до
   * обмена — человек видит, КАКИЕ клетки поменялись, и может перенести запомненное.
   * Поле заперто, секундомер стоит: это время навязано игрой и в счёт не идёт.
   * Пара берётся из живого расклада (cardsRef), поэтому первая — после паузы SWAP_GAP_MS,
   * когда только что открытые карты уже закрылись и тоже могут переехать.
   */
  const запуститьОбмены = (сколько: number) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const шаг = (осталось: number) => {
      swapTimerRef.current = null;
      if (правилоОткрытоRef.current) { setSwapPair(null); return; }   // карточка правила сама отпустит поле
      const закрытые = cardsRef.current.map((c, i) => (c.matched || c.flipped ? -1 : i)).filter((i) => i >= 0);
      if (осталось <= 0 || закрытые.length < 2) {
        setSwapPair(null);
        setLocked(false);
        запуститьЧасы(elapsedRef.current);
        return;
      }
      const a = закрытые[Math.floor(Math.random() * закрытые.length)];
      const прочие = закрытые.filter((i) => i !== a);
      const b = прочие[Math.floor(Math.random() * прочие.length)];
      setSwapPair([a, b]);
      swapTimerRef.current = setTimeout(() => {
        setCards((cs) => { const n = [...cs]; [n[a], n[b]] = [n[b], n[a]]; return n; });
        setSwapPair(null);
        swapTimerRef.current = setTimeout(() => шаг(осталось - 1), SWAP_GAP_MS);
      }, SWAP_LIT_MS);
    };
    swapTimerRef.current = setTimeout(() => шаг(сколько), SWAP_GAP_MS);
  };

  useEffect(() => {
    if (levelRules.open) {
      // Карточка правила открылась: ни показ, ни секундомер не должны идти под ней.
      правилоОткрывалосьRef.current = true;
      остановитьОбмены();
      if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setCards((cs) => cs.map((c) => ({ ...c, flipped: c.matched })));
      setPreviewActive(false);
      setLocked(true);
      return;
    }
    if (!правилоОткрывалосьRef.current) return;
    правилоОткрывалосьRef.current = false;
    if (phase !== 'playing') return;
    if (movesRef.current === 0) {
      // Ходов ещё не было — показ целиком заново: теперь человек знает, что запоминать.
      setElapsedTime(0);
      setCards((cs) => cs.map((c) => ({ ...c, flipped: true })));
      setPreviewActive(true);
      setLocked(true);
      previewTimerRef.current = setTimeout(() => {
        setCards((cs) => cs.map((c) => ({ ...c, flipped: c.matched })));
        setPreviewActive(false);
        setLocked(false);
        запуститьЧасы(0);
      }, previewMs);
    } else {
      // Ход уже сделан — расклад не сбрасываем, секундомер продолжает с того же места.
      setLocked(false);
      запуститьЧасы(elapsedRef.current);
    }
  }, [levelRules.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildDeck = (n: number, groupSize: number) => {
    const symbols = shuffle(sprites.map((_, i) => i)).slice(0, Math.min(n, sprites.length));
    const deck: Card[] = [];
    symbols.forEach((s, i) => {
      for (let k = 0; k < groupSize; k++) deck.push({ id: i * groupSize + k, symbol: s, flipped: false, matched: false });
    });
    return shuffle(deck);
  };

  // Запустить один раунд с заданным конфигом (общий для обоих режимов).
  const startRound = (pairs: number, groupSize: number, photo: boolean, pms: number) => {
    остановитьОбмены();
    groupSizeRef.current = groupSize;
    setPreviewMs(pms || previewMs);
    const deck = buildDeck(pairs, groupSize);
    /**
     * 🔴 СЧЁТЧИК ПОБЕДЫ БЕРЁТСЯ ИЗ СОБРАННОЙ КОЛОДЫ, А НЕ ИЗ КОНФИГА. Пока он
     * приходил из конфига, любое расхождение между «сколько просили» и «сколько
     * получилось» делало партию незавершаемой — и заметить это можно было только
     * доиграв до неё. Теперь расхождение невозможно по построению.
     */
    setPairsCount(new Set(deck.map((c) => c.symbol)).size);
    setOpenIdx([]); setMoves(0); setMatched(0); setErrors(0); setLocked(false);
    setPhase('playing');
    if (photo) {
      // Фото-память: показать все карты лицом вверх на pms мс, затем закрыть.
      setCards(deck.map(c => ({ ...c, flipped: true })));
      setPreviewActive(true);
      setLocked(true);
      previewTimerRef.current = setTimeout(() => {
        setCards(deck.map(c => ({ ...c, flipped: false })));
        setPreviewActive(false);
        setLocked(false);
        const start = gameNow();
        setStartTime(start);
        timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
      }, pms);
    } else {
      setCards(deck);
      setPreviewActive(false);
      const start = gameNow();
      setStartTime(start);
      timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    }
  };

  const loadLevel = (L: number) => {
    const c = levelCfg(L);
    startRound(c.pairs, c.groupSize, c.photo, c.previewMs);
  };

  // Уровень пройден (все пары собраны) → бонус, сохранить, СЛЕДУЮЩИЙ уровень. Счёт копится.
  const advanceLevel = (finalTime: number) => {
    hapticSuccess();
    const done = level;
    scoreRef.current += Math.max(50, Math.round(400 - Math.max(0, moves + 1 - pairsCount) * 15 - finalTime * 2));
    setScore(scoreRef.current);
    saveSession({
      passed: true,   // сессия пишется только когда уровень собран
      game_type: 'picture_pairs', score: scoreRef.current, time_seconds: finalTime,
      difficulty: `lvl${done}`, mode: 'game', errors,
      details: { level: done, moves: moves + 1, pairs: pairsCount, photo_memory_mode: levelCfg(done).photo },
    }).catch((e) => console.error(e));
    const next = done + 1;
    setLevel(next);
    // ⚠️ reach, а НЕ setLevel: прямая установка срезала бы потолок после переигровки
    // пройденного уровня. pick следом продолжает цепочку с того места, где играли.
    if (!isPreset) { lvl.reach(next); lvl.pick(next); }
    // Итог показывает общая карточка ПОВЕРХ поля — сошедшиеся пары остаются видны.
    // Она же решает, запускать ли следующий уровень: своего таймера здесь больше нет,
    // он спорил с таймером зарядки (см. useGameMode).
    setLevelBanner(done);
    // Поле собрано — продолжать нечего, иначе «Продолжить» позвало бы на
    // уже разобранный расклад.
    if (profile?.id) clearResume(GAME_ID, profile.id).catch(() => {});
  };

  const startGame = () => {
    // Новая партия заменяет незаконченную: прежний расклад продолжать уже нечем.
    if (profile?.id) clearResume(GAME_ID, profile.id).catch(() => {});
    if (mode === 'game') {
      const startLvl = (!isPreset && lvl.loaded) ? lvl.level : 1;   // старт с сохранённого уровня
      scoreRef.current = 0; setScore(0); setLevel(startLvl); setLevelBanner(null);
      loadLevel(startLvl);
    } else {
      /**
       * ⚠️ Пресет — потолок желания (см. `presetCap`). В программах профилей стоит
       * `pairsCount: 10`, а лесенка на первом уровне даёт четыре: новичку из
       * зарядки выпадало поле в два с половиной раза больше освоенного.
       */
      const пар = capPresetByLevel({
        want: pairsCount,
        atLevel: levelCfg(lvl.loaded ? lvl.level : 1).pairs,
        atTop: lvl.level >= 9,
      });
      startRound(пар, 2, photoMemoryMode, photoMemoryMode ? previewMs : 0);   // одиночный — всегда пары
    }
  };

    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
  }, []);

  // ── незаконченная партия ────────────────────────────────────────────────
  /** Что в этой партии уже сделано руками — то, ради чего и стоит спрашивать при выходе. */
  const touched = moves > 0 || matched > 0 || errors > 0;
  /**
   * Живая партия. `!previewActive` здесь не украшение: во время фото-показа все
   * карты лежат лицом вверх, и снимок такого поля был бы сохранённой шпаргалкой.
   */
  const liveGame = phase === 'playing' && !previewActive && cards.length > 0 && levelBanner === null;

  const snapshot = (): PairsResume => ({
    mode, level, pairsCount, groupSize: groupSizeRef.current,
    // Недособранную группу закрываем: вернувшийся человек начинает ход заново,
    // а не получает подсказку из карты, открытой в момент выхода.
    cards: cards.map((c) => ({ ...c, flipped: c.matched })),
    moves, matched, errors, score: scoreRef.current, elapsed: elapsedTime,
  });

  /** Поднять расклад из снимка — поле ровно то, что оставили. */
  const applyResume = (r: PairsResume) => {
    остановитьОбмены();
    setMode(r.mode);
    setLevel(r.level);
    setPairsCount(r.pairsCount);
    groupSizeRef.current = r.groupSize;
    setCards(r.cards.map((c) => ({ ...c, flipped: c.matched })));
    setOpenIdx([]); setLocked(false); setPreviewActive(false);
    setMoves(r.moves); setMatched(r.matched); setErrors(r.errors);
    scoreRef.current = r.score; setScore(r.score);
    setLevelBanner(null);
    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow() - Math.max(0, r.elapsed) * 1000;
    setStartTime(start); setElapsedTime(r.elapsed);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    setPhase('playing');
  };

  // Подъём партии при входе на экран. Путь зарядки (autostart) не трогаем: там
  // человек явно запустил свежий раунд, и startGame сам выбросит старую партию.
  useResumeBoot<PairsResume>(GAME_ID, RESUME_V, (saved) => {
    if (!saved || !Array.isArray(saved.cards) || !saved.cards.length) return;
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
  }, [cards, moves, matched, errors, liveGame, touched]);   // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleCardPress = async (idx: number) => {
    if (locked || cards[idx].matched || cards[idx].flipped) return;
    const newCards = cards.map((c, i) => i === idx ? { ...c, flipped: true } : c);
    setCards(newCards);
    const newOpen = [...openIdx, idx];
    setOpenIdx(newOpen);

    if (newOpen.length === groupSizeRef.current) {
      setMoves((m) => m + 1);
      const firstSym = newCards[newOpen[0]].symbol;
      const allSame = newOpen.every((i) => newCards[i].symbol === firstSym);
      if (allSame) {
        // match — все N одинаковых карт группы
        setTimeout(async () => {
          const matchedCards = newCards.map((c, i) =>
            newOpen.includes(i) ? { ...c, matched: true } : c
          );
          setCards(matchedCards);
          const newMatched = matched + 1;
          setMatched(newMatched);
          setOpenIdx([]);
          hapticSuccess();
          spawn(width / 2 - 16, 120, '+1', '#fbbf24');
          if (newMatched >= pairsCount) {
            if (timerRef.current) clearInterval(timerRef.current);
            const finalTime = (gameNow() - startTime) / 1000;
            setElapsedTime(finalTime);
            if (mode === 'game') {
              advanceLevel(finalTime);
            } else {
              setPhase('result');
              try {
                await saveSession({
                  game_type: 'picture_pairs',
                  score: Math.max(0, Math.round(2000 - (moves + 1 - pairsCount) * 30 - finalTime)),
                  time_seconds: finalTime,
                  difficulty: `${pairsCount} pairs`,
                  mode: photoMemoryMode ? `photo-${previewMs}ms` : 'classic',
                  errors,
                  details: {
                    moves: moves + 1,
                    optimal: pairsCount,
                    photo_memory_mode: photoMemoryMode,
                    preview_ms: photoMemoryMode ? previewMs : 0,
                    extra_moves: (moves + 1) - pairsCount,
                  },
                });
              } catch (e) { console.error(e); }
            }
          }
        }, 400);
      } else {
        // mismatch
        setLocked(true);
        setErrors((e) => e + 1);
        hapticError();
        setTimeout(() => {
          setCards((cs) => cs.map((c, i) =>
            newOpen.includes(i) ? { ...c, flipped: false } : c
          ));
          setOpenIdx([]);
          const обменов = mode === 'game' && !isPreset ? обменовПослеОшибки(levelCfg(level).swapsPerMiss, Math.random) : 0;
          if (обменов > 0 && !правилоОткрытоRef.current) запуститьОбмены(обменов);
          else setLocked(false);
        }, 800);
      }
    }
  };

  // Сетка: столбцы по числу групп, сторона карты — по ширине и по высоте поля (см. сеткаПар).
  const containerW = Math.min(width - 32, 480);
  const сетка = сеткаПар({
    групп: pairsCount, карт: cards.length, ширинаКонтейнера: containerW,
    высотаПоля, резервСнизу: резервПодКнопку, подсказка: высотаПодсказки,
  });
  const cardSize = сетка.карта;

  /**
   * Выбор «уровни / свободно» — ОБЩИЙ компонент, как в судоку, Шульте, глазной
   * гимнастике, WCST и PRL. Своя пара кнопок «🎮 Игровой / 🎯 Одиночный» стояла
   * тут с зашитыми ru/en: немцу и корейцу обе подписи приходили по-английски.
   *
   * ⚠️ ВНУТРЕННИЕ ИМЕНА РЕЖИМОВ ОСТАЛИСЬ 'game' | 'single'. Их пишет снимок
   * недоигранной партии (PairsResume.mode, RESUME_V=1): переименуй — и сохранённая
   * партия оживёт не в том режиме, в каком её бросили. Поэтому перевод значений
   * туда-обратно делается здесь, на границе с панелью.
   */
  const renderModeToggle = () => (
    <GameModeSwitch
      mode={mode === 'game' ? 'levels' : 'free'}
      onChange={(m) => setMode(m === 'levels' ? 'game' : 'single')}
      colors={colors}
      accent={GRADIENT[0]}
      t={t}
      hint={t(mode === 'game' ? 'pairsModeLevelsHint' : 'pairsModeFreeHint')}
    />
  );

  const renderConfig = () => {
    const c = levelCfg(level);
    return (
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="heart" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('picturePairs')}</Text>
        <Text style={styles.configDesc}>{t('picturePairsDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="picturePairsIntroDesc" benefits={PAIRS_BENEFITS} accent={GRADIENT[0]} />

      {renderModeToggle()}

      {mode === 'game' ? (
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('pairsLvlPairs').replace('{n}', String(c.pairs))}
            {c.photo ? ` · ${t('pairsLvlFlash').replace('{s}', (c.previewMs / 1000).toFixed(1))}` : ''}
          </Text>
          {level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => setLevel(1)} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{t('pairsCount')}</Text>
            <View style={styles.optionButtons}>
              {[6, 8, 10, 12].map((n) => {
                const levelKey = `${n} pairs`;
                const lock = gate.isLocked(levelKey);
                return (
                <TouchableOpacity
                  accessibilityRole="button" key={n} disabled={lock}
                  style={[styles.modeButton, pairsCount === n && !lock
                    ? { backgroundColor: GRADIENT[0] }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: lock ? 0.5 : 1 }]}
                  onPress={() => !lock && setPairsCount(n)}>
                  <Text style={[styles.modeButtonText, { color: pairsCount === n && !lock ? textOn(GRADIENT[0]) : colors.text }]}>
                    {n}{lock ? ' 🔒' : ''}
                  </Text>
                </TouchableOpacity>
                );
              })}
            </View>
            {gate.nextHint && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 8, fontStyle: 'italic' }}>
                {gate.nextHint}
              </Text>
            )}
          </View>

          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              accessibilityRole="button" onPress={() => setPhotoMemoryMode(!photoMemoryMode)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={photoMemoryMode ? 'checkbox' : 'square-outline'} size={24} color={GRADIENT[0]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.text }]}>{t('label_photo_memory')}</Text>
                <Text style={[{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }]}>
                  {t('desc_photo_memory')}
                </Text>
              </View>
            </TouchableOpacity>
            {photoMemoryMode && (
              <View style={styles.optionButtons}>
                {([500, 1500, 3000] as const).map((ms) => (
                  <TouchableOpacity
                    accessibilityRole="button" key={ms} style={[styles.modeButton, previewMs === ms
                    ? { backgroundColor: GRADIENT[0] }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => setPreviewMs(ms)}>
                    <Text style={[styles.modeButtonText, { color: previewMs === ms ? textOn(GRADIENT[0]) : colors.text }]}>
                      {/* Секунды + готовая тройка «Легко/Средне/Сложно» из словаря:
                          отдельные подписи «хард/норма/легко» были бы четвёртым
                          названием одной и той же шкалы сложности. */}
                      {`${ms / 1000}${t('secShort')} (${t(ms === 500 ? 'hard' : ms === 1500 ? 'medium' : 'easy')})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {/* Тропинка — только в режиме уровней: в свободной партии уровня нет. */}
      {mode === 'game' && (
        <LevelProgressMap bestLevel={lvl.best}
          gameId="picture_pairs"
          currentLevel={level}
          maxLevel={Math.max(15, level, lvl.best)}
          onPickLevel={lvl.pick}
          colors={colors}
          language={language}
        />
      )}

    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={mode === 'game' ? t('playLevelN').replace('{n}', String(level)) : t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
    );
  };

  // игровая фаза — на едином каркасе GameShell (HUD-бейджи в статс-слоте);
  // модалка правил уровня — поверх каркаса (паттерн digit-span)
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('picturePairs')}
          onBack={() => goBackOrHome()}
          confirmExit={liveGame && touched}
          resumable
          onSaveBeforeExit={saveBeforeExit}
          stats={previewActive ? (
            <View style={{ alignItems: 'center', gap: 4, paddingVertical: 8 }}>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 2 }}>
                {t('label_memorize')}
              </Text>
              <Text style={{ color: '#666', fontSize: 12 }}>
                {t('pairsPreviewHint').replace('{s}', (previewMs / 1000).toFixed(1))}
              </Text>
            </View>
          ) : (
            <View style={styles.statsRow}>
              {mode === 'game' && (
                <HudBadge icon="flag" value={`${t('label_level_short')} ${level}`} colors={['#fbbf24', '#d97706']} tint="#3f2b00" pop />
              )}
              {mode === 'game' && (
                <HudBadge icon="star" value={score} colors={['#f59e0b', '#b45309']} pop />
              )}
              <HudBadge icon="checkmark-done" value={`${matched}/${pairsCount}`} colors={['#34d399', '#059669']} pop />
              <HudBadge icon="swap-horizontal" value={moves} colors={['#fb7185', '#e11d48']} />
              <HudBadge icon="time" value={hudTime(elapsedTime, t('secShort'))} colors={['#60a5fa', '#2563eb']} />
              {mode === 'game' && !isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />}
            </View>
          )}
        >
          {/* Накладка итога и всплывающие очки — ВНЕ прокрутки: иначе уехали бы вместе с полем. */}
          <ScrollView
            testID="pp-field-scroll"
            style={styles.fieldScroll}
            contentContainerStyle={[styles.fieldScrollContent, { paddingBottom: резервПодКнопку }]}
            showsVerticalScrollIndicator={false}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              setВысотаПоля((было) => (Math.abs(было - h) > 1 ? h : было));
            }}
          >
            <View style={[styles.cardsArea, { width: сетка.ширина }]}>
              {cards.map((card, i) => (
                <FlipCard
                  key={i}
                  size={cardSize}
                  radius={10}
                  flipped={card.flipped || card.matched}
                  matched={card.matched}
                  disabled={card.matched || card.flipped || locked}
                  onPress={() => handleCardPress(i)}
                  a11yLabel={
                    // Пока карта закрыта — символ НЕ называем, иначе игра теряет смысл.
                    card.flipped || card.matched
                      ? `${t('a11yCard')} ${i + 1}, ${card.symbol + 1}${card.matched ? `, ${t('a11yFound')}` : ''}`
                      : `${t('a11yCard')} ${i + 1}`
                  }
                  back={
                    swapPair?.includes(i) ? (
                      // Пара, которая сейчас меняется местами: толстая рамка и значок обмена —
                      // одной рамки на девяти цветах рубашек мало.
                      <View testID="pp-swap-lit" style={{ width: cardSize, height: cardSize, borderRadius: 10, backgroundColor: cardBack.color, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: SWAP_LIT_COLOR }}>
                        <Ionicons name="swap-horizontal" size={cardSize * 0.42} color="#ffffff" />
                      </View>
                    ) : (
                      <View style={{ width: cardSize, height: cardSize, borderRadius: 10, backgroundColor: cardBack.color, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                        <Ionicons name={cardBack.icon as any} size={cardSize * 0.32} color="rgba(255,255,255,0.6)" />
                      </View>
                    )
                  }
                  front={
                    <View style={{ width: cardSize, height: cardSize, borderRadius: 10, backgroundColor: card.matched ? '#22c55e' : colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
                      <Image source={sprites[card.symbol]} style={{ width: cardSize * 0.82, height: cardSize * 0.82 }} resizeMode="contain" />
                    </View>
                  }
                />
              ))}
            </View>
            {/* Строка «что делать»: без неё правило видно только в справке, а
                в справку во время партии не ходят. */}
            {!previewActive && (
              <Text
                style={[styles.hintText, { color: colors.textSecondary }]}
                onLayout={(e) => {
                  const h = Math.round(e.nativeEvent.layout.height) + 12;   // + marginTop строки
                  setВысотаПодсказки((было) => (Math.abs(было - h) > 1 ? h : было));
                }}
              >{t('picturePairsHint')}</Text>
            )}
          </ScrollView>
          {/* Итог — общей карточкой поверх поля. Своя плашка не сохраняла звёзды,
              не считала серию и не тикала глаз-разрядку; всё это живёт в общей. */}
          {levelBanner !== null && (
            <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
              <LevelCleared
                level={levelBanner}
                stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
                gradient={GRADIENT}
                colors={colors}
                language={language}
                gameId="picture_pairs"
                variant="overlay"
                onContinue={() => { setLevelBanner(null); loadLevel(levelBanner + 1); }}
                onStop={() => { setLevelBanner(null); setPhase('config'); }}
              />
            </View>
          )}
          <ScorePopupLayer popups={popups} />
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
        <Text style={[styles.title, { color: colors.text }]}>{t('picturePairs')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(2000 - (moves - pairsCount) * 30 - elapsedTime))}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320, marginTop: 12 },
  fieldScroll: { flex: 1, alignSelf: 'stretch' },
  fieldScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  cardsArea: { flexDirection: 'row', flexWrap: 'wrap', gap: ЗАЗОР_КАРТ, justifyContent: 'flex-start', maxWidth: '100%' },
  card: { borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardText: { textAlign: 'center' },
});
