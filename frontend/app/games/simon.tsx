/* psygames-game-simon · VER 2 · 23.08.2026 */
/**
 * Simon Task (v1.9.0 — 48-я игра, классика inhibitory control)
 *
 * v1.9.1: Скрыта из основного меню (hideFromMenu: true в games.ts).
 * Доступна через ⚡ Конфликт внимания → выбор режима "Цвет vs Позиция"
 * (рядом со Stroop, Stroop-Emotional, Flanker — 4 парадигмы interference
 * resolution под одной крышкой, чтобы не плодить дубли в каталоге).
 *
 * Парадигма: цветной квадрат появляется СЛЕВА или СПРАВА от центра экрана.
 * Правило: жми ЛЕВУЮ кнопку если СИНИЙ, ПРАВУЮ если КРАСНЫЙ (color-based).
 *
 * Congruent trial: позиция матчит правильный ответ (синий слева → жми левую) — легко
 * Incongruent trial: позиция НЕ матчит ответ (синий справа → жми левую) — медленнее
 *
 * Simon Effect = RT_incongruent - RT_congruent → измеряет силу автоматического
 * пространственного отвлечения. Меньше effect = лучше inhibitory control.
 *
 * Отличие от Flanker (фланкеры): Flanker = конфликт от соседних стрелок.
 * Отличие от Stroop: Stroop = семантический конфликт (значение vs цвет шрифта).
 * Simon = пространственный конфликт (позиция стимула vs нужная сторона ответа).
 *
 * Уровни (persist, по паттерну cpt): ручной селектор сложности заменён на
 * usePersistentLevel('simon') + levelParams. Ось усложнения — ТЕМП и ОБЪЁМ:
 *   - окно ответа сокращается 2600мс → 920мс (не успел = ошибка-пропуск)
 *   - пауза перед стимулом сжимается 500-1100мс → 250-450мс (темп подачи)
 *   - число проб растёт ступенями 16 → 20 → 24
 *   - доля конфликтных проб ФИКСИРОВАНА на 50% (VER 2): она задаёт величину
 *     самого Simon-эффекта, см. блок над INCONGRUENT_PROB
 * Проход уровня: ≥80% верных ответов за раунд → LevelCleared (авто-поток).
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import BossRound from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#1e3a8a', '#7f1d1d'];   // blue → red (отсылка к двум цветам стимула)
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 10.02 (норма AA 4.5), стало 7.77.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const COLOR_BLUE = '#3b82f6';
const COLOR_RED = '#ef4444';

const SI_BENEFITS = [
  { icon: 'flash-outline',            textKey: 'benefitSi1' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitSi2' },
  { icon: 'speedometer-outline',      textKey: 'benefitSi3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия: каждые BOSS_EVERY уровней непрерывного потока прошёл раунд → битва с боссом
// (резкая смена правила, тренировка переключения). Паттерн из schulte.tsx.
const BOSS_EVERY = 3;
type StimColor = 'blue' | 'red';
type Position = 'left' | 'right';
type TrialKind = 'congruent' | 'incongruent';

interface Trial {
  color: StimColor;
  position: Position;
  kind: TrialKind;
}

/** Правильная сторона ответа по цвету: blue→left, red→right */
const correctSide = (c: StimColor): Position => (c === 'blue' ? 'left' : 'right');

/**
 * ДОЛЯ КОНФЛИКТНЫХ ПРОБ — КОНСТАНТА ПАРАДИГМЫ, А НЕ РУЧКА СЛОЖНОСТИ.
 *
 * 🔴 БЫЛО: 35 % → 80 % с уровнем. Simon-эффект = RT_несовпадающих −
 * RT_совпадающих, то есть измеряемая величина держится на ОБЕИХ половинах:
 * задрав долю конфликтных до 80 %, из двадцати проб оставляем четыре
 * совпадающие — вычитаемое считается по четырём наблюдениям и становится шумом.
 * Хуже того, при 80 % конфликтных «несовпадение» перестаёт быть исключением:
 * пространственная привычка, которую эффект и меряет, просто не успевает
 * сложиться, и эффект уменьшается сам по себе. Ручка «сложнее» уменьшала ровно
 * то, ради чего игра существует.
 *
 * То же правило записано в `iowa.tsx`: методика осмысленна только потому, что
 * условие у всех одинаковое. Канон Simon — равные доли, 50/50; вес сложности
 * перенесён на окно ответа, темп подачи и число проб (`levelParams` ниже).
 * Сторожит `conflict-ratio-is-not-difficulty.test.ts`.
 */
export const INCONGRUENT_PROB = 0.5;

// Уровень 1..15: окно ответа сокращается, темп подачи растёт (пауза перед
// стимулом сжимается), число проб растёт ступенями (16 → 20 → 24).
export function levelParams(level: number): { trials: number; windowMs: number; preMinMs: number; preJitterMs: number } {
  const trials = level <= 5 ? 16 : level <= 10 ? 20 : 24;
  const windowMs = Math.max(900, 2600 - (level - 1) * 120);    // 2600мс → 920мс
  const preMinMs = Math.max(250, 500 - (level - 1) * 18);      // пауза до стимула 500 → 250мс
  const preJitterMs = Math.max(200, 600 - (level - 1) * 29);   // дрожание паузы 600 → 200мс
  return { trials, windowMs, preMinMs, preJitterMs };
}

/**
 * Проба уровня. Уровень стоит в подписи НАМЕРЕННО, хотя доля конфликтных от него
 * не зависит: гейт спрашивает игру по уровням и считает долю совпадающих проб по
 * реально сгенерированным пробам, а не по строчке в исходнике.
 */
export function makeTrial(level: number): Trial {
  const color: StimColor = Math.random() < 0.5 ? 'blue' : 'red';
  const isIncongruent = Math.random() < INCONGRUENT_PROB;
  const correct = correctSide(color);
  const position: Position = isIncongruent
    ? (correct === 'left' ? 'right' : 'left')
    : correct;
  return { color, position, kind: isIncongruent ? 'incongruent' : 'congruent' };
}

export default function SimonGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, autostart, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('simon');
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [clearedPassed, setClearedPassed] = useState(true);

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(16);
  const [trial, setTrial] = useState<Trial>({ color: 'blue', position: 'left', kind: 'congruent' });
  const [showStim, setShowStim] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByKind, setRtsByKind] = useState<Record<TrialKind, number[]>>({ congruent: [], incongruent: [] });

  // Рефы — таймерная цепочка (стимул → дедлайн → следующая проба) живёт вне
  // ре-рендеров, state в её колбэках был бы устаревшим (паттерн cpt/quick-count).
  const levelRef = useRef(1);
  const windowMsRef = useRef(2600);
  const preMinRef = useRef(500);
  const preJitterRef = useRef(600);
  const totalTrialsRef = useRef(16);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<Record<TrialKind, number[]>>({ congruent: [], incongruent: [] });
  const trialRef = useRef<Trial>({ color: 'blue', position: 'left', kind: 'congruent' });
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
    const tr = makeTrial(levelRef.current);
    trialRef.current = tr;
    setTrial(tr);
    stimTimerRef.current = setTimeout(() => {
      stimAtRef.current = gameNow();
      answeredRef.current = false;
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
    }, preMinRef.current + Math.random() * preJitterRef.current);
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
    windowMsRef.current = p.windowMs;
    preMinRef.current = p.preMinMs;
    preJitterRef.current = p.preJitterMs;
    totalTrialsRef.current = p.trials;
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0;
    rtsRef.current = { congruent: [], incongruent: [] };
    roundRef.current = 1;
    setHits(0); setErrors(0);
    setRtsByKind({ congruent: [], incongruent: [] });
    setRound(1);
    setPhase('playing');
    startTimeRef.current = gameNow();
    newTrial();
  };

  const finish = async () => {
    clearAllTimers();
    const totalTime = (gameNow() - startTimeRef.current) / 1000;
    const rts = rtsRef.current;
    const flatten = [...rts.congruent, ...rts.incongruent];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    const congMean = rts.congruent.length ? rts.congruent.reduce((a, b) => a + b, 0) / rts.congruent.length : 0;
    const incongMean = rts.incongruent.length ? rts.incongruent.reduce((a, b) => a + b, 0) / rts.incongruent.length : 0;
    const simonEffect = Math.round(incongMean - congMean);   // Чем меньше — тем лучше inhibition
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = totalTrialsRef.current > 0 ? h / totalTrialsRef.current : 0;
    // Проход уровня: ≥80% верных за раунд (пропуски по окну = ошибки)
    const passed = accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — уровень не трогаем, экран статистики
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      // Непрерывный поток: и проход, и провал → баннер уровня (при провале «почти, ещё раз» + авто-рестарт того же уровня)
      setClearedPassed(passed);
      // Веха: чистый проход кратного BOSS_EVERY уровня → битва с боссом перед баннером.
      // Провал по-прежнему сразу → cleared passed={false} (поток не рвётся).
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        setPhase('boss');
      } else {
        setPhase('cleared');
      }
    }
    try {
      await saveSession({
        passed,
        game_type: 'simon',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05 - Math.max(0, simonEffect) * 0.3)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          simon_effect_ms: simonEffect,
          accuracy: Math.round(accuracy * 100),
          n_trials: totalTrialsRef.current,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (chosen: Position) => {
    if (!showStim || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = gameNow() - stimAtRef.current;
    const tr = trialRef.current;
    const ok = chosen === correctSide(tr.color);
    if (ok) {
      hapticSuccess();
      hitsRef.current += 1;
      setHits(hitsRef.current);
      rtsRef.current[tr.kind].push(rt);
      setRtsByKind({ congruent: [...rtsRef.current.congruent], incongruent: [...rtsRef.current.incongruent] });
    } else {
      hapticError();
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(advance, 350);
  };

  const meanRtAll = (() => {
    const all = [...rtsByKind.congruent, ...rtsByKind.incongruent];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="flash" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('simon')}</Text>
          <Text style={styles.configDesc}>{t('simonDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="simonIntroDesc" benefits={SI_BENEFITS} accent={GRADIENT[0]} />

        {/* Правила игры — статический rule reminder */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text, marginBottom: 8 }]}>{t('simonRule')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: COLOR_BLUE }} />
              <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontWeight: '700' }}>{t('simonLeftBtn')}</Text>
            </View>
            <Text style={{ color: colors.textSecondary }}>·</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: COLOR_RED }} />
              <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontWeight: '700' }}>{t('simonRightBtn')}</Text>
            </View>
          </View>
        </View>

        <LevelProgressMap bestLevel={lvl.best} gameId="simon" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('simonLvlParams').replace('{n}', String(p.trials)).replace('{p}', String(Math.round(INCONGRUENT_PROB * 100))).replace('{w}', (p.windowMs / 1000).toFixed(1))}
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

  // playing-фаза — на едином каркасе GameShell (кнопки-ответы прибиты к низу)
  if (phase === 'playing') {
    const fbColor =
      feedback === 'right' ? '#22c55e' :
      feedback === 'wrong' ? '#f43f5e' :
      colors.text;
    const stimColor = trial.color === 'blue' ? COLOR_BLUE : COLOR_RED;
    return (
      <GameShell
        title={t('simon')}
        onBack={() => { clearAllTimers(); goBackOrHome(); }}
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
          { key: 'reaction', icon: 'flash', label: t('reaction'), value: `${meanRtAll}${t('msShort')}`, tone: 'accent' as const },
        ]}
        toolbar={
          /* RTL-пин: стимул позиционируется физическими left/right (не зеркалится), значит и кнопка ←
             обязана остаться физически слева — иначе конгруэнтность проб Саймона инвертируется */
          <View style={styles.toolbarLtr}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yLeft')} style={[styles.choiceBtn, { backgroundColor: COLOR_BLUE }]} onPress={() => handleAnswer('left')}>
              <Ionicons name="arrow-back" size={32} color={textOn(COLOR_BLUE)} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yRight')} style={[styles.choiceBtn, { backgroundColor: COLOR_RED }]} onPress={() => handleAnswer('right')}>
              <Ionicons name="arrow-forward" size={32} color={textOn(COLOR_RED)} />
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.fieldCol}>
          {/* Stim area — широкая, квадрат появляется слева или справа от центра */}
          <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback ? fbColor : colors.border, borderWidth: feedback ? 3 : 1 }]}>
            {/* Центральный фиксационный крестик */}
            <Text style={{ position: 'absolute', fontSize: 24, color: colors.textSecondary, opacity: 0.4 }}>+</Text>
            {showStim && (
              <View style={{
                position: 'absolute',
                left: trial.position === 'left' ? 30 : undefined,
                right: trial.position === 'right' ? 30 : undefined,
                width: 64, height: 64, borderRadius: 10,
                backgroundColor: stimColor,
                shadowColor: stimColor, shadowOpacity: 0.6, shadowRadius: 14,
              }} />
            )}
          </View>
          {/* Подсказка правила (для конфига и для playing) */}
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', maxWidth: 320 }}>
            {t('hint_simon_color_rule')}
          </Text>
        </View>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('simon')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <GameSuiteSwitch />
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="simon" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 80 - errors * 60 - meanRtAll * 0.05))}
          time={meanRtAll / 1000} errors={errors}
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
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 18 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  stimBox: {
    width: 360, maxWidth: '100%', height: 140, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  choiceBtn: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
  // RTL-пин: раскладка кнопок лево/право не зеркалится в ar (web: writingDirection → CSS direction)
  toolbarLtr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', writingDirection: 'ltr', maxWidth: '100%' },
});
