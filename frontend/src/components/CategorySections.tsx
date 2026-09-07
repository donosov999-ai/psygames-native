/* psygames-category-sections · VER 1 · 07.09.2026 */
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/src/contexts/ThemeContext';
// 🔴 Защищённая ширина, а не голый useWindowDimensions: на ПЕРВОМ кадре тот
// отдаёт 0, и ширина карточки посчиталась бы отрицательной. Гейт
// screen-width-guard поймал это в тот же час, и он прав.
import { useScreenSize } from '@/src/hooks/useScreenWidth';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useAllLevelStars } from '@/src/hooks/useAllLevelStars';
import GameCard from '@/src/components/GameCard';
import { filterAllowedGames } from '@/src/constants/profiles';
import { hubBadgeCount } from '@/src/constants/hubContents';
import {
  GAMES, CATEGORY_META, sessionTypeOf, visibleInCatalog, type GameCategory, type GameConfig,
} from '@/src/constants/games';

/**
 * РАЗДЕЛЫ КАТАЛОГА — ОДИН КОМПОНЕНТ НА ДВА ЭКРАНА.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. С 07.09.2026 разделы нужны в ДВУХ местах: вкладка
 * «Игры» показывает все девять, главная — три любимых (решение Дениса). Второй
 * экземпляр этой разметки был бы ровно той копией, которая расходится молча:
 * поправят порядок «сначала развилки, потом одиночные» в одном месте, а в другом
 * он останется прежним, и человек увидит два разных каталога в одном приложении.
 *
 * ⚠️ ДАННЫЕ СЧИТАЮТСЯ ЗДЕСЬ, А НЕ ПРИХОДЯТ ПРОПСАМИ. Вызывающему остаётся
 * сказать, КАКИЕ разделы показать; фильтр по профилю, состав развилок и звёзды
 * уровней — внутреннее дело каталога, и разносить их по двум экранам значит
 * заводить два ответа на один вопрос.
 */

const MAX_CONTAINER_WIDTH = 1100;
const CONTAINER_PADDING = 16;
const CARD_MARGIN = 10;

export interface Props {
  /** Какие разделы показать и в каком порядке. */
  categories: readonly GameCategory[];
  /**
   * Сколько СТРОК сетки показывать в разделе. Не задано — все.
   *
   * 🔴 ПОЧЕМУ СТРОКИ, А НЕ КАРТОЧКИ. Замеры 07.09.2026 на полном профиле, окно
   * 375×812: три раздела целиком — 3,7 экрана прокрутки (было пять до правки),
   * по четыре карточки — 3,3. Четыре карточки на телефоне это ДВЕ строки, и
   * половина выигрыша уходила туда. Строка — единица, которой мыслит сетка: на
   * телефоне это две карточки, на десктопе пять, и ряд никогда не рваный.
   */
  rows?: number;
  /**
   * Сколько партий сыграно в каждой игре — чтобы наверху раздела стояло то, во
   * что человек играет, а не то, что первым лежит в каталоге. Не задано —
   * порядок каталога.
   */
  playsByGame?: Readonly<Record<string, number>>;
}

export default function CategorySections({ categories, rows, playsByGame }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  /*
   * ⚠️ СТРОГАЯ ФОРМА, в отличие от питомца. Правило в `ProfileContext`: мягкая
   * нужна тому, что РИСУЕТ поверх экранов и обязано пережить отсутствие
   * провайдера. Каталог — содержимое экрана: без профиля он не знает, какие игры
   * человеку открыты, и показать «что-нибудь» здесь хуже, чем упасть громко.
   */
  const { profile } = useProfile();
  const { w: winWidth } = useScreenSize();

  /*
   * Ширина карточки — тот же расчёт, что стоял на главной, и переносится он
   * ЦЕЛИКОМ вместе с разбором: при жёстких 170 на ходовых 360 и 375 две колонки
   * не помещаются, остаётся одна, и высота (ширина × 1,2) даёт 364 точки при
   * содержимом на 150 — репорт тестировщика про пустоту в карточке.
   */
  const MIN_CARD_WIDTH = winWidth < 480 ? 150 : 170;
  const containerWidth = Math.min(winWidth, MAX_CONTAINER_WIDTH) - CONTAINER_PADDING * 2;
  const cols = containerWidth >= 880 ? 5 : containerWidth >= 700 ? 4 : containerWidth >= 520 ? 3 : 2;
  const cardWidth = Math.floor((containerWidth - CARD_MARGIN * cols) / cols);
  const cardHeight = Math.round(cardWidth * 1.2);
  const isWeb = Platform.OS === 'web';

  const visibleGames = useMemo(
    () => visibleInCatalog(filterAllowedGames(profile), profile?.id),
    [profile],
  );

  /**
   * В каждом разделе сначала развилки, потом одиночные (просьба Дениса 04.09.2026).
   *
   * ⚠️ ЧИСЛО ПАРТИЙ СОРТИРУЕТ ВНУТРИ ГРУПП, А НЕ ПОВЕРХ НИХ. Соблазн был
   * отсортировать раздел целиком по сыгранному — и это сломало бы правило
   * «сначала развилки»: развилка ведёт к нескольким играм, и когда она уезжает
   * вниз, человек открывает три карточки подряд, а потом узнаёт, что четвёртая
   * содержала ещё шесть. Порядок групп прежний, меняется только порядок внутри.
   */
  const grouped = useMemo(() => {
    const партий = (g: GameConfig) => playsByGame?.[sessionTypeOf(g)] ?? 0;
    const по = (список: GameConfig[]) => (playsByGame
      ? [...список].sort((a, b) => партий(b) - партий(a))
      : список);
    const map = {} as Record<GameCategory, GameConfig[]>;
    for (const g of visibleGames) (map[g.category] ??= []).push(g);
    for (const к of Object.keys(map) as GameCategory[]) {
      map[к] = [...по(map[к]!.filter((g) => g.hub)), ...по(map[к]!.filter((g) => !g.hub))];
    }
    return map;
  }, [visibleGames, playsByGame]);

  /** Число на значке развилки = длина того самого списка, что человек увидит. */
  const составРазвилки = useMemo(() => {
    const можно = new Set(filterAllowedGames(profile).map((g) => g.route));
    const из: Record<string, number> = {};
    for (const g of GAMES) if (g.hub) из[g.id] = hubBadgeCount(g.route, можно);
    return из;
  }, [profile]);

  const visibleGameIds = useMemo(() => visibleGames.map((g) => g.id), [visibleGames]);
  const levelStarsSummary = useAllLevelStars(profile?.id, visibleGameIds);

  return (
    <>
      {categories.map((cat) => {
        const все = grouped[cat];
        if (!все || !все.length) return null;
        const games = rows ? все.slice(0, rows * cols) : все;
        const спрятано = все.length - games.length;
        const meta = CATEGORY_META[cat];
        return (
          <View key={cat} style={styles.section} testID={`category-${cat}`}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: meta.color }]} />
              <Ionicons name={meta.icon as any} size={20} color={meta.color} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t(meta.titleKey)}</Text>
              {/* Число — сколько в разделе ВСЕГО, а не сколько видно: иначе на
                  главной «Логика 4» противоречило бы «Логика 11» во вкладке. */}
              <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{все.length}</Text>
            </View>
            <View
              style={isWeb ? ({
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_CARD_WIDTH}px, 1fr))`,
                gap: 10,
                width: '100%',
              } as any) : styles.gamesGrid}
            >
              {games.map((game) => (
                <GameCard
                  key={game.id}
                  id={game.id}
                  nameKey={game.nameKey}
                  descKey={game.descKey}
                  skillKey={game.skillKey}
                  gradient={game.gradient}
                  icon={game.icon}
                  width={isWeb ? '100%' as any : cardWidth}
                  height={isWeb ? undefined : cardHeight}
                  starsInfo={levelStarsSummary[game.id]}
                  hubCount={game.hub ? составРазвилки[game.id] : undefined}
                  onPress={() => router.push(game.route as any)}
                />
              ))}
            </View>
            {спрятано > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                testID={`category-more-${cat}`}
                onPress={() => router.replace('/games' as any)}
                style={styles.more}
              >
                <Text style={[styles.moreText, { color: colors.primary }]}>
                  {t('andMore').replace('{n}', String(спрятано))}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 4 },
  sectionDot: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  sectionCount: { fontSize: 13, fontWeight: '600' },
  // ⚠️ minHeight 44 — порог поля нажатия из tap-target-audit.
  more: { minHeight: 44, justifyContent: 'center', paddingLeft: 4, marginTop: 6 },
  moreText: { fontSize: 14, fontWeight: '700' },
  gamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
    alignItems: 'flex-start',
  },
});
