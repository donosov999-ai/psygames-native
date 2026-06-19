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
  ScrollView, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Ellipse, Circle, Path, Rect, G } from 'react-native-svg';
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

// 18 фотореалистичных снимков глаз (Nano Banana 2) по эмоции — RMET-стиль (горизонтальный кроп глаз).
const EYE_IMG: Record<string, any> = {
  'playful': require('../../assets/images/rmet/rmet0.jpg'),
  'worried': require('../../assets/images/rmet/rmet1.jpg'),
  'reflective': require('../../assets/images/rmet/rmet2.jpg'),
  'desolate': require('../../assets/images/rmet/rmet3.jpg'),
  'amazed': require('../../assets/images/rmet/rmet4.jpg'),
  'skeptical': require('../../assets/images/rmet/rmet5.jpg'),
  'pleading': require('../../assets/images/rmet/rmet6.jpg'),
  'confident': require('../../assets/images/rmet/rmet7.jpg'),
  'fearful': require('../../assets/images/rmet/rmet8.jpg'),
  'in love': require('../../assets/images/rmet/rmet9.jpg'),
  'irritated': require('../../assets/images/rmet/rmet10.jpg'),
  'awkward': require('../../assets/images/rmet/rmet11.jpg'),
  'disdainful': require('../../assets/images/rmet/rmet12.jpg'),
  'relieved': require('../../assets/images/rmet/rmet13.jpg'),
  'incredulous': require('../../assets/images/rmet/rmet14.jpg'),
  'disappointed': require('../../assets/images/rmet/rmet15.jpg'),
  'tender': require('../../assets/images/rmet/rmet16.jpg'),
  'mischievous': require('../../assets/images/rmet/rmet17.jpg'),
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Параметры выражения глаз по эмоции (ключ = correct_en). brow: -1 хмурый(внутр.вниз) .. +1 тревожный(внутр.вверх);
// browLift: подъём брови; open: раскрытие; lower: подъём нижнего века (прищур/тепло); gaze: направление взгляда; asym: асимметрия (одна бровь выше).
type EyeP = { brow: number; browLift: number; open: number; lower: number; gazeX: number; gazeY: number; asym?: number };
const EYE_PARAMS: Record<string, EyeP> = {
  playful:      { brow: 0,    browLift: 0.35, open: 0.7,  lower: 0.35, gazeX: 0.35, gazeY: 0,    asym: 0.5 },
  worried:      { brow: 0.85, browLift: 0.25, open: 0.7,  lower: 0,    gazeX: 0,    gazeY: 0 },
  reflective:   { brow: 0.15, browLift: 0.15, open: 0.6,  lower: 0.2,  gazeX: 0.7,  gazeY: -0.35 },
  desolate:     { brow: 0.7,  browLift: 0,    open: 0.45, lower: 0.1,  gazeX: 0,    gazeY: 0.4 },
  amazed:       { brow: 0.25, browLift: 1,    open: 1,    lower: 0,    gazeX: 0,    gazeY: 0 },
  skeptical:    { brow: -0.15,browLift: 0.2,  open: 0.5,  lower: 0.35, gazeX: 0,    gazeY: 0,    asym: 0.9 },
  pleading:     { brow: 0.9,  browLift: 0.35, open: 0.9,  lower: 0,    gazeX: 0,    gazeY: -0.25 },
  confident:    { brow: -0.1, browLift: 0.05, open: 0.65, lower: 0.2,  gazeX: 0,    gazeY: 0 },
  fearful:      { brow: 0.5,  browLift: 0.95, open: 1,    lower: 0,    gazeX: 0,    gazeY: 0 },
  'in love':    { brow: 0.15, browLift: 0.05, open: 0.6,  lower: 0.45, gazeX: 0,    gazeY: 0.05 },
  irritated:    { brow: -0.85,browLift: 0,    open: 0.55, lower: 0.2,  gazeX: 0,    gazeY: 0 },
  awkward:      { brow: 0.2,  browLift: 0.2,  open: 0.5,  lower: 0.3,  gazeX: -0.45,gazeY: 0.2,  asym: 0.5 },
  disdainful:   { brow: -0.1, browLift: 0.35, open: 0.4,  lower: 0.1,  gazeX: 0,    gazeY: -0.6 },
  relieved:     { brow: 0.1,  browLift: 0,    open: 0.4,  lower: 0.35, gazeX: 0,    gazeY: 0.1 },
  incredulous:  { brow: -0.2, browLift: 0.35, open: 0.6,  lower: 0.2,  gazeX: 0,    gazeY: 0,    asym: 1 },
  disappointed: { brow: 0.4,  browLift: 0,    open: 0.45, lower: 0.1,  gazeX: 0,    gazeY: 0.5 },
  tender:       { brow: 0.2,  browLift: 0.1,  open: 0.55, lower: 0.5,  gazeX: 0,    gazeY: 0 },
  mischievous:  { brow: -0.1, browLift: 0.25, open: 0.5,  lower: 0.4,  gazeX: 0.4,  gazeY: 0,    asym: 0.5 },
};

function Eyes({ emotion }: { emotion: string }) {
  const p = EYE_PARAMS[emotion] || { brow: 0, browLift: 0.2, open: 0.7, lower: 0.2, gazeX: 0, gazeY: 0 };
  const skin = '#f0c9a4', white = '#fdfdfd', iris = '#6b4423', dark = '#262626';
  const eye = (cx: number, inner: 1 | -1) => {
    const cy = 80;
    const gx = cx + p.gazeX * 12, gy = cy + p.gazeY * 9;
    const upY = cy - 26 * p.open;                       // верхнее веко (выше = шире глаз)
    const loY = cy + 24 - 24 * (p.lower * 0.75);        // нижнее веко (выше = прищур)
    const browBase = cy - 36;
    const lift = p.browLift * 15;
    const asym = inner === -1 ? (p.asym || 0) * 13 : 0; // правый глаз чуть выше при асимметрии
    const innerX = cx + inner * 30, outerX = cx - inner * 30;
    const innerY = browBase - lift - p.brow * 13 - asym;
    const outerY = browBase - lift + p.brow * 3 - asym;
    const cpY = Math.min(innerY, outerY) - 6;
    return (
      <G key={cx}>
        <Ellipse cx={cx} cy={cy} rx={33} ry={25} fill={white} />
        <Circle cx={gx} cy={gy} r={14} fill={iris} />
        <Circle cx={gx} cy={gy} r={6.5} fill={dark} />
        <Circle cx={gx - 3} cy={gy - 3} r={2.4} fill="#ffffff" />
        {/* верхнее веко (кожа) — прикрывает сверху до upY, край-дуга */}
        <Path d={`M ${cx - 42} ${cy - 34} L ${cx + 42} ${cy - 34} L ${cx + 42} ${upY} Q ${cx} ${upY - 11} ${cx - 42} ${upY} Z`} fill={skin} />
        {/* нижнее веко */}
        <Path d={`M ${cx - 42} ${cy + 34} L ${cx + 42} ${cy + 34} L ${cx + 42} ${loY} Q ${cx} ${loY + 11} ${cx - 42} ${loY} Z`} fill={skin} />
        {/* линия верхнего века */}
        <Path d={`M ${cx - 31} ${cy - 3} Q ${cx} ${upY + 13} ${cx + 31} ${cy - 3}`} stroke="#9a6b45" strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {/* бровь */}
        <Path d={`M ${innerX} ${innerY} Q ${cx} ${cpY} ${outerX} ${outerY}`} stroke="#5a3b22" strokeWidth={8} fill="none" strokeLinecap="round" />
      </G>
    );
  };
  return (
    <Svg width={244} height={150} viewBox="0 0 244 150">
      <Rect x={2} y={24} width={240} height={112} rx={22} fill={skin} />
      {eye(74, 1)}
      {eye(170, -1)}
      <Path d="M 122 62 Q 117 95 122 116" stroke="#dca97c" strokeWidth={3} fill="none" strokeLinecap="round" />
    </Svg>
  );
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
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{round + 1}/{items.length}</Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        </View>
        <View style={[styles.eyeBox, { backgroundColor: colors.surface }]}>
          <Image source={EYE_IMG[it.correct_en]} style={styles.eyeImg} resizeMode="cover" />
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
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('rmet')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="rmet" icon="eye" gradient={GRADIENT as [string, string]}
          skillKey="skillSocial" descriptionKey="rmetIntroDesc"
          benefits={RMET_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={hits * 50}
          time={undefined} errors={errors}
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
  eyeImg: { width: '100%', aspectRatio: 1.5, borderRadius: 14, backgroundColor: '#000' },
  eyeEmoji: { fontSize: 96 },
  eyeHint: { fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  optsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  optBtn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, minWidth: 130, alignItems: 'center' },
  optText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
