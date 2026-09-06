/* psygames-game-number-bonds · VER 2 · 06.09.2026 */
/**
 * Number Bonds — собери цель из слагаемых (разложение числа, ментальная арифметика).
 *
 * Уровни (persist, по паттерну cpt/simon): лестница живёт в ОТДЕЛЬНОМ модуле
 * src/games/counting/numberBondsLadder.ts — его же читает замер counting-chat/sim-ladder.mjs
 * (один источник правды). VER 2 (решения Дениса R1–R3 от 06.09.2026, реф counting-chat):
 *   - детский вход L1–L3: пары «состав до 10 → до 20», БЕЗ таймера
 *     (на старой лестнице целей ≤10 было 17,1% — школьного входа не было);
 *   - доля длинных решений растёт весами (sizeWeights), рубильника solMin 2→3 нет
 *     (он давал обрыв трудности ×3,6); гейт: скачок работы соседних уровней ≤×1,5;
 *   - окно на задачу = 2,5×прогноза времени (потолок 300 с — страховка, не стена);
 *     старое окно 45→15с с уровня 5 было МЕНЬШЕ потребного времени — уровни не проходились;
 *   - прогресс старой лестницы мигрирует по равной работе (migrateOldLevel, флаг в AsyncStorage).
 * Проход уровня: ≤2 ошибок за раунд → LevelCleared (авто-поток).
 * Пресеты (зарядка, wu=1): прежнее поведение — diff/trials из params, без окна, reach/fail не трогаем.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
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
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/src/contexts/ProfileContext';
import {
  levelParams, makePuzzle, migrateOldLevel, NB_MAX_LEVEL,
  type BondsCfg, type BondsPuzzle,
} from '@/src/games/counting/numberBondsLadder';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#36d1dc', '#5b86e5'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.86 (норма AA 4.5), стало 4.81.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const NB_BENEFITS = [
  { icon: 'calculator-outline', textKey: 'benefitNumberBonds1' },
  { icon: 'shuffle-outline', textKey: 'benefitNumberBonds2' },
  { icon: 'git-merge-outline', textKey: 'benefitNumberBonds3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

type Puzzle = BondsPuzzle;

// Пресеты зарядки (wu=1): прежние diff-конфиги, выраженные весами размеров
// (uniform по старым solMin..solMax — поведение то же, генератор общий из модуля).
const DIFF_CFG: Record<Difficulty, Omit<BondsCfg, 'trials' | 'windowMs'>> = {
  easy:   { pool: 8,  maxV: 12, sizeWeights: { 2: 0.5, 3: 0.5 } },
  medium: { pool: 9,  maxV: 18, sizeWeights: { 3: 0.5, 4: 0.5 } },
  hard:   { pool: 12, maxV: 25, sizeWeights: { 3: 1 / 3, 4: 1 / 3, 5: 1 / 3 } },
};

export default function NumberBondsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('number_bonds');
  const { profile } = useProfile();
  /**
   * МИГРАЦИЯ ЛЕСТНИЦЫ v1→v2 (06.09.2026): сохранённый уровень старой шкалы 1..15
   * означает ДРУГУЮ трудность в новой шкале 1..20 — пересчитываем однократно по
   * равной работе (migrateOldLevel), флаг per-profile, как и сам уровень.
   * Новичок (best=1) флаг получает сразу и начинает с детского L1.
   */
  const [migrated, setMigrated] = useState(false);
  useEffect(() => {
    if (!lvl.loaded) return;
    let cancelled = false;
    const pid = (profile as any)?.id ?? 'default';
    const flagKey = `psygames_number_bonds_ladderv2_${pid}`;
    AsyncStorage.getItem(flagKey).then((v) => {
      if (cancelled) return;
      if (v !== '2') {
        if (lvl.best > 1) lvl.setLevel(migrateOldLevel(lvl.best));
        AsyncStorage.setItem(flagKey, '2').catch(() => {});
      }
      setMigrated(true);
    }).catch(() => { if (!cancelled) setMigrated(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- одноразовый пересчёт на профиль
  }, [lvl.loaded, (profile as any)?.id]);
  // ⚠️ Ждём загрузки уровня И миграции. Без первого автостарт («Вызов дня», онбординг)
  // играл ПЕРВЫЙ уровень человеку с двенадцатым; без второй — старый номер в новой шкале.
  useAutostartWhenReady(() => autostart && lvl.loaded && migrated, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  // Пресет-параметры (только wu=1): вне пресета сложность идёт от уровня
  const [difficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [presetTrials] = useState(() => num('trials', 8));

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(8);
  const [puzzle, setPuzzle] = useState<Puzzle>({ target: 0, chips: [] });
  const [picked, setPicked] = useState<number[]>([]); // chip indices
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [roundLeft, setRoundLeft] = useState(0);   // остаток окна текущей задачи (сек), только уровневый режим
  const [hasWindow, setHasWindow] = useState(false); // у детских уровней L1–L3 окна нет вовсе
  const [clearedPassed, setClearedPassed] = useState(true);   // прошёл ли уровень (для баннера LevelCleared)

  // Рефы — счётчики/параметры раунда живут вне ре-рендеров: таймерная цепочка
  // (окно задачи → фидбек → следующая задача) в колбэках видела бы устаревший state
  // (паттерн cpt/simon).
  const levelRef = useRef(1);
  const cfgRef = useRef<BondsCfg>({ ...DIFF_CFG.medium, trials: 8, windowMs: 0 });
  const windowMsRef = useRef(0);          // 0 = без окна (пресет)
  const trialsRef = useRef(8);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const solvedRef = useRef(false);        // задача закрыта (решена или просрочена)
  const startTimeRef = useRef(0);
  const roundStartAtRef = useRef(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    [deadlineTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const newRound = () => {
    setPuzzle(makePuzzle(cfgRef.current));
    setPicked([]);
    setFeedback(null);
    solvedRef.current = false;
    roundStartAtRef.current = gameNow();
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (windowMsRef.current > 0) {
      setRoundLeft(windowMsRef.current / 1000);
      // Окно уровня: не уложился — ошибка, задача пропускается (иначе можно застрять навсегда)
      deadlineTimerRef.current = setTimeout(() => {
        if (solvedRef.current) return;
        solvedRef.current = true;
        if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
        errorsRef.current += 1;
        setErrors(errorsRef.current);
        setFeedback('wrong');
        fbTimerRef.current = setTimeout(advance, 600);
      }, windowMsRef.current);
    }
  };

  const advance = () => {
    if (roundRef.current >= trialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    newRound();
  };

  const startGame = () => {
    clearAllTimers();
    if (isPreset) {
      // пресет зарядки: прежнее поведение (diff/trials из params, без окна времени)
      cfgRef.current = { ...DIFF_CFG[difficulty], trials: presetTrials, windowMs: 0 };
      windowMsRef.current = 0;
      trialsRef.current = presetTrials;
      levelRef.current = 0;
    } else {
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      cfgRef.current = p;
      windowMsRef.current = p.windowMs;   // 0 на детских уровнях — таймера нет
      trialsRef.current = p.trials;
    }
    setHasWindow(windowMsRef.current > 0);
    setTotalTrials(trialsRef.current);
    hitsRef.current = 0; errorsRef.current = 0; roundRef.current = 1;
    setHits(0); setErrors(0); setRound(1);
    setElapsedTime(0);
    setPhase('playing');
    startTimeRef.current = gameNow();
    timerRef.current = setInterval(() => {
      const now = gameNow();
      setElapsedTime((now - startTimeRef.current) / 1000);
      if (windowMsRef.current > 0) {
        setRoundLeft(Math.max(0, (windowMsRef.current - (now - roundStartAtRef.current)) / 1000));
      }
    }, 100);
    newRound();
  };

  const finish = async () => {
    clearAllTimers();
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = (h + e) > 0 ? h / (h + e) : 0;
    // Проход уровня: ≤2 ошибок за раунд (неверная сумма и просрочка окна = ошибка)
    const passed = !isPreset && e <= 2;
    if (isPreset) {
      setPhase('result');                       // пресет/свободный режим: экран статистики
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
        setClearedPassed(true);
        setPhase('boss');
      } else {
        setClearedPassed(passed);
        setPhase('cleared');                     // непрерывный поток: провал → «почти, ещё раз» + авто-рестарт того же уровня
      }
    }
    try {
      await saveSession({
        passed,
        game_type: 'number_bonds',
        score: Math.max(0, h * 100 - e * 25 - Math.floor(finalTime)),
        time_seconds: finalTime,
        difficulty: isPreset ? difficulty : (levelRef.current <= 8 ? 'easy' : levelRef.current <= 15 ? 'medium' : 'hard'),
        mode: isPreset ? `${trialsRef.current}t` : `lvl${levelRef.current}`,
        errors: e,
        details: {
          hits: h,
          errors: e,
          trials: trialsRef.current,
          level: levelRef.current,
          accuracy: Math.round(accuracy * 100),
        },
      });
    } catch (err) { console.error(err); }
  };

  /** Свежая `validate` для авто-приёма: эффект не должен ловить старое замыкание. */
  const validateRef = useRef<() => void>(() => {});

  const togglePick = (idx: number) => {
    if (feedback !== null || solvedRef.current) return;
    setPicked((p) => p.includes(idx) ? p.filter((i) => i !== idx) : [...p, idx]);
  };

  const sumPicked = picked.reduce((s, i) => s + (puzzle.chips[i] ?? 0), 0);

  /**
   * 🔴 ВЕРНЫЙ ОТВЕТ ПРИНИМАЕТСЯ САМ. Игра ждала нажатия «Проверить» даже тогда,
   * когда ответ уже СОБРАН и однозначен: сумма выбранных фишек равна цели, спорить
   * не о чем. Человек складывает 10 и 5, видит зелёную пятнадцать — и всё равно
   * должен тянуться к кнопке. Лишний шаг между «решил» и «засчитано» читается как
   * «игра не заметила», а на замерном упражнении ещё и съедает время в секундомер.
   *
   * ⚠️ ПРИНИМАЕМ ТОЛЬКО ВЕРНОЕ. Автоматически отвергать неверную сумму нельзя:
   * человек мог не закончить набор, и мгновенная ошибка отняла бы у него право
   * доложить фишку. Поэтому кнопка остаётся — она для «я закончил, проверь», а не
   * для «подтверди очевидное».
   */
  React.useEffect(() => {
    if (phase !== 'playing' || feedback !== null || solvedRef.current) return;
    if (picked.length >= 2 && sumPicked === puzzle.target) validateRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, sumPicked, puzzle.target, phase, feedback]);

  const validate = () => {
    if (feedback !== null || solvedRef.current) return;
    if (picked.length < 2) {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFeedback('wrong');
      hapticError();
      fbTimerRef.current = setTimeout(() => setFeedback(null), 600);
      return;
    }
    const correct = sumPicked === puzzle.target;
    if (correct) {
      solvedRef.current = true;
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
      hitsRef.current += 1;
      setHits(hitsRef.current);
      setFeedback('right');
      hapticSuccess();
      fbTimerRef.current = setTimeout(advance, 700);
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFeedback('wrong');
      hapticError();
      // неверная сумма: та же задача, сброс выбора (окно продолжает тикать)
      fbTimerRef.current = setTimeout(() => { setPicked([]); setFeedback(null); }, 700);
    }
  };

  validateRef.current = validate;

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const sizes = Object.keys(p.sizeWeights).map(Number);
    const solMin = Math.min(...sizes);
    const solMax = Math.max(...sizes);
    return (
      <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="git-merge" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('numberBonds')}</Text>
          <Text style={styles.configDesc}>{t('numberBondsDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="numberBondsIntroDesc" benefits={NB_BENEFITS} accent={GRADIENT[0]} />

        <LevelProgressMap bestLevel={lvl.best} gameId="number_bonds" currentLevel={lvl.level} maxLevel={NB_MAX_LEVEL} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {/* Детские уровни без таймера: окно «∞» читается на всех 12 языках без правки словаря.
                «2–2» схлопывается в «2» ПОСЛЕ подстановки — сам ключ словаря не трогаем. */}
            {t('numberBondsLvlParams').replace('{n}', String(p.trials)).replace('{m}', String(p.maxV)).replace('{c}', String(p.pool)).replace('{a}', String(solMin)).replace('{b}', String(solMax)).replace('{w}', p.windowMs > 0 ? String(Math.round(p.windowMs / 1000)) : '∞').replace(/(\d+)[–-]\1/, '$1')}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {t('numberBondsPass')}
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

  // playing-фаза — на едином каркасе GameShell (кнопки Сброс/Проверить прибиты к низу)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('numberBonds')}
        onBack={() => { clearAllTimers(); goBackOrHome(); }}
        /** Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4). */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${totalTrials}`, pop: true },
          { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
          ...(!isPreset && hasWindow ? [{ key: 'left', icon: 'time' as const, label: t('timeLeftLabel'), value: `${Math.ceil(roundLeft)}${t('secShort')}`, tone: roundLeft <= 5 ? 'warn' as const : 'neutral' as const }] : []),
        ]}
        stats={
          <View style={styles.statsRow}>
            {null}
          </View>
        }
        toolbar={
          <View style={styles.actionsRow}>
            <TouchableOpacity
              accessibilityRole="button" style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => setPicked([])}>
              <Text style={[styles.actionTxt, { color: colors.text }]}>{t('clear')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" style={styles.actionBtnPrimary} onPress={validate}>
              <LinearGradient colors={GRADIENT as [string, string]} style={styles.actionGrad}>
                <Text style={styles.actionTxt}>{t('check')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('numberBondsHint')}</Text>
          <View style={[styles.targetBox, {
            borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : GRADIENT[1],
            backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
          }]}>
            <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>Σ =</Text>
            <Text style={[styles.targetVal, { color: GRADIENT[1] }]}>{puzzle.target}</Text>
            <Text style={[styles.runningSum, { color: sumPicked === puzzle.target ? '#22c55e' : colors.text }]}>
              {sumPicked}
            </Text>
          </View>
          <View style={styles.chipsArea}>
            {puzzle.chips.map((v, i) => {
              const sel = picked.includes(i);
              return (
                <TouchableOpacity
                  accessibilityRole="button" key={i}
                  onPress={() => togglePick(i)}
                  disabled={feedback !== null}
                  style={[styles.chip, {
                    backgroundColor: sel ? GRADIENT[1] : colors.surface,
                    borderColor: sel ? GRADIENT[0] : colors.border,
                  }]}
                >
                  <Text style={[styles.chipText, { color: sel ? '#FFF' : colors.text }]}>{v}</Text>
                </TouchableOpacity>
              );
            })}
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
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('numberBonds')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="number_bonds" level={levelRef.current}
          passed={clearedPassed}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 25 - Math.floor(elapsedTime))}
          time={elapsedTime} errors={errors}
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
  fieldCol: { alignItems: 'center', gap: 16 },
  statsRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  // RTL-пин: ряд «Σ = цель · набранная сумма» читается в одном порядке во всех локалях
  targetBox: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16, borderWidth: 2, writingDirection: 'ltr' },
  targetLabel: { fontSize: 16, fontWeight: '600' },
  targetVal: { fontSize: 36, fontWeight: '900' },
  runningSum: { fontSize: 18, fontWeight: '700', marginLeft: 8 },
  chipsArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 420, width: '100%' },
  chip: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  chipText: { fontSize: 20, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 22, borderRadius: 16 },
  actionBtnPrimary: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden' },
  actionGrad: { paddingVertical: 12, paddingHorizontal: 22 },
  actionTxt: { color: ON_GRAD.color, fontSize: 15, fontWeight: '700' },
});
