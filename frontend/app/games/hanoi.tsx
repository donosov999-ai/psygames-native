import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import LevelCleared from '@/src/components/LevelCleared';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const HN_RULES: LevelRule[] = [
  {
    key: 'pegs4', fromLevel: 5, toLevel: 9,
    ru: { title: '4 стержня', rule: 'Теперь стержней четыре. Больше простора для манёвра — но оптимальный путь другой, старые привычки трёх стержней не работают. Цель прежняя: собрать башню на последнем (правом) стержне.', example: 'Пример: лишний стержень = два «буфера» для мелких дисков.' },
    en: { title: '4 pegs', rule: 'There are now four pegs. More room to maneuver — but the optimal path is different, old 3-peg habits won\'t work. The goal stays the same: rebuild the tower on the last (rightmost) peg.', example: 'Example: the extra peg gives you two "buffers" for small discs.' },
  },
  {
    key: 'pegs5', fromLevel: 10,
    ru: { title: '5 стержней', rule: 'Стержней уже пять — ещё больше простора для манёвра, но и дисков больше, а оптимальный путь снова другой. Цель прежняя: вся башня на последнем (правом) стержне.', example: 'Пример: три «буфера» — раскладывай мелкие диски параллельно.' },
    en: { title: '5 pegs', rule: 'Five pegs now — even more room to maneuver, but more discs too, and the optimal path changes again. The goal stays the same: the whole tower on the last (rightmost) peg.', example: 'Example: three "buffers" — park small discs in parallel.' },
  },
];

const GRADIENT = ['#a8c0ff', '#3f2b96'];
// Базовый тон дисков под профиль — каждый профиль = своя цветовая семья (монохром-стек).
const DISC_HUE: Record<string, number> = {
  chess: 42, odv999: 45, free: 40, nzt48: 270, seniors: 265, polyglot: 232,
  women: 330, kids: 145, drivers: 22, execs: 175, students: 30, vasilyeva: 200,
};
const HANOI_BENEFITS = [
  { icon: 'extension-puzzle-outline', textKey: 'benefitHanoi1' },
  { icon: 'analytics-outline', textKey: 'benefitHanoi2' },
  { icon: 'trending-up-outline', textKey: 'benefitHanoi3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';

// Уровень (1..15+): L1-4 3 стержня диски 3→6 · L5-9 4 стержня диски 5→9 · L10-15 5 стержней диски 9→12.
// Больше стержней = новый вызов (короче решение), затем растут диски.
function levelParams(level: number): { discs: number; pegs: number } {
  if (level <= 4) return { discs: 2 + level, pegs: 3 };
  if (level <= 9) return { discs: Math.min(9, level), pegs: 4 };
  return { discs: Math.min(12, level - 1), pegs: 5 };
}

export default function HanoiGame() {
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('hanoi');   // персист-уровень = discs − 2 (L1=3 диска)
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [discs, setDiscs] = useState(() => num('discs', 4));
  const [pegs, setPegs] = useState<number[][]>([[], [], []]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);

  const optimal = (n: number) => Math.pow(2, n) - 1;

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Справка правил уровня: только в личной игре (в зарядке-пресете всегда 3 стержня, бейдж скрыт)
  const levelRules = useLevelRules('hanoi', lvl.level, HN_RULES, phase === 'playing' && !isPreset);

  const startGame = () => {
    const p = isPreset ? { discs, pegs: 3 } : levelParams(lvl.level);   // уровень рулит: диски + число стержней
    const d = p.discs;
    levelRef.current = lvl.level;
    if (!isPreset) setDiscs(d);
    const initial = Array.from({ length: d }, (_, i) => d - i);
    setPegs([initial, ...Array.from({ length: p.pegs - 1 }, () => [] as number[])]);   // N стержней, диски на первом
    setSelected(null);
    setMoves(0);
    setErrors(0);
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handlePegPress = async (idx: number) => {
    if (selected === null) {
      if (pegs[idx].length === 0) return;
      setSelected(idx);
      return;
    }
    if (selected === idx) { setSelected(null); return; }
    const from = pegs[selected];
    const to = pegs[idx];
    const top = from[from.length - 1];
    if (to.length === 0 || to[to.length - 1] > top) {
      const np = pegs.map((p) => [...p]);
      np[idx].push(np[selected].pop()!);
      setPegs(np);
      setMoves((m) => m + 1);
      setSelected(null);
      // Check win — все диски на ПОСЛЕДНЕМ стержне (работает для 3/4/5 стержней)
      if (np[np.length - 1].length === discs) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        if (!isPreset) lvl.reach(levelRef.current + 1);   // решил пазл → +уровень
        setPhase(isPreset ? 'result' : 'cleared');   // личная игра → авто-поток к следующему уровню; пресет → обычный результат
        try {
          await saveSession({
            game_type: 'hanoi',
            score: Math.max(0, Math.round(1000 - (moves + 1 - optimal(discs)) * 50 - finalTime)),
            time_seconds: finalTime,
            difficulty: `${discs} discs`,
            mode: 'classic',
            errors,
            details: { moves: moves + 1, optimal: optimal(discs) },
          });
        } catch (e) { console.error(e); }
      }
    } else {
      setErrors((e) => e + 1);
      setSelected(null);
    }
  };

  const pegW = Math.min((width - 24) / (pegs.length + 0.5), 110);   // подгон под число стержней
  const discBaseW = pegW * 0.35;
  const discStep = (pegW - discBaseW) / Math.max(discs, 2);
  const baseHue = DISC_HUE[profile?.id ?? ''] ?? 215;

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="extension-puzzle" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('hanoi')}</Text>
        <Text style={styles.configDesc}>{t('hanoiDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')}</Text>
        <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
          {t('hanoiLvlAuto').replace('{n}', String(lvl.level))}
        </Text>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{moves} / {optimal(discs)}{!isPreset ? ` · ${t('label_level_short')}${lvl.level}` : ''}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{t('secShort')}</Text>
        {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />}
      </View>
      <View style={styles.pegsArea}>
        {pegs.map((peg, idx) => (
          <TouchableOpacity
            key={idx}
            activeOpacity={0.7}
            onPress={() => handlePegPress(idx)}
            style={[
              styles.pegContainer,
              {
                width: pegW,
                borderColor: selected === idx ? GRADIENT[0] : 'transparent',
              },
            ]}
          >
            <View style={styles.pegStack}>
              {/* ЗАЧЕМ: в peg[] индекс 0 = НИЗ стержня, последний элемент = ВЕРХ
                  (handlePegPress берёт top = from[from.length - 1]). Колонка RN рисует детей
                  сверху вниз, поэтому массив разворачиваем: без reverse широкий диск оказывался
                  наверху, а узкий у основания — перевёрнутая пирамида. key=size: размеры на
                  одном стержне уникальны, индекс после reverse нестабилен. */}
              {peg.slice().reverse().map((size) => (
                <LinearGradient
                  key={size}
                  colors={[
                    `hsl(${baseHue}, 68%, ${Math.min(82, 55 + (size / discs) * 28)}%)`,
                    `hsl(${baseHue}, 74%, ${Math.max(34, 42 + (size / discs) * 18)}%)`,
                  ]}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={[styles.disc, { width: discBaseW + size * discStep }]}
                >
                  <View style={styles.discShine} pointerEvents="none" />
                  <Text style={styles.discLabel} numberOfLines={1}>{size}</Text>
                </LinearGradient>
              ))}
              <View style={[styles.pole, { backgroundColor: colors.text }]} />
              <View style={[styles.pegBase, { backgroundColor: colors.text, width: pegW - 12 }]} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('hanoiHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('hanoi')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="hanoi" icon="extension-puzzle" gradient={GRADIENT as [string, string]}
          skillKey="skillProblemSolving" descriptionKey="hanoiIntroDesc"
          benefits={HANOI_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        // Чисто прошёл уровень (решил пазл) → баннер + авто-старт следующего.
        // 3★ = за оптимум ходов (2^n−1 для 3 стержней; для 4/5 порог с запасом), меньше — за лишние ходы.
        <LevelCleared gameId="hanoi" level={levelRef.current}
          stars={moves <= optimal(discs) ? 3 : moves <= Math.ceil(optimal(discs) * 1.5) ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(1000 - (moves - optimal(discs)) * 50 - elapsedTime))}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optionHint: { fontSize: 12, marginTop: 4 },
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 10 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  // ЗАЧЕМ: без flex:1 блок стержней сжимается по своему контенту, и playArea(justifyContent:center)
  // ставит башню в вертикальный ЦЕНТР экрана, а не прибивает к низу с пустым провалом сверху.
  // alignItems:flex-end оставлен намеренно — держит основания всех стержней на одной линии.
  // (Эталон math-sprint: игровое поле по центру.)
  // RTL-пин: правило «вся башня на последнем (правом) стержне» — порядок стержней не зеркалится
  pegsArea: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingBottom: 12, writingDirection: 'ltr' },
  pegContainer: { borderWidth: 3, borderRadius: 8, paddingBottom: 4 },
  pegStack: { alignItems: 'center', justifyContent: 'flex-end', position: 'relative', minHeight: 220 },
  pole: { position: 'absolute', width: 6, height: 200, bottom: 4, borderRadius: 3, opacity: 0.3 },
  pegBase: { height: 8, borderRadius: 4 },
  disc: { height: 22, marginTop: 2, borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  discShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.28)' },
  discLabel: { position: 'absolute', left: 0, right: 0, top: 3, textAlign: 'center', fontSize: 12, fontWeight: '800', color: 'rgba(25,15,0,0.62)' },
  hintText: { fontSize: 12, textAlign: 'center' },
});
