/* psygames-game-stop-signal · VER 2 · 23.08.2026 */
/**
 * Stop-Signal Task — классика inhibitory control (response inhibition).
 *
 * Парадигма: после фиксации появляется сигнал GO — надо нажать кнопку как можно
 * быстрее. В части проб через задержку после GO появляется СТОП-сигнал (✋) —
 * ответ надо подавить (не нажимать). Нажатие на стоп-пробе = failed inhibition
 * (в т.ч. если нажал ДО появления стопа — как в реальном SST, любой ответ на
 * стоп-пробе считается провалом торможения). Пропуск GO = omission-ошибка.
 *
 * 🔴 РЕДАКЦИЯ 2 (23.08.2026) — ЗАКРЫТ §2.1 РЕЕСТРА ДЕФЕКТОВ. Было:
 * `ssd = min(430, 150 + (level−1)*20)` — задержка стоп-сигнала назначалась
 * НОМЕРОМ УРОВНЯ, лестницы не было. Из-за этого у быстрого игрока торможение
 * срывалось почти всегда, у медленного удавалось почти всегда, и «счёт» мерил
 * базовую скорость реакции, а не торможение. Игра называлась «торможение» и
 * торможения не измеряла — при этом выдавала правдоподобное число, поэтому
 * никто не замечал.
 *
 * Стало:
 *   · задержка ходит по лестнице 1-вверх/1-вниз (старт 250 мс, шаг 50 мс,
 *     границы 50…700 мс) и сходится к доле удавшихся торможений ≈ 50%
 *     у ЛЮБОГО игрока — см. `src/games/stop-signal/core/ladder.ts`;
 *   · главное число игры — SSRT методом интеграции, и оно НЕ ВЫДАЁТСЯ, когда
 *     условия применимости не выполнены: вместо правдоподобного числа человек
 *     получает причину — см. `core/ssrt.ts`;
 *   · доля стоп-проб 25% вместо прежних 40% (§1 реестра: при 40% преобладающей
 *     реакции нет, тормозить нечего);
 *   · уровень крутит ТЕМП и ОКНО ОТВЕТА, задержку не трогает вовсе.
 *
 * ⚠️ ЛЕСТНИЦА И ПРОБЫ ПЕРЕЖИВАЮТ ПАРТИЮ (`core/persist.ts`). В партии 12…20
 * проб, стоп-проб из них три-пять — за один заход лестница не доходит до точки
 * схождения физически. Поэтому ступень и окно проб хранятся между заходами, как
 * и в настоящем стоп-сигнале, где SSD не сбрасывается между блоками.
 *
 * ⚠️ ПАРТИИ ДО ЭТОЙ РЕДАКЦИИ НЕСРАВНИМЫ С НОВЫМИ, и дело не только в счёте:
 * поменялась сама задача (доля стоп-проб, происхождение задержки, темп). Поэтому
 * `mode` теперь `lvl<N>-ssrt`, а не `lvl<N>` — ключ задачи в истории тренировок
 * (`trainingHistory.taskKey`) от этого расходится, и старое с новым не смешается.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';
import {
  EMPTY_LADDER,
  MIN_STOP_TRIALS,
  appendTrials,
  countStopTrials,
  estimateSsrt,
  fillTemplate,
  getStopSignalStrings,
  levelParams,
  loadLadder,
  nextSsd,
  saveLadder,
  type LadderState,
  type SsrtEstimate,
  type StopSignalStrings,
  type StopSignalTrial,
} from '@/src/games/stop-signal/core';

const GRADIENT = ['#ee0979', '#ff6a00'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 2.87 (норма AA 4.5), стало 4.55.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
// Синергия: каждые BOSS_EVERY пройденных уровней → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;
const STOP_BENEFITS = [
  { icon: 'hand-left-outline', textKey: 'benefitStopSignal1' },
  { icon: 'pause-circle-outline', textKey: 'benefitStopSignal2' },
  { icon: 'flash-off-outline', textKey: 'benefitStopSignal3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type SignalState = 'idle' | 'go' | 'stop' | 'feedback';
type TrialOutcome = 'go_hit' | 'go_miss' | 'stop_ok' | 'stop_fail';

/**
 * Причина, по которой числа не будет, — человеческим текстом. Каждая ветка
 * называет СВОЁ условие применимости: «оценка ненадёжна» без причины ничем не
 * лучше выдуманного числа, потому что не подсказывает, что делать дальше.
 */
function doubtLine(strings: StopSignalStrings, est: SsrtEstimate): string {
  switch (est.doubt) {
    case 'tooFewStopTrials':
      return fillTemplate(strings.doubtFewStops, { have: est.stopTrials, need: MIN_STOP_TRIALS });
    case 'tooManyOmissions':
      return fillTemplate(strings.doubtOmissions, {
        pct: Math.round((est.goOmissions / Math.max(1, est.goTrials)) * 100),
      });
    case 'pRespondOffTarget':
      return fillTemplate(strings.doubtOffTarget, { pct: Math.round(est.pInhibit * 100) });
    case 'raceModelViolated':
      return strings.doubtRaceViolated;
    default:
      return strings.doubtNoData;   // проб нет вовсе — ни стоп-проб, ни ответов GO
  }
}

export default function StopSignalGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const strings = getStopSignalStrings(language);

  const { isPreset, autostart, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('stop_signal');

  // Лестница задержки: ступень + окно проб. Приезжает из хранилища асинхронно,
  // поэтому автостарт ждёт и её тоже — иначе первая партия дня пошла бы с 250 мс
  // человеку, у которого лестница давно стоит на 500.
  const [ladder, setLadder] = useState<LadderState>(EMPTY_LADDER);
  const [ladderLoaded, setLadderLoaded] = useState(false);
  const [estimate, setEstimate] = useState<SsrtEstimate>(() => estimateSsrt([]));
  const ssdRef = useRef(EMPTY_LADDER.ssdMs);
  const poolRef = useRef<StopSignalTrial[]>([]);
  const runTrialsRef = useRef<StopSignalTrial[]>([]);

  useEffect(() => {
    let alive = true;
    void loadLadder().then((state) => {
      if (!alive) return;
      ssdRef.current = state.ssdMs;
      poolRef.current = state.trials;
      setLadder(state);
      setEstimate(estimateSsrt(state.trials));
      setLadderLoaded(true);
    });
    return () => { alive = false; };
  }, []);

    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded && ladderLoaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [clearedPassed, setClearedPassed] = useState(true);

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(12);
  const [signal, setSignal] = useState<SignalState>('idle');
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);                 // Go pressed correctly
  const [errors, setErrors] = useState(0);             // Go missed OR Stop violated
  const [correctStops, setCorrectStops] = useState(0); // Stop trials successfully inhibited
  const [rts, setRts] = useState<number[]>([]);

  // Рефы — таймерная цепочка (фиксация → GO → стоп/дедлайн → следующая проба)
  // живёт вне ре-рендеров, state в её колбэках был бы устаревшим (паттерн simon/cpt).
  const levelRef = useRef(1);
  const stopProbRef = useRef(0.25);
  const goWindowRef = useRef(1400);
  const fixMinRef = useRef(700);
  const fixJitterRef = useRef(700);
  const interTrialRef = useRef(600);
  const totalTrialsRef = useRef(12);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const correctStopsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const trialIsStopRef = useRef(false);
  const trialSsdRef = useRef(EMPTY_LADDER.ssdMs);   // ступень, назначенная ЭТОЙ пробе
  const goAtRef = useRef<number>(0);
  const respondedRef = useRef<boolean>(false);
  const startTimeRef = useRef(0);

  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    [goTimerRef, stopTimerRef, endTimerRef, interTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearTimers(), []);

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    stopProbRef.current = p.stopProb;
    goWindowRef.current = p.goWindowMs;
    fixMinRef.current = p.fixMinMs;
    fixJitterRef.current = p.fixJitterMs;
    interTrialRef.current = p.interTrialMs;
    totalTrialsRef.current = p.trials;
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0; correctStopsRef.current = 0;
    rtsRef.current = [];
    runTrialsRef.current = [];
    roundRef.current = 1;
    setHits(0); setErrors(0); setCorrectStops(0); setRts([]);
    setRound(1);
    setSignal('idle'); setFeedback(null);
    setPhase('playing');
    startTimeRef.current = gameNow();
    nextTrial();
  };

  const finish = async () => {
    clearTimers();
    const totalTime = (gameNow() - startTimeRef.current) / 1000;
    const h = hitsRef.current, e = errorsRef.current, cs = correctStopsRef.current;
    const finalRts = rtsRef.current;
    const meanRt = finalRts.length ? finalRts.reduce((a, b) => a + b, 0) / finalRts.length : 0;
    const total = totalTrialsRef.current;

    // Пробы партии доливаются в окно замера, ступень лестницы сохраняется как есть.
    const pool = appendTrials(poolRef.current, runTrialsRef.current);
    poolRef.current = pool;
    const nextState: LadderState = { ssdMs: ssdRef.current, trials: pool };
    setLadder(nextState);
    void saveLadder(nextState);
    const est = estimateSsrt(pool);
    setEstimate(est);

    // Проход уровня: ≥80% верных проб (верная = go_hit или stop_ok;
    // ошибки — ОБЕ по механике: пропуск GO и нажатие на стоп-пробе).
    // ⚠️ Порог прохождения НЕ трогает SSRT: лестница держит долю торможений
    // около половины у всех, поэтому мерилом прохождения она быть не может.
    const accuracy = total > 0 ? (h + cs) / total : 0;
    const passed = accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');                        // пресет/свободный режим — экран статистики
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      // Веха: прошёл уровень кратный BOSS_EVERY → босс (уровень уже засчитан reach), иначе баннер.
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        setClearedPassed(true);
        setPhase('boss');
      } else {
        setClearedPassed(passed);
        setPhase('cleared');                     // непрерывный поток: и проход, и провал → баннер уровня
      }
    }
    try {
      await saveSession({
        passed,
        game_type: 'stop_signal',
        // Очки партии — это ОЧКИ, а не биомаркер: они кормят монеты и звёзды.
        // Биомаркер лежит в details.ssrt_ms и берётся только оттуда.
        score: Math.max(0, Math.round(h * 50 + cs * 100 - e * 60)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}-ssrt`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          hits: h,
          correct_stops: cs,
          accuracy: Math.round(accuracy * 100),
          n_trials: total,
          // ─── замер торможения ───
          biomarker: 'ssrt_ms',
          ssrt_method: est.method,
          ssrt_ms: est.ssrtMs,                 // null = условия применимости не выполнены
          ssrt_doubt: est.doubt,
          ssd_ms: ssdRef.current,              // ступень лестницы, а НЕ параметр уровня
          mean_ssd_ms: est.meanSsdMs,
          p_inhibit: Math.round(est.pInhibit * 100),
          pool_trials: est.goTrials + est.stopTrials,
          pool_stop_trials: est.stopTrials,
        },
      });
    } catch (err) { console.error(err); }
  };

  const nextTrial = () => {
    const isStop = Math.random() < stopProbRef.current;
    trialIsStopRef.current = isStop;
    trialSsdRef.current = ssdRef.current;
    setSignal('idle');
    setFeedback(null);
    respondedRef.current = false;

    const fixDelay = fixMinRef.current + Math.random() * fixJitterRef.current;
    goTimerRef.current = setTimeout(() => {
      setSignal('go');
      goAtRef.current = gameNow();
      // стоп-сигнал приходит через ступень ЛЕСТНИЦЫ (не через параметр уровня)
      if (isStop) {
        stopTimerRef.current = setTimeout(() => {
          if (!respondedRef.current) setSignal('stop');
        }, trialSsdRef.current);
      }
      // end trial window (окно ответа уровня)
      endTimerRef.current = setTimeout(() => {
        if (respondedRef.current) return;
        // No press — Go = miss; Stop = correct inhibition
        endTrial(isStop ? 'stop_ok' : 'go_miss', null);
      }, goWindowRef.current);
    }, fixDelay);
  };

  const endTrial = (outcome: TrialOutcome, rt: number | null) => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    let fb: 'right' | 'wrong' = 'right';
    if (outcome === 'go_hit')   { hitsRef.current += 1; rtsRef.current = [...rtsRef.current, rt as number]; fb = 'right'; }
    if (outcome === 'go_miss')  { errorsRef.current += 1; fb = 'wrong'; }
    if (outcome === 'stop_ok')  { correctStopsRef.current += 1; fb = 'right'; }
    if (outcome === 'stop_fail'){ errorsRef.current += 1; fb = 'wrong'; }

    const isStop = outcome === 'stop_ok' || outcome === 'stop_fail';
    runTrialsRef.current = [...runTrialsRef.current, {
      isStop,
      ssdMs: isStop ? trialSsdRef.current : null,
      rtMs: rt,
      goWindowMs: goWindowRef.current,
    }];
    // ⚠️ Шаг лестницы делается ТОЛЬКО по стоп-пробе и в ОБЕ стороны: удержался —
    // вверх (труднее), сорвался — вниз. Односторонний шаг увёл бы задержку в
    // потолок и вернул бы ровно ту дыру, ради которой лестницу заводили.
    if (isStop) ssdRef.current = nextSsd(ssdRef.current, outcome === 'stop_ok');

    setHits(hitsRef.current); setErrors(errorsRef.current); setCorrectStops(correctStopsRef.current);
    setRts([...rtsRef.current]);
    setSignal('feedback'); setFeedback(fb);
    if (fb === 'right') hapticSuccess(); else hapticError();
    interTimerRef.current = setTimeout(() => {
      if (roundRef.current >= totalTrialsRef.current) { finish(); return; }
      roundRef.current += 1;
      setRound(roundRef.current);
      nextTrial();
    }, interTrialRef.current);
  };

  const onPressGo = () => {
    if (respondedRef.current) return;
    if (signal !== 'go' && signal !== 'stop') return;
    respondedRef.current = true;
    const rt = gameNow() - goAtRef.current;
    // Нажатие на стоп-пробе = failed inhibition, даже если стоп ещё не показан
    if (signal === 'stop' || trialIsStopRef.current) endTrial('stop_fail', rt);
    else endTrial('go_hit', rt);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
  const poolStops = countStopTrials(ladder.trials);
  const ssrtValue = estimate.ssrtMs === null ? '—' : `${estimate.ssrtMs}${t('msShort')}`;

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="hand-left" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('stopSignal')}</Text>
          <Text style={styles.configDesc}>{t('stopSignalDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="stopSignalIntroDesc" benefits={STOP_BENEFITS} accent={GRADIENT[0]} />
        <LevelProgressMap bestLevel={lvl.best} gameId="stop_signal" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          {/* Параметры уровня БЕЗ задержки: она принадлежит лестнице, а не уровню. */}
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {fillTemplate(strings.lvlParams, {
              n: p.trials,
              p: Math.round(p.stopProb * 100),
              w: (p.goWindowMs / 1000).toFixed(1),
              f: (p.fixMinMs / 1000).toFixed(1),
            })}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {t('stopSignalPass')}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ЗАМЕР ТОРМОЖЕНИЯ — то, ради чего игра существует. */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 16 }]}>{strings.ladderTitle}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{strings.ladderHint}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{strings.raceHint}</Text>
          {/* 🔴 Ступень НЕ показывается во время партии — и вот почему. */}
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{strings.ssdHidden}</Text>

          <View style={styles.measureRow}>
            <Text style={[styles.measureLabel, { color: colors.textSecondary }]}>{strings.ssdLabel}</Text>
            <Text style={[styles.measureValue, { color: colors.text }]}>{ladder.ssdMs}{t('msShort')}</Text>
          </View>
          <View style={styles.measureRow}>
            <Text style={[styles.measureLabel, { color: colors.textSecondary }]}>{strings.inhibitionLabel}</Text>
            <Text style={[styles.measureValue, { color: colors.text }]}>{Math.round(estimate.pInhibit * 100)}%</Text>
          </View>
          <View style={styles.measureRow}>
            <Text style={[styles.measureLabel, { color: colors.textSecondary }]}>{strings.goRtLabel}</Text>
            <Text style={[styles.measureValue, { color: colors.text }]}>{estimate.meanGoRtMs}{t('msShort')}</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {fillTemplate(strings.poolLabel, { n: ladder.trials.length, stop: poolStops })}
          </Text>

          {estimate.trustworthy ? (
            <>
              <View style={styles.measureRow}>
                <Text style={[styles.measureLabel, { color: colors.text, fontWeight: '700' }]}>{strings.ssrtLabel}</Text>
                <Text style={[styles.measureValue, { color: GRADIENT[0], fontSize: 20 }]}>{ssrtValue}</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{strings.ladderStable}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{strings.ssrtHint}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{strings.methodNote}</Text>
            </>
          ) : (
            <>
              {/* Правдоподобное число здесь было бы враньём — вместо него причина. */}
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{strings.ssrtUnsure}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{doubtLine(strings, estimate)}</Text>
            </>
          )}
        </View>

        <TouchableOpacity
          accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const stimColor =
    feedback === 'right' ? '#22c55e' :
    feedback === 'wrong' ? '#f43f5e' :
    signal === 'go' ? '#22c55e' :
    signal === 'stop' ? '#f43f5e' :
    '#444';

  const stimLabel =
    signal === 'go' ? t('goBtn') :
    signal === 'stop' ? '✋' :
    feedback ? (feedback === 'right' ? '✓' : '✗') :
    '•';

  // playing-фаза — на едином каркасе GameShell (кнопка GO прибита к низу)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('stopSignal')}
        onBack={() => { clearTimers(); goBackOrHome(); }}
        /**
         * Счётчики ДАННЫМИ (см. `HudItem`): каркас рисует их одинаково во всех
         * играх, и правка вида приходит сразу везде.
         *
         * ⚠️ Счётчика ошибок здесь нет намеренно: при подстройке сложности ошибки —
         * норма по построению, и красный счётчик наказывает ровно за то, чего
         * требует обучение (§12.4 карты геймификации).
         */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${totalTrials}` },
          { key: 'hud_correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
          { key: 'hud_held', icon: 'ellipse', label: t('hud_held'), value: correctStops },
          { key: 'reaction', icon: 'flash', label: t('reaction'), value: `${meanRt}${t('msShort')}`, tone: 'accent' as const },
        ]}
        toolbar={
          <TouchableOpacity
            accessibilityRole="button" activeOpacity={0.7} onPress={onPressGo}
            style={styles.goBtnWrap}>
            <LinearGradient colors={GRADIENT as [string, string]} style={styles.goBtn}>
              <Text style={styles.goBtnText}>{t('goBtn')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('stopHint')}</Text>
          <View style={[styles.stimulusBox, { backgroundColor: stimColor + '33', borderColor: stimColor }]}>
            <Text style={[styles.stimText, { color: stimColor }]}>{stimLabel}</Text>
          </View>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('stopSignal')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language} colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }} />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="stop_signal" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 50 + correctStops * 100 - errors * 60))}
          time={meanRt / 1000} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
          metrics={[
            { label: strings.ssrtLabel, value: ssrtValue, icon: 'hand-left-outline' },
            { label: strings.ssdLabel, value: `${ladder.ssdMs}${t('msShort')}`, icon: 'timer-outline' },
            { label: strings.inhibitionLabel, value: `${Math.round(estimate.pInhibit * 100)}%`, icon: 'pause-circle-outline' },
          ]}
          metricsNote={estimate.trustworthy
            ? [strings.ssrtHint, strings.methodNote]
            : [strings.ssrtUnsure, doubtLine(strings, estimate)]}
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
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  measureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', maxWidth: '100%' },
  measureLabel: { fontSize: 13, flexShrink: 1 },
  measureValue: { fontSize: 15, fontWeight: '700' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 16 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  stimulusBox: { width: 200, height: 200, borderRadius: 24, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  stimText: { fontSize: 56, fontWeight: '900' },
  goBtnWrap: { borderRadius: 60, overflow: 'hidden' },
  goBtn: { paddingVertical: 22, paddingHorizontal: 80, alignItems: 'center', borderRadius: 60 },
  goBtnText: { color: ON_GRAD.color, fontSize: 22, fontWeight: '900', letterSpacing: 2 },
});
