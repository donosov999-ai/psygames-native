/* psygames-game-object-tracker · VER 2 · 20.08.2026 */
/**
 * Трекер объектов — слежение за несколькими целями в толпе одинаковых.
 *
 * ПРОИСХОЖДЕНИЕ. Игра G5/8 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-object-tracker`, коммит 8bd59ad,
 * база — d203a4a). Модуль пришёл самодостаточным: чистая физика с шагом 8 мс,
 * свой валидатор состояния, свой словарь ru/en, свой `isPassed`. Ядро перенесено
 * один в один в `src/games/object-tracker/core`, адаптер поля переписан под
 * приложение — что именно изменено, перечислено в его шапке.
 *
 * ЧТО ТРЕНИРУЕТ. Multiple Object Tracking (Pylyshyn & Storm, 1988): человек
 * удерживает 1–5 меченых объектов в толпе неотличимых, пока все двигаются. Это
 * НЕ поиск (там цель отличается видом) и НЕ объём памяти (там нечего удерживать
 * в движении) — это ёмкость РАСПРЕДЕЛЁННОГО внимания и способность не отдать
 * цель соседу в момент сближения. Отдельный навык: за рулём и в толпе работает
 * именно он.
 *
 * СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ ПО ПЯТИ НЕЗАВИСИМЫМ ОСЯМ, а не «то же самое,
 * но быстрее»: 1–8 — 4–6 объектов и одна цель · 9–16 — до 9 объектов, две цели ·
 * 17–24 — три цели · 25–32 — двенадцать объектов, четыре цели, скорость выходит
 * на потолок · 33–40 — пять целей, движение дольше и сближения теснее · 41 —
 * всё сразу на максимуме. Всего 41 уровень (`LEVELS` в ядре).
 *
 * ⚠️ ДЛИННОЕ ДВИЖЕНИЕ — ЭТО НАГРУЗКА, А НЕ ОБРАТНЫЙ ОТСЧЁТ. Выбор целей после
 * остановки не ограничен по времени вообще: думать можно сколько нужно.
 *
 * 🔴 РАУНД ВЕДЁТ МОДУЛЬ, ФИНАЛ — ПРИЛОЖЕНИЕ. Свой экран поздравления у модуля был
 * и убран: звёзды по уровням, серия чистых прохождений и глаз-разрядка пишутся
 * ТОЛЬКО в LevelCleared, и своя плашка означала бы тихое выпадение из всей этой
 * бухгалтерии — ровно как когда-то у маджонга и парных картинок. Гейт
 * `game-standard` это отбивает.
 *
 * 🔴 ДВИЖЕНИЕ ЗАМИРАЕТ ВМЕСТЕ С ОБЩЕЙ ПАУЗОЙ, И ЭТО ДВА РАЗНЫХ КОНЦА.
 * Для игры про движение пауза острее, чем для любой другой: справку «Правила»
 * открывают ИМЕННО ТОГДА, когда не поняли, за чем следить, — и, читая, теряли бы
 * все цели. Длительность партии меряется игровыми часами `gameNow()` (ниже они
 * отдаются модулю пропом `now`), но ЭТОГО МАЛО: мир двигают дельты кадров
 * `requestAnimationFrame`, а они тикают мимо любых часов. Экран, который заменил
 * бы `Date.now()` на `gameNow()` и на этом успокоился, продолжал бы гонять
 * объекты под окном правил. Второй конец — в `useTrackerLoop`: пауза гасит сам
 * кадровый цикл.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onGradientText } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { gameNow } from '@/src/services/gamePause';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import BallStylePicker from '@/src/games/balls/BallStylePicker';
import { BALL_STYLE_DEFAULT, BALL_STYLE_EVENT, getBallStyle, type BallStyle } from '@/src/games/balls/ballChoice';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import GameShell, { PAD_H } from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import ObjectTrackerGame from '@/src/games/object-tracker/ObjectTrackerGame';
import {
  LEVELS,
  getObjectTrackerStrings,
  isPassed,
  type ObjectTrackerLocale,
  type ObjectTrackerMetrics,
} from '@/src/games/object-tracker/core';

/** Выбор режима движения помнится: спрашивать об этом каждый заход — то же навязывание. */
const ШАГ_КЛЮЧ = 'psygames_tracker_stepwise';

const GRADIENT = ['#f59e0b', '#7c3aed'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента:
// янтарь светлый, фиолетовый тёмный, и одним цветом AA 4.5 на обоих не берётся.
// GradientSurface кладёт поверх вуаль цветом самого градиента — подробности в
// шапке src/services/onGradientText.ts.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function ObjectTrackerScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const lvl = usePersistentLevel('object_tracker');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();
  /**
   * 🔴 СИСТЕМНАЯ НАСТРОЙКА НЕ ПЕРЕКЛЮЧАЕТ УПРАЖНЕНИЕ МОЛЧА (отчёт 1b865202,
   * Денис второй раз: «они запускаться должны автоматом, движения на
   * перемешивание, а не то что я тапать должен»).
   *
   * Было: `prefers-reduced-motion` от системы напрямую включал пошаговый режим —
   * объекты не двигались, пока не нажмёшь «Следующий шаг движения». У большинства
   * игр это правильно: гасим украшательство. Но здесь ДВИЖЕНИЕ И ЕСТЬ УПРАЖНЕНИЕ,
   * и тихая подмена превращает слежение глазами в другую задачу — причём человек
   * не знает, почему так, и винит приложение.
   *
   * Стало: по умолчанию движение АВТОМАТИЧЕСКОЕ всегда. Системная настройка
   * только подсказывает, что пошаговый режим существует, а включает его человек
   * сам — и выбор запоминается.
   */
  const системаПросит = useReducedMotion();
  const [шагами, setШагами] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(ШАГ_КЛЮЧ).then((v) => { if (v === '1') setШагами(true); }).catch(() => {});
  }, []);
  const переключитьШаги = (v: boolean) => {
    setШагами(v);
    AsyncStorage.setItem(ШАГ_КЛЮЧ, v ? '1' : '0').catch(() => {});
  };

  /**
   * ВИД ШАРОВ. Раньше объект был плоским кружком заливкой из градиента игры —
   * Денис 05.09.2026 назвал такие шарики плохими и просил дать выбор фактуры.
   * Девять фактур нарисованы листом; цвет здесь не выбирается сознательно: в
   * трекере все объекты обязаны быть неразличимы (см. ballChoice).
   */
  const [стильШаров, setСтильШаров] = useState<BallStyle>(BALL_STYLE_DEFAULT);
  useEffect(() => { getBallStyle().then(setСтильШаров).catch(() => {}); }, []);
  // Ряд выбора шлёт событие — экран подхватывает его тем же слушателем, что и игры.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(BALL_STYLE_EVENT, (v: BallStyle) => setСтильШаров(v));
    return () => sub.remove();
  }, []);

  const screenWidth = useScreenWidth();

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<ObjectTrackerMetrics | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  /**
   * Есть ли что терять — решает МОДУЛЬ (`hasSomethingToLose`), экран только
   * держит ответ и отдаёт каркасу. Каркас про фазы раунда не знает и знать не
   * должен, а «вы уверены?» на показе целей был бы вопросом ни о чём.
   */
  const [armed, setArmed] = React.useState(false);

  // Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  // Потолок 41 — дальше генератор не растёт, и обещать несуществующее нельзя.
  const level = Math.min(LEVELS, num('level', lvl.level));
  /**
   * 🔴 ЯЗЫК ОТДАЁМ МОДУЛЮ ЦЕЛИКОМ, А НЕ СХЛОПЫВАЕМ ДО ПАРЫ RU/EN (19.08.2026).
   *
   * Здесь стояло `language === 'ru' ? 'ru' : 'en'`, и это тихо сводило на нет
   * весь перевод партии: словарь модуля переведён на двенадцать языков, но
   * японец, кореец и немец всё равно получали английский — до словаря их язык
   * просто не доезжал. Ошибка того же рода, что ловит ci-i18n-hardcode-guard,
   * только на строку раньше: не «текст выбран тернарником», а «язык выброшен
   * перед выбором текста». Сам тернарник гейт пропускает законно — по обеим
   * веткам там код языка, а не фраза для человека.
   *
   * Приведение нужно потому, что `language` типизирован как Language
   * приложения, а модуль объявляет свой список; списки сверяет по буквам гейт
   * games-module-i18n, поэтому расхождение не проедет молча.
   */
  const locale = language as ObjectTrackerLocale;
  const strings = getObjectTrackerStrings(locale);

  /**
   * Зерно фиксируем на уровень, а не на каждый заход: перезапуск того же уровня
   * должен давать ТУ ЖЕ расстановку и ТУ ЖЕ траекторию. Иначе «не получилось —
   * крутани ещё раз» превращается в лотерею вместо второй попытки, а физика,
   * которую в лаборатории специально сделали детерминированной, теряет смысл.
   */
  const [attempt, setAttempt] = React.useState(0);
  const seed = React.useMemo(() => `object-tracker-${level}`, [level]);

  // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => setPhase('playing'));

  const onComplete = React.useCallback(async (m: ObjectTrackerMetrics) => {
    // Порог прохождения считает САМ модуль: точность ≥ 0.60 и не больше одного
    // ложного выбора. На одноцелевых уровнях это означает точное попадание, на
    // самых тяжёлых пяти-целевых — право один раз перепутать объект соседом.
    const passed = isPassed(m);
    setLast(m);

    // Пресет и шаг зарядки уровень НЕ двигают — так во всех экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      // Пишем партию ВСЕГДА, и провальную тоже: без записи провала зарядка
      // считает шаг несделанным и возвращает на него по кругу.
      await saveSession({
        passed,
        game_type: 'object_tracker',
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: level <= 8 ? 'easy' : level <= 24 ? 'medium' : 'hard',
        mode: `${m.specific.targetCount}of${m.specific.objectCount}`,
        errors: m.errors,
        details: {
          level,
          accuracy: m.accuracy,
          object_count: m.specific.objectCount,
          target_count: m.specific.targetCount,
          hits: m.specific.hits,
          // Промах и ложный выбор разведены намеренно: «не нашёл свою цель» и
          // «уверенно ткнул в чужую» — разные сбои внимания, и лечатся по-разному.
          misses: m.specific.misses,
          false_selections: m.specific.falseSelections,
          // Сколько раз объекты за раунд СБЛИЖАЛИСЬ вплотную: главный источник
          // потери цели. Без этого числа «ошибся» и «было объективно тесно»
          // выглядят в статистике одинаково.
          close_approaches: m.specific.closeApproaches,
          motion_duration_ms: m.specific.motionDurationMs,
          reduced_motion: m.specific.reducedMotion,
          seed: m.seed,
          generator_version: m.generatorVersion,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl]);

  /**
   * Звёзды по чистоте выбора: три — ни одной ошибки, две — одна, дальше одна.
   * Точность здесь дискретна (целей от одной до пяти), поэтому считаем ошибки,
   * а не проценты: «80%» при двух целях невозможно, а «одна ошибка» — понятно.
   */
  const stars = last ? (last.errors === 0 ? 3 : last.errors <= 1 ? 2 : 1) : 1;

  const start = () => { setArmed(false); setAttempt((n) => n + 1); setPhase('playing'); };

  /** Уйти в экран настройки — сюда ведёт и «назад» каркаса, и конец партии. */
  const leaveToConfig = React.useCallback(() => { setArmed(false); setPhase('config'); }, []);

  if (phase === 'playing') {
    return (
      /**
       * 🔴 ОБЩИЙ КАРКАС, А НЕ СВОЯ РАМКА. Через него игра получает то, чего у
       * неё не было: плашку паузы, пока человек пишет отзыв, и вопрос при
       * выходе. Своя рамка (SafeAreaView + модуль) не давала ни того, ни другого.
       *
       * ⚠️ ДЛЯ ЭТОЙ ИГРЫ ПАУЗА ДОРОЖЕ, ЧЕМ ДЛЯ ОСТАЛЬНЫХ. Кадровый цикл
       * `useTrackerLoop` замирал по общей паузе и раньше — но БЕЗ каркаса
       * человек видел просто застывшее поле без единого слова о том, почему оно
       * встало. Плашка каркаса это объясняет и заодно ловит тапы, чтобы вслепую
       * не ткнуть в объект.
       */
      <GameShell
        title={strings.title}
        /** «Назад» ведёт на экран настройки — туда же, куда вёл выход модуля. */
        onBack={leaveToConfig}
        /**
         * Спрашиваем ровно тогда, когда терять есть что: на показе целей выход
         * молчит (зерно фиксировано уровнем, повтор даёт ту же расстановку), а
         * с началом движения — уже нет, слежение глазами повтором не вернуть.
         */
        confirmExit={armed}
      >
        <View style={styles.stage}>
          <ObjectTrackerGame
            key={attempt}                 /* новый заход — чистое состояние модуля */
            seed={seed}
            level={level}
            locale={locale}
            /**
             * Щадящий режим читаем ОДНИМ общим хуком и передаём внутрь. Модуль сам
             * систему не спрашивает: `AccessibilityInfo.isReduceMotionEnabled()` в
             * react-native-web без DOM отвечает `true`, а DOM'а нет ровно на
             * пререндере статического экспорта — режим включился бы всем подряд.
             */
            reducedMotion={шагами}
            ballStyle={стильШаров}
            screenWidth={screenWidth}
            now={gameNow}
            /**
             * Тему отдаём ЦЕЛИКОМ, а не три цвета: у нас есть тёмные профили, и
             * недокрашенная игра была бы светлым пятном посреди тёмного приложения.
             */
            theme={{
              background: colors.background,
              surface: colors.surface,
              card: colors.surface,
              text: colors.text,
              textSecondary: colors.textSecondary,
              /**
               * 🔴 primary = ЦВЕТ ИГРЫ, а не акцент профиля. Модуль красит им главную
               * кнопку и кольцо цели. Отдать сюда `colors.primary` значит получить
               * внутри игры акцент профиля (оранжевый, синий — какой угодно), а
               * снаружи, на экране настройки, — градиент игры: один экран, две схемы.
               */
              primary: GRADIENT[0],
              border: colors.border,
              success: colors.success,
              error: colors.error,
              warning: colors.warning,
            }}
            gameGradient={GRADIENT as [string, string]}
            onComplete={onComplete}
            onProgress={setArmed}
            /**
             * 🔴 `onExit` МОДУЛЮ НЕ ОТДАЁМ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Своя кнопка
             * «Выход» в шапке модуля уводила бы МИМО вопроса при выходе — то есть
             * ровно тем способом, от которого вопрос и защищает. Выход теперь один
             * на экран: «назад» в шапке каркаса, и он же перехватывает аппаратную.
             */
          />
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <GradientSurface colors={GRADIENT as [string, string]} style={styles.header}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {/* 48×48 — не «padding и как выйдет»: у соседней игры ровно здесь вышло 32×34. */}
        <TouchableOpacity onPress={() => goBackOrHome()} style={styles.back}
          accessibilityRole="button" accessibilityLabel={t('back')}>
          <Ionicons name="arrow-back" size={24} color={ON_GRAD.color} />
        </TouchableOpacity>
        <Text style={styles.title}>{strings.title}</Text>
      </GradientSurface>

        {/*
          🔴 ТЕЛО ЭКРАНА НАСТРОЙКИ ПРЯЧЕТСЯ, ПОКА СВЕРХУ ПЛАШКА.
          Отчёт Дениса 05.09.2026 (c9293c23, one-line): «постоянно выскакивает
          экран с начальным упражнением и как играть между уровнями». Так и было:
          `LevelCleared` — обычный `flex: 1`, а не наложение, и рисовался ПОСЛЕ
          тропинки уровней, карточки правил и кнопки «Начать». Между уровнями
          человек видел экран настройки целиком.
          Ровно та же дыра нашлась ещё в шести играх — правило одно на всех.
        */}
      {phase === 'config' && (
        <ScrollView contentContainerStyle={styles.body}>
          <LevelProgressMap bestLevel={lvl.best} gameId="object_tracker" currentLevel={lvl.level} maxLevel={LEVELS}
            onPickLevel={lvl.pick} colors={colors} language={language} />

          {/*
            Правила лежат ЗДЕСЬ, а не отдельным экраном внутри модуля: второй экран
            правил был бы вторым «Начать» подряд и лишним тапом в шаге зарядки.
            Текст тот же самый, из словаря модуля, — ничего не потеряно.
          */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
            <Text style={[styles.skill, { color: colors.textSecondary }]}>{strings.skill}</Text>
            <Text style={[styles.hint, { color: colors.text }]}>{strings.rulesBody}</Text>
            <Text style={[styles.hint, { color: colors.text }]}>{strings.rulesSelection}</Text>
            {/* Пошаговый режим — выбор человека, а не следствие системной настройки. */}
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityState={{ checked: шагами }}
              accessibilityLabel={t('trackerStepwise')}
              onPress={() => переключитьШаги(!шагами)}
              style={[styles.stepRow, { borderColor: шагами ? GRADIENT[1] : colors.border }]}
            >
              <Ionicons name={шагами ? 'checkbox' : 'square-outline'} size={22} color={шагами ? GRADIENT[1] : colors.textSecondary} />
              <Text style={[styles.hint, { color: colors.text, flex: 1 }]}>{t('trackerStepwise')}</Text>
            </TouchableOpacity>
            <BallStylePicker level={level} colors={colors} accent={GRADIENT[1]} />
            {шагами ? (
              <Text style={[styles.hint, { color: GRADIENT[1], fontWeight: '800' }]}>
                {strings.reducedMotionInfo}
              </Text>
            ) : системаПросит ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {t('trackerStepwiseOffered')}
              </Text>
            ) : null}
            <Text style={[styles.keys, { color: colors.textSecondary }]}>{strings.keyboardHelp}</Text>
          </View>

          <TouchableOpacity onPress={start} accessibilityRole="button">
            <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
              <Text style={styles.startText}>{t('start')}</Text>
            </GradientSurface>
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === 'cleared' && (
        <LevelCleared gameId="object_tracker" level={level} stars={stars}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={start} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && last && (
        <GameResult
          score={last.score}
          time={last.durationMs / 1000}
          errors={last.errors}
          onPlayAgain={start} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Строка-тумблер: цель нажатия 48 — та же норма, что у остальных кнопок.
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 8 },
  root: { flex: 1 },
  /**
   * ПОЛЕ КАРКАСА РАЗДВИНУТО ДО КРАЁВ ЭКРАНА.
   *
   * Каркас кладёт полю `paddingHorizontal: 16` — разумное умолчание для игр,
   * которые рисуют содержимое прямо в нём. Наш модуль свои отступы считает сам
   * и, главное, меряет квадрат поля от ШИРИНЫ ЭКРАНА (`screenWidth - 16`).
   * Оставить отступ каркаса значит либо обрезать поле на 32 px справа, либо
   * ужать его на те же 32 — на 390-точечном телефоне это 9 % площади слежения,
   * то есть прямая потеря того, ради чего в игру играют.
   *
   * `alignSelf: 'stretch'` + отрицательные поля дают ровно исходную ширину:
   * растянутый элемент занимает `ширина_родителя − 32 − (−16) − (−16)`, то есть
   * всю ширину, и начинается с `16 + (−16) = 0`.
   */
  // Поле во всю ширину: гасим боковой отступ каркаса ЕГО ЖЕ числом (см. PAD_H).
  stage: { flex: 1, alignSelf: 'stretch', marginHorizontal: -PAD_H },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800', flexShrink: 1 },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 8 },
  level: { fontSize: 18, fontWeight: '800' },
  skill: { fontSize: 13, fontWeight: '800' },
  hint: { fontSize: 14, lineHeight: 21 },
  keys: { fontSize: 12, lineHeight: 18 },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
});
