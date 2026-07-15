/**
 * Trail Making Test (TMT) — соединяй узлы по порядку.
 *
 * Уровни (persist, паттерн cpt/simon): ручные селекторы режима (A/B) и числа
 * узлов заменены на usePersistentLevel('trail_making') + levelParams. Ось:
 *   L1-7  — Trail-A: только числа, узлов 6 → 12, бюджет времени на узел сжимается
 *   L8-15 — Trail-B: чередование число↔буква (переключение), 8 → 22 узла
 * Проход уровня: уложился в лимит времени уровня и ≤2 ошибок → LevelCleared (авто-поток).
 * Пресеты зарядки (mode/count из URL-params) играются как раньше, без reach/fail.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import Svg, { Line } from 'react-native-svg';
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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';

const GRADIENT = ['#fc6076', '#ff9a44'];
const TRAIL_BENEFITS = [
  { icon: 'swap-horizontal-outline', textKey: 'benefitTrail1' },
  { icon: 'flash-outline', textKey: 'benefitTrail2' },
  { icon: 'pulse-outline', textKey: 'benefitTrail3' },
];

const RU_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХ';
const EN_LETTERS = 'ABCDEFGHIJKLMNOPQRST';

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Mode = 'A' | 'B';

// Проход уровня: не больше стольких ошибок (+ уложиться в лимит времени уровня)
const MAX_PASS_ERRORS = 2;
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

// Уровень 1..15 (классическая ось TMT):
//   L1-7  — Trail-A: только числа, узлов 6 → 12, бюджет на узел 2.6с → 1.7с
//   L8-15 — Trail-B: чередование 1→А→2→Б…, пары 4 → 11 (узлов 8 → 22), бюджет 3.3с → 2.25с
// count — параметр makeNodes (для B это число ПАР, узлов вдвое больше).
function levelParams(level: number): { mode: Mode; count: number; totalNodes: number; timeLimitSec: number } {
  if (level <= 7) {
    const count = 5 + level;                                  // 6 → 12 узлов
    const perNode = 2.6 - (level - 1) * 0.15;                 // 2.6с → 1.7с на узел
    return { mode: 'A', count, totalNodes: count, timeLimitSec: Math.round(count * perNode) };
  }
  const count = Math.min(11, level - 4);                      // пары число+буква: 4 → 11
  const totalNodes = count * 2;                               // 8 → 22 узла
  const perNode = Math.max(2.1, 3.3 - (level - 8) * 0.15);    // 3.3с → 2.25с на узел
  return { mode: 'B', count, totalNodes, timeLimitSec: Math.round(totalNodes * perNode) };
}

interface Node { label: string; x: number; y: number; }

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function makeNodes(mode: Mode, n: number, lang: string, w: number, h: number): Node[] {
  const letters = lang === 'ru' ? RU_LETTERS : EN_LETTERS;
  const labels: string[] = [];
  if (mode === 'A') {
    for (let i = 1; i <= n; i++) labels.push(String(i));
  } else {
    // 1, A, 2, Б, 3, В …
    for (let i = 0; i < n; i++) {
      labels.push(String(i + 1));
      if (i < letters.length) labels.push(letters[i]);
    }
  }
  // Раскладка по «дрожащей сетке»: узлы гарантированно не накладываются.
  // (Случайная выборка с отклонением при 22 узлах давала перекрытия — узел
  // оказывался под другим и не нажимался. Теперь каждый узел — своя ячейка
  // перемешанной сетки + небольшой джиттер, чтобы не выглядело линейкой.)
  const N = labels.length;
  const pad = 30;
  const gw = Math.max(1, w - pad * 2), gh = Math.max(1, h - pad * 2);
  const cols = Math.max(1, Math.round(Math.sqrt((N * gw) / gh)));
  const rows = Math.ceil(N / cols);
  const cellW = gw / cols, cellH = gh / rows;
  const cells: number[] = [];
  for (let i = 0; i < cols * rows; i++) cells.push(i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const jitter = 0.2;   // доля ячейки под случайное смещение (не линейка, но и не наезд)
  const nodes: Node[] = labels.map((lbl, idx) => {
    const cell = cells[idx];
    const cx = cell % cols, cy = Math.floor(cell / cols);
    const x = pad + cellW * (cx + 0.5) + (Math.random() - 0.5) * cellW * jitter;
    const y = pad + cellH * (cy + 0.5) + (Math.random() - 0.5) * cellH * jitter;
    return { label: lbl, x, y };
  });
  return nodes;
}

export default function TrailMakingGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('trail_making');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [clearedPassed, setClearedPassed] = useState(true);
  // mode/count как state — только для пресетов зарядки (init из URL-params);
  // в уровневом режиме параметры приходят из levelParams и живут в рефах
  const [mode, setMode] = useState<Mode>(() => (str('mode', 'B') as Mode));
  const [count, setCount] = useState(() => num('count', 8));
  const [timeLimit, setTimeLimit] = useState(0);   // 0 = без лимита (пресет)
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Рефы — параметры и счётчики раунда вне ре-рендеров (паттерн simon/cpt):
  // finish() читает их, а не state, чтобы не поймать stale closure.
  const levelRef = useRef(1);
  const modeRef = useRef<Mode>('B');
  const countRef = useRef(8);
  const totalNodesRef = useRef(0);
  const timeLimitRef = useRef(0);
  const errorsRef = useRef(0);
  const startTimeRef = useRef(0);

  const playW = Math.min(width - 32, 600);
  const playH = Math.min(height * 0.55, 460);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startGame = () => {
    let m: Mode;
    let c: number;
    if (isPreset) {
      // Пресет зарядки: ручные параметры из URL, без порога и без reach/fail
      m = mode; c = count;
      timeLimitRef.current = 0;
    } else {
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      m = p.mode; c = p.count;
      timeLimitRef.current = p.timeLimitSec;
      setMode(m); setCount(c);
    }
    modeRef.current = m;
    countRef.current = c;
    const newNodes = makeNodes(m, c, language, playW, playH);
    totalNodesRef.current = newNodes.length;
    setTimeLimit(timeLimitRef.current);
    setNodes(newNodes);
    setCurrentIdx(0);
    errorsRef.current = 0;
    setErrors(0);
    setElapsedTime(0);
    setPhase('playing');
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    startTimeRef.current = start;
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const finish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const e = errorsRef.current;
    const totalNodes = totalNodesRef.current;
    const accuracy = totalNodes + e > 0 ? totalNodes / (totalNodes + e) : 1;
    // Проход уровня: уложился в лимит времени уровня и ≤2 ошибок
    const passed = !isPreset && timeLimitRef.current > 0
      && finalTime <= timeLimitRef.current && e <= MAX_PASS_ERRORS;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();   // гистерезис понижения (3 провала подряд → −1)
    if (isPreset) {
      setPhase('result');             // пресет зарядки: экран статистики, уровень не трогаем
    } else if (passed && levelRef.current % BOSS_EVERY === 0) {
      // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
      setClearedPassed(true);
      setPhase('boss');
    } else {
      setClearedPassed(passed);       // непрерывный поток: провал уровня → баннер «почти, ещё раз», не тупик
      setPhase('cleared');            // авто-поток к следующему уровню (или рестарт того же при !passed)
    }
    try {
      await saveSession({
        game_type: 'trail_making',
        score: Math.max(0, Math.round(1000 - finalTime * 5 - e * 30)),
        time_seconds: finalTime,
        difficulty: `Trail-${modeRef.current}`,
        mode: `${countRef.current}n`,
        errors: e,
        details: {
          level: levelRef.current,
          hits: countRef.current,
          errors: e,
          total_nodes: countRef.current,
          n_nodes: totalNodes,                       // фактическое число узлов (для B = 2×count)
          completion_time: finalTime,
          accuracy: Math.round(accuracy * 100),
          ...(timeLimitRef.current > 0 ? { time_limit_s: timeLimitRef.current } : {}),
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleNodePress = async (idx: number) => {
    if (idx === currentIdx) {
      hapticSuccess();
      const next = currentIdx + 1;
      setCurrentIdx(next);
      if (next >= nodes.length) await finish();
    } else if (idx > currentIdx) {
      hapticError();
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const ru = language === 'ru';
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="swap-horizontal" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('trailMaking')}</Text>
          <Text style={styles.configDesc}>{t('trailMakingDesc')}</Text>
        </LinearGradient>

        <LevelProgressMap gameId="trail_making" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {ru ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {p.mode === 'A'
              ? (ru ? `Trail-A · числа 1→${p.count}` : `Trail-A · numbers 1→${p.count}`)
              : (ru ? 'Trail-B · чередование 1→А→2→Б…' : 'Trail-B · alternate 1→A→2→B…')}
            {ru ? ` · ${p.totalNodes} узлов` : ` · ${p.totalNodes} nodes`}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {ru
              ? `Проход уровня: пройти цепочку за ≤${p.timeLimitSec} с и сделать не больше ${MAX_PASS_ERRORS} ошибок`
              : `To pass: finish the trail within ${p.timeLimitSec}s with at most ${MAX_PASS_ERRORS} errors`}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{currentIdx}/{nodes.length}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        {/* Лимит времени уровня виден игроку; просрочил — таймер краснеет */}
        <Text style={[styles.statText, { color: timeLimit > 0 && elapsedTime > timeLimit ? '#f43f5e' : colors.text }]}>
          {elapsedTime.toFixed(1)}{timeLimit > 0 ? `/${timeLimit}` : ''}{language === 'ru' ? 'с' : 's'}
        </Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {currentIdx < nodes.length ? `${t('nextLabel')}: ${nodes[currentIdx].label}` : t('done')}
      </Text>
      <View style={[styles.canvas, { width: playW, height: playH, backgroundColor: colors.surface }]}>
        <Svg width={playW} height={playH} style={StyleSheet.absoluteFill as any}>
          {nodes.slice(0, currentIdx).map((n, i) => {
            if (i === 0) return null;
            const prev = nodes[i - 1];
            return (
              <Line
                key={i}
                x1={prev.x} y1={prev.y} x2={n.x} y2={n.y}
                stroke={GRADIENT[0]} strokeWidth={4}
              />
            );
          })}
        </Svg>
        {nodes.map((n, i) => {
          const done = i < currentIdx;
          let bg = colors.card;
          let textColor = colors.text;
          let borderColor = colors.textSecondary;   // все невыполненные узлы — одинаковая заметная рамка
          // следующий узел НЕ подсвечиваем: искать его по последовательности и есть суть игры (было: оранжевая рамка выдавала ГДЕ он)
          if (done) { bg = GRADIENT[0]; textColor = '#FFF'; borderColor = GRADIENT[0]; }
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              onPress={() => handleNodePress(i)}
              style={[
                styles.node,
                {
                  left: n.x - 22,
                  top: n.y - 22,
                  backgroundColor: bg,
                  borderColor,
                  borderWidth: 2,
                },
              ]}
            >
              <Text style={[styles.nodeLabel, { color: textColor }]}>{n.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('trailMaking')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="trailMaking"
          icon="swap-horizontal"
          gradient={GRADIENT as [string, string]}
          skillKey="skillSwitching"
          descriptionKey="trailMakingIntroDesc"
          benefits={TRAIL_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="trail_making" level={levelRef.current}
          passed={clearedPassed}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(1000 - elapsedTime * 5 - errors * 30))}
          time={elapsedTime}
          errors={errors}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
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
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  canvas: { borderRadius: 12, position: 'relative', overflow: 'hidden' },
  node: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  nodeLabel: { fontSize: 15, fontWeight: '700' },
});
