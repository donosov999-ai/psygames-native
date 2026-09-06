/* psygames-game-pseudoword-echo · VER 1 · 19.08.2026 */
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
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { speak, ttsAvailable, ttsCancel } from '@/src/services/tts';
import { startNoise, stopNoise } from '@/src/services/noise';
import { useTtsAvailable, useTtsBlock } from '@/src/hooks/useTtsAvailable';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import { generatePseudowords } from '@/src/services/pseudowords';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#8E2DE2', '#4A00E0'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 5.80 (норма AA 4.5), стало 4.54.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const GAME_ID = 'pseudoword_echo';
const TL_KEY = `psygames_${GAME_ID}_targetlang`;

/**
 * Что меняется с уровнем — вслух, а не молча.
 *
 * ЗАЧЕМ. Из 61 игры смену правил объясняли 14; остальные растили сложность
 * незаметно, и человек упирался, не понимая во что. Приоритет Дениса 16.08.2026.
 */
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
export const PSEUDOWORDECHO_RULES: LevelRule[] = [
  { key: 'longer6', fromLevel: 5 },   // lr_pseudoword_echo_longer6_*
  { key: 'longer8', fromLevel: 9 },   // lr_pseudoword_echo_longer8_*
];

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
/**
 * 🔴 ЛЕСТНИЦА «ЭХА» — ЧЕТЫРЕ ОСИ ВМЕСТО ОДНОЙ ДЛИНЫ.
 *
 * 📍 ЗАМЕР ДО (проба memory-hearing-ladders-scan, 06.09.2026): плато с 9-го
 * уровня из 15 — семь уровней подряд неотличимы, потому что менялись только
 * длина слова (4→9) и число проб (8→12), обе ступенями по четыре уровня.
 *
 * 🔴 ПОЧЕМУ ДЛИНА — САМЫЙ СЛАБЫЙ ПАРАМЕТР ИЗ ВОЗМОЖНЫХ. В задачах на повторение
 * псевдослов (Syllable Repetition Task, ASHA 2009) трудность определяется
 * ФОНОЛОГИЧЕСКОЙ СТРУКТУРОЙ сильнее, чем числом букв: «страпл» тяжелее
 * «пасата» при той же длине, потому что стечения согласных негде переспросить у
 * артикуляции. Игра крутила ровно длину, то есть взяла слабейший из двух
 * известных параметров.
 *
 * ВЗЯТЫЕ ОСИ (канон §R PROJECT_REF): ось 1 длина и число проб — как были
 * (пороги правил `longer6`/`longer8` на них и стоят, их трогать нельзя); ось 7
 * СХОДСТВО/СТРУКТУРА — требуемое стечение согласных растёт 1 → 2 → 3; ось 2
 * СКОРОСТЬ — темп речи меняется каждый уровень, поэтому соседние различимы
 * везде; ось 5 ОТВЛЕЧЕНИЕ — шум по SNR с 10-го уровня.
 *
 * ⚠️ Экспортирована для гейта `level-rule-threshold`: пороги правил сверяются
 * ИСПОЛНЕНИЕМ этой функции, поэтому lenMin/lenMax и trials оставлены прежними.
 */
export function levelParams(level: number): {
  lenMin: number; lenMax: number; trials: number;
  /**
   * Ось 7: доля слов партии, обязанных нести стечение согласных (0 — не важно).
   *
   * 🔴 ПОЧЕМУ ДОЛЯ, А НЕ «ПОРОГ СТЕЧЕНИЯ». Первая редакция требовала стечение
   * длиной 1 → 2 → 3, и ЗАМЕР 07.09.2026 показал, что ось при этом ломается:
   * на русском при требовании тройного стечения доля трудных слов ПАДАЛА до
   * 0,867 против 0,942 при двойном — пул псевдослов беден тройными стечениями
   * (максимум в пуле равен 3), запрос не набирался на партию, и мягкий откат
   * скатывался к любым словам. Требование доли устойчиво к бедности пула:
   * сколько трудных есть, столько и ставим вперёд, остаток добираем обычными,
   * и лестница растёт монотонно.
   */
  hardShare: number;
  /** Ось 2: множитель темпа речи. */
  rate: number;
  /** Ось 5: отношение сигнал/шум в дБ; null — тишина. */
  snrDb: number | null;
} {
  const l = Math.min(15, Math.max(1, Math.floor(level)));
  const объём = l <= 4
    ? { lenMin: 4, lenMax: 5, trials: 8 }
    : l <= 8
      ? { lenMin: 6, lenMax: 7, trials: 10 }
      : { lenMin: 8, lenMax: 9, trials: 12 };
  return {
    ...объём,
    hardShare: l <= 3 ? 0 : Math.min(0.9, Math.round((l - 3) * 0.075 * 100) / 100),
    rate: Math.round((0.95 - (l - 1) * 0.015) * 1000) / 1000,
    snrDb: l < 10 ? null : Math.round(Math.max(0, 15 - (l - 10) * 3) * 10) / 10,
  };
}

/**
 * ДЛИНА САМОГО ДЛИННОГО СТЕЧЕНИЯ СОГЛАСНЫХ В СЛОВЕ.
 *
 * Это и есть мера фонологической трудности: одиночная согласная между гласными
 * проговаривается сама собой, а «стрп» приходится удерживать целиком. Буквы, не
 * попавшие ни в гласные, ни в согласные языка (диакритика, ъ/ь), стечение не
 * разрывают и в него не считаются — иначе мягкий знак делал бы слово «проще»,
 * ничего не меняя на слух.
 */
export function maxConsonantCluster(word: string, lang: string): number {
  const гласные = VOWELS[lang] || VOWELS.en;
  const согласные = CONSONANTS[lang] || CONSONANTS.en;
  let макс = 0, текущее = 0;
  for (const буква of word.toLowerCase()) {
    if (согласные.includes(буква)) { текущее += 1; if (текущее > макс) макс = текущее; }
    else if (гласные.includes(буква)) { текущее = 0; }
  }
  return макс;
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
/** Экспортирован для пробы: ось структуры проверяется НА СЛОВАХ партии, а не на параметрах. */
export function buildRounds(lang: string, count: number, lenMin: number, lenMax: number, hardShare = 0): Round[] {
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
  /*
   * Ось 7 — доля трудных. Партия набирается двумя корзинами: сперва столько
   * слов со стечением согласных, сколько требует уровень (или сколько нашлось),
   * затем добор обычными. Порядок в итоге перемешивается, чтобы трудные не шли
   * подряд в начале.
   */
  const трудные = shuffle(pool.filter((w) => maxConsonantCluster(w, lang) >= 2));
  const простые = shuffle(pool.filter((w) => maxConsonantCluster(w, lang) < 2));
  const надо = Math.round(count * Math.min(1, Math.max(0, hardShare)));
  const взято = [
    ...трудные.slice(0, надо),
    ...простые.slice(0, Math.max(0, count - Math.min(надо, трудные.length))),
  ];
  const добор = shuffle(pool).filter((w) => !взято.includes(w));
  const партия = shuffle([...взято, ...добор].slice(0, count));
  return партия.map((word) => ({ word, options: makeOptions(word, lang) }));
}

export default function PseudowordEchoGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel(GAME_ID);

  const { isPreset, autostart, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const [phase, setPhase] = useState<GamePhase>('config');
  // Правила уровня: показать при первом входе и дать перечитать по бейджу.
  const levelRules = useLevelRules('pseudoword_echo', lvl.level, PSEUDOWORDECHO_RULES, phase === 'playing');
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
  /** Оси текущего уровня: темп речи и помеха берутся отсюда при каждом произнесении. */
  const парамRef = useRef(levelParams(1));
  const tgtRef = useRef('en');
  const lenRangeRef = useRef('4-5');
  const startTimeRef = useRef(0);
  const advTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // валидный целевой язык: не совпадает с языком интерфейса
  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;
  const ttsBlock = useTtsBlock(tgt);
  /** Играть можно, только если молчать не по чему: и голос есть, и звук включён. */
  const voiceOk = ttsBlock === null;

  // сохранённый выбор языка тренировки (пресет из зарядки имеет приоритет)
  useEffect(() => {
    if (isPreset) return;
    AsyncStorage.getItem(TL_KEY).then((v) => {
      if (v && TARGET_LANGS.some((l) => l.code === v)) setTargetLang(v);
    }).catch(() => {});
  }, [isPreset]);

    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет зарядки → авто-старт

  useEffect(() => () => {
    if (advTimerRef.current) clearTimeout(advTimerRef.current);
    ttsCancel();
    stopNoise();   // помеха не переживает выход с экрана
  }, []);

  // озвучка текущего псевдослова при показе раунда (эффект, не setState-updater)
  useEffect(() => {
    if (phase !== 'playing') return;
    const round = rounds[idx];
    if (round) {
      startNoise(парамRef.current.snrDb);
      speak(round.word, tgtRef.current, парамRef.current.rate).then(() => stopNoise());
    }
  }, [phase, idx, rounds]);

  const pickLang = (code: string) => {
    setTargetLang(code);
    AsyncStorage.setItem(TL_KEY, code).catch(() => {});
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    парамRef.current = p;
    levelRef.current = lvl.level;
    tgtRef.current = tgt;
    lenRangeRef.current = `${p.lenMin}-${p.lenMax}`;
    hitsRef.current = 0;
    errorsRef.current = 0;
    setHits(0);
    setErrors(0);
    setAnswered(null);
    setIdx(0);
    setRounds(buildRounds(tgt, p.trials, p.lenMin, p.lenMax, p.hardShare));
    startTimeRef.current = gameNow();
    setPhase('playing');
  };

  const finish = async (total: number) => {
    ttsCancel();
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current;
    const e = errorsRef.current;
    const passed = e <= 1;
    if (passed && !isPreset) lvl.reach(levelRef.current + 1);
    if (!passed && !isPreset) lvl.fail();   // симметрия лестницы: три провала подряд → −1 уровень
    if (isPreset) {
      setPhase(passed ? 'cleared' : 'result');
    } else {
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: GAME_ID,
        score: Math.max(0, h * 120 - e * 40),
        time_seconds: finalTime,
        difficulty: `${tgtRef.current} · L${levelRef.current}`,
        mode: tgtRef.current,
        errors: e,
        details: {
          // Резерв прогресса: getMaxLevelFromSessions восстановит уровень отсюда,
          // если локальный ключ потерян (переустановка, сброс профиля).
          level: levelRef.current,
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
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="headset" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('pseudowordEcho')}</Text>
        <Text style={styles.configDesc}>
          {t('pwEchoConfigDesc')}
        </Text>
      </LinearGradient>

      <LevelProgressMap bestLevel={lvl.best} gameId={GAME_ID} currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>
          {t('langToTrain')}
        </Text>
        <View style={styles.optionButtons}>
          {TARGET_LANGS.filter((l) => l.code !== language).map((l) => (
            <TouchableOpacity
              accessibilityRole="button"
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
          {t('pwEchoUnsupportedNote')}
        </Text>
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.levelHint, { color: colors.textSecondary }]}>
          {t('pwEchoLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>

      {!voiceOk && (
        <View style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: '#f59e0b' }]}>
          <Ionicons name="warning" size={22} color="#f59e0b" />
          <Text style={[styles.warnText, { color: colors.text }]}>
            {t(ttsBlock === 'sound-off' ? 'voiceSoundOff' : 'voiceMissing')}
          </Text>
        </View>
      )}

    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  // игровая фаза — на едином каркасе GameShell: счётчики в статс-строке; динамик-стимул
  // и варианты написания — в центрируемом поле (нижних кнопок у игры нет)
  const playingRound = phase === 'playing' ? rounds[idx] : undefined;
  if (phase === 'playing' && playingRound) {
    const round = playingRound;
    return (
      <GameShell
        title={t('pseudowordEcho')}
        onBack={() => goBackOrHome()}
        /** Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4). */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${idx + 1}/${rounds.length}`, pop: true },
          { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
          { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: levelRef.current },
        ]}
        stats={
          <View style={styles.statsRow}>
            {/* Правило уровня — объяснение механики, а не счётчик: остаётся в шапке. */}
            <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.speakerBtn, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}
            onPress={() => {
              startNoise(парамRef.current.snrDb);
              speak(round.word, tgtRef.current, парамRef.current.rate).then(() => stopNoise());
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="volume-high" size={44} color={GRADIENT[0]} />
            <Text style={[styles.speakerLabel, { color: colors.textSecondary }]}>
              {t('replaySound')}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {t('pwEchoPickSpelling')}
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
                  accessibilityRole="button"
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
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
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
        <Text style={[styles.title, { color: colors.text }]}>{t('pseudowordEcho')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
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
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14, paddingBottom: 24 + SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  langButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  langButtonText: { fontSize: 13, fontWeight: '600' },
  noteText: { fontSize: 11, lineHeight: 15 },
  levelHint: { fontSize: 13, fontWeight: '600' },
  warnCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 18 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { flexDirection: 'row', gap: 8, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 16, alignSelf: 'stretch' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 13, fontWeight: '700' },
  speakerBtn: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 6,
  },
  speakerLabel: { fontSize: 12, fontWeight: '600' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 340, width: '100%' },
  optionsCol: { width: '100%', maxWidth: 420, gap: 10 },
  optionBtn: { paddingVertical: 16, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  optionText: { fontSize: 20, fontWeight: '700', letterSpacing: 1.5 },
});
