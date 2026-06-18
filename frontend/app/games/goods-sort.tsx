import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Path, Ellipse, Line } from 'react-native-svg';
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

// 6 «нарисованных» товаров (SVG, не эмодзи). Каждый — узнаваемый силуэт + свой цвет.
const GOOD_COLOR = ['#3b82f6', '#ef4444', '#f97316', '#7c4a23', '#22c55e', '#a855f7'];
function GoodIcon({ type, size, dim }: { type: number; size: number; dim?: boolean }) {
  const c = GOOD_COLOR[type % 6];
  const o = dim ? 0.28 : 1;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={o}>
      {type === 0 && (<>{/* бутылка воды */}
        <Rect x="40" y="8" width="20" height="12" rx="3" fill="#94a3b8" />
        <Rect x="34" y="20" width="32" height="72" rx="12" fill={c} />
        <Rect x="34" y="46" width="32" height="14" fill="#ffffff" opacity={0.85} />
      </>)}
      {type === 1 && (<>{/* банка газировки */}
        <Rect x="30" y="16" width="40" height="70" rx="8" fill={c} />
        <Ellipse cx="50" cy="18" rx="20" ry="6" fill="#cbd5e1" />
        <Rect x="44" y="40" width="12" height="26" rx="2" fill="#ffffff" opacity={0.85} />
      </>)}
      {type === 2 && (<>{/* пакет сока + трубочка */}
        <Rect x="32" y="22" width="36" height="64" rx="3" fill={c} />
        <Line x1="60" y1="22" x2="72" y2="6" stroke="#e11d48" strokeWidth="5" strokeLinecap="round" />
        <Rect x="38" y="40" width="24" height="18" rx="2" fill="#ffffff" opacity={0.85} />
      </>)}
      {type === 3 && (<>{/* стакан кофе с крышкой */}
        <Path d="M34 32 L66 32 L60 90 L40 90 Z" fill={c} />
        <Rect x="30" y="24" width="40" height="10" rx="4" fill="#5b3a1e" />
        <Rect x="46" y="12" width="8" height="12" rx="2" fill="#5b3a1e" />
      </>)}
      {type === 4 && (<>{/* пакет молока (gable) */}
        <Path d="M30 34 L50 14 L70 34 L70 90 L30 90 Z" fill={c} />
        <Path d="M30 34 L50 14 L70 34 Z" fill="#ffffff" opacity={0.5} />
        <Rect x="40" y="50" width="20" height="22" rx="2" fill="#ffffff" opacity={0.85} />
      </>)}
      {type === 5 && (<>{/* банка варенья */}
        <Rect x="32" y="30" width="36" height="58" rx="8" fill={c} />
        <Rect x="36" y="16" width="28" height="16" rx="3" fill="#fbbf24" />
        <Ellipse cx="50" cy="58" rx="13" ry="9" fill="#ffffff" opacity={0.85} />
      </>)}
    </Svg>
  );
}

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const SLOTS = 9;   // 3 полки × 3 слота; каждый слот — СТОПКА (видно передний). 9 даёт простор для манёвра.

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

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const typesFor = (d: 'easy' | 'medium' | 'hard') => (d === 'easy' ? 4 : d === 'medium' ? 5 : 6);

  const startGame = () => {
    const nt = typesFor(difficulty);
    setNTypes(nt); setStacks(generate(nt));
    setSelected(null); setCombo(0); setCleared(0); setMoves(0); setScore(0);
    scoreRef.current = 0; movesRef.current = 0;
    setPhase('playing');
    const start = Date.now(); setStartTime(start); setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
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

    // каскад сбора: пока на верхушке любого слота 3 одинаковых — убрать, начислить комбо
    let localCombo = combo;
    let clearedNow = 0;
    let again = true;
    while (again) {
      again = false;
      for (let i = 0; i < SLOTS; i++) {
        if (topThreeSame(ns[i])) {
          ns[i].splice(ns[i].length - 3, 3);
          localCombo += 1; clearedNow += 1;
          scoreRef.current += 100 * localCombo;
          again = true;
        }
      }
    }
    if (clearedNow === 0) localCombo = 0;   // ход без сбора обнуляет комбо
    setStacks(ns);
    setSelected(null);
    setCombo(localCombo);
    setScore(scoreRef.current);
    if (clearedNow > 0) setCleared((c) => c + clearedNow);

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
    const stack = stacks[i];
    const sel = selected === i;
    const top = stack.length - 1;
    return (
      <TouchableOpacity key={i} activeOpacity={0.8} onPress={() => handleSlotTap(i)}
        style={[styles.slot, {
          width: cell, height: cell,
          backgroundColor: sel ? '#fff7d6' : 'rgba(0,0,0,0.18)',
          borderColor: sel ? GRADIENT[0] : 'rgba(255,255,255,0.18)',
          borderWidth: sel ? 3 : 1,
        }]}>
        {/* «в тени»: за передним есть ещё товары — тёмный силуэт, тип не раскрываем (память/планирование) */}
        {stack.length > 1 && (
          <View style={{ position: 'absolute', right: 7, bottom: 7, width: cell * 0.58, height: cell * 0.58, borderRadius: 8, backgroundColor: '#0b1220', opacity: 0.5 }} />
        )}
        {stack.length > 0 && <GoodIcon type={stack[top]} size={cell - 16} />}
        {stack.length > 0 && (
          <View style={styles.countBadge}><Text style={styles.countText}>{stack.length}</Text></View>
        )}
      </TouchableOpacity>
    );
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: '#22c55e' }]}>⭐ {score}</Text>
        {combo > 1 && <Text style={[styles.statText, { color: '#f59e0b' }]}>🔥 Комбо ×{combo}</Text>}
        <Text style={[styles.statText, { color: colors.text }]}>↔ {moves}</Text>
        <Text style={[styles.statText, { color: colors.textSecondary }]}>{elapsed.toFixed(0)}s</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goodsSortHint')}</Text>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={[styles.shelf, { width: boardW }]}>
            {[0, 1, 2].map((col) => renderStack(row * 3 + col))}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('goodsSort')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="goodsSort" icon="basket" gradient={GRADIENT as [string, string]}
          skillKey="skillPlanningWM" descriptionKey="goodsSortIntroDesc"
          benefits={GOODS_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={score} time={elapsed} errors={0}
          onPlayAgain={() => setPhase('config')} onGoHome={() => router.back()}
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
});
