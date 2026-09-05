/* psygames-game-sudoku-hub · VER 2 · 27.08.2026 */
/**
 * Судоку — развилка на три доски одной головоломки:
 *  - классическая (`/games/sudoku`): одна сетка 6×6 или 9×9, 57 ступеней лестницы
 *    и три дороги сложности (services/sudoku-roads);
 *  - самурай (`/games/sudoku-samurai`): пять сеток 9×9, сцепленных углами;
 *  - фрактальная (`/games/sudoku-fractal`): за каждой клеткой верхней сетки — целая
 *    вложенная судоку.
 *
 * 🔴 ЗАЧЕМ РАЗВИЛКА. Три доски стояли в каталоге тремя отдельными карточками среди
 * семи десятков. Человек, который ищет «судоку», находил классическую и не узнавал,
 * что рядом есть ещё две — а самурай и фрактал живут часами и находят своего игрока
 * ровно тогда, когда обычная 9×9 стала даваться легко. Один вход эту связь называет.
 *
 * ⚠️ ЭТО МЕНЮ, А НЕ ПАРТИЯ. Отсюда только уходят: своего поля, своего таймера и своей
 * записи партии у экрана нет — ровно как у `span.tsx` и `attention-conflict.tsx`.
 * Поэтому у него нет и общего каркаса `GameShell`: пауза на время отзыва и вопрос
 * при выходе стерегут НЕЗАКОНЧЕННУЮ партию, а её здесь не бывает. Уход с экрана
 * ничего не теряет — терять нечего.
 *
 * ⚠️ ПАРТИИ, СЫГРАННЫЕ ЧЕРЕЗ ХАБ, ОСТАЮТСЯ ПАРТИЯМИ СВОИХ ИГР. Хаб не пишет сессий
 * и не имеет уровня; каждая доска ведёт свой прогресс и пишет свой `game_type`.
 * Ровно на этом уже спотыкались: тренировки через развилку не попадали в нагрузку
 * ветки, потому что счётчик искал партии по id карточки, а партия писалась под
 * другим ключом (`sessionTypeOf` в constants/games).
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import GamePreviewBackground from '@/src/components/GamePreviewBackground';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

// Тёмная пара семейства судоку. Цвет текста поверх плашки считает onGradientText по
// ОБОИМ концам: здесь сплошной цвет даёт 7.00 при норме AA 4.5, поэтому вуаль не
// нужна. Первая пара #5b4d9e→#86a8e7 давала 3.00 и была поймана гейтом контраста —
// светлый и тёмный конец требуют РАЗНОГО цвета текста, и общего не находится.
const GRADIENT = ['#3b2f7a', '#5b4d9e'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

const SUB_GAMES = [
  {
    route: '/games/sudoku',
    icon: 'apps' as const,
    nameKey: 'sudoku' as const,
    descKey: 'sudokuDesc' as const,
    typeKey: 'sudokuTypeClassic' as const,   // «Одна сетка · 57 ступеней» — словарь LanguageContext
  },
  {
    route: '/games/sudoku-samurai',
    icon: 'grid' as const,
    nameKey: 'samuraiTitle' as const,
    descKey: 'samuraiDesc' as const,
    typeKey: 'sudokuTypeSamurai' as const,
  },
  {
    route: '/games/sudoku-fractal',
    icon: 'git-network' as const,
    nameKey: 'fractalTitle' as const,
    descKey: 'fractalDesc' as const,
    typeKey: 'sudokuTypeFractal' as const,
  },
  /**
   * Небоскрёбы и неравенства — РЕЖИМЫ классической доски (задача 70b58bbe):
   * карточка ведёт на тот же экран с ?mode=…, у каждого своя мини-лестница на
   * 8 ступеней и свой счётчик. Партии пишутся под game_type='sudoku' с
   * mode='towers-N'/'unequal-N' — это режимы одной доски, как killer, а не
   * отдельные доски с прогрессом (за то и различие с самураем/фракталом).
   */
  {
    route: '/games/sudoku?mode=towers',
    icon: 'business' as const,
    nameKey: 'sudokuTowersTitle' as const,
    descKey: 'sudokuTowersHubDesc' as const,
    typeKey: 'sudokuTypeTowers' as const,
  },
  {
    route: '/games/sudoku?mode=unequal',
    icon: 'swap-vertical' as const,
    nameKey: 'sudokuUnequalTitle' as const,
    descKey: 'sudokuUnequalHubDesc' as const,
    typeKey: 'sudokuTypeUnequal' as const,
  },
];

function DemoSudokuRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(('/games/sudoku' + qs) as any);
  }, [router]);
  return null;
}

export default function SudokuHub() {
  // Web-demo: развилку не показываем — сразу классическая доска.
  // Query (embed=1, lang=…) обязан пережить редирект — embed-контракт с сайтом.
  if (isWebDemo()) {
    return <DemoSudokuRedirect />;
  }

  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('sudokuGroup')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
          <GamePreviewBackground />
          <Ionicons name="apps" size={48} color={ON_GRAD.color} />
          <Text style={styles.heroTitle}>{t('sudokuGroup')}</Text>
          <Text style={styles.heroDesc}>{t('sudokuGroupDesc')}</Text>
        </LinearGradient>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('sudokuPickBoard')}
        </Text>
        {SUB_GAMES.map((g) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={g.route}
            style={[styles.subCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(g.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: GRADIENT[0] + '22' }]}>
              <Ionicons name={g.icon} size={28} color={GRADIENT[0]} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardName, { color: colors.text }]}>{t(g.nameKey)}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t(g.descKey)}</Text>
              <Text style={[styles.cardTag, { color: GRADIENT[1] }]}>{t(g.typeKey)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {t('sudokuGroupFootnote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0, marginHorizontal: 8 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  heroCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8, overflow: 'hidden' },
  heroTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color, textAlign: 'center', textShadowColor: 'rgba(0,0,0,.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  heroDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center', lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginLeft: 4 },
  subCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, gap: 14, borderWidth: 1 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 12 },
  cardTag: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  footnote: { fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 15, paddingHorizontal: 8 },
});
