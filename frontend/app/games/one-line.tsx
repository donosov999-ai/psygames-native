/* psygames-game-one-line · VER 2 · 20.08.2026 */
/**
 * One Line — «Одна линия»: провести один непрерывный росчерк по ВСЕМ рёбрам
 * графа, не пройдя ни одно дважды (эйлеров путь).
 *
 * ПРОИСХОЖДЕНИЕ. Игра G3/8 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-one-line`, коммит bc336f04,
 * база — d203a4a). Модуль пришёл самодостаточным: своё ядро с независимым
 * решателем Хирхольцера, свой словарь ru/en, своя доска на SVG. Здесь —
 * стыковка с приложением, и ниже записано, что при ней пришлось решить.
 *
 * ЧТО ТРЕНИРУЕТ. Не скорость и не память, а ПЛАНИРОВАНИЕ МАРШРУТА С ОГЛЯДКОЙ
 * НА ТУПИК: любой ход законен по отдельности, но половина законных ходов
 * заводит в положение, из которого остаток рёбер уже не собрать. Отсюда же
 * контроль импульса — тянуть линию «куда ближе» проигрышно. Плюс отдельный
 * навык: отличать ТОПОЛОГИЮ от КАРТИНКИ. Точка, где две линии пересеклись на
 * экране, вершиной НЕ является и повернуть в ней нельзя; с 4-го уровня
 * раскладка нарочно подбирается так, чтобы таких обманок было больше.
 *
 * СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ, А НЕ ТАЙМЕРОМ. Уровней 48 (LEVELS из ядра),
 * и растут они по ЧЕТЫРЁМ осям сразу:
 *   · размер графа — 4 вершины (1–3) → 6 (4–6) → 7 → 8 → 9 → 10 → 11 → 12 (22+);
 *   · замкнутость — на уровнях 1, 4, 7, 10 … круг (стартовать можно откуда
 *     угодно), на остальных путь с двумя нечётными вершинами: начать можно
 *     ТОЛЬКО в одной из двух, и найти их — часть задачи;
 *   · треугольники — с 9-го уровня один, с 17-го два, с 25-го три: они и дают
 *     развилки, где выбор ветки решает, соберётся остаток или нет;
 *   · подсказка старта — горит только на уровнях 1–3, дальше её нет.
 * Таймера в игре нет вовсе: часы считают время партии, но ни на что не влияют.
 *
 * 🔴 РАУНД ВЕДЁТ МОДУЛЬ, ФИНАЛ — ПРИЛОЖЕНИЕ. У модуля есть СВОЙ экран итога
 * (проценты, время, исправления, «повторить с тем же seed»), и в лаборатории
 * он включён по умолчанию. В приложении он выключен — `showOwnResults={false}`.
 * Причина не косметическая: звёзды по уровням, серия чистых прохождений и
 * глаз-разрядка пишутся ТОЛЬКО в LevelCleared. Свой экран поздравления = тихое
 * выпадение из всей этой бухгалтерии, ровно как когда-то у маджонга и парных
 * картинок. Гейт `game-standard` такое отбивает, и правильно делает.
 *
 * 🔴 PRIMARY В ТЕМЕ МОДУЛЯ = ЦВЕТ ИГРЫ, А НЕ АКЦЕНТ ПРОФИЛЯ. Модуль красит
 * `theme.primary` пройденные рёбра, обводку вершин и главную кнопку. Отдать
 * туда `colors.primary` — значит внутри игры покрасить всё акцентом профиля
 * (оранжевым, синим — каким угодно), а снаружи, на экране настроек, оставить
 * градиент игры: один экран, две разные схемы. Остальную палитру отдаём
 * приложенческую целиком: ключи OneLineTheme совпадают с ThemeColors один в
 * один, а собственная палитра модуля СВЕТЛАЯ — на тёмном профиле игра была бы
 * белым пятном.
 *
 * ПОРОГ ПРОХОЖДЕНИЯ БЕРЁМ ИЗ ЯДРА, А НЕ ПРИДУМЫВАЕМ СВОЙ. `isPassed` (accuracy
 * ≥ 0.80) живёт в модуле вместе с формулой, которая эту accuracy считает. Свой
 * порог здесь означал бы два источника правды: поправят вес подсказки в ядре —
 * и экран начнёт судить по устаревшей шкале. Смысл порога: раз результат вообще
 * случился, все рёбра уже пройдены одной линией, поэтому порог ограничивает не
 * решение, а ЦЕНУ решения — отмены, отвергнутые ходы и подсказки суммарно не
 * дороже четверти рёбер.
 *
 * ЧАСЫ — ОБЩИЕ. `now` идёт из `gameNow`: пока человек пишет отзыв, партия обязана
 * замереть. Оба конца замера (старт и финиш) уезжают в модуль из одного
 * источника, поэтому разность автоматически становится игровым временем.
 *
 * ТРЕНИРОВОЧНЫЙ КРУГ МОДУЛЯ ОСТАВЛЕН. Перед каждой партией модуль показывает
 * правила и маленький круг из четырёх рёбер. Соблазн был его пропустить —
 * но правило «в вершину можно вернуться, в ребро нельзя» на словах не
 * усваивается, а на круге усваивается за пять секунд. Так же принята G1.
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
import OneLineGame from '@/src/games/one-line/OneLineGame';
import { LEVELS, isPassed, type OneLineLocale, type OneLineMetrics } from '@/src/games/one-line/core/index';

/**
 * Градиент игры. Лаборатория предлагала `#7c3aed → #db2777`, и по контрасту он
 * годился, но начало у него совпадало с хаб-карточкой «Конфликт внимания»
 * (`#7c3aed → #ec4899`) — в каталоге две карточки читались бы близнецами.
 * Сдвинут только левый конец: индиго вместо фиолетового, розовый конец
 * лаборатории сохранён, чтобы игра осталась узнаваемой по её же скриншотам.
 */
const GRADIENT = ['#4338ca', '#db2777'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента:
// надпись лежит поперёк и попадает на весь размах. Здесь выходит белый —
// 7.90 к индиго и 4.60 к розовому, оба выше AA 4.5, вуаль не нужна.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function OneLineScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const lvl = usePersistentLevel('one_line');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<OneLineMetrics | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  /**
   * 🔴 УРОВЕНЬ, КОТОРЫЙ РЕАЛЬНО СЫГРАН, — ОТДЕЛЬНЫМ СОСТОЯНИЕМ.
   *
   * Поймано глазами 19.08.2026 в браузере: прошёл первый уровень, а баннер
   * поздравил со ВТОРЫМ и обещал начать третий. Причина не в баннере: `level`
   * ниже считается из `lvl.level`, а к моменту показа баннера `lvl.reach()` уже
   * поднял сохранённый уровень. То есть на экран уезжало «куда пришли», а не
   * «что прошли», и звёзды по уровням (LevelCleared пишет их по gameId+level)
   * ложились бы на СЛЕДУЮЩУЮ ступень — на ту, которую человек ещё не играл.
   *
   * Ошибка на единицу, которую не видно ни в типах, ни в тестах на исходник:
   * оба числа настоящие, просто одно не про то. Поэтому запоминаем то, что
   * пришло в метрике модуля.
   */
  const [playedLevel, setPlayedLevel] = React.useState(1);

  /**
   * ИМЯ И ОПИСАНИЕ ИГРЫ — ИЗ СЛОВАРЯ ПРИЛОЖЕНИЯ (с 19.08.2026).
   *
   * Раньше их брали у словаря модуля: ключей `oneLine` / `oneLineDesc` в
   * приложении не было, а `t()` возвращает незаведённый ключ КАК ЕСТЬ — в шапке
   * стояло бы слово «oneLine». Заход-интегратор завёл оба ключа на двенадцати
   * языках, и зеркальная проверка в one-line-integration.test.ts потребовала
   * перейти на них: у модуля подписи только ru/en, то есть десять языков из
   * двенадцати остались бы с английской шапкой.
   *
   * Словарь модуля никуда не делся — он по-прежнему рисует саму партию
   * (правила раунда, счётчик рёбер, кнопки). Здесь речь только о шапке экрана
   * настройки и подписи под номером уровня.
   */

  // Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  const level = num('level', lvl.level);

  /**
   * Зерно фиксируем на уровень, а не на каждый заход: перезапуск того же уровня
   * должен давать ТОТ ЖЕ граф. Иначе «не собралось — крутани ещё раз»
   * превращается в лотерею вместо второй попытки, а здесь это особенно обидно:
   * человек уже построил в голове план на конкретную картинку.
   */
  const [attempt, setAttempt] = React.useState(0);
  const seed = React.useMemo(() => `one-line-${level}`, [level]);

  /**
   * Есть ли что терять — решает МОДУЛЬ (`hasSomethingToLose`), экран только
   * держит ответ и отдаёт каркасу: про фазы раунда каркас не знает.
   */
  const [armed, setArmed] = React.useState(false);

  /**
   * Часы партии. Обёрнуты в useCallback по двум причинам сразу.
   *   1. Модуль держит `now` в зависимостях эффекта, который подписывается на
   *      AppState. Отдать сюда новую стрелку на каждый рендер — переподписка
   *      на каждый рендер.
   *   2. Гейт дисциплины часов ищет в экране вызов `gameNow(`. Голое
   *      `now={gameNow}` он не видит — экран, который время МЕРЯЕТ, оказался бы
   *      вне проверки, и подмена на Date.now() прошла бы молча.
   */
  const now = React.useCallback(() => gameNow(), []);

  React.useEffect(() => { if (autostart) setPhase('playing'); }, [autostart]);

  const onComplete = React.useCallback(async (m: OneLineMetrics) => {
    const passed = isPassed(m);
    /**
     * Уровень берём ИЗ МЕТРИКИ модуля, а не из переменной экрана: в метрике он
     * тот, на котором партия реально игралась. Отдельной переменной — чтобы
     * запись уровня в сессию читалась и глазами, и гейтом единого стандарта
     * (он ищет `level: <что-то>Level`, а `level: m.details.level` не узнаёт).
     */
    const doneLevel = m.details.level;
    setPlayedLevel(doneLevel);
    setLast(m);

    // Пресет и шаг зарядки уровень НЕ двигают — так во всех экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'one_line',
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: level <= 8 ? 'easy' : level <= 24 ? 'medium' : 'hard',
        mode: m.specific.isCircuit ? 'circuit' : 'trail',
        errors: m.errors,
        details: {
          // level обязателен: по нему getMaxLevelFromSessions восстанавливает
          // достигнутое, когда ключ прогресса потерян (сброс/смена профиля).
          level: doneLevel,
          accuracy: m.accuracy,
          // Размер графа — единственное, по чему потом видно, СКОЛЬКО стоила
          // партия: 8 рёбер и 20 рёбер дают одинаковый score при одинаковой
          // чистоте, а работы в них разное количество.
          vertex_count: m.specific.vertexCount,
          edge_count: m.specific.edgeCount,
          // Обманки-пересечения: если ошибки растут вместе с ними, а не с
          // размером графа — человек спотыкается о картинку, а не о топологию.
          visual_crossings: m.specific.visualCrossings,
          is_circuit: m.specific.isCircuit,
          undo_count: m.specific.undoCount,
          hints_used: m.specific.hintsUsed,
          invalid_moves: m.specific.invalidMoves,
          path_efficiency: m.specific.pathEfficiency,
          normalized_difficulty: m.difficulty,
          seed: m.seed,
          generator_version: m.generatorVersion,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl]);

  /**
   * Звёзды по ЦЕНЕ решения. accuracy = рёбра / (рёбра + отмены + отвергнутые
   * ходы + половина подсказок), поэтому она уже нормирована на размер графа:
   * на большом графе одна ошибка стоит меньше, чем на маленьком, — и это
   * честно, работы там больше.
   */
  const stars = last ? (last.accuracy >= 0.97 ? 3 : last.accuracy >= 0.9 ? 2 : 1) : 1;

  const start = () => { setArmed(false); setAttempt((n) => n + 1); setPhase('playing'); };

  /** Уйти в экран настройки — сюда ведёт и «назад» каркаса, и конец партии. */
  const leaveToConfig = React.useCallback(() => { setArmed(false); setPhase('config'); }, []);

  if (phase === 'playing') {
    return (
      /**
       * 🔴 ОБЩИЙ КАРКАС, А НЕ ГОЛАЯ РАМКА. Раньше партия висела в пустом
       * SafeAreaView, и это стоило двух вещей сразу: выйти можно было только
       * кнопкой «Выход» на экране правил модуля (из партии — вообще никак,
       * аппаратной «назад» на вебе нет), а окно отзыва поверх игры её не
       * останавливало. Каркас даёт и место выхода с вопросом, и плашку паузы.
       */
      <GameShell
        title={t('oneLine')}
        onBack={leaveToConfig}
        /**
         * Спрашиваем только когда терять есть что: правила, тренировочный круг
         * и партия без единого хода уходят молча — граф фиксирован уровнем и
         * вернётся таким же. Первое пройденное ребро — уже нет.
         */
        confirmExit={armed}
      >
        <View style={styles.stage}>
          <OneLineGame
            key={attempt}                 /* новый заход — чистое состояние модуля */
            seed={seed}
            level={level}
            /**
             * 🔴 ЯЗЫК ОТДАЁМ МОДУЛЮ ЦЕЛИКОМ, А НЕ СХЛОПЫВАЕМ ДО ПАРЫ RU/EN
             * (19.08.2026). Здесь стояло `language === 'ru' ? 'ru' : 'en'`, и это
             * тихо сводило на нет весь перевод партии: словарь модуля переведён на
             * двенадцать языков, но японец, кореец и немец всё равно получали
             * английский — до словаря их язык просто не доезжал. Ошибка того же
             * рода, что ловит ci-i18n-hardcode-guard, только на строку раньше: не
             * «текст выбран тернарником», а «язык выброшен перед выбором текста».
             * Списки языков приложения и модуля сверяет гейт games-module-i18n,
             * поэтому приведение не спрячет расхождение.
             */
            locale={language as OneLineLocale}
            /**
             * Тему отдаём ЦЕЛИКОМ: ключи OneLineTheme совпадают с ThemeColors один
             * в один, а palette модуля по умолчанию светлая. Единственная подмена —
             * primary, см. шапку файла.
             */
            theme={{
              background: colors.background,
              surface: colors.surface,
              card: colors.card,
              text: colors.text,
              textSecondary: colors.textSecondary,
              border: colors.border,
              primary: GRADIENT[0],
              success: colors.success,
              error: colors.error,
              warning: colors.warning,
            }}
            gameGradient={GRADIENT as [string, string]}
            gameGradientText={ON_GRAD.color}
            /**
             * 🔴 Свой экран итога модуля НЕ показываем — иначе звёзды, серия и
             * глаз-разрядка не запишутся. Подробности в шапке файла.
             */
            showOwnResults={false}
            now={now}
            onComplete={onComplete}
            onProgress={setArmed}
            /**
             * 🔴 `onExit` МОДУЛЮ НЕ ОТДАЁМ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Кнопка «Выход»
             * на экране правил модуля уводила бы МИМО вопроса при выходе — тем
             * самым способом, от которого вопрос и защищает. Выход теперь один:
             * «назад» в шапке каркаса, он же перехватывает аппаратную.
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
          accessibilityRole="button" accessibilityLabel={t('back')}>
          <Ionicons name="arrow-back" size={24} color={ON_GRAD.color} />
        </TouchableOpacity>
        {/* Ключи заведены 19.08.2026 — переходим на словарь приложения: в нём
            двенадцать языков, а в словаре модуля два. Переключение сторожит
            зеркальная проверка в one-line-integration.test.ts. */}
        <Text style={styles.title}>{t('oneLine')}</Text>
      </GradientSurface>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Тропинка на все 48 ступеней: число берём из ядра, а не вбиваем — растянут
            прогрессию в модуле, и тропинка вырастет сама. */}
        <LevelProgressMap gameId="one_line" currentLevel={lvl.level} maxLevel={LEVELS}
          onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('oneLineDesc')}</Text>
        </View>

        <TouchableOpacity onPress={start} accessibilityRole="button">
          <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
            <Text style={styles.startText}>{t('start')}</Text>
          </GradientSurface>
        </TouchableOpacity>
      </ScrollView>

      {phase === 'cleared' && (
        <LevelCleared gameId="one_line" level={playedLevel} stars={stars}
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
   * умолчание для игр, которые рисуют содержимое прямо в нём, а модуль свои
   * отступы и максимальную ширину доски считает сам. Двойной отступ ужал бы
   * граф на 32 px без причины. `alignSelf: 'stretch'` + отрицательные поля
   * дают ровно исходную ширину: растянутый элемент занимает
   * `ширина_родителя − 32 − (−16) − (−16)` и начинается с `16 + (−16) = 0`.
   */
  stage: { flex: 1, alignSelf: 'stretch', marginHorizontal: -16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  // 48×48, а не padding вокруг иконки. Скопировать шапку G1 дословно было
  // соблазнительно, но у неё `padding: 4` даёт 32×34 — это её единственная
  // запись в ROUTE_DEBT аудита попадания пальцем. Здесь сразу как у остальных.
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
});
