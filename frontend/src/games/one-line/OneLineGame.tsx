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
import Svg, { Line } from 'react-native-svg';
import {
  advanceFromOneLineTraining,
  createOneLineSession,
  disposeOneLineSession,
  getCurrentOneLinePuzzle,
  getOneLineStrings,
  hintOneLineMove,
  interpolateOneLine,
  nearestVertex,
  pauseOneLineSession,
  restartOneLineSession,
  resumeOneLineSession,
  selectOneLineVertex,
  startOneLineTraining,
  undoOneLineMove,
  type GraphVertex,
  type OneLineLocale,
  type OneLineMetrics,
  type OneLinePuzzle,
  type OneLineSession,
} from './core/index';

export interface OneLineTheme {
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
}

export interface OneLineGameProps {
  seed: string;
  level: number;
  locale: OneLineLocale;
  theme: OneLineTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  showOwnResults?: boolean;
  now?: () => number;
  onComplete?: (result: OneLineMetrics) => void;
  onExit?: () => void;
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
  theme: OneLineTheme;
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
      <Text style={[styles.actionButtonText, { color: secondary ? theme.text : theme.background }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function nearestDirectionalVertex(
  vertices: readonly GraphVertex[],
  currentId: string,
  horizontal: number,
  vertical: number,
): GraphVertex | null {
  const current = vertices.find((vertex) => vertex.id === currentId);
  if (!current) return null;
  let best: GraphVertex | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of vertices) {
    if (candidate.id === currentId) continue;
    const dx = candidate.x - current.x;
    const dy = candidate.y - current.y;
    const projection = dx * horizontal + dy * vertical;
    if (projection <= 0.015) continue;
    const perpendicular = Math.abs(dx * vertical - dy * horizontal);
    const distance = Math.hypot(dx, dy);
    const score = perpendicular * 3 + distance;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

interface OneLineBoardProps {
  session: OneLineSession;
  puzzle: OneLinePuzzle;
  locale: OneLineLocale;
  theme: OneLineTheme;
  gameGradientText: string;
  disabled: boolean;
  onSelect: (vertexId: string) => void;
  onUndo: () => void;
  onHint: () => void;
  onRestart: () => void;
  onPause: () => void;
}

function OneLineBoard({
  session,
  puzzle,
  locale,
  theme,
  gameGradientText,
  disabled,
  onSelect,
  onUndo,
  onHint,
  onRestart,
  onPause,
}: OneLineBoardProps) {
  const strings = getOneLineStrings(locale);
  const initialCursor = puzzle.startHintVertexId ?? puzzle.vertices[0]?.id ?? '';
  const [cursorId, setCursorId] = React.useState(initialCursor);
  const [boardSize, setBoardSize] = React.useState(320);
  const [focused, setFocused] = React.useState(false);
  const byId = React.useMemo(
    () => new Map(puzzle.vertices.map((vertex) => [vertex.id, vertex])),
    [puzzle.vertices],
  );
  const usedEdges = React.useMemo(() => new Set(session.edgeTrail), [session.edgeTrail]);
  const hinted = React.useMemo(() => new Set(session.hintVertexIds), [session.hintVertexIds]);
  const currentId = session.vertexTrail[session.vertexTrail.length - 1] ?? null;

  const choose = React.useCallback((vertexId: string) => {
    if (disabled || currentId === vertexId) return;
    setCursorId(vertexId);
    onSelect(vertexId);
  }, [currentId, disabled, onSelect]);

  const selectAtPoint = React.useCallback((x: number, y: number) => {
    if (disabled || boardSize <= 0) return;
    const vertex = nearestVertex(puzzle.vertices, x / boardSize, y / boardSize, 38 / boardSize);
    if (!vertex || currentId === vertex.id) return;
    choose(vertex.id);
  }, [boardSize, choose, currentId, disabled, puzzle.vertices]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (event) => selectAtPoint(
      event.nativeEvent.locationX,
      event.nativeEvent.locationY,
    ),
    onPanResponderMove: (event) => selectAtPoint(
      event.nativeEvent.locationX,
      event.nativeEvent.locationY,
    ),
    onPanResponderRelease: () => undefined,
    onPanResponderTerminate: () => undefined,
    onPanResponderTerminationRequest: () => false,
  });

  const moveCursor = React.useCallback((horizontal: number, vertical: number) => {
    if (disabled) return;
    const current = cursorId || initialCursor;
    const next = nearestDirectionalVertex(puzzle.vertices, current, horizontal, vertical);
    if (next) setCursorId(next.id);
  }, [cursorId, disabled, initialCursor, puzzle.vertices]);

  const activateCursor = React.useCallback(() => {
    if (cursorId) choose(cursorId);
  }, [choose, cursorId]);

  const cycleCursor = React.useCallback((delta: number) => {
    const index = Math.max(0, puzzle.vertices.findIndex((vertex) => vertex.id === cursorId));
    const nextIndex = (index + delta + puzzle.vertices.length) % puzzle.vertices.length;
    const next = puzzle.vertices[nextIndex];
    if (next) setCursorId(next.id);
  }, [cursorId, puzzle.vertices]);

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') cycleCursor(1);
    if (event.nativeEvent.actionName === 'decrement') cycleCursor(-1);
    if (event.nativeEvent.actionName === 'activate') activateCursor();
  };

  const webKeyboardProps = Platform.OS === 'web' ? ({
    role: 'application',
    tabIndex: disabled ? -1 : 0,
    onKeyDown: (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      const handled = [
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ',
        'u', 'U', 'h', 'H', 'r', 'R', 'p', 'P',
      ].includes(key);
      if (handled) {
        event.preventDefault?.();
        event.nativeEvent?.preventDefault?.();
      }
      if (key === 'ArrowLeft') moveCursor(-1, 0);
      if (key === 'ArrowRight') moveCursor(1, 0);
      if (key === 'ArrowUp') moveCursor(0, -1);
      if (key === 'ArrowDown') moveCursor(0, 1);
      if (key === 'Enter' || key === ' ') activateCursor();
      if (key === 'u' || key === 'U') onUndo();
      if (key === 'h' || key === 'H') onHint();
      if (key === 'r' || key === 'R') onRestart();
      if (key === 'p' || key === 'P') onPause();
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};

  const valueText = interpolateOneLine(strings.progress, {
    used: session.edgeTrail.length,
    total: puzzle.edges.length,
  });

  return (
    <View
      {...panResponder.panHandlers}
      {...webKeyboardProps}
      accessible
      focusable={!disabled}
      accessibilityRole="adjustable"
      accessibilityLabel={strings.graphLabel}
      accessibilityHint={strings.graphHint}
      accessibilityValue={{
        min: 0,
        max: puzzle.edges.length,
        now: session.edgeTrail.length,
        text: valueText,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
      onAccessibilityAction={handleAccessibilityAction}
      onLayout={(event) => setBoardSize(Math.max(1, event.nativeEvent.layout.width))}
      style={[
        styles.board,
        { backgroundColor: theme.surface, borderColor: theme.border },
        focused && ({
          outlineColor: theme.warning,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 3,
        } as any),
      ]}
    >
      <Svg
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        width={boardSize}
        height={boardSize}
        style={styles.svg}
      >
        {puzzle.edges.map((edge) => {
          const a = byId.get(edge.a);
          const b = byId.get(edge.b);
          if (!a || !b) return null;
          const used = usedEdges.has(edge.id);
          return (
            <Line
              key={edge.id}
              x1={a.x * boardSize}
              y1={a.y * boardSize}
              x2={b.x * boardSize}
              y2={b.y * boardSize}
              stroke={used ? theme.primary : theme.border}
              strokeWidth={used ? 7 : 4}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
      {puzzle.vertices.map((vertex, index) => {
        const isCurrent = currentId === vertex.id;
        const isHint = hinted.has(vertex.id);
        const isStart = session.vertexTrail.length === 0 && puzzle.startHintVertexId === vertex.id;
        const isCursor = cursorId === vertex.id;
        const markers = [
          isStart ? strings.startMarker : '',
          isCurrent ? strings.currentMarker : '',
          isHint ? strings.hintMarker : '',
        ].filter(Boolean).join('. ');
        const label = `${interpolateOneLine(strings.vertexLabel, { number: index + 1 })}${markers ? `. ${markers}` : ''}`;
        return (
          <Pressable
            key={vertex.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={strings.graphHint}
            disabled={disabled}
            hitSlop={4}
            onPress={() => choose(vertex.id)}
            style={({ pressed }) => [
              styles.vertexTarget,
              {
                left: vertex.x * boardSize - 24,
                top: vertex.y * boardSize - 24,
                backgroundColor: isCurrent ? theme.primary : theme.surface,
                borderColor: isHint || isStart ? theme.warning : theme.primary,
              },
              (isHint || isStart) && styles.hintedVertex,
              isCursor && { shadowColor: theme.warning, shadowOpacity: 1, shadowRadius: 0 },
              isCursor && ({ outlineColor: theme.warning, outlineStyle: 'solid', outlineWidth: 3 } as any),
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.vertexText, { color: isCurrent ? gameGradientText : theme.text }]}>
              {index + 1}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OneLineSessionView({
  seed,
  level,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  showOwnResults = true,
  now = Date.now,
  onComplete,
  onExit,
}: OneLineGameProps) {
  const strings = getOneLineStrings(locale);
  const [session, setSession] = React.useState(() => createOneLineSession({ seed, level }));
  const sessionRef = React.useRef(session);
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    if (session.phase === 'result' && session.result && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(session.result);
    }
  }, [onComplete, session.phase, session.result]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setSession((current) => pauseOneLineSession(current, now()));
      }
    });
    return () => subscription.remove();
  }, [now]);

  React.useEffect(() => () => {
    sessionRef.current = disposeOneLineSession(sessionRef.current);
  }, []);

  const restart = () => {
    completedRef.current = false;
    setSession((current) => restartOneLineSession(current, now()));
  };

  if (session.phase === 'disposed') return null;

  if (session.phase === 'rules') {
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: gameGradient[0] }]}>
          <Text accessibilityRole="header" style={[styles.heroTitle, { color: gameGradientText }]}>{strings.title}</Text>
          <Text style={[styles.heroSkill, { color: gameGradientText }]}>{strings.skill}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.rulesTitle}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesBody}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesRepeat}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesCrossing}</Text>
          <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
        </View>
        <View style={styles.actions}>
          <ActionButton label={strings.startTraining} theme={theme} onPress={() => setSession(startOneLineTraining)} />
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
          <ActionButton label={strings.resume} theme={theme} onPress={() => setSession((current) => resumeOneLineSession(current, now()))} />
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
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{session.result.specific.hintsUsed}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.hints}</Text></View>
        </View>
        <Text style={[styles.seed, { color: theme.textSecondary }]}>{strings.seed}: {session.result.seed}</Text>
        <ActionButton label={strings.playAgain} theme={theme} onPress={restart} />
      </ScrollView>
    );
  }

  const puzzle = getCurrentOneLinePuzzle(session);
  const training = session.phase === 'training' || session.phase === 'training-complete';
  const trainingComplete = session.phase === 'training-complete';
  // Исправления = отменённые ходы + отвергнутые: ровно то, из чего складывается
  // штраф в accuracy. Подсказки считаются отдельно и показаны в итоге.
  const corrections = session.undoCount + session.invalidMoves;
  const roundLabel = training
    ? `${strings.training} · ${puzzle.vertices.length} / ${puzzle.edges.length}`
    : interpolateOneLine(strings.roundLabel, {
      level: puzzle.level,
      vertices: puzzle.vertices.length,
      edges: puzzle.edges.length,
    });

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.gameContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>{strings.title}</Text>
          <Text style={[styles.round, { color: theme.textSecondary }]}>{roundLabel}</Text>
        </View>
        {!trainingComplete ? (
          <ActionButton label={strings.pause} theme={theme} secondary onPress={() => setSession((current) => pauseOneLineSession(current, now()))} />
        ) : null}
      </View>
      {training ? <Text style={[styles.trainingHint, { color: theme.textSecondary }]}>{strings.trainingHint}</Text> : null}
      {/*
        ЦЕНА ОШИБКИ ВИДНА, А НЕ ТОЛЬКО ПОСЧИТАНА.
        Ход в несоседнюю вершину модуль отвергал МОЛЧА: линия не двигалась,
        счётчик исправлений рос, и на нём же держится порог прохождения уровня.
        То есть человека штрафовали, не сказав за что, — поймано глазами на
        втором уровне 19.08.2026. Слово берём из своего же словаря, поэтому
        приложению это не стоит ни одного нового ключа на двенадцать языков.
      */}
      <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: theme.textSecondary }]}>
        {interpolateOneLine(strings.progress, { used: session.edgeTrail.length, total: puzzle.edges.length })}
        {corrections > 0 ? ` · ${strings.corrections}: ${corrections}` : ''}
      </Text>
      {/*
        ПРАВИЛО ВИДНО ВО ВРЕМЯ ПАРТИИ, А НЕ ТОЛЬКО НА ЭКРАНЕ ПРАВИЛ.
        В лаборатории эта строка существовала лишь как accessibilityHint доски:
        её читал скринридер, а глазами её не видел никто. Между тем правило
        «в вершину вернуться можно, в ребро — нет» и есть то, обо что человек
        спотыкается на первом же графе, а уходить за ним в справку посреди
        партии никто не станет. Строка идёт из словаря модуля, поэтому лишних
        ключей приложению не приносит.
      */}
      <Text style={[styles.fieldRule, { color: theme.textSecondary }]}>{strings.rulesRepeat}</Text>
      <OneLineBoard
        key={`${puzzle.id}:${trainingComplete ? 'complete' : 'active'}`}
        session={session}
        puzzle={puzzle}
        locale={locale}
        theme={theme}
        gameGradientText={gameGradientText}
        disabled={trainingComplete}
        onSelect={(vertexId) => setSession((current) => selectOneLineVertex(current, vertexId, now()))}
        onUndo={() => setSession(undoOneLineMove)}
        onHint={() => setSession(hintOneLineMove)}
        onRestart={restart}
        onPause={() => setSession((current) => pauseOneLineSession(current, now()))}
      />
      {trainingComplete ? (
        <View accessibilityLiveRegion="polite" style={[styles.card, styles.successCard, { backgroundColor: theme.card, borderColor: theme.success }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.success }]}>{strings.trainingDone}</Text>
          <ActionButton label={strings.startRound} theme={theme} onPress={() => setSession((current) => advanceFromOneLineTraining(current, now()))} />
        </View>
      ) : (
        <View style={styles.actions}>
          <ActionButton label={strings.undo} theme={theme} secondary disabled={session.vertexTrail.length === 0} onPress={() => setSession(undoOneLineMove)} />
          <ActionButton label={strings.hint} theme={theme} secondary onPress={() => setSession(hintOneLineMove)} />
          <ActionButton label={strings.restart} theme={theme} secondary onPress={restart} />
        </View>
      )}
    </ScrollView>
  );
}

export default function OneLineGame(props: OneLineGameProps) {
  const sessionKey = JSON.stringify([props.seed, props.level]);
  return <OneLineSessionView {...props} key={sessionKey} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 18, gap: 14 },
  gameContent: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 12, gap: 10 },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 16 },
  hero: { width: '100%', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 22, gap: 8 },
  heroTitle: { fontSize: 30, fontWeight: '900', textAlign: 'center' },
  heroSkill: { opacity: 0.92, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  card: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23 },
  keyboardHelp: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  actionButton: { minHeight: 48, minWidth: 140, borderRadius: 16, paddingHorizontal: 17, paddingVertical: 13, justifyContent: 'center', alignItems: 'center' },
  actionButtonText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.74 },
  disabled: { opacity: 0.42 },
  pauseCard: { maxWidth: 520 },
  topRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  gameTitle: { fontSize: 22, fontWeight: '900' },
  round: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  trainingHint: { fontSize: 14, textAlign: 'center' },
  progress: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  fieldRule: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
  board: { width: '100%', maxWidth: 620, alignSelf: 'center', aspectRatio: 1, borderWidth: 2, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  svg: { position: 'absolute', left: 0, top: 0 },
  vertexTarget: { position: 'absolute', width: 48, height: 48, borderRadius: 24, borderWidth: 4, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  hintedVertex: { borderWidth: 6 },
  vertexText: { fontSize: 15, fontWeight: '900', textAlign: 'center' },
  successCard: { maxWidth: 620, alignSelf: 'center' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  metric: { minWidth: 140, flexGrow: 1, flexBasis: '45%', padding: 12, alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  metricLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  seed: { fontSize: 12, textAlign: 'center' },
});
