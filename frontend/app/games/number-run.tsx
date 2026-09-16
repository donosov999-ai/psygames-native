/* psygames-game-number-run · VER 3 · 16.09.2026 */
/**
 * ЧИСЛОВОЙ ЗАБЕГ — ЭКРАН НА ОБЩЕМ КАРКАСЕ.
 *
 * VER 3 (16.09.2026, схема ~/dev/psygames/counting-chat/SPEC_RUNNER_HUB_STATIONS.md;
 * Денис: «соединить все упражнения хаба по счёту в раннере»): два режима общей
 * панелью «Уровни / Свободно». УРОВНИ — 90 секунд, станции хаба «Счёт» входят по
 * главам (4+ блиц-арки «Мат. спринта», 7+ ворота «ровно N» «Состава числа»),
 * каждый третий уровень — страж (`BOSS_EVERY`, канон `constants/bosses.ts`);
 * пройден — ≥ 5 стен из 10 или страж побеждён; итог — общий `LevelCleared`.
 * СВОБОДНО — прежний марафон: 12 этапов × 42 с без уровней.
 *
 * VER 2 (16.09.2026, psygames-search-claude-mac; Денис: «у нас слишком простой»):
 * маршрут VER 4 — змейки, сетки, две стопки за столбом, стены операций, трамплин
 * над большим красным, финальная лестница стен. В итоге — сколько стен пробило
 * число (`numberRunWalls`), и то же уходит в сессию (`details.walls`).
 *
 * Игру собрал `psygames-codex-mac` (LOCAL 0.4, `renderer-lab/`), передал
 * инструкцией `RUNNER_INTEGRATION_FOR_CLAUDE.md` VER 1 от 12.09.2026. Здесь —
 * только стыковка: шапка, показатели, пауза, нижнее управление и штатный итог
 * принадлежат приложению; механика целиком в перенесённых модулях ядра.
 *
 * ━━━ ЧТО ЭТО ЗА ИГРА ━━━
 * Один непрерывный забег: 12 этапов по 42 секунды, 504 активные секунды БЕЗ
 * сброса числа и без меню между этапами. Синие блоки прибавляют, красные
 * вычитают написанное; в поперечном ряду до пяти чисел, и каждое собирается
 * независимо — можно взять все пять, а не выбрать одно из трёх.
 *
 * 🔴 ЭТО НЕ КОРОТКАЯ ПРОБА, И В ЗАРЯДКУ ОНА НЕ ВКЛЮЧАЕТСЯ. Полный забег длится
 * 8:24. Короткий preset для зарядки — отдельное согласованное решение о
 * длительности, а не тихая подмена основного режима (требование инструкции).
 *
 * ⚠️ СМЕНА ЭТАПА — НЕ ПОБЕДА. Штатный итог пишется ОДИН раз на весь забег;
 * `LevelCleared` на каждом из двенадцати этапов был бы враньём об успехе.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import GameShell from '@/src/components/GameShell';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { onGameHold, isGameHeld, requestPauseMenu } from '@/src/services/gamePause';
import { useImmersive } from '@/src/hooks/useImmersive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ПАЛЕЦ, ПОЛЯ_ОТВЕТА } from '@/src/components/gameLayout';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { saveSession } from '@/src/services/api';
import { goBackOrHome } from '@/src/utils/nav';
import NumberRunGame, { type РульЗабега, type ПоказателиЗабега, type ИтогЗабега, type СтанцияВпереди } from '@/src/games/number-run/NumberRunGame.web';
import GameModeSwitch from '@/src/components/GameModeSwitch';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';

const GRADIENT = ['#2563eb', '#7c3aed'] as const;
/** 12 этапов × 42 секунды — из `runner-campaign.mjs`, не выдумано здесь. */
const ЭТАПОВ = 12;
const СЕКУНД_НА_ЭТАП = 42;
/** Уровень — 30 рядов по 24 при скорости 8: `runner-level.mjs`. */
const СЕКУНД_УРОВНЯ = 90;
/** Веха-страж каждый третий уровень — то же число, что в `constants/bosses.ts` (гейт bosses сверяет копии). */
const BOSS_EVERY = 3;
/** Сколько уровней рисует тропинка. Дальше лестница не кончается: станции растут лестницами упражнений. */
const УРОВНЕЙ_НА_КАРТЕ = 30;

type Фаза = 'config' | 'playing' | 'cleared' | 'result';
type Режим = 'levels' | 'free';
const ПУСТЫЕ_ПОКАЗАТЕЛИ = (этапов: number): ПоказателиЗабега => ({ число: 1, этап: 1, этапов, столкновений: 0, секунд: 0, промахов: 0, станция: null });

export default function NumberRunScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { isCalm, isPreset } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка, общий канон
  const [фаза, setФаза] = useState<Фаза>('config');
  const [зерно, setЗерно] = useState(() => Math.floor(Math.random() * 1e6));
  const [пауза, setПауза] = useState(isGameHeld());
  const [показатели, setПоказатели] = useState<ПоказателиЗабега>(ПУСТЫЕ_ПОКАЗАТЕЛИ(ЭТАПОВ));
  /**
   * «Уровни» — лестница со станциями хаба; «Свободно» — марафон 8:24 без уровней.
   * ⚠️ Имя латиницей нарочно: гейт game-mode-switch узнаёт сеттер панели регуляркой `\w`,
   * а она кириллицу не видит — «setРежим» читался как «сеттера нет».
   */
  const [playMode, setPlayMode] = useState<Режим>('levels');
  const lvl = usePersistentLevel('number_run');
  /** Уровень ЭТОЙ партии: снимается на старте, чтобы подъём уровня на итоге не перестроил идущий забег. */
  const [уровеньПартии, setУровеньПартии] = useState<number | null>(null);
  const [итог, setИтог] = useState<ИтогЗабега | null>(null);
  /**
   * ⚠️ ВЫСОТА РЯДА ФИШЕК — ЗАМЕРОМ, А НЕ ЧИСЛОМ ПАЛЬЦА. Четырёхзначное число переносит
   * фишку столкновений на вторую строку, и она ложилась на строку задания (кадр живого
   * забега 16.09.2026: «8420 · 12/12», под ними «⊗ 0» поверх «Синее прибавляет…»).
   * Стоит здесь, до ранних return фаз: хук после них ломает смену фазы.
   */
  const [высотаВерха, setВысотаВерха] = useState(ПАЛЕЦ);
  const руль = useRef<РульЗабега | null>(null);
  const итогЗаписан = useRef(false);
  /** Отступы телефона (вырез, полоса «домой») — полноэкранный слой ложится под них. */
  const insets = useSafeAreaInsets();

  /**
   * 🔴 ПАУЗА БЕРЁТСЯ ИЗ ОБЩЕЙ СЛУЖБЫ, А НЕ ИЗ СВОЕГО ФЛАГА. Меню паузы рисует
   * каркас, и держит игру он же (`holdGame`). Свой флаг разошёлся бы с ним при
   * любом другом источнике удержания — например, при открытом отзыве.
   */
  useEffect(() => onGameHold((held) => setПауза(held)), []);
  /**
   * Полосы телефона (часы, «домой») уходят, пока идёт забег, и возвращаются на
   * паузе и на итоге — правила в `src/services/immersive.ts`, Денис 16.09.2026.
   */
  useImmersive(фаза === 'playing');

  const начать = useCallback(() => {
    const уровень = playMode === 'levels' ? lvl.level : null;
    setУровеньПартии(уровень);
    setЗерно(Math.floor(Math.random() * 1e6));
    setИтог(null);
    итогЗаписан.current = false;
    setПоказатели(ПУСТЫЕ_ПОКАЗАТЕЛИ(уровень === null ? ЭТАПОВ : 1));
    setФаза('playing');
  }, [playMode, lvl.level]);

  /**
   * ⚠️ ОДНА ЗАПИСЬ НА ЗАБЕГ. `итогЗаписан` сторожит повтор: адаптер может отдать
   * итог и по «упал», и по потере графики, а сессия должна лечь ровно одна.
   */
  const принятьИтог = useCallback((и: ИтогЗабега) => {
    setИтог(и);
    // Уровень — общий экран «уровень пройден / ещё раз»; марафон — свой итог забега.
    setФаза(и.уровень !== null ? 'cleared' : 'result');
    if (итогЗаписан.current) return;
    итогЗаписан.current = true;
    /** Уровень партии латиницей: гейт game-standard ищет запись `level: …Level` в сессии. */
    const playedLevel = и.уровень;
    // В зарядке лестница не двигается — шаг зарядки не экзамен уровня (гейт warmup-level-drift).
    if (playedLevel !== null && !isPreset) {
      if (и.пройден) lvl.reach(playedLevel + 1);   // пройден → следующий уровень
      else lvl.fail();                             // три провала подряд → −1 уровень (правило хука)
    }
    void saveSession({
      passed: и.пройден,
      game_type: 'number_run',
      score: и.число,
      time_seconds: и.активныхСекунд,
      difficulty: и.уровень !== null ? `level-${и.уровень}` : `journey-${и.этаповПройдено}/${ЭТАПОВ}`,
      mode: и.уровень !== null ? 'levels' : 'journey',
      details: {
        stages: и.этаповПройдено, hits: и.столкновений, mistakes: и.промахов,
        number: и.число, reason: и.причина, seed: зерно,
        walls: и.стен, walls_total: и.стенВсего,
        level: playedLevel, boss: и.страж !== null, guard: и.страж,
      },
    }).catch(() => { /* офлайн — забег всё равно пройден */ });
  }, [зерно, lvl, isPreset]);

  const рулить = useCallback((x: number) => руль.current?.рулить(x), []);

  /**
   * ⚠️ КЛЮЧ ТЕМЫ СЧИТАЕТСЯ ДО `useMemo`, А НЕ ВНУТРИ СПИСКА ЗАВИСИМОСТЕЙ. Вызов
   * функции в списке — правило `react-hooks/use-memo`, и заглушить его строкой про
   * `exhaustive-deps` нельзя: это разные правила. Поймал линт, не я.
   */
  const ключЦветов = колорыКлюч(colors);

  const нижниеКнопки = useMemo(() => (
    /**
     * 🔴 ТРИ КНОПКИ: ЛЕВЫЙ КРАЙ, ЦЕНТР, ПРАВЫЙ КРАЙ. Это НЕ крестовина и не
     * повод добавить фиктивные ↑/↓: прыжок запускает трамплин, а не кнопка.
     * Правило крестовины (правило 7 UI_LAYOUT_RULES) действует там, где
     * направлений действительно четыре.
     * ⚠️ Кнопки — ОТВЕТ, а не служебное: `bottom="answer"`. Рулением человек и
     * играет, смешивать с ним отмену и подсказки нельзя.
     */
    <View style={styles.руль}>
      {([[-1, 'chevron-back', 'влево'], [0, 'ellipse-outline', 'центр'], [1, 'chevron-forward', 'вправо']] as const).map(([x, знак, метка]) => (
        <Pressable
          key={метка}
          accessibilityRole="button"
          accessibilityLabel={метка}
          onPress={() => рулить(x)}
          style={[styles.кнопкаРуля, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Ionicons name={знак} size={24} color={colors.text} />
        </Pressable>
      ))}
    </View>
  ), [ключЦветов, рулить]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ── настройка: объясняем, во что человек входит ─────────────────────────── */
  if (фаза === 'config') {
    return (
      <GameShell title={t('numberRun')} onBack={() => goBackOrHome()}>
        <View style={styles.центр}>
          <Text style={[styles.заголовок, { color: colors.text }]}>{t('numberRun')}</Text>
          <Text style={[styles.правило, { color: colors.textSecondary }]}>{t('numberRunRule')}</Text>
          <View style={styles.режимы}>
            <GameModeSwitch
              mode={playMode}
              onChange={setPlayMode}
              colors={colors}
              accent={GRADIENT[0]}
              t={t}
              hint={playMode === 'levels' ? t('numberRunLevelsHint') : t('numberRunMarathonHint')}
            />
          </View>
          {playMode === 'levels' && (
            <View style={styles.карта}>
              <LevelProgressMap bestLevel={lvl.best} gameId="number_run" currentLevel={lvl.level} maxLevel={УРОВНЕЙ_НА_КАРТЕ} onPickLevel={lvl.pick} colors={colors} language={language} />
            </View>
          )}
          {/*
            Длительность названа ДО входа: у уровня — 90 секунд (и страж, если это веха),
            у марафона — 8:24. Человек должен понимать, на что соглашается.
          */}
          <Text style={[styles.длительность, { color: colors.textSecondary }]}>
            {playMode === 'levels'
              ? `${t('label_level_short')} ${lvl.level} · ${СЕКУНД_УРОВНЯ} ${t('secShort')}${lvl.level % BOSS_EVERY === 0 ? ` · ${t('numberRunGuard')}` : ''}`
              : `${ЭТАПОВ} × ${СЕКУНД_НА_ЭТАП} ${t('secShort')} · ${Math.floor(ЭТАПОВ * СЕКУНД_НА_ЭТАП / 60)}:${String(ЭТАПОВ * СЕКУНД_НА_ЭТАП % 60).padStart(2, '0')}`}
          </Text>
          <Pressable accessibilityRole="button" onPress={начать} style={styles.старт}>
            <LinearGradient colors={GRADIENT as unknown as [string, string]} style={styles.стартФон}>
              <Text style={styles.стартТекст}>{t('start')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </GameShell>
    );
  }

  /* ── итог уровня: общий экран «пройден / ещё раз» ─────────────────────────── */
  if (фаза === 'cleared' && итог && итог.уровень !== null) {
    const звёзды = итог.страж !== null
      ? (итог.промахов === 0 ? 3 : итог.промахов <= 2 ? 2 : 1)
      : (итог.стен >= 10 ? 3 : итог.стен >= 7 ? 2 : 1);
    return (
      <GameShell title={t('numberRun')} onBack={() => goBackOrHome()}>
        <LevelCleared
          gameId="number_run"
          level={итог.уровень}
          passed={итог.пройден}
          stars={звёзды}
          gradient={GRADIENT as unknown as string[]}
          language={language}
          colors={colors}
          onContinue={начать}
          onStop={() => setФаза('config')}
        />
      </GameShell>
    );
  }

  /* ── итог марафона: один на весь забег ───────────────────────────────────── */
  if (фаза === 'result' && итог) {
    return (
      <GameShell title={t('numberRun')} onBack={() => goBackOrHome()}>
        <View style={styles.центр}>
          <Text style={styles.итогЭмодзи}>{итог.победа ? '🏁' : '💫'}</Text>
          <Text style={[styles.заголовок, { color: colors.text }]}>
            {итог.победа ? t('numberRunDone') : t('retry')}
          </Text>
          {/*
            Показываем ТО, ЧТО ИГРА МЕРИТ, и ничего кроме: итоговое число, сколько
            этапов пройдено, столкновения, активное время. Медицинских норм для
            этого прототипа не выдумываем — прямой запрет инструкции.
          */}
          <View style={styles.строкиИтога}>
            {([
              [t('score'), String(итог.число)],
              // Стены финала — только если до финала доехал: у упавшего на седьмом этапе их не было.
              ...(итог.победа && итог.стенВсего > 0 ? [[t('numberRunWalls'), `${итог.стен}/${итог.стенВсего}`] as const] : []),
              [t('round'), `${итог.этаповПройдено}/${ЭТАПОВ}`],
              [t('errors'), String(итог.столкновений)],
              [t('time'), `${итог.активныхСекунд} ${t('secShort')}`],
            ] as const).map(([подпись, значение]) => (
              <View key={подпись} style={styles.строкаИтога}>
                <Text style={[styles.подписьИтога, { color: colors.textSecondary }]}>{подпись}</Text>
                <Text style={[styles.значениеИтога, { color: colors.text }]}>{значение}</Text>
              </View>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={начать} style={styles.старт}>
            <LinearGradient colors={GRADIENT as unknown as [string, string]} style={styles.стартФон}>
              <Text style={styles.стартТекст}>{t('restart')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </GameShell>
    );
  }

  /* ── забег: во весь экран ───────────────────────────────────────────────── */
  /**
   * 🔴 ПОЛНОЭКРАННЫЙ РЕЖИМ НА ВРЕМЯ ЗАБЕГА (Денис 16.09.2026: «для раннера — чтобы
   * когда игра запускается, был полноэкранный режим»).
   *
   * 📍 ДО: замер живой сборки (`/tmp/run-toolbar.mjs`) — шапка 0…58, плашка
   * показателей 58…119, строка задания 119…139, полоса руля 69 точек снизу. Дорога
   * занимала 68–69 % экрана (375×667: холст 139…598; 360×640: 139…571).
   *
   * КАК. Вся партия — в слоте `overlay` каркаса: он кладётся поверх ВСЕГО каркаса,
   * шапки в том числе (слой 80), а меню паузы (90) и вопрос о выходе — выше него.
   * Дорога идёт от верха экрана до полосы руля; счёт, этап и столкновения лежат
   * фишками прямо на дороге.
   *
   * ⚠️ ТРИ ВЕЩИ, НА КОТОРЫХ ЭТО ЛЕГКО СЛОМАТЬ:
   *  · игра рисуется В ОДНОМ МЕСТЕ всю партию. Переставь её между «слоем» и «полем»
   *    при паузе — React пересоздаст сцену, и восемь минут забега пропадут;
   *  · кнопка паузы не берёт задержку сама (`holdGame`): её «Продолжить» каркаса не
   *    снял бы, и игра замёрзла бы с закрытым меню. Она ПРОСИТ меню у каркаса
   *    (`requestPauseMenu`), и задержку берёт каркас тем же путём, что кнопка «II»;
   *  · руль живёт ВНИЗУ СЛОЯ, а не в полосе каркаса: обёртка `overlay` ловит касания
   *    во весь экран, и полоса под ней не нажималась бы. Высота и отступы — как у
   *    полосы каркаса: 10 сверху, палец 48, снизу не меньше 10, черта; поля по 66
   *    под плавающую кнопку отзыва (`ПОЛЯ_ОТВЕТА`).
   *
   * `hud` каркасу оставлен: меню паузы показывает из него «как идёт партия».
   */
  const полосаРуля = 10 + ПАЛЕЦ + Math.max(insets.bottom, 10) + StyleSheet.hairlineWidth;
  const фишка = (ключ: string, значок: React.ComponentProps<typeof Ionicons>['name'], значение: string | number, беда = false, крупно = false) => (
    <View key={ключ} style={[styles.фишка, беда ? styles.фишкаБеда : null]}>
      <Ionicons name={значок} size={крупно ? 18 : 14} color="#FFFFFF" />
      <Text style={[styles.фишкаТекст, крупно ? styles.фишкаКрупно : null]}>{значение}</Text>
    </View>
  );

  return (
    <GameShell
      title={t('numberRun')}
      onBack={() => goBackOrHome()}
      /**
       * ⚠️ ВОПРОС ПРИ ВЫХОДЕ — ЖИВОЕ ВЫРАЖЕНИЕ, А НЕ `true`. Спрашиваем, когда есть
       * что терять: забег идёт 8:24, и уйти с четвёртого этапа по случайному касанию
       * «назад» — потерять восемь минут. На нулевой секунде терять нечего, и лишний
       * вопрос там только раздражает.
       */
      confirmExit={показатели.секунд > 0}
      /**
       * Показатели ДАННЫМИ: каркас рисует их одинаково во всех играх, а меню паузы
       * показывает из них «как идёт партия». На самой дороге те же числа — фишками.
       */
      hud={[
        { key: 'sum', icon: 'trending-up', label: t('score'), value: показатели.число, tone: 'accent' as const, pop: true },
        уровеньПартии !== null
          ? { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: уровеньПартии }
          : { key: 'stage', icon: 'flag', label: t('round'), value: `${показатели.этап}/${показатели.этапов}` },
        /**
         * ⚠️ КЛЮЧ `crashes`, А НЕ `hits`. `hits` уже занят n-back, где он значит
         * ПОПАДАНИЯ — то есть успех, и канон красит его в «хорошо». У забега это
         * СТОЛКНОВЕНИЯ, то есть беда. Один ключ с двумя смыслами покрасил бы
         * ошибку зелёным; гейт `hud-tone-canon` это и поймал.
         */
        { key: 'crashes', icon: 'close-circle', label: t('errors'), value: показатели.столкновений + показатели.промахов, tone: 'bad' as const },
      ]}
      /*
        Вся партия — прямо в слоте каркаса: дорога, фишки, строка задания и руль.
        Здесь, внутри тега, а не константой выше: пробы module-games-guard и
        game-task-line читают партию по тексту между открывающим и закрывающим тегом
        каркаса. ⚠️ Сам тег в этом комментарии писать нельзя: проба режет по его букве.
      */
      overlay={(
        <View style={[styles.полныйЭкран, { backgroundColor: colors.background }]}>
          <View style={[styles.дорога, { bottom: полосаРуля }]}>
            {Platform.OS === 'web' ? (
              <NumberRunGame
                ref={руль}
                зерно={зерно}
                уровень={уровеньПартии}
                босс={уровеньПартии !== null && уровеньПартии % BOSS_EVERY === 0}
                пауза={пауза}
                onПоказатели={setПоказатели}
                onИтог={принятьИтог}
                фон={colors.background}
                цветТекста={colors.text}
              />
            ) : (
              /**
               * Приложение на телефоне — это WebView, и веб-ветка там и работает. Эта
               * заглушка на случай запуска в настоящем нативном окружении (например,
               * в пробах): лучше честная строка, чем пустой экран.
               */
              <View style={styles.центр}>
                <Text style={[styles.правило, { color: colors.textSecondary }]}>{t('numberRunWebOnly')}</Text>
              </View>
            )}
          </View>
          <View
            style={[styles.верхЗабега, { top: insets.top + 5, right: HELP_CORNER_SPACE }]}
            pointerEvents="box-none"
            onLayout={(e) => setВысотаВерха(Math.round(e.nativeEvent.layout.height))}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('gamePauseOpen')}
              onPress={() => { requestPauseMenu(); }}
              style={[styles.паузаЗабега, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="pause" size={22} color="#FFFFFF" />
            </Pressable>
            <View style={styles.фишки} pointerEvents="none">
              {фишка('sum', 'trending-up', показатели.число, false, true)}
              {фишка('stage', 'flag', уровеньПартии !== null ? `${t('label_level_short')} ${уровеньПартии}` : `${показатели.этап}/${показатели.этапов}`)}
              {фишка('crashes', 'close-circle', показатели.столкновений + показатели.промахов, показатели.столкновений + показатели.промахов > 0)}
            </View>
          </View>
          {/*
            🔴 СТРОКА ЗАДАНИЯ ЖИВЁТ ВСЮ ПАРТИЮ, а не только на настройке. Человек входит
            в забег на восемь минут; к четвёртому этапу он уже не помнит, что красное
            вычитает. Гейт `game-task-line` держит её именно в партии. В полноэкранном
            режиме — плашкой на дороге под фишками, одной строкой.
          */}
          <View style={[styles.заданиеПоверх, { top: insets.top + 5 + Math.max(ПАЛЕЦ, высотаВерха) + 6 }]} pointerEvents="none">
            {/*
              Станция впереди — строкой задания крупно: пример арки или цель ворот. На
              табло сцены он мелкий и под углом, а посчитать надо успеть до арок.
            */}
            {показатели.станция ? (
              <Text style={[styles.заданиеПоверхТекст, styles.станцияТекст]} numberOfLines={1}>{текстСтанции(показатели.станция, t)}</Text>
            ) : (
              <Text style={styles.заданиеПоверхТекст} numberOfLines={1}>{t('numberRunTask')}</Text>
            )}
          </View>
          <View
            style={[styles.низЗабега, {
              height: полосаРуля,
              paddingBottom: Math.max(insets.bottom, 10),
              paddingHorizontal: ПОЛЯ_ОТВЕТА / 2,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            }]}
          >
            {нижниеКнопки}
          </View>
        </View>
      )}
    >
      {/* Поле каркаса пустое: вся партия — в полноэкранном слое `overlay` выше. */}
      <View style={styles.подСлоем} />
    </GameShell>
  );
}

/** Строка станции: пример блиц-арки как есть, цель ворот — словами на языке игрока. */
function текстСтанции(с: СтанцияВпереди, t: (k: string) => string): string {
  return с.вид === 'blitz' ? с.пример : t('numberRunExact').replace('{n}', String(с.цель));
}

/** Ключ темы для мемоизации: пересобираем кнопки при смене цветов, а не каждый кадр. */
function колорыКлюч(c: { card: string; border: string; text: string }) { return `${c.card}|${c.border}|${c.text}`; }

const styles = StyleSheet.create({
  полныйЭкран: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  дорога: { position: 'absolute', top: 0, left: 0, right: 0 },
  подСлоем: { flex: 1 },
  верхЗабега: { position: 'absolute', left: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  паузаЗабега: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  фишки: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  фишка: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 30, borderRadius: 15, backgroundColor: 'rgba(15,23,42,0.62)' },
  фишкаБеда: { backgroundColor: 'rgba(190,18,60,0.78)' },
  фишкаТекст: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  фишкаКрупно: { fontSize: 17 },
  заданиеПоверх: { position: 'absolute', left: 10, right: 10, alignItems: 'center' },
  заданиеПоверхТекст: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(15,23,42,0.5)' },
  станцияТекст: { fontSize: 20, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(30,58,138,0.88)' },
  режимы: { alignSelf: 'stretch', maxWidth: 420 },
  карта: { alignSelf: 'stretch', maxWidth: 420 },
  низЗабега: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  центр: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 },
  заголовок: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  правило: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 420 },
  длительность: { fontSize: 13, fontWeight: '600' },
  старт: { marginTop: 8, borderRadius: 16, overflow: 'hidden' },
  стартФон: { paddingHorizontal: 34, height: 52, alignItems: 'center', justifyContent: 'center' },
  стартТекст: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  итогЭмодзи: { fontSize: 44 },
  строкиИтога: { alignSelf: 'stretch', maxWidth: 360, gap: 8, marginTop: 4 },
  строкаИтога: { flexDirection: 'row', justifyContent: 'space-between' },
  подписьИтога: { fontSize: 14 },
  значениеИтога: { fontSize: 16, fontWeight: '700' },
  /**
   * 🔴 ТРИ КНОПКИ В РЯД, И КАЖДАЯ НЕ МЕЛЬЧЕ ПАЛЬЦА ПО ОБЕИМ СТОРОНАМ (`ПАЛЕЦ` = 48).
   *
   * ⚠️ ЗДЕСЬ Я ПЕРЕПУТАЛ ОСЬ, И ГЕЙТ `tap-field` МЕНЯ ПОЙМАЛ. Стояло
   * `alignSelf: 'stretch'`, а нижний слот каркаса (`styles.toolbar` в GameShell)
   * — СТРОКА. В строке `stretch` тянет по ПОПЕРЕЧНОЙ оси, то есть по высоте;
   * ширину такой ребёнок берёт по содержимому. Внутренний `flex: 1` делил уже
   * скукоженную ширину, и кнопки выходили 26 px при пороге 48.
   *
   * 📍 Замер 12.09.2026, окно 390×844, собранный бандл: 26×48 ×3 на
   * `/games/number-run`. Ширину в строке даёт `flex`, а не `alignSelf`.
   * `minWidth` — страховка: даже в узком слоте кнопка не уедет ниже пальца.
   */
  руль: { flexDirection: 'row', gap: 10, flex: 1, justifyContent: 'center' },
  кнопкаРуля: { flex: 1, minWidth: 48, maxWidth: 120, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
