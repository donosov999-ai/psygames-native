/* psygames-game-dictation · VER 1 · 04.09.2026 */
/**
 * Диктант: набор под диктовку (Полиглот, game_id 'dictation').
 *
 * 🔴 ЗАЧЕМ ИМЕННО ЭТО УПРАЖНЕНИЕ. Из всей методики Шестова оно несёт не «принципы
 * вообще», а прямое ядро: «умение качественно диктовать самому себе текст» и
 * сведение скоростей чтения и набора — причём ТОРМОЖЕНИЕМ быстрого канала, а не
 * разгоном медленного (supremelearning.ru/typography). Здесь голос задаёт темп,
 * а рука обязана за ним успеть, ничего не пропустив.
 *
 * КАК УСТРОЕНО. Звучит фраза целиком; на экране она НЕ НАПИСАНА — ненабранные знаки
 * стоят точками. Человек печатает её по памяти на слух, опечатка держит курсор на
 * месте. Прослушать можно сколько угодно раз: это подача задания, а не подсказка.
 *
 * ⚠️ ТОЛЬКО ТАМ, ГДЕ ЕСТЬ НАСТОЯЩАЯ КЛАВИАТУРА. Проверяется указатель, а не
 * платформа: у Tauri-сборки под Android `Platform.OS === 'web'` ровно как на
 * макбуке. На экранной клавиатуре это было бы другое упражнение под тем же
 * названием — там нет ни слепого набора, ни темпа.
 *
 * ЧТО МЕРЯЕТСЯ. Знаков в минуту, точность и «слабые знаки» — буквы, на которых
 * человек чаще всего сбивается. Последнее и есть польза сверх скорости: слабую
 * клавишу видно поимённо.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { speak, ttsCancel } from '@/src/services/tts';
import { useTtsBlock } from '@/src/hooks/useTtsAvailable';
import { hasPhysicalKeyboard } from '@/src/services/typing';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar from '@/src/components/GameSetupBar';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import TypingAnswer from '@/src/games/vocab-srs/TypingAnswer';
import { gameNow } from '@/src/services/gamePause';
import { buildPhrases, dictationLangs, levelPhrases, levelCount, type DictationPhrase } from '@/src/games/dictation/core/phrases';

const GRADIENT = ['#0f766e', '#15803d'];  // белым 5,02 — гейт контраста требует AA 4,5
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const STORE_KEY = 'psygames_dictation_lang';

type GamePhase = 'config' | 'playing' | 'cleared' | 'result';

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', ru: 'Русский', zh: '中文', hi: 'हिन्दी',
};

export default function DictationGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel('dictation');
  const { isPreset, autostart, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);

  const клавиатура = useMemo(() => hasPhysicalKeyboard(), []);
  const языки = useMemo(() => dictationLangs().filter((l) => l !== language), [language]);
  const [targetLang, setTargetLang] = useState<string>(() => {
    const п = str('targetLang', '');
    if (п && dictationLangs().includes(п)) return п;
    return language === 'en' ? 'es' : 'en';
  });

  const [phase, setPhase] = useState<GamePhase>('config');
  const [idx, setIdx] = useState(0);
  const [фразы, setФразы] = useState<DictationPhrase[]>([]);
  const [level, setLevel] = useState(1);
  const [готово, setГотово] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clearedPassed, setClearedPassed] = useState(true);

  /**
   * ⚠️ Опечатки и знаки читаются ПРИ ОТРИСОВКЕ (звёзды уровня, экран итога), значит
   * им место в состоянии: чтение `ref.current` в теле рендера запрещено правилом
   * react-hooks и валит линт-гейт. В ref остаётся то, что живёт только внутри
   * обработчиков и не должно вызывать перерисовку.
   */
  const [опечаток, setОпечаток] = useState(0);
  const [знаков, setЗнаков] = useState(0);
  const опечаткиRef = useRef(0);
  const знаковRef = useRef(0);
  const слабыеRef = useRef<Record<string, number>>({});
  const повторыRef = useRef(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tgt = языки.includes(targetLang) ? targetLang : (языки[0] ?? 'en');
  const ttsBlock = useTtsBlock(tgt);
  const voiceOk = ttsBlock === null;

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    ttsCancel();
  }, []);

  useEffect(() => {
    if (isPreset) return;
    AsyncStorage.getItem(STORE_KEY).then((v) => { if (v && dictationLangs().includes(v)) setTargetLang(v); }).catch(() => {});
  }, [isPreset]);

  const startGame = () => {
    ttsCancel();
    if (timerRef.current) clearInterval(timerRef.current);
    const все = buildPhrases(tgt);
    const годные = levelPhrases(все, lvl.level);
    const сколько = levelCount(lvl.level);
    const перемешано = [...годные].sort(() => Math.random() - 0.5).slice(0, сколько);
    setФразы(перемешано);
    setLevel(lvl.level);
    setIdx(0);
    setГотово(0);
    опечаткиRef.current = 0;
    setОпечаток(0);
    setЗнаков(0);
    знаковRef.current = 0;
    слабыеRef.current = {};
    повторыRef.current = 0;
    setElapsedTime(0);
    const старт = gameNow();
    startTimeRef.current = старт;
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - старт) / 1000), 200);
    setPhase('playing');
  };

  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  // Диктовка: голос подаёт задание, как только фраза сменилась.
  useEffect(() => {
    if (phase !== 'playing') return;
    const ф = фразы[idx];
    if (!ф) return;
    const t0 = setTimeout(() => { speak(ф.text, tgt, 0.85); }, 450);
    return () => clearTimeout(t0);
  }, [phase, idx, фразы, tgt]);

  const повторить = () => {
    const ф = фразы[idx];
    if (!ф || phase !== 'playing') return;
    повторыRef.current += 1;   // повтор не штрафуется: это подача задания
    speak(ф.text, tgt, 0.85);
  };

  const завершить = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const время = (gameNow() - startTimeRef.current) / 1000;
    setElapsedTime(время);
    const знаки = знаковRef.current;
    const опечатки = опечаткиRef.current;
    const зн_в_мин = время > 0 ? Math.round((знаки / время) * 60) : 0;
    const точность = знаки + опечатки > 0 ? Math.round((знаки / (знаки + опечатки)) * 100) : 100;
    const слабые = Object.entries(слабыеRef.current).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const passed = точность >= 90;
    if (isPreset) setPhase(passed ? 'cleared' : 'result');
    else {
      if (passed) lvl.reach(level + 1); else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');
    }
    try {
      await saveSession({
        passed,
        game_type: 'dictation',
        score: зн_в_мин,
        time_seconds: время,
        difficulty: `L${level}`,
        mode: tgt,
        errors: опечатки,
        details: {
          level,
          chars: знаки,
          typos: опечатки,
          cpm: зн_в_мин,
          accuracy: точность,
          replays: повторыRef.current,
          target_lang: tgt,
          weak_keys: слабые.map(([к, n]) => `${к}:${n}`),
        },
      });
    } catch (e) { console.error('Error saving session:', e); }
  };

  const фразаНабрана = (опечатокФразы: number) => {
    const ф = фразы[idx];
    if (!ф) return;
    знаковRef.current += ф.length;
    опечаткиRef.current += опечатокФразы;
    setЗнаков(знаковRef.current);
    setОпечаток(опечаткиRef.current);
    setГотово((g) => g + 1);
    if (idx + 1 >= фразы.length) завершить();
    else setIdx(idx + 1);
  };

  const renderConfig = () => (
    <>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="headset" size={48} color={ON_GRAD.color} />
          <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{t('dictation')}</Text>
          <Text style={[styles.configDesc, { color: ON_GRAD.color }]}>{t('dictationConfigDesc')}</Text>
        </LinearGradient>
        <LevelProgressMap bestLevel={lvl.best} gameId="dictation" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('langToTrain')}</Text>
          <View style={styles.optionButtons}>
            {языки.map((c) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={c}
                style={[styles.langBtn, tgt === c ? { backgroundColor: GRADIENT[0] } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => { setTargetLang(c); AsyncStorage.setItem(STORE_KEY, c).catch(() => {}); }}
              >
                <Text style={[styles.langBtnText, { color: tgt === c ? textOn(GRADIENT[0]) : colors.text }]}>{LANG_NAMES[c] ?? c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {!клавиатура && (
          <View style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: '#f43f5e' }]}>
            <Ionicons name="desktop-outline" size={22} color="#f43f5e" />
            <Text style={[styles.warnText, { color: colors.text }]}>{t('dictationNeedsKeyboard')}</Text>
          </View>
        )}
        {!voiceOk && (
          <View style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: '#f43f5e' }]}>
            <Ionicons name="volume-mute" size={22} color="#f43f5e" />
            <Text style={[styles.warnText, { color: colors.text }]}>
              {ttsBlock === 'sound-off' ? t('voiceSoundOff') : t('voiceMissingLang').replace('{lang}', LANG_NAMES[tgt] ?? tgt)}
            </Text>
          </View>
        )}
      </ScrollView>
      <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  const текущая = phase === 'playing' ? фразы[idx] : undefined;
  if (phase === 'playing' && текущая) {
    return (
      <GameShell
        title={t('dictation')}
        onBack={() => goBackOrHome()}
        hud={[
          { key: 'round', icon: 'repeat', label: t('round'), value: `${idx + 1}/${фразы.length} · ${t('label_level_short')}${level}` },
          { key: 'hud_correct', icon: 'checkmark-circle', label: t('hud_correct'), value: готово, tone: 'good' as const },
        ]}
        headerActions={
          <GameAuxBar>
            <GameAuxAction icon="volume-high" label={t('replaySound')} onPress={повторить} />
          </GameAuxBar>
        }
        toolbar={
          <TypingAnswer
            key={`${idx}-${текущая.text}`}
            word={текущая.text}
            colors={colors}
            hint={t('dictationHint')}
            hideUntyped
            onDone={фразаНабрана}
          />
        }
      >
        <View style={styles.fieldCol}>
          <View style={[styles.earCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="volume-high" size={44} color={colors.textSecondary} />
          </View>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('dictationTask')}</Text>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('dictation')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="dictation"
          level={level}
          stars={опечаток === 0 ? 3 : опечаток <= 3 ? 2 : 1}
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
          score={знаков}
          time={elapsedTime}
          errors={опечаток}
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
  optionCard: { borderRadius: 14, padding: 14, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '800' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 48 — норма цели нажатия.
  langBtn: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  langBtnText: { fontSize: 14, fontWeight: '700' },
  warnCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  warnText: { flex: 1, fontSize: 14, fontWeight: '600' },
  fieldCol: { alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  earCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
