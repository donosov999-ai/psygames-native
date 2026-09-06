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
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { CIRCLE, Board, canPlace, moveTop, isCleared, hasAnyMove, completeIn } from '@/src/games/cake-sort/core/plate';
import { deal, levelCfg } from '@/src/games/cake-sort/core/level';
import { moveReference, starsForMoves } from '@/src/games/cake-sort/core/stars';
import { tableLayout, maxCols, PLATE_GAP, SECTOR_MIN } from '@/src/games/cake-sort/core/layout';
import { cakeThemeForProfile, CAKE_FLAVORS } from '@/src/constants/cakeThemes';

export const CS_GAME_ID = 'cake_sort';

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
  const { popups, spawn } = useScorePopups();

  const rulesHere = CS_RULES;
  const levelRules = useLevelRules(CS_GAME_ID, level, rulesHere, !done);

  const раздать = useCallback(() => {
    const d = deal(level);
    setBoard(d.board);
    setSel(null); setDone(false);
    movesRef.current = 0; setMoves(0);
  }, [level]);

  useEffect(() => { раздать(); }, [раздать]);

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
    if (!canPlace(board, i, тип)) { setSel(null); hapticTap(); return; }
    const до = board.plates.filter((p) => completeIn(p) !== null).length;
    const после = moveTop(board, sel, i);
    if (!после) { setSel(null); return; }
    movesRef.current += 1; setMoves(movesRef.current);
    setSel(null);
    // Круг замкнулся — это единственное событие, за которое здесь платят.
    const собрано = после.plates.filter((p) => p.length === 0).length - board.plates.filter((p) => p.length === 0).length;
    if (собрано > 0 || до > 0) { hapticSuccess(); spawn(width / 2 - 24, 140, '+' + собрано * 100, '#fde047'); }
    setBoard(после);
    if (isCleared(после)) { setDone(true); hapticSuccess(); }
  };

  const эталон = moveReference(cfg.types);
  const звёзды = starsForMoves(moves, эталон);
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
  stuck: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  again: { marginLeft: 10, backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
});

/** Пол читаемости сектора — вынесен, чтобы гейт мерил ту же величину, что экран. */
export { SECTOR_MIN };
