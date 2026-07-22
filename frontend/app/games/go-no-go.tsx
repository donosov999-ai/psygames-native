/**
 * Go/No-Go — классика инхибиторного контроля.
 *
 * Парадигма: на круге вспыхивает GO (зелёный, ~60-80% проб) или NO (красный).
 * GO → тапнуть как можно быстрее, NO → удержаться (ничего не жать).
 * Ошибки честно по механике: пропуск GO (miss) И тап на NO (false alarm).
 *
 * Уровни (persist, паттерн cpt/simon): ручной селектор числа проб заменён на
 * usePersistentLevel('go_no_go') + levelParams. Ось усложнения:
 *   - окно ответа сокращается 1100мс → 550мс (жать надо всё быстрее)
 *   - доля no-go растёт 20% → ~42% (частые торможения на высоком темпе)
 *   - темп предъявления ускоряется: пауза между пробами 600-1000мс → 280-460мс
 *   - число проб растёт ступенями 24 → 30 → 36
 * Проход уровня: ≥80% верных проб (hits + correct rejections) → LevelCleared (авто-поток).
 *
 * v-fix: прежняя версия держала счётчики в state и параметрах runRound —
 * stale closures в setTimeout теряли hits/falseAlarms в finish. Теперь все
 * счётчики и параметры раунда в refs (паттерн simon.tsx).
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
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import BossRound from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { hapticSuccess, hapticError } from '@/src/components/juice';

const GRADIENT = ['#11998e', '#38ef7d'];
const GO_BENEFITS = [
  { icon: 'pause-circle-outline', textKey: 'benefitGoNoGo1' },
  { icon: 'flash-outline', textKey: 'benefitGoNoGo2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitGoNoGo3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот, паттерн schulte): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила — тренировка гибкости).
const BOSS_EVERY = 3;
type Stim = 'go' | 'nogo';

// Уровень 1..15: окно ответа сокращается, доля no-go растёт (частые торможения
// при высоком темпе), межпробная пауза сжимается, число проб растёт ступенями.
function levelParams(level: number): {
  trials: number; nogoProb: number; windowMs: number; itiMinMs: number; itiJitterMs: number;
} {
  const trials = level <= 5 ? 24 : level <= 10 ? 30 : 36;
  const nogoProb = Math.min(0.42, 0.20 + (level - 1) * 0.016);   // 20% → ~42%
  const windowMs = Math.max(550, 1100 - (level - 1) * 40);       // 1100мс → 550мс
  const itiMinMs = Math.max(280, 600 - (level - 1) * 24);        // пауза 600мс → 280мс
  const itiJitterMs = Math.max(180, 400 - (level - 1) * 16);     // джиттер 400мс → 180мс
  return { trials, nogoProb, windowMs, itiMinMs, itiJitterMs };
}

export default function GoNoGoGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('go_no_go');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(24);
  const [stimulus, setStimulus] = useState<Stim | null>(null);
  const [hits, setHits] = useState(0);               // нажал на go
  const [misses, setMisses] = useState(0);           // не нажал на go
  const [falseAlarms, setFalseAlarms] = useState(0); // нажал на nogo
  const [correctRej, setCorrectRej] = useState(0);   // не нажал на nogo
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  // Рефы — таймерная цепочка (стимул → окно → пауза → следующая проба) живёт
  // вне ре-рендеров; state в её колбэках был бы устаревшим (паттерн simon/cpt).
  const levelRef = useRef(1);
  const nogoProbRef = useRef(0.2);
  const windowMsRef = useRef(1100);
  const itiMinRef = useRef(600);
  const itiJitterRef = useRef(400);
  const totalTrialsRef = useRef(24);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const missesRef = useRef(0);
  const falseAlarmsRef = useRef(0);
  const correctRejRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const stimulusRef = useRef<Stim | null>(null);
  const stimAtRef = useRef(0);
  const respondedRef = useRef(false);
  const startTimeRef = useRef(0);
  const stoppedRef = useRef(false);

  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [windowTimerRef, itiTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => { stoppedRef.current = true; clearAllTimers(); }, []);

  const runTrial = () => {
    if (stoppedRef.current) return;
    if (roundRef.current >= totalTrialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    const stim: Stim = Math.random() < nogoProbRef.current ? 'nogo' : 'go';
    stimulusRef.current = stim;
    respondedRef.current = false;
    stimAtRef.current = Date.now();
    setStimulus(stim);
    // Окно ответа уровня: истекло без нажатия → miss на go / correct rejection на nogo
    windowTimerRef.current = setTimeout(() => {
      if (stoppedRef.current) return;
      if (!respondedRef.current) {
        if (stim === 'go') { missesRef.current += 1; setMisses(missesRef.current); }
        else { correctRejRef.current += 1; setCorrectRej(correctRejRef.current); }
      }
      stimulusRef.current = null;
      setStimulus(null);
      // Межпробная пауза уровня (темп предъявления)
      itiTimerRef.current = setTimeout(runTrial, itiMinRef.current + Math.random() * itiJitterRef.current);
    }, windowMsRef.current);
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    nogoProbRef.current = p.nogoProb;
    windowMsRef.current = p.windowMs;
    itiMinRef.current = p.itiMinMs;
    itiJitterRef.current = p.itiJitterMs;
    // Пресет из зарядки может задавать число проб напрямую (обратная совместимость)
    totalTrialsRef.current = isPreset ? num('trials', p.trials) : p.trials;
    setTotalTrials(totalTrialsRef.current);
    hitsRef.current = 0; missesRef.current = 0; falseAlarmsRef.current = 0; correctRejRef.current = 0;
    rtsRef.current = [];
    roundRef.current = 0;
    stimulusRef.current = null;
    stoppedRef.current = false;
    setHits(0); setMisses(0); setFalseAlarms(0); setCorrectRej(0);
    setRound(0);
    setStimulus(null);
    setPhase('playing');
    startTimeRef.current = Date.now();
    itiTimerRef.current = setTimeout(runTrial, 800);
  };

  const handleResponse = () => {
    const stim = stimulusRef.current;
    if (!stim || respondedRef.current) return;
    respondedRef.current = true;
    const rt = Date.now() - stimAtRef.current;
    if (stim === 'go') {
      hitsRef.current += 1;
      setHits(hitsRef.current);
      rtsRef.current.push(rt);
      hapticSuccess();   // верный ответ: тап на GO
    } else {
      falseAlarmsRef.current += 1;
      setFalseAlarms(falseAlarmsRef.current);
      hapticError();     // неверный ответ: тап на NO
    }
  };

  const finish = async () => {
    clearAllTimers();
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current, m = missesRef.current, fa = falseAlarmsRef.current, cr = correctRejRef.current;
    const total = h + m + fa + cr;
    const accuracy = total > 0 ? (h + cr) / total : 0;
    const rts = rtsRef.current;
    const avgRT = rts.length ? Math.round(rts.reduce((s, x) => s + x, 0) / rts.length) : 0;
    // Проход уровня: ≥80% верных проб (пропуск GO и тап на NO — обе ошибки)
    const passed = accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — экран статистики, уровень не трогаем
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      // Непрерывный поток: провал → баннер «почти», авто-рестарт того же уровня.
      // На вехе (уровень кратен BOSS_EVERY) прошедший уровень уходит в босса, потом в cleared; провал по-прежнему сразу в cleared.
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        setPhase('boss');
      } else {
        setPhase('cleared');
      }
    }
    try {
      await saveSession({
        game_type: 'go_no_go',
        score: h * 10 - fa * 10,
        time_seconds: finalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: m + fa,
        details: {
          level: levelRef.current,
          hits: h, misses: m, falseAlarms: fa, correctRej: cr,
          accuracy: Math.round(accuracy * 100),
          avgRT,
          n_trials: total,
          nogo_rate: Number(nogoProbRef.current.toFixed(2)),
          window_ms: windowMsRef.current,
        },
      });
    } catch (e) { console.error(e); }
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="pause-circle" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('goNoGo')}</Text>
          <Text style={styles.configDesc}>{t('goNoGoDesc')}</Text>
        </LinearGradient>
        <LevelProgressMap gameId="go_no_go" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('goNoGoLvlParams').replace('{n}', String(p.trials)).replace('{p}', String(Math.round(p.nogoProb * 100))).replace('{w}', (p.windowMs / 1000).toFixed(2))}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {t('goNoGoPass')}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.legendText, { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}>
          🟢 {t('goNoGoGoLabel')}   🔴 {t('goNoGoNoGoLabel')}
        </Text>
        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // playing-фаза — на едином каркасе GameShell; действий-кнопок нет (реакция тапом
  // по самому полю), поэтому toolbar не передаётся
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('goNoGo')}
        onBack={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits + correctRej}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{misses + falseAlarms}</Text>
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleResponse}
            style={[
              styles.pad,
              {
                backgroundColor: stimulus === 'go' ? '#22c55e' : stimulus === 'nogo' ? '#f43f5e' : colors.surface,
              },
            ]}
          >
            <Text style={[styles.padText, { color: stimulus ? '#FFF' : colors.textSecondary }]}>
              {stimulus === 'go' ? 'GO' : stimulus === 'nogo' ? 'NO' : '•'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goNoGoHint')}</Text>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('goNoGo')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="goNoGo" icon="pause-circle" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="goNoGoIntroDesc"
          benefits={GO_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'oddletter', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="go_no_go" level={levelRef.current} passed={clearedPassed}
          stars={(misses + falseAlarms) === 0 ? 3 : (misses + falseAlarms) <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult score={hits * 10 - falseAlarms * 10} time={elapsedTime} errors={misses + falseAlarms}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  legendText: { fontSize: 14, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 30 },
  statsRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 16, fontWeight: '700' },
  pad: { width: 240, height: 240, borderRadius: 120, justifyContent: 'center', alignItems: 'center' },
  padText: { fontSize: 60, fontWeight: '900' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
});
