/**
 * Cloze (Полиглот TIER 1 п.4, v1.29.0) — пропущенное слово во фразе на целевом языке.
 * Грамматика + извлечение слова в контексте. Фразы — src/constants/clozePhrases.ts
 * (ответ привязан к словарю через answerEn), дистракторы — слова ТОЙ ЖЕ категории
 * (семантически близкие → выбор не угадывается по форме).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { CLOZE_PHRASES } from '@/src/constants/clozePhrases';

const GRADIENT = ['#f59e0b', '#ef4444'];

const CLOZE_BENEFITS = [
  { icon: 'text-outline', textKey: 'benefitCloze1' },
  { icon: 'construct-outline', textKey: 'benefitCloze2' },
  { icon: 'chatbubbles-outline', textKey: 'benefitCloze3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
interface Round { text: string; answer: string; options: string[] }

export default function ClozeGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const [roundsCount, setRoundsCount] = useState(() => num('rounds', 10));

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
    const phrases = [...(CLOZE_PHRASES[tgt] ?? [])];
    for (let i = phrases.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [phrases[i], phrases[j]] = [phrases[j], phrases[i]];
    }
    const newRounds: Round[] = [];
    for (const p of phrases) {
      if (newRounds.length >= roundsCount) break;
      const entry = TRANSLATION_VOCAB.find((w) => w.en === p.answerEn);
      if (!entry || !entry[tgt]) continue; // фраза с неизвестным answerEn — пропуск
      const answer = entry[tgt];
      // дистракторы той же категории; добор из всего словаря, если категория мала
      const sameCat = TRANSLATION_VOCAB.filter((w) => w.cat === entry.cat && w[tgt] && w[tgt] !== answer).map((w) => w[tgt]);
      const anyOther = TRANSLATION_VOCAB.filter((w) => w[tgt] && w[tgt] !== answer).map((w) => w[tgt]);
      const distractors = new Set<string>();
      const pickFrom = (arr: string[]) => {
        let guard = 0;
        while (distractors.size < 3 && guard < 60 && arr.length > 0) {
          guard += 1;
          distractors.add(arr[Math.floor(Math.random() * arr.length)]);
        }
      };
      pickFrom(sameCat);
      if (distractors.size < 3) pickFrom(anyOther);
      const options = [answer, ...distractors];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      newRounds.push({ text: p.text, answer, options });
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
        game_type: 'cloze',
        score: correctCount,
        time_seconds: finalTime,
        difficulty: `${tgt} · ${total}`,
        errors: errorsCount,
        details: {
          target_lang: tgt,
          rounds: total,
          accuracy: total > 0 ? correctCount / total : 0,
          mean_rt_ms: total > 0 ? Math.round(rtSumRef.current / total) : 0,
        },
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }
  };

  const handlePick = (option: string) => {
    if (picked !== null) return;
    const round = rounds[idx];
    rtSumRef.current += Date.now() - shownAtRef.current;
    const isCorrect = option === round.answer;
    setPicked(option);
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
    }, isCorrect ? 400 : 1200);
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="create" size={48} color="#fff" />
          <Text style={[styles.configTitle, { color: '#fff' }]}>{t('cloze')}</Text>
          <Text style={[styles.configDesc, { color: 'rgba(255,255,255,0.8)' }]}>{t('clozeDesc')}</Text>
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
            {[8, 10, 16].map((n) => (
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
          <Text style={[styles.promptPhrase, { color: colors.text }]}>{round.text}</Text>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('clozeHint')}</Text>

        <View style={styles.optionsWrap}>
          {round.options.map((o) => {
            const isRight = picked !== null && o === round.answer;
            const isWrongPick = picked === o && o !== round.answer;
            return (
              <TouchableOpacity
                key={o}
                style={[
                  styles.answerButton,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  isRight && { backgroundColor: '#34d399', borderColor: '#34d399' },
                  isWrongPick && { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
                ]}
                onPress={() => handlePick(o)}
                activeOpacity={0.7}
              >
                <Text style={[styles.answerText, { color: isRight || isWrongPick ? '#fff' : colors.text }]}>{o}</Text>
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
          nameKey="cloze"
          icon="create"
          gradient={GRADIENT}
          skillKey="skillVocabulary"
          descriptionKey="clozeIntroDesc"
          benefits={CLOZE_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('cloze')}</Text>
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
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginBottom: 14,
  },
  promptPhrase: { fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 34 },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 14 },
  optionsWrap: { gap: 10 },
  answerButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  answerText: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
});
