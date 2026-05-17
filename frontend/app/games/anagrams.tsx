import React, { useState, useEffect, useRef } from 'react';
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

const GRADIENT = ['#ee9ca7', '#ffdde1'];
const ANAGRAM_BENEFITS = [
  { icon: 'language-outline', textKey: 'benefitAnagram1' },
  { icon: 'book-outline', textKey: 'benefitAnagram2' },
  { icon: 'bulb-outline', textKey: 'benefitAnagram3' },
];

const RU_WORDS_4 = ['парк','роса','нива','осёл','рука','небо','цвет','окно','ветер','лето','зима','хлеб','соль','книга'];
const RU_WORDS_5 = ['яблок','океан','стена','школа','компьютер','солнце','берёза','город','актёр'];
const RU_WORDS_6 = ['зеркало','семинар','капитан','стрела','оркестр','планета','сосиска'];
const EN_WORDS_4 = ['park','rose','rope','road','book','wind','door','snow','rain','tree','star','moon'];
const EN_WORDS_5 = ['plane','ocean','globe','music','green','river','quiet','smart'];
const EN_WORDS_6 = ['planet','market','garden','pencil','silver','rocket','window'];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function AnagramGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [length, setLength] = useState<4 | 5 | 6>(5);
  const [trials] = useState(10);
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState('');
  const [letters, setLetters] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const wordsBank = (len: 4 | 5 | 6): string[] => {
    if (language === 'ru') return len === 4 ? RU_WORDS_4 : len === 5 ? RU_WORDS_5 : RU_WORDS_6;
    return len === 4 ? EN_WORDS_4 : len === 5 ? EN_WORDS_5 : EN_WORDS_6;
  };

  const newRound = () => {
    const bank = wordsBank(length);
    const w = bank[Math.floor(Math.random() * bank.length)].toUpperCase();
    setTarget(w);
    let arr = w.split('');
    let attempts = 0;
    do { arr = shuffle(arr); attempts++; } while (arr.join('') === w && attempts < 5);
    setLetters(arr);
    setPicked([]);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleLetterPress = async (idx: number) => {
    if (picked.includes(idx)) return;
    const newPicked = [...picked, idx];
    setPicked(newPicked);
    if (newPicked.length === target.length) {
      const guess = newPicked.map((i) => letters[i]).join('');
      const correct = guess === target;
      const newHits = hits + (correct ? 1 : 0);
      const newErr = errors + (correct ? 0 : 1);
      setHits(newHits);
      setErrors(newErr);
      setTimeout(async () => {
        if (round >= trials) {
          if (timerRef.current) clearInterval(timerRef.current);
          const finalTime = (Date.now() - startTime) / 1000;
          setElapsedTime(finalTime);
          setPhase('result');
          try {
            await saveSession({
              game_type: 'anagrams',
              score: newHits * 100,
              time_seconds: finalTime,
              difficulty: `${length} letters`,
              mode: `${trials}t`,
              errors: newErr,
              details: { hits: newHits, errors: newErr, trials },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound((r) => r + 1);
          newRound();
        }
      }, 700);
    }
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="language" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('anagrams')}</Text>
        <Text style={styles.configDesc}>{t('anagramsDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('lettersInWord')}</Text>
        <View style={styles.optionButtons}>
          {([4, 5, 6] as const).map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, length === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setLength(n)}>
              <Text style={[styles.modeButtonText, { color: length === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={[styles.startBtnText, { color: '#3f2b96' }]}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('anagramHint')}</Text>
      <View style={styles.pickedRow}>
        {Array.from({ length: target.length }).map((_, i) => (
          <View key={i} style={[styles.pickedSlot, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.pickedLetter, { color: colors.text }]}>
              {picked[i] !== undefined ? letters[picked[i]] : ''}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.lettersRow}>
        {letters.map((l, i) => (
          <TouchableOpacity
            key={i}
            disabled={picked.includes(i)}
            onPress={() => handleLetterPress(i)}
            style={[
              styles.letterBtn,
              {
                backgroundColor: picked.includes(i) ? colors.surface : GRADIENT[0],
                opacity: picked.includes(i) ? 0.3 : 1,
              },
            ]}
          >
            <Text style={[styles.letterText, { color: '#3f2b96' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={() => setPicked([])} style={[styles.clearBtn, { backgroundColor: colors.surface }]}>
        <Text style={[styles.clearText, { color: colors.text }]}>{t('clear')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('anagrams')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="anagrams" icon="language" gradient={GRADIENT as [string, string]}
          skillKey="skillVerbal" descriptionKey="anagramsIntroDesc"
          benefits={ANAGRAM_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={hits * 100} time={elapsedTime} errors={errors}
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
  playArea: { flex: 1, padding: 24, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  pickedRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  pickedSlot: { width: 44, height: 54, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  pickedLetter: { fontSize: 22, fontWeight: '700' },
  lettersRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 360 },
  letterBtn: { width: 56, height: 56, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  letterText: { fontSize: 24, fontWeight: '800' },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, marginTop: 8 },
  clearText: { fontSize: 13, fontWeight: '600' },
});
