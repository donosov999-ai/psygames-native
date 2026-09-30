/* psygames-game-phoneme-pairs · VER 1 · 19.08.2026 */
/**
 * Фонемы: минимальные пары (Полиглот, game_id 'phoneme_pairs').
 * TTS произносит ОДНО слово из минимальной пары (ship/sheep) — игрок выбирает
 * услышанное из двух написаний. Тренировка фонематического слуха L2.
 * Лесенка: L1-5 лёгкая половина пар + показ прозвучавшего слова; L6-10 весь
 * список; L11+ слепой режим (только звук верно/неверно). Replay не штрафуется.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { ensureVoiceIndex } from '@/src/services/voiceSamples';
import { startNoise, stopNoise } from '@/src/services/noise';
import { speak, ttsAvailable, ttsCancel } from '@/src/services/tts';
import { ZH_PINYIN } from '@/src/constants/zhPinyin.generated';
import { useTtsAvailable, useTtsBlock } from '@/src/hooks/useTtsAvailable';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import LessonPlayer from '@/src/components/LessonPlayer';
import { собратьРазборФонем, пулУровня, type КарточкаФонем, type Отрезок } from '@/src/games/phoneme-pairs/teach';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#f7971e', '#ffd200'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.45 (норма AA 4.5), стало 7.07.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const STORE_KEY = 'psygames_phoneme_pairs_targetlang';

type GamePhase = 'config' | 'playing' | 'cleared' | 'result';

// Минимальные пары. Порядок = сложность: ПЕРВАЯ половина списка — «лёгкие»
// (контраст хорошо различим в TTS), вторая — тоньше. Только пары, которые
// системный синтез реально произносит различимо.
/** Экспорт — для пробы разбора `phoneme-pairs-teach`: разбор обязан брать пары отсюда же. */
export const MINIMAL_PAIRS: Record<string, [string, string][]> = {
  en: [
    // easy half — чёткие гласные контрасты /æ e ʌ/ + разные слоги
    ['snack', 'snake'],
    ['paper', 'pepper'],
    ['walk', 'work'],
    ['fan', 'fun'],
    ['cat', 'cut'],
    ['hat', 'hut'],
    ['coat', 'caught'],
    ['pen', 'pan'],
    ['bad', 'bed'],
    // harder half — долгота /ɪ iː/, /ʊ uː/
    ['bat', 'bet'],
    ['men', 'man'],
    ['ship', 'sheep'],
    ['sit', 'seat'],
    ['live', 'leave'],
    ['cheap', 'chip'],
    ['full', 'fool'],
    ['pool', 'pull'],
    ['luck', 'lock'],
  ],
  es: [
    // easy half — гласные и звонкость
    ['casa', 'cosa'],
    ['mesa', 'misa'],
    ['peso', 'piso'],
    ['tos', 'dos'],
    ['cana', 'caña'],
    ['pena', 'peña'],
    // harder half — r/rr и ll
    ['pero', 'perro'],
    ['caro', 'carro'],
    ['coro', 'corro'],
    ['moro', 'morro'],
    ['polo', 'pollo'],
    ['vale', 'valle'],
  ],
  de: [
    // easy half — качество гласного (o/ö, e/ö) и явная долгота
    ['schon', 'schön'],
    ['kennen', 'können'],
    ['Beet', 'Bett'],
    ['Stadt', 'Staat'],
    ['Ofen', 'offen'],
    ['Wahl', 'Wall'],
    // harder half — долгота i/ü
    ['Miete', 'Mitte'],
    ['bieten', 'bitten'],
    ['Hüte', 'Hütte'],
    ['fühlen', 'füllen'],
    ['Höhle', 'Hölle'],
  ],
  pt: [
    // easy half — согласные/гласные с чётким контрастом (pt-BR)
    ['faca', 'vaca'],
    ['tia', 'dia'],
    ['mala', 'mola'],
    ['bola', 'bolo'],
    // harder half — r/rr, s/z, носовые, открытость гласного
    ['caro', 'carro'],
    ['casar', 'caçar'],
    ['pão', 'pau'],
    ['avô', 'avó'],
    ['vovô', 'vovó'],
  ],
  /**
   * 🔴 КИТАЙСКИЙ (задача b8ea8ac8). Пары НЕ ПРИДУМАНЫ, а выведены из данных: для
   * каждого слога взята замена противопоставляемого звука, и оставлены только те
   * случаи, где получившийся слог ТОЖЕ существует словом в списке HSK 3.0 с тем
   * же тоном. Источник тот же, что у словаря пиньиня (ivankra/hsk30, MIT).
   *
   * Противопоставления ровно те, на которых спотыкается русскоязычный: ретрофлексные
   * zh/ch/sh против свистящих z/c/s и финаль -n против -ng. Тон внутри пары
   * ОДИНАКОВ — иначе человек различал бы мелодию, а не звук, и упражнение
   * проверяло бы не то.
   *
   * ⚠️ На кнопке к иероглифу подписывается пиньинь (см. `PINYIN_HINT`): без него
   * выбор вслепую, а прочитать иероглиф начинающий не может.
   */
  zh: [
    // easy half — оба слова из HSK 1–2, контраст крупный
    ['山', '三'],
    ['事', '四'],
    ['找', '早'],
    ['饭', '放'],
    ['分', '风'],
    ['班', '帮'],
    // harder half — ретрофлексные против свистящих и -n/-ng в потоке
    ['睡', '岁'],
    ['出', '粗'],
    ['成', '层'],
    ['前', '墙'],
    ['进', '静'],
    ['人', '仍'],
    ['种', '总'],
  ],
  ru: [
    // easy half — глухость/звонкость, ы/и, у/ю
    ['дом', 'том'],
    ['почка', 'бочка'],
    ['шест', 'жест'],
    ['мышка', 'мишка'],
    ['лук', 'люк'],
    ['банка', 'банька'],
    // harder half — мягкость на конце / после согласной
    ['полка', 'полька'],
    ['мел', 'мель'],
    ['угол', 'уголь'],
    ['кров', 'кровь'],
    ['рад', 'ряд'],
    ['быть', 'бить'],
  ],
};

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', ru: 'Русский', zh: '中文',
};

/**
 * Пиньинь к иероглифам пар — берётся из сгенерированного словаря HSK, а не
 * пишется здесь руками: одно место правды на приложение. Для нелатинских
 * письменностей подпись обязательна, для остальных её нет и не нужно.
 */
const PINYIN_HINT: Record<string, string> = Object.fromEntries(
  MINIMAL_PAIRS.zh!.flat().map((з) => [з, ZH_PINYIN[з]?.pinyin ?? '']),
);
const TARGET_LANGS = Object.keys(MINIMAL_PAIRS);

interface Trial {
  words: [string, string];   // порядок на кнопках (перемешан)
  correctIdx: 0 | 1;         // какое слово прозвучит
}

// Лесенка: L1-5 — 8 проб, лёгкая половина пар, после ответа показываем слово;
// L6-10 — 10 проб, весь список; L11+ — 12 проб, слепой режим (только звук).
/** Экспортируется для замера лестницы: `memory-hearing-ladders-scan`. */
export function levelParams(level: number): {
  trials: number; easyOnly: boolean; showWord: boolean; blind: boolean;
  /** Ось 2: множитель темпа речи. */
  rate: number;
  /** Ось 5: отношение сигнал/шум в дБ; null — тишина. */
  snrDb: number | null;
  /** Ось 10: сколько ошибок ещё считается прохождением. */
  maxErrors: number;
} {
  const l = Math.min(15, Math.max(1, Math.floor(level)));
  const ступень = l <= 5
    ? { trials: 8, easyOnly: true, showWord: true, blind: false }
    : l <= 10
      ? { trials: 10, easyOnly: false, showWord: false, blind: false }
      : { trials: 12, easyOnly: false, showWord: false, blind: true };
  return {
    ...ступень,
    rate: Math.round((0.95 - (l - 1) * 0.015) * 1000) / 1000,
    snrDb: l < 6 ? null : Math.round(Math.max(0, 18 - (l - 6) * 2) * 10) / 10,
    maxErrors: l <= 5 ? 2 : l <= 10 ? 1 : 0,
  };
}

function buildTrials(pairs: [string, string][], count: number): Trial[] {
  const out: Trial[] = [];
  for (let i = 0; i < count; i++) {
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    const swap = Math.random() < 0.5;
    const words: [string, string] = swap ? [pair[1], pair[0]] : [pair[0], pair[1]];
    out.push({ words, correctIdx: Math.random() < 0.5 ? 0 : 1 });
  }
  return out;
}

export default function PhonemePairsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel('phoneme_pairs');

  const { isPreset, autostart, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка

  const [phase, setPhase] = useState<GamePhase>('config');
  const [targetLang, setTargetLang] = useState<string>(() => {
    const p = str('targetLang', '');
    if (p && MINIMAL_PAIRS[p]) return p;
    return language === 'en' ? 'es' : 'en';
  });

  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState<0 | 1 | null>(null);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  const trialsRef = useRef<Trial[]>([]);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  /** Оси уровня: темп, помеха и допуск ошибок берутся отсюда. */
  const парамRef = useRef(levelParams(1));
  const replaysRef = useRef(0);
  const levelRef = useRef(1);
  const paramsRef = useRef(levelParams(1));
  const tgtRef = useRef('en');
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // язык тренировки не должен совпадать с языком интерфейса
  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;
  const ttsBlock = useTtsBlock(tgt);
  /**
   * Указатель записей тянем ЗАРАНЕЕ, при выборе языка, а не посреди партии:
   * сетевой запрос внутри пробы вносил бы задержку в измерение.
   */
  useEffect(() => { ensureVoiceIndex(tgt).catch(() => {}); }, [tgt]);
  /** Играть можно, только если молчать не по чему: и голос есть, и звук включён. */
  const voiceOk = ttsBlock === null;

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    ttsCancel();
    stopNoise();   // помеха не переживает выход с экрана
  }, []);

  // восстановить сохранённый выбор языка (не в пресете — там параметры рулят)
  useEffect(() => {
    if (isPreset) return;
    AsyncStorage.getItem(STORE_KEY).then((v) => {
      if (v && MINIMAL_PAIRS[v]) setTargetLang(v);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет зарядки → авто-старт

  const pickLang = (code: string) => {
    setTargetLang(code);
    AsyncStorage.setItem(STORE_KEY, code).catch(() => {});
  };

  /**
   * 🎓 РАЗБОР ПО ШАГАМ (Денис 17.09.2026, «раскатывай везде»): узнать, где пара расходится, и слушать
   * только это место (`src/games/phoneme-pairs/teach.ts`). Пары — из пула уровня, пара текущего
   * задания не берётся. Только на уровнях 1–3; партия с разбором не засчитывается. Обработчики
   * стабильные: экран тикает таймером каждые 100 мс.
   */
  const [урок, setУрок] = useState<{ карточки: КарточкаФонем[]; индекс: number } | null>(null);
  const карточкаУрока = урок ? урок.карточки[урок.индекс] : null;
  const урокВПартииRef = useRef(false);
  const пулRef = useRef<[string, string][]>([]);
  const [итогСРазбором, setИтогСРазбором] = useState(false);
  const разборДоступен = phase === 'playing' && levelRef.current <= 3;
  const начатьРазбор = () => {
    ttsCancel();
    stopNoise();
    урокВПартииRef.current = true;
    const текущая = trialsRef.current[idx]?.words ?? null;
    setУрок({ карточки: собратьРазборФонем(пулRef.current, tgtRef.current, текущая).карточки, индекс: 0 });
  };
  const урокДальше = useCallback(
    () => setУрок((у) => (у && у.индекс + 1 < у.карточки.length ? { ...у, индекс: у.индекс + 1 } : у)),
    [],
  );
  const урокНазад = useCallback(
    () => setУрок((у) => (у && у.индекс > 0 ? { ...у, индекс: у.индекс - 1 } : у)),
    [],
  );
  const урокЗакрыть = useCallback(() => { ttsCancel(); setУрок(null); }, []);
  const текстУрока = карточкаУрока
    ? Object.entries(карточкаУрока.поля ?? {}).reduce(
      (текст, [ключ, знач]) => текст.replace(new RegExp(`\\{${ключ}\\}`, 'g'), String(знач)),
      t(карточкаУрока.ключ) as string,
    )
    : '';
  /** Карточка со словами звучит сама: разбор про слух. */
  useEffect(() => {
    if (!урок) return;
    const к = урок.карточки[урок.индекс];
    if (!к || !к.звук.length) return;
    let отменено = false;
    const таймер = setTimeout(async () => {
      for (const слово of к.звук) {
        if (отменено) return;
        await speak(слово, tgtRef.current, 0.9);
        await new Promise((готово) => setTimeout(готово, 450));
      }
    }, 350);
    return () => { отменено = true; clearTimeout(таймер); ttsCancel(); };
  }, [урок]);

  const startGame = () => {
    урокВПартииRef.current = false;
    setИтогСРазбором(false);
    setУрок(null);
    ttsCancel();
    if (advanceRef.current) clearTimeout(advanceRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    paramsRef.current = p;
    tgtRef.current = tgt;
    const all = MINIMAL_PAIRS[tgt] || MINIMAL_PAIRS.en;
    const pool = пулУровня(all, p.easyOnly);   // та же формула, что у разбора
    пулRef.current = pool;
    trialsRef.current = buildTrials(pool, p.trials);
    hitsRef.current = 0;
    errorsRef.current = 0;
    парамRef.current = levelParams(lvl.level);
    replaysRef.current = 0;
    setHits(0);
    setErrors(0);
    setAnswered(null);
    setIdx(0);
    setElapsedTime(0);
    const start = gameNow();
    startTimeRef.current = start;
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    setPhase('playing');
  };

  // озвучка слова текущей пробы — эффектом, НЕ внутри setState
  useEffect(() => {
    if (phase !== 'playing') return;
    const tr = trialsRef.current[idx];
    if (!tr) return;
    const to = setTimeout(() => {
      startNoise(парамRef.current.snrDb);
      speak(tr.words[tr.correctIdx], tgtRef.current, парамRef.current.rate).then(() => stopNoise());
    }, 400);
    return () => clearTimeout(to);
  }, [phase, idx]);

  const replay = () => {
    const tr = trialsRef.current[idx];
    if (!tr || phase !== 'playing') return;
    replaysRef.current += 1;   // replay не штрафуется, только считаем
    startNoise(парамRef.current.snrDb);
    speak(tr.words[tr.correctIdx], tgtRef.current, парамRef.current.rate).then(() => stopNoise());
  };

  const finishRound = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current;
    const e = errorsRef.current;
    // Ось 10, цена ошибки: на первых уровнях прощаются две, дальше одна, с
    // одиннадцатого — ни одной. Растёт не задание, а требование к точности.
    const passed = e <= парамRef.current.maxErrors;
    const сРазбором = урокВПартииRef.current;
    setИтогСРазбором(сРазбором);
    if (сРазбором) {
      setPhase('result');   // партия с разбором не засчитывается: ни подъёма, ни провала
    } else if (isPreset) {
      setPhase(passed ? 'cleared' : 'result');
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();   // симметрия лестницы: три провала подряд → −1 уровень
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: 'phoneme_pairs',
        score: Math.max(0, h * 100 - e * 30),
        time_seconds: finalTime,
        difficulty: `L${levelRef.current}`,
        mode: tgtRef.current,
        errors: e,
        details: {
          // Резерв прогресса: getMaxLevelFromSessions восстановит уровень отсюда,
          // если локальный ключ потерян (переустановка, сброс профиля).
          level: levelRef.current,
          hits: h,
          errors: e,
          trials: paramsRef.current.trials,
          target_lang: tgtRef.current,
          replays: replaysRef.current,
          ...(сРазбором ? { lesson: true } : {}),
        },
      });
    } catch (err) { console.error('Error saving session:', err); }
  };

  const handleAnswer = (choice: 0 | 1) => {
    if (phase !== 'playing' || answered !== null) return;
    const tr = trialsRef.current[idx];
    if (!tr) return;
    const ok = choice === tr.correctIdx;
    if (ok) {
      sndCorrect();
      hitsRef.current += 1;
      setHits((h) => h + 1);
    } else {
      sndWrong();
      errorsRef.current += 1;
      setErrors((e) => e + 1);
    }
    setAnswered(choice);
    const delay = paramsRef.current.showWord ? 1100 : paramsRef.current.blind ? 450 : 700;
    advanceRef.current = setTimeout(() => {
      if (idx + 1 >= trialsRef.current.length) {
        finishRound();
      } else {
        setAnswered(null);
        setIdx(idx + 1);
      }
    }, delay);
  };

  const renderConfig = () => (
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="ear" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('phonemePairs')}</Text>
        <Text style={styles.configDesc}>
          {t('phPairsConfigDesc')}
        </Text>
      </LinearGradient>
      <LevelProgressMap bestLevel={lvl.best} gameId="phoneme_pairs" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('langToTrain')}</Text>
        <View style={styles.optionButtons}>
          {TARGET_LANGS.filter((c) => c !== language).map((c) => (
            <TouchableOpacity
              accessibilityRole="button"
              key={c}
              style={[
                styles.langBtn,
                tgt === c
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => pickLang(c)}
            >
              <Text style={[styles.langBtnText, { color: tgt === c ? textOn(GRADIENT[0]) : colors.text }]}>{LANG_NAMES[c]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
          {t('phPairsLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>
      {!voiceOk && (
        <View style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: '#f43f5e' }]}>
          <Ionicons name="volume-mute" size={22} color="#f43f5e" />
          <Text style={[styles.warnText, { color: colors.text }]}>
            {ttsBlock === 'sound-off' ? t('voiceSoundOff') : t('voiceMissingLang').replace('{lang}', LANG_NAMES[tgt])}
          </Text>
        </View>
      )}
    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  // игровая фаза — на едином каркасе GameShell: внизу ТОЛЬКО пара слов (ответ),
  // повтор звука — служебное действие и стоит в шапке; в поле — подсказка и показ
  // прозвучавшего слова
  const playingTrial = phase === 'playing' ? trialsRef.current[idx] : undefined;
  if (phase === 'playing' && playingTrial) {
    const tr = playingTrial;
    const p = paramsRef.current;
    const total = trialsRef.current.length;
    const spokenWord = tr.words[tr.correctIdx];
    const wasCorrect = answered !== null && answered === tr.correctIdx;
    return (
      <GameShell
        title={t('phonemePairsShort')}
        onBack={() => goBackOrHome()}
        /**
         * 🔴 МЕНЮ ПАУЗЫ — ОДНО НА ВСЕ ИГРЫ. Стрелка «назад» открывает список
         * Продолжить · Заново · На главную вместо немого выхода.
         * Механизм в каркасе с v2.52.2, но до игрока он доехал у ТРЁХ игр из 96
         * (замер `grep -l pauseActions app/games/*.tsx` на `main` 09.09.2026) —
         * остальные подключают сами. «Заново» и выход разные: выход через
         * `leave: true` идёт тем же путём, что стрелка, и сохраняет партию
         * в «продолжить»; своё `router.back()` сохранение бы потеряло.
         */
        pauseActions={[
          { id: 'resume', label: t('exitConfirmStay'), icon: 'play' as const, primary: true },
          { id: 'restart', label: t('restart'), icon: 'refresh' as const, onPress: () => startGame() },
          { id: 'home', label: t('goHome'), icon: 'home' as const, leave: true },
        ]}
        /**
         * Счётчики ДАННЫМИ (см. `HudItem`): каркас рисует их одинаково во всех
         * играх, и правка вида приходит сразу везде.
         *
         * ⚠️ Счётчика ошибок здесь нет намеренно: при подстройке сложности ошибки —
         * норма по построению, и красный счётчик наказывает ровно за то, чего
         * требует обучение (§12.4 карты геймификации).
         */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${idx + 1}/${total} · ${t('label_level_short')}${levelRef.current}` },
          { key: 'hud_correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
        ]}
        /*
          🔴 «Ещё раз» УЕХАЛО ИЗ НИЖНЕЙ ПОЛОСЫ, и здесь смешение было самым
          наглядным: две кнопки-ответа и повтор звука стояли ОДНОЙ КОЛОНКОЙ,
          одинаковыми пилюлями, причём повтор — САМЫМ НИЖНИМ, ближе всего к
          пальцу. Ответ и «подай задание заново» ничем не различались.
          Повтор игру не отвечает: он заново произносит слово (и считается в
          `replaysRef`). Это подача задания — служебное действие, место в шапке.
          Внизу остались ровно два ответа, и полоса снова значит одно.
        */
        headerActions={
          <GameAuxBar>
            {разборДоступен && (
              <GameAuxAction compact icon="school-outline" tint="#d97706" label={t('teachButton')} onPress={начатьРазбор} />
            )}
            {/* compact: в полосе счётчиков (auxInHud) подпись «ещё раз» не влезает на длинных языках —
                 замер 16.09.2026 на 390 pt: es «Escuchar otra vez» 177 px, правый край 398 — за экраном на 8;
                 de 175 px, край 389 — впритык. Слово остаётся в accessibilityLabel. */}
            <GameAuxAction
              compact
              icon="volume-high" label={t('replaySound')}
              disabled={answered !== null} onPress={replay}
            />
          </GameAuxBar>
        }
        auxInHud
        bottom="answer"
        toolbar={
          <View style={styles.toolbarCol}>
            <View style={styles.pairCol}>
              {([0, 1] as const).map((i) => {
                let bg = colors.surface;
                let fg = colors.text;
                let border = colors.border;
                if (!p.blind && answered !== null) {
                  if (i === tr.correctIdx) { bg = '#22c55e'; fg = '#FFF'; border = '#22c55e'; }
                  else if (i === answered) { bg = '#f43f5e'; fg = '#FFF'; border = '#f43f5e'; }
                }
                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    key={i}
                    style={[styles.wordBtn, { backgroundColor: bg, borderColor: border }]}
                    onPress={() => handleAnswer(i)}
                    activeOpacity={0.8}
                    disabled={answered !== null}
                  >
                    <Text style={[styles.wordBtnText, { color: fg }]}>{tr.words[i]}</Text>
                    {PINYIN_HINT[tr.words[i]!] ? (
                      <Text style={[styles.wordBtnHint, { color: fg }]}>{PINYIN_HINT[tr.words[i]!]}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {t('phPairsPickHint')}
          </Text>
          {p.showWord && answered !== null && (
            <Text style={[styles.revealText, { color: wasCorrect ? '#22c55e' : '#f43f5e' }]}>
              {t('phPairsPlayed').replace('{w}', spokenWord)}
            </Text>
          )}
        </View>
        {/*
          🎓 РАЗБОР НА ВЕСЬ ЭКРАН. Поле — оба слова пары; место расхождения выделено (у китайского — в
          пиньине, у английского и немецкого не выделено: там написание не совпадает со звуком).
          На ответе прозвучавшее слово в зелёной рамке.
        */}
        <LessonPlayer
          visible={!!урок}
          индекс={урок?.индекс ?? 0}
          шагов={Math.max(0, (урок?.карточки.length ?? 1) - 1)}
          текст={текстУрока}
          сноска={урок?.индекс === 0 ? t('teachNotCounted') : undefined}
          готово={карточкаУрока?.вид === 'готово'}
          занят={false}
          renderBoard={(сторона) => {
            const к = карточкаУрока;
            if (!к?.пара) return <Ionicons name="ear-outline" size={Math.round(сторона * 0.3)} color={GRADIENT[0]} />;
            const китайский = tgtRef.current === 'zh';
            const куски = (текст: string, отрезок: Отрезок | undefined) => {
              const б = Array.from(текст);
              if (!отрезок) return <Text>{текст}</Text>;
              return (
                <Text>
                  {б.slice(0, отрезок[0]).join('')}
                  <Text style={{ color: GRADIENT[0], textDecorationLine: 'underline' }}>{б.slice(отрезок[0], отрезок[1]).join('')}</Text>
                  {б.slice(отрезок[1]).join('')}
                </Text>
              );
            };
            return (
              <View style={[styles.разборРяд, { width: сторона }]}>
                {к.вид === 'проба' ? <Ionicons name="volume-high" size={30} color={colors.textSecondary} /> : null}
                {([0, 1] as const).map((i) => {
                  const слово = к.пара![i];
                  const отрезок = к.отличие ? (i === 0 ? к.отличие.a : к.отличие.b) : undefined;
                  const прозвучало = к.вид === 'ответ' && к.звучит === i;
                  return (
                    <View key={i} style={[styles.разборСлово, { borderColor: прозвучало ? '#22c55e' : colors.border, borderWidth: прозвучало ? 3 : 1, backgroundColor: colors.surface }]}>
                      <Text style={[styles.разборСловоТекст, { color: colors.text }]}>
                        {китайский ? слово : куски(слово, отрезок)}
                      </Text>
                      {китайский ? (
                        <Text style={[styles.разборПиньинь, { color: colors.textSecondary }]}>{куски(PINYIN_HINT[слово] || '', отрезок)}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          }}
          onДальше={урокДальше}
          onНазад={урокНазад}
          onЗакрыть={урокЗакрыть}
        />
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
        <Text style={[styles.title, { color: colors.text }]}>{t('phonemePairsShort')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="phoneme_pairs"
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
          score={Math.max(0, hits * 100 - errors * 30)}
          time={elapsedTime}
          errors={errors}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
          metricsNote={итогСРазбором ? [t('teachNotCounted')] : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  разборРяд: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 12 },
  разборСлово: { minWidth: 120, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', gap: 4 },
  разборСловоТекст: { fontSize: 28, fontWeight: '800' },
  разборПиньинь: { fontSize: 17, fontWeight: '600' },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color, textAlign: 'center' },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionHint: { fontSize: 13, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  langBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  langBtnText: { fontSize: 13, fontWeight: '600' },
  warnCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1.5 },
  warnText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 18 },
  toolbarCol: { flex: 1, alignItems: 'center', gap: 10 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 13, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  pairCol: { width: '100%', maxWidth: 420, gap: 14 },
  wordBtn: { paddingVertical: 26, paddingHorizontal: 20, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
  wordBtnText: { fontSize: 30, fontWeight: '800' },
  // Пиньинь под иероглифом: мельче и приглушённее — подсказка, а не сам ответ.
  wordBtnHint: { fontSize: 15, fontWeight: '700', opacity: 0.75, marginTop: 2 },
  revealText: { fontSize: 16, fontWeight: '700' },
  // ⚠️ Осиротело после разводки слотов: «Ещё раз» уехало в шапку (GameAuxAction).
  // Стили ниже (replayBtn, replayText) больше никем не берутся; оставлены
  // намеренно — удаление чужого кода в этом проекте только с разрешения.
  replayBtn: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 16, borderWidth: 1, marginTop: 4 },
  replayText: { fontSize: 15, fontWeight: '700' },
});
