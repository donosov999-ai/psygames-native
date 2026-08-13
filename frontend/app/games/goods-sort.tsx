import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView, Image } from 'react-native';
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
import { useAutostart, useGamePreset } from '@/src/hooks/useGamePreset';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { HudBadge, JuicyButton, ScorePopupLayer, useScorePopups, hapticTap, hapticSuccess } from '@/src/components/juice';
import { sndCombo } from '@/src/services/feedback';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { a11yDecor } from '@/src/services/a11y';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const GS_RULES: LevelRule[] = [
  {
    key: 'movelimit', fromLevel: 9,
    ru: { title: 'Лимит ходов', rule: 'Теперь на уровень даётся ограниченное число перестановок — трать ходы с умом. Превысил лимит — уровень заново. Счётчик ходов в шапке: сделано/лимит.', example: 'Пример: ⇄ 12/18 — сделано 12 ходов из 18. С каждым уровнем лимит жмёт сильнее.' },
    en: { title: 'Move limit', rule: 'Each level now allows a limited number of moves — spend them wisely. Exceed the limit and the level restarts. The header counter shows used/limit.', example: 'Example: ⇄ 12/18 — 12 of 18 moves used. The limit tightens every level.' },
  },
];

const GRADIENT = ['#f7971e', '#ffd200'];
const GOODS_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitGoods1' },
  { icon: 'git-branch-outline', textKey: 'benefitGoods2' },
  { icon: 'albums-outline', textKey: 'benefitGoods3' },
];

// Товары (сгенерены Nano Banana 2, generic-этикетки — НЕ реальные бренды). Прозрачные PNG.
const GOOD_SPRITES = [
  require('../../assets/images/goods/good0.webp'),  // кола
  require('../../assets/images/goods/good1.webp'),  // лимонад
  require('../../assets/images/goods/good2.webp'),  // кефир
  require('../../assets/images/goods/good3.webp'),  // молоко
  require('../../assets/images/goods/good4.webp'),  // сок
  require('../../assets/images/goods/good5.webp'),  // йогурт
  require('../../assets/images/goods/good6.webp'),  // банан
  require('../../assets/images/goods/good7.webp'),  // яблоко
  require('../../assets/images/goods/good8.webp'),  // шоколад
  require('../../assets/images/goods/good9.webp'),  // чипсы
  require('../../assets/images/goods/good10.webp'), // хлеб
  require('../../assets/images/goods/good11.webp'), // зубная паста
  require('../../assets/images/goods/good12.webp'), // виноградный сок
  require('../../assets/images/goods/good13.webp'), // клубничный коктейль
  require('../../assets/images/goods/good14.webp'), // мишка
  require('../../assets/images/goods/good15.webp'), // кактус
  require('../../assets/images/goods/good16.webp'), // цветок
  require('../../assets/images/goods/good17.webp'), // зайка
  require('../../assets/images/goods/good18.webp'), // цыплёнок
  require('../../assets/images/goods/good19.webp'), // коала
  require('../../assets/images/goods/good20.webp'), // растение
  require('../../assets/images/goods/good21.webp'), // пингвин
  require('../../assets/images/goods/good22.webp'), // лиса
];

// Наборы товаров — ВЫБОР В МЕНЮ (как в оригинале). Каждый набор = пул индексов спрайтов.
const GOOD_SETS: { key: string; ru: string; en: string; icon: any; pool: number[] }[] = [
  { key: 'drinks', ru: 'Напитки', en: 'Drinks', icon: 'wine', pool: [0, 1, 4, 12, 13, 2, 5, 3] },
  { key: 'food', ru: 'Еда', en: 'Food', icon: 'fast-food', pool: [6, 7, 8, 9, 10, 11] },
  { key: 'toys', ru: 'Игрушки', en: 'Toys', icon: 'happy', pool: [14, 15, 16, 17, 18, 19, 20, 21, 22] },
  { key: 'mix', ru: 'Микс', en: 'Mix', icon: 'apps', pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] },
];

// Названия товаров для скринридера. Держим локально ru/en (как pieceName в
// chess-blind) вместо 23 ключей × 12 языков: игроку важно РАЗЛИЧАТЬ товары,
// а не читать их на родном — при другом языке падаем на английский.
const GOOD_NAMES_RU = ['кола','лимонад','кефир','молоко','сок','йогурт','банан','яблоко','шоколад','чипсы','хлеб','зубная паста','виноградный сок','клубничный коктейль','мишка','кактус','цветок','зайка','цыплёнок','коала','растение','пингвин','лиса'];
const GOOD_NAMES_EN = ['cola','lemonade','kefir','milk','juice','yogurt','banana','apple','chocolate','chips','bread','toothpaste','grape juice','strawberry shake','teddy bear','cactus','flower','bunny','chick','koala','plant','penguin','fox'];
const goodName = (type: number, ru: boolean) =>
  (ru ? GOOD_NAMES_RU : GOOD_NAMES_EN)[type % GOOD_NAMES_EN.length];

function GoodIcon({ type, size }: { type: number; size: number }) {
  return (
    <Image
      {...a11yDecor}
      source={GOOD_SPRITES[type % GOOD_SPRITES.length]}
      style={{ width: size, height: size, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }}
      resizeMode="contain"
    />
  );
}

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Sel = { cell: number; idx: number } | null;

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const CAP = 3;     // вместимость ячейки — 3 товара ВИДИМЫ (суть оригинала)

// Доска РАСТЁТ с уровнем: L1-7 3×3 (9), L8-11 4×3 (12), L12+ 4×4 (16) → больше типов на верхах.
function gridFor(L: number): { cols: number; rows: number } {
  if (L <= 7) return { cols: 3, rows: 3 };
  if (L <= 11) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

// Сложность по уровню: больше типов + теснее (меньше пустых ячеек для манёвра) + растущая доска.
function levelCfg(L: number, poolSize: number) {
  const { cols, rows } = gridFor(L);
  const slots = cols * rows;
  const typeCeiling = slots - 2;                                 // ≥2 пустых ячейки → всегда решаемо
  const types = Math.min(poolSize, typeCeiling, 4 + Math.floor(L / 2));   // 4 → растёт, выше 7 на больших досках
  // ⚠️ ПУСТЫЕ ЯЧЕЙКИ — ДОЛЕЙ ДОСКИ, А НЕ АБСОЛЮТНЫМ ЧИСЛОМ.
  // Было `6 - ...`: на поле 3×3 это оставляло шесть свободных из девяти — занято три
  // ячейки, две трети поля пустуют, и первый уровень решался без единой мысли.
  // Репорт Вали 12.08 дословно: «даже не все слоты заняты, это просто, какой-то позор».
  // Одно и то же число на доске 9 и на доске 16 означает разное: 67% пустоты против 37%.
  let spares = Math.max(2, Math.ceil(slots * 0.34) - Math.floor((L - 1) / 4));
  spares = Math.max(2, Math.min(spares, slots - types));
  // За L8 сложность ещё и ЛИМИТ ХОДОВ (давление эффективности).
  const over = Math.max(0, L - 8);
  const moveLimit = over > 0 ? Math.max(types * 2, types * 3 - over) : 0;   // 0 = без лимита
  return { types, spares, moveLimit, cols, rows, slots };
}

function threeSame(cell: number[]): boolean { return cell.length === 3 && cell[0] === cell[1] && cell[1] === cell[2]; }
function hasPair(cell: number[]): boolean {
  const c: Record<number, number> = {}; for (const t of cell) { c[t] = (c[t] || 0) + 1; if (c[t] === 2) return true; }
  return false;
}

// Раздать по 3 каждого выбранного типа в (slots−spares) ячеек, ≤3 в ячейке, без готовых троек.
// Всё ВИДИМО — full-information сортировка (не скрытые стопки).
function generate(pool: number[], types: number, spares: number, slots: number): number[][] {
  const chosen = shuffle(pool).slice(0, types);
  const items: number[] = [];
  chosen.forEach((tp) => { for (let k = 0; k < CAP; k++) items.push(tp); });
  const used = Math.max(types, slots - spares);
  let cells: number[][];
  let guard = 0;
  do {
    const sh = shuffle(items);
    cells = Array.from({ length: slots }, () => [] as number[]);
    let ci = 0;
    for (const it of sh) {
      for (let tries = 0; tries < used; tries++) {
        const c = ci % used; ci++;
        if (cells[c].length < CAP) { cells[c].push(it); break; }
      }
    }
    cells = shuffle(cells);
    guard++;
  } while (cells.some(threeSame) && guard < 80);
  return cells;
}

export default function GoodsSortGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, autostart } = useGamePreset();
  const chainNext = shouldChainNextLevel(useGameMode());
  const lvl = usePersistentLevel('goods_sort');   // персист достигнутого уровня (раньше сбрасывался на 1)
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [setKey, setSetKey] = useState('drinks');
  const poolRef = useRef<number[]>(GOOD_SETS[0].pool);
  useEffect(() => { poolRef.current = (GOOD_SETS.find((s) => s.key === setKey) || GOOD_SETS[0]).pool; }, [setKey]);

  const [level, setLevel] = useState(1);
  const [levelBanner, setLevelBanner] = useState<number | null>(null);
  // Сортировка в зарядке тоже двигает общую лесенку: вход через wu=1 не должен
  // подменять уже достигнутый уровень временной единицей.
  useEffect(() => { if (lvl.loaded) setLevel(lvl.level); }, [lvl.loaded, lvl.level]);
  const [cells, setCells] = useState<number[][]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [cleared, setCleared] = useState(0);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scoreRef = useRef(0); const movesRef = useRef(0);
  const gridRef = useRef({ cols: 3, rows: 3, slots: 9 });        // текущая доска — для логики каскада/reshuffle
  const [gridDim, setGridDim] = useState({ cols: 3, rows: 3 });  // для рендера полок
  const { popups, spawn } = useScorePopups();

  // Справка правил уровня: только в личной игре (в зарядке-пресете бейдж скрыт).
  // level — живой стейт партии (растёт по ходу сессии), а не lvl.level.
  const levelRules = useLevelRules('goods_sort', level, GS_RULES, phase === 'playing' && !isPreset);

  const loadLevel = (L: number) => {
    const cfg = levelCfg(L, poolRef.current.length);
    gridRef.current = { cols: cfg.cols, rows: cfg.rows, slots: cfg.slots };
    setGridDim({ cols: cfg.cols, rows: cfg.rows });
    setCells(generate(poolRef.current, cfg.types, cfg.spares, cfg.slots));
    setSel(null); setMoves(0); movesRef.current = 0;
    setStartTime(Date.now()); setElapsed(0);
  };

  const startGame = () => {
    if (!lvl.loaded) return;
    const startLvl = lvl.level;
    setCleared(0); setScore(0); scoreRef.current = 0; setLevelBanner(null);
    setLevel(startLvl);
    loadLevel(startLvl);
    setPhase('playing');   // спокойный режим — без таймера (как в оригинале «собери всё»)
  };

  // Ждём восстановленный уровень перед auto-start из зарядки.
  useAutostart(autostart && lvl.loaded, startGame);

  const advanceLevel = () => {
    const cfg = levelCfg(level, poolRef.current.length);
    if (cfg.moveLimit > 0 && movesRef.current > cfg.moveLimit) {
      // Превысил лимит ходов — уровень не засчитан.
      // ⚠️ В ЗАРЯДКЕ ПЕРЕЗАПУСКАТЬ НЕЛЬЗЯ. Сессия при провале не сохраняется, а зарядка
      // двигается именно по сохранённой сессии — значит человек застрял бы на этом шаге
      // навсегда, переигрывая один уровень. Поэтому в зарядке провал ЗАВЕРШАЕТ шаг:
      // пишем сессию с passed:false, и зарядка уходит к следующей игре.
      setLevelBanner(-1);
      if (!chainNext) {
        saveSession({
          passed: false,
          game_type: 'goods_sort', score: scoreRef.current, time_seconds: (Date.now() - startTime) / 1000,
          difficulty: level < 5 ? 'easy' : level < 10 ? 'medium' : 'hard', mode: `lvl${level}`, errors: 0,
          details: { moves: movesRef.current, level, move_limit_exceeded: true },
        }).catch((e) => console.error(e));
        return;
      }
      setTimeout(() => { setLevelBanner(null); loadLevel(level); }, 1200);
      return;
    }
    hapticSuccess();
    const done = level;
    const finalTime = (Date.now() - startTime) / 1000;
    scoreRef.current += Math.max(50, 300 - movesRef.current * 4);
    setScore(scoreRef.current);
    saveSession({
      passed: true,   // сессия пишется только когда уровень собран
      game_type: 'goods_sort', score: scoreRef.current, time_seconds: finalTime,
      difficulty: done < 5 ? 'easy' : done < 10 ? 'medium' : 'hard', mode: `lvl${done}`, errors: 0,
      details: { moves: movesRef.current, level: done },
    }).catch((e) => console.error(e));
    const next = done + 1;
    setLevel(next);
    lvl.setLevel(next);   // сохранить достигнутый уровень, включая прохождение в зарядке
    setLevelBanner(done);
// ⚠️ В ЗАРЯДКЕ СЛЕДУЮЩИЙ УРОВЕНЬ НЕ ГРУЗИМ — иначе гонка с самой зарядкой: здесь
    // через 1400 мс начинается следующий уровень, а зарядка через 2000–3500 мс уводит
    // экран к следующей игре. Репорт Вали на v1.193.0: «Сортировка товаров тоже выдаёт
    // второй уровень и вылетает в вечерней зарядке».
    setTimeout(() => { setLevelBanner(null); if (chainNext) loadLevel(next); }, 1400);
  };

  // Переместить КОНКРЕТНЫЙ товар (fromCell, fromIdx) в toCell, если там есть место; затем собрать тройки.
  const moveItem = (fromCell: number, fromIdx: number, toCell: number) => {
    if (fromCell === toCell) { setSel(null); return; }
    const src = cells[fromCell];
    if (!src || fromIdx < 0 || fromIdx >= src.length) { setSel(null); return; }
    if (cells[toCell].length >= CAP) { setSel(null); return; }   // нет места
    const ns = cells.map((c) => [...c]);
    const [item] = ns[fromCell].splice(fromIdx, 1);
    ns[toCell].push(item);
    movesRef.current += 1; setMoves(movesRef.current);
    // каскад: любая ячейка с 3 одинаковыми → собрать (+50). Спокойно, без таймед-комбо.
    let clearedNow = 0; let again = true;
    while (again) {
      again = false;
      for (let i = 0; i < gridRef.current.slots; i++) {
        if (threeSame(ns[i])) { ns[i] = []; clearedNow += 1; scoreRef.current += 50; again = true; }
      }
    }
    setCells(ns); setSel(null); setScore(scoreRef.current);
    if (clearedNow > 0) { setCleared((c) => c + clearedNow); hapticSuccess(); if (clearedNow > 1) sndCombo(clearedNow); spawn(width / 2 - 24, 150, '+' + clearedNow * 50, '#fde047'); }
    else hapticTap();
    if (ns.every((c) => c.length === 0)) setTimeout(advanceLevel, 350);
  };

  const handleItemTap = (cellI: number, idx: number) => {
    if (phase !== 'playing') return;
    if (!sel) { setSel({ cell: cellI, idx }); hapticTap(); return; }
    if (sel.cell === cellI) { setSel(sel.idx === idx ? null : { cell: cellI, idx }); return; }   // отмена / перевыбор
    moveItem(sel.cell, sel.idx, cellI);
  };
  const handleCellTap = (cellI: number) => {   // тап по свободному месту ячейки = переложить выбранное сюда
    if (phase !== 'playing' || !sel) return;
    if (sel.cell === cellI) { setSel(null); return; }
    moveItem(sel.cell, sel.idx, cellI);
  };

  // Бустер «перемешать» (как в оригинале) — переразложить оставшиеся товары, подстраховка от тупика.
  const reshuffle = () => {
    const items = cells.flat();
    if (items.length === 0) return;
    const used = Math.min(gridRef.current.slots - 2, Math.max(1, Math.ceil(items.length / CAP)));
    let ns: number[][]; let guard = 0;
    do {
      const sh = shuffle(items);
      ns = Array.from({ length: gridRef.current.slots }, () => [] as number[]);
      let ci = 0;
      for (const it of sh) { for (let tr = 0; tr < used; tr++) { const c = ci % used; ci++; if (ns[c].length < CAP) { ns[c].push(it); break; } } }
      ns = shuffle(ns);
      guard++;
    } while (ns.some(threeSame) && guard < 60);
    setCells(ns); setSel(null); hapticTap();
  };

  // ── вёрстка ──────────────────────────────────────────────────────────
  const boardW = Math.min(width - 24, 900);   // шире → товары крупнее на десктопе
  const cellW = Math.floor((boardW - 10 * 2 - 8 * (gridDim.cols - 1)) / gridDim.cols);   // cols ячеек-полок в ряд
  // Размер товара ограничен И шириной (cols в ряд), И доступной высотой (rows полок) — тянемся по высоте экрана.
  const availH = Math.max(180, height - 360);
  const itemSize = Math.max(40, Math.min(112, Math.floor((cellW - 10) / 3), Math.floor(availH / gridDim.rows) - 26));

  // Полка целиком: «Полка 4: кола, кола, пусто» — по этой строке незрячий
  // игрок понимает, где уже есть пара и куда нести третий товар.
  const ru = language === 'ru';
  const cellLabel = (i: number, cell: number[]) =>
    `${t('a11yShelf')} ${i + 1}: ` +
    (cell.length ? cell.map((tp) => goodName(tp, ru)).join(', ') : t('a11yEmpty'));

  const renderCell = (i: number) => {
    const cell = cells[i] || [];
    const isSelCell = sel?.cell === i;
    const close = hasPair(cell);   // 2 одинаковых → подсказка «положи третий»
    const canDrop = !!sel && sel.cell !== i && cell.length < CAP;
    return (
      <View key={i}
        style={[styles.cell, {
          width: cellW, height: itemSize + 22,
          borderColor: canDrop ? '#fbbf24' : close ? '#22c55e' : '#8a5a2b',
          borderWidth: canDrop || close ? 3 : 2,
        }]}>
        {/* Полка и товары — соседние кнопки, а не button внутри button.
            На web вложенные TouchableOpacity давали hydration-error и могли
            проглатывать тап при переходе вечерней зарядки через Goods Sort. */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleCellTap(i)}
          accessibilityRole="button"
          accessibilityLabel={cellLabel(i, cell)}
          accessibilityState={{ selected: isSelCell }}
          style={styles.cellDropTarget}
        />
        {/* Рисуем ТОЛЬКО реальные товары (по центру) — без пустых боксов; пустое место ячейки = куда класть */}
        <View pointerEvents="box-none" style={styles.cellRow}>
          {cell.map((tp, s) => {
            const selected = isSelCell && sel?.idx === s;
            return (
              <TouchableOpacity key={s} activeOpacity={0.7} onPress={() => handleItemTap(i, s)}
                accessibilityRole="button"
                accessibilityLabel={`${goodName(tp, ru)}, ${t('a11yShelf')} ${i + 1}`}
                accessibilityState={{ selected }}
                style={[styles.itemSlot, { width: itemSize, height: itemSize }, selected && styles.itemSel]}>
                <GoodIcon type={tp} size={itemSize - 2} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="basket" size={48} color="#3f2b00" />
        <Text style={styles.configTitle}>{t('goodsSort')}</Text>
        <Text style={styles.configDesc}>{t('goodsSortDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="goodsSortIntroDesc" benefits={GOODS_BENEFITS} accent={GRADIENT[0]} />

      {/* ВЫБОР ТОВАРОВ — как в оригинале */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('goodsSetsLabel')}</Text>
        <View style={styles.setRow}>
          {GOOD_SETS.map((s) => {
            const on = setKey === s.key;
            return (
              <TouchableOpacity
                accessibilityRole="button" key={s.key} activeOpacity={0.85} onPress={() => { setSetKey(s.key); hapticTap(); }}
                style={[styles.setBtn, { borderColor: on ? GRADIENT[0] : colors.border, backgroundColor: on ? '#fff7e0' : colors.card }]}>
                <Ionicons name={s.icon} size={22} color={on ? '#d97706' : colors.textSecondary} />
                <Text style={[styles.setBtnText, { color: on ? '#92600a' : colors.textSecondary }]}>{t('goodsSet_' + s.key)}</Text>
                <View style={styles.setPreview}>
                  {s.pool.slice(0, 4).map((p) => <GoodIcon key={p} type={p} size={18} />)}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>{t('goodsLevel')} {level}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          🛒 {levelCfg(level, poolRef.current.length).types}   ·   📦 {levelCfg(level, poolRef.current.length).slots - levelCfg(level, poolRef.current.length).spares}
        </Text>
        {level > 1 && (
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => { setLevel(1); if (!isPreset) lvl.setLevel(1); }} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
      <JuicyButton label={t('start')} icon="play" colors={GRADIENT as [string, string]} tint="#3f2b00" onPress={startGame} style={{ marginTop: 8 }} />
    </ScrollView>
  );

  // игровая фаза — на едином каркасе GameShell: HUD-бейджи в статс-строке, «перемешать» прибит
  // к низу; модалка правил уровня поверх каркаса (паттерн digit-span)
  if (phase === 'playing') {
    const remaining = cells.reduce((s, c) => s + c.length, 0);
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('goodsSort')}
          onBack={() => goBackOrHome()}
          stats={
            <View style={styles.statsRow}>
              <HudBadge icon="pricetag" label={t('goodsLevel')} value={level} colors={['#fbbf24', '#d97706']} tint="#3f2b00" />
              <HudBadge icon="star" value={score} colors={['#34d399', '#059669']} pop />
              <HudBadge icon="swap-horizontal" value={(() => { const ml = levelCfg(level, poolRef.current.length).moveLimit; return ml > 0 ? `${moves}/${ml}` : String(moves); })()} colors={['#94a3b8', '#475569']} />
              <HudBadge icon="cube" value={remaining} colors={['#60a5fa', '#2563eb']} />
              {!isPreset && <LevelRuleBadge lr={levelRules} color="#d97706" ru={language === 'ru'} />}
            </View>
          }
          toolbar={
            <TouchableOpacity
              accessibilityRole="button" onPress={reshuffle} activeOpacity={0.8} style={[styles.shuffleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="shuffle" size={18} color="#d97706" />
              <Text style={[styles.shuffleText, { color: colors.text }]}>{t('shuffleBtn')}</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goodsSortHint')}</Text>
            <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }}>
              {Array.from({ length: gridDim.rows }).map((_, row) => (
                <LinearGradient key={row} colors={['#6b4423', '#4a2e16']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.shelf, { width: boardW }]}>
                  {Array.from({ length: gridDim.cols }).map((_, col) => renderCell(row * gridDim.cols + col))}
                </LinearGradient>
              ))}
            </View>
            <ScorePopupLayer popups={popups} />
            {levelBanner !== null && (
              <View style={styles.levelBanner} pointerEvents="none">
                {levelBanner === -1 ? (
                  <Text style={styles.levelBannerText}>{t('tooManyMoves')}</Text>
                ) : (
                  <>
                    <Text style={styles.levelBannerText}>🎉 {t('goodsLevel')} {levelBanner} ✓</Text>
                    <Text style={styles.levelBannerSub}>→ {t('goodsLevel')} {levelBanner + 1}</Text>
                  </>
                )}
              </View>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('goodsSort')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'result' && (
        <GameResult score={score} time={elapsed} errors={0}
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
  configTitle: { fontSize: 22, fontWeight: '700', color: '#3f2b00' },
  configDesc: { fontSize: 13, color: '#3f2b00', opacity: 0.85, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  setRow: { flexDirection: 'row', gap: 8 },
  setBtn: { minHeight: 48, justifyContent: 'center', flex: 1, borderRadius: 16, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  setBtnText: { fontSize: 12, fontWeight: '700' },
  setPreview: { flexDirection: 'row', gap: 1, marginTop: 2 },
  fieldCol: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  hintText: { fontSize: 12, textAlign: 'center' },
  shuffleBtn: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, marginTop: 6 },
  shuffleText: { fontSize: 14, fontWeight: '700' },
  shelf: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 10, borderRadius: 12, borderBottomWidth: 6, borderBottomColor: 'rgba(0,0,0,0.4)' },
  cell: { borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5e7cf', shadowColor: '#3a230f', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  cellDropTarget: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 8 },
  cellRow: { zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  itemSlot: { justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
  itemSel: { backgroundColor: '#fff2c2', borderWidth: 2, borderColor: '#f7971e', transform: [{ translateY: -4 }] },
  levelBanner: { position: 'absolute', top: '38%', alignSelf: 'center', backgroundColor: 'rgba(247,151,30,0.97)', paddingHorizontal: 30, paddingVertical: 18, borderRadius: 18, alignItems: 'center', gap: 4 },
  levelBannerText: { color: '#3f2b00', fontSize: 24, fontWeight: '900' },
  levelBannerSub: { color: '#3f2b00', fontSize: 15, fontWeight: '700', opacity: 0.85 },
});
