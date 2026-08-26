/* psygames-math-slider-game · VER 3 · 21.08.2026 */
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
  advanceSession,
  confirmEstimate,
  createMathSliderSession,
  formatExpression,
  formatNumber,
  getCurrentQuestion,
  getMathSliderStrings,
  interpolate,
  mathSliderArmed,
  pauseSession,
  restartSession,
  resumeSession,
  setEstimate,
  startTraining,
  type MathSliderLocale,
  type MathSliderMetrics,
  type MathSliderQuestion,
  type TrialScore,
} from './core/index';

export interface MathSliderTheme {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  secondary: string;
  success: string;
  danger: string;
  focus: string;
}

const DEFAULT_THEME: MathSliderTheme = {
  background: '#f5f7fb',
  surface: '#ffffff',
  text: '#172033',
  textSecondary: '#5e687d',
  border: '#d7ddeb',
  primary: '#5b4ee8',
  secondary: '#12a594',
  success: '#168a52',
  danger: '#c6384f',
  focus: '#ffb000',
};

export interface MathSliderGameProps {
  seed: string;
  level: number;
  locale: MathSliderLocale;
  trialCount?: number;
  theme?: Partial<MathSliderTheme>;
  now?: () => number;
  onComplete?: (result: MathSliderMetrics) => void;
  onExit?: () => void;
  /**
   * Есть ли что терять при выходе — по состоянию партии, а не по флажку.
   *
   * 🔴 ЗАЧЕМ. Экран спрашивает при выходе только когда терять есть что: партия
   * без единого ответа вернётся точно такой же, и вопрос был бы лишним трением.
   * Отличить одно от другого снаружи нельзя — знает только партия, поэтому сюда
   * уезжает `mathSliderArmed(session)`, чистая функция, которую гейт гоняет.
   */
  onProgress?: (armed: boolean) => void;
}

interface NumberLineProps {
  question: MathSliderQuestion;
  estimate: number;
  locale: MathSliderLocale;
  disabled: boolean;
  answer?: number;
  theme: MathSliderTheme;
  label: string;
  hint: string;
  onChange: (value: number) => void;
  onConfirm: () => void;
}

function decimalPlaces(value: number): number {
  const text = String(value);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function snapValue(value: number, question: MathSliderQuestion): number {
  const { min, max, keyboardStep } = question.scale;
  const snapped = min + Math.round((value - min) / keyboardStep) * keyboardStep;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(Math.min(4, Math.max(0, decimalPlaces(keyboardStep)))))));
}

function NumberLine({
  question,
  estimate,
  locale,
  disabled,
  answer,
  theme,
  label,
  hint,
  onChange,
  onConfirm,
}: NumberLineProps) {
  const [trackWidth, setTrackWidth] = React.useState(1);
  const [focused, setFocused] = React.useState(false);
  const estimatePercent = (estimate - question.scale.min) / question.scale.width;
  const answerPercent = answer === undefined
    ? null
    : (answer - question.scale.min) / question.scale.width;

  const changeBy = React.useCallback((delta: number) => {
    if (!disabled) onChange(snapValue(estimate + delta, question));
  }, [disabled, estimate, onChange, question]);

  const changeFromX = React.useCallback((x: number) => {
    if (disabled || !Number.isFinite(x)) return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    onChange(snapValue(question.scale.min + ratio * question.scale.width, question));
  }, [disabled, onChange, question, trackWidth]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (event) => changeFromX(event.nativeEvent.locationX),
    onPanResponderMove: (event) => changeFromX(event.nativeEvent.locationX),
    onPanResponderTerminationRequest: () => false,
  }), [changeFromX, disabled]);

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') changeBy(question.scale.keyboardStep);
    if (event.nativeEvent.actionName === 'decrement') changeBy(-question.scale.keyboardStep);
  };

  const webKeyboardProps = Platform.OS === 'web' ? ({
    role: 'slider',
    tabIndex: disabled ? -1 : 0,
    onKeyDown: (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
        event.preventDefault?.();
        event.nativeEvent?.preventDefault?.();
      }
      if (key === 'ArrowLeft' || key === 'ArrowDown') changeBy(-question.scale.keyboardStep);
      if (key === 'ArrowRight' || key === 'ArrowUp') changeBy(question.scale.keyboardStep);
      if (key === 'PageDown') changeBy(-question.scale.majorStep);
      if (key === 'PageUp') changeBy(question.scale.majorStep);
      if (key === 'Home') onChange(question.scale.min);
      if (key === 'End') onChange(question.scale.max);
      if ((key === 'Enter' || key === ' ') && !disabled) onConfirm();
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};

  return (
    <View style={styles.numberLineBlock}>
      <View
        {...panResponder.panHandlers}
        {...webKeyboardProps}
        accessible
        focusable={!disabled}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityValue={{
          min: question.scale.min,
          max: question.scale.max,
          now: estimate,
          text: formatNumber(estimate, locale),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        style={[
          styles.trackTouchTarget,
          focused && ({
            outlineColor: theme.focus,
            outlineStyle: 'solid',
            outlineWidth: 3,
            outlineOffset: 3,
          } as any),
        ]}
      >
        <View style={[styles.track, { backgroundColor: theme.border }]} />
        {question.scale.ticks.map((tick, index) => {
          const left = `${(index / question.scale.tickCount) * 100}%` as const;
          const showLabel = index === 0
            || index === question.scale.tickCount
            || question.scale.tickCount <= 5
            || index % 2 === 0;
          return (
            <React.Fragment key={`${question.id}-tick-${index}`}>
              <View style={[styles.tick, { left, backgroundColor: theme.textSecondary }]} />
              {showLabel ? (
                <Text style={[styles.tickLabel, { left, color: theme.textSecondary }]}>
                  {formatNumber(tick, locale)}
                </Text>
              ) : null}
            </React.Fragment>
          );
        })}
        {answerPercent !== null ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.answerMarker,
              { left: `${answerPercent * 100}%`, backgroundColor: theme.success },
            ]}
          />
        ) : null}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.estimateMarker,
            { left: `${estimatePercent * 100}%`, backgroundColor: theme.primary },
          ]}
        />
      </View>
      <Text style={[styles.currentEstimate, { color: theme.text }]}>
        {formatNumber(estimate, locale)}
      </Text>
    </View>
  );
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
  theme: MathSliderTheme;
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
          outlineColor: theme.focus,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 3,
        } as any),
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionButtonText, { color: secondary ? theme.text : '#ffffff' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function feedbackFor(sessionPhase: string, trainingScore: TrialScore | null, trials: TrialScore[]): TrialScore | null {
  if (sessionPhase === 'training-feedback') return trainingScore;
  if (sessionPhase === 'feedback') return trials[trials.length - 1] ?? null;
  return null;
}

function MathSliderSession({
  seed,
  level,
  locale,
  trialCount = 8,
  theme: themeOverrides,
  now = Date.now,
  onComplete,
  onExit,
  onProgress,
}: MathSliderGameProps) {
  const theme = React.useMemo(() => ({ ...DEFAULT_THEME, ...themeOverrides }), [themeOverrides]);
  const strings = getMathSliderStrings(locale);
  const [session, setSession] = React.useState(() => createMathSliderSession({ seed, level, trialCount }));

  /**
   * Сообщаем экрану, есть ли что терять. Через эффект, а не из обновления
   * состояния: побочный вызов внутри редьюсера React вправе выполнить дважды.
   */
  const armed = mathSliderArmed(session);
  React.useEffect(() => { onProgress?.(armed); }, [armed]);
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    if (session.phase === 'result' && session.result && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(session.result);
    }
  }, [onComplete, session.phase, session.result]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setSession((current) => pauseSession(current, now()));
      }
    });
    return () => subscription.remove();
  }, [now]);

  /**
   * 🔴 ОДНО НАЖАТИЕ НА ЗАДАНИЕ, А НЕ ДВА.
   *
   * Репорт Дениса 19.08.2026: «после выбора перемещения ползунка, когда нажал
   * подтвердить, должна быть оценка и запуск следующего задания, а то сейчас
   * дважды подтверждаешь всё».
   *
   * Модуль просил подтвердить оценку, показывал разбор и ЖДАЛ второго нажатия.
   * На восьми пробах это шестнадцать нажатий вместо восьми, причём второе
   * ничего не решает — человек уже посмотрел разбор и хочет дальше. Кнопка,
   * которая ничего не выбирает, перестаёт читаться как выбор и начинает
   * читаться как помеха.
   *
   * Теперь разбор показывается и сам уходит. Кнопка остаётся — кому надо
   * быстрее, жмёт и не ждёт.
   *
   * ⚠️ ПЕРЕХОД ОТ ТРЕНИРОВКИ К ЗАЧЁТУ САМ НЕ УХОДИТ. `training-feedback` — это
   * граница: дальше идут пробы, которые считаются. Проскочить её автоматически
   * значит начать замер, пока человек ещё читает, чем тренировка отличалась.
   *
   * ⚠️ ХУК СТОИТ ДО ВСЕХ РАННИХ ВОЗВРАТОВ, И ЭТО НЕ ВКУСОВЩИНА. Первая
   * редакция поставила его рядом с разбором — то есть НИЖЕ пяти `return`
   * по фазам. На фазе правил хук не вызывался, на фазе разбора вызывался, и
   * React падал с ошибкой «отрисовано больше хуков, чем в прошлый раз».
   * Экран показывал «что-то сломалось» вместо игры. Поймано проверкой в
   * браузере 19.08.2026.
   */
  const autoAdvance = session.phase === 'feedback';
  React.useEffect(() => {
    if (!autoAdvance) return;
    const t = setTimeout(() => setSession((current) => advanceSession(current, now())), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [autoAdvance, session.currentIndex]);

  if (session.phase === 'disposed') return null;

  const restart = () => {
    completedRef.current = false;
    setSession((current) => restartSession(current));
  };

  if (session.phase === 'rules') {
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <Text accessibilityRole="header" style={styles.heroTitle}>{strings.title}</Text>
          <Text style={styles.heroSkill}>{strings.skill}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.rulesTitle}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesBody}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesAccuracy}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesControls}</Text>
          <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
        </View>
        <View style={styles.actions}>
          <ActionButton label={strings.startTraining} theme={theme} onPress={() => setSession((current) => startTraining(current, now()))} />
          {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
        </View>
      </ScrollView>
    );
  }

  if (session.phase === 'paused') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.pauseCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.pause}</Text>
          <ActionButton label={strings.resume} theme={theme} onPress={() => setSession((current) => resumeSession(current, now()))} />
          <ActionButton label={strings.playAgain} theme={theme} secondary onPress={restart} />
        </View>
      </View>
    );
  }

  if (session.phase === 'result' && session.result) {
    const biasLabel = session.result.specific.biasDirection === 'over'
      ? strings.biasOver
      : session.result.specific.biasDirection === 'under'
        ? strings.biasUnder
        : strings.biasBalanced;
    return (
      <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: theme.secondary }]}>
          <Text accessibilityRole="header" style={styles.heroTitle}>{strings.resultTitle}</Text>
          <Text style={styles.heroSkill}>{strings.noAutoAdvance}</Text>
        </View>
        <View style={[styles.card, styles.metricsGrid, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{Math.round(session.result.accuracy * 100)}%</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.accuracy}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{(session.result.durationMs / 1000).toFixed(1)}s</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.duration}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{session.result.errors}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.errors}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{biasLabel}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.bias}</Text></View>
        </View>
        <Text style={[styles.seed, { color: theme.textSecondary }]}>{strings.seed}: {session.result.seed}</Text>
        <View style={styles.actions}>
          <ActionButton label={strings.playAgain} theme={theme} onPress={restart} />
          {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
        </View>
      </ScrollView>
    );
  }

  const question = getCurrentQuestion(session);
  if (!question) return null;
  const feedback = feedbackFor(session.phase, session.trainingScore, session.trials);
  const isTraining = session.phase === 'training' || session.phase === 'training-feedback';
  const isFeedback = session.phase === 'training-feedback' || session.phase === 'feedback';

  const roundLabel = isTraining
    ? strings.trainingTitle
    : interpolate(strings.roundLabel, { current: session.currentIndex + 1, total: session.questions.length });

  return (
    <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <View>
          <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>{strings.title}</Text>
          <Text style={[styles.round, { color: theme.textSecondary }]}>{roundLabel} · {interpolate(strings.levelLabel, { level: session.config.level })}</Text>
        </View>
        {!isFeedback ? <ActionButton label={strings.pause} theme={theme} secondary onPress={() => setSession((current) => pauseSession(current, now()))} /> : null}
      </View>
      {isTraining ? <Text style={[styles.trainingHint, { color: theme.textSecondary }]}>{strings.trainingHint}</Text> : null}
      <View style={[styles.expressionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.prompt, { color: theme.textSecondary }]}>{strings.prompt}</Text>
        <Text accessibilityRole="header" style={[styles.expression, { color: theme.text }]}>{formatExpression(question.expression, locale)}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <NumberLine
          question={question}
          estimate={session.estimate}
          locale={locale}
          disabled={isFeedback}
          answer={isFeedback ? question.answer : undefined}
          theme={theme}
          label={strings.sliderLabel}
          hint={strings.sliderHint}
          onChange={(value) => setSession((current) => setEstimate(current, value))}
          onConfirm={() => setSession((current) => confirmEstimate(current, now()))}
        />
      </View>
      {feedback ? (
        <View accessibilityLiveRegion="polite" style={[styles.feedbackCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.feedbackRow}><Text style={[styles.feedbackLabel, { color: theme.textSecondary }]}>{strings.exactAnswer}</Text><Text style={[styles.feedbackValue, { color: theme.success }]}>{formatNumber(feedback.answer, locale)}</Text></View>
          <View style={styles.feedbackRow}><Text style={[styles.feedbackLabel, { color: theme.textSecondary }]}>{strings.yourEstimate}</Text><Text style={[styles.feedbackValue, { color: theme.primary }]}>{formatNumber(feedback.estimate, locale)}</Text></View>
          <View style={styles.feedbackRow}><Text style={[styles.feedbackLabel, { color: theme.textSecondary }]}>{strings.normalizedError}</Text><Text style={[styles.feedbackValue, { color: feedback.outsideTarget ? theme.danger : theme.success }]}>{(feedback.normalizedError * 100).toFixed(1)}%</Text></View>
          <View style={styles.feedbackRow}><Text style={[styles.feedbackLabel, { color: theme.textSecondary }]}>{strings.signedError}</Text><Text style={[styles.feedbackValue, { color: theme.text }]}>{feedback.signedError > 0 ? '+' : ''}{formatNumber(feedback.signedError, locale)}</Text></View>
        </View>
      ) : null}
      <View style={styles.actions}>
        {isFeedback ? (
          <ActionButton
            label={session.phase === 'training-feedback' ? strings.startRound : strings.continue}
            theme={theme}
            onPress={() => setSession((current) => advanceSession(current, now()))}
          />
        ) : (
          <ActionButton label={strings.confirm} theme={theme} onPress={() => setSession((current) => confirmEstimate(current, now()))} />
        )}
        <ActionButton label={strings.playAgain} theme={theme} secondary onPress={restart} />
      </View>
    </ScrollView>
  );
}

/**
 * Сколько держать разбор перед следующей пробой. Столько же, сколько общий
 * баннер уровня в приложении: меньше — не успеть прочитать знаковую ошибку,
 * больше — превращается в ожидание.
 */
const FEEDBACK_MS = 1800;

export default function MathSliderGame(props: MathSliderGameProps) {
  const trialCount = props.trialCount ?? 8;
  const sessionKey = JSON.stringify([props.seed, props.level, trialCount]);

  return (
    <MathSliderSession
      {...props}
      key={sessionKey}
      trialCount={trialCount}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 18, gap: 14 },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 16 },
  hero: { width: '100%', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 22, gap: 8 },
  heroTitle: { color: '#ffffff', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  heroSkill: { color: '#ffffff', opacity: 0.92, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  card: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23 },
  keyboardHelp: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  actionButton: { minHeight: 48, minWidth: 150, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 13, justifyContent: 'center', alignItems: 'center' },
  actionButtonText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  pauseCard: { maxWidth: 520 },
  topRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  gameTitle: { fontSize: 22, fontWeight: '900' },
  round: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  trainingHint: { fontSize: 14, textAlign: 'center' },
  expressionCard: { width: '100%', borderRadius: 24, borderWidth: 1, paddingVertical: 26, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  prompt: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  expression: { fontSize: 34, lineHeight: 44, fontWeight: '900', textAlign: 'center', writingDirection: 'ltr' },
  numberLineBlock: { width: '100%', paddingTop: 16, paddingBottom: 4 },
  trackTouchTarget: { width: '100%', minHeight: 88, justifyContent: 'flex-start', position: 'relative', borderRadius: 12 },
  track: { position: 'absolute', top: 27, left: 0, right: 0, height: 6, borderRadius: 3 },
  tick: { position: 'absolute', top: 18, width: 2, height: 24, transform: [{ translateX: -1 }] },
  tickLabel: { position: 'absolute', top: 48, width: 62, marginLeft: -31, textAlign: 'center', fontSize: 11, fontVariant: ['tabular-nums'] },
  estimateMarker: { position: 'absolute', top: 9, width: 28, height: 42, borderRadius: 14, transform: [{ translateX: -14 }], borderWidth: 4, borderColor: '#ffffff' },
  answerMarker: { position: 'absolute', top: 17, width: 12, height: 28, borderRadius: 6, transform: [{ translateX: -6 }] },
  currentEstimate: { textAlign: 'center', fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  feedbackCard: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 16, gap: 8 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  feedbackLabel: { flex: 1, fontSize: 14 },
  feedbackValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  metric: { minWidth: 140, flexGrow: 1, flexBasis: '45%', padding: 12, alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  metricLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  seed: { fontSize: 12, textAlign: 'center' },
});
