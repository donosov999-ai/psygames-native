import React from 'react';
import {
  AppState,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import {
  advanceFromTraining,
  beginPath,
  createDotsSession,
  endPath,
  extendPath,
  getCurrentPuzzle,
  getDotsStrings,
  interpolate,
  occupiedPairAt,
  pauseSession,
  restartSession,
  resumeSession,
  startRound,
  startTraining,
  undoPath,
  type Cell,
  type DotsLocale,
  type DotsMetrics,
  type DotsPair,
  type DotsPuzzle,
  type DotsSession,
} from './core/index';

export interface DotsConnectTheme {
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  success: string;
  error: string;
  warning: string;
  /**
   * Цвет надписи на главной кнопке (её заливка — `primary`).
   *
   * ⚠️ ДОБАВЛЕНО ПРИ СТЫКОВКЕ, В ЛАБОРАТОРНОМ МОДУЛЕ ЭТОГО НЕТ. Там надпись
   * бралась из `background`, и в СВЕТЛОЙ теме это верно: #F5F5F7 на синем
   * #2563eb даёт 4.75. А в тёмных профилях `background` — чистый чёрный, и на
   * том же синем выходит 4.06 при норме AA 4.5. Замерено, а не на глаз.
   * Не передан — поведение прежнее.
   */
  primaryText?: string;
}

export interface DotsConnectGameProps {
  seed: string;
  level: number;
  locale: DotsLocale;
  theme: DotsConnectTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  showOwnResults?: boolean;
  /**
   * Пропустить экран правил и тренировочную сетку — начать сразу партию.
   * Добавлено при стыковке: см. `startRound` в core/session.ts.
   */
  skipIntro?: boolean;
  now?: () => number;
  onComplete?: (result: DotsMetrics) => void;
  /**
   * Есть ли ПРЯМО СЕЙЧАС что терять — см. `hasSomethingToLose` ниже. Экран
   * держит этот флаг и отдаёт каркасу: вопрос при выходе задаётся только там,
   * где партия уже что-то накопила.
   */
  onProgress?: (armed: boolean) => void;
  /**
   * Своя кнопка «Выход» на экране правил. НЕОБЯЗАТЕЛЬНА, и это принципиально:
   * когда модуль стоит внутри `GameShell`, выход из партии один — «назад» в
   * шапке каркаса, и он проходит через вопрос «партия пропадёт». Вторая кнопка
   * рядом уводила бы МИМО вопроса.
   */
  onExit?: () => void;
}

/**
 * 🔴 ЕСТЬ ЛИ ЧТО ТЕРЯТЬ ПРИ ВЫХОДЕ.
 *
 * Считается только НАСТОЯЩАЯ партия и только с первого проложенного шага:
 *   · правила и тренировочная сетка 3×3 — это секунды и повторяются нажатием,
 *     вопрос там был бы вопросом ни о чём;
 *   · партия без единого хода тоже пуста: зерно фиксировано номером уровня,
 *     повторный вход даёт ТУ ЖЕ раскладку.
 * А вот проложенные пути не воспроизвести ничем: их человек выстраивал головой.
 */
export function hasSomethingToLose(session: DotsSession): boolean {
  const inRound = session.phase === 'playing'
    || (session.phase === 'paused' && session.pausedFrom === 'playing');
  return inRound && session.forwardMoves > 0;
}

function sameCell(left: Cell, right: Cell): boolean {
  return left.row === right.row && left.col === right.col;
}

/**
 * КУДА ТЯНЕТСЯ ПУТЬ ИЗ ЭТОЙ КЛЕТКИ — вверх, вниз, влево, вправо.
 *
 * 🔴 ЗАЧЕМ. Игра называется «Соедини точки», а рисовала залитые квадраты: конец
 * пары — клетка целиком в цвет, путь — та же клетка под прозрачностью. Денис
 * 21.08.2026 дословно: «мы сводим огромные квадратики, а там просто линии».
 * Ни точек, ни линий на экране не было вовсе.
 *
 * Чтобы нарисовать ЛЕНТУ, а не заливку, надо знать соседей по пути. Путь хранится
 * упорядоченным списком клеток, поэтому соседи — это предыдущая и следующая
 * клетка, и только они: диагоналей в этой игре нет, а совпадение по строке или
 * столбцу без соседства по списку означало бы другой виток того же пути.
 */
function pathArmsAt(path: readonly Cell[] | undefined, cell: Cell) {
  const arms = { up: false, down: false, left: false, right: false };
  if (!path) return arms;
  const at = path.findIndex((c) => sameCell(c, cell));
  if (at < 0) return arms;
  for (const near of [path[at - 1], path[at + 1]]) {
    if (!near) continue;
    if (near.col === cell.col && near.row === cell.row - 1) arms.up = true;
    if (near.col === cell.col && near.row === cell.row + 1) arms.down = true;
    if (near.row === cell.row && near.col === cell.col - 1) arms.left = true;
    if (near.row === cell.row && near.col === cell.col + 1) arms.right = true;
  }
  return arms;
}

function endpointPairAt(puzzle: DotsPuzzle, cell: Cell): DotsPair | null {
  return puzzle.pairs.find((pair) => pair.endpoints.some((endpoint) => sameCell(endpoint, cell))) ?? null;
}

function coveredCellCount(session: DotsSession): number {
  return new Set(
    Object.values(session.paths).flat().map((cell) => `${cell.row},${cell.col}`),
  ).size;
}

function colorWithAlpha(color: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

function ActionButton({
  label,
  onPress,
  theme,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  theme: DotsConnectTheme;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  const webFocusProps = Platform.OS === 'web' ? ({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};
  return (
    <Pressable
      {...webFocusProps}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary
          ? { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }
          : { backgroundColor: theme.primary },
        pressed && styles.pressed,
        focused && ({
          outlineColor: theme.warning,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 3,
        } as any),
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionButtonText, { color: secondary ? theme.text : (theme.primaryText ?? theme.background) }]}>
        {label}
      </Text>
    </Pressable>
  );
}

interface DotsBoardProps {
  session: DotsSession;
  puzzle: DotsPuzzle;
  locale: DotsLocale;
  theme: DotsConnectTheme;
  gameGradientText: string;
  disabled: boolean;
  onBegin: (cell: Cell) => void;
  onExtend: (cell: Cell) => void;
  onEnd: () => void;
  onUndo: () => void;
  onRestart: () => void;
  onPause: () => void;
}

function DotsBoard({
  session,
  puzzle,
  locale,
  theme,
  gameGradientText,
  disabled,
  onBegin,
  onExtend,
  onEnd,
  onUndo,
  onRestart,
  onPause,
}: DotsBoardProps) {
  const strings = getDotsStrings(locale);
  const firstEndpoint = puzzle.pairs[0]?.endpoints[0] ?? { row: 0, col: 0 };
  const [cursor, setCursor] = React.useState<Cell>(() => ({ ...firstEndpoint }));
  const [boardWidth, setBoardWidth] = React.useState(320);
  const [focused, setFocused] = React.useState(false);
  const pairById = React.useMemo(
    () => new Map(puzzle.pairs.map((pair) => [pair.id, pair])),
    [puzzle.pairs],
  );
  const covered = coveredCellCount(session);
  const total = puzzle.size * puzzle.size;

  const cellFromPoint = React.useCallback((x: number, y: number): Cell => {
    const unit = boardWidth / puzzle.size;
    return {
      row: Math.min(puzzle.size - 1, Math.max(0, Math.floor(y / unit))),
      col: Math.min(puzzle.size - 1, Math.max(0, Math.floor(x / unit))),
    };
  }, [boardWidth, puzzle.size]);

  const startAt = React.useCallback((cell: Cell) => {
    if (disabled) return;
    setCursor(cell);
    onBegin(cell);
  }, [disabled, onBegin]);

  const moveThrough = React.useCallback((cell: Cell) => {
    if (disabled) return;
    setCursor(cell);
    onExtend(cell);
  }, [disabled, onExtend]);

  const release = React.useCallback(() => {
    onEnd();
  }, [onEnd]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (event) => startAt(cellFromPoint(
      event.nativeEvent.locationX,
      event.nativeEvent.locationY,
    )),
    onPanResponderMove: (event) => moveThrough(cellFromPoint(
      event.nativeEvent.locationX,
      event.nativeEvent.locationY,
    )),
    onPanResponderRelease: release,
    onPanResponderTerminate: release,
    onPanResponderTerminationRequest: () => false,
  }), [cellFromPoint, disabled, moveThrough, release, startAt]);

  const moveCursor = React.useCallback((rowDelta: number, colDelta: number) => {
    if (disabled) return;
    const activePath = session.activePairId ? session.paths[session.activePairId] : null;
    const base = activePath?.[activePath.length - 1] ?? cursor;
    const next = {
      row: Math.min(puzzle.size - 1, Math.max(0, base.row + rowDelta)),
      col: Math.min(puzzle.size - 1, Math.max(0, base.col + colDelta)),
    };
    if (sameCell(base, next)) return;
    setCursor(next);
    if (session.activePairId) onExtend(next);
  }, [cursor, disabled, onExtend, puzzle.size, session.activePairId, session.paths]);

  const activateCursor = React.useCallback(() => {
    if (disabled) return;
    if (session.activePairId) onEnd();
    else onBegin(cursor);
  }, [cursor, disabled, onBegin, onEnd, session.activePairId]);

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') moveCursor(0, 1);
    if (event.nativeEvent.actionName === 'decrement') moveCursor(0, -1);
    if (event.nativeEvent.actionName === 'activate') activateCursor();
  };

  const webKeyboardProps = Platform.OS === 'web' ? ({
    role: 'grid',
    tabIndex: disabled ? -1 : 0,
    onKeyDown: (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'u', 'U', 'r', 'R', 'p', 'P'].includes(key)) {
        event.preventDefault?.();
        event.nativeEvent?.preventDefault?.();
      }
      if (key === 'ArrowLeft') moveCursor(0, -1);
      if (key === 'ArrowRight') moveCursor(0, 1);
      if (key === 'ArrowUp') moveCursor(-1, 0);
      if (key === 'ArrowDown') moveCursor(1, 0);
      if (key === 'Enter' || key === ' ') activateCursor();
      if (key === 'Escape') onEnd();
      if (key === 'u' || key === 'U') onUndo();
      if (key === 'r' || key === 'R') onRestart();
      if (key === 'p' || key === 'P') onPause();
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};

  const cursorPairId = occupiedPairAt(session, cursor) ?? endpointPairAt(puzzle, cursor)?.id;
  const cursorPair = cursorPairId ? pairById.get(cursorPairId) : null;
  const cursorCellText = cursorPair
    ? interpolate(strings.pairCell, { symbol: cursorPair.symbol })
    : strings.emptyCell;
  const boardValue = `${interpolate(strings.boardValue, {
    row: cursor.row + 1,
    col: cursor.col + 1,
    covered,
    total,
  })} ${cursorCellText}`;

  return (
    <View
      {...panResponder.panHandlers}
      {...webKeyboardProps}
      accessible
      focusable={!disabled}
      accessibilityRole="adjustable"
      accessibilityLabel={interpolate(strings.boardLabel, { size: puzzle.size })}
      accessibilityHint={strings.boardHint}
      accessibilityValue={{ min: 0, max: total, now: covered, text: boardValue }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
      onAccessibilityAction={handleAccessibilityAction}
      onLayout={(event) => setBoardWidth(Math.max(1, event.nativeEvent.layout.width))}
      style={[
        styles.board,
        { borderColor: theme.border, backgroundColor: theme.border },
        focused && ({
          outlineColor: theme.warning,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 3,
        } as any),
      ]}
    >
      {Array.from({ length: puzzle.size }, (_, row) => (
        <View key={`row-${row}`} style={styles.boardRow}>
          {Array.from({ length: puzzle.size }, (_, col) => {
            const cell = { row, col };
            const endpointPair = endpointPairAt(puzzle, cell);
            const occupiedId = occupiedPairAt(session, cell);
            const owner = occupiedId ? pairById.get(occupiedId) : endpointPair;
            const endpoint = Boolean(endpointPair);
            const selected = sameCell(cursor, cell);
            const arms = occupiedId ? pathArmsAt(session.paths[occupiedId], cell) : null;
            const band = owner ? { backgroundColor: owner.color } : null;
            return (
              <View
                key={`cell-${row}-${col}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.cell,
                  // Клетка остаётся НЕЙТРАЛЬНОЙ: цвет несёт линия и точка, а не
                  // заливка. Заливка съедала сетку и превращала поле в мозаику.
                  { borderColor: theme.border, backgroundColor: theme.surface },
                  selected && { borderColor: theme.warning, borderWidth: 3 },
                ]}
              >
                {arms && band ? (
                  <>
                    {arms.up ? <View style={[styles.armUp, band]} /> : null}
                    {arms.down ? <View style={[styles.armDown, band]} /> : null}
                    {arms.left ? <View style={[styles.armLeft, band]} /> : null}
                    {arms.right ? <View style={[styles.armRight, band]} /> : null}
                    <View style={[styles.joint, band]} />
                  </>
                ) : null}
                {endpoint && owner ? (
                  /* Конец пары — КРУГЛАЯ ТОЧКА, а не клетка в цвет. Символ внутри
                     остаётся: цвет дублируется формой ради дальтонизма (ТЗ 4.2). */
                  <View style={[styles.dot, { backgroundColor: owner.color }]}>
                    <Text style={[styles.dotSymbol, { color: gameGradientText }]}>{owner.symbol}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function DotsConnectSession({
  seed,
  level,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  showOwnResults = true,
  skipIntro = false,
  now = Date.now,
  onComplete,
  onProgress,
  onExit,
}: DotsConnectGameProps) {
  const strings = getDotsStrings(locale);
  const [session, setSession] = React.useState(() => {
    const fresh = createDotsSession({ seed, level });
    return skipIntro ? startRound(fresh, now()) : fresh;
  });
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    if (session.phase === 'result' && session.result && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(session.result);
    }
  }, [onComplete, session.phase, session.result]);

  /**
   * Наверх уходит ГОТОВЫЙ ОТВЕТ «есть что терять», а не сама партия: экрану
   * незачем разбирать фазы модуля, а модулю — знать про каркас.
   *
   * ⚠️ Зависимость — булево, а не `session`: партия меняется на каждом касании,
   * и эффект от неё дёргал бы setState экрана на каждый ход.
   */
  const armed = hasSomethingToLose(session);
  React.useEffect(() => { onProgress?.(armed); }, [armed, onProgress]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setSession((current) => pauseSession(current, now()));
      }
    });
    return () => subscription.remove();
  }, [now]);

  const restart = () => {
    completedRef.current = false;
    setSession((current) => restartSession(current, now()));
  };

  if (session.phase === 'disposed') return null;

  if (session.phase === 'rules') {
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        {/*
          ⚠️ НАЗВАНИЕ ИГРЫ ОТСЮДА УБРАНО ПРИ СТЫКОВКЕ. В лаборатории модуль
          занимает экран целиком, и заголовок ему нужен. В приложении над ним
          стоит общая шапка с тем же названием — получалось «Соедини точки»
          дважды подряд. Оставляем то, чего в шапке нет: какой навык тренируем.
        */}
        <View style={[styles.hero, { backgroundColor: gameGradient[0] }]}>
          <Text accessibilityRole="header" style={[styles.heroTitle, { color: gameGradientText }]}>{strings.skill}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.rulesTitle}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesBody}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesCoverage}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesCorrection}</Text>
          <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
        </View>
        <View style={styles.actions}>
          <ActionButton label={strings.startTraining} theme={theme} onPress={() => setSession(startTraining)} />
          {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
        </View>
      </ScrollView>
    );
  }

  if (session.phase === 'paused') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.pauseCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.pause}</Text>
          <ActionButton label={strings.resume} theme={theme} onPress={() => setSession((current) => resumeSession(current, now()))} />
          <ActionButton label={strings.restart} theme={theme} secondary onPress={restart} />
        </View>
      </View>
    );
  }

  if (session.phase === 'result' && session.result) {
    if (!showOwnResults) return null;
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: gameGradient[1] }]}>
          <Text accessibilityRole="header" style={[styles.heroTitle, { color: gameGradientText }]}>{strings.resultTitle}</Text>
          <Text style={[styles.heroSkill, { color: gameGradientText }]}>{strings.noAutoAdvance}</Text>
        </View>
        <View style={[styles.card, styles.metricsGrid, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{Math.round(session.result.accuracy * 100)}%</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.accuracy}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{(session.result.durationMs / 1000).toFixed(1)}s</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.duration}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{session.result.errors}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.corrections}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{session.result.specific.forwardMoves}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.moves}</Text></View>
        </View>
        <Text style={[styles.seed, { color: theme.textSecondary }]}>{strings.seed}: {session.result.seed}</Text>
        <ActionButton label={strings.playAgain} theme={theme} onPress={restart} />
      </ScrollView>
    );
  }

  const puzzle = getCurrentPuzzle(session);
  const training = session.phase === 'training' || session.phase === 'training-complete';
  const trainingComplete = session.phase === 'training-complete';
  const roundLabel = training
    ? `${strings.training} · ${puzzle.size}×${puzzle.size}`
    : interpolate(strings.roundLabel, {
      level: puzzle.level,
      size: puzzle.size,
      pairs: puzzle.pairCount,
    });

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.gameContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topRow}>
        {/* Название игры — в общей шапке приложения; здесь только что за раунд идёт. */}
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>{roundLabel}</Text>
        </View>
        {!trainingComplete ? (
          <ActionButton label={strings.pause} theme={theme} secondary onPress={() => setSession((current) => pauseSession(current, now()))} />
        ) : null}
      </View>
      {training ? <Text style={[styles.trainingHint, { color: theme.textSecondary }]}>{strings.trainingHint}</Text> : null}
      <DotsBoard
        key={`${puzzle.id}:${trainingComplete ? 'complete' : 'active'}`}
        session={session}
        puzzle={puzzle}
        locale={locale}
        theme={theme}
        gameGradientText={gameGradientText}
        disabled={trainingComplete}
        onBegin={(cell) => setSession((current) => beginPath(current, cell))}
        onExtend={(cell) => setSession((current) => extendPath(current, cell, now()))}
        onEnd={() => setSession(endPath)}
        onUndo={() => setSession(undoPath)}
        onRestart={restart}
        onPause={() => setSession((current) => pauseSession(current, now()))}
      />
      {trainingComplete ? (
        <View accessibilityLiveRegion="polite" style={[styles.card, styles.successCard, { backgroundColor: theme.card, borderColor: theme.success }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.success }]}>{strings.trainingDone}</Text>
          <ActionButton label={strings.startRound} theme={theme} onPress={() => setSession((current) => advanceFromTraining(current, now()))} />
        </View>
      ) : (
        <View style={styles.actions}>
          <ActionButton label={strings.undo} theme={theme} secondary disabled={session.history.length === 0} onPress={() => setSession(undoPath)} />
          <ActionButton label={strings.restart} theme={theme} secondary onPress={restart} />
        </View>
      )}
    </ScrollView>
  );
}

export default function DotsConnectGame(props: DotsConnectGameProps) {
  const sessionKey = JSON.stringify([props.seed, props.level, props.skipIntro ?? false]);
  return <DotsConnectSession {...props} key={sessionKey} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 18, gap: 14 },
  gameContent: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 12, gap: 12 },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 16 },
  hero: { width: '100%', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 22, gap: 8 },
  heroTitle: { fontSize: 30, fontWeight: '900', textAlign: 'center' },
  heroSkill: { opacity: 0.92, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  card: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23 },
  keyboardHelp: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  actionButton: { minHeight: 48, minWidth: 146, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 13, justifyContent: 'center', alignItems: 'center' },
  actionButtonText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.42 },
  pauseCard: { maxWidth: 520 },
  topRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  gameTitle: { fontSize: 17, fontWeight: '900' },
  round: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  trainingHint: { fontSize: 14, textAlign: 'center' },
  board: { width: '100%', maxWidth: 620, alignSelf: 'center', aspectRatio: 1, borderWidth: 2, borderRadius: 18, overflow: 'hidden' },
  boardRow: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  /**
   * Лента пути. Доли, а не пиксели: клетка на телефоне 48 px, на планшете вдвое
   * шире, и лента обязана расти вместе с ней. 34% ширины — читается как линия и
   * не сливается с соседней при полном поле.
   */
  armUp: { position: 'absolute', left: '33%', width: '34%', top: 0, height: '58%' },
  armDown: { position: 'absolute', left: '33%', width: '34%', bottom: 0, height: '58%' },
  armLeft: { position: 'absolute', top: '33%', height: '34%', left: 0, width: '58%' },
  armRight: { position: 'absolute', top: '33%', height: '34%', right: 0, width: '58%' },
  /** Стык в центре: без него поворот пути выглядит разорванным. */
  joint: { position: 'absolute', left: '33%', top: '33%', width: '34%', height: '34%' },
  /** Точка конца пары — поверх ленты, поэтому рисуется последней. */
  dot: { width: '62%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dotSymbol: { fontSize: 18, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  endpointSymbol: { fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
  pathSymbol: { fontSize: 15, lineHeight: 20, fontWeight: '900', textAlign: 'center' },
  successCard: { maxWidth: 620, alignSelf: 'center' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  metric: { minWidth: 140, flexGrow: 1, flexBasis: '45%', padding: 12, alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  metricLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  seed: { fontSize: 12, textAlign: 'center' },
});
