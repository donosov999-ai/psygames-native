import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useProfile } from '@/src/contexts/ProfileContext';
import { pairSpritesForProfile } from '@/src/constants/pairThemes';
import { FlipCard, HudBadge, ScorePopupLayer, useScorePopups, hapticSuccess, hapticError } from '@/src/components/juice';

const GRADIENT = ['#f857a6', '#ff5858'];
const PAIRS_BENEFITS = [
  { icon: 'heart-outline', textKey: 'benefitPairs1' },
  { icon: 'eye-outline', textKey: 'benefitPairs2' },
  { icon: 'time-outline', textKey: 'benefitPairs3' },
];

// Спрайты карточек подбираются под активный профиль (зверята / шахматы / биохак / …),
// см. src/constants/pairThemes.ts. Любой набор = ровно 12 объектов.

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
interface Card {
  id: number;
  symbol: number;   // индекс карточки в PAIR_SPRITES (пара = одинаковый индекс)
  flipped: boolean;
  matched: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PicturePairsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const sprites = pairSpritesForProfile(profile?.id);
  const { popups, spawn } = useScorePopups();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const gate = useLevelGate('picture_pairs');
  const [pairsCount, setPairsCount] = useState(() => num('pairsCount', 6));
  const [photoMemoryMode, setPhotoMemoryMode] = useState(true);   // ON by default — фото-память тренинг
  const [previewMs, setPreviewMs] = useState<500 | 1500 | 3000>(() => (num('previewMs', isPreset ? 3000 : 500) as 500 | 1500 | 3000));
  const [previewActive, setPreviewActive] = useState(false);       // true while showing all cards face-up
  const [cards, setCards] = useState<Card[]>([]);
  const [openIdx, setOpenIdx] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matched, setMatched] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
  }, []);

  const buildDeck = (n: number) => {
    const symbols = shuffle(sprites.map((_, i) => i)).slice(0, n);
    const deck: Card[] = [];
    symbols.forEach((s, i) => {
      deck.push({ id: i * 2, symbol: s, flipped: false, matched: false });
      deck.push({ id: i * 2 + 1, symbol: s, flipped: false, matched: false });
    });
    return shuffle(deck);
  };

  const startGame = () => {
    const deck = buildDeck(pairsCount);
    setOpenIdx([]);
    setMoves(0);
    setMatched(0);
    setErrors(0);
    setLocked(false);
    setPhase('playing');

    if (photoMemoryMode) {
      // Фото-память: показать ВСЕ карты лицом вверх на previewMs мс,
      // затем закрыть и начать таймер. Биомаркер фото-памяти = moves
      // в этой партии (меньше moves после flash = лучше запомнил).
      const previewDeck = deck.map(c => ({ ...c, flipped: true }));
      setCards(previewDeck);
      setPreviewActive(true);
      setLocked(true);   // блокируем тапы во время preview
      previewTimerRef.current = setTimeout(() => {
        // hide all and start
        const hiddenDeck = deck.map(c => ({ ...c, flipped: false }));
        setCards(hiddenDeck);
        setPreviewActive(false);
        setLocked(false);
        const start = Date.now();
        setStartTime(start);
        timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
      }, previewMs);
    } else {
      // Стандартный режим — без preview
      setCards(deck);
      setPreviewActive(false);
      const start = Date.now();
      setStartTime(start);
      timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
    }
  };

  const handleCardPress = async (idx: number) => {
    if (locked || cards[idx].matched || cards[idx].flipped) return;
    const newCards = cards.map((c, i) => i === idx ? { ...c, flipped: true } : c);
    setCards(newCards);
    const newOpen = [...openIdx, idx];
    setOpenIdx(newOpen);

    if (newOpen.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = newOpen;
      if (newCards[a].symbol === newCards[b].symbol) {
        // match
        setTimeout(async () => {
          const matchedCards = newCards.map((c, i) =>
            i === a || i === b ? { ...c, matched: true } : c
          );
          setCards(matchedCards);
          const newMatched = matched + 1;
          setMatched(newMatched);
          setOpenIdx([]);
          hapticSuccess();
          spawn(width / 2 - 16, 120, '+1', '#fbbf24');
          if (newMatched >= pairsCount) {
            if (timerRef.current) clearInterval(timerRef.current);
            const finalTime = (Date.now() - startTime) / 1000;
            setElapsedTime(finalTime);
            setPhase('result');
            try {
              await saveSession({
                game_type: 'picture_pairs',
                score: Math.max(0, Math.round(2000 - (moves + 1 - pairsCount) * 30 - finalTime)),
                time_seconds: finalTime,
                difficulty: `${pairsCount} pairs`,
                mode: photoMemoryMode ? `photo-${previewMs}ms` : 'classic',
                errors,
                details: {
                  moves: moves + 1,
                  optimal: pairsCount,
                  photo_memory_mode: photoMemoryMode,
                  preview_ms: photoMemoryMode ? previewMs : 0,
                  // Photo-memory efficiency: lower = better recall after flash
                  // (theoretical optimum = pairsCount moves if perfect recall)
                  extra_moves: (moves + 1) - pairsCount,
                },
              });
            } catch (e) { console.error(e); }
          }
        }, 400);
      } else {
        // mismatch
        setLocked(true);
        setErrors((e) => e + 1);
        hapticError();
        setTimeout(() => {
          setCards((cs) => cs.map((c, i) =>
            i === a || i === b ? { ...c, flipped: false } : c
          ));
          setOpenIdx([]);
          setLocked(false);
        }, 800);
      }
    }
  };

  // grid layout — adapt cols to pairsCount
  const cols = pairsCount <= 6 ? 4 : pairsCount <= 10 ? 4 : pairsCount <= 12 ? 6 : 6;
  const gap = 8;
  const containerW = Math.min(width - 32, 480);
  const cardSize = (containerW - (cols - 1) * gap) / cols;

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="heart" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('picturePairs')}</Text>
        <Text style={styles.configDesc}>{t('picturePairsDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('pairsCount')}</Text>
        <View style={styles.optionButtons}>
          {[6, 8, 10, 12].map((n) => {
            // manifest uses keys '6 pairs'/'8 pairs'/'12 pairs' (10 not in manifest, allowed)
            const levelKey = `${n} pairs`;
            const locked = gate.isLocked(levelKey);
            return (
            <TouchableOpacity key={n} disabled={locked}
              style={[styles.modeButton, pairsCount === n && !locked
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 }]}
              onPress={() => !locked && setPairsCount(n)}>
              <Text style={[styles.modeButtonText, { color: pairsCount === n && !locked ? '#FFF' : colors.text }]}>
                {n}{locked ? ' 🔒' : ''}
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

      {/* Photo-memory toggle */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => setPhotoMemoryMode(!photoMemoryMode)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name={photoMemoryMode ? 'checkbox' : 'square-outline'} size={24} color={GRADIENT[0]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{t('label_photo_memory')}</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }]}>
              {t('desc_photo_memory')}
            </Text>
          </View>
        </TouchableOpacity>
        {photoMemoryMode && (
          <View style={styles.optionButtons}>
            {([500, 1500, 3000] as const).map((ms) => (
              <TouchableOpacity key={ms} style={[styles.modeButton, previewMs === ms
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setPreviewMs(ms)}>
                <Text style={[styles.modeButtonText, { color: previewMs === ms ? '#FFF' : colors.text }]}>
                  {language === 'ru'
                    ? (ms === 500 ? '0.5с (хард)' : ms === 1500 ? '1.5с (норма)' : '3с (легко)')
                    : (ms === 500 ? '0.5s (hard)' : ms === 1500 ? '1.5s (normal)' : '3s (easy)')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
      {previewActive ? (
        <View style={{ alignItems: 'center', gap: 4, paddingVertical: 8 }}>
          <Text style={{ color: GRADIENT[0], fontSize: 22, fontWeight: '900', letterSpacing: 2 }}>
            {t('label_memorize')}
          </Text>
          <Text style={{ color: '#666', fontSize: 12 }}>
            {language === 'ru'
              ? `${(previewMs / 1000).toFixed(1)}с — потом карты закроются`
              : `${(previewMs / 1000).toFixed(1)}s — then the cards flip back`}
          </Text>
        </View>
      ) : (
        <View style={styles.statsRow}>
          <HudBadge icon="checkmark-done" value={`${matched}/${pairsCount}`} colors={['#34d399', '#059669']} pop />
          <HudBadge icon="swap-horizontal" value={moves} colors={['#fb7185', '#e11d48']} />
          <HudBadge icon="close" value={errors} colors={['#94a3b8', '#475569']} />
          <HudBadge icon="time" value={`${elapsedTime.toFixed(1)}${language === 'ru' ? 'с' : 's'}`} colors={['#60a5fa', '#2563eb']} />
        </View>
      )}
      <View style={[styles.cardsArea, { width: containerW }]}>
        {cards.map((card, i) => (
          <FlipCard
            key={i}
            size={cardSize}
            radius={10}
            flipped={card.flipped || card.matched}
            matched={card.matched}
            disabled={card.matched || card.flipped || locked}
            onPress={() => handleCardPress(i)}
            back={
              <View style={{ width: cardSize, height: cardSize, borderRadius: 10, backgroundColor: GRADIENT[0], justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                <Ionicons name="heart" size={cardSize * 0.3} color="rgba(255,255,255,0.5)" />
              </View>
            }
            front={
              <View style={{ width: cardSize, height: cardSize, borderRadius: 10, backgroundColor: card.matched ? '#22c55e' : colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
                <Image source={sprites[card.symbol]} style={{ width: cardSize * 0.82, height: cardSize * 0.82 }} resizeMode="contain" />
              </View>
            }
          />
        ))}
      </View>
      <ScorePopupLayer popups={popups} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('picturePairs')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="picturePairs" icon="heart" gradient={GRADIENT as [string, string]}
          skillKey="skillVisualMemory" descriptionKey="picturePairsIntroDesc"
          benefits={PAIRS_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(2000 - (moves - pairsCount) * 30 - elapsedTime))}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 14, alignItems: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' },
  statText: { fontSize: 14, fontWeight: '700' },
  cardsArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  card: { borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardText: { textAlign: 'center' },
});
