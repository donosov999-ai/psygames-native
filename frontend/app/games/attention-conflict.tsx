/* psygames-game-attention-conflict · VER 1 · 19.08.2026 */
/**
 * Конфликт внимания — объединяющая страница для ЧЕТЫРЁХ парадигм
 * interference resolution / cognitive control:
 *  - Струп (классический): цвет vs значение слова
 *  - Эмоциональный Stroop: цвет vs эмоциональная нагрузка слова
 *  - Фланкер (Eriksen): центральная стрелка vs боковые дистракторы
 *  - Simon (v1.9.1): цвет vs позиция стимула — пространственный конфликт
 *
 * Все четыре измеряют одно и то же: способность подавить автоматический
 * конфликтующий ответ. Биомаркер у всех — `interference_effect_ms`
 * (RT_incongruent − RT_congruent). Различаются по типу конфликта:
 * семантический / эмоциональный / визуальный / пространственный.
 *
 * Эта страница — выбор режима → редирект на оригинальную игру.
 * Биомаркеры и история сохраняются под прежними `game_type`.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isWebDemo } from '@/src/services/buildTarget';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import GamePreviewBackground from '@/src/components/GamePreviewBackground';
import { visibleHubCards } from '@/src/constants/hubContents';
import { useProfile } from '@/src/contexts/ProfileContext';
import { filterAllowedGames } from '@/src/constants/profiles';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

const GRADIENT = ['#7c3aed', '#ec4899'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 3.53 (норма AA 4.5), стало 4.52.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #32175f @0.18 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

/**
 * 🔴 СОСТАВ — В `src/constants/hubContents.ts`, А НЕ ЗДЕСЬ.
 *
 * Здесь стоял свой список из пяти карточек, а значок на карточке каталога считал
 * по `mergedInto` и показывал 10. Замер 05.09.2026: так расходились 6 развилок из
 * 16. Список переехал в общий реестр — его же читает значок.
 */
const ХАБ = '/games/attention-conflict';

function DemoAttentionRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(('/games/flanker' + qs) as any);
  }, [router]);
  return null;
}

/**
 * КУДА ВЕДЁТ КАРТОЧКА И ЧТО НА НЕЙ НАПИСАНО — С ОГЛЯДКОЙ НА ПРОФИЛЬ.
 *
 * 🔴 Замер 05.09.2026, из-за которого это здесь. У профиля «chess» из десяти
 * парадигм открыты две: `choice-rt` и `cpt`. Карточка набора «Стрелки» ведёт на
 * первый режим — `flanker`, а он этому профилю закрыт. Наивная карточка увела бы
 * шахматиста в игру, которой у него нет, и одновременно СПРЯТАЛА бы `choice-rt`,
 * который у него есть. Поэтому карточка ведёт на первый ОТКРЫТЫЙ режим, а если
 * открытых нет — её нет вовсе.
 *
 * Подпись-тип у набора — перечень открытых режимов, собранный из реестра, а не
 * отдельная строка перевода: список меняется в одном месте, и подпись едет за ним
 * сама. Иначе она устареет ровно так же, как устарело «Все три тренируют одну
 * способность» при десяти парадигмах.
 */
export default function AttentionConflictGame() {

  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { profile } = useProfile();
  const можно = React.useMemo(
    () => new Set(filterAllowedGames(profile).map((g: { route?: string }) => g.route as string)),
    [profile],
  );
  const карточки = visibleHubCards(ХАБ, можно, t);

  /**
   * Web-demo: хаб-выбор парадигмы не показываем — сразу первая подигра.
   * Query (embed=1, lang=…) обязан пережить редирект — embed-контракт с сайтом.
   *
   * ⚠️ ВЫХОД СТОИТ ПОСЛЕ ХУКОВ, А НЕ ДО НИХ. Был выше — и пять хуков подряд
   * оказывались условными: в demo-режиме React видел один порядок вызовов, в
   * обычном другой. Линт ругался на это тремя ошибками ещё до правки 05.09.2026.
   */
  if (isWebDemo()) {
    return <DemoAttentionRedirect />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('attentionConflict')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
          <GamePreviewBackground />
          <Ionicons name="layers" size={48} color={ON_GRAD.color} />
          <Text style={styles.heroTitle}>{t('attentionConflict')}</Text>
          <Text style={styles.heroDesc}>{t('attentionConflictDesc')}</Text>
        </GradientSurface>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('attentionConflictPickMode')}
        </Text>
        {карточки.map(({ card: g, route: маршрут, tag: тип }) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={g.route}
            style={[styles.subCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(маршрут as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: GRADIENT[0] + '22' }]}>
              <Ionicons name={g.icon} size={28} color={GRADIENT[0]} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardName, { color: colors.text }]}>{t(g.nameKey)}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t(g.descKey)}</Text>
              <Text style={[styles.cardTag, { color: GRADIENT[1] }]}>{тип}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {t('attentionConflictFootnote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
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
