/* psygames-game-mnemonics · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { levelParams, новыйПример, раздатьРяд } from '@/src/games/mnemonics/core';
import { pegFor, pegHint, hasPegTable, PEG_RULE, PEG_TEXT } from '@/src/games/mnemonics/pegs';
import LessonPlayer from '@/src/components/LessonPlayer';
import { GameAuxAction } from '@/src/components/GameAuxAction';
import { собратьРазборМнемоники, type КарточкаМнемо } from '@/src/games/mnemonics/teach';
import { makePegQuestion, pegQuizParams, PegQuestion } from '@/src/games/mnemonics/pegsQuiz';
import { useLevelRules, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#4facfe', '#00f2fe'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFFFFF' — контраст 1.39 на бирюзовой плашке (норма AA 4.5).
// Оранжевой кнопки «уровень N» больше нет (вариант A, 30.09.2026): запуск по уровню один.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const PENALTY_SECONDS = 15;

const MNEMONICS_BENEFITS = [
  { icon: 'cart-outline', textKey: 'benefitMnemonics1' },
  { icon: 'call-outline', textKey: 'benefitMnemonics2' },
  { icon: 'list-outline', textKey: 'benefitMnemonics3' },
];

/**
 * Что меняется с уровнем — вслух, а не молча.
 *
 * ЗАЧЕМ. Из 61 игры смену правил объясняли 14; остальные растили сложность
 * незаметно, и человек упирался, не понимая во что. Приоритет Дениса 16.08.2026.
 */
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
export const MNEMONICS_RULES: LevelRule[] = [
  { key: 'method', fromLevel: 7 },   // lr_mnemonics_method_*
];

type GamePhase = 'intro' | 'config' | 'memorize' | 'gap' | 'check' | 'cleared' | 'result' | 'pegs';
/**
 * Третий режим — тренировка самой таблицы опор, без ряда на удержание.
 * Просил отчёт NZT-48 (bf1f53cc): пока сотня опор не узнаётся мгновенно, приём
 * В ПАРТИИ мешает — рабочая память уходит на вспоминание слова, а не на ряд.
 */
type GameMode = 'words' | 'numbers' | 'pegs';
/**
 * Лестница, раздача ряда и пример для окна удержания живут в ядре (`src/games/mnemonics/core.ts`):
 * с него снимается эталон для Flutter-переноса. Реэкспорт — для проб, что берут их отсюда.
 */
export { levelParams, новыйПример };

export default function MnemonicsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const lvl = usePersistentLevel('mnemonics');   // персональная лесенка (старт 5, растёт)
  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const levelRef = useRef(1);
  const useLevelRef = useRef(false);   // запущено по уровню? (для reach + авто-потока)
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в блок «Об игре» (GameAbout);
  /** Окно удержания: сколько примеров осталось решить и что показано сейчас. */
  const [примеров, setПримеров] = useState(0);
  const [решено, setРешено] = useState(0);
  const [пример, setПример] = useState<{ a: number; b: number; ответ: number; варианты: number[] } | null>(null);
  const [остаток, setОстаток] = useState(0);
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
  const levelRules = useLevelRules('mnemonics', lvl.level, MNEMONICS_RULES, phase === 'config');
  const [mode, setMode] = useState<GameMode>(() => (str('mode', 'words') as GameMode));
  const [itemCount, setItemCount] = useState(() => num('itemCount', levelParams(1).itemCount));   // дефолт 5, не 10
  /**
   * 🔴 ОПОРА — ЭТО И ЕСТЬ ПРИЁМ, А НЕ ПОДСКАЗКА-ПОБЛАЖКА.
   *
   * 📍 ОТЧЁТ NZT-48 (app_feedback bf1f53cc, 13.09.2026): «надо проработать
   * алфавит магический до 100, ввести словарь с подсказками». До этой правки
   * режим цифр выдавал восемь случайных чисел и не давал НИ ОДНОГО способа их
   * удержать: игра звалась «Мнемоника» и мнемотехнике не учила.
   *
   * Теперь под числом стоит его слово-опора из буквенно-цифрового кода и разбор,
   * какие согласные дали цифры. Пока опора видна, человек учит приём; лестница
   * снимает её с седьмого уровня — к этому времени сотня опор уже узнаётся.
   */
  const опораЕсть = hasPegTable(language);
  /** Блок «Свободная тренировка» свёрнут по умолчанию: главный путь — по уровню (решение Дениса 30.09.2026, вариант A). */
  const [свободнаяОткрыта, setСвободнаяОткрыта] = useState(false);

  /**
   * 🎓 РАЗБОР ПО ШАГАМ (Денис 17.09.2026). Здесь он отвечает и на отчёт NZT-48 «игра требует
   * запомнить, но не даёт приёма»: в режиме чисел разбор показывает буквенно-цифровой код на
   * ЭТИХ числах, в режиме слов — цепочку сцен.
   * ⚠️ Ссылки обработчиков стабильные: экран перерисовывается таймером, и новая стрелка на
   * каждый кадр молча остановила бы ролик (замер 24.09 на «Парах слов»).
   */
  const [урок, setУрок] = useState<{ карточки: КарточкаМнемо[]; индекс: number } | null>(null);
  const карточкаУрока = урок ? урок.карточки[урок.индекс] : null;
  const урокДальше = useCallback(
    () => setУрок((у) => (у && у.индекс + 1 < у.карточки.length ? { ...у, индекс: у.индекс + 1 } : у)), [],
  );
  const урокНазад = useCallback(
    () => setУрок((у) => (у && у.индекс > 0 ? { ...у, индекс: у.индекс - 1 } : у)), [],
  );
  const урокЗакрыть = useCallback(() => setУрок(null), []);
  /** Режим опор: текущий вопрос, что уже спрашивали и чем кончился прошлый ответ. */
  const [вопрос, setВопрос] = useState<PegQuestion | null>(null);
  const [спрошено, setСпрошено] = useState<number[]>([]);
  const [разбор, setРазбор] = useState<{ верно: boolean; ответ: string } | null>(null);
  /** Когда показан текущий вопрос: от него считается остаток времени на ответ. */
  const вопросНачат = useRef(0);
  const таймерВопроса = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [опораВидна, setОпораВидна] = useState(true);
  const опоруТронули = useRef(false);
  const [items, setItems] = useState<string[]>([]);
  const [shuffledItems, setShuffledItems] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [, setStartTime] = useState(0);   // значение не читают, сеттер зовут дважды
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const generateItems = (count: number = itemCount): string[] =>
    раздатьРяд(mode === 'words' ? 'words' : 'numbers', count, language);

  const startGame = (useLevel = false) => {
    // По уровню (не-пресет): число слов из лесенки (старт 5). Иначе — выбранное вручную / preset.
    let ic = itemCount;
    if (!isPreset && useLevel) { ic = levelParams(lvl.level).itemCount; levelRef.current = lvl.level; useLevelRef.current = true; setItemCount(ic); }
    else useLevelRef.current = false;
    /**
     * 🔴 ПРОГРАММА НЕ ДАЁТ ЗАДАНИЕ ВЫШЕ ДОСТИГНУТОГО УРОВНЯ.
     *
     * Денис 30.08.2026 из зарядки: «запускается на большом уровне, который ещё
     * не освоен — сразу для запоминания 20 слов». Так и было: в программах
     * профилей у мнемоники стоит `itemCount: 20`, и пресет применялся как есть,
     * мимо лесенки уровней (`levelParams`: L1 = 5 слов, L11 = 15).
     *
     * Теперь пресет — ПОТОЛОК ЖЕЛАНИЯ, а не приказ: берём не больше, чем
     * «достигнутый уровень плюс шаг вперёд». Шаг нужен, чтобы программа всё же
     * подтягивала, а не топталась на месте. Дошедшему до верха лесенки
     * (L11+) отдаём пресет целиком — он его уже тянет.
     */
    if (isPreset && lvl.loaded) {
      const cap = levelParams(lvl.level).itemCount + 2;
      const capped = lvl.level >= 11 ? ic : Math.min(ic, cap);
      if (capped !== ic) { ic = capped; setItemCount(ic); }
    }
    /**
     * Режим опор идёт своим ходом: ряда на удержание нет, есть вопросы по таблице.
     * `items` заполняем по числу вопросов — по нему итог считает счёт (`items.length − errors`).
     */
    if (mode === 'pegs' && опораЕсть) {
      const уровень = useLevel && lvl.loaded ? lvl.level : 1;
      if (useLevel) { levelRef.current = уровень; useLevelRef.current = true; }
      const { count } = pegQuizParams(уровень);
      setItems(Array.from({ length: count }, (_, i) => String(i + 1)));
      setСпрошено([]);
      setРазбор(null);
      вопросНачат.current = gameNow();
      setВопрос(makePegQuestion(уровень, language as 'ru' | 'en'));
      setErrors(0);
      setSelectedOrder([]);
      setPhase('pegs');
      setStartTime(gameNow());
      const начало = gameNow();
      timerRef.current = setInterval(() => { setElapsedTime((gameNow() - начало) / 1000); }, 100);
      return;
    }
    /**
     * Ось лестницы «показ опоры»: до шестого уровня слово-опора стоит под числом
     * (человек учит приём), с седьмого исчезает — приём должен работать в голове.
     * Ручной переключатель на экране настройки сильнее: тронул — уважаем выбор.
     */
    if (!опоруТронули.current && lvl.loaded) setОпораВидна((useLevel ? lvl.level : levelRef.current || 1) <= 6);
    const newItems = generateItems(ic);
    setItems(newItems);
    setSelectedOrder([]);
    setErrors(0);
    setPhase('memorize');
    setStartTime(gameNow());
    
    const start = gameNow();
    timerRef.current = setInterval(() => {
      setElapsedTime((gameNow() - start) / 1000);
    }, 100);
  };

  /**
   * Окно удержания между показом и проверкой: пауза, а на старших уровнях —
   * ещё и примеры. Ставится ПЕРЕД перемешиванием: сначала человек отвлекается,
   * и только потом видит список.
   */
  const startCheck = () => {
    const p = levelParams(lvl.level);
    if (p.gapMs > 0 || p.mathTrials > 0) {
      setПримеров(p.mathTrials);
      setРешено(0);
      setПример(новыйПример());
      setОстаток(Math.ceil(p.gapMs / 1000));
      setPhase('gap');
      return;
    }
    начатьПроверку();
  };

  const начатьПроверку = () => {
    // Shuffle items for checking
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setShuffledItems(shuffled);
    setPhase('check');
    
    // Stop timer for single exercises
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleItemSelect = async (item: string) => {
    if (selectedOrder.includes(item)) return;
    
    const expectedIndex = selectedOrder.length;
    const expectedItem = items[expectedIndex];
    
    if (item === expectedItem) {
      // Correct
      const newOrder = [...selectedOrder, item];
      setSelectedOrder(newOrder);
      
      // Check if all items selected
      if (newOrder.length === items.length) {
        const finalTime = elapsedTime + (errors * PENALTY_SECONDS);
        const isLevelRun = !isPreset && useLevelRef.current;
        const passed = errors === 0;
        if (isLevelRun) {
          if (passed) lvl.reach(levelRef.current + 1);   // чистое воспроизведение → +уровень (больше слов)
          else lvl.fail();                               // непрохождение → гистерезис понижения (после 3 подряд)
          setClearedPassed(passed);
        }

        try {
          await saveSession({
            passed,
            game_type: 'mnemonics',
            score: items.length - errors,
            time_seconds: finalTime,
            difficulty: `${itemCount} ${mode}`,
            mode: mode,  // 'words' | 'numbers'
            errors: errors,
            details: {
          // Резерв прогресса: getMaxLevelFromSessions восстановит уровень отсюда,
          // если локальный ключ потерян (переустановка, сброс профиля).
          level: levelRef.current,
              hits: items.length - errors,
              errors: errors,
              item_count: items.length,
            },
          });
        } catch (error) {
          console.error('Error saving session:', error);
        }
        setPhase(isLevelRun ? 'cleared' : 'result');   // уровень (любой исход) → авто-поток; пресет/свободно → статистика
      }
    } else {
      // Wrong - penalty
      setErrors(prev => prev + 1);
    }
  };

  // Calculate columns and item size based on count
  // For better readability, use fewer columns for words
  const getColumns = () => {
    if (mode === 'words') {
      // Words need more space - always use 2 columns for readability
      return 2;
    }
    if (itemCount <= 10) return 2;
    if (itemCount <= 20) return 3;
    return 4;
  };
  
  const columns = getColumns();
  const itemWidth = (width - 32 - (columns - 1) * 12) / columns;
  // Increased height for better touch targets and larger text
  /** Опора показывается только там, где она есть и где её просили. */
  const опораПоказана = mode === 'numbers' && опораЕсть && опораВидна;
  /** Разбор — на первых трёх уровнях и только в режимах ряда (в «Опорах» учит сама игра). */
  const разборДоступен = phase === 'memorize' && mode !== 'pegs' && lvl.level <= 3 && items.length > 0;
  const начатьРазбор = () => {
    if (!items.length) return;
    const { карточки } = собратьРазборМнемоники(items, mode === 'numbers' ? 'numbers' : 'words', language);
    setУрок({ карточки, индекс: 0 });
  };
  const текстУрока = карточкаУрока
    ? Object.entries(карточкаУрока.поля ?? {}).reduce(
      (текст, [ключ, знач]) => текст.replace(new RegExp(`\\{${ключ}\\}`, 'g'), String(знач)),
      t(карточкаУрока.ключ),
    )
    : '';
  const itemHeight = mode === 'numbers' ? (опораПоказана ? 132 : 100) : 90;

  const renderConfig = () => (
    <>
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient
          colors={GRADIENT as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.configCard}
        >
          <Ionicons name="bulb" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>
            {t('label_mnemonics')}
          </Text>
          <Text style={styles.configDesc}>
            {t('desc_mnemonics_short')}
          </Text>
        </LinearGradient>
        <GameAbout descriptionKey="mnemonicsIntroDesc" benefits={MNEMONICS_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="mnemonics" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('desc_mnemonics_rules')}
          </Text>
        </View>

        {/* Mode Selection */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('mode')}
          </Text>
          <View style={styles.optionButtons}>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.modeButton,
                mode === 'words' && { backgroundColor: GRADIENT[0] },
                mode !== 'words' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('words')}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={mode === 'words' ? textOn(GRADIENT[0]) : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'words' ? textOn(GRADIENT[0]) : colors.text }]}>
                {t('label_words')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.modeButton,
                mode === 'numbers' && { backgroundColor: GRADIENT[0] },
                mode !== 'numbers' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode('numbers')}
            >
              <Ionicons
                name="calculator-outline"
                size={22}
                color={mode === 'numbers' ? textOn(GRADIENT[0]) : colors.text}
              />
              <Text style={[styles.modeButtonText, { color: mode === 'numbers' ? textOn(GRADIENT[0]) : colors.text }]}>
                {t('catVocab_numbers')}
              </Text>
            </TouchableOpacity>
            {/*
              Третий режим стоит рядом с двумя, а не прячется: это ответ на
              «ввести отдельный режим для запоминания цифр». Показан только там,
              где таблица есть, — в русском и английском.
            */}
            {опораЕсть ? (
              <TouchableOpacity
                accessibilityRole="button"
                testID="mnemonics-mode-pegs"
                style={[
                  styles.modeButton,
                  mode === 'pegs' && { backgroundColor: GRADIENT[0] },
                  mode !== 'pegs' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setMode('pegs')}
              >
                <Ionicons
                  name="grid-outline"
                  size={22}
                  color={mode === 'pegs' ? textOn(GRADIENT[0]) : colors.text}
                />
                <Text style={[styles.modeButtonText, { color: mode === 'pegs' ? textOn(GRADIENT[0]) : colors.text }]}>
                  {PEG_TEXT[language as 'ru' | 'en'].mode}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/*
          КАРТОЧКА ПРИЁМА. Показывается только в режиме цифр и только там, где
          таблица есть (русский, английский). В остальных языках её нет вовсе —
          это честнее, чем показать переключатель, за которым ничего не стоит.
        */}
        {(mode === 'numbers' || mode === 'pegs') && опораЕсть ? (
          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.optionButtons, mode === 'pegs' && { display: 'none' }]}>
              <Text style={[styles.optionLabel, { color: colors.text, flex: 1 }]}>
                {PEG_TEXT[language as 'ru' | 'en'].aid}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: опораВидна }}
                testID="mnemonics-peg-aid"
                style={[
                  styles.modeButton,
                  опораВидна
                    ? { backgroundColor: GRADIENT[0] }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => { опоруТронули.current = true; setОпораВидна((v) => !v); }}
              >
                <Ionicons
                  name={опораВидна ? 'eye-outline' : 'eye-off-outline'}
                  size={22}
                  color={опораВидна ? textOn(GRADIENT[0]) : colors.text}
                />
                <Text style={[styles.modeButtonText, { color: опораВидна ? textOn(GRADIENT[0]) : colors.text }]}>
                  {опораВидна ? PEG_TEXT[language as 'ru' | 'en'].show : PEG_TEXT[language as 'ru' | 'en'].hide}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.optionLabel, { color: colors.text, marginTop: 12 }]}>
              {PEG_TEXT[language as 'ru' | 'en'].codeTitle}
            </Text>
            {PEG_RULE[language as 'ru' | 'en'].map((r) => (
              <View key={r.digit} style={styles.кодСтрока}>
                <Text style={[styles.кодЦифра, { color: GRADIENT[0] }]}>{r.digit}</Text>
                <Text style={[styles.кодБуквы, { color: colors.text }]}>{r.letters}</Text>
                <Text style={[styles.кодПочему, { color: colors.textSecondary }]}>{r.why}</Text>
              </View>
            ))}
            <Text style={[styles.кодХвост, { color: colors.textSecondary }]}>
              {PEG_TEXT[language as 'ru' | 'en'].codeTail}
            </Text>
          </View>
        ) : null}

        {/*
          🔴 ОДИН ПУТЬ ЗАПУСКА, И ОН ПО УРОВНЮ (задача 1b92333a, решение Дениса 30.09.2026, вариант A).

          📍 БЫЛО: две кнопки, похожие на запуск. Оранжевая «Уровень N →» шла по лесенке, а
          большая нижняя «Начать» — нет: человек выбирал «20», проходил все двадцать без
          ошибки, и уровень оставался прежним. Экран об этом молчал, а «Количество» спорило
          с лесенкой за одно и то же — число элементов.

          СТАЛО: нижняя «Начать» всегда по уровню, над ней сказано, что именно она запустит.
          Свободная тренировка не исчезла, но свёрнута в свой блок, запускается своей кнопкой
          и прямо пишет «уровень не меняется». Образец внутри раздела — «Пары слов».
        */}
        {!isPreset ? (
          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>
              {mode === 'pegs'
                ? t('mnemLevelLinePegs').replace('{level}', String(lvl.level))
                : t('mnemLevelLine').replace('{level}', String(lvl.level)).replace('{n}', String(levelParams(lvl.level).itemCount))}
            </Text>
          </View>
        ) : null}

        {!isPreset && mode !== 'pegs' ? (
          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: свободнаяОткрыта }}
              aria-expanded={свободнаяОткрыта}
              testID="mnemonics-free-toggle"
              style={styles.свободнаяШапка}
              onPress={() => setСвободнаяОткрыта((v) => !v)}
            >
              <Text style={[styles.optionLabel, { color: colors.text, flex: 1 }]}>{t('mnemFreeTraining')}</Text>
              <Ionicons name={свободнаяОткрыта ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            {свободнаяОткрыта ? (
              <>
                <Text style={[styles.свободнаяПодпись, { color: colors.textSecondary }]}>{t('mnemFreeTrainingNote')}</Text>
                <View style={styles.optionButtons}>
                  {[5, 8, 12, 20].map((count) => (
                    <TouchableOpacity
                      accessibilityRole="button"
                      key={count}
                      style={[
                        styles.countButton,
                        itemCount === count && { backgroundColor: GRADIENT[0] },
                        itemCount !== count && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                      ]}
                      onPress={() => setItemCount(count)}
                    >
                      <Text
                        style={[
                          styles.countButtonText,
                          { color: itemCount === count ? textOn(GRADIENT[0]) : colors.text },
                        ]}
                      >
                        {count}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  testID="mnemonics-free-start"
                  style={[styles.свободнаяКнопка, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={() => startGame(false)}
                >
                  <Text style={[styles.свободнаяКнопкаТекст, { color: colors.text }]}>
                    {t('mnemFreeTrainingStart').replace('{n}', String(itemCount))}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
    <GameSetupBar label={t('start')} onStart={() => startGame(!isPreset)} colors={GRADIENT as [string, string]} />
    </>
  );

  // memorize-фаза — на едином каркасе GameShell (поле в ScrollView, «Проверить» прибита к низу)
  /** Уровень, по которому идёт заход режима опор: по лесенке или первый. */
  const уровеньОпор = () => (useLevelRef.current ? levelRef.current : 1);

  /**
   * Итог захода по опорам.
   *
   * 🔴 ПОРОГ ПРОХОЖДЕНИЯ ЗДЕСЬ НЕ «БЕЗ ЕДИНОЙ ОШИБКИ». В основном режиме ряд
   * короткий (5–15) и ошибка означает развалившееся удержание. Здесь вопросов
   * до двадцати четырёх, и требовать чистого листа значило бы запереть лестницу
   * на первых уровнях навсегда. Допуск — десятая часть захода: 0 при шести
   * вопросах, 1 при десяти-девятнадцати, 2 при двадцати и больше.
   */
  const завершитьОпоры = async (ошибок: number) => {
    const допуск = Math.floor(items.length / 10);
    const passed = ошибок <= допуск;
    const isLevelRun = !isPreset && useLevelRef.current;
    if (isLevelRun) {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
    }
    try {
      await saveSession({
        passed,
        game_type: 'mnemonics',
        score: items.length - ошибок,
        time_seconds: elapsedTime,
        difficulty: `${items.length} pegs`,
        mode: 'pegs',
        errors: ошибок,
        details: { level: levelRef.current, hits: items.length - ошибок, errors: ошибок, item_count: items.length },
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
    setPhase(isLevelRun ? 'cleared' : 'result');
  };

  /**
   * Ответ в режиме опор. Разбор показывается ВСЕГДА, а не только при ошибке:
   * узнать, что промахнулся, мало — надо увидеть, каким согласным разбирается
   * верное слово, иначе следующая встреча с этим числом будет такой же.
   */
  const ответитьПоОпоре = (вариант: string) => {
    if (!вопрос || разбор) return;
    const верно = вариант === вопрос.answer;
    if (!верно) setErrors((e) => e + 1);
    setРазбор({ верно, ответ: вопрос.answer });
    const спрошеноТеперь = [...спрошено, вопрос.n];
    setСпрошено(спрошеноТеперь);
    const ошибок = errors + (верно ? 0 : 1);
    setTimeout(() => {
      setРазбор(null);
      if (спрошеноТеперь.length >= items.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        setВопрос(null);
        завершитьОпоры(ошибок);
        return;
      }
      вопросНачат.current = gameNow();
      setВопрос(makePegQuestion(уровеньОпор(), language as 'ru' | 'en', Math.random, спрошеноТеперь));
    }, верно ? 550 : 1600);
  };

  /**
   * 🔴 ВРЕМЯ НА ОТВЕТ — ОСЬ, А НЕ УКРАШЕНИЕ. Пока опора вспоминается десять
   * секунд, в партии она бесполезна: ряд за это время уже рассыпался. Часы
   * включаются с двенадцатого уровня и жмутся до четырёх секунд.
   * ⚠️ Хук стоит ДО ранних выходов по фазам — их число не должно меняться.
   */
  useEffect(() => {
    if (таймерВопроса.current) { clearTimeout(таймерВопроса.current); таймерВопроса.current = null; }
    if (phase !== 'pegs' || !вопрос || разбор) return;
    const { limitMs } = pegQuizParams(уровеньОпор());
    if (!limitMs) return;
    const прошло = gameNow() - вопросНачат.current;
    таймерВопроса.current = setTimeout(() => ответитьПоОпоре('\u0000'), Math.max(300, limitMs - прошло));
    return () => { if (таймерВопроса.current) clearTimeout(таймерВопроса.current); };
  }, [phase, вопрос, разбор]);   // eslint-disable-line react-hooks/exhaustive-deps — ответ и уровень берутся на момент срабатывания

  /** Сколько секунд осталось на ответ; `null` — часов на этом уровне нет. */
  const остатокВремени = (): number | null => {
    const { limitMs } = pegQuizParams(уровеньОпор());
    if (!limitMs || !вопрос || разбор) return null;
    return Math.max(0, Math.ceil((limitMs - (gameNow() - вопросНачат.current)) / 1000));
  };

  const renderPegs = () => (
    <GameShell
      title={t('label_mnemonics')}
      onBack={() => goBackOrHome()}
      pauseActions={[
        { id: 'resume', label: t('exitConfirmStay'), icon: 'play' as const, primary: true },
        { id: 'restart', label: t('restart'), icon: 'refresh' as const, onPress: () => startGame(useLevelRef.current) },
        { id: 'home', label: t('goHome'), icon: 'home' as const, leave: true },
      ]}
      stats={
        <View style={styles.gameHeader}>
          <View style={[styles.timerBox, { backgroundColor: GRADIENT[0] }]}>
            <Ionicons name="time-outline" size={20} color={textOn(GRADIENT[0])} />
            <Text style={[styles.timerText, { color: textOn(GRADIENT[0]) }]}>
              {PEG_TEXT[language as 'ru' | 'en'].left} {Math.max(0, items.length - спрошено.length)}
              {остатокВремени() !== null ? ` · ${остатокВремени()}${t('secShort')}` : ''}
            </Text>
          </View>
        </View>
      }
      /**
       * Варианты — в ряду каркаса под полем, как у всего раздела: цель ответа
       * стоит на одном месте от вопроса к вопросу, и палец не ищет её заново.
       */
      toolbar={
        <View style={styles.опорыВарианты}>
          {(вопрос?.options ?? []).map((v) => (
            <TouchableOpacity
              key={v}
              accessibilityRole="button"
              testID={`peg-option-${v}`}
              disabled={!!разбор}
              onPress={() => ответитьПоОпоре(v)}
              style={[
                styles.опораВариант,
                { backgroundColor: colors.surface, borderColor: colors.border },
                разбор && v === разбор.ответ ? { borderColor: colors.success, borderWidth: 2 } : null,
              ]}
            >
              <Text style={[styles.опораВариантТекст, { color: colors.text }]} numberOfLines={1}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      }
    >
      <View style={styles.опорыПоле}>
        <Text style={[styles.опорыВопрос, { color: colors.textSecondary }]}>
          {вопрос?.direction === 'toNumber'
            ? PEG_TEXT[language as 'ru' | 'en'].askNumber
            : PEG_TEXT[language as 'ru' | 'en'].askWord}
        </Text>
        <Text style={[styles.опорыЗагадка, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {вопрос?.prompt ?? ''}
        </Text>
        {разбор ? (
          <Text style={[styles.опорыРазбор, { color: разбор.верно ? colors.success : colors.error }]}>
            {разбор.верно
              ? PEG_TEXT[language as 'ru' | 'en'].right
              : `${PEG_TEXT[language as 'ru' | 'en'].wrong} ${разбор.ответ}`}
          </Text>
        ) : null}
        {разбор && вопрос ? (
          <Text style={[styles.опораРазбор, { color: colors.textSecondary, fontSize: 14 }]}>
            {pegHint(вопрос.n, language) ?? ''}
          </Text>
        ) : null}
      </View>
    </GameShell>
  );

  const renderMemorize = () => (
    <GameShell
      title={t('label_mnemonics')}
      onBack={() => goBackOrHome()}
      /**
       * 🔴 МЕНЮ ПАУЗЫ — ОДНО НА ВСЕ ИГРЫ. Стрелка «назад» открывает список
       * Продолжить · Заново · Правила · На главную вместо немого выхода.
       * Механизм в каркасе с v2.52.2, но до игрока он доехал у ТРЁХ игр из 96
       * (замер `grep -l pauseActions app/games/*.tsx` на `main` 09.09.2026) —
       * остальные подключают сами. «Заново» и выход разные: выход через
       * `leave: true` идёт тем же путём, что стрелка, и сохраняет партию
       * в «продолжить»; своё `router.back()` сохранение бы потеряло.
       */
      pauseActions={[
        { id: 'resume', label: t('exitConfirmStay'), icon: 'play' as const, primary: true },
        { id: 'restart', label: t('restart'), icon: 'refresh' as const, onPress: () => startGame(useLevelRef.current) },
        ...(levelRules.active
          ? [{ id: 'rules', label: t('btn_rules'), icon: 'help-circle-outline' as const, onPress: () => levelRules.setOpen(true) }]
          : []),
        { id: 'home', label: t('goHome'), icon: 'home' as const, leave: true },
      ]}
      scrollableField
      stats={
        <View style={styles.gameHeader}>
          <View style={[styles.timerBox, { backgroundColor: GRADIENT[0] }]}>
            <Ionicons name="time-outline" size={20} color={textOn(GRADIENT[0])} />
            <Text style={[styles.timerText, { color: textOn(GRADIENT[0]) }]}>{t('time')} {elapsedTime.toFixed(1)}{t('secShort')}</Text>
          </View>
        </View>
      }
      /** 🎓 «Разбор» — значком в общем ряду под полем, как у всех игр. */
      headerActions={разборДоступен ? (
        <GameAuxAction
          compact icon="school-outline" tint="#d97706" label={t('teachButton')}
          onPress={начатьРазбор}
        />
      ) : undefined}
      toolbar={
        <TouchableOpacity
          accessibilityRole="button" style={styles.toolbarBtn} onPress={startCheck}>
          <LinearGradient
            colors={GRADIENT as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.startButtonGradient, styles.toolbarGrad]}
          >
            <Ionicons name="checkmark-circle" size={24} color={ON_GRAD.color} />
            <Text style={styles.startButtonText}>
              {t('check')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      }
    >
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {(mode === 'words' ? t('mnemMemorizeWords') : t('mnemMemorizeNumbers')).replace('{n}', String(itemCount))}
      </Text>
      <View style={styles.itemsGrid}>
        {items.map((item, index) => (
          <View
            key={index}
            style={[
              styles.itemCell,
              {
                width: itemWidth,
                height: itemHeight,
                backgroundColor: colors.surface,
              }
            ]}
          >
            <Text style={[styles.itemNumber, { color: colors.text }]}>
              {index + 1}
            </Text>
            <Text style={[styles.itemText, { color: colors.text, fontSize: mode === 'numbers' ? 32 : 24 }]}>
              {item}
            </Text>
            {/*
              Опора под числом: слово из буквенно-цифрового кода и разбор, какие
              согласные дали цифры. Без разбора слово выглядит произвольным — и
              приём не передаётся, а запоминается как ещё одна пара «число-слово».
            */}
            {опораПоказана && pegFor(Number(item), language) ? (
              <>
                <Text style={[styles.опора, { color: colors.text }]} numberOfLines={1}>
                  {pegFor(Number(item), language)}
                </Text>
                <Text style={[styles.опораРазбор, { color: colors.textSecondary }]} numberOfLines={1}>
                  {(pegHint(Number(item), language) ?? '').split(': ')[1]}
                </Text>
              </>
            ) : null}
          </View>
        ))}
      </View>
      {/*
        🎓 РАЗБОР НА ВЕСЬ ЭКРАН. Сцена — тот же ряд: подсвечен элемент, о котором идёт речь,
        и под числом стоит его опора, чтобы связка была видна, а не только услышана.
      */}
      <LessonPlayer
        visible={!!урок}
        индекс={урок?.индекс ?? 0}
        шагов={Math.max(0, (урок?.карточки.length ?? 1) - 1)}
        текст={текстУрока}
        сноска={урок?.индекс === 0 ? t('teachNotCounted') : undefined}
        готово={карточкаУрока?.вид === 'готово'}
        занят={false}
        renderBoard={() => (
          <View style={styles.разборРяд}>
            {items.slice(0, 4).map((item, i) => {
              const текущий = карточкаУрока?.элемент === i;
              const опора = mode === 'numbers' ? pegFor(Number(item), language) : null;
              return (
                <View
                  key={`${item}-${i}`}
                  style={[
                    styles.разборЭлемент,
                    {
                      backgroundColor: colors.surface,
                      borderColor: текущий ? GRADIENT[0] : colors.border,
                      borderWidth: текущий ? 2 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.разборЗнак, { color: colors.text }]}>{item}</Text>
                  {опора ? (
                    <Text style={[styles.разборОпора, { color: colors.textSecondary }]}>{опора}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        onДальше={урокДальше}
        onНазад={урокНазад}
        onЗакрыть={урокЗакрыть}
      />
    </GameShell>
  );

  // check-фаза — тот же каркас; выбор идёт тапами по ячейкам, кнопок действий нет
  const renderCheck = () => (
    <GameShell
      title={t('label_mnemonics')}
      onBack={() => goBackOrHome()}
      /**
       * 🔴 МЕНЮ ПАУЗЫ — ОДНО НА ВСЕ ИГРЫ. Стрелка «назад» открывает список
       * Продолжить · Заново · Правила · На главную вместо немого выхода.
       * Механизм в каркасе с v2.52.2, но до игрока он доехал у ТРЁХ игр из 96
       * (замер `grep -l pauseActions app/games/*.tsx` на `main` 09.09.2026) —
       * остальные подключают сами. «Заново» и выход разные: выход через
       * `leave: true` идёт тем же путём, что стрелка, и сохраняет партию
       * в «продолжить»; своё `router.back()` сохранение бы потеряло.
       */
      pauseActions={[
        { id: 'resume', label: t('exitConfirmStay'), icon: 'play' as const, primary: true },
        { id: 'restart', label: t('restart'), icon: 'refresh' as const, onPress: () => startGame(useLevelRef.current) },
        ...(levelRules.active
          ? [{ id: 'rules', label: t('btn_rules'), icon: 'help-circle-outline' as const, onPress: () => levelRules.setOpen(true) }]
          : []),
        { id: 'home', label: t('goHome'), icon: 'home' as const, leave: true },
      ]}
      scrollableField
      stats={
        <View style={styles.statsHeader}>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('time')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{elapsedTime.toFixed(1)}{t('secShort')}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('errors')}</Text>
            <Text style={[styles.statValue, { color: errors > 0 ? colors.error : colors.text }]}>
              {errors} (+{errors * PENALTY_SECONDS}s)
            </Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('label_selected')}
            </Text>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {selectedOrder.length}/{items.length}
            </Text>
          </View>
        </View>
      }
    >
      <Text style={[styles.phaseTitle, { color: colors.text }]}>
        {t('label_restore_order')}
      </Text>
      <Text style={[styles.phaseSubtitle, { color: colors.textSecondary }]}>
        {t('hint_top_to_bottom')}
      </Text>
      <View style={styles.itemsGrid}>
        {shuffledItems.map((item, index) => {
          const isSelected = selectedOrder.includes(item);
          const orderIndex = selectedOrder.indexOf(item);

          return (
            <TouchableOpacity
              accessibilityRole="button"
              key={index}
              style={[
                styles.checkItemCell,
                {
                  width: itemWidth,
                  height: itemHeight,
                  backgroundColor: isSelected ? colors.success : colors.surface,
                }
              ]}
              onPress={() => !isSelected && handleItemSelect(item)}
              disabled={isSelected}
            >
              {isSelected && (
                <Text style={styles.selectedNumber}>{orderIndex + 1}</Text>
              )}
              <Text style={[
                styles.checkItemText,
                {
                  color: isSelected ? '#FFFFFF' : colors.text,
                  fontSize: mode === 'numbers' ? 32 : 24,
                }
              ]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </GameShell>
  );


  /**
   * Обратный отсчёт окна удержания. Работает только когда примеров нет: если
   * они есть, окно закрывает не время, а решённые примеры — иначе человек
   * просто переждал бы помеху, не считая.
   */
  useEffect(() => {
    if (phase !== 'gap' || примеров > 0) return;
    if (остаток <= 0) { начатьПроверку(); return; }
    const t = setTimeout(() => setОстаток((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, примеров, остаток]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ответитьНаПример = (v: number) => {
    if (!пример) return;
    // Промах не штрафуется и не засчитывается: помеха нужна, чтобы занять
    // проговаривание, а не чтобы измерять арифметику.
    if (v !== пример.ответ) { setПример(новыйПример()); return; }
    const стало = решено + 1;
    setРешено(стало);
    if (стало >= примеров) начатьПроверку();
    else setПример(новыйПример());
  };

  const renderGap = () => (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.gapWrap}>
        {примеров > 0 && пример ? (
          <>
            <Text style={[styles.gapCounter, { color: colors.textSecondary }]}>
              {решено + 1} / {примеров}
            </Text>
            <Text style={[styles.gapMath, { color: colors.text }]}>
              {пример.a} + {пример.b}
            </Text>
            <View style={styles.gapOptions}>
              {пример.варианты.map((v) => (
                <TouchableOpacity
                  key={v}
                  accessibilityRole="button"
                  accessibilityLabel={String(v)}
                  onPress={() => ответитьНаПример(v)}
                  style={[styles.gapOption, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[styles.gapOptionText, { color: colors.text }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <Ionicons name="hourglass-outline" size={40} color={colors.textSecondary} />
            <Text style={[styles.gapMath, { color: colors.text }]}>{Math.max(0, остаток)}</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );

  // ⚠️ ОКНО ПРАВИЛ НЕСЁТ КАЖДЫЙ РАННИЙ ВЫХОД. Фаза «пауза» выходила без него,
  // и правило, выпавшее на этой фазе, не показывалось вовсе — соседние две
  // строки его несут, эта не несла.
  if (phase === 'gap') return <>{renderGap()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>;
  if (phase === 'memorize') return <>{renderMemorize()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>;
  if (phase === 'check') return <>{renderCheck()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>;
  if (phase === 'pegs') return <>{renderPegs()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {t('label_mnemonics')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared gameId="mnemonics" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame(true)} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          time={elapsedTime + (errors * PENALTY_SECONDS)}
          score={items.length - errors}
          errors={errors}
          gradient={GRADIENT}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => router.push('/')}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** Окно удержания: пример-помеха или обратный отсчёт. Цифры, ни одной буквы. */
  gapWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 },
  gapCounter: { fontSize: 15, fontWeight: '600' },
  gapMath: { fontSize: 44, fontWeight: '800', letterSpacing: 2 },
  gapOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  gapOption: { minWidth: 72, minHeight: 56, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  gapOptionText: { fontSize: 24, fontWeight: '700' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', flexShrink: 1, minWidth: 0, textAlign: 'center' }, // крупный шрифт: заголовок ужимается и не выдавливает спейсер/кнопку за край
  placeholder: { width: HELP_CORNER_SPACE },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 16, paddingBottom: 20 + SETUP_BAR_SPACE },
  configCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  configTitle: { fontSize: 24, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 14, color: ON_GRAD_SOFT, textAlign: 'center' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 13, flex: 1 },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  modeButtonText: { fontSize: 16, fontWeight: '600' },
  countButton: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  countButtonText: { fontSize: 20, fontWeight: '700' },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 8,
  },
  startButtonText: { fontSize: 18, fontWeight: '700', color: ON_GRAD.color },
  // Кнопка «Проверить» в тулбаре каркаса: тянется на всю ширину ряда
  toolbarBtn: { flex: 1 },
  toolbarGrad: { marginBottom: 0 },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  timerText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    minWidth: 0, // крупный шрифт: длинное значение «(+45s)» не раздувает бокс за пределы 1/3 ряда и не выталкивает соседние за край
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  phaseTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  phaseSubtitle: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  // ЗАЧЕМ: itemWidth уже резервирует зазор (columns-1)*12, но сам зазор не применялся —
  // ячейки-слова слипались и читались как сплошной столбец. space-between раскладывает
  // резерв в колонки (без риска переноса: суммарная ширина ячеек < контейнера), rowGap —
  // между рядами. Сетка слов остаётся сеткой в ScrollView (прокрутка списка не тронута),
  // а кнопка «Проверить» уже прижата к низу — раскладка под эталон math-sprint.
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 10,
    paddingBottom: 20,
  },
  itemCell: {
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumber: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  itemText: { fontWeight: '600', textAlign: 'center', fontSize: 24 },
  опора: { fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  свободнаяШапка: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  свободнаяПодпись: { fontSize: 13, marginTop: 4, marginBottom: 10 },
  свободнаяКнопка: { marginTop: 12, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  свободнаяКнопкаТекст: { fontSize: 16, fontWeight: '700' },
  разборРяд: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  разборЭлемент: { minWidth: 76, minHeight: 76, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  разборЗнак: { fontSize: 24, fontWeight: '800' },
  разборОпора: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  опорыПоле: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  опорыВопрос: { fontSize: 15, fontWeight: '600' },
  опорыЗагадка: { fontSize: 56, fontWeight: '800', letterSpacing: 1 },
  опорыРазбор: { fontSize: 17, fontWeight: '700', marginTop: 6 },
  /**
   * 🔴 ДВА ВАРИАНТА В РЯД — ДОЛЕЙ ОТ ОБЁРТКИ, А НЕ ЧИСЛОМ ОТ ОКНА.
   * Замер 23.09.2026, 390×844: сначала кнопки стояли по 140 с `minWidth` —
   * `flexWrap` в вебе (у нас Android это WebView) ряд НЕ перенёс, все четыре
   * встали строкой 590 px, и первая уехала за левый край на 30 точек: нажать
   * её нельзя вовсе. Ширина, посчитанная от ОКНА, тоже мимо: обёртка ряда уже
   * окна (258 из 390), и по 167 они снова встали по одной в строку.
   * Доля от обёртки верна при любой её ширине.
   */
  опорыВарианты: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', alignSelf: 'stretch' },
  опораВариант: { flexGrow: 1, flexBasis: '44%', maxWidth: '48%', minHeight: 56, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  опораВариантТекст: { fontSize: 20, fontWeight: '700' },
  опораРазбор: { fontSize: 11, textAlign: 'center', marginTop: 1 },
  кодСтрока: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  кодЦифра: { fontSize: 15, fontWeight: '800', width: 16, textAlign: 'center' },
  кодБуквы: { fontSize: 14, fontWeight: '700', width: 64 },
  кодПочему: { fontSize: 12, flex: 1 },
  кодХвост: { fontSize: 12, marginTop: 10, lineHeight: 17 },
  checkItemCell: {
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
  },
  selectedNumber: {
    position: 'absolute',
    top: 8,
    left: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  checkItemText: { fontWeight: '700', textAlign: 'center', fontSize: 24 },
});
