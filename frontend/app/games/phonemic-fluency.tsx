/**
 * Phonemic Fluency (COWAT — Controlled Oral Word Association Test)
 *
 * Парадигма: за 60 сек назови максимум слов на заданную букву.
 * Стандарт COWAT — буквы F/A/S (англ) или К/Л/М/П/С (рус).
 *
 * Правила:
 *  - слово должно начинаться с заданной буквы
 *  - длина >= 2 символов
 *  - не имена собственные (упрощённо: всё в lowercase)
 *  - не повторы (валидация автоматом)
 *
 * Биомаркеры (классика для левой нижней лобной извилины + executive function):
 *  - word_count            — общее количество valid слов
 *  - repetitions           — повторы (perseveration маркер)
 *  - mean_inter_word_sec   — среднее время между словами (выше = труднее доступ к лексикону)
 *  - first_half_count      — слов в первые 30 сек (быстрый старт)
 *  - second_half_count     — во вторые 30 сек (выносливость)
 *
 * Critical для публичных выступлений / переговоров — прямая мера лексической доступности
 * под временным давлением.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndTimerTick, sndTimerEnd } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#16a085', '#f4d03f'];
const FLU_BENEFITS = [
  { icon: 'chatbubbles-outline',  textKey: 'benefitFlu1' },
  { icon: 'flash-outline',         textKey: 'benefitFlu2' },
  { icon: 'school-outline',        textKey: 'benefitFlu3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

const RU_LETTERS = ['К','Л','М','П','С','Т','Б','В','Г','Д','Н','Р'];
const EN_LETTERS = ['F','A','S','B','C','D','M','P','R','T','L','N'];

export default function PhonemicFluencyGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [duration, setDuration] = useState<60 | 90 | 120>(() => (num('duration', 60) as 60 | 90 | 120));
  const [letter, setLetter] = useState<string>('');
  const [autoPickLetter, setAutoPickLetter] = useState(true);

  const [input, setInput] = useState('');
  const [words, setWords] = useState<{word: string, ts: number, valid: boolean, reason?: string}[]>([]);
  const [remaining, setRemaining] = useState(60);

  const startTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const letterPool = language === 'en' ? EN_LETTERS : RU_LETTERS;

  const startGame = () => {
    const L = autoPickLetter
      ? letterPool[Math.floor(Math.random() * letterPool.length)]
      : (letter || letterPool[0]);
    setLetter(L);
    setWords([]);
    setInput('');
    setRemaining(duration);
    setPhase('playing');
    startTimeRef.current = Date.now();
    let lastSec: number = duration;
    intervalRef.current = setInterval(() => {
      const left = duration - Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRemaining(Math.max(0, left));
      if (left !== lastSec) { lastSec = left; if (left > 0 && left <= 5) sndTimerTick(); }   // SND-T: тик последних 5с
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        sndTimerEnd();   // SND-T: «время вышло»
        finish();
      }
    }, 200);
  };

  // Word validation rules (no random gibberish)
  const isValidWord = (raw: string, letter: string, lang: 'ru' | 'en'): { valid: boolean; reason?: string } => {
    if (raw.length < 3) return { valid: false, reason: 'too_short' };
    if (raw.length > 30) return { valid: false, reason: 'too_long' };
    if (raw[0].toUpperCase() !== letter) return { valid: false, reason: 'wrong_letter' };
    // Only language letters
    const validChars = lang === 'ru' ? /^[а-яё-]+$/i : /^[a-z-]+$/i;
    if (!validChars.test(raw)) return { valid: false, reason: 'non_letters' };
    // Reject obvious gibberish: no vowels at all → not a real word
    const vowels = lang === 'ru' ? /[аеёиоуыэюя]/i : /[aeiouy]/i;
    if (!vowels.test(raw)) return { valid: false, reason: 'no_vowels' };
    // Reject 3+ same characters in a row (typing junk)
    if (/(.)\1\1/.test(raw)) return { valid: false, reason: 'repetition_pattern' };
    // Reject same 2 chars repeated 3+ times (e.g. "abababab")
    if (/(..)\1\1/.test(raw)) return { valid: false, reason: 'repetition_pattern' };
    return { valid: true };
  };

  const submitWord = () => {
    const raw = input.trim().toLowerCase();
    setInput('');
    if (!raw) return;
    const ts = Date.now();
    let result = isValidWord(raw, letter, language as 'ru' | 'en');
    let valid = result.valid;
    let reason: string | undefined = result.reason;
    if (valid && words.some(w => w.word === raw && w.valid)) {
      valid = false;
      reason = 'repetition';
    }
    setWords(prev => [...prev, { word: raw, ts, valid, reason }]);
  };

  const finish = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('result');

    const validWords = words.filter(w => w.valid);
    const repetitions = words.filter(w => !w.valid && w.reason === 'repetition').length;
    const wrongLetter = words.filter(w => !w.valid && w.reason === 'wrong_letter').length;
    const tooShort = words.filter(w => !w.valid && w.reason === 'too_short').length;

    // mean inter-word interval (only on valid)
    let meanInter = 0;
    if (validWords.length >= 2) {
      let totalGap = 0;
      for (let i = 1; i < validWords.length; i++) {
        totalGap += (validWords[i].ts - validWords[i-1].ts) / 1000;
      }
      meanInter = totalGap / (validWords.length - 1);
    }

    // First/second half breakdown
    const halfTime = startTimeRef.current + (duration / 2) * 1000;
    const firstHalf = validWords.filter(w => w.ts < halfTime).length;
    const secondHalf = validWords.filter(w => w.ts >= halfTime).length;

    try {
      await saveSession({
        game_type: 'phonemic_fluency',
        score: validWords.length * 10,
        time_seconds: duration,
        difficulty: language === 'en' ? `letter-${letter}` : `буква-${letter}`,
        mode: `${duration}s`,
        errors: repetitions + wrongLetter + tooShort,
        details: {
          word_count: validWords.length,
          repetitions,
          wrong_letter: wrongLetter,
          too_short: tooShort,
          mean_inter_word_sec: Number(meanInter.toFixed(2)),
          first_half_count: firstHalf,
          second_half_count: secondHalf,
          letter,
          words_list: validWords.map(w => w.word),
        },
      });
    } catch (e) { console.error(e); }
  };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="chatbubbles" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('phonemic')}</Text>
        <Text style={styles.configDesc}>{t('phonemicDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('cptDuration')}</Text>
        <View style={styles.optionButtons}>
          {([60, 90, 120] as const).map((d) => (
            <TouchableOpacity key={d} style={[styles.modeButton, duration === d
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDuration(d)}>
              <Text style={[styles.modeButtonText, { color: duration === d ? '#FFF' : colors.text }]}>{d}s</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('phonemicLetter')}</Text>
        <TouchableOpacity onPress={() => setAutoPickLetter(!autoPickLetter)} style={styles.toggleRow}>
          <Ionicons name={autoPickLetter ? 'checkbox' : 'square-outline'} size={20} color={GRADIENT[0]} />
          <Text style={[styles.modeButtonText, { color: colors.text }]}>{t('phonemicAutoPick')}</Text>
        </TouchableOpacity>
        {!autoPickLetter && (
          <View style={styles.optionButtons}>
            {letterPool.slice(0, 8).map((L) => (
              <TouchableOpacity key={L} style={[styles.modeButton, letter === L
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setLetter(L)}>
                <Text style={[styles.modeButtonText, { color: letter === L ? '#FFF' : colors.text, fontSize: 16 }]}>{L}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        {t('phonemicRules')}
      </Text>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const validCount = words.filter(w => w.valid).length;

  // игровая фаза — на едином каркасе GameShell: таймер/счёт/буква в статс-строке;
  // ввод и кнопка «добавить» остаются в поле рядом с клавиатурой (не в нижнем тулбаре)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('phonemic')}
        onBack={() => goBackOrHome()}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text, fontSize: 24 }]}>{remaining}s</Text>
            <Text style={[styles.statText, { color: '#22c55e', fontSize: 24 }]}>{validCount}</Text>
            <View style={[styles.letterBox, { borderColor: GRADIENT[0] }]}>
              <Text style={[styles.letterBig, { color: colors.text }]}>{letter}</Text>
            </View>
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {t('phonemicHint').replace('{L}', letter)}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder={t('phonemicPlaceholder').replace('{L}', letter.toLowerCase())}
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submitWord}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: GRADIENT[0] }]} onPress={submitWord}>
            <Text style={styles.addBtnText}>+ {t('phonemicAdd')}</Text>
          </TouchableOpacity>
          <ScrollView style={styles.wordList} contentContainerStyle={styles.wordListInner}>
            {words.slice().reverse().map((w, i) => (
              <View key={i} style={[styles.wordChip, {
                backgroundColor: w.valid ? '#22c55e22' : '#f43f5e22',
                borderColor: w.valid ? '#22c55e' : '#f43f5e',
              }]}>
                <Text style={[styles.wordText, { color: w.valid ? '#22c55e' : '#f43f5e' }]}>
                  {w.word}
                  {!w.valid && w.reason === 'repetition' && ' ↻'}
                  {!w.valid && w.reason === 'wrong_letter' && ' ✗'}
                  {!w.valid && w.reason === 'too_short' && ' ‹'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('phonemic')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="phonemic" icon="chatbubbles" gradient={GRADIENT as [string, string]}
          skillKey="skillVerbal" descriptionKey="phonemicIntroDesc"
          benefits={FLU_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'result' && (
        <GameResult
          score={validCount * 10}
          time={duration} errors={words.length - validCount}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, minWidth: 48, alignItems: 'center' },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16, lineHeight: 18 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fieldCol: { flex: 1, alignSelf: 'stretch', paddingVertical: 8, gap: 14, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24, alignItems: 'center', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '900' },
  letterBox: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  letterBig: { fontSize: 44, fontWeight: '900' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  input: { width: '100%', maxWidth: 380, height: 52, paddingHorizontal: 14, fontSize: 18, borderRadius: 10, borderWidth: 1, fontWeight: '600' },
  addBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10 },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  wordList: { flex: 1, width: '100%', maxWidth: 480, marginTop: 4 },
  wordListInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingBottom: 20 },
  wordChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  wordText: { fontSize: 13, fontWeight: '700' },
});
