/* psygames-pause-practices-game · VER 1 · 26.08.2026 */
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
  PAUSE_STRINGS,
  WARNING_TEXT,
  createPracticePlan,
  createPracticeSession,
  disposePracticeSession,
  getActiveFrame,
  getPracticeProgram,
  getPracticeSet,
  getRequiredPriorExperience,
  getRequiredWarnings,
  pausePracticeSession,
  restartPracticeSession,
  resumePracticeSession,
  startPracticeSession,
  text,
  tickPracticeSession,
  type GuideCue,
  type PauseLocale,
  type PlanRequest,
  type PracticeResult,
  type PracticeSession,
} from '../core/engine';

export interface PausePracticesTheme {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  secondary: string;
  success: string;
  danger: string;
  focus: string;
}

const DEFAULT_THEME: PausePracticesTheme = {
  background: '#f4f7f5',
  surface: '#ffffff',
  surfaceMuted: '#edf5f0',
  text: '#172820',
  textSecondary: '#5a6d63',
  border: '#d3e1d9',
  primary: '#426b5a',
  secondary: '#7562a8',
  success: '#26845e',
  danger: '#b94452',
  focus: '#e39b19',
};

/**
 * ЕСТЬ ЛИ ЧТО ТЕРЯТЬ ПРИ ВЫХОДЕ.
 *
 * Практика пошла — значит человек уже дышит или тянется, и оборвать её молча
 * нельзя. Практика ещё не начата (`ready`) или уже закончена (`done`) — терять
 * нечего, и вопрос при выходе был бы шумом, который приучает жать «выйти» не
 * читая.
 *
 * ⚠️ ЖИВЁТ В UI, А НЕ В `core/`. Ядро общее со «Умным будильником», и вопрос
 * при выходе — забота нашего экрана, а не второго приложения. Класть сюда
 * значит не тащить в общий договор то, что нужно одной стороне.
 */
export function hasSomethingToLose(session: { phase: string } | null | undefined): boolean {
  return session?.phase === 'running' || session?.phase === 'paused';
}

export interface PausePracticesGameProps {
  request: Omit<PlanRequest, 'acknowledgedWarnings' | 'confirmedPriorExperience'>;
  theme?: Partial<PausePracticesTheme>;
  now?: () => number;
  tickMs?: number;
  renderGuide?: (cue: GuideCue) => React.ReactNode;
  onGuideCue?: (cue: GuideCue) => void;
  /**
   * 🔴 «ЕСТЬ ЧТО ТЕРЯТЬ» — общий договор экранов-обёрток этого приложения.
   * Зовётся ОДИН раз, когда практика реально пошла: до того выход терять нечего
   * и спрашивать не о чем, после — оборвать десять минут молча нельзя. Экран
   * поднимает по нему `confirmExit` каркаса. Без этого пропа флаг у обёртки
   * остаётся навсегда `false`, и вопрос при выходе стоит мёртвым — ровно это и
   * ловит гейт `module-games-guard`.
   */
  onProgress?: () => void;
  onComplete?: (result: PracticeResult) => void;
  onExit?: () => void;
}

function PriorExperienceGate({
  locale,
  requiredProgramIds,
  confirmed,
  onToggle,
  theme,
}: {
  locale: PauseLocale;
  requiredProgramIds: ReturnType<typeof getRequiredPriorExperience>;
  confirmed: boolean;
  onToggle: () => void;
  theme: PausePracticesTheme;
}) {
  if (requiredProgramIds.length === 0) return null;
  const strings = PAUSE_STRINGS[locale];
  return (
    <View style={[styles.warningCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.experiencedOnly}</Text>
      <Text style={[styles.warningText, { color: theme.textSecondary }]}>
        {text(WARNING_TEXT['advanced-abdomen'], locale)}
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        accessibilityLabel={strings.confirmPriorExperience}
        onPress={onToggle}
        style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, { borderColor: theme.primary, backgroundColor: confirmed ? theme.primary : theme.surface }]}>
          {confirmed ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={[styles.checkboxLabel, { color: theme.text }]}>{strings.confirmPriorExperience}</Text>
      </Pressable>
    </View>
  );
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function contextLabel(context: PlanRequest['context'], locale: PauseLocale): string {
  const labels = {
    'desk-invisible': { ru: 'Незаметно за столом', en: 'Discreet at the desk' },
    'desk-visible': { ru: 'Обычная пауза за столом', en: 'Desk break' },
    home: { ru: 'Дома', en: 'At home' },
  } as const;
  return labels[context][locale];
}

function guideLabel(guideMode: PlanRequest['guideMode'], locale: PauseLocale): string {
  const labels = {
    visual: { ru: 'Визуальные подсказки', en: 'Visual guidance' },
    audio: { ru: 'Звуковые подсказки', en: 'Audio guidance' },
    both: { ru: 'Звук + экран', en: 'Audio + visual' },
  } as const;
  return labels[guideMode][locale];
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
  theme: PausePracticesTheme;
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
        styles.action,
        secondary
          ? { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }
          : { backgroundColor: theme.primary },
        pressed && styles.pressed,
        disabled && styles.disabled,
        focused && ({
          outlineColor: theme.focus,
          outlineStyle: 'solid',
          outlineWidth: 3,
          outlineOffset: 3,
        } as never),
      ]}
    >
      <Text style={[styles.actionText, { color: secondary ? theme.text : '#ffffff' }]}>{label}</Text>
    </Pressable>
  );
}

function WarningGate({
  locale,
  warningIds,
  acknowledged,
  onToggle,
  theme,
}: {
  locale: PauseLocale;
  warningIds: ReturnType<typeof getRequiredWarnings>;
  acknowledged: boolean;
  onToggle: () => void;
  theme: PausePracticesTheme;
}) {
  if (warningIds.length === 0) return null;
  return (
    <View style={[styles.warningCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{PAUSE_STRINGS[locale].warnings}</Text>
      {warningIds.map((warningId) => (
        <Text key={warningId} style={[styles.warningText, { color: theme.textSecondary }]}>• {text(WARNING_TEXT[warningId], locale)}</Text>
      ))}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acknowledged }}
        accessibilityLabel={PAUSE_STRINGS[locale].acknowledge}
        onPress={onToggle}
        style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, { borderColor: theme.primary, backgroundColor: acknowledged ? theme.primary : theme.surface }]}>
          {acknowledged ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={[styles.checkboxLabel, { color: theme.text }]}>{PAUSE_STRINGS[locale].acknowledge}</Text>
      </Pressable>
    </View>
  );
}

function SetupScreen({
  request,
  theme,
  warningIds,
  priorExperienceProgramIds,
  acknowledged,
  priorExperienceConfirmed,
  onToggleWarnings,
  onTogglePriorExperience,
  onStart,
  onExit,
  error,
}: {
  request: Omit<PlanRequest, 'acknowledgedWarnings' | 'confirmedPriorExperience'>;
  theme: PausePracticesTheme;
  warningIds: ReturnType<typeof getRequiredWarnings>;
  priorExperienceProgramIds: ReturnType<typeof getRequiredPriorExperience>;
  acknowledged: boolean;
  priorExperienceConfirmed: boolean;
  onToggleWarnings: () => void;
  onTogglePriorExperience: () => void;
  onStart: () => void;
  onExit?: () => void;
  error: string | null;
}) {
  const { locale } = request;
  const strings = PAUSE_STRINGS[locale];
  return (
    <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { backgroundColor: theme.primary }]}>
        <Text accessibilityRole="header" style={styles.heroTitle}>{strings.title}</Text>
        <Text style={styles.heroSubtitle}>{strings.ready}</Text>
      </View>
      <View style={styles.chips}>
        <Text style={[styles.chip, { color: theme.text, backgroundColor: theme.surfaceMuted }]}>{request.mode === 'parallel' ? strings.parallel : strings.solo}</Text>
        <Text style={[styles.chip, { color: theme.text, backgroundColor: theme.surfaceMuted }]}>{formatClock(request.durationMs)}</Text>
        <Text style={[styles.chip, { color: theme.text, backgroundColor: theme.surfaceMuted }]}>{contextLabel(request.context, locale)}</Text>
        <Text style={[styles.chip, { color: theme.text, backgroundColor: theme.surfaceMuted }]}>{guideLabel(request.guideMode, locale)}</Text>
      </View>
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {request.selections.map((selection) => {
          const set = getPracticeSet(selection.setId);
          const program = getPracticeProgram(selection.setId, selection.programId);
          return (
            <View key={selection.setId} style={[styles.selectionRow, { borderBottomColor: theme.border }]}>
              <View style={styles.selectionCopy}>
                <Text style={[styles.selectionTitle, { color: theme.text }]}>{text(set.title, locale)}</Text>
                <Text style={[styles.selectionProgram, { color: theme.textSecondary }]}>{text(program.title, locale)}</Text>
              </View>
              <Text style={[styles.statusBadge, { color: set.status === 'experimental' ? theme.danger : theme.secondary }]}>{set.status}</Text>
            </View>
          );
        })}
      </View>
      <WarningGate locale={locale} warningIds={warningIds} acknowledged={acknowledged} onToggle={onToggleWarnings} theme={theme} />
      <PriorExperienceGate locale={locale} requiredProgramIds={priorExperienceProgramIds} confirmed={priorExperienceConfirmed} onToggle={onTogglePriorExperience} theme={theme} />
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
      <View style={styles.actions}>
        <ActionButton
          label={strings.start}
          theme={theme}
          disabled={(warningIds.length > 0 && !acknowledged) || (priorExperienceProgramIds.length > 0 && !priorExperienceConfirmed)}
          onPress={onStart}
        />
        {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
      </View>
    </ScrollView>
  );
}

function SessionScreen({
  session,
  frame,
  theme,
  renderGuide,
  onPause,
  onResume,
  onRestart,
  onExit,
}: {
  session: PracticeSession;
  frame: ReturnType<typeof getActiveFrame>;
  theme: PausePracticesTheme;
  renderGuide?: (cue: GuideCue) => React.ReactNode;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onExit?: () => void;
}) {
  const { locale } = session.plan;
  const strings = PAUSE_STRINGS[locale];
  if (session.phase === 'paused') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.pauseCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.pause}</Text>
          <Text style={[styles.clock, { color: theme.text }]}>{formatClock(session.plan.durationMs - frame.elapsedMs)}</Text>
          <ActionButton label={strings.resume} theme={theme} onPress={onResume} />
          <ActionButton label={strings.restart} theme={theme} secondary onPress={onRestart} />
          {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.sessionHeader}>
        <View>
          <Text accessibilityRole="header" style={[styles.sessionTitle, { color: theme.text }]}>{strings.title}</Text>
          <Text style={[styles.sessionMeta, { color: theme.textSecondary }]}>{contextLabel(session.plan.context, locale)}</Text>
        </View>
        <ActionButton label={strings.pause} theme={theme} secondary onPress={onPause} />
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={strings.progress}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(frame.progress * 100) }}
        style={[styles.progressTrack, { backgroundColor: theme.border }]}
      >
        <View style={[styles.progressFill, { backgroundColor: theme.secondary, width: `${Math.min(100, frame.progress * 100)}%` }]} />
      </View>
      <Text style={[styles.clock, { color: theme.text }]}>{formatClock(session.plan.durationMs - frame.elapsedMs)}</Text>
      <View accessibilityLiveRegion="polite" style={styles.cueGrid}>
        {frame.cues.map((cue) => (
          <View key={`${cue.setId}-${cue.programId}-${cue.stepId}`} style={[styles.cueCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[styles.cueSet, { color: theme.secondary }]}>{text(getPracticeSet(cue.setId).title, locale)}</Text>
            {renderGuide ? <View style={styles.guideSlot}>{renderGuide(cue)}</View> : <View accessibilityElementsHidden style={[styles.guidePlaceholder, { backgroundColor: theme.surfaceMuted }]}><Text style={styles.guideGlyph}>{cue.motion === 'breath' ? (cue.leaderShape === 'square' ? '□' : cue.leaderShape === 'triangle' ? '△' : '◯') : cue.motion === 'eyes' ? '◉' : cue.motion === 'voice' ? '♪' : '↗'}</Text></View>}
            <Text accessibilityRole="header" style={[styles.cueTitle, { color: theme.text }]}>{cue.title}</Text>
            <Text style={[styles.cueText, { color: theme.textSecondary }]}>{cue.cue}</Text>
            <View style={[styles.cueProgress, { backgroundColor: theme.border }]}><View style={[styles.cueProgressFill, { backgroundColor: theme.primary, width: `${Math.min(100, cue.progress * 100)}%` }]} /></View>
          </View>
        ))}
      </View>
      <Text style={[styles.safetyFooter, { color: theme.textSecondary }]}>{text(WARNING_TEXT['general-stop'], locale)}</Text>
    </ScrollView>
  );
}

function ResultScreen({
  result,
  locale,
  theme,
  onRestart,
  onExit,
}: {
  result: PracticeResult;
  locale: PauseLocale;
  theme: PausePracticesTheme;
  onRestart: () => void;
  onExit?: () => void;
}) {
  const strings = PAUSE_STRINGS[locale];
  return (
    <ScrollView style={[styles.root, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { backgroundColor: theme.success }]}>
        <Text accessibilityRole="header" style={styles.heroTitle}>{strings.completed}</Text>
        <Text style={styles.heroSubtitle}>{strings.completionOnly}</Text>
      </View>
      <View style={[styles.card, styles.resultCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.resultValue, { color: theme.text }]}>{formatClock(result.durationMs)}</Text>
        <Text style={[styles.resultLabel, { color: theme.textSecondary }]}>{result.completedSetIds.map((setId) => text(getPracticeSet(setId).title, locale)).join(' · ')}</Text>
      </View>
      <View style={styles.actions}>
        <ActionButton label={strings.restart} theme={theme} onPress={onRestart} />
        {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
      </View>
    </ScrollView>
  );
}

function PausePracticesGameInstance({
  request,
  theme: themeOverrides,
  now = Date.now,
  tickMs = 250,
  renderGuide,
  onGuideCue,
  onProgress,
  onComplete,
  onExit,
}: PausePracticesGameProps) {
  const theme = React.useMemo(() => ({ ...DEFAULT_THEME, ...themeOverrides }), [themeOverrides]);
  const warningIds = React.useMemo(() => getRequiredWarnings(request.selections), [request.selections]);
  const priorExperienceProgramIds = React.useMemo(() => getRequiredPriorExperience(request.selections), [request.selections]);
  const [acknowledged, setAcknowledged] = React.useState(warningIds.length === 0);
  const [priorExperienceConfirmed, setPriorExperienceConfirmed] = React.useState(priorExperienceProgramIds.length === 0);
  const [session, setSession] = React.useState<PracticeSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [renderNow, setRenderNow] = React.useState(0);
  const sessionRef = React.useRef<PracticeSession | null>(null);
  const completedRef = React.useRef(false);
  const lastCueRef = React.useRef('');

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    if (session?.phase !== 'running') return undefined;
    const intervalId = setInterval(() => {
      const timestamp = now();
      setRenderNow(timestamp);
      setSession((current) => current ? tickPracticeSession(current, timestamp) : current);
    }, Math.max(100, tickMs));
    return () => clearInterval(intervalId);
  }, [now, session?.phase, tickMs]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setSession((current) => current ? pausePracticeSession(current, now()) : current);
      }
    });
    return () => subscription.remove();
  }, [now]);

  React.useEffect(() => () => {
    if (sessionRef.current) sessionRef.current = disposePracticeSession(sessionRef.current);
  }, []);

  React.useEffect(() => {
    if (session?.phase === 'completed' && session.result && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(session.result);
    }
  }, [onComplete, session]);

  const frame = React.useMemo(() => {
    if (!session) return null;
    const elapsed = session.phase === 'running'
      ? Math.min(session.plan.durationMs, session.elapsedMs + Math.max(0, renderNow - (session.runningSinceMs ?? renderNow)))
      : session.elapsedMs;
    return getActiveFrame(session.plan, elapsed);
  }, [renderNow, session]);

  React.useEffect(() => {
    if (session?.phase === 'running' && frame) onProgress?.();
    if (!onGuideCue || session?.phase !== 'running' || !frame) return;
    for (const cue of frame.cues) {
      const key = `${cue.setId}/${cue.programId}/${cue.stepId}`;
      if (key !== lastCueRef.current) {
        lastCueRef.current = key;
        onGuideCue(cue);
      }
    }
  }, [frame, onGuideCue, onProgress, session?.phase]);

  const start = () => {
    try {
      const plan = createPracticePlan({
        ...request,
        acknowledgedWarnings: acknowledged ? warningIds : [],
        confirmedPriorExperience: priorExperienceConfirmed ? priorExperienceProgramIds : [],
      });
      const timestamp = now();
      completedRef.current = false;
      setError(null);
      setRenderNow(timestamp);
      setSession(startPracticeSession(createPracticeSession(plan), timestamp));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const restart = () => {
    if (!session) return;
    completedRef.current = false;
    lastCueRef.current = '';
    setSession(restartPracticeSession(session));
  };

  const exit = () => {
    setSession((current) => current ? disposePracticeSession(current) : current);
    onExit?.();
  };

  if (!session || session.phase === 'ready') {
    return (
      <SetupScreen
        request={request}
        theme={theme}
        warningIds={warningIds}
        priorExperienceProgramIds={priorExperienceProgramIds}
        acknowledged={acknowledged}
        priorExperienceConfirmed={priorExperienceConfirmed}
        onToggleWarnings={() => setAcknowledged((value) => !value)}
        onTogglePriorExperience={() => setPriorExperienceConfirmed((value) => !value)}
        onStart={session?.phase === 'ready' ? () => {
          const timestamp = now();
          setRenderNow(timestamp);
          setSession(startPracticeSession(session, timestamp));
        } : start}
        onExit={onExit ? exit : undefined}
        error={error}
      />
    );
  }

  if (session.phase === 'completed' && session.result) {
    return <ResultScreen result={session.result} locale={session.plan.locale} theme={theme} onRestart={restart} onExit={onExit ? exit : undefined} />;
  }
  if (session.phase === 'disposed' || !frame) return null;

  return (
    <SessionScreen
      session={session}
      frame={frame}
      theme={theme}
      renderGuide={renderGuide}
      onPause={() => setSession((current) => current ? pausePracticeSession(current, now()) : current)}
      onResume={() => setSession((current) => current ? resumePracticeSession(current, now()) : current)}
      onRestart={restart}
      onExit={onExit ? exit : undefined}
    />
  );
}

export function PausePracticesGame(props: PausePracticesGameProps) {
  const requestKey = JSON.stringify(props.request);
  return <PausePracticesGameInstance key={requestKey} {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 16, paddingBottom: 32, gap: 14 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  hero: { borderRadius: 24, padding: 26, alignItems: 'center', gap: 8 },
  heroTitle: { color: '#ffffff', fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'center' },
  heroSubtitle: { color: '#ffffff', opacity: 0.92, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  selectionRow: { minHeight: 64, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectionCopy: { flex: 1, gap: 3 },
  selectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  selectionProgram: { fontSize: 13, lineHeight: 18 },
  statusBadge: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  warningCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: '900' },
  warningText: { fontSize: 13, lineHeight: 19 },
  checkboxRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  checkboxLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { minHeight: 48, minWidth: 130, flexGrow: 1, borderRadius: 15, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.42 },
  error: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  sessionHeader: { minHeight: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sessionTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900' },
  sessionMeta: { fontSize: 13, lineHeight: 18 },
  progressTrack: { height: 10, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  clock: { fontSize: 38, lineHeight: 44, fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center' },
  cueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cueCard: { minWidth: 260, flex: 1, borderWidth: 1, borderRadius: 22, padding: 18, gap: 10, alignItems: 'center' },
  cueSet: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  guideSlot: { width: '100%', minHeight: 100, alignItems: 'center', justifyContent: 'center' },
  guidePlaceholder: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  guideGlyph: { fontSize: 42, color: '#426b5a' },
  cueTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center' },
  cueText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  cueProgress: { width: '100%', height: 6, borderRadius: 999, overflow: 'hidden' },
  cueProgressFill: { height: '100%', borderRadius: 999 },
  safetyFooter: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pauseCard: { width: '100%', maxWidth: 520, padding: 24, gap: 12 },
  resultCard: { padding: 24, alignItems: 'center', gap: 10 },
  resultValue: { fontSize: 42, lineHeight: 48, fontWeight: '900', fontVariant: ['tabular-nums'] },
  resultLabel: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
