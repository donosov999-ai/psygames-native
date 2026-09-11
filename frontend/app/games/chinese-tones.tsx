/* psygames-game-chinese-tones · VER 1 · 04.09.2026 */
/**
 * Тоны китайского (Полиглот, game_id 'chinese_tones').
 *
 * 🔴 ЗАЧЕМ. Замер 03.09.2026: китайский в приложении был только иероглифами, и
 * различать тоны человеку было НЕГДЕ — при том, что для китайского тон и есть
 * смысл слова (mā «мама» против mà «ругать»). Это первое упражнение, где zh
 * звучит и требует ответа.
 *
 * КАК УСТРОЕНО. Звучит односложное слово из списка HSK 1–3, человек отвечает:
 *   L1–5  — какой тон (1 ˉ, 2 ˊ, 3 ˇ, 4 ˋ), после ответа виден иероглиф и пиньинь;
 *   L6–10 — то же вслепую: ни иероглифа, ни пиньиня до ответа;
 *   L11+  — слог ЦЕЛИКОМ: четыре написания одного слога в четырёх тонах.
 *
 * ⚠️ Варианты старших уровней строятся ядром `core/pinyin`, а не пишутся в банк:
 * знак тона ставится по правилу с исключениями (liú, guī, dòu), и ошибка в нём
 * тихо научит человека неправильному написанию. Правило проверено круговым
 * прогоном по всем 429 слогам банка.
 *
 * ⚠️ Без китайского голоса упражнение невозможно по построению — тогда честно
 * говорим об этом на экране настройки, как в «Минимальных парах».
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { startNoise, stopNoise } from '@/src/services/noise';
import { speak, ttsCancel } from '@/src/services/tts';
import { useTtsBlock } from '@/src/hooks/useTtsAvailable';
import { sndCorrect, sndWrong } from '@/src/services/feedback';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar from '@/src/components/GameSetupBar';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { gameNow } from '@/src/services/gamePause';
import { ZH_TONE_BANK, type ZhSyllable } from '@/src/constants/zhToneBank.generated';
import { allTones } from '@/src/games/chinese-tones/core/pinyin';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#b91c1c', '#c2410c'];  // белым 5,18 — гейт контраста требует AA 4,5
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);

type GamePhase = 'config' | 'playing' | 'cleared' | 'result';

/** Знаки тонов на кнопках. Символ понятен без перевода — он и есть контур. */
const ЗНАКИ = ['ˉ', 'ˊ', 'ˇ', 'ˋ'];

interface Trial {
  syll: ZhSyllable;      // что прозвучит
  tone: 1 | 2 | 3 | 4;   // правильный тон
  options: string[];     // варианты на кнопках (для фазы пиньиня)
  correctIdx: number;    // индекс правильного варианта
}

/**
 * Лесенка. Слепой режим отделён от режима пиньиня нарочно: сперва ухо учится
 * различать контур, и только потом к нему добавляется написание.
 */
/** Экспортируется для замера лестницы: `memory-hearing-ladders-scan`. */
export function levelParams(level: number): {
  trials: number; showAfter: boolean; pinyinMode: boolean;
  /** Ось 2: множитель темпа речи. */
  rate: number;
  /** Ось 5: отношение сигнал/шум в дБ; null — тишина. */
  snrDb: number | null;
  /** Ось 10: сколько ошибок ещё считается прохождением. */
  maxErrors: number;
} {
  const l = Math.min(15, Math.max(1, Math.floor(level)));
  const ступень = l <= 5
    ? { trials: 8, showAfter: true, pinyinMode: false }
    : l <= 10
      ? { trials: 10, showAfter: false, pinyinMode: false }
      : { trials: 12, showAfter: false, pinyinMode: true };
  return {
    ...ступень,
    // Тоны различаются мелодией, поэтому темп трогаем осторожнее: 0,9 → 0,76.
    rate: Math.round((0.9 - (l - 1) * 0.01) * 1000) / 1000,
    snrDb: l < 6 ? null : Math.round(Math.max(0, 18 - (l - 6) * 2) * 10) / 10,
    maxErrors: l <= 5 ? 2 : l <= 10 ? 1 : 0,
  };
}

function перемешать<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildTrials(count: number, pinyinMode: boolean): Trial[] {
  const out: Trial[] = [];
  for (let i = 0; i < count; i++) {
    const tone = (1 + Math.floor(Math.random() * 4)) as 1 | 2 | 3 | 4;
    const банк = ZH_TONE_BANK[tone];
    const syll = банк[Math.floor(Math.random() * банк.length)]!;
    if (pinyinMode) {
      // Варианты — ТОТ ЖЕ слог в четырёх тонах: различать надо тон, а не слово.
      const все = перемешать(allTones(syll.pinyin));
      out.push({ syll, tone, options: все, correctIdx: все.indexOf(syll.pinyin) });
    } else {
      out.push({ syll, tone, options: ЗНАКИ, correctIdx: tone - 1 });
    }
  }
  return out;
}

export default function ChineseTonesGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel('chinese_tones');

  const { isPreset, autostart, isCalm } = useGamePreset();
  useCalmHush(isCalm);

  const [phase, setPhase] = useState<GamePhase>('config');
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  /**
   * ⚠️ Проба, уровень и параметры — В СОСТОЯНИИ, а не в ref. Они читаются во время
   * отрисовки (какие кнопки рисовать, что писать в шапке), а чтение `ref.current`
   * в теле рендера запрещено правилом react-hooks и валит линт-гейт. Меняются они
   * ровно раз за раунд, так что состояние здесь и по смыслу правильнее.
   * В ref остаётся только то, что живёт внутри обработчиков: счётчики и таймеры.
   */
  const [trials, setTrials] = useState<Trial[]>([]);
  const [level, setLevel] = useState(1);
  const [params, setParams] = useState(levelParams(1));
  const trialsRef = useRef<Trial[]>([]);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  /** Оси уровня: темп, помеха и допуск ошибок. */
  const парамRef = useRef(levelParams(1));
  const replaysRef = useRef(0);
  const levelRef = useRef(1);
  const paramsRef = useRef(levelParams(1));
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ttsBlock = useTtsBlock('zh');
  const voiceOk = ttsBlock === null;

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    ttsCancel();
    stopNoise();   // помеха не переживает выход с экрана
  }, []);


  const startGame = () => {
    ttsCancel();
    if (advanceRef.current) clearTimeout(advanceRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    paramsRef.current = p;
    const пробы = buildTrials(p.trials, p.pinyinMode);
    trialsRef.current = пробы;
    setTrials(пробы);
    setLevel(lvl.level);
    setParams(p);
    hitsRef.current = 0;
    errorsRef.current = 0;
    парамRef.current = levelParams(lvl.level);
    replaysRef.current = 0;
    setHits(0);
    setErrors(0);
    setAnswered(null);
    setIdx(0);
    setElapsedTime(0);
    const start = gameNow();
    startTimeRef.current = start;
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
    setPhase('playing');
  };

  /**
   * Автостарт из пресета «Зарядки» — ПОСЛЕ объявления `startGame`. Если позвать
   * выше, линт справедливо ругается «переменная используется до объявления»: у
   * `const`-функции нет подъёма. И пояснение стоит отдельной строкой, а не хвостом
   * `eslint-disable-line`: текст после имени правила ESLint читает КАК ИМЯ ПРАВИЛА
   * и падает «definition for rule not found». Глушилка правила здесь не нужна
   * вовсе — после переноса линт к этой строке претензий не имеет.
   */
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  // Озвучка — эффектом, а не внутри setState: иначе голос уедет на лишний рендер.
  useEffect(() => {
    if (phase !== 'playing') return;
    const tr = trialsRef.current[idx];
    if (!tr) return;
    const to = setTimeout(() => {
      startNoise(парамRef.current.snrDb);
      speak(tr.syll.zh, 'zh', парамRef.current.rate).then(() => stopNoise());
    }, 400);
    return () => clearTimeout(to);
  }, [phase, idx]);

  const replay = () => {
    const tr = trialsRef.current[idx];
    if (!tr || phase !== 'playing') return;
    replaysRef.current += 1;
    startNoise(парамRef.current.snrDb);
    speak(tr.syll.zh, 'zh', парамRef.current.rate).then(() => stopNoise());
  };

  const finishRound = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current;
    const e = errorsRef.current;
    // Ось 10, цена ошибки: две прощаются, потом одна, с одиннадцатого — ни одной.
    const passed = e <= парамRef.current.maxErrors;
    if (isPreset) {
      setPhase(passed ? 'cleared' : 'result');
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: 'chinese_tones',
        score: Math.max(0, h * 100 - e * 30),
        time_seconds: finalTime,
        difficulty: `L${levelRef.current}`,
        mode: paramsRef.current.pinyinMode ? 'pinyin' : 'tone',
        errors: e,
        details: {
          level: levelRef.current,
          hits: h,
          errors: e,
          trials: paramsRef.current.trials,
          replays: replaysRef.current,
        },
      });
    } catch (err) { console.error('Error saving session:', err); }
  };

  const handleAnswer = (choice: number) => {
    if (phase !== 'playing' || answered !== null) return;
    const tr = trialsRef.current[idx];
    if (!tr) return;
    if (choice === tr.correctIdx) {
      sndCorrect();
      hitsRef.current += 1;
      setHits((h) => h + 1);
    } else {
      sndWrong();
      errorsRef.current += 1;
      setErrors((e) => e + 1);
    }
    setAnswered(choice);
    advanceRef.current = setTimeout(() => {
      if (idx + 1 >= trialsRef.current.length) finishRound();
      else { setAnswered(null); setIdx(idx + 1); }
    }, paramsRef.current.showAfter ? 1100 : 700);
  };

  const renderConfig = () => (
    <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="musical-note" size={48} color={ON_GRAD.color} />
          <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{t('chineseTones')}</Text>
          <Text style={[styles.configDesc, { color: ON_GRAD.color }]}>{t('ctConfigDesc')}</Text>
        </LinearGradient>
        <LevelProgressMap bestLevel={lvl.best} gameId="chinese_tones" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        {!voiceOk && (
          <View style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: '#f43f5e' }]}>
            <Ionicons name="volume-mute" size={22} color="#f43f5e" />
            <Text style={[styles.warnText, { color: colors.text }]}>
              {ttsBlock === 'sound-off' ? t('voiceSoundOff') : t('voiceMissingLang').replace('{lang}', '中文')}
            </Text>
          </View>
        )}
      </ScrollView>
      <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  const playingTrial = phase === 'playing' ? trials[idx] : undefined;
  if (phase === 'playing' && playingTrial) {
    const tr = playingTrial;
    const p = params;
    const total = trials.length;
    const верно = answered !== null && answered === tr.correctIdx;
    return (
      <GameShell
        title={t('chineseTonesShort')}
        onBack={() => goBackOrHome()}
        /**
         * 🔴 МЕНЮ ПАУЗЫ — ОДНО НА ВСЕ ИГРЫ. Стрелка «назад» открывает список
         * Продолжить · Заново · На главную вместо немого выхода.
         * Механизм в каркасе с v2.52.2, но до игрока он доехал у ТРЁХ игр из 96
         * (замер `grep -l pauseActions app/games/*.tsx` на `main` 09.09.2026) —
         * остальные подключают сами. «Заново» и выход разные: выход через
         * `leave: true` идёт тем же путём, что стрелка, и сохраняет партию
         * в «продолжить»; своё `router.back()` сохранение бы потеряло.
         */
        pauseActions={[
          { id: 'resume', label: t('exitConfirmStay'), icon: 'play' as const, primary: true },
          { id: 'restart', label: t('restart'), icon: 'refresh' as const, onPress: () => startGame() },
          { id: 'home', label: t('goHome'), icon: 'home' as const, leave: true },
        ]}
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${idx + 1}/${total} · ${t('label_level_short')}${level}` },
          { key: 'hud_correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const },
        ]}
        headerActions={
          <GameAuxBar>
            <GameAuxAction icon="volume-high" label={t('replaySound')} disabled={answered !== null} onPress={replay} />
          </GameAuxBar>
        }
        auxInHud
        bottom="answer"
        toolbar={
          <View style={p.pinyinMode ? styles.answerCol : styles.answerRow}>
            {tr.options.map((вариант, i) => {
              let bg = colors.surface;
              let fg = colors.text;
              let border = colors.border;
              if (answered !== null) {
                if (i === tr.correctIdx) { bg = '#22c55e'; fg = '#FFF'; border = '#22c55e'; }
                else if (i === answered) { bg = '#f43f5e'; fg = '#FFF'; border = '#f43f5e'; }
              }
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={p.pinyinMode ? вариант : `${t('ctTone')} ${i + 1}`}
                  key={вариант + i}
                  style={[p.pinyinMode ? styles.pinyinBtn : styles.toneBtn, { backgroundColor: bg, borderColor: border }]}
                  onPress={() => handleAnswer(i)}
                  activeOpacity={0.8}
                  disabled={answered !== null}
                >
                  <Text style={[p.pinyinMode ? styles.pinyinText : styles.toneMark, { color: fg }]}>{вариант}</Text>
                  {!p.pinyinMode && <Text style={[styles.toneNum, { color: fg }]}>{i + 1}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        }
      >
        <View style={styles.fieldCol}>
          {/*
            🔴 КРУПНЫЙ ЗНАК — КНОПКА ПОВТОРА, А НЕ КАРТИНКА.
            Отчёт «Полиглота» 11.09.2026: «нажать озвучку должна по центру быть
            доступна… иконка нарисована, тапнуть по ней нельзя, чтобы
            произношение повторно прошло, если человек не расслышал с первого
            раза». Он прав: здесь стоял `View`, а повтор жил мелкой кнопкой в
            служебном ряду шапки. Крупный круг в центре поля выглядит главным
            органом управления — им и должен быть.
            Подпись под значком обязательна: без неё круг снова читается как
            украшение. Образец взят из «Эха псевдослов», где так с самого начала.
            После ответа кнопка гаснет вместе с мелкой (`disabled`) и меняет вид
            на галочку или крестик — проба уже засчитана, переслушивать нечего.
          */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('replaySound')}
            style={[styles.earCircle, { backgroundColor: colors.surface, borderColor: answered === null ? colors.border : (верно ? '#22c55e' : '#f43f5e') }]}
            onPress={replay}
            disabled={answered !== null}
            activeOpacity={0.8}
          >
            <Ionicons
              name={answered === null ? 'volume-high' : (верно ? 'checkmark' : 'close')}
              size={44}
              color={answered === null ? colors.textSecondary : (верно ? '#22c55e' : '#f43f5e')}
            />
            {answered === null && (
              <Text style={[styles.earLabel, { color: colors.textSecondary }]}>{t('replaySound')}</Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {p.pinyinMode ? t('ctPickPinyin') : t('ctPickTone')}
          </Text>
          {/* Иероглиф и пиньинь открываются ПОСЛЕ ответа и только на младших
              уровнях: раньше времени они превращают слух в чтение. */}
          {p.showAfter && answered !== null && (
            <Text style={[styles.revealText, { color: верно ? '#22c55e' : '#f43f5e' }]}>
              {tr.syll.zh} · {tr.syll.pinyin}
            </Text>
          )}
        </View>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('chineseTonesShort')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="chinese_tones"
          level={level}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          passed={clearedPassed}
          onContinue={() => startGame()}
          onStop={() => setPhase('config')}
        />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 30)}
          time={elapsedTime}
          errors={errors}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14, paddingBottom: 120 },
  configCard: { borderRadius: 18, padding: 20, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '800' },
  configDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, opacity: 0.92 },
  warnCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  warnText: { flex: 1, fontSize: 14, fontWeight: '600' },
  fieldCol: { alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  earCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 4 },
  earLabel: { fontSize: 12, fontWeight: '600' },
  hintText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  revealText: { fontSize: 26, fontWeight: '800' },
  /**
   * ⚠️ РЯД ОБЯЗАН БЫТЬ ШИРИНОЙ ВО ВЕСЬ СЛОТ. Без `width: '100%'` слот каркаса
   * сжимается по содержимому, и `flex: 1` кнопок делить нечего — на живом экране
   * четыре тона встали узкими полосками по 20 точек. Поймано снимком, а не
   * чтением: в разметке всё выглядело правильно.
   */
  answerRow: { flexDirection: 'row', width: '100%', maxWidth: 420, alignSelf: 'center', gap: 8 },
  answerCol: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 8 },
  toneBtn: { flex: 1, minHeight: 76, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  // Знак тона — крупно: он и есть ответ. lineHeight с запасом, иначе ˇ обрезается.
  toneMark: { fontSize: 34, fontWeight: '800', lineHeight: 42 },
  toneNum: { fontSize: 14, fontWeight: '700', opacity: 0.75 },
  // Пиньинь — колонкой: написания различаются одним знаком, в ряд их не прочесть.
  pinyinBtn: { minHeight: 56, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pinyinText: { fontSize: 26, fontWeight: '800' },
});
