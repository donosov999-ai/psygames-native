/* psygames-game-sudoku-fractal-deep · VER 1 · 28.08.2026 */
/**
 * ФРАКТАЛ: БЕЗДНА — судоку «их масштаба» (Денис 28.08, по референсу Fractal Sudoku).
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ НАШЕГО ФРАКТАЛА-«БОССА» (sudoku-fractal.tsx, НЕ трогать):
 * там два слоя и девять дочек — событие на час-два. Здесь дерево глубиной до трёх
 * слоёв, и пазл прячется под КАЖДОЙ (или N выбранными — «ограничим вручную»)
 * пустой клеткой: полная партия — тысячи вложенных судоку, марафон на недели.
 *
 * ЛОГИКА ТА ЖЕ, ЧТО В БОССЕ, только рекурсивная: первой показывается КОРНЕВАЯ
 * сетка (самый верх, цель партии); проваливаешься вниз по пунктирным клеткам до
 * дна, где обычные судоку с подсказками; решил лист до порога — его ЦЕНТРАЛЬНАЯ
 * цифра всплывает в родителя; насобирал родителя до порога — всплывает он.
 * Победа — собранный корень.
 *
 * 🔴 ДЕРЕВО НЕ ЖИВЁТ В ПАМЯТИ ЦЕЛИКОМ. Узлы материализуются лениво и
 * детерминированно от (зерно, путь) — services/fractal-deep.ts; экран держит
 * только цепочку от корня до текущего узла и наигранное по ТРОНУТЫМ узлам.
 * Снимок партии хранит то же самое — иначе партия из ~3000 пазлов не влезла бы
 * ни в какой resume.
 *
 * 🔴 ЦИФРЫ, ПРИШЕДШИЕ СНИЗУ, НЕ ПИШУТСЯ В ДОСКУ РОДИТЕЛЯ — ОНИ ВЫЧИСЛЯЮТСЯ.
 * Значение кормимой клетки = «ребёнок дорешан до порога → его центральная цифра».
 * Так отмена хода в ребёнке, роняющая его ниже порога, сама «забирает» цифру из
 * родителя — без второй бухгалтерии, которая неизбежно разъехалась бы (ровно
 * та ошибка, за которую фрактал-босс расплачивался с отменой 19.08).
 *
 * ⚠️ ОДИН GameShell НА ВСЕ ГЛУБИНЫ. «Назад» = подъём на слой, с корня — выход со
 * стражем. Это тот самый паттерн, что похоронил кнопку «назад» в боссе (вечная
 * защёлка стража, починена 28.08 в useExitGuard: LEFT_RELEASE_MS) — здесь он
 * опирается на тот фикс осознанно.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveSession } from '@/src/services/api';
import GameShell from '@/src/components/GameShell';
import GlassButton from '@/src/components/GlassButton';
import { useGameKeyboard, digitKeys } from '@/src/hooks/useGameKeyboard';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { saveResume, clearResume } from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import { sndPlace, sndWrong } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';
import { conflictsInChild } from '@/src/services/fractal-sudoku';
import {
  DEEP_N, childPath, parentOf, depthOf,
  materializeNode, materializePick, countDeep,
  deepOwnSolved, deepNodeProgress, deepNodeDone, deepValueAt, deepRootComplete,
  type DeepCfg, type DeepNode, type DeepPath, type DeepPick,
} from '@/src/services/fractal-deep';

const GRADIENT = ['#312e63', '#5b4d9e'];
const GAME_ID = 'sudoku_fractal_deep';
const RESUME_V = 1;

/**
 * Пресеты объёма — та самая ручка «ограничим вручную»: человек ДО старта видит,
 * во что ввязывается (счёт пазлов — countDeep, точный и без решений досок).
 * Полосы банка лёгкие нарочно: пометок в первой версии нет, доски обязаны
 * браться головой без карандаша.
 */
const PRESETS = [
  { key: 'scout', depth: 2, feedCount: 9 as const, rating: 1.2, unlockShare: 0.24 },
  { key: 'trek', depth: 3, feedCount: 12 as const, rating: 1.5, unlockShare: 0.24 },
  { key: 'abyss', depth: 3, feedCount: 'all' as const, rating: 1.7, unlockShare: 0.24 },
] as const;

type PresetKey = (typeof PRESETS)[number]['key'];

const cfgOf = (key: PresetKey): DeepCfg => {
  const p = PRESETS.find((x) => x.key === key)!;
  return { depth: p.depth, feedCount: p.feedCount, rating: p.rating, unlockShare: p.unlockShare };
};

type Phase = 'config' | 'play' | 'result';

/** Один ход: узел, клетка, что там стояло. Отмена пишет prev обратно — и всё. */
interface DeepMove { path: DeepPath; r: number; c: number; prev: number }

interface DeepResume {
  preset: PresetKey;
  seed: string;
  path: DeepPath;
  grids: Record<DeepPath, number[][]>;
  errors: number;
  elapsed: number;
  history: ReturnType<ReturnType<typeof useMoveHistory<DeepMove>>['serialize']>;
}

export default function FractalDeepScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { profile } = useProfile();
  const width = useScreenWidth();

  const [phase, setPhase] = useState<Phase>('config');
  const [preset, setPreset] = useState<PresetKey>('scout');
  const [seed, setSeed] = useState('');
  const [path, setPath] = useState<DeepPath>('');
  /** Наигранное по ТРОННУТЫМ узлам: путь → доска (0 = пусто). Ключ снимка партии. */
  const [grids, setGrids] = useState<Record<DeepPath, number[][]>>({});
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [errors, setErrors] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [won, setWon] = useState(false);
  // Лента ходов — ОБЩИМ хуком (undo-honesty): один список по всем узлам дерева.
  const hist = useMoveHistory<DeepMove>();
  /** Счёт партии для карточки настройки: пазлов всего по слоям. */
  const [sizes, setSizes] = useState<Record<PresetKey, number | null>>({ scout: null, trek: null, abyss: null });

  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Кэш материализованных узлов: полная партия сюда не помещается — и не должна. */
  const nodesRef = useRef(new Map<DeepPath, DeepNode>());
  /** Кэш дешёвых picks для призраков нетронутых детей (без решения — даром). */
  const picksRef = useRef(new Map<DeepPath, DeepPick>());

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  useEffect(() => {
    if (phase !== 'result') return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [phase]);

  const cfg = cfgOf(preset);

  /** Материализовать узел (с решением) — через кэш и цепочку кормящих цифр. */
  const nodeAt = useCallback((p: DeepPath): DeepNode => {
    const hit = nodesRef.current.get(p);
    if (hit) return hit;
    const par = parentOf(p);
    const digit = par === null ? 0 : nodeAt(par.parent).solution[par.cell[0]]![par.cell[1]]!;
    const node = materializeNode(seed, p, cfg, digit);
    nodesRef.current.set(p, node);
    return node;
  }, [seed, preset]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pickAt = (p: DeepPath): DeepPick => {
    const hit = picksRef.current.get(p);
    if (hit) return hit;
    const pick = materializePick(seed, p, cfg);
    picksRef.current.set(p, pick);
    return pick;
  };

  // Вся арифметика всплытия — в движке (fractal-deep.ts), под юнит-тестами.
  const nodeDone = useCallback((p: DeepPath): boolean => deepNodeDone(nodeAt, grids, p), [grids, nodeAt]);
  const valueAt = useCallback((p: DeepPath, r: number, c: number): number => deepValueAt(nodeAt, grids, p, r, c), [grids, nodeAt]);
  const rootComplete = useCallback((): boolean => deepRootComplete(nodeAt, grids), [grids, nodeAt]);

  const runTimer = (from: number) => {
    startRef.current = gameNow() - Math.max(0, from) * 1000;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((gameNow() - startRef.current) / 1000), 500);
  };

  const start = () => {
    const pid = profile?.id;
    if (pid) clearResume(GAME_ID, pid).catch(() => {});
    // Зерно — от профиля и часа старта: та же партия у того же человека не
    // повторяется, а снимок хранит зерно и переживает что угодно.
    const s = `${pid ?? 'guest'}|${Math.floor(gameNow() / 1000)}`;
    nodesRef.current.clear();
    picksRef.current.clear();
    setSeed(s);
    setPath('');
    setGrids({});
    setSelected(null);
    setErrors(0);
    setElapsed(0);
    hist.reset();
    setWon(false);
    runTimer(0);
    setPhase('play');
  };

  const finish = useCallback(async (win: boolean) => {
    setWon(win);
    const pid = profile?.id;
    if (pid) clearResume(GAME_ID, pid).catch(() => {});
    setPhase('result');
    const solved = Object.keys(grids).filter((p) => p !== '' && deepNodeDone(nodeAt, grids, p)).length;
    try {
      await saveSession({
        passed: win,
        game_type: GAME_ID,
        score: Math.max(0, solved * 120 - errors * 20) + (win ? 2000 : 0),
        time_seconds: elapsed,
        difficulty: preset,
        mode: 'deep',
        errors,
        details: { preset, depth: cfg.depth, solved_nodes: solved, touched: Object.keys(grids).length },
      });
    } catch (e) { console.error(e); }
  }, [grids, errors, elapsed, preset, nodeDone]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Поставить/стереть цифру рукой. Кормимые и подсказки не принимают руку. */
  const place = (r: number, c: number, n: number) => {
    if (phase !== 'play') return;
    const node = nodeAt(path);
    if (node.puzzle[r]![c] !== 0) return;
    if (node.feedCells.some(([fr, fc]) => fr === r && fc === c)) return;
    const prev = grids[path]?.[r]?.[c] ?? 0;
    if (prev === n) return;
    if (n !== 0) {
      const g = grids[path] ?? Array.from({ length: DEEP_N }, () => Array(DEEP_N).fill(0));
      // Ошибка — только доказуемая: цифра уже стоит в строке/столбце/блоке.
      const visible = g.map((row, rr) => row.map((v, cc) => valueAt(path, rr, cc) || v));
      if (conflictsInChild(visible, r, c, n)) { sndWrong(); setErrors((e) => e + 1); }
      else sndPlace();
    }
    hist.push({ path, r, c, prev });
    setGrids((prevG) => {
      const g = (prevG[path] ?? Array.from({ length: DEEP_N }, () => Array(DEEP_N).fill(0))).map((row) => [...row]);
      g[r]![c] = n;
      return { ...prevG, [path]: g };
    });
  };

  const undo = () => {
    const m = hist.undo();
    if (!m) return;
    setGrids((prevG) => {
      const g = (prevG[m.path] ?? Array.from({ length: DEEP_N }, () => Array(DEEP_N).fill(0))).map((row) => [...row]);
      g[m.r]![m.c] = m.prev;
      return { ...prevG, [m.path]: g };
    });
    // Ход был в другом узле — экран возвращается туда, где откатилось.
    if (m.path !== path) { setPath(m.path); setSelected({ r: m.r, c: m.c }); }
  };

  /** Провал в ребёнка под клеткой. */
  const dive = (r: number, c: number) => { setPath(childPath(path, r, c)); setSelected(null); };
  /** Подъём на слой; с корня — выход (через стража каркаса). */
  const rise = () => {
    const par = parentOf(path);
    if (par === null) { goBackOrHome(); return; }
    setPath(par.parent);
    setSelected(null);
  };

  // Победа проверяется от наигранного: дорешал корень — партия закончилась.
  useEffect(() => {
    if (phase !== 'play' || seed === '') return;
    if (rootComplete()) void finish(true);
  }, [grids]);   // eslint-disable-line react-hooks/exhaustive-deps

  useGameKeyboard({
    ...digitKeys((n) => { if (selected) place(selected.r, selected.c, n); }),
    Escape: () => setSelected(null),
  }, phase === 'play');

  // ───────────────────── незаконченная партия ─────────────────────
  const snapshot = (): DeepResume => ({ preset, seed, path, grids, errors, elapsed, history: hist.serialize() });
  const applyResume = (s: DeepResume) => {
    nodesRef.current.clear();
    picksRef.current.clear();
    setPreset(s.preset);
    setSeed(s.seed);
    setPath(s.path ?? '');
    setGrids(s.grids ?? {});
    setErrors(s.errors ?? 0);
    hist.restore(s.history);
    setWon(false);
    setElapsed(s.elapsed ?? 0);
    runTimer(s.elapsed ?? 0);
    setPhase('play');
  };
  useResumeBoot<DeepResume>(GAME_ID, RESUME_V, (saved) => {
    if (!saved?.seed || !PRESETS.some((p) => p.key === saved.preset)) return;
    applyResume(saved);
  }, false);

  const liveGame = phase === 'play' && seed !== '';
  useEffect(() => {
    if (!liveGame) return;
    const pid = profile?.id;
    if (!pid) return;
    const snap = snapshot();
    const tm = setTimeout(() => { saveResume(GAME_ID, pid, RESUME_V, snap).catch(() => {}); }, 500);
    return () => clearTimeout(tm);
  }, [grids, path, errors, liveGame]);   // eslint-disable-line react-hooks/exhaustive-deps

  const liveRef = useRef<{ ok: boolean; pid?: string; snap: () => DeepResume }>({ ok: false, snap: () => ({} as DeepResume) });
  useEffect(() => { liveRef.current = { ok: liveGame, pid: profile?.id, snap: snapshot }; });
  const saveBeforeExit = () => {
    const l = liveRef.current;
    if (l.ok && l.pid) saveResume(GAME_ID, l.pid, RESUME_V, l.snap()).catch(() => {});
  };
  useEffect(() => () => { saveBeforeExit(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ───────────────────── экраны ─────────────────────

  if (phase === 'config') {
    return (
      <GameShell title={t('deepTitle')} onBack={() => goBackOrHome()}>
        <ScrollView contentContainerStyle={styles.configWrap} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Ionicons name="layers" size={44} color="#FFF" />
            <Text style={styles.heroTitle}>{t('deepTitle')}</Text>
            <Text style={styles.heroSub}>{t('deepDesc')}</Text>
          </LinearGradient>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardText, { color: colors.text }]}>{t('deepHowTo')}</Text>
          </View>

          {PRESETS.map((p) => {
            const on = preset === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                testID={`deep-preset-${p.key}`}
                onPress={() => {
                  setPreset(p.key);
                  // Размер партии считается лениво и один раз: полоса+глубина+охват
                  // не меняются, а счёт «Бездны» — ~50 обращений к банку, не мгновение.
                  if (sizes[p.key] === null) {
                    const total = countDeep('size-preview', cfgOf(p.key)).total;
                    setSizes((prev) => ({ ...prev, [p.key]: total }));
                  }
                }}
                style={[styles.presetCard, {
                  backgroundColor: colors.surface,
                  borderColor: on ? GRADIENT[1] : colors.border,
                  borderWidth: on ? 2 : 1,
                }]}
              >
                <Text style={[styles.presetName, { color: colors.text }]}>{t(`deepPreset_${p.key}` as never)}</Text>
                <Text style={[styles.presetDesc, { color: colors.textSecondary }]}>
                  {t(`deepPresetDesc_${p.key}` as never)}
                  {sizes[p.key] !== null ? `  ·  ${t('deepPuzzles')}: ~${sizes[p.key]}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}

          <GlassButton label={t('start')} tone="accent" onPress={start} style={{ marginTop: 4 }} />
        </ScrollView>
      </GameShell>
    );
  }

  if (phase === 'result') {
    return (
      <GameShell title={t('deepTitle')} onBack={() => goBackOrHome()}>
        <View style={styles.resultWrap}>
          <Text style={{ fontSize: 44 }}>{won ? '🏆' : '🌊'}</Text>
          <Text style={[styles.resultTitle, { color: colors.text }]}>{won ? t('deepWon') : t('deepLost')}</Text>
          <Text style={[styles.resultSub, { color: colors.textSecondary }]}>
            {t('timeErrorsLine').replace('{t}', elapsed.toFixed(0)).replace('{n}', String(errors))}
          </Text>
          <GlassButton label={t('retry')} tone="accent" onPress={() => setPhase('config')} />
        </View>
      </GameShell>
    );
  }

  // ───────────────────── игровой узел ─────────────────────
  const node = nodeAt(path);
  const depth = depthOf(path);
  const cell = Math.min(42, Math.floor((Math.min(width, 520) - 48) / DEEP_N));
  const feedSet = new Set(node.feedCells.map(([r, c]) => `${r},${c}`));
  const got = deepNodeProgress(nodeAt, grids, path);

  /** Призрак ребёнка: тронутый — живой (рука ярко), нетронутый — подсказки pick даром. */
  const ghost = (p: DeepPath, size: number) => {
    const dot = Math.max(1, Math.floor((size - 6) / DEEP_N));
    if (dot < 2) return null;
    const touched = grids[p];
    const pick = pickAt(p);
    return (
      <View pointerEvents="none" style={styles.ghostWrap}>
        <View style={{ width: dot * DEEP_N, height: dot * DEEP_N, flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: DEEP_N * DEEP_N }, (_, i) => {
            const r = Math.floor(i / DEEP_N), c = i % DEEP_N;
            const given = pick.puzzle[r]![c] !== 0;
            const hand = (touched?.[r]?.[c] ?? 0) !== 0;
            return (
              <View key={i} style={{
                width: dot, height: dot,
                backgroundColor: hand ? GRADIENT[1]
                  : given ? (isDark ? 'rgba(163,153,224,0.45)' : 'rgba(91,77,158,0.30)')
                  : 'transparent',
              }} />
            );
          })}
        </View>
      </View>
    );
  };

  /** Хлебные крошки глубины — как Depth в референсе: видно, на каком слое стоишь. */
  const crumbs = (
    <View style={styles.crumbs}>
      {Array.from({ length: cfg.depth }, (_, d) => (
        <View key={d} style={[styles.crumbDot, {
          backgroundColor: d === depth ? GRADIENT[1] : d < depth ? GRADIENT[0] : colors.border,
        }]}>
          <Text style={styles.crumbText}>L{d + 1}</Text>
        </View>
      ))}
      <Text style={[styles.crumbLabel, { color: colors.textSecondary }]}>
        {path === '' ? t('fractalRoot') : `${t('fractalChildN')} ${path.split('/').map((x) => `(${x.replace(',', '·')})`).join(' › ')}`}
      </Text>
    </View>
  );

  const stats = (
    <View style={styles.stats}>
      <Text style={[styles.stat, { color: GRADIENT[1] }]}>{got}/{node.unlockCells}</Text>
      <Text style={[styles.stat, { color: '#f43f5e' }]}>✗{errors}</Text>
      <Text style={[styles.stat, { color: colors.text }]}>{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}</Text>
    </View>
  );

  return (
    <GameShell
      title={t('deepTitle')}
      onBack={rise}
      stats={stats}
      scrollableField
      confirmExit={path === '' && liveGame && hist.canUndo}
      resumable
      onSaveBeforeExit={saveBeforeExit}
      headerActions={(
        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('btn_undo')}
            testID="deep-undo"
            onPress={undo}
            disabled={!hist.canUndo}
            style={[styles.undoBtn, {
              backgroundColor: colors.surface, borderColor: colors.border,
              opacity: hist.canUndo ? 1 : 0.4,
            }]}
          >
            <Ionicons name="arrow-undo" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}
      toolbar={(
        <View style={styles.pad}>
          {Array.from({ length: DEEP_N }, (_, i) => i + 1).map((n) => (
            <TouchableOpacity
              key={n}
              accessibilityRole="button"
              onPress={() => { if (selected) place(selected.r, selected.c, n); }}
              style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{n}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('a11yErase')}
            onPress={() => { if (selected) place(selected.r, selected.c, 0); }}
            style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="backspace-outline" size={19} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}
    >
      <View style={styles.playWrap}>
        {crumbs}
        <View style={[styles.grid, { borderColor: colors.text }]}>
          {Array.from({ length: DEEP_N }, (_, r) => (
            <View key={r} style={styles.row}>
              {Array.from({ length: DEEP_N }, (_, c) => {
                const v = valueAt(path, r, c);
                const given = node.puzzle[r]![c] !== 0;
                const isFeed = feedSet.has(`${r},${c}`);
                const isSel = selected?.r === r && selected?.c === c;
                const hand = grids[path]?.[r]?.[c] ?? 0;
                const wrong = !given && hand !== 0 && hand !== node.solution[r]![c];
                return (
                  <TouchableOpacity
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={isFeed ? `${r + 1}·${c + 1} · ${t('deepDiveHint')}` : `${r + 1}·${c + 1}`}
                    testID={`deep-cell-${r}-${c}`}
                    disabled={given}
                    onPress={() => { if (isFeed) dive(r, c); else setSelected({ r, c }); }}
                    style={[styles.cell, {
                      width: cell, height: cell,
                      backgroundColor: isSel ? GRADIENT[1]
                        : isFeed && v === 0 ? (isDark ? '#3a3358' : '#ece9f7') : colors.surface,
                      borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                      borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                      borderColor: colors.text,
                    }]}
                  >
                    {isFeed && (
                      <>
                        <View pointerEvents="none" style={[styles.fedRing, {
                          borderColor: isDark ? '#6f66a8' : '#a89fdb',
                          borderStyle: v === 0 ? 'dashed' : 'solid',
                          opacity: v === 0 ? 1 : 0.45,
                        }]} />
                        {v === 0 && ghost(childPath(path, r, c), cell)}
                      </>
                    )}
                    <Text style={{
                      fontSize: cell * 0.5,
                      fontWeight: given ? '800' : '600',
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
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {node.feedCells.length > 0 ? t('deepDiveHint') : t('deepLeafHint')}
        </Text>
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
  presetCard: { borderRadius: 14, padding: 14, gap: 4 },
  presetName: { fontSize: 16, fontWeight: '800' },
  presetDesc: { fontSize: 12.5, lineHeight: 18 },

  playWrap: { alignItems: 'center', paddingTop: 4, paddingBottom: 150, gap: 8 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crumbDot: { minWidth: 26, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  crumbText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  crumbLabel: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  stats: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  stat: { fontSize: 13, fontWeight: '700' },
  headerActionsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  undoBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  grid: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  fedRing: { position: 'absolute', top: 1.5, left: 1.5, right: 1.5, bottom: 1.5, borderRadius: 3, borderWidth: 1 },
  ghostWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },

  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', maxWidth: 280 },
  key: { width: 48, height: 48, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  resultTitle: { fontSize: 22, fontWeight: '800' },
  resultSub: { fontSize: 14 },
});
