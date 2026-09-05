/* psygames-one-line-game · VER 7 · 22.08.2026 */
import React from 'react';
import {
  AppState,
  PanResponder,
  Platform,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { sndPlace } from '@/src/services/feedback';
import { ballImage, useBallStyle } from '@/src/games/balls/ballChoice';
import {
  edgeAllowsDirection,
  edgeHasUsesLeft,
  edgeUseCounts,
  totalEdgeUses,
} from '@/src/games/one-line/core/validator';
import {
  advanceFromOneLineTraining,
  createOneLineSession,
  disposeOneLineSession,
  expireOneLineSession,
  getCurrentOneLinePuzzle,
  getOneLineStrings,
  hintOneLineMove,
  interpolateOneLine,
  edgeTargetVertex,
  nearestVertex,
  oneLineScoreNow,
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
  /**
   * Есть ли ПРЯМО СЕЙЧАС что терять — см. `hasSomethingToLose` ниже. Экран
   * держит этот флаг и отдаёт каркасу: вопрос при выходе задаётся только там,
   * где партия уже что-то накопила.
   */
  onProgress?: (armed: boolean) => void;
  /**
   * Своя кнопка «Выход». НЕОБЯЗАТЕЛЬНА, и это принципиально: когда модуль стоит
   * внутри `GameShell`, выход из партии один — «назад» в шапке каркаса, и он
   * проходит через вопрос «партия пропадёт». Вторая кнопка рядом уводила бы
   * МИМО вопроса, то есть ровно тем способом, от которого вопрос защищает.
   */
  onExit?: () => void;
}

/**
 * 🔴 ЕСТЬ ЛИ ЧТО ТЕРЯТЬ ПРИ ВЫХОДЕ.
 *
 * Считается только НАСТОЯЩАЯ партия и только с первого пройденного ребра:
 *   · правила и тренировочный круг из четырёх рёбер — это секунды и
 *     повторяются нажатием, вопрос там был бы вопросом ни о чём;
 *   · партия без единого хода тоже пуста: зерно фиксировано номером уровня,
 *     повторный вход даёт ТОТ ЖЕ граф.
 * А вот пройденный маршрут не воспроизвести ничем — в нём и есть вся работа.
 */
export function hasSomethingToLose(session: OneLineSession): boolean {
  const inRound = session.phase === 'playing'
    || (session.phase === 'paused' && session.pausedFrom === 'playing');
  return inRound && session.edgeTrail.length > 0;
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
  /** Сколько раз каждое ребро пройдено: двойному одного раза мало. */
  const edgeCounts = React.useMemo(() => edgeUseCounts(session.edgeTrail), [session.edgeTrail]);

  /**
   * НОМЕР ПО ПОРЯДКУ ПРОХОДА, А НЕ НОМЕР ТОЧКИ В СПИСКЕ.
   *
   * Раньше на каждой точке стояло её место в массиве — число, которое человеку не
   * говорит ничего и при этом выглядит как подсказка. Теперь цифра появляется
   * только на пройденных и означает «сюда я пришёл таким-то шагом»: по ней видно
   * СВОЙ маршрут и понятно, где линия завернула. Если вернулся в ту же точку —
   * остаётся первый номер: путь читается по возрастанию, а не мельтешит.
   */
  const visitOrder = React.useMemo(() => {
    const order = new Map<string, number>();
    session.vertexTrail.forEach((id, index) => {
      if (!order.has(id)) order.set(id, index + 1);
    });
    return order;
  }, [session.vertexTrail]);
  const hinted = React.useMemo(() => new Set(session.hintVertexIds), [session.hintVertexIds]);
  const currentId = session.vertexTrail[session.vertexTrail.length - 1] ?? null;
  /** Фактура шаров — общий выбор приложения, меняется живьём (ballChoice). */
  const ballStyle = useBallStyle();

  const choose = React.useCallback((vertexId: string) => {
    if (disabled || currentId === vertexId) return;
    setCursorId(vertexId);
    // Взятое ребро отзывается тиком: у образцов каждый шаг слышно, и это половина
    // ощущения «линия идёт». Тише звука нет — глушится общим переключателем.
    sndPlace();
    onSelect(vertexId);
  }, [currentId, disabled, onSelect]);

  /**
   * Соседи, до которых ЕЩЁ есть непройденное ребро. Именно из них выбирается ход:
   * вершина без ребра не должна попадать под палец вовсе, иначе движение по доске
   * зовёт несуществующий ход и партия засчитывает ошибку (см. `edgeTargetVertex`).
   */
  const openNeighbours = React.useMemo(() => {
    if (!currentId) return [] as typeof puzzle.vertices;
    const ids = new Set<string>();
    for (const edge of puzzle.edges) {
      if (!edgeHasUsesLeft(edge, edgeCounts)) continue;
      if (edgeAllowsDirection(edge, currentId, edge.b) && edge.a === currentId) ids.add(edge.b);
      else if (edgeAllowsDirection(edge, currentId, edge.a) && edge.b === currentId) ids.add(edge.a);
    }
    return puzzle.vertices.filter((vertex) => ids.has(vertex.id));
  }, [currentId, edgeCounts, puzzle.edges, puzzle.vertices]);

  /**
   * ПЕРВОЕ КАСАНИЕ — выбор, откуда начать: тут вести ещё не по чему, поэтому
   * работает попадание в точку. Дальше в дело вступает только движение вдоль ребра.
   */
  /**
   * 🔴 ЛИНИИ ЗА ПАЛЬЦЕМ НЕ БЫЛО. Отрезок появлялся, только когда точка уже взята:
   * между ними палец ехал по пустому экрану, и было непонятно, ведёт он линию или
   * просто мажет. У образцов линия тянется за пальцем всё время — по ней и видно,
   * что игра тебя слышит.
   */
  const [dragPoint, setDragPoint] = React.useState<{ x: number; y: number } | null>(null);

  const startAtPoint = React.useCallback((x: number, y: number) => {
    if (disabled || boardSize <= 0 || currentId) return;
    const vertex = nearestVertex(puzzle.vertices, x / boardSize, y / boardSize, 38 / boardSize);
    if (!vertex) return;
    choose(vertex.id);
  }, [boardSize, choose, currentId, disabled, puzzle.vertices]);

  const dragToPoint = React.useCallback((x: number, y: number) => {
    if (disabled || boardSize <= 0) return;
    const from = currentId ? byId.get(currentId) : null;
    if (!from) return;
    const target = edgeTargetVertex(
      from,
      openNeighbours,
      x / boardSize,
      y / boardSize,
      { radius: 24 / boardSize },
    );
    if (target) choose(target.id);
  }, [boardSize, byId, choose, currentId, disabled, openNeighbours]);

  const selectAtPoint = React.useCallback((x: number, y: number) => {
    if (currentId) dragToPoint(x, y);
    else startAtPoint(x, y);
  }, [currentId, dragToPoint, startAtPoint]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (event) => {
      setDragPoint({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
      selectAtPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
    },
    onPanResponderMove: (event) => {
      setDragPoint({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
      selectAtPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
    },
    // Палец убрали — резинка гаснет, иначе она осталась бы висеть до следующего касания.
    onPanResponderRelease: () => setDragPoint(null),
    onPanResponderTerminate: () => setDragPoint(null),
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
    total: totalEdgeUses(puzzle.edges),
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
          const done = edgeCounts.get(edge.id) ?? 0;
          const need = edge.kind === 'double' ? 2 : 1;
          const closed = done >= need;
          const x1 = a.x * boardSize;
          const y1 = a.y * boardSize;
          const x2 = b.x * boardSize;
          const y2 = b.y * boardSize;
          const stroke = closed ? theme.primary : theme.border;
          const width = closed ? 7 : 4;

          if (edge.kind === 'double') {
            /**
             * Двойное — ДВЕ полосы рядом, а не одна пунктирная. Пунктир человек
             * читает как «недоделано», а здесь надо прочитать «пройти дважды».
             * Первый проход гасит одну полосу — остаток виден без счётчика.
             */
            const length = Math.hypot(x2 - x1, y2 - y1) || 1;
            const offX = (-(y2 - y1) / length) * 4;
            const offY = ((x2 - x1) / length) * 4;
            return (
              <React.Fragment key={edge.id}>
                <Line
                  x1={x1 + offX} y1={y1 + offY} x2={x2 + offX} y2={y2 + offY}
                  stroke={done >= 1 ? theme.primary : theme.border}
                  strokeWidth={done >= 1 ? 6 : 3} strokeLinecap="round"
                />
                <Line
                  x1={x1 - offX} y1={y1 - offY} x2={x2 - offX} y2={y2 - offY}
                  stroke={done >= 2 ? theme.primary : theme.border}
                  strokeWidth={done >= 2 ? 6 : 3} strokeLinecap="round"
                />
              </React.Fragment>
            );
          }

          if (edge.kind === 'oneway') {
            /**
             * Одностороннее — стрелка на середине. Назад по нему хода нет вовсе,
             * и человек должен видеть это ДО того, как упрётся: молча не пустить —
             * значит оставить его гадать, сломана игра или он сам не понял.
             */
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const length = Math.hypot(x2 - x1, y2 - y1) || 1;
            const dirX = (x2 - x1) / length;
            const dirY = (y2 - y1) / length;
            const size = 9;
            const tipX = midX + dirX * size;
            const tipY = midY + dirY * size;
            const wingX = -dirY * size * 0.62;
            const wingY = dirX * size * 0.62;
            return (
              <React.Fragment key={edge.id}>
                <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
                <Polygon
                  points={`${tipX},${tipY} ${midX - dirX * size * 0.4 + wingX},${midY - dirY * size * 0.4 + wingY} ${midX - dirX * size * 0.4 - wingX},${midY - dirY * size * 0.4 - wingY}`}
                  fill={closed ? theme.primary : theme.textSecondary}
                />
              </React.Fragment>
            );
          }

          return (
            <Line
              key={edge.id}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={stroke}
              strokeWidth={width}
              strokeLinecap="round"
            />
          );
        })}
        {/* Резинка от текущей точки к пальцу. Рисуется последней — поверх рёбер. */}
        {(() => {
          if (!dragPoint || !currentId) return null;
          const from = byId.get(currentId);
          if (!from) return null;
          return (
            <Line
              x1={from.x * boardSize} y1={from.y * boardSize}
              x2={dragPoint.x} y2={dragPoint.y}
              stroke={theme.primary} strokeWidth={4} strokeLinecap="round"
              strokeDasharray="7 7" opacity={0.85}
            />
          );
        })()}
      </Svg>
      {puzzle.vertices.map((vertex, index) => {
        const isCurrent = currentId === vertex.id;
        const isHint = hinted.has(vertex.id);
        const isStart = session.vertexTrail.length === 0 && puzzle.startHintVertexId === vertex.id;
        const isCursor = cursorId === vertex.id;
        const visited = visitOrder.has(vertex.id);
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
                /**
                 * ПОД ТОЧКОЙ ТЕПЕРЬ ШАР, А НЕ ЗАЛИВКА. Отчёт Дениса 05.09.2026
                 * (50a283a2, v2.37.54, tauri-ios): «шарики обнови, сделай их
                 * нормальными красивыми, которые разрабатывали с тобой».
                 *
                 * ⚠️ ЗДЕСЬ ЦВЕТ НЕСЁТ СМЫСЛ — и этим игра противоположна трекеру
                 * объектов, где все шары обязаны быть одинаковыми. Текущий,
                 * подсказка и пройденный обязаны различаться с одного взгляда,
                 * поэтому фактура одна (выбор человека), а ЦВЕТ разный.
                 */
                backgroundColor: 'transparent',
              },
              isCursor && { shadowColor: theme.warning, shadowOpacity: 1, shadowRadius: 0 },
              isCursor && ({ outlineColor: theme.warning, outlineStyle: 'solid', outlineWidth: 3 } as any),
              pressed && styles.pressed,
            ]}
          >
            <Image
              source={ballImage(ballStyle, isCurrent ? 'purple'
                : (isHint || isStart) ? 'yellow'
                : visited ? 'white' : 'blue')}
              /**
               * 🔴 РАЗМЕР ЯВНО, А НЕ `absoluteFill`. Третий случай одной и той
               * же беды: `absoluteFill` даёт `inset:0` без ширины, и в вебе
               * `<img>` берёт СВОЮ природную ширину — шар вылезал за узел и
               * закрывал собой рёбра графа.
               *
               * 📍 ОТЧЁТ ДЕНИСА 05.09.2026 со скриншотом: «что за огромные мега
               * шары, ни хуя не видно». До этого то же было у плитки маджонга
               * (255 px вместо 44) и у клетки «Вспышки» (192 px).
               */
              style={[
                { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
                visited && { opacity: 0.55 },
              ]}
              resizeMode="contain"
              fadeDuration={0}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            {/* Номер поверх шара: тёмный с белой каймой — читается и на светлом
                стекле, и на тёмном неоне, а второй набор цветов заводить незачем. */}
            <Text style={[styles.vertexText, {
              color: '#12161d',
              textShadowColor: 'rgba(255,255,255,0.9)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 3,
            }]}>
              {visitOrder.get(vertex.id) ?? ''}
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
  onProgress,
  onExit,
}: OneLineGameProps) {
  const strings = getOneLineStrings(locale);
  const [session, setSession] = React.useState(() => createOneLineSession({ seed, level }));

  /**
   * ТИК СЧЁТЧИКА. Очки сползают сами по себе, без ходов игрока, поэтому экран
   * обязан перерисовываться по часам, а не по нажатиям.
   *
   * ⚠️ ЧЕТЫРЕ РАЗА В СЕКУНДУ, А НЕ КАЖДЫЙ КАДР. Число на экране целое: чаще
   * четырёх раз оно всё равно не меняется, а каждый кадр это перерисовка всей
   * доски ради цифры. Сама величина берётся из ЧАСОВ, а не накапливается по
   * тикам, — пропущенный тик ничего не искажает.
   */
  const [clockTick, setClockTick] = React.useState(0);
  React.useEffect(() => {
    if (session.phase !== 'playing') return undefined;
    const timer = setInterval(() => setClockTick((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, [session.phase]);

  React.useEffect(() => {
    if (session.phase !== 'playing') return;
    setSession((current) => expireOneLineSession(current, now()));
  }, [clockTick, now, session.phase]);

  const scoreLeft = oneLineScoreNow(session, now());
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
          {session.phase === 'playing' ? (
            /*
              ОДНО ЧИСЛО ВМЕСТО ДВУХ. Это и таймер, и награда: оно сползает к нулю и
              оно же уходит в рекорд уровня. Отдельные «время» и «очки» рядом
              заставили бы выбирать, на какое смотреть.
              Краснеет на последней трети — предупреждение до того, как стало поздно.
            */
            <Text
              accessibilityLabel={`${strings.scoreLabel}: ${scoreLeft}`}
              style={[styles.scoreLeft, { color: scoreLeft <= 30 ? theme.error : theme.text }]}
            >
              {scoreLeft}
            </Text>
          ) : null}
        </View>
        {!trainingComplete ? (
          <ActionButton label={strings.pause} theme={theme} secondary onPress={() => setSession((current) => pauseOneLineSession(current, now()))} />
        ) : null}
      </View>
      {training ? <Text style={[styles.trainingHint, { color: theme.textSecondary }]}>{strings.trainingHint}</Text> : null}
      {/*
        🔴 ТО, ЧТО СЧИТАЛОСЬ, НО ДО ЧЕЛОВЕКА НЕ ДОЕЗЖАЛО.
        Подсказка умеет доказать, что фигуру отсюда уже не закрыть, — и это то
        единственное, чем мы лучше обеих игр-образцов. Признак лежал в сессии,
        был покрыт проверкой и НЕ ВЫВОДИЛСЯ никуда: человек по-прежнему молотился
        в тупик, пока не кончится время. Найдено разбором 22.08.2026.
        Рядом — отказ старта: начать можно не с любой точки, и молчание в ответ
        на касание выглядит как «игра не отвечает».
      */}
      {session.hintDeadEnd ? (
        <Text style={[styles.trainingHint, { color: theme.error }]}>{strings.deadEnd}</Text>
      ) : session.startRejected > 0 ? (
        <Text style={[styles.trainingHint, { color: theme.textSecondary }]}>{strings.startElsewhere}</Text>
      ) : null}
      {/*
        ЦЕНА ОШИБКИ ВИДНА, А НЕ ТОЛЬКО ПОСЧИТАНА.
        Ход в несоседнюю вершину модуль отвергал МОЛЧА: линия не двигалась,
        счётчик исправлений рос, и на нём же держится порог прохождения уровня.
        То есть человека штрафовали, не сказав за что, — поймано глазами на
        втором уровне 19.08.2026. Слово берём из своего же словаря, поэтому
        приложению это не стоит ни одного нового ключа на двенадцать языков.
      */}
      <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: theme.textSecondary }]}>
        {interpolateOneLine(strings.progress, { used: session.edgeTrail.length, total: totalEdgeUses(puzzle.edges) })}
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
  pauseCard: { maxWidth: 520, width: '100%' },
  topRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  gameTitle: { fontSize: 22, fontWeight: '900' },
  round: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  trainingHint: { fontSize: 14, textAlign: 'center' },
  progress: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  fieldRule: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
  // Доска БЕЗ рамки: фигура должна висеть в поле, а не сидеть в коробке —
  // рамка спорит с линией и делает поле теснее, чем оно есть.
  board: { width: '100%', maxWidth: 620, alignSelf: 'center', aspectRatio: 1, overflow: 'hidden', position: 'relative' },
  svg: { position: 'absolute', left: 0, top: 0 },
  // `overflow:'hidden'` — вторая страховка: что бы ни легло внутрь, за узел оно не выйдет.
  vertexTarget: { position: 'absolute', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', zIndex: 2, overflow: 'hidden' },
  hintedVertex: { borderWidth: 6 },
  vertexText: { fontSize: 15, fontWeight: '900', textAlign: 'center' },
  scoreLeft: { fontSize: 30, fontWeight: '900', textAlign: 'left', marginTop: 2 },
  successCard: { maxWidth: 620, alignSelf: 'center', width: '100%' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  metric: { minWidth: 140, flexGrow: 1, flexBasis: '45%', padding: 12, alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  metricLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  seed: { fontSize: 12, textAlign: 'center' },
});
