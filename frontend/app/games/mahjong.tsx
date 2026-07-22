import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { HudBadge, JuicyButton, ScorePopupLayer, useScorePopups, hapticTap, hapticSuccess, hapticError } from '@/src/components/juice';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';

const GRADIENT = ['#2d6a4f', '#95d5b2'];
const MAHJONG_BENEFITS = [
  { icon: 'search-outline', textKey: 'benefitMahjong1' },
  { icon: 'git-branch-outline', textKey: 'benefitMahjong2' },
  { icon: 'eye-outline', textKey: 'benefitMahjong3' },
];

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»).
// Главное, что игрок не понимает — правило СВОБОДНОЙ плитки, поэтому оно в обоих текстах.
const MAHJONG_RULES: LevelRule[] = [
  {
    key: 'layers2', fromLevel: 6, toLevel: 10,
    ru: { title: 'Два слоя', rule: 'Плитки теперь лежат в 2 слоя. Брать можно только СВОБОДНУЮ плитку: на ней никто не лежит И у неё открыт левый или правый край. Тусклые плитки заблокированы.', example: 'Пример: плитка под другой плиткой или зажатая соседями с обоих боков — не нажимается, сначала освободи её.' },
    en: { title: 'Two layers', rule: 'Tiles now stack in 2 layers. You can only pick a FREE tile: nothing lies on it AND its left or right side is open. Dimmed tiles are blocked.', example: 'Example: a tile under another tile, or squeezed by neighbors on both sides, cannot be tapped — free it first.' },
  },
  {
    key: 'layers3', fromLevel: 11,
    ru: { title: 'Три слоя', rule: 'Пирамида теперь в 3 слоя. Правило то же: свободна плитка, на которой НИЧЕГО не лежит и у которой открыт левый ИЛИ правый край. Разбирай пирамиду сверху вниз.', example: 'Пример: нижняя плитка станет доступна, когда снимешь всё, что её накрывает, и один её бок открыт.' },
    en: { title: 'Three layers', rule: 'The pyramid now has 3 layers. Same rule: a tile is free when NOTHING lies on it and its left OR right side is open. Dismantle the pyramid top-down.', example: 'Example: a bottom tile becomes available once everything covering it is removed and one of its sides is open.' },
  },
];

// Символы тайлов — эмодзи (универсально, без ассетов). До 12 видов, кладутся ПАРАМИ.
const SYMBOLS = ['🀄', '🎋', '🌸', '🐉', '🀙', '⭐', '🍀', '🔥', '💎', '🌙', '🎴', '🐲'];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
interface Tile { id: number; x: number; y: number; layer: number; symbol: number; }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── Параметры уровня ──────────────────────────────────────────────────
// L1-5  — один слой, плоская сетка, пар 4→8.
// L6-10 — два слоя (пирамида), пар ~10→14.
// L11-15 — три слоя («черепаха» поменьше), пар ~16→20.
// pairs всегда ЧЁТНО учитывается: число тайлов = pairs*2.
function levelParams(L: number): { layers: number; pairs: number; cols: number } {
  if (L <= 5) {
    const pairs = 3 + L;                  // 4,5,6,7,8 пар
    return { layers: 1, pairs, cols: 6 };
  }
  if (L <= 10) {
    const pairs = 9 + (L - 6);            // 9,10,11,12,13 пар  (тайлов 18→26)
    return { layers: 2, pairs, cols: 7 };
  }
  const pairs = 14 + (L - 11);           // 14,15,16,17,18 пар (тайлов 28→36)
  return { layers: 3, pairs, cols: 8 };
}

// ── Построение позиций пирамиды ──────────────────────────────────────
// Сетка с ПОЛУШАГОМ (x,y в «полуклетках»): тайл занимает 2×2 полуклетки.
// Верхний слой смещён к центру и поднят, образуя классическую «черепаху».
// Возвращает ровно needTiles позиций (needTiles = pairs*2, всегда чётно).
function buildPositions(layers: number, needTiles: number, cols: number): { x: number; y: number; layer: number }[] {
  // Распределяем тайлы по слоям ПИРАМИДАЛЬНО (нижний слой больше верхних): веса layers..1.
  // Раньше slice(0,needTiles) брал только нижний слой → раскладка выходила плоской.
  const weights: number[] = [];
  for (let k = 0; k < layers; k++) weights.push(layers - k);   // напр. 3,2,1
  const wsum = weights.reduce((a, b) => a + b, 0);
  const positions: { x: number; y: number; layer: number }[] = [];
  for (let layer = 0; layer < layers; layer++) {
    const target = layer === layers - 1
      ? Math.max(2, needTiles - positions.length)              // верхний слой добирает остаток
      : Math.max(2, Math.round((needTiles * weights[layer]) / wsum));
    const layerCols = Math.max(2, cols - layer * 2);           // верхние слои уже → пирамида, и центрированы (inset=layer)
    let placed = 0, r = 0;
    while (placed < target) {
      for (let c = 0; c < layerCols && placed < target; c++) {
        positions.push({ x: (layer + c) * 2, y: (layer + r) * 2, layer });
        placed++;
      }
      r++;
    }
  }
  if (positions.length % 2 === 1) positions.pop();             // чётность для пар
  return positions;
}

// «Перекрывает ли» позиция верхнего слоя позицию нижнего (тайл 2×2 в полуклетках).
function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

// Свободен ли тайл i среди ОСТАВШИХСЯ: (а) сверху нет перекрывающего, (б) слева ИЛИ справа открыто.
function isFree(tiles: Tile[], alive: boolean[], i: number): boolean {
  const t = tiles[i];
  // (а) ничего на слое выше, перекрывающего позицию
  for (let j = 0; j < tiles.length; j++) {
    if (!alive[j] || j === i) continue;
    if (tiles[j].layer > t.layer && overlaps(tiles[j], t)) return false;
  }
  // (б) сосед на ТОМ ЖЕ слое вплотную слева / справа (та же y-полоса, x±2)
  let blockedL = false, blockedR = false;
  for (let j = 0; j < tiles.length; j++) {
    if (!alive[j] || j === i) continue;
    if (tiles[j].layer !== t.layer) continue;
    if (Math.abs(tiles[j].y - t.y) < 2) {
      if (Math.abs(tiles[j].x - (t.x - 2)) < 1) blockedL = true;
      if (Math.abs(tiles[j].x - (t.x + 2)) < 1) blockedR = true;
    }
  }
  return !(blockedL && blockedR);
}

// ── Генерация РЕШАЕМОЙ раскладки («обратный» метод) ──────────────────
// 1) Берём позиции пирамиды. 2) Повторно выбираем ДВЕ свободные позиции и
//    назначаем им одинаковый символ, «снимая» их — порядок снятия = гарантия
//    решаемости (мы строим решение задом наперёд). Символы идут парами.
function generate(layers: number, pairs: number, cols: number): Tile[] {
  const need = pairs * 2;
  let pos = buildPositions(layers, need, cols);
  // Подгоняем чётность: число позиций должно быть чётным и == need (или близко).
  if (pos.length % 2 === 1) pos = pos.slice(0, pos.length - 1);
  const total = pos.length;
  const realPairs = total / 2;

  // alive-маска по позициям; symbolOf[i] заполняем парами в обратном порядке снятия.
  const baseTiles: Tile[] = pos.map((p, i) => ({ id: i, x: p.x, y: p.y, layer: p.layer, symbol: -1 }));
  const alive = new Array(total).fill(true);
  const symbolOf = new Array(total).fill(-1);

  // последовательность символов: каждая из realPairs пар = символ (цикл по SYMBOLS).
  const symSeq = shuffle(Array.from({ length: realPairs }, (_, k) => k % SYMBOLS.length));

  let guard = 0;
  for (let p = 0; p < realPairs; p++) {
    // собрать индексы свободных живых позиций
    const free: number[] = [];
    for (let i = 0; i < total; i++) if (alive[i] && isFree(baseTiles, alive, i)) free.push(i);
    if (free.length < 2) {
      // запасной путь — взять любые две живые (теоретически не должно случаться)
      const liveLeft: number[] = [];
      for (let i = 0; i < total; i++) if (alive[i]) liveLeft.push(i);
      const sh = shuffle(liveLeft);
      const a = sh[0], b = sh[1];
      symbolOf[a] = symbolOf[b] = symSeq[p];
      alive[a] = alive[b] = false;
      continue;
    }
    const sh = shuffle(free);
    const a = sh[0], b = sh[1];
    symbolOf[a] = symbolOf[b] = symSeq[p];
    alive[a] = alive[b] = false;
    if (++guard > total * 4) break;
  }
  return baseTiles.map((t, i) => ({ ...t, symbol: symbolOf[i] >= 0 ? symbolOf[i] : 0 }));
}

export default function MahjongGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { popups, spawn } = useScorePopups();

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('mahjong');   // персист достигнутого уровня между сессиями
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [level, setLevel] = useState(1);
  const levelRef = useRef(1);
  const [levelBanner, setLevelBanner] = useState<number | null>(null);
  useEffect(() => { if (lvl.loaded && !isPreset) setLevel(lvl.level); }, [lvl.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState(0);          // снятых пар
  const [pairsTotal, setPairsTotal] = useState(0);
  const [errors, setErrors] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scoreRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // alive по id (для рендера/логики свободы из текущих tiles)
  const aliveMaskRef = useRef<boolean[]>([]);

  // Справка правил уровня (в пресете не всплываем — там свой поток).
  // levelBanner === null: не открывать модалку поверх баннера «Уровень N ✓» — пусть покажется на новой раскладке.
  const levelRules = useLevelRules('mahjong', level, MAHJONG_RULES,
    phase === 'playing' && !isPreset && levelBanner === null);

  const loadLevel = (L: number) => {
    const p = levelParams(L);
    const deck = generate(p.layers, p.pairs, p.cols);
    aliveMaskRef.current = new Array(deck.length).fill(true);
    setTiles(deck);
    setPairsTotal(deck.length / 2);
    setMatched(0); setErrors(0); setSelected(null);
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    setStartTime(start); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
  };

  const startGame = () => {
    const startLvl = (!isPreset && lvl.loaded) ? lvl.level : 1;
    scoreRef.current = 0; setScore(0);
    setLevel(startLvl); levelRef.current = startLvl; setLevelBanner(null);
    loadLevel(startLvl);
    setPhase('playing');
  };

  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
  }, []);

  const advanceLevel = (finalTime: number) => {
    hapticSuccess();
    const done = levelRef.current;
    const p = levelParams(done);
    scoreRef.current += Math.max(60, Math.round(500 - errors * 20 - finalTime * 2));
    setScore(scoreRef.current);
    saveSession({
      game_type: 'mahjong', score: scoreRef.current, time_seconds: finalTime,
      difficulty: done <= 5 ? 'easy' : done <= 10 ? 'medium' : 'hard', mode: `lvl${done}`, errors,
      details: { level: done, pairs: p.pairs, layers: p.layers },
    }).catch((e) => console.error(e));
    const next = done + 1;
    setLevel(next); levelRef.current = next;
    if (!isPreset) lvl.setLevel(next);
    setLevelBanner(done);
    bannerTimerRef.current = setTimeout(() => { setLevelBanner(null); loadLevel(next); }, 1400);
  };

  // Свободен ли тайл с данным индексом среди живых (для тапа и подсветки).
  const tileFree = (i: number) => isFree(tiles, aliveMaskRef.current, i);

  const handleTilePress = (i: number) => {
    if (phase !== 'playing') return;
    if (!aliveMaskRef.current[i]) return;
    if (!tileFree(i)) { hapticError(); return; }   // занят — не реагирует
    if (selected === null) { setSelected(i); hapticTap(); return; }
    if (selected === i) { setSelected(null); return; }   // снять выбор

    if (tiles[selected].symbol === tiles[i].symbol) {
      // пара — убираем оба
      const a = selected, b = i;
      aliveMaskRef.current[a] = false;
      aliveMaskRef.current[b] = false;
      setTiles((ts) => ts.filter((_, idx) => idx !== a && idx !== b)
        // фильтрация ломает индексы alive-маски → перестроим маску ниже
      );
      // tiles изменили длину — пересоберём alive-маску под новый массив
      const newTiles = tiles.filter((_, idx) => idx !== a && idx !== b);
      aliveMaskRef.current = new Array(newTiles.length).fill(true);
      setSelected(null);
      const m = matched + 1;
      setMatched(m);
      scoreRef.current += 20; setScore(scoreRef.current);
      hapticSuccess();
      spawn(width / 2 - 16, 120, '+1', '#a7f3d0');
      if (m >= pairsTotal) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsed(finalTime);
        advanceLevel(finalTime);
      }
    } else {
      // не совпали — перевыбор на новый
      setErrors((e) => e + 1);
      hapticError();
      setSelected(i);
    }
  };

  // Перемешать символы ОСТАВШИХСЯ тайлов (страховка от тупика) — заново решаемо.
  const reshuffle = () => {
    if (tiles.length === 0) return;
    const positions = tiles.map((t) => ({ x: t.x, y: t.y, layer: t.layer }));
    // повторно назначаем символы парами в обратном порядке снятия по ТЕКУЩИМ позициям
    const total = positions.length - (positions.length % 2);
    const baseTiles: Tile[] = positions.slice(0, total).map((p, i) => ({ id: i, x: p.x, y: p.y, layer: p.layer, symbol: -1 }));
    const alive = new Array(total).fill(true);
    const symbolOf = new Array(total).fill(-1);
    const realPairs = total / 2;
    const symSeq = shuffle(Array.from({ length: realPairs }, (_, k) => k % SYMBOLS.length));
    for (let p = 0; p < realPairs; p++) {
      const free: number[] = [];
      for (let i = 0; i < total; i++) if (alive[i] && isFree(baseTiles, alive, i)) free.push(i);
      let a: number, b: number;
      if (free.length >= 2) { const sh = shuffle(free); a = sh[0]; b = sh[1]; }
      else { const live: number[] = []; for (let i = 0; i < total; i++) if (alive[i]) live.push(i); const sh = shuffle(live); a = sh[0]; b = sh[1]; }
      symbolOf[a] = symbolOf[b] = symSeq[p];
      alive[a] = alive[b] = false;
    }
    const next = baseTiles.map((tt, i) => ({ ...tt, symbol: symbolOf[i] >= 0 ? symbolOf[i] : 0 }));
    aliveMaskRef.current = new Array(next.length).fill(true);
    setTiles(next); setSelected(null); hapticTap();
  };

  // ── вёрстка пирамиды ─────────────────────────────────────────────────
  // Габариты поля в полуклетках → размер тайла под ширину экрана.
  const maxHalfX = tiles.reduce((m, t) => Math.max(m, t.x + 2), 2);
  const maxHalfY = tiles.reduce((m, t) => Math.max(m, t.y + 2), 2);
  const boardW = Math.min(width - 36, 460);   // 24→36: поле GameShell имеет paddingHorizontal 16×2
  const half = Math.max(14, Math.floor(boardW / Math.max(8, maxHalfX)));   // размер полуклетки в px
  const tileW = half * 2 - 2;
  const tileH = half * 2 - 2;
  const layerOffset = Math.max(3, Math.round(half * 0.35));   // псевдо-3D смещение слоя
  const boardPxW = maxHalfX * half + (levelParams(level).layers) * layerOffset;
  const boardPxH = maxHalfY * half + (levelParams(level).layers) * layerOffset;

  const renderTile = (tt: Tile, i: number) => {
    const free = tileFree(i);
    const sel = selected === i;
    const left = tt.x * half + tt.layer * layerOffset;
    const top = tt.y * half - tt.layer * layerOffset;
    return (
      <TouchableOpacity
        key={tt.id}
        activeOpacity={0.85}
        onPress={() => handleTilePress(i)}
        style={[
          styles.tile,
          {
            width: tileW, height: tileH, left, top,
            zIndex: tt.layer * 100 + tt.y,
            backgroundColor: sel ? '#fde68a' : free ? '#f8fafc' : '#cbd5e1',
            borderColor: sel ? '#f59e0b' : free ? '#94a3b8' : '#94a3b8',
            opacity: free ? 1 : 0.6,
            shadowOpacity: 0.25 + tt.layer * 0.06,
          },
        ]}
      >
        <Text style={{ fontSize: tileW * 0.5, opacity: free ? 1 : 0.7 }}>{SYMBOLS[tt.symbol] ?? '🀄'}</Text>
      </TouchableOpacity>
    );
  };

  const renderConfig = () => {
    const p = levelParams(level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="grid" size={48} color="#04341f" />
          <Text style={styles.configTitle}>{t('mahjong')}</Text>
          <Text style={styles.configDesc}>{t('mahjongDesc')}</Text>
        </LinearGradient>

        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {p.pairs} {t('pairsWord')} · {p.layers} {p.layers === 1 ? t('layerOne') : t('layerMany')}
          </Text>
          {level > 1 && (
            <TouchableOpacity onPress={() => { setLevel(1); levelRef.current = 1; if (!isPreset) lvl.setLevel(1); }} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        <JuicyButton
          label={t('playLevelBtn').replace('{n}', String(level))}
          icon="play" colors={GRADIENT as [string, string]} tint="#04341f" onPress={startGame} style={{ marginTop: 8 }} />
      </ScrollView>
    );
  };

  // Единый каркас GameShell: HUD-бейджи — в props stats, «Перемешать» — в прибитом тулбаре.
  // Слои плиток (absolute-позиции) переносятся контейнером boardPxW×boardPxH целиком.
  const renderPlaying = () => (
    <GameShell
      title={t('mahjong')}
      onBack={() => goBackOrHome()}
      stats={
        <View style={styles.statsRow}>
          <HudBadge icon="flag" value={`${t('unitLevelShort')} ${level}`} colors={['#fbbf24', '#d97706']} tint="#3f2b00" pop />
          <HudBadge icon="star" value={score} colors={['#34d399', '#059669']} pop />
          <HudBadge icon="checkmark-done" value={`${matched}/${pairsTotal}`} colors={['#5eead4', '#0d9488']} pop />
          <HudBadge icon="close" value={errors} colors={['#fb7185', '#e11d48']} />
          <HudBadge icon="time" value={`${elapsed.toFixed(1)}${t('secShort')}`} colors={['#60a5fa', '#2563eb']} />
          {!isPreset && <LevelRuleBadge lr={levelRules} color="#0d9488" ru={language === 'ru'} />}
        </View>
      }
      toolbar={
        <TouchableOpacity onPress={reshuffle} activeOpacity={0.8} style={[styles.shuffleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="shuffle" size={18} color="#0d9488" />
          <Text style={[styles.shuffleText, { color: colors.text }]}>{t('shuffleBtn')}</Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.fieldCol}>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('mahjongHint')}</Text>
        <View style={{ width: boardPxW, height: boardPxH, alignSelf: 'center', marginTop: 6 }}>
          {tiles.map((tt, i) => renderTile(tt, i))}
        </View>
      </View>
    </GameShell>
  );

  // Игровая фаза — на едином каркасе GameShell; поверх (обёртка View flex:1, паттерн
  // digit-span): очки-попапы, баннер «Уровень N ✓», модалка правил уровня.
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        {renderPlaying()}
        <ScorePopupLayer popups={popups} />
        {levelBanner !== null && (
          <View style={styles.levelBanner} pointerEvents="none">
            <Text style={styles.levelBannerText}>🎉 {t('level')} {levelBanner} ✓</Text>
            <Text style={styles.levelBannerSub}>→ {t('level')} {levelBanner + 1}</Text>
          </View>
        )}
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('mahjong')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="mahjong" icon="grid" gradient={GRADIENT as [string, string]}
          skillKey="skillVisualSearch" descriptionKey="mahjongIntroDesc"
          benefits={MAHJONG_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'result' && (
        <GameResult score={score} time={elapsed} errors={errors}
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
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#04341f' },
  configDesc: { fontSize: 13, color: '#04341f', opacity: 0.85, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  fieldCol: { alignItems: 'center', gap: 8 },   // hint + контейнер слоёв плиток внутри поля каркаса
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  hintText: { fontSize: 12, textAlign: 'center' },
  tile: {
    position: 'absolute', borderRadius: 6, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#04341f', shadowRadius: 3, shadowOffset: { width: 1, height: 2 },
  },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1.5, marginTop: 8 },
  shuffleText: { fontSize: 14, fontWeight: '700' },
  levelBanner: { position: 'absolute', top: '38%', alignSelf: 'center', backgroundColor: 'rgba(45,106,79,0.97)', paddingHorizontal: 30, paddingVertical: 18, borderRadius: 18, alignItems: 'center', gap: 4 },
  levelBannerText: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  levelBannerSub: { color: '#FFF', fontSize: 15, fontWeight: '700', opacity: 0.9 },
});
