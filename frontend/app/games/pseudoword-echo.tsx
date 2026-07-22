/**
 * Эхо: псевдослова на слух (Полиглот, фонологическая петля).
 * TTS произносит псевдослово целевого языка → на экране 4 варианта написания
 * (правильное + 3 дистрактора: замена гласной/согласной того же класса или
 * перестановка соседних букв). Игрок выбирает то, что услышал.
 * Фонологическая петля — сильнейшая доказанная связь с объёмом словаря.
 * Псевдослова — src/services/pseudowords.ts (алфавитные языки: en/es/pt/de/ru).
 * zh/hi исключены честно: дистракторы «на слух» для иероглифов/деванагари
 * не дают орфографически близких вариантов той же фонологии.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { speak, ttsAvailable, ttsCancel } from '@/src/services/tts';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import { generatePseudowords } from '@/src/services/pseudowords';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#8E2DE2', '#4A00E0'];
const GAME_ID = 'pseudoword_echo';
const TL_KEY = `psygames_${GAME_ID}_targetlang`;

type GamePhase = 'config' | 'playing' | 'cleared' | 'result';

interface Round { word: string; options: string[] }

// Только алфавитные языки генератора: дистракторы гласная↔гласная /
// согласная↔согласная / перестановка соседних букв работают честно.
const TARGET_LANGS = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ru', name: 'Русский' },
];

// Классы букв — как в генераторе псевдослов (замена внутри класса → читается похоже).
const VOWELS: Record<string, string> = {
  en: 'aeiou',
  es: 'aeiouáéíóú',
  pt: 'aeiouáâãéêíóôõú',
  de: 'aeiouäöü',
  ru: 'аеёиоуыэюя',
};
const CONSONANTS: Record<string, string> = {
  en: 'bcdfghklmnprstvz',
  es: 'bcdfghlmnprstvz',
  pt: 'bcdfglmnprstvz',
  de: 'bdfghklmnprstwz',
  ru: 'бвгдклмнпрстфхш',
};

// Лесенка: длина псевдослова L1-4: 4-5 букв → L5-8: 6-7 → L9+: 8-9; раундов 8→10→12.
function levelParams(level: number): { lenMin: number; lenMax: number; trials: number } {
  if (level <= 4) return { lenMin: 4, lenMax: 5, trials: 8 };
  if (level <= 8) return { lenMin: 6, lenMax: 7, trials: 10 };
  return { lenMin: 8, lenMax: 9, trials: 12 };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Один дистрактор: замена гласной→гласная / согласной→согласная / перестановка соседних. */
function mutateOnce(word: string, lang: string): string {
  const vowels = VOWELS[lang] || VOWELS.en;
  const consonants = CONSONANTS[lang] || CONSONANTS.en;
  const strategy = Math.floor(Math.random() * 3);
  const chars = word.split('');

  if (strategy === 2) {
    // перестановка соседних различающихся букв
    const spots: number[] = [];
    for (let i = 0; i < chars.length - 1; i++) if (chars[i] !== chars[i + 1]) spots.push(i);
    if (spots.length > 0) {
      const i = spots[Math.floor(Math.random() * spots.length)];
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      return chars.join('');
    }
  }

  // замена одной буквы внутри её класса
  const preferVowel = strategy === 0;
  const trySets = preferVowel ? [vowels, consonants] : [consonants, vowels];
  for (const setStr of trySets) {
    const idxs = chars.map((c, i) => ({ c, i })).filter(({ c }) => setStr.includes(c)).map(({ i }) => i);
    if (idxs.length === 0) continue;
    const pick = idxs[Math.floor(Math.random() * idxs.length)];
    let repl = chars[pick];
    for (let tries = 0; tries < 12 && repl === chars[pick]; tries++) {
      repl = setStr[Math.floor(Math.random() * setStr.length)];
    }
    if (repl === chars[pick]) continue;
    chars[pick] = repl;
    return chars.join('');
  }
  return word;
}

/** Правильное написание + 3 уникальных дистрактора, перемешаны. */
function makeOptions(word: string, lang: string): string[] {
  const out = new Set<string>();
  let guard = 0;
  while (out.size < 3 && guard < 80) {
    guard += 1;
    const d = mutateOnce(word, lang);
    if (d && d !== word && !out.has(d)) out.add(d);
  }
  // страховка: удвоение случайной буквы — всегда даёт новый вариант
  while (out.size < 3) {
    const i = Math.floor(Math.random() * word.length);
    const d = word.slice(0, i + 1) + word[i] + word.slice(i + 1);
    if (d !== word) out.add(d);
  }
  return shuffle([word, ...Array.from(out).slice(0, 3)]);
}

/** count раундов: псевдослова нужной длины + варианты написания. */
function buildRounds(lang: string, count: number, lenMin: number, lenMax: number): Round[] {
  const raw = Array.from(new Set(generatePseudowords(lang, count * 25).map((w) => w.toLowerCase())))
    .filter((w) => !w.includes(' ') && !w.includes('-'));
  let pool = raw.filter((w) => w.length >= lenMin && w.length <= lenMax);
  if (pool.length < count) {
    const wider = raw.filter((w) => w.length >= lenMin - 1 && w.length <= lenMax + 1 && !pool.includes(w));
    pool = pool.concat(wider);
  }
  if (pool.length < count) {
    pool = pool.concat(raw.filter((w) => !pool.includes(w)));
  }
  return shuffle(pool).slice(0, count).map((word) => ({ word, options: makeOptions(word, lang) }));
}

export default function PseudowordEchoGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel(GAME_ID);
  const ru = language === 'ru';

  const { isPreset, str } = useGamePreset();
  const [phase, setPhase] = useState<GamePhase>('config');
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const [rounds, setRounds] = useState<Round[]>([]);
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState<string | null>(null);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const levelRef = useRef(1);
  const tgtRef = useRef('en');
  const lenRangeRef = useRef('4-5');
  const startTimeRef = useRef(0);
  const advTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // валидный целевой язык: не совпадает с языком интерфейса
  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;
  const voiceOk = ttsAvailable(tgt);

  // сохранённый выбор языка тренировки (пресет из зарядки имеет приоритет)
  useEffect(() => {
    if (isPreset) return;
    AsyncStorage.getItem(TL_KEY).then((v) => {
      if (v && TARGET_LANGS.some((l) => l.code === v)) setTargetLang(v);
    }).catch(() => {});
  }, [isPreset]);

  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет зарядки → авто-старт

  useEffect(() => () => {
    if (advTimerRef.current) clearTimeout(advTimerRef.current);
    ttsCancel();
  }, []);

  // озвучка текущего псевдослова при показе раунда (эффект, не setState-updater)
  useEffect(() => {
    if (phase !== 'playing') return;
    const round = rounds[idx];
    if (round) speak(round.word, tgtRef.current, 0.85);
  }, [phase, idx, rounds]);

  const pickLang = (code: string) => {
    setTargetLang(code);
    AsyncStorage.setItem(TL_KEY, code).catch(() => {});
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    tgtRef.current = tgt;
    lenRangeRef.current = `${p.lenMin}-${p.lenMax}`;
    hitsRef.current = 0;
    errorsRef.current = 0;
    setHits(0);
    setErrors(0);
    setAnswered(null);
    setIdx(0);
    setRounds(buildRounds(tgt, p.trials, p.lenMin, p.lenMax));
    startTimeRef.current = Date.now();
    setPhase('playing');
  };

  const finish = async (total: number) => {
    ttsCancel();
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current;
    const e = errorsRef.current;
    const passed = e <= 1;
    if (passed && !isPreset) lvl.reach(levelRef.current + 1);
    if (isPreset) {
      setPhase(passed ? 'cleared' : 'result');
    } else {
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        game_type: GAME_ID,
        score: Math.max(0, h * 120 - e * 40),
        time_seconds: finalTime,
        difficulty: `${tgtRef.current} · L${levelRef.current}`,
        mode: tgtRef.current,
        errors: e,
        details: {
          hits: h,
          errors: e,
          trials: total,
          target_lang: tgtRef.current,
          word_len: lenRangeRef.current,
        },
      });
    } catch (err) {
      console.error('Error saving session:', err);
    }
  };

  const handlePick = (opt: string) => {
    if (answered !== null) return;
    const round = rounds[idx];
    if (!round) return;
    const ok = opt === round.word;
    setAnswered(opt);
    if (ok) {
      hitsRef.current += 1;
      setHits(hitsRef.current);
      sndCorrect();
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      sndWrong();
    }
    advTimerRef.current = setTimeout(() => {
      const next = idx + 1;
      if (next >= rounds.length) {
        finish(rounds.length);
      } else {
        setAnswered(null);
        setIdx(next);
      }
    }, ok ? 600 : 1300);
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="headset" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{ru ? 'Эхо: псевдослова' : 'Pseudoword Echo'}</Text>
        <Text style={styles.configDesc}>
          {ru
            ? 'Слушай выдуманное слово и выбери, как оно пишется. Тренирует фонологическую петлю — ключ к росту словаря.'
            : 'Listen to a made-up word and pick its correct spelling. Trains the phonological loop — the key to vocabulary growth.'}
        </Text>
      </LinearGradient>

      <LevelProgressMap gameId={GAME_ID} currentLevel={lvl.level} colors={colors} language={language} />

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {ru ? 'Язык тренировки' : 'Training language'}
        </Text>
        <View style={styles.optionButtons}>
          {TARGET_LANGS.filter((l) => l.code !== language).map((l) => (
            <TouchableOpacity
              key={l.code}
              style={[
                styles.langButton,
                tgt === l.code
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => pickLang(l.code)}
            >
              <Text style={[styles.langButtonText, { color: tgt === l.code ? '#FFF' : colors.text }]}>{l.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.noteText, { color: colors.textSecondary }]}>
          {ru ? '中文 и हिन्दी пока не поддерживаются: для них нельзя честно собрать похожие варианты написания на слух.'
              : '中文 and हिन्दी are not supported yet: sound-alike spelling options can’t be built fairly for those scripts.'}
        </Text>
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.levelHint, { color: colors.textSecondary }]}>
          {ru
            ? `Ур. ${lvl.level} — растёт сам (длиннее слова → больше раундов)`
            : `Lv ${lvl.level} — grows with results (longer words → more rounds)`}
        </Text>
      </View>

      {!voiceOk && (
        <View style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: '#f59e0b' }]}>
          <Ionicons name="warning" size={22} color="#f59e0b" />
          <Text style={[styles.warnText, { color: colors.text }]}>
            {ru
              ? 'Голос для этого языка не найден на устройстве — озвучка недоступна. Выбери другой язык.'
              : 'No voice for this language found on this device — audio is unavailable. Pick another language.'}
          </Text>
        </View>
      )}

      <TouchableOpacity style={[styles.startBtn, !voiceOk && { opacity: 0.4 }]} onPress={startGame} disabled={!voiceOk}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Ionicons name="play" size={22} color="#FFF" />
          <Text style={styles.startBtnText}>{ru ? 'Начать' : 'Start'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  // игровая фаза — на едином каркасе GameShell: счётчики в статс-строке; динамик-стимул
  // и варианты написания — в центрируемом поле (нижних кнопок у игры нет)
  const playingRound = phase === 'playing' ? rounds[idx] : undefined;
  if (phase === 'playing' && playingRound) {
    const round = playingRound;
    return (
      <GameShell
        title={ru ? 'Эхо: псевдослова' : 'Pseudoword Echo'}
        onBack={() => goBackOrHome()}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>
              {idx + 1}/{rounds.length} · {ru ? 'Ур.' : 'Lv'}{levelRef.current}
            </Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>✓ {hits}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>✗ {errors}</Text>
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <TouchableOpacity
            style={[styles.speakerBtn, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}
            onPress={() => speak(round.word, tgtRef.current, 0.85)}
            activeOpacity={0.8}
          >
            <Ionicons name="volume-high" size={44} color={GRADIENT[0]} />
            <Text style={[styles.speakerLabel, { color: colors.textSecondary }]}>
              {ru ? 'Ещё раз' : 'Repeat'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {ru ? 'Выбери написание того, что услышал' : 'Pick the spelling of what you heard'}
          </Text>

          <View style={styles.optionsCol}>
            {round.options.map((opt) => {
              const revealed = answered !== null;
              const isTarget = opt === round.word;
              const isPicked = opt === answered;
              const bg = revealed && isTarget ? '#22c55e'
                : revealed && isPicked ? '#f43f5e'
                : colors.surface;
              const fg = revealed && (isTarget || isPicked) ? '#FFF' : colors.text;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optionBtn, { backgroundColor: bg, borderColor: revealed && isTarget ? '#22c55e' : colors.border }]}
                  onPress={() => handlePick(opt)}
                  disabled={revealed}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.optionText, { color: fg }]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
        <Text style={[styles.title, { color: colors.text }]}>{ru ? 'Эхо: псевдослова' : 'Pseudoword Echo'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId={GAME_ID}
          level={levelRef.current}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          passed={clearedPassed}
          onContinue={() => startGame()}
          onStop={() => setPhase('config')}
        />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 120 - errors * 40)}
          time={elapsedTime}
          errors={errors}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
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
  configContainer: { padding: 16, gap: 14, paddingBottom: 24 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  langButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  langButtonText: { fontSize: 13, fontWeight: '600' },
  noteText: { fontSize: 11, lineHeight: 15 },
  levelHint: { fontSize: 13, fontWeight: '600' },
  warnCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 18 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { flexDirection: 'row', gap: 8, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 16, alignSelf: 'stretch' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  speakerBtn: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 6,
  },
  speakerLabel: { fontSize: 12, fontWeight: '600' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 340 },
  optionsCol: { width: '100%', maxWidth: 420, gap: 10 },
  optionBtn: { paddingVertical: 16, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  optionText: { fontSize: 20, fontWeight: '700', letterSpacing: 1.5 },
});
