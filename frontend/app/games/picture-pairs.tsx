/* psygames-game-picture-pairs · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const PAIRS_RULES: LevelRule[] = [
  {
    key: 'triple', fromLevel: 10, toLevel: 12,
    ru: { title: 'Тройки', rule: 'С этого уровня совпадение — не пара, а ТРИ одинаковые картинки. Открывай три подряд: две одинаковые — ещё не матч.', example: 'Пример: 🐱🐱 — мало, группа снимется только с третьей 🐱.' },
    en: { title: 'Triples', rule: 'From this level a match is not a pair but THREE identical pictures. Open three in a row: two of a kind is not a match yet.', example: 'Example: 🐱🐱 is not enough — the group clears only with a third 🐱.' },
  },
  {
    key: 'quad', fromLevel: 13,
    ru: { title: 'Четвёрки', rule: 'Теперь совпадение — ЧЕТЫРЕ одинаковые картинки. Открой все четыре подряд, чтобы снять группу.', example: 'Пример: 🐱🐱🐱 — мало, нужна четвёртая 🐱.' },
    en: { title: 'Quads', rule: 'Now a match is FOUR identical pictures. Open all four in a row to clear the group.', example: 'Example: 🐱🐱🐱 is not enough — you need a fourth 🐱.' },
  },
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
export function levelCfg(L: number): { pairs: number; groupSize: number; photo: boolean; previewMs: number } {
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
  return { pairs, groupSize, photo: true, previewMs };
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
  const scoreRef = useRef(0);
  const groupSizeRef = useRef(2);   // сколько одинаковых карт = группа (2 пара / 3 тройка / 4 четвёрка)
  // Справка правил уровня: только игровой режим (в одиночном всегда пары, в пресете свой поток).
  // Не всплываем во время баннера уровня и фото-показа — иначе модалка перекроет флеш карт.
  const levelRules = useLevelRules('picture_pairs', level, PAIRS_RULES,
    phase === 'playing' && mode === 'game' && !isPreset && !previewActive && levelBanner === null);

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
          setLocked(false);
        }, 800);
      }
    }
  };

  // grid layout — adapt cols to pairsCount
  const cols = pairsCount <= 6 ? 4 : pairsCount <= 10 ? 4 : 6;
  const gap = 8;
  const containerW = Math.min(width - 32, 480);
  const cardSize = (containerW - (cols - 1) * gap) / cols;

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
          <View style={[styles.cardsArea, { width: containerW }]}>
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
                  <View style={{ width: cardSize, height: cardSize, borderRadius: 10, backgroundColor: cardBack.color, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                    <Ionicons name={cardBack.icon as any} size={cardSize * 0.32} color="rgba(255,255,255,0.6)" />
                  </View>
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
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('picturePairsHint')}</Text>
          )}
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
  cardsArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start', maxWidth: '100%' },
  card: { borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardText: { textAlign: 'center' },
});
