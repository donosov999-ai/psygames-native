/* psygames-game-puzzles · VER 4 · 10.09.2026 */
/**
 * ГОЛОВОЛОМКИ ТЭТХЭМА — ВСЕ СОРОК движков на одном экране.
 *
 * Доску рисует ЕГО код, но не на своём холсте: мост записывает вызовы рисования
 * примитивами, а мы рисуем их своим SVG (`PuzzleCanvas`) — каркас, цвета и шрифты наши.
 * Нажатие пересчитывается в его координаты и уходит в движок: ПРАВИЛА ЗНАЕТ ОН, у нас
 * их нет ни одних. Подсказка — его же решатель.
 *
 * 📌 Ступень автора — ОСЬ нашей лестницы (решение Дениса 10.09.2026). У каждой
 * головоломки свой набор: у Solo шестнадцать ступеней, у Unruly семь, у Fifteen одна.
 *
 * 🔴 ЛЕСТНИЦА ДВУСТОРОННЯЯ, И СОБЫТИЕ ПРОВАЛА ПРИШЛОСЬ НАЙТИ. У головоломки нет ни
 * таймера, ни проигрыша: партия длится, пока не решена. Единственный честный признак
 * «не осилил» — ВЗЯЛ ВЕСЬ ОТВЕТ решателем. Поэтому доигранная решателем партия уровень
 * не поднимает, а роняет через гистерезисный `lvl.fail()` (третий подряд → −1). Без
 * этого человек, застрявший на ступени 12, оставался бы на ней вечно, нажимая подсказку.
 *
 * Режим выбирается параметром `?mode=<имя движка>`; без него — «Чёт-нечет».
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
// 🔴 НЕ `useWindowDimensions`: на первом кадре он отдаёт 0, и доска считается от нулевой
// ширины. Защита живёт в общем `useScreenSize` — гейт `screen-width-guard` этого и требует.
import { useScreenSize } from '@/src/hooks/useScreenWidth';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import GameShell from '@/src/components/GameShell';
import PuzzleCanvas from '@/src/components/PuzzleCanvas';
import PlayBoard, { сторонаДоски } from '@/src/components/PlayBoard';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { HELP_OPEN_EVENT } from '@/src/components/GameHelpOverlay';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { saveSession } from '@/src/services/api';
// 🔴 НЕ Date.now(): пауза посреди партии не должна попадать в её время — общая
// дисциплина игровых часов, гейт `game-clock-discipline`.
import { gameNow } from '@/src/services/gamePause';
import { движки, type Движок } from '@/src/games/tatham-bridge';
import { открыть, указатель, стрелка, клавиша, отменить, решить, type Партия, type Жест, type Сторона } from '@/src/games/tatham-bridge/play';
import { КЛЮЧ_ИМЕНИ, КЛЮЧ_ОПИСАНИЯ, ПО_УМОЛЧАНИЮ, СТРЕЛОЧНЫЕ, СВОЯ_ЛЕСТНИЦА, ВТОРОЕ_ДЕЙСТВИЕ, ВВОД, ТОЛЬКО_ПРОТЯЖКА, ЦИФРОВЫЕ, клавишДоски } from '@/src/games/tatham-bridge/names';

const GRADIENT = ['#6C5CE7', '#A78BFA'];

export default function PuzzlesScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { w: width } = useScreenSize();
  // Тихий шаг: в вечернем режиме экран не звучит и не мигает — общий канон всех игр.
  // `isPreset` — партия из плейлиста зарядки: она уровень НЕ двигает ни вверх, ни вниз.
  const { isPreset, isCalm, autostart } = useGamePreset();
  useCalmHush(isCalm);
  const параметры = useLocalSearchParams<{ mode?: string }>();
  const имяРежима = параметры.mode || ПО_УМОЛЧАНИЮ;

  const [список, setСписок] = useState<Движок[]>([]);
  const [партия, setПартия] = useState<Партия | null>(null);
  const [ходов, setХодов] = useState(0);
  /** Взят ли весь ответ решателем — этим и меряется провал ступени, см. шапку. */
  const [сдался, setСдался] = useState(false);
  /**
   * 🔴 ЭКРАН НАСТРОЙКИ ОБЯЗАТЕЛЕН, И ЭТО НЕ УКРАШЕНИЕ. Партия у меня начиналась сразу,
   * и `pan-audit` честно доложил «кнопка входа не найдена» — то есть проверка уезда
   * вбок не могла войти в игру и молчала бы вслепую. Плюс канон `game-standard`:
   * тропинка уровней живёт на экране настройки, а не в шапке партии.
   */
  const [фаза, setФаза] = useState<'config' | 'playing' | 'cleared'>('config');
  /**
   * Второе действие переключателем. Долгое нажатие тоже работает, но его не видно —
   * Денис попросил явные кнопки снизу, и он прав: скрытый жест не находят.
   */
  const [второе, setВторое] = useState(false);
  const [зерно, setЗерно] = useState(() => Math.floor(Math.random() * 1e6));
  const начатоВ = useRef(gameNow());

  /** Сторона квадрата под доску — общий носитель стандарта (`PlayBoard`). */
  const сторонаПоля = сторонаДоски(width);

  const движок = список.find((д) => д.имя === имяРежима) ?? null;
  const ключИгры = `puzzles_${имяРежима.toLowerCase().replace(/\s+/g, '_')}`;
  const lvl = usePersistentLevel(ключИгры);
  /**
   * 🔴 «Уровень 1/0» — так это выглядело на симуляторе у «Сапёра». Два движка из сорока
   * (Mines и Loopy) своей лестницы не отдают: `psy_presets` = 0. Для них лестница
   * набрана размером поля в `СВОЯ_ЛЕСТНИЦА` — каждая ступень проверена открытием доски.
   */
  const ступени = движок
    ? (движок.ступени.length ? движок.ступени : (СВОЯ_ЛЕСТНИЦА[имяРежима] ?? []))
    : [];
  const ступеней = Math.max(ступени.length, 1);
  const ступень = Math.min(Math.max(lvl.level - 1, 0), Math.max(ступеней - 1, 0));

  const раздать = useCallback(async (д: Движок, ст: number, з: number) => {
    const лестница = д.ступени.length ? д.ступени : (СВОЯ_ЛЕСТНИЦА[д.имя] ?? []);
    setПартия(await открыть(д.индекс, лестница[ст]?.параметры ?? '', з));
    setХодов(0);
    setСдался(false);
    начатоВ.current = gameNow();
  }, []);

  useEffect(() => {
    let живо = true;
    (async () => {
      const все = await движки();
      if (!живо) return;
      setСписок(все);
      const д = все.find((x) => x.имя === имяРежима) ?? все[0];
      if (д) {
        const длина = Math.max((д.ступени.length ? д.ступени : (СВОЯ_ЛЕСТНИЦА[д.имя] ?? [])).length, 1);
        await раздать(д, Math.min(Math.max(lvl.level - 1, 0), длина - 1), зерно);
      }
      // Плейлист зарядки заходит с `?wu=1`: настройку он не проходит, партия стартует сама.
      if (живо && autostart) setФаза('playing');
    })();
    return () => { живо = false; };
    // раздаём при смене режима; уровень и новую партию ведут кнопки
  }, [имяРежима]);   // eslint-disable-line react-hooks/exhaustive-deps

  const новая = useCallback((ст?: number) => {
    if (!движок) return;
    const з = Math.floor(Math.random() * 1e6);
    setЗерно(з);
    setФаза('playing');
    void раздать(движок, ст ?? ступень, з);
  }, [движок, ступень, раздать]);

  /**
   * 🔴 «ЗАНОВО» — ТА ЖЕ РАЗДАЧА, А НЕ ДРУГАЯ ГОЛОВОЛОМКА.
   *
   * ЧТО БЫЛО. И меню паузы, и карточка тупика звали `новая()`, а она бросает НОВОЕ
   * зерно. Человек, упёршийся в доску и нажавший «Заново», получал другую доску —
   * то есть терял ту, которую разбирал. Найдено аудитом сорока головоломок
   * (psygames-codex-mac, 12.09.2026, пункт P2-06; живое воспроизведение в «Мостах»
   * до первого хода, `restart-ui.json`).
   *
   * РАЗНИЦА, КОТОРУЮ ТЕПЕРЬ ДЕРЖИМ: «Заново» повторяет текущие параметры и ЗЕРНО,
   * «Новая партия» меняет зерно. Проверять это надо сравнением самой позиции, а не
   * номера уровня: номер совпадёт и у другой доски.
   *
   * `раздать` сбрасывает счёт ходов и признак показанного ответа — то есть «Заново»
   * возвращает именно чистую ту же доску, а не её разобранное состояние.
   */
  const заново = useCallback(() => {
    if (!движок) return;
    setФаза('playing');
    void раздать(движок, ступень, зерно);
  }, [движок, ступень, зерно, раздать]);

  const начать = useCallback(() => {
    if (!движок) return;
    setФаза('playing');
    void раздать(движок, ступень, зерно);
  }, [движок, ступень, зерно, раздать]);

  const жать = useCallback(async (x: number, y: number, жест: Жест, правой: boolean) => {
    setПартия(await указатель(x, y, жест, правой));
    // Ход считаем на ОТПУСКАНИИ: протяжка узла — один ход, а не сорок кадров.
    if (жест === 'отпустил') setХодов((n) => n + 1);
  }, []);

  const шагнуть = useCallback(async (куда: Сторона) => {
    setПартия(await стрелка(куда));
    setХодов((n) => n + 1);
  }, []);

  /**
   * 🔴 ЦИФРА ВЫШЕ ДЕВЯТКИ — ЭТО БУКВА, А НЕ КОД `48 + n`.
   *
   * У судоку бывают поля 12×12 и 16×16, и автор ждёт там `a`..`g` (`solo.c:3636`):
   * `1..9`, потом `a` за десять. Мы слали `48 + ц` всегда, то есть `:`, `;`, `<`…
   * Замер 11.09.2026: на ступени 15 (блоки 3×4) МЁРТВЫМИ были три клавиши из
   * двенадцати, на ступени 16 (4×4) — семь из шестнадцати. Человек жал и ничего
   * не происходило.
   */
  const кодЦифры = (ц: number) => (ц <= 9 ? 48 + ц : 97 + (ц - 10));

  const подсказать = useCallback(() => {
    void решить().then((п) => {
      if (!п) return;                      // решатель отказал — ступень не жжём
      setСдался(true);                     // весь ответ показан — ступень не засчитана
      setПартия(п);
    });
  }, []);

  const победа = партия?.статус === 1;
  /**
   * 🔴 КОНЕЦ РАЗДАЧИ — ЭТО НЕ ТОЛЬКО ПОБЕДА. Экран ждал `статус === 1` и на всё
   * остальное молчал, а `−1` (проигрыш) не обрабатывал вовсе: партия «Заливки» с
   * исчерпанным лимитом ходов оставалась на экране навсегда.
   * Замер 11.09.2026 по всем сорока (случайная игра до смены статуса): настоящий
   * `−1` умеет отдавать ОДНА игра — «Заливка». Одна, но повисала намертво.
   */
  const проиграл = партия?.статус === -1;
  const конец = победа || проиграл;
  const прошёл = победа && !сдался;
  /**
   * 🔴 РАЗБОР — НЕ ПОБЕДА И НЕ ПРОИГРЫШ, А ТРЕТЬЕ СОСТОЯНИЕ.
   *
   * ЧТО БЫЛО. «Показать решение» отдаёт решённую позицию, у неё статус 1 — то есть
   * победа. Дальше общий путь конца партии ставил фазу `cleared`, и карточка итога
   * ложилась ПОВЕРХ только что показанного ответа. Человек нажимал «показать
   * решение» и видел «Уровень 1 — почти! Ещё раз / Остановиться» вместо ответа.
   *
   * ЗАМЕРЕНО ДВАЖДЫ И НЕЗАВИСИМО. Аудит сорока головоломок (psygames-codex-mac,
   * 12.09.2026, пункт P1-01): воспроизведено в интерфейсе у 31 игры из 37, у
   * которых решатель вообще есть. И отчёты тестировщиков того же дня: «в любом
   * приложении, если нажимаю кнопку показать решение, у меня выкидывает вот сюда»
   * (8a1b20d6), «вместо окна решения я вижу вот эту хуйню, я попал сюда, нажав
   * показать решение» (67561a7f).
   *
   * ⚠️ ЛЕСТНИЦУ ЗА ПРОСМОТР ОТВЕТА НЕ ОПУСКАЕМ. Раньше сюда попадал `lvl.fail()`:
   * `прошёл` ложно, значит ветка «иначе» — понижение. Посмотреть ответ и получить
   * за это минус ступень — наказание строже проигрыша, а человек даже не проиграл.
   * Чистую победу при этом не начисляем: `прошёл` остаётся ложным, звезда одна.
   */
  const разбор = сдался && победа;

  /*
   * 🔴 ПОТОЛОК ПОДНИМАЕТ `reach`, А НЕ ПРЯМАЯ ЗАПИСЬ. `setLevel` ставит ВЫБРАННЫЙ уровень
   * и, если человек переигрывал пройденный, срезал бы достигнутое до него — ровно это
   * ловит гейт `level-replay`. `reach` двигает только потолок вверх.
   */
  useEffect(() => {
    if (!конец) return;
    const секунд = (gameNow() - начатоВ.current) / 1000;
    if (!isPreset) {
      if (прошёл) lvl.reach(Math.min(lvl.level + 1, ступеней));
      else if (!разбор) lvl.fail();        // гистерезис понижения (3 подряд → −1)
    }
    // Разбор оставляет ответ на экране: карточка итога его бы и накрыла.
    if (!разбор) setФаза('cleared');
    void saveSession({
      passed: прошёл,
      game_type: 'puzzles',
      score: прошёл ? Math.max(0, 1000 - ходов * 5) : 0,
      time_seconds: секунд,
      difficulty: `${имяРежима}-${lvl.level}`,
      mode: имяРежима,
      details: { level: lvl.level, mode: имяРежима, moves: ходов, solver_used: сдался },
    }).catch(() => { /* офлайн — партия всё равно доиграна */ });
  }, [конец]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameShell
      title={t(КЛЮЧ_ИМЕНИ[имяРежима] ?? КЛЮЧ_ИМЕНИ[ПО_УМОЛЧАНИЮ])}
      onBack={() => router.back()}
      confirmExit={ходов > 0 && !конец}
      /**
       * 🔴 ДОСКА БЫВАЕТ ВЫШЕ ЭКРАНА, И ТОГДА ДО НИЖНИХ КЛЕТОК НЕ ДОТЯНУТЬСЯ.
       * Замер 11.09.2026 на телефоне 360 точек (под доску 328): «Колышки» на третьей
       * ступени занимают 548 экранных точек по высоте, «Угадай код» — 524, у прочих
       * тридцати восьми около 328. Прокрутки поля не было — нижняя часть доски просто
       * оказывалась за краем.
       * ⚠️ Касание доски прокрутку не перехватывает: `PuzzleCanvas` ставит себе
       * `touchAction: 'none'`, так что палец по доске по-прежнему ходит, а прокрутка
       * живёт на экране вокруг неё.
       */
      scrollableField
      overlay={фаза === 'cleared' ? (
        <LevelCleared
          gameId="puzzles"
          level={lvl.level}
          passed={прошёл}
          stars={сдался ? 1 : ходов <= ступеней * 12 ? 3 : 2}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          onContinue={() => новая()}
          onStop={() => setФаза('config')}
        />
      ) : null}
      pauseActions={[
        { id: 'resume', label: t('exitConfirmStay'), icon: 'play', primary: true },
        { id: 'restart', label: t('restart'), icon: 'refresh', onPress: () => заново() },
        { id: 'undo', label: t('btn_undo'), icon: 'arrow-undo', onPress: () => { void отменить().then(setПартия); } },
        // Подсказка живёт на ЕГО решателе: где решателя нет (Cube, Pegs, Same Game —
        // замер по `game.can_solve`), кнопки тоже нет. Кнопка-пустышка хуже отсутствия.
        /**
         * 🔴 НЕ «ПОДСКАЗКА», А «ПОКАЗАТЬ РЕШЕНИЕ» — И ЭТО ЧЕСТНОСТЬ, А НЕ ПРИДИРКА.
         * Денис 10.09.2026, глядя на кнопку `Solve game` у Тэтхэма: «типа подсказки,
         * но конечное; понятно, что это проигрыш сразу же, но зато ты можешь увидеть
         * правильную логику». Кнопка ровно это и делает — зовёт ЕГО решатель и
         * показывает ответ целиком, а ступень не засчитывает. Название «Подсказка»
         * обещало маленький намёк, и человек жал её, не зная цены.
         */
        /**
         * ⚠️ У «Сапёра» кнопка появляется только ПОСЛЕ первого хода. Раскладка мин
         * там рождается от первого щелчка (`mines.c:4032`), и до него решатель
         * честно отвечает «Game has not been started yet». Показывать кнопку,
         * которая заведомо откажет, — та же пустышка.
         */
        ...(движок?.решаем && (движок.имя !== 'Mines' || ходов > 0)
          ? [{ id: 'hint', label: t('puzzleShowSolution'), icon: 'bulb-outline' as const, onPress: подсказать }]
          : []),
        { id: 'rules', label: t('btn_rules'), icon: 'help-circle-outline', onPress: () => DeviceEventEmitter.emit(HELP_OPEN_EVENT) },
        { id: 'home', label: t('goHome'), icon: 'home', leave: true },
      ]}
      hud={[
        /**
         * 🔴 ПОКА ОПИСЬ ДВИЖКОВ НЕ ПОДНЯЛАСЬ — ПРОЧЕРК, А НЕ ВЫДУМАННОЕ «1/1».
         *
         * `ступеней` считается как `max(ступени.length, 1)`, а до загрузки wasm
         * `движок` пуст и ступеней ноль — значит экран уверенно показывает «1/1»
         * ЛЮБОЙ головоломке, даже той, у которой их шестнадцать.
         *
         * 📍 Замер 11.09.2026, свой показ без торможения сети: «1/1» видно с 263-й
         * по 652-ю миллисекунду, потом становится «1/3». Окно растёт вместе со
         * временем загрузки модуля (969 КБ), и на телефоне оно заметно длиннее.
         * Отсюда сообщение чата «Пространство»: «Клоцки показывают Уровень 1/1,
         * хотя psy_presets отдаёт 3» — пресеты отдавали три всегда, читали раньше
         * времени. Прочерк не врёт и не требует угадывать, дочитался ли модуль.
         */
        { key: 'level', icon: 'trending-up-outline', label: t('hud_step'), value: движок ? `${lvl.level}/${ступеней}` : '—' },
        { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: ходов, pop: true },
        /**
         * 🔴 ТРЕТИЙ СЧЁТЧИК СЧИТАЕТ САМ ДВИЖОК, И МЫ ЕГО ВЫБРАСЫВАЛИ. Замер
         * 10.09.2026: строку состояния ведут 14 движков из 40, у двенадцати она
         * меняется по ходу партии — «отмечено 3 из 5», «соединено 6 из 25»,
         * «подсказок осталось 44». Ровно та обратная связь, которой не хватало.
         * Разбор и подписи — в `tatham-bridge/status.ts`: показываем НАШИ слова и
         * числа движка, а не его английский текст.
         */
        ...(партия?.ход
          ? [{ key: 'engine', icon: 'stats-chart-outline' as const, label: t(партия.ход.ключ), value: партия.ход.значение }]
          : []),
      ]}
    >
      {/**
        * ⚠️ Настройка без описи движков — это экран, который ВРЁТ и не работает:
        * лестница показывает «1/1» вместо настоящей, а кнопка «Начать» ничего не
        * делает — `начать()` первой строкой выходит по `if (!движок) return`.
        * Ждём опись тем же кружком, что и раздачу партии.
        */}
      {фаза === 'config' && !движок ? (
        <View style={styles.centre}><ActivityIndicator color={colors.primary} /></View>
      ) : фаза === 'config' ? (
        <View style={styles.centre}>
          {/*
            ⚠️ Строка задания держит ПОСТОЯННУЮ высоту: у одних игр она в одну строку,
            у других в три, и без этого доска съезжала на два десятка точек от игры к
            игре — половина жалобы «плавает по высоте».
          */}
          <Text numberOfLines={3} style={[styles.rule, { color: colors.textSecondary }]}>
            {t(КЛЮЧ_ОПИСАНИЯ[имяРежима] ?? КЛЮЧ_ОПИСАНИЯ[ПО_УМОЛЧАНИЮ])}
          </Text>
          <LevelProgressMap
            gameId={ключИгры}
            currentLevel={lvl.level}
            bestLevel={lvl.best}
            maxLevel={ступеней}
            colors={colors}
            language={language}
            onPickLevel={(n: number) => lvl.pick(n)}
          />
          <Pressable
            accessibilityRole="button"
            onPress={начать}
            style={[styles.start, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.startText}>{t('start')}</Text>
          </Pressable>
        </View>
      ) : !партия ? (
        <View style={styles.centre}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <View style={styles.centre}>
          {/*
            🔴 ЗАДАНИЕ ВИСИТ НАД ДОСКОЙ ВСЮ ПАРТИЮ, а не только на настройке. Правила у
            двадцати головоломок разные и ни одни не наши: без строки доска Тэтхэма —
            набор клеток без смысла. Гейт `game-task-line` держит её именно в партии.
          */}
          <Text style={[styles.rule, { color: colors.textSecondary }]}>
            {t(КЛЮЧ_ОПИСАНИЯ[имяРежима] ?? КЛЮЧ_ОПИСАНИЯ[ПО_УМОЛЧАНИЮ])}
          </Text>
          {/*
            🔴 МЕСТО ПОД ДОСКУ ОДНО И ТО ЖЕ У ВСЕХ СОРОКА — квадрат, а не «сколько
            вышло». Денис 11.09.2026: «то там по высоте, то там, то шире, то уже».
            Доска вписывается в этот квадрат по обеим сторонам и стоит в середине.
          */}
          <PlayBoard ширинаЭкрана={width}>
            <PuzzleCanvas
              партия={партия}
              ширина={сторонаПоля}
              высота={сторонаПоля}
              фон={colors.background}
              onЖест={(x, y, ж, п) => { void жать(x, y, ж, п || второе); }}
            />
          </PlayBoard>
          {/*
            🔴 ВЫХОД ИЗ ТУПИКА СТОИТ ТАМ, ГДЕ ТУПИК, — НАД ДОСКОЙ.
            Денис 11.09.2026, снимок «Сапёра» с подорванной клеткой: «в конце не
            двигается, выходит только через кнопку паузы». Так и было: у «Сапёра» и
            «Инерции» подрыв — не проигрыш (см. `status.ts`), партия продолжается, а
            единственное осмысленное действие — отменить ход — лежало в меню паузы.
            Человек видит мёртвую доску и не догадывается туда лезть.
          */}
          {партия?.подорвался || партия?.тупик ? (
            <View style={[styles.тупик, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/*
                Два разных положения — две разные подписи. «Подорвался» зовёт отменить
                ход, «ходов больше нет» — начать заново: отменять там нечего, партия
                доиграна до конца, просто без победы.
              */}
              <Text style={[styles.тупикТекст, { color: colors.text }]}>
                {партия?.подорвался ? t('puzzleBlownUp') : t('puzzleNoMoves')}
              </Text>
              <View style={styles.тупикРяд}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { void отменить().then(setПартия); }}
                  style={[styles.тупикКнопка, { backgroundColor: GRADIENT[0] }]}
                >
                  <Ionicons name="arrow-undo" size={18} color="#FFF" />
                  <Text style={styles.тупикКнопкаТекст}>{t('btn_undo')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => заново()}
                  style={[styles.тупикКнопка, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                >
                  <Ionicons name="refresh" size={18} color={colors.text} />
                  <Text style={[styles.тупикКнопкаТекст, { color: colors.text }]}>{t('restart')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {/*
            Подсказка тем, у кого тычок не работает вовсе (см. `ТОЛЬКО_ПРОТЯЖКА`):
            без неё доска выглядит сломанной — жмёшь и ничего.
          */}
          {ТОЛЬКО_ПРОТЯЖКА.has(имяРежима) ? (
            <Text style={[styles.протяжка, { color: colors.textSecondary }]}>{t('puzzleDragHint')}</Text>
          ) : null}
          {/* Второе действие: им ставят пустую клетку, метку, обратный перебор. */}
          {ВТОРОЕ_ДЕЙСТВИЕ.has(имяРежима) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: второе }}
              onPress={() => setВторое((v) => !v)}
              style={[styles.второе, {
                borderColor: второе ? GRADIENT[0] : colors.border,
                backgroundColor: второе ? GRADIENT[0] : colors.card,
              }]}
            >
              <Ionicons name="swap-horizontal" size={18} color={второе ? '#FFF' : colors.text} />
              <Text style={[styles.второеТекст, { color: второе ? '#FFF' : colors.text }]}>
                {t('puzzleSecondAction')}
              </Text>
            </Pressable>
          ) : null}
          {/* Клавиши цифр — вид взят у судоку (`numPad`), там он выверен по пальцу. */}
          {ЦИФРОВЫЕ.has(имяРежима) ? (
            <View style={styles.цифры}>
              {Array.from({ length: клавишДоски(имяРежима, движок?.ступени?.[ступень]?.параметры ?? '') }, (_, k) => k + 1).map((ц) => (
                <Pressable
                  key={ц}
                  accessibilityRole="button"
                  accessibilityLabel={String(ц)}
                  onPress={() => { void клавиша(кодЦифры(ц)).then(setПартия); }}
                  style={[styles.цифра, { backgroundColor: GRADIENT[0] }]}
                >
                  <Text style={styles.цифраТекст}>{ц}</Text>
                </Pressable>
              ))}
              {/*
                🔴 БЕЗ «СТЕРЕТЬ» ОШИБОЧНУЮ ЦИФРУ СНИМАЛИ ТОЛЬКО ЧЕРЕЗ МЕНЮ ПАУЗЫ.
                Замер 11.09.2026: движок стирает клетку кодом `0` — «Небоскрёбы»
                16 попаданий из 16, «Заполнение областей» 18 из 18, «Нежить» 3 из 5.
                Ряд строился как `1..N`, и кнопки стирания в нём не было НИ НА ОДНОМ
                из шести цифровых экранов.
              */}
              {/*
                🔴 «ГОТОВО» — ЕДИНСТВЕННЫЙ СПОСОБ СХОДИТЬ В «УГАДАЙ КОД». Цифры
                набирают строку, но на проверку она уходит только по Enter. Замер
                11.09.2026: код 13 меняет рисунок; без кнопки набор висел, и партия
                не двигалась вовсе.
              */}
              {ВВОД.has(имяРежима) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('storyDone')}   /* «Готово» в словаре уже есть — своего ключа не завожу */
                  onPress={() => { void клавиша(13).then(setПартия); }}
                  style={[styles.цифра, { width: 74, backgroundColor: GRADIENT[0] }]}
                >
                  <Ionicons name="checkmark" size={24} color="#FFF" />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('a11yErase')}
                /**
                 * ⚠️ У «УГАДАЙ КОД» СТИРАЕТ НЕ КЛАВИША, А ОТМЕНА ХОДА. Я посадил сюда
                 * код 8 (забой) по аналогии с цифровыми — и это было МОЕЙ выдумкой,
                 * а не замером. Проверка 11.09.2026: код 8 даёт 0 попаданий из 4, и
                 * перебор 32…127 плюс 8/9/13/27/127 не нашёл НИ ОДНОГО кода, который
                 * убирает поставленный цвет. У остальных шести цифровых код 48
                 * стирает в 1063 случаях из 1063 на 58 ступенях.
                 * Поэтому здесь честная отмена хода: она поставленный цвет снимает.
                 */
                onPress={() => {
                  if (ВВОД.has(имяРежима)) { void отменить().then(setПартия); return; }
                  void клавиша(48).then(setПартия);
                }}
                style={[styles.цифра, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              >
                <Ionicons name="backspace-outline" size={24} color={colors.text} />
              </Pressable>
            </View>
          ) : null}
          {СТРЕЛОЧНЫЕ.has(имяРежима) ? (
            <View style={styles.крестовина}>
              {([['влево', 'chevron-back'], ['вверх', 'chevron-up'], ['вниз', 'chevron-down'], ['вправо', 'chevron-forward']] as const).map(([куда, знак]) => (
                <Pressable
                  key={куда}
                  accessibilityRole="button"
                  accessibilityLabel={куда}
                  onPress={() => { void шагнуть(куда); }}
                  style={[styles.стрелка, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Ionicons name={знак} size={22} color={colors.text} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 10 },
  // 54 = три строки по 18: место под задание не зависит от длины текста.
  rule: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 320, height: 54, textAlignVertical: 'center' },
  start: { minHeight: 52, paddingHorizontal: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  крестовина: { flexDirection: 'row', gap: 10 },
  протяжка: { marginTop: 10, fontSize: 13, textAlign: 'center', maxWidth: 420, fontWeight: '600' },
  тупик: {
    marginTop: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 10, alignSelf: 'stretch', maxWidth: 420,
  },
  тупикТекст: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  тупикРяд: { flexDirection: 'row', gap: 10 },
  // 48 — пол площади нажатия (`tap-target-audit`), тот же, что у второго действия.
  тупикКнопка: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, minHeight: 48,
  },
  тупикКнопкаТекст: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  второе: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center',
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1.5, minHeight: 48,
  },
  второеТекст: { fontSize: 14, fontWeight: '800' },
  // Ряд клавиш как в судоку: 50×50, скругление 12, крупная цифра — размер выверен
  // там по пальцу (репорт Вали 28.08: «капсулы снизу слишком широкие»).
  цифры: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12, maxWidth: 420 },
  цифра: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  цифраТекст: { color: '#FFF', fontSize: 26, fontWeight: '800' },
  // ⚠️ 48 — не «покруглее», а пол `tap-target-audit` (48×48). На 46 CI поймал кнопку
  // второго действия 182×46 и был прав: два пункта ниже пола на КАЖДОМ нажатии игры.
  стрелка: { width: 54, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
