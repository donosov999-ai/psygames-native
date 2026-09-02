/* psygames-faces-names-game · VER 2 · 20.08.2026 */
/**
 * ПАРТИЯ «ЛИЦА И ИМЕНА»: изучение → помеха → узнавание → имя → факт.
 *
 * Модуль пришёл из лаборатории (`~/dev/psygames-game-lab`, ветка
 * `codex/game-faces-names`, коммит 3a9e968). Здесь — версия, стыкованная с
 * приложением. Что изменено против лабораторной и почему:
 *
 * 🔴 1. СВОЕГО ЭКРАНА ИТОГА БОЛЬШЕ НЕТ — ВООБЩЕ, А НЕ ПО ФЛАГУ. В лаборатории
 * он был и выключался пропсом `showOwnResults`. Пропс — плохая защита: его
 * достаточно один раз поставить в `true`, и звёзды по уровням, серия чистых
 * прохождений и глаз-разрядка перестанут писаться молча, потому что пишутся они
 * ТОЛЬКО в общем LevelCleared. Ровно так когда-то выпали из бухгалтерии маджонг,
 * сортировка и парные картинки. Поэтому экран удалён, а не спрятан: партия
 * доходит до фазы `result`, отдаёт метрики в `onComplete` и рисует пустоту —
 * дальше распоряжается маршрут.
 *
 * 🔴 2. ЧАСЫ ПРИХОДЯТ СНАРУЖИ И ОБЯЗАТЕЛЬНЫ (`now`). В лаборатории пропс был
 * необязательным с `Date.now` по умолчанию. В приложении время партии обязано
 * идти по `gameNow()`: пока человек пишет отзыв, игра стоит. Необязательный
 * пропс здесь означал бы «забудешь — и никто не заметит», поэтому он требуемый.
 *
 * 3. ПОДПИСЬ ПОЛЯ БОЛЬШЕ НЕ ЗАШИТА. Было `Level {n} · {count}` прямо в разметке —
 * английская строка, которая не переводится ни на один из двенадцати языков.
 * Теперь `strings.levelLine`.
 *
 * 4. ВТОРАЯ СТРОКА ИМЕНИ В ПИСЬМЕННОСТИ ИНТЕРФЕЙСА. Имя одно на все языки
 * (почему — в шапке core/content.ts), но для шести нелатинских локалей под ним
 * показывается запись своими знаками: и на карточке изучения, и на КАЖДОМ
 * варианте ответа. Подсказкой это не является — вторая строка есть у всех
 * вариантов сразу, — а прочитать имя даёт.
 *
 * 5. ЦВЕТ ТЕКСТА НА ГЛАВНОЙ КНОПКЕ ПРИХОДИТ ОТДЕЛЬНЫМ ПОЛЕМ (`onPrimary`).
 * В лаборатории он брался как `theme.background`: на светлой теме это белым по
 * цветной кнопке, а у нас есть тёмные профили, где фон почти чёрный, — вышло бы
 * тёмное по тёмному. Считает его маршрут через onGradientText.
 *
 * ДВИЖЕНИЯ ЗДЕСЬ НЕТ НИ ОДНОГО (ни Animated, ни переходов), поэтому щадящий
 * режим `useReducedMotion` не читается: гасить нечего. Появится анимация —
 * читать обязательно.
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
  advanceFacesNamesStudy,
  answerFacesNamesInterference,
  createFacesNamesSession,
  currentFacesNamesTrial,
  currentInterferencePrompt,
  currentStudiedPerson,
  describeSyntheticFace,
  disposeFacesNamesSession,
  getFacesNamesStrings,
  getFactText,
  interpolateFacesNames,
  nameScript,
  pauseFacesNamesSession,
  personById,
  restartFacesNamesSession,
  resumeFacesNamesSession,
  selectRecalledFact,
  selectRecalledName,
  selectRecognizedFace,
  startFacesNamesRound,
  type FacesNamesLocale,
  type FacesNamesMetrics,
  type FacesNamesSession,
  type SyntheticPerson,
} from './core/index';
import { SyntheticFace } from './SyntheticFace';

export interface FacesNamesTheme {
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  /** 🔴 ЦВЕТ ИГРЫ, а не акцент профиля: им красятся главные кнопки внутри партии. */
  primary: string;
  /** Читаемый текст поверх `primary` — считается снаружи по обоим концам градиента. */
  onPrimary: string;
  border: string;
  success: string;
  error: string;
  warning: string;
}

export interface FacesNamesGameProps {
  seed: string;
  level: number;
  locale: FacesNamesLocale;
  theme: FacesNamesTheme;
  gameGradient: readonly [string, string];
  gameGradientText: string;
  /** Игровые часы (`gameNow`). Обязателен: настенные здесь запрещены. */
  now: () => number;
  onComplete?: (result: FacesNamesMetrics) => void;
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
 * Здесь дороже всего НЕ ответы, а заучивание: человек минуту разглядывает лица
 * и повторяет имена, и это единственное, чего повтором партии не вернуть —
 * набор-то фиксирован уровнем и выпадет тот же. Поэтому флаг встаёт с ПЕРВОГО
 * пройденного знакомства, а не с первого ответа.
 *
 * Экран правил не считается: там ещё ничего не показано.
 */
export function hasSomethingToLose(session: FacesNamesSession): boolean {
  if (session.phase === 'rules' || session.phase === 'result' || session.phase === 'disposed') return false;
  return session.studyIndex > 0 || session.answers.length > 0 || session.interferenceIndex > 0;
}

function ActionButton({
  label,
  onPress,
  theme,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  theme: FacesNamesTheme;
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
      <Text style={[styles.actionText, { color: secondary ? theme.text : theme.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Вариант ответа текстом. `sub` — то же слово в письменности интерфейса; стоит
 * под каждым вариантом, поэтому правильный ничем не выделен.
 */
function TextChoice({
  label,
  sub,
  onPress,
  theme,
}: {
  label: string;
  sub?: string | null;
  onPress: () => void;
  theme: FacesNamesTheme;
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
      accessibilityLabel={sub ? `${label} — ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textChoice,
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
      <Text style={[styles.choiceText, { color: theme.text }]}>{label}</Text>
      {sub ? <Text aria-hidden style={[styles.choiceSub, { color: theme.textSecondary }]}>{sub}</Text> : null}
    </Pressable>
  );
}

function FaceChoice({
  person,
  index,
  locale,
  theme,
  onPress,
}: {
  person: SyntheticPerson;
  index: number;
  locale: FacesNamesLocale;
  theme: FacesNamesTheme;
  onPress: () => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const description = describeSyntheticFace(locale, person.face);
  const webFocusProps = Platform.OS === 'web' ? ({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  } as const) : {};
  return (
    <Pressable
      {...webFocusProps}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.faceChoice,
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
      <SyntheticFace face={person.face} locale={locale} size={126} accessible={false} />
      <Text aria-hidden style={[styles.faceNumber, { color: theme.textSecondary }]}>{index + 1}</Text>
    </Pressable>
  );
}

function activeTitle(session: FacesNamesSession, locale: FacesNamesLocale): string {
  const strings = getFacesNamesStrings(locale);
  if (session.phase === 'study') return strings.study;
  if (session.phase === 'interference') return strings.interference;
  if (session.phase === 'recognition') return strings.recognition;
  if (session.phase === 'name-recall') return strings.nameRecall;
  if (session.phase === 'fact-recall') return strings.factRecall;
  return strings.title;
}

function FacesNamesSessionView({
  seed,
  level,
  locale,
  theme,
  gameGradient,
  gameGradientText,
  now,
  onComplete,
  onProgress,
  onExit,
}: FacesNamesGameProps) {
  const strings = getFacesNamesStrings(locale);
  const [session, setSession] = React.useState(() => createFacesNamesSession({ seed, level }));
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
   * незачем разбирать фазы модуля, а модулю — знать про каркас. Зависимость —
   * булево, а не `session`: иначе setState экрана дёргался бы на каждый ход.
   */
  const armed = hasSomethingToLose(session);
  React.useEffect(() => { onProgress?.(armed); }, [armed, onProgress]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setSession((current) => pauseFacesNamesSession(current, now()));
      }
    });
    return () => subscription.remove();
  }, [now]);

  React.useEffect(() => () => {
    sessionRef.current = disposeFacesNamesSession(sessionRef.current);
  }, []);

  const restart = () => {
    completedRef.current = false;
    setSession((current) => restartFacesNamesSession(current, now()));
  };

  const webKeyboardProps = Platform.OS === 'web' ? ({
    onKeyDown: (event: any) => {
      const key = event.nativeEvent?.key ?? event.key;
      if (key === 'p' || key === 'P') {
        event.preventDefault?.();
        setSession((current) => pauseFacesNamesSession(current, now()));
      }
      if (key === 'r' || key === 'R') {
        event.preventDefault?.();
        restart();
      }
    },
  } as const) : {};

  if (session.phase === 'disposed') return null;

  /**
   * Фаза `result` рисует пустоту: метрики уже уехали в onComplete, а поздравляет
   * человека общий LevelCleared поверх экрана маршрута. См. п. 1 в шапке файла.
   */
  if (session.phase === 'result') return null;

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
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.rulesRecall}</Text>
          <Text style={[styles.privacy, { color: theme.success }]}>{strings.privacy}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{strings.fairness}</Text>
          {Platform.OS === 'web'
            ? <Text style={[styles.keyboardHelp, { color: theme.textSecondary }]}>{strings.keyboardHelp}</Text>
            : null}
        </View>
        <View style={styles.actions}>
          <ActionButton label={strings.start} theme={theme} onPress={() => setSession((current) => startFacesNamesRound(current, now()))} />
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
          <ActionButton label={strings.resume} theme={theme} onPress={() => setSession((current) => resumeFacesNamesSession(current, now()))} />
          <ActionButton label={strings.restart} theme={theme} secondary onPress={restart} />
          {/* Выход посреди партии: без него уйти можно было только системной «назад». */}
          {onExit ? <ActionButton label={strings.exit} theme={theme} secondary onPress={onExit} /> : null}
        </View>
      </View>
    );
  }

  const trial = currentFacesNamesTrial(session);
  const target = trial ? personById(session.puzzle, trial.targetPersonId) : null;
  const studiedPerson = currentStudiedPerson(session);
  const interference = currentInterferencePrompt(session);
  const studiedScript = studiedPerson ? nameScript(locale, studiedPerson.name) : null;

  return (
    <ScrollView
      {...webKeyboardProps}
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.gameContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={[styles.gameTitle, { color: theme.text }]}>{activeTitle(session, locale)}</Text>
          <Text style={[styles.round, { color: theme.textSecondary }]}>
            {interpolateFacesNames(strings.levelLine, {
              level: session.puzzle.level,
              people: session.puzzle.studiedPersonIds.length,
            })}
          </Text>
        </View>
        <ActionButton label={strings.pause} theme={theme} secondary onPress={() => setSession((current) => pauseFacesNamesSession(current, now()))} />
      </View>

      {session.phase === 'study' && studiedPerson ? (
        <View style={[styles.card, styles.studyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.progress, { color: theme.textSecondary }]}>{interpolateFacesNames(strings.studyProgress, { current: session.studyIndex + 1, total: session.puzzle.studiedPersonIds.length })}</Text>
          <SyntheticFace face={studiedPerson.face} locale={locale} size={210} />
          <View style={styles.memoryPair}>
            <Text style={[styles.memoryLabel, { color: theme.textSecondary }]}>{strings.rememberName}</Text>
            <Text accessibilityRole="header" style={[styles.personName, { color: theme.text }]}>{studiedPerson.name}</Text>
            {studiedScript
              ? <Text style={[styles.personNameScript, { color: theme.textSecondary }]}>{studiedScript}</Text>
              : null}
          </View>
          <View style={styles.memoryPair}>
            <Text style={[styles.memoryLabel, { color: theme.textSecondary }]}>{strings.rememberFact}</Text>
            <Text style={[styles.personFact, { color: theme.text }]}>{getFactText(locale, studiedPerson.factId)}</Text>
          </View>
          <ActionButton
            label={session.studyIndex + 1 < session.puzzle.studiedPersonIds.length ? strings.nextPerson : strings.startPause}
            theme={theme}
            onPress={() => setSession(advanceFacesNamesStudy)}
          />
        </View>
      ) : null}

      {session.phase === 'interference' && interference ? (
        <View style={[styles.card, styles.recallCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.progress, { color: theme.textSecondary }]}>{interpolateFacesNames(strings.interferenceProgress, { current: session.interferenceIndex + 1, total: session.puzzle.interferencePrompts.length })}</Text>
          <Text style={[styles.body, styles.centerText, { color: theme.textSecondary }]}>{strings.interferenceBody}</Text>
          <Text accessibilityRole="header" accessibilityLabel={`${interference.left} + ${interference.right}`} style={[styles.sum, { color: theme.text }]}>{interference.left} + {interference.right} = ?</Text>
          <View style={styles.textChoices}>
            {interference.options.map((option) => <TextChoice key={option} label={String(option)} theme={theme} onPress={() => setSession((current) => answerFacesNamesInterference(current, option))} />)}
          </View>
        </View>
      ) : null}

      {session.phase === 'recognition' && trial ? (
        <View style={[styles.card, styles.recallCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.progress, { color: theme.textSecondary }]}>{interpolateFacesNames(strings.recognitionProgress, { current: session.trialIndex + 1, total: session.puzzle.trials.length })}</Text>
          <Text accessibilityRole="header" style={[styles.prompt, { color: theme.text }]}>{strings.recognitionPrompt}</Text>
          <View style={styles.faceChoices}>
            {trial.recognitionPersonIds.map((id, index) => {
              const person = personById(session.puzzle, id);
              return person ? <FaceChoice key={id} person={person} index={index} locale={locale} theme={theme} onPress={() => setSession((current) => selectRecognizedFace(current, id))} /> : null;
            })}
          </View>
        </View>
      ) : null}

      {session.phase === 'name-recall' && trial && target ? (
        <View style={[styles.card, styles.recallCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.progress, { color: theme.textSecondary }]}>{interpolateFacesNames(strings.recognitionProgress, { current: session.trialIndex + 1, total: session.puzzle.trials.length })}</Text>
          <SyntheticFace face={target.face} locale={locale} size={170} />
          <Text accessibilityRole="header" style={[styles.prompt, { color: theme.text }]}>{strings.namePrompt}</Text>
          <View style={styles.textChoices}>
            {trial.namePersonIds.map((id) => {
              const person = personById(session.puzzle, id);
              return person ? (
                <TextChoice
                  key={id}
                  label={person.name}
                  sub={nameScript(locale, person.name)}
                  theme={theme}
                  onPress={() => setSession((current) => selectRecalledName(current, id, now()))}
                />
              ) : null;
            })}
          </View>
        </View>
      ) : null}

      {session.phase === 'fact-recall' && trial && target ? (
        <View style={[styles.card, styles.recallCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.progress, { color: theme.textSecondary }]}>{interpolateFacesNames(strings.recognitionProgress, { current: session.trialIndex + 1, total: session.puzzle.trials.length })}</Text>
          <SyntheticFace face={target.face} locale={locale} size={170} />
          <Text accessibilityRole="header" style={[styles.prompt, { color: theme.text }]}>{strings.factPrompt}</Text>
          <View style={styles.textChoices}>
            {trial.factIds.map((factId) => <TextChoice key={factId} label={getFactText(locale, factId)} theme={theme} onPress={() => setSession((current) => selectRecalledFact(current, factId, now()))} />)}
          </View>
        </View>
      ) : null}

      <ActionButton label={strings.restart} theme={theme} secondary onPress={restart} />
    </ScrollView>
  );
}

/**
 * Смена seed или уровня — новая партия с нуля: ключ пересобирает состояние, а не
 * доливает новый пазл в старую сессию.
 */
export default function FacesNamesGame(props: FacesNamesGameProps) {
  const sessionKey = JSON.stringify([props.seed, props.level]);
  return <FacesNamesSessionView {...props} key={sessionKey} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 18, gap: 14 },
  gameContent: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 12, gap: 12 },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 16 },
  hero: { width: '100%', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 22, gap: 8 },
  heroTitle: { fontSize: 30, fontWeight: '900', textAlign: 'center' },
  heroSkill: { opacity: 0.93, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  card: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23 },
  centerText: { textAlign: 'center' },
  privacy: { fontSize: 15, lineHeight: 22, fontWeight: '800' },
  keyboardHelp: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  actionButton: { minHeight: 48, minWidth: 150, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 13, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.74 },
  pauseCard: { maxWidth: 520, width: '100%' },
  topRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  gameTitle: { fontSize: 22, fontWeight: '900' },
  round: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  studyCard: { alignItems: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' },
  recallCard: { alignItems: 'center' },
  progress: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  memoryPair: { width: '100%', alignItems: 'center', gap: 3 },
  memoryLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  personName: { fontSize: 30, fontWeight: '900', textAlign: 'center' },
  personNameScript: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  personFact: { fontSize: 18, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  sum: { fontSize: 38, fontWeight: '900', textAlign: 'center' },
  prompt: { fontSize: 21, lineHeight: 27, fontWeight: '900', textAlign: 'center' },
  faceChoices: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  faceChoice: { minWidth: 152, minHeight: 172, borderRadius: 18, borderWidth: 1, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  faceNumber: { fontSize: 12, fontWeight: '800' },
  textChoices: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  textChoice: { minHeight: 48, minWidth: 150, maxWidth: 330, flexGrow: 1, flexBasis: '42%', borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  choiceText: { fontSize: 16, lineHeight: 21, fontWeight: '800', textAlign: 'center' },
  choiceSub: { fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center', marginTop: 2 },
});
