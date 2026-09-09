/* psygames-game-listening-span · VER 2 · 23.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { ensureVoiceIndex, voiceUrl } from '@/src/services/voiceSamples';
import { speakSequence, ttsAvailable, ttsCancel } from '@/src/services/tts';
import { useTtsBlock } from '@/src/hooks/useTtsAvailable';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import { TRANSLATION_VOCAB , hasVocab } from '@/src/constants/translationVocab';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { pickFreshFrom, readSeen, writeSeen } from '@/src/services/freshPool';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#4776E6', '#8E54E9'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 4.20 (норма AA 4.5), стало 4.53.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const GAME_ID = 'listening_span';
const TARGETLANG_KEY = `psygames_${GAME_ID}_targetlang`;
const ROUNDS = 2;

// Listening span: K слов целевого языка озвучиваются по одному (экран слов НЕ показывает),
// затем recall — сетка из K услышанных + K дистракторов; тапать услышанные В ТОМ ЖЕ ПОРЯДКЕ.
// Как в corsi: неверный следующий элемент → ошибка раунда, раунд завершается.

/**
 * Что меняется с уровнем — вслух, а не молча.
 *
 * ЗАЧЕМ. Из 61 игры смену правил объясняли 14; остальные растили сложность
 * незаметно, и человек упирался, не понимая во что. Приоритет Дениса 16.08.2026.
 */
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
/** Уровень, с которого объём и скорость перестают расти — дальше держат задержка и сходство. */
export const LSPAN_VOLUME_TOP = 9;

export const LISTENINGSPAN_RULES: LevelRule[] = [
  { key: 'span8', fromLevel: 6 },   // lr_listening_span_span8_*
  /**
   * 🔴 ОСЬ 7 ОБЪЯВЛЯЕТСЯ ВМЕСТЕ С ОСЬЮ, А НЕ ПОСЛЕ ПАДЕНИЯ ВЫПУСКА.
   * 07.09.2026 раздел уже получил поимённый долг за молчаливую ось 9 «Объёма
   * цифр»: механика вышла, правила не было, main встал красным на 2.49.0.
   * Здесь правило заводится тем же коммитом, что и сама механика.
   * ⚠️ Порог — от константы, а не числом: числом он разъедется на первой правке.
   */
  { key: 'similar', fromLevel: LSPAN_VOLUME_TOP + 1 },   // lr_listening_span_similar_*
];


type GamePhase = 'config' | 'listen' | 'recall' | 'cleared' | 'result';

// Лесенка: L1 = 3 слова → потолок 8; пауза между словами 700мс → 500мс с ростом уровня.
/** Экспортирован для гейта `level-rule-threshold`: порог правила сверяется ИСПОЛНЕНИЕМ этой функции. */
/**
 * 🔴 ОСЬ 3 — ЗАДЕРЖКА. Появилась 07.09.2026, потому что объём и скорость кончились.
 *
 * ЗАМЕР ДО. Прогон этой функции на L1…L60: с L9 застывало ВСЁ — `span=8` упирался
 * в потолок слухового охвата, `gapMs=500` доходил до дна. Пятьдесят два уровня
 * (L9…L60) были неотличимы друг от друга, но каждый требовал прохождения.
 *
 * ПОЧЕМУ НЕ БОЛЬШЕ СЛОВ. Слуховой охват человека 5–8 слов; девятое слово не делает
 * пробу труднее, оно делает её невозможной для всех одинаково — а значит уровни
 * снова перестают различать людей. Растить надо не объём, а то, что мешает его
 * удерживать.
 *
 * ЧТО ДЕЛАЕТ ЗАДЕРЖКА. Пауза между последним услышанным словом и открытием ввода.
 * Ряд уже нельзя проговаривать «по горячим следам» — его надо ДЕРЖАТЬ. Это
 * классическая манипуляция на удержание, и в разделе её не было ни в одной игре.
 *
 * ⚠️ ПОТОЛКА У ЗАДЕРЖКИ НЕТ — сознательно. Правило раздела: потолков нет нигде
 * (`span-chat/PROJECT_REF.md` §R). Ограничить рост задержки сейчас значило бы
 * вернуть ровно то плато, которое она чинит. Когда придёт ось 4 (счёт между
 * словами, задача 103cd98d), полосу задержки можно будет закончить и передать
 * нагрузку ей — но закончить одну ось МОЖНО только тогда, когда началась следующая.
 */
export function levelParams(level: number): { span: number; gapMs: number; holdMs: number; similarShare: number } {
  const span = Math.min(8, 2 + level);
  const gapMs = Math.max(500, 700 - (level - 1) * 25);
  const holdMs = Math.max(0, level - LSPAN_VOLUME_TOP) * 700;
  /** Ось 7: доля отвлекающих, подобранных ПОХОЖИМИ на озвученные. 0 → 1 за десять уровней. */
  const similarShare = Math.min(1, Math.max(0, level - LSPAN_VOLUME_TOP) * 0.1);
  return { span, gapMs, holdMs, similarShare };
}

/**
 * 🔴 ОСЬ 7 — СХОДСТВО. Введена 07.09.2026, когда объём и скорость уже кончились.
 *
 * ЗАЧЕМ. Похожие слова труднее удержать раздельно — это фонологический эффект
 * сходства, классика памяти на слух. Растёт не число слов (их потолок 8, выше
 * нормы человека), а то, насколько легко их спутать при ВЫБОРЕ из сетки.
 *
 * ЧТО ИМЕННО МЕНЯЕТСЯ. Отвлекающие слова в сетке подбираются ПОХОЖИМИ на
 * озвученные, а не случайными. Доля таких растёт с уровнем.
 * ⚠️ Озвученные слова не трогаем: подменять их — значит менять саму пробу, а не
 * её трудность. Меняется только то, среди чего человек ищет ответ.
 *
 * ПОЧЕМУ БУКВЫ, А НЕ ФОНЕМЫ. Целевых языков много, транскрипции у нас нет.
 * Правка расстоянием по буквам — честный заменитель: у «casa/cama», «rot/rat»,
 * «kalt/kalb» она даёт ровно те пары, которые путаются и на слух. Где заменитель
 * промахнётся, ось просто сработает слабее — но не наоборот.
 */
export function похожесть(a: string, b: string): number {
  const x = a.toLowerCase(), y = b.toLowerCase();
  if (x === y) return 1;
  const n = x.length, m = y.length;
  if (!n || !m) return 0;
  // Расстояние Левенштейна на одной строке — словам до 20 букв этого хватает.
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
}

/**
 * Отвлекающие: сначала самые похожие на озвученные (сколько просит доля), затем
 * обычные. ⚠️ Слово не может быть и озвученным, и отвлекающим — иначе у задачи
 * нет однозначного ответа, и проба перестаёт мерить.
 */
export function подобратьОтвлекающие(
  pool: readonly string[], озвученные: readonly string[], нужно: number, доля: number,
): string[] {
  const занято = new Set(озвученные);
  const свободные = pool.filter((w) => !занято.has(w));
  const похожих = Math.min(нужно, Math.round(нужно * Math.max(0, Math.min(1, доля))));
  const счёт = близостьКОзвученным(свободные, озвученные);
  const порядок = [...свободные].sort((a, b) => (счёт.get(b) ?? 0) - (счёт.get(a) ?? 0));
  const взятые = порядок.slice(0, похожих);
  const остаток = shuffle(порядок.slice(похожих));
  return [...взятые, ...остаток].slice(0, нужно);
}

function близостьКОзвученным(свободные: readonly string[], озвученные: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of свободные) {
    let best = 0;
    for (const t of озвученные) { const v = похожесть(w, t); if (v > best) best = v; }
    m.set(w, best);
  }
  return m;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Слова целевого языка из общего словаря — мешок, из которого берём.
 *
 * 🔴 СНАЧАЛА ОЗВУЧЕННЫЕ, И ЭТО ПОЧИНКА МОЕЙ ЖЕ ПОЛОМКИ (09.09.2026).
 *
 * 📍 ЗАМЕР. Коммит `30d63aa2` вырастил общий словарь 196 → 283 слова ради
 * языковой зарядки. Записи стимулов снимались под прежние 196, и доля
 * озвученных упала: en 96 % → 67 %, es 95 % → 66 %, de 96 % → 67 %. То есть
 * каждое третье слово здесь стало уходить на СИСТЕМНЫЙ голос устройства —
 * а его на части телефонов для нужного языка нет вовсе (разбор в шапке
 * `voiceSamples`). Для игры, где межсловный интервал сам является измеряемым
 * параметром, это порча пробы, а не косметика.
 *
 * ⚠️ ПОЧЕМУ НЕ ЖЁСТКИЙ ФИЛЬТР. Корпус записей есть у СЕМИ языков
 * (ru pt zh hi de es en). У остальных пяти озвученных слов ноль, и жёсткий
 * фильтр оставил бы игру совсем без материала. Поэтому: берём озвученные, а
 * если их не хватает на партию — возвращаемся к полному мешку и играем на
 * системном голосе, как было до записей.
 *
 * ⚠️ ПОРОГ — НЕ КРУГЛОЕ ЧИСЛО. Партия просит `span` слов дважды (`ROUNDS`),
 * потолок span 8 → 16 слов. Втрое больше даёт запасу «невиданного» из чего
 * выбирать хотя бы на три партии подряд; ниже этого мешок сам стал бы
 * источником повторов.
 */
const МИН_ОЗВУЧЕННЫХ = 8 * ROUNDS * 3;

function wordPool(targetLang: string): string[] {
  const все = Array.from(new Set(
    TRANSLATION_VOCAB
      .map((e) => e[targetLang])
      .filter((w): w is string => typeof w === 'string' && w.length > 0),
  ));
  const озвученные = все.filter((w) => voiceUrl(w, targetLang) !== null);
  return озвученные.length >= МИН_ОЗВУЧЕННЫХ ? озвученные : все;
}

export default function ListeningSpanGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const { profile } = useProfile();
  const lvl = usePersistentLevel(GAME_ID);
  const { isPreset, autostart, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка

  const defaultTarget = language === 'en' ? 'es' : 'en';
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', defaultTarget));

  // Указатель записей — заранее, при выборе языка: сетевой запрос внутри пробы
  // вносил бы задержку в межсловный интервал, а он здесь сам измеряемый параметр.
  useEffect(() => { ensureVoiceIndex(targetLang).catch(() => {}); }, [targetLang]);

  const [phase, setPhase] = useState<GamePhase>('config');
  // Правила уровня: показать при первом входе и дать перечитать по бейджу.
  /**
   * 🔴 ПРАВИЛА ПОКАЗЫВАЮТСЯ ДО КРУГА, А НЕ В МИГ ВСПОМИНАНИЯ.
   *
   * 📍 ОТЧЁТ ВАЛИ 06.09.2026, дословно: «вначале вылезла сетка с теми
   * квадратами, которые нужно запомнить, и пока я их запоминала, сетка
   * исчезла, а вместо пустых квадратов появилась расшифровка… естественно, я
   * забыла всю сетку. Как можно вначале показать сетку, дать время на
   * запоминание, а потом окно с правилами?»
   *
   * Она права по механике, и это не мелочь: карточка правил в фазе
   * вспоминания СТИРАЕТ то, что человек держит в рабочей памяти, — ровно то,
   * что упражнение и меряет. Замер 06.09.2026: так было в ДЕВЯТИ играх на
   * память сразу (`recall`, `input`, `eq`, `memorize`).
   *
   * Правильный момент — экран настройки: правило прочитано ДО старта, а круг
   * идёт без единой помехи.
   */
  const levelRules = useLevelRules('listening_span', lvl.level, LISTENINGSPAN_RULES, phase === 'config');
  const [clearedPassed, setClearedPassed] = useState(true);
  const [round, setRound] = useState(1);
  const [errors, setErrors] = useState(0);
  const [spoken, setSpoken] = useState<string[]>([]);     // услышанные (в порядке озвучки)
  const [grid, setGrid] = useState<string[]>([]);         // spoken + дистракторы вперемешку
  const [picked, setPicked] = useState<number[]>([]);     // индексы grid в порядке тапов
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const [spokenIdx, setSpokenIdx] = useState(0);          // номер озвучиваемого слова (1-based)
  const [elapsedTime, setElapsedTime] = useState(0);

  const runIdRef = useRef(0);          // guard асинхронного цикла озвучки
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const levelRef = useRef(1);
  const spanRef = useRef(3);
  const gapRef = useRef(700);
  const holdRef = useRef(0);
  const similarRef = useRef(0);
  /** Идёт удержание: слова кончились, ввод ещё закрыт. Ось 3, см. levelParams. */
  const [holding, setHolding] = useState(false);
  const tlRef = useRef(defaultTarget);
  const roundRef = useRef(1);
  const errorsRef = useRef(0);
  const lockRef = useRef(false);       // блок тапов после конца раунда

  // уход с экрана посреди озвучки: гасим TTS и инвалидируем цикл
  useEffect(() => () => {
    runIdRef.current = -1;
    ttsCancel();
    if (timerRef.current) clearInterval(timerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  // восстановить сохранённый целевой язык (вне пресета зарядки)
  useEffect(() => {
    if (isPreset) return;
    AsyncStorage.getItem(TARGETLANG_KEY).then((v) => {
      if (v && v !== language && hasVocab(v)) setTargetLang(v);   // забытый язык без словаря не воскрешаем
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // авто-старт из зарядки
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  const chooseTargetLang = (code: string) => {
    setTargetLang(code);
    AsyncStorage.setItem(TARGETLANG_KEY, code).catch(() => {});
  };

  const ttsBlock = useTtsBlock(targetLang);
  /** Играть можно, только если молчать не по чему: и голос есть, и звук включён. */
  const voiceOk = ttsBlock === null;

  const startGame = () => {
    const tl = targetLang === language ? defaultTarget : targetLang;
    if (!ttsAvailable(tl)) { setPhase('config'); return; }
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    spanRef.current = p.span;
    gapRef.current = p.gapMs;
    holdRef.current = p.holdMs;
    similarRef.current = isPreset ? 0 : p.similarShare;
    tlRef.current = tl;
    roundRef.current = 1;
    errorsRef.current = 0;
    setRound(1);
    setErrors(0);
    setElapsedTime(0);
    const start = gameNow();
    startTimeRef.current = start;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 200);
    beginRound();
  };

  const beginRound = async () => {
    const span = spanRef.current;
    /**
     * 🔴 СНАЧАЛА ТО, ЧЕГО ЧЕЛОВЕК ЕЩЁ НЕ СЛЫШАЛ. Раньше был обычный `shuffle` без
     * памяти между сессиями, а общий словарь — 189 слов на ЧЕТЫРЕ игры. Замер
     * (симуляция 300 прогонов): за 10 сессий уже слышанных 13%, за 30 сессий 35%.
     * Разбор и цифры соседей — в шапке `services/freshPool`.
     */
    const pool = wordPool(tlRef.current);
    const seen = await readSeen('listening_span', profile?.id);
    const res = pickFreshFrom(pool, span, seen, (w) => w);
    await writeSeen('listening_span', profile?.id, res.seen);
    const spokenPick = res.picked;
    // Ось 7: отвлекающие тем похожее, чем выше уровень. Доля из lvlParams, не из воздуха.
    const words = [...spokenPick, ...подобратьОтвлекающие(pool, spokenPick, span, similarRef.current)];
    const spokenWords = words.slice(0, span);
    setSpoken(spokenWords);
    setGrid(shuffle(words));
    setPicked([]);
    setWrongIdx(null);
    lockRef.current = false;
    setSpokenIdx(0);
    setHolding(false);
    setPhase('listen');

    const myRun = ++runIdRef.current;
    (async () => {
      for (let i = 0; i < spokenWords.length; i++) {
        if (runIdRef.current !== myRun) return;
        setSpokenIdx(i + 1);
        await speakSequence([spokenWords[i]], tlRef.current, gapRef.current);
      }
      if (runIdRef.current !== myRun) return;
      /**
       * 🔴 УДЕРЖАНИЕ. Ввод открывается не сразу: ряд надо додержать в уме.
       * ⚠️ Прогон партии сверяем ПОСЛЕ паузы тоже — за это время человек мог
       * выйти из игры, и открывать ввод было бы некуда.
       */
      if (holdRef.current > 0) {
        setHolding(true);
        await new Promise((r) => setTimeout(r, holdRef.current));
        if (runIdRef.current !== myRun) return;
        setHolding(false);
      }
      setPhase('recall');
    })();
  };

  const handleTap = (gridIdx: number) => {
    if (lockRef.current || picked.includes(gridIdx)) return;
    const expected = spoken[picked.length];
    if (grid[gridIdx] === expected) {
      sndCorrect();
      const next = [...picked, gridIdx];
      setPicked(next);
      if (next.length >= spoken.length) roundDone(true);
    } else {
      // неверный следующий элемент (не то слово ИЛИ не тот порядок) → ошибка раунда
      sndWrong();
      setWrongIdx(gridIdx);
      roundDone(false);
    }
  };

  const roundDone = (success: boolean) => {
    lockRef.current = true;
    const errsSoFar = errorsRef.current + (success ? 0 : 1);
    errorsRef.current = errsSoFar;
    setErrors(errsSoFar);
    fbTimerRef.current = setTimeout(() => {
      if (roundRef.current < ROUNDS) {
        roundRef.current += 1;
        setRound(roundRef.current);
        beginRound();
      } else {
        finishGame(errsSoFar);
      }
    }, success ? 600 : 1000);
  };

  const finishGame = async (totalErrors: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const passed = totalErrors <= 1;   // оба раунда, суммарно ≤1 ошибка
    if (passed && !isPreset) lvl.reach(levelRef.current + 1);
    if (!passed && !isPreset) lvl.fail();   // симметрия лестницы: три провала подряд → −1 уровень
    if (isPreset) {
      setPhase(passed ? 'cleared' : 'result');
    } else {
      // непрерывный поток: провал уровня → баннер «почти, ещё раз», не тупик
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: GAME_ID,
        score: Math.max(0, spanRef.current * 250 - totalErrors * 50),
        time_seconds: finalTime,
        difficulty: `L${levelRef.current}`,
        mode: `${spanRef.current}-span · ${tlRef.current}`,
        errors: totalErrors,
        details: { level: levelRef.current, span: spanRef.current, errors: totalErrors, target_lang: tlRef.current },
      });
    } catch (err) { console.error(err); }
  };


  const renderConfig = () => (
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="ear" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('listeningSpan')}</Text>
        <Text style={styles.configDesc}>
          {t('lspanConfigDesc')}
        </Text>
      </LinearGradient>

      <LevelProgressMap bestLevel={lvl.best} gameId={GAME_ID} currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
          {t('lspanLvlAuto').replace('{n}', String(lvl.level)).replace('{s}', String(levelParams(lvl.level).span))}
        </Text>
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('langToTrain')}</Text>
        <View style={styles.optionButtons}>
          {/*
                🔴 ПРЕДЛАГАЕМ ТОЛЬКО ТЕ ЯЗЫКИ, НА КОТОРЫХ ЕСТЬ СЛОВАРЬ.
                Раньше выбор строился из всех двенадцати языков приложения, а
                словарь покрывает семь: на французском игра запускалась и
                оказывалась пустой — «выбери 1-е из 0», а в зарядке экран
                оставался мёртвым навсегда, без шапки и без «назад».
                Список выводится ИЗ САМОГО словаря, вписать его руками нельзя.
              */}
              {LANGUAGES.filter((l) => l.code !== language && hasVocab(l.code)).map((l) => (
            <TouchableOpacity
              accessibilityRole="button"
              key={l.code}
              style={[
                styles.langButton,
                targetLang === l.code
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => chooseTargetLang(l.code)}
            >
              <Text style={[styles.langButtonText, { color: targetLang === l.code ? '#FFFFFF' : colors.text }]}>
                {l.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {!voiceOk && (
          <View style={styles.voiceWarn}>
            <Ionicons name="volume-mute" size={18} color="#b45309" />
            <Text style={styles.voiceWarnText}>
              {t(ttsBlock === 'sound-off' ? 'voiceSoundOff' : 'voiceMissing')}
            </Text>
          </View>
        )}
      </View>

    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  // игровые фазы (озвучка и recall) — на едином каркасе GameShell; сетка recall в скролл-поле
  if (phase === 'listen' || phase === 'recall') {
    return (
      <GameShell
        title={t('listeningSpan')}
        onBack={() => goBackOrHome()}
        scrollableField={phase === 'recall'}
        /** Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4). */
        hud={[
          { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: levelRef.current },
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${ROUNDS}`, pop: true },
        ]}
        stats={
          <View style={styles.statsRow}>
            {/* Правило уровня — объяснение механики, а не счётчик: остаётся в шапке. */}
            <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />
          </View>
        }
      >
        {phase === 'listen' ? (
          <View style={styles.fieldCol}>
            <View style={[styles.listenBox, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
              <Text style={styles.listenEmoji}>{holding ? '🧠' : '🔊'}</Text>
              <Text style={[styles.listenTitle, { color: colors.text }]}>
                {holding ? t('memorize') : t('lspanListening')}
              </Text>
              <Text style={[styles.listenCounter, { color: colors.textSecondary }]}>
                {t('lspanWord')} {Math.max(1, spokenIdx)} / {spanRef.current}
              </Text>
            </View>
            <View style={styles.dotsRow}>
              {Array.from({ length: spanRef.current }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: i < spokenIdx ? GRADIENT[0] : colors.border },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {t('lspanMemorizeHint')}
            </Text>
          </View>
        ) : (
          <View style={styles.fieldCol}>
            <Text style={[styles.recallTitle, { color: colors.text }]}>
              {t('lspanRecallTitle')}
            </Text>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {t('lspanRecallHint').replace('{i}', String(picked.length + 1)).replace('{n}', String(spoken.length))}
            </Text>
            <View style={styles.wordGrid}>
              {grid.map((w, i) => {
                const orderPos = picked.indexOf(i);
                const isPicked = orderPos >= 0;
                const isWrong = wrongIdx === i;
                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    key={`${w}-${i}`}
                    style={[
                      styles.wordChip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      isPicked && { backgroundColor: GRADIENT[0], borderColor: GRADIENT[0] },
                      isWrong && { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
                    ]}
                    onPress={() => handleTap(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.wordChipText, { color: isPicked || isWrong ? '#FFF' : colors.text }]}>{w}</Text>
                    {isPicked && (
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderBadgeText}>{orderPos + 1}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
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
        <Text style={[styles.title, { color: colors.text }]}>{t('listeningSpan')}</Text>
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
          score={Math.max(0, spanRef.current * 250 - errors * 50)}
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
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionHint: { fontSize: 13, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  langButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  langButtonText: { fontSize: 13, fontWeight: '600' },
  voiceWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    borderRadius: 8, backgroundColor: '#fef3c7',
  },
  voiceWarnText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#b45309' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 18 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 13, fontWeight: '700' },
  listenBox: {
    width: 220, height: 220, borderRadius: 24, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20,
  },
  listenEmoji: { fontSize: 56 },
  listenTitle: { fontSize: 20, fontWeight: '800' },
  listenCounter: { fontSize: 14, fontWeight: '600' },
  dotsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  recallTitle: { fontSize: 22, fontWeight: '800' },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 480, width: '100%' },
  wordChip: {
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1,
    minWidth: 96, alignItems: 'center',
  },
  wordChipText: { fontSize: 16, fontWeight: '700' },
  orderBadge: {
    position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center',
  },
  orderBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
});
