/* psygames-game-memory-palace · VER 1 · 19.08.2026 */
/**
 * Дворец памяти — метод мест: маршрут, предметы на нём, проверка вперёд и назад.
 *
 * ПРОИСХОЖДЕНИЕ. Игра G8/8 собрана psygames-codex-mac в отдельной лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-memory-palace`, коммит ff97847,
 * база — d203a4a). Модуль пришёл самодостаточным: своё ядро, свой словарь ru/en,
 * своя сцена маршрута. Здесь — стыковка с приложением.
 *
 * ЧТО ТРЕНИРУЕТ И ЧЕМ ОТЛИЧАЕТСЯ ОТ «МНЕМОНИКИ». Обе игры про порядок, и на этом
 * сходство кончается. В «Мнемонике» человеку дают список слов и просят повторить
 * его по порядку; метод он придумывает сам (с 7-го уровня игра лишь подсказывает
 * «свяжи в цепочку или разложи по комнате»), проверка одна и в одну сторону, а
 * промах виден сразу. Здесь метод не подсказан, а ВСТРОЕН: маршрут из
 * именованных мест выдан заранее и постоянен, человек сам решает, какой предмет
 * куда положить, — и меряется не список, а СВЯЗКА «предмет ↔ место». Отсюда три
 * различия, которых у «Мнемоники» нет и быть не может:
 *   · проверка идёт вперёд И НАЗАД. Зубрёжка проговариванием даёт только прямой
 *     порядок; обратный проход проходит лишь тот, кто действительно разложил
 *     предметы по местам, а не отрепетировал строчку;
 *   · среди вариантов есть ЛИШНИЕ предметы, которых на маршруте не было, — это
 *     разводит «узнаю предмет» и «помню, где он стоял». В «Мнемонике» выбирать
 *     не из чего: там весь набор и есть ответ;
 *   · счёт разнесён на три независимых числа (предметы · места · порядок), и
 *     звёзды берутся по МЕСТАМ. В «Мнемонике» метрика одна — ошибки подряд.
 * Пересечение честно назову: и там и там это память на последовательность.
 * Дублем игру это не делает — «Мнемоника» мерит объём списка (5→15 элементов),
 * «Дворец» мерит качество привязки к опоре при вдвое меньшем объёме.
 *
 * СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ, А НЕ ТАЙМЕРОМ. 15 уровней: 5 мест и 2 лишних
 * предмета на первом, 12 мест и 4 лишних на пятнадцатом. Времени на ответ игра
 * не ограничивает нигде — «то же самое, но быстрее» здесь не сложность, а помеха
 * самому методу.
 *
 * 🔴 РАУНД ВЕДЁТ МОДУЛЬ, ФИНАЛ — ПРИЛОЖЕНИЕ. У модуля есть свой экран итога, и
 * он остаётся выключенным (`showOwnResults={false}`): звёзды по уровням, серия
 * чистых прохождений и глаз-разрядка пишутся ТОЛЬКО в LevelCleared. Свой экран
 * поздравления = тихое выпадение из всей бухгалтерии, ровно как когда-то у
 * маджонга и парных картинок. Числа партии человек всё равно видит — но как
 * РАЗБОР (где именно ошибся), а не как поздравление.
 *
 * 🔴 ПАРТИЯ ЗДЕСЬ ДЛИННАЯ, ПОЭТОМУ ВЫХОД ЕЁ НЕ СТИРАЕТ. Критерий соседей
 * (`__tests__/exit-guard.test.ts`) выполняется по всем трём пунктам: маршрут
 * один на всю партию, партия идёт минутами (12 расстановок + 24 ответа плюс
 * само запоминание), а расклад случайный и по номеру уровня не воспроизводится —
 * см. `makeSeed` в integration.ts. Значит подключены оба слоя: вопрос при выходе
 * (через GameShell → useExitGuard) и хранение недоигранной партии (resume).
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
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveSession } from '@/src/services/api';
import {saveResume, clearResume} from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import { gameNow } from '@/src/services/gamePause';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import GameShell from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import { MemoryPalaceGame } from '@/src/games/memory-palace/MemoryPalaceGame';
import {
  getMemoryPalaceStrings,
  interpolateMemoryPalace,
  type MemoryPalaceLocale,
  type MemoryPalaceMetrics,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';
import {
  MEMORY_PALACE_GAME_ID,
  MEMORY_PALACE_RESUME_V,
  createPartySaver,
  hasSomethingToLose,
  makeNonce,
  makeSeed,
  memoryPalaceDifficulty,
  memoryPalaceLociForLevel,
  memoryPalacePassed,
  memoryPalaceReview,
  memoryPalaceStars,
  restoreFromResume,
  snapshotForResume,
  type MemoryPalaceResume,
  type MemoryPalaceReviewRow,
  type PartySaver,
} from '@/src/games/memory-palace/integration';

/** Задержка отложенной записи: подряд идущие касания не бьют по хранилищу каждым нажатием. */
const RESUME_DEBOUNCE_MS = 400;

/**
 * Градиент игры — из хендофа модуля (#8b5cf6 → #0f766e). Цвет текста поверх
 * считает onGradientText по ОБОИМ концам: сплошным цветом этот градиент AA не
 * берёт (белый даёт 4.23 на фиолетовом конце при норме 4.5), поэтому плашки
 * рисуются через GradientSurface — он кладёт поверх вуаль цветом самого
 * градиента и поднимает контраст до 4.56.
 */
const GRADIENT = ['#8b5cf6', '#0f766e'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

type Phase = 'config' | 'playing' | 'cleared' | 'result';

/** Живая партия: чем её рисовать и с чего продолжать. */
interface Party {
  seed: string;
  level: number;
  /** Поднятая из хранилища партия либо null — тогда модуль начинает с чистого листа. */
  restored: MemoryPalaceSession | null;
}

export default function MemoryPalaceScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const { profile } = useProfile();
  const lvl = usePersistentLevel(MEMORY_PALACE_GAME_ID);
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const mode = useGameMode();
  const width = useScreenWidth();   // голый useWindowDimensions на первом кадре отдаёт 0

  const [phase, setPhase] = React.useState<Phase>('config');
  const [party, setParty] = React.useState<Party | null>(null);
  const [last, setLast] = React.useState<MemoryPalaceMetrics | null>(null);
  const [review, setReview] = React.useState<MemoryPalaceReviewRow[]>([]);
  const [clearedPassed, setClearedPassed] = React.useState(false);

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
  const locale = language as MemoryPalaceLocale;
  const strings = getMemoryPalaceStrings(locale);

  // Уровень из адреса (шаг зарядки, вызов дня) важнее сохранённого.
  const level = num('level', lvl.level);

  /**
   * Живое состояние модуля. Держим в ref, а не в состоянии экрана: партия
   * меняется на каждое касание, и перерисовывать из-за этого весь экран (вместе
   * с тропинкой уровней) незачем. В состояние выносим ровно один вывод —
   * «есть ли что терять», от него зависит вопрос при выходе.
   */
  const sessionRef = React.useRef<MemoryPalaceSession | null>(null);
  const [armed, setArmed] = React.useState(false);
  /** Живая партия для отложенного сохранения — без неё в таймере окажется старый уровень. */
  const partyRef = React.useRef<Party | null>(null);
  partyRef.current = party;
  const saverRef = React.useRef<PartySaver | null>(null);

  /** Дописать партию в хранилище. null от snapshotForResume = сохранять нечего. */
  const persistParty = React.useCallback(() => {
    const pid = profile?.id;
    const live = partyRef.current;
    if (!pid || !live) return;
    const snap = snapshotForResume(sessionRef.current, live.level, gameNow());
    if (!snap) return;
    saveResume<MemoryPalaceResume>(MEMORY_PALACE_GAME_ID, pid, MEMORY_PALACE_RESUME_V, snap).catch(() => {});
  }, [profile?.id]);

  /**
   * 🔴 ОТЛОЖЕННОЕ СОХРАНЕНИЕ ПЕРЕЗАВОДИТСЯ НА КАЖДОМ ХОДУ.
   *
   * Первая версия вешала таймер эффектом с зависимостью от `armed` — и это
   * молча ломало всё дело: `armed` меняется РОВНО ОДИН РАЗ, на первой положенной
   * вещи, эффект больше не перезапускался, и в хранилище навсегда оставался
   * снимок из первых секунд партии. Живая проверка 19.08.2026 показала ровно
   * это: пять предметов разложены, а в хранилище лежат два.
   *
   * Поэтому таймер живёт не в эффекте, а рядом с самим изменением партии:
   * каждый ход отменяет прошлый и заводит новый, а подряд идущие касания
   * по-прежнему не бьют по хранилищу каждым нажатием.
   */
  // Свежая запись достаётся через ref: сторож создаётся один раз, а писать
  // обязан текущим профилем и текущим уровнем.
  const persistPartyRef = React.useRef(persistParty);
  persistPartyRef.current = persistParty;

  if (!saverRef.current) {
    saverRef.current = createPartySaver({
      delayMs: RESUME_DEBOUNCE_MS,
      save: () => persistPartyRef.current(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
  }

  const onSessionChange = React.useCallback((s: MemoryPalaceSession) => {
    sessionRef.current = s;
    setArmed(hasSomethingToLose(s));
    saverRef.current?.changed();
  }, []);

  // Экран сносят — отложенная запись не должна выстрелить в пустоту. Саму партию
  // на этот случай дописывает GameShell через onSaveBeforeExit.
  React.useEffect(() => () => { saverRef.current?.cancel(); }, []);

  /**
   * Подъём партии при входе. Путь зарядки (autostart) не трогаем: там человек
   * явно запустил свежий раунд, и старую партию поднимать нельзя — она бы
   * подменила заданный шагом уровень.
   */
  useResumeBoot<MemoryPalaceResume>(MEMORY_PALACE_GAME_ID, MEMORY_PALACE_RESUME_V, (saved) => {
    const live = restoreFromResume(saved, gameNow());
    if (!live) return;
    sessionRef.current = live.session;
    setArmed(true);
    setParty({ seed: live.seed, level: live.level, restored: live.session });
    setPhase('playing');
  }, autostart);

  /**
   * Начать партию. Зерно СВЕЖЕЕ на каждый заход — почему именно так (и почему
   * это противоположно «Прикидке»), разобрано в комментарии к makeSeed.
   */
  const start = React.useCallback(() => {
    const nonce = makeNonce(gameNow(), Math.random());
    sessionRef.current = null;
    setArmed(false);
    setReview([]);
    setParty({ seed: makeSeed(level, nonce), level, restored: null });
    setPhase('playing');
  }, [level]);

  // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => start());   // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const leaveToConfig = React.useCallback(() => {
    sessionRef.current = null;
    setArmed(false);
    setParty(null);
    setPhase('config');
  }, []);

  const onComplete = React.useCallback(async (m: MemoryPalaceMetrics) => {
    const passed = memoryPalacePassed(m);
    const doneLevel = party?.level ?? level;
    setLast(m);
    setReview(memoryPalaceReview(sessionRef.current, locale));

    // Партия доиграна — незаконченной больше нет, иначе карточка «Продолжить»
    // на главной звала бы в уже закрытый маршрут.
    setArmed(false);
    saverRef.current?.cancel();
    if (profile?.id) clearResume(MEMORY_PALACE_GAME_ID, profile.id).catch(() => {});

    // Пресет и шаг зарядки уровень НЕ двигают — так во всех экранах.
    if (!isPreset && passed && shouldChainNextLevel(mode)) lvl.reach(doneLevel + 1);
    else if (!isPreset && !passed) lvl.fail();

    if (isPreset) setPhase('result');
    else { setClearedPassed(passed); setPhase('cleared'); }

    try {
      await saveSession({
        passed,
        game_type: MEMORY_PALACE_GAME_ID,
        score: m.score,
        time_seconds: Math.round(m.durationMs / 1000),
        difficulty: memoryPalaceDifficulty(doneLevel),
        mode: `${m.specific.lociCount}loci`,
        errors: m.errors,
        details: {
          // Резерв прогресса: getMaxLevelFromSessions восстановит уровень отсюда,
          // если локальный ключ потерян (переустановка, сброс профиля).
          level: doneLevel,
          accuracy: m.accuracy,
          normalized_difficulty: m.difficulty,
          seed: m.seed,
          generator_version: m.generatorVersion,
          loci_count: m.specific.lociCount,
          distractor_count: m.specific.distractorCount,
          placement_changes: m.specific.placementChanges,
          // Три числа врозь — самое ценное здесь: они показывают, ЧТО именно
          // подвело. Высокое «знание предметов» при низкой «точности мест» —
          // это узнавание вместо памяти на место, и по одной общей цифре такое
          // не видно.
          item_knowledge_accuracy: m.specific.itemKnowledgeAccuracy,
          location_accuracy: m.specific.locationAccuracy,
          order_accuracy: m.specific.orderAccuracy,
          forward_location_accuracy: m.specific.forwardLocationAccuracy,
          reverse_location_accuracy: m.specific.reverseLocationAccuracy,
        },
      });
    } catch (err) { console.error(err); }
  }, [isPreset, mode, level, lvl, party, profile?.id, locale]);

  const stars = last ? memoryPalaceStars(last) : 1;

  /** Разбор партии: узкий экран — в одну колонку, широкий — в две. */
  const reviewColumns = width >= 700 ? 2 : 1;

  if (phase === 'playing' || phase === 'cleared') {
    return (
      <GameShell
        /**
         * Название и описание берём из СВОЕГО словаря модуля, а не из общего.
         * Ключи memoryPalace/memoryPalaceDesc заводит заход-интегратор вместе с
         * карточкой каталога (см. INTEGRATION.md); до тех пор обращение к ним
         * было бы битым вызовом — гейт dictionary-duplicates ловит такие, и
         * правильно: на экране человек увидел бы имя ключа вместо названия.
         * Так же сделано у соседних принятых игр.
         */
        title={strings.title}
        onBack={() => goBackOrHome()}
        /**
         * Спрашиваем только когда терять действительно есть что: маршрут
         * постоянный, и на его изучении партия ещё ничего личного не накопила.
         * Первая положенная вещь — накопила.
         */
        confirmExit={phase === 'playing' && armed}
        resumable
        onSaveBeforeExit={persistParty}
        scrollableField={phase === 'cleared'}
        overlay={phase === 'cleared' ? (
          <LevelCleared
            gameId={MEMORY_PALACE_GAME_ID}
            level={party?.level ?? level}
            stars={stars}
            passed={clearedPassed}
            gradient={GRADIENT}
            language={language}
            colors={colors}
            variant="overlay"
            onContinue={start}
            onStop={leaveToConfig}
          />
        ) : null}
      >
        {phase === 'playing' && party ? (
          <MemoryPalaceGame
            key={`${party.seed}|${party.level}`}
            seed={party.seed}
            level={party.level}
            locale={locale}
            /**
             * Часы партии — игровые: пока человек пишет отзыв, они стоят.
             * Настенные `Date.now` в модуле больше не значатся по умолчанию,
             * чтобы этот проп нельзя было молча забыть.
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
              card: colors.card,
              text: colors.text,
              textSecondary: colors.textSecondary,
              border: colors.border,
              /**
               * 🔴 primary = ЦВЕТ ИГРЫ, а не акцент профиля. Модуль красит им
               * главную кнопку и подписи прогресса. Отдай сюда colors.primary —
               * и внутри игры всё станет акцентом профиля (оранжевым, синим —
               * каким угодно), а снаружи, на экране настроек, останется градиент
               * игры: один экран, две разные схемы.
               */
              primary: GRADIENT[0],
              success: colors.success,
              error: colors.error,
              warning: colors.warning,
            }}
            gameGradient={GRADIENT as [string, string]}
            gameGradientText={ON_GRAD.color}
            /** 🔴 Свой экран поздравления модуля выключен — см. шапку файла. */
            showOwnResults={false}
            initialSession={party.restored}
            onSessionChange={onSessionChange}
            onComplete={onComplete}
            onExit={leaveToConfig}
          />
        ) : (
          /**
           * РАЗБОР, А НЕ ПОЗДРАВЛЕНИЕ. Метод мест тренируется обратной связью:
           * проценты говорят «шесть из восьми», но не говорят ГДЕ. Человек
           * должен увидеть, что спотыкается именно на «Балконе», — иначе
           * следующая партия будет такой же. Звёзды, серия и разрядка при этом
           * остаются в LevelCleared, который лежит поверх.
           */
          <View style={styles.review}>
            <Text style={[styles.reviewTitle, { color: colors.text }]}>{strings.resultTitle}</Text>
            <View style={styles.reviewLegend}>
              <Text style={[styles.reviewLegendText, { color: colors.textSecondary }]}>→ {strings.forward}</Text>
              <Text style={[styles.reviewLegendText, { color: colors.textSecondary }]}>← {strings.reverse}</Text>
            </View>
            <View style={styles.reviewGrid}>
              {review.map((row) => (
                <View
                  key={row.order}
                  style={[
                    styles.reviewRow,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    reviewColumns === 2 ? styles.reviewRowHalf : styles.reviewRowFull,
                  ]}
                >
                  <Text style={[styles.reviewOrder, { color: GRADIENT[0] }]}>{row.order}</Text>
                  <View style={styles.reviewText}>
                    <Text style={[styles.reviewLocus, { color: colors.text }]} numberOfLines={1}>{row.locus}</Text>
                    <Text style={[styles.reviewItem, { color: colors.textSecondary }]} numberOfLines={1}>{row.item}</Text>
                  </View>
                  <Ionicons
                    name={row.forwardOk ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={row.forwardOk ? colors.success : colors.error}
                  />
                  <Ionicons
                    name={row.reverseOk ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={row.reverseOk ? colors.success : colors.error}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
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
        <LevelProgressMap bestLevel={lvl.best} gameId={MEMORY_PALACE_GAME_ID} currentLevel={lvl.level}
          onPickLevel={lvl.pick} colors={colors} language={language} />

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.level, { color: colors.text }]}>{t('level')} {level}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{strings.rulesBody}</Text>
          {/* Сколько мест на этом уровне — считает тот же генератор, что и партию:
              подпись со своей формулой разъехалась бы с игрой на первой правке лесенки. */}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {interpolateMemoryPalace(strings.routeCount, { count: memoryPalaceLociForLevel(level) })}
          </Text>
        </View>

        <TouchableOpacity onPress={start} accessibilityRole="button">
          <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtn}>
            <Text style={styles.startText}>{t('start')}</Text>
          </GradientSurface>
        </TouchableOpacity>
      </ScrollView>

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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  // 48×48 — минимальная зона попадания пальцем; иконка 24 внутри.
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: ON_GRAD.color, fontSize: 20, fontWeight: '800' },
  body: { padding: 16, gap: 16 },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  level: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  startBtn: { borderRadius: 999, minHeight: 48, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  startText: { color: ON_GRAD.color, fontSize: 17, fontWeight: '800' },
  review: { padding: 16, gap: 10 },
  reviewTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  reviewLegend: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  reviewLegendText: { fontSize: 13, fontWeight: '700' },
  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: '100%' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  reviewRowFull: { width: '100%' },
  reviewRowHalf: { flexGrow: 1, flexBasis: '46%' },
  reviewOrder: { fontSize: 16, fontWeight: '900', minWidth: 20 },
  reviewText: { flex: 1 },
  reviewLocus: { fontSize: 14, fontWeight: '700' },
  reviewItem: { fontSize: 12 },
});
