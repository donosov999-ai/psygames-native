/* psygames-game-cake-sort · VER 1 · 06.09.2026 */
/**
 * ТОРТЫ — собрать круг из ШЕСТИ секторов.
 *
 * Отдельная игра, а не режим сортировки товаров (решение Дениса). Вся правда о
 * столе живёт в ядре `src/games/cake-sort/core/**`: правила круга, решатель,
 * лестница, геометрия. Экран не считает НИЧЕГО сам — он рисует и передаёт ходы.
 *
 * 🔴 ПОЧЕМУ ЭКРАН НЕ ПОВТОРЯЕТ АРИФМЕТИКУ. В сортировке товаров ровно это
 * стоило боевого краха: экран считал ёмкости по размеру сетки, а число ниш
 * задавала маска формы, и `makeBoard` честно ронял игру. Здесь любое число —
 * из ядра, а не из соседнего ref.
 *
 * ⚠️ ТАРЕЛКИ РИСУЮТСЯ ВЕКТОРОМ, а начинка — спрайтом поверх сектора. Клин
 * нельзя нарисовать растром: он часть круга, и при любом числе тарелок его
 * размер разный. Геометрия считается в `core/layout.ts` ДО отрисовки — там же
 * лежит замер, при какой ширине сколько столбцов ещё читаемо.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Image } from 'react-native';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { hapticSuccess, hapticTap, useScorePopups, ScorePopupLayer } from '@/src/components/juice';
import { sndPlace, sndMatch, sndCombo, sndWrong } from '@/src/services/feedback';
import { saveResume, clearResume } from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { CIRCLE, Board, canPlace, moveTop, isCleared, hasAnyMove, completeIn } from '@/src/games/cake-sort/core/plate';
import { deal, levelCfg } from '@/src/games/cake-sort/core/level';
import { referenceFor, starsFor } from '@/src/games/cake-sort/core/stars';
import { solvePath, minMoves } from '@/src/games/cake-sort/core/solver';
import { tableLayout, maxCols, PLATE_GAP, SECTOR_MIN } from '@/src/games/cake-sort/core/layout';
import { cakeThemeForProfile, CAKE_FLAVORS } from '@/src/constants/cakeThemes';

export const CS_GAME_ID = 'cake_sort';

/** Версия снимка партии. Меняется, когда меняется форма состояния. */
export const CS_RESUME_VERSION = 1;

/** Подсказок на уровень. Столько же, сколько в сортировке товаров: три. */
export const HINTS_PER_LEVEL = 3;

/**
 * Правила уровня. Пока одно: очередь входящих — механика, которой нет ни в одной
 * другой нашей игре, и она обязана быть объяснена. `fromLevel` равен `QUEUE_FROM`
 * из ядра; равенство сторожит гейт, а не память.
 */
export const CS_RULES: LevelRule[] = [
  { key: 'queue', fromLevel: 7 },   // = QUEUE_FROM
];

const GRADIENT = ['#f472b6', '#f59e0b'];

/** Путь одного сектора круга: клин от центра, шестая часть. */
function wedgePath(cx: number, cy: number, r: number, index: number): string {
  const шаг = (Math.PI * 2) / CIRCLE;
  const a0 = index * шаг - Math.PI / 2;
  const a1 = a0 + шаг;
  const x0 = cx + r * Math.cos(a0); const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

export default function CakeSortGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const lvl = usePersistentLevel(CS_GAME_ID);
  const level = lvl.level;

  const тема = useMemo(() => cakeThemeForProfile(profile?.id), [profile?.id]);
  const cfg = useMemo(() => levelCfg(level), [level]);

  const [board, setBoard] = useState<Board | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);
  const movesRef = useRef(0);
  /**
   * 🔴 ОТМЕНА — СНИМОК ЦЕЛИКОМ, А НЕ «ОТКУДА-КУДА». Ход запускает каскад:
   * круг замыкается, тарелка уходит, на её место приезжает очередь. Обратный
   * ход этого не восстановит — вернуть можно только состояние.
   *
   * ⚠️ И отмена БЕСПЛАТНА, как в сортировке товаров, по той же причине: стол
   * полностью на виду, исход хода считается заранее, перебором «сделал —
   * посмотрел — откатил» ничего не разведаешь. Платит она только ходами: снятый
   * ход возвращается в счётчик, иначе звёзды давались бы за перебор.
   */
  const [история, setИстория] = useState<{ b: Board; moves: number }[]>([]);
  const [hints, setHints] = useState(HINTS_PER_LEVEL);
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);
  /**
   * 🔴 ПУТЬ ПОДСКАЗОК ПОМНИТСЯ, А НЕ ИЩЕТСЯ ЗАНОВО КАЖДЫЙ РАЗ.
   *
   * Замер поймал это гейтом: обход в глубину при каждом вызове находит ДРУГОЙ
   * путь, и две подсказки подряд отменяли друг друга — по четыреста советов на
   * стол, и стол не разобран. Каждый совет при этом законен и ведёт к решению;
   * ломается именно их последовательность. Помним путь и идём по нему, пока
   * игрок ходит как советовали; свернул — путь сбрасывается и ищется заново.
   */
  const путьRef = useRef<{ from: number; to: number }[] | null>(null);
  /** Точный минимум, если фоновый расчёт успел. Иначе звёзды идут от калибровки. */
  const [точныйМин, setТочныйМин] = useState<number | null>(null);
  const { popups, spawn } = useScorePopups();

  const rulesHere = CS_RULES;
  const levelRules = useLevelRules(CS_GAME_ID, level, rulesHere, !done);

  const раздать = useCallback(() => {
    const d = deal(level);
    setBoard(d.board);
    setSel(null); setDone(false); setHint(null);
    setИстория([]); setHints(HINTS_PER_LEVEL); setТочныйМин(null);
    путьRef.current = null;
    movesRef.current = 0; setMoves(0);
  }, [level]);

  useEffect(() => { раздать(); }, [раздать]);

  /**
   * 🔴 ТОЧНЫЙ МИНИМУМ СЧИТАЕТСЯ ФОНОМ, А НЕ НА ГЛАЗАХ У ЧЕЛОВЕКА.
   *
   * Замер: A* доходит до дна на малых столах за миллисекунды, а с шестого
   * уровня не укладывается и в 60 000 узлов (1,0–1,7 с). Держать на этом старт
   * уровня нельзя, поэтому: успел — звёзды считаются по НАСТОЯЩЕМУ минимуму,
   * не успел — по калиброванному эталону, и это честнее, чем ждать.
   */
  useEffect(() => {
    if (!board) return;
    let живо = true;
    const t = setTimeout(() => {
      const r = minMoves(board, 30000);
      if (живо && r.moves !== null) setТочныйМин(r.moves);
    }, 60);
    return () => { живо = false; clearTimeout(t); };
  }, [level]);

  /** Снимок партии: стол, ходы, подсказки. Уровень персистится сам. */
  useEffect(() => {
    if (!board || done || movesRef.current === 0) return;
    saveResume(CS_GAME_ID, profile?.id ?? 'free', CS_RESUME_VERSION, { board, moves, hints, level }).catch(() => {});
  }, [board, moves, hints, done, level, profile?.id]);

  useResumeBoot<{ board: Board; moves: number; hints: number; level: number }>(
    CS_GAME_ID, CS_RESUME_VERSION,
    (saved) => {
      if (!saved || saved.level !== level) return;
      setBoard(saved.board); setMoves(saved.moves); movesRef.current = saved.moves;
      setHints(saved.hints); setИстория([]);
    },
    false,
  );

  /**
   * Геометрия стола. Столбцов — не больше, чем читаемо влезает: число берётся
   * из `maxCols`, а не назначается вёрсткой. Строк — сколько нужно под тарелки.
   */
  const стол = useMemo(() => {
    const доступно = Math.min(width, 520) - 16;
    const cols = Math.min(maxCols(доступно), Math.max(3, Math.ceil(Math.sqrt(cfg.plates))));
    const l = tableLayout(доступно, cols);
    return { ...l, rows: Math.ceil(cfg.plates / cols), boardW: доступно };
  }, [width, cfg.plates]);

  const тронуть = (i: number) => {
    if (!board || done) return;
    const тарелка = board.plates[i] ?? [];
    if (sel === null) {
      if (!тарелка.length) { hapticTap(); return; }
      setSel(i); hapticTap(); return;
    }
    if (sel === i) { setSel(null); return; }
    const src = board.plates[sel] ?? [];
    const тип = src[src.length - 1] as number;
    if (!canPlace(board, i, тип)) { setSel(null); hapticTap(); sndWrong(); return; }
    const после = moveTop(board, sel, i);
    if (!после) { setSel(null); return; }
    setИстория((h) => [...h, { b: board, moves: movesRef.current }]);
    // Пошёл как советовали — снимаем шаг с пути; свернул — путь больше не наш.
    const шаг = путьRef.current?.[0];
    if (шаг && шаг.from === sel && шаг.to === i) путьRef.current = путьRef.current!.slice(1);
    else путьRef.current = null;
    movesRef.current += 1; setMoves(movesRef.current);
    setSel(null); setHint(null);
    /**
     * Сколько кругов замкнулось этим ходом. Считаем по ПУСТЫМ тарелкам, а не по
     * «стало меньше секторов»: очередь тут же занимает освободившееся место, и
     * разница в числе секторов соврала бы.
     */
    const пустыхДо = board.plates.filter((p) => p.length === 0).length;
    const пустыхПосле = после.plates.filter((p) => p.length === 0).length;
    const собрано = Math.max(0, пустыхПосле - пустыхДо + (board.queue.length - после.queue.length));
    if (собрано > 0) {
      hapticSuccess();
      if (собрано > 1) sndCombo(собрано); else sndMatch();
      spawn(width / 2 - 24, 140, (собрано > 1 ? `×${собрано}  ` : '') + '+' + собрано * 100, '#fde047');
    } else { hapticTap(); sndPlace(); }
    setBoard(после);
    if (isCleared(после)) { setDone(true); hapticSuccess(); clearResume(CS_GAME_ID, profile?.id ?? 'free').catch(() => {}); }
  };

  /** Отмена: возвращаем снимок и СНИМАЕМ ход со счётчика — иначе перебор бесплатен. */
  const отменить = () => {
    setИстория((h) => {
      const last = h[h.length - 1];
      if (!last) { hapticTap(); return h; }
      setBoard(last.b); movesRef.current = last.moves; setMoves(last.moves);
      путьRef.current = null;   // откат меняет стол — прежний путь к нему не относится
      setSel(null); setHint(null); hapticTap(); sndPlace();
      return h.slice(0, -1);
    });
  };

  /**
   * Подсказка — ПЕРВЫЙ ХОД настоящего решения. Не нашли за бюджет — счётчик не
   * тратим: подсказка, которой нет, не должна стоить как подсказка.
   */
  const подсказать = () => {
    if (!board || hints <= 0 || done) { hapticTap(); return; }
    if (!путьRef.current || путьRef.current.length === 0) путьRef.current = solvePath(board, 20000);
    const h = путьRef.current?.[0] ?? null;
    if (!h) { hapticTap(); sndWrong(); return; }
    setHints((n) => n - 1); setHint(h); setSel(null); hapticTap(); sndPlace();
  };

  /**
   * 🔴 ЗВЁЗДЫ ОТ НАСТОЯЩЕГО МИНИМУМА, ЕСЛИ ОН ПОСЧИТАН. Калибровка 5,6 —
   * оценка по видам; точный минимум этой раздачи лучше, и когда фон успел, берём
   * его. Разница не косметическая: на просторном столе минимум заметно меньше.
   */
  const эталон = referenceFor(cfg.types, точныйМин);
  const звёзды = starsFor(moves, cfg.types, точныйМин);
  const встал = board ? !isCleared(board) && !hasAnyMove(board) : false;

  const тарелка = (i: number) => {
    const cells = board?.plates[i] ?? [];
    const r = стол.plate / 2;
    const выбрана = sel === i;
    return (
      <TouchableOpacity
        key={i}
        activeOpacity={0.85}
        onPress={() => тронуть(i)}
        accessibilityRole="button"
        accessibilityLabel={`${t('cakePlate')} ${i + 1}: ${cells.length}/${CIRCLE}`}
        style={[styles.plateBox, { width: стол.plate, height: стол.plate, margin: PLATE_GAP / 2 }]}
      >
        {/*
          🔴 ТАРЕЛКА — КАРТИНКА, КЛИНЬЯ — ВЕКТОР. Замер: сектор при пяти
          столбцах 15,5 точки, спрайт поверх него был бы 10,8 — ниже пола
          читаемости. Тарелка же 59–104 точки и видна всегда, поэтому картинка
          тратится на неё. Вариант оправы берётся от номера тарелки, чтобы стол
          из двадцати не выглядел обоями.
        */}
        <Image
          source={тема.plates[i % тема.plates.length]}
          style={{ position: 'absolute', width: стол.plate, height: стол.plate }}
          resizeMode="contain"
        />
        <Svg width={стол.plate} height={стол.plate}>
          {cells.map((тип, k) => (
            <Path key={k} d={wedgePath(r, r, (r - 3) * 0.72, k)} fill={тема.colors[тип % тема.colors.length]} stroke="#00000022" strokeWidth={1} />
          ))}
          {выбрана && <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke="#f59e0b" strokeWidth={3} />}
          {(hint?.from === i || hint?.to === i) && (
            <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke={hint?.to === i ? '#38bdf8' : '#a3e635'} strokeWidth={3} strokeDasharray="6 5" />
          )}
        </Svg>
      </TouchableOpacity>
    );
  };

  return (
    <GameShell
      title={t('cakeSort')}
      onBack={() => goBackOrHome()}
      hud={[
        { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: level },
        { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: `${moves}/${эталон}`, tone: moves > эталон ? 'warn' as const : 'good' as const, pop: true },
        { key: 'left', icon: 'albums', label: t('cakeQueue'), value: board?.queue.length ?? 0 },
      ]}
      headerActions={<LevelRuleBadge lr={levelRules} color={colors.text} />}
    >
      <LevelRuleModal lr={levelRules} colors={colors} />
      <ScorePopupLayer popups={popups} />
      <View style={[styles.table, { width: стол.boardW }]}>
        {Array.from({ length: cfg.plates }).map((_, i) => тарелка(i))}
      </View>
      <View style={styles.tools}>
        <TouchableOpacity onPress={отменить} disabled={!история.length} style={[styles.tool, !история.length && styles.toolOff]}
          accessibilityRole="button" accessibilityLabel={t('btn_undo')}>
          <Ionicons name="arrow-undo" size={20} color={история.length ? '#fff' : '#ffffff66'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={подсказать} disabled={hints <= 0} style={[styles.tool, hints <= 0 && styles.toolOff]}
          accessibilityRole="button" accessibilityLabel={t('btn_hint')}>
          <Ionicons name="bulb" size={20} color={hints > 0 ? '#fff' : '#ffffff66'} />
          <Text style={styles.toolNum}>{hints}</Text>
        </TouchableOpacity>
      </View>
      {встал && (
        <View style={styles.stuck}>
          <Ionicons name="alert-circle" size={18} color="#fb923c" />
          <Text style={{ color: '#fb923c', marginLeft: 6 }}>{t('cakeStuck')}</Text>
          <TouchableOpacity onPress={раздать} style={styles.again}>
            <Text style={{ color: '#fff' }}>{t('restart')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {done && (
        <LevelCleared
          level={level}
          stars={звёзды}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          gameId={CS_GAME_ID}
          onContinue={() => { lvl.reach(level + 1); }}
          onStop={() => goBackOrHome()}
        />
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  table: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'center', paddingVertical: 8 },
  plateBox: { alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 4 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#00000055', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  toolOff: { opacity: 0.45 },
  toolNum: { color: '#fff', fontSize: 13 },
  stuck: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  again: { marginLeft: 10, backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
});

/** Пол читаемости сектора — вынесен, чтобы гейт мерил ту же величину, что экран. */
export { SECTOR_MIN };
