/* psygames-game-faces-names · VER 2 · 20.08.2026 */
/**
 * Лица и имена — связать процедурный портрет с точным именем и фактом.
 *
 * ПРОИСХОЖДЕНИЕ. Игра G4/8 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-faces-names`, коммит 3a9e968,
 * база — d203a4a). Модуль пришёл самодостаточным: своё ядро, свои строки, своя
 * разметка партии. Здесь — стыковка с приложением.
 *
 * ЧТО ТРЕНИРУЕТ. Не «память вообще», а АССОЦИАТИВНУЮ СВЯЗКУ: лицо → имя → факт.
 * Это тот самый бытовой провал «лицо помню, а как зовут — нет», и он ломается
 * не там, где обычная зрительная память: узнать лицо человек может, а достать
 * привязанное к нему произвольное слово — уже нет. Поэтому три компонента
 * считаются ОТДЕЛЬНО (узнавание / имя / факт), и порог прохождения требует
 * каждого: сильное узнавание лиц не должно прикрывать рассыпавшиеся имена.
 *
 * СЛОЖНОСТЬ РАСТЁТ ПЯТЬЮ ОСЯМИ, А НЕ ТАЙМЕРОМ. 33 уровня:
 *   · объём — от 2 до 12 человек (+1 каждые три уровня);
 *   · похожесть — с уровнем ложные лица и имена подбираются всё ближе к верному;
 *   · число вариантов — 2 → 3 (с 9-го) → 4 (с 17-го);
 *   · отсрочка — с 5-го уровня порядок проверки перемешан, а не «как показывали»;
 *   · факт — с 8-го уровня к лицу и имени добавляется третий компонент.
 * Между изучением и проверкой стоит арифметическая помеха (1 → 6 примеров),
 * и она БЕЗ отсчёта: задержку даёт число примеров, а не секундомер. Это важно
 * для вечернего шага зарядки, где таймеры запрещены.
 *
 * 🔴 ФИНАЛ ПАРТИИ — ОБЩИЙ ЭКРАН. Свой экран поздравления у модуля удалён совсем
 * (см. шапку FacesNamesGame.tsx): звёзды по уровням, серия чистых прохождений и
 * глаз-разрядка пишутся ТОЛЬКО в LevelCleared, и игра со своим итогом тихо
 * выпадает из всей бухгалтерии — как когда-то маджонг и парные картинки.
 *
 * 🔴 ИМЕНА НЕ ПЕРЕВОДЯТСЯ, И ЭТО РЕШЕНИЕ. Имя — сам предмет запоминания, и на
 * его буквах построен подбор ложных вариантов, поэтому набор один на все двенадцать
 * языков. Для шести нелатинских локалей под именем показана запись своими
 * знаками. Разбор целиком — в `src/games/faces-names/INTEGRATION.md`.
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
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { capPresetByLevel } from '@/src/services/presetCap';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import GameShell, { PAD_H } from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import FacesNamesGame from '@/src/games/faces-names/FacesNamesGame';
import {
  getFacesNamesStrings,
  isPassed,
  LEVELS as FACES_NAMES_LEVELS,
  type FacesNamesLocale,
  type FacesNamesMetrics,
} from '@/src/games/faces-names/core';

/** Цвет игры: сливовый → хвойный. Взят из HANDOFF модуля, в каталоге не повторяется. */
const GRADIENT = ['#7c3f58', '#256f68'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента:
// надпись лежит поперёк и попадает на весь размах, среднее здесь врёт.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/**
 * Языки модуля и языки приложения — один список из двенадцати, поэтому язык
 * передаётся как есть. Приведение нужно только типу: LanguageContext объявляет
 * свой union, модуль — свой, а сверяет их совпадение гейт faces-names-integration.
 */
const asLocale = (language: string): FacesNamesLocale => language as FacesNamesLocale;

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function FacesNamesScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const lvl = usePersistentLevel('faces_names');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();
  /**
   * Название и описание берём из СВОЕГО словаря модуля, а не из общего `t()`.
   * Ключи каталога (facesNames / facesNamesDesc) заводит владелец общих файлов
   * одним заходом на все восемь принимаемых игр — до тех пор общий словарь
   * вернул бы человеку само имя ключа прямо в шапке экрана (и это не догадка:
   * ровно это ловит гейт dictionary-duplicates). Модульный словарь
   * знает те же двенадцать языков, поэтому ждать карточки экрану незачем.
   */
  const gameStrings = getFacesNamesStrings(asLocale(language));

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<FacesNamesMetrics | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  /**
   * 🔴 УРОВЕНЬ, КОТОРЫЙ ТОЛЬКО ЧТО СЫГРАН, — ОТДЕЛЬНЫМ СОСТОЯНИЕМ.
   *
   * Поймано глазами 19.08.2026 на живой сборке: прошёл первый уровень, а плашка
   * сказала «Уровень 2 пройден!» и звезда легла в `psygames_faces_names_stars_*`
   * под ключ «2». Причина в порядке: `lvl.reach(level + 1)` поднимает уровень
   * хука, экран перерисовывается, `level` (он считается ОТ хука) становится уже
   * следующим — и LevelCleared получает не тот, что играли. Человек при этом
   * видит награду за уровень, которого не проходил, а за пройденный — не видит.
   */
  const [doneLevel, setDoneLevel] = React.useState(1);

  /**
   * Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
   *
   * ⚠️ Но не выше освоенного больше чем на шаг (см. `presetCap`): в программах
   * профилей у лиц и имён стоит `level: 12`, и человеку с первого уровня
   * выдавали двенадцатый — двенадцать лиц вместо трёх.
   */
  const level = capPresetByLevel({ want: num('level', lvl.level), atLevel: lvl.level, atTop: false });

  /**
   * Зерно фиксируем на уровень, а не на каждый заход: перезапуск того же уровня
   * должен давать ТЕХ ЖЕ людей. Иначе «не получилось — крутани ещё раз»
   * превращается в лотерею вместо второй попытки, а лица и имена — тот случай,
   * где вторая попытка по тому же набору и есть тренировка.
   */
  const [attempt, setAttempt] = React.useState(0);
  const seed = React.useMemo(() => `faces-names-${level}`, [level]);

  /**
   * Есть ли что терять — решает МОДУЛЬ (`hasSomethingToLose`), экран только
   * держит ответ и отдаёт каркасу: про фазы раунда каркас не знает.
   */
  const [armed, setArmed] = React.useState(false);

  // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => setPhase('playing'));

  const onComplete = React.useCallback(async (m: FacesNamesMetrics) => {
    /**
     * Порог считает САМ МОДУЛЬ (isPassed), а не экран. Здесь это не лень:
     * правило составное — общая точность ≥ 0.75 И узнавание ≥ 0.60 И имена
     * ≥ 0.60 И факты ≥ 0.50, когда они включены. Переписав его сюда числами,
     * мы завели бы второй источник правды, который разъедется с ядром при
     * первой же правке ядра.
     */
    const passed = isPassed(m);
    setLast(m);
    setDoneLevel(level);   // снимаем ДО повышения — иначе плашка назовёт следующий

    // Пресет и шаг зарядки уровень НЕ двигают — так во всех экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'faces_names',
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: level <= 7 ? 'easy' : level <= 16 ? 'medium' : 'hard',
        mode: m.specific.factRecallTotal > 0 ? 'face-name-fact' : 'face-name',
        errors: m.errors,
        details: {
          level,
          accuracy: m.accuracy,
          /**
           * Три точности порознь — самое ценное в этой игре. Общая цифра
           * прячет ровно то, ради чего в неё играют: человек может узнавать
           * все лица и не вспомнить ни одного имени, и это НЕ «85% в среднем»,
           * а конкретный дефицит, который видно только покомпонентно.
           */
          face_recognition_accuracy: m.specific.faceRecognitionAccuracy,
          name_recall_accuracy: m.specific.nameRecallAccuracy,
          fact_recall_accuracy: m.specific.factRecallAccuracy,
          person_count: m.specific.personCount,
          interference_rounds: m.specific.interferenceRounds,
          interference_correct: m.specific.interferenceCorrect,
          mean_face_similarity: m.specific.meanFaceSimilarity,
          mean_name_similarity: m.specific.meanNameSimilarity,
          seed: m.seed,
          generator_version: m.generatorVersion,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl]);

  /**
   * Звёзды по общей точности: порог прохождения уже разложен по компонентам в
   * isPassed, а звёзды — про «насколько чисто», и дробить их ещё раз незачем.
   */
  const stars = last ? (last.accuracy >= 0.95 ? 3 : last.accuracy >= 0.85 ? 2 : 1) : 1;

  const start = () => { setArmed(false); setAttempt((n) => n + 1); setPhase('playing'); };

  /** Уйти в экран настройки — сюда ведёт и «назад» каркаса, и конец партии. */
  const leaveToConfig = React.useCallback(() => { setArmed(false); setPhase('config'); }, []);

  if (phase === 'playing') {
    return (
      /**
       * 🔴 ОБЩИЙ КАРКАС, А НЕ ГОЛАЯ РАМКА. Раньше партия висела в пустом
       * SafeAreaView: выйти можно было только через кнопку на экране правил или
       * через свою паузу модуля, а окно отзыва поверх игры её не
       * останавливало — человек дописывал отзыв и возвращался к незнакомому
       * лицу. Каркас даёт и место выхода с вопросом, и плашку паузы.
       */
      <GameShell
        title={gameStrings.title}
        onBack={leaveToConfig}
        /**
         * Спрашиваем только когда терять есть что: на экране правил ещё ничего
         * не показано и уходим молча. С первого заученного лица — уже нет:
         * набор выпадет тот же, а вот минута запоминания не вернётся.
         */
        confirmExit={armed}
      >
        <View style={styles.stage}>
          <FacesNamesGame
            key={attempt}                 /* новый заход — чистое состояние модуля */
            seed={seed}
            level={level}
            locale={asLocale(language)}
            /**
             * Время партии — по ИГРОВЫМ часам: пока человек пишет отзыв, они стоят.
             * Настенные `Date.now` внутри модуля запрещены и пропсом не подставлены
             * по умолчанию — забыть эту строку нельзя, тип не даст.
             */
            now={gameNow}
            /**
             * Тему отдаём ЦЕЛИКОМ, а не три цвета: у модуля палитра по умолчанию
             * светлая, а у нас есть тёмные профили — недокрашенная игра была бы
             * белым пятном посреди тёмного приложения.
             */
            theme={{
              background: colors.background,
              surface: colors.surface,
              card: colors.surface,
              text: colors.text,
              textSecondary: colors.textSecondary,
              border: colors.border,
              /**
               * 🔴 primary = ЦВЕТ ИГРЫ, а не акцент профиля. Модуль красит им
               * главные кнопки партии. Отдай сюда `colors.primary` — внутри игры
               * кнопки станут акцентом профиля (оранжевым, синим — каким угодно),
               * а снаружи, на экране настроек, останется градиент игры: один
               * экран, две разные схемы.
               */
              primary: GRADIENT[0],
              /** Текст на этой кнопке — тот же, что и на плашке: посчитан, а не «белый». */
              onPrimary: ON_GRAD.color,
              success: colors.success,
              error: colors.error,
              warning: colors.warning,
            }}
            gameGradient={GRADIENT as [string, string]}
            gameGradientText={ON_GRAD.color}
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
          accessibilityRole="button" accessibilityLabel={t('back')}>
          <Ionicons name="arrow-back" size={24} color={ON_GRAD.color} />
        </TouchableOpacity>
        <Text style={styles.title}>{gameStrings.title}</Text>
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
          <LevelProgressMap bestLevel={lvl.best} gameId="faces_names" currentLevel={lvl.level}
            onPickLevel={lvl.pick} maxLevel={Math.max(FACES_NAMES_LEVELS, lvl.best)}
            colors={colors} language={language} />

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{gameStrings.rulesBody}</Text>
          </View>

          <TouchableOpacity onPress={start} accessibilityRole="button">
            <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
              <Text style={styles.startText}>{t('start')}</Text>
            </GradientSurface>
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === 'cleared' && (
        <LevelCleared gameId="faces_names" level={doneLevel} stars={stars}
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
   * отступы и максимальную ширину карточки считает сам. Двойной отступ ужал бы
   * портрет на 32 px без причины. `alignSelf: 'stretch'` + отрицательные поля
   * дают ровно исходную ширину: растянутый элемент занимает
   * `ширина_родителя − 32 − (−16) − (−16)` и начинается с `16 + (−16) = 0`.
   */
  // Поле во всю ширину: гасим боковой отступ каркаса ЕГО ЖЕ числом (см. PAD_H).
  stage: { flex: 1, alignSelf: 'stretch', marginHorizontal: -PAD_H },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  // 48×48 — норма попадания пальцем; у «Прикидки» здесь стоял padding 4 и кнопка
  // выходила 32×34, из-за чего аудит держал по ней долг. Повторять не будем.
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
});
