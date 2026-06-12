import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#005C97', '#363795'];
const ANT_BENEFITS = [
  { icon: 'eye-outline',     textKey: 'benefitAnt1' },
  { icon: 'navigate-outline',textKey: 'benefitAnt2' },
  { icon: 'flash-outline',   textKey: 'benefitAnt3' },
];

// ANT (Fan, McCandliss, Sommer, Raz, Posner 2002).
// Cue type: none / center / double / spatial
// Target: arrow at top or bottom, flanked by congruent or incongruent arrows
// Three networks measured:
//  alerting = RT(no cue) - RT(double cue)
//  orienting = RT(center cue) - RT(spatial cue)
//  executive = RT(incongruent) - RT(congruent)

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type CueType = 'none' | 'center' | 'double' | 'spatial';
type Congruence = 'congruent' | 'incongruent' | 'neutral';
type Direction = 'left' | 'right';
type Position = 'top' | 'bottom';

interface Trial { cue: CueType; pos: Position; dir: Direction; cong: Congruence; flankers: Direction[] | null; }

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function makeTrial(): Trial {
  const cue = rndItem<CueType>(['none','center','double','spatial']);
  const pos = rndItem<Position>(['top','bottom']);
  const dir = rndItem<Direction>(['left','right']);
  const cong = rndItem<Congruence>(['congruent','incongruent','neutral']);
  let flankers: Direction[] | null;
  if (cong === 'congruent') flankers = [dir, dir, dir, dir];
  else if (cong === 'incongruent') flankers = [dir === 'left' ? 'right' : 'left'].map(d => d as Direction).flatMap(d => [d, d, d, d]);
  else flankers = null;
  return { cue, pos, dir, cong, flankers };
}

export default function ANTGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trials, setTrials] = useState(24);

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ cue: 'none', pos: 'top', dir: 'left', cong: 'neutral', flankers: null });
  const [showCue, setShowCue] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  // store [cueType][cong] → rt
  const [rts, setRts] = useState<{cue:CueType,cong:Congruence,rt:number}[]>([]);
  const [startTime, setStartTime] = useState(0);

  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    [cueTimer, targetTimer, fbTimer].forEach(r => { if (r.current) clearTimeout(r.current); });
  }, []);

  const newTrial = () => {
    setShowCue(false); setShowTarget(false); setFeedback(null);
    const tr = makeTrial();
    setTrial(tr);
    cueTimer.current = setTimeout(() => {
      if (tr.cue !== 'none') {
        setShowCue(true);
        targetTimer.current = setTimeout(() => {
          setShowCue(false);
          setTimeout(() => {
            setShowTarget(true);
            setStimAt(Date.now());
          }, 400); // fixed CTOA = 100ms cue + 400ms blank = 500ms
        }, 100);
      } else {
        // no cue → just delay then target
        setTimeout(() => {
          setShowTarget(true);
          setStimAt(Date.now());
        }, 500);
      }
    }, 400 + Math.random() * 600);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRts([]); setRound(1);
    setPhase('playing');
    setStartTime(Date.now());
    newTrial();
  };

  const calcMeans = (data: typeof rts) => {
    const filt = (pred: (r: typeof rts[0]) => boolean) => {
      const arr = data.filter(pred).map(r => r.rt);
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    };
    const alerting = filt(r => r.cue === 'none') - filt(r => r.cue === 'double');
    const orienting = filt(r => r.cue === 'center') - filt(r => r.cue === 'spatial');
    const executive = filt(r => r.cong === 'incongruent') - filt(r => r.cong === 'congruent');
    const meanRt = data.length ? data.reduce((a, b) => a + b.rt, 0) / data.length : 0;
    return { alerting: Math.round(alerting), orienting: Math.round(orienting), executive: Math.round(executive), meanRt: Math.round(meanRt) };
  };

  const finish = async (h: number, e: number, allRts: typeof rts) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const m = calcMeans(allRts);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'ant',
        score: Math.max(0, Math.round(h * 60 - e * 50 - m.meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: 'medium',
        mode: `${trials}t`,
        errors: e,
        details: { mean_rt: m.meanRt, alerting_ms: m.alerting, orienting_ms: m.orienting, executive_ms: m.executive },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (d: Direction) => {
    if (!showTarget || feedback !== null) return;
    const rt = Date.now() - stimAt;
    const ok = d === trial.dir;
    let nh = hits, ne = errors, nr = rts;
    if (ok) { nh = hits + 1; nr = [...rts, { cue: trial.cue, cong: trial.cong, rt }]; }
    else ne = errors + 1;
    setHits(nh); setErrors(ne); setRts(nr);
    setFeedback(ok ? 'right' : 'wrong');
    fbTimer.current = setTimeout(() => {
      if (round >= trials) finish(nh, ne, nr);
      else { setRound(r => r + 1); newTrial(); }
    }, 350);
  };

  const m = calcMeans(rts);

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="git-network" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('ant')}</Text>
        <Text style={styles.configDesc}>{t('antDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[12, 24, 36].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{m.meanRt}{language === 'ru' ? 'мс' : 'ms'}</Text>
      </View>
      <View style={[styles.networkRow]}>
        <Text style={[styles.netText, { color: '#22c55e' }]}>A {m.alerting}</Text>
        <Text style={[styles.netText, { color: '#fbbf24' }]}>O {m.orienting}</Text>
        <Text style={[styles.netText, { color: '#ef4444' }]}>E {m.executive}</Text>
      </View>
      <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
        {/* top cue / target slot */}
        <View style={styles.row}>
          {showCue && (trial.cue === 'double' || (trial.cue === 'spatial' && trial.pos === 'top')) && <Text style={styles.cueDot}>*</Text>}
          {showTarget && trial.pos === 'top' && (
            <View style={styles.arrowRow}>
              {trial.flankers ? trial.flankers.slice(0, 2).map((d, i) => <View key={'l'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'l'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
              <View style={{ marginHorizontal: 4 }}>{arrowFor(trial.dir, 32, colors.text)}</View>
              {trial.flankers ? trial.flankers.slice(2).map((d, i) => <View key={'r'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'r'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
            </View>
          )}
        </View>
        {/* center fixation */}
        <View style={styles.row}>
          {showCue && trial.cue === 'center' && <Text style={styles.cueDot}>*</Text>}
          {!showCue || trial.cue !== 'center' ? <Text style={{ color: colors.textSecondary, fontSize: 22 }}>+</Text> : null}
        </View>
        {/* bottom */}
        <View style={styles.row}>
          {showCue && (trial.cue === 'double' || (trial.cue === 'spatial' && trial.pos === 'bottom')) && <Text style={styles.cueDot}>*</Text>}
          {showTarget && trial.pos === 'bottom' && (
            <View style={styles.arrowRow}>
              {trial.flankers ? trial.flankers.slice(0, 2).map((d, i) => <View key={'l'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'l'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
              <View style={{ marginHorizontal: 4 }}>{arrowFor(trial.dir, 32, colors.text)}</View>
              {trial.flankers ? trial.flankers.slice(2).map((d, i) => <View key={'r'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'r'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
            </View>
          )}
        </View>
      </View>
      <View style={styles.choiceRow}>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handleAnswer('left')}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[1] }]} onPress={() => handleAnswer('right')}>
          <Ionicons name="arrow-forward" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('ant')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="ant" icon="git-network" gradient={GRADIENT as [string, string]}
          skillKey="skillFocus" descriptionKey="antIntroDesc"
          benefits={ANT_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 60 - errors * 50 - m.meanRt * 0.05))}
          time={m.meanRt / 1000} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => router.back()}
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
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  networkRow: { flexDirection: 'row', gap: 18 },
  netText: { fontSize: 12, fontWeight: '700' },
  statText: { fontSize: 13, fontWeight: '700' },
  stimBox: { width: 380, height: 220, borderRadius: 14, borderWidth: 2, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  row: { height: 50, justifyContent: 'center', alignItems: 'center' },
  cueDot: { color: '#fbbf24', fontSize: 36, fontWeight: '900' },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  choiceRow: { flexDirection: 'row', gap: 24 },
  choiceBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
});
