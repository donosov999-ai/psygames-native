/* psygames-game-rhythm-pitch · VER 2 · 20.08.2026 */
/**
 * Ритм и высота — эхо ритма и путь высот, на слух и без микрофона.
 *
 * ПРОИСХОЖДЕНИЕ. Игра G7 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-rhythm-pitch`, коммит 4add8d08,
 * база — d203a4a). Модуль пришёл самодостаточным: своё ядро, свой словарь ru/en,
 * свой синтез звука на Web Audio. Здесь — стыковка с приложением.
 *
 * ЧТО ТРЕНИРУЕТ. Слух, а не глаз: временной порядок и слуховую рабочую память.
 * «Эхо ритма» — удержать в голове рисунок ударов и повторить его в том же
 * времени; «Путь высоты» — удержать последовательность высот. Ни одна другая
 * игра каталога этого не трогает: 60+ упражнений работают через зрение, а три
 * речевые (фонемы, псевдослова, слуховой охват) — через СЛОВО. Здесь слова нет
 * вовсе, поэтому язык человека на сложность не влияет.
 *
 * СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ. Уровни 1–31, режимы чередуются через один
 * (нечётный — ритм, чётный — высота). Ритм: 3→12 ударов, 60→160 BPM, с 4-го
 * уровня паузы, с 5-го акценты, с 7-го синкопы. Высота: 1–3 «выше или ниже?»,
 * дальше путь из 3→10 тонов, а интервал между тонами сжимается с 6 полутонов до
 * одного. BPM здесь — скорость ЗВУКА, а не срок ответа: отвечают без таймера.
 *
 * 🔴 РАУНД ВЕДЁТ МОДУЛЬ, ФИНАЛ — ПРИЛОЖЕНИЕ. У модуля есть свой экран итога, и
 * он выключен (`showOwnResults={false}`): звёзды по уровням, серия чистых
 * прохождений и глаз-разрядка пишутся ТОЛЬКО в LevelCleared. Свой экран
 * поздравления = тихое выпадение из всей бухгалтерии, как когда-то у маджонга и
 * парных картинок. Гейт `game-standard` это отбивает, и правильно.
 *
 * 🔴 ЗВУК. Это первая игра каталога, у которой звук — не украшение, а СОДЕРЖАНИЕ.
 * Отсюда два решения, каждое честное до конца:
 *
 *   1. ОБЩИЙ ТУМБЛЕР ГЛАВНЕЕ ИГРЫ. Проверка одна на всё приложение —
 *      `soundOn()` из `services/feedback`. Она стоит не только здесь, на входе,
 *      но и в самом движке (`src/games/rhythm-pitch/appAudio.ts`): пока звук
 *      выключен, не создаётся ни один осциллятор. Экранной проверки мало —
 *      тумблер можно выключить, когда партия уже идёт.
 *      Вход при выключенном звуке не прячем и не подсовываем немую игру:
 *      говорим прямо, что тренажёр звуковой, и даём включить звук одной кнопкой.
 *
 *   2. ТИХИЙ ВЕЧЕР — ЭТО «НЕ СЕГОДНЯ», А НЕ «БЕЗ ЗВУКА». На вечернем и ночном
 *      шаге зарядки `useCalmHush` глушит звук всему приложению, и это правильно:
 *      набор задуман как успокоение перед сном. Но игра про звук без звука — не
 *      «щадящий режим», а обман: человек нажмёт «Начать» и попадёт в тишину.
 *      Поэтому в спокойном шаге игра честно говорит, что она дневная, и не
 *      запускается. Отсюда же требование к зарядке: в ВЕЧЕРНИЙ набор её не
 *      ставить (`EVENING_BY_WEEKDAY`, `evening_playlist`) — иначе шаг станет
 *      тупиком. Точные строки — в `src/games/rhythm-pitch/INTEGRATION.md`.
 *
 * 🔴 ЧАСЫ. Ритм — это время, поэтому время партии идёт по `gameNow()`, а не по
 * настенным часам: пока человек пишет отзыв, часы стоят. И тот же `gameNow`
 * отдан ДВИЖКУ — ожидаемое время сигнала и время нажатия обязаны быть на одних
 * часах, иначе поправка задержки (она зажата −250…+500 мс) молча упрётся в
 * границу и испортит счёт.
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
import { getSoundEnabled, setSoundEnabled } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import GameShell from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import { RhythmPitchGame } from '@/src/games/rhythm-pitch/RhythmPitchGame';
import { createAppToneAudioEngine } from '@/src/games/rhythm-pitch/appAudio';
import {
  LEVELS,
  RHYTHM_PITCH_MODES,
  getRhythmPitchStrings,
  isPassed,
  type RhythmPitchLocale,
  type RhythmPitchMetrics,
  type RhythmPitchMode,
} from '@/src/games/rhythm-pitch/core';

/**
 * Опознавательный знак игры: индиго → бирюза, ни у кого в каталоге такого нет.
 * ⚠️ Лаборатория предлагала `#7c3aed → #ec4899` — этот занят хабом «Конфликт
 * внимания», и две карточки в каталоге были бы неразличимы.
 *
 * Цвет текста поверх плашки считает onGradientText по ОБОИМ концам: белый тонет
 * на бирюзовом конце, чёрный — на индиговом. Сплошным цветом AA тут недостижим
 * вовсе, поэтому GradientSurface кладёт поверх вуаль цветом самого градиента.
 */
const GRADIENT = ['#4338ca', '#22d3ee'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/**
 * Звёзды по точности. Порог прохождения берём НЕ свой, а канонический из модуля
 * (`isPassed` = accuracy ≥ 0.70): у ритма точность считается по средней ошибке
 * времени с допуском в 30% доли, и что считать «попал» знает ядро игры, а не
 * экран. Свой второй порог здесь развёл бы игру и её же приёмку.
 */
function starsFor(accuracy: number): number {
  if (accuracy >= 0.95) return 3;
  if (accuracy >= 0.85) return 2;
  return 1;
}

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function RhythmPitchScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const lvl = usePersistentLevel('rhythm_pitch');
  const { isPreset, autostart, num, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();

  /**
   * Строки экрана берём из СЛОВАРЯ МОДУЛЯ, а не из общего `t()`. Причина простая:
   * общий словарь правится один раз на все семь приёмок, а `t()` для незаведённого
   * ключа возвращает сам ключ — человек увидел бы «rhythmPitchSoundOff». Точные
   * строки для словаря лежат в INTEGRATION.md; когда их заведут, эти три подписи
   * можно перевести на `t()` и получить все 12 языков вместо двух.
   */
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
  const locale = language as RhythmPitchLocale;
  const strings = getRhythmPitchStrings(locale);

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<RhythmPitchMetrics | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  /**
   * Уровень, который ТОЛЬКО ЧТО сыгран. Отдельно от `level` нарочно: `level`
   * считается из `lvl.level`, а тот растёт сразу по `reach()` — и плашка итога
   * успевала показать «Уровень 2 пройден!» за пройденный ПЕРВЫЙ. Поймано глазами
   * в браузере 19.08.2026, на первой же партии.
   */
  const [doneLevel, setDoneLevel] = React.useState(1);
  /** null — тумблер звука ещё не прочитан из хранилища; до этого решать рано. */
  const [soundPref, setSoundPref] = React.useState<boolean | null>(null);

  // Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  const level = Math.min(LEVELS, Math.max(1, num('level', lvl.level)));
  /** Шаг зарядки может попросить конкретный режим; иначе он чередуется по уровню. */
  const askedMode = str('mode', '');
  const presetMode = (RHYTHM_PITCH_MODES as readonly string[]).includes(askedMode)
    ? (askedMode as RhythmPitchMode)
    : undefined;

  /**
   * Зерно фиксируем на уровень, а не на каждый заход: перезапуск того же уровня
   * должен давать ТОТ ЖЕ ритм и ТОТ ЖЕ путь высот. Иначе «не получилось — крутани
   * ещё раз» превращается в лотерею вместо второй попытки.
   */
  const [attempt, setAttempt] = React.useState(0);
  const seed = React.useMemo(() => `rhythm-pitch-${level}`, [level]);

  /**
   * Есть ли что терять — решает МОДУЛЬ (`hasSomethingToLose`), экран только
   * держит ответ и отдаёт каркасу: про фазы раунда каркас не знает.
   */
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    getSoundEnabled().then((v) => { if (alive) setSoundPref(v); }).catch(() => { if (alive) setSoundPref(true); });
    return () => { alive = false; };
  }, []);

  /** Звук выключен человеком либо приглушён спокойным шагом — играть нечем. */
  const soundOff = soundPref === false;
  const muted = soundOff || isCalm;

  /**
   * Движок один на весь экран и живёт дольше партии: пересоздавать AudioContext
   * на каждый заход — верный способ упереться в лимит контекстов браузера.
   * Модуль считает его ЧУЖИМ (`audioEngine` передан снаружи) и на размонтаже
   * только глушит, а закрывать обязан тот, кто завёл, то есть мы.
   */
  const localeRef = React.useRef(locale);
  React.useEffect(() => { localeRef.current = locale; }, [locale]);
  const [engine] = React.useState(() => createAppToneAudioEngine({
    mutedMessage: () => getRhythmPitchStrings(localeRef.current).soundOffNotice,
  }));
  React.useEffect(() => () => { void engine.dispose(); }, [engine]);

  // Автостарт (шаг зарядки, вызов дня) ждёт ответа про звук: иначе успеет
  // прыгнуть в игру раньше, чем выяснится, что играть в тишину нечем.
  // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && soundPref !== null && !muted && lvl.loaded, () => setPhase('playing'));

  const onComplete = React.useCallback(async (m: RhythmPitchMetrics) => {
    const passed = isPassed(m);
    setLast(m);
    setDoneLevel(level);

    // Пресет и шаг зарядки уровень НЕ двигают — так во всех экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'rhythm_pitch',
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: level <= 7 ? 'easy' : level <= 19 ? 'medium' : 'hard',
        mode: m.specific.mode,
        errors: m.errors,
        details: {
          level,
          accuracy: m.accuracy,
          // Поправка задержки и число замеров — это ПРО УСТРОЙСТВО, а не про
          // человека: без них разбор «почему у него ритм всегда мимо» невозможен,
          // мимо может быть не он, а колонка через Bluetooth.
          calibration_offset_ms: m.specific.calibrationOffsetMs,
          calibration_samples: m.specific.calibrationSamples,
          replay_count: m.specific.replayCount,
          mean_timing_error_ms: m.specific.meanTimingErrorMs,
          missing_taps: m.specific.missingTaps,
          extra_taps: m.specific.extraTaps,
          bpm: m.specific.bpm,
          pitch_task: m.specific.pitchTask,
          tone_count: m.specific.toneCount,
          interval_semitones: m.specific.intervalSemitones,
          generator_version: m.generatorVersion,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl]);

  const stars = last ? starsFor(last.accuracy) : 1;

  const start = () => { setArmed(false); setAttempt((n) => n + 1); setPhase('playing'); };
  const turnSoundOn = () => { void setSoundEnabled(true); setSoundPref(true); };

  /** Уйти в экран настройки — сюда ведёт и «назад» каркаса, и конец партии. */
  const leaveToConfig = React.useCallback(() => { setArmed(false); setPhase('config'); }, []);

  if (phase === 'playing') {
    return (
      /**
       * 🔴 ОБЩИЙ КАРКАС, А НЕ ГОЛАЯ РАМКА. Раньше партия висела в пустом
       * SafeAreaView: выйти можно было только через кнопку на экране правил, а
       * окно отзыва поверх игры её не останавливало — ритм тут меряется в
       * миллисекундах, и партия под окном отзыва становилась заведомо
       * проигранной. Каркас даёт и место выхода с вопросом, и плашку паузы.
       */
      <GameShell
        title={strings.title}
        onBack={leaveToConfig}
        /**
         * Спрашиваем только когда терять есть что: на правилах уходим молча, а
         * с первого удара подстройки — уже нет. Задание выпадет то же (зерно
         * фиксировано уровнем), но поправку задержки придётся набивать заново.
         */
        confirmExit={armed}
      >
        <View style={styles.stage}>
          <RhythmPitchGame
            key={attempt}                 /* новый заход — чистое состояние модуля */
            seed={seed}
            level={level}
            mode={presetMode}
            locale={locale}
            /**
             * Тему отдаём ЦЕЛИКОМ, а не три цвета: у модуля нет палитры по
             * умолчанию, а профили у нас бывают тёмные.
             */
            theme={{
              background: colors.background,
              surface: colors.surface,
              card: colors.card,
              text: colors.text,
              textSecondary: colors.textSecondary,
              border: colors.border,
              /**
               * 🔴 primary = ЦВЕТ ИГРЫ, а не акцент профиля. Модуль красит им
               * заголовок и главную кнопку. Отдать сюда `colors.primary` значит
               * получить внутри игры оранжевую (или синюю — какую угодно) шапку,
               * а снаружи, на экране настроек, градиент игры: один экран, две схемы.
               */
              primary: GRADIENT[0],
              success: colors.success,
              error: colors.error,
              warning: colors.warning,
            }}
            gameGradient={GRADIENT as unknown as readonly [string, string]}
            gameGradientText={ON_GRAD.color}
            showOwnResults={false}
            audioEngine={engine}
            now={gameNow}
            onComplete={onComplete}
            onProgress={setArmed}
            /**
             * 🔴 `onExit` МОДУЛЮ НЕ ОТДАЁМ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Его кнопки
             * «Выход» уводили бы МИМО вопроса при выходе — тем самым способом, от
             * которого вопрос и защищает. Выход теперь один: «назад» в шапке
             * каркаса, он же ловит аппаратную. Тупика это не создаёт: на экране
             * «звук недоступен» шапка каркаса стоит ровно там же.
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
        {/* 48×48 — в математической прикидке ровно эта кнопка вышла 32×34 и попала
            в долг аудита попадания пальцем. Повторять чужую ошибку незачем. */}
        <TouchableOpacity onPress={() => goBackOrHome()} style={styles.back}
          accessibilityRole="button" accessibilityLabel={t('back')}>
          <Ionicons name="arrow-back" size={24} color={ON_GRAD.color} />
        </TouchableOpacity>
        <Text style={styles.title}>{strings.title}</Text>{/* ← ключ словаря `rhythmPitch`, когда заведут */}
      </GradientSurface>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Тропинка во всю длину лестницы: у модуля 31 ступень, а у карты по
            умолчанию 15 — без этого человек видел бы путь вдвое короче настоящего. */}
        <LevelProgressMap bestLevel={lvl.best} gameId="rhythm_pitch" currentLevel={lvl.level} maxLevel={LEVELS}
          onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
          {/* ← ключ словаря `rhythmPitchDesc`, когда заведут */}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{strings.catalogDesc}</Text>
        </View>

        {/* Спокойный шаг главнее выключенного тумблера: там играть нельзя вовсе,
            а здесь достаточно включить звук. */}
        {isCalm ? (
          <View style={[styles.card, styles.notice, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
            <Ionicons name="moon-outline" size={22} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.text }]}>{strings.calmNotice}</Text>
          </View>
        ) : soundOff ? (
          <View style={[styles.card, styles.notice, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
            <Ionicons name="volume-mute-outline" size={22} color={colors.warning} />
            <View style={styles.noticeBody}>
              <Text style={[styles.noticeText, { color: colors.text }]}>{strings.soundOffNotice}</Text>
              <TouchableOpacity onPress={turnSoundOn} style={[styles.soundBtn, { borderColor: colors.warning }]}
                accessibilityRole="button" accessibilityLabel={strings.enableSound}>
                <Text style={[styles.soundBtnText, { color: colors.text }]}>{strings.enableSound}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={start} accessibilityRole="button" accessibilityLabel={t('start')}>
            <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
              <Text style={styles.startText}>{t('start')}</Text>
            </GradientSurface>
          </TouchableOpacity>
        )}
      </ScrollView>

      {phase === 'cleared' && (
        <LevelCleared gameId="rhythm_pitch" level={doneLevel} stars={stars}
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
   * отступы и максимальную ширину карточек считает сам. Двойной отступ ужал бы
   * площадку для удара на 32 px — по ней бьют пальцем в такт, и лишнего края
   * ей взять неоткуда. `alignSelf: 'stretch'` + отрицательные поля дают ровно
   * исходную ширину: растянутый элемент занимает
   * `ширина_родителя − 32 − (−16) − (−16)` и начинается с `16 + (−16) = 0`.
   */
  stage: { flex: 1, alignSelf: 'stretch', marginHorizontal: -16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1 },
  noticeBody: { flex: 1, gap: 12 },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  soundBtn: { minHeight: 48, borderRadius: 999, borderWidth: 1, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  soundBtnText: { fontSize: 15, fontWeight: '800' },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
});
