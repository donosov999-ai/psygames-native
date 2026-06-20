import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
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
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useProfile } from '@/src/contexts/ProfileContext';

const GRADIENT = ['#a8c0ff', '#3f2b96'];
// Базовый тон дисков под профиль — каждый профиль = своя цветовая семья (монохром-стек).
const DISC_HUE: Record<string, number> = {
  chess: 42, odv999: 45, free: 40, nzt48: 270, seniors: 265, polyglot: 232,
  women: 330, kids: 145, drivers: 22, execs: 175, students: 30, vasilyeva: 200,
};
const HANOI_BENEFITS = [
  { icon: 'extension-puzzle-outline', textKey: 'benefitHanoi1' },
  { icon: 'analytics-outline', textKey: 'benefitHanoi2' },
  { icon: 'trending-up-outline', textKey: 'benefitHanoi3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

export default function HanoiGame() {
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [discs, setDiscs] = useState(() => num('discs', 4));
  const [pegs, setPegs] = useState<number[][]>([[], [], []]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const optimal = (n: number) => Math.pow(2, n) - 1;

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startGame = () => {
    const initial = Array.from({ length: discs }, (_, i) => discs - i);
    setPegs([initial, [], []]);
    setSelected(null);
    setMoves(0);
    setErrors(0);
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handlePegPress = async (idx: number) => {
    if (selected === null) {
      if (pegs[idx].length === 0) return;
      setSelected(idx);
      return;
    }
    if (selected === idx) { setSelected(null); return; }
    const from = pegs[selected];
    const to = pegs[idx];
    const top = from[from.length - 1];
    if (to.length === 0 || to[to.length - 1] > top) {
      const np = pegs.map((p) => [...p]);
      np[idx].push(np[selected].pop()!);
      setPegs(np);
      setMoves((m) => m + 1);
      setSelected(null);
      // Check win
      if (np[2].length === discs) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        setPhase('result');
        try {
          await saveSession({
            game_type: 'hanoi',
            score: Math.max(0, Math.round(1000 - (moves + 1 - optimal(discs)) * 50 - finalTime)),
            time_seconds: finalTime,
            difficulty: `${discs} discs`,
            mode: 'classic',
            errors,
            details: { moves: moves + 1, optimal: optimal(discs) },
          });
        } catch (e) { console.error(e); }
      }
    } else {
      setErrors((e) => e + 1);
      setSelected(null);
    }
  };

  const pegW = Math.min(width / 4, 110);
  const discBaseW = pegW * 0.35;
  const discStep = (pegW - discBaseW) / Math.max(discs, 2);
  const baseHue = DISC_HUE[profile?.id ?? ''] ?? 215;

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="extension-puzzle" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('hanoi')}</Text>
        <Text style={styles.configDesc}>{t('hanoiDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('discsCount')}</Text>
        <View style={styles.optionButtons}>
          {[3, 4, 5, 6].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, discs === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDiscs(n)}>
              <Text style={[styles.modeButtonText, { color: discs === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
          {t('hanoiOptimal')}: {optimal(discs)} {t('movesLabel')}
        </Text>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{moves} / {optimal(discs)}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
      <View style={styles.pegsArea}>
        {pegs.map((peg, idx) => (
          <TouchableOpacity
            key={idx}
            activeOpacity={0.7}
            onPress={() => handlePegPress(idx)}
            style={[
              styles.pegContainer,
              {
                width: pegW,
                borderColor: selected === idx ? GRADIENT[0] : 'transparent',
              },
            ]}
          >
            <View style={styles.pegStack}>
              {peg.map((size, i) => (
                <LinearGradient
                  key={i}
                  colors={[
                    `hsl(${baseHue}, 68%, ${Math.min(82, 55 + (size / discs) * 28)}%)`,
                    `hsl(${baseHue}, 74%, ${Math.max(34, 42 + (size / discs) * 18)}%)`,
                  ]}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={[styles.disc, { width: discBaseW + size * discStep }]}
                >
                  <View style={styles.discShine} pointerEvents="none" />
                </LinearGradient>
              ))}
              <View style={[styles.pole, { backgroundColor: colors.text }]} />
              <View style={[styles.pegBase, { backgroundColor: colors.text, width: pegW - 12 }]} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('hanoiHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('hanoi')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="hanoi" icon="extension-puzzle" gradient={GRADIENT as [string, string]}
          skillKey="skillProblemSolving" descriptionKey="hanoiIntroDesc"
          benefits={HANOI_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(1000 - (moves - optimal(discs)) * 50 - elapsedTime))}
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
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optionHint: { fontSize: 12, marginTop: 4 },
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 10 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  pegsArea: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingBottom: 12 },
  pegContainer: { borderWidth: 3, borderRadius: 8, paddingBottom: 4 },
  pegStack: { alignItems: 'center', justifyContent: 'flex-end', position: 'relative', minHeight: 220 },
  pole: { position: 'absolute', width: 6, height: 200, bottom: 4, borderRadius: 3, opacity: 0.3 },
  pegBase: { height: 8, borderRadius: 4 },
  disc: { height: 22, marginTop: 2, borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  discShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.28)' },
  hintText: { fontSize: 12, textAlign: 'center' },
});
