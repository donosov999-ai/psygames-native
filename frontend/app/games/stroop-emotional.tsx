import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';

const GRADIENT = ['#8E2DE2', '#4A00E0'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 5.80 (норма AA 4.5), стало 4.54.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const STROOP2_BENEFITS = [
  { icon: 'heart-dislike-outline', textKey: 'benefitStroop2_1' },
  { icon: 'eye-outline',           textKey: 'benefitStroop2_2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitStroop2_3' },
];

// Emotional Stroop (Williams, Mathews, MacLeod 1996):
// Subject names INK COLOR of words. Words have valence: threat / positive / neutral.
// Threat words slow color naming → emotional interference.

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Valence = 'threat' | 'positive' | 'neutral';

// Синергия (пилот): каждые BOSS_EVERY уровней при чистом прохождении → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

const COLORS_RGB = ['red', 'green', 'blue', 'yellow'];
const COLOR_HEX: Record<string, string> = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#eab308' };
// Режим для дальтоников: палитра Okabe-Ito (та же, что в WCST). В этой игре цвет
// и есть ответ — при неразличимых красном и зелёном она просто непроходима
// («переключатель Colorblind ни на что не влияет» — репорт Rulon, v1.171).
const COLOR_HEX_CB: Record<string, string> = { red: '#d55e00', green: '#009e73', blue: '#0072b2', yellow: '#f0e442' };

interface WordSet { ru: string[]; en: string[]; }
const WORDS: Record<Valence, WordSet> = {
  threat: {
    ru: ['смерть','боль','опасность','страх','удар','война','рана','кровь','авария','угроза','ужас','паника'],
    en: ['death','pain','danger','fear','attack','war','wound','blood','crash','threat','horror','panic'],
  },
  positive: {
    ru: ['радость','любовь','счастье','смех','подарок','успех','солнце','музыка','семья','дружба','улыбка','победа'],
    en: ['joy','love','happy','laugh','gift','success','sun','music','family','friend','smile','victory'],
  },
  neutral: {
    ru: ['стол','окно','книга','стена','доска','чашка','стул','лампа','полка','дверь','коробка','зонт'],
    en: ['table','window','book','wall','board','cup','chair','lamp','shelf','door','box','umbrella'],
  },
};

interface Trial { word: string; valence: Valence; color: string; }

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Сложность растёт ТРУДНОСТЬЮ, не временем (по образцу cpt):
//   - окно ответа сокращается 3500→1400мс (не успел выбрать цвет = ошибка)
//   - доля эмоционально заряженных слов (threat/positive) растёт 40%→85% — интерференции больше
//   - межстимульная пауза сокращается (темп растёт)
const TRIALS_PER_ROUND = 18;
function levelParams(level: number): { trials: number; answerWindowMs: number; emotionalRatio: number; isiBaseMs: number; isiJitterMs: number } {
  return {
    trials: TRIALS_PER_ROUND,
    answerWindowMs: Math.max(1400, 3500 - (level - 1) * 150),
    emotionalRatio: Math.min(0.85, 0.40 + (level - 1) * 0.032),
    isiBaseMs: Math.max(250, 500 - (level - 1) * 18),
    isiJitterMs: Math.max(200, 400 - (level - 1) * 15),
  };
}

function makeTrial(lang: 'ru' | 'en', emotionalRatio: number): Trial {
  // Доля эмоционально заряженных слов растёт с уровнем; нейтральные остаются базой интерференции.
  // Внутри эмоциональной доли перевес к threat (главный источник конфликта в Emotional Stroop).
  const valence: Valence = Math.random() < emotionalRatio
    ? (Math.random() < 0.6 ? 'threat' : 'positive')
    : 'neutral';
  const word = rndItem(WORDS[valence][lang]);
  const color = rndItem(COLORS_RGB);
  return { word, valence, color };
}

export default function StroopEmotionalGame() {
  const { colors, colorblind } = useTheme();
  const HEX = colorblind ? COLOR_HEX_CB : COLOR_HEX;
  const { t, language } = useLanguage() as any;
  const router = useRouter();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('stroop_emotional');
  useEffect(() => { if (autostart) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [clearedPassed, setClearedPassed] = useState(true);

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ word: '', valence: 'neutral', color: 'red' });
  const [showStim, setShowStim] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByValence, setRtsByValence] = useState<Record<Valence, number[]>>({ threat: [], positive: [], neutral: [] });

  // refs — счётчики и параметры уровня живут вне ре-рендера (таймеры/дедлайн, паттерн cpt)
  const levelRef = useRef(1);
  const trialsRef = useRef(TRIALS_PER_ROUND);
  const windowRef = useRef(3500);
  const emoRatioRef = useRef(0.4);
  const isiBaseRef = useRef(500);
  const isiJitterRef = useRef(400);
  const roundRef = useRef(1);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<Record<Valence, number[]>>({ threat: [], positive: [], neutral: [] });
  const answeredRef = useRef(false);
  const startTimeRef = useRef(0);

  const stimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    [stimTimer, fbTimer, deadlineTimer].forEach(r => { if (r.current) clearTimeout(r.current); });
  }, []);

  const advance = () => {
    if (roundRef.current >= trialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    newTrial();
  };

  // Просрочка окна ответа уровня = ошибка (RT-давление — ось усложнения)
  const handleTimeout = () => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    errorsRef.current += 1;
    setErrors(errorsRef.current);
    setFeedback('wrong');
    fbTimer.current = setTimeout(advance, 350);
  };

  const newTrial = () => {
    setShowStim(false); setFeedback(null);
    answeredRef.current = false;
    const tr = makeTrial(language, emoRatioRef.current);
    setTrial(tr);
    stimTimer.current = setTimeout(() => {
      setStimAt(gameNow());
      setShowStim(true);
      deadlineTimer.current = setTimeout(handleTimeout, windowRef.current);
    }, isiBaseRef.current + Math.random() * isiJitterRef.current);
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    trialsRef.current = isPreset ? num('trials', p.trials) : p.trials;
    windowRef.current = p.answerWindowMs;
    emoRatioRef.current = p.emotionalRatio;
    isiBaseRef.current = p.isiBaseMs;
    isiJitterRef.current = p.isiJitterMs;
    hitsRef.current = 0; errorsRef.current = 0;
    rtsRef.current = { threat: [], positive: [], neutral: [] };
    roundRef.current = 1;
    setHits(0); setErrors(0); setRtsByValence({ threat: [], positive: [], neutral: [] });
    setRound(1);
    setPhase('playing');
    startTimeRef.current = gameNow();
    newTrial();
  };

  const finish = async () => {
    if (deadlineTimer.current) clearTimeout(deadlineTimer.current);
    const totalTime = (gameNow() - startTimeRef.current) / 1000;
    const allRts = rtsRef.current;
    const meanV = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const tMean = meanV(allRts.threat), pMean = meanV(allRts.positive), nMean = meanV(allRts.neutral);
    const interferenceThreat = Math.round(tMean - nMean);
    const interferencePositive = Math.round(pMean - nMean);
    const flatten = [...allRts.threat, ...allRts.positive, ...allRts.neutral];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;

    // Проход уровня: назвать цвет верно (и успеть в окно) в ≥80% проб
    const total = trialsRef.current;
    const accuracy = total > 0 ? hitsRef.current / total : 0;
    const passed = !isPreset && accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — экран статистики, уровень не трогаем
    } else {
      // непрерывный поток: провал больше не тупик — тот же баннер с passed={false} и авто-рестартом уровня
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      // Веха: каждые BOSS_EVERY уровней при чистом прохождении — босс-раунд, затем баннер cleared.
      // Провал по-прежнему → сразу cleared (passed=false). Уровень уже засчитан reach выше.
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        setPhase('boss');
      } else {
        setPhase('cleared');
      }
    }

    try {
      await saveSession({
        passed,
        game_type: 'stroop_emotional',
        score: Math.max(0, Math.round(hitsRef.current * 80 - errorsRef.current * 60 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: errorsRef.current,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          interference_threat_ms: interferenceThreat,
          interference_positive_ms: interferencePositive,
          accuracy: Math.round(accuracy * 100),
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (color: string) => {
    if (!showStim || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimer.current) clearTimeout(deadlineTimer.current);
    const rt = gameNow() - stimAt;
    const ok = color === trial.color;
    if (ok) {
      hapticSuccess();
      hitsRef.current += 1;
      rtsRef.current = { ...rtsRef.current, [trial.valence]: [...rtsRef.current[trial.valence], rt] };
      setHits(hitsRef.current);
      setRtsByValence(rtsRef.current);
    } else {
      hapticError();
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    setFeedback(ok ? 'right' : 'wrong');
    fbTimer.current = setTimeout(advance, 350);
  };

  const meanV = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const interfThreat = meanV(rtsByValence.threat) && meanV(rtsByValence.neutral)
    ? meanV(rtsByValence.threat) - meanV(rtsByValence.neutral) : 0;
  const meanRtAll = (() => {
    const all = [...rtsByValence.threat, ...rtsByValence.positive, ...rtsByValence.neutral];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="heart-dislike" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('stroopEmotional')}</Text>
          <Text style={styles.configDesc}>{t('stroopEmotionalDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="stroopEmotionalIntroDesc" benefits={STROOP2_BENEFITS} accent={GRADIENT[0]} />
        <LevelProgressMap gameId="stroop_emotional" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('stroopEmoLvlParams').replace('{n}', String(p.trials)).replace('{w}', (p.answerWindowMs / 1000).toFixed(1)).replace('{p}', String(Math.round(p.emotionalRatio * 100)))}
          </Text>
          {/* критерий прохождения уровня виден игроку (паттерн cpt) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {t('stroopEmoPass')}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // playing-фаза — на едином каркасе GameShell (цветные кнопки прибиты к низу)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('stroopEmotional')}
        onBack={() => goBackOrHome()}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>{t('round')} {round}/{trialsRef.current}</Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>{t('hud_correct')} {hits}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>{t('hud_errors')} {errors}</Text>
            <Text style={[styles.statText, { color: colors.text }]}>{t('reaction')} {meanRtAll}{t('msShort')}</Text>
            <Text style={[styles.statText, { color: '#ef4444' }]}>{t('hud_interference')} {interfThreat}{t('msShort')}</Text>
          </View>
        }
        toolbar={
          <View style={styles.choiceGrid}>
            {COLORS_RGB.map((c) => (
              <TouchableOpacity
                accessibilityRole="button" key={c} style={[styles.colorBtn, { backgroundColor: HEX[c] }]} onPress={() => handleAnswer(c)}>
                <Text style={styles.colorBtnText}>{t('color_'+c)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('stroop2Hint')}</Text>
          <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
            {showStim ? (
              <Text style={{ color: HEX[trial.color], fontSize: 44, fontWeight: '900', letterSpacing: 2 }}>
                {trial.word}
              </Text>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 36 }}>+</Text>
            )}
          </View>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('stroopEmotional')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="stroop_emotional" level={levelRef.current}
          passed={clearedPassed}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 80 - errors * 60 - meanRtAll * 0.05))}
          time={meanRtAll / 1000} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 16 },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  stimBox: { width: 320, height: 130, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  choiceGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 360 },
  colorBtn: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, minWidth: 80, alignItems: 'center' , justifyContent: 'center'},
  colorBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
