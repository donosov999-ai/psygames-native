/* psygames-game-dots-connect · VER 2 · 20.08.2026 */
/**
 * Соедини точки — пути между парами, которые обязаны занять ВСЮ сетку.
 *
 * ПРОИСХОЖДЕНИЕ. Игра G2/8 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-dots-connect`, коммит 0042698a,
 * база — d203a4a). Модуль пришёл самодостаточным: своё ядро, свой словарь ru/en,
 * свой экран правил и своя тренировочная сетка. Здесь — стыковка с приложением.
 *
 * ЧТО ТРЕНИРУЕТ. Пространственное планирование, а не сообразительность на скорость.
 * Соединить пару легко; трудно соединить ВСЕ пары так, чтобы не осталось пустых
 * клеток. Значит путь надо прикидывать заранее, а не тянуть по кратчайшей: жадный
 * ход первой пары запирает четвёртую. Это и есть предмет — держать в голове
 * последствия своего хода на несколько шагов вперёд.
 *
 * СЛОЖНОСТЬ РАСТЁТ ПОЛЕМ, А НЕ ТАЙМЕРОМ. 40 уровней, ось — размер сетки и число
 * пар: 1–6 4×4 (3→4 пары) · 7–12 5×5 (4→5) · 13–18 6×6 (5→6) · 19–24 7×7 (6→7) ·
 * 25–30 8×8 (7→8) · 31–40 экспертные 8×8 на восемь пар. Таймера в игре нет вовсе,
 * и последняя ступень намеренно варьирует раскладки вместо «то же самое, но
 * быстрее» — сокращённый таймер новым содержанием не является.
 *
 * 🔴 СВОЙ ЭКРАН ИТОГА МОДУЛЯ НЕ ПОКАЗЫВАЕМ — `showOwnResults={false}`. У модуля
 * есть собственный экран поздравления, и в лаборатории он по умолчанию включён.
 * В приложении это означало бы тихое выпадение из всей бухгалтерии: звёзды по
 * уровням, серия чистых прохождений и глаз-разрядка пишутся ТОЛЬКО в LevelCleared.
 * Ровно так когда-то выпали маджонг и парные картинки. Гейт `game-standard` это
 * отбивает, и правильно.
 *
 * 🔴 ПОРОГ ПРОХОЖДЕНИЯ БЕРЁМ ИЗ МОДУЛЯ (`isPassed`), А НЕ СВОЙ. Соблазн был
 * написать здесь свою константу, как в «Прикидке». Но здесь это была бы ВТОРАЯ
 * копия правила: модуль уже считает `accuracy = optimalEdges / (optimalEdges +
 * исправления)` и держит порог 0.80 — то есть «правок не больше четверти
 * оптимального маршрута». Две копии разъезжаются молча, и разъедется именно та,
 * что в экране: её никто не тестирует свойствами.
 *
 * 🔴 ТРЕНИРОВКА — ОДИН РАЗ ЗА ЗАХОД, А НЕ ПЕРЕД КАЖДЫМ УРОВНЕМ. Модуль ведёт
 * первое знакомство сам: правила → тренировочная сетка 4×4 → партия. Для первого
 * раза это верно, правила этой игры по доске не угадываются («занять всю сетку»
 * нигде не написано). Но уровней сорок, и LevelCleared зовёт следующий сразу —
 * без двери мимо тренировки человек решал бы одну и ту же сетку 4×4 сорок раз.
 * Поэтому первый «Начать» за визит идёт через правила, а «Продолжить» и все
 * следующие — сразу в партию (`skipIntro`). Вернуться к правилам можно кнопкой
 * на экране настроек, чтобы они не пропали навсегда.
 *
 * 🔴 ШАПКА С «НАЗАД» ВО ВРЕМЯ ПАРТИИ — НАША, НЕ МОДУЛЯ. Модуль рисует кнопку
 * выхода ТОЛЬКО на экране правил. Пропустив правила, человек оказывался бы в
 * партии без единого способа уйти: пауза даёт только «продолжить» и «заново».
 * На вебе (а Android у нас WebView) аппаратной «назад» под рукой нет.
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
import DotsConnectGame from '@/src/games/dots-connect/DotsConnectGame';
import { LEVELS, getDotsStrings, isPassed, type DotsMetrics } from '@/src/games/dots-connect/core';

/** Опознавательный знак игры в каталоге. Синий → бирюзовый: пути и сетка. */
const GRADIENT = ['#2563eb', '#0f766e'];
// Цвет надписи поверх плашки считает onGradientText по ОБОИМ концам градиента,
// а не по среднему: заголовок лежит поперёк и попадает на весь размах.
// Здесь белый берёт AA на обоих концах (5.17 и 5.47), вуаль не нужна.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function DotsConnectScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const lvl = usePersistentLevel('dots_connect');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();
  /**
   * 🔴 НАЗВАНИЕ И ОПИСАНИЕ БЕРЁМ ИЗ СЛОВАРЯ МОДУЛЯ, А НЕ ЧЕРЕЗ t().
   *
   * Сперва здесь стояли обращения к словарю по ключам dotsConnect и
   * dotsConnectDesc — по образцу соседних экранов. Но этих ключей в общем
   * словаре ещё нет: их заводит
   * отдельный заход регистрации (см. INTEGRATION.md рядом с модулем), а до тех
   * пор t() возвращает САМО ИМЯ КЛЮЧА, и в шапке игры было бы написано
   * «dotsConnect». Ровно это стережёт гейт dictionary-duplicates, и он прав:
   * так же однажды на кнопке появилось «validateBtn».
   *
   * Модуль свои ru/en строки везёт с собой — значит экран берёт их у него и
   * перестаёт зависеть от общего словаря вовсе. Ключи каталога всё равно нужны
   * (карточка в списке игр читает nameKey/descKey), но это работа регистрации,
   * а не этого экрана, и общий словарь правит один заход, а не семь параллельных.
   *
   * ⚠️ Остальные 10 языков модуль пока не знает и откатывается на en. Это
   * записано в HANDOFF как граница G2, а не забыто здесь.
   */
  const locale = language === 'ru' ? 'ru' : 'en';
  const strings = getDotsStrings(locale);

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<DotsMetrics | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  /**
   * 🔴 УРОВЕНЬ, КОТОРЫЙ ТОЛЬКО ЧТО ИГРАЛИ. Отдельное состояние, а не `level`.
   *
   * Поймано глазами в браузере 19.08.2026, гейтами не ловилось. `level`
   * вычисляется на КАЖДОМ рендере из `lvl.level`, а `lvl.reach(level + 1)`
   * поднимает его прямо перед показом итога. К моменту отрисовки LevelCleared
   * там уже лежит СЛЕДУЮЩИЙ номер, и человек, пройдя первый уровень, читал
   * «Уровень 2 пройден! … Запускаем уровень 3», а звёзды ложились в ключ
   * второго уровня — первый оставался пустым узлом на тропинке навсегда.
   *
   * Берём число из самой метрики: модуль пишет туда уровень партии, и это
   * единственный источник, который не может съехать от порядка setState.
   */
  const [doneLevel, setDoneLevel] = React.useState(1);

  // Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  const level = num('level', lvl.level);

  /**
   * Зерно фиксируем на уровень, а не на каждый заход: перезапуск того же уровня
   * должен давать ТУ ЖЕ раскладку. Иначе «не вышло — крутани ещё раз»
   * превращается в лотерею вместо второй попытки — а вся игра про то, чтобы
   * увидеть, где именно ты запер себе клетку.
   */
  const seed = React.useMemo(() => `dots-connect-${level}`, [level]);

  /**
   * Номер захода. Растёт на каждом «Начать» и заставляет модуль пересобрать
   * партию с нуля. Он же решает, показывать ли правила: заход 0 — знакомство,
   * дальше сразу партия.
   */
  const [attempt, setAttempt] = React.useState(0);
  const [withIntro, setWithIntro] = React.useState(true);
  /**
   * Есть ли что терять — решает МОДУЛЬ (`hasSomethingToLose`), экран только
   * держит ответ и отдаёт каркасу: про фазы раунда каркас не знает.
   */
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => { if (autostart) setPhase('playing'); }, [autostart]);

  const onComplete = React.useCallback(async (m: DotsMetrics) => {
    // Порог живёт в модуле — здесь только читаем, чтобы не завести вторую копию правила.
    const passed = isPassed(m);
    const played = m.details.level;
    setLast(m);
    setDoneLevel(played);

    // Пресет и шаг зарядки уровень НЕ двигают — так во всех экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'dots_connect',
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: level <= 12 ? 'easy' : level <= 24 ? 'medium' : 'hard',
        mode: `${m.specific.gridSize}x${m.specific.gridSize}`,
        errors: m.errors,
        details: {
          // ⚠️ level обязателен: по нему getMaxLevelFromSessions восстанавливает
          // прогресс, когда ключ потерян (сброс профиля, смена профиля).
          // Берём из метрики, а не из состояния экрана: см. doneLevel выше.
          level: played,
          accuracy: m.accuracy,
          normalized_difficulty: m.difficulty,
          seed: m.seed,
          generator_version: m.generatorVersion,
          grid_size: m.specific.gridSize,
          pair_count: m.specific.pairCount,
          // Самое ценное в разборе: ходы вперёд против откатов. Много откатов при
          // высокой точности — человек планирует, но не проверяет себя до хода.
          forward_moves: m.specific.forwardMoves,
          backtracks: m.specific.backtracks,
          undo_count: m.specific.undoCount,
          invalid_moves: m.specific.invalidMoves,
          optimal_edges: m.specific.optimalEdges,
          path_efficiency: m.specific.pathEfficiency,
          coverage: m.specific.coverage,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl]);

  /**
   * Звёзды по чистоте маршрута: она и есть предмет игры. Заполнить сетку можно
   * и перебором, но тогда исправлений много и точность падает — три звезды
   * значит «прошёл почти без правок», то есть спланировал, а не нащупал.
   */
  const stars = last ? (last.accuracy >= 0.97 ? 3 : last.accuracy >= 0.9 ? 2 : 1) : 1;

  /** intro=true — через правила и тренировку; false — сразу партия. */
  const start = (intro: boolean) => {
    setArmed(false);
    setWithIntro(intro);
    setAttempt((n) => n + 1);
    setPhase('playing');
  };

  /** Уйти в экран настройки — сюда ведёт и «назад» каркаса, и конец партии. */
  const leaveToConfig = React.useCallback(() => { setArmed(false); setPhase('config'); }, []);

  if (phase === 'playing') {
    return (
      /**
       * 🔴 ОБЩИЙ КАРКАС ВМЕСТО СВОЕЙ ШАПКИ. Своя шапка сюда была поставлена
       * потому, что без неё из партии не выйти вовсе; но она давала ровно
       * кнопку — и уводила МОЛЧА, стирая проложенные пути одним промахом.
       * Каркас даёт то же место выхода плюс две вещи, которых своя рамка не
       * умела: вопрос «партия пропадёт» и плашку паузы, пока человек пишет
       * отзыв, — до этого игра под окном отзыва просто продолжала идти.
       *
       * ⚠️ Градиентная шапка при этом ушла, и это осознанно: на 61 экране из 67
       * шапка партии выглядит одинаково (стрелка — название — правый слот), и
       * своя раскраска здесь ценой была бы ровно то же расхождение, ради
       * лечения которого каркас и заведён.
       */
      <GameShell
        title={strings.title}
        onBack={leaveToConfig}
        /**
         * Спрашиваем только когда терять есть что: правила, тренировочный круг
         * и партия без единого хода уходят молча — раскладка фиксирована
         * уровнем и вернётся такой же. Первый проложенный путь — уже нет.
         */
        confirmExit={armed}
      >
        <View style={styles.stage}>
          <DotsConnectGame
            key={attempt}                 /* новый заход — чистое состояние модуля */
            seed={seed}
            level={level}
            locale={locale}
            /**
             * 🔴 Свой экран поздравления модуля выключен: итог уровня рисует
             * LevelCleared, и только он ведёт звёзды, серию и глаз-разрядку.
             */
            showOwnResults={false}
            skipIntro={!withIntro}
            /**
             * 🔴 Игровые часы вместо настенных. Модуль по умолчанию берёт
             * `Date.now`, и тогда время партии продолжало бы идти, пока человек
             * пишет отзыв поверх игры. Оба конца отсчёта (старт партии и момент
             * завершения) модуль берёт из ЭТОЙ функции, значит разность
             * автоматически становится игровым временем.
             */
            now={gameNow}
            /**
             * Тему отдаём ЦЕЛИКОМ, а не три цвета: у модуля палитра по умолчанию
             * своя, и в тёмных профилях недокрашенная игра была бы белым пятном.
             * Ключи модуля совпадают с ThemeColors один в один.
             */
            theme={{
              background: colors.background,
              surface: colors.surface,
              card: colors.card,
              text: colors.text,
              textSecondary: colors.textSecondary,
              /**
               * 🔴 primary = ЦВЕТ ИГРЫ, а не акцент профиля. Модуль красит им свою
               * плашку и главную кнопку. Отдать сюда `colors.primary` значит: внутри
               * игры кнопка станет акцентом профиля (оранжевым, синим — каким
               * угодно), а снаружи, на экране настроек, останется градиент игры.
               * Один экран, две разные схемы.
               */
              primary: GRADIENT[0],
              // Надпись на этой кнопке — по расчёту контраста, а не `background`:
              // в тёмных профилях чёрный на #2563eb даёт 4.06 при норме 4.5.
              primaryText: ON_GRAD.color,
              border: colors.border,
              success: colors.success,
              error: colors.error,
              warning: colors.warning,
            }}
            gameGradient={GRADIENT as [string, string]}
            gameGradientText={ON_GRAD.color}
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
        <Text style={styles.title}>{strings.title}</Text>
      </GradientSurface>

      <ScrollView contentContainerStyle={styles.body}>
        {/* maxLevel из модуля: по умолчанию тропинка рисует 15 узлов, а тут их 40. */}
        <LevelProgressMap gameId="dots_connect" currentLevel={lvl.level} maxLevel={LEVELS}
          onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{strings.rulesBody}</Text>
          {/* Вторая строка — не украшение. «Занять ВСЮ сетку» по доске не угадывается,
              а именно из-за этого условия игра про планирование, а не про «соедини и всё». */}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{strings.rulesCoverage}</Text>
        </View>

        <TouchableOpacity onPress={() => start(attempt === 0)} accessibilityRole="button">
          <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
            <Text style={styles.startText}>{t('start')}</Text>
          </GradientSurface>
        </TouchableOpacity>

        {/*
          Дверь обратно к правилам и тренировке. Без неё они показывались бы
          ровно один раз за визит и потом исчезали навсегда — а вспомнить, что
          сетку надо занять ЦЕЛИКОМ, человеку может понадобиться и на 20-м уровне.
        */}
        {attempt > 0 && (
          <TouchableOpacity onPress={() => start(true)} accessibilityRole="button"
            style={[styles.rulesBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {/* Ключ `btn_help` уже есть и переведён на все 12 языков — новый заводить незачем. */}
            <Text style={[styles.rulesText, { color: colors.text }]}>{t('btn_help')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {phase === 'cleared' && (
        <LevelCleared gameId="dots_connect" level={doneLevel} stars={stars}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => start(false)} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && last && (
        <GameResult
          score={last.score}
          time={last.durationMs / 1000}
          errors={last.errors}
          onPlayAgain={() => start(false)} onGoHome={() => goBackOrHome()}
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
   * отступы (и максимальную ширину доски) считает сам. Двойной отступ ужал бы
   * сетку на 32 px без всякой причины. `alignSelf: 'stretch'` + отрицательные
   * поля дают ровно исходную ширину: растянутый элемент занимает
   * `ширина_родителя − 32 − (−16) − (−16)` и начинается с `16 + (−16) = 0`.
   */
  stage: { flex: 1, alignSelf: 'stretch', marginHorizontal: -16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 6 },
  // 48×48 — норма Material и ровно то, что стоит на 63 играх из 64. У «Прикидки»
  // здесь padding 4 при иконке 24, то есть 32×34, и это записано в долг аудита
  // попадания пальцем; повторять её ошибку незачем.
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
  rulesBtn: { minHeight: 48, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  rulesText: { fontSize: 15, fontWeight: '700' },
});
