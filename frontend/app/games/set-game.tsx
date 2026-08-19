import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { hapticSuccess, hapticError, HudBadge } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const SG_RULES: LevelRule[] = [
  {
    key: 'timelimit', fromLevel: 11,
    ru: { title: 'Лимит времени', rule: 'Теперь на поиск SET даётся ограниченное время. Не успел — штраф ✗ и новая раскладка. С каждым уровнем лимит жмёт сильнее.', example: 'Пример: L11 — 26 с на SET, дальше −4 с за уровень (минимум 8 с).' },
    en: { title: 'Time limit', rule: 'You now have limited time to find a SET. Run out — penalty ✗ and a fresh board. The limit tightens every level.', example: 'Example: L11 — 26 s per SET, then −4 s per level (8 s minimum).' },
  },
];

const GRADIENT = ['#43cea2', '#185a9d'];
const SET_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitSet1' },
  { icon: 'layers-outline', textKey: 'benefitSet2' },
  { icon: 'shapes-outline', textKey: 'benefitSet3' },
];

// SET cards: 4 attributes × 3 values = 81 unique cards
type ShapeType = 'circle' | 'square' | 'triangle';
type FillType = 'solid' | 'striped' | 'open';
type ColorType = 'red' | 'green' | 'purple';
type CountType = 1 | 2 | 3;

interface Card {
  shape: ShapeType;
  fill: FillType;
  color: ColorType;
  count: CountType;
  id: string;
}

const SHAPES: ShapeType[] = ['circle', 'square', 'triangle'];
const FILLS: FillType[] = ['solid', 'striped', 'open'];
const COLORS: ColorType[] = ['red', 'green', 'purple'];
const COUNTS: CountType[] = [1, 2, 3];
const COLOR_HEX: Record<ColorType, string> = { red: '#e63946', green: '#2a9d8f', purple: '#7b2cbf' };
// Okabe-Ito: киноварь / сине-зелёный / красно-фиолетовый. Цвет здесь один из трёх
// признаков карты, но без него сет не собрать.
const COLOR_HEX_CB: Record<ColorType, string> = { red: '#d55e00', green: '#009e73', purple: '#cc79a7' };

const allCards = (): Card[] => {
  const out: Card[] = [];
  for (const s of SHAPES) for (const f of FILLS) for (const c of COLORS) for (const n of COUNTS) {
    out.push({ shape: s, fill: f, color: c, count: n, id: `${s}-${f}-${c}-${n}` });
  }
  return out;
};

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function isSet(a: Card, b: Card, c: Card): boolean {
  const allSameOrAllDiff = (x: any, y: any, z: any) =>
    (x === y && y === z) || (x !== y && y !== z && x !== z);
  return allSameOrAllDiff(a.shape, b.shape, c.shape) &&
         allSameOrAllDiff(a.fill, b.fill, c.fill) &&
         allSameOrAllDiff(a.color, b.color, c.color) &&
         allSameOrAllDiff(a.count, b.count, c.count);
}

// Per-attribute breakdown for hint when subject picks a non-SET triple.
function explainSet(a: Card, b: Card, c: Card): { shape: boolean; fill: boolean; color: boolean; count: boolean } {
  const allSameOrAllDiff = (x: any, y: any, z: any) =>
    (x === y && y === z) || (x !== y && y !== z && x !== z);
  return {
    shape: allSameOrAllDiff(a.shape, b.shape, c.shape),
    fill:  allSameOrAllDiff(a.fill,  b.fill,  c.fill),
    color: allSameOrAllDiff(a.color, b.color, c.color),
    count: allSameOrAllDiff(a.count, b.count, c.count),
  };
}

// v1.131.0+: наглядный пример «валидный SET vs невалидный» в конфиге (волна фидбека:
// справка была только текстом). Карточки рисуются теми же примитивами, что и в игре.
// Валидная тройка: форма и заливка одинаковы у ВСЕХ, цвет и число — у ВСЕХ разные.
const EXAMPLE_VALID: Card[] = [
  { shape: 'circle', fill: 'solid', color: 'red', count: 1, id: 'ex-v-1' },
  { shape: 'circle', fill: 'solid', color: 'green', count: 2, id: 'ex-v-2' },
  { shape: 'circle', fill: 'solid', color: 'purple', count: 3, id: 'ex-v-3' },
];
// Невалидная: те же карты, но у второй цвет = красный → признак «цвет» совпал у двух из трёх.
const EXAMPLE_INVALID: Card[] = [
  { shape: 'circle', fill: 'solid', color: 'red', count: 1, id: 'ex-i-1' },
  { shape: 'circle', fill: 'solid', color: 'red', count: 2, id: 'ex-i-2' },
  { shape: 'circle', fill: 'solid', color: 'purple', count: 3, id: 'ex-i-3' },
];

function findAnySet(cards: Card[]): [number, number, number] | null {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (isSet(cards[i], cards[j], cards[k])) return [i, j, k];
  return null;
}

// Build a board of 12 cards that contains at least one SET (and not too many).
function buildBoard(): Card[] {
  const deck = shuffle(allCards());
  let board = deck.slice(0, 12);
  let guard = 0;
  while (!findAnySet(board) && guard < 100) {
    board = shuffle(allCards()).slice(0, 12);
    guard++;
  }
  return board;
}

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

// Уровень (1..15+): L1-10 trials 6→15 (выносливость) · L11-15 лимит времени на SET (давление, убывает).
function levelParams(level: number): { trials: number; timeLimit: number } {
  const trials = Math.min(15, 5 + level);                       // L1=6 → L10=15
  const over = Math.max(0, level - 10);
  const timeLimit = over > 0 ? Math.max(8, 30 - over * 4) : 0;   // 0 = без лимита; L11≈26с → L15≈10с
  return { trials, timeLimit };
}

export default function SetGame() {
  const { colors, colorblind } = useTheme();
  const HEX = colorblind ? COLOR_HEX_CB : COLOR_HEX;
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('set_game');   // персист-уровень = trials − 5 (эндуранс серии)
  useEffect(() => { if (autostart) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [trials, setTrials] = useState(() => num('trials', 6));
  const [round, setRound] = useState(0);
  const [board, setBoard] = useState<Card[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [hintBreakdown, setHintBreakdown] = useState<{ shape: boolean; fill: boolean; color: boolean; count: boolean } | null>(null);
  // v1.148: 💡 подсказка — подсветить одну карту гарантированного сета (Валя
  // «нет правильного ответа»: сет есть всегда, но найти бывает трудно).
  const [hintCardIdx, setHintCardIdx] = useState<number | null>(null);
  // v1.169 (репорт Вали «тут нет правильного ответа»): при истечении времени доска
  // МОЛЧА подменялась на новую — ошибка засчитана, стол исчез. С места игрока это
  // неотличимо от «сета тут и не было», а доказать обратное нечем: подсказка
  // помогает только если успел нажать ДО таймера. Сет на столе есть всегда
  // (buildBoard пересдаёт, пока не найдёт), поэтому просто показываем какой.
  const [revealedSet, setRevealedSet] = useState<number[] | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата для баннера (проход/«почти»)
  // v1.164: блок «Пример» РАЗВЁРНУТ по умолчанию. Сам пример «валидный vs невалидный
  // SET» есть с v1.148, но был свёрнут — тестировщик его просто не нашёл («не нашёл "?"»).
  // Правила SET неочевидны с нуля, поэтому первый экран должен показывать их сразу;
  // кому не нужно — сворачивает одним нажатием.
  const [showExample, setShowExample] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);
  const timeLimitRef = useRef(0);
  /**
   * v1.176: ЛИМИТ НА РАСКЛАД БОЛЬШЕ НЕ НЕВИДИМКА.
   *
   * 🔴 ЧТО ЛОМАЛОСЬ. С L11 на каждый расклад даётся max(8, 30−(L−10)·4) секунд
   * (26 с на L11 → 10 с на L15). Не успел — штраф ✗, а проход уровня решается
   * ровно по числу ошибок. В шапке при этом висел только общий секундомер: он
   * растёт, а сколько осталось на ТЕКУЩИЙ расклад — не было видно нигде.
   * Человек терял уровень по часам, которых ему не показали.
   *
   * ⚠️ ПОЧЕМУ ЗАМЕНИЛ setTimeout НА ДЕДЛАЙН ПО ИГРОВЫМ ЧАСАМ. Два повода:
   *  1) setTimeout идёт по настенным часам и НЕ замирает на паузе (gamePause):
   *     пока человек пишет отзыв, расклад успевал протухнуть. Ровно тот репорт
   *     «пока я писала отзыв, игра моя закончилась».
   *  2) Показывать остаток можно только от дедлайна — из setTimeout остаток не
   *     достать. Один источник правды (`dealEndRef`) лучше двух рассинхронных.
   */
  const dealEndRef = useRef(0);                 // отметка игровых часов, когда расклад истекает; 0 = лимита нет
  const [dealLimit, setDealLimit] = useState(0);  // лимит текущей партии в секундах (0 = его нет) — рулит показом бейджа
  const [dealLeft, setDealLeft] = useState(0);    // сколько осталось на расклад — то самое, чего не было видно
  /**
   * Колбэк таймера обязан видеть СВЕЖУЮ доску. Прежний `setTimeout(() =>
   * handleTimeout())` захватывал замыкание того рендера, в котором раздавали
   * расклад, а доска там ещё прошлая — findAnySet считал сет по старой раздаче
   * и подсвечивал произвольные три карты на новой. Ref всегда указывает на
   * обработчик последнего рендера.
   */
  const timeoutFnRef = useRef<() => void>(() => {});

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Справка правил уровня: только в личной игре (в зарядке-пресете лимита времени нет, бейдж скрыт)
  const levelRules = useLevelRules('set_game', lvl.level, SG_RULES, phase === 'playing' && !isPreset);

  const handleTimeout = () => {
    dealEndRef.current = 0;    // отсчёт снят: дальше висит разбор, время на него не капает
    setDealLeft(0);
    setErrors((e) => e + 1);   // не успел найти SET за лимит → штраф
    // Не забираем доску молча: подсвечиваем сет, который тут был, и ждём «Понятно».
    // Так штраф превращается в объяснение, а не в «игра меня обманула».
    const s = findAnySet(board);
    if (s) { setRevealedSet(s); return; }
    newRound();   // теоретически недостижимо — buildBoard гарантирует сет
  };
  timeoutFnRef.current = handleTimeout;   // каждый рендер — свежий обработчик для тика часов

  /** Пустить отсчёт на текущий расклад заново (раздача или закрытый разбор ошибки). */
  const armDealClock = () => {
    if (timeLimitRef.current <= 0) { dealEndRef.current = 0; setDealLeft(0); return; }
    dealEndRef.current = gameNow() + timeLimitRef.current * 1000;
    setDealLeft(timeLimitRef.current);
  };

  /** Закрыть показ «вот он был» и раздать новую доску. */
  const dismissRevealed = () => {
    setRevealedSet(null);
    newRound();
  };

  const newRound = () => {
    setBoard(buildBoard()); setPicked([]); setFeedback(null); setHintBreakdown(null); setHintCardIdx(null); setRevealedSet(null);
    armDealClock();   // лимит времени на SET — теперь виден в шапке
  };

  // 💡 Подсветить первую карту любого валидного сета на поле. Бесплатно —
  // цена и так зашита во время (score штрафуется секундами).
  const showHintCard = () => {
    const s = findAnySet(board);
    if (s) setHintCardIdx(s[0]);
  };

  // «Понятно» после ошибки: разбор висит, пока человек его не закрыл
  // (Валя: «показал ошибки так быстро, что не успела прочитать»).
  const dismissWrong = () => {
    setPicked([]);
    setFeedback(null);
    setHintBreakdown(null);
    armDealClock();   // разбор закрыт — отсчёт пошёл заново, с полного лимита
  };

  const startGame = () => {
    const p = isPreset ? { trials, timeLimit: 0 } : levelParams(lvl.level);   // уровень рулит: trials → лимит времени на SET
    levelRef.current = lvl.level;
    timeLimitRef.current = p.timeLimit;
    setDealLimit(p.timeLimit);
    if (!isPreset) setTrials(p.trials);
    setHits(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = gameNow();
    setStartTime(start);
    // Один тик на всё: и общий секундомер, и остаток на расклад. Часы игровые —
    // на паузе (виджет отзыва) стоят оба, иначе расклад сгорал бы, пока человек пишет.
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const now = gameNow();
      setElapsedTime((now - start) / 1000);
      if (dealEndRef.current > 0) {
        const left = (dealEndRef.current - now) / 1000;
        setDealLeft(Math.max(0, left));
        if (left <= 0) timeoutFnRef.current();   // штраф — ровно в тот момент, когда ноль виден на экране
      }
    }, 100);
  };

  const togglePick = (i: number) => {
    if (feedback !== null) return;
    if (picked.includes(i)) { setPicked(picked.filter((x) => x !== i)); return; }
    if (picked.length >= 3) return;
    const next = [...picked, i];
    setPicked(next);
    if (next.length === 3) checkSet(next);
  };

  const checkSet = async (sel: number[]) => {
    dealEndRef.current = 0;   // ответ дан — снять лимит времени на расклад
    const ok = isSet(board[sel[0]], board[sel[1]], board[sel[2]]);
    setFeedback(ok ? 'right' : 'wrong');
    if (ok) { hapticSuccess(); setHits((h) => h + 1); } else {
      hapticError();
      setErrors((e) => e + 1);
      // Generate hint breakdown for wrong answer
      setHintBreakdown(explainSet(board[sel[0]], board[sel[1]], board[sel[2]]));
    }
    // v1.148: разбор ошибки больше НЕ исчезает сам — закрывается кнопкой
    // «Понятно» (dismissWrong). Автотаймер остался только у верного ответа.
    if (!ok) return;
    const delay = 700;
    setTimeout(async () => {
      if (ok) {
        if (round >= trials) {
          if (timerRef.current) clearInterval(timerRef.current);
          const finalTime = (gameNow() - startTime) / 1000;
          setElapsedTime(finalTime);
          const passed = !isPreset && errors <= 1;
          if (isPreset) {
            setPhase('result');   // пресет/свободный режим — экран статистики, уровень не трогаем
          } else {
            if (passed) lvl.reach(levelRef.current + 1);   // серия почти без ошибок → +уровень
            if (passed && levelRef.current % BOSS_EVERY === 0) {
              // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
              setClearedPassed(true);
              setPhase('boss');
            } else {
              setClearedPassed(passed);
              setPhase('cleared');   // непрерывный поток: и проход, и провал → баннер (passed рулит текстом), без тупика
            }
          }
          try {
            await saveSession({
              passed,
              game_type: 'set_game',
              score: Math.max(0, (hits + 1) * 200 - errors * 50 - Math.floor(finalTime)),
              time_seconds: finalTime,
              difficulty: 'medium',
              mode: `${trials}t`,
              errors,
              details: { level: levelRef.current, hits: hits + 1, errors, trials },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound((r) => r + 1);
          newRound();
        }
      }
    }, delay);
  };

  // Скринридер не видит фигуру — собираем описание из тех же 4 признаков,
  // по которым игрок ищет сет: количество, цвет, заливка, форма.
  const cardLabel = (c: Card) =>
    `${c.count} ${t('color_' + c.color).toLowerCase()} ${t('fill_' + c.fill)} ${t('shape_' + c.shape)}`;

  const renderShape = (card: Card, key: number) => {
    const c = HEX[card.color];
    const size = 18;
    const common = { width: size, height: size, marginHorizontal: 2, overflow: 'hidden' as const };
    // v1.148: штриховка — РЕАЛЬНЫЕ полоски вместо полупрозрачной заливки
    // (репорт Вали: «нет правильного ответа» — сет был через striped, но
    // бледная заливка на разных формах читалась то как open, то как solid).
    // Один и тот же рисунок полос на всех трёх формах.
    const fillStyle = card.fill === 'solid'
      ? { backgroundColor: c, borderColor: c, borderWidth: 2 }
      : { backgroundColor: 'transparent', borderColor: c, borderWidth: 2 };
    const stripes = card.fill === 'striped' ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <View style={{ position: 'absolute', top: '22%', left: 0, right: 0, height: 2, backgroundColor: c }} />
        <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, backgroundColor: c }} />
        <View style={{ position: 'absolute', top: '78%', left: 0, right: 0, height: 2, backgroundColor: c }} />
      </View>
    ) : null;
    if (card.shape === 'circle') {
      return <View key={key} style={[common, { borderRadius: size / 2 }, fillStyle]}>{stripes}</View>;
    }
    if (card.shape === 'square') {
      return <View key={key} style={[common, { borderRadius: 3 }, fillStyle]}>{stripes}</View>;
    }
    // triangle: use rotated square w/ clip — simple approximation with View
    return (
      <View key={key} style={[common, { borderRadius: 3, transform: [{ rotate: '45deg' }] }, fillStyle]}>{stripes}</View>
    );
  };

  const renderCard = (card: Card, i: number) => {
    const sel = picked.includes(i);
    const hinted = (hintCardIdx === i || !!revealedSet?.includes(i)) && !sel;
    const fbColor = sel && feedback === 'right' ? '#22c55e' : sel && feedback === 'wrong' ? '#f43f5e' : null;
    return (
      <TouchableOpacity key={i} onPress={() => togglePick(i)} disabled={feedback !== null || revealedSet !== null}
        accessibilityRole="button" accessibilityLabel={cardLabel(card)}
        accessibilityState={{ selected: sel, disabled: feedback !== null }}
        style={[styles.card, {
          backgroundColor: colors.surface,
          borderColor: fbColor || (sel ? GRADIENT[1] : hinted ? '#f5b50a' : colors.border),
          borderWidth: sel || hinted ? 3 : 1,
        }]}>
        <View style={styles.shapeRow}>
          {Array.from({ length: card.count }).map((_, k) => renderShape(card, k))}
        </View>
      </TouchableOpacity>
    );
  };

  // Статичная карточка для примера: тот же вид, что в игре (styles.card + renderShape), но без тапа.
  const renderExampleCard = (card: Card, verdictColor: string) => (
    <View key={card.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: verdictColor, borderWidth: 2 }]}>
      <View style={styles.shapeRow}>
        {Array.from({ length: card.count }).map((_, k) => renderShape(card, k))}
      </View>
    </View>
  );

  // ЗАЧЕМ ScrollView: раскрытый «Пример» удлиняет конфиг — на малых экранах кнопка
  // «Старт» уезжала бы за край (паттерн конфига-скролла как в mnemonics/schulte).
  const renderConfig = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="shapes" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('setGame')}</Text>
        <Text style={styles.configDesc}>{t('setGameDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="setGameIntroDesc" benefits={SET_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap gameId="set_game" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          accessibilityRole="button" style={styles.exampleHeader} onPress={() => setShowExample((v) => !v)}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {t('setExampleTitle')}
          </Text>
          <Ionicons name={showExample ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        {showExample && (
          <View style={styles.exampleBody}>
            <View style={styles.exampleRow}>{EXAMPLE_VALID.map((c) => renderExampleCard(c, '#22c55e'))}</View>
            <Text style={[styles.exampleCaption, { color: '#22c55e' }]}>
              {t('setExampleValid')}
            </Text>
            <View style={styles.exampleRow}>{EXAMPLE_INVALID.map((c) => renderExampleCard(c, '#f43f5e'))}</View>
            <Text style={[styles.exampleCaption, { color: '#f43f5e' }]}>
              {t('setExampleInvalid')}
            </Text>
            <Text style={[styles.exampleNote, { color: colors.textSecondary }]}>
              {t('setExampleNote')}
            </Text>
            {/* v1.148: советы по логике поиска (запрос Дениса по волне Вали) */}
            <View style={[styles.tipsBox, { borderColor: colors.border }]}>
              <Text style={[styles.tipsTitle, { color: colors.text }]}>{t('setTipsTitle')}</Text>
              <Text style={[styles.tipItem, { color: colors.textSecondary }]}>1. {t('setTip1')}</Text>
              <Text style={[styles.tipItem, { color: colors.textSecondary }]}>2. {t('setTip2')}</Text>
              <Text style={[styles.tipItem, { color: colors.textSecondary }]}>3. {t('setTip3')}</Text>
            </View>
          </View>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[3, 6, 10].map((n) => (
            <TouchableOpacity
              accessibilityRole="button" key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
    </ScrollView>
  );

  // игровая фаза — на едином каркасе GameShell; модалка правил уровня — поверх (паттерн digit-span)
  // Доска остаётся видна и после победы — она и есть награда; карточка итога
  // висит поверх неё (решение Дениса «карточка над всей доской»).
  if (phase === 'playing' || phase === 'cleared') {
    return (
      <View style={{ flex: 1 }}>
        {phase === 'cleared' && (
          <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
            <LevelCleared
          variant="overlay" gameId="set_game" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
          </View>
        )}
        <GameShell
          title={t('setGame')}
          onBack={() => goBackOrHome()}
          stats={
            <View style={styles.statsRow}>
              {/* Остаток на ТЕКУЩИЙ расклад. Бейдж-пилюля, а не ещё одна серая
                  цифра в ряду: по этим секундам начисляется ✗, а по ✗ решается
                  проход уровня — промахнуться взглядом мимо неё нельзя.
                  Краснеет на последних 5 с. */}
              {dealLimit > 0 && (
                <HudBadge
                  icon="timer-outline" label={t('timeLeftLabel')}
                  value={`${Math.ceil(dealLeft)}${t('secShort')}`}
                  colors={dealLeft <= 5 ? ['#fb7185', '#e11d48'] : ['#60a5fa', '#2563eb']}
                  pop={dealLeft <= 5}
                />
              )}
              <Text style={[styles.statText, { color: colors.text }]}>{t('round')} {round}/{trials}{!isPreset ? ` · ${t('label_level_short')}${lvl.level}` : ''}</Text>
              <Text style={[styles.statText, { color: '#22c55e' }]}>{t('hud_correct')} {hits}</Text>
              <Text style={[styles.statText, { color: '#f43f5e' }]}>{t('hud_errors')} {errors}</Text>
              <Text style={[styles.statText, { color: colors.text }]}>{t('time')} {elapsedTime.toFixed(1)}{t('secShort')}</Text>
              {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />}
            </View>
          }
        >
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('setHint')}</Text>
            {hintBreakdown && feedback === 'wrong' && (
              <View style={[styles.hintBox, { backgroundColor: '#f43f5e22', borderColor: '#f43f5e' }]}>
                <Text style={[styles.hintTitle, { color: '#f43f5e' }]}>{t('label_not_set')}</Text>
                <View style={styles.hintRow}>
                  <Text style={[styles.hintItem, { color: hintBreakdown.shape ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.shape ? '✓' : '✗'} {t('label_shape')}
                  </Text>
                  <Text style={[styles.hintItem, { color: hintBreakdown.color ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.color ? '✓' : '✗'} {t('label_color')}
                  </Text>
                  <Text style={[styles.hintItem, { color: hintBreakdown.fill ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.fill ? '✓' : '✗'} {t('label_fill')}
                  </Text>
                  <Text style={[styles.hintItem, { color: hintBreakdown.count ? '#22c55e' : '#f43f5e' }]}>
                    {hintBreakdown.count ? '✓' : '✗'} {t('label_count_short')}
                  </Text>
                </View>
                <Text style={[styles.hintRule, { color: colors.textSecondary }]}>
                  {t('hint_set_rule')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button" onPress={dismissWrong} style={[styles.gotItBtn, { backgroundColor: '#f43f5e' }]}>
                  <Text style={styles.gotItText}>{t('setGotIt')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* v1.169: время вышло — вместо молчаливой подмены доски показываем сет,
                который на ней был. Подсвечены все три карты, панель ждёт «Понятно».
                Прямой ответ на «тут нет правильного ответа»: вот он. */}
            {revealedSet && (
              <View style={[styles.hintBox, { backgroundColor: '#f5b50a22', borderColor: '#f5b50a' }]}>
                <Text style={[styles.hintTitle, { color: '#f5b50a' }]}>{t('setTimeUpTitle')}</Text>
                <Text style={[styles.hintRule, { color: colors.textSecondary }]}>{t('setTimeUpBody')}</Text>
                <TouchableOpacity
                  accessibilityRole="button" onPress={dismissRevealed}
                  style={[styles.gotItBtn, { backgroundColor: '#f5b50a' }]}>
                  <Text style={styles.gotItText}>{t('setGotIt')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.boardArea}>
              {board.map(renderCard)}
            </View>
            {feedback === null && (
              <TouchableOpacity
                accessibilityRole="button" onPress={showHintCard} disabled={hintCardIdx !== null}
                style={[styles.hintBtn, { borderColor: '#f5b50a', opacity: hintCardIdx !== null ? 0.45 : 1 }]}>
                <Text style={[styles.hintBtnText, { color: '#b8860b' }]}>💡 {t('setHintBtn')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </GameShell>
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('setGame')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'lightning', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />

      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 200 - errors * 50 - Math.floor(elapsedTime))}
          time={elapsedTime} errors={errors}
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
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  exampleHeader: { minHeight: 48,  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exampleBody: { gap: 8, alignItems: 'center', marginTop: 2 },
  exampleRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  exampleCaption: { fontSize: 12, fontWeight: '600', textAlign: 'center', maxWidth: 320 },
  exampleNote: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', maxWidth: 320, marginTop: 2 },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 12 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center', maxWidth: 360 },
  hintBox: { padding: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', gap: 6, maxWidth: 480 },
  hintTitle: { fontSize: 13, fontWeight: '800' },
  hintRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  hintItem: { fontSize: 13, fontWeight: '700' },
  hintRule: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', maxWidth: 360 },
  gotItBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 26, borderRadius: 16, marginTop: 2 },
  gotItText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  hintBtn: { minHeight: 48, borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18 , justifyContent: 'center'},
  hintBtnText: { fontSize: 13, fontWeight: '700' },
  tipsBox: { borderTopWidth: 1, paddingTop: 8, marginTop: 4, gap: 4, alignSelf: 'stretch' },
  tipsTitle: { fontSize: 12.5, fontWeight: '700' },
  tipItem: { fontSize: 11.5, lineHeight: 16 },
  boardArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 480 },
  card: { width: 88, height: 64, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  shapeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
