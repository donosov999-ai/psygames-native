/* psygames-game-digit-span · VER 2 · 23.08.2026 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView
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
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LeaderboardModal from '@/src/components/LeaderboardModal';
import { countsForRecord, getPersonalBest, submitScore } from '@/src/services/leaderboard';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getAbilityCount, useAbility } from '@/src/services/abilities';
import { speakSequence, ttsCancel, type TtsBlock } from '@/src/services/tts';
import { useTtsBlock } from '@/src/hooks/useTtsAvailable';
import { getDigitSpanStrings } from '@/src/games/digit-span/core/i18n';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const DS_RULES: LevelRule[] = [
  { key: 'reverse', fromLevel: 11 },   // lr_digit_span_reverse_*
];

const GRADIENT = ['#11998e', '#38ef7d'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.52 (норма AA 4.5), стало 4.73.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const DIGIT_BENEFITS = [
  { icon: 'call-outline', textKey: 'benefitDigit1' },
  { icon: 'create-outline', textKey: 'benefitDigit2' },
  { icon: 'fitness-outline', textKey: 'benefitDigit3' },
];

type GamePhase = 'intro' | 'config' | 'showing' | 'input' | 'cleared' | 'result';
/**
 * Три классических порядка ответа. `ascending` — это Digit Sequencing из батареи
 * BACS (и режим «по возрастанию» в тренажёрах Google Play): показали 5-2-8-1 —
 * человек вводит 1-2-5-8. Задача та же память плюс перестроение ряда в уме.
 */
export type Direction = 'forward' | 'backward' | 'ascending';
export const DIRECTIONS: Direction[] = ['forward', 'backward', 'ascending'];

/** Чем подан стимул: цифру ВИДНО или её СЛЫШНО. */
export type Delivery = 'screen' | 'voice';
export const DELIVERIES: Delivery[] = ['screen', 'voice'];

/** Ступени темпа показа. Живые только в свободной партии — см. showTiming. */
export type Pace = 'slow' | 'normal' | 'fast';
export const PACE_STEPS: Pace[] = ['slow', 'normal', 'fast'];

// Уровень (1..15+): L1-6 длина 4→9 · L7-10 длина 9 + показ быстрее · L11+ обязательный обратный ввод.
// Сложность растёт ТРУДНОСТЬЮ (скорость, реверс), а не просто длиной за пределом памяти.
function levelParams(level: number): { startLen: number; showMs: number; gapMs: number; reverse: boolean } {
  const startLen = Math.min(9, 3 + level);              // L1=4 → L6=9, дальше держим 9
  const fast = Math.max(0, level - 6);                   // за потолком длины (L7+) ускоряем показ
  const showMs = Math.max(350, 700 - fast * 45);
  const gapMs = Math.max(550, 1100 - fast * 70);
  const reverse = level >= 11;                            // L11+ — обязательный обратный ввод
  return { startLen, showMs, gapMs, reverse };
}

/**
 * ОЖИДАЕМЫЙ ОТВЕТ — ОДНО МЕСТО НА ВСЕ ТРИ РЕЖИМА.
 *
 * ⚠️ Правило обязано быть общим и для разбора ввода, и для строки «было: …»
 * после ошибки. Пока их было два (`dir === 'forward' ? seq : reverse`,
 * повторённое в разметке), любой новый режим разъезжался ровно посередине:
 * ответ считался бы по одному правилу, а показывался по другому — человек видел
 * бы «было 1258» и не понимал, за что ему засчитали ошибку на 1258.
 *
 * ⚠️ ПОВТОРЯЮЩИЕСЯ ЦИФРЫ СОРТИРОВКЕ НЕ МЕШАЮТ: 5-2-5-1 по возрастанию — это
 * 1-2-5-5 и ничто другое, порядок ввода однозначен.
 */
export function expectedDigits(seq: number[], dir: Direction): number[] {
  if (dir === 'backward') return [...seq].reverse();
  if (dir === 'ascending') return [...seq].sort((a, b) => a - b);
  return [...seq];
}

/** Темп: сколько цифра держится на экране и через сколько приходит следующая. */
const PACE_MS: Record<Pace, { showMs: number; gapMs: number }> = {
  slow: { showMs: 1000, gapMs: 1600 },
  normal: { showMs: 700, gapMs: 1100 },   // прежний темп свободной партии — он и по умолчанию
  fast: { showMs: 450, gapMs: 750 },
};

/**
 * ТЕМП ПАРТИИ. В личной игре его целиком задаёт уровень, и ползунок туда не
 * достаёт НАРОЧНО: рекорд «Цифрового ряда» берётся ровно с первого уровня
 * (`countsForRecord`, см. LEADERBOARD_GAMES.digit_span), потому что спан с
 * разной подачей несравним. Дай крутить темп там — и таблица станет таблицей
 * самого медленного показа, а не памяти.
 */
export function showTiming(o: { isPreset: boolean; level: number; pace: Pace }): { showMs: number; gapMs: number } {
  if (!o.isPreset) {
    const p = levelParams(o.level);
    return { showMs: p.showMs, gapMs: p.gapMs };
  }
  return PACE_MS[o.pace];
}

/**
 * ЧЕМ ПОДАЁМ НА САМОМ ДЕЛЕ. Голос обещать нельзя, пока говорить нечем: «выбрал
 * голос — и тишина» это упражнение вообще без стимула. Причина у человека перед
 * глазами (`voiceNoVoice` / `voiceSoundOff` — они разные и лечатся по-разному),
 * а партия идёт экраном. Требование шапки `src/services/tts.ts`: честная
 * заглушка, а НЕ беззвучное молчание.
 */
export function effectiveDelivery(chosen: Delivery, block: TtsBlock): Delivery {
  return chosen === 'voice' && block === null ? 'voice' : 'screen';
}

/**
 * ЧТО СТОИТ РЕКОРДОМ В ШАПКЕ ПО ХОДУ ПАРТИИ. Взятая только что длина — уже
 * рекорд, если эта партия в рекорд идёт.
 *
 * ⚠️ А ЕСЛИ НЕ ИДЁТ — НЕ ДВИГАЕМ ДАЖЕ НА ЭКРАНЕ. Свободная партия, партия
 * голосом и пробный заход никуда не записываются; показать в них «рекорд 9»
 * значит показать число, которого назавтра не окажется нигде.
 */
export function hudRecord(stored: number | null, span: number, counts: boolean): number | null {
  if (!counts) return stored;
  // Рекорда ещё не было и брать нечего — это «—», а не выдуманный ноль.
  if (stored === null) return span > 0 ? span : null;
  return Math.max(stored, span);
}

export default function DigitSpanGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const gate = useLevelGate('digit_span');
  const lvl = usePersistentLevel('digit_span');
  /**
   * ── ПРОБНЫЙ ЗАХОД (расходуемая способность, `src/services/abilities.ts`) ────
   *
   * ПОЧЕМУ ИМЕННО В ЗАМЕРНЫХ ИГРАХ. Здесь лимит ошибок И ЕСТЬ измерение: спан — это
   * докуда человек дошёл до двух ошибок на одной длине. Лишняя попытка врала бы прямо
   * в биомаркер, поэтому «второй жизни» тут нет и не будет. Продаётся ОБРАТНОЕ:
   * право сыграть так, чтобы партия не записалась НИКУДА — ни очков, ни уровня, ни
   * статистики, ни лидерборда. Это не поблажка, а отказ от награды: заработать на
   * пробном заходе нельзя ни при каком результате.
   *
   * ⚠️ РЕШЕНИЕ ПРИНИМАЕТСЯ ДО ПЕРВОГО СТИМУЛА (`practiceRef` снимается в startGame).
   * Иначе можно было бы посмотреть на результат и задним числом решить, засчитывать
   * его или нет, — то есть выбирать себе статистику.
   *
   * ⚠️ ШТУКА СПИСЫВАЕТСЯ НА ФИНИШЕ, А НЕ НА СТАРТЕ. Партия, брошенная на середине,
   * платной быть не должна; выбрать удачный исход это всё равно не даёт — решение
   * уже принято, и списание идёт по флагу, снятому до начала.
   */
  const { profile } = useProfile();
  const [practiceLeft, setPracticeLeft] = useState(0);     // остаток в кошельке — виден ДО траты
  const [practiceArmed, setPracticeArmed] = useState(false); // переключатель на экране настроек
  const [practiceUsed, setPracticeUsed] = useState(false);   // партия прошла как пробная
  const practiceRef = useRef(false);                         // решение, снятое на старте партии
  const reloadPractice = useCallback(async () => {
    const pid = profile?.id;
    setPracticeLeft(pid ? await getAbilityCount(pid, 'practice_run') : 0);
  }, [profile?.id]);
  useEffect(() => { reloadPractice(); }, [reloadPractice]);

  /** Списать пробный заход, если он был заявлен до партии. true — партию НЕ записываем. */
  const settlePracticeRun = async (): Promise<boolean> => {
    if (!practiceRef.current) return false;
    practiceRef.current = false;
    const pid = profile?.id;
    const ok = !!pid && await useAbility(pid, 'practice_run');
    setPracticeArmed(false);
    setPracticeUsed(ok);
    await reloadPractice();
    return ok;
  };
   // персист-уровень (как у судоку): старт от достигнутого, растёт
  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const ds = getDigitSpanStrings(language);   // подписи партии — свой словарь модуля на 12 языков
  const [direction, setDirection] = useState<Direction>(() => (str('mode', 'forward') as Direction));
  const [delivery, setDelivery] = useState<Delivery>(() => (str('delivery', 'screen') as Delivery));
  /**
   * ⚠️ Ступень темпа приезжает из URL шага зарядки, поэтому она ПРОВЕРЯЕТСЯ:
   * незнакомое слово в параметре означало бы `showMs: undefined` и показ,
   * заведённый на NaN, — то есть партию, в которой цифры не появляются вовсе.
   */
  const [pace, setPace] = useState<Pace>(() => {
    const v = str('pace', 'normal') as Pace;
    return PACE_STEPS.includes(v) ? v : 'normal';
  });
  /**
   * Почему говорить сейчас нельзя — и нельзя ли вообще. Две причины лечатся
   * по-разному (поставить голос против включить звук), поэтому и хранится
   * причина, а не «да/нет».
   */
  const ttsBlock = useTtsBlock(language);
  const voiceOk = ttsBlock === null;
  /** Личный рекорд — тем же источником, что и таблица лидеров (LeaderboardModal). */
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const reloadBest = useCallback(() => {
    getPersonalBest('digit_span').then(setPersonalBest).catch(() => {});
  }, []);
  useEffect(() => { reloadBest(); }, [reloadBest]);
  // Справка правил уровня (в зарядке-пресете не показываем — там свой поток).
  // enabled на input: во время показа цифр модалка закрыла бы их.
  const levelRules = useLevelRules('digit_span', lvl.level, DS_RULES, phase === 'input' && !isPreset);
  const [seqLen, setSeqLen] = useState(() => num('startLen', 4));
  const [sequence, setSequence] = useState<number[]>([]);
  const [showIdx, setShowIdx] = useState(-1);
  const [userInput, setUserInput] = useState('');
  const [lastFeedback, setLastFeedback] = useState<'right' | 'wrong' | null>(null);
  const submittingRef = useRef(false);
  const [correctRounds, setCorrectRounds] = useState(0);
  const [maxSpan, setMaxSpan] = useState(0);
  const [round, setRound] = useState(0);
  const [errors, setErrors] = useState(0);
  /**
   * Ошибки на ТЕКУЩЕЙ длине. Ref, а не состояние: решение об остановке принимается
   * внутри того же обработчика, что и запись, — состояние туда не успело бы доехать.
   */
  const errorsAtLenRef = useRef(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);
  const showMsRef = useRef(700);
  const gapMsRef = useRef(1100);
  const dirRef = useRef<Direction>('forward');
  const deliveryRef = useRef<Delivery>('screen');
  /** Номер живой озвучки: уход с экрана и новый раунд обрывают предыдущую. */
  const runIdRef = useRef(0);
  /**
   * ЧТО ЗА ПАРТИЯ ИДЁТ — СОСТОЯНИЕМ, А НЕ РЕФОМ. Рефы решают ход партии (их читают
   * таймеры и обработчики), но ОТРИСОВКЕ нужны те же ответы, а читать `ref.current`
   * во время рендера нельзя: кадр не перерисуется, когда значение поменяется.
   * Оба снимаются на старте партии — там же, где принимаются сами решения.
   */
  const [voiceRound, setVoiceRound] = useState(false);
  const [roundCounts, setRoundCounts] = useState(false);

  useEffect(() => {
    return () => {
      runIdRef.current = -1;   // недоговорённая последовательность не должна доиграть в пустоту
      ttsCancel();
      if (showTimerRef.current) clearInterval(showTimerRef.current);
    };
  }, []);

  const generateSeq = (len: number) => {
    const seq: number[] = [];
    for (let i = 0; i < len; i++) seq.push(Math.floor(Math.random() * 10));
    return seq;
  };

  const startGame = () => {
    // Решение «этот заход не в зачёт» фиксируется ЗДЕСЬ, до первого стимула.
    // В шаге зарядки пробный заход бессмыслен: он и так не двигает уровень.
    practiceRef.current = !isPreset && practiceArmed && practiceLeft > 0;
    setPracticeUsed(false);
    // личная игра → уровень рулит (длина → скорость → reverse); пресет → выбранные стартовая длина/направление/темп
    const effLevel = isPreset ? 1 : lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    const timing = showTiming({ isPreset, level: effLevel, pace });
    showMsRef.current = timing.showMs;
    gapMsRef.current = timing.gapMs;
    dirRef.current = isPreset ? direction : (p.reverse ? 'backward' : 'forward');
    if (!isPreset) setDirection(dirRef.current);
    // Голос — только если говорить есть чем. Иначе партия идёт экраном, а причина
    // молчания уже написана на экране настроек (ds.voiceNoVoice / ds.voiceSoundOff).
    deliveryRef.current = effectiveDelivery(delivery, ttsBlock);
    setVoiceRound(deliveryRef.current === 'voice');
    /**
     * Идёт ли ЭТА партия в рекорд — решается здесь, теми же правилами, какими она
     * будет записываться на финише (`countsForRecord` + подача экраном + не пробный
     * заход). Иначе шапка пообещает рекорд партии, которая не пойдёт никуда.
     */
    setRoundCounts(countsForRecord('digit_span', { isPreset, level: effLevel })
      && deliveryRef.current === 'screen' && !practiceRef.current);
    const startLen = isPreset ? seqLen : p.startLen;
    setCorrectRounds(0); setMaxSpan(0); setRound(1); setErrors(0);
    errorsAtLenRef.current = 0;   // новая партия — счёт ошибок на длине с нуля
    setStartTime(gameNow());
    setSeqLen(startLen);
    showSequence(startLen);
  };

  const showSequence = (len: number) => {
    const seq = generateSeq(len);
    setSequence(seq);
    setShowIdx(-1);
    setUserInput('');
    setLastFeedback(null);
    submittingRef.current = false;
    setPhase('showing');
    const myRun = ++runIdRef.current;
    if (deliveryRef.current === 'voice') {
      /**
       * ГОЛОСОМ. Цифры произносятся по одной голосом системы; на экране в это
       * время смотреть не на что — и там об этом прямо написано (`ds.listening`),
       * а не пустое поле. Пауза между цифрами — тот же gapMs, что и у показа.
       */
      (async () => {
        for (let i = 0; i < seq.length; i++) {
          if (runIdRef.current !== myRun) return;   // ушли с экрана или начался новый раунд
          setShowIdx(-2);
          await speakSequence([String(seq[i])], language, gapMsRef.current);
        }
        if (runIdRef.current !== myRun) return;
        setPhase('input');
      })();
      return;
    }
    let i = 0;
    showTimerRef.current = setInterval(() => {
      if (i >= seq.length) {
        if (showTimerRef.current) clearInterval(showTimerRef.current);
        setShowIdx(-2); // hidden between digits
        setTimeout(() => setPhase('input'), 300);
        return;
      }
      setShowIdx(i);
      setTimeout(() => setShowIdx(-2), showMsRef.current);
      i++;
    }, gapMsRef.current);
    // Show first digit immediately
    setShowIdx(0);
    setTimeout(() => setShowIdx(-2), showMsRef.current);
    i = 1;
  };

  // Auto-submit когда юзер ввёл столько же цифр сколько в последовательности
  useEffect(() => {
    if (phase !== 'input') return;
    if (userInput.length === seqLen && !submittingRef.current) {
      submittingRef.current = true;
      // Небольшая задержка чтобы юзер увидел свою последнюю цифру
      setTimeout(() => handleSubmit(), 250);
    }
  }, [userInput, phase, seqLen]);

  const handleSubmit = async () => {
    const expected = expectedDigits(sequence, dirRef.current);
    const expectedStr = expected.join('');
    const correct = userInput === expectedStr;
    setLastFeedback(correct ? 'right' : 'wrong');
    let nextLen = seqLen;
    let cont = true;
    let updatedMax = maxSpan;
    let updatedCorrect = correctRounds;
    let updatedErrors = errors;
    // Ошибки НА ТЕКУЩЕЙ ДЛИНЕ: обнуляются, как только длина взята.
    let atLenErrors = errorsAtLenRef.current;

    if (correct) {
      updatedCorrect += 1;
      updatedMax = Math.max(updatedMax, seqLen);
      nextLen = seqLen + 1;
      atLenErrors = 0;
    } else {
      updatedErrors += 1;
      /**
       * 🔴 ПРАВИЛО НЕ СООТВЕТСТВОВАЛО СОБСТВЕННОМУ КОММЕНТАРИЮ. Написано «две ошибки
       * НА ОДНОЙ ДЛИНЕ», а стояло `errors >= 1` — то есть две ошибки ЗА ВСЮ ПАРТИЮ:
       * общий счётчик не сбрасывался на успехе. Ошибся на длине 4, взял её со второго
       * раза, ошибся на 5 — партия окончена, хотя на пятёрке это была ПЕРВАЯ попытка.
       *
       * Спан — это докуда человек дошёл до двух ошибок на одной длине; так устроен
       * «Спан по клеткам» рядом (`errorsAtLen`, сброс на успехе) и так устроена сама
       * методика. Модель игрока показывает недомер около 0,1 спана — немного, но это
       * ЗАМЕРЯЕМАЯ величина, и врать в ней нельзя даже на десятую.
       */
      atLenErrors += 1;
      if (atLenErrors >= 2 || round >= 12) cont = false;
    }
    errorsAtLenRef.current = atLenErrors;
    setCorrectRounds(updatedCorrect);
    setMaxSpan(updatedMax);
    setErrors(updatedErrors);

    if (!cont || nextLen > 12) {
      const finalTime = (gameNow() - startTime) / 1000;
      setElapsedTime(finalTime);
      // ⚠️ ПРОБНЫЙ ЗАХОД РАЗБИРАЕТСЯ ПЕРВЫМ. Если партия объявлена непроводимой, лестницу
      // нельзя трогать НИ ВВЕРХ, НИ ВНИЗ, и записи не должно остаться нигде: ни сессии,
      // ни очков (их начисляет saveSession), ни звёзд, ни лидерборда.
      const practice = await settlePracticeRun();
      const passed = !practice && !isPreset && updatedCorrect >= 1;
      if (practice) {
        setPhase('result');   // баннер уровня показывать не о чем — уровень не двигался
      } else {
        if (passed) lvl.reach(lvl.level + 1);   // прошёл стартовую длину уровня → +уровень (лесенка длина→скорость→reverse)
        else if (!isPreset) lvl.fail();   // не прошёл → гистерезис понижения (3 провала подряд → level-1)
        // Непрерывный поток: и прохождение, и провал уровня → баннер LevelCleared (passed=false → «почти, ещё раз» + авто-рестарт того же уровня).
        // Пресет/свободный режим — как было: экран статистики GameResult.
        if (isPreset) {
          setPhase('result');
        } else {
          setClearedPassed(passed);
          setPhase('cleared');
        }
        try {
          await saveSession({
            passed,
            game_type: 'digit_span',
            score: updatedMax * 10,
            time_seconds: finalTime,
            /**
             * 🔴 ПАРТИЯ БАТАРЕИ ОБЯЗАНА ЗАПИСАТЬСЯ ПОД МЕТКАМИ ШАГА. Шаг оценки
             * предписывает difficulty 'medium' + mode 'forward' (assessment.ts, там же
             * sessionFitsStep сверяет оба поля дословно), а игра писала difficulty=
             * НАПРАВЛЕНИЕ ('forward') и mode='start4' — ни одно поле не совпадало, и
             * домен wm_verbal ВСЕГДА получал молчаливый z=0 вместо замера. Свободная
             * партия пишет как раньше; направление и стартовая длина не теряются —
             * они в details (direction, finalLength) с первого дня.
             */
            difficulty: isPreset ? str('diff', 'medium') : direction,
            mode: isPreset ? dirRef.current : `start${seqLen}`,
            errors: updatedErrors,
            details: {
              level: levelRef.current, maxSpan: updatedMax, correctRounds: updatedCorrect, finalLength: seqLen,
              direction: dirRef.current, delivery: deliveryRef.current,
            },
          });
        } catch (e) { console.error(e); }
        // Рекорд — только партия первого уровня: длина старта и темп показа выводятся из
        // уровня, поэтому спан с разных ступеней несравним (см. LEADERBOARD_GAMES.digit_span).
        // ⚠️ И только ЭКРАНОМ: услышанный ряд — другая задача (слуховой охват против
        // зрительного), складывать их в одну таблицу значит сравнивать разное.
        // Незачётная партия отваливается молча — человек играл, а не сдавал норматив.
        if (countsForRecord('digit_span', { isPreset, level: levelRef.current }) && deliveryRef.current === 'screen') {
          submitScore('digit_span', updatedMax).then(reloadBest).catch(() => {});   // тихо — лидерборд необязателен
        }
      }
    } else {
      setSeqLen(correct ? nextLen : seqLen);
      setRound((r) => r + 1);
      setTimeout(() => showSequence(correct ? nextLen : seqLen), 600);
    }
  };

  /** Что показать рекордом в шапке: незачётная партия его не двигает даже на экране. */
  const shownRecord = hudRecord(personalBest, maxSpan, roundCounts);

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="call" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('digitSpan')}</Text>
        <Text style={styles.configDesc}>{t('digitSpanDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="digitSpanIntroDesc" benefits={DIGIT_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="digit_span" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      {/* ПРОБНЫЙ ЗАХОД — расходуемая способность (`src/services/abilities.ts`).
          ⚠️ Остаток показывается ВСЕГДА, включая ноль: до траты человек обязан видеть,
          что у него есть и что произойдёт. Переключатель гаснет на нулевом кошельке. */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('abName_practice_run')}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary, marginBottom: 8 }]}>
          {`${t('abilityPracticeNote')} · ${t('abilityInWallet').replace('{n}', String(practiceLeft))}`}
        </Text>
        <TouchableOpacity
          accessibilityRole="button" accessibilityState={{ selected: practiceArmed }}
          disabled={practiceLeft <= 0}
          onPress={() => setPracticeArmed((v) => !v)}
          style={[styles.modeButton, {
            backgroundColor: practiceArmed ? GRADIENT[0] : colors.background,
            borderColor: colors.border, borderWidth: 1, opacity: practiceLeft > 0 ? 1 : 0.5,
          }]}>
          <Text style={[styles.modeButtonText, { color: practiceArmed ? '#FFFFFF' : colors.text }]}>
            {practiceArmed ? t('abilityPracticeOn') : t('abName_practice_run')}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        accessibilityRole="button" style={[styles.optionCard, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} onPress={() => setShowLeaderboard(true)}>
        <Ionicons name="trophy-outline" size={18} color={colors.text} />
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('leaderboardLevel1')}</Text>
      </TouchableOpacity>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('directionLabel')}</Text>
        <View style={styles.optionButtons}>
          {DIRECTIONS.map((d) => {
            const locked = gate.isLocked(d);
            return (
            <TouchableOpacity
              accessibilityRole="button" accessibilityState={{ selected: direction === d }}
              testID={`ds-mode-${d}`}
              key={d}
              disabled={locked}
              style={[
                styles.modeButton,
                direction === d && !locked
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 },
              ]}
              onPress={() => !locked && setDirection(d)}
            >
              <Text style={[styles.modeButtonText, { color: direction === d && !locked ? textOn(GRADIENT[0]) : colors.text }]}>
                {d === 'forward' ? t('directionForward') : d === 'backward' ? t('directionBackward') : ds.directionAscending}{locked ? ' 🔒' : ''}
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('startLengthLabel')}</Text>
        <View style={styles.optionButtons}>
          {[3, 4, 5].map((n) => (
            <TouchableOpacity
              accessibilityRole="button"
              key={n}
              style={[
                styles.modeButton,
                seqLen === n
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setSeqLen(n)}
            >
              <Text style={[styles.modeButtonText, { color: seqLen === n ? textOn(GRADIENT[0]) : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {/* ПОДАЧА СТИМУЛА: цифру видно или её слышно. Услышанный ряд — классическая
          форма пробы (её и держат в руках при живом тестировании), а заодно это
          единственный способ сыграть, не глядя в экран. */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{ds.deliveryLabel}</Text>
        <View style={styles.optionButtons}>
          {DELIVERIES.map((d) => {
            const off = d === 'voice' && !voiceOk;
            return (
              <TouchableOpacity
                accessibilityRole="button" accessibilityState={{ selected: delivery === d, disabled: off }}
                testID={`ds-delivery-${d}`}
                key={d}
                disabled={off}
                style={[
                  styles.modeButton,
                  delivery === d && !off
                    ? { backgroundColor: GRADIENT[0] }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: off ? 0.5 : 1 },
                ]}
                onPress={() => !off && setDelivery(d)}
              >
                <Text style={[styles.modeButtonText, { color: delivery === d && !off ? textOn(GRADIENT[0]) : colors.text }]}>
                  {d === 'screen' ? ds.deliveryScreen : ds.deliveryVoice}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {/* ⚠️ ЗАГЛУШКА ЧЕСТНАЯ, А НЕ БЕЗЗВУЧНОЕ МОЛЧАНИЕ (требование шапки services/tts).
            Причины две и лечатся они по-разному: голоса нет в системе против звук
            выключен человеком. Одно сообщение на оба случая отправило бы половину
            людей чинить не то. */}
        {!voiceOk && (
          <View style={styles.voiceWarn}>
            <Ionicons name="volume-mute" size={18} color="#b45309" />
            <Text testID="ds-voice-warning" style={styles.voiceWarnText}>
              {ttsBlock === 'sound-off' ? ds.voiceSoundOff : ds.voiceNoVoice}
            </Text>
          </View>
        )}
      </View>
      {/* ТЕМП ПОКАЗА — ТОЛЬКО В СВОБОДНОЙ ПАРТИИ.
          В игре по уровням темп выводится из уровня и рычага человеку не даётся:
          рекорд берётся с первого уровня, и спан, набранный на медленном показе,
          в одной таблице со спаном на быстром — это сравнение разного. Здесь же
          партия в рекорд не идёт вовсе, поэтому крутить темп можно свободно. */}
      {isPreset && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{ds.paceLabel}</Text>
          <View style={styles.optionButtons}>
            {PACE_STEPS.map((p) => (
              <TouchableOpacity
                accessibilityRole="button" accessibilityState={{ selected: pace === p }}
                testID={`ds-pace-${p}`}
                key={p}
                style={[
                  styles.modeButton,
                  pace === p
                    ? { backgroundColor: GRADIENT[0] }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setPace(p)}
              >
                <Text style={[styles.modeButtonText, { color: pace === p ? textOn(GRADIENT[0]) : colors.text }]}>
                  {p === 'slow' ? ds.paceSlow : p === 'normal' ? ds.paceNormal : ds.paceFast}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontStyle: 'italic' }}>
            {ds.paceLevelNote}
          </Text>
        </View>
      )}
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" testID="ds-start" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      </View>
    </View>
  );

  // игровые фазы (показ и ввод) — на едином каркасе GameShell; модалка правил поверх каркаса
  if (phase === 'showing' || phase === 'input') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('digitSpan')}
          onBack={() => goBackOrHome()}
          stats={
            <View style={styles.statsRow}>
              {phase === 'showing' ? (
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{t('memorize')} ({seqLen})</Text>
              ) : (
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {t('lengthLabel')}: {seqLen} · {t('round')} {round}{!isPreset ? ` · ${t('label_level_short')}${lvl.level}` : ''}
                </Text>
              )}
              {/* ОХВАТ И РЕКОРД ВИДНО ПО ХОДУ ПАРТИИ, А НЕ НА ЭКРАНЕ ИТОГА.
                  Спан — это и есть результат «Цифрового ряда», и человек, идущий
                  по длинам, обязан видеть, где он сейчас и докуда доходил раньше:
                  иначе «дальше или хватит» решается вслепую. Рекорд — тот же
                  источник, что у таблицы лидеров (getPersonalBest). */}
              <Text testID="ds-span-record" style={[styles.statText, { color: colors.text }]}>
                {t('hud_span')} {maxSpan} · {t('personalBest')} {shownRecord === null ? '—' : shownRecord}
              </Text>
              {!isPreset && phase === 'input' && <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />}
            </View>
          }
        >
          {phase === 'showing' ? (
            voiceRound ? (
              <View style={styles.digitArea}>
                <Ionicons name="volume-high" size={64} color={GRADIENT[0]} />
                <Text testID="ds-listening" style={[styles.statText, { color: colors.text }]}>{ds.listening}</Text>
              </View>
            ) : (
              <View style={styles.digitArea}>
                <Text testID="ds-digit" style={[styles.bigDigit, { color: colors.text }]}>
                  {showIdx >= 0 && showIdx < sequence.length ? sequence[showIdx] : ' '}
                </Text>
              </View>
            )
          ) : (
            <View style={styles.fieldCol}>
              <Text style={[styles.statText, { color: colors.text }]}>
                {direction === 'ascending' ? ds.typeAscending : direction === 'backward' ? t('typeReversed') : t('typeAsShown')}
              </Text>
              <TextInput
                testID="ds-input"
                value={userInput}
                onChangeText={(s) => setUserInput(s.replace(/[^0-9]/g, '').slice(0, seqLen))}
                keyboardType="numeric"
                autoFocus
                maxLength={seqLen}
                editable={lastFeedback === null}
                style={[styles.inputField, {
                  color: colors.text,
                  borderColor: lastFeedback === 'right' ? '#22c55e' : lastFeedback === 'wrong' ? '#f43f5e' : colors.border,
                  borderWidth: lastFeedback ? 3 : 1,
                  backgroundColor: colors.surface,
                }]}
                placeholder={'•'.repeat(seqLen)}
                placeholderTextColor={colors.textSecondary}
              />
              {/* Status badge (replaces manual Check button — auto-submit happens on last digit) */}
              {lastFeedback === null ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' }}>
                  {userInput.length}/{seqLen} — {t('hint_autocheck')}
                </Text>
              ) : lastFeedback === 'right' ? (
                // крупный шрифт: подпись «верно, уровень выше» выдавливала иконку за край → ряд переносится
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
                  <Text style={{ color: '#22c55e', fontSize: 18, fontWeight: '800', flexShrink: 1, minWidth: 0, textAlign: 'center' }}>{t('msg_correct_level_up')}</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Ionicons name="close-circle" size={28} color="#f43f5e" />
                  <Text style={{ color: '#f43f5e', fontSize: 16, fontWeight: '700', flexShrink: 1, minWidth: 0, textAlign: 'center' }}>
                    {t('label_was')}: {expectedDigits(sequence, direction).join('')}
                  </Text>
                </View>
              )}
            </View>
          )}
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
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('digitSpan')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LeaderboardModal
        visible={showLeaderboard} onClose={() => setShowLeaderboard(false)}
        gameId="digit_span" language={language} colors={colors} gradient={GRADIENT}
        formatScore={(s) => String(Math.round(s))}
      />
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="digit_span" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {/* Итог пробного захода словами: очки списаны, партия никуда не записана —
          `comparisonLine` это готовый слот GameResult под одну строку под счётом. */}
      {phase === 'result' && (
        <GameResult score={maxSpan * 10} time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          comparisonLine={practiceUsed ? t('abilityPracticeSpent') : undefined}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  // крупный системный шрифт: заголовок распирал header и выдавливал спейсер за край → ужимается сам
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, textAlign: 'center' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  // Прибитый низ настроек: кнопка «начать» всегда на экране, над системной навигацией.
  // Раньше она была последней в прокрутке — на невысоком экране до неё приходилось
  // доскроллить, а решение «во что играю» оказывалось в двух разных местах.
  // Отступ слева — под плавающую кнопку отзыва, она висит поверх и накрывала бы её.
  configSticky: { paddingTop: 10, paddingHorizontal: 16, paddingLeft: 68, borderTopWidth: StyleSheet.hairlineWidth },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  // Заглушка «почему сейчас без голоса» — жёлтая плашка, как в «Слуховом охвате»:
  // одна беда, один вид, одно место, куда человек привык смотреть.
  voiceWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    borderRadius: 8, backgroundColor: '#fef3c7',
  },
  voiceWarnText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#b45309' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 18, alignSelf: 'stretch' },
  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  statText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  // фикс 200×200 обрезал цифру при крупном системном шрифте (140px × масштаб) → min + рост по контенту
  digitArea: { minWidth: 200, minHeight: 200, justifyContent: 'center', alignItems: 'center' },
  bigDigit: { fontSize: 140, fontWeight: '900' },
  inputField: {
    fontSize: 32, fontWeight: '700', textAlign: 'center', letterSpacing: 8,
    paddingVertical: 18, paddingHorizontal: 24, borderRadius: 12, borderWidth: 2,
    // до 12 цифр при крупном шрифте распирали поле за край экрана → потолок по ширине контейнера
    minWidth: 200, maxWidth: '100%',
  },
});
