/* psygames-hub-screen · VER 2 · 04.09.2026 */
/**
 * ОБЩИЙ КАРКАС РАЗВИЛКИ (хаба).
 *
 * 🔴 ЗАЧЕМ. 04.09.2026 Денис заказал шесть новых развилок разом. Скопировать
 * `attention-conflict.tsx` шесть раз значило бы завести шесть экранов, которые
 * начнут расходиться на первой же правке вида — ровно та грабля, что уже стоила
 * нам термометра в судоку (PROJECT_REF §7е п.71) и вендор-копии будильника.
 *
 * Здесь лежит ВЕСЬ вид развилки: шапка, плашка-герой, список парадигм, сноска.
 * Экран развилки становится десятком строк данных: заголовок, цвет, значок и
 * список подигр.
 *
 * ⚠️ ЛЕСТНИЦЫ У РАЗВИЛКИ НЕТ И БЫТЬ НЕ ДОЛЖНО — гейт `game-standard` это
 * проверяет. Развилка никого не оценивает, она уводит.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { filterAllowedGames } from '@/src/constants/profiles';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import GamePreviewBackground from '@/src/components/GamePreviewBackground';
import { visibleHubCards } from '@/src/constants/hubContents';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

export type { HubSubGame } from '@/src/constants/hubContents';

export interface HubScreenProps {
  /**
   * 🔴 СОСТАВ РАЗВИЛКИ ЭКРАН НЕ ЗАДАЁТ, А СПРАШИВАЕТ — по своему маршруту.
   *
   * До 05.09.2026 список приходил сюда пропом `games`, то есть был набран прямо в
   * `app/games/*-hub.tsx`. Значок на карточке каталога при этом считал совсем по
   * другому признаку (`mergedInto`), и два списка разъехались: 6 развилок из 16,
   * «Зрительная память» — на значке 2, внутри 3. Отзыв тестировщицы: «написано
   * например один а по факту там два стоит и так абсолютно во всех профилях».
   *
   * Пропа `games` больше нет НАРОЧНО: пока экран мог принести свой список, ничто
   * не мешало ему снова разойтись со значком.
   */
  hubRoute: string;
  titleKey: string;
  descKey: string;
  /** Подпись над списком: «выбери парадигму». */
  pickKey: string;
  /** Сноска под списком — чем эти пробы связаны. Необязательна. */
  footnoteKey?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  gradient: [string, string];
}

export default function HubScreen({ hubRoute, titleKey, descKey, pickKey, footnoteKey, icon, gradient }: HubScreenProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { profile, ready: профильГотов } = useProfile();

  /**
   * 🔴 РАЗВИЛКА ПОКАЗЫВАЕТ ТОЛЬКО ТО, ЧТО ПОЛОЖЕНО ЭТОМУ ПРОФИЛЮ.
   *
   * Правило «развилка открыта, если открыта хоть одна игра за ней» (profiles.ts)
   * решает, показывать ли КАРТОЧКУ. Второй половины не было: сам список внутри
   * оставался общим. Замер 04.09.2026 перед включением развилок всем: «Детям»
   * открывались шахматы вслепую, самурай и Висконсинский тест, «Старшим» — трекер
   * объектов, «Шахматисту» — весь набор охвата памяти. Двенадцать профилей, от 12
   * до 28 лишних входов в каждом. Из сетки это не видно вовсе: карточек стало
   * МЕНЬШЕ, а доступного — больше.
   *
   * Пока профиль не прочитан, список пуст: полсекунды без карточек лучше, чем
   * полсекунды с чужими.
   */
  const список = React.useMemo(() => {
    if (!профильГотов) return [];
    const можно = new Set(filterAllowedGames(profile).map((g) => g.route));
    return visibleHubCards(hubRoute, можно, t);
  }, [hubRoute, profile, профильГотов, t]);
  const onGrad = onGradientText(gradient[0], gradient[1]);
  const onGradSoft = onGradientTextMuted(onGrad);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('a11yBack')}
          style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t(titleKey)}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <GradientSurface colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <GamePreviewBackground />
          <Ionicons name={icon} size={48} color={onGrad.color} />
          <Text style={[styles.heroTitle, { color: onGrad.color }]}>{t(titleKey)}</Text>
          <Text style={[styles.heroDesc, { color: onGradSoft }]}>{t(descKey)}</Text>
        </GradientSurface>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t(pickKey)}</Text>
        {список.map(({ card: g, route: маршрут, tag: тип }) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={g.route}
            style={[styles.subCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(маршрут as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: gradient[0] + '22' }]}>
              <Ionicons name={g.icon} size={28} color={gradient[0]} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardName, { color: colors.text }]}>{t(g.nameKey)}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t(g.descKey)}</Text>
              {тип ? <Text style={[styles.cardTag, { color: gradient[1] }]}>{тип}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
        {footnoteKey ? (
          <Text style={[styles.footnote, { color: colors.textSecondary }]}>{t(footnoteKey)}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  // 48 — норма цели нажатия, та же, что у остальных экранов.
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  // flexShrink — длинные названия развилок ужимаются, а не лезут под уголок
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1, minWidth: 0 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  heroCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8, overflow: 'hidden' },
  heroTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', textShadowColor: 'rgba(0,0,0,.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  heroDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginLeft: 4 },
  subCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, gap: 14, borderWidth: 1 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 12 },
  cardTag: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  footnote: { fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 15, paddingHorizontal: 8 },
});
