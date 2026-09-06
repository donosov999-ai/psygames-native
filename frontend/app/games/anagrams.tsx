/* psygames-game-anagrams · VER 1 · 19.08.2026 */
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
  ScrollView, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useWordLanguage } from '@/src/hooks/useWordLanguage';
import { wordLangsFor, WORD_LANG_LABEL } from '@/src/services/wordLanguage';
import { LetterWheel } from '@/src/components/letterWheel/LetterWheel';
import { WordSquareGame } from '@/src/games/anagrams/WordSquareGame';
import { AllWordsGame } from '@/src/games/anagrams/AllWordsGame';
import { CrosswordGame } from '@/src/games/anagrams/CrosswordGame';
import { allWordsCount, allWordsPack } from '@/src/games/anagrams/core/allWords';
import { собратьКольца, ключКольца, лестницаКолец } from '@/src/games/anagrams/core/ring';
import { показатьКорейское } from '@/src/games/anagrams/core/chamo';
import { превьюРежима } from '@/src/games/anagrams/core/modeThumbs';
import { wordPool, wordsOfLength } from '@/src/games/fillwords/core/words';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { sndPlace } from '@/src/services/feedback';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { capPresetByLevel } from '@/src/services/presetCap';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { levelOutcome as levelOutcomeAnagram } from '@/src/services/levelOutcome';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import ANAGRAM_DICT from '@/src/constants/anagramWords.json';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';
import {
  type WordEntry,
  ANAGRAM_THEMES,
  RU_WORDS_4, RU_WORDS_5, RU_WORDS_6, RU_WORDS_7, RU_WORDS_8, RU_WORDS_9,
  EN_WORDS_4, EN_WORDS_5, EN_WORDS_6, EN_WORDS_7, EN_WORDS_8, EN_WORDS_9,
} from '@/src/data/anagrams-words';

// только буквы (кириллица/латиница с диакритикой) — без пробелов/дефисов/иероглифов
const LETTER_ONLY = /^[\p{L}]+$/u;

const GRADIENT = ['#ee9ca7', '#ffdde1'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.26 (норма AA 4.5), стало 7.31.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
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
  const width = useScreenWidth();   // сторона круга букв считается от ширины экрана
  /**
   * 🔴 ЯЗЫК СЛОВ ОТДЕЛЬНО ОТ ЯЗЫКА МЕНЮ. Отчёт Дениса 05.09.2026: «надо
   * добавить выбор языка». Банк слов брался как `language === 'ru'`, и при
   * русском интерфейсе английские анаграммы были недоступны вовсе.
   */
  const { profile } = useProfile();
  const wordLang = useWordLanguage('anagrams', profile?.id, language);
  const router = useRouter();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечер и ночь: ни писка на букву, ни победного звука
  const lvl = usePersistentLevel('anagrams');
  /**
   * 🔴 РЕЖИМ «СЛОВО-КВАДРАТ». Просьба Дениса 06.09.2026 со скриншотами
   * Wordathlon: поле 5×5, по периметру четыре пятибуквенных слова с ОБЩИМИ
   * углами, в центре 3×3 банк из девяти разных букв, из которых собраны все
   * четыре. Устройство и его разбор — в `games/anagrams/core/ring.ts`.
   *
   * ⚠️ Это РЕЖИМ анаграмм, а не отдельная игра: предмет тот же — собрать слово
   * из данных букв, — меняется только форма подачи. Отдельной игрой он завёл бы
   * второй уровень, вторую статистику и второй вход в хабе на ту же механику.
   */
  /**
   * 🔴 РЕЖИМОВ ТРИ, И ЭТО ОДНА ИГРА. Классика — одно загаданное слово из
   * перемешанных букв; «Слово-квадрат» — четыре слова по краям поля;
   * «Все слова» — найти ВСЕ слова, которые складываются из набора. Предмет один:
   * собрать слово из данных букв. Отдельными играми они завели бы три уровня,
   * три статистики и три входа в хабе на одну механику.
   */
    /**
   * 🔴 РЕЖИМ «КРОССВОРД» (06.09.2026, просьба Дениса по «Магии Слов»). Слова из
   * того же набора букв не вычёркиваются из списка, а ВСТАЮТ В СЕТКУ и
   * пересекаются: найденная буква работает на соседнее слово. Устройство и
   * замеры — `games/anagrams/core/crossword.ts`.
   */
  const [режимИгры, setРежимИгры] = useState<'classic' | 'square' | 'all' | 'cross'>('classic');
  const квадрат = режимИгры === 'square';
  const [armedSquare, setArmedSquare] = useState(false);   // «есть что терять» для подтверждения выхода
  /**
   * Кольца в порядке ЛЕСТНИЦЫ: от колец, из банка которых ничего лишнего не
   * собирается, к тем, где лишних слов больше десятка. Разбор оси — в
   * `лестницаКолец`. Считается один раз на язык (73 мс на весь набор), поэтому
   * живёт в useMemo, а не в рендере.
   */
  const кольца = React.useMemo(() => {
    const словарь = wordsOfLength(wordPool(wordLang.lang), 5);
    return лестницаКолец(собратьКольца(словарь), словарь);
  }, [wordLang.lang]);
  const раскладокВсеСлова = allWordsCount(wordLang.lang);
  /**
   * 🔴 ЯЗЫКИ СУЖАЮТСЯ РЕЖИМОМ, А НЕ ТОЛЬКО ИГРОЙ.
   *
   * Сервис отдаёт максимум игры — восемь наборов «Найди все слова». Но классика
   * и «Квадрат слов» кормятся из `ANAGRAM_DICT` и колец пятибуквенных слов, а там
   * ключи только `ru` и `en`. Показать в классике корейский значило бы отдать
   * человеку пустой банк, поэтому список считается ПО ТЕКУЩЕМУ РЕЖИМУ.
   *
   * ⚠️ «Найди все слова» и «Кроссворд» берут слова из одного набора, поэтому
   * языки у них одинаковые: кроссворд укладывает те же раскладки.
   */
  const языкиРежима = React.useMemo(() => {
    const всеИгры = wordLangsFor('anagrams');
    if (режимИгры === 'all' || режимИгры === 'cross') {
      return всеИгры.filter((l) => allWordsCount(l) > 0);
    }
    return всеИгры.filter((l) => l === 'ru' || l === 'en');
  }, [режимИгры]);

  /**
   * ⚠️ ВЫБРАННЫЙ ЯЗЫК МОЖЕТ СТАТЬ НЕДОСТУПНЫМ ПРИ СМЕНЕ РЕЖИМА. Человек выбрал
   * корейский в «Найди все слова», переключился на классику — и язык, которого в
   * списке больше нет, остался бы выбранным, а банк пришёл бы пустым. Откатываем
   * на английский: он есть во всех режимах.
   */
  React.useEffect(() => {
    if (wordLang.ready && !языкиРежима.includes(wordLang.lang)) wordLang.pick('en');
  }, [языкиРежима, wordLang.ready, wordLang.lang, wordLang.pick]);
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
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

  /**
   * ОТМЕНА БУКВЫ — БЕСПЛАТНАЯ, БЕЗ СЧЁТЧИКА, И ЭТО ОСОЗНАННО.
   *
   * До этого из набранного слова можно было только СТЕРЕТЬ ВСЁ («Сброс»):
   * промахнулся по второй букве в слове из девяти — набирай заново все девять.
   * Наказание за неточность пальца, а не за неточность мысли.
   *
   * Почему бесплатно. Все буквы лежат на виду с первого кадра, и до полного
   * набора игра НИЧЕГО не проверяет: правильность считается ровно в тот тик,
   * когда длина набранного сравнялась с длиной слова. Значит снятая буква не
   * открывает НИ ОДНОГО нового факта — то же самое видно, не трогая плитки.
   * Перебором «поставил — посмотрел — снял» тут не разведаешь ничего.
   *
   * ⚠️ А цена всё-таки есть, и она встроена: на верхних уровнях у слова свой
   * дедлайн, и часы во время отмены не останавливаются. Возня стоит секунд.
   *
   * 🔴 ХРАНИМ СНИМОК ВСЕГО `picked`, А НЕ ОДИН ИНДЕКС. Тогда одной кнопкой
   * откатывается и обычная буква, и «Сброс» целиком, а рассинхрона ленты с
   * доской (лента помнит буквы, которых на доске уже нет) не бывает в принципе.
   */
  const hist = useMoveHistory<number[]>();
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
  const wordDeadlineAtRef = useRef(0);          // gameNow() дедлайна текущего слова (0 = нет лимита)
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
    const isRu = wordLang.lang === 'ru';
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
    const vKey = `${len}_${wordLang.lang}`;
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
    hist.reset();   // лента отмены не переезжает на новое слово: чужие буквы в неё не годятся
    wordDoneRef.current = false;
    // Лимит времени на слово (верхние уровни): не успел = ошибка, слово закрывается само
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (wordSecRef.current > 0) {
      wordDeadlineAtRef.current = gameNow() + wordSecRef.current * 1000;
      setWordLeft(wordSecRef.current);
      deadlineTimerRef.current = setTimeout(() => {
        if (wordDoneRef.current) return;
        wordDoneRef.current = true;
        // Слово закрыто по времени — откатывать больше нечего и незачем: ошибка
        // уже записана. Гасим ленту, чтобы кнопка не осталась живой над мёртвым словом.
        hist.reset();
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
      // ⚠️ Пресет — потолок желания (см. `presetCap`): программа просит слова из
      // шести букв, а лесенка на первых уровнях даёт короче.
      levelRef.current = lvl.level;
      const capped = capPresetByLevel({ want: length, atLevel: levelParams(lvl.level).length, atTop: lvl.level >= 15 });
      lengthRef.current = capped as typeof length;
      trialsRef.current = 10;
      wordSecRef.current = 0;
      setTotalTrials(10);
      setLength(capped as typeof length);
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
    const start = gameNow();
    startTimeRef.current = start;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime((gameNow() - start) / 1000);
      if (wordDeadlineAtRef.current > 0) {
        setWordLeft(Math.max(0, Math.ceil((wordDeadlineAtRef.current - gameNow()) / 1000)));
      }
    }, 100);
    newRound();
  };

  const finish = async () => {
    clearAllTimers();
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
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
        passed,
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
    hist.push(picked);   // снимок ДО буквы — как в сортировке товаров
    const newPicked = [...picked, idx];
    setPicked(newPicked);
    if (newPicked.length === target.length) {
      wordDoneRef.current = true;
      /**
       * 🔴 ЗДЕСЬ ЖЕ ЛЕНТА И ГАСНЕТ. Последняя буква — это КОММИТ: игра сравнивает
       * набранное со словарём и показывает «верно/неверно». Оставь отмену живой
       * после коммита — и получится «собрал, посмотрел ответ, откатил, собрал
       * правильно»: единственный момент, когда ход выдаёт новое знание, стал бы
       * бесплатным. Отменяются буквы 1..n−1, последняя — нет.
       */
      hist.reset();
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
      <View style={{ flex: 1 }}>
      <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="language" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('anagrams')}</Text>
          <Text style={styles.configDesc}>{t('anagramsDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="anagramsIntroDesc" benefits={ANAGRAM_BENEFITS} accent={GRADIENT[0]} />

        <LevelProgressMap bestLevel={lvl.best} gameId="anagrams" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        {/* Карточка уровня: параметры + видимый критерий прохода + сброс ↺1 (паттерн simon/cpt) */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          {/*
            ⚠️ ОПИСАНИЕ УРОВНЯ ЗАВИСИТ ОТ РЕЖИМА. Найдено игрой: при выбранном
            «Слове-квадрате» карточка продолжала обещать «10 слов · 4 букв» —
            параметры классики, которых в квадрате нет вовсе.
          */}
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {режимИгры === 'all'
              ? t('anagramAllWordsLvlParams')
              : квадрат
                ? t('anagramSquareLvlParams')
              : (p.wordSec > 0 ? t('anagramsLvlParamsTimed').replace('{w}', String(p.wordSec)) : t('anagramsLvlParamsFree')).replace('{n}', String(p.trials)).replace('{l}', String(p.length))}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {режимИгры === 'all' ? t('anagramAllWordsPass') : квадрат ? t('anagramSquarePass') : t('anagramsPass')}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        {/*
          🔴 РЕЖИМ ВЫБИРАЕТСЯ ЗДЕСЬ, А НЕ ОТДЕЛЬНЫМ ВХОДОМ В ХАБЕ. Урок «Детского
          мата» той же недели: три параллельных входа в одну игру человек читает
          как три разные игры и спрашивает, чем они отличаются.
        */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
          <View style={styles.optionButtons}>
            {(['classic', 'square', 'all', 'cross'] as const).map((р) => (
              <TouchableOpacity
                accessibilityRole="button" key={р} style={[styles.modeButton, режимИгры === р
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setРежимИгры(р)}>
                {/*
                  Картинка режима — чтобы выбор читался глазом, а не только словом:
                  «Квадрат слов» это рамка из букв, «Кроссворд» — их пересечение.
                  Под профиль она РАЗНАЯ по материалу (см. `core/modeThumbs.ts`):
                  детям пластик, шахматисту орех и мрамор, 50+ крафт и терракота.
                */}
                <Image
                  source={превьюРежима(р, profile?.id)}
                  style={styles.modeThumb}
                  resizeMode="cover"
                  accessible={false}
                  importantForAccessibility="no"
                />
                <Text style={[styles.modeButtonText, { color: режимИгры === р ? '#3f2b96' : colors.text }]}>
                  {р === 'classic' ? t('classicLabel') : р === 'square' ? t('anagramSquare')
                    : р === 'all' ? t('anagramAllWords') : t('anagramCrossword')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {режимИгры === 'square' ? t('anagramSquareHint')
              : режимИгры === 'all' ? t('anagramAllWordsHint')
                : режимИгры === 'cross' ? t('anagramCrosswordHint')
                  : t('anagramClassicHint')}
          </Text>
          {режимИгры !== 'classic' && (
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {t('anagramSquareCount').replace('{n}', String(квадрат ? кольца.length : раскладокВсеСлова))}
            </Text>
          )}
        </View>

        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('wordLangLabel')}</Text>
          <View style={styles.optionButtons}>
            {языкиРежима.map((wl) => (
              <TouchableOpacity
                accessibilityRole="button" key={wl} style={[styles.modeButton, wordLang.lang === wl
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => wordLang.pick(wl)}>
                <Text style={[styles.modeButtonText, { color: wordLang.lang === wl ? '#3f2b96' : colors.text }]}>
                  {WORD_LANG_LABEL[wl]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('themeLabel')}</Text>
          <View style={styles.optionButtons}>
            {ANAGRAM_THEMES.map((th) => (
              <TouchableOpacity
                accessibilityRole="button" key={th.k} style={[styles.modeButton, theme === th.k
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setTheme(th.k)}>
                <Text style={[styles.modeButtonText, { color: theme === th.k ? '#3f2b96' : colors.text }]}>
                  {th.emoji} {t('anagramTheme_' + th.k)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('btn_hint')}</Text>
          <View style={styles.optionButtons}>
            {([true, false] as const).map((on) => (
              <TouchableOpacity
                accessibilityRole="button" key={String(on)} style={[styles.modeButton, hintsOn === on
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setHintsOn(on)}>
                <Text style={[styles.modeButtonText, { color: hintsOn === on ? textOn(GRADIENT[0]) : colors.text }]}>
                  {on ? t('label_on') : t('label_off')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
      {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
      <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
      </>
    </View>
    );
  };

  /**
   * Снять последнюю букву (и вернуть «Сброс», если жали его).
   *
   * Возвращаем ВЕСЬ снимок, а не `picked.slice(0, -1)`: срез после «Сброса»
   * оставил бы пустое слово и живую кнопку — частичный откат, состояние,
   * которого в игре никогда не было.
   */
  const undoLetter = () => {
    if (wordDoneRef.current) return;
    const prev = hist.undo();
    if (prev === null) return;
    setPicked(prev);
    sndPlace();
  };

  /** Стереть всё набранное. Снимок кладём ДО — значит и «Сброс» откатывается. */
  const clearPicked = () => {
    if (wordDoneRef.current || picked.length === 0) return;
    hist.push(picked);
    setPicked([]);
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

  // playing-фаза — на едином каркасе GameShell: подсказка — служебное действие,
  // значит в шапке; «Отменить/Сброс» правят черновик ответа и остаются внизу
  if (phase === 'playing' && режимИгры === 'cross') {
    const пак = allWordsPack(wordLang.lang, lvl.level);
    return (
      <GameShell title={t('anagrams')} onBack={() => { clearAllTimers(); setPhase('config'); }} confirmExit={armedSquare}>
        {пак ? (
          <CrosswordGame
            key={`cross-${wordLang.lang}-${пак.base}-${lvl.level}`}
            pack={пак}
            level={lvl.level}
            seed={lvl.level}
            size={Math.min(width - 32, 380)}
            theme={{ surface: colors.surface, text: colors.text, textSecondary: colors.textSecondary, border: colors.border, primary: GRADIENT[0], success: '#12a594', danger: '#e24b4a' }}
            labels={{ найдено: t('label_found'), подсказки: t('btn_hint'), банк: t('anagramSquareBank'), сдать: t('check'), сброс: t('clear'), подсказка: t('btn_hint') }}
            now={gameNow}
            onProgress={setArmedSquare}
            onComplete={(подсказок, мс) => {
              // Подсказки — цена уровня: в звёздах они стоят столько же, сколько промах.
              setErrors(подсказок);
              setElapsedTime(Math.round(мс / 100) / 10);
              const out = levelOutcomeAnagram({ isPreset, cleared: true });
              if (out.raiseLevel) lvl.reach(lvl.level + 1);
              setClearedPassed(true);
              setPhase(out.phase);
            }}
          />
        ) : (
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('anagramSquareEmpty')}</Text>
        )}
      </GameShell>
    );
  }

  if (phase === 'playing' && режимИгры === 'all') {
    const пак = allWordsPack(wordLang.lang, lvl.level);
    /**
     * 🔴 «НАЗАД» ВОЗВРАЩАЕТ НА ЭКРАН НАСТРОЙКИ, А НЕ ВЫКИДЫВАЕТ ИЗ ИГРЫ.
     *
     * 📍 ОТЧЁТ ДЕНИСА 06.09.2026: «из анаграммы слова нет выхода». Кнопка звала
     * `goBackOrHome`, то есть уводила из игры целиком — и чтобы сменить режим
     * или уровень, надо было заходить заново. Ровно это чинилось в «Детском
     * мате» днём раньше; тут я повторил ту же ошибку, скопировав каркас.
     */
    return (
      <GameShell title={t('anagrams')} onBack={() => { clearAllTimers(); setPhase('config'); }} confirmExit={armedSquare}>
        {пак ? (
          <AllWordsGame
            key={`${wordLang.lang}-${пак.base}`}
            pack={пак}
            seed={lvl.level}
            size={Math.min(width - 32, 380)}
            /*
              Подпись даётся ВСЕГДА, без проверки языка: для латиницы и кириллицы
              `показатьКорейское` возвращает слово как есть, и подпись не рисуется
              (условие в компоненте — «показ отличается от слова»). Так не нужно
              сравнивать `wordLang.lang` с языком, которого в его типе пока нет.
            */
            locale={wordLang.lang}
            подписьНайденного={показатьКорейское}
            theme={{ surface: colors.surface, text: colors.text, textSecondary: colors.textSecondary, border: colors.border, primary: GRADIENT[0], success: '#12a594', danger: '#e24b4a' }}
            labels={{ найдено: t('label_found'), подсказки: t('btn_hint'), банк: t('anagramSquareBank'), сдать: t('check'), сброс: t('clear'), подсказка: t('btn_hint'), перемешать: t('anagramShuffle'), копилка: t('anagramBonus') }}
            now={gameNow}
            onProgress={setArmedSquare}
            onComplete={(подсказок, мс) => {
              // Подсказки — цена уровня: в звёздах они стоят столько же, сколько промах.
              setErrors(подсказок);
              setElapsedTime(Math.round(мс / 100) / 10);
              const out = levelOutcomeAnagram({ isPreset, cleared: true });
              if (out.raiseLevel) lvl.reach(lvl.level + 1);
              setClearedPassed(true);
              setPhase(out.phase);
            }}
          />
        ) : (
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('anagramSquareEmpty')}</Text>
        )}
      </GameShell>
    );
  }

  if (phase === 'playing' && квадрат) {
    /**
     * 🔴 «СЛОВО-КВАДРАТ» — СВОЙ ЭКРАН, НО ТА ЖЕ ИГРА. Уровень берётся из той же
     * лестницы анаграмм: раскладка выбирается по остатку, поэтому уровень N
     * всегда даёт одно и то же кольцо, а набор проходится по кругу.
     */
    const к = кольца.length ? кольца[(Math.max(1, lvl.level) - 1) % кольца.length]! : null;
    /**
     * 🔴 «НАЗАД» ВОЗВРАЩАЕТ НА ЭКРАН НАСТРОЙКИ, А НЕ ВЫКИДЫВАЕТ ИЗ ИГРЫ.
     *
     * 📍 ОТЧЁТ ДЕНИСА 06.09.2026: «из анаграммы слова нет выхода». Кнопка звала
     * `goBackOrHome`, то есть уводила из игры целиком — и чтобы сменить режим
     * или уровень, надо было заходить заново. Ровно это чинилось в «Детском
     * мате» днём раньше; тут я повторил ту же ошибку, скопировав каркас.
     */
    return (
      <GameShell title={t('anagrams')} onBack={() => { clearAllTimers(); setPhase('config'); }} confirmExit={armedSquare}>
        {к ? (
          <WordSquareGame
            key={ключКольца(к.верх, к.право, к.низ, к.лево)}
            кольцо={к}
            size={Math.min(width - 32, 380)}
            theme={{ surface: colors.surface, text: colors.text, textSecondary: colors.textSecondary, border: colors.border, primary: GRADIENT[0], success: '#12a594', danger: '#e24b4a' }}
            labels={{ собрано: t('anagramSquareSolved'), промахи: t('hud_errors'), банк: t('anagramSquareBank'), подсказка: t('btn_hint') }}
            now={gameNow}
            onProgress={setArmedSquare}
            onComplete={(промахов, мс) => {
              setErrors(промахов);
              setElapsedTime(Math.round(мс / 100) / 10);
              const out = levelOutcomeAnagram({ isPreset, cleared: промахов <= 2 });
              if (out.raiseLevel) lvl.reach(lvl.level + 1);
              if (out.lowerLevel) lvl.fail();
              setClearedPassed(промахов <= 2);
              setPhase(out.phase);
            }}
          />
        ) : (
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('anagramSquareEmpty')}</Text>
        )}
      </GameShell>
    );
  }

  if (phase === 'playing') {
    return (
      <GameShell
        title={t('anagrams')}
        onBack={() => { clearAllTimers(); goBackOrHome(); }}
        /** Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4). */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${totalTrials}`, pop: true },
          { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
          ...(wordSec > 0 ? [{ key: 'left', icon: 'time' as const, label: t('timeLeftLabel'), value: `${Math.ceil(wordLeft)}${t('secShort')}`, tone: wordLeft <= 10 ? 'warn' as const : 'neutral' as const }] : []),
        ]}
        stats={
          <View style={styles.statsRow}>
          </View>
        }
        /* 💡 Подсказка ушла НАВЕРХ, к остальному служебному: она открывает
           следующую верную букву и растит счётчик `hintUses`, который режет
           результат — то есть трогает игру, а не черновик ответа.
           Кнопка показывается только при включённом тумблере: иначе «хардкор»
           подсказку не выключал. */
        headerActions={
          hintsOn ? (
            <GameAuxBar>
              <GameAuxAction
                icon="bulb" tint="#d97706"
                ladder="hint" label={t('btn_hint')} count={hintUses > 0 ? hintUses : undefined}
                onPress={revealHint}
              />
            </GameAuxBar>
          ) : undefined
        }
        /*
          А «Отменить» и «Сброс» ОСТАЛИСЬ ВНИЗУ, и это не недоделка. Обе правят
          ЧЕРНОВИК ответа: снимают набранные буквы, пока слово не сдано. Игры они
          не трогают — ни счётчика, ни лимита, ни доски, — а до полного набора
          анаграмма ничего не проверяет. Правка ответа обязана стоять рядом со
          сдачей ответа, а не в шапке: это одна и та же работа.
        */
        toolbar={
          <View style={styles.actionsRow}>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('btn_undo')}
              accessibilityState={{ disabled: !hist.canUndo }}
              onPress={undoLetter} disabled={!hist.canUndo}
              style={[styles.clearBtn, { flex: 1, backgroundColor: colors.surface, opacity: hist.canUndo ? 1 : 0.4 }]}>
              <Text style={[styles.clearText, { color: colors.text }]}>↩ {t('btn_undo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" onPress={clearPicked} style={[styles.clearBtn, { flex: 1, backgroundColor: colors.surface }]}>
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
          {/*
            🔴 КРУГ БУКВ ВМЕСТО РЯДА ПЛИТОК.

            📍 ПРОСЬБА ДЕНИСА 06.09.2026, дословно: «надо круг с буквами для
            введения у них перенять, им удобнее вводить» — про «Море слов»
            (10 млн скачиваний) и Zen Word (50 млн).

            Ряд плиток требует ОТДЕЛЬНОГО прицеливания на каждую букву: семь
            букв — семь нажатий. Круг берётся одним движением, и путь виден
            целиком, поэтому ошибку замечают до отпускания пальца, а не после
            сдачи слова. Тап при этом никуда не делся — см. `LetterWheel`.
          */}
          <LetterWheel
            letters={letters}
            size={Math.min(width - 48, 320)}
            trace={picked}
            onTrace={(next) => {
              // Ведение отдаёт линию целиком; игре нужен ПОСЛЕДНИЙ шаг, чтобы
              // сработали лента отмены, звук и проверка полного слова.
              if (next.length > picked.length) handleLetterPress(next[next.length - 1]!);
              else if (next.length < picked.length) { setPicked([...next]); hist.push(picked); }
            }}
            onSubmit={() => { /* слово проверяется на полной длине в handleLetterPress */ }}
            colors={{ surface: colors.surface, text: colors.text, primary: GRADIENT[0], border: colors.border }}
            label={t('anagramHint')}
            disabled={wordDoneRef.current}
          />
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('anagrams')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
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
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0 },  // крупный шрифт: заголовок ужимается между «назад» и спейсером
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  // Прибитый низ настроек: кнопка «начать» всегда на экране, над системной навигацией.
  // Раньше она была последней в прокрутке — на невысоком экране до неё приходилось
  // доскроллить, а решение «во что играю» оказывалось в двух разных местах.
  // Отступ слева — под плавающую кнопку отзыва, она висит поверх и накрывала бы её.
  configSticky: { paddingTop: 10, paddingHorizontal: 16, paddingLeft: 68, borderTopWidth: StyleSheet.hairlineWidth },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  // Картинка режима над подписью: 44 — та же цель нажатия, что у кнопки, увеличивать нечего.
  modeThumb: { width: 44, height: 44, borderRadius: 10, marginBottom: 6 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 12 },
  actionsRow: { flexDirection: 'row', gap: 10, flex: 1, maxWidth: 360 },
  statsRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },  // крупный шрифт: 4 стата переносятся, а не уезжают за край
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
  pickedRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', writingDirection: 'ltr', maxWidth: '100%' },
  pickedSlot: { width: 44, height: 54, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  pickedLetter: { fontSize: 22, fontWeight: '700' },
  lettersRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 360, width: '100%' },
  letterBtn: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tileShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '46%', backgroundColor: 'rgba(255,255,255,0.28)' },
  letterText: { fontSize: 24, fontWeight: '800' },
  clearBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(128,128,128,0.4)', alignItems: 'center' },
  clearText: { fontSize: 13, fontWeight: '600' },
});
