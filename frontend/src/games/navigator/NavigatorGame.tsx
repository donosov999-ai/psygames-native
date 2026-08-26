/* psygames-navigator-game · VER 2 · 20.08.2026 */
/**
 * Navigator — партия. Адаптер лабораторного модуля G6 под приложение.
 *
 * ПРОИСХОЖДЕНИЕ. Игра собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-navigator`, коммит ec65e46,
 * база — d203a4a). Ядро (`core/`) взято ОДИН В ОДИН: там чистая геометрия,
 * генератор, состояние партии и свой словарь ru/en. Правки — только здесь, в
 * слое отрисовки, и каждая ниже названа причиной.
 *
 * ЧТО ТРЕНИРУЕТ. Мысленную карту. Не «запомни картинку», а удержание
 * ПРОСТРАНСТВЕННОГО отношения: маршрут остаётся тем же самым, когда карту
 * повернули на 90°, 180° или 270°. Три режима идут по кругу и спрашивают одно
 * знание с трёх сторон: «Маршрут» — направления шагов, «Повороты» — лево/прямо/
 * право относительно движения, «Домой» — направление на старт из финиша. Третий
 * режим и есть настоящая навигация: человек ни разу не видел этой стрелки, её
 * надо вывести из пройденного пути.
 *
 * ЧТО ИЗМЕНЕНО ПРИ СТЫКОВКЕ — и почему.
 *
 * 1. 🔴 СВОЙ ЭКРАН ИТОГА УБРАН СОВСЕМ. В лаборатории модуль сам рисовал
 *    поздравление с метриками. В приложении звёзды по уровням, серия чистых
 *    прохождений и глаз-разрядка пишутся ТОЛЬКО в LevelCleared — свой экран
 *    итога означает тихое выпадение из всей этой бухгалтерии (так когда-то
 *    выпали маджонг и парные картинки). Оставить его «на всякий случай» с
 *    флагом было хуже: выключенная разметка мертва, а выглядит живой — ровно
 *    та ловушка, из-за которой бейдж отсчёта в SET был написан, переведён на
 *    12 языков и не показался ни разу. Поэтому на фазе `result` модуль отдаёт
 *    null, а поздравляет приложение.
 *
 * 2. 🔴 КЛАВИАТУРА ПЕРЕВЕДЕНА НА ОБЩИЙ СЛОЙ. В лаборатории обработчик висел
 *    как `onKeyDown` на ScrollView. Это тот самый мёртвый элемент: DOM-событие
 *    клавиши приходит только в сфокусированный узел, а прокрутка фокус не
 *    держит — на вебе клавиши работали бы, лишь пока фокус случайно стоит
 *    внутри. Теперь ввод идёт через `useGameKeyboard`, как во всех остальных
 *    играх: он же снимает слушателя при уходе с экрана, не крадёт набор из
 *    поля отзыва и гасит прокрутку страницы стрелками.
 *
 * 3. ШИРИНА ПОЛЯ — ИЗ `useScreenWidth`. Было `onLayout` → `setSize`: на первом
 *    кадре ширина 0, и сетка не рисовалась вовсе. Хук отдаёт запасные 390 на
 *    тот единственный кадр, когда настоящая ещё не известна.
 *
 * 4. ЧАСЫ ПАРТИИ ОБЯЗАТЕЛЬНЫ ПАРАМЕТРОМ. Было `now = Date.now` по умолчанию —
 *    молчаливые настенные часы, которые продолжают идти, пока человек пишет
 *    отзыв. Умолчание убрано: экран обязан передать `gameNow`.
 *
 * 5. ЦВЕТ ПОДПИСИ НА ПЛАШКЕ СЧИТАЕТСЯ. Было `color: theme.background` поверх
 *    `theme.primary`: в тёмном профиле это чёрным по синему (2.9 при норме
 *    4.5). Теперь подпись главной кнопки берёт цвет, посчитанный по обоим
 *    концам градиента игры.
 */
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
} from 'react-native';
import { useGameKeyboard, type KeyMap } from '@/src/hooks/useGameKeyboard';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import {
  CARDINAL_DIRECTIONS,
  HOME_SECTORS,
  TURN_INSTRUCTIONS,
  advanceNavigatorDelay,
  cellKey,
  completeNavigatorStudy,
  createNavigatorSession,
  disposeNavigatorSession,
  getCardinalLabel,
  getHomeSectorLabel,
  getNavigatorModeLabel,
  getNavigatorStrings,
  getTurnLabel,
  handleNavigatorKey,
  handleNavigatorSwipe,
  inputNavigatorHomeSector,
  inputNavigatorRouteDirection,
  inputNavigatorTurn,
  interpolateNavigator,
  pauseNavigatorSession,
  restartNavigatorSession,
  resumeNavigatorSession,
  rotateCell,
  startNavigatorRound,
  type CardinalDirection,
  type GridCell,
  type HomeSector,
  type NavigatorLocale,
  type NavigatorMetrics,
  type NavigatorMode,
  type NavigatorSession,
  type TurnInstruction,
} from './core/index';

export interface NavigatorTheme {
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

export interface NavigatorGameProps {
  seed: string;
  level: number;
  mode?: NavigatorMode;
  locale: NavigatorLocale;
  theme: NavigatorTheme;
  gameGradient: readonly [string, string];
  /** Цвет подписи поверх плашки цвета игры — считает onGradientText, не угадываем. */
  gameGradientText: string;
  /** Игровые часы. Обязательны: см. п. 4 в шапке. */
  now: () => number;
  onComplete?: (result: NavigatorMetrics) => void;
  /**
   * Есть ли ПРЯМО СЕЙЧАС что терять — см. `hasSomethingToLose` ниже. Экран
   * держит этот флаг и отдаёт каркасу: вопрос при выходе задаётся только там,
   * где партия уже что-то накопила.
   */
  onProgress?: (armed: boolean) => void;
  /**
   * Своя кнопка «Выход» (правила и своя пауза модуля). НЕОБЯЗАТЕЛЬНА, и это
   * принципиально: когда модуль стоит внутри `GameShell`, выход из партии один —
   * «назад» в шапке каркаса, и он проходит через вопрос «партия пропадёт».
   * Вторая кнопка рядом уводила бы МИМО вопроса.
   */
  onExit?: () => void;
}

/**
 * 🔴 ЕСТЬ ЛИ ЧТО ТЕРЯТЬ ПРИ ВЫХОДЕ.
 *
 * Флаг встаёт с началом раунда, а не с первого ответа, — и это осознанно.
 * Показ маршрута («study») и есть та работа, которую человек делает головой:
 * он ведёт путь по клеткам и держит повороты. Уйти на середине показа —
 * потерять ровно её; повтор партии даст ТОТ ЖЕ маршрут (зерно фиксировано
 * уровнем), но заново смотреть придётся всё.
 *
 * Экран правил не считается: там ещё ничего не показано.
 */
export function hasSomethingToLose(session: NavigatorSession): boolean {
  const active = session.phase === 'paused' ? session.pausedFrom : session.phase;
  return active === 'study' || active === 'delay' || active === 'recall';
}

const DIRECTION_GLYPHS: Record<CardinalDirection, string> = {
  north: '↑',
  east: '→',
  south: '↓',
  west: '←',
};

const TURN_GLYPHS: Record<TurnInstruction, string> = {
  left: '↰',
  straight: '↑',
  right: '↱',
};

const HOME_GLYPHS: Record<HomeSector, string> = {
  north: '↑',
  'north-east': '↗',
  east: '→',
  'south-east': '↘',
  south: '↓',
  'south-west': '↙',
  west: '←',
  'north-west': '↖',
};

function ActionButton({
  label,
  onPress,
  theme,
  onPrimaryText,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  theme: NavigatorTheme;
  onPrimaryText: string;
  secondary?: boolean;
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
      ]}
    >
      <Text style={[styles.actionText, { color: secondary ? theme.text : onPrimaryText }]}>{label}</Text>
    </Pressable>
  );
}

function ChoiceButton({
  label,
  glyph,
  onPress,
  theme,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  theme: NavigatorTheme;
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
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceButton,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
        focused && ({
          outlineColor: theme.warning,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 2,
        } as any),
      ]}
    >
      <Text style={[styles.choiceGlyph, { color: theme.primary }]}>{glyph}</Text>
      <Text style={[styles.choiceLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function landmarkGlyph(symbol: NavigatorSession['round']['landmarks'][number]['symbol']): string {
  if (symbol === 'diamond') return '◆';
  if (symbol === 'circle') return '●';
  if (symbol === 'triangle') return '▲';
  if (symbol === 'star') return '✦';
  return '■';
}

function MapCell({
  logicalCell,
  session,
  cellSize,
  showRoute,
  showCurrent,
  locale,
  theme,
  gameGradient,
  gameGradientText,
}: {
  logicalCell: GridCell;
  session: NavigatorSession;
  cellSize: number;
  showRoute: boolean;
  showCurrent: boolean;
  locale: NavigatorLocale;
  theme: NavigatorTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
}) {
  const strings = getNavigatorStrings(locale);
  const visual = rotateCell(logicalCell, session.round.gridSize, session.round.mapRotation);
  const key = cellKey(logicalCell);
  const routeIndex = session.round.route.findIndex((cell) => cellKey(cell) === key);
  const landmarkIndex = session.round.landmarks.findIndex((landmark) => cellKey(landmark.cell) === key);
  const landmark = session.round.landmarks[landmarkIndex];
  const branch = session.round.falseBranches.some((candidate) => cellKey(candidate.to) === key);
  const current = showCurrent && cellKey(session.currentCell) === key;
  const isStart = routeIndex === 0;
  const isFinish = routeIndex === session.round.routeSteps;
  let accessibilityLabel = `${logicalCell.x + 1}, ${logicalCell.y + 1}`;
  if (showRoute && routeIndex >= 0) {
    accessibilityLabel = isStart
      ? strings.startCell
      : isFinish
        ? strings.finishCell
        : interpolateNavigator(strings.routeCell, { index: routeIndex });
  } else if (current) accessibilityLabel = strings.currentCell;
  else if (landmark) accessibilityLabel = interpolateNavigator(strings.landmark, { index: landmarkIndex + 1 });
  else if (branch) accessibilityLabel = strings.falseBranch;

  return (
    <View
      accessible={false}
      style={[
        styles.mapCell,
        {
          width: cellSize,
          height: cellSize,
          left: visual.x * cellSize,
          top: visual.y * cellSize,
          borderColor: theme.border,
          backgroundColor: showRoute && routeIndex >= 0
            ? gameGradient[0]
            : branch
              ? theme.card
              : theme.surface,
        },
        current && { backgroundColor: gameGradient[1] },
      ]}
    >
      {showRoute && routeIndex >= 0 ? (
        <Text accessibilityLabel={accessibilityLabel} style={[styles.routeIndex, { color: gameGradientText }]}>
          {isStart ? 'S' : isFinish ? 'H' : routeIndex}
        </Text>
      ) : current ? (
        <Text accessibilityLabel={accessibilityLabel} style={[styles.currentGlyph, { color: gameGradientText }]}>●</Text>
      ) : null}
      {landmark ? (
        <Text
          accessibilityLabel={interpolateNavigator(strings.landmark, { index: landmarkIndex + 1 })}
          style={[styles.landmark, { color: theme.primary }]}
        >
          {landmarkGlyph(landmark.symbol)}
        </Text>
      ) : null}
    </View>
  );
}

function NavigatorMap({
  session,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  showRoute,
  showCurrent,
  boardSize,
}: {
  session: NavigatorSession;
  locale: NavigatorLocale;
  theme: NavigatorTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  showRoute: boolean;
  showCurrent: boolean;
  boardSize: number;
}) {
  const cells = Array.from({ length: session.round.gridSize * session.round.gridSize }, (_, index) => ({
    x: index % session.round.gridSize,
    y: Math.floor(index / session.round.gridSize),
  }));
  const label = `${getNavigatorModeLabel(locale, session.round.mode)}. ${interpolateNavigator(
    getNavigatorStrings(locale).grid,
    { size: session.round.gridSize, steps: session.round.routeSteps },
  )}.`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      // Размер задан числом, а не '100%': ширина приходит из useScreenWidth и
      // верна уже на первом кадре — см. п. 3 в шапке.
      style={[styles.map, { width: boardSize, height: boardSize, borderColor: theme.border, backgroundColor: theme.surface }]}
    >
      {cells.map((cell) => (
        <MapCell
          key={cellKey(cell)}
          logicalCell={cell}
          session={session}
          cellSize={boardSize / session.round.gridSize}
          showRoute={showRoute}
          showCurrent={showCurrent}
          locale={locale}
          theme={theme}
          gameGradient={gameGradient}
          gameGradientText={gameGradientText}
        />
      ))}
    </View>
  );
}

function SwipeSurface({
  label,
  hint,
  theme,
  onSwipe,
}: {
  label: string;
  hint: string;
  theme: NavigatorTheme;
  onSwipe: (deltaX: number, deltaY: number) => void;
}) {
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) >= 12,
    onPanResponderRelease: (_, gesture) => onSwipe(gesture.dx, gesture.dy),
    onPanResponderTerminate: (_, gesture) => onSwipe(gesture.dx, gesture.dy),
  });
  return (
    <View
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}. ${hint}`}
      style={[styles.swipeSurface, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <Text style={[styles.swipeTitle, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.swipeHint, { color: theme.textSecondary }]}>{hint}</Text>
    </View>
  );
}

function TurnStudy({ session, locale, theme, gameGradient, gameGradientText }: {
  session: NavigatorSession;
  locale: NavigatorLocale;
  theme: NavigatorTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
}) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.facing, { color: theme.textSecondary }]}>
        {getCardinalLabel(locale, session.round.startingFacing)} {DIRECTION_GLYPHS[session.round.startingFacing]}
      </Text>
      <View style={styles.turnSequence}>
        {session.round.turns.map((turn, index) => (
          <View
            key={`${turn}-${index}`}
            accessible
            accessibilityLabel={`${index + 1}. ${getTurnLabel(locale, turn)}`}
            style={[styles.turnCard, { backgroundColor: gameGradient[0], borderColor: theme.border }]}
          >
            <Text style={[styles.turnGlyph, { color: gameGradientText }]}>{TURN_GLYPHS[turn]}</Text>
            <Text style={[styles.turnIndex, { color: gameGradientText }]}>{index + 1}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NavigatorSessionView({
  seed,
  level,
  mode,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  now,
  onComplete,
  onProgress,
  onExit,
}: NavigatorGameProps) {
  const strings = getNavigatorStrings(locale);
  const screenW = useScreenWidth();
  const [session, setSession] = React.useState(() => createNavigatorSession({ seed, level, mode }));
  const sessionRef = React.useRef(session);
  const completionReported = React.useRef(false);

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setSession((current) => pauseNavigatorSession(current, now()));
    });
    return () => subscription.remove();
  }, [now]);

  /**
   * Наверх уходит ГОТОВЫЙ ОТВЕТ «есть что терять», а не сама партия: экрану
   * незачем разбирать фазы модуля, а модулю — знать про каркас. Зависимость —
   * булево, а не `session`: иначе setState экрана дёргался бы на каждый шаг.
   */
  const armed = hasSomethingToLose(session);
  React.useEffect(() => { onProgress?.(armed); }, [armed, onProgress]);

  React.useEffect(() => {
    if (session.phase === 'result' && session.result && !completionReported.current) {
      completionReported.current = true;
      onComplete?.(session.result);
    }
  }, [onComplete, session.phase, session.result]);

  React.useEffect(() => () => {
    sessionRef.current = disposeNavigatorSession(sessionRef.current);
  }, []);

  const restart = React.useCallback(() => {
    completionReported.current = false;
    setSession((current) => restartNavigatorSession(current, now()));
  }, [now]);

  const swipe = (deltaX: number, deltaY: number) => {
    setSession((current) => handleNavigatorSwipe(current, deltaX, deltaY, now()));
  };

  /**
   * Клавиши — через общий слой (п. 2 в шапке). Раскладка та же, что в справке
   * модуля: стрелки/WASD, пробел на «прямо», NumPad 1–9 на восемь направлений
   * домой, P — пауза, R — начать заново. Ключи перечислены явно, потому что
   * слой подписывается на конкретные клавиши, а не на всё подряд.
   */
  const keyMap = React.useMemo<KeyMap>(() => {
    const map: KeyMap = {};
    const feed = (key: string) => () => setSession((current) => handleNavigatorKey(current, key, now()));
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' ', '1', '2', '3', '4', '6', '7', '8', '9']) {
      map[key] = feed(key);
    }
    map.p = () => setSession((current) => pauseNavigatorSession(current, now()));
    map.r = () => restart();
    return map;
  }, [now, restart]);
  // Слой включён только там, где нажатию есть что делать: на изучении и на
  // экране правил клавиша по доске не ходит.
  useGameKeyboard(keyMap, session.phase === 'recall' || session.phase === 'paused');

  if (session.phase === 'disposed') return null;

  /**
   * 🔴 Фаза итога отдаёт null: поздравляет приложение (LevelCleared), см. п. 1.
   * Возврат стоит ДО остальных веток, чтобы между `onComplete` и перерисовкой
   * родителя не мелькнуло чужое поздравление.
   */
  if (session.phase === 'result') return null;

  const boardSize = Math.min(600, Math.max(220, screenW - 24));

  if (session.phase === 'rules') {
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: gameGradient[0] }]}>
          <Text style={[styles.heroSkill, { color: gameGradientText }]}>{strings.skill}</Text>
          <Text accessibilityRole="header" style={[styles.heroTitle, { color: gameGradientText }]}>{strings.title}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.rulesTitle}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesBody}</Text>
          <Text style={[styles.ruleLine, { color: theme.text }]}>{strings.routeRecallRule}</Text>
          <Text style={[styles.ruleLine, { color: theme.text }]}>{strings.turnSequenceRule}</Text>
          <Text style={[styles.ruleLine, { color: theme.text }]}>{strings.homeDirectionRule}</Text>
          <Text style={[styles.progressionInfo, { color: theme.primary }]}>{strings.progressionInfo}</Text>
          {Platform.OS === 'web' ? (
            <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          <ActionButton label={strings.start} theme={theme} onPrimaryText={gameGradientText}
            onPress={() => setSession((current) => startNavigatorRound(current, now()))} />
          {onExit ? <ActionButton label={strings.exit} theme={theme} onPrimaryText={gameGradientText} secondary onPress={onExit} /> : null}
        </View>
      </ScrollView>
    );
  }

  if (session.phase === 'paused') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.pauseCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.pause}</Text>
          <ActionButton label={strings.resume} theme={theme} onPrimaryText={gameGradientText}
            onPress={() => setSession((current) => resumeNavigatorSession(current, now()))} />
          <ActionButton label={strings.restart} theme={theme} onPrimaryText={gameGradientText} secondary onPress={restart} />
        </View>
      </View>
    );
  }

  if (session.phase === 'delay') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.pauseCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.delay}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.delayBody}</Text>
          <Text style={[styles.delayCount, { color: theme.primary }]}>{session.delayIndex + 1} / {session.round.delaySteps}</Text>
          <ActionButton label={strings.continue} theme={theme} onPrimaryText={gameGradientText}
            onPress={() => setSession(advanceNavigatorDelay)} />
        </View>
      </View>
    );
  }

  const isStudy = session.phase === 'study';
  const modeLabel = getNavigatorModeLabel(locale, session.round.mode);
  const gridLabel = interpolateNavigator(strings.grid, {
    size: session.round.gridSize,
    steps: session.round.routeSteps,
  });
  const routeProgress = interpolateNavigator(strings.routeProgress, {
    current: Math.min(session.routeIndex + 1, session.round.routeSteps),
    total: session.round.routeSteps,
  });
  const turnProgress = interpolateNavigator(strings.turnProgress, {
    current: Math.min(session.turnIndex + 1, session.round.routeSteps),
    total: session.round.routeSteps,
  });
  const prompt = session.round.mode === 'route-recall'
    ? strings.routePrompt
    : session.round.mode === 'turn-sequence'
      ? strings.turnPrompt
      : strings.homePrompt;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.gameContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.gameHeader}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>{isStudy ? strings.study : strings.recall}</Text>
          <Text style={[styles.round, { color: theme.textSecondary }]}>{modeLabel} · {gridLabel} · {session.round.mapRotation}°</Text>
        </View>
        <ActionButton label={strings.pause} theme={theme} onPrimaryText={gameGradientText} secondary
          onPress={() => setSession((current) => pauseNavigatorSession(current, now()))} />
      </View>

      {isStudy && session.round.mode === 'turn-sequence' ? (
        <TurnStudy
          session={session}
          locale={locale}
          theme={theme}
          gameGradient={gameGradient}
          gameGradientText={gameGradientText}
        />
      ) : null}
      {isStudy && session.round.mode !== 'turn-sequence' ? (
        <NavigatorMap
          session={session}
          locale={locale}
          theme={theme}
          gameGradient={gameGradient}
          gameGradientText={gameGradientText}
          showRoute
          showCurrent={false}
          boardSize={boardSize}
        />
      ) : null}

      {!isStudy ? (
        <>
          <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: theme.textSecondary }]}>
            {session.round.mode === 'route-recall'
              ? routeProgress
              : session.round.mode === 'turn-sequence'
                ? turnProgress
                : prompt}
          </Text>
          {session.round.mode !== 'turn-sequence' && !session.round.hideMapDuringRecall ? (
            <NavigatorMap
              session={session}
              locale={locale}
              theme={theme}
              gameGradient={gameGradient}
              gameGradientText={gameGradientText}
              showRoute={false}
              showCurrent
              boardSize={boardSize}
            />
          ) : session.round.hideMapDuringRecall ? (
            <View style={[styles.hiddenMap, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.hiddenMapGlyph, { color: theme.primary }]}>⌖</Text>
              <Text style={[styles.hiddenMapText, { color: theme.textSecondary }]}>{strings.mapHidden}</Text>
            </View>
          ) : null}
          <SwipeSurface label={prompt} hint={strings.swipeHint} theme={theme} onSwipe={swipe} />
          <View style={styles.choiceGrid}>
            {session.round.mode === 'route-recall' ? CARDINAL_DIRECTIONS.map((direction) => (
              <ChoiceButton
                key={direction}
                label={getCardinalLabel(locale, direction)}
                glyph={DIRECTION_GLYPHS[direction]}
                theme={theme}
                onPress={() => setSession((current) => inputNavigatorRouteDirection(current, direction, now()))}
              />
            )) : null}
            {session.round.mode === 'turn-sequence' ? TURN_INSTRUCTIONS.map((turn) => (
              <ChoiceButton
                key={turn}
                label={getTurnLabel(locale, turn)}
                glyph={TURN_GLYPHS[turn]}
                theme={theme}
                onPress={() => setSession((current) => inputNavigatorTurn(current, turn, now()))}
              />
            )) : null}
            {session.round.mode === 'home-direction' ? HOME_SECTORS.map((sector) => (
              <ChoiceButton
                key={sector}
                label={getHomeSectorLabel(locale, sector)}
                glyph={HOME_GLYPHS[sector]}
                theme={theme}
                onPress={() => setSession((current) => inputNavigatorHomeSector(current, sector, now()))}
              />
            )) : null}
          </View>
        </>
      ) : null}

      <View style={styles.actions}>
        {isStudy ? (
          <ActionButton label={strings.ready} theme={theme} onPrimaryText={gameGradientText}
            onPress={() => setSession(completeNavigatorStudy)} />
        ) : null}
        <ActionButton label={strings.restart} theme={theme} onPrimaryText={gameGradientText} secondary onPress={restart} />
      </View>
    </ScrollView>
  );
}

export default function NavigatorGame(props: NavigatorGameProps) {
  return <NavigatorSessionView key={`${props.seed}:${props.level}:${props.mode ?? 'auto'}`} {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, gap: 14 },
  gameContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 8, gap: 10 },
  hero: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', gap: 7 },
  heroTitle: { fontSize: 34, lineHeight: 40, fontWeight: '900', textAlign: 'center' },
  heroSkill: { fontSize: 15, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
  card: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24 },
  ruleLine: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  progressionInfo: { fontSize: 14, lineHeight: 21, fontWeight: '800' },
  keyboardHelp: { fontSize: 13, lineHeight: 18 },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  actionButton: { minWidth: 150, minHeight: 48, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 15, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.78 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  pauseCard: { maxWidth: 520 },
  delayCount: { fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center' },
  gameHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleBlock: { flex: 1 },
  gameTitle: { fontSize: 23, lineHeight: 28, fontWeight: '900' },
  round: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  map: { alignSelf: 'center', borderWidth: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  mapCell: { position: 'absolute', borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  routeIndex: { fontSize: 16, lineHeight: 20, fontWeight: '900' },
  currentGlyph: { fontSize: 20, lineHeight: 24, fontWeight: '900' },
  landmark: { position: 'absolute', right: 3, bottom: 1, fontSize: 12, lineHeight: 14, fontWeight: '900' },
  facing: { fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center' },
  turnSequence: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  turnCard: { width: 62, minHeight: 70, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  turnGlyph: { fontSize: 30, lineHeight: 34, fontWeight: '900' },
  turnIndex: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  progress: { minHeight: 20, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  hiddenMap: { width: '100%', minHeight: 150, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 16 },
  hiddenMapGlyph: { fontSize: 54, lineHeight: 60, fontWeight: '900' },
  hiddenMapText: { fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center' },
  swipeSurface: { width: '100%', minHeight: 96, borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 14 },
  swipeTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  swipeHint: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  choiceGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  choiceButton: { flexGrow: 1, flexBasis: '21%', minWidth: 82, minHeight: 64, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 2 },
  choiceGlyph: { fontSize: 25, lineHeight: 29, fontWeight: '900' },
  choiceLabel: { fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
});
