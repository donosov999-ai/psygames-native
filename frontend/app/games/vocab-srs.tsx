/**
 * Словарь SRS (Полиглот TIER 1 п.1, v1.28.0).
 * Квиз «слово → 4 варианта»; SRS-график ведёт src/services/vocab-srs.ts (упрощённый SM-2).
 * Оценка автоматическая: мимо → again (карточка вернётся в сессию через 3 позиции),
 * верно → good, верно быстрее 2.5с → easy. Свои слова — через модал «Мои слова».
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
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
import { useGamePreset } from '@/src/hooks/useGamePreset';
import {
  buildQueue,
  gradeCard,
  getStats,
  addCustomWords,
  CardRef,
  SrsStats,
} from '@/src/services/vocab-srs';

const GRADIENT = ['#6366f1', '#8b5cf6'];
const EASY_RT_MS = 2500;

const VOCAB_BENEFITS = [
  { icon: 'trending-up-outline', textKey: 'benefitVocab1' },
  { icon: 'time-outline', textKey: 'benefitVocab2' },
  { icon: 'list-outline', textKey: 'benefitVocab3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result' | 'done';
type Direction = 'recognize' | 'recall'; // recognize: L2→родной · recall: родной→L2

export default function VocabSrsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startSession(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const [newLimit, setNewLimit] = useState(() => num('newLimit', 10));
  const [direction, setDirection] = useState<Direction>(() => (str('direction', 'recognize') as Direction));

  const [stats, setStats] = useState<SrsStats | null>(null);
  const [wordsModal, setWordsModal] = useState(false);
  const [wordsText, setWordsText] = useState('');
  const [addedMsg, setAddedMsg] = useState<number | null>(null);

  // Сессия
  const [queue, setQueue] = useState<CardRef[]>([]);
  const [pool, setPool] = useState<{ base: string; target: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const newLearnedRef = useRef<Set<string>>(new Set());
  const reviewsDoneRef = useRef(0);
  const rtSumRef = useRef(0);
  const answersRef = useRef(0);
  const shownAtRef = useRef(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Целевой язык не может совпадать с языком интерфейса
  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;

  useEffect(() => {
    if (phase === 'config') {
      getStats(language, tgt).then(setStats);
    }
  }, [phase, language, tgt]);

  const makeOptions = (card: CardRef, poolArg: { base: string; target: string }[]) => {
    const field = direction === 'recognize' ? 'base' : 'target';
    const right = card[field];
    const distractors = new Set<string>();
    const candidates = poolArg.map((p) => p[field]).filter((w) => w && w !== right);
    while (distractors.size < 3 && distractors.size < candidates.length) {
      distractors.add(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    const opts = [right, ...distractors];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    setOptions(opts);
    setPicked(null);
    shownAtRef.current = Date.now();
  };

  const startSession = async () => {
    const q = await buildQueue(language, tgt, newLimit);
    const cards = [...q.due, ...q.fresh];
    if (cards.length === 0) {
      const s = await getStats(language, tgt);
      setStats(s);
      setPhase('done');
      return;
    }
    setQueue(cards);
    setPool(q.pool);
    setIdx(0);
    setCorrectCount(0);
    setWrongCount(0);
    newLearnedRef.current = new Set();
    reviewsDoneRef.current = 0;
    rtSumRef.current = 0;
    answersRef.current = 0;
    setStartTime(Date.now());
    setPhase('playing');
    makeOptions(cards[0], q.pool);
  };

  const finishSession = async (finalQueueLen: number) => {
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'vocab_srs',
        score: correctCount,
        time_seconds: finalTime,
        difficulty: `${language}→${tgt}`,
        mode: direction,
        errors: wrongCount,
        details: {
          base_lang: language,
          target_lang: tgt,
          cards_total: finalQueueLen,
          new_learned: newLearnedRef.current.size,
          reviews_done: reviewsDoneRef.current,
          accuracy: answersRef.current > 0 ? correctCount / answersRef.current : 0,
          mean_rt_ms: answersRef.current > 0 ? Math.round(rtSumRef.current / answersRef.current) : 0,
          new_limit: newLimit,
        },
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }
  };

  const handlePick = async (option: string) => {
    if (picked !== null) return;
    const card = queue[idx];
    const field = direction === 'recognize' ? 'base' : 'target';
    const right = card[field];
    const rt = Date.now() - shownAtRef.current;
    const isRight = option === right;
    setPicked(option);
    answersRef.current += 1;
    rtSumRef.current += rt;

    let nextQueue = queue;
    if (isRight) {
      setCorrectCount((c) => c + 1);
      if (card.isNew) newLearnedRef.current.add(card.id);
      else reviewsDoneRef.current += 1;
      await gradeCard(language, tgt, card.id, rt < EASY_RT_MS ? 'easy' : 'good');
    } else {
      setWrongCount((c) => c + 1);
      await gradeCard(language, tgt, card.id, 'again');
      // again → вернуть карточку через 3 позиции (один повторный заход в рамках сессии)
      nextQueue = [...queue];
      nextQueue.splice(Math.min(idx + 3, nextQueue.length), 0, { ...card });
      setQueue(nextQueue);
    }

    setTimeout(() => {
      const next = idx + 1;
      if (next >= nextQueue.length) {
        finishSession(nextQueue.length);
      } else {
        setIdx(next);
        makeOptions(nextQueue[next], pool);
      }
    }, isRight ? 450 : 1100); // на ошибке дольше показываем правильный ответ
  };

  const handleAddWords = async () => {
    const added = await addCustomWords(language, tgt, wordsText);
    setAddedMsg(added);
    setWordsText('');
    getStats(language, tgt).then(setStats);
  };

  const fmtNextDue = (ms: number) => {
    const hours = Math.max(1, Math.round((ms - Date.now()) / 3600_000));
    return hours < 48 ? `~${hours} h` : `~${Math.round(hours / 24)} d`;
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.configCard}
        >
          <Ionicons name="school" size={48} color="#fff" />
          <Text style={[styles.configTitle, { color: '#fff' }]}>{t('vocabSrs')}</Text>
          <Text style={[styles.configDesc, { color: 'rgba(255,255,255,0.8)' }]}>{t('vocabSrsDesc')}</Text>
        </LinearGradient>

        {stats && (
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="stats-chart-outline" size={22} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {t('srsLearnedLabel')}: {stats.learned}/{stats.totalWords} · {t('srsDueLabel')}: {stats.dueNow} · {t('srsOwnLabel')}: {stats.customCount}
            </Text>
          </View>
        )}

        {/* Целевой язык */}
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
                <Text style={[styles.sizeButtonText, { color: tgt === l.code ? '#fff' : colors.text }]}>
                  {l.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Новых за сессию */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('srsNewPerSession')}</Text>
          <View style={styles.optionButtons}>
            {[5, 10, 15, 20].map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.sizeButton,
                  newLimit === n && { backgroundColor: GRADIENT[0] },
                  newLimit !== n && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setNewLimit(n)}
              >
                <Text style={[styles.sizeButtonText, { color: newLimit === n ? '#fff' : colors.text }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Направление */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('srsDirection')}</Text>
          <View style={styles.optionButtons}>
            {([['recognize', t('srsRecognize')], ['recall', t('srsRecall')]] as const).map(([d, label]) => (
              <TouchableOpacity
                key={d}
                style={[
                  styles.sizeButton,
                  direction === d && { backgroundColor: GRADIENT[0] },
                  direction !== d && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setDirection(d)}
              >
                <Text style={[styles.sizeButtonText, { color: direction === d ? '#fff' : colors.text }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Мои слова */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }]}
          onPress={() => { setAddedMsg(null); setWordsModal(true); }}
        >
          <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('srsMyWords')}</Text>
          {stats && stats.customCount > 0 && (
            <Text style={{ color: colors.textSecondary, marginLeft: 'auto' }}>{stats.customCount}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.startButton} onPress={startSession}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startButtonGradient}
          >
            <Ionicons name="play" size={24} color="#fff" />
            <Text style={[styles.startButtonText, { color: '#fff' }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderPlaying = () => {
    const card = queue[idx];
    if (!card) return null;
    const prompt = direction === 'recognize' ? card.target : card.base;
    const field = direction === 'recognize' ? 'base' : 'target';
    const right = card[field];

    return (
      <View style={styles.gameContainer}>
        <View style={styles.hudRow}>
          <Text style={[styles.hudText, { color: colors.textSecondary }]}>
            {idx + 1}/{queue.length}
          </Text>
          {card.isNew && (
            <View style={[styles.newBadge, { backgroundColor: GRADIENT[0] }]}>
              <Text style={styles.newBadgeText}>{t('srsNew')}</Text>
            </View>
          )}
          <Text style={[styles.hudText, { color: colors.textSecondary }]}>
            ✓ {correctCount} · ✗ {wrongCount}
          </Text>
        </View>

        <View style={[styles.promptCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.promptWord, { color: colors.text }]}>{prompt}</Text>
        </View>

        <View style={styles.optionsWrap}>
          {options.map((o) => {
            const isRight = picked !== null && o === right;
            const isWrongPick = picked === o && o !== right;
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
                <Text
                  style={[
                    styles.answerText,
                    { color: isRight || isWrongPick ? '#fff' : colors.text },
                  ]}
                >
                  {o}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderDone = () => (
    <View style={[styles.gameContainer, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
      <Ionicons name="checkmark-circle" size={72} color="#34d399" />
      <Text style={[styles.configTitle, { color: colors.text }]}>{t('srsAllDone')}</Text>
      {stats?.nextDueAt && (
        <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
          {t('srsNextDue')}: {fmtNextDue(stats.nextDueAt)}
        </Text>
      )}
      <TouchableOpacity style={styles.startButton} onPress={() => router.push('/')}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.startButtonGradient, { paddingHorizontal: 40 }]}
        >
          <Text style={[styles.startButtonText, { color: '#fff' }]}>{t('goHome')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <GameIntro
          nameKey="vocabSrs"
          icon="school"
          gradient={GRADIENT}
          skillKey="skillVocabulary"
          descriptionKey="vocabSrsIntroDesc"
          benefits={VOCAB_BENEFITS}
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
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('vocabSrs')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'done' && renderDone()}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime}
          score={correctCount}
          errors={wrongCount}
          gradient={GRADIENT}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => router.push('/')}
        />
      )}

      {/* Модал «Мои слова» */}
      <Modal visible={wordsModal} transparent animationType="slide" onRequestClose={() => setWordsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionLabel, { color: colors.text, marginBottom: 8 }]}>{t('srsMyWords')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>{t('srsAddWordsHint')}</Text>
            <TextInput
              style={[styles.wordsInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              multiline
              value={wordsText}
              onChangeText={setWordsText}
              placeholder={'word = translation\nword = translation'}
              placeholderTextColor={colors.textSecondary}
            />
            {addedMsg !== null && (
              <Text style={{ color: '#34d399', marginTop: 8 }}>{t('srsAdded')}: {addedMsg}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: GRADIENT[0] }]}
                onPress={handleAddWords}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('srsAddBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setWordsModal(false)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>{t('back')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', flexShrink: 1, minWidth: 0, textAlign: 'center' }, // крупный шрифт: заголовок ужимается и не выдавливает спейсер/кнопку за край
  placeholder: { width: 44 },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 16, paddingBottom: 20 },
  configCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  configTitle: { fontSize: 24, fontWeight: '700' },
  configDesc: { fontSize: 14, textAlign: 'center' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 14, flex: 1 },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sizeButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 56,
    alignItems: 'center',
  },
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
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  hudText: { fontSize: 15, fontWeight: '600' },
  newBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  newBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  promptCard: {
    borderRadius: 20,
    paddingVertical: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  promptWord: { fontSize: 34, fontWeight: '800', textAlign: 'center' },
  optionsWrap: { gap: 10 },
  answerButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  answerText: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { borderRadius: 20, padding: 20 },
  wordsInput: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 120,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
