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
import { КЛЮЧ_ИМЕНИ, КЛЮЧ_ОПИСАНИЯ, ПО_УМОЛЧАНИЮ, СТРЕЛОЧНЫЕ, СВОЯ_ЛЕСТНИЦА, ВТОРОЕ_ДЕЙСТВИЕ, ЦИФРОВЫЕ, клавишДоски } from '@/src/games/tatham-bridge/names';

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

  const подсказать = useCallback(() => {
    void решить().then((п) => {
      if (!п) return;                      // решатель отказал — ступень не жжём
      setСдался(true);                     // весь ответ показан — ступень не засчитана
      setПартия(п);
    });
  }, []);

  const победа = партия?.статус === 1;
  const прошёл = победа && !сдался;

  /*
   * 🔴 ПОТОЛОК ПОДНИМАЕТ `reach`, А НЕ ПРЯМАЯ ЗАПИСЬ. `setLevel` ставит ВЫБРАННЫЙ уровень
   * и, если человек переигрывал пройденный, срезал бы достигнутое до него — ровно это
   * ловит гейт `level-replay`. `reach` двигает только потолок вверх.
   */
  useEffect(() => {
    if (!победа) return;
    const секунд = (gameNow() - начатоВ.current) / 1000;
    if (!isPreset) {
      if (прошёл) lvl.reach(Math.min(lvl.level + 1, ступеней));
      else lvl.fail();                     // гистерезис понижения (3 подряд → −1)
    }
    setФаза('cleared');
    void saveSession({
      passed: прошёл,
      game_type: 'puzzles',
      score: прошёл ? Math.max(0, 1000 - ходов * 5) : 0,
      time_seconds: секунд,
      difficulty: `${имяРежима}-${lvl.level}`,
      mode: имяРежима,
      details: { level: lvl.level, mode: имяРежима, moves: ходов, solver_used: сдался },
    }).catch(() => { /* офлайн — партия всё равно доиграна */ });
  }, [победа]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameShell
      title={t(КЛЮЧ_ИМЕНИ[имяРежима] ?? КЛЮЧ_ИМЕНИ[ПО_УМОЛЧАНИЮ])}
      onBack={() => router.back()}
      confirmExit={ходов > 0 && !победа}
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
        { id: 'restart', label: t('restart'), icon: 'refresh', onPress: () => новая() },
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
        { key: 'level', icon: 'trending-up-outline', label: t('hud_step'), value: `${lvl.level}/${ступеней}` },
        { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: ходов, pop: true },
      ]}
    >
      {фаза === 'config' ? (
        <View style={styles.centre}>
          <Text style={[styles.rule, { color: colors.textSecondary }]}>
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
          <PuzzleCanvas
            партия={партия}
            ширина={Math.min(width - 32, 420)}
            фон={colors.background}
            onЖест={(x, y, ж, п) => { void жать(x, y, ж, п || второе); }}
          />
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
                  onPress={() => { void клавиша(48 + ц).then(setПартия); }}
                  style={[styles.цифра, { backgroundColor: GRADIENT[0] }]}
                >
                  <Text style={styles.цифраТекст}>{ц}</Text>
                </Pressable>
              ))}
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
  rule: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 320 },
  start: { minHeight: 52, paddingHorizontal: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  крестовина: { flexDirection: 'row', gap: 10 },
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
