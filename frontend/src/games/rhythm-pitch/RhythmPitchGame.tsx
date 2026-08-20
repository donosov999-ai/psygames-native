/* psygames-rhythm-pitch-module · VER 2 · 20.08.2026 */
/**
 * МОДУЛЬ ИГРЫ «РИТМ И ВЫСОТА» — привезён из лаборатории как есть.
 *
 * Источник: `~/dev/psygames-game-lab`, ветка `codex/game-rhythm-pitch`,
 * коммит 4add8d08, файл `src/ui/RhythmPitchGame.tsx`. Правки при переносе — две,
 * обе перечислены здесь, чтобы следующий синк с лабораторией не гадал:
 *   1) пути импортов (`../core` → `./core`, `../audio` → `./audio`);
 *   2) цвет текста на цветной кнопке считается, а не берётся из фона экрана —
 *      см. комментарий в ActionButton.
 *
 * Всё остальное — ядро, словарь ru/en, состояния раунда — не тронуто. Стыковка с
 * приложением (звук, часы, уровни, итог) живёт снаружи: `app/games/rhythm-pitch.tsx`
 * и `appAudio.ts`.
 */
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
  appendPitchLevel,
  completeAudioRoundPlayback,
  completeCalibrationPlayback,
  continueAfterCalibration,
  createRhythmPitchSession,
  disposeRhythmPitchSession,
  getPitchDirectionLabel,
  getPitchLevelLabel,
  getRhythmPitchModeLabel,
  getRhythmPitchStrings,
  interpolateRhythmPitch,
  markAudioUnavailable,
  pauseRhythmPitchSession,
  recordCalibrationTap,
  recordRhythmTap,
  removeLastPitchLevel,
  replayTutorialAudio,
  restartRhythmPitchSession,
  resumeRhythmPitchSession,
  selectPitchDirection,
  setCalibrationVolume,
  startAudioRoundPlayback,
  startCalibrationPlayback,
  startRhythmPitchRound,
  submitPitchSequence,
  submitRhythmResponse,
  type PitchDirection,
  type RhythmPitchLocale,
  type RhythmPitchMetrics,
  type RhythmPitchMode,
  type RhythmPitchSession,
} from './core/index';
import {
  createWebToneAudioEngine,
  type ToneAudioEngine,
} from './audio/ToneAudioEngine';
import { onGradientText } from '@/src/services/onGradientText';

export interface RhythmPitchTheme {
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

export interface RhythmPitchGameProps {
  seed: string;
  level: number;
  mode?: RhythmPitchMode;
  locale: RhythmPitchLocale;
  theme: RhythmPitchTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  showOwnResults?: boolean;
  audioEngine?: ToneAudioEngine | null;
  now?: () => number;
  onComplete?: (result: RhythmPitchMetrics) => void;
  /**
   * Есть ли ПРЯМО СЕЙЧАС что терять — см. `hasSomethingToLose` ниже. Экран
   * держит этот флаг и отдаёт каркасу: вопрос при выходе задаётся только там,
   * где партия уже что-то накопила.
   */
  onProgress?: (armed: boolean) => void;
  /**
   * Своя кнопка «Выход» (правила, экран «звук недоступен», свой итог).
   * НЕОБЯЗАТЕЛЬНА, и это принципиально: когда модуль стоит внутри `GameShell`,
   * выход из партии один — «назад» в шапке каркаса, и он проходит через вопрос
   * «партия пропадёт». Вторая кнопка рядом уводила бы МИМО вопроса.
   */
  onExit?: () => void;
}

/**
 * 🔴 ЕСТЬ ЛИ ЧТО ТЕРЯТЬ ПРИ ВЫХОДЕ.
 *
 * Дороже всего здесь ПОДСТРОЙКА ЗАДЕРЖКИ: человек отстукивает метроном, и из
 * этих ударов считается поправка, по которой потом судят весь ритм. Потерять её
 * — потерять минуту и начать с того же места. Поэтому флаг встаёт с первого
 * удара подстройки, а дальше держится всем, что уже прозвучало или отвечено.
 *
 * `ready` без единого удара не считается: там ещё ничего не сыграно, а зерно
 * фиксировано уровнем — повторный вход даст то же задание.
 */
export function hasSomethingToLose(session: RhythmPitchSession): boolean {
  const active = session.phase === 'paused' ? session.pausedFrom : session.phase;
  if (active !== 'calibration' && active !== 'ready' && active !== 'playback' && active !== 'response') return false;
  return active === 'playback'
    || active === 'response'
    || session.calibrationComplete
    || session.calibrationTaps.length > 0
    || session.rhythmTaps.length > 0
    || session.pitchDirectionResponse !== null
    || session.pitchSequenceResponse.length > 0;
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function ActionButton({
  label,
  onPress,
  theme,
  secondary = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  theme: RhythmPitchTheme;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  /**
   * Цвет подписи на цветной кнопке СЧИТАЕТСЯ, а не берётся из фона экрана.
   * В лаборатории здесь стоял `theme.background` в расчёте на светлую палитру;
   * у нас есть тёмные профили, и на фиолетовой кнопке чёрная подпись давала
   * контраст 3.6 при норме AA 4.5. `onGradientText` — та же арифметика WCAG, что
   * и во всём приложении; для сплошного цвета вуаль не нужна, хватает выбора
   * светлого или тёмного тона.
   */
  const onPrimary = React.useMemo(() => onGradientText(theme.primary, theme.primary).color, [theme.primary]);
  const webFocusProps = Platform.OS === 'web' ? ({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};
  return (
    <Pressable
      {...webFocusProps}
      testID={testID}
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
      <Text style={[styles.actionText, { color: secondary ? theme.text : onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function ChoiceButton({
  label,
  glyph,
  onPress,
  theme,
  disabled = false,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  theme: RhythmPitchTheme;
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
        styles.choiceButton,
        { backgroundColor: theme.surface, borderColor: theme.border },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
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

function metricPercent(value: number | null): string {
  return value === null ? '—' : Math.round(value * 100) + '%';
}

function RhythmPitchSessionView({
  seed,
  level,
  mode,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  showOwnResults = true,
  audioEngine,
  now = monotonicNow,
  onComplete,
  onProgress,
  onExit,
}: RhythmPitchGameProps) {
  const strings = getRhythmPitchStrings(locale);
  const [session, setSession] = React.useState(() => createRhythmPitchSession({ seed, level, mode }));
  const sessionRef = React.useRef(session);
  const completionReported = React.useRef(false);
  const audioGeneration = React.useRef(0);
  const [{ engine, owned }] = React.useState<{ engine: ToneAudioEngine | null; owned: boolean }>(() => {
    if (audioEngine !== undefined) {
      return { engine: audioEngine, owned: false };
    }
    if (Platform.OS === 'web') {
      return { engine: createWebToneAudioEngine(), owned: true };
    }
    return { engine: null, owned: false };
  });

  const applySession = React.useCallback((update: (current: RhythmPitchSession) => RhythmPitchSession) => {
    setSession((current) => {
      const next = update(current);
      sessionRef.current = next;
      return next;
    });
  }, []);

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * Наверх уходит ГОТОВЫЙ ОТВЕТ «есть что терять», а не сама партия: экрану
   * незачем разбирать фазы модуля, а модулю — знать про каркас. Зависимость —
   * булево, а не `session`: иначе setState экрана дёргался бы на каждый удар.
   */
  const armed = hasSomethingToLose(session);
  React.useEffect(() => { onProgress?.(armed); }, [armed, onProgress]);

  const stopAndPause = React.useCallback(() => {
    audioGeneration.current += 1;
    void engine?.stop();
    applySession((current) => pauseRhythmPitchSession(current, now()));
  }, [applySession, engine, now]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        audioGeneration.current += 1;
        void engine?.suspend();
        applySession((current) => pauseRhythmPitchSession(current, now()));
      }
    });
    return () => subscription.remove();
  }, [applySession, engine, now]);

  React.useEffect(() => {
    if (session.phase === 'result' && session.result && !completionReported.current) {
      completionReported.current = true;
      onComplete?.(session.result);
    }
  }, [onComplete, session.phase, session.result]);

  React.useEffect(() => () => {
    audioGeneration.current += 1;
    sessionRef.current = disposeRhythmPitchSession(sessionRef.current);
    if (owned) void engine?.dispose();
    else void engine?.stop();
  }, [engine, owned]);

  const failAudio = React.useCallback((error?: unknown) => {
    const message = error instanceof Error && error.message
      ? error.message
      : strings.unavailableBody;
    applySession((current) => markAudioUnavailable(current, message));
  }, [applySession, strings.unavailableBody]);

  const restart = React.useCallback(() => {
    audioGeneration.current += 1;
    void engine?.stop();
    completionReported.current = false;
    applySession((current) => restartRhythmPitchSession(current, now()));
  }, [applySession, engine, now]);

  const begin = () => {
    const next = startRhythmPitchRound(sessionRef.current, now());
    sessionRef.current = next;
    setSession(next);
    if (!engine?.available) failAudio();
  };

  const runCalibration = () => {
    const generation = ++audioGeneration.current;
    void (async () => {
      try {
        if (!engine) throw new Error(strings.unavailableBody);
        const plan = await engine.playCalibration(sessionRef.current.volume);
        if (generation !== audioGeneration.current) return;
        applySession((current) => startCalibrationPlayback(current, plan.expectedTimesMs));
        await plan.completed;
        if (generation !== audioGeneration.current) return;
        applySession(completeCalibrationPlayback);
      } catch (error) {
        if (generation === audioGeneration.current) failAudio(error);
      }
    })();
  };

  const playPreparedSession = React.useCallback((prepared: RhythmPitchSession) => {
    const generation = ++audioGeneration.current;
    sessionRef.current = prepared;
    setSession(prepared);
    void (async () => {
      try {
        if (!engine) throw new Error(strings.unavailableBody);
        const plan = await engine.playRound(prepared.round, prepared.volume);
        await plan.completed;
        if (generation !== audioGeneration.current) return;
        applySession((current) => completeAudioRoundPlayback(current, now()));
      } catch (error) {
        if (generation === audioGeneration.current) failAudio(error);
      }
    })();
  }, [applySession, engine, failAudio, now, strings.unavailableBody]);

  const playRound = () => {
    const prepared = startAudioRoundPlayback(sessionRef.current);
    if (prepared === sessionRef.current) return;
    playPreparedSession(prepared);
  };

  const replay = () => {
    const prepared = replayTutorialAudio(sessionRef.current);
    if (prepared === sessionRef.current) return;
    playPreparedSession(prepared);
  };

  const resume = () => {
    void (async () => {
      try {
        await engine?.initialize();
        applySession((current) => resumeRhythmPitchSession(current, now()));
      } catch (error) {
        failAudio(error);
      }
    })();
  };

  const retryAudio = () => {
    void (async () => {
      try {
        if (!engine) throw new Error(strings.unavailableBody);
        await engine.initialize();
        completionReported.current = false;
        applySession((current) => restartRhythmPitchSession(current, now()));
      } catch (error) {
        failAudio(error);
      }
    })();
  };

  const chooseDirection = (direction: PitchDirection) => {
    applySession((current) => selectPitchDirection(current, direction, now()));
  };

  const webKeyboardProps = Platform.OS === 'web' ? ({
    tabIndex: 0,
    onKeyDown: (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      if (key === 'p' || key === 'P') {
        event.preventDefault?.();
        if (sessionRef.current.phase === 'paused') resume();
        else stopAndPause();
        return;
      }
      if (key === 'r' || key === 'R') {
        event.preventDefault?.();
        restart();
        return;
      }
      if ((key === ' ' || key === 't' || key === 'T')
        && sessionRef.current.phase === 'response'
        && sessionRef.current.round.mode === 'rhythm-echo') {
        event.preventDefault?.();
        applySession((current) => recordRhythmTap(current, now()));
        return;
      }
      if (sessionRef.current.phase !== 'response' || sessionRef.current.round.mode !== 'pitch-path') return;
      if (sessionRef.current.round.task === 'direction' && (key === 'ArrowUp' || key === 'ArrowDown')) {
        event.preventDefault?.();
        chooseDirection(key === 'ArrowUp' ? 'higher' : 'lower');
        return;
      }
      if (sessionRef.current.round.task === 'sequence' && ['1', '2', '3'].includes(key)) {
        event.preventDefault?.();
        applySession((current) => appendPitchLevel(current, Number(key) - 1));
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
          <Text style={[styles.ruleLine, { color: theme.text }]}>{strings.rhythmRule}</Text>
          <Text style={[styles.ruleLine, { color: theme.text }]}>{strings.pitchRule}</Text>
          <Text style={[styles.privacy, { color: theme.primary }]}>{strings.privacy}</Text>
          <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
        </View>
        <View style={styles.actions}>
          <ActionButton label={strings.start} theme={theme} onPress={begin} />
          {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
        </View>
      </ScrollView>
    );
  }

  if (session.phase === 'unavailable') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.error }]}>{strings.unavailableTitle}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.unavailableBody}</Text>
          <Text style={[styles.errorDetail, { color: theme.textSecondary }]}>{session.audioError}</Text>
          <ActionButton label={strings.retry} theme={theme} onPress={retryAudio} />
          {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
        </View>
      </View>
    );
  }

  if (session.phase === 'paused') {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.pause}</Text>
          <ActionButton label={strings.resume} theme={theme} onPress={resume} />
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
          <Text style={[styles.heroSkill, { color: gameGradientText }]}>{getRhythmPitchModeLabel(locale, result.specific.mode)} · {strings.noAutoAdvance}</Text>
        </View>
        <View style={[styles.card, styles.metrics, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: theme.text }]}>{metricPercent(result.accuracy)}</Text>
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.accuracy}</Text>
          </View>
          {result.specific.mode === 'rhythm-echo' ? (
            <>
              <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{metricPercent(result.specific.timingAccuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.timingAccuracy}</Text></View>
              <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{result.specific.meanTimingErrorMs ?? '—'} ms</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.meanTimingError}</Text></View>
              <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{result.specific.missingTaps}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.missingTaps}</Text></View>
              <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{result.specific.extraTaps}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.extraTaps}</Text></View>
            </>
          ) : (
            <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{metricPercent(result.specific.pitchAccuracy)}</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.pitchAccuracy}</Text></View>
          )}
          <View style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{(result.durationMs / 1_000).toFixed(1)}s</Text><Text style={[styles.metricLabel, { color: theme.textSecondary }]}>{strings.duration}</Text></View>
        </View>
        <Text style={[styles.seed, { color: theme.textSecondary }]}>{strings.seed}: {result.seed}</Text>
        <ActionButton label={strings.playAgain} theme={theme} onPress={restart} />
        {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
      </ScrollView>
    );
  }

  if (session.phase === 'calibration') {
    return (
      <ScrollView
        {...webKeyboardProps}
        style={[styles.root, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.gameContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>{strings.calibrationTitle}</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.calibrationBody}</Text>
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.volumeValue, { color: theme.text }]}>{interpolateRhythmPitch(strings.volume, { value: Math.round(session.volume * 100) })}</Text>
          <View style={styles.choiceRow}>
            <ActionButton label={strings.quieter} theme={theme} secondary disabled={session.calibrationPlaying} onPress={() => applySession((current) => setCalibrationVolume(current, current.volume - 0.1))} />
            <ActionButton label={strings.louder} theme={theme} secondary disabled={session.calibrationPlaying} onPress={() => applySession((current) => setCalibrationVolume(current, current.volume + 0.1))} />
          </View>
          {!session.calibrationPlaying ? (
            <ActionButton label={strings.playCalibration} theme={theme} onPress={runCalibration} />
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" style={[styles.listening, { color: theme.primary }]}>{strings.calibrationPlaying}</Text>
              <ActionButton label={strings.calibrationTap} theme={theme} onPress={() => applySession((current) => recordCalibrationTap(current, now()))} />
            </>
          )}
          {session.calibrationComplete ? (
            <View style={styles.calibrationResult}>
              <Text style={[styles.body, { color: theme.text }]}>{interpolateRhythmPitch(strings.calibrationReady, { samples: session.calibrationSamples })}</Text>
              <Text style={[styles.body, { color: theme.textSecondary }]}>{interpolateRhythmPitch(strings.offset, { value: session.calibrationOffsetMs })}</Text>
              <ActionButton label={strings.continue} theme={theme} onPress={() => applySession(continueAfterCalibration)} />
            </View>
          ) : null}
          {!session.calibrationPlaying
            && session.calibrationExpectedTimes.length > 0
            && !session.calibrationComplete ? (
              <Text accessibilityLiveRegion="polite" style={[styles.body, { color: theme.warning }]}>
                {strings.calibrationNeedTaps}
              </Text>
            ) : null}
        </View>
        <ActionButton label={strings.pause} theme={theme} secondary onPress={stopAndPause} />
      </ScrollView>
    );
  }

  if (session.phase === 'ready') {
    return (
      <View {...webKeyboardProps} style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{strings.readyTitle}</Text>
          <Text style={[styles.modeBadge, { color: theme.primary }]}>{getRhythmPitchModeLabel(locale, session.round.mode)}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {session.round.mode === 'rhythm-echo' ? strings.readyBodyRhythm : strings.readyBodyPitch}
          </Text>
          <ActionButton label={strings.play} theme={theme} onPress={playRound} />
          <ActionButton label={strings.pause} theme={theme} secondary onPress={stopAndPause} />
        </View>
      </View>
    );
  }

  if (session.phase === 'playback') {
    return (
      <View {...webKeyboardProps} style={[styles.root, styles.centered, { backgroundColor: theme.background }]}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={strings.listening}
          style={[styles.listeningCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Text style={[styles.speaker, { color: theme.primary }]}>◉</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.sectionTitle, { color: theme.text }]}>{strings.listening}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.noVisualAnswer}</Text>
        </View>
        <ActionButton label={strings.pause} theme={theme} secondary onPress={stopAndPause} />
      </View>
    );
  }

  const round = session.round;
  return (
    <ScrollView
      {...webKeyboardProps}
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.gameContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.gameHeader}>
        <View>
          <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>
            {round.mode === 'rhythm-echo' ? strings.rhythmPrompt : round.task === 'direction' ? strings.pitchDirectionPrompt : strings.pitchSequencePrompt}
          </Text>
          <Text style={[styles.modeBadge, { color: theme.primary }]}>{getRhythmPitchModeLabel(locale, round.mode)}</Text>
        </View>
        <ActionButton label={strings.pause} theme={theme} secondary onPress={stopAndPause} />
      </View>

      {round.mode === 'rhythm-echo' ? (
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ActionButton label={strings.rhythmTap} theme={theme} onPress={() => applySession((current) => recordRhythmTap(current, now()))} />
          <Text style={[styles.progress, { color: theme.textSecondary }]}>{interpolateRhythmPitch(strings.tapsProgress, { current: session.rhythmTaps.length, total: round.beatCount })}</Text>
          <ActionButton label={strings.submit} theme={theme} secondary onPress={() => applySession((current) => submitRhythmResponse(current, now()))} />
        </View>
      ) : round.task === 'direction' ? (
        <View style={styles.choiceRow}>
          <ChoiceButton label={getPitchDirectionLabel(locale, 'lower')} glyph="↓" theme={theme} onPress={() => chooseDirection('lower')} />
          <ChoiceButton label={getPitchDirectionLabel(locale, 'higher')} glyph="↑" theme={theme} onPress={() => chooseDirection('higher')} />
        </View>
      ) : (
        <View style={[styles.card, styles.centerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.choiceRow}>
            <ChoiceButton label={getPitchLevelLabel(locale, 'low')} glyph="1" theme={theme} onPress={() => applySession((current) => appendPitchLevel(current, 0))} />
            <ChoiceButton label={getPitchLevelLabel(locale, 'mid')} glyph="2" theme={theme} onPress={() => applySession((current) => appendPitchLevel(current, 1))} />
            <ChoiceButton label={getPitchLevelLabel(locale, 'high')} glyph="3" theme={theme} onPress={() => applySession((current) => appendPitchLevel(current, 2))} />
          </View>
          <Text style={[styles.progress, { color: theme.textSecondary }]}>{interpolateRhythmPitch(strings.sequenceProgress, { current: session.pitchSequenceResponse.length, total: round.toneCount })}</Text>
          <View style={styles.choiceRow}>
            <ActionButton label={strings.undo} theme={theme} secondary disabled={session.pitchSequenceResponse.length === 0} onPress={() => applySession(removeLastPitchLevel)} />
            <ActionButton label={strings.submit} theme={theme} disabled={session.pitchSequenceResponse.length !== round.toneCount} onPress={() => applySession((current) => submitPitchSequence(current, now()))} />
          </View>
        </View>
      )}

      {round.tutorialReplay ? (
        <ActionButton label={strings.replay} theme={theme} secondary onPress={replay} />
      ) : (
        <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.replayTutorialOnly}</Text>
      )}
      <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
    </ScrollView>
  );
}

export function RhythmPitchGame(props: RhythmPitchGameProps) {
  const identity = props.seed + '|' + props.level + '|' + (props.mode ?? 'auto');
  return <RhythmPitchSessionView key={identity} {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, gap: 16 },
  gameContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, gap: 18, flexGrow: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  hero: { borderRadius: 24, padding: 24, gap: 8 },
  heroTitle: { fontSize: 32, fontWeight: '800' },
  heroSkill: { fontSize: 16, lineHeight: 23 },
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
  centerCard: { width: '100%', maxWidth: 620, alignItems: 'center' },
  sectionTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  gameTitle: { fontSize: 25, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  ruleLine: { fontSize: 16, lineHeight: 23 },
  privacy: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  keyboardHelp: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  actions: { gap: 12 },
  actionButton: { minWidth: 48, minHeight: 48, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  choiceRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  choiceButton: { minWidth: 96, minHeight: 72, borderWidth: 1, borderRadius: 16, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 4, flexGrow: 1, flexBasis: 96 },
  choiceGlyph: { fontSize: 28, fontWeight: '800' },
  choiceLabel: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.42 },
  volumeValue: { fontSize: 20, fontWeight: '800' },
  listening: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  calibrationResult: { width: '100%', alignItems: 'center', gap: 10 },
  gameHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  modeBadge: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  listeningCard: { width: '100%', maxWidth: 520, borderWidth: 1, borderRadius: 28, padding: 32, alignItems: 'center', gap: 16 },
  speaker: { fontSize: 74, lineHeight: 84 },
  progress: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  metric: { minWidth: 125, flexGrow: 1, alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricLabel: { fontSize: 13, textAlign: 'center' },
  seed: { fontSize: 12, textAlign: 'center' },
  errorDetail: { fontSize: 12, textAlign: 'center' },
});
