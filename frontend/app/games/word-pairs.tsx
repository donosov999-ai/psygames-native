import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
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
import GameShell from '@/src/components/GameShell';
import { RUSSIAN_WORDS, ENGLISH_WORDS } from '@/src/constants/games';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { useGamePreset, useAutostart } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#f093fb', '#f5576c'];
const PENALTY_SECONDS = 15;

const WORD_PAIRS_BENEFITS = [
  { icon: 'people-outline', textKey: 'benefitWordPairs1' },
  { icon: 'language-outline', textKey: 'benefitWordPairs2' },
  { icon: 'git-branch-outline', textKey: 'benefitWordPairs3' },
];

type GamePhase = 'intro' | 'config' | 'memorize' | 'check' | 'cleared' | 'result';

interface WordPair {
  id: number;
  word1: string;
  word2: string;
}

// Уровень 1..15 (persist, паттерн cpt/simon): пар больше (4 → 15), времени на
// запоминание НА ПАРУ меньше (7.0с → 2.5с). Лимит — только на фазу запоминания;
// соединение пар, как и раньше, по времени не ограничено (ошибки штрафуются).
// Потолок 15 пар безопасен для всех языков: словники RU/EN = 50 слов (25 пар max),
// TRANSLATION_VOCAB ~189 записей с fallback на en.
function levelParams(level: number): { pairCount: number; perPairMs: number } {
  const pairCount = Math.min(15, 4 + Math.floor((level - 1) * 0.8));   // 4 → 15 пар
  const perPairMs = Math.max(2500, 7000 - (level - 1) * 320);          // 7.0с → 2.5с на пару
  return { pairCount, perPairMs };
}

/** Проход: точность ≥80% ⇔ ошибок ≤ пар/4 (accuracy = пары / (пары + ошибки)) */
const maxErrorsAllowed = (pairCount: number) => Math.floor(pairCount / 4);

export default function WordPairsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isPreset, str, num } = useGamePreset();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [clearedPassed, setClearedPassed] = useState(true);   // прошёл ли уровень (для баннера passed)
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

  // Уровни (persist): ручной селектор числа пар заменён лесенкой 1..15.
  // Пресет зарядки (isPreset) по-прежнему задаёт pairCount сам и без лимита времени.
  const lvl = usePersistentLevel('word_pairs');
  const [memorizeLimitSec, setMemorizeLimitSec] = useState(0);   // 0 = без лимита (пресет)

  // Рефы — авто-переход memorize→check по таймауту уровня живёт вне ре-рендеров,
  // state в колбэке setTimeout был бы устаревшим (паттерн simon/cpt).
  const levelRef = useRef(1);
  const useLevelRef = useRef(false);   // запущено по уровню? (для reach/fail)
  const pairsRef = useRef<WordPair[]>([]);
  const checkStartedRef = useRef(false);
  const memorizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (memorizeTimerRef.current) clearTimeout(memorizeTimerRef.current);
    };
  }, []);

  // Цель перевода НЕ должна совпадать с языком интерфейса. Иначе (напр. сменили RU→EN, а
  // сохранённый target остался 'en') подпись показывала «English → English», а колонка молча
  // падала на испанский (fallback в generatePairs) — расхождение подписи и данных. Держим target ≠ язык.
  useEffect(() => {
    setTargetLang((cur) => (cur === language ? (language === 'en' ? 'es' : 'en') : cur));
  }, [language]);

  const generatePairs = (count: number) => {
    if (mode === 'translation') {
      const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;
      const vocab = [...TRANSLATION_VOCAB];
      for (let i = vocab.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [vocab[i], vocab[j]] = [vocab[j], vocab[i]];
      }
      const transPairs: WordPair[] = [];
      for (let i = 0; i < count && i < vocab.length; i++) {
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
    for (let i = 0; i < count; i++) {
      newPairs.push({
        id: i,
        word1: words[i * 2],
        word2: words[i * 2 + 1],
      });
    }
    return newPairs;
  };

  const startGame = () => {
    // Уровневый режим (persist): число пар и лимит запоминания из levelParams.
    // Пресет зарядки — ручной pairCount, без лимита времени.
    const useLevel = !isPreset;
    useLevelRef.current = useLevel;
    let count: number;
    let limitMs = 0;
    if (useLevel) {
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      count = p.pairCount;
      limitMs = p.perPairMs * count;
      setPairCount(count);
      setMemorizeLimitSec(Math.round(limitMs / 1000));
    } else {
      count = pairCount;
      setMemorizeLimitSec(0);
    }
    const newPairs = generatePairs(count);
    pairsRef.current = newPairs;
    checkStartedRef.current = false;
    setPairs(newPairs);
    setMatchedPairs(new Set());
    setErrors(0);
    setSelectedLeft(null);
    setSelectedRight(null);
    setPhase('memorize');
    setStartTime(Date.now());

    const start = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
    }, 100);

    // Уровень: авто-переход к проверке по лимиту запоминания (реф, чтобы не поймать stale-стейт)
    if (memorizeTimerRef.current) clearTimeout(memorizeTimerRef.current);
    if (useLevel && limitMs > 0) {
      memorizeTimerRef.current = setTimeout(() => startCheck(), limitMs);
    }
  };

  useAutostart(isPreset, startGame);

  const startCheck = () => {
    if (checkStartedRef.current) return;   // не дублировать (кнопка + таймаут уровня)
    checkStartedRef.current = true;
    if (memorizeTimerRef.current) { clearTimeout(memorizeTimerRef.current); memorizeTimerRef.current = null; }
    // Shuffle right column words (источник — реф, устойчив к таймауту)
    const src = pairsRef.current.length ? pairsRef.current : pairs;
    const rightWords = src.map(p => p.word2);
    for (let i = rightWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rightWords[i], rightWords[j]] = [rightWords[j], rightWords[i]];
    }
    setShuffledRight(rightWords);
    setPhase('check');
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
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = elapsedTime + (errors * PENALTY_SECONDS);
        // Проход уровня: точность ≥80% ⇔ ошибок ≤ пар/4. Вверх мгновенно, вниз с гистерезисом.
        const passed = useLevelRef.current && errors <= maxErrorsAllowed(pairs.length);
        if (!isPreset && useLevelRef.current) {
          if (passed) lvl.reach(levelRef.current + 1);
          else lvl.fail();
        }
        setClearedPassed(passed);
        setPhase(useLevelRef.current ? 'cleared' : 'result');   // непрерывный поток: провал → баннер «ещё раз», не тупик

        try {
          await saveSession({
            game_type: 'word_pairs',
            score: pairs.length - errors,
            time_seconds: finalTime,
            difficulty: mode === 'translation' ? `${pairs.length} pairs · ${language}→${targetLang}` : `${pairs.length} pairs`,
            errors: errors,
            details: { hits: pairs.length - errors, errors, pair_count: pairs.length, mode, ...(useLevelRef.current ? { level: levelRef.current } : {}), ...(mode === 'translation' ? { base_lang: language, target_lang: targetLang } : {}) },
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

      <LevelProgressMap gameId="word_pairs" currentLevel={lvl.level} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center', marginBottom: 12 }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
          {t('level')} {lvl.level}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 2 }}>
          {(() => { const p = levelParams(lvl.level); return t('wordPairsLvlParams').replace('{n}', String(p.pairCount)).replace('{w}', String(Math.round(p.perPairMs * p.pairCount / 1000))).replace('{e}', String(maxErrorsAllowed(p.pairCount))); })()}
        </Text>
        {lvl.level > 1 && (
          <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.card }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
        <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          {t('desc_word_pairs_rules')}
        </Text>
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {t('mode')}
        </Text>
        <View style={styles.modeRow}>
          {([['random', t('label_random_pairs')],
             ['translation', t('label_translation')]] as const).map(([m, label]) => (
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
              {t('label_translate')}: {LANGUAGES.find(l => l.code === language)?.name} →
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

  // memorize-фаза — на едином каркасе GameShell (список пар в скролл-поле, «Проверить» прибита к низу)
  const renderMemorize = () => (
    <GameShell
      title={t('wordPairs')}
      onBack={() => goBackOrHome()}
      scrollableField
      stats={
        <View style={styles.gameHeader}>
          <View style={[styles.timerBox, { backgroundColor: GRADIENT[0] }]}>
            <Ionicons name="time-outline" size={20} color="#FFFFFF" />
            <Text style={styles.timerText}>
              {memorizeLimitSec > 0
                ? `${Math.max(0, memorizeLimitSec - elapsedTime).toFixed(0)}s`
                : `${elapsedTime.toFixed(1)}s`}
            </Text>
          </View>
        </View>
      }
      toolbar={
        <TouchableOpacity style={styles.toolbarBtn} onPress={startCheck}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.startButtonGradient, styles.toolbarGrad]}
          >
            <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
            <Text style={styles.startButtonText}>
              {t('btn_check')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      }
    >
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {mode === 'translation'
          ? `${LANGUAGES.find(l => l.code === language)?.name} → ${LANGUAGES.find(l => l.code === targetLang)?.name}`
          : t('label_memorize_word_pairs')}
      </Text>
      {pairs.map((pair, index) => (
        <View key={index} style={[styles.pairRow, { backgroundColor: colors.surface }]}>
          <Text style={[styles.pairWord, { color: colors.text }]}>{pair.word1}</Text>
          {/* стрелка между двумя словами не сжимается при крупном шрифте */}
          <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} style={{ flexShrink: 0 }} />
          <Text style={[styles.pairWord, { color: colors.text, fontWeight: '700' }]}>{pair.word2}</Text>
        </View>
      ))}
    </GameShell>
  );

  // check-фаза — тот же каркас; соединение пар идёт тапами по колонкам, кнопок действий нет
  const renderCheck = () => (
    <GameShell
      title={t('wordPairs')}
      onBack={() => goBackOrHome()}
      scrollableField
      stats={
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
              {t('label_found')}
            </Text>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {matchedPairs.size}/{pairs.length}
            </Text>
          </View>
        </View>
      }
    >
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {t('label_restore_pairs')}
      </Text>
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
    </GameShell>
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
          onBack={() => goBackOrHome()}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'memorize') return renderMemorize();
  if (phase === 'check') return renderCheck();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('wordPairs')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="word_pairs"
          passed={clearedPassed}
          level={levelRef.current}
          stars={errors === 0 ? 3 : errors <= 1 ? 2 : 1}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          onContinue={() => startGame()}
          onStop={() => setPhase('config')}
        />
      )}
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
  title: { fontSize: 18, fontWeight: '700', flexShrink: 1, minWidth: 0 },  // крупный шрифт: заголовок ужимается между «назад» и спейсером
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
  // Кнопка «Проверить» в тулбаре каркаса: тянется на всю ширину ряда
  toolbarBtn: { flex: 1 },
  toolbarGrad: { marginBottom: 0 },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
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
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  pairWord: { fontSize: 17, flex: 1, fontWeight: '600', minWidth: 0 },  // крупный шрифт: слово ужимается/переносится, а не толкает соседнюю колонку за край
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
    borderWidth: 1.5,
    borderColor: 'rgba(128,128,128,0.4)',
  },
  wordButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
