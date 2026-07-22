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
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';

const GRADIENT = ['#16222a', '#3a6073'];
// Синергия: каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;
const FL_BENEFITS = [
  { icon: 'eye-outline',          textKey: 'benefitFl1' },
  { icon: 'flash-outline',        textKey: 'benefitFl2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitFl3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type TrialKind = 'congruent' | 'incongruent' | 'neutral';
type Direction = 'left' | 'right';

interface Trial { center: Direction; kind: TrialKind; flankers: Direction[] | null; }

// Сложность растёт ТРУДНОСТЬЮ, не временем: окно ответа сокращается + доля конфликтных
// (incongruent) стрелок растёт. Распределения = бывшая DIFF-таблица easy/medium/hard:
//   L1-5  — как easy   (50% congruent / 30% incongruent / 20% neutral), окно 3000→2200мс
//   L6-10 — как medium (40% / 45% / 15%),                               окно 2000→1600мс
//   L11-15— как hard   (30% / 65% / 5%),                                окно 1400→1000мс
function levelParams(level: number): { trials: number; windowMs: number; pCong: number; pIncong: number } {
  const trials = 20;
  if (level <= 5)  return { trials, windowMs: 3000 - (level - 1) * 200, pCong: 0.5, pIncong: 0.3 };
  if (level <= 10) return { trials, windowMs: 2000 - (level - 6) * 100, pCong: 0.4, pIncong: 0.45 };
  return { trials, windowMs: Math.max(1000, 1400 - (level - 11) * 100), pCong: 0.3, pIncong: 0.65 };
}

function makeTrial(pCong: number, pIncong: number): Trial {
  const center: Direction = Math.random() < 0.5 ? 'left' : 'right';
  // distribution of trial types comes from levelParams (ex-difficulty table)
  const r = Math.random();
  const kind: TrialKind = r < pCong ? 'congruent' : r < pCong + pIncong ? 'incongruent' : 'neutral';
  let flankers: Direction[] | null;
  if (kind === 'congruent') flankers = [center, center, center, center];
  else if (kind === 'incongruent') {
    const opp: Direction = center === 'left' ? 'right' : 'left';
    flankers = [opp, opp, opp, opp];
  } else flankers = null;
  return { center, kind, flankers };
}

export default function FlankerGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const lvl = usePersistentLevel('flanker');
  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  // пресет (зарядка) передаёт diff/trials; личная игра рулится уровнем
  const [difficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 20));

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ center: 'left', kind: 'congruent', flankers: ['left','left','left','left'] });
  const [showStim, setShowStim] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [clearedPassed, setClearedPassed] = useState(true);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByKind, setRtsByKind] = useState<Record<TrialKind, number[]>>({ congruent: [], incongruent: [], neutral: [] });

  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // рефы — таймеры (окно ответа) живут вне ре-рендера, без stale-closure на счётчиках
  const levelRef = useRef(1);
  const windowRef = useRef(3000);
  const pCongRef = useRef(0.4);
  const pIncongRef = useRef(0.45);
  const trialsTotalRef = useRef(20);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<Record<TrialKind, number[]>>({ congruent: [], incongruent: [], neutral: [] });
  const trialRef = useRef<Trial>({ center: 'left', kind: 'congruent', flankers: ['left','left','left','left'] });
  const answeredRef = useRef(true);
  const startTimeRef = useRef(0);
  const stimOnsetRef = useRef(0);

  useEffect(() => () => {
    if (stimTimerRef.current) clearTimeout(stimTimerRef.current);
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const newTrial = () => {
    setShowStim(false); setFeedback(null);
    const tr = makeTrial(pCongRef.current, pIncongRef.current);
    trialRef.current = tr;
    setTrial(tr);
    answeredRef.current = false;
    stimTimerRef.current = setTimeout(() => {
      stimOnsetRef.current = Date.now();
      setStimAt(Date.now());
      setShowStim(true);
      // окно ответа уровня: не успел — считается ошибкой (пропуск)
      deadlineTimerRef.current = setTimeout(() => handleMiss(), windowRef.current);
    }, 500 + Math.random() * 600);
  };

  const startGame = () => {
    // личная игра → уровень рулит; пресет (зарядка) → выбранный тир маппится в уровень
    const effLevel = isPreset ? ({ easy: 3, medium: 8, hard: 13 } as Record<Difficulty, number>)[difficulty] ?? 8 : lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    windowRef.current = p.windowMs;
    pCongRef.current = p.pCong;
    pIncongRef.current = p.pIncong;
    const total = isPreset ? trials : p.trials;   // в пресете длину задаёт зарядка
    trialsTotalRef.current = total;
    setTrials(total);
    hitsRef.current = 0; errorsRef.current = 0;
    rtsRef.current = { congruent: [], incongruent: [], neutral: [] };
    roundRef.current = 1;
    setHits(0); setErrors(0); setRtsByKind({ congruent: [], incongruent: [], neutral: [] }); setRound(1);
    setPhase('playing');
    startTimeRef.current = Date.now();
    newTrial();
  };

  const finish = async () => {
    const totalTime = (Date.now() - startTimeRef.current) / 1000;
    const all = rtsRef.current;
    const flatten = [...all.congruent, ...all.incongruent, ...all.neutral];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    const congMean = all.congruent.length ? all.congruent.reduce((a, b) => a + b, 0) / all.congruent.length : 0;
    const incongMean = all.incongruent.length ? all.incongruent.reduce((a, b) => a + b, 0) / all.incongruent.length : 0;
    const h = hitsRef.current;
    const e = errorsRef.current;
    // прохождение уровня: точность ≥80% (ошибка выбора и пропуск окна считаются одинаково)
    const accuracy = trialsTotalRef.current ? h / trialsTotalRef.current : 0;
    const passed = !isPreset && accuracy >= 0.8;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();   // гистерезис понижения: -1 уровень после 3 провалов подряд
    // непрерывный поток: уровневый заход (не пресет) ВСЕГДА в баннер cleared —
    // прошёл → «уровень N», не прошёл → passed={false} «почти, ещё раз» + авто-рестарт того же уровня.
    // пресет/зарядка остаётся тупиком-статистикой (result).
    // каждые BOSS_EVERY уровней (при чистом проходе) — босс-веха; иначе непрерывный поток как было.
    if (isPreset) setPhase('result');
    else if (passed && levelRef.current % BOSS_EVERY === 0) { setClearedPassed(true); setPhase('boss'); }
    else { setClearedPassed(passed); setPhase('cleared'); }
    try {
      await saveSession({
        game_type: 'flanker',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `${trialsTotalRef.current}t`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          flanker_effect_ms: Math.round(incongMean - congMean),
        },
      });
    } catch (err) { console.error(err); }
  };

  // конец попытки (ответ или пропуск) → пауза на фидбек → следующая или финиш
  const advance = () => {
    fbTimerRef.current = setTimeout(() => {
      if (roundRef.current >= trialsTotalRef.current) finish();
      else { roundRef.current += 1; setRound(roundRef.current); newTrial(); }
    }, 350);
  };

  const handleMiss = () => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    errorsRef.current += 1;
    setErrors(errorsRef.current);
    setShowStim(false);
    setFeedback('wrong');
    advance();
  };

  const handleAnswer = (chosen: Direction) => {
    if (!showStim || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = Date.now() - stimAt;
    const tr = trialRef.current;
    const ok = chosen === tr.center;
    if (ok) {
      hitsRef.current += 1;
      rtsRef.current[tr.kind].push(rt);
      hapticSuccess();
    } else {
      errorsRef.current += 1;
      hapticError();
    }
    setHits(hitsRef.current); setErrors(errorsRef.current);
    setRtsByKind({ congruent: [...rtsRef.current.congruent], incongruent: [...rtsRef.current.incongruent], neutral: [...rtsRef.current.neutral] });
    setFeedback(ok ? 'right' : 'wrong');
    advance();
  };

  const meanRtAll = (() => {
    const all = [...rtsByKind.congruent, ...rtsByKind.incongruent, ...rtsByKind.neutral];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="flash" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('flanker')}</Text>
        <Text style={styles.configDesc}>{t('flankerDesc')}</Text>
      </LinearGradient>
      <LevelProgressMap gameId="flanker" currentLevel={lvl.level} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
          {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {lvl.level <= 5
            ? (language === 'ru' ? 'Конфликтных стрелок 30% · окно ответа 3.0–2.2 с · 20 попыток' : '30% conflict arrows · 3.0–2.2 s response window · 20 trials')
            : lvl.level <= 10
            ? (language === 'ru' ? 'Конфликтных стрелок 45% · окно ответа 2.0–1.6 с · 20 попыток' : '45% conflict arrows · 2.0–1.6 s response window · 20 trials')
            : (language === 'ru' ? 'Конфликтных стрелок 65% · окно ответа 1.4–1.0 с · 20 попыток' : '65% conflict arrows · 1.4–1.0 s response window · 20 trials')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
          {language === 'ru'
            ? 'Проход уровня: точность ≥80% (не успел ответить в окно = ошибка)'
            : 'To pass: ≥80% accuracy (no answer within the window counts as an error)'}
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
    </ScrollView>
  );

  const arrowFor = (d: Direction, size: number, color: string) => (
    <Ionicons name={d === 'left' ? 'arrow-back' : 'arrow-forward'} size={size} color={color} />
  );

  // playing-фаза — на едином каркасе GameShell (кнопки ответов прибиты к низу)
  if (phase === 'playing') {
    const fbColor =
      feedback === 'right' ? '#22c55e' :
      feedback === 'wrong' ? '#f43f5e' :
      colors.text;
    return (
      <GameShell
        title={t('flanker')}
        onBack={() => goBackOrHome()}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>
              {round}/{trials}{!isPreset ? ` · ${language === 'ru' ? 'Ур.' : 'Lv'}${lvl.level}` : ''}
            </Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
            <Text style={[styles.statText, { color: colors.text }]}>{meanRtAll}{language === 'ru' ? 'мс' : 'ms'}</Text>
          </View>
        }
        toolbar={
          /* RTL-пин: кнопка ← обязана быть физически СЛЕВА (S-R совместимость), иначе в ar психометрика рушится */
          <View style={styles.toolbarLtr}>
            <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handleAnswer('left')}>
              <Ionicons name="arrow-back" size={32} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[1] }]} onPress={() => handleAnswer('right')}>
              <Ionicons name="arrow-forward" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>
        }
      >
        <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback ? fbColor : colors.border, borderWidth: feedback ? 3 : 1 }]}>
          {showStim ? (
            <View style={styles.arrowRow}>
              {trial.flankers
                ? trial.flankers.slice(0, 2).map((d, i) => <View key={`l${i}`}>{arrowFor(d, 36, '#888')}</View>)
                : ['—','—'].map((s, i) => <Text key={`l${i}`} style={{ fontSize: 36, color: '#888' }}>{s}</Text>)
              }
              <View style={{ marginHorizontal: 8 }}>{arrowFor(trial.center, 56, fbColor)}</View>
              {trial.flankers
                ? trial.flankers.slice(2).map((d, i) => <View key={`r${i}`}>{arrowFor(d, 36, '#888')}</View>)
                : ['—','—'].map((s, i) => <Text key={`r${i}`} style={{ fontSize: 36, color: '#888' }}>{s}</Text>)
              }
            </View>
          ) : (
            <Text style={{ fontSize: 36, color: colors.textSecondary }}>•</Text>
          )}
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('flanker')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="flanker" icon="flash" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="flankerIntroDesc"
          benefits={FL_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
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
        <LevelCleared gameId="flanker" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
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
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  stimBox: { width: 360, maxWidth: '100%', height: 120, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  // RTL-пин (writingDirection → CSS direction на web, на нативе no-op): направленный
  // стимул и раскладка кнопок лево/право не зеркалятся в ar
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, writingDirection: 'ltr' },
  toolbarLtr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', writingDirection: 'ltr' },
  choiceBtn: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
});
