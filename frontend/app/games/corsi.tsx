/* psygames-game-corsi · VER 2 · 28.08.2026 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import BossRound from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LeaderboardModal from '@/src/components/LeaderboardModal';
import { countsForRecord } from '@/src/services/leaderboard';
import { recordLineFor, useRecordBenchmark } from '@/src/hooks/useRecordBenchmark';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { FlashCell, hapticSuccess, hapticError } from '@/src/components/juice';
import { type PetMood } from '@/src/components/pet/GamePet';
import { sndWrong as sndCorsiWrong, sndMatch as sndCorsiRight } from '@/src/services/feedback';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { getPersonalBest, bumpPersonalBest } from '@/src/services/streak';
import { capPresetByLevel } from '@/src/services/presetCap';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getAbilityCount, useAbility } from '@/src/services/abilities';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const CORSI_RULES: LevelRule[] = [
  { key: 'reverse', fromLevel: 10 },   // lr_corsi_reverse_*
];

const GRADIENT = ['#0083B0', '#00B4DB'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 2.46 (норма AA 4.5), стало 4.60.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const CORSI_BENEFITS = [
  { icon: 'grid-outline', textKey: 'benefitCorsi1' },
  { icon: 'eye-outline',  textKey: 'benefitCorsi2' },
  { icon: 'apps-outline', textKey: 'benefitCorsi3' },
];

// Classic Corsi: 9 blocks placed at fixed positions, sequence flashes one by one,
// subject reproduces in same (or reverse) order.
type GamePhase = 'intro' | 'config' | 'show' | 'recall' | 'boss' | 'cleared' | 'result';
const BOSS_EVERY = 3;   // веха-босс каждые 3 уровня (резкая смена: память позиций → счёт чисел)
type Mode = 'forward' | 'backward';

// Уровень (1..15+): L1-6 span 3→8 · L7-9 показ быстрее · L10+ обязательный обратный порядок.
function levelParams(level: number): { startSpan: number; tickMs: number; flashMs: number; reverse: boolean } {
  const startSpan = Math.min(8, 2 + level);             // L1=3 → L6=8
  const fast = Math.max(0, level - 6);
  const tickMs = Math.max(480, 800 - fast * 45);
  const flashMs = Math.max(280, 500 - fast * 30);
  const reverse = level >= 10;                            // L10+ — обратный порядок
  return { startSpan, tickMs, flashMs, reverse };
}

const POS = [
  { x: 70, y: 80 }, { x: 200, y: 50 }, { x: 320, y: 90 },
  { x: 50, y: 200 }, { x: 220, y: 180 }, { x: 340, y: 220 },
  { x: 80, y: 320 }, { x: 240, y: 320 }, { x: 320, y: 360 },
];
// scale to fit smaller widths
const BOARD_W = 400;
const BOARD_H = 420;

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

export default function CorsiGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  // v1.29.1 (мобайл): доска 400×420 фикс ВЫЛЕЗАЛА за экран 390px — теперь скейлится
  // под ширину (и растёт на больших экранах до ×1.5); позиции и блоки умножаются на scale
  const { width, height } = useWindowDimensions();
  const boardScale = Math.min((width - 24) / BOARD_W, (height - 300) / BOARD_H, 1.5);

  const gate = useLevelGate('corsi');
  const lvl = usePersistentLevel('corsi');
  /**
   * ── ПРОБНЫЙ ЗАХОД (расходуемая способность, `src/services/abilities.ts`) ────
   *
   * ПОЧЕМУ ИМЕННО В ЗАМЕРНЫХ ИГРАХ. Здесь лимит ошибок И ЕСТЬ измерение: спан — это
   * докуда человек дошёл до двух ошибок на одной длине. Лишняя попытка врала бы прямо
   * в биомаркер, поэтому «второй жизни» тут нет и не будет. Продаётся ОБРАТНОЕ:
   * право сыграть так, чтобы партия не записалась НИКУДА — ни очков, ни уровня, ни
   * статистики, ни лидерборда. Это не поблажка, а отказ от награды: заработать на
   * пробном заходе нельзя ни при каком результате.
   *
   * ⚠️ РЕШЕНИЕ ПРИНИМАЕТСЯ ДО ПЕРВОГО СТИМУЛА (`practiceRef` снимается в startGame).
   * Иначе можно было бы посмотреть на результат и задним числом решить, засчитывать
   * его или нет, — то есть выбирать себе статистику.
   *
   * ⚠️ ШТУКА СПИСЫВАЕТСЯ НА ФИНИШЕ, А НЕ НА СТАРТЕ. Партия, брошенная на середине,
   * платной быть не должна; выбрать удачный исход это всё равно не даёт — решение
   * уже принято, и списание идёт по флагу, снятому до начала.
   */
  const { profile } = useProfile();
  const [practiceLeft, setPracticeLeft] = useState(0);     // остаток в кошельке — виден ДО траты
  const [practiceArmed, setPracticeArmed] = useState(false); // переключатель на экране настроек
  const [practiceUsed, setPracticeUsed] = useState(false);   // партия прошла как пробная
  const practiceRef = useRef(false);                         // решение, снятое на старте партии
  const reloadPractice = useCallback(async () => {
    const pid = profile?.id;
    setPracticeLeft(pid ? await getAbilityCount(pid, 'practice_run') : 0);
  }, [profile?.id]);
  useEffect(() => { reloadPractice(); }, [reloadPractice]);

  /** Списать пробный заход, если он был заявлен до партии. true — партию НЕ записываем. */
  const settlePracticeRun = async (): Promise<boolean> => {
    if (!practiceRef.current) return false;
    practiceRef.current = false;
    const pid = profile?.id;
    const ok = !!pid && await useAbility(pid, 'practice_run');
    setPracticeArmed(false);
    setPracticeUsed(ok);
    await reloadPractice();
    return ok;
  };
   // персист-уровень (как у судоку)
  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const record = useRecordBenchmark('corsi');
  const [bossWon, setBossWon] = useState<boolean | null>(null);   // итог босса-вехи (null = босса не было)
  const [mode, setMode] = useState<Mode>(() => (str('mode', 'forward') as Mode));
  // Справка правил уровня (в зарядке-пресете не показываем — там свой поток).
  // enabled на recall: во время show модалка закрыла бы саму последовательность.
  const levelRules = useLevelRules('corsi', lvl.level, CORSI_RULES, phase === 'recall' && !isPreset);

  const [seq, setSeq] = useState<number[]>([]);
  const [showIdx, setShowIdx] = useState(-1);     // currently lit during show phase
  const [userSeq, setUserSeq] = useState<number[]>([]);
  const [span, setSpan] = useState(0);            // longest correct sequence
  /**
   * Личный рекорд размаха — самореферентная цель. При подстройке сложности
   * абсолютный счёт мало что значит (это про выданную ступень), а «дошёл дальше,
   * чем в прошлый раз» осмысленно на любой ступени (см. `services/streak`).
   */
  const [bestSpan, setBestSpan] = useState<number | null>(null);
  useEffect(() => { getPersonalBest('corsi', 'span').then(setBestSpan).catch(() => {}); }, []);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  /** Настроение питомца в шапке — реакция на ход (§30.6 карты геймификации). */
  const [petMood, setPetMood] = useState<PetMood>('idle');
  const petSay = (mo: PetMood) => { setPetMood(mo); setTimeout(() => setPetMood('idle'), 40); };
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);   // память итога для баннера LevelCleared (passed/«почти»)
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelRef = useRef(1);
  const tickMsRef = useRef(800);
  const flashMsRef = useRef(500);
  const modeRef = useRef<Mode>('forward');

  useEffect(() => () => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const startGame = () => {
    // Решение «этот заход не в зачёт» фиксируется ЗДЕСЬ, до первого стимула.
    // В шаге зарядки пробный заход бессмыслен: он и так не двигает уровень.
    practiceRef.current = !isPreset && practiceArmed && practiceLeft > 0;
    setPracticeUsed(false);
    const effLevel = lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    setBossWon(null);
    let startSpan: number;
    if (isPreset) {
      // ⚠️ Пресет — потолок желания (см. `presetCap`): программа просит ряд из
      // четырёх, а игрок освоил три. Верх лесенки — восемь.
      startSpan = capPresetByLevel({ want: num('startLen', 3), atLevel: p.startSpan, atTop: p.startSpan >= 8 });
      tickMsRef.current = 800; flashMsRef.current = 500;
      modeRef.current = mode;
    } else {
      // уровень рулит: span → скорость показа → обратный порядок
      startSpan = p.startSpan;
      tickMsRef.current = p.tickMs; flashMsRef.current = p.flashMs;
      modeRef.current = p.reverse ? 'backward' : 'forward';
      setMode(modeRef.current);
    }
    setSpan(0); setErrors(0);
    setUserSeq([]);
    setPhase('show');
    const start = gameNow();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    showSequence(startSpan);
  };

  const showSequence = (len: number) => {
    setUserSeq([]);
    setFeedback(null);
    // build random sequence of `len` distinct blocks
    const indices = shuffle(Array.from({ length: 9 }, (_, i) => i));
    const next = indices.slice(0, len);
    setSeq(next);
    setPhase('show');
    setShowIdx(-1);
    let i = 0;
    tickerRef.current = setInterval(() => {
      if (i < next.length) {
        setShowIdx(next[i]);
        setTimeout(() => setShowIdx(-1), flashMsRef.current);
        i++;
      } else {
        if (tickerRef.current) clearInterval(tickerRef.current);
        setPhase('recall');
      }
    }, tickMsRef.current);
  };

  const finish = async (finalSpan: number, finalErrors: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    // ⚠️ ПРОБНЫЙ ЗАХОД РАЗБИРАЕТСЯ ПЕРВЫМ: партия вне зачёта не двигает лестницу
    // ни вверх, ни вниз и не оставляет записи нигде (сессия, очки, лидерборд).
    const practice = await settlePracticeRun();
    const passed = !practice && !isPreset && finalSpan >= levelParams(levelRef.current).startSpan;
    if (practice) {
      setPhase('result');   // уровень не двигался — баннеру уровня сказать нечего
      return;
    }
    if (passed) lvl.reach(levelRef.current + 1);   // прошёл стартовый span уровня → +уровень
    else if (!isPreset) lvl.fail();   // не прошёл → гистерезис понижения (3 провала подряд → level-1)
    try {
      await saveSession({
        passed,
        game_type: 'corsi',
        score: Math.max(0, finalSpan * 200 - finalErrors * 50),
        time_seconds: finalTime,
        difficulty: modeRef.current,
        mode: `L${levelRef.current}`,
        errors: finalErrors,
        details: { level: levelRef.current, span: finalSpan },
      });
    } catch (e) { console.error(e); }
    // Рекорд — только партия первого уровня: стартовый спан и темп показа выводятся из
    // уровня, поэтому спан с разных ступеней несравним (см. LEADERBOARD_GAMES.corsi).
    if (countsForRecord('corsi', { isPreset, level: levelRef.current })) {
      // Рекорд-строка на итог + отправка — одним хуком (офлайн-фолбэк внутри).
      record.report(finalSpan);
    } else {
      record.reset();
    }
    // веха-босс: при чистом прохождении каждые BOSS_EVERY уровней → битва (память → счёт)
    if (passed && levelRef.current % BOSS_EVERY === 0) { setClearedPassed(true); setBossWon(null); setPhase('boss'); }
    else if (passed) { setClearedPassed(true); setPhase('cleared'); }   // авто-поток к следующему уровню
    else if (!isPreset) { setClearedPassed(false); setPhase('cleared'); }   // непрохождение уровня → баннер «почти», авто-рестарт того же уровня (без тупика)
    else setPhase('result');   // пресет/свободный режим — экран статистики
  };

  const handleTap = (i: number) => {
    if (phase !== 'recall' || feedback !== null) return;
    const expected = modeRef.current === 'forward' ? seq : [...seq].reverse();
    const next = [...userSeq, i];
    setUserSeq(next);
    if (next[next.length - 1] !== expected[next.length - 1]) {
      // wrong — fail
      setFeedback('wrong'); petSay('bad'); sndCorsiWrong();
      hapticError();
      const newErrors = errors + 1;
      setErrors(newErrors);
      fbTimerRef.current = setTimeout(() => {
        if (newErrors >= 2) finish(span, newErrors);  // 2 errors = stop, classic Corsi
        else { showSequence(seq.length); }            // retry same length once
      }, 700);
      return;
    }
    if (next.length === expected.length) {
      // success — increase span
      setFeedback('right'); petSay('win'); sndCorsiRight();
      hapticSuccess();
      const newSpan = Math.max(span, seq.length);
      setSpan(newSpan);
      // Рекорд обновляем по ходу: «дошёл дальше, чем когда-либо» должно быть
      // видно в тот момент, когда это случилось, а не на экране итога.
      bumpPersonalBest('corsi', 'span', newSpan).then((ok) => { if (ok) setBestSpan(newSpan); }).catch(() => {});
      fbTimerRef.current = setTimeout(() => {
        if (seq.length >= 9) finish(newSpan, errors);
        else showSequence(seq.length + 1);
      }, 600);
    }
  };

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="grid" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('corsi')}</Text>
        <Text style={styles.configDesc}>{t('corsiDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="corsiIntroDesc" benefits={CORSI_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="corsi" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      {/* ПРОБНЫЙ ЗАХОД — расходуемая способность (`src/services/abilities.ts`).
          ⚠️ Остаток показывается ВСЕГДА, включая ноль: до траты человек обязан видеть,
          что у него есть и что произойдёт. Переключатель гаснет на нулевом кошельке. */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('abName_practice_run')}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary, marginBottom: 8 }]}>
          {`${t('abilityPracticeNote')} · ${t('abilityInWallet').replace('{n}', String(practiceLeft))}`}
        </Text>
        <TouchableOpacity
          accessibilityRole="button" accessibilityState={{ selected: practiceArmed }}
          disabled={practiceLeft <= 0}
          onPress={() => setPracticeArmed((v) => !v)}
          style={[styles.modeButton, {
            backgroundColor: practiceArmed ? GRADIENT[0] : colors.background,
            borderColor: colors.border, borderWidth: 1, opacity: practiceLeft > 0 ? 1 : 0.5,
          }]}>
          <Text style={[styles.modeButtonText, { color: practiceArmed ? '#FFFFFF' : colors.text }]}>
            {practiceArmed ? t('abilityPracticeOn') : t('abName_practice_run')}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        accessibilityRole="button" style={[styles.optionCard, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} onPress={() => setShowLeaderboard(true)}>
        <Ionicons name="trophy-outline" size={18} color={colors.text} />
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('leaderboardLevel1')}</Text>
      </TouchableOpacity>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
        <View style={styles.optionButtons}>
          {(['forward','backward'] as Mode[]).map((m) => {
            const locked = gate.isLocked(m);
            return (
            <TouchableOpacity
              accessibilityRole="button" key={m} disabled={locked}
              style={[styles.modeButton, mode === m && !locked
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 }]}
              onPress={() => !locked && setMode(m)}>
              <Text style={[styles.modeButtonText, { color: mode === m && !locked ? textOn(GRADIENT[0]) : colors.text }]}>
                {m === 'forward' ? t('forward') : t('backward')}{locked ? ' 🔒' : ''}
              </Text>
            </TouchableOpacity>
            );
          })}
        </View>
        {gate.nextHint && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 8, fontStyle: 'italic' }}>
            {gate.nextHint}
          </Text>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary }]}>
          {t('corsiLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      </View>
    </View>
  );

  const renderBoard = () => {
    const block = 60 * boardScale;
    return (
      <View style={[styles.board, { width: BOARD_W * boardScale, height: BOARD_H * boardScale, backgroundColor: colors.surface, borderColor: colors.border }]}>
        {POS.map((p, i) => {
          const lit = phase === 'show' && showIdx === i;
          const tapped = userSeq.includes(i);
          const lastTapped = userSeq[userSeq.length - 1] === i;
          return (
            // Та же клетка, что в матрице, N-back и размахе — только посаженная
            // на свободные координаты доски Корси, а не в сетку.
            <FlashCell key={i}
              size={block}
              state={
                feedback === 'right' && lastTapped ? 'correct' :
                feedback === 'wrong' && lastTapped ? 'wrong' :
                lit ? 'lit' : tapped ? 'picked' : 'idle'
              }
              disabled={phase !== 'recall' || feedback !== null}
              onPress={() => handleTap(i)}
              litColor={GRADIENT[1]}
              idleColor="#444"
              borderColor="rgba(255,255,255,0.18)"
              a11yLabel={`${t('a11yCell')} ${i + 1}, ${lit ? t('a11yLit') : tapped ? t('a11ySelected') : t('a11yEmpty')}`}
              a11yState={{ selected: tapped, disabled: phase !== 'recall' || feedback !== null }}
              style={{
                position: 'absolute',
                left: p.x * boardScale - block / 2,
                top: p.y * boardScale - block / 2,
              }}
            />
          );
        })}
      </View>
    );
  };

  // игровые фазы (показ и воспроизведение) — на едином каркасе GameShell; модалка правил поверх
  if (phase === 'show' || phase === 'recall') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('corsi')}
          onBack={() => goBackOrHome()}
          pet={petMood}
          /**
           * Счётчики ДАННЫМИ (см. `HudItem`): каркас рисует их одинаково во всех
           * играх семейства «сетка со вспышкой», и правка вида приходит везде разом.
           *
           * ⚠️ Ошибок в шапке нет намеренно: при подстройке сложности ошибки —
           * норма по построению, и красный счётчик наказывает за то, чего требует
           * обучение (§12.4). Вместо них — рекорд размаха: цель сам-с-собой.
           */
          hud={[
            { key: 'span', icon: 'resize', label: t('hud_span'), value: span, tone: 'accent' as const },
            phase === 'show'
              ? { key: 'len', icon: 'eye' as const, label: t('lengthLabel'), value: seq.length }
              : { key: 'entered', icon: 'hand-left' as const, label: t('hud_entered'), value: `${userSeq.length}/${seq.length}`, pop: true },
            ...(bestSpan ? [{ key: 'best', icon: 'trophy' as const, label: t('hud_best'), value: bestSpan, tone: 'warn' as const }] : []),
            ...(!isPreset ? [{ key: 'lvl', icon: 'flag' as const, label: t('label_level_short'), value: lvl.level }] : []),
          ]}
          stats={!isPreset ? (
            <View style={styles.statsRow}>
              <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />
            </View>
          ) : undefined}
        >
          <View style={styles.fieldCol}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {phase === 'show'
                ? t('watchSequence')
                : (mode === 'forward' ? t('reproduceForward') : t('reproduceBackward'))}
            </Text>
            {renderBoard()}
          </View>
        </GameShell>
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('corsi')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LeaderboardModal
        visible={showLeaderboard} onClose={() => setShowLeaderboard(false)}
        gameId="corsi" language={language} colors={colors} gradient={GRADIENT}
        formatScore={(s) => String(Math.round(s))}
      />
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'boss' && (
        <BossRound config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language} colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('cleared'); }} />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="corsi" level={levelRef.current} passed={clearedPassed} recordLine={record.benchmark ? recordLineFor('corsi', record.benchmark, t) : undefined} stars={bossWon === true ? 3 : (errors === 0 ? 3 : errors <= 2 ? 2 : 1)}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {/* Итог пробного захода словами: очки списаны, партия никуда не записана —
          `comparisonLine` это готовый слот GameResult под одну строку под счётом. */}
      {phase === 'result' && (
        <GameResult
          recordLine={record.benchmark ? recordLineFor('corsi', record.benchmark, t) : undefined}
          score={Math.max(0, span * 200 - errors * 50) + (bossWon ? 100 : 0)}
          stars={bossWon === true ? 3 : undefined}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          comparisonLine={practiceUsed ? t('abilityPracticeSpent') : undefined}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  // крупный системный шрифт: заголовок распирал header и выдавливал спейсер за край → ужимается сам
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, textAlign: 'center' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
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
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 12 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  board: { borderRadius: 14, borderWidth: 1, position: 'relative' },
});
