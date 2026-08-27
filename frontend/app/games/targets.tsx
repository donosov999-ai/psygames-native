/* psygames-game-targets · VER 2 · 27.08.2026 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getAbilityCount, useAbility } from '@/src/services/abilities';

const GRADIENT = ['#ff0844', '#ffb199'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.75 (норма AA 4.5), стало 4.58.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

const TARGETS_BENEFITS = [
  { icon: 'car-outline', textKey: 'benefitTargets1' },
  { icon: 'football-outline', textKey: 'benefitTargets2' },
  { icon: 'flash-outline', textKey: 'benefitTargets3' },
];

type GamePhase = 'intro' | 'config' | 'ready' | 'playing' | 'result';
type GameMode = 'field' | 'joker';

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];

// Уровень (1..15+): темп появления↑ (delay↓) + число квадратов↑ (труднее найти совпадение). Размер цели↓ — фаза 2.
/**
 * 🔴 ДОЛЯ МИШЕНЕЙ ЗАДАЁТСЯ, А НЕ ВЫПАДАЕТ СЛУЧАЙНО.
 *
 * Раньше «мишень» получалась сама собой: если среди круга и квадратов нашлось
 * повторяющийся цвет. Число квадратов росло без потолка, цветов семь — и с
 * 21-го уровня фигур становилось ВОСЕМЬ. По принципу Дирихле совпадение
 * обязано быть: вероятность мишени ровно 1.0000, и стратегия «жать всегда»
 * становилась безошибочной. Проба на торможение переставала мерить торможение.
 *
 * В нормальной пробе go/no-go доля мишеней — ЗАДАННЫЙ параметр, а не следствие
 * арифметики. Поэтому сначала решаем, мишень это или нет, и уже под решение
 * подбираем цвета.
 */
const TARGET_RATE = 0.5;

function levelParams(level: number): { delay: number; numSquares: number } {
  const delay = Math.max(450, 2100 - level * 120);          // L1≈1980мс → L14≈450мс
  // Потолок: круг плюс квадраты обязаны помещаться в палитру, иначе «не мишень»
  // невозможно построить в принципе.
  const wanted = 2 + Math.floor((level - 1) / 4);
  const numSquares = Math.min(wanted, COLORS.length - 1);
  return { delay, numSquares };
}

/**
 * Цвета раунда под заданный исход. `null` в `prevColor` — первый раунд «джокера»,
 * там мишени быть не может.
 */
export function buildRoundColors(
  numSquares: number,
  mode: 'field' | 'joker',
  wantTarget: boolean,
  prevColor: string | null,
  palette: readonly string[] = COLORS,
): { circle: string; squares: string[]; isTarget: boolean } {
  const pick = () => palette[Math.floor(Math.random() * palette.length)] as string;
  const shuffled = [...palette].sort(() => Math.random() - 0.5);

  if (mode === 'joker') {
    const circle = pick();
    if (wantTarget && prevColor) {
      // Мишень: прежний цвет круга обязан встретиться среди квадратов.
      const squares = Array.from({ length: numSquares }, () => pick());
      squares[Math.floor(Math.random() * numSquares)] = prevColor;
      return { circle, squares, isTarget: true };
    }
    // Не мишень: прежнего цвета среди квадратов быть не должно.
    const allowed = palette.filter((c) => c !== prevColor);
    const squares = Array.from({ length: numSquares }, () =>
      allowed[Math.floor(Math.random() * allowed.length)] as string);
    return { circle, squares, isTarget: false };
  }

  if (wantTarget) {
    // Мишень: ровно одна пара одинаковых среди круга и квадратов.
    const distinct = shuffled.slice(0, numSquares + 1);
    const circle = distinct[0] as string;
    const squares = distinct.slice(1) as string[];
    /**
     * Дублируем цвет из ДРУГОГО места — иначе присваивание может оказаться
     * «сам себе», и совпадения не выйдет вовсе. Первая редакция выбирала
     * источник и место независимо и на двух квадратах промахивалась.
     * Индексы: 0 — круг, 1..n — квадраты.
     */
    const to = Math.floor(Math.random() * numSquares);          // куда кладём
    const others = Array.from({ length: numSquares + 1 }, (_, i) => i).filter((i) => i !== to + 1);
    const from = others[Math.floor(Math.random() * others.length)] as number;
    squares[to] = (from === 0 ? circle : squares[from - 1]) as string;
    return { circle, squares, isTarget: true };
  }

  // Не мишень: все цвета разные. Возможно только пока фигур не больше палитры.
  const distinct = shuffled.slice(0, numSquares + 1);
  return { circle: distinct[0] as string, squares: distinct.slice(1) as string[], isTarget: false };
}

export default function TargetsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('targets');   // персист достигнутого уровня (раньше сбрасывался)
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в блок «Об игре» (GameAbout);
  const [mode, setMode] = useState<GameMode>(() => (str('mode', 'field') as GameMode));
  const [level, setLevel] = useState(() => num('level', 1));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  // Рендерится только то, что реально видно на экране. Раньше тут же жили
  // round/isTarget/showTime/gameOver — в JSX они НЕ используются, но каждый setState
  // гонял лишний ре-рендер игрового поля (LinearGradient + фигуры) по 4 раза за раунд.
  // Их значения переехали в рефы ниже (см. levelRef/isTargetRef/showTimeRef/gameOverRef).
  const [shapes, setShapes] = useState<{ type: 'circle' | 'square'; color: string }[]>([]);
  const [prevCircleColor, setPrevCircleColor] = useState<string | null>(null);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'hit' | 'miss' | 'wrong' | null>(null);

  /**
   * ── ВТОРАЯ ЖИЗНЬ (расходуемая способность, `src/services/abilities.ts`) ──────
   *
   * ПОЧЕМУ ИМЕННО ЗДЕСЬ И БОЛЬШЕ НИГДЕ. «Мишени» — единственная игра каталога, где
   * жизни это игровая условность, а не измеряемая величина: в сессию уходят
   * `mean_rt`/`std_rt`/`hits`, а сами жизни выдаются пачкой на старте и ДОБАВЛЯЮТСЯ
   * на переходе уровня (`getLifeBonus`). В корси, ряде цифр и клетках лимит ошибок —
   * это и есть замер (спан = докуда дошёл до двух ошибок), там лишняя попытка врёт
   * прямо в биомаркер; в сортировке лимит ходов — сама головоломка. Реестр с
   * причинами держит гейт `abilities-economy.test.ts`.
   *
   * ЧТО ЭТО НЕ ДЕЛАЕТ. Не подсказывает, не замедляет темп, не возвращает промах.
   * Партия просто не обрывается — а дальше играть ровно так же трудно.
   *
   * ⚠️ ЛЕСТНИЦА ЗАМИРАЕТ. Партия с купленной жизнью НЕ двигает сохранённый уровень
   * (`ladderFrozenRef`): иначе за 120⭐ покупалась бы ступень, которую человек не взял,
   * — то есть ровно обход лестницы сложности, ради запрета которого всё и писалось.
   */
  const { profile } = useProfile();
  const [secondLives, setSecondLives] = useState(0);   // остаток в кошельке — виден ДО траты
  const [deathOffer, setDeathOffer] = useState(false); // партия замерла: жизни кончились, ждём решения
  const [lifeSpent, setLifeSpent] = useState(false);   // в этой партии жизнь уже потрачена
  const secondLivesRef = useRef(0);                    // остаток для колбэков таймеров (те же stale-замыкания)
  const usedLifeRef = useRef(false);                   // одна жизнь на партию, не больше
  const spendingRef = useRef(false);                   // одно нажатие — одно списание
  const ladderFrozenRef = useRef(false);               // купленная жизнь замораживает рост уровня

  const reloadSecondLives = useCallback(async () => {
    const pid = profile?.id;
    const n = pid ? await getAbilityCount(pid, 'second_life') : 0;
    secondLivesRef.current = n;
    setSecondLives(n);
  }, [profile?.id]);
  useEffect(() => { reloadSecondLives(); }, [reloadSecondLives]);

  const roundsPerLevel = 10;

  // Рефы для значений, читаемых из таймерных колбэков (фикс stale-closure).
  // generateRound/nextRound/handleMiss вызываются из setTimeout со СТАРЫМ замыканием,
  // поэтому level/round «застревали» и потом скакали (2→9). Источник истины — рефы,
  // state (setLevel/setLives/...) остаётся только для рендера HUD.
  const levelRef = useRef(level);
  const roundRef = useRef(0);
  const livesRef = useRef(3);
  const gameOverRef = useRef(false);
  /**
   * 🔴 ОШИБКИ СЧИТАЛИСЬ, НО В ИСТОРИЮ ШЁЛ НОЛЬ. В партию писалось `errors: 0`
   * константой, поэтому у «Мишеней» в истории ВСЕГДА ноль ошибок — сравнить
   * себя с собой было нечем, а любой отчёт по этой игре врал.
   */
  const errorsRef = useRef(0);
  const isTargetRef = useRef(false);
  const prevColorRef = useRef<string | null>(null);
  const showTimeRef = useRef(0);                 // момент показа стимула — нужен только для RT, не для рендера
  const scoreRef = useRef(0);                    // endGame зовётся из setTimeout → state в его замыкании отстаёт
  const rtRef = useRef<number[]>([]);            // на последний хит; в БД уходили бы старые очки/RT

  // ── ОДИН слот таймера на весь игровой цикл ──────────────────────────────────
  // ЗАЧЕМ: цикл строго последовательный (показ → ответ/промах → пауза → показ),
  // одновременно живых шагов не бывает. Раньше в timerRef хранился ТОЛЬКО таймер
  // авто-промаха, а таймауты фидбэка (300мс), паузы между раундами (200мс) и старта
  // (500мс) не хранились нигде и не отменялись. Итог: тап в паузе между раундами
  // (или дабл-тап по «НАЧАТЬ») запускал ВТОРУЮ независимую цепочку generateRound,
  // и дальше два-три цикла крутились параллельно — каждый со своим таймером и своим
  // раундом. Отсюда и репорты: цвета/крестик «мигают», а темп «ускоряется» к концу
  // уровня (цепочки копятся по ходу уровня и никогда не схлопываются).
  // Единственный слот делает лишнюю цепочку невозможной: новый шаг отменяет прошлый.
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);              // размонтировали/ушли назад — таймеры молчат
  const roundLiveRef = useRef(false);            // стимул на экране и ещё не отвечен

  const clearAllTimers = () => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const schedule = (fn: () => void, ms: number) => {
    clearAllTimers();
    stepTimerRef.current = setTimeout(() => {
      stepTimerRef.current = null;
      if (stoppedRef.current) return;
      fn();
    }, ms);
  };

  useEffect(() => () => { stoppedRef.current = true; clearAllTimers(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const getLifeBonus = (lvl: number): number => {
    if (lvl <= 3) return 1;
    if (lvl <= 6) return 3;
    return 5;
  };

  const generateRound = () => {
    if (stoppedRef.current || gameOverRef.current) return;

    const newShapes: { type: 'circle' | 'square'; color: string }[] = [];
    
    // Generate circle
    const ns = levelParams(levelRef.current).numSquares;
    /**
     * Раунд строится ПОД ЗАДУМАННЫЙ исход, а не наоборот. Прежде «мишень»
     * получалась сама собой из совпадения цветов, и с 21-го уровня фигур
     * становилось больше, чем цветов, — совпадение делалось неизбежным.
     */
    const wantTarget = Math.random() < TARGET_RATE;
    const round = buildRoundColors(ns, mode === 'field' ? 'field' : 'joker', wantTarget, prevColorRef.current);
    const circleColor = round.circle;
    newShapes.push({ type: 'circle', color: circleColor });
    round.squares.forEach((c) => newShapes.push({ type: 'square', color: c }));
    const target = round.isTarget;

    prevColorRef.current = circleColor;
    isTargetRef.current = target;
    showTimeRef.current = gameNow();
    roundLiveRef.current = true;        // с этого момента тап засчитывается (см. handleClick)
    // Один синхронный блок = один ре-рендер поля (React 18+ батчит), фигуры не «моргают»
    setPrevCircleColor(circleColor);
    setShapes(newShapes);

    // Auto-advance after delay (по СВЕЖЕМУ уровню из рефа, не из stale-замыкания)
    const delay = levelParams(levelRef.current).delay;
    // Передаём СВЕЖИЙ target в таймаут: handleMiss из этого замыкания читал бы stale isTarget
    // (значение ПРОШЛОГО раунда — setIsTarget ещё не применился) → снимал жизнь на НЕ-мишени,
    // если прошлый раунд был мишенью. Теперь решение по факту текущего раунда.
    schedule(() => handleMiss(target), delay);
  };

  const startGame = () => {
    clearAllTimers();                   // «Играть снова» не должно наследовать таймер прошлой партии
    stoppedRef.current = false;
    roundLiveRef.current = false;
    const startLvl = isPreset ? level : Math.max(level, lvl.level);   // старт с сохранённого уровня
    if (!isPreset) setLevel(startLvl);
    scoreRef.current = 0;
    setScore(0);
    livesRef.current = 3 + getLifeBonus(startLvl);
    errorsRef.current = 0;
    setLives(livesRef.current);
    roundRef.current = 0;
    levelRef.current = startLvl;        // стартовый уровень (сохранённый или из конфига)
    gameOverRef.current = false;
    usedLifeRef.current = false;      // жизнь даётся одна на ПАРТИЮ — новая партия обнуляет
    ladderFrozenRef.current = false;
    setLifeSpent(false);
    setDeathOffer(false);
    isTargetRef.current = false;
    prevColorRef.current = null;
    rtRef.current = [];
    setReactionTimes([]);
    setPrevCircleColor(null);
    setShapes([]);
    setFeedback(null);
    setPhase('ready');
  };

  const beginRounds = () => {
    setPhase('playing');
    // через общий слот: дабл-тап по «НАЧАТЬ» больше не даёт двух параллельных циклов
    schedule(generateRound, 500);
  };

  const handleClick = () => {
    // ЗАЧЕМ roundLiveRef: тап засчитывается ТОЛЬКО пока стимул на экране и не отвечен.
    // Раньше тап в паузе между раундами (200/300мс) читал isTargetRef ПРОШЛОГО раунда —
    // фантомный «хит» с завышенным RT или потеря жизни ни за что — и вдобавок заводил
    // вторую цепочку таймеров. На высоких уровнях (delay 450мс) в паузы попадали
    // постоянно → мигание цветов и «ускорение» ближе к концу уровня.
    if (stoppedRef.current || gameOverRef.current || !roundLiveRef.current) return;
    roundLiveRef.current = false;
    clearAllTimers();                                  // снять авто-промах текущего раунда

    const reactionTime = gameNow() - showTimeRef.current;

    if (isTargetRef.current) {
      // Correct hit!
      setFeedback('hit');
      rtRef.current = [...rtRef.current, reactionTime];
      setReactionTimes(rtRef.current);

      // Calculate points
      const delay = levelParams(levelRef.current).delay;
      const points = Math.floor((levelRef.current * levelRef.current) * Math.max(0, delay - reactionTime) / 100);
      scoreRef.current += points;
      setScore(scoreRef.current);
    } else {
      // Wrong click
      setFeedback('wrong');
      livesRef.current -= 1;
      errorsRef.current += 1;
      setLives(livesRef.current);

      if (livesRef.current <= 0) { onOutOfLives(); return; }
    }

    schedule(() => {
      setFeedback(null);
      nextRound();
    }, 300);
  };

  const handleMiss = (wasTarget: boolean) => {
    if (stoppedRef.current || gameOverRef.current) return;
    roundLiveRef.current = false;                      // окно ответа закрыто

    if (wasTarget) {
      // Missed a target
      setFeedback('miss');
      livesRef.current -= 1;
      errorsRef.current += 1;
      setLives(livesRef.current);

      if (livesRef.current <= 0) { onOutOfLives(); return; }

      schedule(() => {
        setFeedback(null);
        nextRound();
      }, 300);
    } else {
      // Correctly didn't click on non-target
      nextRound();
    }
  };

  const nextRound = () => {
    if (stoppedRef.current || gameOverRef.current) return;

    roundRef.current += 1;

    if (roundRef.current >= roundsPerLevel) {
      // Уровень пройден — следующий (равномерно, каждые 10 раундов)
      if (levelRef.current < 15) {
        levelRef.current += 1;
        roundRef.current = 0;
        livesRef.current += getLifeBonus(levelRef.current);
        setLevel(levelRef.current);
        // ⚠️ Купленная жизнь лестницу не двигает — ступень остаётся заработанной.
        if (!isPreset && !ladderFrozenRef.current) lvl.reach(levelRef.current);   // сохранить достигнутый уровень между сессиями
        setLives(livesRef.current);
      } else {
        // Все уровни пройдены
        gameOverRef.current = true;
        endGame();
        return;
      }
    }

    schedule(generateRound, 200);
  };

  const endGame = async () => {
    clearAllTimers();
    roundLiveRef.current = false;

    // Из рефов, а не из state: endGame запускается через setTimeout(500) и его
    // замыкание относится к рендеру ДО последнего setScore/setReactionTimes —
    // в БД улетали очки и RT без последнего попадания.
    const rts = rtRef.current;
    const avgReaction = rts.length > 0
      ? rts.reduce((a, b) => a + b, 0) / rts.length
      : 0;
    // Standard deviation of RT — variability marker (higher std = more attention drift)
    const rtVariance = rts.length > 1
      ? rts.reduce((s, rt) => s + Math.pow(rt - avgReaction, 2), 0) / rts.length
      : 0;
    const rtStd = Math.sqrt(rtVariance);

    try {
      await saveSession({
        // Исход у игры ЕСТЬ и экран результата его уже показывает
        // (passed={!gameOverRef.current}) — запись отставала от UI и не несла
        // бита. Тот же смысл, что на экране: жизни кончились = не прошёл.
        passed: !gameOverRef.current,
        game_type: 'targets',
        score: scoreRef.current,
        time_seconds: avgReaction / 1000,
        difficulty: `Level ${levelRef.current}`,
        mode: mode,
        errors: errorsRef.current,
        details: {
          // Резерв прогресса: getMaxLevelFromSessions восстановит уровень отсюда,
          // если локальный ключ потерян (переустановка, сброс профиля).
          level: levelRef.current,
          hits: rts.length,
          mean_rt: Math.round(avgReaction),
          std_rt: Math.round(rtStd),
          n_targets: rts.length,
          /**
           * ⚠️ КУПЛЕННАЯ ЖИЗНЬ ПОМЕЧАЕТСЯ В ПАРТИИ. «Мишени» — замерная игра:
           * отсюда берутся среднее время реакции и разброс, и по ним открывается
           * содержимое. Уровень при покупке уже замораживался, а разблокировка нет —
           * человек докупал жизнь и открывал то, чего не взял. Метка гасит именно
           * это (`assistedRound` в level-unlocks), на экране партия считается как
           * прежде: покупка не должна оборачиваться отнятым счётом.
           */
          assisted: usedLifeRef.current,
        },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
    
    setPhase('result');
  };

  /**
   * Жизни кончились. Есть штука в кошельке и в этой партии её ещё не тратили —
   * партия не заканчивается, а ЗАМИРАЕТ и спрашивает.
   *
   * ⚠️ Автосписания нет нарочно. Списать молча — значит забрать 120⭐ у человека,
   * который, может, и хотел закончить: остаток и цена показываются до нажатия.
   */
  const onOutOfLives = () => {
    gameOverRef.current = true;
    clearAllTimers();
    if (secondLivesRef.current > 0 && !usedLifeRef.current) { setDeathOffer(true); return; }
    schedule(endGame, 500);
  };

  /**
   * Потратить штуку и продолжить.
   *
   * ⚠️ ТРИ ЗАСОВА, И ВСЕ НУЖНЫ: `usedLifeRef` — одна жизнь на партию; `spendingRef` —
   * второе нажатие, пока первое ещё в полёте, не проходит; само списание
   * (`useAbility`) неделимо и вернёт false, если штуки уже нет. Разрешение
   * продолжать даёт ИМЕННО списание, а не проверка остатка до него.
   */
  const takeSecondLife = async () => {
    const pid = profile?.id;
    if (!pid || spendingRef.current || usedLifeRef.current) return;
    spendingRef.current = true;
    let ok = false;
    try { ok = await useAbility(pid, 'second_life'); }
    finally { spendingRef.current = false; }
    await reloadSecondLives();
    if (!ok) return;                  // штуки не оказалось — предложение остаётся на экране
    usedLifeRef.current = true;
    ladderFrozenRef.current = true;
    setLifeSpent(true);
    livesRef.current = 1;
    setLives(1);
    gameOverRef.current = false;
    setDeathOffer(false);
    setFeedback(null);
    schedule(nextRound, 400);
  };

  const declineSecondLife = () => {
    setDeathOffer(false);
    schedule(endGame, 200);
  };

  // Кнопка «МИШЕНЬ!» статична, но лежит в том же поддереве, что и фигуры/HUD,
  // и раньше пересобиралась (вместе с LinearGradient) на КАЖДЫЙ setState раунда.
  // Стабильный onPress + useMemo → тяжёлый градиент рендерится один раз за партию,
  // а не 4 раза за раунд. handleClick читается через реф, поэтому не устаревает.
  const handleClickRef = useRef(handleClick);
  handleClickRef.current = handleClick;
  const onTargetPress = useCallback(() => handleClickRef.current(), []);
  const clickButton = useMemo(() => (
    <TouchableOpacity
      accessibilityRole="button"
      style={styles.clickButton}
      onPress={onTargetPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={GRADIENT as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.clickButtonGradient}
      >
        <Text style={styles.clickButtonText}>
          {t('label_target_excl')}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  ), [onTargetPress, t]);

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.configCard}
        >
          <Ionicons name="disc" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('targets')}</Text>
          <Text style={styles.configDesc}>{t('targetsDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="targetsIntroDesc" benefits={TARGETS_BENEFITS} accent={GRADIENT[0]} />

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('desc_targets')}
          </Text>
        </View>

        {/* Mode Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
          <View style={styles.optionButtons}>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.modeButton,
                mode === 'field' && { backgroundColor: GRADIENT[0] },
                mode !== 'field' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('field')}
            >
              <Ionicons
                name="grid-outline"
                size={20}
                color={mode === 'field' ? textOn(GRADIENT[0]) : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'field' ? textOn(GRADIENT[0]) : colors.text }]}>
                {t('field')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.modeButton,
                mode === 'joker' && { backgroundColor: GRADIENT[0] },
                mode !== 'joker' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('joker')}
            >
              <Ionicons
                name="sparkles-outline"
                size={20}
                color={mode === 'joker' ? textOn(GRADIENT[0]) : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'joker' ? textOn(GRADIENT[0]) : colors.text }]}>
                {t('joker')}
              </Text>
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.modeHint, { color: colors.textSecondary }]}>
            {mode === 'field'
              ? t('hint_targets_field')
              : t('hint_targets_joker')
            }
          </Text>
        </View>

        {/* Level Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
          <View style={styles.levelButtons}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={lvl}
                style={[
                  styles.levelButton,
                  level === lvl && { backgroundColor: GRADIENT[0] },
                  level !== lvl && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setLevel(lvl)}
              >
                <Text
                  style={[
                    styles.levelButtonText,
                    { color: level === lvl ? textOn(GRADIENT[0]) : colors.text },
                  ]}
                >
                  {lvl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <LevelProgressMap bestLevel={lvl.best}
          gameId="targets"
          currentLevel={lvl.level} onPickLevel={lvl.pick}
          maxLevel={Math.max(15, lvl.level)}
          colors={colors}
          language={language}
        />
        <TouchableOpacity
          accessibilityRole="button" style={styles.startButton} onPress={startGame}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startButtonGradient}
          >
            <Ionicons name="play" size={24} color={ON_GRAD.color} />
            <Text style={styles.startButtonText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderReady = () => (
    <View style={styles.readyContainer}>
      <Text style={[styles.readyTitle, { color: colors.text }]}>
        {t('label_ready')}
      </Text>
      <Text style={[styles.readyHint, { color: colors.textSecondary }]}>
        {t('hint_targets_press')}
      </Text>
      
      <TouchableOpacity
        accessibilityRole="button" style={[styles.startButton, styles.readyStartButton]} onPress={beginRounds}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Text style={styles.startButtonText}>
            {t('btn_start_caps')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  // playing-фаза — на едином каркасе GameShell (кнопочная миграция: поле тапов не скроллится,
  // мемоизированная кнопка «МИШЕНЬ!» прибита к низу в тулбаре)
  const renderGame = () => (
    <GameShell
      title={t('targets')}
      onBack={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}
      stats={
        <View style={styles.gameHeader}>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('level')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{level}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('score')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{score}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('label_lives')}
            </Text>
            <Text style={[styles.statValue, { color: lives <= 2 ? colors.error : colors.text }]}>
              {lives}
            </Text>
          </View>
        </View>
      }
      toolbar={clickButton}
    >
      <View style={styles.fieldCol}>
        {/* Shapes Display */}
        <View style={[styles.shapesArea, { backgroundColor: colors.surface }]}>
          {feedback && (
            <View style={[
              styles.feedbackBadge,
              { backgroundColor: feedback === 'hit' ? colors.success : colors.error }
            ]}>
              <Ionicons
                name={feedback === 'hit' ? 'checkmark' : 'close'}
                size={28}
                color="#FFFFFF"
              />
            </View>
          )}

          <View style={styles.shapesRow}>
            {shapes.map((shape, index) => (
              <View
                key={index}
                style={[
                  shape.type === 'circle' ? styles.circle : styles.square,
                  { backgroundColor: shape.color }
                ]}
              />
            ))}
          </View>

          {mode === 'joker' && prevCircleColor && (
            <View style={styles.prevCircleHint}>
              <Text style={[styles.prevCircleLabel, { color: colors.textSecondary }]}>
                {t('label_prev_circle')}
              </Text>
              <View style={[styles.miniCircle, { backgroundColor: prevCircleColor }]} />
            </View>
          )}
        </View>

        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {t('hint_targets_tap_if')}
        </Text>

        {/* ⚠️ ОСТАТОК ПОКАЗЫВАЕТСЯ ВСЕГДА, ВКЛЮЧАЯ НОЛЬ. Строка `{n > 0 && …}` в
            исходнике выглядит живой, а на экране её нет ровно у того, кто ещё ничего
            не покупал. Это же и есть «видно ДО того, как потратил»: цену и остаток
            человек читает заранее, а не в момент, когда партия уже висит на волоске. */}
        <Text style={[styles.lifeWalletLine, { color: colors.textSecondary }]}>
          {`${t('abName_second_life')} · ${t('abilityInWallet').replace('{n}', String(secondLives))}`}
        </Text>
        {lifeSpent ? (
          <Text style={[styles.lifeWalletLine, { color: colors.textSecondary }]}>
            {t('abilityLifeSpentNote')}
          </Text>
        ) : null}

        {/* Предложение второй жизни. Партия в этот момент ЗАМОРОЖЕНА (таймеры сняты
            в onOutOfLives), поэтому решение принимается без спешки. */}
        {deathOffer ? (
          <View style={[styles.lifeOffer, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
            <Text style={[styles.lifeOfferTitle, { color: colors.text }]}>{t('abilityLifeOffer')}</Text>
            <Text style={[styles.lifeWalletLine, { color: colors.textSecondary }]}>
              {t('abilityInWallet').replace('{n}', String(secondLives))}
            </Text>
            <View style={styles.lifeOfferRow}>
              <TouchableOpacity
                accessibilityRole="button" onPress={takeSecondLife} disabled={secondLives <= 0}
                style={[styles.lifeOfferBtn, { backgroundColor: GRADIENT[0], opacity: secondLives > 0 ? 1 : 0.5 }]}>
                {/* Цвет подписи считает textOn по самой заливке — белым по светлой кнопке не видно. */}
                <Text style={[styles.lifeOfferBtnText, { color: textOn(GRADIENT[0]) }]}>{t('abilityLifeTake')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button" onPress={declineSecondLife}
                style={[styles.lifeOfferBtn, { borderColor: colors.border, borderWidth: 1.5 }]}>
                <Text style={[styles.lifeOfferBtnText, { color: colors.text }]}>{t('abilityLifeDecline')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </GameShell>
  );

  if (phase === 'playing') return renderGame();


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('targets')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'ready' && renderReady()}
      {/* Итог раунда — общим экраном «уровень пройден»: только он пишет звёзды по
          уровням, считает серию чистых и тикает глаз-разрядку. До этого мишени шли
          мимо него, и узлы на их тропинке оставались пустыми.

          ⚠️ ЗВЁЗДЫ ЗДЕСЬ — ИГРОВАЯ ОЦЕНКА, А НЕ НОРМА. Пороги 350 и 500 мс выбраны
          как ступени внутри игры; выдавать их за возрастные нормы реакции нельзя,
          на телефоне к времени реакции добавляется задержка тапа. */}
      {phase === 'result' && (() => {
        const rts = reactionTimes;
        const mean = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : 0;
        const stars = mean > 0 && mean <= 350 ? 3 : mean <= 500 ? 2 : 1;
        return (
          <LevelCleared
            gameId="targets"
            level={lvl.level}
            /**
             * 🔴 ПОЗДРАВЛЯЛИ ПОБЕДОЙ ПОСЛЕ ПОЛНОГО ПРОИГРЫША. Признак «пройдено»
             * не передавался, а умолчание у экрана итога — «да»: человек сливал
             * все жизни и получал «🎉 Уровень пройден» с победным звуком и
             * засчитанной серией. Теперь исход приходит настоящий.
             */
            passed={!gameOverRef.current}
            stars={stars}
            gradient={GRADIENT}
            language={language}
            colors={colors}
            onContinue={() => startGame()}
            onStop={() => setPhase('config')}
          />
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700' },
  placeholder: { width: 44 },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 12, paddingBottom: 20 },
  configCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  configTitle: { fontSize: 24, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 14, color: ON_GRAD_SOFT },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 13, flex: 1 },
  optionCard: { padding: 14, borderRadius: 16 },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  optionButtons: { flexDirection: 'row' },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 6,
  },
  modeButtonText: { fontSize: 15, fontWeight: '600' },
  modeHint: { fontSize: 12, textAlign: 'center' },
  levelButtons: { flexDirection: 'row', flexWrap: 'wrap' },
  levelButton: {
    width: 44,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelButtonText: { fontSize: 16, fontWeight: '600' },
  startButton: { marginTop: 10 },
  readyStartButton: { width: '100%', maxWidth: 280 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 8,
  },
  startButtonText: { fontSize: 20, fontWeight: '700', color: ON_GRAD.color },
  readyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  readyTitle: { fontSize: 32, fontWeight: '800', marginBottom: 16 },
  readyHint: { fontSize: 16, textAlign: 'center', marginBottom: 40 },
  // Колонка поля: растянута на всё поле каркаса (оно центрирует и не тянет детей по ширине)
  fieldCol: { flex: 1, alignSelf: 'stretch' },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  shapesArea: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  feedbackBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shapesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 24,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  square: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  prevCircleHint: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  prevCircleLabel: { fontSize: 14 },
  miniCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  // В тулбаре каркаса: тянется на всю ширину ряда (нижний отступ даёт сам тулбар)
  clickButton: {
    flex: 1,
  },
  clickButtonGradient: {
    paddingVertical: 22,
    borderRadius: 16,
    alignItems: 'center',
  },
  clickButtonText: {
    fontSize: 24,
    fontWeight: '800',
    color: ON_GRAD.color,
  },
  hintText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  // Кошелёк второй жизни и само предложение — см. блок «ВТОРАЯ ЖИЗНЬ» выше.
  lifeWalletLine: { fontSize: 12, lineHeight: 1.5 * 12, textAlign: 'center', marginTop: 6 },
  lifeOffer: { marginTop: 12, borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 4 },
  lifeOfferTitle: { fontSize: 15, lineHeight: 1.4 * 15, fontWeight: '800', textAlign: 'center' },
  lifeOfferRow: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' },
  // minHeight 48 — единый минимум зоны нажатия по приложению (tap-target-audit).
  lifeOfferBtn: { minHeight: 48, paddingHorizontal: 18, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  lifeOfferBtnText: { fontSize: 14, fontWeight: '800' },
});
