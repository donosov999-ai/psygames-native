/**
 * Найди отличия — две сцены из тематических спрайтов, тапай отличия на правой.
 *
 * Уровни (persist, паттерн cpt/simon): ручной селектор «сколько отличий»
 * заменён лесенкой usePersistentLevel('find_differences') + levelParams.
 * Ось усложнения: diffCount растёт 2 → 6, сцена плотнее (объектов 12 → 19),
 * лимит времени на раунд сокращается 40с → 15с.
 * Проход уровня: найти ВСЕ отличия в каждом из раундов до истечения лимита
 * → LevelCleared (авто-поток к следующему уровню).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView, Image
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
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useProfile } from '@/src/contexts/ProfileContext';
import { pairSpritesForProfile, SPRITE_COUNT } from '@/src/constants/pairThemes';

const GRADIENT = ['#34e89e', '#0f3443'];
const FIND_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitFind1' },
  { icon: 'search-outline', textKey: 'benefitFind2' },
  { icon: 'sparkles-outline', textKey: 'benefitFind3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'feedback' | 'cleared' | 'result';
type Shape = { sprite: number; x: number; y: number; size: number; rot: number };

// Уровень 1..15: отличий больше, сцена плотнее, лимит времени на раунд короче.
// Ступени по 3 уровня для diffCount — игрок успевает освоиться на каждой ступени.
const ROUNDS_PER_LEVEL = 3;
function levelParams(level: number): { diffCount: number; objectCount: number; roundTimeSec: number; rounds: number } {
  const diffCount = Math.min(6, 2 + Math.floor((level - 1) / 3));       // 2,2,2,3,3,3 ... 6
  const objectCount = Math.min(19, 12 + Math.floor((level - 1) / 2));   // 12 → 19
  const roundTimeSec = Math.max(15, 40 - (level - 1) * 2);              // 40с → 15с на раунд
  return { diffCount, objectCount, roundTimeSec, rounds: ROUNDS_PER_LEVEL };
}

// Объекты сцены — те же тематические спрайты, что и в «Парных картинках»,
// набор зависит от активного профиля (см. src/constants/pairThemes.ts).
// Логике сцены нужен только их КОЛИЧЕСТВО (SPRITE_COUNT=12), сам спрайт
// подставляется в renderShape из набора профиля.

// Радуга из 7 различимых цветов (R-O-Y-G-C-B-M). Убрана только фуксия #ec4899 —
// она отстояла от красного всего на ~85 RGB («не отличить»), заменена чистой мадджентой #d946ef.
// Контраст самого ОТЛИЧИЯ гарантирует farColor (берёт дальнюю половину палитры),
// поэтому богатая палитра не мешает игре: разница в цвете всегда заметна.
const PALETTE = ['#ef4444','#f97316','#facc15','#22c55e','#06b6d4','#3b82f6','#d946ef'];

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
// Цвет для diff'а — из самой дальней половины палитры, чтобы разница была контрастной и заметной.
function farColor(current: string): string {
  const others = PALETTE.filter((c) => c !== current).sort((x, y) => colorDist(current, y) - colorDist(current, x));
  const top = others.slice(0, Math.max(2, Math.ceil(others.length / 2)));
  return top[Math.floor(Math.random() * top.length)];
}

/**
 * Distance between two shape centers below which they would visually
 * overlap and one would block taps on the other. Using sum of half-sizes
 * + padding (so even after a size-change diff, they still don't collide).
 */
function tooClose(a: Shape, b: Shape, padding = 12): boolean {
  const minDist = (a.size + b.size) / 2 + padding;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return (dx * dx + dy * dy) < (minDist * minDist);
}

function generateScene(width: number, height: number, count: number): Shape[] {
  // Сеточная раскладка: каждый объект — в своей ячейке сетки + лёгкий джиттер внутри неё.
  // Объект гарантированно остаётся внутри ячейки с зазором ≥6px → НАЛОЖЕНИЯ НЕВОЗМОЖНЫ.
  const cols = Math.max(1, Math.round(Math.sqrt(count * width / Math.max(1, height))));
  const rows = Math.ceil(count / cols);
  const cw = width / cols, ch = height / rows;
  const cellMin = Math.min(cw, ch);
  const size = Math.max(30, Math.min(56, cellMin - 16));
  const jitter = Math.max(0, (cellMin - size) / 2 - 6);
  const cellIdx = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = cellIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cellIdx[i], cellIdx[j]] = [cellIdx[j], cellIdx[i]];
  }
  const shapes: Shape[] = [];
  for (let n = 0; n < Math.min(count, cols * rows); n++) {
    const ci = cellIdx[n];
    const gr = Math.floor(ci / cols), gc = ci % cols;
    shapes.push({
      sprite: Math.floor(Math.random() * SPRITE_COUNT),
      x: gc * cw + cw / 2 + rand(-jitter, jitter),
      y: gr * ch + ch / 2 + rand(-jitter, jitter),
      size,
      rot: 0,
    });
  }
  return shapes;
}

function withDifference(scene: Shape[], diffCount: number): { altered: Shape[]; diffIdx: number[] } {
  const altered = scene.map((s) => ({ ...s }));
  const indices = Array.from({ length: scene.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const diffIdx = indices.slice(0, diffCount);
  for (const i of diffIdx) {
    // Try size change first only if it stays safe (won't overlap neighbors).
    // Otherwise fall through to color or kind change.
    const tryChanges = [Math.floor(Math.random() * 3), 0, 1, 2];   // randomized first attempt, plus all fallbacks
    let applied = false;
    for (const change of tryChanges) {
      if (applied) break;
      if (change === 0) {
        // подмена объекта на ДРУГОГО зверя — самое заметное отличие
        let sp = altered[i].sprite;
        do { sp = Math.floor(Math.random() * SPRITE_COUNT); } while (sp === altered[i].sprite);
        altered[i].sprite = sp;
        applied = true;
      } else if (change === 1) {
        // изменить размер (если увеличенный не наедет на соседей)
        const candidate = { ...altered[i] };
        candidate.size = candidate.size > 54 ? candidate.size - 16 : candidate.size + 16;
        const overlaps = altered.some((other, oi) => oi !== i && tooClose(candidate, other, 8));
        if (!overlaps) {
          altered[i].size = candidate.size;
          applied = true;
        }
      } else {
        // повернуть/отразить на заметный угол
        altered[i].rot = (altered[i].rot + (Math.random() < 0.5 ? 180 : 90)) % 360;
        applied = true;
      }
    }
  }
  return { altered, diffIdx };
}

export default function FindDifferencesGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const sprites = pairSpritesForProfile(profile?.id);

  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('find_differences');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(ROUNDS_PER_LEVEL);
  const [scene, setScene] = useState<Shape[]>([]);
  const [altered, setAltered] = useState<Shape[]>([]);
  const [diffIdx, setDiffIdx] = useState<number[]>([]);
  const [foundIdx, setFoundIdx] = useState<Set<number>>(new Set());
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Параметры уровня и счётчики — в refs: колбэки таймеров (обратный отсчёт раунда,
  // пауза между раундами) живут вне ре-рендеров, state в них устаревал бы (паттерн simon/cpt).
  const levelRef = useRef(1);
  const diffCountRef = useRef(3);
  const objectCountRef = useRef(14);
  const roundTimeRef = useRef(40);
  const roundsRef = useRef(ROUNDS_PER_LEVEL);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const startTimeRef = useRef(0);
  const roundStartRef = useRef(0);
  const finishedRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Larger scene area = more room to avoid overlaps (was 280, now ~340)
  const sceneW = Math.min(width - 24, 440);
  const sceneH = Math.min(340, sceneW * 0.8);

  const clearAllTimers = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  };

  useEffect(() => () => clearAllTimers(), []);

  const newRound = () => {
    const sc = generateScene(sceneW, sceneH, objectCountRef.current);
    const { altered: alt, diffIdx: idx } = withDifference(sc, diffCountRef.current);
    setScene(sc);
    setAltered(alt);
    setDiffIdx(idx);
    setFoundIdx(new Set());
    // Лимит времени раунда: не нашёл все отличия до нуля → уровень не пройден
    roundStartRef.current = Date.now();
    setTimeLeft(roundTimeRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      const left = roundTimeRef.current - (Date.now() - roundStartRef.current) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(left)));
      if (left <= 0) finish(false);
    }, 200);
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    // На пресете зарядки уважаем diffCount из настроек шага (см. profiles.ts)
    diffCountRef.current = isPreset ? num('diffCount', p.diffCount) : p.diffCount;
    objectCountRef.current = p.objectCount;
    roundTimeRef.current = p.roundTimeSec;
    roundsRef.current = p.rounds;
    setTotalRounds(p.rounds);
    finishedRef.current = false;
    hitsRef.current = 0; errorsRef.current = 0;
    setHits(0); setErrors(0);
    roundRef.current = 1;
    setRound(1);
    setPhase('playing');
    startTimeRef.current = Date.now();
    newRound();
  };

  const handleShapePress = (idx: number) => {
    if (diffIdx.length > 0 && foundIdx.size === diffIdx.length) return;   // раунд закрыт, ждём следующий
    if (foundIdx.has(idx)) return;
    if (diffIdx.includes(idx)) {
      const newFound = new Set(foundIdx);
      newFound.add(idx);
      setFoundIdx(newFound);
      hitsRef.current += 1;
      setHits(hitsRef.current);
      if (newFound.size === diffIdx.length) {
        // Раунд закрыт: таймер на паузу, дальше следующий раунд или финиш уровня
        if (countdownRef.current) clearInterval(countdownRef.current);
        advanceTimerRef.current = setTimeout(() => {
          if (roundRef.current >= roundsRef.current) {
            finish(true);
          } else {
            roundRef.current += 1;
            setRound(roundRef.current);
            newRound();
          }
        }, 600);
      }
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
  };

  // Тап по координате → ближайшая фигура в радиусе (а не по точному SVG-контуру).
  // Раньше onPress висел на самой фигуре: мелкий треугольник = крошечная зона, легко промахнуться.
  const handleSceneTap = (x: number, y: number) => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < altered.length; i++) {
      const s = altered[i];
      if (!s) continue;
      const dx = s.x - x, dy = s.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const tol = Math.max(s.size / 2 + 16, 28);   // прощаем промах до ~края+16px (мин 28)
      if (d <= tol && d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) handleShapePress(best);
  };

  const finish = async (completedAll: boolean) => {
    if (finishedRef.current) return;   // защита от гонки «нашёл последнее отличие ↔ время вышло»
    finishedRef.current = true;
    clearAllTimers();
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current, e = errorsRef.current;
    // Проход уровня: все отличия всех раундов найдены до истечения лимита
    const passed = !isPreset && completedAll;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();   // гистерезис понижения (3 провала подряд → −1)
    setPhase(passed ? 'cleared' : 'result');   // авто-поток к следующему уровню
    const accuracy = h + e > 0 ? h / (h + e) : 0;
    try {
      await saveSession({
        game_type: 'find_differences',
        score: Math.max(0, h * 50 - e * 10),
        time_seconds: finalTime,
        difficulty: `${diffCountRef.current} diffs`,
        mode: `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          hits: h,
          errors: e,
          accuracy: Math.round(accuracy * 100),
          diff_count: diffCountRef.current,
          trials: roundsRef.current,
          round_time_sec: roundTimeRef.current,
          completed_all: completedAll,
        },
      });
    } catch (err) { console.error(err); }
  };

  const renderShape = (s: Shape, idx: number, side: 'L' | 'R') => {
    const shape = side === 'L' ? scene[idx] : altered[idx];
    if (!shape) return null;
    const isFound = side === 'R' && foundIdx.has(idx);
    // Тапы ловит контейнер сцены (handleSceneTap по координате) — у объектов onPress нет.
    return (
      <Image
        key={idx}
        source={sprites[shape.sprite]}
        resizeMode="contain"
        style={{
          position: 'absolute',
          left: shape.x - shape.size / 2,
          top: shape.y - shape.size / 2,
          width: shape.size,
          height: shape.size,
          transform: [{ rotate: `${shape.rot}deg` }],
          borderWidth: isFound ? 3 : 0,
          borderColor: '#fbbf24',
          borderRadius: isFound ? 10 : 0,
        }}
      />
    );
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="search" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('findDiff')}</Text>
          <Text style={styles.configDesc}>{t('findDiffDesc')}</Text>
        </LinearGradient>
        <LevelProgressMap gameId="find_differences" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `Раундов: ${p.rounds} · отличий: ${p.diffCount} · объектов: ${p.objectCount} · ⏱ ${p.roundTimeSec} с на раунд`
              : `${p.rounds} rounds · ${p.diffCount} differences · ${p.objectCount} objects · ⏱ ${p.roundTimeSec} s per round`}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? 'Проход уровня: найти все отличия в каждом раунде, пока не вышло время'
              : 'To pass: find every difference in each round before the time runs out'}
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
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalRounds}</Text>
        <Text style={[styles.statText, { color: timeLeft <= 5 ? '#f43f5e' : colors.text }]}>⏱{timeLeft}{language === 'ru' ? 'с' : 's'}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{foundIdx.size}/{diffIdx.length}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('findHint')}</Text>
      <View style={[styles.scenesArea, { width: sceneW }]}>
        <View style={[styles.sceneBox, { backgroundColor: colors.surface }]}>
          <View style={{ width: sceneW, height: sceneH }} pointerEvents="none">
            {scene.map((_, i) => renderShape(scene[i], i, 'L'))}
          </View>
        </View>
        <View
          style={[styles.sceneBox, { backgroundColor: colors.surface }]}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => handleSceneTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        >
          <View style={{ width: sceneW, height: sceneH }} pointerEvents="none">
            {altered.map((_, i) => renderShape(altered[i], i, 'R'))}
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('findDiff')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="findDiff" icon="search" gradient={GRADIENT as [string, string]}
          skillKey="skillDetailAttention" descriptionKey="findDiffIntroDesc"
          benefits={FIND_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {(phase === 'playing' || phase === 'feedback') && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="find_differences" level={levelRef.current}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult score={Math.max(0, hits * 50 - errors * 10)} time={elapsedTime} errors={errors}
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
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 16 },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center' },
  scenesArea: { gap: 18 },
  // Чёткая рамка вокруг каждой сцены — видна и на тёмной, и на светлой теме
  // (#94a3b8 — средне-серый, контрастит и с чёрным, и с белым фоном).
  sceneBox: { borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#94a3b8' },
});
