/* psygames-game-stroop · VER 3 · 23.08.2026 */
/**
 * Stroop — классический тест интерференции (цвет чернил vs значение слова).
 *
 * VER 2: ответ — ЦВЕТНАЯ ПЛАШКА БЕЗ ПОДПИСИ. Подписанные варианты возвращали в
 * ответ то самое чтение, которое проба гасит; разбор — у самой полосы ответов.
 *
 * VER 3: доля конфликтных проб перестала быть ручкой сложности — см. блок над
 * INCONGRUENT_RATIO. Сложность растёт ТЕМПОМ и ОБЪЁМОМ:
 *   - окно ответа на пробу сокращается с уровнем (3.5с → 1.2с);
 *   - число проб растёт (20 → 24 → 34);
 *   - доля конфликтных проб ФИКСИРОВАНА на 50%.
 * Просрочка окна ответа = ошибка (miss). Проход уровня: точность ≥85% за раунд.
 *
 * Биомаркеры: mean RT congruent/incongruent, interference_ms (Stroop effect).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#fc466b', '#3f5efb'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 3.37 (норма AA 4.5), стало 4.53.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #feb5c4 @0.08 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const STROOP_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitStroop1' },
  { icon: 'shuffle-outline', textKey: 'benefitStroop2' },
  { icon: 'bulb-outline', textKey: 'benefitStroop3' },
];

const COLORS_DEF = [
  { name: 'red', ru: 'КРАСНЫЙ', en: 'RED', hex: '#ef4444' },
  { name: 'blue', ru: 'СИНИЙ', en: 'BLUE', hex: '#3b82f6' },
  { name: 'green', ru: 'ЗЕЛЁНЫЙ', en: 'GREEN', hex: '#22c55e' },
  { name: 'yellow', ru: 'ЖЁЛТЫЙ', en: 'YELLOW', hex: '#eab308' },
];

/**
 * ЧЕРНИЛА ДЛЯ ДАЛЬТОНИЗМА — ИНАЧЕ ЗАДАЧА НЕРЕШАЕМА В ПРИНЦИПЕ.
 *
 * 🔴 ЧТО БЫЛО. В настройках написано дословно: «Действует там, где цвет несёт
 * смысл: судоку, SET, Струп, Висконсинский тест, Башня Лондона». Из пяти
 * названных четыре флаг читают, а Струп — НЕ ЧИТАЛ ВОВСЕ. Обещание было, кода
 * не было.
 *
 * И это не мелочь: в Струпе надо назвать ЦВЕТ ЧЕРНИЛ. Замер обычной палитры с
 * имитацией дальтонизма: при дейтеранопии минимальная разница между четырьмя
 * цветами ΔE 11.0, при протанопии 8.4 — два цвета из четырёх сливаются, и
 * человек не может ответить правильно даже теоретически.
 *
 * ⚠️ ЦВЕТА НЕЛЬЗЯ БРАТЬ ЛЮБЫЕ. Кнопки называются «красный, синий, зелёный,
 * жёлтый», и чернила обязаны читаться ЭТИМИ ЖЕ словами: чёрный или розовый
 * развели бы цвета лучше всего и сделали бы игру бессмысленной. Поэтому подбор
 * шёл внутри имени: перебор оттенков, у каждого имени свои, с максимумом
 * минимальной разницы по трём видам дальтонизма сразу.
 *
 * Итог: минимум ΔE вырос с 8.4 до 28.8 (дейтеранопия 29.5, протанопия 30.7,
 * тританопия 28.8). Сторожит `stroop-colorblind.test.ts`.
 */
const COLORS_CB = [
  { name: 'red', ru: 'КРАСНЫЙ', en: 'RED', hex: '#c1272d' },
  { name: 'blue', ru: 'СИНИЙ', en: 'BLUE', hex: '#0072b2' },
  { name: 'green', ru: 'ЗЕЛЁНЫЙ', en: 'GREEN', hex: '#006644' },
  { name: 'yellow', ru: 'ЖЁЛТЫЙ', en: 'YELLOW', hex: '#f0e442' },
];

/**
 * ПОДПИСЬ НА КНОПКЕ — ПО КОНТРАСТУ, А НЕ ВСЕГДА БЕЛАЯ.
 *
 * 🔴 Замер 22.08.2026: белым по кнопкам выходило 3.8 / 3.7 / 2.3 / 1.9 — НИ ОДНА
 * из четырёх не брала норму 4.5. На жёлтой подпись почти не читалась у всех, а
 * не только у дальтоников. Цвет текста выбирается по светлоте фона.
 */
export function stroopLabelColor(hex: string): string {
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? '#FFFFFF' : '#111111';
}

export const STROOP_PALETTES = { normal: COLORS_DEF, colorblind: COLORS_CB };

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Mode = 'word' | 'ink';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

export type StroopColor = typeof COLORS_DEF[0];

/**
 * ДОЛЯ КОНФЛИКТНЫХ ПРОБ — КОНСТАНТА ПАРАДИГМЫ, А НЕ РУЧКА СЛОЖНОСТИ.
 *
 * 🔴 БЫЛО: `incongruentRatio = min(0.9, 0.5 + (level-1)*0.03)` — к пятнадцатому
 * уровню девять проб из десяти конфликтные. Струп меряет РАЗНИЦУ времён между
 * конгруэнтными и конфликтными пробами (`interference_ms`), то есть величину
 * измеряемого эффекта задаёт сама доля: при 90 % конфликтных на конгруэнтные
 * остаётся 10 % — из тридцати проб это три штуки, и среднее по трём наблюдениям
 * превращается в шум. Ручка «сложнее» уменьшала ровно то, ради чего игра есть.
 *
 * То же правило записано в `iowa.tsx`: методика с популяционными нормами
 * осмысленна только потому, что условие у всех одинаковое. Крутить его значило бы
 * сломать сравнимость и превратить проверенную методику в придуманную механику.
 *
 * Канон Струпа — равные доли, 50/50. Вес сложности перенесён на окно ответа и
 * число проб (`levelParams` ниже). Сторожит `conflict-ratio-is-not-difficulty.test.ts`.
 */
export const INCONGRUENT_RATIO = 0.5;

export interface StroopTrial { word: StroopColor; ink: StroopColor; congruent: boolean }

/**
 * Проба уровня. Уровень стоит в подписи НАМЕРЕННО, хотя доля конфликтных от него
 * не зависит: гейт спрашивает игру «что ты даёшь на первом и на пятнадцатом» и
 * считает долю конгруэнтных по реально сгенерированным пробам, а не по строчке в
 * исходнике. Вернётся зависимость от уровня — гейт покраснеет.
 */
export function makeTrial(level: number, palette: StroopColor[] = COLORS_DEF): StroopTrial {
  const word = palette[Math.floor(Math.random() * palette.length)];
  if (Math.random() >= INCONGRUENT_RATIO) return { word, ink: word, congruent: true };
  let ink = word;
  while (ink.name === word.name) ink = palette[Math.floor(Math.random() * palette.length)];
  return { word, ink, congruent: false };
}

// Маппинг уровня (1..15) в параметры сложности — темп и объём:
//   L1-5  — окно 3500→2840мс, 20 проб
//   L6-10 — окно 2675→2015мс, 24 пробы
//   L11-15— окно 1850→1200мс, проб 26→34
export function levelParams(level: number): { trials: number; windowMs: number } {
  const trials = level <= 5 ? 20 : level <= 10 ? 24 : Math.min(34, 24 + (level - 10) * 2);
  const windowMs = Math.max(1200, 3500 - (level - 1) * 165);
  return { trials, windowMs };
}

export default function StroopGame() {
  const { colors, colorblind } = useTheme();
  const PALETTE = colorblind ? COLORS_CB : COLORS_DEF;
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const lvl = usePersistentLevel('stroop');
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [mode, setMode] = useState<Mode>(() => (str('mode', 'ink') === 'word' ? 'word' : 'ink'));
  const [word, setWord] = useState(PALETTE[0]);
  const [inkColor, setInkColor] = useState(PALETTE[1]);
  const [round, setRound] = useState(0);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  // refs — таймер окна ответа живёт вне ре-рендера (без stale closures)
  const levelRef = useRef(1);
  const trialsRef = useRef(20);
  const windowMsRef = useRef(3500);
  const modeRef = useRef<Mode>('ink');
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const missesRef = useRef(0);
  const rtsCongruentRef = useRef<number[]>([]);
  const rtsIncongruentRef = useRef<number[]>([]);
  const wordRef = useRef(PALETTE[0]);
  const inkRef = useRef(PALETTE[1]);
  const trialStartRef = useRef(0);
  const startTimeRef = useRef(0);
  const answeredRef = useRef(false);
  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => () => {
    stoppedRef.current = true;
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
  }, []);

  const nextRound = () => {
    if (stoppedRef.current) return;
    const { word: w, ink: c } = makeTrial(levelRef.current, PALETTE);
    wordRef.current = w; inkRef.current = c;
    setWord(w); setInkColor(c);
    answeredRef.current = false;
    trialStartRef.current = gameNow();
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
    windowTimerRef.current = setTimeout(handleTimeout, windowMsRef.current);
  };

  const advanceOrFinish = () => {
    if (roundRef.current >= trialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    nextRound();
  };

  // просрочка окна ответа = ошибка (miss)
  const handleTimeout = () => {
    if (stoppedRef.current || answeredRef.current) return;
    answeredRef.current = true;
    missesRef.current += 1;
    errorsRef.current += 1;
    setErrors(errorsRef.current);
    advanceOrFinish();
  };

  const handleAnswer = (chosen: typeof COLORS_DEF[0]) => {
    if (stoppedRef.current || answeredRef.current) return;
    answeredRef.current = true;
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
    const correctName = modeRef.current === 'ink' ? inkRef.current.name : wordRef.current.name;
    const isCongruent = inkRef.current.name === wordRef.current.name;
    const rt = gameNow() - trialStartRef.current;
    if (chosen.name === correctName) {
      hapticSuccess();
      hitsRef.current += 1;
      setHits(hitsRef.current);
      // record RT only on correct trials (standard psychometric convention)
      if (isCongruent) rtsCongruentRef.current.push(rt);
      else rtsIncongruentRef.current.push(rt);
    } else {
      hapticError();
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    advanceOrFinish();
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    trialsRef.current = isPreset ? num('trials', p.trials) : p.trials;
    windowMsRef.current = p.windowMs;
    modeRef.current = mode;
    stoppedRef.current = false;
    hitsRef.current = 0; errorsRef.current = 0; missesRef.current = 0;
    rtsCongruentRef.current = []; rtsIncongruentRef.current = [];
    roundRef.current = 1;
    setHits(0); setErrors(0); setRound(1);
    setPhase('playing');
    startTimeRef.current = gameNow();
    nextRound();
  };

  const finish = async () => {
    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const totalHits = hitsRef.current;
    const totalErrors = errorsRef.current;
    const accuracy = trialsRef.current > 0 ? totalHits / trialsRef.current : 0;
    const rc = rtsCongruentRef.current;
    const ri = rtsIncongruentRef.current;
    const meanCongr = rc.length ? Math.round(rc.reduce((a, b) => a + b, 0) / rc.length) : 0;
    const meanIncongr = ri.length ? Math.round(ri.reduce((a, b) => a + b, 0) / ri.length) : 0;
    const interferenceMs = meanCongr && meanIncongr ? meanIncongr - meanCongr : 0;
    // проход уровня: точность ≥85% за раунд (просрочки окна считаются ошибками);
    // на пресет-запусках (зарядка) уровень не трогаем — ни reach, ни fail
    const passed = !isPreset && accuracy >= 0.85;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    // непрерывный поток: уровневый провал больше не тупик — общий баннер с passed={false}
    // и авто-рестартом того же (или пониженного) уровня; пресет/зарядка → статистика (result)
    if (isPreset) {
      setPhase('result');
    } else if (passed && levelRef.current % BOSS_EVERY === 0) {
      // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
      setClearedPassed(true);
      setPhase('boss');
    } else {
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: 'stroop',
        score: totalHits,
        time_seconds: finalTime,
        difficulty: modeRef.current,
        mode: `lvl${levelRef.current}`,
        errors: totalErrors,
        details: {
          level: levelRef.current,
          hits: totalHits,
          errors: totalErrors,
          misses: missesRef.current,
          accuracy: Math.round(accuracy * 100),
          window_ms: windowMsRef.current,
          incongruent_ratio: INCONGRUENT_RATIO,
          mean_rt_congruent: meanCongr,
          mean_rt_incongruent: meanIncongr,
          interference_ms: interferenceMs,
        },
      });
    } catch (e) { console.error(e); }
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <View style={{ flex: 1 }}>
      <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="eye" size={48} color={ON_GRAD.color} />
          <Text style={styles.configTitle}>{t('stroop')}</Text>
          <Text style={styles.configDesc}>{t('stroopDesc')}</Text>
        </GradientSurface>
        <GameAbout descriptionKey="stroopIntroDesc" benefits={STROOP_BENEFITS} accent={GRADIENT[0]} />
        <LevelProgressMap bestLevel={lvl.best} gameId="stroop" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('stroopLvlParams').replace('{n}', String(p.trials)).replace('{w}', (p.windowMs / 1000).toFixed(1)).replace('{p}', String(Math.round(INCONGRUENT_RATIO * 100)))}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {t('stroopPass')}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('stroopModeLabel')}</Text>
          <View style={styles.optionButtons}>
            {(['ink', 'word'] as Mode[]).map((m) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={m}
                style={[
                  styles.modeButton,
                  mode === m
                    ? { backgroundColor: GRADIENT[0] }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.modeButtonText, { color: mode === m ? textOn(GRADIENT[0]) : colors.text }]}>
                  {m === 'ink' ? t('stroopByInk') : t('stroopByWord')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
      {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
      <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
      </>
    </View>
    );
  };

  /**
   * playing-фаза — на едином каркасе GameShell (цветные плашки прибиты к низу).
   *
   * 🔴 НА КНОПКЕ ОТВЕТА НЕТ НАЗВАНИЯ ЦВЕТА — И ЭТО ПРО ЗАМЕР, А НЕ ПРО ОФОРМЛЕНИЕ.
   *
   * ЧТО БЫЛО. Плашка была залита своим цветом И ПОДПИСАНА названием этого цвета.
   * Смысл пробы Струпа — подавить чтение слова и ответить по ЦВЕТУ КРАСКИ.
   * Подписанные варианты возвращают в ответ ровно то чтение, которое проба гасит:
   * «увидел цвет → назвал его про себя → нашёл ЭТО СЛОВО среди четырёх». Лишний
   * шаг ложится во ВРЕМЯ РЕАКЦИИ обеих половин пробы, а `interference_ms` считается
   * как их разность — то есть портился сам биомаркер, ради которого игра и есть.
   * В нормативных компьютерных вариантах ответ — либо клавиша, либо цветная
   * плашка без подписи; клавиатуры на телефоне нет, остаётся плашка.
   *
   * ⚠️ НЕЗРЯЧЕМУ НАЗВАНИЕ НУЖНО. У каждой плашки `accessibilityLabel` с именем
   * цвета — скринридер называет кнопку ровно так же, как её называл текст на ней,
   * то есть для него ничего не пропало. Взято оно из САМОЙ ПАЛИТРЫ (`c.ru`/`c.en`),
   * тем же выбором языка, что и слово-стимул: свой словарь на двенадцать языков
   * тут был бы не помощью, а вредом — стимул рисуется на `ru`/`en` по устройству
   * `COLORS_DEF`, и подписи кнопок на третьем языке заставили бы в режиме «по
   * слову» переводить стимул в язык кнопок, то есть добавили бы ещё один шаг
   * вместо убранного. Двуязычие самого Струпа — отдельный долг, не этой правки.
   *
   * ⚠️ ПРИ ДАЛЬТОНИЗМЕ ПОДПИСЬ ОСТАЁТСЯ — РЕШЕНО НАРОЧНО. Там ответ различают по
   * одному тону, и надёжности этого различения ровно столько, сколько дала подгонка
   * палитры (ΔE 28.8 при имитации; см. COLORS_CB выше). Замер в этом режиме и так
   * идёт с оговоркой, а плашка без подписи сделала бы игру НЕИГРАБЕЛЬНОЙ — это уже
   * не оговорка, а стена. Оговорка дешевле стены, поэтому подпись здесь живёт.
   * Держится это не обещанием в комментарии, а пробой: `stroop-answer-is-color`.
   */
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('stroop')}
        onBack={() => { stoppedRef.current = true; if (windowTimerRef.current) clearTimeout(windowTimerRef.current); goBackOrHome(); }}
        /**
         * Счётчики ДАННЫМИ (см. `HudItem`): каркас рисует их одинаково во всех
         * играх, и правка вида приходит сразу везде.
         *
         * ⚠️ Счётчика ошибок здесь нет намеренно: при подстройке сложности ошибки —
         * норма по построению, и красный счётчик наказывает ровно за то, чего
         * требует обучение (§12.4 карты геймификации).
         */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${trialsRef.current}` },
          { key: 'hud_correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
        ]}
        toolbar={
          <View style={styles.answersGrid}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={language === 'ru' ? c.ru : c.en}
                key={c.name}
                style={[styles.answerBtn, { backgroundColor: c.hex }]}
                onPress={() => handleAnswer(c)}
              >
                {colorblind && (
                  <Text style={[styles.answerText, { color: stroopLabelColor(c.hex) }]}>{language === 'ru' ? c.ru : c.en}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.bigWord, { color: inkColor.hex }]}>
            {language === 'ru' ? word.ru : word.en}
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {mode === 'ink' ? t('stroopHintInk') : t('stroopHintWord')}
          </Text>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { stoppedRef.current = true; if (windowTimerRef.current) clearTimeout(windowTimerRef.current); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('stroop')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <GameSuiteSwitch />
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="stroop" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult score={hits} time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  // Прибитый низ настроек: кнопка «начать» всегда на экране, над системной навигацией.
  // Раньше она была последней в прокрутке — на невысоком экране до неё приходилось
  // доскроллить, а решение «во что играю» оказывалось в двух разных местах.
  // Отступ слева — под плавающую кнопку отзыва, она висит поверх и накрывала бы её.
  configSticky: { paddingTop: 10, paddingHorizontal: 16, paddingLeft: 68, borderTopWidth: StyleSheet.hairlineWidth },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 20 },
  bigWord: { fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  answersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 360, width: '100%' },
  /**
   * ⚠️ РАЗМЕР ДЕРЖИТСЯ САМ, А НЕ ТЕКСТОМ. Высоту плашке давала подпись (16 + два
   * отступа по 16 ≈ 51pt); без неё осталось бы 32pt — меньше нормы попадания
   * пальцем, и живой аудит `scripts/tap-target-audit.mjs --mode=field` (порог 48)
   * покраснел бы на игровом поле. Отсюда явный `minHeight`: он же держит плашку
   * одинаковой в обоих режимах, с подписью и без.
   */
  answerBtn: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16, minWidth: 140, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  answerText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
