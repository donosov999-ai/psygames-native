/**
 * Фрактальная судоку — сетка, вложенная сама в себя.
 *
 * ЗАЧЕМ. Разобрано по фото карточки, которые прислал Денис 12.08. Идея: за клеткой
 * верхней сетки спрятана целая судоку. Решаешь снизу вверх, слой за слоем, пока не
 * вскроешь корневую. Как мега-босс — событие на несколько часов, а не на десять минут.
 *
 * ⚠️ ГЛАВНОЕ ОТЛИЧИЕ ОТ ОБЫЧНОЙ СУДОКУ — ЗАЧЕМ ВООБЩЕ РЕШАТЬ НИЖНИЕ. Девять дочерних
 * сеток не декорация: центр каждой — это цифра, которой не хватает в корне. Пока не
 * решишь дочернюю хотя бы до порога, соответствующая клетка корня остаётся пустой и
 * закрыть корень нельзя. Если эту связь не показать явно, человек решает девять
 * отдельных судоку и не понимает, зачем их девять (см. fractal-sudoku.ts).
 *
 * ЭКРАН УСТРОЕН ДВУМЯ ВИДАМИ, а не одним полем: десять сеток 9×9 на телефоне
 * одновременно нечитаемы — клетка вышла бы меньше трёх миллиметров.
 *   • КАРТА  — корень крупно + девять плиток дочерних с их прогрессом;
 *   • СЕТКА  — одна дочерняя во весь экран, с обычным вводом цифр.
 * Возврат на карту происходит сам, как только дочерняя дошла до порога: это момент,
 * ради которого всё и затевалось, и его надо показать, а не спрятать.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameShell from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { FRACTAL_MAX_LEVEL, fractalLevel } from '@/src/services/fractalLevels';
import GameResult from '@/src/components/GameResult';
import GlassButton from '@/src/components/GlassButton';
import { useGameKeyboard, digitKeys } from '@/src/hooks/useGameKeyboard';
import { sndPlace, sndWrong } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';
import {
  N, UNLOCK_CELLS, FEED_CELL, generateFractal, rootCellForChild, solvedCount, isUnlocked,
  type FractalPuzzle, type Board,
} from '@/src/services/fractal-sudoku';

const GRADIENT = ['#5b4d9e', '#7f7fd5'];
const GAME_ID = 'sudoku_fractal';

type Phase = 'config' | 'map' | 'child' | 'result';

/** Состояние одной дочерней сетки в партии. */
interface ChildState {
  grid: Board;          // что ввёл человек
  given: boolean[][];   // подсказки задания — не редактируются
  done: boolean;        // дошла до порога и отдала цифру наверх
}

const copy = (b: Board): Board => b.map((r) => [...r]);

export default function FractalSudokuScreen() {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguage();
  /**
   * Уровень настоящий: растёт число выколотых клеток и порог открытия корневой.
   * Игра вышла вообще без уровней — сразу «hard» и всегда одинаково; это была моя
   * же дыра, новая игра мимо формата, на который я сам жалуюсь.
   */
  const lvl = usePersistentLevel(GAME_ID);
  const cfg = fractalLevel(lvl.level);
  const { width } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>('config');
  const [puzzle, setPuzzle] = useState<FractalPuzzle | null>(null);
  const [children, setChildren] = useState<ChildState[]>([]);
  const [rootGrid, setRootGrid] = useState<Board>([]);
  const [openChild, setOpenChild] = useState<number | null>(null);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [errors, setErrors] = useState(0);
  // Итог партии нужен и в рендере результата — держим в состоянии, а не только в аргументе finish().
  const [won, setWon] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const start = useCallback(() => {
    // 45 выколотых из 81 в дочерних: до порога 17 верных доходишь примерно за треть
    // сетки, то есть открытие корневой клетки случается ощутимо раньше, чем полное
    // решение. Иначе фрактал превращается в девять судоку подряд без промежуточных наград.
    const p = generateFractal(cfg.rootBlanks, cfg.childBlanks);
    setPuzzle(p);
    setRootGrid(copy(p.root.puzzle));
    setChildren(p.children.map((ch) => ({
      grid: copy(ch.puzzle),
      given: ch.puzzle.map((row) => row.map((v) => v !== 0)),
      done: false,
    })));
    setErrors(0);
    setElapsed(0);
    setOpenChild(null);
    setSelected(null);
    startRef.current = gameNow();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((gameNow() - startRef.current) / 1000), 200);
    setPhase('map');
  }, [cfg.rootBlanks, cfg.childBlanks]);

  /** Сколько дочерних уже отдали цифру наверх. */
  const openedCount = children.filter((c) => c.done).length;

  const finish = useCallback(async (won: boolean) => {
    setWon(won);
    if (timerRef.current) clearInterval(timerRef.current);
    const time = (gameNow() - startRef.current) / 1000;
    setElapsed(time);
    setPhase('result');
    // Уровень засчитан только за ВЫИГРАННУЮ партию: здесь можно и не собрать.
    if (won && lvl.level < FRACTAL_MAX_LEVEL) lvl.reach(lvl.level + 1);
    try {
      await saveSession({
        passed: won,
        game_type: GAME_ID,
        score: won ? Math.max(0, Math.round(4000 - errors * 60 - time)) : 0,
        time_seconds: time,
        difficulty: `lvl${lvl.level}`,
        mode: 'fractal',
        errors,
        details: { level: lvl.level, opened: openedCount, of: 9, child_blanks: cfg.childBlanks, unlock_cells: cfg.unlockCells },
      });
    } catch (e) { console.error(e); }
  }, [errors, openedCount]);

  /** Ввод цифры в открытую дочернюю сетку. */
  const placeDigit = (n: number) => {
    if (openChild === null || !puzzle || !selected) return;
    const idx = openChild;
    const ch = children[idx];
    const { r, c } = selected;
    if (ch.given[r][c]) return;

    const sol = puzzle.children[idx].solution;
    const next = children.map((x, i) => (i === idx ? { ...x, grid: copy(x.grid) } : x));
    next[idx].grid[r][c] = n;

    if (n !== 0) {
      if (sol[r][c] === n) sndPlace(); else { sndWrong(); setErrors((e) => e + 1); }
    }

    // Порог пройден — цифра уходит в корень. Это и есть смысл всей конструкции,
    // поэтому возвращаем на карту: там видно, как заполнилась клетка наверху.
    if (!next[idx].done && isUnlocked(next[idx].grid, sol, next[idx].given, cfg.unlockCells)) {
      next[idx].done = true;
      const [rr, rc] = puzzle.children[idx].feedsCell;
      const rg = copy(rootGrid);
      rg[rr][rc] = sol[FEED_CELL[0]][FEED_CELL[1]];
      setRootGrid(rg);
      setChildren(next);
      setOpenChild(null);
      setSelected(null);

      // Все девять открыты и корень сошёлся — партия выиграна.
      const all = next.every((x) => x.done);
      if (all) {
        const rootOk = rg.every((row, i) => row.every((v, j) => v === puzzle.root.solution[i][j]));
        if (rootOk) void finish(true);
      }
      return;
    }
    setChildren(next);
  };

  const moveSel = (dr: number, dc: number) => {
    if (openChild === null) return;
    const ch = children[openChild];
    let { r, c } = selected ?? { r: dr < 0 ? N : -1, c: dc < 0 ? N : -1 };
    for (let s = 0; s < N * N; s++) {
      r += dr; c += dc;
      if (r < 0 || r >= N || c < 0 || c >= N) return;
      if (!ch.given[r][c]) { setSelected({ r, c }); return; }
    }
  };

  useGameKeyboard({
    ...digitKeys((n) => placeDigit(n)),
    ArrowUp: () => moveSel(-1, 0),
    ArrowDown: () => moveSel(1, 0),
    ArrowLeft: () => moveSel(0, -1),
    ArrowRight: () => moveSel(0, 1),
    Escape: () => { setOpenChild(null); setSelected(null); },
  }, phase === 'child');

  // ─────────────────────────── экраны ───────────────────────────

  if (phase === 'config') {
    return (
      <GameShell title={t('fractalTitle')} onBack={() => goBackOrHome()}>
        <ScrollView contentContainerStyle={styles.configWrap} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Ionicons name="git-network" size={44} color="#FFF" />
            <Text style={styles.heroTitle}>{t('fractalTitle')}</Text>
            <Text style={styles.heroSub}>{t('fractalDesc')}</Text>
          </LinearGradient>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardText, { color: colors.text }]}>{t('fractalHowTo')}</Text>
          </View>

          <LevelProgressMap
            gameId={GAME_ID}
            currentLevel={lvl.level} onPickLevel={lvl.pick}
            maxLevel={FRACTAL_MAX_LEVEL}
            colors={colors}
            language={language}
          />
          <GlassButton label={t('start')} tone="accent" onPress={start} style={{ marginTop: 4 }} />
        </ScrollView>
      </GameShell>
    );
  }

  if (phase === 'result') {
    // Итог — общим экраном «уровень пройден»: только он пишет звёзды по уровням,
    // считает серию чистых и тикает глаз-разрядку. Звёзды по ошибкам — настоящая
    // оценка: в судоку ошибка это поставленная не та цифра, а не «медленно».
    return (
      <LevelCleared
        gameId={GAME_ID}
        level={won ? Math.max(1, lvl.level - 1) : lvl.level}
        passed={won}
        stars={errors === 0 ? 3 : errors <= 3 ? 2 : 1}
        gradient={GRADIENT}
        language={language}
        colors={colors}
        onContinue={start}
        onStop={() => goBackOrHome()}
      />
    );
  }

  const stats = (
    <View style={styles.stats}>
      <Text style={[styles.stat, { color: GRADIENT[1] }]}>{t('fractalOpened')} {openedCount}/9</Text>
      <Text style={[styles.stat, { color: '#f43f5e' }]}>✗{errors}</Text>
      <Text style={[styles.stat, { color: colors.text }]}>{elapsed.toFixed(0)}{t('secShort')}</Text>
    </View>
  );

  // ── КАРТА: корень крупно + плитки дочерних ──
  if (phase === 'map' || openChild === null) {
    const cell = Math.min(34, Math.floor((Math.min(width, 520) - 48) / N));
    return (
      <GameShell title={t('fractalTitle')} onBack={() => goBackOrHome()} stats={stats} scrollableField>
        <View style={styles.mapWrap}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('fractalRoot')}</Text>
          <View style={[styles.grid, { borderColor: colors.text }]}>
            {rootGrid.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((v, c) => {
                  const fromChild = children.some((_, i) => {
                    const [rr, rc] = rootCellForChild(i);
                    return rr === r && rc === c;
                  });
                  return (
                    <View key={c} style={[styles.cell, {
                      width: cell, height: cell,
                      backgroundColor: fromChild && v === 0 ? (isDark ? '#3a3358' : '#ece9f7') : colors.surface,
                      borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                      borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                      borderColor: colors.text,
                    }]}>
                      <Text style={{ fontSize: cell * 0.5, fontWeight: '700', color: colors.text }}>
                        {v !== 0 ? v : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 18 }]}>
            {t('fractalChildren')}
          </Text>
          <View style={styles.tiles}>
            {children.map((ch, i) => {
              const done = ch.done;
              const got = puzzle ? solvedCount(ch.grid, puzzle.children[i].solution, ch.given) : 0;
              return (
                <TouchableOpacity
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('fractalChildN')} ${i + 1}`}
                  onPress={() => { setOpenChild(i); setSelected(null); setPhase('child'); }}
                  style={[styles.tile, {
                    backgroundColor: done ? GRADIENT[0] : colors.surface,
                    borderColor: done ? GRADIENT[0] : colors.border,
                  }]}
                >
                  <Text style={{ fontSize: 20, fontWeight: '800', color: done ? '#FFF' : colors.text }}>
                    {done ? '✓' : i + 1}
                  </Text>
                  <Text style={{ fontSize: 11, color: done ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>
                    {Math.min(got, cfg.unlockCells)}/{cfg.unlockCells}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </GameShell>
    );
  }

  // ── СЕТКА: одна дочерняя во весь экран ──
  const ch = children[openChild];
  const sol = puzzle!.children[openChild].solution;
  const got = solvedCount(ch.grid, sol, ch.given);
  const cell = Math.min(38, Math.floor((Math.min(width, 520) - 32) / N));

  return (
    <GameShell
      title={`${t('fractalChildN')} ${openChild + 1}`}
      onBack={() => { setOpenChild(null); setSelected(null); setPhase('map'); }}
      stats={
        <View style={styles.stats}>
          <Text style={[styles.stat, { color: GRADIENT[1] }]}>{got}/{cfg.unlockCells} {t('fractalToUnlock')}</Text>
          <Text style={[styles.stat, { color: '#f43f5e' }]}>✗{errors}</Text>
        </View>
      }
    >
      <View style={styles.playCol}>
        <View style={[styles.grid, { borderColor: colors.text }]}>
          {ch.grid.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((v, c) => {
                const isSel = selected?.r === r && selected?.c === c;
                const wrong = v !== 0 && v !== sol[r][c];
                const isFeed = r === FEED_CELL[0] && c === FEED_CELL[1];
                return (
                  <TouchableOpacity
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={`${r + 1}·${c + 1}`}
                    onPress={() => { if (!ch.given[r][c]) setSelected({ r, c }); }}
                    style={[styles.cell, {
                      width: cell, height: cell,
                      backgroundColor: isSel ? GRADIENT[1] : isFeed ? (isDark ? '#3a3358' : '#efedfa') : colors.surface,
                      borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                      borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                      borderColor: colors.text,
                    }]}
                  >
                    <Text style={{
                      fontSize: cell * 0.5,
                      fontWeight: ch.given[r][c] ? '800' : '600',
                      color: isSel ? '#FFF' : wrong ? '#b91c1c' : colors.text,
                    }}>
                      {v !== 0 ? v : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Центр подсвечен всегда: именно его цифра уйдёт наверх, и человек должен
            видеть, ЧТО он добывает, а не просто закрывать клетки. */}
        <Text style={[styles.feedHint, { color: colors.textSecondary }]}>{t('fractalFeedHint')}</Text>

        <View style={styles.pad}>
          {Array.from({ length: N }, (_, i) => i + 1).map((n) => (
            <TouchableOpacity
              key={n}
              accessibilityRole="button"
              onPress={() => placeDigit(n)}
              style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{n}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('a11yErase')}
            onPress={() => placeDigit(0)}
            style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="backspace-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  configWrap: { padding: 16, gap: 12 },
  hero: { borderRadius: 18, padding: 22, alignItems: 'center', gap: 6 },
  heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'center' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  cardText: { fontSize: 14, lineHeight: 20 },

  stats: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  stat: { fontSize: 13, fontWeight: '700' },

  mapWrap: { alignItems: 'center', paddingVertical: 10, gap: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 320 },
  tile: {
    width: 92, height: 62, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },

  playCol: { alignItems: 'center', gap: 12, marginBottom: 76 },
  grid: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  feedHint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 340 },
  key: { width: 58, height: 58, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
