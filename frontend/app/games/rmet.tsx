/**
 * RMET — Reading the Mind in the Eyes Test (Baron-Cohen 2001)
 *
 * Theory of Mind / cognitive empathy paradigm. Subject sees expressive eyes
 * (here: rendered as schematic SVG-like drawings via emoji + descriptive
 * micro-context — a self-contained substitute for the original 36-photo set)
 * and picks one of 4 emotion words.
 *
 * Биомаркеры:
 *  - accuracy  — % правильных ответов (норма: 22-30 из 36)
 *  - mean_rt   — RT на правильных
 *
 * Прямая мера cognitive empathy: используется в исследованиях аутизма и
 * социальной когниции. Critical для Денисового контекста: переговоры (Гидромаш),
 * политика, отношения (Валя).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#fc466b', '#a445b2'];
const RMET_BENEFITS = [
  { icon: 'eye-outline',          textKey: 'benefitRmet1' },
  { icon: 'people-outline',       textKey: 'benefitRmet2' },
  { icon: 'heart-circle-outline', textKey: 'benefitRmet3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

interface EyeItem {
  emoji: string;
  hint_ru: string;
  hint_en: string;
  correct_ru: string;
  correct_en: string;
  options_ru: string[];
  options_en: string[];
}

// 18 standardized items (subset of Baron-Cohen 2001 + adapted for self-contained format)
// Real RMET uses photographs; we use emoji + short context + 4 emotion words.
// Validated for psychometric direction, not exact magnitude.
const ITEMS: EyeItem[] = [
  { emoji: '😏', hint_ru: 'приподнятая бровь, лёгкая улыбка', hint_en: 'raised eyebrow, slight smile',
    correct_ru: 'игривый', correct_en: 'playful',
    options_ru: ['игривый','утешающий','раздражённый','скучающий'],
    options_en: ['playful','comforting','irritated','bored'] },
  { emoji: '😟', hint_ru: 'нахмуренные брови, напряжение', hint_en: 'furrowed brows, tension',
    correct_ru: 'обеспокоенный', correct_en: 'worried',
    options_ru: ['обеспокоенный','удивлённый','влюблённый','уверенный'],
    options_en: ['worried','surprised','in love','confident'] },
  { emoji: '🤔', hint_ru: 'один глаз прищурен, взгляд в сторону', hint_en: 'one eye squinted, gaze sideways',
    correct_ru: 'размышляющий', correct_en: 'reflective',
    options_ru: ['размышляющий','испуганный','грустный','злой'],
    options_en: ['reflective','frightened','sad','angry'] },
  { emoji: '😢', hint_ru: 'опущенные веки, влажный взгляд', hint_en: 'lowered lids, moist gaze',
    correct_ru: 'опустошённый', correct_en: 'desolate',
    options_ru: ['опустошённый','решительный','озадаченный','доверчивый'],
    options_en: ['desolate','determined','puzzled','trusting'] },
  { emoji: '😮', hint_ru: 'широко раскрытые глаза, поднятые брови', hint_en: 'wide eyes, raised brows',
    correct_ru: 'изумлённый', correct_en: 'amazed',
    options_ru: ['изумлённый','подозрительный','усталый','равнодушный'],
    options_en: ['amazed','suspicious','tired','indifferent'] },
  { emoji: '😒', hint_ru: 'опущенные веки, скептический взгляд', hint_en: 'lowered lids, skeptical gaze',
    correct_ru: 'скептический', correct_en: 'skeptical',
    options_ru: ['скептический','восторженный','смущённый','решительный'],
    options_en: ['skeptical','enthusiastic','embarrassed','determined'] },
  { emoji: '🥺', hint_ru: 'умоляющий взгляд, слегка прищуренные глаза', hint_en: 'pleading gaze, slightly narrowed eyes',
    correct_ru: 'умоляющий', correct_en: 'pleading',
    options_ru: ['умоляющий','саркастичный','уверенный','скучающий'],
    options_en: ['pleading','sarcastic','confident','bored'] },
  { emoji: '😎', hint_ru: 'спокойный, чуть прищуренный взгляд', hint_en: 'calm, slightly narrowed gaze',
    correct_ru: 'уверенный', correct_en: 'confident',
    options_ru: ['уверенный','испуганный','удивлённый','грустный'],
    options_en: ['confident','frightened','surprised','sad'] },
  { emoji: '😨', hint_ru: 'расширенные зрачки, неподвижный взгляд', hint_en: 'dilated pupils, fixed gaze',
    correct_ru: 'испуганный', correct_en: 'fearful',
    options_ru: ['испуганный','довольный','равнодушный','решительный'],
    options_en: ['fearful','content','indifferent','determined'] },
  { emoji: '😍', hint_ru: 'мягкий взгляд, расслабленные веки', hint_en: 'soft gaze, relaxed lids',
    correct_ru: 'влюблённый', correct_en: 'in love',
    options_ru: ['влюблённый','раздражённый','подозрительный','удивлённый'],
    options_en: ['in love','irritated','suspicious','surprised'] },
  { emoji: '😤', hint_ru: 'нахмуренные брови, напряжённый взгляд', hint_en: 'furrowed brows, tense gaze',
    correct_ru: 'раздражённый', correct_en: 'irritated',
    options_ru: ['раздражённый','забавляющийся','утешающий','озадаченный'],
    options_en: ['irritated','amused','comforting','puzzled'] },
  { emoji: '😬', hint_ru: 'напряжённые губы, прищур', hint_en: 'tense lips, squint',
    correct_ru: 'смущённый', correct_en: 'awkward',
    options_ru: ['смущённый','злорадный','скорбящий','любопытный'],
    options_en: ['awkward','gleeful','grieving','curious'] },
  { emoji: '🙄', hint_ru: 'закатанные глаза', hint_en: 'rolled eyes',
    correct_ru: 'презрительный', correct_en: 'disdainful',
    options_ru: ['презрительный','грустный','удивлённый','утешающий'],
    options_en: ['disdainful','sad','surprised','comforting'] },
  { emoji: '😮‍💨', hint_ru: 'выдох, опущенные веки', hint_en: 'exhaling, lowered lids',
    correct_ru: 'облегчённый', correct_en: 'relieved',
    options_ru: ['облегчённый','рассерженный','подозрительный','испуганный'],
    options_en: ['relieved','furious','suspicious','frightened'] },
  { emoji: '🤨', hint_ru: 'одна бровь высоко поднята', hint_en: 'one brow raised high',
    correct_ru: 'недоверчивый', correct_en: 'incredulous',
    options_ru: ['недоверчивый','довольный','грустный','утешающий'],
    options_en: ['incredulous','content','sad','comforting'] },
  { emoji: '😞', hint_ru: 'опущенные углы губ, взгляд в стол', hint_en: 'downturned lips, gaze at table',
    correct_ru: 'разочарованный', correct_en: 'disappointed',
    options_ru: ['разочарованный','уверенный','забавляющийся','решительный'],
    options_en: ['disappointed','confident','amused','determined'] },
  { emoji: '🥰', hint_ru: 'тёплый взгляд, мягкие черты', hint_en: 'warm gaze, soft features',
    correct_ru: 'нежный', correct_en: 'tender',
    options_ru: ['нежный','скептический','расстроенный','подозрительный'],
    options_en: ['tender','skeptical','upset','suspicious'] },
  { emoji: '😈', hint_ru: 'хитрый прищур, лёгкая улыбка', hint_en: 'sly squint, slight smile',
    correct_ru: 'озорной', correct_en: 'mischievous',
    options_ru: ['озорной','испуганный','грустный','равнодушный'],
    options_en: ['mischievous','frightened','sad','indifferent'] },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function RMETGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trialsCount, setTrialsCount] = useState<9 | 18>(18);
  const [items, setItems] = useState<EyeItem[]>([]);
  const [shuffledOpts, setShuffledOpts] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<{ chosen: string; correct: boolean } | null>(null);
  const [rts, setRts] = useState<number[]>([]);
  const stimAtRef = useRef(0);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (fbTimerRef.current) clearTimeout(fbTimerRef.current); }, []);

  const startGame = () => {
    const picked = shuffle(ITEMS).slice(0, trialsCount);
    setItems(picked);
    setRound(0);
    setHits(0); setErrors(0); setRts([]);
    setFeedback(null);
    setPhase('playing');
    nextTrial(0, picked);
  };

  const nextTrial = (idx: number, list: EyeItem[]) => {
    const it = list[idx];
    const opts = language === 'en' ? it.options_en : it.options_ru;
    setShuffledOpts(shuffle(opts));
    setRound(idx);
    setFeedback(null);
    stimAtRef.current = Date.now();
  };

  const handleAnswer = (chosen: string) => {
    if (feedback !== null) return;
    const it = items[round];
    const correct = chosen === (language === 'en' ? it.correct_en : it.correct_ru);
    const rt = Date.now() - stimAtRef.current;
    setFeedback({ chosen, correct });
    if (correct) {
      setHits(h => h + 1);
      setRts(arr => [...arr, rt]);
    } else setErrors(e => e + 1);
    fbTimerRef.current = setTimeout(() => {
      if (round + 1 >= items.length) finish(correct ? hits + 1 : hits, correct ? errors : errors + 1, correct ? [...rts, rt] : rts);
      else nextTrial(round + 1, items);
    }, 800);
  };

  const finish = async (finalHits: number, finalErrors: number, finalRts: number[]) => {
    const meanRt = finalRts.length > 0 ? finalRts.reduce((a, b) => a + b, 0) / finalRts.length : 0;
    const accuracy = items.length > 0 ? finalHits / items.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'rmet',
        score: finalHits * 50,
        time_seconds: 0,
        difficulty: 'medium',
        mode: `${trialsCount}t`,
        errors: finalErrors,
        details: {
          hits: finalHits,
          errors: finalErrors,
          n_trials: items.length,
          accuracy: Number(accuracy.toFixed(3)),
          mean_rt: Math.round(meanRt),
        },
      });
    } catch (e) { console.error(e); }
  };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="eye" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('rmet')}</Text>
        <Text style={styles.configDesc}>{t('rmetDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {([9, 18] as const).map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trialsCount === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrialsCount(n)}>
              <Text style={[styles.modeButtonText, { color: trialsCount === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        {t('rmetNote')}
      </Text>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPlaying = () => {
    const it = items[round];
    if (!it) return null;
    const correctWord = language === 'en' ? it.correct_en : it.correct_ru;
    const hint = language === 'en' ? it.hint_en : it.hint_ru;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{round + 1}/{items.length}</Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        </View>
        <View style={[styles.eyeBox, { backgroundColor: colors.surface }]}>
          <Text style={styles.eyeEmoji}>{it.emoji}</Text>
          <Text style={[styles.eyeHint, { color: colors.textSecondary }]}>{hint}</Text>
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('rmetHint')}</Text>
        <View style={styles.optsGrid}>
          {shuffledOpts.map((opt) => {
            const isFb = feedback?.chosen === opt;
            const isCorrect = opt === correctWord;
            const bg = isFb
              ? (feedback.correct ? '#22c55e' : '#f43f5e')
              : (feedback && isCorrect ? '#22c55e88' : GRADIENT[0]);
            return (
              <TouchableOpacity key={opt}
                disabled={feedback !== null}
                onPress={() => handleAnswer(opt)}
                style={[styles.optBtn, { backgroundColor: bg }]}>
                <Text style={styles.optText}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('rmet')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="rmet" icon="eye" gradient={GRADIENT as [string, string]}
          skillKey="skillSocial" descriptionKey="rmetIntroDesc"
          benefits={RMET_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={hits * 50}
          time={undefined} errors={errors}
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
  optionButtons: { flexDirection: 'row', gap: 8 },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, minWidth: 60, alignItems: 'center' },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16, lineHeight: 18 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 18, alignItems: 'center', maxWidth: 480, alignSelf: 'center', width: '100%' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  eyeBox: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 12, width: '100%' },
  eyeEmoji: { fontSize: 96 },
  eyeHint: { fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  optsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  optBtn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, minWidth: 130, alignItems: 'center' },
  optText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
