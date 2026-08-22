/* psygames-game-semantic-sort · VER 1 · 19.08.2026 */
/**
 * Сортировка слов (Полиглот TIER 1 п.5, v1.29.0).
 * Слово на целевом языке → к какой категории относится? Категоризация БЕЗ перевода =
 * прямой семантический доступ к L2 (закрепление значений). Категории — поле `cat`
 * в TRANSLATION_VOCAB (14 шт.), имена категорий локализованы (catVocab_*).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { TRANSLATION_VOCAB , hasVocab } from '@/src/constants/translationVocab';
import { SEMANTIC_DISTRACTORS } from '@/src/data/semantic-distractors';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';

const GRADIENT = ['#10b981', '#6366f1'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 2.54 (норма AA 4.5), стало 4.56.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

// Уровень 1..15 (persist): больше категорий-дистракторов в раунде (2 → 4) и больше
// раундов. Близость дистракторов по эмбеддингам (V3) реализована: предрасчитанная
// таблица SEMANTIC_DISTRACTORS (bge-m3, scripts/gen-semantic-distractors.mjs) даёт
// «коварные» категории; каркас уровней от неё не зависит.
function levelParams(level: number): { catsPerRound: number; roundsCount: number } {
  const catsPerRound = level <= 3 ? 2 : level <= 8 ? 3 : 4;
  const roundsCount = level <= 5 ? 10 : level <= 10 ? 12 : 15;
  return { catsPerRound, roundsCount };
}

const SORT_BENEFITS = [
  { icon: 'albums-outline', textKey: 'benefitSort1' },
  { icon: 'link-outline', textKey: 'benefitSort2' },
  { icon: 'speedometer-outline', textKey: 'benefitSort3' },
];

/**
 * Что меняется с уровнем — вслух, а не молча.
 *
 * ЗАЧЕМ. Из 61 игры смену правил объясняли 14; остальные растили сложность
 * незаметно, и человек упирался, не понимая во что. Приоритет Дениса 16.08.2026.
 */
const SEMANTICSORT_RULES: LevelRule[] = [
  { key: 'three', fromLevel: 4 },   // lr_semantic_sort_three_*
  { key: 'four', fromLevel: 9 },   // lr_semantic_sort_four_*
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
interface Round { word: string; correctCat: string; cats: string[] }

export default function SemanticSortGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, autostart, str, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в блок «Об игре» (GameAbout);
  const [targetLang, setTargetLang] = useState<string>(() => str('targetLang', language === 'en' ? 'es' : 'en'));
  const [roundsCount, setRoundsCount] = useState(() => num('rounds', 15));
  const [catsPerRound, setCatsPerRound] = useState(() => num('cats', 3));

  // Уровни (persist): ручные селекторы раундов/категорий заменены лесенкой 1..15.
  const lvl = usePersistentLevel('semantic_sort');
  // Правила уровня: показать при первом входе и дать перечитать по бейджу.
  const levelRules = useLevelRules('semantic_sort', lvl.level, SEMANTICSORT_RULES, phase === 'playing');
  const levelRef = useRef(1);
  const useLevelRef = useRef(false);
  const roundsRef = useRef<Round[]>([]);
  const correctRef = useRef(0);   // счётчики в рефах — finish() читает актуальные (state отстаёт на последний клик)
  const errorsRef = useRef(0);

  const [rounds, setRounds] = useState<Round[]>([]);
  const [clearedPassed, setClearedPassed] = useState(true);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const rtSumRef = useRef(0);
  const shownAtRef = useRef(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const tgt = targetLang === language ? (language === 'en' ? 'es' : 'en') : targetLang;

  const startGame = () => {
    // Уровневый режим: число раундов и категорий-дистракторов из levelParams.
    // Пресет зарядки — ручные rounds/cats из URL-параметров.
    const useLevel = !isPreset;
    useLevelRef.current = useLevel;
    let rc = roundsCount, cpr = catsPerRound;
    if (useLevel) {
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      rc = p.roundsCount; cpr = p.catsPerRound;
      setRoundsCount(rc); setCatsPerRound(cpr);
    }
    // слова целевого языка, сгруппированные по категориям (+ обратный маппинг слово → категория)
    const byCat = new Map<string, string[]>();
    const wordCat = new Map<string, string>();
    for (const w of TRANSLATION_VOCAB) {
      if (!w[tgt] || !w.cat) continue;
      if (!byCat.has(w.cat)) byCat.set(w.cat, []);
      byCat.get(w.cat)!.push(w[tgt]);
      wordCat.set(w[tgt], w.cat);
    }
    const cats = Array.from(byCat.keys()).filter((c) => byCat.get(c)!.length >= 3);
    const effCats = Math.min(cpr, cats.length);   // не больше, чем есть категорий

    const newRounds: Round[] = [];
    for (let r = 0; r < rc; r++) {
      const correctCat = cats[Math.floor(Math.random() * cats.length)];
      const pool = byCat.get(correctCat)!;
      const word = pool[Math.floor(Math.random() * pool.length)];
      const others = cats.filter((c) => c !== correctCat);
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      // V3: «коварные» категории-дистракторы — из предрасчитанной таблицы эмбеддинг-близости
      // (похожие на целевое слово слова других категорий → их категории). Фолбэк — случайные.
      const smart: string[] = [];
      for (const dw of SEMANTIC_DISTRACTORS[`${tgt}:${word}`] ?? []) {
        const dc = wordCat.get(dw);
        if (dc && dc !== correctCat && cats.includes(dc) && !smart.includes(dc)) smart.push(dc);
        if (smart.length >= effCats - 1) break;
      }
      const fill = others.filter((c) => !smart.includes(c));
      const roundCats = [correctCat, ...smart, ...fill].slice(0, effCats);
      for (let i = roundCats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roundCats[i], roundCats[j]] = [roundCats[j], roundCats[i]];
      }
      newRounds.push({ word, correctCat, cats: roundCats });
    }
    roundsRef.current = newRounds;
    setRounds(newRounds);
    setIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setErrorsCount(0);
    correctRef.current = 0;
    errorsRef.current = 0;
    rtSumRef.current = 0;
    setStartTime(gameNow());
    shownAtRef.current = gameNow();
    setPhase('playing');
  };

  const finish = async (total: number) => {
    const finalTime = (gameNow() - startTime) / 1000;
    const correct = correctRef.current;
    const errs = errorsRef.current;
    const accuracy = total > 0 ? correct / total : 0;
    // Проход уровня: точность ≥80%. Вверх мгновенно, вниз с гистерезисом.
    const passed = useLevelRef.current && accuracy >= 0.8;
    if (!isPreset && useLevelRef.current) {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
    }
    setElapsedTime(finalTime);
    // Непрерывный поток: уровневый провал больше не роняет в тупик GameResult —
    // общий баннер LevelCleared с passed={false} («почти, ещё раз») + авто-рестарт
    // того же уровня. Пресет/свободный режим — как было (статистика в GameResult).
    setPhase(!isPreset && useLevelRef.current ? 'cleared' : 'result');
    try {
      await saveSession({
        passed,
        game_type: 'semantic_sort',
        score: correct,
        time_seconds: finalTime,
        difficulty: `${tgt} · ${total} × ${catsPerRound}`,
        errors: errs,
        details: {
          target_lang: tgt,
          rounds: total,
          cats_per_round: catsPerRound,
          accuracy,
          mean_rt_ms: total > 0 ? Math.round(rtSumRef.current / total) : 0,
          ...(useLevelRef.current ? { level: levelRef.current } : {}),
        },
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }
  };

  const handlePick = (cat: string) => {
    if (picked !== null) return;
    const round = rounds[idx];
    rtSumRef.current += gameNow() - shownAtRef.current;
    const isCorrect = cat === round.correctCat;
    setPicked(cat);
    if (isCorrect) { hapticSuccess(); correctRef.current += 1; setCorrectCount((c) => c + 1); }
    else { hapticError(); errorsRef.current += 1; setErrorsCount((c) => c + 1); }
    setTimeout(() => {
      const next = idx + 1;
      if (next >= rounds.length) {
        finish(rounds.length);
      } else {
        setIdx(next);
        setPicked(null);
        shownAtRef.current = gameNow();
      }
    }, isCorrect ? 350 : 900);
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.configContainer}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
          <Ionicons name="albums" size={48} color={ON_GRAD.color} />
          <Text style={[styles.configTitle, { color: ON_GRAD.color }]}>{t('semanticSort')}</Text>
          <Text style={[styles.configDesc, { color: ON_GRAD_SOFT }]}>{t('semanticSortDesc')}</Text>
        </LinearGradient>
        <GameAbout descriptionKey="semanticSortIntroDesc" benefits={SORT_BENEFITS} accent={GRADIENT[0]} />

        <LevelProgressMap gameId="semantic_sort" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center', marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {t('level')} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 2 }}>
            {(() => { const p = levelParams(lvl.level); return t('semanticLvlParams').replace('{r}', String(p.roundsCount)).replace('{c}', String(p.catsPerRound)); })()}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.card }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.optionCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>
            {LANGUAGES.find((l) => l.code === language)?.name} →
          </Text>
          <View style={styles.optionButtons}>
            /*
                🔴 ПРЕДЛАГАЕМ ТОЛЬКО ТЕ ЯЗЫКИ, НА КОТОРЫХ ЕСТЬ СЛОВАРЬ.
                Раньше выбор строился из всех двенадцати языков приложения, а
                словарь покрывает семь: на французском игра запускалась и
                оказывалась пустой — «выбери 1-е из 0», а в зарядке экран
                оставался мёртвым навсегда, без шапки и без «назад».
                Список выводится ИЗ САМОГО словаря, вписать его руками нельзя.
              */
              {LANGUAGES.filter((l) => l.code !== language && hasVocab(l.code)).map((l) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={l.code}
                style={[
                  styles.sizeButton,
                  tgt === l.code && { backgroundColor: GRADIENT[0] },
                  tgt !== l.code && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setTargetLang(l.code)}
              >
                <Text style={[styles.sizeButtonText, { color: tgt === l.code ? textOn(GRADIENT[0]) : colors.text }]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button" style={styles.startButton} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startButtonGradient}>
            <Ionicons name="play" size={24} color={ON_GRAD.color} />
            <Text style={[styles.startButtonText, { color: ON_GRAD.color }]}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // playing-фаза — на едином каркасе GameShell (слово в скролл-поле, категории-ответы прибиты к низу)
  const renderPlaying = () => {
    const round = rounds[idx];
    if (!round) return null;
    return (
      <GameShell
        title={t('semanticSort')}
        onBack={() => goBackOrHome()}
        scrollableField
        stats={
          <View style={styles.hudRow}>
            <Text style={[styles.hudText, { color: colors.textSecondary }]}>{t('round')} {idx + 1}/{rounds.length}</Text>
            <Text style={[styles.hudText, { color: colors.textSecondary }]}>{t('hud_correct')} {correctCount} · {t('hud_errors')} {errorsCount}</Text>
          </View>
        }
        toolbar={
          <View style={styles.toolbarOptions}>
            {round.cats.map((cat) => {
              const isRight = picked !== null && cat === round.correctCat;
              const isWrongPick = picked === cat && cat !== round.correctCat;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={cat}
                  style={[
                    styles.answerButton,
                    styles.toolbarOptionBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    isRight && { backgroundColor: '#34d399', borderColor: '#34d399' },
                    isWrongPick && { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
                  ]}
                  onPress={() => handlePick(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.answerText, { color: isRight || isWrongPick ? '#fff' : colors.text }]}>
                    {t(`catVocab_${cat}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        }
      >
        <View style={[styles.promptCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.promptWord, { color: colors.text }]}>{round.word}</Text>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('sortHint')}</Text>
      </GameShell>
    );
  };

  if (phase === 'playing') return <>{renderPlaying()}<LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} /></>;


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('semanticSort')}</Text>
        <View style={styles.placeholder} />
      </View>

      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId="semantic_sort"
          level={levelRef.current}
          stars={errorsRef.current === 0 ? 3 : errorsRef.current <= 2 ? 2 : 1}
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
          time={elapsedTime}
          score={correctCount}
          errors={errorsCount}
          gradient={GRADIENT}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => router.push('/')}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  placeholder: { width: 44 },
  configScroll: { flex: 1 },
  configContainer: { paddingHorizontal: 16, marginBottom: 16, paddingBottom: 20 },
  configCard: { padding: 24, borderRadius: 20, alignItems: 'center', marginBottom: 8 },
  configTitle: { fontSize: 24, fontWeight: '700' },
  configDesc: { fontSize: 14, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 16 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sizeButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, minWidth: 56, alignItems: 'center' },
  sizeButtonText: { fontSize: 15, fontWeight: '600' },
  startButton: { marginTop: 10 },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 8,
    gap: 8,
  },
  startButtonText: { fontSize: 18, fontWeight: '700' },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  hudText: { fontSize: 15, fontWeight: '600' },
  promptCard: {
    borderRadius: 20,
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  promptWord: { fontSize: 34, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 14 },
  // Категории-ответы в тулбаре каркаса: сетка 2×N на всю ширину ряда
  toolbarOptions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toolbarOptionBtn: { flexGrow: 1, flexBasis: '45%' },
  answerButton: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  answerText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
