/* psygames-game-spatial-span · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { FlashCell } from '@/src/components/juice';
import { sndWrong, sndMatch } from '@/src/services/feedback';
import { type PetMood } from '@/src/components/pet/GamePet';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { getPersonalBest, bumpPersonalBest } from '@/src/services/streak';
import { levelOutcome } from '@/src/services/levelOutcome';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getAbilityCount, useAbility } from '@/src/services/abilities';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
export const SS_RULES: LevelRule[] = [
  { key: 'grid5', fromLevel: 11 },   // lr_spatial_span_grid5_*
];

const GRADIENT = ['#1A2980', '#26D0CE'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.91 (норма AA 4.5), стало 4.54.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #a8eceb @0.4 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const SS_BENEFITS = [
  { icon: 'apps-outline',         textKey: 'benefitSs1' },
  { icon: 'arrow-undo-outline',   textKey: 'benefitSs2' },
  { icon: 'eye-outline',          textKey: 'benefitSs3' },
];

// CANTAB-style Spatial Span: 4×4 grid (or n×n), squares flash one by one,
// subject must reproduce in REVERSE order. Length grows; 2 fails at same length = stop.

type GamePhase = 'intro' | 'config' | 'show' | 'recall' | 'cleared' | 'result';

// Уровень (1..15+): L1-6 span 2→7 · L7-10 показ быстрее · L11+ сетка 5×5 (span дальше). Реверс — всегда (CANTAB backward).
/** Экспортирован для гейта `level-rule-threshold`: порог правила сверяется ИСПОЛНЕНИЕМ этой функции. */
export function levelParams(level: number): { startSpan: number; gridSize: number; tickMs: number; flashMs: number } {
  const startSpan = Math.min(7, 1 + level);
  const fast = Math.max(0, level - 6);
  const gridSize = level >= 11 ? 5 : 4;
  const tickMs = Math.max(450, 750 - fast * 40);
  const flashMs = Math.max(250, 450 - fast * 25);
  return { startSpan, gridSize, tickMs, flashMs };
}

export default function SpatialSpanGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel('spatial_span');
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
   // персист-уровень (как у судоку)
  const router = useRouter();
  // v1.29.1 (мобайл): фикс 320px делал сетку узкой по центру — теперь full-width,
  // высотный лимит держит ландшафт/десктоп, 520 — потолок больших окон
  const { width, height } = useWindowDimensions();
  const gridW = Math.min(width - 32, height - 300, 520);

  const { isPreset, autostart, isCalm } = useGamePreset();   // зарядка передаёт ?wu=1 → intro/config пропускаем
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [gridSize, setGridSize] = useState(4); // 4x4 (16 cells, classic CANTAB)
  // Справка правил уровня. enabled на recall: во время show модалка закрыла бы последовательность.
  /**
   * 🔴 ПРАВИЛА ПОКАЗЫВАЮТСЯ ДО КРУГА, А НЕ В МИГ ВСПОМИНАНИЯ.
   *
   * 📍 ОТЧЁТ ВАЛИ 06.09.2026, дословно: «вначале вылезла сетка с теми
   * квадратами, которые нужно запомнить, и пока я их запоминала, сетка
   * исчезла, а вместо пустых квадратов появилась расшифровка… естественно, я
   * забыла всю сетку. Как можно вначале показать сетку, дать время на
   * запоминание, а потом окно с правилами?»
   *
   * Она права по механике, и это не мелочь: карточка правил в фазе
   * вспоминания СТИРАЕТ то, что человек держит в рабочей памяти, — ровно то,
   * что упражнение и меряет. Замер 06.09.2026: так было в ДЕВЯТИ играх на
   * память сразу (`recall`, `input`, `eq`, `memorize`).
   *
   * Правильный момент — экран настройки: правило прочитано ДО старта, а круг
   * идёт без единой помехи.
   */
  const levelRules = useLevelRules('spatial_span', lvl.level, SS_RULES, phase === 'config');

  const [seq, setSeq] = useState<number[]>([]);
  const [showIdx, setShowIdx] = useState(-1);
  const [userSeq, setUserSeq] = useState<number[]>([]);
  /** Настроение питомца в шапке — реакция на ход (§30.6 карты геймификации). */
  const [petMood, setPetMood] = useState<PetMood>('idle');
  const petSay = (m: PetMood) => { setPetMood(m); setTimeout(() => setPetMood('idle'), 40); };
  const [span, setSpan] = useState(0);
  /**
   * Личный рекорд размаха — самореферентная цель. При подстройке сложности
   * абсолютный счёт мало что значит (это про выданную ступень), а «дошёл дальше,
   * чем в прошлый раз» осмысленно на любой ступени (см. `services/streak`).
   */
  const [bestSpan, setBestSpan] = useState<number | null>(null);
  useEffect(() => { getPersonalBest('spatial_span', 'span').then(setBestSpan).catch(() => {}); }, []);
  const [errorsAtLen, setErrorsAtLen] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelRef = useRef(1);
  const tickMsRef = useRef(750);
  const flashMsRef = useRef(450);
  const gridSizeRef = useRef(4);

  useEffect(() => () => {
    [tickerRef, timerRef, fbTimerRef].forEach(r => { if (r.current) { clearInterval(r.current as any); clearTimeout(r.current as any); } });
  }, []);

  const cellCount = gridSize * gridSize;

  function shuffleN(n: number, k: number): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, k);
  }

  const showSequence = (len: number) => {
    setUserSeq([]);
    setFeedback(null);
    const cc = gridSizeRef.current * gridSizeRef.current;
    const next = shuffleN(cc, len);
    setSeq(next);
    setPhase('show');
    setShowIdx(-1);
    let i = 0;
    tickerRef.current = setInterval(() => {
      if (i < next.length) {
        setShowIdx(next[i]);
        setTimeout(() => setShowIdx(-1), flashMsRef.current);
        i++;
      } else {
        if (tickerRef.current) clearInterval(tickerRef.current);
        setPhase('recall');
      }
    }, tickMsRef.current);
  };

  const startGame = () => {
    // Решение «этот заход не в зачёт» фиксируется ЗДЕСЬ, до первого стимула.
    // В шаге зарядки пробный заход бессмыслен: он и так не двигает уровень.
    practiceRef.current = !isPreset && practiceArmed && practiceLeft > 0;
    setPracticeUsed(false);
    // уровень рулит: стартовый span → скорость показа → размер сетки
    const effLevel = lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    tickMsRef.current = p.tickMs;
    flashMsRef.current = p.flashMs;
    gridSizeRef.current = p.gridSize;
    setGridSize(p.gridSize);
    setSpan(0); setErrorsAtLen(0); setTotalErrors(0);
    setUserSeq([]);
    setPhase('show');
    const start = gameNow();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    showSequence(p.startSpan);
  };
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  const finish = async (finalSpan: number, finalErrors: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    /**
     * ⚠️ ШАГ ЗАРЯДКИ УРОВЕНЬ НЕ ТРОГАЕТ — ни вверх, ни вниз. Так уже сделано у
     * обоих близнецов (корси и ряд цифр), здесь `!isPreset` был потерян: партия
     * из плейлиста двигала персональный уровень, то есть он менялся не от
     * результата человека, а от того, попалась ли ему эта игра в наборе.
     * Понижение — половина беды похуже: три коротких шага зарядки подряд
     * роняли ступень, которую человек честно взял на тропинке.
     *
     * Фаза идёт в комплекте: с выключенным `passed` баннер уровня сказал бы
     * «почти, ещё раз» там, где человек ничего не провалил. В пресете —
     * экран итога, как у близнецов; на следующий шаг зарядка уводит сама
     * (таймер в WarmupContext после записи сессии).
     */
    // ⚠️ ПРОБНЫЙ ЗАХОД РАЗБИРАЕТСЯ ПЕРВЫМ: партия вне зачёта не двигает лестницу
    // ни вверх, ни вниз и не оставляет записи нигде (сессия, очки, звёзды).
    const practice = await settlePracticeRun();
    if (practice) {
      setPhase('result');   // уровень не двигался — баннеру уровня сказать нечего
      return;
    }
    const out = levelOutcome({ isPreset, cleared: finalSpan >= levelParams(levelRef.current).startSpan });
    const passed = out.passed;
    if (out.raiseLevel) lvl.reach(levelRef.current + 1);   // прошёл стартовый span уровня → +уровень
    if (out.lowerLevel) lvl.fail();   // не прошёл → гистерезис понижения (3 провала подряд → level-1)
    setClearedPassed(passed);
    setPhase(out.phase);   // личная партия — баннер (passed рулит текстом), шаг зарядки — итог
    try {
      await saveSession({
        passed,
        game_type: 'spatial_span',
        score: Math.max(0, finalSpan * 250 - finalErrors * 50),
        time_seconds: finalTime,
        difficulty: 'medium',
        mode: `${gridSize}x${gridSize}-backward`,
        errors: finalErrors,
        details: { level: levelRef.current, span: finalSpan, grid: gridSize },
      });
    } catch (e) { console.error(e); }
  };

  const handleTap = (i: number) => {
    if (phase !== 'recall' || feedback !== null) return;
    const expected = [...seq].reverse();
    const next = [...userSeq, i];
    setUserSeq(next);
    if (next[next.length - 1] !== expected[next.length - 1]) {
      setFeedback('wrong');
      petSay('bad'); sndWrong();
      const ne = errorsAtLen + 1;
      const te = totalErrors + 1;
      setErrorsAtLen(ne); setTotalErrors(te);
      fbTimerRef.current = setTimeout(() => {
        if (ne >= 2) finish(span, te);
        else showSequence(seq.length);
      }, 700);
      return;
    }
    if (next.length === expected.length) {
      setFeedback('right');
      petSay('win'); sndMatch();
      const newSpan = Math.max(span, seq.length);
      setSpan(newSpan);
      // Рекорд обновляем по ходу: «дошёл дальше, чем когда-либо» должно быть
      // видно в тот момент, когда это случилось, а не на экране итога.
      bumpPersonalBest('spatial_span', 'span', newSpan).then((ok) => { if (ok) setBestSpan(newSpan); }).catch(() => {});
      setErrorsAtLen(0);
      fbTimerRef.current = setTimeout(() => {
        if (seq.length >= cellCount) finish(newSpan, totalErrors);
        else showSequence(seq.length + 1);
      }, 600);
    }
  };

  const cellSize = (gridW - (gridSize - 1) * 6) / gridSize;

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="apps" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('spatialSpan')}</Text>
        <Text style={styles.configDesc}>{t('spatialSpanDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="spatialSpanIntroDesc" benefits={SS_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="spatial_span" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
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
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary }]}>
          {t('sspanLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </GradientSurface>
      </TouchableOpacity>
      </View>
    </View>
  );

  const renderGrid = () => (
    <View style={[styles.grid, { width: gridW }]}>
      {Array.from({ length: cellCount }).map((_, i) => {
        const lit = phase === 'show' && showIdx === i;
        const tapped = userSeq.includes(i);
        const lastTapped = userSeq[userSeq.length - 1] === i;
        return (
          // Клетка семейства «сетка со вспышкой» — одна на четыре игры.
          <FlashCell key={i}
            size={cellSize}
            state={
              feedback === 'right' && lastTapped ? 'correct' :
              feedback === 'wrong' && lastTapped ? 'wrong' :
              lit ? 'lit' : tapped ? 'picked' : 'idle'
            }
            disabled={phase !== 'recall' || feedback !== null}
            onPress={() => handleTap(i)}
            litColor="#fbbf24"
            idleColor={colors.surface}
            borderColor={colors.border}
            a11yLabel={`${t('a11yRow')} ${Math.floor(i / gridSize) + 1}, ${t('a11yCol')} ${(i % gridSize) + 1}, ${
              lit ? t('a11yLit') : tapped ? t('a11ySelected') : t('a11yEmpty')}`}
            a11yState={{ selected: tapped, disabled: phase !== 'recall' || feedback !== null }}
          />
        );
      })}
    </View>
  );

  // игровые фазы (показ и воспроизведение) — на едином каркасе GameShell;
  // модалка правил уровня — поверх каркаса (паттерн digit-span)
  if (phase === 'show' || phase === 'recall') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('spatialSpan')}
          onBack={() => goBackOrHome()}
          pet={petMood}
          /** Счётчики данными — как у остальных игр семейства (см. `HudItem`). */
          hud={[
            { key: 'span', icon: 'resize', label: t('hud_span'), value: span, tone: 'accent' as const },
            phase === 'show'
              ? { key: 'len', icon: 'eye' as const, label: t('lengthLabel'), value: seq.length }
              : { key: 'entered', icon: 'hand-left' as const, label: t('hud_entered'), value: `${userSeq.length}/${seq.length}`, pop: true },
            ...(bestSpan ? [{ key: 'best', icon: 'trophy' as const, label: t('hud_best'), value: bestSpan, tone: 'warn' as const }] : []),
            { key: 'lvl', icon: 'flag' as const, label: t('label_level_short'), value: lvl.level },
          ]}
          stats={
            <View style={styles.statsRow}>
              <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />
            </View>
          }
        >
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {phase === 'show' ? t('watchSequence') : t('reproduceBackward')}
            </Text>
            {renderGrid()}
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
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('spatialSpan')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <GameSuiteSwitch />
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="spatial_span" level={levelRef.current} stars={totalErrors === 0 ? 3 : totalErrors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {/* Итог пробного захода словами: очки списаны, партия никуда не записана —
          `comparisonLine` это готовый слот GameResult под одну строку под счётом. */}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, span * 250 - totalErrors * 50)}
          time={elapsedTime} errors={totalErrors}
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
  // крупный системный шрифт: длинный заголовок распирал header и выдавливал спейсер за край → ужимается сам
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, textAlign: 'center' },
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
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 16 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: '100%' },
});
