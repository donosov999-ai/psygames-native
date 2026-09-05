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
import { LEVELS, MOTIF_KEY, NAMED_MOTIFS, counts, levelParams, namedMotifCount } from '@/src/games/scholars-mate/core/deck';
import { starsFor, итогПодхода } from '@/src/games/scholars-mate/core/run';
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
  /** Выбранный именованный узор и открыт ли список. */
  const [узор, setУзор] = React.useState<string | null>(null);
  const [списокОткрыт, setСписокОткрыт] = React.useState(false);

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

  useAutostartWhenReady(() => autostart && lvl.loaded, () => setPhase('playing'));

  const onComplete = React.useCallback(async (r: ScholarsResult) => {
    /**
     * 🔴 ПОДХОД БЕЗ ЕДИНОГО КАСАНИЯ НЕ СЧИТАЕТСЯ ВОВСЕ.
     *
     * 📍 В живых данных 05.09.2026 нашлись три таких: 0 решённых, 10–11
     * таймаутов, нулевая медиана. Экран оставили открытым, секундомер добил
     * позиции сам. И это НЕ безобидно: доля верных 0 < порога, значит уровень
     * понижался за игру, которой не было, а в статистику уходил подход,
     * который человек не играл.
     */
    const passed = r.accuracy >= PASS;
    if (!r.touched) { setPhase('config'); return; }
    setLast(r);
    setPlayedLevel(level);
    /**
     * 🔴 УРОВНИ ЕСТЬ У ВСЕГО, КРОМЕ ПОТОКА. Решение целиком — в `итогПодхода`.
     *
     * 📍 ОТЧЁТ ДЕНИСА 05.09.2026, дословно: «партию прошёл, завершилось всё и
     * всё висит, где следующий уровень». Подход в режиме уходил в карточку
     * итога — без ступени, без «дальше», без продолжения. Второй его отчёт
     * того же дня объясняет, почему это неверно по устройству: «выбираешь
     * режим и его отрабатываешь» — отработка узора это ТА ЖЕ игра с тем же
     * секундомером, только пул уже. Значит и лестница та же.
     */
    const итог = итогПодхода({
      касались: r.touched, взял: passed, поток,
      предустановка: isPreset, цепочка: shouldChainNextLevel(mode),
    });
    if (итог.ступень === 'вверх') lvl.reach(level + 1);
    else if (итог.ступень === 'вниз') lvl.fail();
    if (итог.фаза === 'cleared') setClearedPassed(passed);
    setPhase(итог.фаза);

    try {
      await saveSession({
        passed,
        game_type: 'scholars_mate',
        score: r.solved,
        time_seconds: Math.round(r.attempts.reduce((s, a) => s + a.ms, 0) / 1000),
        difficulty: level <= 10 ? 'easy' : level <= 25 ? 'medium' : 'hard',
        mode: узор ? `motif:${узор}` : режим === 'sacrifice' ? 'sacrifice' : поток ? 'flow10' : `${п.seconds}s`,
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
  }, [isPreset, mode, level, lvl, поток, режим, узор, п.seconds, п.kinds]);

  /**
   * Звёзды по СКОРОСТИ, а не по доле решённых.
   *
   * ⚠️ Иначе три звезды получал бы любой, кто просто дорешал подход, и лестница
   * перестала бы что-либо значить: узор-то один. Пороги — доли отведённого на
   * позицию времени: уложился в треть — три звезды.
   */
  const stars = React.useMemo(
    () => (last && last.solved ? starsFor(last.medianMs, shownLevel) : 1),
    [last, shownLevel],
  );

  /**
   * Медиана подхода и личный рекорд. Рекорд хранится по уровню: медиана на
   * четвёртом уровне и на сороковом — разные величины, общий рекорд был бы
   * бессмыслицей.
   */
  /**
   * 🔴 СРАВНИВАЕМ С ПОСЛЕДНИМИ ПОДХОДАМИ, А НЕ С РЕКОРДОМ.
   *
   * 📍 ЗАМЕР 05.09.2026 (Монте-Карло, 4000 подходов на каждую длину,
   * логнормальное время реакции): медиана по ВОСЬМИ позициям гуляет ±25%, по
   * десяти ±22%, и только к сорока сходится к ±12%. Сорок позиций — это подход
   * вчетверо длиннее, на такое никто не подпишется.
   *
   * Отсюда вывод, который меняет показ: ЛИЧНЫЙ РЕКОРД ПО ОДНОМУ ПОДХОДУ — ЭТО
   * САМЫЙ УДАЧНЫЙ ШУМ, а не достижение. Человек его один раз выбьет и больше
   * никогда не побьёт, потому что бить нужно не себя, а случайность.
   *
   * Поэтому храним последние ПЯТЬ медиан на уровне и показываем их медиану:
   * пять подходов по десять позиций — это те же полсотни замеров, только
   * набранные по-человечески, и разброс у них уже ±12%.
   */
  const ПОДХОДОВ_В_СРЕДНЕМ = 5;
  const [последние, setПоследние] = React.useState<number[]>([]);
  React.useEffect(() => {
    AsyncStorage.getItem(`psygames_scholars_medians_${shownLevel}`)
      .then((v) => setПоследние(v ? (JSON.parse(v) as number[]) : []))
      .catch(() => {});
  }, [shownLevel]);
  React.useEffect(() => {
    if (!last?.medianMs || !last.solved) return;
    setПоследние((было) => {
      const стало = [...было, Math.round(last.medianMs)].slice(-ПОДХОДОВ_В_СРЕДНЕМ);
      AsyncStorage.setItem(`psygames_scholars_medians_${shownLevel}`, JSON.stringify(стало)).catch(() => {});
      return стало;
    });
  }, [last, shownLevel]);

  const строкаСкорости = React.useMemo(() => {
    if (!last?.medianMs || !last.solved) return undefined;
    const сек = (мс: number) => (Math.round(мс / 100) / 10).toFixed(1);
    const своё = `${t('scholarsMedian')} ${сек(last.medianMs)} ${t('secShort')}`;
    // Меньше трёх подходов — сравнивать не с чем, и врать про «обычно» нельзя.
    if (последние.length < 3) return своё;
    const ряд = [...последние].sort((a, b) => a - b);
    const по = ряд.length % 2 ? ряд[ряд.length >> 1]! : Math.round((ряд[ряд.length / 2 - 1]! + ряд[ряд.length / 2]!) / 2);
    return `${своё} · ${t('scholarsUsually').replace('{n}', String(последние.length))} ${сек(по)} ${t('secShort')}`;
  }, [last, последние, t]);

  /**
   * Имя узора для экрана. Ключи заведены на 12 языков: человек обязан видеть,
   * КАКОЙ мат он сейчас ищет, — иначе новый узор на лестнице неотличим от
   * старого (замечание Дениса 05.09.2026).
   */
  /**
   * Имя узора для экрана. Карта ключей лежит В ЯДРЕ (`MOTIF_KEY`) — по ней же
   * ходит гейт, который не пускает пул без человеческого имени.
   */
  const имяУзора = React.useCallback((m: string) => {
    const ключ = MOTIF_KEY[m];
    if (!ключ) return '';
    const имя = t(ключ);
    return имя === ключ ? '' : имя;
  }, [t]);

  const start = (режимПотока = false, только: 'sacrifice' | null = null, имяУзораДляОтработки: string | null = null) => {
    setПоток(режимПотока);
    setРежим(только);
    setУзор(имяУзораДляОтработки);
    setСписокОткрыт(false);
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
          namedMotif={узор ?? undefined}
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
            🔴 ОДИН СПИСОК И ОДИН ПЕРЕКЛЮЧАТЕЛЬ ВМЕСТО ТРЁХ ВХОДОВ.
            
            📍 ОТЧЁТ ДЕНИСА 05.09.2026, дословно: «чем мат с жертвой отличается
            от других типов мата? по сути ты выбираешь режим и его
            отрабатываешь, а у тебя мат с жертвой вынесен отдельно, остальные
            отдельно, и ещё режим потока — он только к одному».
            
            Он прав по устройству: жертва — это ТАКОЙ ЖЕ узор, как арабский или
            эполетный, и ей незачем свой вход. А поток — не режим, а ПАРАМЕТР
            времени, и он обязан применяться к чему угодно: к лестнице, к
            жертве, к любому узору из списка.
          */}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: поток }}
            accessibilityLabel={t('scholarsFlow')}
            onPress={() => setПоток((v) => !v)}
            style={[стили.карточка, {
              backgroundColor: colors.surface,
              borderColor: поток ? GRADIENT[0] : colors.border,
              borderWidth: поток ? 2 : 1,
            }]}
          >
            <View style={стили.строка}>
              <Ionicons name={поток ? 'infinite' : 'infinite-outline'} size={20}
                color={поток ? GRADIENT[0] : colors.textSecondary} />
              <Text style={[стили.уровень, { color: colors.text, flex: 1 }]}>{t('scholarsFlow')}</Text>
              <Ionicons name={поток ? 'checkmark-circle' : 'ellipse-outline'} size={22}
                color={поток ? GRADIENT[0] : colors.border} />
            </View>
            <Text style={[стили.подсказка, { color: colors.textSecondary }]}>{t('scholarsFlowHint')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: списокОткрыт }}
            accessibilityLabel={t('scholarsPickMotif')}
            onPress={() => setСписокОткрыт((v) => !v)}
            style={[стили.карточка, { backgroundColor: colors.surface }]}
          >
            <View style={стили.строка}>
              <Ionicons name={списокОткрыт ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
              <Text style={[стили.уровень, { color: colors.text }]}>{t('scholarsPickMotif')}</Text>
            </View>
            <Text style={[стили.подсказка, { color: colors.textSecondary }]}>{t('scholarsPickMotifHint')}</Text>
          </Pressable>

          {/* Жертва — первой строкой того же списка: это такой же узор. */}
          {списокОткрыт && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scholarsSacrificeMode')}
              onPress={() => start(поток, 'sacrifice')}
              style={[стили.узорСтрока, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}
            >
              <Ionicons name="flame-outline" size={18} color={GRADIENT[0]} />
              <Text style={[стили.подсказка, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {t('scholarsSacrificeMode')}
              </Text>
              <Text style={[стили.мелко, { color: colors.textSecondary }]}>{c.sacrifice}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </Pressable>
          )}

          {списокОткрыт && NAMED_MOTIFS.map((имя) => (
            <Pressable
              key={имя}
              accessibilityRole="button"
              accessibilityLabel={имяУзора(имя)}
              onPress={() => start(поток, null, имя)}
              style={[стили.узорСтрока, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[стили.подсказка, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {имяУзора(имя)}
              </Text>
              <Text style={[стили.мелко, { color: colors.textSecondary }]}>{namedMotifCount(имя)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {phase === 'config' && (
        <GameSetupBar label={t('start')} onStart={() => start(поток)} colors={GRADIENT as [string, string]} />
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
          /**
           * 🔴 «ДАЛЬШЕ» ОСТАЁТСЯ В ТОМ ЖЕ РЕЖИМЕ. `start` без доводов сбрасывает
           * узор и жертву в ноль — отработка оборвалась бы на первой ступени и
           * молча подменилась смешанной лестницей.
           */
          onContinue={() => start(поток, режим, узор)} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && last && (
        <GameResult score={last.solved} time={Math.round(last.medianMs) / 1000}
          errors={last.total - last.solved}
          onPlayAgain={() => start(поток, режим, узор)} onGoHome={() => goBackOrHome()}
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
  // 48 — норма цели нажатия: строки списка нажимают пальцем, а не мышью.
  узорСтрока: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  строка: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
