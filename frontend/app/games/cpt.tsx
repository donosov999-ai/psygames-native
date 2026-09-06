/* psygames-game-cpt · VER 2 · 23.08.2026 */
/**
 * CPT — Continuous Performance Test (Conners Not-X variant)
 *
 * Парадигма: каждые 1-2 секунды появляется буква. Тапнуть надо на X (в AX-режиме —
 * на X, которой предшествовала A), на все прочие буквы ответ подавляется.
 * Цель РЕДКА — 20 % проб, см. блок над TARGET_RATE.
 *
 * ⚠️ VER 2: прежняя шапка описывала обратную задачу («тапнуть на любую букву
 * КРОМЕ X, 80 % targets») — экран так не работал ни одного дня: подпись игроку
 * `cptTapX` говорит «жми на каждую X», и `isTarget` в коде стоит на X.
 *
 * Биомаркеры (классика ADHD-диагностики, Conners CPT-3):
 *   - omission_errors    — пропущенные targets (внимание упало)
 *   - commission_errors  — реакции на X (impulse control failure)
 *   - mean_rt            — средняя RT на correct hits
 *   - rt_variability     — CV-RT = std/mean (один из самых валидных ADHD-маркеров)
 *   - vigilance_decrement — slope RT по квартилям сессии (мс/quartile, чем выше = внимание падает)
 *
 * Длительность 4/8/12 мин — достаточно чтобы поймать decrement.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { levelOutcome } from '@/src/services/levelOutcome';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
export const CPT_RULES: LevelRule[] = [
  { key: 'lookalike', fromLevel: 11 },   // lr_cpt_lookalike_*
];

const GRADIENT = ['#0f4c75', '#3282b8'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 4.18 (норма AA 4.5), стало 4.53.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #061e2f @0.06 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const CPT_BENEFITS = [
  { icon: 'time-outline',           textKey: 'benefitCpt1' },
  { icon: 'eye-outline',            textKey: 'benefitCpt2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitCpt3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

const LETTERS_NON_X = ['A','B','C','D','E','F','G','H','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','Y','Z'];  // без X
const CONFUSABLE = ['K','Y','V','W','N','M'];   // угловатые буквы — похожи на X при беглом взгляде
const STIM_DURATION = 250;          // буква видна 250мс

/**
 * РЕДКОСТЬ ЦЕЛИ — КОНСТАНТА ПАРАДИГМЫ, А НЕ РУЧКА СЛОЖНОСТИ.
 *
 * 🔴 БЫЛО: `targetRate` 0.28 на L1-5 и 0.32 дальше — то есть с уровнем цель
 * становилась ЧАЩЕ. Проба бдительности держится ровно на обратном: ответ обязан
 * быть исключением, а не фоном. Пропуск (omission) означает падение внимания
 * только тогда, когда нажатие редкое и требует его удерживать; при трети целей
 * это уже обычная скоростная задача, и `vigilance_decrement` меряет усталость
 * пальца, а не внимания.
 *
 * То же правило записано в `iowa.tsx`: методика с популяционными нормами
 * осмысленна только потому, что условие у всех одинаковое.
 *
 * Канон — 10-20 % целей; взято 20 %, верх диапазона: партия длится 90 секунд, за
 * неё выходит 30-90 проб, и на 10 % целей осталось бы 3-9 попаданий, а по ним
 * считаются и `mean_rt`, и `rt_variability` (домен attention_sustained в
 * `assessment.ts`, норма 0.20±0.08). Сторожит `conflict-ratio-is-not-difficulty.test.ts`.
 */
export const TARGET_RATE = 0.2;
/** Доля подсказок A, которые замыкаются целью X. Остальные — ловушка AY. */
const AX_COMPLETION = 0.7;
/**
 * Как часто ставить подсказку A, чтобы доля целей осталась ровно TARGET_RATE.
 * Вывод: A идёт только после «не-A», значит доля букв A равна a = A_CUE·(1−a),
 * то есть a = A_CUE/(1+A_CUE); доля целей = a·AX_COMPLETION. Приравняли к
 * TARGET_RATE → A_CUE = T/(C−T).
 *
 * ⚠️ Прежняя редакция брала одну и ту же вероятность и на подсказку, и на её
 * замыкание, поэтому в AX-режиме реальная доля целей была p²/(1+p) ≈ 8 % при
 * заявленных 32 %: на верхних уровнях за партию выходило 4-5 целей, и CV-RT
 * считался по четырём числам.
 */
const A_CUE_RATE = TARGET_RATE / (AX_COMPLETION - TARGET_RATE);
/** X без предшествующей A — ловушка на commission (доля от «прочих» проб). */
const BX_LURE = 0.18;

// Сложность РАСТЁТ НЕ ВРЕМЕНЕМ (длительность фикс ~90с — короткие сессии не скучают)
// и НЕ долей целей, а ТРУДНОСТЬЮ задачи:
//   L1-5  — классический X-CPT (жми на X), ISI 1500→900 (темп растёт)
//   L6-10 — AX-CPT (жми на X ТОЛЬКО если перед ней была A — нагрузка на рабочую память), ISI 1100→850
//   L11-15— AX-CPT + ISI 800→500 + растущая доля похожих на X дистракторов (перцептивная нагрузка)
export function levelParams(level: number): { durationSec: number; isiMs: number; mode: 'X' | 'AX'; confusableRatio: number } {
  const durationSec = 90;
  if (level <= 5)  return { durationSec, isiMs: Math.max(900, 1500 - (level - 1) * 150), mode: 'X',  confusableRatio: 0 };
  if (level <= 10) return { durationSec, isiMs: Math.max(850, 1100 - (level - 6) * 60),  mode: 'AX', confusableRatio: 0 };
  return { durationSec, isiMs: Math.max(500, 800 - (level - 11) * 75), mode: 'AX', confusableRatio: Math.min(0.5, 0.15 + (level - 11) * 0.09) };
}

/**
 * Сколько проб надо сыграть, чтобы партия считалась партией.
 *
 * 🔴 ЗДЕСЬ БЫЛА АРИФМЕТИЧЕСКАЯ ОШИБКА, ИЗ-ЗА КОТОРОЙ ТРИ УРОВНЯ НЕ БРАЛИСЬ
 * НИКОГДА. Прежний комментарий считал, что при самом медленном темпе за
 * девяносто секунд выходит «около шестидесяти проб», и ставил порог 40.
 * Но ПРОБА СТОИТ ДВА ISI, а не один: сперва пауза до буквы (`isi`), потом окно
 * ответа той же длины (`trialWindow = isiRef.current`, см. `scheduleNextStimulus`).
 * Настоящий счёт за 90 секунд: L1 — 30 проб, L2 — 33, L3 — 37, и все три ниже
 * порога 40. Значит `aborted` взводился ВСЕГДА, уровень не рос, и подняться с
 * первого уровня было физически нельзя — только перепрыгнуть через тропинку.
 * Найдено 23.08.2026 при правке долей проб.
 *
 * Порог взят от РЕАЛЬНОГО минимума: самая короткая полная партия даёт 30 проб,
 * порог 24 — это её четыре пятых. Смысл прежнего решения сохранён: 24 заведомо
 * больше, чем «дождался первой цели и вышел», и человек, у которого сел телефон
 * на восьмидесятой секунде, свой уровень по-прежнему получит.
 * Стережёт `cpt-levels-are-winnable` — он считает пробы по тем же формулам, что
 * и экран, и требует запас на КАЖДОМ уровне.
 */
export const MIN_TRIALS_FOR_LEVEL = 24;

/**
 * Сколько проб физически влезает в партию уровня. Одна проба = ДВА ISI
 * (пауза до буквы + окно ответа). Считается здесь, а не на глаз в комментарии:
 * ровно из-за счёта на глаз три уровня и оказались непроходимыми.
 */
export function trialsThatFit(level: number): number {
  const p = levelParams(level);
  return Math.floor((p.durationSec * 1000) / (p.isiMs * 2));
}

/**
 * 🔴 ШАГ ЗАРЯДКИ/ОЦЕНКИ ИГРАЕТ ФИКСИРОВАННЫЙ ПРЕСЕТ, А НЕ ЛИЧНЫЙ УРОВЕНЬ.
 * Было `levelParams(lvl.level)` и в пресете: игрок 1-го уровня сдавал замер на
 * X-CPT c ISI 1500мс, игрок 15-го — на AX с ISI 500мс и половиной похожих на X
 * дистракторов, а норма (rt_variability 0.20±0.08, assessment.ts) одна на всех.
 * Паттерн — flanker.tsx:144: тир шага → середина полосы своей difficulty-раскладки
 * (≤5 easy=X · ≤10 medium=AX · ≥11 hard). medium=8: AX, ISI 980мс — партия
 * запишется с difficulty 'medium', как предписывает шаг батареи.
 *
 * Длительность — отдельная ручка шага: оба пресета в проекте объявляют mode
 * '4min' (ASSESSMENT_PLAYLIST и CPT_STEP в warmup.ts), а levelParams всегда даёт
 * 90с. presetDurationSec честно разбирает '<N>min'; незнакомый режим → 90с
 * уровня, а НЕ тихий NaN. При ISI 980мс в 4 минуты влезает ~122 пробы против
 * ~45 за 90с — CV-RT по сотне откликов, а не по горстке.
 */
export const PRESET_LEVEL_BY_DIFF: Record<string, number> = { easy: 3, medium: 8, hard: 13 };
export function presetDurationSec(modeParam: string, fallbackSec: number): number {
  const m = /^(\d+)min$/.exec(modeParam);
  return m ? parseInt(m[1], 10) * 60 : fallbackSec;
}

// В AX-режиме A — это подсказка, а не наполнитель: случайная A из общего банка
// заводила бы незапланированную пару и ломала долю целей, поэтому её исключаем.
const LETTERS_FILLER = LETTERS_NON_X.filter((l) => l !== 'A');

function pickDistractor(confusableRatio: number, avoidA = false): string {
  if (confusableRatio > 0 && Math.random() < confusableRatio) return CONFUSABLE[Math.floor(Math.random() * CONFUSABLE.length)];
  const bank = avoidA ? LETTERS_FILLER : LETTERS_NON_X;
  return bank[Math.floor(Math.random() * bank.length)];
}
// Continuous-AX: target X строится через предшествующую A; редкая X-без-A = ловушка (commission).
function pickNextLetter(mode: 'X' | 'AX', confusableRatio: number, prev: string): string {
  if (mode === 'X') return Math.random() < TARGET_RATE ? 'X' : pickDistractor(confusableRatio);
  // подсказка и её замыкание разведены — только так доля целей равна TARGET_RATE
  if (prev === 'A') return Math.random() < AX_COMPLETION ? 'X' : pickDistractor(confusableRatio, true);
  if (Math.random() < A_CUE_RATE) return 'A';                        // ставим подсказку
  if (Math.random() < BX_LURE) return 'X';                           // X без A = ловушка-commission
  return pickDistractor(confusableRatio, true);
}

/**
 * Проба уровня: буква и «надо ли на неё жать». Уровень входит целиком — гейт
 * спрашивает игру по уровням и считает РЕАЛЬНУЮ долю целей по сгенерированному
 * потоку, а не читает константу глазами.
 */
export function makeTrial(level: number, prev: string): { letter: string; isTarget: boolean } {
  const { mode, confusableRatio } = levelParams(level);
  const letter = pickNextLetter(mode, confusableRatio, prev);
  return { letter, isTarget: mode === 'X' ? letter === 'X' : letter === 'X' && prev === 'A' };
}

interface TrialRecord {
  letter: string;
  isTarget: boolean;
  responded: boolean;
  rt: number | null;        // ms from stim onset to tap
  correct: boolean;         // (target & responded) OR (non-target & not_responded)
  trialIndex: number;       // position in sequence
}

export default function CPTGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  // Стимул-окно во весь экран: привязка к размеру вьюпорта — на телефоне буква
  // занимает бо́льшую площадь (раньше был жёсткий квадрат 240px, мелко на 6"+).
  const { width: winW, height: winH } = useWindowDimensions();
  const stimSide = Math.min(winW - 32, winH * 0.5, 460);   // квадрат по меньшей стороне, с потолком для планшета
  const stimFont = stimSide * 0.6;                          // символ ~60% окна (было 120px в боксе 240px)

  const lvl = usePersistentLevel('cpt');
  const { isPreset, autostart, str, isCalm } = useGamePreset();   // зарядка передаёт ?wu=1 → intro/config пропускаем
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата для баннера LevelCleared

  const [currentLetter, setCurrentLetter] = useState<string>('');
  const [letterVisible, setLetterVisible] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  // running counters for HUD
  const [hits, setHits] = useState(0);
  const [omissions, setOmissions] = useState(0);
  const [commissions, setCommissions] = useState(0);
  const [trialIdx, setTrialIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);

  // refs to avoid closure staleness in long-running timers
  const trialsRef = useRef<TrialRecord[]>([]);
  const currentTrialRef = useRef<TrialRecord | null>(null);
  const startTimeRef = useRef(0);
  const stimOnsetRef = useRef(0);
  const respondedRef = useRef(false);

  const isiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  // параметры текущего уровня (в рефах — таймеры живут вне ре-рендера)
  const levelRef = useRef(1);
  const isiRef = useRef(1500);
  const modeRef = useRef<'X' | 'AX'>('X');
  const durationSecRef = useRef(90);
  // mode-строка шага пресета ('4min'): в пресете партия ЗАПИСЫВАЕТСЯ под ней —
  // sessionFitsStep в assessment.ts сверяет session.mode со step.mode дословно,
  // `lvl8` там не опознался бы и домен внимания молча получал бы z=0.
  const presetModeRef = useRef('');
  const prevLetterRef = useRef('');

  const clearAllTimers = () => {
    [isiTimerRef, stimTimerRef, offTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
    if (remainingTimerRef.current) clearInterval(remainingTimerRef.current);
  };

  useEffect(() => () => { stoppedRef.current = true; clearAllTimers(); }, []);

  // Справка правил уровня (в CPT пресета-зарядки нет — всегда личная игра)
  const levelRules = useLevelRules('cpt', lvl.level, CPT_RULES, phase === 'playing');

  const scheduleNextStimulus = () => {
    if (stoppedRef.current) return;
    const elapsedSec = (gameNow() - startTimeRef.current) / 1000;
    if (elapsedSec >= durationSecRef.current) {
      finish();
      return;
    }
    const isi = isiRef.current * (0.85 + Math.random() * 0.3);   // ISI уровня ±15% дрожание
    isiTimerRef.current = setTimeout(() => {
      if (stoppedRef.current) return;
      // выбрать стимул по режиму уровня; isTarget = «нужно ли жать»
      const prev = prevLetterRef.current;
      const { letter, isTarget: isTgt } = makeTrial(levelRef.current, prev);
      prevLetterRef.current = letter;
      const trial: TrialRecord = {
        letter,
        isTarget: isTgt,
        responded: false,
        rt: null,
        correct: false,
        trialIndex: trialsRef.current.length,
      };
      currentTrialRef.current = trial;
      respondedRef.current = false;
      stimOnsetRef.current = gameNow();
      setCurrentLetter(letter);
      setLetterVisible(true);
      // hide after STIM_DURATION
      offTimerRef.current = setTimeout(() => {
        if (stoppedRef.current) return;
        setLetterVisible(false);
      }, STIM_DURATION);
      // close trial window after one full ISI from onset
      const trialWindow = isiRef.current; // окно ответа = один ISI уровня
      stimTimerRef.current = setTimeout(() => {
        if (stoppedRef.current) return;
        // close trial: if not responded and target = omission; if not responded and non-target = correct rejection
        const t = currentTrialRef.current;
        if (t && !t.responded) {
          if (t.isTarget) {
            t.correct = false;
            setOmissions(o => o + 1);
            flashFeedback('wrong');
          } else {
            t.correct = true;
            // correct rejection — silent
          }
        }
        if (t) {
          trialsRef.current.push(t);
          setTrialIdx(trialsRef.current.length);
        }
        currentTrialRef.current = null;
        scheduleNextStimulus();
      }, trialWindow);
    }, isi);
  };

  const flashFeedback = (kind: 'right' | 'wrong') => {
    setFeedback(kind);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
    fbTimerRef.current = setTimeout(() => setFeedback(null), 200);
  };

  const handleTap = () => {
    const t = currentTrialRef.current;
    if (!t || respondedRef.current) return;
    respondedRef.current = true;
    t.responded = true;
    t.rt = gameNow() - stimOnsetRef.current;
    if (t.isTarget) {
      t.correct = true;
      setHits(h => h + 1);
      flashFeedback('right');
      hapticSuccess();
    } else {
      // commission: tapped on X
      t.correct = false;
      setCommissions(c => c + 1);
      flashFeedback('wrong');
      hapticError();
    }
  };

  const startGame = () => {
    // личная игра → уровень рулит; пресет (зарядка/оценка) → фикс-уровень тира +
    // длительность из mode-параметра шага ('4min' → 240с). Паттерн flanker.tsx:144.
    const effLevel = isPreset ? (PRESET_LEVEL_BY_DIFF[str('diff', 'medium')] ?? 8) : lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    presetModeRef.current = isPreset ? str('mode', '') : '';
    isiRef.current = p.isiMs;
    modeRef.current = p.mode;
    durationSecRef.current = isPreset ? presetDurationSec(presetModeRef.current, p.durationSec) : p.durationSec;
    prevLetterRef.current = '';
    stoppedRef.current = false;
    trialsRef.current = [];
    currentTrialRef.current = null;
    setHits(0); setOmissions(0); setCommissions(0); setTrialIdx(0);
    setFeedback(null);
    setLetterVisible(false);
    setCurrentLetter('');
    setRemaining(durationSecRef.current);   // пресет может удлинить партию ('4min'), не p.durationSec
    setPhase('playing');
    startTimeRef.current = gameNow();
    remainingTimerRef.current = setInterval(() => {
      const left = durationSecRef.current - Math.floor((gameNow() - startTimeRef.current) / 1000);
      setRemaining(Math.max(0, left));
    }, 200);
    scheduleNextStimulus();
  };
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  const finish = async (stoppedEarly = false) => {
    stoppedRef.current = true;
    clearAllTimers();
    setLetterVisible(false);

    const trials = trialsRef.current;
    const targets = trials.filter(t => t.isTarget);
    const nonTargets = trials.filter(t => !t.isTarget);
    const totalHits = targets.filter(t => t.responded).length;
    const totalOmissions = targets.filter(t => !t.responded).length;
    const totalCommissions = nonTargets.filter(t => t.responded).length;

    // RT stats on hits only
    const hitRts = targets.filter(t => t.responded && t.rt !== null).map(t => t.rt as number);
    const meanRt = hitRts.length ? hitRts.reduce((a, b) => a + b, 0) / hitRts.length : 0;
    const rtVar = hitRts.length > 1
      ? hitRts.reduce((s, rt) => s + Math.pow(rt - meanRt, 2), 0) / hitRts.length
      : 0;
    const rtStd = Math.sqrt(rtVar);
    const cvRt = meanRt > 0 ? rtStd / meanRt : 0;  // coefficient of variation

    // Vigilance decrement: split hits into 4 quartiles, compute mean RT per quartile,
    // linear regression slope (ms per quartile). Positive slope = attention dropping.
    let vigilanceSlope = 0;
    if (hitRts.length >= 8) {
      const q = 4;
      const perQ = Math.floor(hitRts.length / q);
      const meansByQuartile: number[] = [];
      for (let i = 0; i < q; i++) {
        const slice = hitRts.slice(i * perQ, (i + 1) * perQ);
        meansByQuartile.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      // simple linear regression: x = [1,2,3,4], y = means
      const xs = [1, 2, 3, 4];
      const meanX = 2.5;
      const meanY = meansByQuartile.reduce((a, b) => a + b, 0) / 4;
      const num = xs.reduce((s, x, i) => s + (x - meanX) * (meansByQuartile[i] - meanY), 0);
      const den = xs.reduce((s, x) => s + Math.pow(x - meanX, 2), 0);
      vigilanceSlope = den > 0 ? num / den : 0;
    }

    const totalTime = (gameNow() - startTimeRef.current) / 1000;
    // прохождение уровня: высокая доля hits + мало commission → следующий уровень
    const accuracy = targets.length ? totalHits / targets.length : 0;
    const commissionRate = nonTargets.length ? totalCommissions / nonTargets.length : 0;
    /**
     * ⚠️ ШАГ ЗАРЯДКИ УРОВЕНЬ НЕ ТРОГАЕТ — ни вверх, ни вниз. `isPreset` здесь доставали
     * из хука и не использовали нигде, кроме авто-старта: партия из плейлиста двигала
     * персональный уровень, то есть он менялся не от результата человека, а от того,
     * попалась ли ему эта игра в наборе.
     *
     * «Партия та же» оправданием не работает: доску по `levelParams(lvl.level)` играют и
     * Симон, и Познер, и стоп-сигнал — вся ближайшая родня по механике, — и все они
     * уровень в пресете замораживают. Одна CPT была исключением, и это не решение, а
     * пропуск. Понижение — половина беды похуже: шаг CPT стоит в КОНЦЕ длинной серии,
     * намеренно на утомлении (см. CPT_STEP в `services/warmup.ts`), поэтому промахи там
     * системно чаще — три таких набора подряд роняли ступень, взятую на тропинке.
     *
     * Фаза идёт в комплекте: с выключенным `passed` баннер уровня сказал бы «почти,
     * ещё раз» там, где человек ничего не провалил. В пресете — экран итога; на
     * следующий шаг зарядка уводит сама (таймер в WarmupContext после записи сессии).
     * Босс отпадает там же: веха висит на подъёме уровня, а его в зарядке нет.
     */
    /**
     * 🔴 «СТОП» БЫЛ БЕСПЛАТНЫМ ЛЕВЕЛ-АПОМ. Партия длится девяносто секунд, а
     * зачёт считался по накопленному: дождался первой цели, тапнул, нажал
     * «СТОП» — точность 1/1, ложных тревог ноль, уровень взят за десять секунд.
     * Замер: в 100 % прогонов.
     *
     * ⚠️ И ПРОВАЛОМ ЭТО ТОЖЕ НЕ ЯВЛЯЕТСЯ. В «вероятностном выборе» та же кнопка
     * означала провал — противоположный перекос той же природы. Человек, которому
     * позвонили, ничего не сделал неправильно.
     *
     * Правило: оборванная партия уровень НЕ ДВИГАЕТ — ни вверх, ни вниз.
     * Досчитать пробы за него нельзя, а гадать нечестно.
     */
    const played = trialsRef.current.length;
    /**
     * 🔴 «СТОП» БЫЛ БЕСПЛАТНЫМ ЛЕВЕЛ-АПОМ. Партия длится девяносто секунд, а
     * зачёт считался по накопленному: дождался первой цели, тапнул, нажал
     * «СТОП» — точность 1/1, ложных тревог ноль, уровень взят за десять секунд.
     * Замер: в 100 % прогонов. Правило «обрыв уровень не двигает» живёт в
     * `levelOutcome`, а не здесь: иначе следующая игра решит по-своему.
     */
    const aborted = stoppedEarly || played < MIN_TRIALS_FOR_LEVEL;
    const out = levelOutcome({ isPreset, aborted, cleared: accuracy >= 0.7 && commissionRate <= 0.3 });
    const passed = out.passed;
    if (out.raiseLevel) lvl.reach(levelRef.current + 1);
    if (out.lowerLevel) lvl.fail();   // гистерезис: 3 провала подряд → уровень -1
    // непрерывный поток: и проход, и провал → баннер LevelCleared (passed=false = «почти, ещё раз» + рестарт того же уровня), без тупика GameResult
    if (out.raiseLevel && levelRef.current % BOSS_EVERY === 0) {
      // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
      setClearedPassed(true);
      setPhase('boss');
    } else {
      setClearedPassed(passed);
      setPhase(out.phase);   // личная партия — баннер уровня, шаг зарядки — итог
    }

    try {
      await saveSession({
        passed,
        game_type: 'cpt',
        score: Math.max(0, Math.round(totalHits * 5 - totalCommissions * 20 - totalOmissions * 10)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        // пресет пишет mode шага ('4min') — иначе sessionFitsStep не сопоставит партию батарее
        mode: isPreset && presetModeRef.current ? presetModeRef.current : `lvl${levelRef.current}`,
        errors: totalOmissions + totalCommissions,
        details: {
          level: levelRef.current,
          paradigm: modeRef.current,
          hits: totalHits,
          omission_errors: totalOmissions,
          commission_errors: totalCommissions,
          n_targets: targets.length,
          n_nontargets: nonTargets.length,
          mean_rt: Math.round(meanRt),
          rt_std: Math.round(rtStd),
          rt_variability: Number(cvRt.toFixed(3)),    // CV-RT
          vigilance_decrement: Math.round(vigilanceSlope),  // ms per quartile
        },
      });
    } catch (e) { console.error(e); }
  };

  const stop = () => {
    if (phase !== 'playing') return;
    finish(true);   // оборвали руками — уровень по такой партии не двигается
  };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => (
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="time" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('cpt')}</Text>
        <Text style={styles.configDesc}>{t('cptDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="cptIntroDesc" benefits={CPT_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="cpt" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
          {t('level')} {lvl.level}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {lvl.level <= 5 ? t('cptLvlParamsX') : lvl.level <= 10 ? t('cptLvlParamsAX') : t('cptLvlParamsAXHard')}
        </Text>
        {/* v1.112.0: критерий прохождения уровня виден игроку (раньше был скрыт в коде finish()) */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
          {t('cptPass')}
        </Text>
        {lvl.level > 1 && (
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        ⚠ {t('cptStrenuous')}
      </Text>
    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  // игровая фаза — на едином каркасе GameShell (СТОП — служебное, значит в шапке);
  // модалка правил уровня — поверх каркаса (паттерн digit-span)
  if (phase === 'playing') {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const fbColor = feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : null;
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('cpt')}
          onBack={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}
          /**
           * Счётчики данными (см. `HudItem`).
           *
           * ⚠️ Из четырёх прежних чисел оставлены три: пропуски и ложные нажатия
           * убраны из шапки. В пробе на устойчивое внимание и то, и другое —
           * рабочий материал упражнения; висящий по ходу счётчик промахов
           * наказывает ровно за то, чем измеряется задача (§12.4).
           */
          hud={[
            { key: 'time', icon: 'time', label: t('timeLeftLabel'), value: `${mins}:${secs.toString().padStart(2, '0')}`, tone: 'accent' as const },
            { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const, pop: true },
            { key: 'trials', icon: 'repeat', label: t('hud_trials'), value: trialIdx },
          ]}
          stats={
            <View style={styles.statsRow}>
              <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />
            </View>
          }
          /* 🔴 САМЫЙ ОСТРЫЙ СЛУЧАЙ ПРАВИЛА СЛОТОВ. Ответ в CPT — тап по окну
             стимула в ПОЛЕ, и бьют по нему полторы минуты на скорость. Раньше
             прямо под этим окном, в нижней полосе — той самой, которая во
             «Фланкере» и «Саймоне» означает ответ, — стоял «СТОП»,
             заканчивающий сеанс. Промах вниз стоил всей пробы.
             Теперь «СТОП» в шапке, как и у остальных упражнений с сеансом. */
          headerActions={
            <GameAuxBar>
              <GameAuxAction icon="stop-circle" label={t('btn_stop')} danger onPress={stop} />
            </GameAuxBar>
          }
        >
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {t(modeRef.current === 'AX' ? 'cptTapAX' : 'cptTapX')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={handleTap}
              style={[styles.stimBox, {
                width: stimSide, height: stimSide,   // окно масштабируется под экран (useWindowDimensions)
                backgroundColor: fbColor ? fbColor + '33' : colors.surface,
                borderColor: fbColor || (letterVisible && currentLetter === 'X' ? '#fbbf24' : colors.border),
                borderWidth: letterVisible ? 3 : 1,
              }]}
            >
              {letterVisible && (
                <Text style={[styles.stimText, {
                  fontSize: stimFont,   // символ ~60% окна вместо жёстких 120px
                  color: currentLetter === 'X' ? '#fbbf24' : colors.text,
                }]}>
                  {currentLetter}
                </Text>
              )}
              {!letterVisible && <Text style={[styles.fixCross, { color: colors.textSecondary }]}>+</Text>}
            </TouchableOpacity>
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
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('cpt')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <GameSuiteSwitch />
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'oddletter', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="cpt" level={levelRef.current} passed={clearedPassed} stars={(omissions + commissions) === 0 ? 3 : (omissions + commissions) <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 5 - commissions * 20 - omissions * 10)}
          time={durationSecRef.current} errors={omissions + commissions}
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
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 22 },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  stimBox: { borderRadius: 28, justifyContent: 'center', alignItems: 'center' },  // размеры задаются инлайном от useWindowDimensions
  stimText: { fontWeight: '900' },                                                // fontSize задаётся инлайном (масштаб окна)
  fixCross: { fontSize: 48, opacity: 0.4 },
  // ⚠️ Осиротело после разводки слотов: СТОП уехал в шапку (GameAuxAction).
  // Стили ниже (stopBtn, stopBtnText) больше никем не берутся; оставлены
  // намеренно — удаление чужого кода в этом проекте только с разрешения.
  stopBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 16, borderWidth: 1 },
  stopBtnText: { fontSize: 14, fontWeight: '700' },
});
