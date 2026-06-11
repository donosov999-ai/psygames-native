import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#ee9ca7', '#ffdde1'];
const ANAGRAM_BENEFITS = [
  { icon: 'language-outline', textKey: 'benefitAnagram1' },
  { icon: 'book-outline', textKey: 'benefitAnagram2' },
  { icon: 'bulb-outline', textKey: 'benefitAnagram3' },
];

/**
 * Each entry: { w: word, h: hint (короткая подсказка-намёк) }
 * Lengths verified — каждое слово точно соответствует категории длины.
 */
type WordEntry = { w: string; h: string };

const RU_WORDS_4: WordEntry[] = [
  { w: 'парк',  h: 'место отдыха в городе' },
  { w: 'роса',  h: 'утром на траве' },
  { w: 'осёл',  h: 'упрямое животное' },
  { w: 'рука',  h: 'часть тела' },
  { w: 'небо',  h: 'над головой' },
  { w: 'цвет',  h: 'красный, синий и т.д.' },
  { w: 'окно',  h: 'смотришь на улицу через него' },
  { w: 'лето',  h: 'жаркое время года' },
  { w: 'зима',  h: 'холодное время года' },
  { w: 'хлеб',  h: 'на столе ежедневно' },
  { w: 'соль',  h: 'белая, на столе' },
  { w: 'лиса',  h: 'рыжая хитрая' },
  { w: 'утка',  h: 'птица на пруду' },
  { w: 'волк',  h: 'серый хищник' },
  { w: 'тигр',  h: 'полосатый хищник' },
  { w: 'ваза',  h: 'для цветов' },
  { w: 'торт',  h: 'на день рождения' },
  { w: 'кран',  h: 'строительная техника' },
  { w: 'мост',  h: 'над рекой' },
  { w: 'луна',  h: 'светит ночью' },
];

const RU_WORDS_5: WordEntry[] = [
  { w: 'океан', h: 'огромный водоём' },
  { w: 'стена', h: 'в комнате' },
  { w: 'школа', h: 'учатся дети' },
  { w: 'город', h: 'большое поселение' },
  { w: 'актёр', h: 'играет в кино' },
  { w: 'мышка', h: 'маленький зверёк' },
  { w: 'кошка', h: 'мяукает' },
  { w: 'лошадь', h: '6 букв' },  // — выкину, длина не та; заменю ниже
  { w: 'кисть', h: 'для рисования' },
  { w: 'парта', h: 'стол в школе' },
  { w: 'мячик', h: 'круглый, прыгает' },
  { w: 'белый', h: 'цвет снега' },
  { w: 'синий', h: 'цвет неба' },
  { w: 'арбуз', h: 'полосатая ягода' },
  { w: 'лимон', h: 'жёлтый кислый' },
  { w: 'торты', h: 'много сладкого' },
  { w: 'метро', h: 'подземный транспорт' },
  { w: 'ручка', h: 'пишут ей' },
].filter(e => e.w.length === 5);

const RU_WORDS_6: WordEntry[] = [
  { w: 'солнце', h: 'светит днём' },
  { w: 'берёза', h: 'белое дерево' },
  { w: 'стрела', h: 'для лука' },
  { w: 'ракета', h: 'летит в космос' },
  { w: 'погода', h: 'дождь или солнце' },
  { w: 'корова', h: 'даёт молоко' },
  { w: 'корона', h: 'на голове у короля' },
  { w: 'ананас', h: 'фрукт с короной' },
  { w: 'ремонт', h: 'делают в квартире' },
  { w: 'кабина', h: 'у пилота, у водителя' },
  { w: 'машина', h: 'ездит по дороге' },
  { w: 'дорога', h: 'по ней едут' },
  { w: 'девушка', h: '7 букв' },  // выкинется фильтром
  { w: 'медведь', h: '7 букв' },  // выкинется фильтром
].filter(e => e.w.length === 6);

const EN_WORDS_4: WordEntry[] = [
  { w: 'park', h: 'place to relax in city' },
  { w: 'rose', h: 'red flower' },
  { w: 'rope', h: 'for climbing' },
  { w: 'road', h: 'cars drive on it' },
  { w: 'book', h: 'you read it' },
  { w: 'wind', h: 'moves the leaves' },
  { w: 'door', h: 'you open it' },
  { w: 'snow', h: 'white, in winter' },
  { w: 'rain', h: 'falls from sky' },
  { w: 'tree', h: 'tall, has leaves' },
  { w: 'star', h: 'shines at night' },
  { w: 'moon', h: 'circles the Earth' },
  { w: 'fish', h: 'lives in water' },
  { w: 'lion', h: 'king of jungle' },
  { w: 'cake', h: 'for a birthday' },
  { w: 'lamp', h: 'gives light' },
  { w: 'bird', h: 'flies and sings' },
  { w: 'leaf', h: 'grows on a tree' },
  { w: 'salt', h: 'white, on the table' },
  { w: 'gold', h: 'precious metal' },
];

const EN_WORDS_5: WordEntry[] = [
  { w: 'plane', h: 'flies through sky' },
  { w: 'ocean', h: 'huge body of water' },
  { w: 'globe', h: 'round map of Earth' },
  { w: 'music', h: 'you listen to it' },
  { w: 'green', h: 'color of grass' },
  { w: 'river', h: 'flows to the sea' },
  { w: 'quiet', h: 'opposite of loud' },
  { w: 'smart', h: 'clever' },
  { w: 'apple', h: 'red fruit' },
  { w: 'cloud', h: 'in the sky' },
  { w: 'horse', h: 'animal you ride' },
  { w: 'pizza', h: 'Italian dish' },
  { w: 'lemon', h: 'yellow and sour' },
  { w: 'house', h: 'people live in it' },
  { w: 'table', h: 'you eat at it' },
  { w: 'light', h: 'opposite of dark' },
  { w: 'water', h: 'you drink it' },
];

const EN_WORDS_6: WordEntry[] = [
  { w: 'planet', h: 'Earth is one' },
  { w: 'market', h: 'place to buy food' },
  { w: 'garden', h: 'plants grow here' },
  { w: 'pencil', h: 'used for writing' },
  { w: 'silver', h: 'precious metal' },
  { w: 'rocket', h: 'goes to space' },
  { w: 'window', h: 'glass in wall' },
  { w: 'guitar', h: 'string instrument' },
  { w: 'monkey', h: 'climbs trees' },
  { w: 'orange', h: 'fruit and color' },
  { w: 'flower', h: 'grows in a garden' },
  { w: 'bridge', h: 'crosses a river' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function AnagramGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [length, setLength] = useState<4 | 5 | 6>(() => (num('length', 4) as 4 | 5 | 6));
  const [trials] = useState(10);
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState('');
  const [hint, setHint] = useState('');     // подсказка-намёк на слово
  const [letters, setLetters] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [hintUses, setHintUses] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usedRef = useRef<Set<string>>(new Set());   // показанные в сессии слова — без повторов

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const wordsBank = (len: 4 | 5 | 6): WordEntry[] => {
    if (language === 'ru') return len === 4 ? RU_WORDS_4 : len === 5 ? RU_WORDS_5 : RU_WORDS_6;
    return len === 4 ? EN_WORDS_4 : len === 5 ? EN_WORDS_5 : EN_WORDS_6;
  };

  const newRound = () => {
    const bank = wordsBank(length);
    let avail = bank.filter((e) => !usedRef.current.has(e.w));
    if (avail.length === 0) { usedRef.current.clear(); avail = bank; }   // банк исчерпан → сброс
    const entry = avail[Math.floor(Math.random() * avail.length)];
    usedRef.current.add(entry.w);
    const w = entry.w.toUpperCase();
    setTarget(w);
    setHint(entry.h);
    let arr = w.split('');
    let attempts = 0;
    do { arr = shuffle(arr); attempts++; } while (arr.join('') === w && attempts < 5);
    setLetters(arr);
    setPicked([]);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1); setHintUses(0); usedRef.current.clear();
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleLetterPress = async (idx: number) => {
    if (picked.includes(idx)) return;
    const newPicked = [...picked, idx];
    setPicked(newPicked);
    if (newPicked.length === target.length) {
      const guess = newPicked.map((i) => letters[i]).join('');
      const correct = guess === target;
      const newHits = hits + (correct ? 1 : 0);
      const newErr = errors + (correct ? 0 : 1);
      setHits(newHits);
      setErrors(newErr);
      setTimeout(async () => {
        if (round >= trials) {
          if (timerRef.current) clearInterval(timerRef.current);
          const finalTime = (Date.now() - startTime) / 1000;
          setElapsedTime(finalTime);
          setPhase('result');
          try {
            await saveSession({
              game_type: 'anagrams',
              score: newHits * 100,
              time_seconds: finalTime,
              difficulty: `${length} letters`,
              mode: `${trials}t`,
              errors: newErr,
              details: { hits: newHits, errors: newErr, trials },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound((r) => r + 1);
          newRound();
        }
      }, 700);
    }
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="language" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('anagrams')}</Text>
        <Text style={styles.configDesc}>{t('anagramsDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('lettersInWord')}</Text>
        <View style={styles.optionButtons}>
          {([4, 5, 6] as const).map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, length === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setLength(n)}>
              <Text style={[styles.modeButtonText, { color: length === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={[styles.startBtnText, { color: '#3f2b96' }]}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  // Подсказка: автоматически открыть следующую правильную букву
  const revealHint = () => {
    const nextChar = target[picked.length];
    if (nextChar === undefined) return;
    const idx = letters.findIndex((ch, i) => ch === nextChar && !picked.includes(i));
    if (idx >= 0) { setHintUses((h) => h + 1); handleLetterPress(idx); }
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('anagramHint')}</Text>
      {/* 💡 Hint banner — короткий намёк на слово */}
      {hint ? (
        <View style={[styles.hintBanner, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
          <Text style={[styles.hintBannerEmoji]}>💡</Text>
          <Text style={[styles.hintBannerText, { color: colors.text }]}>{hint}</Text>
        </View>
      ) : null}
      <View style={styles.pickedRow}>
        {Array.from({ length: target.length }).map((_, i) => (
          <View key={i} style={[styles.pickedSlot, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.pickedLetter, { color: colors.text }]}>
              {picked[i] !== undefined ? letters[picked[i]] : ''}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.lettersRow}>
        {letters.map((l, i) => (
          <TouchableOpacity
            key={i}
            disabled={picked.includes(i)}
            onPress={() => handleLetterPress(i)}
            style={[
              styles.letterBtn,
              {
                backgroundColor: picked.includes(i) ? colors.surface : GRADIENT[0],
                opacity: picked.includes(i) ? 0.3 : 1,
              },
            ]}
          >
            <Text style={[styles.letterText, { color: '#3f2b96' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <TouchableOpacity onPress={revealHint} style={[styles.clearBtn, { flex: 1, backgroundColor: '#fbbf24' }]}>
          <Text style={[styles.clearText, { color: '#1a1a1a' }]}>💡 {language === 'ru' ? 'Подсказка' : 'Hint'}{hintUses > 0 ? ` (${hintUses})` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPicked([])} style={[styles.clearBtn, { flex: 1, backgroundColor: colors.surface }]}>
          <Text style={[styles.clearText, { color: colors.text }]}>{t('clear')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('anagrams')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="anagrams" icon="language" gradient={GRADIENT as [string, string]}
          skillKey="skillVerbal" descriptionKey="anagramsIntroDesc"
          benefits={ANAGRAM_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={hits * 100} time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => router.back()}
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
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 24, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    maxWidth: 360,
  },
  hintBannerEmoji: { fontSize: 20 },
  hintBannerText: { fontSize: 14, fontWeight: '600', flex: 1 },
  pickedRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  pickedSlot: { width: 44, height: 54, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  pickedLetter: { fontSize: 22, fontWeight: '700' },
  lettersRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 360 },
  letterBtn: { width: 56, height: 56, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  letterText: { fontSize: 24, fontWeight: '800' },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, marginTop: 8 },
  clearText: { fontSize: 13, fontWeight: '600' },
});
