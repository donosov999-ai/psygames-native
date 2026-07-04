import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
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
import { sndPlace } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import ANAGRAM_DICT from '@/src/constants/anagramWords.json';
import {
  type WordEntry,
  ANAGRAM_THEMES,
  RU_WORDS_4, RU_WORDS_5, RU_WORDS_6, RU_WORDS_7, RU_WORDS_8, RU_WORDS_9,
  EN_WORDS_4, EN_WORDS_5, EN_WORDS_6, EN_WORDS_7, EN_WORDS_8, EN_WORDS_9,
} from '@/src/data/anagrams-words';

// только буквы (кириллица/латиница с диакритикой) — без пробелов/дефисов/иероглифов
const LETTER_ONLY = /^[\p{L}]+$/u;

const GRADIENT = ['#ee9ca7', '#ffdde1'];
const ANAGRAM_BENEFITS = [
  { icon: 'language-outline', textKey: 'benefitAnagram1' },
  { icon: 'book-outline', textKey: 'benefitAnagram2' },
  { icon: 'bulb-outline', textKey: 'benefitAnagram3' },
];

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

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [length, setLength] = useState<4 | 5 | 6 | 7 | 8 | 9>(() => (num('length', 4) as 4 | 5 | 6 | 7 | 8 | 9));
  const [theme, setTheme] = useState<string>('all');   // выбранная тема слов (all = без фильтра)
  const [trials] = useState(10);
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState('');
  const [hint, setHint] = useState('');     // подсказка-намёк на слово
  const [hintsOn, setHintsOn] = useState(true);   // тумблер подсказки (выкл = хардкор, только буквы)
  const [letters, setLetters] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [hintUses, setHintUses] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usedRef = useRef<Set<string>>(new Set());   // показанные в сессии слова — без повторов

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const wordsBank = (len: 4 | 5 | 6 | 7 | 8 | 9, th: string): WordEntry[] => {
    const isRu = language === 'ru';
    const cl = isRu ? 'ru' : 'en';       // язык слова
    // курированные банки (с осмысленными подсказками-определениями); не-ru/en → английский набор
    const curated: WordEntry[] = isRu
      ? (len === 4 ? RU_WORDS_4 : len === 5 ? RU_WORDS_5 : len === 6 ? RU_WORDS_6 : len === 7 ? RU_WORDS_7 : len === 8 ? RU_WORDS_8 : RU_WORDS_9)
      : (len === 4 ? EN_WORDS_4 : len === 5 ? EN_WORDS_5 : len === 6 ? EN_WORDS_6 : len === 7 ? EN_WORDS_7 : len === 8 ? EN_WORDS_8 : EN_WORDS_9);
    // Мерж: курированный банк + словарь Дениса (anagramWords.json, с темами) + корпус TRANSLATION_VOCAB.
    // Дедуп по слову; запись из словаря (с темой) приоритетнее. Подсказка корпуса = КАТЕГОРИЯ, не перевод.
    const map = new Map<string, WordEntry>();
    for (const e of curated) map.set(e.w.toLowerCase(), { w: e.w, h: e.h });
    const dict = (((ANAGRAM_DICT as any)[cl] || {})[String(len)] as WordEntry[]) || [];
    for (const e of dict) map.set(e.w.toLowerCase(), { w: e.w, h: e.h, t: e.t });
    for (const e of TRANSLATION_VOCAB) {
      const w = (e as any)[cl];
      if (!w || [...w].length !== len || !LETTER_ONLY.test(w)) continue;
      const k = w.toLowerCase();
      if (map.has(k)) continue;
      const catLabel = (e as any).cat ? t(`catVocab_${(e as any).cat}` as any) : '';
      map.set(k, { w, h: catLabel || '' });
    }
    let all = [...map.values()];
    if (th && th !== 'all') all = all.filter((e) => e.t === th);   // тема → только размеченные слова словаря
    return all;
  };

  const newRound = () => {
    let bank = wordsBank(length, theme);
    if (bank.length < 4) bank = wordsBank(length, 'all');   // мало слов этой темы на этой длине → вся длина
    let avail = bank.filter((e) => !usedRef.current.has(e.w));
    if (avail.length === 0) { usedRef.current.clear(); avail = bank; }   // банк исчерпан → сброс
    const entry = avail[Math.floor(Math.random() * avail.length)];
    usedRef.current.add(entry.w);
    const w = entry.w.toUpperCase();
    setTarget(w);
    setHint(hintsOn ? entry.h : '');
    let arr = w.split('');
    let attempts = 0;
    do { arr = shuffle(arr); attempts++; } while (arr.join('') === w && attempts < 5);
    setLetters(arr);
    setPicked([]);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1); setHintUses(0); usedRef.current.clear();
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleLetterPress = async (idx: number) => {
    if (picked.includes(idx)) return;
    sndPlace();
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
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="language" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('anagrams')}</Text>
        <Text style={styles.configDesc}>{t('anagramsDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('lettersInWord')}</Text>
        <View style={styles.optionButtons}>
          {([4, 5, 6, 7, 8, 9] as const).map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, length === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setLength(n)}>
              <Text style={[styles.modeButtonText, { color: length === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Тема' : 'Theme'}</Text>
        <View style={styles.optionButtons}>
          {ANAGRAM_THEMES.map((th) => (
            <TouchableOpacity key={th.k} style={[styles.modeButton, theme === th.k
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTheme(th.k)}>
              <Text style={[styles.modeButtonText, { color: theme === th.k ? '#3f2b96' : colors.text }]}>
                {th.emoji} {language === 'ru' ? th.ru : th.en}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('btn_hint')}</Text>
        <View style={styles.optionButtons}>
          {([true, false] as const).map((on) => (
            <TouchableOpacity key={String(on)} style={[styles.modeButton, hintsOn === on
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setHintsOn(on)}>
              <Text style={[styles.modeButtonText, { color: hintsOn === on ? '#FFF' : colors.text }]}>
                {on ? t('label_on') : t('label_off')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={[styles.startBtnText, { color: '#3f2b96' }]}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  // Подсказка: автоматически открыть следующую правильную букву
  const revealHint = () => {
    const nextChar = target[picked.length];
    if (nextChar === undefined) return;
    const idx = letters.findIndex((ch, i) => ch === nextChar && !picked.includes(i));
    if (idx >= 0) { setHintUses((h) => h + 1); handleLetterPress(idx); }
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('anagramHint')}</Text>
      {/* 💡 Hint banner — короткий намёк на слово */}
      {hint ? (
        <View style={[styles.hintBanner, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
          <Text style={[styles.hintBannerEmoji]}>💡</Text>
          <Text style={[styles.hintBannerText, { color: colors.text }]}>{hint}</Text>
        </View>
      ) : null}
      <View style={styles.pickedRow}>
        {Array.from({ length: target.length }).map((_, i) => (
          <View key={i} style={[styles.pickedSlot, { borderColor: colors.textSecondary, backgroundColor: colors.surface }]}>
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
            activeOpacity={0.8}
            style={[
              styles.letterBtn,
              {
                backgroundColor: picked.includes(i) ? colors.surface : GRADIENT[0],
                opacity: picked.includes(i) ? 0.3 : 1,
              },
            ]}
          >
            <View style={styles.tileShine} pointerEvents="none" />
            <Text style={[styles.letterText, { color: '#3f2b96' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        {/* 💡 кнопка-подсказка только когда тумблер ВКЛ — иначе «хардкор» подсказку не выключал */}
        {hintsOn && (
          <TouchableOpacity onPress={revealHint} style={[styles.clearBtn, { flex: 1, backgroundColor: '#fbbf24' }]}>
            <Text style={[styles.clearText, { color: '#1a1a1a' }]}>💡 {t('btn_hint')}{hintUses > 0 ? ` (${hintUses})` : ''}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setPicked([])} style={[styles.clearBtn, { flex: 1, backgroundColor: colors.surface }]}>
          <Text style={[styles.clearText, { color: colors.text }]}>{t('clear')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('anagrams')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="anagrams" icon="language" gradient={GRADIENT as [string, string]}
          skillKey="skillVerbal" descriptionKey="anagramsIntroDesc"
          benefits={ANAGRAM_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={hits * 100} time={elapsedTime} errors={errors}
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
  configScroll: { flex: 1 },
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
  playArea: { flex: 1, justifyContent: 'center', padding: 24, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    maxWidth: 360,
  },
  hintBannerEmoji: { fontSize: 20 },
  hintBannerText: { fontSize: 14, fontWeight: '600', flex: 1 },
  pickedRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  pickedSlot: { width: 44, height: 54, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  pickedLetter: { fontSize: 22, fontWeight: '700' },
  lettersRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 360 },
  letterBtn: { width: 56, height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tileShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '46%', backgroundColor: 'rgba(255,255,255,0.28)' },
  letterText: { fontSize: 24, fontWeight: '800' },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, marginTop: 8, borderWidth: 1.5, borderColor: 'rgba(128,128,128,0.4)' },
  clearText: { fontSize: 13, fontWeight: '600' },
});
