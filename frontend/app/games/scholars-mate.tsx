/* psygames-game-scholars-mate · VER 1 · 05.09.2026 */
/**
 * «Детский мат» — заученные этюды на СКОРОСТЬ.
 *
 * ПРОСЬБА ДЕНИСА 05.09.2026: «хочу упражнение для шахматной доски (детский мат),
 * чтобы чисто на скорость делать заученные этюды», и отдельно — «детский мат с
 * жертвой».
 *
 * ЧТО ТРЕНИРУЕТ. Не расчёт вариантов, а УЗНАВАНИЕ УЗОРА. Chase & Simon (1973):
 * мастер держит в голове не фигуры, а знакомые куски позиции, и именно этим
 * отличается от новичка сильнее, чем глубиной перебора. Здесь узор один и тот
 * же — ферзь и слон на f7/f2, — и меряется, за сколько глаз его находит.
 *
 * ⚠️ ЭТО НЕ «ШАХМАТЫ ВСЛЕПУЮ». Там позицию держат в уме и ходят по одной фигуре
 * медленно; здесь позиция на виду и всё решает скорость. Разные навыки, разные
 * замеры, две отдельные игры — объединять их нельзя.
 *
 * ОТКУДА ПОЗИЦИИ. Два источника, оба готовы: свой генератор на python-chess
 * (718 матов, 378 «защитись», 756 «грозит ли») и база задач Lichess под CC0 —
 * из 6,1 млн задач отобраны настоящие детские маты из партий, 480 по лестнице
 * рейтинга и 434 с ЖЕРТВОЙ. Сборщик: `scripts/build-scholars-mate.mjs`.
 *
 * 🔴 ГЛАВНАЯ ЦИФРА ПОДХОДА — МЕДИАНА ВРЕМЕНИ, а не доля решённых. У человека,
 * который узор знает, доля почти всегда единица, и роста по ней не видно.
 * Растёт скорость: 6 секунд → 2 → 1,2. Она и уходит в сессию.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import GradientSurface from '@/src/components/GradientSurface';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';
import { onGradientText } from '@/src/services/onGradientText';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { gameNow } from '@/src/services/gamePause';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import ScholarsMateGame from '@/src/games/scholars-mate/ScholarsMateGame';
import { LEVELS, counts, levelParams } from '@/src/games/scholars-mate/core/deck';
import type { ScholarsResult } from '@/src/games/scholars-mate/core/types';

const GRADIENT = ['#8e5b2f', '#2f2a24'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/**
 * Порог прохождения — три четверти позиций.
 *
 * ⚠️ Выше брать нельзя: время на позицию падает с уровнем, и на верхних
 * ступенях одна прозеванная позиция — это уже 1/8 подхода. Уровень должен
 * браться уверенным узнаванием, а не безошибочностью под секундомером.
 */
const PASS = 0.75;

type Phase = 'config' | 'playing' | 'cleared' | 'result';

/**
 * 🔴 РЕЖИМ ПОТОКА — просьба Дениса 05.09.2026: «надо добавить режим поток,
 * 10 минут, без перерыва».
 *
 * Зачем он в этой игре. Уровень — это 8–10 позиций, то есть полторы минуты, и
 * между ними экран итога. Узнавание узора так не разгоняется: человек всё
 * время выходит из потока. Десять минут подряд — это и есть та самая практика
 * без опоры, ради которой упражнение задумано.
 *
 * ⚠️ Уровень в потоке НЕ повышается и НЕ понижается: там нет порога, который
 * можно взять или не взять. Поток даёт цифру скорости, а не ступень.
 */
const FLOW_MS = 10 * 60 * 1000;

export default function ScholarsMateScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  // ⚠️ Свой хук, а не голый useWindowDimensions: тот на первом кадре отдаёт 0,
  // и доска встала бы нулевого размера. Гейт ширины это ловит.
  const width = useScreenWidth();
  const lvl = usePersistentLevel('scholars_mate');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);
  const mode = useGameMode();

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<ScholarsResult | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [поток, setПоток] = React.useState(false);
  const [режим, setРежим] = React.useState<'sacrifice' | null>(null);

  const level = num('level', lvl.level);
  /**
   * 🔴 ПАРАМЕТРЫ УРОВНЯ МЕМОИЗИРОВАНЫ — И ЭТО НЕ УКРАШЕНИЕ.
   *
   * 📍 ЧТО ЛОМАЛОСЬ. `levelParams` возвращает новый объект каждый вызов, а его
   * поле `kinds` (новый массив) стояло в зависимостях `onComplete`. Любая
   * перерисовка экрана → новый `onComplete` → новый `дальше` в модуле → эффект
   * показа вердикта перезаводил таймер С НУЛЯ. Замер: 0 перерисовок — вердикт
   * держится 550 мс, 1 — 650, 2 — 750, а при перерисовке каждые 200 мс он не
   * снимается ВООБЩЕ: доска замирает, следующая позиция не приходит. Триггер
   * стоял уже в этом файле — `onProgress={setArmed}` даёт ровно один рендер.
   */
  const п = React.useMemo(() => levelParams(level), [level]);

  /** Уровень, на котором ИГРАЛИ: `lvl.reach` поднимает потолок раньше, чем рисуется итог. */
  const [playedLevel, setPlayedLevel] = React.useState<number | null>(null);
  const shownLevel = playedLevel ?? level;
  /**
   * 🔴 ЗВЁЗДЫ СЧИТАЮТСЯ ПО ЛИМИТУ СЫГРАННОГО УРОВНЯ, А НЕ СЛЕДУЮЩЕГО.
   *
   * 📍 `lvl.reach(level + 1)` меняет `level` ДО отрисовки итога, `п`
   * пересчитывается, и медиана делилась на секунды СЛЕДУЮЩЕГО уровня. Замер:
   * 17 переходов из 39 сдвигают звёзды, и `LevelCleared` их сохраняет. На
   * переходе 20→21 медиана 4000–5250 мс заслуживала двух звёзд, а показывалось
   * три; на 11→12 наоборот — заслужено три, показано две.
   */
  const пСыгранного = React.useMemo(() => levelParams(shownLevel), [shownLevel]);

  useAutostartWhenReady(() => autostart && lvl.loaded, () => setPhase('playing'));

  const onComplete = React.useCallback(async (r: ScholarsResult) => {
    const passed = r.accuracy >= PASS;
    setLast(r);
    setPlayedLevel(level);
    // В потоке ступень не двигается: там нет порога, который берут или не берут.
    // Лестницу двигает только обычный подход: у потока и у режима жертвы порога нет.
    const свободный = поток || режим !== null;
    if (!isPreset && !свободный && passed && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    else if (!isPreset && !свободный && !passed) lvl.fail();

    if (isPreset || свободный) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: 'scholars_mate',
        score: r.solved,
        time_seconds: Math.round(r.attempts.reduce((s, a) => s + a.ms, 0) / 1000),
        difficulty: level <= 10 ? 'easy' : level <= 25 ? 'medium' : 'hard',
        mode: режим === 'sacrifice' ? 'sacrifice' : поток ? 'flow10' : `${п.seconds}s`,
        errors: r.total - r.solved,
        details: {
          level,
          accuracy: r.accuracy,
          /** 🔴 Предмет этой игры. Всё остальное — обстановка вокруг него. */
          median_ms: r.medianMs,
          /** Полное время позиции — для сравнения с лимитом уровня. */
          median_full_ms: r.medianFullMs,
          best_ms: r.bestMs,
          streak: r.streak,
          kinds: п.kinds.join('+'),
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl, поток, режим, п.seconds, п.kinds]);

  /**
   * Звёзды по СКОРОСТИ, а не по доле решённых.
   *
   * ⚠️ Иначе три звезды получал бы любой, кто просто дорешал подход, и лестница
   * перестала бы что-либо значить: узор-то один. Пороги — доли отведённого на
   * позицию времени: уложился в треть — три звезды.
   */
  const stars = React.useMemo(() => {
    if (!last || !last.solved) return 1;
    const доля = last.medianMs / (пСыгранного.seconds * 1000);
    return доля <= 0.33 ? 3 : доля <= 0.6 ? 2 : 1;
  }, [last, пСыгранного.seconds]);

  /**
   * Медиана подхода и личный рекорд. Рекорд хранится по уровню: медиана на
   * четвёртом уровне и на сороковом — разные величины, общий рекорд был бы
   * бессмыслицей.
   */
  const [рекорд, setРекорд] = React.useState<number | null>(null);
  React.useEffect(() => {
    AsyncStorage.getItem(`psygames_scholars_median_${shownLevel}`)
      .then((v) => setРекорд(v ? Number(v) : null))
      .catch(() => {});
  }, [shownLevel]);
  React.useEffect(() => {
    if (!last?.medianMs || !last.solved) return;
    if (рекорд != null && рекорд <= last.medianMs) return;
    setРекорд(last.medianMs);
    AsyncStorage.setItem(`psygames_scholars_median_${shownLevel}`, String(Math.round(last.medianMs))).catch(() => {});
  }, [last, shownLevel, рекорд]);

  const строкаСкорости = React.useMemo(() => {
    if (!last?.medianMs || !last.solved) return undefined;
    const сек = (мс: number) => (Math.round(мс / 100) / 10).toFixed(1);
    const своё = `${t('scholarsMedian')} ${сек(last.medianMs)} ${t('secShort')}`;
    return рекорд != null && рекорд < last.medianMs
      ? `${своё} · ${t('personalBest')} ${сек(рекорд)} ${t('secShort')}`
      : своё;
  }, [last, рекорд, t]);

  /**
   * Имя узора для экрана. Ключи заведены на 12 языков: человек обязан видеть,
   * КАКОЙ мат он сейчас ищет, — иначе новый узор на лестнице неотличим от
   * старого (замечание Дениса 05.09.2026).
   */
  const имяУзора = React.useCallback((m: string) => {
    const ключи: Record<string, string> = {
      // ⚠️ Имя узора здесь то же, что название игры: заводить второй ключ с тем
      // же текстом — это ровно тот дубль, который ловит гейт словаря.
      scholar: 'scholarsMate',
      queenKnight: 'scholarsMotifQueenKnight',
      bishopF7: 'scholarsMotifBishopF7',
      queenAlone: 'scholarsMotifQueenAlone',
      fool: 'scholarsMotifFool',
      knightOpening: 'scholarsMotifKnight',
      smothered: 'scholarsMotifSmothered',
    };
    return ключи[m] ? t(ключи[m]!) : '';
  }, [t]);

  const start = (режимПотока = false, только: 'sacrifice' | null = null) => {
    setПоток(режимПотока);
    setРежим(только);
    setPlayedLevel(null);
    setArmed(false);
    setAttempt((n) => n + 1);
    setPhase('playing');
  };

  if (phase === 'playing') {
    const сторона = Math.min(width - 32, 420);
    return (
      <GameShell title={t('scholarsMate')} onBack={() => setPhase('config')} confirmExit={armed}>
        <ScholarsMateGame
          key={attempt}
          level={level}
          seed={attempt + 1}
          flowMs={поток ? FLOW_MS : undefined}
          onlyKind={режим ?? undefined}
          size={сторона}
          now={gameNow}
          theme={{
            surface: colors.surface, text: colors.text, textSecondary: colors.textSecondary,
            border: colors.border, primary: GRADIENT[0]!, success: '#12a594', danger: '#e24b4a',
          }}
          onProgress={setArmed}
          onComplete={onComplete}
          motifName={имяУзора}
          labels={{
            mate: t('scholarsMateAsk'),
            defend: t('scholarsDefendAsk'),
            threat: t('scholarsThreatAsk'),
            sacrifice: t('scholarsSacrificeAsk'),
            yes: t('scholarsYes'),
            no: t('scholarsNo'),
            best: t('scholarsBest'),
            timeUp: t('timeIsUp'),
            sec: t('secShort'),
          }}
        />
      </GameShell>
    );
  }

  const c = counts();

  return (
    <SafeAreaView style={[стили.корень, { backgroundColor: colors.background }]}>
      <GradientSurface colors={GRADIENT as [string, string]} style={стили.шапка}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {/*
          🔴 ВЫХОД С ЭКРАНА НАСТРОЙКИ. Отчёт Дениса 05.09.2026, дословно: «из
          окна детского мата невозможно выйти из настройки, где перед игрой —
          как туда провалился». Так и было: назад вела только партия (её рисует
          GameShell со своей кнопкой), а на экране настройки кнопки не стояло
          вовсе — человек попадал сюда и оставался.

          ⚠️ Аппаратной «назад» на iOS нет, а жест от края уводит из приложения,
          а не из экрана. То есть выхода не было НИ ОДНОГО.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11yBack')}
          onPress={() => goBackOrHome()}
          style={стили.назад}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={ON_GRAD.color} />
        </Pressable>
        <Text style={[стили.заголовок, { color: ON_GRAD.color }]} numberOfLines={1}>{t('scholarsMate')}</Text>
        {/* Резерв под сквозной уголок (питомец + «Правила») — см. HELP_CORNER_SPACE. */}
        <View style={{ width: HELP_CORNER_SPACE }} />
      </GradientSurface>

      {phase === 'config' && (
        <ScrollView contentContainerStyle={стили.тело}>
          <LevelProgressMap bestLevel={lvl.best} gameId="scholars_mate" currentLevel={level}
            maxLevel={LEVELS} onPickLevel={lvl.pick} colors={colors} language={language} />

          <View style={[стили.карточка, { backgroundColor: colors.surface }]}>
            <Text style={[стили.уровень, { color: colors.text }]}>{t('level')} {level}</Text>
            <Text style={[стили.подсказка, { color: colors.textSecondary }]}>{t('scholarsMateDesc')}</Text>
            <View style={стили.строка}>
              <Ionicons name="timer-outline" size={18} color={colors.textSecondary} />
              <Text style={[стили.подсказка, { color: colors.text }]}>
                {п.seconds} {t('secShort')} · {п.count}
              </Text>
            </View>
            {/*
              ⚠️ Было четыре голых числа подряд — «38028 · 378 · 3000 · 371».
              Что это, не понимал никто, включая меня через час. Теперь одна
              подписанная цифра: сколько всего позиций в наборе.
            */}
            <Text style={[стили.мелко, { color: colors.textSecondary }]}>
              {t('scholarsBank').replace('{n}', String(c.mate + c.fromGames + c.defend + c.threat + c.sacrifice))}
            </Text>
            {/* Источник называем по правилу лицензии CC0. */}
            <Text style={[стили.мелко, { color: colors.textSecondary }]}>Lichess puzzle DB · CC0</Text>
          </View>

          {/*
            🔴 «МАТ С ЖЕРТВОЙ» — ОТДЕЛЬНЫМ ВХОДОМ. Просьба Дениса 05.09.2026:
            «нужно как режим в детском мате сделать — мат с жертвой». До этого
            жертва жила только на ступенях с 29-й: чтобы увидеть то, ради чего
            её и просили, надо было пройти двадцать восемь уровней.
            ⚠️ Ступень тут не двигается: порога нет, есть замер скорости.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scholarsSacrificeMode')}
            onPress={() => start(false, 'sacrifice')}
            style={[стили.карточка, { backgroundColor: colors.surface, borderColor: GRADIENT[0], borderWidth: 1 }]}
          >
            <View style={стили.строка}>
              <Ionicons name="flame-outline" size={20} color={GRADIENT[0]} />
              <Text style={[стили.уровень, { color: colors.text }]}>{t('scholarsSacrificeMode')}</Text>
            </View>
            <Text style={[стили.подсказка, { color: colors.textSecondary }]}>{t('scholarsSacrificeModeHint')}</Text>
            <Text style={[стили.мелко, { color: colors.textSecondary }]}>{c.sacrifice}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scholarsFlow')}
            onPress={() => start(true)}
            style={[стили.карточка, { backgroundColor: colors.surface, borderColor: GRADIENT[0], borderWidth: 1 }]}
          >
            <View style={стили.строка}>
              <Ionicons name="infinite-outline" size={20} color={GRADIENT[0]} />
              <Text style={[стили.уровень, { color: colors.text }]}>{t('scholarsFlow')}</Text>
            </View>
            <Text style={[стили.подсказка, { color: colors.textSecondary }]}>{t('scholarsFlowHint')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {phase === 'config' && (
        <GameSetupBar label={t('start')} onStart={() => start(false)} colors={GRADIENT as [string, string]} />
      )}

      {phase === 'cleared' && (
        <LevelCleared gameId="scholars_mate" level={shownLevel} stars={stars} passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          /**
           * 🔴 ГЛАВНУЮ ЦИФРУ ЧЕЛОВЕК ОБЯЗАН ВИДЕТЬ.
           *
           * Вся игра построена на медиане времени, а на экране итога рисовались
           * одни звёзды. Рецензия 05.09.2026 назвала это прямо: «главную цифру
           * человек не видит» — а «Шульте», на которую упражнение ссылается как
           * на образец, показывает и время, и рекорд.
           */
          comparisonLine={строкаСкорости}
          onContinue={start} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && last && (
        <GameResult score={last.solved} time={Math.round(last.medianMs) / 1000}
          errors={last.total - last.solved}
          onPlayAgain={start} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const стили = StyleSheet.create({
  корень: { flex: 1 },
  шапка: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  // 44 — норма цели нажатия; кнопка выхода обязана быть не меньше остальных.
  назад: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  заголовок: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, marginHorizontal: 8 },
  тело: { padding: 16, gap: 14, paddingBottom: SETUP_BAR_SPACE },
  карточка: { padding: 16, borderRadius: 16, gap: 8 },
  уровень: { fontSize: 18, fontWeight: '700' },
  подсказка: { fontSize: 14 },
  мелко: { fontSize: 12 },
  строка: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
