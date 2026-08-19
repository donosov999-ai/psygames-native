/* psygames-object-tracker-game · VER 1 · 19.08.2026 */
/**
 * «Трекер объектов» — игровое поле. Адаптер поверх чистого ядра из `core/`.
 *
 * ПРОИСХОЖДЕНИЕ. Модуль G5/8 собран psygames-codex-mac в лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-object-tracker`, коммит 8bd59ad,
 * база — d203a4a). Ядро в `core/` перенесено ОДИН В ОДИН, чтобы следующий перенос
 * из лаборатории был сравнением, а не разбором. Переписан только этот адаптер —
 * ниже перечислено, что именно изменено и почему.
 *
 * ЧТО ИЗМЕНЕНО ПРОТИВ ЛАБОРАТОРНОГО `src/ui/ObjectTrackerGame.tsx`:
 *
 * 1. 🔴 УБРАН СВОЙ ОПРОС «МЕНЬШЕ ДВИЖЕНИЯ». Лабораторный адаптер звал
 *    `AccessibilityInfo.isReduceMotionEnabled()`. В react-native-web этот метод БЕЗ
 *    DOM отвечает `true` — а DOM'а нет ровно там, где Expo пререндерит страницы на
 *    сборке. Щадящий режим молча включился бы всем подряд. В приложении настройку
 *    читает один хук `src/hooks/useReducedMotion.ts`, и гейт reduced-motion
 *    запрещает читать её мимо него. Поэтому здесь режим — ОБЯЗАТЕЛЬНЫЙ проп.
 *
 * 2. 🔴 УБРАНЫ СВОИ ЭКРАНЫ ПРАВИЛ, ПАУЗЫ И ИТОГА. Правила живут на экране
 *    настройки приложения (там же тропинка уровней), итог — только в LevelCleared:
 *    свой экран поздравления = выпадение из звёзд, серии чистых и глаз-разрядки,
 *    это гейт `game-standard` отбивает. Пауза общая на всё приложение
 *    (`services/gamePause`), своя была бы вторым механизмом рядом с ним.
 *    Мёртвых веток при этом не остаётся: убраны, а не спрятаны за флагом.
 *
 * 3. 🔴 ЧАСЫ ПРИХОДЯТ ПРОПОМ `now`, И ЭКРАН ОБЯЗАН ПОДАТЬ СЮДА `gameNow`.
 *    Лабораторный адаптер брал `Date.now` по умолчанию. Умолчания здесь нет
 *    намеренно: часы выбирает экран, и гейт `game-clock-discipline` смотрит
 *    именно в `app/games/*` — спрятанный внутрь модуля импорт он бы не увидел.
 *    ⚠️ Длительность партии — не единственный конец: мир двигают дельты кадров,
 *    и их гасит пауза в `useTrackerLoop`. Одной подмены часов тут мало.
 *
 * 4. РАЗМЕР ПОЛЯ СЧИТАЕТСЯ ОТ `useScreenWidth()`, а не меряется `onLayout`.
 *    Лабораторная версия до первого `onLayout` рисовала ПУСТОЕ поле (`fieldSize > 0
 *    ? ... : null`) — на вебе это лишний кадр пустоты, а на медленном первом кадре
 *    и дольше. Хук отдаёт правдоподобную ширину сразу; голый
 *    `useWindowDimensions()` брать нельзя — на первом кадре он отдаёт 0.
 *
 * 5. Строка уровня переведена (ключ `levelLine`), клавиатура — через общий
 *    `useGameKeyboard`, а не свой `onKeyDown` на ScrollView.
 */
import React from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameKeyboard } from '@/src/hooks/useGameKeyboard';
import { holdGame } from '@/src/services/gamePause';
import {
  advanceTrackerMovement,
  configureObjectTrackerReducedMotion,
  createObjectTrackerSession,
  disposeObjectTrackerSession,
  getObjectTrackerStrings,
  interpolateObjectTracker,
  restartObjectTrackerSession,
  startObjectTrackerRound,
  startTrackerMovement,
  submitTrackerSelection,
  toggleTrackedObject,
  type ObjectTrackerLocale,
  type ObjectTrackerMetrics,
  type ObjectTrackerSession,
  type TrackerObjectState,
} from './core/index';
import { useTrackerLoop } from './useTrackerLoop';

/**
 * 🔴 ЩАДЯЩИЙ РЕЖИМ: ШАГ 250 мс, И ЭТО НЕ КРУГЛОЕ ЧИСЛО «ДЛЯ КРАСОТЫ».
 *
 * Игра целиком про движение — выключить его нельзя, это и есть упражнение.
 * Отказаться показывать игру («включите анимации») тоже нельзя: человек с
 * вестибулярной чувствительностью тогда просто не имеет доступа к тренажёру.
 * Поэтому движение остаётся, но становится УПРАВЛЯЕМЫМ: мир стоит, пока человек
 * сам не нажмёт «Следующий шаг». Никакого потока, никакой неожиданности,
 * прервать можно в любой момент — ровно то, чего требует WCAG 2.3.3.
 *
 * Размер шага задан не удобством, а СМЫСЛОМ ЗАДАЧИ. Объекты можно опознать после
 * скачка, только если каждый сместился меньше, чем на свой радиус: иначе ближайшим
 * к прежнему месту цели окажется СОСЕД, и упражнение из слежения превращается в
 * лотерею. Радиус 0.068 поля, потолок скорости с учётом схождения к центру —
 * 0.205 × 1.3 = 0.2665 поля в секунду. 0.068 / 0.2665 ≈ 255 мс. Отсюда 250.
 *
 * ЦЕНА, КОТОРУЮ МЫ ПЛАТИМ ОСОЗНАННО: на 41-м уровне движение длится 7.3 с, то есть
 * 30 нажатий за раунд. Это утомительно, и увеличить шаг вдвое было соблазнительно —
 * но это ровно тот размен, где стало бы «быстрее и бессмысленнее». Уменьшать длину
 * раунда в щадящем режиме тоже нельзя: тогда уровень засчитывался бы за меньшую
 * нагрузку, чем всем остальным.
 */
export const REDUCED_STEP_MS = 250;

export interface ObjectTrackerTheme {
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

export interface ObjectTrackerGameProps {
  seed: string;
  level: number;
  locale: ObjectTrackerLocale;
  /** Только из `useReducedMotion()`. Свой опрос системы здесь запрещён — см. шапку. */
  reducedMotion: boolean;
  /** Ширина экрана из `useScreenWidth()` — голый `useWindowDimensions()` на первом кадре отдаёт 0. */
  screenWidth: number;
  /** Игровые часы. Только `gameNow` из `services/gamePause` — см. п. 3 в шапке. */
  now: () => number;
  theme: ObjectTrackerTheme;
  gameGradient: readonly [string, string];
  onComplete: (result: ObjectTrackerMetrics) => void;
  onExit: () => void;
}

/** Поле квадратное. 640 — потолок для десктопа, чтобы объекты не разъезжались по монитору. */
const FIELD_MAX = 640;
const FIELD_PAD = 8;

function ActionButton({
  label,
  onPress,
  theme,
  secondary = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  theme: ObjectTrackerTheme;
  secondary?: boolean;
  disabled?: boolean;
  /** Узкая кнопка в шапке: 48 pt по высоте остаются, ширину не занимаем. */
  compact?: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  // Видимый фокус нужен только там, где есть клавиатура; на телефоне событий нет.
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
        compact && styles.actionCompact,
        secondary
          ? { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }
          : { backgroundColor: theme.primary },
        pressed && styles.pressed,
        disabled && styles.disabled,
        focused && ({
          outlineColor: theme.warning, outlineStyle: 'solid', outlineWidth: 3, outlineOffset: 3,
        } as any),
      ]}
    >
      <Text style={[styles.actionText, { color: secondary ? theme.text : theme.background }]}>{label}</Text>
    </Pressable>
  );
}

function TrackerObject({
  object,
  index,
  fieldSize,
  radius,
  previewTarget,
  selected,
  selectable,
  locale,
  theme,
  gameGradient,
  onPress,
}: {
  object: TrackerObjectState;
  index: number;
  fieldSize: number;
  radius: number;
  previewTarget: boolean;
  selected: boolean;
  selectable: boolean;
  locale: ObjectTrackerLocale;
  theme: ObjectTrackerTheme;
  gameGradient: readonly [string, string];
  onPress: () => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const strings = getObjectTrackerStrings(locale);
  /**
   * Физический радиус 0.068 при поле 359 px (телефон 375) даёт 48.8 px — норму
   * Material для того, по чему стучат всю партию. На поле уже 355 px нижняя
   * граница 48 начинает работать: кружок рисуется крупнее своей физики и объекты
   * визуально притираются друг к другу. Промах пальцем при этом дороже, чем
   * потерянная точность картинки, поэтому выбран именно такой размен.
   */
  const diameter = Math.max(48, fieldSize * radius * 2);
  const left = Math.min(fieldSize - diameter, Math.max(0, object.x * fieldSize - diameter / 2));
  const top = Math.min(fieldSize - diameter, Math.max(0, object.y * fieldSize - diameter / 2));
  const labelTemplate = previewTarget
    ? strings.targetPreviewLabel
    : selected
      ? strings.selectedLabel
      : strings.objectLabel;
  const label = interpolateObjectTracker(labelTemplate, { index: index + 1 });
  const webFocusProps = Platform.OS === 'web' ? ({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};

  return (
    <Pressable
      {...webFocusProps}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !selectable, selected }}
      disabled={!selectable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.trackerObject,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          left,
          top,
          backgroundColor: gameGradient[0],
          // Кольцо цели живёт ТОЛЬКО в показе и в выборе. В движении все объекты
          // обязаны быть неразличимы — иначе следить не за чем.
          borderColor: previewTarget || selected ? theme.primary : gameGradient[1],
          borderWidth: previewTarget || selected ? 5 : 2,
        },
        pressed && selectable && styles.objectPressed,
        focused && selectable && ({
          outlineColor: theme.warning, outlineStyle: 'solid', outlineWidth: 3, outlineOffset: 2,
        } as any),
      ]}
    />
  );
}

/** Строка «что делать прямо сейчас» — она же заголовок фазы. */
function phaseTitle(session: ObjectTrackerSession, locale: ObjectTrackerLocale): string {
  const strings = getObjectTrackerStrings(locale);
  if (session.phase === 'preview') return strings.preview;
  if (session.phase === 'moving') return strings.moving;
  return strings.selection;
}

function ObjectTrackerRound({
  seed,
  level,
  locale,
  reducedMotion,
  screenWidth,
  now,
  theme,
  gameGradient,
  onComplete,
  onExit,
}: ObjectTrackerGameProps) {
  const strings = getObjectTrackerStrings(locale);
  /**
   * Раунд начинается сразу с показа целей: экран настройки приложения уже
   * рассказал правила и уже спросил «Начать». Второй экран правил внутри модуля
   * был бы вторым «Начать» подряд — и лишним тапом в шаге зарядки.
   */
  const nowRef = React.useRef(now);
  React.useEffect(() => { nowRef.current = now; }, [now]);
  const [session, setSession] = React.useState(() => startObjectTrackerRound(
    createObjectTrackerSession({ seed, level, reducedMotion }),
    now(),
  ));
  const sessionRef = React.useRef(session);
  const completionReported = React.useRef(false);
  // Ref обновляем эффектом, а не записью в рендере: React запрещает трогать ref
  // во время отрисовки, и на этом уже спотыкалась фрактальная судоку.
  React.useEffect(() => { sessionRef.current = session; }, [session]);

  // Системный тумблер могли передвинуть посреди раунда — переключаемся на шаги,
  // не теряя партию. Пересоздавать сессию по смене режима нельзя: это отняло бы
  // у человека уже пройденную половину раунда.
  React.useEffect(() => {
    setSession((current) => configureObjectTrackerReducedMotion(current, reducedMotion));
  }, [reducedMotion]);

  /**
   * Свернули приложение — держим ОБЩУЮ паузу, а не заводим свою. Тогда замирают
   * оба конца сразу: кадровый цикл (через `useTrackerLoop`) и игровые часы,
   * которыми меряется длительность партии.
   */
  React.useEffect(() => {
    let release: (() => void) | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { if (!release) release = holdGame(); }
      else { release?.(); release = null; }
    });
    return () => { sub.remove(); release?.(); release = null; };
  }, []);

  React.useEffect(() => {
    if (session.phase === 'result' && session.result && !completionReported.current) {
      completionReported.current = true;
      onComplete(session.result);
    }
  }, [onComplete, session.phase, session.result]);

  // Уходим с экрана — состояние сессии гасим явно, чтобы отложенный кадр не
  // дописал мир уже мёртвой партии.
  React.useEffect(() => () => {
    sessionRef.current = disposeObjectTrackerSession(sessionRef.current);
  }, []);

  const held = useTrackerLoop(session, setSession);

  const restart = React.useCallback(() => {
    completionReported.current = false;
    setSession((current) => restartObjectTrackerSession(current, nowRef.current()));
  }, []);

  // Пока держат общую паузу (открыт отзыв или справка), клавиши игре не принадлежат.
  useGameKeyboard(React.useMemo(() => ({ r: restart, R: restart }), [restart]), !held);

  const fieldSize = Math.min(FIELD_MAX, Math.max(240, screenWidth - FIELD_PAD * 2));
  const targetIds = React.useMemo(() => new Set(session.round.targetIds), [session.round.targetIds]);
  const selectedIds = React.useMemo(() => new Set(session.selectedIds), [session.selectedIds]);

  const totalSteps = Math.ceil(session.round.durationMs / REDUCED_STEP_MS);
  const doneSteps = Math.round(session.world.timeMs / REDUCED_STEP_MS);
  const progress = session.config.reducedMotion
    ? interpolateObjectTracker(strings.stepProgress, { current: doneSteps, total: totalSteps })
    : interpolateObjectTracker(strings.motionProgress, {
      current: (session.world.timeMs / 1_000).toFixed(1),
      total: (session.round.durationMs / 1_000).toFixed(1),
    });
  const selectionProgress = interpolateObjectTracker(strings.selectProgress, {
    selected: session.selectedIds.length,
    total: session.round.targetCount,
  });

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {phaseTitle(session, locale)}
          </Text>
          <Text style={[styles.levelLine, { color: theme.textSecondary }]}>
            {interpolateObjectTracker(strings.levelLine, {
              level: session.round.level,
              objects: session.round.objectCount,
              targets: session.round.targetCount,
            })}
          </Text>
        </View>
        <ActionButton label={strings.exit} theme={theme} secondary compact onPress={onExit} />
      </View>

      <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: theme.textSecondary }]}>
        {session.phase === 'selection' ? selectionProgress : progress}
      </Text>

      <View
        style={[styles.field, {
          width: fieldSize,
          height: fieldSize,
          backgroundColor: theme.surface,
          borderColor: theme.border,
        }]}
      >
        {session.world.objects.map((object, index) => (
          <TrackerObject
            key={object.id}
            object={object}
            index={index}
            fieldSize={fieldSize}
            radius={session.round.objectRadius}
            previewTarget={session.phase === 'preview' && targetIds.has(object.id)}
            selected={session.phase === 'selection' && selectedIds.has(object.id)}
            selectable={session.phase === 'selection'}
            locale={locale}
            theme={theme}
            gameGradient={gameGradient}
            onPress={() => setSession((current) => toggleTrackedObject(current, object.id))}
          />
        ))}
      </View>

      <View style={styles.actions}>
        {session.phase === 'preview' ? (
          <ActionButton
            label={strings.beginMotion}
            theme={theme}
            onPress={() => setSession(startTrackerMovement)}
          />
        ) : null}
        {session.phase === 'moving' && session.config.reducedMotion ? (
          <ActionButton
            label={strings.stepMotion}
            theme={theme}
            onPress={() => setSession((current) => advanceTrackerMovement(current, REDUCED_STEP_MS))}
          />
        ) : null}
        {session.phase === 'selection' ? (
          <ActionButton
            label={strings.submit}
            theme={theme}
            disabled={session.selectedIds.length !== session.round.targetCount}
            onPress={() => setSession((current) => submitTrackerSelection(current, nowRef.current()))}
          />
        ) : null}
        <ActionButton label={strings.restart} theme={theme} secondary onPress={restart} />
      </View>

      {session.config.reducedMotion ? (
        <Text style={[styles.reducedBadge, { color: theme.primary }]}>{strings.reducedModeBadge}</Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * Смена зерна или уровня — это ДРУГАЯ партия, и её надо начинать с чистого
 * состояния, а не подмешивать в текущее. Ключ делает это без эффекта-синхронизатора.
 * Щадящий режим в ключ НЕ входит намеренно: он меняет способ движения, а не партию.
 */
export default function ObjectTrackerGame(props: ObjectTrackerGameProps) {
  return <ObjectTrackerRound key={`${props.seed}:${props.level}`} {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: FIELD_PAD, gap: 10 },
  header: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleBlock: { flex: 1 },
  title: { fontSize: 23, lineHeight: 28, fontWeight: '900' },
  levelLine: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  progress: { minHeight: 20, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  field: { alignSelf: 'center', borderWidth: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  trackerObject: { position: 'absolute', minWidth: 48, minHeight: 48 },
  objectPressed: { transform: [{ scale: 0.94 }] },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  actionCompact: { minWidth: 96, paddingHorizontal: 12 },
  actionButton: { minWidth: 150, minHeight: 48, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 15, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  reducedBadge: { fontSize: 13, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
});
