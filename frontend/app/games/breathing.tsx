import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveSession } from '@/src/services/api';
import GameIntro from '@/src/components/GameIntro';
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { hapticMedium } from '@/src/components/juice/haptics';
import { sndTap } from '@/src/services/feedback';

const GRADIENT = ['#5b86e5', '#36d1dc'];   // спокойный сине-бирюзовый (отлично от eye-gym)
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

export default function BreathingGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { profile } = useProfile();
  const { width, height } = useWindowDimensions();

  const { isPreset } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [techKey, setTechKey] = useState('box');
  const [format, setFormat] = useState<Format>('cycles');
  const [cycles, setCycles] = useState(6);
  const [timeMin, setTimeMin] = useState(3);
  const [elapsed, setElapsed] = useState(0);
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
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const tt = (Date.now() - start) / 1000;
      if (tt >= totalDur) { if (timerRef.current) clearInterval(timerRef.current); setElapsed(totalDur); finish(); }
      else setElapsed(tt);
    }, 50);
  };

  const finish = async (label?: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (wimTimerRef.current) clearInterval(wimTimerRef.current);
    setPhase('done');
    bumpStreak();
    try {
      await saveSession({
        game_type: 'breathing',
        score: Math.round(totalDur),
        time_seconds: Math.round(totalDur),
        difficulty: label || tech.key,
        mode: format === 'cycles' ? `${cycles}cyc` : `${timeMin}min`,
        errors: 0,
        details: { technique: tech.key, format, dur: Math.round(totalDur) },
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
    if (phase !== 'breathing') return;
    const id = `${phaseIdx}-${cycleNow}`;
    if (id !== lastPhaseRef.current) {
      lastPhaseRef.current = id;
      hapticMedium();
      sndTap();
    }
  }, [phaseIdx, cycleNow, phase]);

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
    const start = Date.now();
    wimTimerRef.current = setInterval(() => { setWimHoldSec(Math.floor((Date.now() - start) / 1000)); }, 250);
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
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="flower-outline" size={44} color="#FFF" />
        <Text style={styles.configTitle}>{t('breathing')}</Text>
        <Text style={styles.configDesc}>{t('breathingDesc')}</Text>
      </LinearGradient>

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('brTechniqueLabel')}</Text>
        {TECHNIQUES.map((x) => (
          <TouchableOpacity key={x.key}
            style={[styles.techRow, techKey === x.key
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => setTechKey(x.key)}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.techName, { color: techKey === x.key ? '#FFF' : colors.text }]}>
                {t(x.nameKey)}{x.special === 'wimhof' ? '  ⚠️' : ''}
              </Text>
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
            <TouchableOpacity style={[styles.modeButton, format === 'cycles'
              ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setFormat('cycles')}>
              <Text style={[styles.modeButtonText, { color: format === 'cycles' ? '#FFF' : colors.text }]}>{t('brByCycles')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeButton, format === 'time'
              ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setFormat('time')}>
              <Text style={[styles.modeButtonText, { color: format === 'time' ? '#FFF' : colors.text }]}>{t('brByTime')}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.optionButtons, { marginTop: 8 }]}>
            {format === 'cycles'
              ? CYCLE_OPTIONS.map((c) => (
                <TouchableOpacity key={c} style={[styles.modeButton, cycles === c
                  ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => setCycles(c)}>
                  <Text style={[styles.modeButtonText, { color: cycles === c ? '#FFF' : colors.text }]}>{c} {t('brCyclesUnit')}</Text>
                </TouchableOpacity>
              ))
              : TIME_OPTIONS.map((m) => (
                <TouchableOpacity key={m} style={[styles.modeButton, timeMin === m
                  ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => setTimeMin(m)}>
                  <Text style={[styles.modeButtonText, { color: timeMin === m ? '#FFF' : colors.text }]}>{m} {t('brMinUnit')}</Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderWarning = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer}>
      <LinearGradient colors={['#f7971e', '#ffd200']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="warning-outline" size={44} color="#FFF" />
        <Text style={styles.configTitle}>{t('brWimWarnTitle')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.warnText, { color: colors.text }]}>{t('brWimWarnBody')}</Text>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startWim}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('brWimAgree')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.homeBtn, { borderColor: colors.border }]} onPress={() => setPhase('config')}>
        <Text style={[styles.homeBtnText, { color: colors.text }]}>{t('back') !== 'back' ? t('back') : 'OK'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderDone = () => (
    <View style={styles.doneContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.doneCard}>
        <Ionicons name="checkmark-circle" size={60} color="#FFF" />
        <Text style={styles.doneTitle}>{t('brDoneTitle')}</Text>
        <Text style={styles.doneSub}>🔥 {t('brStreak')}: {streak} · {t('brTotal')}: {totalSessions}</Text>
      </LinearGradient>
      {techKey === 'coherent' && (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.hrvNote, { color: colors.textSecondary }]}>💗 {t('brHrvNote')}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.startBtn} onPress={() => setPhase('config')}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('playAgain') !== 'playAgain' ? t('playAgain') : t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.homeBtn, { borderColor: colors.border }]} onPress={() => goBackOrHome()}>
        <Text style={[styles.homeBtnText, { color: colors.text }]}>{t('goHome') !== 'goHome' ? t('goHome') : 'OK'}</Text>
      </TouchableOpacity>
    </View>
  );

  // дыхательная фаза — на едином каркасе GameShell: счётчики в статс-строке, СТОП прибит к низу
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
            {isWim ? (
              <Text style={[styles.exStep, { color: colors.textSecondary }]}>{t('brWimRound')} {wimRound}/{WIM_ROUNDS}</Text>
            ) : (
              <>
                <Text style={[styles.exStep, { color: colors.textSecondary }]}>{Math.min(cycleNow, totalCycles)}/{totalCycles}</Text>
                <Text style={[styles.exTimer, { color: colors.text }]}>{remainTotal}{t('secShort') !== 'secShort' ? t('secShort') : 's'}</Text>
              </>
            )}
          </View>
        }
        toolbar={
          <TouchableOpacity style={[styles.stopBtn, { borderColor: colors.border }]} onPress={stop}>
            <Text style={[styles.stopBtnText, { color: colors.textSecondary }]}>{t('btn_stop')}</Text>
          </TouchableOpacity>
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
                <TouchableOpacity style={[styles.wimBox, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={wimReleaseHold}>
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
            <View style={styles.circleWrap}>
              <View style={{
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: GRADIENT[0], opacity: 0.18,
                position: 'absolute',
              }} />
              <View style={{
                width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36,
                borderWidth: 3, borderColor: GRADIENT[1], alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={[styles.phaseText, { color: colors.text }]}>{phaseLabel(curPhase.type)}</Text>
                <Text style={[styles.phaseCount, { color: GRADIENT[0] }]}>{phaseRemain}</Text>
              </View>
            </View>
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
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('breathing')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="breathing" icon="flower-outline" gradient={GRADIENT as [string, string]}
          skillKey="skillRecovery" descriptionKey="breathingIntroDesc"
          benefits={BREATH_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'warning' && renderWarning()}
      {phase === 'done' && renderDone()}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  techRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 8 },
  techName: { fontSize: 15, fontWeight: '700' },
  techDesc: { fontSize: 12, marginTop: 2 },
  warnText: { fontSize: 14, lineHeight: 21 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fieldCol: { flex: 1, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, gap: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  exStep: { fontSize: 14, fontWeight: '700' },
  exTimer: { fontSize: 16, fontWeight: '800' },
  stopBtn: { paddingVertical: 10, paddingHorizontal: 30, borderRadius: 8, borderWidth: 1 },
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
  homeBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  homeBtnText: { fontSize: 15, fontWeight: '700' },
});
