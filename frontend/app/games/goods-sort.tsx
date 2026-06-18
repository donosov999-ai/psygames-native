import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#f7971e', '#ffd200'];
const GOODS = ['🥤', '🧃', '☕', '🍪', '🍫', '🥫', '🧴', '🥛'];   // товары на полках
const GOODS_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitGoods1' },
  { icon: 'git-branch-outline', textKey: 'benefitGoods2' },
  { icon: 'albums-outline', textKey: 'benefitGoods3' },
];

type Good = { type: number; hidden: boolean };
type Slot = Good | null;
type GamePhase = 'intro' | 'config' | 'playing' | 'result';

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Раскладка: nTypes типов × 3 + одна пустая полка (3 пустых слота для манёвра).
// Стартуем из РЕШЁННОГО состояния и мешаем валидными ходами → всегда решаемо.
function generate(nTypes: number): { slots: Slot[]; nShelves: number } {
  const nShelves = nTypes + 1;
  const slots: Slot[] = new Array(nShelves * 3).fill(null);
  for (let i = 0; i < nTypes; i++) for (let j = 0; j < 3; j++) slots[i * 3 + j] = { type: i, hidden: false };
  // перемешиваем: переносим случайный товар в случайный пустой слот
  for (let k = 0; k < nTypes * 9; k++) {
    const filled: number[] = []; const empty: number[] = [];
    slots.forEach((s, i) => (s ? filled : empty).push(i));
    const from = filled[Math.floor(Math.random() * filled.length)];
    const to = empty[Math.floor(Math.random() * empty.length)];
    slots[to] = slots[from]; slots[from] = null;
  }
  // прячем ~nTypes товаров «в тень»
  const filledIdx = slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  shuffle(filledIdx).slice(0, nTypes).forEach((i) => { (slots[i] as Good).hidden = true; });
  return { slots, nShelves };
}

function lockedSet(slots: Slot[], nShelves: number, prev: Set<number>): Set<number> {
  const next = new Set(prev);
  for (let sh = 0; sh < nShelves; sh++) {
    if (next.has(sh)) continue;
    const a = slots[sh * 3], b = slots[sh * 3 + 1], c = slots[sh * 3 + 2];
    if (a && b && c && a.type === b.type && b.type === c.type) next.add(sh);
  }
  return next;
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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [nShelves, setNShelves] = useState(5);
  const [nTypes, setNTypes] = useState(4);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [peeks, setPeeks] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const movesRef = useRef(0); const peeksRef = useRef(0);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const typesFor = (d: 'easy' | 'medium' | 'hard') => (d === 'easy' ? 4 : d === 'medium' ? 5 : 6);

  const startGame = () => {
    const nt = typesFor(difficulty);
    const { slots: sl, nShelves: ns } = generate(nt);
    const lk = lockedSet(sl, ns, new Set());           // вдруг после перемешивания уже есть тройка
    setNTypes(nt); setNShelves(ns); setSlots(sl); setLocked(lk);
    setSelected(null); setMoves(0); setPeeks(0); movesRef.current = 0; peeksRef.current = 0;
    setPhase('playing');
    const start = Date.now(); setStartTime(start); setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
  };

  const finishGame = async (finalSlots: Slot[], nt: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsed(finalTime);
    const score = Math.max(0, Math.round(2200 - movesRef.current * 20 - peeksRef.current * 40 - finalTime * 2));
    setPhase('result');
    try {
      await saveSession({
        game_type: 'goods_sort',
        score,
        time_seconds: finalTime,
        difficulty,
        mode: `${nt}types`,
        errors: 0,
        details: { moves: movesRef.current, peeks: peeksRef.current, types: nt },
      });
    } catch (e) { console.error(e); }
  };

  // применить итог хода: пересчёт замков, открытие товаров на собранных полках, проверка победы
  const settle = (ns: Slot[]) => {
    const nextLocked = lockedSet(ns, nShelves, locked);
    const finalSlots = ns.map((g, idx) => (g && nextLocked.has(Math.floor(idx / 3)) && g.hidden ? { ...g, hidden: false } : g));
    setSlots(finalSlots);
    if (nextLocked.size !== locked.size) setLocked(nextLocked);
    if (nextLocked.size >= nTypes) setTimeout(() => finishGame(finalSlots, nTypes), 450);
  };

  const handleSlotTap = (i: number) => {
    if (phase !== 'playing') return;
    if (locked.has(Math.floor(i / 3))) return;          // собранная полка зафиксирована
    const cur = slots[i];

    // тап по «теневому» товару = подсмотреть (открыть). Цена — peek (снижает счёт).
    if (cur && cur.hidden) {
      const ns = slots.map((g, idx) => (idx === i ? { ...(g as Good), hidden: false } : g));
      setSlots(ns);
      peeksRef.current += 1; setPeeks(peeksRef.current);
      setSelected(i);
      return;
    }
    if (selected === null) { if (cur) setSelected(i); return; }
    if (selected === i) { setSelected(null); return; }

    // своп содержимого выбранного слота и текущего
    const ns = [...slots];
    const tmp = ns[selected]; ns[selected] = ns[i]; ns[i] = tmp;
    setSelected(null);
    movesRef.current += 1; setMoves(movesRef.current);
    settle(ns);
  };

  // ── вёрстка ──────────────────────────────────────────────────────────
  const boardW = Math.min(width - 24, 420);
  const cell = Math.floor((boardW - 8 * 2 - 12 * 2) / 3);   // 3 слота + зазоры + паддинг полки

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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: '#22c55e' }]}>📦 {locked.size}/{nTypes}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>↔ {moves}</Text>
        <Text style={[styles.statText, { color: '#f59e0b' }]}>👁 {peeks}</Text>
        <Text style={[styles.statText, { color: colors.textSecondary }]}>{elapsed.toFixed(0)}s</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goodsSortHint')}</Text>
      <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 10, paddingVertical: 6 }} showsVerticalScrollIndicator={false}>
        {Array.from({ length: nShelves }).map((_, sh) => {
          const isLocked = locked.has(sh);
          return (
            <View key={sh} style={[styles.shelf, { width: boardW, backgroundColor: isLocked ? '#16341f' : '#5b3a1e' }]}>
              {[0, 1, 2].map((j) => {
                const i = sh * 3 + j;
                const g = slots[i];
                const sel = selected === i;
                return (
                  <TouchableOpacity key={j} activeOpacity={0.7} onPress={() => handleSlotTap(i)}
                    style={[styles.slot, {
                      width: cell, height: cell,
                      backgroundColor: sel ? '#fff7d6' : 'rgba(0,0,0,0.18)',
                      borderColor: sel ? GRADIENT[0] : 'rgba(255,255,255,0.18)',
                      borderWidth: sel ? 3 : 1,
                    }]}>
                    {g ? (
                      g.hidden
                        ? <View style={styles.shadowGood}><Text style={styles.shadowQ}>?</Text></View>
                        : <Text style={{ fontSize: cell * 0.5 }}>{GOODS[g.type]}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              {isLocked && (
                <View style={styles.lockBadge}><Ionicons name="checkmark" size={16} color="#fff" /></View>
              )}
            </View>
          );
        })}
      </ScrollView>
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
        <GameResult score={Math.max(0, Math.round(2200 - moves * 20 - peeks * 40 - elapsed * 2))}
          time={elapsed} errors={0}
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
  shelf: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.3)' },
  slot: { borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  shadowGood: { width: '78%', height: '78%', borderRadius: 8, backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center', opacity: 0.92 },
  shadowQ: { color: '#9ca3af', fontSize: 22, fontWeight: '900' },
  lockBadge: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center' },
});
