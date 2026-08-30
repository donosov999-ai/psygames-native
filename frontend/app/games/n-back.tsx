/* psygames-game-n-back · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { speak } from '@/src/services/tts';
import { useTtsBlock } from '@/src/hooks/useTtsAvailable';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions
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
import BossRound from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { FlashCell, hapticSuccess, hapticError } from '@/src/components/juice';
import { type PetMood } from '@/src/components/pet/GamePet';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import LeaderboardModal from '@/src/components/LeaderboardModal';
import { countsForRecord, fetchBest, getPersonalBest, submitScore } from '@/src/services/leaderboard';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getSessionHistory, recordSessionScore } from '@/src/services/sessionHistory';
import { gameNow } from '@/src/services/gamePause';
import {
  accuracyPercent,
  getNBackStrings,
  signalDetection,
  type NBackCounts,
} from '@/src/games/n-back/core';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const NB_RULES: LevelRule[] = [
  { key: 'dual', fromLevel: 9 },   // lr_n_back_dual_*
];

const GRADIENT = ['#5b86e5', '#36d1dc'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.86 (норма AA 4.5), стало 4.81.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const N_BACK_BENEFITS = [
  { icon: 'analytics-outline', textKey: 'benefitNback1' },
  { icon: 'school-outline', textKey: 'benefitNback2' },
  { icon: 'rocket-outline', textKey: 'benefitNback3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
const BOSS_EVERY = 3;   // веха-босс каждые 3 уровня (резкая смена: рабочая память → счёт)
type Modality = 'single' | 'dual';   // single = visual only (legacy); dual = visual + audio (Brain Workshop style)

import { buildNbackSequence } from '@/src/games/nback/sequence';

const AUDIO_LETTERS = ['B', 'D', 'F', 'H', 'K', 'L', 'M', 'Q', 'R', 'T'];   // consonants only — no confusion with positions

/**
 * РАЗБОР ОТВЕТОВ ПАРТИИ — ТО, ЧТО ВИДИТ ЧЕЛОВЕК.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО. d′ считался верно и уходил в сессию полем `d_prime`, но
 * на экране его не было ни разу: человеку показывали одну долю верных ответов.
 * А голая точность в n-back смешивает два разных умения — заметить повтор и не
 * нажать на новом. 90% может означать и отличную партию, и осторожное «почти
 * всегда молчу»: правильные отказы набегают сами. Число, по которому нельзя
 * отличить одно от другого, не говорит человеку ничего о его игре.
 *
 * ⚠️ ДВА ПОТОКА ХРАНЯТСЯ ПОРОЗНЬ. В двойном режиме повтор клетки и повтор буквы
 * выпадают независимо; общий d′ по смешанным пробам физически бессмыслен.
 * `audio` = null — слухового потока в этой партии не было (одиночный режим).
 */
type ChannelReadout = { accuracy: number; dPrime: number };
type RoundReadout = { dual: boolean; visual: ChannelReadout; audio: ChannelReadout | null };

/**
 * ⚠️ ВТОРОГО ИСТОЧНИКА ПРАВДЫ ПРО РЕЧЬ БОЛЬШЕ НЕТ. Здесь жила своя озвучка мимо
 * `services/tts.ts`: она не спрашивала ни про голос языка, ни про общий тумблер
 * звука. Человек выключал звук — второй поток двойного n-back продолжал
 * говорить, а починка в общем сервисе сюда не доезжала по устройству.
 */
const speakLetter = (letter: string) => { void speak(letter, 'en', 1.2); };

// Уровень (1..15+): L1-5 single N=1→5 · L6-8 single N=5 быстрее (ISI↓) · L9-15 DUAL (визуал+звук, классика Jaeggi) N растёт.
function levelParams(level: number): { N: number; modality: Modality; showMs: number; gapMs: number } {
  if (level <= 5) return { N: level, modality: 'single', showMs: 700, gapMs: 1100 };
  if (level <= 8) { const f = level - 5; return { N: 5, modality: 'single', showMs: Math.max(450, 700 - f * 80), gapMs: Math.max(700, 1100 - f * 130) }; }
  const dl = level - 8; return { N: Math.min(6, 1 + dl), modality: 'dual', showMs: 700, gapMs: 1100 };   // L9=2-back dual → растёт до 6
}

/**
 * 🔴 ШАГ БАТАРЕИ ГОВОРИТ mode: '2-back' — А ИГРА ЕГО НЕ ЧИТАЛА.
 * Пресет брал N из num('nLevel', 1), но nLevel через URL передают только шаги
 * с settings (profiles.ts); ASSESSMENT_PLAYLIST и FIXED_BATTERY (warmup.ts:189)
 * объявляют '2-back' полем mode — и оценка МОЛЧА игралась как 1-back, а её
 * d′ сравнивался с нормой двухбэка (1.5±0.8, assessment.ts). Замер: '2-back'
 * в шаге → nLevel=1 в партии. Разбираем mode-строку; приоритет: mode-параметр →
 * settings.nLevel → 1. Сторожит assessment-metrics.test.ts.
 */
export function nFromModeParam(modeParam: string): number | null {
  const m = /^(\d+)-back$/.exec(modeParam);
  return m ? Math.max(1, parseInt(m[1], 10)) : null;
}

// Джиттер паузы между стимулами (±15%, потолок 200мс) — иначе интервал предсказуем
// и можно жать «в ритм» не распознавая стимул (паттерн Audio-N-back/4skinSkywalker).
function jitteredGap(baseMs: number): number {
  const jitter = Math.min(200, baseMs * 0.15);
  return Math.max(300, baseMs + (Math.random() * 2 - 1) * jitter);
}

export default function NBackGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  // v1.29.3 (мобайл): сетка 3×3 была фикс 240×240 — мелкая по центру. Теперь тянется
  // на ~80% ширины (потолок 132px/ячейка для планшетов), но не выше доступной высоты.
  const { width, height } = useWindowDimensions();
  /**
   * 🔴 Тот же дефект, что был в «Матрице памяти» и в сортировке: зашитый запас
   * `height - 360` и потолок 420 давали поле в четверть окна на десктопе.
   * Запас уменьшен до реального (шапка + счётчики + подпись + кнопка ≈ 300),
   * потолок поднят: на телефоне его не достать по ширине, а большому окну он
   * единственное, что мешал.
   */
  const nbGridSide = Math.min(width - 48, height - 300, 560);
  const nbCell = (nbGridSide - 2 * 6) / 3; // 3 ячейки, 2 зазора по 6
  const router = useRouter();

  const gate = useLevelGate('n_back');
  const lvl = usePersistentLevel('n_back');   // персист-уровень = N (1-back=L1, 2-back=L2…)
  const { profile } = useProfile();
  const [accuracyHistory, setAccuracyHistory] = useState<number[]>([]);
  const [readout, setReadout] = useState<RoundReadout | null>(null);   // точность и d′ последней партии — для показа человеку
  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [bossWon, setBossWon] = useState<boolean | null>(null);   // итог босса-вехи (null = босса не было)
  const [clearedPassed, setClearedPassed] = useState(true);   // прошёл ли уровень (false → баннер «почти, ещё раз»)
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [resultBenchmark, setResultBenchmark] = useState<{ own: number; best: number; source: 'players' | 'personal' } | null>(null);
  // Справка правил уровня (в зарядке-пресете не показываем — там свой поток)
  const levelRules = useLevelRules('n_back', lvl.level, NB_RULES, phase === 'playing' && !isPreset);
  const [nLevel, setNLevel] = useState(() => nFromModeParam(str('mode', '')) ?? num('nLevel', 1));
  const [trials, setTrials] = useState(() => num('trials', 20));
  /** Заготовленные блоки: зрительный и слуховой. Строятся в `startGame`. */
  const seqRef = useRef<ReturnType<typeof buildNbackSequence> | null>(null);
  const audioSeqRef = useRef<ReturnType<typeof buildNbackSequence> | null>(null);
  const [modality, setModality] = useState<Modality>(() => (str('modality', 'single') as Modality));
  /** Речь — второй поток двойного режима. Нельзя говорить — нельзя и двойной. */
  const ttsBlock = useTtsBlock('en');
  const [history, setHistory] = useState<number[]>([]);
  const [audioHistory, setAudioHistory] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [activeLetter, setActiveLetter] = useState<string>('');
  const [showWindow, setShowWindow] = useState(false);
  const [waitingResponse, setWaitingResponse] = useState(false);
  // Visual stream stats
  const [hits, setHits] = useState(0);
  /** Настроение питомца в шапке — ответ на нажатие «совпадение» (§30.6). */
  const [petMood, setPetMood] = useState<PetMood>('idle');
  const petSay = (m: PetMood) => { setPetMood(m); setTimeout(() => setPetMood('idle'), 40); };
  const [misses, setMisses] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);
  const [correctRejections, setCorrectRejections] = useState(0);
  // Audio stream stats (only used in dual mode)
  const [aHits, setAHits] = useState(0);
  const [aMisses, setAMisses] = useState(0);
  const [aFalseAlarms, setAFalseAlarms] = useState(0);
  const [aCorrectRejections, setACorrectRejections] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const trialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answeredRef = useRef(false);
  const aAnsweredRef = useRef(false);
  // Зеркало счётчиков в реф: finishGame вызывается из таймера runTrial и читал бы их из
  // устаревшего замыкания → сохранённые d'/accuracy/score недосчитывали последние пробы.
  const statsRef = useRef({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0, aHits: 0, aMisses: 0, aFalseAlarms: 0, aCorrectRejections: 0 });
  const levelRef = useRef(1);
  const showMsRef = useRef(700);
  const gapMsRef = useRef(1100);

  useEffect(() => {
    return () => {
      if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
    };
  }, []);

  const startGame = () => {
    if (!isPreset) {
      // уровень рулит: N → скорость показа → dual-режим (визуал+звук). Таймер 600мс ниже даёт стейту примениться.
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      showMsRef.current = p.showMs;
      gapMsRef.current = p.gapMs;
      setNLevel(p.N);
      /**
       * 🔴 БЕЗ РЕЧИ ДВОЙНОЙ РЕЖИМ — ЭТО ОБМАН СЧЁТА. Итог берётся по ХУДШЕМУ из
       * двух потоков (`Math.min` ниже), а немой слуховой поток даёт нули: человек
       * с выключенным звуком проваливал бы уровень, ничего не сделав неверно.
       * Пока говорить нельзя — играем одним потоком и честно об этом пишем.
       */
      setModality(ttsBlock === null ? p.modality : 'single');
    }
    setHits(0); setMisses(0); setFalseAlarms(0); setCorrectRejections(0);
    setBossWon(null);
    setResultBenchmark(null);
    setReadout(null);   // числа прошлой партии не должны висеть поверх новой
    setAHits(0); setAMisses(0); setAFalseAlarms(0); setACorrectRejections(0);
    statsRef.current = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0, aHits: 0, aMisses: 0, aFalseAlarms: 0, aCorrectRejections: 0 };
    setHistory([]); setAudioHistory([]); setCurrentIdx(-1); setActiveCell(null); setActiveLetter('');
    setPhase('playing');
    setStartTime(gameNow());
    /**
     * 🔴 ПОСЛЕДОВАТЕЛЬНОСТЬ ГОТОВИТСЯ ЦЕЛИКОМ ДО ПЕРВОГО СТИМУЛА.
     * Раньше стимулы собирались по одному прямо при подаче, и отказ от
     * случайного совпадения делался ВТОРЫМ броском монеты — оно выживало с
     * вероятностью около 1/17. Заявленные 30% целей превращались в ~34%, и доля
     * плавала от блока к блоку, из-за чего d′ двух блоков были несравнимы.
     * Разбор и квота — в `src/games/nback/sequence.ts`.
     *
     * ⚠️ N берём из `p.N`, а не из состояния `nLevel`: `setNLevel` асинхронный, и
     * на этом же месте уже спотыкались с таймером на 600 мс. Здесь нужна
     * величина ЭТОЙ партии, а не та, что успела примениться.
     */
    const nForBlock = isPreset ? nLevel : levelParams(lvl.level).N;
    seqRef.current = buildNbackSequence(trials, nForBlock, 9, Math.random);
    audioSeqRef.current = buildNbackSequence(trials, nForBlock, AUDIO_LETTERS.length, Math.random);
    setTimeout(() => runTrial([], [], -1), 600);
  };

  const runTrial = (vHist: number[], aHist: string[], idx: number) => {
    const newIdx = idx + 1;
    if (newIdx >= trials) {
      finishGame(vHist, aHist);
      return;
    }
    const canMatch = newIdx >= nLevel;
    /**
     * Стимул БЕРЁТСЯ из заготовленного блока, а не бросается сейчас. Доля целей
     * и число луров заданы точно (`src/games/nback/sequence.ts`).
     * ⚠️ Запасной путь оставлен на случай, если блок почему-то не готов: пустой
     * экран посреди партии хуже, чем один случайный стимул. Но это именно
     * запасной путь, а не прежний способ подачи.
     */
    const vStim = seqRef.current?.items[newIdx] ?? Math.floor(Math.random() * 9);
    let aStim = '';
    if (modality === 'dual') {
      const ai = audioSeqRef.current?.items[newIdx];
      aStim = ai !== undefined ? AUDIO_LETTERS[ai] : AUDIO_LETTERS[Math.floor(Math.random() * AUDIO_LETTERS.length)];
    }
    const newVHist = [...vHist, vStim];
    const newAHist = [...aHist, aStim];
    setHistory(newVHist);
    setAudioHistory(newAHist);
    setCurrentIdx(newIdx);
    setActiveCell(vStim);
    setActiveLetter(aStim);
    setShowWindow(true);
    answeredRef.current = false;
    aAnsweredRef.current = false;
    setWaitingResponse(canMatch);
    setElapsedTime((gameNow() - startTime) / 1000);

    // Speak the audio letter (web only — falls through silently on native)
    if (modality === 'dual' && aStim) speakLetter(aStim);

    // 700ms show, 1800ms response window
    trialTimerRef.current = setTimeout(() => {
      setActiveCell(null);
      setShowWindow(false);
      trialTimerRef.current = setTimeout(() => {
        // Auto-evaluate non-response
        if (canMatch) {
          if (!answeredRef.current) {
            const isMatch = vStim === vHist[newIdx - nLevel];
            if (isMatch) { statsRef.current.misses++; setMisses((m) => m + 1); }
            else { statsRef.current.correctRejections++; setCorrectRejections((c) => c + 1); }
          }
          if (modality === 'dual' && !aAnsweredRef.current) {
            const isMatch = aStim === aHist[newIdx - nLevel];
            if (isMatch) { statsRef.current.aMisses++; setAMisses((m) => m + 1); }
            else { statsRef.current.aCorrectRejections++; setACorrectRejections((c) => c + 1); }
          }
        }
        runTrial(newVHist, newAHist, newIdx);
      }, jitteredGap(gapMsRef.current));
    }, showMsRef.current);
  };

  const handleMatchPress = () => {
    if (!waitingResponse || answeredRef.current) return;
    answeredRef.current = true;
    const stimulus = history[currentIdx];
    const target = history[currentIdx - nLevel];
    if (stimulus === target) { statsRef.current.hits++; setHits((h) => h + 1); hapticSuccess(); petSay('good'); }
    else { statsRef.current.falseAlarms++; setFalseAlarms((f) => f + 1); hapticError(); petSay('bad'); }
  };

  const handleAudioMatchPress = () => {
    if (!waitingResponse || aAnsweredRef.current) return;
    aAnsweredRef.current = true;
    const stimulus = audioHistory[currentIdx];
    const target = audioHistory[currentIdx - nLevel];
    if (stimulus === target) { statsRef.current.aHits++; setAHits((h) => h + 1); hapticSuccess(); petSay('good'); }
    else { statsRef.current.aFalseAlarms++; setAFalseAlarms((f) => f + 1); hapticError(); petSay('bad'); }
  };

  const finishGame = async (vHist: number[], aHist: string[]) => {
    if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
    // Финальные счётчики берём из рефа, не из устаревшего замыкания таймера (иначе d'/accuracy кривые).
    const { hits, misses, falseAlarms, correctRejections, aHits, aMisses, aFalseAlarms, aCorrectRejections } = statsRef.current;
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    const visualCounts: NBackCounts = { hits, misses, falseAlarms, correctRejections };
    const audioCounts: NBackCounts = { hits: aHits, misses: aMisses, falseAlarms: aFalseAlarms, correctRejections: aCorrectRejections };
    const accuracy = accuracyPercent(visualCounts, 0);
    // Dual-режим: раньше проход уровня гейтился ТОЛЬКО визуальным каналом — можно было
    // игнорировать звук и всё равно левелапиться. Jaeggi-скоринг: итог = МИН(визуал, аудио),
    // не средний — иначе один провальный канал маскируется хорошим другим.
    const audioAccuracy = accuracyPercent(audioCounts, 100);   // 100 при пустом канале: итог берётся минимумом, ноль завалил бы уровень ни за что
    const combinedAccuracy = modality === 'dual' ? Math.min(accuracy, audioAccuracy) : accuracy;
    const passed = !isPreset && combinedAccuracy >= 80;
    const ownLeaderboardLevel = passed ? levelRef.current + 1 : Math.max(1, lvl.level);
    setResultBenchmark({ own: ownLeaderboardLevel, best: ownLeaderboardLevel, source: 'personal' });
    let leaderboardSubmit: Promise<unknown> = Promise.resolve();
    if (passed) {
      lvl.reach(levelRef.current + 1);   // ≥ 80% по худшему из каналов → +уровень (N → скорость → dual)
      // В рекорд — только раунд из 20 проб (LEADERBOARD_GAMES.n_back). Найдено при
      // разборе 19.08.2026: число проб выбирается рядом одной кнопкой (15/20/30) и НЕ
      // перебивается уровнем — а на пятнадцати пробах порог 80% держать заметно легче.
      // То есть уровень в таблице можно было накручивать укороченным раундом. Сама лестница
      // уровней растёт по-прежнему — гейт только на отправке рекорда.
      if (countsForRecord('n_back', { isPreset, passed, trials })) {
        leaderboardSubmit = submitScore('n_back', levelRef.current + 1);   // тихо — лидерборд необязателен
      }
    }
    else if (!isPreset) lvl.fail();   // не прошёл уровень → гистерезис понижения (3 провала подряд → level-1)
    /**
     * d′ — ТЕОРИЯ ОБНАРУЖЕНИЯ СИГНАЛА, СЧИТАЕТ ОБЩИЙ МОДУЛЬ.
     *
     * Формула и коэффициенты уехали в `src/games/n-back/core/dprime.ts` целиком,
     * байт в байт: раньше они жили внутри этого обработчика вместе с локальной
     * аппроксимацией обратной нормали, и проверить одно число можно было только
     * подняв весь экран с таймерами, речью и хранилищем. Числа не менялись —
     * иначе сохранённые `d_prime` прошлых партий перестали бы сравниваться.
     *
     * ⚠️ Каждый поток считается СВОИМ вызовом: пробы клетки и буквы независимы,
     * и общий d′ по смешанным пробам не значит ничего. Лог-линейная поправка
     * (Снодграсс–Корвин) применена внутри ядра к ОБОИМ каналам — она же
     * защищает от деления на ноль на пустой партии.
     */
    const visualSignal = signalDetection(visualCounts);
    const audioSignal = modality === 'dual' ? signalDetection(audioCounts) : null;
    const dPrime = visualSignal.dPrime;
    const aDPrime = audioSignal ? audioSignal.dPrime : null;
    // На экран уходит РОВНО то же число, что и в сессию, — не пересчитанное заново при отрисовке.
    setReadout({
      dual: modality === 'dual',
      visual: { accuracy, dPrime: visualSignal.dPrime },
      audio: audioSignal ? { accuracy: audioAccuracy, dPrime: audioSignal.dPrime } : null,
    });

    try {
      await saveSession({
        game_type: 'n_back',
        score: hits * 10 - falseAlarms * 5 + (modality === 'dual' ? aHits * 10 - aFalseAlarms * 5 : 0),
        time_seconds: finalTime,
        /**
         * Пресет пишет метки ШАГА: difficulty 'medium'/'easy' (diff-параметр) и
         * mode '2-back'. sessionFitsStep в assessment.ts сверяет оба поля дословно,
         * а свободный формат (`'2-back'`/`'15t-single'`) не совпадал ни с одним
         * шагом — партия батареи молча выпадала из оценки (домен → z=0).
         * Сами N/пробы/модальность не теряются: они всегда в details ниже.
         */
        difficulty: isPreset ? str('diff', 'medium') : `${nLevel}-back`,
        mode: isPreset ? `${nLevel}-back` : `${trials}t-${modality}`,
        errors: misses + falseAlarms + (modality === 'dual' ? aMisses + aFalseAlarms : 0),
        details: {
          // Резерв прогресса: getMaxLevelFromSessions восстановит уровень отсюда,
          // если локальный ключ потерян (переустановка, сброс профиля).
          level: levelRef.current,
          n: nLevel,
          n_trials: trials,
          hits, misses, falseAlarms, correctRejections, accuracy,
          d_prime: dPrime,
          hit_rate: Number(visualSignal.hitRate.toFixed(3)),
          false_alarm_rate: Number(visualSignal.falseAlarmRate.toFixed(3)),
          modality,
          ...(modality === 'dual' ? {
            audio_hits: aHits,
            audio_misses: aMisses,
            audio_falseAlarms: aFalseAlarms,
            audio_correctRejections: aCorrectRejections,
            audio_d_prime: aDPrime,
            audio_accuracy: audioAccuracy,
            combined_accuracy: combinedAccuracy,
          } : {}),
        },
      });
    } catch (e) { console.error(e); }
    // Спарклайн последних сессий (v1.116.0) — читаем ДО записи текущей, иначе она попадёт в свою же историю
    const pid = (profile as any)?.id ?? 'default';
    getSessionHistory('n_back', pid).then(setAccuracyHistory);
    recordSessionScore('n_back', pid, combinedAccuracy).catch(() => {});
    Promise.all([leaderboardSubmit.then(() => fetchBest('n_back')), getPersonalBest('n_back')]).then(([playersBest, storedPersonalBest]) => {
      const personalBest = Math.max(ownLeaderboardLevel, storedPersonalBest ?? ownLeaderboardLevel);
      setResultBenchmark({
        own: ownLeaderboardLevel,
        best: playersBest ?? personalBest,
        source: playersBest === null ? 'personal' : 'players',
      });
    });
    leaderboardSubmit.catch(() => {});
    // веха-босс: при чистом прохождении (≥80%) каждые BOSS_EVERY уровней → битва (память → счёт).
    // Непрохождение уровня больше НЕ уводит в тупик-result: показываем общий баннер cleared
    // с passed=false («почти, ещё раз») и авто-рестартом того же уровня. Пресет — как было (result).
    if (isPreset) { setPhase('result'); }
    else {
      setClearedPassed(passed);
      if (passed && levelRef.current % BOSS_EVERY === 0) { setBossWon(null); setPhase('boss'); }
      else setPhase('cleared');   // авто-поток: прошёл → следующий уровень, не прошёл → тот же ещё раз
    }
  };

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="analytics" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('nBack')}</Text>
        <Text style={styles.configDesc}>{t('nBackDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="nBackIntroDesc" benefits={N_BACK_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="n_back" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <TouchableOpacity
        accessibilityRole="button" style={[styles.optionCard, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} onPress={() => setShowLeaderboard(true)}>
        <Ionicons name="trophy-outline" size={18} color={colors.text} />
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('leaderboardLabel')}</Text>
      </TouchableOpacity>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('nLevelLabel')}</Text>
        <View style={styles.optionButtons}>
          {[1, 2, 3, 4].map((n) => {
            const locked = gate.isLocked(`${n}-back`);
            return (
            <TouchableOpacity
              accessibilityRole="button"
              key={n}
              disabled={locked}
              style={[
                styles.modeButton,
                nLevel === n && !locked
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 },
              ]}
              onPress={() => !locked && setNLevel(n)}
            >
              <Text style={[styles.modeButtonText, { color: nLevel === n && !locked ? textOn(GRADIENT[0]) : colors.text }]}>
                {n}-back{locked ? ' 🔒' : ''}
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>Modality</Text>
        <View style={styles.optionButtons}>
          {(['single', 'dual'] as Modality[]).map((m) => (
            <TouchableOpacity
              accessibilityRole="button" key={m} style={[styles.modeButton, modality === m
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setModality(m)}>
              <Text style={[styles.modeButtonText, { color: modality === m ? textOn(GRADIENT[0]) : colors.text }]}>
                {m === 'single' ? '👁 Visual' : '👁 + 🔊 Dual'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[15, 20, 30].map((n) => (
            <TouchableOpacity
              accessibilityRole="button"
              key={n}
              style={[
                styles.modeButton,
                trials === n
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setTrials(n)}
            >
              <Text style={[styles.modeButtonText, { color: trials === n ? textOn(GRADIENT[0]) : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      </View>
    </View>
  );

  // playing-фаза — на едином каркасе GameShell (кнопки Match/Sound прибиты к низу); модалка правил поверх
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('nBack')}
          onBack={() => goBackOrHome()}
          pet={petMood}
          stats={
            <View style={styles.statsRow}>
              <Text style={[styles.statText, { color: colors.text }]}>{nLevel}-back · {t('round')} {currentIdx + 1}/{trials}</Text>
              <Text style={[styles.statText, { color: colors.text }]}>{t('hud_correct')} {hits}</Text>
              <Text style={[styles.statText, { color: colors.error || '#f43f5e' }]}>{t('hud_errors')} {misses + falseAlarms}</Text>
              {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />}
            </View>
          }
          toolbar={
            <View style={modality === 'dual' ? styles.dualBtnRow : undefined}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!waitingResponse || answeredRef.current}
                onPress={handleMatchPress}
                style={[
                  styles.matchButton,
                  modality === 'dual' && { flex: 1, marginRight: 8 },
                  {
                    backgroundColor: !waitingResponse ? colors.surface : answeredRef.current ? '#6b7280' : GRADIENT[1],
                  },
                ]}
              >
                <Text style={styles.matchBtnText}>
                  {waitingResponse ? (modality === 'dual' ? '👁 Position' : t('match')) : t('warmup')}
                </Text>
              </TouchableOpacity>
              {modality === 'dual' && (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={!waitingResponse || aAnsweredRef.current}
                  onPress={handleAudioMatchPress}
                  style={[
                    styles.matchButton,
                    { flex: 1, marginLeft: 8, backgroundColor: !waitingResponse ? colors.surface : aAnsweredRef.current ? '#6b7280' : GRADIENT[0] },
                  ]}
                >
                  <Text style={styles.matchBtnText}>
                    {waitingResponse ? '🔊 Sound' : t('warmup')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        >
          <View style={styles.fieldCol}>
            <View style={[styles.grid3x3, { width: nbGridSide, height: nbGridSide }]}>
              {Array.from({ length: 9 }).map((_, i) => (
                // Клетка общая на четыре игры семейства «сетка со вспышкой»:
                // объём, загорание и значки для дальтоников живут в `FlashCell`.
                <FlashCell
                  key={i}
                  size={nbCell}
                  state={activeCell === i && showWindow ? 'lit' : 'idle'}
                  litColor={GRADIENT[0]}
                  idleColor={colors.surface}
                  borderColor={colors.border}
                />
              ))}
            </View>
            {/* In dual mode show the current letter visually too (for users without audio) */}
            {modality === 'dual' && showWindow && activeLetter && (
              <View style={[styles.letterDisplay, { backgroundColor: GRADIENT[1] }]}>
                <Text style={[styles.letterText, { color: textOn(GRADIENT[1]) }]}>{activeLetter}</Text>
              </View>
            )}
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {modality === 'dual'
                ? t('nBackDualHint').replace(/\{n\}/g, String(nLevel))
                : t('nBackHint')}
            </Text>
          </View>
        </GameShell>
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      </View>
    );
  }

  /**
   * ЧТО ПОКАЗАТЬ ЧЕЛОВЕКУ ПОСЛЕ ПАРТИИ: точность И d′, а не одну точность.
   *
   * ⚠️ В двойном режиме — четыре числа, по два на поток, и это не педантизм.
   * Каналы независимы, и человек, который отлично ведёт клетки и не слышит
   * букв, обязан увидеть это порознь: усреднённая пара сказала бы «вроде
   * ничего» ровно там, где половина игры не работает.
   */
  const nbStrings = getNBackStrings(language);
  const readoutMetrics = readout
    ? (readout.dual && readout.audio
        ? [
            { label: `${nbStrings.accuracy} · ${nbStrings.channelVisual}`, value: `${readout.visual.accuracy}%`, icon: 'eye-outline' },
            { label: `${nbStrings.dPrime} · ${nbStrings.channelVisual}`, value: readout.visual.dPrime.toFixed(2), icon: 'analytics-outline' },
            { label: `${nbStrings.accuracy} · ${nbStrings.channelAudio}`, value: `${readout.audio.accuracy}%`, icon: 'volume-high-outline' },
            { label: `${nbStrings.dPrime} · ${nbStrings.channelAudio}`, value: readout.audio.dPrime.toFixed(2), icon: 'analytics-outline' },
          ]
        : [
            { label: nbStrings.accuracy, value: `${readout.visual.accuracy}%`, icon: 'eye-outline' },
            { label: nbStrings.dPrime, value: readout.visual.dPrime.toFixed(2), icon: 'analytics-outline' },
          ])
    : undefined;
  const readoutNote = readoutMetrics ? [nbStrings.dPrimeHint, nbStrings.dPrimeWhy] : undefined;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('nBack')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      <LeaderboardModal
        visible={showLeaderboard} onClose={() => setShowLeaderboard(false)}
        gameId="n_back" language={language} colors={colors} gradient={GRADIENT}
        formatScore={(s) => `${s}-back`}
      />
      {phase === 'boss' && (
        <BossRound config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language} colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('cleared'); }} />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="n_back" level={levelRef.current} passed={clearedPassed} stars={bossWon === true ? 3 : ((misses + falseAlarms) === 0 ? 3 : (misses + falseAlarms) <= 2 ? 2 : 1)}
          gradient={GRADIENT} language={language} colors={colors}
          comparisonLine={resultBenchmark
            ? `${t('level')} ${resultBenchmark.own} · ${t(resultBenchmark.source === 'players' ? 'bestAmongPlayers' : 'personalBest')}: ${t('level')} ${resultBenchmark.best}`
            : undefined}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {/* Баннер уровня — единственный итог, который человек видит в обычной игре:
          полноэкранный GameResult достаётся только пресетам («Вызов дня», зарядка).
          Поэтому разбор ответов висит и здесь, отдельной полосой под баннером. */}
      {phase === 'cleared' && readoutMetrics && readoutNote && (
        <View style={[styles.readoutStrip, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.readoutRow}>
            {readoutMetrics.map((m) => (
              <View key={m.label} style={styles.readoutItem}>
                <Text style={[styles.readoutLabel, { color: colors.textSecondary }]}>{m.label}</Text>
                <Text style={[styles.readoutValue, { color: colors.text }]}>{m.value}</Text>
              </View>
            ))}
          </View>
          {readoutNote.map((line) => (
            <Text key={line} style={[styles.readoutNote, { color: colors.textSecondary }]}>{line}</Text>
          ))}
        </View>
      )}
      {phase === 'result' && (
        <GameResult
          score={hits * 10 - falseAlarms * 5 + (bossWon ? 50 : 0)}
          stars={bossWon === true ? 3 : undefined}
          time={elapsedTime}
          errors={misses + falseAlarms}
          metrics={readoutMetrics}
          metricsNote={readoutNote}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
          shareText={t('nBackShare').replace('{n}', String(nLevel)).replace('{p}', String(hits + misses + falseAlarms + correctRejections > 0 ? Math.round((hits / (hits + misses + falseAlarms + correctRejections)) * 100) : 0))}
          sparkline={accuracyHistory.length >= 2 ? { history: accuracyHistory, current: Math.round(((hits + correctRejections) / Math.max(1, hits + misses + falseAlarms + correctRejections)) * 100), lowerIsBetter: false } : undefined}
          comparisonLine={resultBenchmark
            ? `${t('level')} ${resultBenchmark.own} · ${t(resultBenchmark.source === 'players' ? 'bestAmongPlayers' : 'personalBest')}: ${t('level')} ${resultBenchmark.best}`
            : undefined}
        />
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
  modeButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', gap: 6, alignItems: 'center' },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 24 },
  statsRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  statText: { fontSize: 16, fontWeight: '700' },
  grid3x3: { width: 240, height: 240, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridCell: { width: 76, height: 76, borderRadius: 8, borderWidth: 1 },
  matchButton: { paddingVertical: 18, paddingHorizontal: 60, borderRadius: 16, alignItems: 'center' },
  matchBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  dualBtnRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%', maxWidth: 380 },
  letterDisplay: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  letterText: { color: '#FFF', fontSize: 38, fontWeight: '900' },
  hintText: { fontSize: 12, textAlign: 'center' },
  // Разбор ответов под баннером уровня: LevelCleared занимает flex:1, полоса садится под ним.
  readoutStrip: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  readoutRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18 },
  readoutItem: { alignItems: 'center', minWidth: 76 },
  readoutLabel: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
  readoutValue: { fontSize: 19, fontWeight: '800', marginTop: 2 },
  readoutNote: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
