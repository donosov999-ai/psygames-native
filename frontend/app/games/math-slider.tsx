/* psygames-game-math-slider · VER 2 · 17.08.2026 */
/**
 * Math Slider — прикидка результата на числовой прямой.
 *
 * ПРОИСХОЖДЕНИЕ. Игра G1/8 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-math-slider`, коммит 81d974ac,
 * база — d203a4a). Модуль пришёл самодостаточным: своё ядро, свой словарь ru/en,
 * своя разметка раунда. Здесь — стыковка с приложением.
 *
 * ЧТО ТРЕНИРУЕТ. Не счёт, а ЧУВСТВО ВЕЛИЧИНЫ: человек не вычисляет ответ точно,
 * а прикидывает, куда он попадает на шкале. Это отдельный навык, не тот же
 * самый, что скорость арифметики в «Счёте».
 *
 * СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ, А НЕ ТАЙМЕРОМ. Уровни меняют СЕМЕЙСТВО выражений:
 * 1–5 сложение · 6–10 вычитание · 11–20 умножение · 21–24 дроби · 25–28 проценты ·
 * 29–32 скидки · 33–36 пропорции · дальше вперемешку. С 11-го уровня на шкале
 * появляется отрицательная часть. Никаких «то же самое, но быстрее».
 *
 * 🔴 РАУНД ВЕДЁТ МОДУЛЬ, ФИНАЛ — ПРИЛОЖЕНИЕ. Первая версия отдавала модулю и
 * конец раунда: у него есть свой экран итога, и казалось логичным его и
 * показывать. Гейт `game-standard` это отбил, и правильно: звёзды по уровням,
 * серия чистых прохождений и глаз-разрядка пишутся ТОЛЬКО в LevelCleared. Свой
 * экран поздравления = тихое выпадение из всей бухгалтерии, ровно как когда-то
 * у маджонга и парных картинок. Поэтому по onComplete модуль со сцены уходит.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GameShell from '@/src/components/GameShell';
import { gameNow } from '@/src/services/gamePause';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import MathSliderGame from '@/src/games/math-slider/MathSliderGame';
import type { MathSliderMetrics } from '@/src/games/math-slider/core';

const GRADIENT = ['#5b4ee8', '#12a594'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 3.07 (норма AA 4.5), стало 4.51.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #a0dbd4 @0.16 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/**
 * Порог прохождения — 0.90. Это интеграционное решение, в модуле его нет.
 *
 * accuracy = 1 − нормированная ошибка, то есть 0.90 значит «в среднем мимо не
 * больше чем на десятую часть шкалы». Ниже брать нельзя: попадание «плюс-минус
 * четверть шкалы» — это не прикидка, а тык наугад, и уровень за него давать
 * нечестно. Выше 0.95 нельзя: приёмочный робот модуля держит 0.955, и порог
 * впритык к нему сделал бы игру непроходимой для человека.
 */
const PASS_ACCURACY = 0.9;

type Phase = 'config' | 'playing' | 'cleared' | 'result';

export default function MathSliderScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const lvl = usePersistentLevel('math_slider');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<MathSliderMetrics | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);

  // Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  const level = num('level', lvl.level);
  const trialCount = num('trials', 0) || undefined;

  /**
   * Зерно фиксируем на уровень, а не на каждый заход: перезапуск того же уровня
   * должен давать ТЕ ЖЕ выражения. Иначе «не получилось — крутани ещё раз»
   * превращается в лотерею вместо второй попытки.
   */
  const [attempt, setAttempt] = React.useState(0);
  const seed = React.useMemo(() => `math-slider-${level}`, [level]);

  /**
   * 🔴 УРОВЕНЬ, НА КОТОРОМ ИГРАЛИ, ЗАМОРАЖИВАЕТСЯ ДО ПОДЪЁМА ПОТОЛКА.
   *
   * `level` считается из `lvl.level` на каждой отрисовке, а `lvl.reach(level+1)`
   * поднимает сохранённый уровень РАНЬШЕ, чем рисуется итог. Значит баннер
   * поздравлял со СЛЕДУЮЩИМ уровнем, а звёзды ложились на ступень, которую
   * человек ещё не играл: прошёл первый — получил «Уровень 2 пройден» и звёзды
   * в ячейке двойки.
   *
   * Найдено на приёмке соседних игр 19.08.2026 сразу двумя заходами независимо;
   * та же ошибка нашлась у «Одной линии» и «Навигатора». Здесь она жила с
   * выпуска G1.
   */
  const [playedLevel, setPlayedLevel] = React.useState<number | null>(null);
  const shownLevel = playedLevel ?? level;

  // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => setPhase('playing'));

  const onComplete = React.useCallback(async (m: MathSliderMetrics) => {
    const passed = m.accuracy >= PASS_ACCURACY;
    setLast(m);

    setPlayedLevel(level);   // запомнили ДО подъёма потолка — иначе итог уедет на ступень вперёд
    // Пресет и шаг зарядки уровень НЕ двигают — так во всех 36 экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'math_slider',
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: level <= 10 ? 'easy' : level <= 24 ? 'medium' : 'hard',
        mode: `${m.specific.trialCount}t`,
        errors: m.errors,
        details: {
          level,
          accuracy: m.accuracy,
          // Знаковая ошибка — самое ценное здесь: она показывает СИСТЕМАТИЧЕСКИЙ
          // перекос («всегда завышаю»), а его человек за собой не замечает.
          mean_signed_error: m.specific.meanSignedError,
          bias: m.specific.biasDirection,
          generator_version: m.generatorVersion,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl]);

  /** Звёзды по точности: она и есть предмет этой игры, ошибки вторичны. */
  const stars = last ? (last.accuracy >= 0.97 ? 3 : last.accuracy >= 0.93 ? 2 : 1) : 1;

  /** Хоть один ответ подтверждён — выход теперь что-то отнимает. */
  const [armed, setArmed] = React.useState(false);
  const start = () => { setPlayedLevel(null); setArmed(false); setAttempt((n) => n + 1); setPhase('playing'); };

  if (phase === 'playing') {
    return (
      /**
       * 🔴 ОБЩИЙ КАРКАС, А НЕ СВОЙ. Экран рисовал партию в голом SafeAreaView, и
       * из-за этого не имел двух вещей, которые каркас даёт всем: партия НЕ
       * вставала на паузу, пока открыто окно отзыва (человек пишет о проблеме, а
       * время идёт), и «назад» уводил молча, стирая начатую партию без вопроса.
       * Шесть игр вылечили этим же каркасом 20.08.2026 — эту пропустили.
       */
      <GameShell
        title={t('mathSlider')}
        onBack={() => setPhase('config')}
        /** Спрашиваем, только когда терять есть что: см. `onProgress` ниже. */
        confirmExit={armed}
      >
        <MathSliderGame
          key={attempt}                 /* новый заход — чистое состояние модуля */
          seed={seed}
          level={level}
          locale={language === 'ru' ? 'ru' : 'en'}
          trialCount={trialCount}
          /**
           * Тему отдаём ЦЕЛИКОМ, а не три цвета. У модуля палитра по умолчанию
           * СВЕТЛАЯ (#f5f7fb), а у нас есть тёмные профили — недокрашенная игра
           * была бы белым пятном посреди тёмного приложения.
           */
          theme={{
            background: colors.background,
            surface: colors.surface,
            text: colors.text,
            textSecondary: colors.textSecondary,
            border: colors.border,
            /**
             * 🔴 primary = ЦВЕТ ИГРЫ, а не акцент профиля. Модуль красит им свою
             * шапку и главную кнопку. Если отдать сюда `colors.primary`, внутри
             * игры шапка станет акцентом профиля (оранжевым, синим — каким
             * угодно), а снаружи, на экране настроек, останется градиент игры:
             * один экран, две разные схемы. Проверено глазами 17.08.2026.
             */
            primary: GRADIENT[0],
            success: colors.success,
            danger: colors.error,
            focus: colors.warning,
          }}
          /**
           * 🔴 ЧАСЫ ПАРТИИ — ИГРОВЫЕ, А НЕ НАСТЕННЫЕ. Каркас ставит партию на
           * паузу, пока открыто окно отзыва, но модуль со своим `Date.now`
           * продолжал бы считать время: человек пишет о проблеме, а прикидка
           * «думалась» всё это время. Пауза без игровых часов — половина паузы.
           */
          now={gameNow}
          onComplete={onComplete}
          onProgress={setArmed}
          /**
           * 🔴 `onExit` МОДУЛЮ НЕ ОТДАЁМ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Его кнопка
           * «Выход» уводила бы МИМО вопроса при выходе — тем самым способом, от
           * которого вопрос и защищает. Выход теперь один: «назад» в шапке
           * каркаса, он же перехватывает аппаратную.
           */
        />
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
        <Text style={styles.title}>{t('mathSlider')}</Text>
      </GradientSurface>

      <ScrollView contentContainerStyle={styles.body}>
        <LevelProgressMap bestLevel={lvl.best} gameId="math_slider" currentLevel={lvl.level}
          onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('mathSliderDesc')}</Text>
        </View>

        <TouchableOpacity onPress={start} accessibilityRole="button">
          <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
            <Text style={styles.startText}>{t('start')}</Text>
          </GradientSurface>
        </TouchableOpacity>
      </ScrollView>

      {phase === 'cleared' && (
        <LevelCleared gameId="math_slider" level={shownLevel} stars={stars}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  back: { padding: 4 },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
});
