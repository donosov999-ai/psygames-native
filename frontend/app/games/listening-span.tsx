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
import { speakSequence, ttsAvailable, ttsCancel } from '@/src/services/tts';
import { useTtsAvailable, useTtsBlock } from '@/src/hooks/useTtsAvailable';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import { TRANSLATION_VOCAB , hasVocab } from '@/src/constants/translationVocab';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { pickFreshFrom, readSeen, writeSeen } from '@/src/services/freshPool';

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
const LISTENINGSPAN_RULES: LevelRule[] = [
  { key: 'span8', fromLevel: 6 },   // lr_listening_span_span8_*
];

type GamePhase = 'config' | 'listen' | 'recall' | 'cleared' | 'result';

// Лесенка: L1 = 3 слова → потолок 8; пауза между словами 700мс → 500мс с ростом уровня.
function levelParams(level: number): { span: number; gapMs: number } {
  const span = Math.min(8, 2 + level);
  const gapMs = Math.max(500, 700 - (level - 1) * 25);
  return { span, gapMs };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Все уникальные слова целевого языка из общего словаря — мешок, из которого берём. */
function wordPool(targetLang: string): string[] {
  const pool = TRANSLATION_VOCAB
    .map((e) => e[targetLang])
    .filter((w): w is string => typeof w === 'string' && w.length > 0);
  return Array.from(new Set(pool));
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

  const [phase, setPhase] = useState<GamePhase>('config');
  // Правила уровня: показать при первом входе и дать перечитать по бейджу.
  const levelRules = useLevelRules('listening_span', lvl.level, LISTENINGSPAN_RULES, phase === 'recall');
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
    const res = pickFreshFrom(pool, span * 2, seen, (w) => w);
    await writeSeen('listening_span', profile?.id, res.seen);
    const words = res.picked;   // span услышанных + span дистракторов
    const spokenWords = words.slice(0, span);
    setSpoken(spokenWords);
    setGrid(shuffle(words));
    setPicked([]);
    setWrongIdx(null);
    lockRef.current = false;
    setSpokenIdx(0);
    setPhase('listen');

    const myRun = ++runIdRef.current;
    (async () => {
      for (let i = 0; i < spokenWords.length; i++) {
        if (runIdRef.current !== myRun) return;
        setSpokenIdx(i + 1);
        await speakSequence([spokenWords[i]], tlRef.current, gapRef.current);
      }
      if (runIdRef.current !== myRun) return;
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
          /*
                🔴 ПРЕДЛАГАЕМ ТОЛЬКО ТЕ ЯЗЫКИ, НА КОТОРЫХ ЕСТЬ СЛОВАРЬ.
                Раньше выбор строился из всех двенадцати языков приложения, а
                словарь покрывает семь: на французском игра запускалась и
                оказывалась пустой — «выбери 1-е из 0», а в зарядке экран
                оставался мёртвым навсегда, без шапки и без «назад».
                Список выводится ИЗ САМОГО словаря, вписать его руками нельзя.
              */
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

      <TouchableOpacity
        accessibilityRole="button" style={[styles.startBtn, !voiceOk && { opacity: 0.4 }]} onPress={startGame} disabled={!voiceOk}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  // игровые фазы (озвучка и recall) — на едином каркасе GameShell; сетка recall в скролл-поле
  if (phase === 'listen' || phase === 'recall') {
    return (
      <GameShell
        title={t('listeningSpan')}
        onBack={() => goBackOrHome()}
        scrollableField={phase === 'recall'}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>
              {t('label_level_short')}{levelRef.current} · {t('round')} {round}/{ROUNDS}
            </Text>
            {phase === 'recall' && <Text style={[styles.statText, { color: '#f43f5e' }]}>{t('hud_errors')} {errors}</Text>}
          </View>
        }
      >
        {phase === 'listen' ? (
          <View style={styles.fieldCol}>
            <View style={[styles.listenBox, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
              <Text style={styles.listenEmoji}>🔊</Text>
              <Text style={[styles.listenTitle, { color: colors.text }]}>{t('lspanListening')}</Text>
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
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionHint: { fontSize: 13, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
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
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
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
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  recallTitle: { fontSize: 22, fontWeight: '800' },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 480 },
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
