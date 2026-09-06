/* psygames-game-flanker · VER 1 · 19.08.2026 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#16222a', '#3a6073'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 6.77 (норма AA 4.5), стало 5.30.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
// Синергия: каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;
const FL_BENEFITS = [
  { icon: 'eye-outline',          textKey: 'benefitFl1' },
  { icon: 'flash-outline',        textKey: 'benefitFl2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitFl3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type TrialKind = 'congruent' | 'incongruent' | 'neutral';
type Direction = 'left' | 'right';

interface Trial { center: Direction; kind: TrialKind; flankers: Direction[] | null; }

/**
 * ДОЛЯ КОНФЛИКТНЫХ — НЕ РУЧКА СЛОЖНОСТИ. СЛОЖНОСТЬ РАСТЁТ РАЗНОСОМ И ОКНОМ.
 *
 * 🔴 ЧТО БЫЛО И ПОЧЕМУ ЭТО ПОРТИЛО СОБСТВЕННЫЙ ПОКАЗАТЕЛЬ ИГРЫ. Уровень растил
 * долю конфликтных проб: pIncong 0,30 (L1-5) → 0,45 (L6-10) → 0,65 (L11-15), а
 * доля согласованных падала 0,50 → 0,40 → 0,30. Но `flanker_effect_ms` — это
 * РАЗНОСТЬ времён конфликтных и согласованных проб, и величина самого эффекта
 * зависит от их пропорции: чем больше конфликтных, тем МЕНЬШЕ измеряемый эффект
 * (proportion-congruent effect — Jost et al. 2022, Psychophysiology,
 * doi:10.1111/psyp.14092). То есть ручка, которой рос уровень, УМЕНЬШАЛА ровно
 * ту величину, ради которой проба существует: на L13 эффект систематически
 * меньше, чем на L3, и это не про игрока.
 * Вторым ударом падала точность оценки: при 20 пробах на L11-15 согласованных
 * оставалось 6, а нейтральных — ОДНА. Среднее по одному наблюдению не среднее.
 * Тот же довод дословно записан у Струпа (stroop.tsx:120-133), и там долю
 * заморозили каноном; здесь она делала прямо противоположное.
 *
 * ЧТО СТАЛО. Доли ЗАМОРОЖЕНЫ на 0,40 / 0,45 / 0,15 (соглас./конфл./нейтр.) —
 * это в точности условие, на котором игра уже сдаёт оценочный замер: батарея
 * всегда зовёт фланкер с difficulty 'medium' (assessment.ts:101), то есть
 * effLevel 8, а норма `flanker_effect_ms` 70±30 (assessment.ts:57) одна на всех.
 * Заморозка именно на этом условии оставляет норму верной и не трогает батарею.
 * При 20 пробах это 8 согласованных, 9 конфликтных, 3 нейтральные на КАЖДОМ
 * уровне — вместо 6/13/1 на верхнем.
 *
 * СЛОЖНОСТЬ ПЕРЕЕХАЛА НА КАНОННУЮ РУЧКУ ЭРИКСЕНА — РАЗНОС «ЦЕЛЬ ↔ ФЛАНГИ».
 * В оригинале (Eriksen & Eriksen, 1974) разнос и был манипуляцией: три условия
 * ~0,06° / ~0,5° / ~1,0° угла зрения, и интерференция ПАДАЕТ с ростом разноса.
 * Значит труднее = ближе, и ось растит трудность, не трогая пропорцию.
 *
 * ⚠️ ПЕРЕВОД ГРАДУСОВ В ПИКСЕЛИ — ДОПУЩЕНИЕ, И ВОТ ОНО ЧИСЛОМ. Телефон 360 CSS-px
 * шириной ≈ 64 мм → 1 px ≈ 0,178 мм; расстояние просмотра принято 35 см →
 * 1° ≈ 350·tan1° ≈ 6,1 мм ≈ 34 px, 0,5° ≈ 17 px. Отсюда лестница 34 px (1,0°) на
 * L1 → 4 px (≈0,12°) на L15. Нижний край НЕ доведён до канонных 0,06° (≈2 px):
 * при глифах 36 px стрелки сливались бы в сплошную полосу, и проба мерила бы
 * разборчивость, а не торможение. Отступление осознанное, величина названа.
 */
export const FLANKER_P_CONG = 0.40;
export const FLANKER_P_INCONG = 0.45;
/**
 * Разнос на L1 и L15 в CSS-px.
 *
 * ⚠️ ВЕРХ ОПУЩЕН С КАНОННОГО 1,0° (34 px) ДО 0,82° (28 px), И ВОТ ПОЧЕМУ — ЧИСЛОМ.
 * Ряд шириной = 4 фланга по 36 + центр 56 + 4 зазора. При 34 px это 336 px, а
 * `stimBox` не шире 360 и живёт внутри каркаса с отступами — на телефоне 360 px
 * ряд вылезал бы за экран. Это ровно тот класс, на который жаловался тестировщик
 * NZT-48 («экран разъезжается»), и вносить его обратно своей же правкой нельзя.
 * При 28 px ряд 312 px и помещается с запасом. 0,82° остаётся внутри канонного
 * коридора Эриксена (условия 0,06° / 0,5° / 1,0°), низ 4 px ≈ 0,12°.
 * Сторожит `attention-ladder-per-mode` пробой «ряд помещается в 360 px».
 */
export const FLANKER_GAP_MAX = 28;
export const FLANKER_GAP_MIN = 4;
/** Ширина ряда стимулов при заданном разносе — считается там же, где рисуется. */
export const flankerRowWidthPx = (gapPx: number) => 4 * 36 + 56 + 4 * gapPx;

export function levelParams(level: number): { trials: number; windowMs: number; pCong: number; pIncong: number; gapPx: number } {
  const trials = 20;
  const L = Math.max(1, Math.min(15, level));
  // Окно оставлено прежним: его монотонность сторожит attention-conflict-ladders.
  const windowMs =
    L <= 5 ? 3000 - (L - 1) * 200 :
    L <= 10 ? 2000 - (L - 6) * 100 :
    Math.max(1000, 1400 - (L - 11) * 100);
  const gapPx = Math.max(
    FLANKER_GAP_MIN,
    Math.round(FLANKER_GAP_MAX - (L - 1) * (FLANKER_GAP_MAX - FLANKER_GAP_MIN) / 14),
  );
  return { trials, windowMs, pCong: FLANKER_P_CONG, pIncong: FLANKER_P_INCONG, gapPx };
}

function makeTrial(pCong: number, pIncong: number): Trial {
  const center: Direction = Math.random() < 0.5 ? 'left' : 'right';
  // distribution of trial types comes from levelParams (ex-difficulty table)
  const r = Math.random();
  const kind: TrialKind = r < pCong ? 'congruent' : r < pCong + pIncong ? 'incongruent' : 'neutral';
  let flankers: Direction[] | null;
  if (kind === 'congruent') flankers = [center, center, center, center];
  else if (kind === 'incongruent') {
    const opp: Direction = center === 'left' ? 'right' : 'left';
    flankers = [opp, opp, opp, opp];
  } else flankers = null;
  return { center, kind, flankers };
}

export default function FlankerGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const lvl = usePersistentLevel('flanker');
  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  // пресет (зарядка) передаёт diff/trials; личная игра рулится уровнем
  const [difficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 20));
  /** Разнос «цель ↔ фланги» текущего уровня, px. Ось Эриксена — см. levelParams. */
  const [gapPx, setGapPx] = useState(FLANKER_GAP_MAX);

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ center: 'left', kind: 'congruent', flankers: ['left','left','left','left'] });
  const [showStim, setShowStim] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [clearedPassed, setClearedPassed] = useState(true);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByKind, setRtsByKind] = useState<Record<TrialKind, number[]>>({ congruent: [], incongruent: [], neutral: [] });

  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // рефы — таймеры (окно ответа) живут вне ре-рендера, без stale-closure на счётчиках
  const levelRef = useRef(1);
  const windowRef = useRef(3000);
  const pCongRef = useRef(0.4);
  const pIncongRef = useRef(0.45);
  const trialsTotalRef = useRef(20);
  const gapRef = useRef(FLANKER_GAP_MAX);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<Record<TrialKind, number[]>>({ congruent: [], incongruent: [], neutral: [] });
  const trialRef = useRef<Trial>({ center: 'left', kind: 'congruent', flankers: ['left','left','left','left'] });
  const answeredRef = useRef(true);
  const startTimeRef = useRef(0);
  const stimOnsetRef = useRef(0);

  useEffect(() => () => {
    if (stimTimerRef.current) clearTimeout(stimTimerRef.current);
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const newTrial = () => {
    setShowStim(false); setFeedback(null);
    const tr = makeTrial(pCongRef.current, pIncongRef.current);
    trialRef.current = tr;
    setTrial(tr);
    answeredRef.current = false;
    stimTimerRef.current = setTimeout(() => {
      stimOnsetRef.current = gameNow();
      setStimAt(gameNow());
      setShowStim(true);
      // окно ответа уровня: не успел — считается ошибкой (пропуск)
      deadlineTimerRef.current = setTimeout(() => handleMiss(), windowRef.current);
    }, 500 + Math.random() * 600);
  };

  const startGame = () => {
    // личная игра → уровень рулит; пресет (зарядка) → выбранный тир маппится в уровень
    const effLevel = isPreset ? ({ easy: 3, medium: 8, hard: 13 } as Record<Difficulty, number>)[difficulty] ?? 8 : lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    windowRef.current = p.windowMs;
    pCongRef.current = p.pCong;
    pIncongRef.current = p.pIncong;
    gapRef.current = p.gapPx;
    setGapPx(p.gapPx);
    const total = isPreset ? trials : p.trials;   // в пресете длину задаёт зарядка
    trialsTotalRef.current = total;
    setTrials(total);
    hitsRef.current = 0; errorsRef.current = 0;
    rtsRef.current = { congruent: [], incongruent: [], neutral: [] };
    roundRef.current = 1;
    setHits(0); setErrors(0); setRtsByKind({ congruent: [], incongruent: [], neutral: [] }); setRound(1);
    setPhase('playing');
    startTimeRef.current = gameNow();
    newTrial();
  };

  const finish = async () => {
    const totalTime = (gameNow() - startTimeRef.current) / 1000;
    const all = rtsRef.current;
    const flatten = [...all.congruent, ...all.incongruent, ...all.neutral];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    const congMean = all.congruent.length ? all.congruent.reduce((a, b) => a + b, 0) / all.congruent.length : 0;
    const incongMean = all.incongruent.length ? all.incongruent.reduce((a, b) => a + b, 0) / all.incongruent.length : 0;
    const h = hitsRef.current;
    const e = errorsRef.current;
    // прохождение уровня: точность ≥80% (ошибка выбора и пропуск окна считаются одинаково)
    const accuracy = trialsTotalRef.current ? h / trialsTotalRef.current : 0;
    const passed = !isPreset && accuracy >= 0.8;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();   // гистерезис понижения: -1 уровень после 3 провалов подряд
    // непрерывный поток: уровневый заход (не пресет) ВСЕГДА в баннер cleared —
    // прошёл → «уровень N», не прошёл → passed={false} «почти, ещё раз» + авто-рестарт того же уровня.
    // пресет/зарядка остаётся тупиком-статистикой (result).
    // каждые BOSS_EVERY уровней (при чистом проходе) — босс-веха; иначе непрерывный поток как было.
    if (isPreset) setPhase('result');
    else if (passed && levelRef.current % BOSS_EVERY === 0) { setClearedPassed(true); setPhase('boss'); }
    else { setClearedPassed(passed); setPhase('cleared'); }
    try {
      await saveSession({
        passed,
        game_type: 'flanker',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `${trialsTotalRef.current}t`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          flanker_effect_ms: Math.round(incongMean - congMean),
          /**
           * Условие, при котором показатель снят, — рядом с самим показателем.
           * Приём взят у Струпа (stroop.tsx пишет `incongruent_ratio`): без него
           * два `flanker_effect_ms` из разных партий сравнивать НЕЛЬЗЯ, а по виду
           * они одинаковые числа. Доли теперь постоянны, разнос — нет.
           */
          p_congruent: pCongRef.current,
          p_incongruent: pIncongRef.current,
          flanker_gap_px: gapRef.current,
        },
      });
    } catch (err) { console.error(err); }
  };

  // конец попытки (ответ или пропуск) → пауза на фидбек → следующая или финиш
  const advance = () => {
    fbTimerRef.current = setTimeout(() => {
      if (roundRef.current >= trialsTotalRef.current) finish();
      else { roundRef.current += 1; setRound(roundRef.current); newTrial(); }
    }, 350);
  };

  const handleMiss = () => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    errorsRef.current += 1;
    setErrors(errorsRef.current);
    setShowStim(false);
    setFeedback('wrong');
    advance();
  };

  const handleAnswer = (chosen: Direction) => {
    if (!showStim || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = gameNow() - stimAt;
    const tr = trialRef.current;
    const ok = chosen === tr.center;
    if (ok) {
      hitsRef.current += 1;
      rtsRef.current[tr.kind].push(rt);
      hapticSuccess();
    } else {
      errorsRef.current += 1;
      hapticError();
    }
    setHits(hitsRef.current); setErrors(errorsRef.current);
    setRtsByKind({ congruent: [...rtsRef.current.congruent], incongruent: [...rtsRef.current.incongruent], neutral: [...rtsRef.current.neutral] });
    setFeedback(ok ? 'right' : 'wrong');
    advance();
  };

  const meanRtAll = (() => {
    const all = [...rtsByKind.congruent, ...rtsByKind.incongruent, ...rtsByKind.neutral];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();

  const renderConfig = () => (
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="flash" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('flanker')}</Text>
        <Text style={styles.configDesc}>{t('flankerDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="flankerIntroDesc" benefits={FL_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="flanker" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
          {t('level')} {lvl.level}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {t('flankerLvlParams')
            .replace('{p}', lvl.level <= 5 ? '30' : lvl.level <= 10 ? '45' : '65')
            .replace('{w}', lvl.level <= 5 ? '3.0–2.2' : lvl.level <= 10 ? '2.0–1.6' : '1.4–1.0')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
          {t('flankerPass')}
        </Text>
        {lvl.level > 1 && (
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  const arrowFor = (d: Direction, size: number, color: string) => (
    <Ionicons name={d === 'left' ? 'arrow-back' : 'arrow-forward'} size={size} color={color} />
  );

  // playing-фаза — на едином каркасе GameShell (кнопки ответов прибиты к низу)
  if (phase === 'playing') {
    const fbColor =
      feedback === 'right' ? '#22c55e' :
      feedback === 'wrong' ? '#f43f5e' :
      colors.text;
    return (
      <GameShell
        title={t('flanker')}
        onBack={() => goBackOrHome()}
        /** Счётчики данными: одинаковый вид во всех играх (см. `HudItem`). */
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${round}/${trials}`, pop: true },
          { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
          { key: 'rt', icon: 'flash', label: t('reaction'), value: `${meanRtAll}${t('msShort')}`, tone: 'accent' as const },
          ...(!isPreset ? [{ key: 'lvl', icon: 'flag' as const, label: t('label_level_short'), value: lvl.level }] : []),
        ]}
        toolbar={
          /* RTL-пин: кнопка ← обязана быть физически СЛЕВА (S-R совместимость), иначе в ar психометрика рушится */
          <View style={styles.toolbarLtr}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yLeft')} style={[styles.choiceBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handleAnswer('left')}>
              <Ionicons name="arrow-back" size={32} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yRight')} style={[styles.choiceBtn, { backgroundColor: GRADIENT[1] }]} onPress={() => handleAnswer('right')}>
              <Ionicons name="arrow-forward" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>
        }
      >
        <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback ? fbColor : colors.border, borderWidth: feedback ? 3 : 1 }]}>
          {showStim ? (
            <View style={[styles.arrowRow, { gap: gapPx }]}>
              {trial.flankers
                ? trial.flankers.slice(0, 2).map((d, i) => <View key={`l${i}`}>{arrowFor(d, 36, '#888')}</View>)
                : ['—','—'].map((s, i) => <Text key={`l${i}`} style={{ fontSize: 36, color: '#888' }}>{s}</Text>)
              }
              {/* Своего поля у центральной нет: разнос задаёт РЯД (gap), одинаковый
                  между всеми стимулами — как в оригинале Эриксена, где буквы
                  расставлены ровно. Иначе центр стоял бы дальше флангов, чем фланги
                  друг от друга, и «разнос цель↔фланги» означал бы не то. */}
              <View>{arrowFor(trial.center, 56, fbColor)}</View>
              {trial.flankers
                ? trial.flankers.slice(2).map((d, i) => <View key={`r${i}`}>{arrowFor(d, 36, '#888')}</View>)
                : ['—','—'].map((s, i) => <Text key={`r${i}`} style={{ fontSize: 36, color: '#888' }}>{s}</Text>)
              }
            </View>
          ) : (
            <Text style={{ fontSize: 36, color: colors.textSecondary }}>•</Text>
          )}
        </View>
        {/* Строка «что делать»: без неё правило видно только в справке, а
            в справку во время партии не ходят. Ключ ОБЩИЙ с соседней игрой:
            правило про центральную стрелку у них дословно одно, и разводить
            его двумя ключами — это ровно те дубли, которые только что схлопывали. */}
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('hint_center_arrow')}</Text>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('flanker')}</Text>
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
        <LevelCleared gameId="flanker" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 80 - errors * 60 - meanRtAll * 0.05))}
          time={meanRtAll / 1000} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320, marginTop: 12 },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  stimBox: { width: 360, maxWidth: '100%', height: 120, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  // RTL-пин (writingDirection → CSS direction на web, на нативе no-op): направленный
  // стимул и раскладка кнопок лево/право не зеркалятся в ar
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, writingDirection: 'ltr' },
  toolbarLtr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', writingDirection: 'ltr', maxWidth: '100%' },
  choiceBtn: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
});
