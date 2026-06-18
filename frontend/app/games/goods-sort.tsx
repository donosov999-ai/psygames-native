import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView, PanResponder, Animated, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#f7971e', '#ffd200'];
const GOODS_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitGoods1' },
  { icon: 'git-branch-outline', textKey: 'benefitGoods2' },
  { icon: 'albums-outline', textKey: 'benefitGoods3' },
];

// 6 реалистичных магазинных товаров (сгенерены Nano Banana 2, оригинальные generic-этикетки —
// COLA/LIME/KEFIR/MILK/JUICE/YOGURT, НЕ реальные бренды). Прозрачные PNG, фон вычищен.
const GOOD_SPRITES = [
  require('../../assets/images/goods/good0.png'), // кола
  require('../../assets/images/goods/good1.png'), // лимонад
  require('../../assets/images/goods/good2.png'), // кефир
  require('../../assets/images/goods/good3.png'), // молоко
  require('../../assets/images/goods/good4.png'), // сок
  require('../../assets/images/goods/good5.png'), // йогурт
];
function GoodIcon({ type, size, dim }: { type: number; size: number; dim?: boolean }) {
  return (
    <Image
      source={GOOD_SPRITES[type % 6]}
      style={{ width: size, height: size, opacity: dim ? 0.32 : 1 }}
      resizeMode="contain"
    />
  );
}

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const SLOTS = 9;   // 3 полки × 3 слота; каждый слот — СТОПКА (видно передний). 9 даёт простор для манёвра.
const COMBO_WINDOW = 3000;   // мс — окно таймед-комбо (как в оригинале RackSort): успей собрать ещё → ×2,×3…

// Раздать товары (каждый тип ×3) по слотам-стопкам. Передний = последний в массиве.
function generate(nTypes: number): number[][] {
  let stacks: number[][];
  do {
    const goods: number[] = [];
    for (let t = 0; t < nTypes; t++) for (let k = 0; k < 3; k++) goods.push(t);
    const sh = shuffle(goods);
    stacks = Array.from({ length: SLOTS }, () => [] as number[]);
    sh.forEach((g, i) => stacks[i % SLOTS].push(g));
  } while (stacks.some(topThreeSame));   // не начинать с готовой тройки наверху
  return stacks;
}
function topThreeSame(stack: number[]): boolean {
  const n = stack.length;
  return n >= 3 && stack[n - 1] === stack[n - 2] && stack[n - 2] === stack[n - 3];
}

export default function GoodsSortGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, str } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(() => (str('diff', 'medium') as 'easy' | 'medium' | 'hard'));
  const [stacks, setStacks] = useState<number[][]>([]);
  const [nTypes, setNTypes] = useState(4);
  const [selected, setSelected] = useState<number | null>(null);   // выбранный слот (берём передний товар)
  const [combo, setCombo] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreRef = useRef(0); const movesRef = useRef(0);
  // drag-перетаскивание
  const slotEls = useRef<Array<any>>(Array(SLOTS).fill(null));
  const slotRects = useRef<Array<{ x: number; y: number; w: number; h: number } | null>>(Array(SLOTS).fill(null));
  const dragFromRef = useRef<number | null>(null);
  const dragTypeRef = useRef(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const ghostXY = useRef(new Animated.ValueXY()).current;
  const [flash, setFlash] = useState<{ combo: number; pts: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboRef = useRef(0);
  const comboDeadlineRef = useRef(0);
  const [comboBar, setComboBar] = useState(0);   // 0..1 — остаток окна комбо

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const typesFor = (d: 'easy' | 'medium' | 'hard') => (d === 'easy' ? 4 : d === 'medium' ? 5 : 6);

  const startGame = () => {
    const nt = typesFor(difficulty);
    setNTypes(nt); setStacks(generate(nt));
    setSelected(null); setCombo(0); setCleared(0); setMoves(0); setScore(0);
    scoreRef.current = 0; movesRef.current = 0; comboRef.current = 0; comboDeadlineRef.current = 0; setComboBar(0);
    setPhase('playing');
    const start = Date.now(); setStartTime(start); setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
      const dl = comboDeadlineRef.current;
      if (dl) {
        if (Date.now() >= dl) { comboRef.current = 0; comboDeadlineRef.current = 0; setCombo(0); setComboBar(0); }
        else setComboBar((dl - Date.now()) / COMBO_WINDOW);
      }
    }, 100);
  };

  const finishGame = async (nt: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsed(finalTime);
    const finalScore = scoreRef.current + Math.max(0, Math.round(1200 - finalTime * 3 - movesRef.current * 5));
    scoreRef.current = finalScore; setScore(finalScore);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'goods_sort', score: finalScore, time_seconds: finalTime,
        difficulty, mode: `${nt}types`, errors: 0,
        details: { moves: movesRef.current, types: nt, cleared: nt },
      });
    } catch (e) { console.error(e); }
  };

  // переместить передний товар слота from на стопку to; затем собрать тройки сверху
  const moveTop = (from: number, to: number) => {
    if (from === to) { setSelected(null); return; }
    const src = stacks[from];
    if (src.length === 0) { setSelected(null); return; }
    const ns = stacks.map((s) => [...s]);
    const good = ns[from].pop()!;
    ns[to].push(good);
    movesRef.current += 1; setMoves(movesRef.current);

    // каскад сбора: пока на верхушке любого слота 3 одинаковых — убрать. Комбо НЕ за ход, а ПО ВРЕМЕНИ
    // (как в RackSort): каждый сбор продлевает окно ~3с; успел собрать ещё → ×2,×3…; пауза = сброс (по таймеру).
    let clearedNow = 0;
    const scoreBefore = scoreRef.current;
    let again = true;
    while (again) {
      again = false;
      for (let i = 0; i < SLOTS; i++) {
        if (topThreeSame(ns[i])) {
          ns[i].splice(ns[i].length - 3, 3);
          comboRef.current += 1; clearedNow += 1;
          scoreRef.current += 100 * comboRef.current;
          again = true;
        }
      }
    }
    setStacks(ns);
    setSelected(null);
    setScore(scoreRef.current);
    if (clearedNow > 0) {
      comboDeadlineRef.current = Date.now() + COMBO_WINDOW;   // окно на следующий сбор
      setCombo(comboRef.current);
      setComboBar(1);
      setCleared((c) => c + clearedNow);
      setFlash({ combo: comboRef.current, pts: scoreRef.current - scoreBefore });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 850);
    }

    const totalGoods = ns.reduce((sum, s) => sum + s.length, 0);
    if (totalGoods === 0) setTimeout(() => finishGame(nTypes), 350);
  };

  const handleSlotTap = (i: number) => {
    if (phase !== 'playing') return;
    if (selected === null) {
      if (stacks[i].length > 0) setSelected(i);     // берём передний товар
      return;
    }
    moveTop(selected, i);                            // кладём на этот слот (или отмена если тот же)
  };

  // ── вёрстка ──────────────────────────────────────────────────────────
  const boardW = Math.min(width - 24, 420);
  const cell = Math.floor((boardW - 10 * 2 - 14 * 2) / 3);
  const ghostSize = cell - 16;

  const slotAt = (px: number, py: number) => {
    for (let i = 0; i < SLOTS; i++) {
      const r = slotRects.current[i];
      if (r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  };
  const measureSlot = (i: number) => {
    const el = slotEls.current[i];
    if (el && el.measureInWindow) el.measureInWindow((x: number, y: number, w: number, h: number) => { slotRects.current[i] = { x, y, w, h }; });
  };
  // Перетаскивание: тап (без движения) → handleSlotTap; движение >8px → захватываем и тащим верхний товар.
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_e, g) => phase === 'playing' && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
    onPanResponderGrant: (_e, g) => {
      const from = slotAt(g.x0, g.y0);
      if (from >= 0 && stacks[from].length > 0) {
        dragFromRef.current = from;
        dragTypeRef.current = stacks[from][stacks[from].length - 1];
        ghostXY.setValue({ x: g.x0 - ghostSize / 2, y: g.y0 - ghostSize / 2 });
        setSelected(null);
        setDragFrom(from);
      }
    },
    onPanResponderMove: (_e, g) => { ghostXY.setValue({ x: g.moveX - ghostSize / 2, y: g.moveY - ghostSize / 2 }); },
    onPanResponderRelease: (_e, g) => {
      const from = dragFromRef.current;
      if (from !== null) {
        const to = slotAt(g.moveX, g.moveY);
        if (to >= 0 && to !== from) moveTop(from, to);
      }
      dragFromRef.current = null;
      setDragFrom(null);
    },
    onPanResponderTerminate: () => { dragFromRef.current = null; setDragFrom(null); },
  });

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="basket" size={48} color="#3f2b00" />
        <Text style={styles.configTitle}>{t('goodsSort')}</Text>
        <Text style={styles.configDesc}>{t('goodsSortDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDifficulty(d)}>
              <Text style={[styles.modeButtonText, { color: difficulty === d ? '#3f2b00' : colors.text }]}>
                {d === 'easy' ? t('easy') : d === 'medium' ? t('medium') : t('hard')} · {typesFor(d)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={[styles.startBtnText, { color: '#3f2b00' }]}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStack = (i: number) => {
    const full = stacks[i];
    const stack = dragFrom === i ? full.slice(0, -1) : full;   // верхний товар «в руке» при перетаскивании
    const sel = selected === i;
    const top = stack.length - 1;
    const tp = stack.length ? stack[top] : -1;
    let topRun = 0; for (let k = top; k >= 0 && stack[k] === tp; k--) topRun++;
    const close = topRun === 2;   // 2 одинаковых сверху → положи ещё один такой = сбор
    return (
      <TouchableOpacity key={i} activeOpacity={0.8} onPress={() => handleSlotTap(i)}
        ref={(el) => { slotEls.current[i] = el; }}
        onLayout={() => measureSlot(i)}
        style={[styles.slot, {
          width: cell, height: cell,
          backgroundColor: sel ? '#fff7d6' : 'rgba(0,0,0,0.18)',
          borderColor: sel ? GRADIENT[0] : close ? '#22c55e' : 'rgba(255,255,255,0.18)',
          borderWidth: sel || close ? 3 : 1,
        }]}>
        {/* «в тени»: за передним есть ещё товары — тёмный силуэт, тип не раскрываем (память/планирование) */}
        {stack.length > 1 && (
          <View style={{ position: 'absolute', right: 7, bottom: 7, width: cell * 0.58, height: cell * 0.58, borderRadius: 8, backgroundColor: '#0b1220', opacity: 0.5 }} />
        )}
        {stack.length > 0 && <GoodIcon type={stack[top]} size={cell - 16} />}
        {close && (
          <View style={[styles.countBadge, { backgroundColor: '#22c55e' }]}><Text style={styles.countText}>{topRun}</Text></View>
        )}
      </TouchableOpacity>
    );
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: '#22c55e' }]}>⭐ {score}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>↔ {moves}</Text>
        <Text style={[styles.statText, { color: colors.textSecondary }]}>{elapsed.toFixed(0)}s</Text>
      </View>
      {combo > 1 && (
        <View style={styles.comboWrap}>
          <Text style={styles.comboBig}>🔥 ×{combo}</Text>
          <View style={styles.comboTrack}><View style={[styles.comboFill, { width: `${Math.round(comboBar * 100)}%` }]} /></View>
        </View>
      )}
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goodsSortHint')}</Text>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }} {...pan.panHandlers}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={[styles.shelf, { width: boardW }]}>
            {[0, 1, 2].map((col) => renderStack(row * 3 + col))}
          </View>
        ))}
      </View>
      {flash && (
        <View style={styles.flashBanner} pointerEvents="none">
          <Text style={styles.flashText}>✨ +{flash.pts}{flash.combo > 1 ? `  ×${flash.combo}` : ''}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('goodsSort')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="goodsSort" icon="basket" gradient={GRADIENT as [string, string]}
          skillKey="skillPlanningWM" descriptionKey="goodsSortIntroDesc"
          benefits={GOODS_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'playing' && dragFrom !== null && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, zIndex: 50, transform: ghostXY.getTranslateTransform() }}>
          <GoodIcon type={dragTypeRef.current} size={ghostSize} />
        </Animated.View>
      )}
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
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#3f2b00' },
  configDesc: { fontSize: 13, color: '#3f2b00', opacity: 0.85, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 12, gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center' },
  shelf: { flexDirection: 'row', justifyContent: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#5b3a1e', borderBottomWidth: 5, borderBottomColor: 'rgba(0,0,0,0.35)' },
  slot: { borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  countBadge: { position: 'absolute', bottom: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center' },
  countText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  flashBanner: { position: 'absolute', top: '40%', alignSelf: 'center', backgroundColor: 'rgba(34,197,94,0.95)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 },
  flashText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  comboWrap: { alignItems: 'center', gap: 4 },
  comboBig: { fontSize: 24, fontWeight: '900', color: '#f59e0b' },
  comboTrack: { width: 130, height: 6, borderRadius: 3, backgroundColor: 'rgba(245,158,11,0.25)', overflow: 'hidden' },
  comboFill: { height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
});
