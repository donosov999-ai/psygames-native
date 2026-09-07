/* psygames-game-choice-rt · VER 2 · 28.08.2026 */
/**
 * Choice RT — время реакции выбора (стрелки).
 *
 * Парадигма: после случайной паузы появляется стрелка — жми кнопку
 * соответствующего направления как можно быстрее.
 *
 * Уровни (persist, по паттерну cpt/simon): ручные селекторы режима (2/4 стрелки)
 * и числа проб заменены на usePersistentLevel('choice_rt') + levelParams.
 * Ось усложнения:
 *   - число вариантов выбора растёт: 2 стрелки (L1-5) → 3 (L6-10) → 4 (L11-15)
 *   - окно ответа сокращается 2000мс → 750мс (не успел = ошибка-пропуск)
 *   - число проб растёт ступенями 12 → 16 → 20
 * Проход уровня: ≥80% верных ответов за раунд → LevelCleared (авто-поток).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
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
import { answerButton, stimBox } from '@/src/games/attention/layout';
import { AnswerBar } from '@/src/games/attention/AnswerBar';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LeaderboardModal from '@/src/components/LeaderboardModal';
import { countsForRecord } from '@/src/services/leaderboard';
import { recordLineFor, useRecordBenchmark } from '@/src/hooks/useRecordBenchmark';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';

const GRADIENT = ['#fdc830', '#f37335'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.56 (норма AA 4.5), стало 5.71.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const CHOICE_BENEFITS = [
  { icon: 'flash-outline', textKey: 'benefitChoiceRt1' },
  { icon: 'locate-outline', textKey: 'benefitChoiceRt2' },
  { icon: 'hand-right-outline', textKey: 'benefitChoiceRt3' },
];

type Direction = 'left' | 'right' | 'up' | 'down';
const ARROW_ICON: Record<Direction, string> = {
  left: 'arrow-back', right: 'arrow-forward', up: 'arrow-up', down: 'arrow-down',
};

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

/**
 * 🔴 ПОЛ ОКНА ОТВЕТА — 1000 мс, И ЭТО НЕ КРУГЛОЕ ЧИСЛО «НА ГЛАЗОК».
 *
 * Закон Хика: RT = a + b·log₂(n). Наклон b в большинстве исследований лежит в
 * 150–200 мс/бит, простая реакция a ≈ 250 мс (обзор Proctor & Schneider 2018,
 * QJEP, «Hick's law for choice reaction time: A review»). При четырёх
 * альтернативах log₂4 = 2 бита, то есть предсказанное СРЕДНЕЕ — 550–650 мс. У
 * нас вдобавок сенсорный экран с экранными кнопками, где моторная часть длиннее
 * лабораторного нажатия клавиши.
 *
 * ⚠️ Было `Math.max(750, ...)`: L14 = 830 мс, L15 = 750 мс. Дедлайн такой
 * длины срезает правый хвост распределения — и срезает его при ЧЕТЫРЁХ
 * альтернативах сильнее, чем при двух, потому что там среднее выше. То есть он
 * уплощает сам наклон Хика, ради которого парадигма и существует: ручка
 * сложности уменьшает измеряемое. Ровно тот же класс дефекта, что доля
 * конфликтных у Струпа, Саймона, фланкера и ANT.
 *
 * ⚠️ Пол 900 мс, объявленный в `attention-conflict-ladders.test.ts`, сюда НЕ
 * переносится: он обоснован тем, что «ниже меряется не торможение, а моторный
 * предел», а торможения в этой пробе нет вовсе. Обоснование своё, число своё.
 *
 * ⚠️ Шаг НЕ подбирается вручную, а считается из пола: спуск от 2000 до
 * `CHOICE_RT_WINDOW_FLOOR_MS` ровно за пятнадцать уровней. Подобранный на глаз
 * шаг 71 давал на L15 окно 1006 — и проба «лестница сужается хотя бы вдвое»
 * покраснела на промахе в ШЕСТЬ миллисекунд. Считаемый шаг убирает и эту
 * ошибку, и вторую: поменяет кто-нибудь пол — спуск подстроится сам, а не
 * разойдётся с ним молча. При прежнем шаге 90 три последних уровня упирались бы
 * в пол и не отличались друг от друга по этой оси.
 */
export const CHOICE_RT_WINDOW_FLOOR_MS = 1000;
export const CHOICE_RT_WINDOW_START_MS = 2000;
/** Уровней в лестнице — столько же, сколько у остальных проб раздела. */
const УРОВНЕЙ = 15;

// Уровень 1..15: число вариантов выбора растёт (2 → 3 → 4 стрелки — по механике
// парадигмы: больше альтернатив = закон Хика, RT растёт), окно ответа сокращается,
// число проб растёт ступенями (12 → 16 → 20).
export function levelParams(level: number): { trials: number; dirs: Direction[]; windowMs: number } {
  const trials = level <= 5 ? 12 : level <= 10 ? 16 : 20;
  const dirs: Direction[] =
    level <= 5 ? ['left', 'right']
    : level <= 10 ? ['left', 'right', 'up']
    : ['left', 'right', 'up', 'down'];
  const шаг = (CHOICE_RT_WINDOW_START_MS - CHOICE_RT_WINDOW_FLOOR_MS) / (УРОВНЕЙ - 1);
  const windowMs = Math.max(CHOICE_RT_WINDOW_FLOOR_MS,
    Math.round(CHOICE_RT_WINDOW_START_MS - (level - 1) * шаг));   // 2000мс → 1000мс
  return { trials, dirs, windowMs };
}

export default function ChoiceRtGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  // 07.09.2026: ширину берём защищённым хуком — голый useWindowDimensions()
  // на первом кадре веб-сборки отдаёт 0, и ноль запекается в размеры.
  const screenW = useScreenWidth();
  const { height: screenH } = useWindowDimensions();
  const ОКНО = stimBox(screenW, screenH);
  /**
   * 🔴 ЧИСЛО КНОПОК ЗДЕСЬ — ОСЬ СЛОЖНОСТИ, А НЕ ОФОРМЛЕНИЕ. L1-5 две стороны,
   * L6-10 три, L11-15 четыре крестовиной (закон Хика: время выбора растёт с числом
   * альтернатив). Поэтому единая полоса ответа 120 px применяется ТОЛЬКО к варианту
   * с двумя кнопками — там проба совпадает с фланкером и Саймоном, и именно эта
   * четвёрка чаще всего идёт подряд в зарядке.
   * Крестовина остаётся выше полосы, и это осознанное исключение: разложить её в
   * один ряд значит потерять пространственное соответствие «вверх — это вверх»,
   * а в направленной пробе оно и меряется. Ужать до 120 нельзя — три ряда по 64
   * с зазорами дают 208.
   */
  const ДВЕ_СТОРОНЫ = answerButton('side', screenW);
  const router = useRouter();

  const { isPreset, autostart, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('choice_rt');
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const record = useRecordBenchmark('choice_rt');
  const [clearedPassed, setClearedPassed] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(12);
  const [stim, setStim] = useState<Direction>('left');
  const [showStim, setShowStim] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [activeDirs, setActiveDirs] = useState<Direction[]>(['left', 'right']);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);

  // Рефы — таймерная цепочка (пауза → стимул → дедлайн → следующая проба)
  // живёт вне ре-рендеров, state в её колбэках был бы устаревшим (паттерн simon/cpt).
  const levelRef = useRef(1);
  const dirsRef = useRef<Direction[]>(['left', 'right']);
  const windowMsRef = useRef(2000);
  const totalTrialsRef = useRef(12);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const stimRef = useRef<Direction>('left');
  const stimAtRef = useRef(0);
  const answeredRef = useRef(false);
  const startTimeRef = useRef(0);

  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [stimTimerRef, deadlineTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []);

  const newTrial = () => {
    setShowStim(false); setFeedback(null);
    const dirs = dirsRef.current;
    const next = dirs[Math.floor(Math.random() * dirs.length)];
    stimRef.current = next;
    stimTimerRef.current = setTimeout(() => {
      stimAtRef.current = gameNow();
      answeredRef.current = false;
      setStim(next);
      setShowStim(true);
      // Окно ответа уровня: не успел — ошибка-пропуск, проба закрывается сама
      deadlineTimerRef.current = setTimeout(() => {
        if (answeredRef.current) return;
        answeredRef.current = true;
        errorsRef.current += 1;
        setErrors(errorsRef.current);
        setFeedback('wrong');
        fbTimerRef.current = setTimeout(advance, 350);
      }, windowMsRef.current);
    }, 600 + Math.random() * 1200);
  };

  const advance = () => {
    if (roundRef.current >= totalTrialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    newTrial();
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    dirsRef.current = p.dirs;
    windowMsRef.current = p.windowMs;
    totalTrialsRef.current = p.trials;
    setActiveDirs(p.dirs);
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0; rtsRef.current = [];
    roundRef.current = 1;
    setHits(0); setErrors(0); setRts([]);
    setRound(1);
    setPhase('playing');
    startTimeRef.current = gameNow();
    newTrial();
  };

  const finish = async () => {
    clearAllTimers();
    const totalTime = (gameNow() - startTimeRef.current) / 1000;
    const finalRts = rtsRef.current;
    const meanRt = finalRts.length ? finalRts.reduce((a, b) => a + b, 0) / finalRts.length : 0;
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = totalTrialsRef.current > 0 ? h / totalTrialsRef.current : 0;
    // Проход уровня: ≥80% верных за раунд (пропуски по окну = ошибки)
    const passed = !isPreset && accuracy >= 0.8;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — статистика, уровень не трогаем
    } else if (passed && levelRef.current % BOSS_EVERY === 0) {
      // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
      setClearedPassed(true);
      setPhase('boss');
    } else {
      setClearedPassed(passed);
      setPhase('cleared');   // непрерывный поток: провал уровня → баннер «почти, ещё раз» + авто-рестарт
    }
    try {
      await saveSession({
        passed,
        game_type: 'choice_rt',
        score: Math.max(0, Math.round(h * 100 - e * 50 - meanRt * 0.1)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          hits: h,
          accuracy: Math.round(accuracy * 100),
          n_trials: totalTrialsRef.current,
          n_choices: dirsRef.current.length,
        },
      });
    } catch (err) { console.error(err); }
    // Рекорд — только партия первого уровня (12 проб, две стрелки) и только «12 из 12»:
    // число альтернатив это закон Хика, RT на двух и четырёх стрелках несравнимо, а в
    // среднее попадают ТОЛЬКО верные ответы — без гейта выгодно жать наугад и ронять
    // сомнительные пробы в тайм-аут (см. LEADERBOARD_GAMES.choice_rt).
    if (countsForRecord('choice_rt', { isPreset, level: levelRef.current, hits: h, trials: totalTrialsRef.current })) {
      // Рекорд-строка на итог + отправка — одним хуком (офлайн-фолбэк внутри).
      record.report(Math.round(meanRt));
    } else {
      record.reset();
    }
  };

  const handlePress = (chosen: Direction) => {
    if (!showStim || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = gameNow() - stimAtRef.current;
    const correct = chosen === stimRef.current;
    if (correct) {
      hapticSuccess();
      hitsRef.current += 1;
      rtsRef.current = [...rtsRef.current, rt];
      setHits(hitsRef.current);
      setRts(rtsRef.current);
    } else {
      hapticError();
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    setFeedback(correct ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(advance, 350);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="arrow-forward-circle" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('choiceRt')}</Text>
          <Text style={styles.configDesc}>{t('choiceRtDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="choiceRtIntroDesc" benefits={CHOICE_BENEFITS} accent={GRADIENT[0]} />

        <LevelProgressMap bestLevel={lvl.best} gameId="choice_rt" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <TouchableOpacity
          accessibilityRole="button" style={[styles.optionCard, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} onPress={() => setShowLeaderboard(true)}>
          <Ionicons name="trophy-outline" size={18} color={colors.text} />
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('leaderboardLevel1')}</Text>
        </TouchableOpacity>
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('choiceRtLvlParams').replace('{n}', String(p.trials)).replace('{d}', String(p.dirs.length)).replace('{w}', (p.windowMs / 1000).toFixed(1))}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {p.dirs.map(d => d === 'left' ? '←' : d === 'right' ? '→' : d === 'up' ? '↑' : '↓').join('  ')}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {t('passCorrect80Window')}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
      {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
      <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
      </>
    );
  };

  const padBtn = (d: Direction) => (
    <TouchableOpacity key={d} accessibilityRole="button"
      accessibilityLabel={t(`a11y${d.charAt(0).toUpperCase()}${d.slice(1)}`)}
      style={[styles.padBtn,
        // две стороны — общий размер раздела; крестовина остаётся своей (см. выше)
        activeDirs.length === 2 ? { width: ДВЕ_СТОРОНЫ.w, height: ДВЕ_СТОРОНЫ.h, borderRadius: ДВЕ_СТОРОНЫ.radius } : null,
        { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress(d)}>
      <Ionicons name={ARROW_ICON[d] as any} size={32} color={textOn(GRADIENT[0])} />
    </TouchableOpacity>
  );

  const renderPad = () => {
    if (activeDirs.length === 4) {
      return (
        <View style={styles.padGrid}>
          <View style={styles.padRow}>
            <View style={styles.padCell} />
            {padBtn('up')}
            <View style={styles.padCell} />
          </View>
          <View style={styles.padRow}>
            {padBtn('left')}
            <View style={styles.padCell} />
            {padBtn('right')}
          </View>
          <View style={styles.padRow}>
            <View style={styles.padCell} />
            {padBtn('down')}
            <View style={styles.padCell} />
          </View>
        </View>
      );
    }
    if (activeDirs.length === 3) {
      return (
        <View style={styles.padGrid}>
          <View style={styles.padRow}>{padBtn('up')}</View>
          <View style={styles.padRow}>
            {padBtn('left')}
            <View style={styles.padCell} />
            {padBtn('right')}
          </View>
        </View>
      );
    }
    return (
      <View style={styles.padRow}>
        {padBtn('left')}
        {padBtn('right')}
      </View>
    );
  };

  // playing-фаза — на едином каркасе GameShell (пад-кнопки направлений прибиты к низу)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('choiceRt')}
        onBack={() => { clearAllTimers(); goBackOrHome(); }}
        /** Счётчики данными: одинаковый вид во всех играх (см. `HudItem`). */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${totalTrials}`, pop: true },
          { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
          { key: 'rt', icon: 'flash', label: t('reaction'), value: `${meanRt}${t('msShort')}`, tone: 'accent' as const },
        ]}
        toolbar={<AnswerBar>{renderPad()}</AnswerBar>}
      >
        <View style={[styles.stimulusBox, { width: ОКНО.w, height: ОКНО.h }, {
          borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border,
          backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
        }]}>
          {showStim ? (
            <Ionicons name={ARROW_ICON[stim] as any} size={120} color={feedback === 'wrong' ? '#f43f5e' : GRADIENT[1]} />
          ) : (
            <Text style={[styles.waitText, { color: colors.textSecondary }]}>•</Text>
          )}
        </View>
        {/* Строка «что делать»: без неё правило видно только в справке, а
            в справку во время партии не ходят. */}
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('choiceRtHint')}</Text>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('choiceRt')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <GameSuiteSwitch />
      {phase === 'config' && renderConfig()}
      <LeaderboardModal
        visible={showLeaderboard} onClose={() => setShowLeaderboard(false)}
        gameId="choice_rt" language={language} colors={colors} gradient={GRADIENT}
        formatScore={(s) => `${Math.round(s)} ms`}
      />
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="choice_rt" level={levelRef.current} recordLine={record.benchmark ? recordLineFor('choice_rt', record.benchmark, t) : undefined} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed} gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          recordLine={record.benchmark ? recordLineFor('choice_rt', record.benchmark, t) : undefined}
          score={Math.max(0, Math.round(hits * 100 - errors * 50 - meanRt * 0.1))}
          time={meanRt / 1000} errors={errors}
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
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 15, fontWeight: '700' },
  // Размеры приходят из stimBox() — общая коробка раздела, одна на все десять.
  stimulusBox: { borderRadius: 24, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  waitText: { fontSize: 60, opacity: 0.5 },
  padGrid: { gap: 8, alignItems: 'center' },
  // RTL-пин: пад-кнопки ←/→ должны стоять на своих физических сторонах (глифы стрелок не зеркалятся)
  padRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', writingDirection: 'ltr' },
  padBtn: { width: 64, height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  padCell: { width: 64, height: 64 },
});
