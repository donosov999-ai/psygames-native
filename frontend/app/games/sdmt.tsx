import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#0f2027', '#2c5364'];
const SDMT_BENEFITS = [
  { icon: 'flash-outline',   textKey: 'benefitSdmt1' },
  { icon: 'eye-outline',     textKey: 'benefitSdmt2' },
  { icon: 'extension-puzzle-outline', textKey: 'benefitSdmt3' },
];

// 9 unique symbols (rendered as Ionicons), each mapped to digit 1..9. Mapping is shuffled per game.
const SYMBOLS = [
  'star', 'heart', 'leaf', 'flash', 'cloud', 'flower', 'snow', 'water', 'flame',
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

interface KeyMap { sym: string; digit: number; }

export default function SdmtGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  // v1.29.3 (мобайл): таблица символ→цифра и поле НЕ растягивались (maxWidth 460/240 +
  // фикс stimBox 140). Теперь всё от ширины экрана: легенда во всю ширину (9 ячеек в ряд),
  // пад-кнопки и стимул крупнее.
  const { width } = useWindowDimensions();
  const sdmtW = Math.min(width - 24, 460);
  const sdmtPad = Math.min((sdmtW - 2 * 8) / 3, 96); // 3 кнопки в ряд
  const sdmtStim = Math.min(sdmtW * 0.42, 180);
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [duration, setDuration] = useState(() => num('duration', 60)); // seconds

  const [keymap, setKeymap] = useState<KeyMap[]>([]);
  const [stim, setStim] = useState<string>('star');
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [remaining, setRemaining] = useState(60);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const buildKeymap = () => {
    const digits = shuffle([1,2,3,4,5,6,7,8,9]);
    return SYMBOLS.map((sym, i) => ({ sym, digit: digits[i] }));
  };

  const newStim = (km: KeyMap[]) => {
    setStim(km[Math.floor(Math.random() * km.length)].sym);
  };

  const startGame = () => {
    const km = buildKeymap();
    setKeymap(km);
    setHits(0); setErrors(0); setRemaining(duration);
    setFeedback(null);
    newStim(km);
    setPhase('playing');
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const left = duration - Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRemaining(left);
      if (left <= 0) finish(km);
    }, 200);
  };

  const finish = async (km: KeyMap[]) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemaining(0);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'sdmt',
        score: Math.max(0, hits * 100 - errors * 50),
        time_seconds: duration,
        difficulty: 'medium',
        mode: `${duration}s`,
        errors,
        details: { rate_per_min: Math.round((hits / duration) * 60) },
      });
    } catch (e) { console.error(e); }
  };

  const handleAnswer = (digit: number) => {
    if (phase !== 'playing' || feedback !== null) return;
    const correct = keymap.find(k => k.sym === stim)!.digit;
    const ok = digit === correct;
    if (ok) setHits(h => h + 1); else setErrors(e => e + 1);
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(() => {
      setFeedback(null);
      newStim(keymap);
    }, 200);
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="apps" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('sdmt')}</Text>
        <Text style={styles.configDesc}>{t('sdmtDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('duration')}</Text>
        <View style={styles.optionButtons}>
          {[60, 90, 120].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, duration === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDuration(n)}>
              <Text style={[styles.modeButtonText, { color: duration === n ? '#FFF' : colors.text }]}>{n}s</Text>
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
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>{remaining}s</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <View style={[styles.legend, { backgroundColor: colors.surface, width: sdmtW }]}>
        {keymap.map((k, i) => (
          <View key={i} style={[styles.legendCell, { borderColor: colors.border, flex: 1 }]}>
            <Ionicons name={k.sym as any} size={Math.min(sdmtW / 18, 22)} color={GRADIENT[1]} />
            <Text style={[styles.legendDigit, { color: colors.text }]}>{k.digit}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.stimBox, {
        width: sdmtStim, height: sdmtStim,
        backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
        borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border,
      }]}>
        <Ionicons name={stim as any} size={sdmtStim * 0.6} color={GRADIENT[1]} />
      </View>
      <View style={[styles.padGrid, { width: sdmtPad * 3 + 16 }]}>
        {[1,2,3,4,5,6,7,8,9].map((d) => (
          <TouchableOpacity key={d}
            style={[styles.padBtn, { width: sdmtPad, height: sdmtPad, backgroundColor: GRADIENT[0] }]}
            onPress={() => handleAnswer(d)}>
            <Text style={[styles.padText, { fontSize: sdmtPad * 0.38 }]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('sdmt')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="sdmt" icon="apps" gradient={GRADIENT as [string, string]}
          skillKey="skillProcessingSpeed" descriptionKey="sdmtIntroDesc"
          benefits={SDMT_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 50)}
          time={duration} errors={errors}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 16, fontWeight: '800' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 3, padding: 8, borderRadius: 10 },
  legendCell: { alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingVertical: 4, gap: 2 },
  legendDigit: { fontSize: 15, fontWeight: '800' },
  stimBox: { borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  padGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  padBtn: { borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  padText: { color: '#FFF', fontSize: 24, fontWeight: '900' },
});
