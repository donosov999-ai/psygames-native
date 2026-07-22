/**
 * Анаграммы — собери слово из перемешанных букв.
 *
 * Уровни (persist, по паттерну cpt/simon): ручной селектор длины слова заменён на
 * usePersistentLevel('anagrams') + levelParams. Ось усложнения:
 *   - длина слова растёт 4 → 9 букв (бывший ручной селектор);
 *   - с 7-го уровня появляется лимит времени НА СЛОВО и сжимается 90с → 30с
 *     (не успел собрать = ошибка, слово закрывается само).
 * Проход уровня: ≥80% слов собрано верно за раунд → LevelCleared (авто-поток).
 * Селекторы ПРАВИЛА остаются: тема слов и тумблер подсказок.
 * Словники: RU/EN курированные банки + anagramWords.json + TRANSLATION_VOCAB;
 * не-ru/en языки получают английский набор (см. wordsBank) — уровни от языка не зависят.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndPlace } from '@/src/services/feedback';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import ANAGRAM_DICT from '@/src/constants/anagramWords.json';
import {
  type WordEntry,
  ANAGRAM_THEMES,
  RU_WORDS_4, RU_WORDS_5, RU_WORDS_6, RU_WORDS_7, RU_WORDS_8, RU_WORDS_9,
  EN_WORDS_4, EN_WORDS_5, EN_WORDS_6, EN_WORDS_7, EN_WORDS_8, EN_WORDS_9,
} from '@/src/data/anagrams-words';

// только буквы (кириллица/латиница с диакритикой) — без пробелов/дефисов/иероглифов
const LETTER_ONLY = /^[\p{L}]+$/u;

const GRADIENT = ['#ee9ca7', '#ffdde1'];
const ANAGRAM_BENEFITS = [
  { icon: 'language-outline', textKey: 'benefitAnagram1' },
  { icon: 'book-outline', textKey: 'benefitAnagram2' },
  { icon: 'bulb-outline', textKey: 'benefitAnagram3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type WordLen = 4 | 5 | 6 | 7 | 8 | 9;

// Уровень 1..15: длина слова растёт 4→9 (по 2-3 уровня на длину),
// с L7 включается лимит времени на слово и сжимается 90с → 30с.
const LEVEL_LENGTHS: WordLen[] = [4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9, 9];
function levelParams(level: number): { length: WordLen; trials: number; wordSec: number } {
  const L = Math.max(1, level);
  const length = LEVEL_LENGTHS[Math.min(L, 15) - 1];
  const trials = 10;
  const wordSec = L <= 6 ? 0 : Math.max(30, 98 - (L - 6) * 8);   // L7: 90с → L15: 30с
  return { length, trials, wordSec };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function AnagramGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('anagrams');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [clearedPassed, setClearedPassed] = useState(true);   // прошёл/не прошёл — для баннера LevelCleared (passed)
  // length — только для пресетов из зарядки (num('length')); в уровневом режиме перекрывается levelParams
  const [length, setLength] = useState<WordLen>(() => (num('length', 4) as WordLen));
  const [theme, setTheme] = useState<string>('all');   // выбранная тема слов (all = без фильтра) — правило, остаётся
  const [totalTrials, setTotalTrials] = useState(10);
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState('');
  const [hint, setHint] = useState('');     // подсказка-намёк на слово
  const [hintsOn, setHintsOn] = useState(true);   // тумблер подсказки (выкл = хардкор, только буквы) — правило, остаётся
  const [letters, setLetters] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [hintUses, setHintUses] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [wordSec, setWordSec] = useState(0);        // лимит на слово (0 = без лимита) — для отображения
  const [wordLeft, setWordLeft] = useState(0);      // сколько секунд осталось на текущее слово

  // Рефы — параметры уровня и счётчики раунда живут вне ре-рендеров: цепочка
  // setTimeout (слово → пауза → следующее / дедлайн) видела бы устаревший state
  // (паттерн cpt/simon).
  const levelRef = useRef(1);
  const lengthRef = useRef<WordLen>(4);
  const trialsRef = useRef(10);
  const wordSecRef = useRef(0);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const hintUsesRef = useRef(0);
  const wordDoneRef = useRef(false);            // слово закрыто (собрано или таймаут) — клики/дедлайн игнорим
  const wordDeadlineAtRef = useRef(0);          // Date.now() дедлайна текущего слова (0 = нет лимита)
  const startTimeRef = useRef(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usedRef = useRef<Set<string>>(new Set());   // показанные в сессии слова — без повторов
  // v1.112.0: честный зачёт — из тех же букв может сложиться ДРУГОЕ валидное слово
  // (КОТ↔ТОК): принимаем любое слово банка этой длины, не только загаданное.
  const validWordsRef = useRef<Set<string>>(new Set());
  const validKeyRef = useRef('');

  const clearAllTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
  };

  useEffect(() => () => clearAllTimers(), []);

  const wordsBank = (len: WordLen, th: string): WordEntry[] => {
    const isRu = language === 'ru';
    const cl = isRu ? 'ru' : 'en';       // язык слова
    // курированные банки (с осмысленными подсказками-определениями); не-ru/en → английский набор
    const curated: WordEntry[] = isRu
      ? (len === 4 ? RU_WORDS_4 : len === 5 ? RU_WORDS_5 : len === 6 ? RU_WORDS_6 : len === 7 ? RU_WORDS_7 : len === 8 ? RU_WORDS_8 : RU_WORDS_9)
      : (len === 4 ? EN_WORDS_4 : len === 5 ? EN_WORDS_5 : len === 6 ? EN_WORDS_6 : len === 7 ? EN_WORDS_7 : len === 8 ? EN_WORDS_8 : EN_WORDS_9);
    // Мерж: курированный банк + словарь Дениса (anagramWords.json, с темами) + корпус TRANSLATION_VOCAB.
    // Дедуп по слову; запись из словаря (с темой) приоритетнее. Подсказка корпуса = КАТЕГОРИЯ, не перевод.
    const map = new Map<string, WordEntry>();
    for (const e of curated) map.set(e.w.toLowerCase(), { w: e.w, h: e.h });
    const dict = (((ANAGRAM_DICT as any)[cl] || {})[String(len)] as WordEntry[]) || [];
    for (const e of dict) map.set(e.w.toLowerCase(), { w: e.w, h: e.h, t: e.t });
    for (const e of TRANSLATION_VOCAB) {
      const w = (e as any)[cl];
      if (!w || [...w].length !== len || !LETTER_ONLY.test(w)) continue;
      const k = w.toLowerCase();
      if (map.has(k)) continue;
      const catLabel = (e as any).cat ? t(`catVocab_${(e as any).cat}` as any) : '';
      map.set(k, { w, h: catLabel || '' });
    }
    let all = [...map.values()];
    if (th && th !== 'all') all = all.filter((e) => e.t === th);   // тема → только размеченные слова словаря
    return all;
  };

  const newRound = () => {
    const len = lengthRef.current;
    let bank = wordsBank(len, theme);
    if (bank.length < 4) bank = wordsBank(len, 'all');   // мало слов этой темы на этой длине → вся длина
    // сет валидных слов для зачёта альтернативных анаграмм — по ВСЕМ темам этой длины
    const vKey = `${len}_${language}`;
    if (validKeyRef.current !== vKey) {
      validWordsRef.current = new Set(wordsBank(len, 'all').map((e) => e.w.toUpperCase()));
      validKeyRef.current = vKey;
    }
    let avail = bank.filter((e) => !usedRef.current.has(e.w));
    if (avail.length === 0) { usedRef.current.clear(); avail = bank; }   // банк исчерпан → сброс
    const entry = avail[Math.floor(Math.random() * avail.length)];
    usedRef.current.add(entry.w);
    const w = entry.w.toUpperCase();
    setTarget(w);
    setHint(hintsOn ? entry.h : '');
    let arr = w.split('');
    let attempts = 0;
    do { arr = shuffle(arr); attempts++; } while (arr.join('') === w && attempts < 5);
    setLetters(arr);
    setPicked([]);
    wordDoneRef.current = false;
    // Лимит времени на слово (верхние уровни): не успел = ошибка, слово закрывается само
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (wordSecRef.current > 0) {
      wordDeadlineAtRef.current = Date.now() + wordSecRef.current * 1000;
      setWordLeft(wordSecRef.current);
      deadlineTimerRef.current = setTimeout(() => {
        if (wordDoneRef.current) return;
        wordDoneRef.current = true;
        errorsRef.current += 1;
        setErrors(errorsRef.current);
        nextTimerRef.current = setTimeout(advance, 400);
      }, wordSecRef.current * 1000);
    } else {
      wordDeadlineAtRef.current = 0;
      setWordLeft(0);
    }
  };

  const advance = () => {
    if (roundRef.current >= trialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    newRound();
  };

  const startGame = () => {
    if (isPreset) {
      // пресет из зарядки: ручная длина из URL-параметров, без лимита времени; reach/fail не трогаем
      levelRef.current = lvl.level;
      lengthRef.current = length;
      trialsRef.current = 10;
      wordSecRef.current = 0;
      setTotalTrials(10);
      setWordSec(0);
    } else {
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      lengthRef.current = p.length;
      trialsRef.current = p.trials;
      wordSecRef.current = p.wordSec;
      setLength(p.length);
      setTotalTrials(p.trials);
      setWordSec(p.wordSec);
    }
    hitsRef.current = 0; errorsRef.current = 0; hintUsesRef.current = 0;
    roundRef.current = 1;
    setHits(0); setErrors(0); setRound(1); setHintUses(0);
    usedRef.current.clear();
    setElapsedTime(0);
    setPhase('playing');
    const start = Date.now();
    startTimeRef.current = start;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
      if (wordDeadlineAtRef.current > 0) {
        setWordLeft(Math.max(0, Math.ceil((wordDeadlineAtRef.current - Date.now()) / 1000)));
      }
    }, 100);
    newRound();
  };

  const finish = async () => {
    clearAllTimers();
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = trialsRef.current > 0 ? h / trialsRef.current : 0;
    // Проход уровня: ≥80% слов собрано верно (таймаут по лимиту = ошибка)
    const passed = !isPreset && accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');   // пресет/зарядка — экран статистики, уровень не трогаем
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');   // непрерывный поток: и проход, и провал → баннер LevelCleared (при провале авто-рестарт того же уровня)
    }
    try {
      await saveSession({
        game_type: 'anagrams',
        score: h * 100,
        time_seconds: finalTime,
        difficulty: `${lengthRef.current} letters`,
        mode: isPreset ? `${trialsRef.current}t` : `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          hits: h,
          errors: e,
          trials: trialsRef.current,
          accuracy: Math.round(accuracy * 100),
          hint_uses: hintUsesRef.current,
          ...(wordSecRef.current > 0 ? { word_sec: wordSecRef.current } : {}),
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleLetterPress = (idx: number) => {
    if (picked.includes(idx) || wordDoneRef.current) return;
    sndPlace();
    const newPicked = [...picked, idx];
    setPicked(newPicked);
    if (newPicked.length === target.length) {
      wordDoneRef.current = true;
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
      const guess = newPicked.map((i) => letters[i]).join('');
      // Любая валидная анаграмма из этих букв = зачёт (буквы те же — игрок собрал их все)
      const correct = guess === target || validWordsRef.current.has(guess);
      if (correct) { hitsRef.current += 1; setHits(hitsRef.current); hapticSuccess(); }
      else { errorsRef.current += 1; setErrors(errorsRef.current); hapticError(); }
      nextTimerRef.current = setTimeout(advance, 700);
    }
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="language" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('anagrams')}</Text>
          <Text style={styles.configDesc}>{t('anagramsDesc')}</Text>
        </LinearGradient>

        <LevelProgressMap gameId="anagrams" currentLevel={lvl.level} colors={colors} language={language} />
        {/* Карточка уровня: параметры + видимый критерий прохода + сброс ↺1 (паттерн simon/cpt) */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.trials} слов · ${p.length} букв${p.wordSec > 0 ? ` · ${p.wordSec} с на слово` : ' · без лимита времени'}`
              : `${p.trials} words · ${p.length} letters${p.wordSec > 0 ? ` · ${p.wordSec} s per word` : ' · no time limit'}`}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? 'Проход уровня: ≥80% слов собрано верно (не успел по времени = ошибка)'
              : 'To pass: ≥80% words solved correctly (running out of time counts as an error)'}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Тема' : 'Theme'}</Text>
          <View style={styles.optionButtons}>
            {ANAGRAM_THEMES.map((th) => (
              <TouchableOpacity key={th.k} style={[styles.modeButton, theme === th.k
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setTheme(th.k)}>
                <Text style={[styles.modeButtonText, { color: theme === th.k ? '#3f2b96' : colors.text }]}>
                  {th.emoji} {language === 'ru' ? th.ru : th.en}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('btn_hint')}</Text>
          <View style={styles.optionButtons}>
            {([true, false] as const).map((on) => (
              <TouchableOpacity key={String(on)} style={[styles.modeButton, hintsOn === on
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setHintsOn(on)}>
                <Text style={[styles.modeButtonText, { color: hintsOn === on ? '#FFF' : colors.text }]}>
                  {on ? t('label_on') : t('label_off')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={[styles.startBtnText, { color: '#3f2b96' }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // Подсказка: автоматически открыть следующую правильную букву
  const revealHint = () => {
    if (wordDoneRef.current) return;
    const nextChar = target[picked.length];
    if (nextChar === undefined) return;
    const idx = letters.findIndex((ch, i) => ch === nextChar && !picked.includes(i));
    if (idx >= 0) {
      hintUsesRef.current += 1;
      setHintUses((h) => h + 1);
      handleLetterPress(idx);
    }
  };

  // playing-фаза — на едином каркасе GameShell (кнопки Подсказка/Сброс прибиты к низу)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('anagrams')}
        onBack={() => { clearAllTimers(); goBackOrHome(); }}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
            {wordSec > 0 && (
              <Text style={[styles.statText, { color: wordLeft <= 10 ? '#f43f5e' : colors.text }]}>⏱{wordLeft}</Text>
            )}
          </View>
        }
        toolbar={
          <View style={styles.actionsRow}>
            {/* 💡 кнопка-подсказка только когда тумблер ВКЛ — иначе «хардкор» подсказку не выключал */}
            {hintsOn && (
              <TouchableOpacity onPress={revealHint} style={[styles.clearBtn, { flex: 1, backgroundColor: '#fbbf24' }]}>
                <Text style={[styles.clearText, { color: '#1a1a1a' }]}>💡 {t('btn_hint')}{hintUses > 0 ? ` (${hintUses})` : ''}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setPicked([])} style={[styles.clearBtn, { flex: 1, backgroundColor: colors.surface }]}>
              <Text style={[styles.clearText, { color: colors.text }]}>{t('clear')}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('anagramHint')}</Text>
          {/* 💡 Hint banner — короткий намёк на слово */}
          {hint ? (
            <View style={[styles.hintBanner, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
              <Text style={[styles.hintBannerEmoji]}>💡</Text>
              <Text style={[styles.hintBannerText, { color: colors.text }]}>{hint}</Text>
            </View>
          ) : null}
          <View style={styles.pickedRow}>
            {Array.from({ length: target.length }).map((_, i) => (
              <View key={i} style={[styles.pickedSlot, { borderColor: colors.textSecondary, backgroundColor: colors.surface }]}>
                <Text style={[styles.pickedLetter, { color: colors.text }]}>
                  {picked[i] !== undefined ? letters[picked[i]] : ''}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.lettersRow}>
            {letters.map((l, i) => (
              <TouchableOpacity
                key={i}
                disabled={picked.includes(i)}
                onPress={() => handleLetterPress(i)}
                activeOpacity={0.8}
                style={[
                  styles.letterBtn,
                  {
                    backgroundColor: picked.includes(i) ? colors.surface : GRADIENT[0],
                    opacity: picked.includes(i) ? 0.3 : 1,
                  },
                ]}
              >
                <View style={styles.tileShine} pointerEvents="none" />
                <Text style={[styles.letterText, { color: '#3f2b96' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('anagrams')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="anagrams" icon="language" gradient={GRADIENT as [string, string]}
          skillKey="skillVerbal" descriptionKey="anagramsIntroDesc"
          benefits={ANAGRAM_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared gameId="anagrams" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult score={hits * 100} time={elapsedTime} errors={errors}
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
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0 },  // крупный шрифт: заголовок ужимается между «назад» и спейсером
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
  fieldCol: { alignItems: 'center', gap: 12 },
  actionsRow: { flexDirection: 'row', gap: 10, flex: 1, maxWidth: 360 },
  statsRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },  // крупный шрифт: 4 стата переносятся, а не уезжают за край
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    maxWidth: 360,
  },
  hintBannerEmoji: { fontSize: 20, flexShrink: 0 },  // иконка рядом с текстом не сжимается
  hintBannerText: { fontSize: 14, fontWeight: '600', flex: 1, minWidth: 0 },  // крупный шрифт: текст переносится внутри баннера, а не распирает его
  // RTL-пин: слоты собираемого слова (ru/en) заполняются слева направо — иначе слово читается задом наперёд
  pickedRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', writingDirection: 'ltr' },
  pickedSlot: { width: 44, height: 54, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  pickedLetter: { fontSize: 22, fontWeight: '700' },
  lettersRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 360 },
  letterBtn: { width: 56, height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tileShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '46%', backgroundColor: 'rgba(255,255,255,0.28)' },
  letterText: { fontSize: 24, fontWeight: '800' },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(128,128,128,0.4)', alignItems: 'center' },
  clearText: { fontSize: 13, fontWeight: '600' },
});
