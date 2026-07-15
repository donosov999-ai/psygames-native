/**
 * SDMT — Symbol Digit Modalities Test (processing speed).
 *
 * Парадигма: легенда символ→цифра, в центре показан символ — жми его цифру на паде.
 * Фиксированная длительность раунда; метрика = сколько верных успел.
 *
 * Уровни (persist, по паттерну cpt/simon): ручной селектор длительности заменён на
 * usePersistentLevel('sdmt') + levelParams. Ось усложнения (длительность фикс,
 * сложность растёт трудностью):
 *   - набор символов растёт 5 → 9 (легенду сканировать дольше)
 *   - раунд сокращается 60с → 45с (интенсивнее, сессии короче)
 *   - порог производительности растёт ~14 → ~36 верных/мин
 * Проход уровня: набрал целевое число верных за раунд И точность ≥80%
 * (точность отсекает спам по кнопкам — ошибка тоже листает символ).
 *
 * Fix: счётчики hits/errors в refs — finish() живёт в замыкании setInterval,
 * state там был устаревшим (saveSession получал нули).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndTimerTick, sndTimerEnd } from '@/src/services/feedback';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';

const GRADIENT = ['#0f2027', '#2c5364'];
const SDMT_BENEFITS = [
  { icon: 'flash-outline',   textKey: 'benefitSdmt1' },
  { icon: 'eye-outline',     textKey: 'benefitSdmt2' },
  { icon: 'extension-puzzle-outline', textKey: 'benefitSdmt3' },
];

// 9 unique symbols (rendered as Ionicons), each mapped to digit 1..9. Mapping is shuffled per game.
const SYMBOLS = [
  'star', 'heart', 'leaf', 'flash', 'cloud', 'flower', 'snow', 'water', 'flame',
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия: каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

interface KeyMap { sym: string; digit: number; }

// Уровень 1..15: символов больше (5→9), раунд короче (60→45с), требуемый темп
// растёт ~14 → ~36 верных/мин. Цель раунда = темп × длительность.
function levelParams(level: number): { durationSec: number; symbolCount: number; targetHits: number } {
  const durationSec = level <= 5 ? 60 : level <= 10 ? 50 : 45;
  const symbolCount = Math.min(9, 5 + Math.floor((level - 1) / 3));   // 5,5,5,6,6,6,7,7,7,8,8,8,9,9,9
  const ratePerMin = 14 + (level - 1) * 1.6;                          // 14 → 36.4 верных/мин
  const targetHits = Math.max(1, Math.round((ratePerMin * durationSec) / 60));
  return { durationSec, symbolCount, targetHits };
}

export default function SdmtGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  // v1.29.3 (мобайл): таблица символ→цифра и поле НЕ растягивались (maxWidth 460/240 +
  // фикс stimBox 140). Теперь всё от ширины экрана: легенда во всю ширину (9 ячеек в ряд),
  // пад-кнопки и стимул крупнее.
  const { width } = useWindowDimensions();
  const sdmtW = Math.min(width - 24, 460);
  const sdmtPad = Math.min((sdmtW - 2 * 8) / 3, 96); // 3 кнопки в ряд
  const sdmtStim = Math.min(sdmtW * 0.42, 180);
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('sdmt');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [duration] = useState(() => num('duration', 60)); // seconds — только для пресета зарядки

  const [keymap, setKeymap] = useState<KeyMap[]>([]);
  const [stim, setStim] = useState<string>('star');
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [targetHits, setTargetHits] = useState(0);   // 0 = без цели (пресет)
  const [remaining, setRemaining] = useState(60);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата уровня для баннера LevelCleared

  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Счётчики/параметры раунда в refs: finish() вызывается из замыкания setInterval,
  // state там устаревший (паттерн cpt/simon).
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const levelRef = useRef(1);
  const durationRef = useRef(60);
  const targetHitsRef = useRef(0);
  const symbolCountRef = useRef(9);

  const clearAllTimers = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  };

  useEffect(() => () => clearAllTimers(), []);

  const buildKeymap = (count: number) => {
    const syms = shuffle(SYMBOLS).slice(0, count);
    const digits = shuffle([1,2,3,4,5,6,7,8,9]).slice(0, count);
    return syms.map((sym, i) => ({ sym, digit: digits[i] }));
  };

  const newStim = (km: KeyMap[]) => {
    setStim(km[Math.floor(Math.random() * km.length)].sym);
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    const dur = isPreset ? duration : p.durationSec;   // пресет зарядки задаёт длительность сам, классические 9 символов
    const symCount = isPreset ? 9 : p.symbolCount;
    levelRef.current = lvl.level;
    durationRef.current = dur;
    targetHitsRef.current = isPreset ? 0 : p.targetHits;
    symbolCountRef.current = symCount;
    const km = buildKeymap(symCount);
    setKeymap(km);
    hitsRef.current = 0; errorsRef.current = 0;
    setHits(0); setErrors(0);
    setTargetHits(targetHitsRef.current);
    setRemaining(dur);
    setFeedback(null);
    newStim(km);
    setPhase('playing');
    startTimeRef.current = Date.now();
    let lastSec = dur;
    intervalRef.current = setInterval(() => {
      const left = dur - Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRemaining(Math.max(0, left));
      if (left !== lastSec) { lastSec = left; if (left > 0 && left <= 5) sndTimerTick(); }   // SND-T: тик последних 5с
      if (left <= 0) finish();
    }, 200);
  };

  const finish = async () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    sndTimerEnd();   // SND-T: «время вышло»
    setRemaining(0);
    const h = hitsRef.current, e = errorsRef.current;
    const total = h + e;
    const accuracy = total > 0 ? h / total : 0;
    // Проход уровня: набрал цель верных И точность ≥80% (спам по паду не проходит)
    const passed = !isPreset && h >= targetHitsRef.current && accuracy >= 0.8;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    // Непрерывный поток: любой уровневый раунд (прошёл/не прошёл) → баннер LevelCleared с
    // авто-рестартом; тупик-result остаётся только для пресета зарядки (экран статистики).
    if (isPreset) {
      setPhase('result');
    } else if (passed && levelRef.current % BOSS_EVERY === 0) {
      // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
      setClearedPassed(true);
      setPhase('boss');
    } else {
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        game_type: 'sdmt',
        score: Math.max(0, h * 100 - e * 50),
        time_seconds: durationRef.current,
        difficulty: isPreset ? 'medium' : levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: isPreset ? `${durationRef.current}s` : `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          rate_per_min: Math.round((h / durationRef.current) * 60),
          accuracy: Math.round(accuracy * 100),
          hits: h,
          target_hits: targetHitsRef.current,
          n_symbols: symbolCountRef.current,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (digit: number) => {
    if (phase !== 'playing' || feedback !== null) return;
    const entry = keymap.find(k => k.sym === stim);
    if (!entry) return;
    const ok = digit === entry.digit;
    if (ok) { hitsRef.current += 1; setHits(hitsRef.current); hapticSuccess(); }
    else { errorsRef.current += 1; setErrors(errorsRef.current); hapticError(); }
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(() => {
      setFeedback(null);
      newStim(keymap);
    }, 200);
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const ru = language === 'ru';
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="apps" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('sdmt')}</Text>
          <Text style={styles.configDesc}>{t('sdmtDesc')}</Text>
        </LinearGradient>
        <LevelProgressMap gameId="sdmt" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {ru ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {ru
              ? `${p.symbolCount} символов · раунд ${p.durationSec} с · цель ${p.targetHits} верных`
              : `${p.symbolCount} symbols · ${p.durationSec} s round · goal ${p.targetHits} correct`}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {ru
              ? `Проход уровня: ≥${p.targetHits} верных за раунд и точность ≥80%`
              : `To pass: ≥${p.targetHits} correct in the round with ≥80% accuracy`}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>{remaining}s</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>
          ✓{hits}{targetHits > 0 ? `/${targetHits}` : ''}
        </Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <View style={[styles.legend, { backgroundColor: colors.surface, width: sdmtW }]}>
        {keymap.map((k, i) => (
          <View key={i} style={[styles.legendCell, { borderColor: colors.border, flex: 1 }]}>
            <Ionicons name={k.sym as any} size={Math.min(sdmtW / 18, 22)} color={GRADIENT[1]} />
            <Text style={[styles.legendDigit, { color: colors.text }]}>{k.digit}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.stimBox, {
        width: sdmtStim, height: sdmtStim,
        backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
        borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border,
      }]}>
        <Ionicons name={stim as any} size={sdmtStim * 0.6} color={GRADIENT[1]} />
      </View>
      <View style={[styles.padGrid, { width: sdmtPad * 3 + 16 }]}>
        {[1,2,3,4,5,6,7,8,9].map((d) => (
          <TouchableOpacity key={d}
            style={[styles.padBtn, { width: sdmtPad, height: sdmtPad, backgroundColor: GRADIENT[0] }]}
            onPress={() => handleAnswer(d)}>
            <Text style={[styles.padText, { fontSize: sdmtPad * 0.38 }]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('sdmt')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="sdmt" icon="apps" gradient={GRADIENT as [string, string]}
          skillKey="skillProcessingSpeed" descriptionKey="sdmtIntroDesc"
          benefits={SDMT_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="sdmt" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 50)}
          time={durationRef.current} errors={errors}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 16, fontWeight: '800' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 3, padding: 8, borderRadius: 10 },
  legendCell: { alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingVertical: 4, gap: 2 },
  legendDigit: { fontSize: 15, fontWeight: '800' },
  stimBox: { borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  padGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  padBtn: { borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  padText: { color: '#FFF', fontSize: 24, fontWeight: '900' },
});
