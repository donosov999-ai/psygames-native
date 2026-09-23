/* psygames-game-scholars-mate · VER 3 · 17.09.2026 */
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
import DropdownSelect from '@/src/components/DropdownSelect';
import { GameAuxAction } from '@/src/components/GameAuxAction';
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
import ScholarsMateGame, { type ScholarsServiceRow } from '@/src/games/scholars-mate/ScholarsMateGame';
import { КЛЮЧ_ВИДА, LEVELS, MOTIF_KEY, NAMED_MOTIFS, counts, levelParams, mixedMotifCount, namedMotifCount, newMotifAt, видыРежима, подписиВидов } from '@/src/games/scholars-mate/core/deck';
import { звёздыПодхода, ступеньПоМедиане, порогУровня, допускПромахов } from '@/src/games/scholars-mate/core/run';
import { levelOutcome } from '@/src/services/levelOutcome';
import type { ScholarsResult } from '@/src/games/scholars-mate/core/types';

const GRADIENT = ['#8e5b2f', '#2f2a24'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

/**
 * Порог прохождения — в `порогУровня` (ядро), и он РАСТЁТ с уровнем.
 *
 * ⚠️ Здесь стояла константа 0,75 с припиской «выше брать нельзя: на верхних
 * ступенях одна прозеванная позиция — это уже 1/8 подхода». Довод верен ровно
 * наполовину: он объясняет, почему нельзя требовать безошибочности, но не
 * почему допуск обязан быть ОДИНАКОВ на первой и сороковой ступени. Ось «цена
 * ошибки» была не отвергнута, а не заведена — правило Дениса 06.09.2026
 * «потолков нет нигде».
 *
 * Теперь порог задаётся допуском ПРОМАХОВ (2 → 1 с девятнадцатого уровня, где
 * появляются угадываемые вопросы «грозит ли мат»), а доля считается из него и
 * длины подхода. Числа и замер — в ядре.
 */

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
  const { isPreset, autostart, num, bool, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);
  const mode = useGameMode();

  const [phase, setPhase] = React.useState<Phase>('config');
  const [last, setLast] = React.useState<ScholarsResult | null>(null);
  const [clearedPassed, setClearedPassed] = React.useState(false);
  /** Состояние служебного действия, поднятое модулем: что показать в ряду каркаса. */
  const [служебное, setСлужебное] = React.useState<ScholarsServiceRow | null>(null);
  const [armed, setArmed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  /**
   * 🔴 ПОТОК ВКЛЮЧАЕТСЯ И ПАРАМЕТРОМ (13.09.2026).
   *
   * Режим потока здесь с 05.09.2026 по просьбе Дениса («десять минут позиций
   * подряд, без экрана итога между ними»), но включался он только галочкой на
   * экране настройки — то есть своя серия из редактора запустить его не могла и
   * получала обычные партии с итогом после каждой. Теперь `?flow=1` включает
   * ровно то же, а `?motif=<узор>` задаёт узор: «для шахмат это слепые шахматы в
   * рандом-режиме детского мата» (13.09.2026).
   */
  const [поток, setПоток] = React.useState(() => bool('flow', false));
  const [режим, setРежим] = React.useState<'sacrifice' | null>(() => (str('drill', '') === 'sacrifice' ? 'sacrifice' : null));
  /** Выбранный именованный узор и открыт ли список. */
  const [узор, setУзор] = React.useState<string | null>(() => str('motif', '') || null);
  /** Микс узоров: подаются вперемешку, имя до ответа скрыто. */
  /* Рандом-режим: узоры вперемешку, имя скрыто до ответа. `?mix=1` — чтобы своя
     серия могла попросить именно его («в рандом-режиме детского мата»). */
  const [микс, setМикс] = React.useState(() => bool('mix', false));
  /**
   * 🔴 ЗЕРНО КОЛОДЫ — ПАРАМЕТРОМ, ИНАЧЕ ПОВТОР ШАГА СДАЁТ ТУ ЖЕ РАЗДАЧУ.
   *
   * `seed` внизу был `attempt + 1`, а `attempt` при запуске из зарядки всегда 0:
   * экран монтируется заново на каждом шаге. Значит два шага «Детского мата» в
   * одной серии получали ОДНУ И ТУ ЖЕ колоду — и в потоке на пятнадцать минут,
   * где микс идёт девять раз, человек девять раз видел бы одни позиции.
   *
   * Замечено 13.09.2026, когда Денис попросил ставить в поток именно микс:
   * «детский мат в одной фазе слишком простой, когда переключение — это сложнее».
   * Разное зерно на шаг и делает переключение настоящим.
   *
   * ⚠️ Вне зарядки поведение прежнее: `attempt + 1`, чтобы «ещё раз» на экране
   * итога сдавал следующую раздачу, а не случайную.
   */
  const зерноШага = num('seed', 0);

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
    const passed = r.accuracy >= порогУровня(level, r.total);
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
    /**
     * ⚠️ ОБЩЕЕ ПРАВИЛО ИГРЫ, В ТОЙ ЖЕ ФОРМЕ, ЧТО У ОСТАЛЬНЫХ ЭКРАНОВ.
     * `isPreset` уходит в `levelOutcome` БУКВАЛЬНО, а не через помощника:
     * разбор гейта `warmup-level-drift` подставляет сюда `isPreset = true` и
     * проверяет, достижимо ли отсюда понижение уровня. Спрячь признак за вызов — и
     * гейт по своему правилу «непонятое под подозрение» покрасит экран красным
     * при полностью верном поведении.
     */
    const out = levelOutcome({ isPreset, cleared: passed });
    /**
     * 🔴 ПОТОК — ЕДИНСТВЕННЫЙ БЕЗ СТУПЕНЕЙ, И ЭТО НЕ ОГОВОРКА: в нём десять
     * минут подряд без границ подхода, брать там нечего. Всё остальное —
     * лестница, жертва, любой из 19 узоров — ступени двигает.
     *
     * 📍 ОТЧЁТ ДЕНИСА 05.09.2026: «партию прошёл, завершилось всё и всё висит,
     * где следующий уровень». Подход в режиме упирался в карточку итога — без
     * ступени, без «дальше». Второй его отчёт того же дня объясняет, почему это
     * неверно: «выбираешь режим и его отрабатываешь» — отработка узора это ТА
     * ЖЕ игра с тем же секундомером, только пул уже.
     */
    if (!поток && out.raiseLevel && shouldChainNextLevel(mode)) lvl.reach(level + 1);
    if (!поток && out.lowerLevel) lvl.fail();
    /**
     * 🔴 ПОТОК ТОЖЕ ДВИГАЕТ СТУПЕНЬ — ПО МЕДИАНЕ. Решение Дениса 06.09.2026.
     *
     * 📍 Раньше поток был единственным режимом без лестницы: в нём нет границы
     * подхода, доля верных ничего не решает, и «дальше» честно не появлялось.
     * Но жалоба `67eade4e` «партию прошёл, всё висит, где следующий уровень»
     * пришла именно после подхода, и ответ «в потоке ступеней не бывает»
     * человека не устраивает.
     *
     * Правило и порог — в `ступеньПоМедиане`: та же откалиброванная шкала, что
     * рисует звёзды, чтобы «быстро» в звёздах и «быстро» в лестнице не
     * разъехались. Медиана потока — самый надёжный замер в игре: сотни позиций
     * за десять минут против восьми в обычном подходе.
     *
     * ⚠️ `isPreset` СТОИТ ЗДЕСЬ БУКВАЛЬНО, а не спрятан за помощника: гейт
     * `warmup-level-drift` подставляет его значением `true` и проверяет, что
     * понижение отсюда недостижимо. Спрячь признак за вызов — и он покрасит
     * экран красным при полностью верном поведении.
     */
    const ступеньПотока = поток && !isPreset && shouldChainNextLevel(mode)
      ? ступеньПоМедиане(r.medianMs, level)
      : 'стоит';
    if (ступеньПотока === 'вверх') lvl.reach(level + 1);
    if (ступеньПотока === 'вниз') lvl.fail();
    /**
     * Поднялись в потоке — показываем карточку ступени, а не сухой итог: именно
     * её отсутствия и не хватало человеку. Не поднялись — итог подхода как был.
     */
    const фаза: 'cleared' | 'result' = поток ? (ступеньПотока === 'вверх' ? 'cleared' : 'result') : out.phase;
    if (фаза === 'cleared') setClearedPassed(поток ? true : passed);
    setPhase(фаза);

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
    () => (last && last.solved ? звёздыПодхода(last.medianMs, shownLevel, last.hints ?? 0) : 1),
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

  const start = (
    режимПотока = false, только: 'sacrifice' | null = null,
    имяУзораДляОтработки: string | null = null, вперемешку = false,
  ) => {
    setПоток(режимПотока);
    setРежим(только);
    setУзор(имяУзораДляОтработки);
    setМикс(вперемешку);
    setPlayedLevel(null);
    setArmed(false);
    setAttempt((n) => n + 1);
    setPhase('playing');
  };

  if (phase === 'playing') {
    const сторона = Math.min(width - 32, 420);
    return (
      <GameShell
        title={t('scholarsMate')}
        onBack={() => setPhase('config')}
        confirmExit={armed}
        /**
         * Подсказка — в ОДИН ряд с «Заново», который каркас берёт из пункта паузы.
         * Пока её нет (первая половина времени, вопрос про угрозу, вердикт), в ряду
         * остаётся только «Заново»: место под значок не резервируется, чтобы доска не
         * прыгала.
         */
        headerActions={служебное?.hint.visible ? (
          <GameAuxAction
            compact
            icon="bulb-outline"
            tint={GRADIENT[0]}
            label={служебное.hint.used ? служебное.hint.label : `${служебное.hint.label} −1⭐`}
            disabled={служебное.hint.used}
            onPress={служебное.hint.onPress}
          />
        ) : undefined}
        /**
         * 🔴 МЕНЮ ПАУЗЫ (выпуск 2.52.2). Стрелка больше не выкидывает из партии
         * одним касанием: часы встают, дальше выбор.
         *
         * ⚠️ ЗДЕСЬ ДВА РАЗНЫХ УХОДА, И ПУТАТЬ ИХ НЕЛЬЗЯ. `leave` уводит тем же
         * путём, что стрелка, а стрелка у этой игры ведёт НЕ домой, а в её
         * собственное меню выбора узора («Назад»). Выход из приложения к списку
         * игр — отдельным пунктом, иначе «На главную» врала бы дважды: и словом,
         * и местом, куда приводит. Жалоба `dd2869c6` «Как выйти ???» ровно про это.
         */
        pauseActions={[
          { id: 'resume', label: t('exitConfirmStay'), icon: 'play' as const, primary: true },
          { id: 'restart', label: t('restart'), icon: 'refresh' as const, onPress: () => start(поток, режим, узор, микс) },
          /**
           * 🔴 БЫЛО ДВЕ КНОПКИ УХОДА С РАЗНЫМИ ПОДПИСЯМИ, ДЕЛАЮЩИЕ ОДНО И ТО ЖЕ.
           *
           * Замер 10.09.2026 (пункт Б2 решения Дениса): пункт `menu` с подписью
           * «Назад» уходил через `leave`, пункт `home` — своим `goBackOrHome()`.
           * Разница между ними была бы только при `onSaveBeforeExit`, а этот экран
           * его не объявляет вовсе (как и `resumable`) — то есть оба ухода
           * равнозначны, и человек выбирал между двумя словами за одним исходом.
           *
           * Оставлен один, канонический: `leave` уводит тем же путём, что и все
           * прочие игры, и продолжит работать, если экран когда-нибудь заведёт
           * сохранение партии.
           */
          { id: 'home', label: t('goHome'), icon: 'home' as const, leave: true },
        ]}
      >
        <ScholarsMateGame
          key={attempt}
          level={level}
          seed={зерноШага > 0 ? зерноШага + attempt : attempt + 1}
          flowMs={поток ? FLOW_MS : undefined}
          onlyKind={режим ?? undefined}
          namedMotif={узор ?? undefined}
          mixedMotifs={микс}
          /**
            * 🔴 СЛУЖЕБНОЕ — ЗНАЧКОМ В ОБЩИЙ РЯД КАРКАСА (решение Дениса 17.09.2026, задача 5f6a909d).
            * Было: своя текстовая кнопка «Подсказка −1⭐» внутри модуля.
            * ⚠️ Свой ряд под доской я сначала и сделал — и кадр показал ДВА ряда: подсказка на
            * высоте 650, «Заново» от каркаса на 791. Правило говорит про один ряд, поэтому
            * состояние уходит наверх, а значок встаёт рядом с «Заново» в `headerActions`.
            * Правила самой подсказки не изменились: до половины времени и на вопросе «грозит
            * ли мат» её нет вовсе, это по-прежнему решает модуль.
            */
          onServiceState={setСлужебное}
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
            /* Подписи берутся из КАРТЫ В ЯДРЕ (`КЛЮЧ_ВИДА`) — по ней же подписана
               карточка уровня. Два списка разошлись бы при первой же правке. */
            mate: t(КЛЮЧ_ВИДА.mate),
            defend: t(КЛЮЧ_ВИДА.defend),
            threat: t(КЛЮЧ_ВИДА.threat),
            sacrifice: t(КЛЮЧ_ВИДА.sacrifice),
            yes: t('scholarsYes'),
            no: t('scholarsNo'),
            best: t('scholarsBest'),
            timeUp: t('timeIsUp'),
            sec: t('secShort'),
            /* Оба ключа уже в словаре и переведены — новых заводить не пришлось. */
            hint: t('btn_hint'),
            hintUsed: t('hintUsed'),
          }}
        />
      </GameShell>
    );
  }

  const c = counts();

  /**
   * Пункты выпадающего «Режима». ⚠️ ОБЫЧНЫЕ ВЫЧИСЛЕНИЯ, НЕ ХУКИ: стоят после раннего выхода
   * партии, а хук здесь поменял бы их число между фазами (React #310).
   * Один список на подписи, числа и действие — второго перечисления режимов на экране нет.
   */
  type ПунктРежима = { ключ: string; имя: string; число: number | null; поставить: () => void };
  const пунктыРежима: ПунктРежима[] = [
    { ключ: 'levels', имя: t('modeLevels'), число: null,
      поставить: () => { setРежим(null); setУзор(null); setМикс(false); } },
    { ключ: 'mix', имя: t('mixedMode'), число: mixedMotifCount(),
      поставить: () => { setРежим(null); setУзор(null); setМикс(true); } },
    { ключ: 'sacrifice', имя: t('scholarsSacrificeMode'), число: c.sacrifice,
      поставить: () => { setРежим('sacrifice'); setУзор(null); setМикс(false); } },
    ...NAMED_MOTIFS.map((имя): ПунктРежима => ({
      ключ: `motif:${имя}`, имя: имяУзора(имя), число: namedMotifCount(имя),
      поставить: () => { setРежим(null); setУзор(имя); setМикс(false); },
    })),
  ];
  const ключРежима = микс ? 'mix' : режим === 'sacrifice' ? 'sacrifice' : узор ? `motif:${узор}` : 'levels';
  const пунктРежима = пунктыРежима.find((п) => п.ключ === ключРежима);
  /**
   * 🔴 КАРТОЧКА ОПИСЫВАЕТ ТО, ЧТО НАЧНЁТСЯ, А НЕ ЛЕСТНИЦУ ВООБЩЕ. Замер 17.09.2026, кадр
   * 390×844: выбран «Мат с жертвой», а карточка — «Поставь мат в один ход · Новый узор:
   * Детский мат · Позиций в наборе: 31350». Время и число позиций у режима отработки те же,
   * что у уровня, поэтому строка с секундами остаётся; меняются три строки — виды, узор
   * ступени (он про лестницу) и размер набора (у режима он свой, тот же, что в списке).
   */
  const наЛестнице = ключРежима === 'levels';
  const позицийВНаборе = наЛестнице
    ? c.mate + c.fromGames + c.defend + c.threat + c.sacrifice
    : (пунктРежима?.число ?? 0);

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
                {/*
                  Допуск промахов показан ЧЕЛОВЕКУ: ось «цена ошибки» растёт с
                  уровнем, и если о ней не сказать, повышение планки выглядит как
                  «стало почему-то не засчитываться».
                  ⚠️ Значком и числом, без нового ключа словаря: «✕ ≤2» читается
                  одинаково на всех двенадцати языках, а новый ключ пришлось бы
                  заводить в общем слое.
                */}
                {п.seconds} {t('secShort')} · {п.count} · ✕ ≤{допускПромахов(level)}
              </Text>
            </View>
            {/*
              🔴 ЧЕМУ УЧИТ ЭТОТ УРОВЕНЬ — СЛОВАМИ, А НЕ НОМЕРОМ.
              Замер 12.09.2026: карточка называла ноль из видов задания, стоящих на
              уровне. Человек видел «Уровень 19 · 13 с · 10 · ✕ ≤1» и узнавал, что здесь
              спрашивают «грозит ли мат» и «защитись», только начав играть. У соседней
              игры такая строка есть с самого начала (`chess-blind.tsx`, `descBits`).
              ⚠️ Новых ключей НЕТ: подписи те же, что игра показывает над доской, и
              берутся из одной карты в ядре. Разойтись им не даёт проба.
            */}
            <View style={стили.строка}>
              <Ionicons name="school-outline" size={18} color={colors.textSecondary} />
              <Text style={[стили.подсказка, { color: colors.text, flex: 1 }]}>
                {подписиВидов(видыРежима(level, режим, узор, микс)).map((к) => t(к)).join(' · ')}
              </Text>
            </View>
            {/* Узор, который ОТКРЫВАЕТСЯ именно здесь: ступень названа тем, что на ней ново. */}
            {(() => {
              const узорСтупени = наЛестнице ? newMotifAt(level) : undefined;
              const имя = узорСтупени ? имяУзора(узорСтупени) : '';
              return имя ? (
                <View style={стили.строка}>
                  <Ionicons name="sparkles-outline" size={18} color={colors.textSecondary} />
                  <Text style={[стили.подсказка, { color: colors.text, flex: 1 }]}>
                    {t('scholarsNewMotif')}: {имя}
                  </Text>
                </View>
              ) : null;
            })()}
            {/*
              ⚠️ Было четыре голых числа подряд — «38028 · 378 · 3000 · 371».
              Что это, не понимал никто, включая меня через час. Теперь одна
              подписанная цифра: сколько всего позиций в наборе.
            */}
            <Text style={[стили.мелко, { color: colors.textSecondary }]}>
              {t('scholarsBank').replace('{n}', String(позицийВНаборе))}
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

          {/*
            🔴 РЕЖИМ — ВЫПАДАЮЩИМ СПИСКОМ, А НЕ ПОРТЯНКОЙ ИЗ ДВАДЦАТИ ОДНОЙ КНОПКИ (Денис 17.09.2026).

            📍 ЗАМЕР ДО: «Отработать один узор» раскрывался прямо в экран списком из 21 строки
            (микс, жертва, 19 узоров), и КАЖДАЯ строка сразу запускала партию. Выбора как такового
            не было — был набор кнопок старта, а нижняя «Начать» при этом всегда запускала лестницу
            и молча игнорировала узор.

            Теперь закрытая строка показывает ТЕКУЩИЙ режим, список раскрывается под ней, выбор
            СТАВИТ режим, а партию запускает одна «Начать». Сам список — ОБЩИЙ `DropdownSelect`
            (решение Дениса 17.09: «общий делать»), своей копии у экрана больше нет; число позиций
            режима идёт припиской справа.
            Подписи — существующие ключи (`mode`, `modeLevels`, `mixedMode`, `scholarsSacrificeMode`,
            имена узоров): новых строк ноль.

            ⚠️ Карточка уровня выше читает тот же выбор (`видыРежима`, `позицийВНаборе`): «выбрано,
            но не начато» — это состояние, и всё, что описывает «что начнётся», обязано его видеть.
          */}
          <DropdownSelect
            подпись={t('mode')}
            значение={ключРежима}
            варианты={пунктыРежима.map((п) => ({ значение: п.ключ, текст: п.имя, справа: п.число === null ? undefined : String(п.число) }))}
            onChange={(ключ) => пунктыРежима.find((п) => п.ключ === ключ)?.поставить()}
            акцент={GRADIENT[0]}
            цвета={colors}
            testID="scholars-mode"
          />
        </ScrollView>
      )}

      {phase === 'config' && (
        /* «Начать» запускает ВЫБРАННЫЙ режим. До 17.09 здесь стояло `start(поток)` — лестница при
           любом выбранном узоре: `start` без доводов сбрасывает узор, жертву и микс в ноль. */
        <GameSetupBar label={t('start')} onStart={() => start(поток, режим, узор, микс)} colors={GRADIENT as [string, string]} />
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
          onContinue={() => start(поток, режим, узор, микс)} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && last && (
        <GameResult score={last.solved} time={Math.round(last.medianMs) / 1000}
          errors={last.total - last.solved}
          onPlayAgain={() => start(поток, режим, узор, микс)} onGoHome={() => goBackOrHome()}
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
  // Выпадающий режим: строка и пункты не ниже порога нажатия (48), как у «Мысленного вращения».
  узорСтрока: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  строка: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
