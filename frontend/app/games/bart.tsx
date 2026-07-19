/**
 * BART — Balloon Analogue Risk Task (Lejuez et al., 2002), клиника склонности к риску.
 *
 * Парадигма: у каждого шара скрытая точка взрыва, тянется равномерно из 1..N.
 * Каждый pump: +1¢ в pending. Cash out → pending уходит в bank. Взрыв → pending теряется.
 * Ключевой биомаркер — «adjusted average pumps» = средние пампы по НЕ лопнувшим шарам
 * (мера склонности к риску). Оптимальная стратегия ~ N/2 пампов на шар.
 *
 * ДВА РЕЖИМА (по решению Дениса — уровни, но с сохранением диагностической ценности):
 *  1) УРОВНЕВЫЙ (по умолчанию): usePersistentLevel('bart') + levelParams(level).
 *     Ось усложнения = РИСК/РАЗМАХ: диапазон точки взрыва (maxBurst 16→128) и число
 *     шаров (8→20) растут с уровнем. Проход = адекватная стратегия (разумный
 *     adjusted-average без частых взрывов) → LevelCleared (авто-поток, как в simon/cpt).
 *     Механика взрыва НЕ искажается — меняются только частота/размах через уровень.
 *  2) КЛАССИЧЕСКИЙ (отдельный выбор на конфиге / запуск из зарядки): фиксированный
 *     easy/medium/hard × число шаров — СТАНДАРТНЫЕ параметры парадигмы, чтобы снять
 *     диагностическую метрику (adjusted pumps) на нормативных условиях. Уровень НЕ трогает.
 *
 * Диагностические метрики всегда пишутся в details (adj_avg_pumps, pop-rate,
 * lose-shift — пост-взрывная адаптация риска), независимо от режима.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#ff5e62', '#ff9966'];
const BART_BENEFITS = [
  { icon: 'speedometer-outline', textKey: 'benefitBart1' },
  { icon: 'analytics-outline',   textKey: 'benefitBart2' },
  { icon: 'shield-outline',      textKey: 'benefitBart3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

// КЛАССИЧЕСКИЙ пресет — стандартные параметры парадигмы для диагностики.
// average burst = MAX/2; на pump'е MAX-1 P(burst)=1.
const MAX_BURST_BY_DIFF: Record<Difficulty, number> = { easy: 64, medium: 32, hard: 16 };

// УРОВНЕВЫЙ режим: риск/размах растут с уровнем (~12 ступеней).
//   maxBurst  16 → 128 (шире диапазон точки взрыва = выше ставки и соблазн)
//   balloons  8 → 20   (больше экспозиции к риску за раунд)
// Механику НЕ меняем — только частоту/размах.
function levelParams(level: number): { balloons: number; maxBurst: number } {
  const balloons = level <= 3 ? 8 : level <= 6 ? 12 : level <= 9 ? 16 : 20;
  const maxBurst = Math.min(128, 16 + (level - 1) * 10);   // L1=16 … L12=126 (cap 128)
  return { balloons, maxBurst };
}

interface BalloonRecord { pumps: number; popped: boolean; }

export default function BARTGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('bart');

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата для баннера LevelCleared

  // КЛАССИЧЕСКИЙ селектор (независим от уровневого режима). Из зарядки — из params.
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (isPreset ? (str('diff', 'medium') as Difficulty) : 'medium'));
  const [balloons, setBalloons] = useState<number>(() => (isPreset ? num('balloons', 15) : 15));

  // Текущий шар — состояние для рендера.
  const [totalBalloons, setTotalBalloons] = useState(15);   // всего шаров в этой партии (level или classic)
  const [activeMax, setActiveMax] = useState(32);           // активный maxBurst партии (для риск-метра)
  const [round, setRound] = useState(0);
  const [pumps, setPumps] = useState(0);
  const [pending, setPending] = useState(0);
  const [bank, setBank] = useState(0);
  const [burstAt, setBurstAt] = useState<number>(0);
  const [popped, setPopped] = useState(false);
  const [history, setHistory] = useState<BalloonRecord[]>([]);
  const [animScale] = useState(new Animated.Value(1));
  const [feedback, setFeedback] = useState<'pop' | 'cash' | null>(null);

  // Рефы — источник истины для счётчиков раунда (без stale-closure в setTimeout-цепочке
  // между шарами; state — лишь зеркало для HUD, паттерн cpt/simon).
  const classicRef = useRef(false);       // true → классический/пресет прогон (уровень не трогаем)
  const levelRef = useRef(1);
  const maxBurstRef = useRef(32);
  const balloonsRef = useRef(15);
  const roundRef = useRef(0);
  const bankRef = useRef(0);
  const historyRef = useRef<BalloonRecord[]>([]);

  // Запуск из зарядки — классический прогон на стандартных параметрах (диагностика).
  useEffect(() => { if (isPreset) startClassic(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetBalloon = () => {
    setBurstAt(1 + Math.floor(Math.random() * maxBurstRef.current));
    setPumps(0);
    setPending(0);
    setPopped(false);
    setFeedback(null);
    animScale.setValue(1);
  };

  // Общий пуск партии; caller задаёт refs режима заранее.
  const beginRound = () => {
    bankRef.current = 0; setBank(0);
    historyRef.current = []; setHistory([]);
    roundRef.current = 1; setRound(1);
    setActiveMax(maxBurstRef.current);
    setTotalBalloons(balloonsRef.current);
    resetBalloon();
    setPhase('playing');
  };

  // УРОВНЕВЫЙ режим (кнопка Start и авто-рестарт из LevelCleared).
  const startGame = () => {
    classicRef.current = false;
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    maxBurstRef.current = p.maxBurst;
    balloonsRef.current = p.balloons;
    beginRound();
  };

  // КЛАССИЧЕСКИЙ режим (диагностика на стандартных параметрах).
  const startClassic = () => {
    classicRef.current = true;
    maxBurstRef.current = MAX_BURST_BY_DIFF[difficulty];
    balloonsRef.current = balloons;
    beginRound();
  };

  const advance = () => {
    roundRef.current += 1;
    setRound(roundRef.current);
    resetBalloon();
  };

  const finish = async () => {
    const finalHist = historyRef.current;
    const finalBank = bankRef.current;
    const nonBurst = finalHist.filter(h => !h.popped);
    const adjAvg = nonBurst.length ? nonBurst.reduce((s, h) => s + h.pumps, 0) / nonBurst.length : 0;
    const poppedCount = finalHist.filter(h => h.popped).length;
    const total = balloonsRef.current;
    const popRate = total ? poppedCount / total : 0;
    const maxBurst = maxBurstRef.current;

    // lose-shift: как меняются пампы после исхода предыдущего шара (пост-взрывная адаптация).
    // >0 = после взрыва рискует МЕНЬШЕ, чем после кэша (адаптивный контроль риска).
    const afterBurst: number[] = [], afterCash: number[] = [];
    for (let i = 1; i < finalHist.length; i++) {
      (finalHist[i - 1].popped ? afterBurst : afterCash).push(finalHist[i].pumps);
    }
    const meanAfterBurst = afterBurst.length ? afterBurst.reduce((a, b) => a + b, 0) / afterBurst.length : 0;
    const meanAfterCash = afterCash.length ? afterCash.reduce((a, b) => a + b, 0) / afterCash.length : 0;
    const loseShift = (afterBurst.length && afterCash.length) ? Math.round((meanAfterCash - meanAfterBurst) * 10) / 10 : 0;

    // Уровень трогаем только в уровневом режиме (не пресет, не классика).
    const useLevels = !isPreset && !classicRef.current;
    // Проход уровня: адекватная стратегия = разумный adjusted-average (не робко) БЕЗ частых
    // взрывов (не безрассудно). Порог adjAvg масштабируется от maxBurst уровня.
    const passed = useLevels && adjAvg >= maxBurst * 0.20 && popRate <= 0.6;

    if (useLevels) {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();   // гистерезис: 3 провала подряд → уровень -1
      // Непрерывный поток: и проход, и провал → баннер LevelCleared (passed=false = «почти,
      // ещё раз» + авто-рестарт того же уровня), без тупика GameResult.
      setClearedPassed(passed);
      setPhase('cleared');
    } else {
      setPhase('result');   // классика/пресет — экран статистики, уровень не меняем
    }

    try {
      await saveSession({
        game_type: 'bart',
        score: finalBank,
        time_seconds: 0,
        difficulty: useLevels ? (levelRef.current <= 4 ? 'easy' : levelRef.current <= 8 ? 'medium' : 'hard') : difficulty,
        mode: useLevels ? `lvl${levelRef.current}` : `${total}b`,
        errors: poppedCount,
        details: {
          adj_avg_pumps: Math.round(adjAvg * 10) / 10,   // ключевой BART-биомаркер риска
          total_balloons: total,
          popped_count: poppedCount,
          pop_rate: Math.round(popRate * 100) / 100,
          lose_shift_pumps: loseShift,                   // пост-взрывная адаптация риска
          max_burst: maxBurst,
          ...(useLevels ? { level: levelRef.current } : { difficulty }),
        },
      });
    } catch (e) { console.error(e); }
  };

  const pump = () => {
    if (popped || feedback !== null) return;
    const nextPumps = pumps + 1;
    setPumps(nextPumps);
    setPending(nextPumps);
    Animated.sequence([
      Animated.timing(animScale, { toValue: 1 + nextPumps * 0.04, duration: 80, useNativeDriver: true }),
    ]).start();
    if (nextPumps >= burstAt) {
      // pop
      setPopped(true);
      setPending(0);
      setFeedback('pop');
      historyRef.current = [...historyRef.current, { pumps: nextPumps, popped: true }];
      setHistory(historyRef.current);
      Animated.timing(animScale, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      setTimeout(() => {
        if (roundRef.current >= balloonsRef.current) finish();
        else advance();
      }, 1200);
    }
  };

  const cashOut = () => {
    if (popped || feedback !== null || pumps === 0) return;
    setFeedback('cash');
    bankRef.current = bankRef.current + pending;
    setBank(bankRef.current);
    historyRef.current = [...historyRef.current, { pumps, popped: false }];
    setHistory(historyRef.current);
    setTimeout(() => {
      if (roundRef.current >= balloonsRef.current) finish();
      else advance();
    }, 800);
  };

  const adjAvg = (() => {
    const ne = history.filter(h => !h.popped);
    return ne.length ? Math.round((ne.reduce((s, h) => s + h.pumps, 0) / ne.length) * 10) / 10 : 0;
  })();
  const popCount = history.filter(h => h.popped).length;

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="warning" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('bart')}</Text>
          <Text style={styles.configDesc}>{t('bartDesc')}</Text>
        </LinearGradient>

        {/* ── УРОВНЕВЫЙ режим (по умолчанию) ── */}
        <LevelProgressMap gameId="bart" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.balloons} шаров · разброс взрыва 1–${p.maxBurst}`
              : `${p.balloons} balloons · burst range 1–${p.maxBurst}`}
          </Text>
          {/* Критерий прохождения виден игроку (паттерн cpt/simon) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? 'Проход: разумный средний накач без частых взрывов'
              : 'To pass: reasonable avg pumps without frequent bursts'}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── КЛАССИЧЕСКИЙ режим (диагностика на стандартных параметрах) ── */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {language === 'ru' ? 'Классический замер (диагностика)' : 'Classic run (diagnostic)'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {language === 'ru'
              ? 'Фиксированные параметры — чистая метрика склонности к риску.'
              : 'Fixed parameters — a clean risk-propensity metric.'}
          </Text>
          <Text style={[styles.optionLabel, { color: colors.text, marginTop: 4 }]}>{t('difficultyLabel')}</Text>
          <View style={styles.optionButtons}>
            {(['easy','medium','hard'] as Difficulty[]).map((d) => (
              <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setDifficulty(d)}>
                <Text style={[styles.modeButtonText, { color: difficulty === d ? '#FFF' : colors.text }]}>
                  {t(d)} (max~{MAX_BURST_BY_DIFF[d]})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.optionLabel, { color: colors.text, marginTop: 4 }]}>{t('balloonsCount')}</Text>
          <View style={styles.optionButtons}>
            {[10, 15, 20].map((n) => (
              <TouchableOpacity key={n} style={[styles.modeButton, balloons === n
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setBalloons(n)}>
                <Text style={[styles.modeButtonText, { color: balloons === n ? '#FFF' : colors.text }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.classicBtn, { borderColor: GRADIENT[0] }]} onPress={startClassic}>
            <Text style={[styles.classicBtnText, { color: GRADIENT[0] }]}>
              {language === 'ru' ? 'Классический замер' : 'Classic run'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const balloonSize = 60 + pumps * 4;

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{t('label_balloon')} {round}/{totalBalloons}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>💰{bank}¢</Text>
        <Text style={[styles.statText, { color: '#fbbf24' }]}>⏳{pending}¢</Text>
        <Text style={[styles.statText, { color: '#ef4444' }]}>💥{popCount}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>μ{adjAvg}</Text>
      </View>
      {/* ЗАЧЕМ: игровое поле (шар + риск-метр + подсказка) тянется flex:1 и центрируется по
          вертикали — шар в центре экрана, а НЕ подпирает кнопки в середину. Действия ушли
          в отдельный нижний тулбар (эталон math-sprint: поле по центру, кнопки у низа). */}
      <View style={styles.gameField}>
      <View style={styles.balloonArea}>
        {/* Объёмный шар без ассетов, RN-примитивами: градиент-тело + блик-эллипс +
            узелок-треугольник + нитка. Всё внутри Animated.View — масштабируется целиком. */}
        <Animated.View style={{
          width: balloonSize, height: balloonSize * 1.2,
          transform: [{ scale: animScale }],
          alignItems: 'center', justifyContent: 'flex-start',
        }}>
          {/* нитка — тонкая линия из-под узелка (позади тела по слою) */}
          {!popped && <View style={[styles.balloonString, { top: balloonSize * 1.2 + 8 }]} pointerEvents="none" />}
          {/* тело шара: диагональный градиент даёт объём (светлее сверху-слева → темнее снизу-справа) */}
          <LinearGradient
            colors={feedback === 'pop' ? ['#f87171', '#ef4444', '#b91c1c'] : ['#ff9a8b', GRADIENT[0], '#c73e42']}
            start={{ x: 0.25, y: 0.05 }} end={{ x: 0.85, y: 1 }}
            style={{
              width: balloonSize, height: balloonSize * 1.2, borderRadius: balloonSize / 2,
              justifyContent: 'center', alignItems: 'center',
              shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            }}
          >
            {/* блик — размытое белое пятно сверху-слева, читается как отражение света */}
            {!popped && (
              <View pointerEvents="none" style={{
                position: 'absolute',
                top: balloonSize * 0.16, left: balloonSize * 0.2,
                width: balloonSize * 0.3, height: balloonSize * 0.42,
                borderRadius: balloonSize * 0.2,
                backgroundColor: 'rgba(255,255,255,0.45)',
                transform: [{ rotate: '-18deg' }],
              }} />
            )}
            {!popped && <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '900' }}>{pumps}</Text>}
            {feedback === 'pop' && <Text style={{ color: '#FFF', fontSize: 32 }}>💥</Text>}
          </LinearGradient>
          {/* узелок — маленький треугольник вершиной вниз под шаром */}
          {!popped && (
            <View pointerEvents="none" style={{
              width: 0, height: 0, marginTop: -1,
              borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 9,
              borderLeftColor: 'transparent', borderRightColor: 'transparent',
              borderTopColor: '#c73e42',
            }} />
          )}
        </Animated.View>
      </View>

      {/* Risk-meter (educational): вероятность взрыва ПРИ СЛЕДУЮЩЕМ pump'е.
          maxBurst берётся из активной партии (уровень или классика). */}
      {!popped && (() => {
        const max = activeMax;
        // P(burst on next pump) = 1 / (max - pumps), при условии что не лопнул до этого pump'а
        const remaining = Math.max(1, max - pumps);
        const nextRisk = Math.min(1, 1 / remaining);
        const riskPct = Math.round(nextRisk * 100);
        const riskColor =
          nextRisk < 0.05 ? '#22c55e' :
          nextRisk < 0.15 ? '#84cc16' :
          nextRisk < 0.30 ? '#fbbf24' :
          nextRisk < 0.50 ? '#f97316' :
          '#ef4444';
        return (
          <View style={styles.riskMeter}>
            <View style={styles.riskHeader}>
              <Text style={[styles.riskLabel, { color: colors.textSecondary }]}>{t('label_burst_risk')}</Text>
              <Text style={[styles.riskValue, { color: riskColor }]}>{riskPct}%</Text>
            </View>
            <View style={[styles.riskBar, { backgroundColor: colors.surface }]}>
              <View style={{
                height: '100%',
                width: `${Math.min(100, nextRisk * 100)}%`,
                backgroundColor: riskColor,
                borderRadius: 4,
              }} />
            </View>
            <Text style={[styles.riskHint, { color: colors.textSecondary }]}>
              {language === 'ru'
                ? (nextRisk < 0.10 ? '🟢 Безопасно — копи дальше' :
                   nextRisk < 0.25 ? '🟡 Внимание — pending растёт' :
                   nextRisk < 0.50 ? '🟠 Рискованно — может стоит cash?' :
                   '🔴 Очень опасно — почти гарантированный взрыв')
                : (nextRisk < 0.10 ? '🟢 Safe — keep banking' :
                   nextRisk < 0.25 ? '🟡 Caution — pending is growing' :
                   nextRisk < 0.50 ? '🟠 Risky — maybe cash out?' :
                   '🔴 Very dangerous — burst almost guaranteed')}
            </Text>
          </View>
        );
      })()}

      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {feedback === 'pop' ? t('bartPopped') : feedback === 'cash' ? t('bartCashed') : t('bartHint')}
      </Text>
      </View>
      {/* ЗАЧЕМ: Pump/Cash — отдельный нижний тулбар, прижат к низу игровой зоны (как кнопка снизу в math-sprint) */}
      <View style={styles.actionsRow}>
        <TouchableOpacity disabled={popped || feedback !== null}
          style={[styles.actionBtn, { backgroundColor: GRADIENT[0], opacity: popped || feedback ? 0.5 : 1 }]}
          onPress={pump}>
          <Ionicons name="add-circle" size={22} color="#FFF" />
          <Text style={styles.actionText}>{t('bartPump')}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={popped || feedback !== null || pumps === 0}
          style={[styles.actionBtn, { backgroundColor: '#22c55e', opacity: popped || feedback || pumps === 0 ? 0.5 : 1 }]}
          onPress={cashOut}>
          <Ionicons name="cash" size={22} color="#FFF" />
          <Text style={styles.actionText}>{t('bartCash')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const stars = (() => {
    const pr = totalBalloons ? popCount / totalBalloons : 1;
    return pr <= 0.2 ? 3 : pr <= 0.4 ? 2 : 1;
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('bart')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="bart" icon="warning" gradient={GRADIENT as [string, string]}
          skillKey="skillRisk" descriptionKey="bartIntroDesc"
          benefits={BART_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="bart" level={levelRef.current} passed={clearedPassed} stars={stars}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={bank}
          time={undefined} errors={popCount}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  modeButtonText: { fontSize: 12, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  classicBtn: { borderRadius: 10, borderWidth: 1.5, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  classicBtnText: { fontSize: 14, fontWeight: '700' },
  // ЗАЧЕМ: playArea больше не центрирует всё разом (иначе кнопки зависали в середине).
  // Статы сверху, поле по центру (gameField flex:1), тулбар снизу — как в math-sprint.
  playArea: { flex: 1, padding: 16, gap: 14 },
  gameField: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 },
  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  balloonArea: { width: 280, height: 280, justifyContent: 'center', alignItems: 'center' },
  balloonString: { position: 'absolute', width: 2, height: 34, backgroundColor: 'rgba(120,120,120,0.55)', borderRadius: 1 },  // нитка из-под узелка
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  actionsRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12 },
  actionText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  riskMeter: { width: 280, gap: 6, marginTop: 6 },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  riskLabel: { fontSize: 11, fontWeight: '600' },
  riskValue: { fontSize: 16, fontWeight: '900' },
  riskBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  riskHint: { fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
});
