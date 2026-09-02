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
  cageTint, cageSumFontSize, thermoThick, thermoColor, thermoSegment, thermoBulb,
} from '@/src/services/sudoku-overlay';
import {
  DEEP_N, childPath, parentOf, depthOf,
  materializeNode, materializePick, countDeep,
  deepNodeProgress, deepNodeDone, deepValueAt, deepRootComplete,
  deepPortalsFor, portalOfLeaf,
  type DeepCfg, type DeepNode, type DeepPath, type DeepPick, type DeepPortal,
} from '@/src/services/fractal-deep';

/** Узел на экране: движковый + портальная сторона листа (X5). */
type ScreenNode = DeepNode & {
  portal?: { cell: [number, number]; drop: [number, number]; partnerPath: DeepPath; partnerCell: [number, number]; digit: number };
};

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

const cfgOf = (key: PresetKey, spice = false): DeepCfg => {
  const p = PRESETS.find((x) => x.key === key)!;
  return { depth: p.depth, feedCount: p.feedCount, rating: p.rating, unlockShare: p.unlockShare, spice };
};

type Phase = 'config' | 'play' | 'result';

/** Один ход: узел, клетка, что там стояло. Отмена пишет prev обратно — и всё. */
interface DeepMove { path: DeepPath; r: number; c: number; prev: number }

interface DeepResume {
  preset: PresetKey;
  /** Приправа листьев. Без неё продолжение собрало бы доску БЕЗ выкопанных цифр —
   *  и рука человека встала бы на клетки, которых в новой доске нет пустыми. */
  spice?: boolean;
  seed: string;
  path: DeepPath;
  grids: Record<DeepPath, number[][]>;
  /** Пометки карандаша; поле опциональное — снимки до X5 живут без него (RESUME_V не бампался). */
  marks?: Record<DeepPath, number[][]>;
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
  /**
   * ПРИПРАВА (§7е пп.56–57): термометры и клетки-суммы на нижнем слое. Отдельный
   * тумблер, а не свойство пресета: объём партии и её правила — разные решения,
   * и мешать их в одну карточку значит заставить выбирать вслепую.
   */
  const [spice, setSpice] = useState(false);
  const [seed, setSeed] = useState('');
  const [path, setPath] = useState<DeepPath>('');
  /** Наигранное по ТРОННУТЫМ узлам: путь → доска (0 = пусто). Ключ снимка партии. */
  const [grids, setGrids] = useState<Record<DeepPath, number[][]>>({});
  /**
   * Карандаш (X5): пометки-кандидаты по тронутым узлам, битмаской на клетку
   * (бит n-1 = цифра n). Той же формы, что grids — снимок хранит только тронутое.
   */
  const [marks, setMarks] = useState<Record<DeepPath, number[][]>>({});
  const [pencilOn, setPencilOn] = useState(false);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [errors, setErrors] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [won, setWon] = useState(false);
  // Лента ходов — ОБЩИМ хуком (undo-honesty): один список по всем узлам дерева.
  const hist = useMoveHistory<DeepMove>();
  /** Счёт партии для карточки настройки: пазлов всего по слоям. */
  const [sizes, setSizes] = useState<Record<PresetKey, number[] | null>>({ scout: null, trek: null, abyss: null });

  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Кэш материализованных узлов и дешёвых picks (призраки нетронутых детей).
   * useMemo, а не ref: кэш читается В РЕНДЕРЕ (правило react-hooks/refs запрещает
   * там ref.current), а пересоздаётся сам при смене зерна или пресета — узлы
   * детерминированы от (зерно, путь), так что одинаковое зерно = валидный кэш.
   */
  const cache = React.useMemo(
    () => ({ nodes: new Map<DeepPath, ScreenNode>(), picks: new Map<DeepPath, DeepPick>(), portals: new Map<DeepPath, DeepPortal[]>() }),
    // Зерно и пресет — КЛЮЧ СБРОСА кэша, а не «использованные значения»: одно зерно =
    // те же узлы, смена зерна обязана дать пустые карты.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, preset],
  );

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  useEffect(() => {
    if (phase !== 'result') return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [phase]);

  const cfg = cfgOf(preset, spice);

  /** Материализовать узел (с решением) — через кэш и цепочку кормящих цифр.
   *  Листу применяется его сторона портала (X5): дроп-подсказка снимается,
   *  blanks/порог пересчитываются — вся остальная арифметика видит уже
   *  дропнутую доску и согласована бесплатно. */
  const nodeAt = useCallback(function nodeAtFn(p: DeepPath): ScreenNode {
    const hit = cache.nodes.get(p);
    if (hit) return hit;
    const par = parentOf(p);
    const parentNode = par === null ? null : nodeAtFn(par.parent);
    const digit = parentNode === null ? 0 : parentNode.solution[par!.cell[0]]![par!.cell[1]]!;
    let node: ScreenNode = materializeNode(seed, p, cfg, digit);
    if (par !== null && parentNode !== null && depthOf(p) === cfg.depth - 1) {
      let plan = cache.portals.get(par.parent);
      if (!plan) {
        plan = deepPortalsFor(seed, par.parent, cfg, parentNode.solution);
        cache.portals.set(par.parent, plan);
      }
      const side = portalOfLeaf(plan, p);
      if (side) {
        const puzzle = node.puzzle.map((row) => [...row]);
        puzzle[side.drop[0]]![side.drop[1]] = 0;
        const blanks = node.blanks + 1;
        node = {
          ...node, puzzle, blanks,
          unlockCells: Math.max(1, Math.min(blanks, Math.ceil(blanks * cfg.unlockShare))),
          portal: side,
        };
      }
    }
    cache.nodes.set(p, node);
    return node;
  }, [seed, preset, spice, cache]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pickAt = (p: DeepPath): DeepPick => {
    const hit = cache.picks.get(p);
    if (hit) return hit;
    const pick = materializePick(seed, p, cfg);
    cache.picks.set(p, pick);
    return pick;
  };

  // Вся арифметика всплытия — в движке (fractal-deep.ts), под юнит-тестами.
  const nodeDone = useCallback((p: DeepPath): boolean => deepNodeDone(nodeAt, grids, p), [grids, nodeAt]);
  const valueAt = useCallback((p: DeepPath, r: number, c: number): number => deepValueAt(nodeAt, grids, p, r, c), [grids, nodeAt]);

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
    setSeed(s);
    setPath('');
    setGrids({});
    setMarks({});
    setPencilOn(false);
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

  /** Пометка карандашом: тоггл бита цифры. По занятой рукой клетке не работает. */
  const pencil = (r: number, c: number, n: number) => {
    const node = nodeAt(path);
    if (node.puzzle[r]![c] !== 0) return;
    if (node.feedCells.some(([fr, fc]) => fr === r && fc === c)) return;
    if ((grids[path]?.[r]?.[c] ?? 0) !== 0) return;
    setMarks((prev) => {
      const m = (prev[path] ?? Array.from({ length: DEEP_N }, () => Array(DEEP_N).fill(0))).map((row) => [...row]);
      m[r]![c] = n === 0 ? 0 : (m[r]![c]! ^ (1 << (n - 1)));
      return { ...prev, [path]: m };
    });
    sndPlace();
  };

  /** Поставить/стереть цифру рукой. Кормимые и подсказки не принимают руку. */
  const place = (r: number, c: number, n: number) => {
    if (phase !== 'play') return;
    if (pencilOn) { pencil(r, c, n); return; }
    const node = nodeAt(path);
    if (node.puzzle[r]![c] !== 0) return;
    if (node.feedCells.some(([fr, fc]) => fr === r && fc === c)) return;
    const prev = grids[path]?.[r]?.[c] ?? 0;
    if (prev === n) return;
    if (n !== 0) {
      const g = grids[path] ?? Array.from({ length: DEEP_N }, () => Array(DEEP_N).fill(0));
      // Ошибка — только доказуемая: цифра уже стоит в строке/столбце/блоке.
      const visible = g.map((row, rr) => row.map((v, cc) => valueAt(path, rr, cc) || v));
      // Портал (X5): клетки пары держат ОДНУ цифру — рука против уже стоящей руки
      // партнёра ловится как доказуемая ошибка, тем же счётом, что конфликт в доске.
      const pt = node.portal;
      const portalClash = !!pt && pt.cell[0] === r && pt.cell[1] === c
        && (grids[pt.partnerPath]?.[pt.partnerCell[0]]?.[pt.partnerCell[1]] ?? 0) !== 0
        && (grids[pt.partnerPath]![pt.partnerCell[0]]![pt.partnerCell[1]]) !== n;
      if (conflictsInChild(visible, r, c, n) || portalClash) { sndWrong(); setErrors((e) => e + 1); }
      else sndPlace();
    }
    hist.push({ path, r, c, prev });
    // Свежие доски считаем руками, а не из setState-колбэка: победа проверяется
    // прямо в ходе (как у фрактала-босса), эффект с синхронным setState запрещён.
    const g = (grids[path] ?? Array.from({ length: DEEP_N }, () => Array(DEEP_N).fill(0))).map((row) => [...row]);
    g[r]![c] = n;
    const next = { ...grids, [path]: g };
    setGrids(next);
    // Рука закрыла клетку — карандашные следы под ней больше не о чём.
    if (n !== 0 && (marks[path]?.[r]?.[c] ?? 0) !== 0) {
      setMarks((prev) => {
        const m = (prev[path] ?? Array.from({ length: DEEP_N }, () => Array(DEEP_N).fill(0))).map((row) => [...row]);
        m[r]![c] = 0;
        return { ...prev, [path]: m };
      });
    }
    if (deepRootComplete(nodeAt, next)) void finish(true);
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

  useGameKeyboard({
    ...digitKeys((n) => { if (selected) place(selected.r, selected.c, n); }),
    Escape: () => setSelected(null),
  }, phase === 'play');

  // ───────────────────── незаконченная партия ─────────────────────
  const snapshot = (): DeepResume => ({ preset, spice, seed, path, grids, marks, errors, elapsed, history: hist.serialize() });
  const applyResume = (s: DeepResume) => {
    setPreset(s.preset);
    setSpice(s.spice ?? false);   // снимки до приправы её не несут — это чистая классика
    setSeed(s.seed);
    setPath(s.path ?? '');
    setGrids(s.grids ?? {});
    setMarks(s.marks ?? {});
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
  }, [grids, marks, path, errors, liveGame]);   // eslint-disable-line react-hooks/exhaustive-deps

  const liveRef = useRef<{ ok: boolean; pid?: string; snap: () => DeepResume }>({ ok: false, snap: () => ({} as DeepResume) });
  useEffect(() => { liveRef.current = { ok: liveGame, pid: profile?.id, snap: snapshot }; });
  const saveBeforeExit = () => {
    const l = liveRef.current;
    if (l.ok && l.pid) saveResume(GAME_ID, l.pid, RESUME_V, l.snap()).catch(() => {});
  };
  useEffect(() => () => { saveBeforeExit(); }, []);

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
                    const { byDepth } = countDeep('size-preview', cfgOf(p.key));
                    setSizes((prev) => ({ ...prev, [p.key]: byDepth }));
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
                  {sizes[p.key] !== null ? `  ·  ${t('deepPuzzles')}: ~${sizes[p.key]!.reduce((x, y) => x + y, 0)}` : ''}
                </Text>
                {/* Каталожное превью (X5): дерево слоями — сколько пазлов прячется на
                    каждой глубине. Полоса лог-шкалой: 81 линейно раздавил бы единицу. */}
                {sizes[p.key] !== null && (
                  <View style={styles.layerPreview}>
                    {sizes[p.key]!.map((n, d) => (
                      <View key={d} style={styles.layerRow}>
                        <Text style={[styles.layerLabel, { color: colors.textSecondary }]}>L{d + 1}</Text>
                        <View style={[styles.layerBarTrack, { backgroundColor: colors.border }]}>
                          <View style={[styles.layerBarFill, {
                            backgroundColor: on ? GRADIENT[1] : colors.textSecondary,
                            width: `${Math.max(8, Math.round(100 * Math.log10(1 + n) / Math.log10(1 + Math.max(...sizes[p.key]!))))}%`,
                          }]} />
                        </View>
                        <Text style={[styles.layerCount, { color: colors.text }]}>~{n}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Приправа листьев: правило, а не объём — потому отдельной строкой под пресетами. */}
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: spice }}
            accessibilityLabel={t('deepSpice')}
            testID="deep-spice-toggle"
            onPress={() => setSpice((v) => !v)}
            style={[styles.spiceRow, {
              backgroundColor: colors.surface,
              borderColor: spice ? GRADIENT[1] : colors.border,
              borderWidth: spice ? 2 : 1,
            }]}
          >
            <Ionicons
              name={spice ? 'thermometer' : 'thermometer-outline'}
              size={20}
              color={spice ? GRADIENT[1] : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.presetName, { color: colors.text }]}>{t('deepSpice')}</Text>
              <Text style={[styles.presetDesc, { color: colors.textSecondary }]}>{t('deepSpiceDesc')}</Text>
            </View>
            <Ionicons
              name={spice ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={spice ? GRADIENT[1] : colors.border}
            />
          </TouchableOpacity>

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
  // Приправа листа (§7е пп.56–57): рисунок берётся из общего модуля, чтобы термометр
  // Бездны и термометр классики были ОДНОЙ фигурой, а не двумя похожими.
  const thermoMap = node.spice !== 'none' ? node.thermo : undefined;
  const cageMap = node.spice === 'thermocage' ? node.cages : undefined;
  const thermoThickPx = thermoThick(cell);
  const thermoPaint = thermoColor(colors.surface, GRADIENT[1]);
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
            accessibilityLabel={t('pencilMode')}
            accessibilityState={{ selected: pencilOn }}
            testID="deep-pencil"
            onPress={() => setPencilOn((v) => !v)}
            style={[styles.undoBtn, {
              backgroundColor: pencilOn ? GRADIENT[1] : colors.surface,
              borderColor: pencilOn ? GRADIENT[1] : colors.border,
            }]}
          >
            <Ionicons name="pencil" size={16} color={pencilOn ? '#FFF' : colors.text} />
          </TouchableOpacity>
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
                const isPortal = node.portal?.cell[0] === r && node.portal?.cell[1] === c;
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
                        : isFeed && v === 0 ? (isDark ? '#3a3358' : '#ece9f7')
                        : (cageMap && cageTint(colors.surface, cageMap.cageOf[r]![c]!)) || colors.surface,
                      borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                      borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                      borderColor: colors.text,
                    }]}
                  >
                    {/* Термометр: трубка от колбы вверх по возрастанию цифр. */}
                    {thermoMap?.[r]?.[c] && (() => {
                      const pn = thermoMap[r]![c]!;
                      const paint = { position: 'absolute' as const, backgroundColor: thermoPaint, pointerEvents: 'none' as const };
                      return (
                        <>
                          {pn.prev && <View style={{ ...paint, ...thermoSegment(r, c, pn.prev, cell, thermoThickPx) }} />}
                          {pn.next && <View style={{ ...paint, ...thermoSegment(r, c, pn.next, cell, thermoThickPx) }} />}
                          {!pn.prev && <View style={{ ...paint, ...thermoBulb(cell) }} />}
                        </>
                      );
                    })()}
                    {/* Сумма группы — в углу якорной клетки, как в классике. */}
                    {cageMap && cageMap.cageOf[r]![c]! >= 0
                      && cageMap.anchor[cageMap.cageOf[r]![c]!] === r * DEEP_N + c && (
                      <Text pointerEvents="none" style={{
                        position: 'absolute', top: 1, left: 2,
                        fontSize: cageSumFontSize(cell), fontWeight: '800',
                        color: isSel ? '#FFF' : colors.text,
                      }}>{cageMap.sum[cageMap.cageOf[r]![c]!]}</Text>
                    )}
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
                    {/* Портал (X5): циановое кольцо — эта клетка держит ту же цифру,
                        что помеченная клетка соседней доски. Кольцо гаснет с рукой. */}
                    {isPortal && (
                      <View pointerEvents="none" style={[styles.fedRing, {
                        borderColor: '#22d3ee',
                        borderStyle: hand === 0 ? 'dashed' : 'solid',
                        opacity: hand === 0 ? 1 : 0.45,
                        borderWidth: 1.5,
                      }]} />
                    )}
                    {v === 0 && !isFeed && (marks[path]?.[r]?.[c] ?? 0) !== 0 ? (
                      <View pointerEvents="none" style={styles.marksWrap}>
                        {Array.from({ length: DEEP_N }, (_, i) => i + 1).map((d) => (
                          <Text key={d} style={[styles.markDigit, {
                            fontSize: Math.max(7, cell * 0.24),
                            width: cell / 3.2,
                            color: isSel ? '#FFF' : colors.textSecondary,
                            opacity: ((marks[path]![r]![c]! >> (d - 1)) & 1) ? 1 : 0,
                          }]}>{d}</Text>
                        ))}
                      </View>
                    ) : (
                      <Text style={{
                        fontSize: cell * 0.5,
                        fontWeight: given ? '800' : '600',
                        color: isSel ? '#FFF' : wrong ? '#b91c1c' : colors.text,
                      }}>
                        {v !== 0 ? v : ''}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {selected && node.portal && node.portal.cell[0] === selected.r && node.portal.cell[1] === selected.c
            ? t('deepPortalHint').replace('{cell}', `(${node.portal.partnerCell[0] + 1}·${node.portal.partnerCell[1] + 1})`)
            : node.spice === 'thermocage' ? t('deepSpiceRuleCage')
            : node.spice === 'thermo' ? t('deepSpiceRuleThermo')
            : node.feedCells.length > 0 ? t('deepDiveHint') : t('deepLeafHint')}
        </Text>
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  configWrap: { padding: 16, gap: 12 },
  spiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, minHeight: 44 },
  hero: { borderRadius: 18, padding: 22, alignItems: 'center', gap: 6 },
  heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'center' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  cardText: { fontSize: 14, lineHeight: 20 },
  presetCard: { borderRadius: 14, padding: 14, gap: 4 },
  presetName: { fontSize: 16, fontWeight: '800' },
  presetDesc: { fontSize: 12.5, lineHeight: 18 },
  layerPreview: { gap: 3, marginTop: 6 },
  layerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  layerLabel: { fontSize: 10.5, fontWeight: '800', width: 20 },
  layerBarTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  layerBarFill: { height: '100%', borderRadius: 3 },
  layerCount: { fontSize: 10.5, fontWeight: '700', minWidth: 34, textAlign: 'right' },

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
  marksWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1, maxWidth: '100%' },
  markDigit: { textAlign: 'center', fontWeight: '700', lineHeight: 11 },

  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', maxWidth: 280 },
  key: { width: 48, height: 48, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  resultTitle: { fontSize: 22, fontWeight: '800' },
  resultSub: { fontSize: 14 },
});
