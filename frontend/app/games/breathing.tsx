/* psygames-game-breathing · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import BreathShape from '@/src/components/breath/BreathShape';
import { useKeepAwake } from '@/src/hooks/useKeepAwake';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveSession } from '@/src/services/api';
import GameAbout from '@/src/components/GameAbout';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameShell from '@/src/components/GameShell';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { hapticMedium } from '@/src/components/juice/haptics';
import { sndTap, sndBreathIn, sndBreathHold, sndBreathOut } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';

const GRADIENT_DAY = ['#5b86e5', '#36d1dc'];   // спокойный сине-бирюзовый (отлично от eye-gym)
// Ночной вид для сценария «Не спится»: человек открыл это, потому что не может
// заснуть, и яркий экран в три часа ночи работает против задачи. Приглушаем.
const GRADIENT_NIGHT = ['#2c3e50', '#4ca1af'];
// Плашка предупреждения (метод Вима Хофа) — свой, оранжевый градиент.
const WIM_GRADIENT = ['#f7971e', '#ffd200'];
// Было зашито '#FFF' — контраст 1.45 (норма AA 4.5).
const ON_WIM = onGradientText(WIM_GRADIENT[0], WIM_GRADIENT[1]);
const BREATH_BENEFITS = [
  { icon: 'heart-outline',   textKey: 'benefitBreath1' },
  { icon: 'moon-outline',    textKey: 'benefitBreath2' },
  { icon: 'pulse-outline',   textKey: 'benefitBreath3' },
];

type GamePhase = 'intro' | 'config' | 'warning' | 'breathing' | 'done';
type Format = 'cycles' | 'time';
type PhaseType = 'inhale' | 'hold' | 'exhale';

interface BreathPhase { type: PhaseType; sec: number; from: number; to: number }   // from/to = масштаб круга 0.45..1
interface Technique {
  key: string; nameKey: string; descKey: string;
  phases: BreathPhase[];          // один цикл (для wimhof пусто — отдельная ветка)
  special?: 'wimhof';
}

// from/to: 0.45 = пустые лёгкие (маленький круг), 1 = полные (большой). hold держит уровень.
const IN_LO = 0.45, IN_HI = 1;
const TECHNIQUES: Technique[] = [
  { key: 'box', nameKey: 'brTechBox', descKey: 'brTechBoxDesc', phases: [
    { type: 'inhale', sec: 4, from: IN_LO, to: IN_HI },
    { type: 'hold',   sec: 4, from: IN_HI, to: IN_HI },
    { type: 'exhale', sec: 4, from: IN_HI, to: IN_LO },
    { type: 'hold',   sec: 4, from: IN_LO, to: IN_LO },
  ] },
  { key: 'calm478', nameKey: 'brTech478', descKey: 'brTech478Desc', phases: [
    { type: 'inhale', sec: 4, from: IN_LO, to: IN_HI },
    { type: 'hold',   sec: 7, from: IN_HI, to: IN_HI },
    { type: 'exhale', sec: 8, from: IN_HI, to: IN_LO },
  ] },
  { key: 'coherent', nameKey: 'brTechCoherent', descKey: 'brTechCoherentDesc', phases: [
    { type: 'inhale', sec: 5.5, from: IN_LO, to: IN_HI },
    { type: 'exhale', sec: 5.5, from: IN_HI, to: IN_LO },
  ] },
  { key: 'sigh', nameKey: 'brTechSigh', descKey: 'brTechSighDesc', phases: [
    { type: 'inhale', sec: 2,   from: IN_LO, to: 0.8 },     // первый вдох
    { type: 'inhale', sec: 1,   from: 0.8,  to: IN_HI },    // короткий до-вдох (двойной вдох)
    { type: 'exhale', sec: 6,   from: IN_HI, to: IN_LO },   // длинный выдох
  ] },
  { key: 'extexhale', nameKey: 'brTechExt', descKey: 'brTechExtDesc', phases: [
    { type: 'inhale', sec: 4, from: IN_LO, to: IN_HI },
    { type: 'exhale', sec: 6, from: IN_HI, to: IN_LO },
  ] },
  { key: 'calm424', nameKey: 'brTech424', descKey: 'brTech424Desc', phases: [
    { type: 'inhale', sec: 4, from: IN_LO, to: IN_HI },
    { type: 'hold',   sec: 2, from: IN_HI, to: IN_HI },
    { type: 'exhale', sec: 4, from: IN_HI, to: IN_LO },
  ] },
  { key: 'wimhof', nameKey: 'brTechWim', descKey: 'brTechWimDesc', phases: [], special: 'wimhof' },
];

const CYCLE_OPTIONS = [4, 6, 10];
const TIME_OPTIONS = [1, 3, 5];   // минуты
const WIM_BREATHS = 30;           // быстрых вдохов в раунде
const WIM_ROUNDS = 3;


/**
 * Ритм техники строкой: «4-7-8», «5.5-5.5». Считаем ИЗ ФАЗ, а не храним текстом —
 * иначе подпись однажды разойдётся с реальными таймингами и будет врать.
 * Названия техник теперь без цифр (задача Дениса 02.08): человек выбирает по
 * задаче — «успокоиться», «уснуть», — а ритм ему нужен второй строкой, справочно.
 */
function rhythmOf(tech: Technique): string {
  if (!tech.phases.length) return '';
  return tech.phases.map((p) => (Number.isInteger(p.sec) ? String(p.sec) : p.sec.toFixed(1))).join('-');
}

export default function BreathingGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { profile } = useProfile();
  const { width, height } = useWindowDimensions();

  const { isPreset, autostart, str, bool, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  // dim=1 приходит шагом ночного набора (см. NIGHT_STEPS в warmup.ts).
  const dim = bool('dim');
  const GRADIENT = dim ? GRADIENT_NIGHT : GRADIENT_DAY;
  // ⚠️ Градиент здесь выбирается в РАНТАЙМЕ (день/ночь), поэтому цвет текста
  // нельзя зашить в StyleSheet — он считается тут и подставляется на местах.
  // Было '#FFF': 1.86 днём и 2.99 ночью (норма AA 4.5). Ночной сплошным цветом
  // не берётся вовсе (белый 2.99, чёрный 1.91) — GradientSurface кладёт вуаль.
  const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
  const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
  const warmup = useWarmup();
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && runs.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  // v1.160: технику может задать шаг комплекса (перед сном → calm478 «помогает заснуть»),
  // запрос Вали «дыхание перед сном должно быть в тренировке, чтобы не заходить отдельно».
  const [techKey, setTechKey] = useState(() => str('tech', 'box'));
  const [format, setFormat] = useState<Format>('cycles');
  /**
   * СЧЁТЧИК ПРОХОЖДЕНИЙ, а не ступени сложности. Решение по указанию Дениса
   * «уровни или счёт, как везде»; выбран счёт, и вот почему.
   *
   * Дыхание — восстановление, а не нагрузка. Техники (квадрат, 4-7-8, когерентное)
   * держатся на ФИКСИРОВАННЫХ соотношениях вдоха, задержки и выдоха: растянешь их
   * «для сложности» — получишь другую технику, а не более трудную ту же. Единственное,
   * что честно растёт, — число циклов, но это и так ручная настройка, то есть
   * свободный режим.
   *
   * ⚠️ Ночная зарядка сознательно идёт БЕЗ счёта и серии — это записанное решение
   * Дениса, и счётчик его не трогает: он считает завершённые подходы, а не очки.
   */
  const runs = usePersistentLevel('breathing');
  const [cycles, setCycles] = useState(6);
  const [timeMin, setTimeMin] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  // Отсчёт перед первым вдохом. Раньше сессия стартовала мгновенно: человек
  // ещё устраивался, а вдох уже шёл, и первый цикл всегда пропадал.
  const [leadIn, setLeadIn] = useState(0);
  const leadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [streak, setStreak] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);

  // Wim Hof state
  const [wimRound, setWimRound] = useState(1);
  const [wimStage, setWimStage] = useState<'breaths' | 'hold' | 'recover'>('breaths');
  const [wimBreath, setWimBreath] = useState(0);
  const [wimHoldSec, setWimHoldSec] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPhaseRef = useRef<string>('');   // для вибро/звука на смену фазы
  const wimTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Экран не гаснет, пока идёт упражнение: касаний тут нет по 3-5 минут.
  useKeepAwake(phase === 'breathing');

  const tech = TECHNIQUES.find((x) => x.key === techKey) || TECHNIQUES[0];
  const cycleDur = tech.phases.reduce((a, p) => a + p.sec, 0) || 1;
  const totalDur = format === 'cycles' ? cycles * cycleDur : timeMin * 60;

  const stage = Math.min(width, height) - 80;
  const circleMax = Math.max(160, Math.min(stage, 300));

  useEffect(() => {
    loadStreak();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (wimTimerRef.current) clearInterval(wimTimerRef.current);
      if (leadTimerRef.current) clearInterval(leadTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const streakKey = `psygames_breathing_streak_${profile?.id || 'guest'}`;
  const loadStreak = async () => {
    try {
      const raw = await AsyncStorage.getItem(streakKey);
      if (raw) { const d = JSON.parse(raw); setStreak(d.streak || 0); setTotalSessions(d.total || 0); }
    } catch {}
  };
  const bumpStreak = async () => {
    try {
      const raw = await AsyncStorage.getItem(streakKey);
      const today = new Date().toISOString().slice(0, 10);
      let d = raw ? JSON.parse(raw) : { streak: 0, total: 0, last: '' };
      if (d.last !== today) {
        const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        d.streak = d.last === yest ? (d.streak || 0) + 1 : 1;
        d.last = today;
      }
      d.total = (d.total || 0) + 1;
      await AsyncStorage.setItem(streakKey, JSON.stringify(d));
      setStreak(d.streak); setTotalSessions(d.total);
    } catch {}
  };

  // ─── обычный фазовый движок (6 техник) ───
  const startGame = () => {
    if (tech.special === 'wimhof') { setPhase('warning'); return; }
    setElapsed(0);
    lastPhaseRef.current = '';
    setPhase('breathing');
    setLeadIn(3);
    // Три секунды на «сядь и выдохни». Основной таймер стартует ПОСЛЕ отсчёта,
    // иначе первый вдох уходит в никуда.
    leadTimerRef.current = setInterval(() => {
      setLeadIn((n) => {
        if (n <= 1) {
          if (leadTimerRef.current) clearInterval(leadTimerRef.current);
          runCycle();
          return 0;
        }
        sndTap();
        return n - 1;
      });
    }, 1000);
  };

  const runCycle = () => {
    const start = gameNow();
    timerRef.current = setInterval(() => {
      const tt = (gameNow() - start) / 1000;
      if (tt >= totalDur) { if (timerRef.current) clearInterval(timerRef.current); setElapsed(totalDur); finish(); }
      else setElapsed(tt);
    }, 50);
  };

  const finish = async (label?: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (wimTimerRef.current) clearInterval(wimTimerRef.current);
    if (leadTimerRef.current) clearInterval(leadTimerRef.current);
    setPhase('done');
    bumpStreak();
    // Дыхание доводят до конца или прекращают — провалить его нельзя.
    // Подход засчитан фактом завершения.
    const doneRun = runs.level;
    runs.reach(doneRun + 1);
    try {
      // passed отсутствует НАМЕРЕННО (задача e53f4958, группа «провала нет по
      // устройству»): дыхательная практика: доводится до конца или прерывается.
      // Поле «всегда true» не несёт бита и портит статистику долей — не врём им.
      await saveSession({
        game_type: 'breathing',
        score: Math.round(totalDur),
        time_seconds: Math.round(totalDur),
        difficulty: label || tech.key,
        mode: format === 'cycles' ? `${cycles}cyc` : `${timeMin}min`,
        errors: 0,
        details: { technique: tech.key, format, dur: Math.round(totalDur), level: doneRun },
      });
    } catch (e) { console.error(e); }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (wimTimerRef.current) clearInterval(wimTimerRef.current);
    setPhase('config');
  };

  // текущая фаза/масштаб по elapsed
  const tInCycle = elapsed % cycleDur;
  let acc = 0, curPhase: BreathPhase = tech.phases[0] || { type: 'inhale', sec: 4, from: IN_LO, to: IN_HI }, local = 0, phaseIdx = 0;
  for (let i = 0; i < tech.phases.length; i++) {
    if (tInCycle < acc + tech.phases[i].sec) { curPhase = tech.phases[i]; local = (tInCycle - acc) / tech.phases[i].sec; phaseIdx = i; break; }
    acc += tech.phases[i].sec;
  }
  const scaleNow = curPhase.from + (curPhase.to - curPhase.from) * local;
  const phaseRemain = Math.ceil(curPhase.sec - (tInCycle - acc));
  const cycleNow = Math.floor(elapsed / cycleDur) + 1;
  const totalCycles = format === 'cycles' ? cycles : Math.ceil(totalDur / cycleDur);

  // вибро + звук на смену фазы (во время рендера breathing-фазы)
  useEffect(() => {
    if (phase !== 'breathing' || leadIn > 0) return;   // во время отсчёта фаз ещё нет
    const id = `${phaseIdx}-${cycleNow}`;
    if (id !== lastPhaseRef.current) {
      lastPhaseRef.current = id;
      // Сигнал зависит от ФАЗЫ: вдох — тон вверх, выдох — вниз, задержка — ровно.
      // Раньше на все три шёл один и тот же щелчок, и с закрытыми глазами понять,
      // что началось, было нельзя — а дыхание именно так и делают.
      if (curPhase.type === 'inhale') sndBreathIn();
      else if (curPhase.type === 'exhale') sndBreathOut();
      else sndBreathHold();
    }
  }, [phaseIdx, cycleNow, phase, curPhase.type, leadIn]);

  const phaseLabel = (p: PhaseType) =>
    p === 'inhale' ? t('brInhale') : p === 'exhale' ? t('brExhale') : t('brHold');

  // ─── Wim Hof ветка ───
  const startWim = () => {
    setWimRound(1); setWimStage('breaths'); setWimBreath(0); setWimHoldSec(0);
    setPhase('breathing');
    runWimBreaths();
  };
  const runWimBreaths = () => {
    setWimStage('breaths'); setWimBreath(0);
    let n = 0;
    wimTimerRef.current = setInterval(() => {
      n += 1; setWimBreath(n); hapticMedium(); sndTap();
      if (n >= WIM_BREATHS) { if (wimTimerRef.current) clearInterval(wimTimerRef.current); setWimStage('hold'); runWimHold(); }
    }, 1800);   // ~1.8с на полный вдох-выдох
  };
  const runWimHold = () => {
    setWimHoldSec(0);
    const start = gameNow();
    wimTimerRef.current = setInterval(() => { setWimHoldSec(Math.floor((gameNow() - start) / 1000)); }, 250);
  };
  const wimReleaseHold = () => {   // игрок не может больше держать → восстановит. вдох 15с
    if (wimTimerRef.current) clearInterval(wimTimerRef.current);
    setWimStage('recover');
    let s = 15;
    setWimHoldSec(s);
    wimTimerRef.current = setInterval(() => {
      s -= 1; setWimHoldSec(s);
      if (s <= 0) {
        if (wimTimerRef.current) clearInterval(wimTimerRef.current);
        if (wimRound >= WIM_ROUNDS) { finish('wimhof'); }
        else { setWimRound((r) => r + 1); runWimBreaths(); }
      }
    }, 1000);
  };

  // ─────────── РЕНДЕР ───────────
  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="flower-outline" size={44} color={ON_GRAD.color} />
        <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{t('breathing')}</Text>
        <Text style={[styles.configDesc, { color: ON_GRAD_SOFT }]}>{t('breathingDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="breathingIntroDesc" benefits={BREATH_BENEFITS} accent={GRADIENT[0]} />

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('brTechniqueLabel')}</Text>
        {TECHNIQUES.map((x) => (
          <TouchableOpacity
            accessibilityRole="button" key={x.key}
            style={[styles.techRow, techKey === x.key
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => setTechKey(x.key)}>
            {/* Мини-фигура на карточке: квадрат / треугольник / круг видно ДО запуска,
                и техники перестают быть одинаковыми строчками текста. Рисуем тем же
                компонентом, что и в сессии, — форма не разойдётся с настоящей. */}
            <View style={{ width: 40, height: 40, marginRight: 10 }}>
              <BreathShape
                phases={x.phases}
                phaseIdx={0}
                local={0}
                size={40}
                colors={techKey === x.key ? ['#FFFFFF', '#FFFFFF'] : [GRADIENT[0], GRADIENT[1]]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: '100%' }}>
                <Text style={[styles.techName, { color: techKey === x.key ? '#FFF' : colors.text }]}>
                  {t(x.nameKey)}{x.special === 'wimhof' ? '  ⚠️' : ''}
                </Text>
                {/* Ритм — второй, мелким: он справка, а не название техники. */}
                {!!rhythmOf(x) && (
                  <Text style={[styles.techRhythm, { color: techKey === x.key ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>
                    {rhythmOf(x)}
                  </Text>
                )}
              </View>
              <Text style={[styles.techDesc, { color: techKey === x.key ? 'rgba(255,255,255,0.85)' : colors.textSecondary }]}>
                {t(x.descKey)}
              </Text>
            </View>
            {techKey === x.key && <Ionicons name="checkmark-circle" size={22} color="#FFF" />}
          </TouchableOpacity>
        ))}
      </View>

      {tech.special !== 'wimhof' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('brFormatLabel')}</Text>
          <View style={styles.optionButtons}>
            <TouchableOpacity
              accessibilityRole="button" style={[styles.modeButton, format === 'cycles'
              ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setFormat('cycles')}>
              <Text style={[styles.modeButtonText, { color: format === 'cycles' ? '#FFF' : colors.text }]}>{t('brByCycles')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" style={[styles.modeButton, format === 'time'
              ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setFormat('time')}>
              <Text style={[styles.modeButtonText, { color: format === 'time' ? '#FFF' : colors.text }]}>{t('brByTime')}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.optionButtons, { marginTop: 8 }]}>
            {format === 'cycles'
              ? CYCLE_OPTIONS.map((c) => (
                <TouchableOpacity
                  accessibilityRole="button" key={c} style={[styles.modeButton, cycles === c
                  ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => setCycles(c)}>
                  <Text style={[styles.modeButtonText, { color: cycles === c ? '#FFF' : colors.text }]}>{c} {t('brCyclesUnit')}</Text>
                </TouchableOpacity>
              ))
              : TIME_OPTIONS.map((m) => (
                <TouchableOpacity
                  accessibilityRole="button" key={m} style={[styles.modeButton, timeMin === m
                  ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => setTimeMin(m)}>
                  <Text style={[styles.modeButtonText, { color: timeMin === m ? '#FFF' : colors.text }]}>{m} {t('unitMin')}</Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>
      )}

      <LevelProgressMap bestLevel={runs.best}
        gameId="breathing"
        currentLevel={runs.level}
        maxLevel={Math.max(15, runs.level)}
        colors={colors}
        language={language}
        countsRuns
      />
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={[styles.startBtnText, { color: ON_GRAD.color }]}>{t('start')}</Text>
        </GradientSurface>
      </TouchableOpacity>
      </View>
    </View>
  );

  const renderWarning = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer}>
      <LinearGradient colors={WIM_GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="warning-outline" size={44} color={ON_WIM.color} />
        <Text style={[styles.configTitle, { color: ON_WIM.color }]}>{t('brWimWarnTitle')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.warnText, { color: colors.text }]}>{t('brWimWarnBody')}</Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startWim}>
        <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={[styles.startBtnText, { color: ON_GRAD.color }]}>{t('brWimAgree')}</Text>
        </GradientSurface>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button" style={[styles.homeBtn, { borderColor: colors.border }]} onPress={() => setPhase('config')}>
        <Text style={[styles.homeBtnText, { color: colors.text }]}>{t('back') !== 'back' ? t('back') : 'OK'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  /**
   * Итог — общим экраном «уровень пройден»: только он пишет звёзды, считает серию
   * чистых и тикает глаз-разрядку. Свой экран поздравления шёл мимо него.
   *
   * ⚠️ ТРИ ЗВЕЗДЫ ЗА ЗАВЕРШЁННЫЙ ПОДХОД. Дыхание нельзя сделать «хуже»: его либо
   * довели до конца, либо прекратили. Оценивать расслабление шкалой — противоречие.
   */
  const renderDone = () => (
    <LevelCleared
      gameId="breathing"
      level={Math.max(1, runs.level - 1)}
      stars={3}
      gradient={GRADIENT}
      language={language}
      colors={colors}
      onContinue={() => setPhase('config')}
      onStop={() => goBackOrHome()}
      stopKind="exit"   // onStop уводит С ЭКРАНА игры (goBackOrHome), а не к настройкам → подпись «На главную»
    />
  );

  // дыхательная фаза — на едином каркасе GameShell: счётчики в статс-строке,
  // СТОП — служебное действие, поэтому в шапке (низ каркаса значит «ответ игрока»)
  if (phase === 'breathing') {
    const isWim = tech.special === 'wimhof';
    const size = circleMax * scaleNow;
    const remainTotal = Math.max(0, Math.ceil(totalDur - elapsed));
    return (
      <GameShell
        title={t('breathing')}
        onBack={() => goBackOrHome()}
        stats={
          <View style={styles.statsRow}>
            {/* Шаг комплекса. Дыхание — единственная игра без итогового экрана
                GameResult, а именно он показывает «шаг N из M». Внутри комплекса
                экран выглядел как отдельно запущенная игра, и человек терял нить:
                «всё в разнобой, ничего не понятно» (репорт Вали, v1.173). */}
            {warmup.active && warmup.meta && (
              <Text style={[styles.exStep, { color: colors.primary, fontWeight: '900' }]}>
                {t('warmupStepOf')
                  .replace('{n}', String(warmup.currentIdx + 1))
                  .replace('{m}', String(warmup.meta.steps.length))}
              </Text>
            )}
            {isWim ? (
              <Text style={[styles.exStep, { color: colors.textSecondary }]}>{t('round')} {wimRound}/{WIM_ROUNDS}</Text>
            ) : (
              <>
                <Text style={[styles.exStep, { color: colors.textSecondary }]}>{t('hud_cycle')} {Math.min(cycleNow, totalCycles)}/{totalCycles}</Text>
                {/* v1.157 (репорт Вали «выдох слишком длинный, вдох короткий»): показываем
                    ВЫБРАННУЮ технику и её ритм. Тайминги менять нельзя — асимметрия это суть
                    методик (4-7-8 Вейля, physiological sigh: длинный выдох включает
                    парасимпатику). Но раньше на экране был только счётчик, человек не помнил,
                    что сам выбрал 4-7-8 → длинный выдох читался как баг. Теперь ритм на виду. */}
                <Text style={[styles.exStep, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t(tech.nameKey)} · {tech.phases.map((p) => p.sec).join('–')}
                </Text>
                <Text style={[styles.exTimer, { color: colors.text }]}>{t('timeLeftLabel')} {remainTotal}{t('secShort') !== 'secShort' ? t('secShort') : 's'}</Text>
              </>
            )}
          </View>
        }
        /* «СТОП» обрывает сеанс — это служебное действие, и по правилу каркаса
           оно живёт в шапке. Внизу его держать нельзя: нижняя полоса во всём
           приложении означает ответ игрока, и рефлекс «бей вниз» не должен
           заканчивать упражнение. Низ у дыхания теперь пуст — круг дышит выше. */
        headerActions={
          <GameAuxBar>
            <GameAuxAction icon="stop-circle" label={t('btn_stop')} danger onPress={stop} />
          </GameAuxBar>
        }
      >
        {isWim ? (
          <View style={styles.fieldCol}>
            <View style={styles.circleWrap}>
              {wimStage === 'breaths' && (
                <View style={[styles.wimBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.phaseText, { color: colors.text }]}>{t('brWimBreathe')}</Text>
                  <Text style={[styles.wimBig, { color: GRADIENT[0] }]}>{wimBreath}/{WIM_BREATHS}</Text>
                  <Text style={[styles.focusSub, { color: colors.textSecondary }]}>{t('brWimBreatheHint')}</Text>
                </View>
              )}
              {wimStage === 'hold' && (
                <TouchableOpacity
                  accessibilityRole="button" style={[styles.wimBox, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={wimReleaseHold}>
                  <Text style={[styles.phaseText, { color: colors.text }]}>{t('brWimHold')}</Text>
                  <Text style={[styles.wimBig, { color: GRADIENT[0] }]}>{wimHoldSec}{t('secShort') !== 'secShort' ? t('secShort') : 's'}</Text>
                  <Text style={[styles.focusSub, { color: colors.textSecondary }]}>{t('brWimHoldHint')}</Text>
                </TouchableOpacity>
              )}
              {wimStage === 'recover' && (
                <View style={[styles.wimBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.phaseText, { color: colors.text }]}>{t('brWimRecover')}</Text>
                  <Text style={[styles.wimBig, { color: GRADIENT[0] }]}>{wimHoldSec}{t('secShort') !== 'secShort' ? t('secShort') : 's'}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.fieldCol}>
            {/* Форма зависит от техники: квадрат на 4 фазы, треугольник на 3,
                круг на 2. Раньше все семь техник рисовались одним пульсирующим
                кругом, и метод по картинке не читался вовсе (задача Дениса 02.08).
                Внутри фигуры — дышащий круг: он остаётся, потому что показывает
                наполнение лёгких, чего контур не передаёт. */}
            <View style={styles.circleWrap}>
              <BreathShape
                phases={tech.phases}
                phaseIdx={phaseIdx}
                local={local}
                size={circleMax}
                colors={[GRADIENT[0], GRADIENT[1]]}
              >
                <View style={{
                  width: size * 0.62, height: size * 0.62, borderRadius: size * 0.31,
                  backgroundColor: GRADIENT[0], opacity: 0.18, position: 'absolute',
                }} />
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  {leadIn > 0 ? (
                    <>
                      <Text style={[styles.phaseText, { color: colors.textSecondary }]}>{t('brGetReady')}</Text>
                      <Text style={[styles.phaseCount, { color: GRADIENT[0] }]}>{leadIn}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.phaseText, { color: colors.text }]}>{phaseLabel(curPhase.type)}</Text>
                      <Text style={[styles.phaseCount, { color: GRADIENT[0] }]}>{phaseRemain}</Text>
                    </>
                  )}
                </View>
              </BreathShape>
            </View>
            {/* v1.164 (репорт Вали «выдох слишком длинный, вдох короткий»): асимметрия
                в 4-7-8 намеренная — длинный выдох и есть то, что тормозит пульс. Раньше
                это было написано только в описании техники на экране настройки, а внутри
                сессии выглядело как перекос. Говорим прямо в момент, когда это чувствуется,
                и рядом даём уйти на симметричный «квадрат» одним нажатием. */}
            {techKey === 'calm478' && elapsed >= 6 && elapsed < 16 && (
              <View style={{ alignItems: 'center', marginTop: 10, paddingHorizontal: 20, gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                  {t('brLongExhaleWhy')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('brSwitchToBox')}
                  onPress={() => { setTechKey('box'); stop(); }}
                  style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{t('brSwitchToBox')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {techKey === 'calm478' && elapsed < 6 && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 }}>
                {t('brDimHint')}
              </Text>
            )}
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(elapsed / totalDur) * 100}%`, backgroundColor: GRADIENT[0] }]} />
            </View>
          </View>
        )}
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('breathing')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'warning' && renderWarning()}
      {phase === 'done' && renderDone()}
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
  // цвет НЕ здесь: плашек три (день / ночь / предупреждение), у каждой свой — см. места использования
  configTitle: { fontSize: 22, fontWeight: '700' },
  configDesc: { fontSize: 13, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  techRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 8 },
  techName: { fontSize: 15, fontWeight: '700' },
  techRhythm: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  techDesc: { fontSize: 12, marginTop: 2 },
  warnText: { fontSize: 14, lineHeight: 21 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { fontSize: 16, fontWeight: '700' },
  fieldCol: { flex: 1, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, gap: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  exStep: { fontSize: 14, fontWeight: '700' },
  exTimer: { fontSize: 16, fontWeight: '800' },
  // ⚠️ Осиротело после разводки слотов: СТОП уехал в шапку (GameAuxAction).
  // Стили ниже (stopBtn, stopBtnText) больше никем не берутся; оставлены
  // намеренно — удаление чужого кода в этом проекте только с разрешения.
  stopBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 16, borderWidth: 1 },
  stopBtnText: { fontSize: 14, fontWeight: '700' },
  circleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  phaseText: { fontSize: 22, fontWeight: '700' },
  phaseCount: { fontSize: 44, fontWeight: '900', marginTop: 4 },
  wimBox: { width: 260, height: 260, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  wimBig: { fontSize: 48, fontWeight: '900' },
  focusSub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  progressBar: { width: '100%', height: 6, borderRadius: 3, backgroundColor: 'rgba(127,127,127,0.25)', overflow: 'hidden', marginTop: 4 },
  progressFill: { height: 6, borderRadius: 3 },
  doneContainer: { padding: 16, gap: 14, flex: 1, justifyContent: 'center' },
  doneCard: { padding: 28, borderRadius: 16, alignItems: 'center', gap: 10 },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  doneSub: { fontSize: 14, color: '#FFF', opacity: 0.95, textAlign: 'center', fontWeight: '600' },
  hrvNote: { fontSize: 13, lineHeight: 19 },
  homeBtn: { paddingVertical: 14, borderRadius: 16, alignItems: 'center', borderWidth: 1 },
  homeBtnText: { fontSize: 15, fontWeight: '700' },
});
