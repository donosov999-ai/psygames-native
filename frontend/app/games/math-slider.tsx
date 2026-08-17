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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import MathSliderGame from '@/src/games/math-slider/MathSliderGame';
import type { MathSliderMetrics } from '@/src/games/math-slider/core';

const GRADIENT = ['#5b4ee8', '#12a594'];

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
  const { isPreset, autostart, num } = useGamePreset();
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

  React.useEffect(() => { if (autostart) setPhase('playing'); }, [autostart]);

  const onComplete = React.useCallback(async (m: MathSliderMetrics) => {
    const passed = m.accuracy >= PASS_ACCURACY;
    setLast(m);

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

  const start = () => { setAttempt((n) => n + 1); setPhase('playing'); };

  if (phase === 'playing') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
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
          onComplete={onComplete}
          onExit={() => setPhase('config')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={GRADIENT as [string, string]} style={styles.header}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <TouchableOpacity onPress={() => goBackOrHome()} style={styles.back}
          accessibilityRole="button" accessibilityLabel={t('back')}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('mathSlider')}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <LevelProgressMap gameId="math_slider" currentLevel={lvl.level}
          onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('mathSliderDesc')}</Text>
        </View>

        <TouchableOpacity onPress={start} accessibilityRole="button">
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtn}>
            <Text style={styles.startText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {phase === 'cleared' && (
        <LevelCleared gameId="math_slider" level={level} stars={stars}
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
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
