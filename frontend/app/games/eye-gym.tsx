import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { eyeGymGeometry } from '@/src/services/eyeGymGeometry';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameModeSwitch from '@/src/components/GameModeSwitch';
import { EYE_GYM_MAX_LEVEL, eyeGymLevel, eyeGymLevelMinutes } from '@/src/services/eyeGymLevels';

const GRADIENT = ['#43cea2', '#185a9d'];
const EYE_BENEFITS = [
  { icon: 'eye-outline',      textKey: 'benefitEye1' },
  { icon: 'sunny-outline',    textKey: 'benefitEye2' },
  { icon: 'happy-outline',    textKey: 'benefitEye3' },
];

type GamePhase = 'intro' | 'config' | 'exercise' | 'done';
type Pattern = 'directions' | 'horizontal' | 'vertical' | 'circle' | 'figure8' | 'focus' | 'converge' | 'palming';

interface Step { key: string; pattern: Pattern; dur: number; instrKey: string }

// Последовательность фаз. Длительности базовые (для «3 мин»); для «5 мин» масштабируем.
const SEQUENCE: Step[] = [
  { key: 'warmup',   pattern: 'directions', dur: 24, instrKey: 'eyeInstrWarmup' },
  { key: 'pursuitH', pattern: 'horizontal', dur: 18, instrKey: 'eyeInstrPursuit' },
  { key: 'pursuitV', pattern: 'vertical',   dur: 18, instrKey: 'eyeInstrPursuit' },
  { key: 'circle',   pattern: 'circle',     dur: 22, instrKey: 'eyeInstrPursuit' },
  { key: 'figure8',  pattern: 'figure8',    dur: 22, instrKey: 'eyeInstrPursuit' },
  { key: 'focusFar', pattern: 'focus',      dur: 20, instrKey: 'eyeInstrFocusFar' },
  { key: 'converge', pattern: 'converge',   dur: 20, instrKey: 'eyeInstrConverge' },
  { key: 'palming',  pattern: 'palming',    dur: 30, instrKey: 'eyeInstrPalming' },
];

/** Полная последовательность в базовых секундах — от неё считается длина уровня. */
const BASE_TOTAL_SEC = SEQUENCE.reduce((a, s) => a + s.dur, 0);

const DIRECTIONS = [
  [0, -1], [0.85, -0.85], [1, 0], [0.85, 0.85],
  [0, 1], [-0.85, 0.85], [-1, 0], [-0.85, -0.85],
];

// Размах раздельный: RX по горизонтали (во всю ширину экрана = макс угол хода глаз), RY по вертикали.
function dotFor(pattern: Pattern, local: number, localSec: number, RX: number, RY: number, cx: number, cy: number, speed: number) {
  const TAU = Math.PI * 2;
  const l = local * speed, ls = localSec * speed;   // speed: 0.7 медл / 1 норма / 1.4 быстро
  switch (pattern) {
    case 'directions': {
      const idx = Math.floor(ls / 2.6) % DIRECTIONS.length;
      const [dx, dy] = DIRECTIONS[idx];
      return { x: cx + dx * RX, y: cy + dy * RY, size: 30, big: true };
    }
    case 'horizontal':
      return { x: cx + RX * Math.sin(TAU * 3 * l), y: cy, size: 26, big: false };
    case 'vertical':
      return { x: cx, y: cy + RY * Math.sin(TAU * 3 * l), size: 26, big: false };
    case 'circle': {
      const a = TAU * 3 * l;
      return { x: cx + RX * Math.cos(a), y: cy + RY * Math.sin(a), size: 26, big: false };  // эллипс во всю ширину
    }
    case 'figure8': {
      const a = TAU * 2 * l;                 // лемниската Жероно → восьмёрка (растянута по ширине)
      return { x: cx + RX * Math.sin(a), y: cy + RY * Math.sin(a) * Math.cos(a), size: 26, big: false };
    }
    case 'converge': {
      const rep = (ls % 5) / 5;              // 0..1 каждые 5 сек: далеко→близко
      return { x: cx, y: cy - RY + rep * RY, size: 14 + rep * 40, big: false };
    }
    default:
      return { x: cx, y: cy, size: 26, big: false };
  }
}

export default function EyeGymGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, autostart } = useGamePreset();
  useEffect(() => { if (autostart) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [scale, setScale] = useState(1);               // 0.4 = ~1 мин, 1 = ~3, 1.7 = ~5
  const [speed, setSpeed] = useState(1);               // скорость точки: 0.7 медл / 1 норма / 1.4 быстро
  const [mode, setMode] = useState<'full' | 'pursuit' | 'focus' | 'relax'>('full');
  /**
   * Уровни против свободного режима — единый канон Дениса «уровни / свободно / зарядка».
   *
   * В гимнастике уровень не декоративный: он поднимает ДВА реальных параметра
   * нагрузки — длительность проработки и скорость точки (см. eyeGymLevels.ts).
   * Свободный режим оставляет прежние ручные настройки: они никуда не делись,
   * просто перестали быть единственным способом играть.
   *
   * Пресет (зарядка, вызов дня) — всегда по уровню: там человек не настраивает,
   * там ему выдают нагрузку по его текущему уровню.
   */
  const lvl = usePersistentLevel('eye_gym');
  const [playMode, setPlayMode] = useState<'levels' | 'free'>('levels');
  const byLevel = playMode === 'levels' || isPreset;
  const levelCfg = eyeGymLevel(lvl.level);
  const effScale = byLevel ? levelCfg.scale : scale;
  const effSpeed = byLevel ? levelCfg.speed : speed;
  const [elapsed, setElapsed] = useState(0);
  const [fieldSize, setFieldSize] = useState<{ width: number; height: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Фактическая область GameShell уже исключает шапку, toolbar и safe-area.
  // Старое `height - 300` этого не знало: нижняя точка уходила под системную
  // навигацию, а в landscape принудительный min-height переполнял поле.
  const { boardW, boardH, cx, cy, RX, RY } = eyeGymGeometry({ width, height }, fieldSize);

  // мини-режим: полный / только слежение / только фокус вдаль / только пальминг (отдых)
  const MODE_PHASES: Record<string, string[] | null> = {
    full: null,
    pursuit: ['warmup', 'pursuitH', 'pursuitV', 'circle', 'figure8'],
    focus: ['focusFar', 'converge'],
    relax: ['palming'],
  };
  // По уровню идёт ПОЛНАЯ последовательность: урезанные режимы (только слежение,
  // только пальминг) — это выбор человека под настроение, а не ступень нагрузки.
  const effMode = byLevel ? 'full' : mode;
  const sel = MODE_PHASES[effMode];
  const modeMul = effMode === 'relax' ? 4 : effMode === 'focus' ? 2.5 : 1;   // короткие режимы — длиннее, чтобы был смысл
  const steps = (sel ? SEQUENCE.filter((s) => sel.includes(s.key)) : SEQUENCE)
    .map((s) => ({ ...s, dur: Math.max(8, Math.round(s.dur * effScale * modeMul)) }));
  const totalDur = steps.reduce((acc, s) => acc + s.dur, 0);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startGame = () => {
    setElapsed(0);
    setPhase('exercise');
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const tt = (Date.now() - start) / 1000;
      if (tt >= totalDur) {
        if (timerRef.current) clearInterval(timerRef.current);
        setElapsed(totalDur);
        finish();
      } else {
        setElapsed(tt);
      }
    }, 33);
  };

  const finish = async () => {
    const doneLevel = lvl.level;
    setPhase('done');
    // Проработку доводят до конца или бросают — провалить её нельзя. Значит уровень
    // засчитан фактом завершения: следующий раз нагрузка будет на ступень выше.
    // В свободном режиме уровень не трогаем — там человек сам выбрал настройки.
    if (byLevel && doneLevel < EYE_GYM_MAX_LEVEL) lvl.reach(doneLevel + 1);
    try {
      await saveSession({
        game_type: 'eye_gym',
        score: Math.round(totalDur),
        time_seconds: totalDur,
        difficulty: effScale > 1 ? '5min' : '3min',
        mode: `${steps.length}steps`,
        errors: 0,
        // level читает getMaxLevelFromSessions — по нему уровень восстанавливается,
        // если локальный ключ прогресса потерян. Пишем ТОЛЬКО в режиме уровней:
        // свободная партия на медленных настройках иначе занижала бы достигнутое.
        details: byLevel
          ? { duration_sec: totalDur, steps: steps.length, level: doneLevel }
          : { duration_sec: totalDur, steps: steps.length },
      });
    } catch (e) { console.error(e); }
  };

  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); setPhase('config'); };

  // текущий шаг по накопленному времени
  let acc = 0, stepIdx = 0, local = 0, localSec = 0;
  for (let i = 0; i < steps.length; i++) {
    if (elapsed < acc + steps[i].dur) { stepIdx = i; localSec = elapsed - acc; local = localSec / steps[i].dur; break; }
    acc += steps[i].dur;
    stepIdx = i; localSec = steps[i].dur; local = 1;
  }
  const step = steps[stepIdx];
  const remainTotal = Math.max(0, Math.ceil(totalDur - elapsed));

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="eye" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('eyeGym')}</Text>
        <Text style={styles.configDesc}>{t('eyeGymDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="eyeGymIntroDesc" benefits={EYE_BENEFITS} accent={GRADIENT[0]} />

      {/* Уровни / свободно — общий переключатель, тот же во всех играх. */}
      <GameModeSwitch mode={playMode} onChange={setPlayMode} colors={colors} accent={GRADIENT[0]} t={t} />

      {byLevel && (
        <LevelProgressMap
          gameId="eye_gym"
          currentLevel={lvl.level} onPickLevel={lvl.pick}
          maxLevel={EYE_GYM_MAX_LEVEL}
          colors={colors}
          language={language}
          levelLabel={(n) => `${eyeGymLevelMinutes(n, BASE_TOTAL_SEC)}′`}
        />
      )}

      {!byLevel && (<>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('eyeDurationLabel')}</Text>
        <View style={styles.optionButtons}>
          {[{ s: 0.4, k: 'eye1min' }, { s: 1, k: 'eye3min' }, { s: 1.7, k: 'eye5min' }].map((o) => (
            <TouchableOpacity
              accessibilityRole="button" key={o.k} style={[styles.modeButton, scale === o.s
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setScale(o.s)}>
              <Text style={[styles.modeButtonText, { color: scale === o.s ? '#FFF' : colors.text }]}>{t(o.k)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('eyeSpeedLabel')}</Text>
        <View style={styles.optionButtons}>
          {[{ v: 0.7, k: 'eyeSlow' }, { v: 1, k: 'eyeNorm' }, { v: 1.4, k: 'eyeFast' }].map((o) => (
            <TouchableOpacity
              accessibilityRole="button" key={o.k} style={[styles.modeButton, speed === o.v
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setSpeed(o.v)}>
              <Text style={[styles.modeButtonText, { color: speed === o.v ? '#FFF' : colors.text }]}>{t(o.k)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('eyeModeLabel')}</Text>
        <View style={styles.optionButtons}>
          {([['full', 'eyeModeFull'], ['pursuit', 'eyeModePursuit'], ['focus', 'eyeModeFocus'], ['relax', 'eyeModeRelax']] as const).map(([m, k]) => (
            <TouchableOpacity
              accessibilityRole="button" key={m} style={[styles.modeButton, mode === m
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setMode(m)}>
              <Text style={[styles.modeButtonText, { color: mode === m ? '#FFF' : colors.text }]}>{t(k)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      </>)}
      <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('eyeDisclaimer')}</Text>
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      </View>
    </View>
  );

  /**
   * Итог — общим экраном «уровень пройден»: только он пишет звёзды по уровням,
   * считает серию чистых и тикает глаз-разрядку. Свой экран поздравления шёл мимо
   * него, и узлы на тропинке гимнастики оставались пустыми.
   *
   * ⚠️ ЗВЁЗДЫ ЗДЕСЬ ВСЕГДА ТРИ, И ЭТО ЧЕСТНО. Проработку нельзя сделать «хуже» —
   * её либо довели до конца, либо бросили. Оценивать не по чему, а выдумывать
   * оценку значило бы врать шкалой.
   */
  const renderDone = () => (
    <LevelCleared
      gameId="eye_gym"
      level={byLevel ? Math.max(1, lvl.level - 1) : 1}
      stars={3}
      gradient={GRADIENT}
      language={language}
      colors={colors}
      onContinue={() => setPhase('config')}
      onStop={() => goBackOrHome()}
    />
  );

  // фаза упражнения — на едином каркасе GameShell: шаг/таймер в статс-строке, СТОП прибит к низу
  if (phase === 'exercise') {
    const isPalming = step.pattern === 'palming';
    const isFocus = step.pattern === 'focus';
    const dot = (!isPalming && !isFocus) ? dotFor(step.pattern, local, localSec, RX, RY, cx, cy, effSpeed) : null;
    return (
      <GameShell
        title={t('eyeGym')}
        onBack={() => goBackOrHome()}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.exStep, { color: colors.textSecondary }]}>{stepIdx + 1}/{steps.length}</Text>
            <Text style={[styles.exTimer, { color: colors.text }]}>{remainTotal}{t('secShort') !== 'secShort' ? t('secShort') : 's'}</Text>
          </View>
        }
        toolbar={
          <TouchableOpacity
            accessibilityRole="button" style={[styles.stopBtn, { borderColor: colors.border }]} onPress={stop}>
            <Text style={[styles.stopBtnText, { color: colors.textSecondary }]}>{t('btn_stop')}</Text>
          </TouchableOpacity>
        }
      >
        <View
          style={styles.fieldCol}
          onLayout={({ nativeEvent: { layout } }) => {
            const next = { width: Math.round(layout.width), height: Math.round(layout.height) };
            setFieldSize((prev) => prev?.width === next.width && prev?.height === next.height ? prev : next);
          }}
        >
          <Text style={[styles.instr, { color: colors.text }]}>{t(step.instrKey)}</Text>

          {isPalming ? (
            <View style={[styles.stage, { width: boardW, height: boardH, backgroundColor: '#000', borderColor: colors.border }]}>
              <Ionicons name="hand-left-outline" size={64} color="#1f2937" />
              <Text style={styles.palmHint}>{t('eyePalmBlink')}</Text>
            </View>
          ) : isFocus ? (
            <View style={[styles.stage, { width: boardW, height: boardH, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="telescope-outline" size={56} color={GRADIENT[0]} />
              <Text style={[styles.focusBig, { color: colors.text }]}>{Math.max(0, Math.ceil(step.dur - localSec))}{t('secShort') !== 'secShort' ? t('secShort') : 's'}</Text>
              <Text style={[styles.focusSub, { color: colors.textSecondary }]}>{t('eyeFocusSub')}</Text>
            </View>
          ) : (
            <View style={[styles.stage, { width: boardW, height: boardH, backgroundColor: colors.surface, borderColor: colors.border }]}>
              {dot && (
                <View style={{
                  position: 'absolute',
                  left: dot.x - dot.size / 2,
                  top: dot.y - dot.size / 2,
                  width: dot.size, height: dot.size, borderRadius: dot.size / 2,
                  backgroundColor: GRADIENT[0],
                  shadowColor: GRADIENT[0], shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                }} />
              )}
            </View>
          )}

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(elapsed / totalDur) * 100}%`, backgroundColor: GRADIENT[0] }]} />
          </View>
        </View>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('eyeGym')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'done' && renderDone()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  // Прибитый низ настроек: кнопка «начать» всегда на экране, над системной навигацией.
  // Раньше она была последней в прокрутке — на невысоком экране до неё приходилось
  // доскроллить, а решение «во что играю» оказывалось в двух разных местах.
  // Отступ слева — под плавающую кнопку отзыва, она висит поверх и накрывала бы её.
  configSticky: { paddingTop: 10, paddingHorizontal: 16, paddingLeft: 68, borderTopWidth: StyleSheet.hairlineWidth },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  disclaimer: { fontSize: 11.5, lineHeight: 16, textAlign: 'center', paddingHorizontal: 4 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fieldCol: { flex: 1, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, gap: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  exStep: { fontSize: 14, fontWeight: '700' },
  exTimer: { fontSize: 16, fontWeight: '800' },
  stopBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 16, borderWidth: 1 },
  stopBtnText: { fontSize: 14, fontWeight: '700' },
  instr: { fontSize: 15, fontWeight: '600', textAlign: 'center', minHeight: 40, paddingHorizontal: 8 },
  stage: { borderRadius: 16, borderWidth: 2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', gap: 10 },
  palmHint: { color: '#374151', fontSize: 14, fontWeight: '600' },
  focusBig: { fontSize: 40, fontWeight: '900' },
  focusSub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  progressBar: { width: '100%', height: 6, borderRadius: 3, backgroundColor: 'rgba(127,127,127,0.25)', overflow: 'hidden', marginTop: 4 },
  progressFill: { height: 6, borderRadius: 3 },
  doneContainer: { padding: 16, gap: 14, flex: 1, justifyContent: 'center' },
  doneCard: { padding: 28, borderRadius: 16, alignItems: 'center', gap: 10 },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  doneSub: { fontSize: 14, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  homeBtn: { paddingVertical: 14, borderRadius: 16, alignItems: 'center', borderWidth: 1 },
  homeBtnText: { fontSize: 15, fontWeight: '700' },
});
