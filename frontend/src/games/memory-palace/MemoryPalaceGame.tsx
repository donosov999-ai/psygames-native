/* psygames-memory-palace-game · VER 2 · 22.08.2026 */
import React from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  confirmMemoryPalacePlacements,
  continueToPlacement,
  continueToReverseRecall,
  createMemoryPalaceSession,
  currentRecallDirection,
  currentRecallLocus,
  currentRecallResponses,
  disposeMemoryPalaceSession,
  findPalaceItem,
  getItemLabel,
  getLocusLabel,
  getMemoryPalaceStrings,
  getRecallDirectionLabel,
  interpolateMemoryPalace,
  memoryPalacePlacementComplete,
  pauseMemoryPalaceSession,
  placeSelectedItemAtLocus,
  restartMemoryPalaceSession,
  resumeMemoryPalaceSession,
  selectPlacementItem,
  selectRecallItem,
  startMemoryPalaceRecall,
  startMemoryPalaceRound,
  type ItemShape,
  type MemoryPalaceLocale,
  type MemoryPalaceMetrics,
  type MemoryPalaceSession,
  type PalaceItem,
  type PalaceLocus,
} from './core/index';

export interface MemoryPalaceTheme {
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

export interface MemoryPalaceGameProps {
  seed: string;
  level: number;
  locale: MemoryPalaceLocale;
  theme: MemoryPalaceTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  showOwnResults?: boolean;
  /**
   * ЧАСЫ ПАРТИИ — ОБЯЗАТЕЛЬНЫЙ ПРОП, А НЕ `Date.now` ПО УМОЛЧАНИЮ.
   *
   * В лаборатории здесь стояло `now = Date.now`. В приложении время партии
   * обязано идти по игровым часам `services/gamePause.gameNow`: пока человек
   * пишет отзыв, часы стоят. Значение по умолчанию — это молчаливый откат к
   * настенным часам ровно того класса, ради которого заведён гейт
   * `game-clock-discipline`; гейт читает только `app/games/*.tsx` и сюда не
   * заглядывает, поэтому защита здесь одна — отсутствие умолчания.
   */
  now: () => number;
  onComplete?: (result: MemoryPalaceMetrics) => void;
  onExit?: () => void;
  /**
   * НЕЗАКОНЧЕННАЯ ПАРТИЯ, ПОДНЯТАЯ ИЗ ХРАНИЛИЩА. Партия здесь длинная (маршрут
   * из 12 мест, расстановка руками, проверка вперёд и назад — это минуты), и
   * восстановить её по зерну и уровню нельзя: расстановку придумывает сам
   * человек. Поэтому модуль умеет стартовать не с чистого листа.
   *
   * Читается ОДИН раз, при создании состояния: дальше партию ведёт модуль, и
   * подсовывать ему снимок на каждый рендер значит откатывать ходы.
   */
  initialSession?: MemoryPalaceSession | null;
  /**
   * Партия изменилась — экран решает, писать её в хранилище или нет. Без этого
   * сохранять было бы нечего: всё состояние живёт внутри модуля.
   */
  onSessionChange?: (session: MemoryPalaceSession) => void;
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
  theme: MemoryPalaceTheme;
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary
          ? { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }
          : { backgroundColor: theme.primary },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        focused && ({
          outlineColor: theme.warning,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 3,
        } as any),
      ]}
    >
      <Text style={[styles.actionText, { color: secondary ? theme.text : theme.background }]}>{label}</Text>
    </Pressable>
  );
}

const SHAPE_RADIUS: Record<ItemShape, number> = {
  round: 999,
  square: 8,
  diamond: 7,
  triangle: 6,
  capsule: 999,
  arch: 18,
};

function ItemAsset({ item, size = 42 }: { item: PalaceItem; size?: number }) {
  const isCapsule = item.shape === 'capsule';
  const isDiamond = item.shape === 'diamond';
  const isTriangle = item.shape === 'triangle';
  return (
    <View
      accessible={false}
      style={[
        styles.itemAsset,
        {
          width: isCapsule ? size * 1.25 : size,
          height: isTriangle ? size * 0.9 : size,
          borderRadius: SHAPE_RADIUS[item.shape],
          backgroundColor: item.color,
          borderColor: item.accent,
          transform: isDiamond
            ? [{ rotateZ: '45deg' }]
            : isTriangle
              ? [{ rotateZ: '45deg' }, { scaleX: 0.82 }, { scaleY: 0.82 }]
              : [],
        },
        item.shape === 'arch' && styles.archAsset,
      ]}
    >
      <View
        style={[
          styles.assetMark,
          { backgroundColor: item.accent },
          isDiamond || isTriangle ? { transform: [{ rotateZ: '-45deg' }] } : null,
        ]}
      />
    </View>
  );
}

function ItemChoice({
  item,
  locale,
  theme,
  selected,
  used,
  onPress,
}: {
  item: PalaceItem;
  locale: MemoryPalaceLocale;
  theme: MemoryPalaceTheme;
  selected?: boolean;
  used?: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const label = getItemLabel(item, locale);
  /**
   * 🔴 «Уже выбрано» — строка, которая пришла из лаборатории МЁРТВОЙ: она была
   * объявлена в словаре, переведена на оба языка и не выводилась ни разу
   * (`strings.used` не встречался в разметке). Ровно тот класс дефекта, что был
   * в SET с бейджем отсчёта: написано, переведено, гейтом покрыто — и не
   * показано.
   *
   * Смысл у неё есть, и как раз для тех, кому хуже всего: зрячий видит бледную
   * плитку и понимает, что предмет израсходован, а скринридер без этой подписи
   * читает обычное название и молчит о том, почему нажатие ничего не делает.
   * `accessibilityState.disabled` сообщает «недоступно», но не «этот предмет вы
   * уже назвали» — а в проверке это разные вещи.
   */
  const usedNote = getMemoryPalaceStrings(locale).used;
  const webFocusProps = Platform.OS === 'web' ? ({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};
  return (
    <Pressable
      {...webFocusProps}
      accessibilityRole="button"
      accessibilityLabel={used ? label + '. ' + usedNote : label}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(used) }}
      disabled={used}
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemChoice,
        { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border },
        selected && styles.selectedChoice,
        used && styles.usedChoice,
        pressed && !used && styles.pressed,
        focused && ({
          outlineColor: theme.warning,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 2,
        } as any),
      ]}
    >
      <ItemAsset item={item} />
      <Text style={[styles.itemLabel, { color: theme.text }]}>{label}</Text>
      {used ? <Text style={[styles.usedNote, { color: theme.textSecondary }]}>{usedNote}</Text> : null}
    </Pressable>
  );
}

function LocusTile({
  locus,
  item,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  onPress,
  selectedItem,
  highlighted = false,
  concealItem = false,
}: {
  locus: PalaceLocus;
  item: PalaceItem | null;
  locale: MemoryPalaceLocale;
  theme: MemoryPalaceTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  onPress?: () => void;
  selectedItem?: PalaceItem | null;
  highlighted?: boolean;
  concealItem?: boolean;
}) {
  const strings = getMemoryPalaceStrings(locale);
  const locusName = getLocusLabel(locus, locale);
  const itemName = item ? getItemLabel(item, locale) : strings.emptyLocus;
  const label = onPress
    ? (selectedItem
      ? interpolateMemoryPalace(strings.placeAt, { order: locus.order, name: locusName })
      : strings.chooseItem) + '. ' + interpolateMemoryPalace(strings.placedItem, { locus: locusName, item: itemName })
    : interpolateMemoryPalace(strings.locusA11y, { order: locus.order, name: locusName })
      + (item ? '. ' + itemName : concealItem ? '' : '. ' + strings.emptyLocus);
  const [focused, setFocused] = React.useState(false);
  const webFocusProps = Platform.OS === 'web' ? ({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    tabIndex: 0,
  } as const) : {};
  return (
    <Pressable
      {...webFocusProps}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.locusTile,
        { backgroundColor: theme.surface, borderColor: highlighted ? theme.warning : theme.border },
        highlighted && styles.highlightedLocus,
        pressed && onPress && styles.pressed,
        focused && ({
          outlineColor: theme.warning,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 2,
        } as any),
      ]}
    >
      <View style={styles.diamondWrap}>
        <View style={[styles.diamond, { backgroundColor: locus.color, borderColor: gameGradient[1] }]} />
        <Text style={[styles.diamondOrder, { color: gameGradientText }]}>{locus.order}</Text>
      </View>
      <Text style={[styles.locusName, { color: theme.text }]}>{locusName}</Text>
      {item ? (
        <View style={styles.placedAsset}>
          <ItemAsset item={item} size={32} />
          <Text numberOfLines={2} style={[styles.placedLabel, { color: theme.textSecondary }]}>{itemName}</Text>
        </View>
      ) : !concealItem ? (
        <Text style={[styles.emptyLabel, { color: theme.textSecondary }]}>{strings.emptyLocus}</Text>
      ) : null}
    </Pressable>
  );
}

function PalaceScene({
  session,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  showItems,
  onLocusPress,
  highlightedLocusId,
}: {
  session: MemoryPalaceSession;
  locale: MemoryPalaceLocale;
  theme: MemoryPalaceTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  showItems: boolean;
  onLocusPress?: (index: number) => void;
  highlightedLocusId?: string | null;
}) {
  const selectedItem = findPalaceItem(session, session.selectedPlacementItemId);
  return (
    <View style={[styles.scene, { backgroundColor: theme.card, borderColor: gameGradient[1] }]}>
      <View style={[styles.routeLine, { backgroundColor: gameGradient[1] }]} />
      <View style={styles.lociGrid}>
        {session.round.loci.map((locus, index) => (
          <LocusTile
            key={locus.id}
            locus={locus}
            item={showItems ? findPalaceItem(session, session.placements[index] ?? null) : null}
            locale={locale}
            theme={theme}
            gameGradient={gameGradient}
            gameGradientText={gameGradientText}
            selectedItem={selectedItem}
            highlighted={highlightedLocusId === locus.id || session.selectedPlacementLocusIndex === index}
            onPress={onLocusPress ? () => onLocusPress(index) : undefined}
          />
        ))}
      </View>
    </View>
  );
}

function percentage(value: number): string {
  return Math.round(value * 100) + '%';
}

function MemoryPalaceSessionView({
  seed,
  level,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  showOwnResults = true,
  now,
  onComplete,
  onExit,
  initialSession = null,
  onSessionChange,
}: MemoryPalaceGameProps) {
  const strings = getMemoryPalaceStrings(locale);
  const [session, setSession] = React.useState(
    () => initialSession ?? createMemoryPalaceSession({ seed, level }),
  );
  const sessionRef = React.useRef(session);
  const completionReported = React.useRef(false);

  const applySession = React.useCallback((update: (current: MemoryPalaceSession) => MemoryPalaceSession) => {
    setSession((current) => {
      const next = update(current);
      sessionRef.current = next;
      return next;
    });
  }, []);

  // Слушателя держим в ref, а не в зависимостях эффекта: экран может отдавать
  // новую функцию на каждом рендере, и тогда эффект перезапускался бы вхолостую,
  // дёргая сохранение партии по кругу.
  const sessionChangeRef = React.useRef(onSessionChange);
  sessionChangeRef.current = onSessionChange;

  React.useEffect(() => {
    sessionRef.current = session;
    sessionChangeRef.current?.(session);
  }, [session]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') applySession((current) => pauseMemoryPalaceSession(current, now()));
    });
    return () => subscription.remove();
  }, [applySession, now]);

  React.useEffect(() => {
    if (session.phase === 'result' && session.result && !completionReported.current) {
      completionReported.current = true;
      onComplete?.(session.result);
    }
  }, [onComplete, session.phase, session.result]);

  React.useEffect(() => () => {
    sessionRef.current = disposeMemoryPalaceSession(sessionRef.current);
  }, []);

  const restart = React.useCallback(() => {
    completionReported.current = false;
    applySession((current) => restartMemoryPalaceSession(current, now()));
  }, [applySession, now]);

  const webKeyboardProps = Platform.OS === 'web' ? ({
    tabIndex: 0,
    onKeyDown: (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      if (key === 'p' || key === 'P') {
        event.preventDefault?.();
        if (sessionRef.current.phase === 'paused') {
          applySession((current) => resumeMemoryPalaceSession(current, now()));
        } else {
          applySession((current) => pauseMemoryPalaceSession(current, now()));
        }
      } else if (key === 'r' || key === 'R') {
        event.preventDefault?.();
        restart();
      }
    },
  } as const) : {};

  if (session.phase === 'disposed') return null;

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
          <Text style={[styles.rule, { color: theme.text }]}>{strings.routeRule}</Text>
          <Text style={[styles.rule, { color: theme.text }]}>{strings.placeRule}</Text>
          <Text style={[styles.rule, { color: theme.text }]}>{strings.recallRule}</Text>
          <Text style={[styles.boundary, { color: theme.primary }]}>{strings.methodBoundary}</Text>
          <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
        </View>
        <ActionButton label={strings.start} theme={theme} onPress={() => applySession((current) => startMemoryPalaceRound(current, now()))} />
        {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
      </ScrollView>
    );
  }

  if (session.phase === 'paused') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.pause}</Text>
          <ActionButton label={strings.resume} theme={theme} onPress={() => applySession((current) => resumeMemoryPalaceSession(current, now()))} />
          <ActionButton label={strings.restart} theme={theme} secondary onPress={restart} />
        </View>
      </View>
    );
  }

  if (session.phase === 'result' && session.result) {
    const result = session.result;
    if (!showOwnResults) return null;
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: gameGradient[1] }]}>
          <Text accessibilityRole="header" style={[styles.heroTitle, { color: gameGradientText }]}>{strings.resultTitle}</Text>
          <Text style={[styles.heroSkill, { color: gameGradientText }]}>{strings.noAutoAdvance}</Text>
        </View>
        <View style={[styles.card, styles.metrics, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{percentage(result.accuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.accuracy}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{percentage(result.specific.itemKnowledgeAccuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.itemKnowledge}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{percentage(result.specific.locationAccuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.locationAccuracy}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{percentage(result.specific.orderAccuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.orderAccuracy}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{percentage(result.specific.forwardLocationAccuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.forwardAccuracy}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{percentage(result.specific.reverseLocationAccuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.reverseAccuracy}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{result.specific.placementChanges}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.placementChanges}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{(result.durationMs / 1_000).toFixed(1)}s</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.duration}</Text></View>
        </View>
        <Text style={[styles.seed, { color: theme.textSecondary }]}>{strings.seed}: {result.seed}</Text>
        <ActionButton label={strings.playAgain} theme={theme} onPress={restart} />
        {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
      </ScrollView>
    );
  }

  if (session.phase === 'transition') {
    return (
      <View {...webKeyboardProps} style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.transitionTitle}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.transitionBody}</Text>
          <ActionButton label={strings.continueReverse} theme={theme} onPress={() => applySession(continueToReverseRecall)} />
          <ActionButton label={strings.pause} theme={theme} secondary onPress={() => applySession((current) => pauseMemoryPalaceSession(current, now()))} />
        </View>
      </View>
    );
  }

  if (session.phase === 'recall-forward' || session.phase === 'recall-reverse') {
    const direction = currentRecallDirection(session)!;
    const locus = currentRecallLocus(session)!;
    const responses = currentRecallResponses(session);
    const used = new Set(responses);
    return (
      <ScrollView
        {...webKeyboardProps}
        style={[styles.root, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.gameContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.gameHeader}>
          <View style={styles.gameHeaderText}>
            <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>
              {interpolateMemoryPalace(strings.recallTitle, { direction: getRecallDirectionLabel(locale, direction) })}
            </Text>
            <Text style={[styles.progress, { color: theme.primary }]}>
              {interpolateMemoryPalace(strings.recallProgress, { current: session.recallIndex + 1, total: session.round.lociCount })}
            </Text>
          </View>
          <ActionButton label={strings.pause} theme={theme} secondary onPress={() => applySession((current) => pauseMemoryPalaceSession(current, now()))} />
        </View>
        <View style={[styles.card, styles.recallLocus, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <LocusTile
            locus={locus}
            item={null}
            locale={locale}
            theme={theme}
            gameGradient={gameGradient}
            gameGradientText={gameGradientText}
            highlighted
            concealItem
          />
          <Text style={[styles.recallPrompt, { color: theme.text }]}>
            {interpolateMemoryPalace(strings.recallPrompt, { locus: getLocusLabel(locus, locale) })}
          </Text>
        </View>
        <View style={styles.itemGrid}>
          {session.round.recallCandidates.map((item) => (
            <ItemChoice
              key={item.id}
              item={item}
              locale={locale}
              theme={theme}
              used={used.has(item.id)}
              onPress={() => applySession((current) => selectRecallItem(current, item.id, now()))}
            />
          ))}
        </View>
        <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
      </ScrollView>
    );
  }

  const phaseTitle = session.phase === 'route'
    ? strings.routeTitle
    : session.phase === 'place'
      ? strings.placeTitle
      : strings.studyTitle;
  return (
    <ScrollView
      {...webKeyboardProps}
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.gameContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.gameHeader}>
        <View style={styles.gameHeaderText}>
          <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>{phaseTitle}</Text>
          <Text style={[styles.progress, { color: theme.primary }]}>
            {interpolateMemoryPalace(strings.routeCount, { count: session.round.lociCount })}
          </Text>
        </View>
        <ActionButton label={strings.pause} theme={theme} secondary onPress={() => applySession((current) => pauseMemoryPalaceSession(current, now()))} />
      </View>

      <Text style={[styles.body, { color: theme.textSecondary }]}>
        {session.phase === 'route'
          ? strings.routeBody
          : session.phase === 'place'
            ? strings.placeBody
            : strings.studyBody}
      </Text>

      {session.phase === 'place' ? (
        <>
          <View style={styles.itemGrid}>
            {session.round.targetItems.map((item) => (
              <ItemChoice
                key={item.id}
                item={item}
                locale={locale}
                theme={theme}
                selected={session.selectedPlacementItemId === item.id}
                onPress={() => applySession((current) => selectPlacementItem(current, item.id))}
              />
            ))}
          </View>
          <Text accessibilityLiveRegion="polite" style={[styles.selectedText, { color: theme.text }]}>
            {/*
              🔴 ВЫБОР ВИДЕН, С КАКОЙ БЫ СТОРОНЫ ЧЕЛОВЕК НИ НАЧАЛ. Отчёт Вали
              22.08.2026 «нажимаю разное, не запускается, не выбирается»: касание
              МЕСТА до выбора предмета молча не делало ничего. Теперь оно
              выбирает место — и строка обязана про это сказать, иначе выбор
              снова невидим и жалоба вернётся дословно.
            */}
            {session.selectedPlacementItemId
              ? interpolateMemoryPalace(strings.selectedItem, {
                item: getItemLabel(findPalaceItem(session, session.selectedPlacementItemId)!, locale),
              })
              : session.selectedPlacementLocusIndex !== null
                ? interpolateMemoryPalace(strings.selectedLocus, {
                  name: getLocusLabel(
                    session.round.loci[session.selectedPlacementLocusIndex] as PalaceLocus,
                    locale,
                  ),
                })
                : strings.chooseItem}
          </Text>
        </>
      ) : null}

      <PalaceScene
        session={session}
        locale={locale}
        theme={theme}
        gameGradient={gameGradient}
        gameGradientText={gameGradientText}
        showItems={session.phase === 'place' || session.phase === 'study'}
        onLocusPress={session.phase === 'place'
          ? (index) => applySession((current) => placeSelectedItemAtLocus(current, index))
          : undefined}
      />

      {session.phase === 'route' ? (
        <ActionButton label={strings.continueToPlace} theme={theme} onPress={() => applySession(continueToPlacement)} />
      ) : session.phase === 'place' ? (
        <>
          <Text style={[styles.progress, { color: theme.textSecondary }]}>
            {interpolateMemoryPalace(strings.placementProgress, {
              current: session.placements.filter(Boolean).length,
              total: session.round.lociCount,
            })}
          </Text>
          <Text style={[styles.keyboardHelp, { color: theme.primary }]}>{strings.placementChangeHint}</Text>
          <ActionButton
            label={strings.studyPlacements}
            theme={theme}
            disabled={!memoryPalacePlacementComplete(session)}
            onPress={() => applySession(confirmMemoryPalacePlacements)}
          />
        </>
      ) : (
        <ActionButton label={strings.startRecall} theme={theme} onPress={() => applySession(startMemoryPalaceRecall)} />
      )}
      <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
    </ScrollView>
  );
}

export function MemoryPalaceGame(props: MemoryPalaceGameProps) {
  return <MemoryPalaceSessionView key={props.seed + '|' + props.level} {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 880, alignSelf: 'center', padding: 20, gap: 16 },
  gameContent: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 20, gap: 18, flexGrow: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  hero: { borderRadius: 24, padding: 24, gap: 8 },
  heroTitle: { fontSize: 32, fontWeight: '800' },
  heroSkill: { fontSize: 16, lineHeight: 23 },
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
  centerCard: { width: '100%', maxWidth: 620, alignItems: 'center' },
  sectionTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  gameTitle: { fontSize: 26, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  rule: { fontSize: 16, lineHeight: 23 },
  boundary: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  keyboardHelp: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  actionButton: { minWidth: 48, minHeight: 48, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.42 },
  gameHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  /**
   * 🔴 ЛЕВЫЙ БЛОК ОБЯЗАН СЖИМАТЬСЯ. У View в React Native flexShrink по умолчанию
   * НОЛЬ: длинное название фазы («Разместите предметы» в 26 pt) распирало строку и
   * выталкивало кнопку «Пауза» за край экрана. Замер 19.08.2026 на 390×844:
   * кнопка занимала x 343…431 — 41 px висел за экраном, подпись обрезана. Ловится
   * это только живым замером: горизонтальной прокрутки страницы при этом НЕТ
   * (scrollWidth === clientWidth), и по разметке всё выглядит правильно.
   */
  gameHeaderText: { flexShrink: 1 },
  progress: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  scene: { width: '100%', borderWidth: 1, borderRadius: 24, padding: 14, overflow: 'hidden' },
  routeLine: { position: 'absolute', left: '8%', right: '8%', top: '50%', height: 4, transform: [{ rotateZ: '-4deg' }] },
  lociGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  locusTile: { minWidth: 128, minHeight: 150, maxWidth: 210, flexBasis: 145, flexGrow: 1, borderWidth: 1, borderRadius: 18, padding: 11, alignItems: 'center', gap: 7 },
  highlightedLocus: { borderWidth: 3 },
  diamondWrap: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  diamond: { position: 'absolute', width: 39, height: 39, borderWidth: 2, borderRadius: 5, transform: [{ rotateZ: '45deg' }] },
  diamondOrder: { fontSize: 18, fontWeight: '900' },
  locusName: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  placedAsset: { alignItems: 'center', gap: 6 },
  placedLabel: { fontSize: 12, textAlign: 'center' },
  emptyLabel: { fontSize: 12, fontStyle: 'italic' },
  itemGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  itemChoice: { minWidth: 112, minHeight: 108, maxWidth: 180, flexBasis: 125, flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 9 },
  selectedChoice: { borderWidth: 3 },
  // Израсходованная плитка гасится, но не до нечитаемости: теперь на ней есть
  // подпись «уже выбрано», а 0.32 превращали её в серое пятно — подпись
  // появилась бы формально и снова не читалась.
  usedChoice: { opacity: 0.55 },
  itemLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  usedNote: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  itemAsset: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  archAsset: { borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  assetMark: { width: 9, height: 9, borderRadius: 999 },
  selectedText: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  recallLocus: { alignItems: 'center' },
  recallPrompt: { fontSize: 20, lineHeight: 28, fontWeight: '800', textAlign: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  metric: { minWidth: 125, flexGrow: 1, alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricLabel: { fontSize: 13, textAlign: 'center' },
  seed: { fontSize: 12, textAlign: 'center' },
});
