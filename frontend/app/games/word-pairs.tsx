import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { RUSSIAN_WORDS, ENGLISH_WORDS } from '@/src/constants/games';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { useGamePreset, useAutostart } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#f093fb', '#f5576c'];
const PENALTY_SECONDS = 15;

const WORD_PAIRS_BENEFITS = [
  { icon: 'people-outline', textKey: 'benefitWordPairs1' },
  { icon: 'language-outline', textKey: 'benefitWordPairs2' },
  { icon: 'git-branch-outline', textKey: 'benefitWordPairs3' },
];

type GamePhase = 'intro' | 'config' | 'memorize' | 'check' | 'result';

interface WordPair {
  id: number;
  word1: string;
  word2: string;
}

export default function WordPairsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isPreset, str, num } = useGamePreset();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [pairs, setPairs] = useState<WordPair[]>([]);
  const [shuffledRight, setShuffledRight] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Set<number>>(new Set());
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const [pairCount, setPairCount] = useState(() => num('pairCount', 10));
  const [mode, setMode] = useState<'random' | 'translation'>(() => (str('mode', 'random') as 'random' | 'translation'));
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const generatePairs = () => {
    if (mode === 'translation') {
      const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;
      const vocab = [...TRANSLATION_VOCAB];
      for (let i = vocab.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [vocab[i], vocab[j]] = [vocab[j], vocab[i]];
      }
      const transPairs: WordPair[] = [];
      for (let i = 0; i < pairCount && i < vocab.length; i++) {
        transPairs.push({
          id: i,
          word1: vocab[i][language] || vocab[i].en,
          word2: vocab[i][tgt] || vocab[i].en,
        });
      }
      return transPairs;
    }
    const words = language === 'ru' ? [...RUSSIAN_WORDS] : [...ENGLISH_WORDS];
    // Shuffle words
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
    
    const newPairs: WordPair[] = [];
    for (let i = 0; i < pairCount; i++) {
      newPairs.push({
        id: i,
        word1: words[i * 2],
        word2: words[i * 2 + 1],
      });
    }
    return newPairs;
  };

  const startGame = () => {
    const newPairs = generatePairs();
    setPairs(newPairs);
    setMatchedPairs(new Set());
    setErrors(0);
    setSelectedLeft(null);
    setSelectedRight(null);
    setPhase('memorize');
    setStartTime(Date.now());
    
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
    }, 100);
  };

  useAutostart(isPreset, startGame);

  const startCheck = () => {
    // Shuffle right column words
    const rightWords = pairs.map(p => p.word2);
    for (let i = rightWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rightWords[i], rightWords[j]] = [rightWords[j], rightWords[i]];
    }
    setShuffledRight(rightWords);
    setPhase('check');
    
    // Stop timer for single exercises
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleLeftSelect = (pairId: number) => {
    if (matchedPairs.has(pairId)) return;
    setSelectedLeft(pairId);
    
    if (selectedRight !== null) {
      checkMatch(pairId, selectedRight);
    }
  };

  const handleRightSelect = (word: string) => {
    if (matchedPairs.has(pairs.findIndex(p => p.word2 === word))) return;
    setSelectedRight(word);
    
    if (selectedLeft !== null) {
      checkMatch(selectedLeft, word);
    }
  };

  const checkMatch = async (leftId: number, rightWord: string) => {
    const pair = pairs[leftId];
    
    if (pair.word2 === rightWord) {
      // Correct match
      const newMatched = new Set(matchedPairs);
      newMatched.add(leftId);
      setMatchedPairs(newMatched);
      
      // Check if all pairs matched
      if (newMatched.size === pairs.length) {
        const finalTime = elapsedTime + (errors * PENALTY_SECONDS);
        setPhase('result');
        
        try {
          await saveSession({
            game_type: 'word_pairs',
            score: pairs.length - errors,
            time_seconds: finalTime,
            difficulty: mode === 'translation' ? `${pairCount} pairs · ${language}→${targetLang}` : `${pairCount} pairs`,
            errors: errors,
            details: { hits: pairs.length - errors, errors, pair_count: pairCount, mode, ...(mode === 'translation' ? { base_lang: language, target_lang: targetLang } : {}) },
          });
        } catch (error) {
          console.error('Error saving session:', error);
        }
      }
    } else {
      // Wrong match - penalty
      setErrors(prev => prev + 1);
    }
    
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient
        colors={GRADIENT as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.configCard}
      >
        <Ionicons name="link" size={48} color="#FFFFFF" />
        <Text style={styles.configTitle}>{t('wordPairs')}</Text>
        <Text style={styles.configDesc}>{t('wordPairsDesc')}</Text>
      </LinearGradient>

      <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
        <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          {language === 'ru' 
            ? 'Запомните пары слов, затем восстановите связи. Штраф за ошибку: 15 сек.'
            : 'Memorize word pairs, then restore connections. Penalty: 15 sec per error.'}
        </Text>
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {language === 'ru' ? 'Режим' : 'Mode'}
        </Text>
        <View style={styles.modeRow}>
          {([['random', language === 'ru' ? 'Случайные пары' : 'Random pairs'],
             ['translation', language === 'ru' ? 'Перевод' : 'Translation']] as const).map(([m, label]) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeButton,
                mode === m
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeButtonText, { color: mode === m ? '#FFFFFF' : colors.text }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'translation' && (
          <>
            <Text style={[styles.optionLabel, { color: colors.text, marginTop: 16 }]}>
              {(language === 'ru' ? 'Перевод' : 'Translate')}: {LANGUAGES.find(l => l.code === language)?.name} →
            </Text>
            <View style={styles.optionButtons}>
              {LANGUAGES.filter(l => l.code !== language).map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={[
                    styles.langButton,
                    targetLang === l.code
                      ? { backgroundColor: GRADIENT[0] }
                      : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                  onPress={() => setTargetLang(l.code)}
                >
                  <Text style={[styles.langButtonText, { color: targetLang === l.code ? '#FFFFFF' : colors.text }]}>
                    {l.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {language === 'ru' ? 'Количество пар' : 'Number of pairs'}
        </Text>
        <View style={styles.optionButtons}>
          {[5, 10, 15, 20].map((count) => (
            <TouchableOpacity
              key={count}
              style={[
                styles.sizeButton,
                pairCount === count && { backgroundColor: GRADIENT[0] },
                pairCount !== count && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setPairCount(count)}
            >
              <Text
                style={[
                  styles.sizeButtonText,
                  { color: pairCount === count ? '#FFFFFF' : colors.text },
                ]}
              >
                {count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.startButton} onPress={startGame}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Ionicons name="play" size={24} color="#FFFFFF" />
          <Text style={styles.startButtonText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderMemorize = () => (
    <View style={styles.gameContainer}>
      <View style={styles.gameHeader}>
        <View style={[styles.timerBox, { backgroundColor: GRADIENT[0] }]}>
          <Ionicons name="time-outline" size={20} color="#FFFFFF" />
          <Text style={styles.timerText}>{elapsedTime.toFixed(1)}s</Text>
        </View>
      </View>
      
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {mode === 'translation'
          ? `${LANGUAGES.find(l => l.code === language)?.name} → ${LANGUAGES.find(l => l.code === targetLang)?.name}`
          : (language === 'ru' ? 'Запомните пары слов' : 'Memorize word pairs')}
      </Text>
      
      <ScrollView style={styles.pairsList} showsVerticalScrollIndicator={false}>
        {pairs.map((pair, index) => (
          <View key={index} style={[styles.pairRow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.pairWord, { color: colors.text }]}>{pair.word1}</Text>
            <Ionicons name="arrow-forward" size={20} color={GRADIENT[0]} />
            <Text style={[styles.pairWord, { color: GRADIENT[0], fontWeight: '700' }]}>{pair.word2}</Text>
          </View>
        ))}
      </ScrollView>
      
      <TouchableOpacity style={styles.checkButton} onPress={startCheck}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
          <Text style={styles.startButtonText}>
            {language === 'ru' ? 'Проверка' : 'Check'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderCheck = () => (
    <View style={styles.gameContainer}>
      <View style={styles.gameHeader}>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('time')}</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{elapsedTime.toFixed(1)}s</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('errors')}</Text>
          <Text style={[styles.statValue, { color: errors > 0 ? colors.error : colors.text }]}>
            {errors} (+{errors * PENALTY_SECONDS}s)
          </Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {language === 'ru' ? 'Найдено' : 'Found'}
          </Text>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {matchedPairs.size}/{pairs.length}
          </Text>
        </View>
      </View>
      
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {language === 'ru' ? 'Восстановите пары' : 'Restore pairs'}
      </Text>
      
      <ScrollView style={styles.checkContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.columnsContainer}>
          {/* Left column */}
          <View style={styles.column}>
            {pairs.map((pair) => {
              const isMatched = matchedPairs.has(pair.id);
              const isSelected = selectedLeft === pair.id;
              return (
                <TouchableOpacity
                  key={pair.id}
                  style={[
                    styles.wordButton,
                    { backgroundColor: isMatched ? colors.success : isSelected ? GRADIENT[0] : colors.surface },
                  ]}
                  onPress={() => !isMatched && handleLeftSelect(pair.id)}
                  disabled={isMatched}
                >
                  <Text style={[
                    styles.wordButtonText,
                    { color: isMatched || isSelected ? '#FFFFFF' : colors.text }
                  ]}>
                    {pair.word1}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          {/* Right column (shuffled) */}
          <View style={styles.column}>
            {shuffledRight.map((word, index) => {
              const originalPair = pairs.find(p => p.word2 === word);
              const isMatched = originalPair ? matchedPairs.has(originalPair.id) : false;
              const isSelected = selectedRight === word;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.wordButton,
                    { backgroundColor: isMatched ? colors.success : isSelected ? GRADIENT[0] : colors.surface },
                  ]}
                  onPress={() => !isMatched && handleRightSelect(word)}
                  disabled={isMatched}
                >
                  <Text style={[
                    styles.wordButtonText,
                    { color: isMatched || isSelected ? '#FFFFFF' : colors.text }
                  ]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="wordPairs"
          icon="link"
          gradient={GRADIENT}
          skillKey="skillMemory"
          descriptionKey="wordPairsIntroDesc"
          benefits={WORD_PAIRS_BENEFITS}
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
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('wordPairs')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'memorize' && renderMemorize()}
      {phase === 'check' && renderCheck()}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime + (errors * PENALTY_SECONDS)}
          score={pairs.length - errors}
          errors={errors}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700' },
  placeholder: { width: 44 },
  configContainer: { flex: 1, paddingHorizontal: 20 },
  configCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  configTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  configDesc: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 13, flex: 1 },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap' },
  sizeButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  sizeButtonText: { fontSize: 16, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  modeButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modeButtonText: { fontSize: 14, fontWeight: '600' },
  langButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginRight: 6, marginTop: 8 },
  langButtonText: { fontSize: 14, fontWeight: '600' },
  startButton: { marginTop: 'auto', marginBottom: 20 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  startButtonText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  gameContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    marginBottom: 8,
  },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  timerText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  phaseTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  pairsList: { flex: 1 },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    marginBottom: 12,
  },
  pairWord: { fontSize: 15, flex: 1 },
  checkButton: { marginBottom: 20 },
  checkContainer: { flex: 1 },
  columnsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  column: {
    flex: 1,
    marginBottom: 8,
  },
  wordButton: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  wordButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
