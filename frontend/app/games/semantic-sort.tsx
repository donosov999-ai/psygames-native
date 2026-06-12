/**
 * Сортировка слов (Полиглот TIER 1 п.5, v1.29.0).
 * Слово на целевом языке → к какой категории относится? Категоризация БЕЗ перевода =
 * прямой семантический доступ к L2 (закрепление значений). Категории — поле `cat`
 * в TRANSLATION_VOCAB (14 шт.), имена категорий локализованы (catVocab_*).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';

const GRADIENT = ['#10b981', '#6366f1'];

const SORT_BENEFITS = [
  { icon: 'albums-outline', textKey: 'benefitSort1' },
  { icon: 'link-outline', textKey: 'benefitSort2' },
  { icon: 'speedometer-outline', textKey: 'benefitSort3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
interface Round { word: string; correctCat: string; cats: string[] }

export default function SemanticSortGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const [roundsCount, setRoundsCount] = useState(() => num('rounds', 15));
  const [catsPerRound, setCatsPerRound] = useState(() => num('cats', 3));

  const [rounds, setRounds] = useState<Round[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const rtSumRef = useRef(0);
  const shownAtRef = useRef(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;

  const startGame = () => {
    // слова целевого языка, сгруппированные по категориям
    const byCat = new Map<string, string[]>();
    for (const w of TRANSLATION_VOCAB) {
      if (!w[tgt] || !w.cat) continue;
      if (!byCat.has(w.cat)) byCat.set(w.cat, []);
      byCat.get(w.cat)!.push(w[tgt]);
    }
    const cats = Array.from(byCat.keys()).filter((c) => byCat.get(c)!.length >= 3);

    const newRounds: Round[] = [];
    for (let r = 0; r < roundsCount; r++) {
      const correctCat = cats[Math.floor(Math.random() * cats.length)];
      const others = cats.filter((c) => c !== correctCat);
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      const roundCats = [correctCat, ...others.slice(0, catsPerRound - 1)];
      for (let i = roundCats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roundCats[i], roundCats[j]] = [roundCats[j], roundCats[i]];
      }
      const pool = byCat.get(correctCat)!;
      const word = pool[Math.floor(Math.random() * pool.length)];
      newRounds.push({ word, correctCat, cats: roundCats });
    }
    setRounds(newRounds);
    setIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setErrorsCount(0);
    rtSumRef.current = 0;
    setStartTime(Date.now());
    shownAtRef.current = Date.now();
    setPhase('playing');
  };

  const finish = async (total: number) => {
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'semantic_sort',
        score: correctCount,
        time_seconds: finalTime,
        difficulty: `${tgt} · ${total} × ${catsPerRound}`,
        errors: errorsCount,
        details: {
          target_lang: tgt,
          rounds: total,
          cats_per_round: catsPerRound,
          accuracy: total > 0 ? correctCount / total : 0,
          mean_rt_ms: total > 0 ? Math.round(rtSumRef.current / total) : 0,
        },
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }
  };

  const handlePick = (cat: string) => {
    if (picked !== null) return;
    const round = rounds[idx];
    rtSumRef.current += Date.now() - shownAtRef.current;
    const isCorrect = cat === round.correctCat;
    setPicked(cat);
    if (isCorrect) setCorrectCount((c) => c + 1);
    else setErrorsCount((c) => c + 1);
    setTimeout(() => {
      const next = idx + 1;
      if (next >= rounds.length) {
        finish(rounds.length);
      } else {
        setIdx(next);
        setPicked(null);
        shownAtRef.current = Date.now();
      }
    }, isCorrect ? 350 : 900);
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="albums" size={48} color="#fff" />
          <Text style={[styles.configTitle, { color: '#fff' }]}>{t('semanticSort')}</Text>
          <Text style={[styles.configDesc, { color: 'rgba(255,255,255,0.8)' }]}>{t('semanticSortDesc')}</Text>
        </LinearGradient>

        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {LANGUAGES.find((l) => l.code === language)?.name} →
          </Text>
          <View style={styles.optionButtons}>
            {LANGUAGES.filter((l) => l.code !== language).map((l) => (
              <TouchableOpacity
                key={l.code}
                style={[
                  styles.sizeButton,
                  tgt === l.code && { backgroundColor: GRADIENT[0] },
                  tgt !== l.code && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setTargetLang(l.code)}
              >
                <Text style={[styles.sizeButtonText, { color: tgt === l.code ? '#fff' : colors.text }]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('sortRounds')}</Text>
          <View style={styles.optionButtons}>
            {[10, 15, 20].map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.sizeButton,
                  roundsCount === n && { backgroundColor: GRADIENT[0] },
                  roundsCount !== n && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setRoundsCount(n)}
              >
                <Text style={[styles.sizeButtonText, { color: roundsCount === n ? '#fff' : colors.text }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('sortCats')}</Text>
          <View style={styles.optionButtons}>
            {[2, 3].map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.sizeButton,
                  catsPerRound === n && { backgroundColor: GRADIENT[0] },
                  catsPerRound !== n && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setCatsPerRound(n)}
              >
                <Text style={[styles.sizeButtonText, { color: catsPerRound === n ? '#fff' : colors.text }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.startButton} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startButtonGradient}>
            <Ionicons name="play" size={24} color="#fff" />
            <Text style={[styles.startButtonText, { color: '#fff' }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderPlaying = () => {
    const round = rounds[idx];
    if (!round) return null;
    return (
      <View style={styles.gameContainer}>
        <View style={styles.hudRow}>
          <Text style={[styles.hudText, { color: colors.textSecondary }]}>{idx + 1}/{rounds.length}</Text>
          <Text style={[styles.hudText, { color: colors.textSecondary }]}>✓ {correctCount} · ✗ {errorsCount}</Text>
        </View>

        <View style={[styles.promptCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.promptWord, { color: colors.text }]}>{round.word}</Text>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('sortHint')}</Text>

        <View style={styles.optionsWrap}>
          {round.cats.map((cat) => {
            const isRight = picked !== null && cat === round.correctCat;
            const isWrongPick = picked === cat && cat !== round.correctCat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.answerButton,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  isRight && { backgroundColor: '#34d399', borderColor: '#34d399' },
                  isWrongPick && { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
                ]}
                onPress={() => handlePick(cat)}
                activeOpacity={0.7}
              >
                <Text style={[styles.answerText, { color: isRight || isWrongPick ? '#fff' : colors.text }]}>
                  {t(`catVocab_${cat}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="semanticSort"
          icon="albums"
          gradient={GRADIENT}
          skillKey="skillVocabulary"
          descriptionKey="semanticSortIntroDesc"
          benefits={SORT_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => (phase === 'config' ? setPhase('intro') : router.back())}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('semanticSort')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime}
          score={correctCount}
          errors={errorsCount}
          gradient={GRADIENT}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => router.push('/')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  placeholder: { width: 44 },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 16, paddingBottom: 20 },
  configCard: { padding: 24, borderRadius: 20, alignItems: 'center', marginBottom: 8 },
  configTitle: { fontSize: 24, fontWeight: '700' },
  configDesc: { fontSize: 14, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sizeButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, minWidth: 56, alignItems: 'center' },
  sizeButtonText: { fontSize: 15, fontWeight: '600' },
  startButton: { marginTop: 10 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 8,
    gap: 8,
  },
  startButtonText: { fontSize: 18, fontWeight: '700' },
  gameContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  hudText: { fontSize: 15, fontWeight: '600' },
  promptCard: {
    borderRadius: 20,
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  promptWord: { fontSize: 34, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 14 },
  optionsWrap: { gap: 10 },
  answerButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  answerText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
