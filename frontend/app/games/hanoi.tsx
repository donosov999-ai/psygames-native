import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameAbout from '@/src/components/GameAbout';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveResume, loadResume, clearResume } from '@/src/services/resume';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import LevelCleared from '@/src/components/LevelCleared';
import { useMoveHistory, MoveStackData } from '@/src/hooks/useMoveHistory';
import { gameNow } from '@/src/services/gamePause';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const HN_RULES: LevelRule[] = [
  {
    key: 'pegs4', fromLevel: 5, toLevel: 9,
    ru: { title: '4 стержня', rule: 'Теперь стержней четыре. Больше простора для манёвра — но оптимальный путь другой, старые привычки трёх стержней не работают. Цель прежняя: собрать башню на последнем (правом) стержне.', example: 'Пример: лишний стержень = два «буфера» для мелких дисков.' },
    en: { title: '4 pegs', rule: 'There are now four pegs. More room to maneuver — but the optimal path is different, old 3-peg habits won\'t work. The goal stays the same: rebuild the tower on the last (rightmost) peg.', example: 'Example: the extra peg gives you two "buffers" for small discs.' },
  },
  {
    key: 'pegs5', fromLevel: 10,
    ru: { title: '5 стержней', rule: 'Стержней уже пять — ещё больше простора для манёвра, но и дисков больше, а оптимальный путь снова другой. Цель прежняя: вся башня на последнем (правом) стержне.', example: 'Пример: три «буфера» — раскладывай мелкие диски параллельно.' },
    en: { title: '5 pegs', rule: 'Five pegs now — even more room to maneuver, but more discs too, and the optimal path changes again. The goal stays the same: the whole tower on the last (rightmost) peg.', example: 'Example: three "buffers" — park small discs in parallel.' },
  },
];

const GRADIENT = ['#a8c0ff', '#3f2b96'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.80 (норма AA 4.5), стало 4.55.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #dce6ff @0.34 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
// Базовый тон дисков под профиль — каждый профиль = своя цветовая семья (монохром-стек).
const DISC_HUE: Record<string, number> = {
  chess: 42, odv999: 45, free: 40, nzt48: 270, seniors: 265, polyglot: 232,
  women: 330, kids: 145, drivers: 22, execs: 175, students: 30, vasilyeva: 200,
};
const HANOI_BENEFITS = [
  { icon: 'extension-puzzle-outline', textKey: 'benefitHanoi1' },
  { icon: 'analytics-outline', textKey: 'benefitHanoi2' },
  { icon: 'trending-up-outline', textKey: 'benefitHanoi3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type PegMove = { from: number; to: number };

/** Ключ незаконченной партии — совпадает с id в реестре игр (карточка «Продолжить»). */
const GAME_ID = 'hanoi';

/** Версия формата снимка: меняешь поля HanoiResume — поднимай, иначе старая запись оживит башню без части дисков. */
const RESUME_V = 1;

/**
 * Снимок недоигранной башни.
 *
 * ⚠️ ПОЧЕМУ ЛЕНТА ХОДОВ ТОЖЕ ЗДЕСЬ. Отмена — часть партии, а не украшение: без
 * неё вернувшийся человек получает расстановку, из которой уже нельзя откатить
 * неудачный ход. На 12 дисках оптимум — 4095 ходов, и «отменить нельзя» там
 * дороже, чем кажется.
 */
interface HanoiResume {
  level: number;
  discs: number;
  pegs: number[][];
  moves: number;
  errors: number;
  /** Накопленные секунды: между сессиями настенные часы уходят вперёд. */
  elapsed: number;
  history: MoveStackData<PegMove>;
}

// Уровень (1..15+): L1-4 3 стержня диски 3→6 · L5-9 4 стержня диски 5→9 · L10-15 5 стержней диски 9→12.
// Больше стержней = новый вызов (короче решение), затем растут диски.
function levelParams(level: number): { discs: number; pegs: number } {
  if (level <= 4) return { discs: 2 + level, pegs: 3 };
  if (level <= 9) return { discs: Math.min(9, level), pegs: 4 };
  return { discs: Math.min(12, level - 1), pegs: 5 };
}

export default function HanoiGame() {
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, autostart, num } = useGamePreset();
  const lvl = usePersistentLevel('hanoi');   // персист-уровень = discs − 2 (L1=3 диска)
  useEffect(() => { if (autostart) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [discs, setDiscs] = useState(() => num('discs', 4));
  const [pegs, setPegs] = useState<number[][]>([[], [], []]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);
  const moveHistory = useMoveHistory<PegMove>();

  const optimal = (n: number) => Math.pow(2, n) - 1;

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Справка правил уровня: только в личной игре (в зарядке-пресете всегда 3 стержня, бейдж скрыт)
  const levelRules = useLevelRules('hanoi', lvl.level, HN_RULES, phase === 'playing' && !isPreset);

  const startGame = () => {
    // Новая партия заменяет незаконченную: прежнюю башню продолжать уже нечем.
    if (profile?.id) clearResume(GAME_ID, profile.id).catch(() => {});
    const p = isPreset ? { discs, pegs: 3 } : levelParams(lvl.level);   // уровень рулит: диски + число стержней
    const d = p.discs;
    levelRef.current = lvl.level;
    if (!isPreset) setDiscs(d);
    const initial = Array.from({ length: d }, (_, i) => d - i);
    setPegs([initial, ...Array.from({ length: p.pegs - 1 }, () => [] as number[])]);   // N стержней, диски на первом
    setSelected(null);
    setMoves(0);
    setErrors(0);
    moveHistory.reset();
    setPhase('playing');
    const start = gameNow();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
  };

  /**
   * ПЕРЕТАСКИВАНИЕ ДИСКОВ (просьба Дениса 12.08).
   *
   * ЗАЧЕМ. Ханойская башня — единственная игра, где предмет физически ПЕРЕКЛАДЫВАЮТ,
   * и до сих пор это делалось двумя нажатиями: тап по стержню-источнику, тап по цели.
   * Способ рабочий, но он описывает ход, а не совершает его: рука не чувствует, что
   * диск тяжёлый и что на маленький его класть нельзя. Смысл головоломки — в ощущении
   * ограничения, и оно теряется.
   *
   * ⚠️ НАЖАТИЯ ОСТАВЛЕНЫ. Перетаскивание не заменяет тапы, а добавляется: тащить мышью
   * или пальцем по длинной дуге тяжело тем, у кого проблемы с моторикой, а игра до сих
   * пор была им доступна. Отнять единственный способ игры ради нового — плохой размен.
   * Различаем по расстоянию: сдвиг меньше DRAG_SLOP считается нажатием.
   */
  const DRAG_SLOP = 8;
  const areaRef = useRef<View>(null);
  const areaX = useRef(0);
  const areaW = useRef(0);
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState<{ from: number; size: number } | null>(null);
  const [hoverPeg, setHoverPeg] = useState<number | null>(null);
  const dragRef = useRef<{ from: number; size: number } | null>(null);   // panResponder замыкает старое состояние

  /**
   * Положение поля на экране. Замеряем в момент захвата, а не в onLayout: measureInWindow
   * там возвращал нули (проверено отладкой 12.08 — жест доходил до захвата, но стержень
   * не определялся никогда, потому что ширина и левый край оставались нулевыми). К моменту
   * первого касания элемент заведомо на месте, и замер честный.
   */
  const syncAreaBounds = () => {
    const node: any = areaRef.current;
    if (!node) return;
    if (typeof node.getBoundingClientRect === 'function') {
      const r = node.getBoundingClientRect();
      areaX.current = r.left; areaW.current = r.width;
      return;
    }
    node.measureInWindow?.((x: number, _y: number, w: number) => { areaX.current = x; areaW.current = w; });
  };

  /** Стержень под точкой x (в координатах экрана). null — мимо поля. */
  const pegAtX = (pageX: number): number | null => {
    if (!areaW.current || !pegsRef.current.length) return null;
    const rel = pageX - areaX.current;
    if (rel < 0 || rel > areaW.current) return null;
    const n = pegsRef.current.length;
    const i = Math.floor((rel / areaW.current) * n);
    return Math.min(Math.max(i, 0), n - 1);
  };

  /** Ляжет ли диск, который в руке, на стержень idx. Правило то же, что в moveDisc. */
  const canDrop = (idx: number): boolean => {
    if (!dragging) return false;
    const dst = pegs[idx];
    return dst.length === 0 || dst[dst.length - 1] > dragging.size;
  };

  const pan = useRef(
    PanResponder.create({
      // Касание НЕ перехватываем: короткий тап должен достаться кнопке стержня —
      // это же путь, которым игру активирует скринридер. Жест включается только когда
      // палец реально поехал. Иначе один тап обработался бы дважды: и кнопкой, и здесь.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
      // ⚠️ Без Capture перетаскивание не работает вовсе: кнопка стержня забирает жест
      // на касании и держит его, а родителя система уже не спрашивает. Capture поднимает
      // вопрос ДО детей — но только когда палец сдвинулся дальше DRAG_SLOP, поэтому
      // короткий тап по-прежнему достаётся кнопке.
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,

      onPanResponderGrant: (e) => {
        syncAreaBounds();
        const idx = pegAtX(e.nativeEvent.pageX);
        if (idx === null) return;
        const peg = pegsRef.current[idx];
        if (!peg.length) return;
        const size = peg[peg.length - 1];
        dragRef.current = { from: idx, size };
        setDragging({ from: idx, size });
        setHoverPeg(idx);
        dragPos.setValue({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
      },

      onPanResponderMove: (e) => {
        if (!dragRef.current) return;
        dragPos.setValue({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
        setHoverPeg(pegAtX(e.nativeEvent.pageX));
      },

      onPanResponderRelease: (e) => {
        const held = dragRef.current;
        dragRef.current = null;
        setDragging(null);
        setHoverPeg(null);
        const target = pegAtX(e.nativeEvent.pageX);

        if (!held || target === null || target === held.from) return;
        void moveDiscRef.current(held.from, target);
      },

      onPanResponderTerminate: () => { dragRef.current = null; setDragging(null); setHoverPeg(null); },
    }),
  ).current;

  /**
   * Сам ход: снять верхний диск со стержня from и положить на to.
   *
   * Вынесен из обработчика нажатия, потому что теперь ходов два способа — нажатия и
   * перетаскивание, — и правило «на меньший диск больший не кладётся» обязано быть
   * ОДНО. Продублируй его во втором месте, и рано или поздно способы разойдутся:
   * перетаскиванием пройдёт то, что нажатием не проходит, и это будет выглядеть
   * не как разные проверки, а как то, что игра сжульничала.
   */
  const moveDisc = async (from: number, to: number) => {
    const src = pegs[from];
    const dst = pegs[to];
    if (!src.length) return;
    const top = src[src.length - 1];
    if (dst.length !== 0 && dst[dst.length - 1] <= top) {
      setErrors((e) => e + 1);
      setSelected(null);
      return;
    }
    const np = pegs.map((p) => [...p]);
    np[to].push(np[from].pop()!);
    setPegs(np);
    moveHistory.push({ from, to });
    setMoves((m) => m + 1);
    setSelected(null);
    // Победа — все диски на ПОСЛЕДНЕМ стержне (работает для 3/4/5 стержней)
    if (np[np.length - 1].length === discs) {
      if (timerRef.current) clearInterval(timerRef.current);
      const finalTime = (gameNow() - startTime) / 1000;
      setElapsedTime(finalTime);
      if (!isPreset) lvl.reach(levelRef.current + 1);   // решил пазл → +уровень
      setPhase(isPreset ? 'result' : 'cleared');
      // Башня собрана — продолжать нечего, иначе «Продолжить» позвало бы на
      // уже решённую расстановку.
      if (profile?.id) clearResume(GAME_ID, profile.id).catch(() => {});
      try {
        await saveSession({
          passed: true,   // сессия пишется только когда уровень собран
          game_type: 'hanoi',
          score: Math.max(0, Math.round(1000 - (moves + 1 - optimal(discs)) * 50 - finalTime)),
          time_seconds: finalTime,
          difficulty: `${discs} discs`,
          mode: 'classic',
          errors,
          details: { level: levelRef.current, moves: moves + 1, optimal: optimal(discs) },
        });
      } catch (e) { console.error(e); }
    }
  };

  const handlePegPress = async (idx: number) => {
    if (selected === null) {
      if (pegs[idx].length === 0) return;
      setSelected(idx);
      return;
    }
    if (selected === idx) { setSelected(null); return; }
    await moveDisc(selected, idx);
  };

  // Обработчик жеста создаётся один раз и замыкает состояние первого рендера.
  // Через ссылки он всегда видит свежие доски и функции — без этого перетаскивание
  // ходило бы по расстановке, которая была в момент запуска уровня.
  const pegsRef = useRef(pegs);
  pegsRef.current = pegs;
  const handlePegPressRef = useRef(handlePegPress);
  handlePegPressRef.current = handlePegPress;
  const moveDiscRef = useRef(moveDisc);
  moveDiscRef.current = moveDisc;

  const handleUndo = () => {
    const move = moveHistory.undo();
    if (!move) return;
    setPegs((current) => {
      const next = current.map((peg) => [...peg]);
      const disc = next[move.to].pop();
      if (disc === undefined) return current;
      next[move.from].push(disc);
      return next;
    });
    setSelected(null);
    // Намеренно НЕ уменьшаем moves: иначе оптимальный результат можно подобрать
    // перебором с бесплатной отменой. Кнопка чинит промах, но ход остаётся попыткой.
  };

  // ── незаконченная партия ────────────────────────────────────────────────
  /** Что в этой партии уже сделано руками — то, ради чего и стоит спрашивать при выходе. */
  const touched = moves > 0 || errors > 0;
  /** Живая партия: башня на экране, победа ещё не засчитана. */
  const liveGame = phase === 'playing' && pegs.length > 0;

  const snapshot = (): HanoiResume => ({
    level: levelRef.current, discs, pegs, moves, errors,
    elapsed: elapsedTime, history: moveHistory.serialize(),
  });

  /** Поднять башню из снимка — расстановка и лента отмены ровно те, что оставили. */
  const applyResume = (r: HanoiResume) => {
    levelRef.current = r.level;
    setDiscs(r.discs);
    setPegs(r.pegs.map((peg) => [...peg]));
    setMoves(r.moves); setErrors(r.errors); setSelected(null);
    moveHistory.restore(r.history);
    // Секундомер продолжаем с НАКОПЛЕННОГО: от прежнего startTime партия «шла» бы
    // всё то время, что телефон лежал в кармане.
    if (timerRef.current) clearInterval(timerRef.current);
    const start = gameNow() - Math.max(0, r.elapsed) * 1000;
    setStartTime(start); setElapsedTime(r.elapsed);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    setPhase('playing');
  };

  // Подъём партии при входе на экран. Путь зарядки (autostart) не трогаем: там
  // человек явно запустил свежий раунд, и startGame сам выбросит старую партию.
  const bootRef = useRef(false);
  useEffect(() => {
    if (autostart || bootRef.current) return;
    const pid = profile?.id;
    if (!pid) return;
    bootRef.current = true;
    let cancelled = false;
    loadResume<HanoiResume>(GAME_ID, pid, RESUME_V)
      .then((saved) => {
        if (cancelled || !saved || !Array.isArray(saved.pegs) || saved.pegs.length < 3) return;
        applyResume(saved);
      })
      .catch(() => { /* нет партии — обычный вход через экран настройки */ });
    return () => { cancelled = true; };
  }, [profile?.id, autostart]);   // eslint-disable-line react-hooks/exhaustive-deps — разовый подъём партии

  // Автосохранение по ходу партии, с задержкой: подряд идущие касания не должны
  // бить по хранилищу каждым нажатием.
  useEffect(() => {
    if (!liveGame || !touched) return;
    const pid = profile?.id;
    if (!pid) return;
    const snap = snapshot();
    const tm = setTimeout(() => { saveResume(GAME_ID, pid, RESUME_V, snap).catch(() => {}); }, 400);
    return () => clearTimeout(tm);
  }, [pegs, moves, errors, liveGame, touched]);   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Дописать партию перед уходом. Отложенная запись выше на этом моменте
   * отменяется своим clearTimeout — поэтому пишем ещё раз здесь, и с ЖИВЫМ
   * временем, а не с тем, что было на прошлом ходу.
   */
  const saveBeforeExit = () => {
    const pid = profile?.id;
    if (!pid || !liveGame || !touched) return;
    saveResume(GAME_ID, pid, RESUME_V, snapshot()).catch(() => {});
  };

  const pegW = Math.min((width - 36) / (pegs.length + 0.5), 110);   // подгон под число стержней (24→36: паддинг поля GameShell 16×2)
  const discBaseW = pegW * 0.35;
  const discStep = (pegW - discBaseW) / Math.max(discs, 2);
  const baseHue = DISC_HUE[profile?.id ?? ''] ?? 215;

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="extension-puzzle" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('hanoi')}</Text>
        <Text style={styles.configDesc}>{t('hanoiDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="hanoiIntroDesc" benefits={HANOI_BENEFITS} accent={GRADIENT[0]} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
          {t('hanoiLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>
      <LevelProgressMap
        gameId="hanoi"
        currentLevel={lvl.level} onPickLevel={lvl.pick}
        maxLevel={Math.max(15, lvl.level)}
        colors={colors}
        language={language}
      />
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </GradientSurface>
      </TouchableOpacity>
    </ScrollView>
  );

  // Единый каркас GameShell: статы — в props каркаса, отмена — в прибитом тулбаре.
  const renderPlaying = () => (
    <GameShell
      title={t('hanoi')}
      onBack={() => goBackOrHome()}
      confirmExit={liveGame && touched}
      resumable
      onSaveBeforeExit={saveBeforeExit}
      toolbar={
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('btn_undo')}
          disabled={!moveHistory.canUndo}
          onPress={handleUndo}
          style={[styles.undoBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: moveHistory.canUndo ? 1 : 0.4 }]}
        >
          <Ionicons name="arrow-undo" size={18} color={colors.text} />
          <Text style={[styles.undoBtnText, { color: colors.text }]}>{t('btn_undo')}</Text>
        </TouchableOpacity>
      }
      stats={
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{moves} / {optimal(discs)}{!isPreset ? ` · ${t('label_level_short')}${lvl.level}` : ''}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
          <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{t('secShort')}</Text>
          {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />}
        </View>
      }
    >
      <View style={styles.fieldCol}>
      <View
        style={styles.pegsArea}
        {...pan.panHandlers}
        ref={areaRef}
        onLayout={(e) => { areaW.current = e.nativeEvent.layout.width; }}
      >
        {pegs.map((peg, idx) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={idx}
            activeOpacity={0.7}
            onPress={() => handlePegPress(idx)}
            style={[
              styles.pegContainer,
              {
                width: pegW,
                // Подсветка: выбранный нажатием — синим, стержень под пальцем при
                // перетаскивании — зелёным, если диск туда ЛЯЖЕТ, и красным, если нет.
                // Ответ до отпускания: иначе про запрет узнаёшь уже ошибкой в счётчике.
                borderColor:
                  dragging && hoverPeg === idx
                    ? (canDrop(idx) ? '#22c55e' : '#f43f5e')
                    : selected === idx ? GRADIENT[0] : 'transparent',
              },
            ]}
          >
            <View style={styles.pegStack}>
              {/* ЗАЧЕМ: в peg[] индекс 0 = НИЗ стержня, последний элемент = ВЕРХ
                  (handlePegPress берёт top = from[from.length - 1]). Колонка RN рисует детей
                  сверху вниз, поэтому массив разворачиваем: без reverse широкий диск оказывался
                  наверху, а узкий у основания — перевёрнутая пирамида. key=size: размеры на
                  одном стержне уникальны, индекс после reverse нестабилен. */}
              {peg.slice().reverse()
                // Диск, который сейчас в руке, со стержня убираем: иначе он был бы
                // виден в двух местах разом, и непонятно, где он на самом деле.
                .filter((size) => !(dragging && dragging.from === idx && dragging.size === size))
                .map((size) => (
                <LinearGradient
                  key={size}
                  colors={[
                    `hsl(${baseHue}, 68%, ${Math.min(82, 55 + (size / discs) * 28)}%)`,
                    `hsl(${baseHue}, 74%, ${Math.max(34, 42 + (size / discs) * 18)}%)`,
                  ]}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={[styles.disc, { width: discBaseW + size * discStep }]}
                >
                  <View style={styles.discShine} pointerEvents="none" />
                  <Text style={styles.discLabel} numberOfLines={1}>{size}</Text>
                </LinearGradient>
              ))}
              <View style={[styles.pole, { backgroundColor: colors.text }]} />
              <View style={[styles.pegBase, { backgroundColor: colors.text, width: pegW - 12 }]} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      {/* Диск в руке. Рисуется поверх всего и следует за пальцем; смещение на половину
          ширины и на высоту диска ставит его ПОД палец, а не под него центром — иначе
          собственный палец закрывает то, что несёшь. pointerEvents='none', чтобы диск
          не перехватывал жест у поля под собой. */}
      {dragging && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragLayer,
            { transform: [{ translateX: dragPos.x }, { translateY: dragPos.y }] },
          ]}
        >
          <LinearGradient
            colors={[
              `hsl(${baseHue}, 68%, ${Math.min(82, 55 + (dragging.size / discs) * 28)}%)`,
              `hsl(${baseHue}, 74%, ${Math.max(34, 42 + (dragging.size / discs) * 18)}%)`,
            ]}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={[
              styles.disc,
              styles.discDragged,
              {
                width: discBaseW + dragging.size * discStep,
                marginLeft: -(discBaseW + dragging.size * discStep) / 2,
              },
            ]}
          >
            <View style={styles.discShine} pointerEvents="none" />
            <Text style={styles.discLabel} numberOfLines={1}>{dragging.size}</Text>
          </LinearGradient>
        </Animated.View>
      )}
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('hanoiHint')}</Text>
      </View>
    </GameShell>
  );

  // Игровая фаза — на едином каркасе GameShell; модалка правил уровня поверх
  // (обёртка View flex:1, паттерн digit-span).
  // Доска остаётся видна и после победы — она и есть награда; карточка итога
  // висит поверх неё (решение Дениса «карточка над всей доской»).
  if (phase === 'playing' || phase === 'cleared') {
    return (
      <View style={{ flex: 1 }}>
        {phase === 'cleared' && (
          <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
            <LevelCleared
          variant="overlay" gameId="hanoi" level={levelRef.current}
          stars={moves <= optimal(discs) ? 3 : moves <= Math.ceil(optimal(discs) * 1.5) ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
          </View>
        )}
        {renderPlaying()}
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
        <Text style={[styles.title, { color: colors.text }]}>{t('hanoi')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />

      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(1000 - (moves - optimal(discs)) * 50 - elapsedTime))}
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
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optionHint: { fontSize: 12, marginTop: 4 },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  // Поле каркаса центрирует контент; stretch — чтобы стержни распределялись по всей ширине
  fieldCol: { alignSelf: 'stretch', gap: 10 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, flexWrap: 'wrap' },
  statText: { fontSize: 14, fontWeight: '700' },
  // ЗАЧЕМ: без flex:1 блок стержней сжимается по своему контенту, и playArea(justifyContent:center)
  // ставит башню в вертикальный ЦЕНТР экрана, а не прибивает к низу с пустым провалом сверху.
  // alignItems:flex-end оставлен намеренно — держит основания всех стержней на одной линии.
  // (Эталон math-sprint: игровое поле по центру.)
  // RTL-пин: правило «вся башня на последнем (правом) стержне» — порядок стержней не зеркалится
  pegsArea: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingBottom: 12, writingDirection: 'ltr' },
  pegContainer: { borderWidth: 3, borderRadius: 8, paddingBottom: 4 },
  pegStack: { alignItems: 'center', justifyContent: 'flex-end', position: 'relative', minHeight: 220 },
  pole: { position: 'absolute', width: 6, height: 200, bottom: 4, borderRadius: 3, opacity: 0.3 },
  pegBase: { height: 8, borderRadius: 4 },
  // Слой в координатах ОКНА: жест отдаёт pageX/pageY, поэтому и слой абсолютный от края
  // экрана, иначе диск улетал бы на величину отступов родителя.
  dragLayer: { position: 'absolute', left: 0, top: 0, zIndex: 50 },
  discDragged: { marginTop: -34, opacity: 0.95, shadowOpacity: 0.45, shadowRadius: 8, elevation: 8 },
  disc: { height: 22, marginTop: 2, borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  discShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.28)' },
  discLabel: { position: 'absolute', left: 0, right: 0, top: 3, textAlign: 'center', fontSize: 12, fontWeight: '800', color: 'rgba(25,15,0,0.62)' },
  hintText: { fontSize: 12, textAlign: 'center' },
  undoBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 16, borderWidth: 1 },
  undoBtnText: { fontSize: 14, fontWeight: '700' },
});
