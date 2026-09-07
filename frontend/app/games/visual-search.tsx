/* psygames-game-visual-search · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
export const VS_RULES: LevelRule[] = [
  { key: 'multi', fromLevel: 4, toLevel: 7 },   // lr_visual_search_multi_*
  { key: 'conj', fromLevel: 8 },   // lr_visual_search_conj_*
];
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { gameNow } from '@/src/services/gamePause';

const GRADIENT = ['#536976', '#292e49'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 5.75 (норма AA 4.5), стало 4.60.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const VS_BENEFITS = [
  { icon: 'eye-outline',           textKey: 'benefitVs1' },
  { icon: 'scan-outline',          textKey: 'benefitVs2' },
  { icon: 'speedometer-outline',   textKey: 'benefitVs3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;
// v1.112.1: 'Г' (corner top-left) была РОТО-ДВОЙНИКОМ 'L' (corner bottom-left) — L@90°≡Г,
// под случайным поворотом [0/90/180/270] неотличимы → ложные тапы (репорт тестера). Заменена на 'I'
// (прямая черта): её повороты |/— не совпадают ни с углом (L), ни с 3-лучевым (T), ни с крестом (plus).
type Shape = 'T' | 'L' | 'I' | 'plus';

interface Item {
  x: number; y: number; rot: number; isTarget: boolean; found: boolean; shape: Shape; color: string;
  /** Ось 5: выглядит РОВНО как цель, но помечена точкой — трогать нельзя. */
  decoy: boolean;
}

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

const SHAPES_ALL: Shape[] = ['T', 'L', 'I', 'plus'];   // рото-различимый набор: T(3-луч)/L(угол)/I(черта)/plus(крест)
// Конъюнктивный поиск (фаза-2, высокие уровни): цель = цвет + форма. NEUTRAL — для feature-уровней (поиск по форме).
const NEUTRAL_STROKE = '#ffffff';
/** Фон поля И плашки-образца. Одна константа на оба места намеренно: они разъехались, и
 *  образец стал рисоваться белым по белому — см. комментарий у плашки ниже. */
const FIELD_BG = '#1f2937';
const COLORS_ALL: string[] = ['#60a5fa', '#fbbf24', '#f472b6'];   // голубой / янтарь / розовый — различимы на тёмном поле
/**
 * ЦВЕТА КОНЪЮНКЦИИ ПРИ ДАЛЬТОНИЗМЕ.
 *
 * 🔴 ЗАЧЕМ. С 8-го уровня цель задаётся ПАРОЙ «форма + цвет», и цвет тут несёт
 * смысл наравне с формой: дистрактор делит с целью ровно один признак, поэтому
 * различать цвета обязательно. Флаг дальтонизма экран не читал вовсе.
 *
 * ⚠️ ЧЕСТНО О МАСШТАБЕ. Обычная тройка НЕ так плоха, как звучало: замер с
 * имитацией даёт дейтеранопию 34.7 и протанопию 45.1 — оба выше порога, частые
 * виды дальтонизма её проходят. Проваливается только тританопия: 14.8, голубой
 * с розовым сливаются. Это редкий вид, но человеку с ним играть нечем, а флаг
 * ему не помогает никак.
 *
 * Тройка подобрана перебором с тремя условиями сразу: различимость при всех трёх
 * видах (стало 34.6), светлота под тёмное поле и запас до белого — белый занят
 * обычным режимом, где цвет не значит ничего.
 */
const COLORS_CB: string[] = ['#56b4e9', '#fc8d62', '#e78ac3'];
const CONJ_FROM_LEVEL = 8;                                        // с L8 включается конъюнкция

// «Найди фигуру такого цвета и формы» (конъюнкция) — инлайн-карта языков
const FIND_CONJ: Record<string, string> = {
  ru: 'Найди фигуру такого цвета и формы', en: 'Find the shape with this colour and form',
  es: 'Encuentra la figura de este color y forma', pt: 'Encontre a forma desta cor e formato',
  de: 'Finde die Form in dieser Farbe', zh: '找出这种颜色和形状的图形', hi: 'इस रंग और आकार की आकृति खोजें',
};

/**
 * Подсказка над полем, 7 языков (инлайн-карта, как в OrientationGuard).
 *
 * «В ЛЮБОМ ПОВОРОТЕ» — не украшение. Каждой фигуре, включая цель, назначается
 * случайный поворот 0/90/180/270 (см. makeBoard), а образец в рамке нарисован
 * в одном положении. Повёрнутая T выглядит как ⊢, повёрнутая L как ⌐ —
 * различить их можно только по типу стыка, и без явной оговорки человек ищет
 * ровно ту картинку, что показана, не находит и жмёт на похожие: «с буквой Г
 * как-то не понятно, выбираешь похожие и получается ошибка» (репорт Rulon).
 * Раунд не закрывается, пока не найдены ВСЕ цели, поэтому игра просто не
 * доходила до конца — за 14 дней ни одной сохранённой сессии ни у кого.
 */
const FIND_TXT: Record<string, string> = {
  ru: 'Найди все такие фигуры — в любом повороте',
  en: 'Find all of these shapes — in any rotation',
  es: 'Encuentra todas estas figuras — en cualquier rotación',
  pt: 'Encontre todas estas formas — em qualquer rotação',
  de: 'Finde alle diese Formen — in jeder Drehung',
  zh: '找出所有这种图形 — 任意旋转方向',
  hi: 'ये सभी आकृतियाँ खोजें — किसी भी दिशा में',
};

// Уровень (1..15+) задаёт базовую сложность; раунды внутри сессии добавляют объекты.
// Дистракторов больше с уровнем; целей 1→2→3→4 по мере роста уровня. (Конъюнктивный поиск цвет+форма — фаза 2.)
/** Экспортирован для гейта `level-rule-threshold`: порог правила сверяется ИСПОЛНЕНИЕМ этой функции. */
/**
 * 🔴 ОСЬ «ОТВЛЕЧЕНИЕ»: ПРИМАНКИ, КОТОРЫЕ НАДО НЕ ТРОГАТЬ.
 *
 * ЗАЧЕМ. Разметка по десяти осям (`search-chat/PROJECT_REF.md` §R): у зрительного
 * поиска были заняты ДВЕ — объём (18→72 объекта, целей 1→4) и сходство
 * (конъюнкция с 8-го). Всё это упирается в потолок к 15-му уровню: дальше растёт
 * лишь скорость добора объектов ВНУТРИ партии, то есть L60 и L20 начинаются
 * одинаково.
 *
 * ⚠️ ПОЧЕМУ ОБЫЧНЫЙ ОТВЛЕКАЮЩИЙ — ЭТО НЕ ОСЬ 5. Промах по отвлекающему и так
 * штрафуется, а сами они и есть предмет игры: их число — это ось 1, объём.
 * Ось 5 — это ПОДАВЛЕНИЕ: предмет, который выглядит РОВНО как цель (та же форма,
 * тот же цвет) и отличается только меткой. Его нельзя брать «на автомате», по
 * которому и идёт весь поиск, — приходится тормозить и проверять каждую находку.
 * Тот же приём, что у соседей в CPT («буквы-ловушки») и в босс-раунде счёта.
 *
 * ⚠️ ВКЛЮЧАЕТСЯ ПОСЛЕ 15-го: уровни 1..15 остаются побайтно прежними.
 */
const БЕЗ_ПРИМАНОК_ДО = 15;

export function levelParams(level: number, round: number): { count: number; targetCount: number; conjunction: boolean; decoys: number } {
  const base = Math.min(72, 14 + level * 4);                            // L1≈18 → L14≈70 объектов
  const growth = 3 + Math.floor(level / 4);                              // прирост/раунд растёт с уровнем
  const count = Math.min(96, base + (round - 1) * growth);
  const maxT = level <= 3 ? 1 : level <= 7 ? 2 : level <= 11 ? 3 : 4;    // целей: 1→2→3→4 с уровнем
  const targetCount = Math.min(maxT, 1 + Math.floor((round - 1) / 2));
  const conjunction = level >= CONJ_FROM_LEVEL;                          // фаза-2: цель по 2 признакам (цвет+форма)
  // Приманок больше каждые три уровня; шесть — предел ОСИ, а не лестницы:
  // дальше поле превращается в «не трогай ничего», и это уже другая игра.
  const decoys = Math.min(6, Math.max(0, Math.ceil((level - БЕЗ_ПРИМАНОК_ДО) / 3)));
  return { count, targetCount, conjunction, decoys };
}

/**
 * Докуда лестница РЕАЛЬНО растёт — по ПЕРВОМУ раунду уровня, то есть по тому,
 * что игрок видит, открыв уровень. Считается из `levelParams`, а не вписано.
 *
 * ⚠️ Полная подпись со всеми раундами меняется до 84-го, но там растёт лишь
 * скорость добора объектов ВНУТРИ партии; чем L60 отличается от L20 на старте —
 * ничем. Объявлять игроку 84 значило бы обещать рост, которого он не увидит.
 */
export const VISUAL_SEARCH_LEVELS: number = (() => {
  let последний = 1;
  let прежняя = JSON.stringify(levelParams(1, 1));
  for (let L = 2; L <= 200; L += 1) {
    const текущая = JSON.stringify(levelParams(L, 1));
    if (текущая !== прежняя) { последний = L; прежняя = текущая; }
  }
  return последний;
})();

/** Экспортирована для гейта `visual-search-decoy-axis`: приманки проверяются ИСПОЛНЕНИЕМ сборки, а не чтением исходника. */
export function makeBoard(count: number, targetShape: Shape, targetColor: string, targetCount: number, conjunction: boolean, w: number, h: number, palette: string[] = COLORS_ALL, decoyCount = 0): Item[] {
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const slots: { cx: number; cy: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      slots.push({ cx: c * cellW + cellW / 2, cy: r * cellH + cellH / 2 });
  const picked = shuffle(slots).slice(0, count);
  // targetCount РАЗНЫХ ячеек назначаем целями
  const targetSet = new Set(shuffle(picked.map((_, i) => i)).slice(0, targetCount));
  // Приманки берутся из НЕцелевых мест: цель приманкой стать не может, иначе
  // уровень стал бы непроходимым.
  const свободные = picked.map((_, i) => i).filter((i) => !targetSet.has(i));
  const decoySet = new Set(shuffle(свободные).slice(0, Math.min(decoyCount, свободные.length)));
  const otherShapes = SHAPES_ALL.filter((s) => s !== targetShape);
  const otherColors = palette.filter((c) => c !== targetColor);
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return picked.map((s, i) => {
    const isT = targetSet.has(i);
    let shape: Shape, color: string;
    if (isT) {
      shape = targetShape; color = conjunction ? targetColor : NEUTRAL_STROKE;
    } else if (conjunction) {
      // КОНЪЮНКЦИЯ: дистрактор делит РОВНО один признак с целью (нет элемента с обоими → нет pop-out, серийный поиск)
      if (Math.random() < 0.5) { color = targetColor; shape = pick(otherShapes); }      // тот же цвет, другая форма
      else { color = pick(otherColors); shape = targetShape; }                            // другой цвет, та же форма
    } else {
      shape = pick(otherShapes); color = NEUTRAL_STROKE;                                  // feature-поиск: только форма
    }
    const приманка = decoySet.has(i);
    if (приманка) { shape = targetShape; color = conjunction ? targetColor : NEUTRAL_STROKE; }
    return {
      x: s.cx + (Math.random() - 0.5) * cellW * 0.3,
      y: s.cy + (Math.random() - 0.5) * cellH * 0.3,
      rot: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
      isTarget: isT, found: false, shape, color, decoy: приманка,
    };
  });
}

export default function VisualSearchGame() {
  const { colors, colorblind } = useTheme();
  /** Цвет здесь несёт смысл с 8-го уровня — палитра обязана считаться с дальтонизмом. */
  const PALETTE = colorblind ? COLORS_CB : COLORS_ALL;
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('visual_search');   // уровень → тир (1=easy, 2=medium, ≥3=hard)
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [trials, setTrials] = useState(() => num('trials', 8));

  const [round, setRound] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [stimAt, setStimAt] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [now, setNow] = useState(0);   // живой таймер текущей пробы
  const [targetShape, setTargetShape] = useState<Shape>('T');  // искомая фигура раунда (меняется)
  const [targetColor, setTargetColor] = useState<string>(NEUTRAL_STROKE);  // цвет цели (конъюнкция, фаза-2)
  const conjRef = useRef(false);   // текущий раунд — конъюнктивный (цвет+форма)?
  const [targetCount, setTargetCount] = useState(1);           // сколько целей в раунде
  const [foundCount, setFoundCount] = useState(0);             // сколько уже найдено
  const [clearedPassed, setClearedPassed] = useState(true);    // прошёл ли уровень (для баннера «почти, ещё раз»)

  // рефы = источник истины логики раунда (без stale-closure при быстрых тапах и в таймере)
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const roundRef = useRef(0);
  const foundRef = useRef(0);
  const targetCountRef = useRef(1);
  const levelRef = useRef(1);            // текущий уровень партии (рулит сложностью)

  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (fbTimerRef.current) clearTimeout(fbTimerRef.current); }, []);
  // Справка правил уровня: в личной игре (в зарядке-пресете не всплываем — там свой поток,
  // а конъюнкцию подсказывает цветной образец цели)
  const levelRules = useLevelRules('visual_search', lvl.level, VS_RULES, phase === 'playing' && !isPreset);
  // живой таймер: тикаем пока идёт игра (раньше в шапке показывался прыгающий средний RT — «кривой»)
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setNow(gameNow()), 100);
    return () => clearInterval(id);
  }, [phase]);

  const boardW = Math.min(width - 32, 480);
  const boardH = Math.round(boardW * 1.0);

  const newRound = (r: number) => {
    const { count, targetCount: tc, conjunction, decoys } = levelParams(levelRef.current, r);
    const shape = SHAPES_ALL[Math.floor(Math.random() * SHAPES_ALL.length)];
    const color = conjunction ? PALETTE[Math.floor(Math.random() * PALETTE.length)] : NEUTRAL_STROKE;
    roundRef.current = r;
    targetCountRef.current = tc;
    conjRef.current = conjunction;
    foundRef.current = 0;
    setRound(r);
    setTargetShape(shape);
    setTargetColor(color);
    setTargetCount(tc);
    setFoundCount(0);
    setItems(makeBoard(count, shape, color, tc, conjunction, boardW, boardH, PALETTE, decoys));
    setFeedback(null);
    setStimAt(gameNow());
  };

  const startGame = () => {
    // личная игра → уровень рулит сложностью; пресет (зарядка) → тир маппится в уровень
    const presetDiff = (str('diff', 'medium') as Difficulty);
    const effLevel = isPreset ? ({ easy: 2, medium: 6, hard: 11 } as Record<Difficulty, number>)[presetDiff] ?? 6 : lvl.level;
    levelRef.current = effLevel;
    hitsRef.current = 0; errorsRef.current = 0; rtsRef.current = [];
    setHits(0); setErrors(0); setRts([]);
    newRound(1);
    setPhase('playing');
    setStartTime(gameNow());
  };

  const finishOrNext = async () => {
    if (roundRef.current >= trials) {
      const totalTime = (gameNow() - startTime) / 1000;
      const arr = rtsRef.current;
      const meanRt = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const last = levelParams(levelRef.current, trials);
      const passed = !isPreset && errorsRef.current <= 1;
      if (!isPreset) { if (passed) lvl.reach(lvl.level + 1); else lvl.fail(); }   // вверх / гистерезис вниз
      // непрерывный поток: провал → баннер «ещё раз», не тупик. Веха: каждые BOSS_EVERY уровней
      // прошёл → короткий босс (уровень уже засчитан reach выше), потом баннер cleared.
      if (isPreset) {
        setClearedPassed(passed);
        setPhase('result');
      } else if (passed && levelRef.current % BOSS_EVERY === 0) {
        setClearedPassed(true);
        setPhase('boss');
      } else {
        setClearedPassed(passed);
        setPhase('cleared');
      }
      try {
        await saveSession({
          passed,
          game_type: 'visual_search',
          score: Math.max(0, Math.round(hitsRef.current * 100 - errorsRef.current * 50 - meanRt * 0.05)),
          time_seconds: totalTime,
          difficulty: levelRef.current <= 3 ? 'easy' : levelRef.current <= 9 ? 'medium' : 'hard',
          mode: `${trials}t`,
          errors: errorsRef.current,
          details: { level: levelRef.current, mean_rt: Math.round(meanRt), max_items: last.count, max_targets: last.targetCount },
        });
      } catch (e) { console.error(e); }
    } else {
      newRound(roundRef.current + 1);
    }
  };

  const handlePick = (idx: number) => {
    if (feedback !== null) return;          // окно «верно/неверно» — клики заблокированы
    const it = items[idx];
    if (it.found) return;                   // эту цель уже нашли в этом раунде
    const rt = gameNow() - stimAt;
    if (it.isTarget) {
      foundRef.current += 1;
      const found = foundRef.current;
      setFoundCount(found);
      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, found: true } : x)));
      if (found >= targetCountRef.current) {
        // все цели раунда найдены → раунд засчитан, дальше следующий уровень
        hitsRef.current += 1;
        rtsRef.current = [...rtsRef.current, rt];
        setHits(hitsRef.current);
        setRts(rtsRef.current);
        setFeedback('right');
        hapticSuccess();
        fbTimerRef.current = setTimeout(() => { finishOrNext(); }, 500);
      }
      // иначе: промежуточная цель — отмечаем зелёным (found), ищем дальше без блокировки
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFeedback('wrong');
      hapticError();
      fbTimerRef.current = setTimeout(() => setFeedback(null), 450);
    }
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="scan" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('visualSearch')}</Text>
        <Text style={styles.configDesc}>{t('visualSearchDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="visualSearchIntroDesc" benefits={VS_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="visual_search" currentLevel={lvl.level} maxLevel={VISUAL_SEARCH_LEVELS} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary }]}>
          {t('vsearchLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[5, 8, 12].map((n) => (
            <TouchableOpacity
              accessibilityRole="button" key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      </View>
    </View>
  );

  // Render letter-shaped target/distractors using SVG-like primitives via Views
  // Описание фигуры для скринридера. isTarget НЕ раскрываем — это и есть
  // ответ; озвучиваем ровно то, что видно глазу: форму и цвет.
  const SHAPE_LABEL: Record<Shape, string> = { T: 'T', L: 'L', I: 'I', plus: '+' };
  const COLOR_LABEL: Record<string, string> = {
    '#60a5fa': 'color_blue', '#fbbf24': 'color_yellow', '#f472b6': 'color_red',
  };
  /**
   * ⚠️ ПРИМАНКА ОБЯЗАНА БЫТЬ СЛЫШНА, А НЕ ТОЛЬКО ВИДНА. Она отличается от цели
   * ОДНОЙ точкой — для человека с озвучкой это ноль различий, и уровень стал бы
   * непроходимым. Берётся готовый ключ `skip` («Пропустить»), переведённый на
   * все двенадцать языков: своего ключа под это не завожу, чтобы не лезть в
   * общие словари, которые сейчас правят соседние чаты.
   */
  const itemLabel = (it: Item) =>
    `${SHAPE_LABEL[it.shape]}${COLOR_LABEL[it.color] ? ', ' + t(COLOR_LABEL[it.color]).toLowerCase() : ''}` +
    (it.decoy ? `, ${t('skip')}` : '') +
    (it.found ? `, ${t('a11yFound')}` : '');

  /**
   * 🔴 БЕРЁТ ТОЛЬКО ТО, ЧТО РИСУЕТ — форму и цвет, а не весь `Item`.
   *
   * Так было не всегда, и цена узналась 07.09.2026. Образец цели рядом с
   * подсказкой не существует на поле: он собирался ЛИТЕРАЛОМ `Item` с
   * выдуманными `x`, `y`, `rot`, `isTarget`, `found`. Стоило добавить в `Item`
   * обязательное поле `decoy` (ось 5) — и литерал развалился по типам, хотя к
   * рисованию образца новое поле не имеет никакого отношения.
   *
   * С узким типом такой поломки больше не бывает: любое поле, добавленное в
   * `Item` завтра, этот вызов не заденет.
   */
  const renderLetter = (item: Pick<Item, 'shape' | 'color'>) => {
    const stroke = item.color || NEUTRAL_STROKE, sw = 3;
    const s = item.shape;
    const centerStem = s === 'T' || s === 'plus' || s === 'I';   // T, + и I — стебель по центру; L — слева
    return (
      <View style={{ width: 26, height: 26, position: 'relative' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: centerStem ? 11 : 5, width: sw, backgroundColor: stroke }} />
        {s === 'T' && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: sw, backgroundColor: stroke }} />}
        {s === 'plus' && <View style={{ position: 'absolute', top: 11, left: 0, right: 0, height: sw, backgroundColor: stroke }} />}
        {s === 'L' && <View style={{ position: 'absolute', bottom: 0, left: 5, right: 0, height: sw, backgroundColor: stroke }} />}
        {/* 'I' — только центральный стебель без перекладины (см. коммент у type Shape): прямая черта, рото-однозначна */}
      </View>
    );
  };

  // playing-фаза — на едином каркасе GameShell (ответ = тап по доске, тулбар не нужен);
  // модалка правил поверх каркаса
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('visualSearch')}
          onBack={() => goBackOrHome()}
          /** Счётчики данными (см. `HudItem`); ошибки — не в шапку (§12.4). */
          hud={[
            { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${trials}`, pop: true },
            { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
            ...(targetCount > 1 ? [{ key: 'found', icon: 'search' as const, label: t('label_found'), value: `${foundCount}/${targetCount}`, tone: 'accent' as const }] : []),
            ...(!isPreset ? [{ key: 'lvl', icon: 'flag' as const, label: t('label_level_short'), value: lvl.level }] : []),
          ]}
          /**
           * Значок правила уровня — в ПРАВЫЙ УГОЛ ШАПКИ, а не в `stats`.
           *
           * `GameShell` рисует `hud` и `stats` ОДИН ПОД ДРУГИМ (`statsFlex` —
           * колонка, :1113): пока значок лежал в `stats`, экран показывал ДВЕ
           * полосы вместо одной, и поле теряло высоту ряда. Значок не счётчик —
           * в `hud` ему не место, а `headerRight` был свободен и геометрически
           * бесплатен: строка шапки и так 58 (кнопка 48 + PAD_V 5×2).
           */
          headerRight={!isPreset ? <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} /> : undefined}
        >
          <View style={styles.fieldCol}>
            <View style={styles.hintRow}>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                {(conjRef.current ? (FIND_CONJ[language] || FIND_CONJ.en) : (FIND_TXT[language] || FIND_TXT.en))}{targetCount > 1 ? ` ×${targetCount}` : ''}
              </Text>
              {/* ⚠️ Фон задан ИНЛАЙНОМ, а не только в styles.targetRef. Снимок из репорта
                  Вали 07.08 (v1.188, ✓0 ✗4 за 65 с): замер пикселей показал плашку
                  [252,252,254] — цвет фона страницы, хотя в стиле стоит тёмный. Белая
                  фигура на белой плашке = образца не видно, и человек ищет вслепую.
                  Берём ту же константу, что и поле: разъехаться им больше нечем. */}
              <View style={[styles.targetRef, { backgroundColor: FIELD_BG }]}>
                {renderLetter({ shape: targetShape, color: targetColor || NEUTRAL_STROKE })}
              </View>
            </View>
            <View style={[styles.boardArea, { width: boardW, height: boardH, backgroundColor: FIELD_BG, borderColor: feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
              {items.map((it, i) => (
                <TouchableOpacity key={i}
                  onPress={() => handlePick(i)}
                  disabled={feedback !== null}
                  accessibilityRole="button" accessibilityLabel={itemLabel(it)}
                  accessibilityState={{ disabled: feedback !== null }}
                  style={{
                    position: 'absolute',
                    left: it.x - 16, top: it.y - 16,
                    width: 32, height: 32,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: it.found ? '#22c55e66' : 'transparent',
                    borderRadius: 4,
                    transform: [{ rotate: `${it.rot}deg` }],
                  }}
                >
                  {renderLetter(it)}
                  {it.decoy && (
                    /* Точка в центре — единственное отличие приманки от цели.
                       Своя, а не цветом: цвет с 8-го уровня уже несёт смысл. */
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute', width: 8, height: 8, borderRadius: 4,
                        backgroundColor: it.color || NEUTRAL_STROKE,
                      }}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
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
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('visualSearch')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="visual_search" passed={clearedPassed} level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 100 - errors * 50 - meanRt * 0.05))}
          time={meanRt / 1000} errors={errors}
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
  // крупный системный шрифт: заголовок не ужимался и выдавливал кнопку «назад» за край
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, marginHorizontal: 8 },
  configContainer: { padding: 16, gap: 14 },
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
  modeButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 12 },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 2, maxWidth: '100%' },
  targetRef: { width: 38, height: 38, borderRadius: 8, backgroundColor: FIELD_BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#3b82f6' },
  boardArea: { borderRadius: 12, borderWidth: 1, position: 'relative', overflow: 'hidden' },
});
