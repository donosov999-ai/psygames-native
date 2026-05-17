import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#0F2027', '#2C5364'];
const IGT_BENEFITS = [
  { icon: 'analytics-outline',   textKey: 'benefitIgt1' },
  { icon: 'trending-up-outline', textKey: 'benefitIgt2' },
  { icon: 'bulb-outline',        textKey: 'benefitIgt3' },
];

// IGT (Bechara, Damasio): 4 decks A,B,C,D.
// Standard schedule (per Bechara 1994):
//   A: win +100 every card; loss schedule big & frequent (5/10) → net negative ($-250 / 10 cards)
//   B: win +100 every card; loss rare but huge (1/10 of -1250) → net negative
//   C: win +50 every card; loss small frequent (5/10 sums to -250) → net positive ($+250 / 10 cards)
//   D: win +50 every card; loss rare small (1/10 of -250) → net positive
// Subject doesn't know which deck is which; learns via feedback.
// Metric: P(C+D) over 5 blocks of 20 trials.

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Deck = 'A' | 'B' | 'C' | 'D';

const DECK_INFO: Record<Deck, { win: number, losses: { every: number, amount: number }[] }> = {
  A: { win: 100, losses: [{ every: 1, amount: 0 }] }, // we'll handle separately below
  B: { win: 100, losses: [] },
  C: { win: 50, losses: [] },
  D: { win: 50, losses: [] },
};

// Pre-shuffled per Bechara: positions of losses per 10 cards (we cycle through these).
const LOSS_PATTERNS: Record<Deck, number[]> = {
  // A: loss in 5 of every 10 cards, sum = $1250 → net -250
  A: [-150, 0, -300, 0, -200, 0, -250, -350, 0, 0],
  // B: loss in 1 of every 10 cards, sum = $1250 → net -250
  B: [0, 0, 0, 0, 0, -1250, 0, 0, 0, 0],
  // C: loss in 5 of every 10 cards, sum = $250 → net +250
  C: [0, -50, 0, -50, 0, -50, 0, -50, 0, -50],
  // D: loss in 1 of every 10 cards, sum = $250 → net +250
  D: [0, 0, 0, 0, 0, 0, 0, 0, 0, -250],
};

export default function IowaGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trials, setTrials] = useState(60);

  const [round, setRound] = useState(0);
  const [bank, setBank] = useState(2000); // start with $2000 (Bechara)
  const [picks, setPicks] = useState<{deck: Deck, win: number, loss: number}[]>([]);
  const [deckCounters, setDeckCounters] = useState<Record<Deck, number>>({ A: 0, B: 0, C: 0, D: 0 });
  const [lastFeedback, setLastFeedback] = useState<{deck: Deck, win: number, loss: number} | null>(null);
  const [feedbackTimer, setFeedbackTimer] = useState<number | null>(null);

  const startGame = () => {
    setBank(2000); setPicks([]);
    setDeckCounters({ A: 0, B: 0, C: 0, D: 0 });
    setLastFeedback(null);
    setRound(1);
    setPhase('playing');
  };

  const finish = async (finalBank: number, finalPicks: typeof picks) => {
    const advantageous = finalPicks.filter(p => p.deck === 'C' || p.deck === 'D').length;
    const disadvantageous = finalPicks.filter(p => p.deck === 'A' || p.deck === 'B').length;
    const lastBlock = finalPicks.slice(-20);
    const lastBlockAdv = lastBlock.filter(p => p.deck === 'C' || p.deck === 'D').length;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'iowa',
        score: Math.max(0, finalBank),
        time_seconds: 0,
        difficulty: 'medium',
        mode: `${trials}t`,
        errors: disadvantageous,
        details: {
          adv_minus_disadv: advantageous - disadvantageous,
          last_block_adv: lastBlockAdv,
          final_bank: finalBank,
        },
      });
    } catch (e) { console.error(e); }
  };

  const pickDeck = (d: Deck) => {
    if (lastFeedback) return;
    const cnt = deckCounters[d];
    const win = DECK_INFO[d].win;
    const loss = LOSS_PATTERNS[d][cnt % 10];
    const net = win + loss; // loss is negative
    const newBank = bank + net;
    setBank(newBank);
    const newPicks = [...picks, { deck: d, win, loss }];
    setPicks(newPicks);
    setDeckCounters({ ...deckCounters, [d]: cnt + 1 });
    setLastFeedback({ deck: d, win, loss });
    setTimeout(() => {
      setLastFeedback(null);
      if (round >= trials) finish(newBank, newPicks);
      else setRound(r => r + 1);
    }, 1300);
  };

  const advCount = picks.filter(p => p.deck === 'C' || p.deck === 'D').length;
  const disCount = picks.length - advCount;

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="cash" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('iowa')}</Text>
        <Text style={styles.configDesc}>{t('iowaDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[40, 60, 100].map((n) => (
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
    </View>
  );

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>Card {round}/{trials}</Text>
        <Text style={[styles.statText, { color: bank >= 2000 ? '#22c55e' : '#ef4444', fontSize: 16 }]}>${bank}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>+CD: {advCount}</Text>
        <Text style={[styles.statText, { color: '#ef4444' }]}>-AB: {disCount}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('iowaHint')}</Text>
      <View style={styles.deckRow}>
        {(['A','B','C','D'] as Deck[]).map((d) => (
          <TouchableOpacity key={d}
            disabled={lastFeedback !== null}
            onPress={() => pickDeck(d)}
            style={[styles.deck, { backgroundColor: GRADIENT[1], borderColor: lastFeedback?.deck === d ? '#fbbf24' : 'transparent' }]}>
            <Text style={styles.deckLetter}>{d}</Text>
            <Text style={styles.deckCount}>{deckCounters[d]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {lastFeedback && (
        <View style={[styles.fbBox, { backgroundColor: colors.surface, borderColor: lastFeedback.loss < 0 ? '#ef4444' : '#22c55e' }]}>
          <Text style={[styles.fbText, { color: '#22c55e' }]}>+ ${lastFeedback.win}</Text>
          {lastFeedback.loss < 0 && <Text style={[styles.fbText, { color: '#ef4444' }]}>- ${Math.abs(lastFeedback.loss)}</Text>}
          <Text style={[styles.fbNet, { color: lastFeedback.win + lastFeedback.loss >= 0 ? '#22c55e' : '#ef4444' }]}>
            net {lastFeedback.win + lastFeedback.loss >= 0 ? '+' : ''}{lastFeedback.win + lastFeedback.loss}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('iowa')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="iowa" icon="cash" gradient={GRADIENT as [string, string]}
          skillKey="skillRisk" descriptionKey="iowaIntroDesc"
          benefits={IGT_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, bank)}
          time={0} errors={disCount}
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
  playArea: { flex: 1, padding: 16, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  deckRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  deck: { width: 70, height: 100, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 3, gap: 4 },
  deckLetter: { color: '#FFF', fontSize: 32, fontWeight: '900' },
  deckCount: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  fbBox: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, borderWidth: 2, gap: 4, alignItems: 'center' },
  fbText: { fontSize: 18, fontWeight: '900' },
  fbNet: { fontSize: 14, fontWeight: '700', marginTop: 4 },
});
