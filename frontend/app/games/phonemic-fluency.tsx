/* psygames-game-phonemic-fluency · VER 1 · 19.08.2026 */
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
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { saveSession } from '@/src/services/api';
import { sndTimerTick, sndTimerEnd } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import {
  phonemicLetterPool, phonemicScriptFor, phonemicScriptIsFallback,
  type PhonemicScript,
} from '@/src/services/phonemicFluency';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#16a085', '#f4d03f'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.51 (норма AA 4.5), стало 5.06.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const FLU_BENEFITS = [
  { icon: 'chatbubbles-outline',  textKey: 'benefitFlu1' },
  { icon: 'flash-outline',         textKey: 'benefitFlu2' },
  { icon: 'school-outline',        textKey: 'benefitFlu3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

export default function PhonemicFluencyGame() {
  const { colors } = useTheme();
  const { t, language, ready: languageReady } = useLanguage() as any;
  /**
   * СЧЁТЧИК ПРОХОЖДЕНИЙ, не ступень сложности.
   *
   * COWAT — стандартный тест: буква берётся из нормативного набора (F/A/S по-английски,
   * К/Л/М/П/С по-русски) и пишется в сессию именно ради сравнимости. «Буквы посложнее»
   * как ступени увели бы человека с нормативного набора, и его собственные прошлые
   * результаты перестали бы сравниваться — при том, что счётчик слов внешне продолжил
   * бы работать. Тихая порча данных, которую заметили бы через месяцы.
   */
  const runs = usePersistentLevel('phonemic_fluency');
  const router = useRouter();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [duration, setDuration] = useState<60 | 90 | 120>(() => (num('duration', 60) as 60 | 90 | 120));
  const [letter, setLetter] = useState<string>('');
  const [autoPickLetter, setAutoPickLetter] = useState(true);

  const [input, setInput] = useState('');
  const [words, setWords] = useState<{word: string, ts: number, valid: boolean, reason?: string}[]>([]);
  /**
   * 🔴 СЧЁТ ВСЕГДА БЫЛ НУЛЁМ, И ВОТ ПОЧЕМУ. Партию заканчивает ТАЙМЕР, а его
   * колбэк создан в момент старта и держит `words` таким, каким тот был тогда —
   * пустым. Сколько бы слов человек ни назвал, в итог уходило ноль.
   * Тот же класс, что у n-back с устаревшим замыканием.
   */
  const wordsRef = useRef<{word: string, ts: number, valid: boolean, reason?: string}[]>([]);
  const [remaining, setRemaining] = useState(60);

  const startTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const letterPool = phonemicLetterPool(language);

  const startGame = () => {
    const L = autoPickLetter
      ? letterPool[Math.floor(Math.random() * letterPool.length)]
      : (letter || letterPool[0]);
    setLetter(L);
    setWords([]);
    setInput('');
    setRemaining(duration);
    setPhase('playing');
    startTimeRef.current = gameNow();
    let lastSec: number = duration;
    intervalRef.current = setInterval(() => {
      const left = duration - Math.floor((gameNow() - startTimeRef.current) / 1000);
      setRemaining(Math.max(0, left));
      if (left !== lastSec) { lastSec = left; if (left > 0 && left <= 5) sndTimerTick(); }   // SND-T: тик последних 5с
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        sndTimerEnd();   // SND-T: «время вышло»
        finish();
      }
    }, 200);
  };
  // LanguageProvider стартует с EN и затем асинхронно читает RU/другой язык.
  // Раньше COWAT успевал выбрать латинскую букву, а валидировал уже кириллицу:
  // серия формально шла, но ни одно русское слово не могло быть принято.
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && languageReady && runs.loaded, () => startGame());
  /**
   * ⚠️ ПИСЬМЕННОСТЬ ПРИХОДИТ ИЗ ОДНОГО МЕСТА (`phonemicScriptFor`) — той же
   * функции, по которой выбрана буква задания. Раньше буква выбиралась в
   * сервисе, а проверка спрашивала «язык === ru?» здесь: для французского буква
   * выходила кириллической, проверка латинской, и принять слово было НЕЛЬЗЯ.
   */
  const isValidWord = (raw: string, letter: string, lang: PhonemicScript): { valid: boolean; reason?: string } => {
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
    const ts = gameNow();
    let result = isValidWord(raw, letter, phonemicScriptFor(language));
    let valid = result.valid;
    let reason: string | undefined = result.reason;
    if (valid && wordsRef.current.some(w => w.word === raw && w.valid)) {
      valid = false;
      reason = 'repetition';
    }
    setWords(prev => { const next = [...prev, { word: raw, ts, valid, reason }]; wordsRef.current = next; return next; });
  };

  const finish = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('result');

    const said = wordsRef.current;   // ← из ref, а не из состояния: таймер видит устаревшее
    const validWords = said.filter(w => w.valid);
    const repetitions = said.filter(w => !w.valid && w.reason === 'repetition').length;
    const wrongLetter = said.filter(w => !w.valid && w.reason === 'wrong_letter').length;
    const tooShort = said.filter(w => !w.valid && w.reason === 'too_short').length;

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

    // Подход доводят до конца по таймеру — провалить нельзя. Засчитан завершением.
    const doneRun = runs.level;
    runs.reach(doneRun + 1);
    try {
      // passed отсутствует НАМЕРЕННО (задача e53f4958, группа «провала нет по
      // устройству»): минутная беглость: сколько слов набрал — столько набрал.
      // Поле «всегда true» не несёт бита и портит статистику долей — не врём им.
      await saveSession({
        game_type: 'phonemic_fluency',
        score: validWords.length * 10,
        time_seconds: duration,
        difficulty: `letter-${letter}`,   // машинное значение: от языка интерфейса не зависит (иначе один прогон = две разные строки в статистике)
        mode: `${duration}s`,
        errors: repetitions + wrongLetter + tooShort,
        details: {
          level: doneRun,   // по нему счётчик восстановится, если ключ прогресса потерян
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

  /**
   * 🔴 НАСТРОЙКА В ПРОКРУТКЕ, КНОПКА — В ПРИБИТОЙ ПОЛОСЕ.
   *
   * Замер браузером 02.09.2026 на экране 360×780: «Начать» стояла на отметке 884,
   * то есть НИЖЕ окна, а прокрутки у экрана не было вовсе — просто `View`. На
   * узком телефоне игру нельзя было запустить в принципе: не «неудобно мотать»,
   * а не дотянуться.
   */
  const renderConfig = () => (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="chatbubbles" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('phonemic')}</Text>
        <Text style={styles.configDesc}>{t('phonemicDesc')}</Text>
        {/*
          🔴 ПОДМЕНА ПИСЬМЕННОСТИ НАЗЫВАЕТСЯ ВСЛУХ. Беглость «на букву П» в
          иероглифах, кане, деванагари и арабице не ставится — письменность
          устроена иначе. Задание идёт на латинице, и человек должен знать об
          этом ДО начала, а не гадать, почему его слова не принимаются.
        */}
        {phonemicScriptIsFallback(language) ? (
          <Text style={styles.configDesc}>{t('phonemicScriptFallback')}</Text>
        ) : null}
      </LinearGradient>
      <GameAbout descriptionKey="phonemicIntroDesc" benefits={FLU_BENEFITS} accent={GRADIENT[0]} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('duration')}</Text>
        <View style={styles.optionButtons}>
          {([60, 90, 120] as const).map((d) => (
            <TouchableOpacity
              accessibilityRole="button" key={d} style={[styles.modeButton, duration === d
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDuration(d)}>
              <Text style={[styles.modeButtonText, { color: duration === d ? textOn(GRADIENT[0]) : colors.text }]}>{d}s</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('hud_letter')}</Text>
        <TouchableOpacity
          accessibilityRole="button" onPress={() => setAutoPickLetter(!autoPickLetter)} style={styles.toggleRow}>
          <Ionicons name={autoPickLetter ? 'checkbox' : 'square-outline'} size={20} color={GRADIENT[0]} />
          <Text style={[styles.modeButtonText, { color: colors.text }]}>{t('phonemicAutoPick')}</Text>
        </TouchableOpacity>
        {!autoPickLetter && (
          <View style={styles.optionButtons}>
            {letterPool.slice(0, 8).map((L) => (
              <TouchableOpacity
                accessibilityRole="button" key={L} style={[styles.modeButton, letter === L
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setLetter(L)}>
                <Text style={[styles.modeButtonText, { color: letter === L ? textOn(GRADIENT[0]) : colors.text, fontSize: 16 }]}>{L}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        {t('phonemicRules')}
      </Text>
            <LevelProgressMap bestLevel={runs.best}
        gameId="phonemic_fluency"
        currentLevel={runs.level}
        maxLevel={Math.max(15, runs.level)}
        colors={colors}
        language={language}
        countsRuns
      />
    </ScrollView>
    <GameSetupBar label={t('start')} onStart={startGame}
      colors={GRADIENT as [string, string]} tint={ON_GRAD.color} />
    </>
  );

  const validCount = words.filter(w => w.valid).length;

  // игровая фаза — на едином каркасе GameShell: таймер/счёт/буква в статс-строке;
  // ввод и кнопка «добавить» остаются в поле рядом с клавиатурой (не в нижнем тулбаре)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('phonemic')}
        onBack={() => goBackOrHome()}
        /**
         * Счётчики данными (см. `HudItem`). Буква-стимул остаётся в `stats`: это
         * не счётчик, а само задание, и рисуется оно крупной плашкой.
         */
        hud={[
          { key: 'left', icon: 'time', label: t('timeLeftLabel'), value: `${remaining}${t('secShort')}`, tone: remaining <= 10 ? 'warn' as const : 'accent' as const },
          { key: 'words', icon: 'text', label: t('hud_words'), value: validCount, tone: 'good' as const, pop: true },
        ]}
        stats={
          <View style={styles.statsRow}>
            {null}
            <View style={[styles.letterBox, { borderColor: GRADIENT[0] }]}>
              {/* Подпись к стимулу: без неё в шапке просто висит большая буква */}
              <Text style={[styles.letterCap, { color: colors.textSecondary }]}>{t('hud_letter')}</Text>
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
          <TouchableOpacity
            accessibilityRole="button" style={[styles.addBtn, { backgroundColor: GRADIENT[0] }]} onPress={submitWord}>
            <Text style={[styles.addBtnText, { color: textOn(GRADIENT[0]) }]}>+ {t('phonemicAdd')}</Text>
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
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('phonemic')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      {/* Итог — общим экраном «уровень пройден»: только он пишет звёзды, считает
          серию чистых и тикает глаз-разрядку.

          ⚠️ ТРИ ЗВЕЗДЫ ЗА ЗАВЕРШЁННЫЙ ПОДХОД, А НЕ ЗА РЕЗУЛЬТАТ ТЕСТА. Это
          методика с нормами: оценивай мы попадания, человек начал бы играть «на
          три звезды», а не так, как играл бы, и результат перестал бы что-либо
          мерить. Звезда здесь говорит «дошёл до конца», и это правда. */}
      {phase === 'result' && (
        <LevelCleared
          gameId="phonemic_fluency"
          level={Math.max(1, runs.level - 1)}
          stars={3}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          onContinue={() => setPhase('config')} onStop={() => goBackOrHome()}
          stopKind="exit"   // onStop уводит С ЭКРАНА игры (goBackOrHome), а не к настройкам → подпись «На главную»
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16, minWidth: 48, alignItems: 'center' },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  toggleRow: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16, lineHeight: 18 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { flex: 1, alignSelf: 'stretch', paddingVertical: 8, gap: 14, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24, alignItems: 'center', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '900' },
  letterBox: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  letterBig: { fontSize: 40, fontWeight: '900' },
  letterCap: { fontSize: 10, fontWeight: '700', marginBottom: -2 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  input: { width: '100%', maxWidth: 380, height: 52, paddingHorizontal: 14, fontSize: 18, borderRadius: 10, borderWidth: 1, fontWeight: '600' },
  addBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 16 },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  wordList: { flex: 1, width: '100%', maxWidth: 480, marginTop: 4 },
  wordListInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingBottom: 20, maxWidth: '100%' },
  wordChip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  wordText: { fontSize: 13, fontWeight: '700' },
});
