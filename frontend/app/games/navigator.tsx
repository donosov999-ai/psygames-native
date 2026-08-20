/* psygames-game-navigator · VER 2 · 20.08.2026 */
/**
 * Navigator — «Навигатор»: мысленная карта маршрута.
 *
 * ПРОИСХОЖДЕНИЕ. Игра G6 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-navigator`, коммит ec65e46,
 * база — d203a4a). Модуль пришёл самодостаточным: своё ядро, свой словарь ru/en,
 * своя разметка партии. Здесь — стыковка с приложением.
 *
 * ЧТО ТРЕНИРУЕТ. Не «запомни картинку». Пространственное отношение: маршрут
 * остаётся тем же самым, когда карту повернули. Три режима идут по кругу и
 * спрашивают одно знание с трёх сторон — направления шагов («Маршрут»),
 * лево/прямо/право относительно движения («Повороты») и направление на старт из
 * финиша («Домой»). Третий и есть настоящая навигация: этой стрелки человек ни
 * разу не видел, её надо вывести из пройденного пути.
 *
 * СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ, А НЕ ТАЙМЕРОМ. Уровней 33, и каждые пять шагов
 * добавляется НОВОЕ, а не «то же самое, но быстрее»: 1–5 поле 3×3, 3–5 шагов,
 * обучение и первые ориентиры · 6–10 4×4, скрытая карта, пауза на удержание,
 * ложные ветви и первый поворот карты · 11–15 5×5, 8–10 шагов · 16–20 6×6 ·
 * 21–25 7×7, 13–15 шагов, все четыре поворота · 26–30 8×8, пять ориентиров ·
 * 31–33 предельная нагрузка. Отсчёта времени нет НИГДЕ: «пауза на удержание» —
 * это один-три явных нажатия «Продолжить», а не секундомер.
 *
 * 🔴 РАУНД ВЕДЁТ МОДУЛЬ, ФИНАЛ — ПРИЛОЖЕНИЕ. Свой экран поздравления у модуля
 * был; при стыковке он снят совсем (см. шапку NavigatorGame.tsx). Звёзды по
 * уровням, серия чистых прохождений и глаз-разрядка пишутся ТОЛЬКО в
 * LevelCleared — свой экран итога означает тихое выпадение из всей этой
 * бухгалтерии, ровно как когда-то у маджонга и парных картинок.
 *
 * ⚠️ ПОРОГ ПРОХОЖДЕНИЯ БЕРЁМ ИЗ МОДУЛЯ. `isPassed` — канонический предикат
 * ядра: 0.80 точности для маршрута и поворотов, ближайший 45-градусный сектор
 * (ошибка ≤22.5°) для направления домой. Переписывать его здесь числом значило
 * бы завести второй источник правды, который разъедется с первым молча.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { onGradientText } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { gameNow } from '@/src/services/gamePause';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import GameShell from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import NavigatorGame from '@/src/games/navigator/NavigatorGame';
import {
  LEVELS,
  getNavigatorModeLabel,
  getNavigatorStrings,
  isPassed,
  navigatorModeForLevel,
  type NavigatorLocale,
  type NavigatorMetrics,
  type NavigatorMode,
} from '@/src/games/navigator/core/index';

const GRADIENT = ['#2563eb', '#14b8a6'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента:
// зашитый '#FFF' на бирюзовом конце даёт 2.1 при норме AA 4.5.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/** Режимы, которые модуль умеет принимать из адреса. Чужое значение игнорируем. */
const MODES: NavigatorMode[] = ['route-recall', 'turn-sequence', 'home-direction'];

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function NavigatorScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
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
  const locale = language as NavigatorLocale;
  /**
   * 🔴 НАЗВАНИЕ И ОПИСАНИЕ БЕРЁМ ИЗ МОДУЛЯ, А НЕ ИЗ ОБЩЕГО СЛОВАРЯ — ПОКА.
   *
   * Ключей `navigator` / `navigatorDesc` в словаре ещё нет: он общий на все
   * приёмки сразу, и заводит их один заход-интегратор (INTEGRATION.md §2).
   * А `t()` на отсутствующем ключе возвращает САМО ИМЯ КЛЮЧА — человек увидел
   * бы в шапке «navigator», и это не гипотеза: так и было в браузере
   * 19.08.2026, пока текст сюда не переехал.
   *
   * ⚠️ КОГДА КЛЮЧИ ЗАВЕДУТ — вернуть вызовы словаря по ключам `navigator` и
   * `navigatorDesc`:
   * в модуле два языка, в словаре двенадцать. Обе строки ниже помечены.
   */
  const navStrings = getNavigatorStrings(locale);
  const lvl = usePersistentLevel('navigator');
  const { isPreset, autostart, num, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<NavigatorMetrics | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  /**
   * 🔴 УРОВЕНЬ, КОТОРЫЙ ТОЛЬКО ЧТО СЫГРАН — ОТДЕЛЬНО ОТ ТЕКУЩЕГО.
   *
   * `level` считается из `lvl.level` на каждый рендер. Как только успешный
   * раунд поднимает потолок (`lvl.reach`), `level` становится СЛЕДУЮЩИМ — и
   * плашка итога, нарисованная тем же рендером, поздравляет не с тем уровнем и
   * пишет звёзды не туда. Поймано в браузере 19.08.2026: сыграл первый уровень,
   * в хранилище легло `psygames_navigator_stars_free = {"2":3}`. Ошибка тихая:
   * на экране «Уровень 2 пройден» выглядит правдоподобно.
   */
  const [playedLevel, setPlayedLevel] = React.useState(1);

  // Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  const level = Math.min(LEVELS, Math.max(1, num('level', lvl.level)));
  // Режим партии тоже можно задать шагом зарядки; мусор в адресе игнорируем и
  // берём тот, что положен уровню, — иначе игра молча запустилась бы не тем.
  const askedMode = str('mode') as NavigatorMode;
  const roundMode: NavigatorMode = MODES.includes(askedMode) ? askedMode : navigatorModeForLevel(level);

  /**
   * Зерно фиксируем на уровень, а не на каждый заход: перезапуск того же уровня
   * должен давать ТОТ ЖЕ маршрут. Иначе «не получилось — крутани ещё раз»
   * превращается в лотерею вместо второй попытки.
   */
  const [attempt, setAttempt] = React.useState(0);
  const seed = React.useMemo(() => `navigator-${level}`, [level]);

  /**
   * Есть ли что терять — решает МОДУЛЬ (`hasSomethingToLose`), экран только
   * держит ответ и отдаёт каркасу: про фазы раунда каркас не знает.
   */
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => { if (autostart) setPhase('playing'); }, [autostart]);

  const onComplete = React.useCallback(async (m: NavigatorMetrics) => {
    const passed = isPassed(m);
    setLast(m);
    setPlayedLevel(level);          // запомнить ДО того, как потолок уедет вверх

    // Пресет и шаг зарядки уровень НЕ двигают — так во всех остальных экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'navigator',
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: level <= 11 ? 'easy' : level <= 22 ? 'medium' : 'hard',
        mode: m.specific.mode,
        errors: m.errors,
        details: {
          level,
          accuracy: m.accuracy,
          normalized_difficulty: m.difficulty,
          seed: m.seed,
          generator_version: m.generatorVersion,
          mode: m.specific.mode,
          grid_size: m.specific.gridSize,
          route_steps: m.specific.routeSteps,
          // Три метрики режимов держим РАЗДЕЛЬНО и не сводим в одну «точность»:
          // лишний шаг по карте, промах поворота и угловая ошибка — разные
          // ошибки, и усреднение их в одно число стёрло бы, что именно упало.
          route_accuracy: m.specific.routeAccuracy,
          extra_steps: m.specific.extraSteps,
          angular_error_deg: m.specific.angularErrorDeg,
          route_hits: m.specific.routeHits,
          turn_hits: m.specific.turnHits,
          turn_total: m.specific.turnTotal,
          map_rotation: m.specific.mapRotation,
          landmark_count: m.specific.landmarkCount,
          false_branch_count: m.specific.falseBranchCount,
          hidden_map: m.specific.hideMapDuringRecall,
          delay_steps: m.specific.delaySteps,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl]);

  /**
   * Звёзды считаем по предмету РЕЖИМА, а не по общей «точности». В направлении
   * домой точность — это 1 − ошибка/180, и даже случайный тык даёт ~0.75:
   * три звезды сыпались бы просто так.
   */
  const stars = React.useMemo(() => {
    if (!last) return 1;
    const deg = last.specific.angularErrorDeg;
    if (deg !== null) return deg <= 11.25 ? 3 : deg <= 22.5 ? 2 : 1;
    return last.accuracy >= 0.97 ? 3 : last.accuracy >= 0.9 ? 2 : 1;
  }, [last]);

  const start = () => { setArmed(false); setAttempt((n) => n + 1); setPhase('playing'); };

  /** Уйти в экран настройки — сюда ведёт и «назад» каркаса, и конец партии. */
  const leaveToConfig = React.useCallback(() => { setArmed(false); setPhase('config'); }, []);

  if (phase === 'playing') {
    return (
      /**
       * 🔴 ОБЩИЙ КАРКАС, А НЕ ГОЛАЯ РАМКА. Раньше партия висела в пустом
       * SafeAreaView: выйти можно было только через кнопку на экране правил или
       * через свою паузу модуля, а окно отзыва поверх игры её не
       * останавливало — маршрут показывался в пустоту, пока человек писал.
       * Каркас даёт и место выхода с вопросом, и плашку паузы.
       */
      <GameShell
        title={navStrings.title}
        onBack={leaveToConfig}
        /**
         * Спрашиваем только когда терять есть что: на экране правил уходим
         * молча, а с началом показа маршрута — уже нет. Маршрут выпадет тот же
         * (зерно фиксировано уровнем), но пройти его глазами придётся заново.
         */
        confirmExit={armed}
      >
        <View style={styles.stage}>
          <NavigatorGame
            key={attempt}                 /* новый заход — чистое состояние модуля */
            seed={seed}
            level={level}
            mode={roundMode}
            locale={locale}
            /**
             * Тему отдаём ЦЕЛИКОМ, а не три цвета: у модуля палитра по умолчанию
             * светлая, а у нас есть тёмные профили — недокрашенная игра была бы
             * белым пятном посреди тёмного приложения.
             */
            theme={{
              background: colors.background,
              surface: colors.surface,
              card: colors.card,
              text: colors.text,
              textSecondary: colors.textSecondary,
              border: colors.border,
              /**
               * 🔴 primary = ЦВЕТ ИГРЫ, а не акцент профиля. Модуль красит им свою
               * главную кнопку и глифы. Если отдать сюда `colors.primary`, внутри
               * игры всё станет акцентом профиля (оранжевым, синим — каким
               * угодно), а снаружи, на экране настроек, останется градиент игры:
               * один экран, две разные схемы.
               */
              primary: GRADIENT[0],
              success: colors.success,
              error: colors.error,
              warning: colors.warning,
            }}
            gameGradient={GRADIENT as [string, string]}
            gameGradientText={ON_GRAD.color}
            now={gameNow}                 /* часы партии стоят, пока человек пишет отзыв */
            onComplete={onComplete}
            onProgress={setArmed}
            /**
             * 🔴 `onExit` МОДУЛЮ НЕ ОТДАЁМ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Его кнопки
             * «Выход» (на правилах и на своей паузе) уводили бы МИМО вопроса при
             * выходе — тем самым способом, от которого вопрос и защищает. Выход
             * теперь один: «назад» в шапке каркаса, он же ловит аппаратную.
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
        <TouchableOpacity onPress={() => goBackOrHome()} style={styles.back}
          accessibilityRole="button" accessibilityLabel={t('a11yBack')}>
          <Ionicons name="arrow-back" size={24} color={ON_GRAD.color} />
        </TouchableOpacity>
        <Text style={styles.title}>{navStrings.title}</Text>{/* ← ключ словаря `navigator`, когда заведут */}
      </GradientSurface>

      <ScrollView contentContainerStyle={styles.body}>
        <LevelProgressMap gameId="navigator" currentLevel={lvl.level} maxLevel={LEVELS}
          levelLabel={(n) => getNavigatorModeLabel(locale, navigatorModeForLevel(n))}
          onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
          {/* ← ключ словаря `navigatorDesc`, когда заведут */}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{navStrings.catalogDesc}</Text>
        </View>

        <TouchableOpacity onPress={start} accessibilityRole="button">
          <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
            <Text style={styles.startText}>{t('start')}</Text>
          </GradientSurface>
        </TouchableOpacity>
      </ScrollView>

      {phase === 'cleared' && (
        <LevelCleared gameId="navigator" level={playedLevel} stars={stars}
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
  root: { flex: 1 },
  /**
   * Поле каркаса раздвинуто до краёв экрана: `paddingHorizontal: 16` каркаса —
   * умолчание для игр, которые рисуют содержимое прямо в нём, а модуль меряет
   * доску от ШИРИНЫ ЭКРАНА (`screenW − 24`). Оставить отступ каркаса значит
   * либо обрезать сетку, либо ужать её на 32 px. `alignSelf: 'stretch'` +
   * отрицательные поля дают ровно исходную ширину: растянутый элемент занимает
   * `ширина_родителя − 32 − (−16) − (−16)` и начинается с `16 + (−16) = 0`.
   */
  stage: { flex: 1, alignSelf: 'stretch', marginHorizontal: -16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  // 48×48 — общий размер кнопки «Назад» на 63 экранах из 64. У «Прикидки»
  // здесь стоял padding: 4, и аудит попадания пальцем нашёл 32×34; повторять
  // эту ошибку в новой игре нельзя.
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
});
